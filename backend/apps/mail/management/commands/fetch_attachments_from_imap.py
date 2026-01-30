import os
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.mail.models import MailAttachment, MailMessage
from apps.mail.services import ImapClient, _save_attachments, decode_header_value
from apps.settings.models import NotificationSettings
import email
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Parsisiunčia trūkstamus priedus tiesiogiai iš IMAP serverio'

    def add_arguments(self, parser):
        parser.add_argument(
            '--message-id',
            type=int,
            help='Parsisiųsti priedus konkretaus laiško (MailMessage ID)',
        )
        parser.add_argument(
            '--all-missing',
            action='store_true',
            help='Parsisiųsti priedus visų laiškų, kurių priedų failų nėra lokaliai',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodyti ką būtų padaryta',
        )

    def handle(self, *args, **options):
        message_id = options.get('message_id')
        all_missing = options.get('all_missing', False)
        dry_run = options.get('dry_run', False)

        if not message_id and not all_missing:
            self.stdout.write(self.style.ERROR(
                'Nurodykite --message-id ARBA --all-missing'
            ))
            return

        config = NotificationSettings.load()
        if not config.imap_enabled:
            self.stdout.write(self.style.ERROR('IMAP sinchronizacija išjungta'))
            return

        # Rasti laiškus, kurių priedų trūksta
        if message_id:
            messages = MailMessage.objects.filter(id=message_id)
        else:
            # Rasti laiškus su priedais, bet be failų
            messages = MailMessage.objects.filter(attachments__isnull=False).distinct()
            missing_messages = []
            for msg in messages:
                has_missing = False
                for att in msg.attachments.all():
                    try:
                        if att.file and att.file.name:
                            if not os.path.exists(att.file.path):
                                has_missing = True
                                break
                    except (ValueError, AttributeError):
                        has_missing = True
                        break
                if has_missing:
                    missing_messages.append(msg.id)
            messages = MailMessage.objects.filter(id__in=missing_messages)

        if not messages.exists():
            self.stdout.write(self.style.SUCCESS('Nėra laiškų su trūkstamais priedais'))
            return

        self.stdout.write(f'Rasta {messages.count()} laiškų su trūkstamais priedais')

        if dry_run:
            for msg in messages:
                missing_count = sum(1 for att in msg.attachments.all() 
                                  if not (att.file and att.file.name and os.path.exists(att.file.path)))
                self.stdout.write(f'  - Laiškas ID {msg.id}: {msg.subject[:50]} - trūksta {missing_count} priedų')
            return

        # Prisijungti prie IMAP
        client = ImapClient(config)
        folder = config.imap_folder or 'INBOX'

        try:
            client.connect()
            client.select_folder(folder)

            fetched = 0
            errors = 0

            for msg in messages:
                try:
                    self.stdout.write(f'\nLaiškas ID {msg.id}: {msg.subject[:50]}...')
                    
                    # Rasti laišką IMAP serveryje pagal UID
                    if not msg.uid:
                        self.stdout.write(self.style.WARNING(f'  Laiškas neturi UID, praleidžiama'))
                        errors += 1
                        continue

                    try:
                        uid = int(msg.uid)
                    except ValueError:
                        self.stdout.write(self.style.WARNING(f'  Neteisingas UID: {msg.uid}'))
                        errors += 1
                        continue

                    # Parsisiųsti laišką iš IMAP
                    try:
                        raw_response = client.fetch_message(uid)
                        raw_email = raw_response[1]
                        email_message = email.message_from_bytes(raw_email)
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f'  Nepavyko parsisiųsti laiško: {e}'))
                        errors += 1
                        continue

                    # Ištrinti senus priedus (jei yra)
                    missing_attachments = []
                    for att in msg.attachments.all():
                        try:
                            if not (att.file and att.file.name and os.path.exists(att.file.path)):
                                missing_attachments.append(att)
                        except (ValueError, AttributeError):
                            missing_attachments.append(att)

                    if missing_attachments:
                        # Išsaugoti naujus priedus
                        _save_attachments(email_message, msg)
                        fetched += len(missing_attachments)
                        self.stdout.write(self.style.SUCCESS(f'  ✓ Parsisiųsta {len(missing_attachments)} priedų'))
                    else:
                        self.stdout.write(self.style.WARNING(f'  Visi priedai jau yra'))

                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  Klaida: {e}'))
                    errors += 1
                    logger.exception(f'Klaida apdorojant laišką {msg.id}')

            self.stdout.write(self.style.SUCCESS(
                f'\n✅ Baigta! Parsisiųsta: {fetched} priedų, Klaidų: {errors}'
            ))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Klaida prisijungiant prie IMAP: {e}'))
            logger.exception('IMAP klaida')
        finally:
            client.logout()
