from django.core.management.base import BaseCommand
from apps.mail.models import MailMessage
from apps.mail.services import _sanitize_html


class Command(BaseCommand):
    help = 'Išvalo email HTML turinį nuo pavojingo JavaScript'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodo ką būtų padaryta, bet nieko nekeičia',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - nieko nebus keičiama'))

        # Rasti laiškus su HTML turiniu
        messages_with_html = MailMessage.objects.exclude(body_html='')

        self.stdout.write(f'Rasta {messages_with_html.count()} laiškų su HTML turiniu')

        cleaned_count = 0

        for message in messages_with_html:
            original_html = message.body_html
            cleaned_html = _sanitize_html(original_html)

            if original_html != cleaned_html:
                if not dry_run:
                    message.body_html = cleaned_html
                    message.save(update_fields=['body_html'])
                cleaned_count += 1

                if cleaned_count <= 5:  # Rodyti tik pirmus 5 pavyzdžius
                    self.stdout.write(f'  Išvalytas laiškas ID {message.id}: {message.subject[:50]}...')

        if dry_run:
            self.stdout.write(self.style.WARNING(f'DRY RUN: būtų išvalyti {cleaned_count} laiškai'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Sėkmingai išvalyti {cleaned_count} laiškai'))

        self.stdout.write('Valymas baigtas!')


