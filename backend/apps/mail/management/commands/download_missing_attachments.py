import os
import urllib.request
import urllib.error
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.mail.models import MailAttachment
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Atsisiunčia trūkstamus priedus iš serverio per API'

    def add_arguments(self, parser):
        parser.add_argument(
            '--server-url',
            type=str,
            help='Serverio API URL (pvz., https://tms.example.com/api)',
        )
        parser.add_argument(
            '--token',
            type=str,
            help='JWT token autentifikacijai (jei reikia)',
        )
        parser.add_argument(
            '--message-id',
            type=int,
            help='Atsisiųsti priedus tik konkretaus laiško (optional)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodyti ką būtų padaryta',
        )

    def handle(self, *args, **options):
        server_url = options['server_url'] or getattr(settings, 'SERVER_API_URL', None)
        token = options['token'] or getattr(settings, 'SERVER_API_TOKEN', None)
        message_id = options.get('message_id')
        dry_run = options['dry_run']

        if not server_url:
            self.stdout.write(self.style.ERROR(
                'Nurodykite --server-url arba nustatykite SERVER_API_URL settings.py'
            ))
            return

        # Rasti trūkstamus priedus
        attachments = MailAttachment.objects.exclude(file='')
        if message_id:
            attachments = attachments.filter(mail_message_id=message_id)
        
        missing_attachments = []
        for attachment in attachments:
            try:
                if attachment.file and attachment.file.name:
                    local_path = attachment.file.path
                    if not os.path.exists(local_path):
                        missing_attachments.append(attachment)
            except (ValueError, AttributeError):
                missing_attachments.append(attachment)

        if not missing_attachments:
            self.stdout.write(self.style.SUCCESS('Visi priedai yra lokaliai!'))
            return

        self.stdout.write(f'Rasta {len(missing_attachments)} trūkstamų priedų')

        if dry_run:
            for att in missing_attachments:
                self.stdout.write(f'  - {att.filename} (ID: {att.id}, message_id: {att.mail_message_id})')
            return

        # Lokalus katalogas
        local_media_root = settings.MEDIA_ROOT
        local_attachments_dir = os.path.join(local_media_root, 'mail_attachments')
        os.makedirs(local_attachments_dir, exist_ok=True)

        downloaded = 0
        errors = 0

        # Headers su autentifikacija
        headers = {}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        for attachment in missing_attachments:
            try:
                # Bandyti atsisiųsti per API
                download_url = f"{server_url.rstrip('/')}/mail/attachments/{attachment.id}/download/"
                
                self.stdout.write(f'Atsisiunčiama: {attachment.filename}...', ending=' ')
                
                # Sukurti request su headers
                req = urllib.request.Request(download_url, headers=headers)
                
                try:
                    with urllib.request.urlopen(req, timeout=30) as response:
                        if response.status == 200:
                            # Sukurti lokalų katalogą
                            local_message_dir = os.path.join(local_attachments_dir, str(attachment.mail_message_id))
                            os.makedirs(local_message_dir, exist_ok=True)
                            
                            # Išsaugoti failą
                            local_file_path = os.path.join(local_message_dir, attachment.filename)
                            with open(local_file_path, 'wb') as f:
                                f.write(response.read())
                            
                            # Atnaujinti FileField
                            relative_path = os.path.join('mail_attachments', str(attachment.mail_message_id), attachment.filename)
                            attachment.file.name = relative_path
                            attachment.save(update_fields=['file'])
                            
                            downloaded += 1
                            self.stdout.write(self.style.SUCCESS('✓'))
                        else:
                            self.stdout.write(self.style.ERROR(f'Klaida: HTTP {response.status}'))
                            errors += 1
                except urllib.error.HTTPError as e:
                    if e.code == 404:
                        self.stdout.write(self.style.WARNING('Nerastas serveryje'))
                    else:
                        self.stdout.write(self.style.ERROR(f'HTTP {e.code}'))
                    errors += 1
                except urllib.error.URLError as e:
                    self.stdout.write(self.style.ERROR(f'URL klaida: {e}'))
                    errors += 1
                    
            except Exception as e:
                errors += 1
                self.stdout.write(self.style.ERROR(f'Klaida: {e}'))

        self.stdout.write(self.style.SUCCESS(
            f'\n✅ Baigta! Atsisiųsta: {downloaded}, Klaidų: {errors}'
        ))
