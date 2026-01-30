import os
import shutil
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.mail.models import MailAttachment


class Command(BaseCommand):
    help = 'Sinchronizuoja laiškų priedus į serverį'

    def add_arguments(self, parser):
        parser.add_argument(
            '--server-path',
            type=str,
            default='/var/www/tms/attachments',
            help='Serverio katalogas kur kopijuoti priedus',
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
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Perrašyti egzistuojančius failus',
        )

    def handle(self, *args, **options):
        server_path = options['server_path']
        dry_run = options['dry_run']
        limit = options['limit']
        overwrite = options['overwrite']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - nieko nebus keičiama'))

        # Sukurti serverio katalogą jei reikia
        if not dry_run:
            os.makedirs(server_path, exist_ok=True)
            self.stdout.write(f'Serverio katalogas: {server_path}')

        # Gauti priedus
        attachments = MailAttachment.objects.exclude(file='').order_by('-mail_message__date')

        if limit:
            attachments = attachments[:limit]
            self.stdout.write(f'Apdorosime {limit} priedų')
        else:
            self.stdout.write(f'Apdorosime VISUS priedus ({attachments.count()})')

        processed = 0
        copied = 0
        skipped = 0
        errors = 0

        for attachment in attachments:
            processed += 1

            if processed % 50 == 0:
                self.stdout.write(f'Apdorota: {processed} priedų...')

            # Sukurti pilną kelią serveryje
            server_file_path = os.path.join(
                server_path,
                f"{attachment.mail_message.date.strftime('%Y-%m-%d')}",
                f"msg_{attachment.mail_message.id}",
                attachment.filename
            )

            # Patikrinti ar failas jau egzistuoja
            if os.path.exists(server_file_path) and not overwrite:
                skipped += 1
                if dry_run:
                    self.stdout.write(f'❌ SKIP: {attachment.filename} (jau egzistuoja)')
                continue

            if not dry_run:
                try:
                    # Sukurti katalogą
                    os.makedirs(os.path.dirname(server_file_path), exist_ok=True)

                    # Nukopijuoti failą
                    with attachment.file.open('rb') as src_file:
                        with open(server_file_path, 'wb') as dst_file:
                            shutil.copyfileobj(src_file, dst_file)

                    copied += 1
                    self.stdout.write(
                        f'✅ Nukopijuota: {attachment.filename} -> {server_file_path}'
                    )

                except Exception as e:
                    errors += 1
                    self.stdout.write(
                        self.style.ERROR(f'Klaida kopijuojant {attachment.filename}: {e}')
                    )
            else:
                # Dry run
                status = 'COPY' if not os.path.exists(server_file_path) else 'OVERWRITE'
                self.stdout.write(f'📄 {status}: {attachment.filename} -> {server_file_path}')

        self.stdout.write(self.style.SUCCESS(
            f'\\n✅ Baigta! Apdorota: {processed} priedų'
        ))

        if not dry_run:
            self.stdout.write(self.style.SUCCESS(
                f'Nukopijuota: {copied} priedų'
            ))
            if skipped > 0:
                self.stdout.write(self.style.WARNING(
                    f'Praleista (jau egzistuoja): {skipped} priedų'
                ))
            if errors > 0:
                self.stdout.write(self.style.ERROR(
                    f'Klaidų: {errors} priedų'
                ))
        else:
            self.stdout.write(self.style.WARNING(
                'Tai buvo DRY RUN - nieko nebuvo pakeista'
            ))

        self.stdout.write(self.style.SUCCESS(
            f'\\nServerio katalogas: {server_path}'
        ))







