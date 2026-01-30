from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q
import re

from apps.orders.models import Order, OrderCarrier

EXPEDITION_PATTERN = re.compile(r'\bE\d{3,}\b', re.IGNORECASE)


class Command(BaseCommand):
    help = 'Perkelia ekspedicijos numerius iš vežėjo pastabų į naują expedition_number lauką.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Parodo, kiek įrašų būtų atnaujinta, bet realiai neatnaujina duomenų.',
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Perrašyti ekspedicijos numerį, net jei jis jau egzistuoja (numatytai paliekama esama reikšmė).',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        overwrite = options['overwrite']

        carrier_qs = OrderCarrier.objects.all()
        if not overwrite:
            carrier_qs = carrier_qs.filter(expedition_number__isnull=True)

        # Iš anksto susirinkti ekspedicijos numerius iš orders.notes
        order_numbers = {}
        orders_with_notes = Order.objects.filter(notes__icontains='e')
        for order in orders_with_notes.values('id', 'notes'):
            matches = EXPEDITION_PATTERN.findall(order['notes'] or '')
            if not matches:
                continue
            normalized = {match.upper() for match in matches}
            if len(normalized) == 1:
                order_numbers[order['id']] = normalized.pop()
            elif len(normalized) > 1:
                self.stdout.write(
                    self.style.WARNING(
                        f"Užsakymas ID={order['id']}: rasta keli galimi ekspedicijos numeriai ({', '.join(sorted(normalized))}). Praleidžiama."
                    )
                )

        total_scanned = 0
        from_carrier_notes = 0
        from_order_notes = 0
        updated = 0
        skipped_multiple = 0
        skipped_existing = 0
        duplicates = []
        orders_already_assigned = set()

        with transaction.atomic():
            for carrier in carrier_qs.select_for_update():
                total_scanned += 1

                candidate_numbers = set()

                if carrier.notes:
                    matches = EXPEDITION_PATTERN.findall(carrier.notes)
                    candidate_numbers.update(match.upper() for match in matches)
                    if matches:
                        from_carrier_notes += 1

                if carrier.order_id in order_numbers:
                    candidate_numbers.add(order_numbers[carrier.order_id])
                    from_order_notes += 1

                if not candidate_numbers:
                    continue

                if len(candidate_numbers) > 1:
                    skipped_multiple += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f"Vežėjas ID={carrier.id}: rasta keli skirtingi numeriai ({', '.join(sorted(candidate_numbers))}). Praleidžiama."
                        )
                    )
                    continue

                expedition_number = candidate_numbers.pop()

                if carrier.expedition_number and not overwrite:
                    skipped_existing += 1
                    continue

                if not overwrite and carrier.order_id in orders_already_assigned:
                    # To paties užsakymo numeris jau priskirtas šio vykdymo metu – praleidžiame likusius.
                    continue

                if not overwrite:
                    existing_same_order = OrderCarrier.objects.filter(
                        order_id=carrier.order_id,
                        expedition_number__isnull=False
                    ).exclude(pk=carrier.pk)
                    if existing_same_order.exists():
                        continue

                updated += 1
                if not dry_run:
                    carrier.expedition_number = expedition_number
                    carrier.save(update_fields=['expedition_number'])
                orders_already_assigned.add(carrier.order_id)

            if dry_run:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS('--- Rezultatai ---'))
        self.stdout.write(f'Vežėjų patikrinta: {total_scanned}')
        self.stdout.write(f'Rasta numerių vežėjų pastabose: {from_carrier_notes}')
        self.stdout.write(f'Rasta numerių užsakymų pastabose: {from_order_notes}')
        self.stdout.write(f'Atnaujinta ekspedicijos numerių: {updated}')
        if skipped_multiple:
            self.stdout.write(f'Praleista dėl kelių galimų numerių: {skipped_multiple}')
        if skipped_existing:
            self.stdout.write(f'Praleista, nes numeris jau nustatytas ir neperrašoma: {skipped_existing}')
        if dry_run:
            self.stdout.write(self.style.WARNING('Dry-run režimas: realūs įrašai nebuvo atnaujinti.'))
        else:
            self.stdout.write(self.style.SUCCESS('Ekspedicijos numerių migracija baigta.'))
