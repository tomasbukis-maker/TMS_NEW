from django.core.management.base import BaseCommand
from django.db.models import Q
from apps.mail.models import MailMessage
from apps.mail.mail_matching_helper_NEW import update_message_matches


class Command(BaseCommand):
    help = 'Atnaujina visų laiškų atitikmenis su užsakymais/ekspedicijomis'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=1000,
            help='Maksimalus laiškų skaičius apdoroti',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodyti ką būtų keičiama, nieko nekeisti',
        )

    def handle(self, *args, **options):
        limit = options['limit']
        dry_run = options['dry_run']

        # Rasti laiškus kurie neturi susiejimų bet gali turėti
        queryset = MailMessage.objects.filter(
            Q(status='new') | Q(status='linked')
        ).exclude(
            matched_orders__isnull=False
        ).exclude(
            matched_expeditions__isnull=False
        )[:limit]

        self.stdout.write(f'Rasta {queryset.count()} laiškų patikrinti')

        updated_count = 0
        processed_count = 0

        for message in queryset:
            processed_count += 1

            if processed_count % 100 == 0:
                self.stdout.write(f'Apdorota: {processed_count} laiškų...')

            try:
                old_orders = message.matched_orders.count()
                old_expeditions = message.matched_expeditions.count()

                if not dry_run:
                    update_message_matches(message)
                    message.refresh_from_db()

                new_orders = message.matched_orders.count()
                new_expeditions = message.matched_expeditions.count()

                if new_orders > old_orders or new_expeditions > old_expeditions:
                    updated_count += 1
                    order_nums = [o.order_number for o in message.matched_orders.all()]
                    exp_nums = [e.expedition_number for e in message.matched_expeditions.all()]

                    if dry_run:
                        self.stdout.write(
                            f'  BŪTŲ atnaujintas laiškas {message.id}: '
                            f'{old_orders}->{new_orders} užsakymų {order_nums}, '
                            f'{old_expeditions}->{new_expeditions} ekspedicijų {exp_nums}'
                        )
                    else:
                        self.stdout.write(
                            f'  Atnaujintas laiškas {message.id}: '
                            f'{old_orders}->{new_orders} užsakymų {order_nums}, '
                            f'{old_expeditions}->{new_expeditions} ekspedicijų {exp_nums}'
                        )

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Klaida apdorojant laišką {message.id}: {e}')
                )

        if dry_run:
            self.stdout.write(f'DRY RUN baigtas. Būtų atnaujinta: {updated_count} laiškų')
        else:
            self.stdout.write(
                self.style.SUCCESS(f'Baigta! Atnaujinta susiejimų: {updated_count} laiškų')
            )