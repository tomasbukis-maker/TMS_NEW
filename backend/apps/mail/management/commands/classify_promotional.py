from django.core.management.base import BaseCommand
from apps.mail.models import MailMessage
from apps.mail.services import _classify_as_promotional


class Command(BaseCommand):
    help = 'Perklasifikuoja visus laiškus kaip reklaminius arba ne'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Rodo, kokie laiškai būtų klasifikuoti, bet nekeičia duomenų bazės',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Apriboti apdorojamų laiškų skaičių',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        limit = options['limit']
        
        queryset = MailMessage.objects.all()
        if limit:
            queryset = queryset[:limit]
        
        total = queryset.count()
        self.stdout.write(f'Apdorojama {total} laiškų...')
        
        updated_count = 0
        promotional_count = 0
        
        for mail_message in queryset:
            is_promotional = _classify_as_promotional(mail_message)
            
            if mail_message.is_promotional != is_promotional:
                if not dry_run:
                    mail_message.is_promotional = is_promotional
                    mail_message.save(update_fields=['is_promotional'])
                updated_count += 1
                
                if is_promotional:
                    promotional_count += 1
                    self.stdout.write(
                        f'  ✓ Laiškas {mail_message.id} ({mail_message.subject[:50]}...): '
                        f'{"BŪTŲ pažymėtas kaip reklaminis" if dry_run else "Pažymėtas kaip reklaminis"}'
                    )
                else:
                    self.stdout.write(
                        f'  - Laiškas {mail_message.id} ({mail_message.subject[:50]}...): '
                        f'{"BŪTŲ pažymėtas kaip ne reklaminis" if dry_run else "Pažymėtas kaip ne reklaminis"}'
                    )
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'\nDRY RUN: Rastas {updated_count} laiškų, kuriuos reikėtų atnaujinti '
                    f'({promotional_count} reklaminių)'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\n✓ Atnaujinta {updated_count} laiškų ({promotional_count} pažymėti kaip reklaminiai)'
                )
            )


