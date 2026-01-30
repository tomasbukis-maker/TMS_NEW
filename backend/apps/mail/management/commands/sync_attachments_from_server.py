import os
import shutil
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.mail.models import MailAttachment
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Sinchronizuoja laiškų priedus iš serverio į lokalų (per SSH/rsync arba tiesiogiai jei failai prieinami)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--server-path',
            type=str,
            help='Serverio katalogas iš kur kopijuoti priedus (pvz., /var/www/tms/media/mail_attachments arba SSH kelias)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodyti ką būtų padaryta, bet nieko nekeisti',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Apriboti priedų skaičių',
        )

    def handle(self, *args, **options):
        server_path = options['server_path']
        dry_run = options['dry_run']
        limit = options['limit']

        if not server_path:
            self.stdout.write(self.style.ERROR(
                'Nurodykite --server-path (pvz., /var/www/tms/media/mail_attachments)'
            ))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - nieko nebus keičiama'))

        # Lokalus katalogas
        local_media_root = settings.MEDIA_ROOT
        local_attachments_dir = os.path.join(local_media_root, 'mail_attachments')
        os.makedirs(local_attachments_dir, exist_ok=True)

        # Gauti priedus, kurių failų nėra lokaliai
        attachments = MailAttachment.objects.exclude(file='')
        
        if limit:
            attachments = attachments[:limit]

        missing_count = 0
        copied_count = 0
        skipped_count = 0
        errors_count = 0

        for attachment in attachments:
            local_file_path = attachment.file.path if attachment.file else None
            
            # Patikrinti ar failas egzistuoja lokaliai
            if local_file_path and os.path.exists(local_file_path):
                skipped_count += 1
                continue

            # Rasti serverio failo kelią
            # Struktūra: mail_attachments/{message_id}/{filename}
            server_file_path = os.path.join(
                server_path,
                str(attachment.mail_message_id),
                attachment.filename
            )

            if not os.path.exists(server_file_path):
                missing_count += 1
                if dry_run:
                    self.stdout.write(f'❌ NERASTA: {attachment.filename} (message_id={attachment.mail_message_id})')
                continue

            if dry_run:
                self.stdout.write(f'📄 KOPIJUOTI: {attachment.filename} -> {local_file_path or "NEW"}')
                continue

            try:
                # Sukurti lokalų katalogą
                local_message_dir = os.path.join(local_attachments_dir, str(attachment.mail_message_id))
                os.makedirs(local_message_dir, exist_ok=True)

                # Nukopijuoti failą
                local_file_path = os.path.join(local_message_dir, attachment.filename)
                shutil.copy2(server_file_path, local_file_path)

                # Atnaujinti FileField, kad rodytų į naują failą
                # Reikia atnaujinti tik jei failas neegzistuoja
                if not attachment.file or not os.path.exists(attachment.file.path):
                    # Atnaujinti FileField
                    relative_path = os.path.join('mail_attachments', str(attachment.mail_message_id), attachment.filename)
                    attachment.file.name = relative_path
                    attachment.save(update_fields=['file'])

                copied_count += 1
                if copied_count % 10 == 0:
                    self.stdout.write(f'Kopijuota: {copied_count} priedų...')

            except Exception as e:
                errors_count += 1
                self.stdout.write(
                    self.style.ERROR(f'Klaida kopijuojant {attachment.filename}: {e}')
                )

        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Baigta!'
        ))
        if not dry_run:
            self.stdout.write(f'Kopijuota: {copied_count} priedų')
            self.stdout.write(f'Praleista (jau egzistuoja): {skipped_count} priedų')
            if missing_count > 0:
                self.stdout.write(self.style.WARNING(
                    f'Nerasta serveryje: {missing_count} priedų'
                ))
            if errors_count > 0:
                self.stdout.write(self.style.ERROR(
                    f'Klaidų: {errors_count} priedų'
                ))
        else:
            self.stdout.write(self.style.WARNING(
                'Tai buvo DRY RUN - nieko nebuvo pakeista'
            ))
