from django.core.management.base import BaseCommand

from apps.mail.services import sync_imap


class Command(BaseCommand):
    help = 'Sinchronizuoja naujus laiškus iš IMAP serverio pagal NotificationSettings.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=50,
            help='Kiek maksimaliai naujų laiškų sinchronizuoti vieno paleidimo metu.',
        )

    def handle(self, *args, **options):
        limit = options['limit']
        result = sync_imap(limit=limit)
        status = result.get('status')
        message = result.get('message', '')
        count = result.get('count', 0)

        if status == 'ok':
            self.stdout.write(self.style.SUCCESS(f'Sinchronizacija sėkminga. Nauji laiškai: {count}'))
        elif status == 'disabled':
            self.stdout.write(self.style.WARNING(message or 'Sinchronizacija išjungta.'))
        else:
            self.stderr.write(self.style.ERROR(message or 'Įvyko klaida sinchronizuojant laiškus.'))

