from django.core.management.base import BaseCommand
from apps.mail.models import MailMessage
from apps.mail.services import _classify_as_promotional


class Command(BaseCommand):
    help = 'Reclassifies promotional emails based on current logic, especially for trusted senders.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=1000,
            help='Maximum number of emails to process.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only show what would be changed, do not modify anything.',
        )
        parser.add_argument(
            '--all',
            action='store_true',
            help='Process all emails, regardless of the limit.',
        )

    def handle(self, *args, **options):
        limit = options['limit']
        dry_run = options['dry_run']
        process_all = options['all']

        self.stdout.write('Pradedamas reklaminių laiškų perkalsifikavimas...')

        if process_all:
            queryset = MailMessage.objects.all()
            self.stdout.write(f'Apdorosime VISUS {queryset.count()} laiškus.')
        else:
            queryset = MailMessage.objects.all().order_by('-date')[:limit]
            self.stdout.write(f'Apdorosime {queryset.count()} naujausių laiškų (naudojant limitą).')

        updated_count = 0
        processed_count = 0

        for message in queryset:
            processed_count += 1

            if processed_count % 100 == 0:
                self.stdout.write(f'Apdorota: {processed_count} laiškų...')

            try:
                # Get the current promotional status from the database
                current_is_promotional = message.is_promotional

                # Get the new promotional status based on current logic
                new_is_promotional = _classify_as_promotional(message)

                if current_is_promotional != new_is_promotional:
                    updated_count += 1 # Padidinti skaitiklį, nes statusas keisis
                    if dry_run:
                        self.stdout.write(
                            f'  DRY RUN: Laiškas {message.id} (Tema: {message.subject[:50]}...) statusas keistųsi: '
                            f'{current_is_promotional} -> {new_is_promotional}'
                        )
                    else:
                        message.is_promotional = new_is_promotional
                        message.save(update_fields=['is_promotional'])
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'  Atnaujintas laiškas {message.id} (Tema: {message.subject[:50]}...) statusas: '
                                f'{current_is_promotional} -> {new_is_promotional}'
                            )
                        )

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Klaida apdorojant laišką {message.id}: {e}')
                )

        if dry_run:
            self.stdout.write(f'\nDRY RUN baigtas. Būtų atnaujinta: {updated_count} laiškų.')
        else:
            self.stdout.write(
                self.style.SUCCESS(f'\nBaigta! Atnaujinta reklaminių laiškų statusų: {updated_count} laiškų.')
            )

