import email
import logging
import os
import shutil
import threading
import time
from datetime import datetime, timezone
from email.header import decode_header, make_header
from typing import List, Optional

import imaplib
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import close_old_connections
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone as dj_timezone

try:
    import fcntl  # type: ignore
except ImportError:  # pragma: no cover - Windows aplinkoje fcntl nėra
    fcntl = None

from apps.settings.models import NotificationSettings
from .models import MailAttachment, MailMessage, MailMessageTag, MailSender, MailSyncState, MailTag
from apps.orders.models import Order, OrderCarrier
from apps.partners.models import Contact
from .bounce_handler import process_bounce_emails
from .mail_matching_helper_NEW import update_message_matches
from .utils import extract_email_from_sender, normalize_email

logger = logging.getLogger(__name__)

_scheduler_thread: Optional[threading.Thread] = None
_scheduler_lock = threading.Lock()
# Naudoti /tmp su user-specific katalogu arba /var/www/tms/logs, kad išvengti permission problemų
_lock_dir = os.environ.get('MAIL_SYNC_LOCK_DIR', '/var/www/tms/logs')
try:
    os.makedirs(_lock_dir, exist_ok=True)
except (PermissionError, OSError):
    # Fallback į /tmp su user-specific katalogu
    import getpass
    _lock_dir = os.path.join('/tmp', f'logitrack_{getpass.getuser()}')
    os.makedirs(_lock_dir, exist_ok=True)
_LOCK_FILE_PATH = os.environ.get('MAIL_SYNC_LOCK_FILE', os.path.join(_lock_dir, 'mail_sync.lock'))


class ImapSyncError(Exception):
    """Raised when IMAP synchronisation fails."""


class ImapClient:
    """Minimal IMAP klientas, prisijungiantis pagal NotificationSettings."""

    def __init__(self, config: NotificationSettings):
        self.config = config
        self.client: Optional[imaplib.IMAP4] = None

    def connect(self):
        host = self.config.imap_host
        port = self.config.imap_port or (993 if self.config.imap_use_ssl else 143)
        username = self.config.imap_username
        password = self.config.imap_password

        if not all([host, port, username, password]):
            raise ImapSyncError('Nepakanka IMAP nustatymų (serveris, portas, vartotojas, slaptažodis).')

        try:
            if self.config.imap_use_ssl:
                self.client = imaplib.IMAP4_SSL(host, port)
            else:
                self.client = imaplib.IMAP4(host, port)
                if self.config.imap_use_starttls:
                    self.client.starttls()

            self.client.login(username, password)
        except imaplib.IMAP4.error as exc:
            raise ImapSyncError(f'IMAP prisijungimo klaida: {exc}') from exc
        except OSError as exc:
            raise ImapSyncError(f'IMAP ryšio klaida: {exc}') from exc

    def select_folder(self, folder: str):
        if not self.client:
            raise ImapSyncError('IMAP klientas neprisijungęs.')
        status, _ = self.client.select(folder, readonly=False)
        if status != 'OK':
            raise ImapSyncError(f'Aplankas „{folder}“ neprieinamas.')

    def fetch_uids_since(self, last_uid: Optional[int], limit: int = 50) -> List[int]:
        if not self.client:
            raise ImapSyncError('IMAP klientas neprisijungęs.')

        if last_uid:
            search_query = f'UID {last_uid + 1}:*'
        else:
            search_query = 'ALL'

        status, data = self.client.uid('search', None, search_query)
        if status != 'OK':
            raise ImapSyncError('Nepavyko gauti UID sąrašo.')

        raw_uids = data[0].split()
        uids = sorted({int(uid) for uid in raw_uids})
        if last_uid:
            uids = [uid for uid in uids if uid > last_uid]

        if limit:
            uids = uids[:limit]
        return uids

    def fetch_message(self, uid: int):
        if not self.client:
            raise ImapSyncError('IMAP klientas neprisijungęs.')

        status, data = self.client.uid('fetch', str(uid), '(RFC822 FLAGS)')
        if status != 'OK' or not data or data[0] is None:
            raise ImapSyncError(f'Nepavyko gauti laiško (UID {uid}).')
        return data[0]

    def logout(self):
        if self.client:
            try:
                self.client.logout()
            except Exception:
                logger.debug('Nepavyko švariai atsijungti nuo IMAP', exc_info=True)
            finally:
                self.client = None


def decode_header_value(value: Optional[str]) -> str:
    if not value:
        return ''
    try:
        header = make_header(decode_header(value))
        return str(header)
    except Exception:
        return value


def _extract_addresses(header_value: str) -> str:
    if not header_value:
        return ''
    try:
        addresses = email.utils.getaddresses([header_value])
        formatted = [email.utils.formataddr((decode_header_value(name), addr)) for name, addr in addresses]
        return ', '.join(formatted)
    except Exception:
        return header_value


def _extract_body(message: email.message.Message):
    plain_parts = []
    html_parts = []

    if message.is_multipart():
        for part in message.walk():
            content_type = part.get_content_type()
            content_disposition = (part.get('Content-Disposition') or '').lower()
            if 'attachment' in content_disposition:
                continue
            if content_type == 'text/plain':
                payload = part.get_payload(decode=True) or b''
                plain_parts.append(payload.decode(part.get_content_charset() or 'utf-8', errors='replace'))
            elif content_type == 'text/html':
                payload = part.get_payload(decode=True) or b''
                html_parts.append(payload.decode(part.get_content_charset() or 'utf-8', errors='replace'))
    else:
        content_type = message.get_content_type()
        payload = message.get_payload(decode=True) or b''
        if content_type == 'text/plain':
            plain_parts.append(payload.decode(message.get_content_charset() or 'utf-8', errors='replace'))
        elif content_type == 'text/html':
            html_parts.append(payload.decode(message.get_content_charset() or 'utf-8', errors='replace'))

    plain_text = '\n'.join(plain_parts).strip()
    html_text = '\n'.join(html_parts).strip()

    # OPTIMALIZACIJA: Riboti HTML turinio dydį iki 10KB
    # Jei HTML didesnis nei 10KB, sutrumpinti jį ir palikti tik pradžią
    MAX_HTML_LENGTH = 10000  # 10KB limitas
    if len(html_text) > MAX_HTML_LENGTH:
        original_length = len(html_text)
        html_text = html_text[:MAX_HTML_LENGTH] + f'\n\n[... HTML TURINYS SUTRUMPINTAS - ORIGINALAS BUVO {original_length} SIMBOLIŲ ...]'
        logger.info(f'HTML turinys sutrumpintas iš {original_length} į {len(html_text)} simbolių')

    return plain_text, html_text


def _add_sender_email_to_client(mail_message: MailMessage, order: Order):
    """Prideda email adresą iš sender lauko prie kliento kontaktų"""
    if not order or not order.client:
        return
    
    sender_email = extract_email_from_sender(mail_message.sender or '')
    if not sender_email:
        return
    
    # Patikrinti, ar kontaktas jau egzistuoja
    if Contact.objects.filter(partner=order.client, email__iexact=sender_email).exists():
        return
    
    # Pridėti naują kontaktą
    try:
        Contact.objects.create(
            partner=order.client,
            email=sender_email,
            first_name='',
            last_name='',
            notes=f'Automatiškai pridėtas iš el. laiško (ID: {mail_message.id})'
        )
        logger.info(f'Pridėtas kontaktas {sender_email} prie kliento {order.client.name} iš el. laiško {mail_message.id}')
    except Exception as e:
        logger.warning(f'Nepavyko pridėti kontakto iš el. laiško: {e}')


def _classify_as_promotional(mail_message: MailMessage) -> bool:
    """
    Klasifikuoja laišką kaip reklaminį pagal kelis kriterijus:
    1. Jei siuntėjas yra patikimas (trusted), laiškas nėra reklaminis
    2. Siuntėjo email domenas (noreply, marketing, newsletter, ir kt.)
    3. Subject eilutė su reklaminiais žodžiais
    4. HTML turinyje yra unsubscribe/opt-out nuorodos
    """
    import re
    from apps.partners.models import Contact

    # 0. Patikrinti ar siuntėjas yra trusted - jei taip, tai nėra reklaminis
    try:
        contact = Contact.objects.filter(email__iexact=mail_message.sender_email).first()
        if contact and contact.is_trusted and not contact.is_advertising:
            return False
    except Exception:
        # Jei nepavyksta patikrinti, tęsti klasifikaciją
        pass

    # 1. Patikrinti siuntėjo email domeną
    sender_lower = (mail_message.sender or '').lower()
    promotional_domains = [
        'noreply', 'no-reply', 'donotreply', 'do-not-reply',
        'marketing', 'newsletter', 'promo', 'offers', 'deals',
        'sales', 'advertising', 'ads', 'campaign', 'mailing'
    ]
    
    for domain in promotional_domains:
        if domain in sender_lower:
            return True
    
    # 2. Patikrinti subject eilutę
    subject_lower = (mail_message.subject or '').lower()
    promotional_keywords = [
        'akcija', 'nuolaida', 'pasiūlymas', 'specialus pasiūlymas',
        'unsubscribe', 'atšaukti prenumeratą', 'atšaukti prenumeratą',
        'newsletter', 'reklama', 'promo', 'special offer',
        'limited time', 'act now', 'buy now', 'sale', 'discount'
    ]
    
    for keyword in promotional_keywords:
        if keyword in subject_lower:
            return True
    
    # 3. Patikrinti HTML ir plain text turinį dėl unsubscribe nuorodų
    unsubscribe_patterns = [
        r'unsubscribe',
        r'atšaukti\s+prenumeratą',
        r'opt\s*out',
        r'remove\s+me',
        r'cancel\s+subscription',
        r'manage\s+preferences',
        r'preferences\s+center'
    ]
    
    if mail_message.body_html:
        html_lower = mail_message.body_html.lower()
        for pattern in unsubscribe_patterns:
            if re.search(pattern, html_lower, re.IGNORECASE):
                return True
    
    # 4. Patikrinti plain text turinį
    if mail_message.body_plain:
        body_lower = mail_message.body_plain.lower()
        for pattern in unsubscribe_patterns:
            if re.search(pattern, body_lower, re.IGNORECASE):
                return True
    
    return False


def _auto_match_and_add_contacts(mail_message: MailMessage):
    """Prideda siuntėjo email prie kliento kontaktų naudojant jau paruoštas atitiktis."""
    order = mail_message.matched_orders.select_related('client').first()
    if order:
        _add_sender_email_to_client(mail_message, order)
        return

    carrier = (
        mail_message.matched_expeditions.select_related('order__client').first()
    )
    if carrier and carrier.order:
        _add_sender_email_to_client(mail_message, carrier.order)


def _start_ocr_for_attachment(attachment: MailAttachment):
    """Paleidžia OCR procesą naujam PDF attachment'ui asinchroniškai."""
    if attachment.ocr_processed:
        return  # Jau apdorota

    def ocr_worker():
        """OCR darbo funkcija kuri veikia atskirame thread'e."""
        try:
            from apps.invoices.ocr_utils import process_pdf_attachment

            logger.info(f'Pradedamas OCR apdorojimas: {attachment.filename}')
            ocr_result = process_pdf_attachment(attachment)

            # Išsaugoti rezultatus
            attachment.ocr_text = ocr_result.get('text', '')
            attachment.ocr_processed = True
            attachment.ocr_processed_at = dj_timezone.now()
            attachment.save()

            logger.info(f'OCR baigtas: {attachment.filename} ({len(attachment.ocr_text or "")} simbolių)')

            # Automatiškai patikrinti ar galima susieti laišką
            _check_auto_match(attachment.mail_message)

        except Exception as e:
            logger.error(f'OCR klaida {attachment.filename}: {e}')
            attachment.ocr_error = str(e)
            attachment.save()

    # Paleisti OCR atskirame thread'e
    thread = threading.Thread(target=ocr_worker, daemon=True)
    thread.start()


def _check_auto_match(mail_message: MailMessage):
    """Po OCR – vėl paleisti sutapimų logiką su nauju OCR tekstu ir įrašyti į DB (matches_computed_at)."""
    if mail_message.manually_assigned:
        logger.info(f'Laiškas {mail_message.id} buvo priskirtas rankiniu būdu - praleidžiama automatinė priskyrimas')
        return

    has_new_ocr = any(
        getattr(a, 'ocr_text', None) and (a.ocr_text or '').strip()
        for a in mail_message.attachments.filter(ocr_processed=True)
    )
    if not has_new_ocr:
        return

    try:
        update_message_matches(mail_message)
        logger.info(f'Po OCR atnaujinti laiško {mail_message.id} sutapimai (matches_computed_at)')
    except Exception as e:
        logger.warning(f'Nepavyko atnaujinti laiško {mail_message.id} sutapimų po OCR: {e}')


def _sync_missing_attachments_from_server():
    """
    Sinchronizuoja trūkstamus priedus iš serverio į lokalų.
    Veikia tik jei nustatytas SERVER_ATTACHMENTS_PATH arba SERVER_SSH_PATH.
    """
    server_path = getattr(settings, 'SERVER_ATTACHMENTS_PATH', None)
    server_ssh = getattr(settings, 'SERVER_SSH_PATH', None)
    
    if not server_path and not server_ssh:
        return  # Jei nėra nustatytas serverio kelias, nieko nedarome
    
    # Rasti priedus, kurių failų nėra lokaliai
    attachments = MailAttachment.objects.exclude(file='')
    missing_attachments = []
    
    for attachment in attachments:
        try:
            if attachment.file and attachment.file.name:
                local_path = attachment.file.path
                if not os.path.exists(local_path):
                    missing_attachments.append(attachment)
        except (ValueError, AttributeError):
            # Jei failo nėra arba klaida, pridėti į trūkstamus
            missing_attachments.append(attachment)
    
    if not missing_attachments:
        return  # Visi priedai yra
    
    logger.info(f'Rasta {len(missing_attachments)} trūkstamų priedų, bandoma atsisiųsti iš serverio...')
    
    local_media_root = settings.MEDIA_ROOT
    local_attachments_dir = os.path.join(local_media_root, 'mail_attachments')
    os.makedirs(local_attachments_dir, exist_ok=True)
    
    copied = 0
    errors = 0
    
    for attachment in missing_attachments:
        try:
            # Rasti serverio failo kelią
            if server_ssh:
                # SSH kelias: user@host:/path/to/media
                server_file_path = f"{server_ssh}/mail_attachments/{attachment.mail_message_id}/{attachment.filename}"
                # Naudoti scp per SSH
                local_file_path = os.path.join(
                    local_attachments_dir,
                    str(attachment.mail_message_id),
                    attachment.filename
                )
                os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
                
                # Bandyti naudoti scp (jei prieinama)
                import subprocess
                try:
                    result = subprocess.run(
                        ['scp', '-o', 'StrictHostKeyChecking=no', server_file_path, local_file_path],
                        capture_output=True,
                        timeout=30
                    )
                    if result.returncode == 0 and os.path.exists(local_file_path):
                        # Atnaujinti FileField
                        relative_path = os.path.join('mail_attachments', str(attachment.mail_message_id), attachment.filename)
                        attachment.file.name = relative_path
                        attachment.save(update_fields=['file'])
                        copied += 1
                        continue
                    else:
                        logger.debug(f'scp nepavyko: {result.stderr.decode() if result.stderr else "Unknown error"}')
                except (subprocess.TimeoutExpired, FileNotFoundError) as e:
                    logger.debug(f'scp neprieinamas arba timeout: {e}')
                    pass  # scp neprieinamas, bandyti kitą būdą
            
            if server_path:
                # Tiesioginis kelias (jei mount'intas arba prieinamas)
                server_file_path = os.path.join(
                    server_path,
                    str(attachment.mail_message_id),
                    attachment.filename
                )
                
                if os.path.exists(server_file_path):
                    local_message_dir = os.path.join(local_attachments_dir, str(attachment.mail_message_id))
                    os.makedirs(local_message_dir, exist_ok=True)
                    local_file_path = os.path.join(local_message_dir, attachment.filename)
                    
                    shutil.copy2(server_file_path, local_file_path)
                    
                    # Atnaujinti FileField
                    relative_path = os.path.join('mail_attachments', str(attachment.mail_message_id), attachment.filename)
                    attachment.file.name = relative_path
                    attachment.save(update_fields=['file'])
                    copied += 1
                else:
                    errors += 1
                    logger.debug(f'Priedo failas nerastas serveryje: {server_file_path}')
            else:
                errors += 1
                
        except Exception as e:
            errors += 1
            logger.warning(f'Nepavyko atsisiųsti priedo {attachment.filename} (ID: {attachment.id}): {e}')
    
    if copied > 0:
        logger.info(f'Atsisiųsta {copied} trūkstamų priedų iš serverio')
    if errors > 0 and len(missing_attachments) > 10:  # Rodyti tik jei daug trūkstamų
        logger.warning(f'Nepavyko atsisiųsti {errors} priedų (iš {len(missing_attachments)} trūkstamų)')


def _copy_attachment_to_server(attachment: MailAttachment):
    """
    Kopijuoja priedą į serverio katalogą (jei ATTACHMENTS_SERVER_PATH nustatytas).
    Naudoja tą pačią struktūrą kaip sync_attachments_to_server komanda.
    """
    server_path = getattr(settings, 'ATTACHMENTS_SERVER_PATH', None)
    if not server_path:
        return  # Jei serverio kelias nenustatytas, nieko nedarome
    
    try:
        # Sukurti pilną kelią serveryje (ta pati struktūra kaip sync_attachments_to_server)
        server_file_path = os.path.join(
            server_path,
            attachment.mail_message.date.strftime('%Y-%m-%d'),
            f"msg_{attachment.mail_message.id}",
            attachment.filename
        )
        
        # Patikrinti ar failas jau egzistuoja
        if os.path.exists(server_file_path):
            logger.debug(f'Priedas jau egzistuoja serveryje: {attachment.filename}')
            return
        
        # Sukurti katalogą
        os.makedirs(os.path.dirname(server_file_path), exist_ok=True)
        
        # Nukopijuoti failą
        if attachment.file and attachment.file.name:
            with attachment.file.open('rb') as src_file:
                with open(server_file_path, 'wb') as dst_file:
                    shutil.copyfileobj(src_file, dst_file)
            logger.debug(f'Priedas nukopijuotas į serverį: {attachment.filename} -> {server_file_path}')
    except Exception as e:
        # Nekelti klaidos, tik loginti - sinchronizacija turi tęstis net jei kopijavimas nepavyko
        logger.warning(f'Nepavyko nukopijuoti priedo į serverį {attachment.filename}: {e}', exc_info=True)


def _save_attachments(message: email.message.Message, mail_message: MailMessage):
    """
    Išsaugo laiško priedus.

    Svarbu:
    - Kai kurios pašto programos (pvz. Apple Mail) naudoja
      "Content-Disposition: inline" su filename vietoje "attachment".
    - Todėl laikome priedu bet kurią dalį, kuri turi filename,
      net jei Content-Disposition nėra "attachment".
    - Jei ATTACHMENTS_SERVER_PATH nustatytas settings.py, priedai automatiškai
      kopijuojami ir į serverio katalogą.
    """
    saved_count = 0
    for part in message.walk():
        content_disposition = (part.get('Content-Disposition') or '').lower()
        filename = decode_header_value(part.get_filename())

        # Praleisti dalis be failo vardo ir be "attachment" žymos
        if 'attachment' not in content_disposition and not filename:
            continue

        if not filename:
            filename = 'attachment'

        payload = part.get_payload(decode=True)
        if payload is None:
            logger.debug(f'Priedas {filename} neturi payload (message_id={mail_message.id})')
            continue

        content_type = part.get_content_type() or 'application/octet-stream'
        size = len(payload)

        try:
            attachment = MailAttachment(
                mail_message=mail_message,
                filename=filename,
                content_type=content_type,
                size=size,
            )
            attachment.file.save(filename, ContentFile(payload), save=True)
            saved_count += 1
            logger.debug(f'Išsaugotas priedas: {filename} ({size} bytes) - message_id={mail_message.id}')

            # 🔄 Automatiškai kopijuoti į serverio katalogą (jei nustatytas)
            _copy_attachment_to_server(attachment)

            # 🔄 Automatiškai pradėti OCR procesą naujiems PDF failams
            if filename and filename.lower().endswith('.pdf'):
                _start_ocr_for_attachment(attachment)
        except Exception as e:
            logger.error(f'Klaida išsaugant priedą {filename} (message_id={mail_message.id}): {e}', exc_info=True)
    
    if saved_count > 0:
        logger.info(f'Išsaugota {saved_count} priedų laiško {mail_message.id} (subject: {mail_message.subject[:50]})')


def sync_imap(limit: int = 50) -> dict:
    """Sinchronizuoja naujus laiškus iš IMAP pagal NotificationSettings."""
    config = NotificationSettings.load()
    if not config.imap_enabled:
        return {'status': 'disabled', 'message': 'IMAP sinchronizacija išjungta'}

    client = ImapClient(config)
    folder = config.imap_folder or 'INBOX'
    sync_state, _ = MailSyncState.objects.get_or_create(folder=folder)

    try:
        client.connect()
        client.select_folder(folder)
        last_uid = int(sync_state.last_uid) if sync_state.last_uid and sync_state.last_uid.isdigit() else None
        new_uids = client.fetch_uids_since(last_uid, limit=limit)

        synced_messages = []
        for uid in new_uids:
            raw_response = client.fetch_message(uid)
            raw_email = raw_response[1]
            email_message = email.message_from_bytes(raw_email)

            subject = decode_header_value(email_message.get('Subject'))
            sender = _extract_addresses(email_message.get('From') or '')
            recipients = _extract_addresses(email_message.get('To') or '')
            cc = _extract_addresses(email_message.get('Cc') or '')
            bcc = _extract_addresses(email_message.get('Bcc') or '')
            message_id = email_message.get('Message-ID', '')

            date_header = email_message.get('Date')
            parsed_date = None
            if date_header:
                try:
                    parsed_date = email.utils.parsedate_to_datetime(date_header)
                    if parsed_date and parsed_date.tzinfo is None:
                        parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                except (TypeError, ValueError):
                    parsed_date = None
            if not parsed_date:
                parsed_date = dj_timezone.now()

            body_plain, body_html = _extract_body(email_message)

            snippet = body_plain[:280] if body_plain else body_html[:280]
            flags = ''
            if len(raw_response) > 0 and isinstance(raw_response[0], bytes):
                meta = raw_response[0].decode(errors='ignore')
                if 'FLAGS' in meta:
                    flags = meta.split('FLAGS', 1)[-1].strip().strip(' ()')

            senders_email = normalize_email(extract_email_from_sender(sender))
            sender_record = None
            if senders_email:
                sender_record = Contact.objects.filter(email=senders_email).first()

            if sender_record and sender_record.is_advertising:
                logger.info('Praleidžiame reklaminį siuntėją %s', senders_email)
                continue

            mail_message, _ = MailMessage.objects.update_or_create(
                uid=str(uid),
                defaults={
                    'message_id': message_id or '',
                    'subject': subject,
                    'sender': sender,
                    'recipients': recipients,
                    'cc': cc,
                    'bcc': bcc,
                    'date': parsed_date,
                    'folder': folder,
                    'snippet': snippet,
                    'body_plain': body_plain,
                    'body_html': body_html,
                    'flags': flags,
                    'sender_email': senders_email,
                },
            )

            # Remove old attachments if syncing again
            if mail_message.attachments.exists():
                for attachment in mail_message.attachments.all():
                    try:
                        if attachment.file:
                            storage = attachment.file.storage
                            if storage.exists(attachment.file.name):
                                storage.delete(attachment.file.name)
                    except Exception:
                        logger.warning('Nepavyko ištrinti seno priedo failo', exc_info=True)
                mail_message.attachments.all().delete()

            _save_attachments(email_message, mail_message)

            try:
                update_message_matches(mail_message)
            except Exception as e:
                logger.warning(f'Nepavyko atnaujinti laiško {mail_message.id} atitikčių: {e}')

            # Automatiškai pridedame kontaktą, jei galime
            try:
                _auto_match_and_add_contacts(mail_message)
            except Exception as e:
                logger.warning(f'Nepavyko automatiškai suderinti laiško {mail_message.id}: {e}')
            
            # Klasifikuoti kaip reklaminį
            try:
                if sender_record and sender_record.is_trusted:
                    mail_message.is_promotional = False
                else:
                    mail_message.is_promotional = _classify_as_promotional(mail_message)
                mail_message.save(update_fields=['is_promotional'])
            except Exception as e:
                logger.warning(f'Nepavyko klasifikuoti laiško {mail_message.id}: {e}')
            
            synced_messages.append(mail_message.id)
            sync_state.last_uid = str(uid)

        sync_state.last_synced_at = dj_timezone.now()
        sync_state.status = 'ok'
        sync_state.message = f'Sinchronizuota {len(synced_messages)} laiškų.'
        sync_state.metadata = {
            'synced_ids': synced_messages,
            'limit': limit,
        }
        sync_state.save()

        # Apdoroti bounce laiškus po sinchronizacijos
        try:
            bounce_result = process_bounce_emails()
            logger.info(f'Apdoroti bounce laiškai: {bounce_result["processed"]} iš {bounce_result["total_checked"]}')
        except Exception as e:
            logger.warning(f'Nepavyko apdoroti bounce laiškų: {e}')

        # Automatiškai atsisiųsti trūkstamus priedus iš serverio
        try:
            _sync_missing_attachments_from_server()
        except Exception as e:
            logger.warning(f'Nepavyko sinchronizuoti trūkstamų priedų iš serverio: {e}')

        return {
            'status': 'ok',
            'count': len(synced_messages),
            'synced_ids': synced_messages,
            'folder': folder,
        }
    except ImapSyncError as exc:
        sync_state.status = 'error'
        sync_state.message = str(exc)
        sync_state.save(update_fields=['status', 'message', 'updated_at'])
        logger.error('IMAP sinchronizacijos klaida: %s', exc)
        return {'status': 'error', 'message': str(exc)}
    finally:
        client.logout()


def _acquire_scheduler_lock():
    if fcntl is None:
        # Jei fcntl nėra (pvz., Windows), negalime garantuoti vienintelio vykdymo.
        logger.warning(
            'fcntl biblioteka neprieinama – pašto sinchronizacijos planuoklis veiks be procesų užrakto. '
            'Užtikrinkite, kad dirba tik vienas workeris arba naudokite systemd/celery planuoklį.'
        )
        return None
    lock_file = open(_LOCK_FILE_PATH, 'w')
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock_file
    except OSError:
        lock_file.close()
        return None


def _mail_sync_scheduler_loop():
    lock_file = _acquire_scheduler_lock()
    if lock_file is None and fcntl is not None:
        logger.info('Pašto sinchronizacijos planuoklis jau veikia kitame procese – šis procesas praleidžiamas.')
        return

    logger.info('Startuoja foninis pašto sinchronizacijos planuoklis.')

    try:
        while True:
            interval_minutes = 5
            try:
                close_old_connections()
                try:
                    config = NotificationSettings.load()
                except (OperationalError, ProgrammingError):
                    logger.debug('NotificationSettings lentelė dar nepasiekiama – laukiam 60 s.')
                    close_old_connections()
                    time.sleep(60)
                    continue

                interval_minutes = max(1, config.imap_sync_interval_minutes or 5)

                if config.imap_enabled:
                    close_old_connections()
                    result = sync_imap()
                    status = result.get('status')
                    if status == 'error':
                        logger.warning('Foninė IMAP sinchronizacija baigėsi klaida: %s', result.get('message'))
                    elif status == 'ok':
                        logger.debug(
                            'Foninė IMAP sinchronizacija: %s laiškų aplanke %s.',
                            result.get('count', 0),
                            result.get('folder', 'INBOX')
                        )
                else:
                    logger.debug('IMAP sinchronizacija išjungta – ciklas praleidžiamas.')
            except Exception:
                logger.exception('Netikėta klaida foninėje pašto sinchronizacijoje.')
            finally:
                close_old_connections()

            # Naudojame gautą intervalą (min) net jei sinchronizacija išjungta, kad pokyčiai būtų pritaikomi.
            sleep_seconds = max(30, interval_minutes * 60)
            try:
                time.sleep(sleep_seconds)
            except KeyboardInterrupt:
                logger.info('Foninis pašto sinchronizacijos planuoklis gavo nutraukimo signalą.')
                break
    finally:
        if lock_file is not None and fcntl is not None:
            try:
                fcntl.flock(lock_file, fcntl.LOCK_UN)
            except OSError:
                pass
            lock_file.close()
        logger.info('Foninis pašto sinchronizacijos planuoklis sustabdytas.')


def start_mail_sync_scheduler():
    """Paleidžia foninį IMAP sinchronizacijos planuoklį vieną kartą per procesą."""
    global _scheduler_thread

    if os.environ.get('DISABLE_MAIL_SYNC_SCHEDULER') == '1':
        logger.info('Pašto sinchronizacijos planuoklis išjungtas per DISABLE_MAIL_SYNC_SCHEDULER.')
        return

    # Django autoreload paleidžia du procesus – norime, kad planuoklis startuotų tik pagrindiniame.
    if os.environ.get('RUN_MAIN') == 'false':
        logger.debug('Praleidžiame pašto sinchronizacijos planuoklį autoreload antrinėje sesijoje.')
        return

    with _scheduler_lock:
        if _scheduler_thread and _scheduler_thread.is_alive():
            return

        thread = threading.Thread(
            target=_mail_sync_scheduler_loop,
            name='mail-sync-scheduler',
            daemon=True,
        )
        thread.start()
        _scheduler_thread = thread

