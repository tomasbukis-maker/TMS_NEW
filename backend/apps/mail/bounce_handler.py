"""
Bounce laiškų apdorojimas - susieja bounce laiškus su EmailLog įrašais
"""
import re
import logging
from datetime import timedelta
from typing import Optional
from django.utils import timezone
from django.db.models import Q
from .models import MailMessage, EmailLog

logger = logging.getLogger(__name__)


def is_bounce_email(mail_message: MailMessage) -> bool:
    """
    Patikrina ar laiškas yra bounce (grąžintas dėl nepristatymo).
    
    Args:
        mail_message: MailMessage objektas
    
    Returns:
        True jei laiškas yra bounce, False kitu atveju
    """
    subject_lower = (mail_message.subject or '').lower()
    sender_lower = (mail_message.sender or '').lower()
    body_lower = (mail_message.body_plain or '').lower()
    
    # Bounce indikatoriai
    bounce_keywords = [
        'undeliver', 'undelivered', 'delivery failure', 'delivery failed',
        'mailer daemon', 'mailer-daemon', 'postmaster', 'mail delivery',
        'returned mail', 'returned message', 'delivery error',
        'message not delivered', 'could not be delivered', 'failed delivery',
        'bounce', 'bounced', 'nepristatyta', 'nepavyko pristatyti',
        'delivery status notification', 'dsn', 'failure notice'
    ]
    
    # Patikrinti subject
    for keyword in bounce_keywords:
        if keyword in subject_lower:
            return True
    
    # Patikrinti sender (dažnai bounce laiškai ateina iš mailer-daemon, postmaster)
    bounce_senders = [
        'mailer-daemon', 'mailer daemon', 'postmaster', 'mail delivery subsystem',
        'mail system', 'mailer', 'daemon'
    ]
    for sender_pattern in bounce_senders:
        if sender_pattern in sender_lower:
            return True
    
    # Patikrinti body (jei yra žodžiai apie nepristatymą)
    bounce_body_patterns = [
        r'could not be delivered',
        r'message.*not.*deliver',
        r'delivery.*fail',
        r'unable.*deliver',
        r'recipient.*not.*found',
        r'address.*not.*found',
        r'invalid.*address',
        r'user.*not.*found',
        r'mailbox.*full',
        r'quota.*exceeded',
        r'550.*user.*unknown',
        r'550.*mailbox.*not.*found',
    ]
    
    for pattern in bounce_body_patterns:
        if re.search(pattern, body_lower, re.IGNORECASE):
            return True
    
    return False


def extract_original_recipient(mail_message: MailMessage) -> Optional[str]:
    """
    Iš bounce laiško ištraukia originalaus gavėjo el. pašto adresą.
    
    Args:
        mail_message: MailMessage objektas (bounce laiškas)
    
    Returns:
        Originalaus gavėjo el. pašto adresas arba None
    """
    body = (mail_message.body_plain or '') + ' ' + (mail_message.body_html or '')
    body_lower = body.lower()
    
    # Ieškoti el. pašto adresų bounce laiške
    # Dažniausiai originalus gavėjas yra nurodytas bounce laiške
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, body, re.IGNORECASE)
    
    # Išfiltruoti sisteminius adresus (mailer-daemon, postmaster, ir pan.)
    system_emails = ['mailer-daemon', 'postmaster', 'mailer', 'daemon', 'noreply', 'no-reply']
    for email in emails:
        email_lower = email.lower()
        # Jei adresas nėra sisteminis ir nėra mūsų siuntėjo adresas
        if not any(sys_email in email_lower for sys_email in system_emails):
            # Patikrinti ar tai nėra siuntėjo adresas
            if mail_message.sender and email.lower() not in mail_message.sender.lower():
                return email
    
    return None


def link_bounce_to_email_log(mail_message: MailMessage) -> bool:
    """
    Susieja bounce laišką su EmailLog įrašu ir atnaujina statusą.
    
    Args:
        mail_message: MailMessage objektas (bounce laiškas)
    
    Returns:
        True jei susieta, False kitu atveju
    """
    if not is_bounce_email(mail_message):
        return False
    
    # Ištraukti originalaus gavėjo adresą
    original_recipient = extract_original_recipient(mail_message)
    
    # Bounce laiškai gaunami PO siuntimo, bet ne daugiau nei 48 valandų po siuntimo
    # Ieškome EmailLog įrašų, kurie buvo sukurti prieš bounce laišką (bet ne daugiau nei 48 val. prieš)
    time_window_start = mail_message.date - timedelta(hours=48)
    time_window_end = mail_message.date  # Bounce laiškas gaunamas PO siuntimo
    
    # Pirmiausia patikrinti, ar jau yra susietas EmailLog (status='failed' su error_message apie bounce)
    if original_recipient:
        existing_failed = EmailLog.objects.filter(
            recipient_email__iexact=original_recipient,
            created_at__gte=time_window_start,
            created_at__lt=time_window_end,
            status='failed',
            error_message__icontains='Bounce laiškas'
        ).first()
        if existing_failed:
            # Jau susietas, pažymėti bounce laišką kaip apdorotą
            if not mail_message.metadata:
                mail_message.metadata = {}
            mail_message.metadata['bounce_processed'] = True
            mail_message.metadata['bounce_processed_at'] = timezone.now().isoformat()
            mail_message.save(update_fields=['metadata'])
            return True
        
        # Rasti EmailLog pagal originalaus gavėjo adresą ir laiko intervalą
        email_logs = EmailLog.objects.filter(
            recipient_email__iexact=original_recipient,
            created_at__gte=time_window_start,
            created_at__lt=time_window_end,
            status='sent'
        ).order_by('-created_at')
    else:
        # Jei nepavyko ištraukti originalaus gavėjo, bandyti rasti pagal laiko intervalą
        email_logs = EmailLog.objects.filter(
            created_at__gte=time_window_start,
            created_at__lt=time_window_end,
            status='sent'
        ).order_by('-created_at')
        
        # Jei rasta daugiau nei vienas, susieti su artimiausiu laiko atžvilgiu
        if email_logs.count() > 1:
            # Rasti artimiausią laiko atžvilgiu (mažiausias skirtumas tarp created_at ir bounce date)
            best_match = None
            min_diff = None
            for log in email_logs:
                diff = abs((mail_message.date - log.created_at).total_seconds())
                if min_diff is None or diff < min_diff:
                    min_diff = diff
                    best_match = log
            if best_match and min_diff < 3600:  # Ne daugiau nei 1 valanda skirtumas
                email_logs = EmailLog.objects.filter(id=best_match.id)
            else:
                email_logs = EmailLog.objects.none()
    
    if email_logs.exists():
        # Susieti su paskutiniu (artimiausiu laiko atžvilgiu)
        email_log = email_logs.first()
        # Atnaujinti statusą
        email_log.status = 'failed'
        email_log.error_message = f'Bounce laiškas gautas: {mail_message.subject or "(be temos)"}'
        email_log.save()
        
        # Pažymėti bounce laišką kaip apdorotą
        if not mail_message.metadata:
            mail_message.metadata = {}
        mail_message.metadata['bounce_processed'] = True
        mail_message.metadata['bounce_processed_at'] = timezone.now().isoformat()
        mail_message.save(update_fields=['metadata'])
        return True
    
    return False


def process_bounce_emails():
    """
    Apdoroja visus naujus bounce laiškus ir susieja juos su EmailLog.
    Turėtų būti iškviečiama periodiškai (pvz., per cron job arba po IMAP sinchronizacijos).
    """
    # Rasti visus naujus laiškus, kurie dar nebuvo apdoroti
    # (galime pridėti lauką 'bounce_processed' arba naudoti metadata)
    recent_messages = MailMessage.objects.filter(
        date__gte=timezone.now() - timedelta(days=7)  # Tik paskutinės 7 dienų
    ).order_by('-date')
    
    processed_count = 0
    for message in recent_messages:
        # Patikrinti ar jau apdorotas (metadata)
        if message.metadata.get('bounce_processed'):
            continue
        
        if link_bounce_to_email_log(message):
            # Pažymėti kaip apdorotą
            if not message.metadata:
                message.metadata = {}
            message.metadata['bounce_processed'] = True
            message.metadata['bounce_processed_at'] = timezone.now().isoformat()
            message.save(update_fields=['metadata'])
            processed_count += 1
    
    return {
        'processed': processed_count,
        'total_checked': recent_messages.count()
    }

