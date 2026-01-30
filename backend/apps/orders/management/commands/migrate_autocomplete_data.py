"""
Management komanda, kuri perkelia esamus užsakymų duomenis į autocomplete_suggestions lentelę.
Paleiskite: python manage.py migrate_autocomplete_data

Taip pat gali būti naudojama perskaičiuoti naudojimo skaičius:
python manage.py migrate_autocomplete_data --recalculate
"""
from django.core.management.base import BaseCommand
from apps.orders.models import Order, OrderCarrier, CargoItem, AutocompleteSuggestion
from django.db import transaction


class Command(BaseCommand):
    help = 'Perkelia esamus užsakymų duomenis į autocomplete_suggestions lentelę'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodo, ką būtų padaryta, bet nieko nekeičia',
        )
        parser.add_argument(
            '--recalculate',
            action='store_true',
            help='Perskaičiuoja usage_count pagal esamus užsakymus',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        recalculate = options['recalculate']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - nieko nebus pakeista'))
        if recalculate:
            self.stdout.write(self.style.WARNING('RECOUNTING - perskaičiuosiu naudojimo skaičius'))
            return self.handle_recalculate(dry_run)

        migrated_count = 0
        skipped_count = 0
        
        with transaction.atomic():
            # Maršrutų duomenys
            self.stdout.write('Perkeliu maršrutų duomenis...')
            
            # Route from fields - naudoti bulk operations
            orders = Order.objects.exclude(
                route_from_country=''
            ).exclude(
                route_from_country__isnull=True
            ).only('route_from_country', 'route_from_postal_code', 'route_from_city', 'route_from_address')
            
            for order in orders:
                if order.route_from_country:
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='route_from_country',
                        value=order.route_from_country.strip(),
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
                
                if order.route_from_postal_code:
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='route_from_postal_code',
                        value=order.route_from_postal_code.strip(),
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
                
                if order.route_from_city:
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='route_from_city',
                        value=order.route_from_city.strip(),
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
                
                if order.route_from_address:
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='route_from_address',
                        value=order.route_from_address.strip(),
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
            
            # Route to fields
            for order in Order.objects.exclude(route_to_country='').filter(route_to_country__isnull=False):
                if order.route_to_country:
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='route_to_country',
                        value=order.route_to_country.strip(),
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
                
                if order.route_to_postal_code:
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='route_to_postal_code',
                        value=order.route_to_postal_code.strip(),
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
                
                if order.route_to_city:
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='route_to_city',
                        value=order.route_to_city.strip(),
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
                
                if order.route_to_address:
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='route_to_address',
                        value=order.route_to_address.strip(),
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
            
            # Order notes (jei laukas egzistuoja)
            if hasattr(Order, 'notes'):
                self.stdout.write('Perkeliu užsakymų pastabas...')
                try:
                    for order in Order.objects.exclude(notes='').filter(notes__isnull=False):
                        if order.notes and order.notes.strip():
                            # Ištraukti visus žodžius arba frazes (iki 500 simbolių)
                            notes_text = order.notes.strip()[:500]
                            suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                                field_type='order_notes',
                                value=notes_text,
                                defaults={'usage_count': 1}
                            )
                            if not created and not dry_run:
                                suggestion.usage_count += 1
                                suggestion.save()
                            if created:
                                migrated_count += 1
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Praleidžiamos užsakymų pastabos: {e}'))
            
            # Carrier notes (jei laukas egzistuoja)
            if hasattr(OrderCarrier, 'notes'):
                self.stdout.write('Perkeliu vežėjų pastabas...')
                try:
                    for carrier in OrderCarrier.objects.exclude(notes='').filter(notes__isnull=False):
                        if carrier.notes and carrier.notes.strip():
                            notes_text = carrier.notes.strip()[:500]
                            suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                                field_type='carrier_notes',
                                value=notes_text,
                                defaults={'usage_count': 1}
                            )
                            if not created and not dry_run:
                                suggestion.usage_count += 1
                                suggestion.save()
                            if created:
                                migrated_count += 1
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Praleidžiamos vežėjų pastabos: {e}'))
            
            # Cargo descriptions
            self.stdout.write('Perkeliu krovinių aprašymus...')
            for cargo in CargoItem.objects.exclude(description='').filter(description__isnull=False):
                if cargo.description and cargo.description.strip():
                    desc_text = cargo.description.strip()[:500]
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type='cargo_description',
                        value=desc_text,
                        defaults={'usage_count': 1}
                    )
                    if not created and not dry_run:
                        suggestion.usage_count += 1
                        suggestion.save()
                    if created:
                        migrated_count += 1
            
            if dry_run:
                self.stdout.write(self.style.WARNING(f'DRY RUN: būtų perkelta {migrated_count} pasiūlymų'))
                # Atšaukti transaction, jei dry_run
                transaction.set_rollback(True)
            else:
                self.stdout.write(self.style.SUCCESS(f'✅ Sėkmingai perkelta {migrated_count} pasiūlymų'))

    def handle_recalculate(self, dry_run=False):
        """Perskaičiuoja usage_count pagal esamus užsakymus"""
        from collections import defaultdict
        from django.db.models import Count

        self.stdout.write('🔄 Perskaičiuoju naudojimo skaičius...')

        # Išvalyti visus usage_count į 0
        if not dry_run:
            AutocompleteSuggestion.objects.all().update(usage_count=0)
        self.stdout.write('✅ Išvalyti seni naudojimo skaičiai')

        # Žodynai skaičiavimui
        field_counts = defaultdict(lambda: defaultdict(int))

        # Suskaičiuoti iš Order modelio laukų
        self.stdout.write('📊 Skaičiuoju iš užsakymų...')

        # Pašto kodai (nauji laukai)
        postal_codes_from = Order.objects.exclude(route_from_postal_code='').values_list('route_from_postal_code', flat=True)
        for code in postal_codes_from:
            if code and code.strip():
                field_counts['postal_code'][code.strip()] += 1

        postal_codes_to = Order.objects.exclude(route_to_postal_code='').values_list('route_to_postal_code', flat=True)
        for code in postal_codes_to:
            if code and code.strip():
                field_counts['postal_code'][code.strip()] += 1

        # Šalys
        countries_from = Order.objects.exclude(route_from_country='').values_list('route_from_country', flat=True)
        for country in countries_from:
            if country and country.strip():
                field_counts['country'][country.strip()] += 1

        countries_to = Order.objects.exclude(route_to_country='').values_list('route_to_country', flat=True)
        for country in countries_to:
            if country and country.strip():
                field_counts['country'][country.strip()] += 1

        # Miestai
        cities_from = Order.objects.exclude(route_from_city='').values_list('route_from_city', flat=True)
        for city in cities_from:
            if city and city.strip():
                field_counts['city'][city.strip()] += 1

        cities_to = Order.objects.exclude(route_to_city='').values_list('route_to_city', flat=True)
        for city in cities_to:
            if city and city.strip():
                field_counts['city'][city.strip()] += 1

        # Adresai
        addresses_from = Order.objects.exclude(route_from_address='').values_list('route_from_address', flat=True)
        for address in addresses_from:
            if address and address.strip():
                field_counts['address'][address.strip()] += 1

        addresses_to = Order.objects.exclude(route_to_address='').values_list('route_to_address', flat=True)
        for address in addresses_to:
            if address and address.strip():
                field_counts['address'][address.strip()] += 1

        # Užsakymo tipas
        order_types = Order.objects.exclude(order_type='').values_list('order_type', flat=True)
        for order_type in order_types:
            if order_type and order_type.strip():
                field_counts['order_type'][order_type.strip()] += 1

        # Mašinos tipas (iš CargoItem)
        try:
            vehicle_types = CargoItem.objects.filter(vehicle_type__isnull=False).exclude(vehicle_type='').values_list('vehicle_type', flat=True)
            for vehicle_type in vehicle_types:
                if vehicle_type and vehicle_type.strip():
                    field_counts['vehicle_type'][vehicle_type.strip()] += 1
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'Praleidžiamas vehicle_type: {e}'))

        # Krovinių aprašymai
        cargo_descriptions = CargoItem.objects.exclude(description='').values_list('description', flat=True)
        for desc in cargo_descriptions:
            if desc and desc.strip():
                field_counts['cargo_description'][desc.strip()] += 1

        # Pastabos (jei laukai egzistuoja)
        if hasattr(Order, 'notes'):
            try:
                order_notes = Order.objects.exclude(notes='').values_list('notes', flat=True)
                for note in order_notes:
                    if note and note.strip():
                        field_counts['order_notes'][note.strip()[:500]] += 1
            except:
                pass

        if hasattr(OrderCarrier, 'notes'):
            try:
                carrier_notes = OrderCarrier.objects.exclude(notes='').values_list('notes', flat=True)
                for note in carrier_notes:
                    if note and note.strip():
                        field_counts['carrier_notes'][note.strip()[:500]] += 1
            except:
                pass

        # Atnaujinti duomenų bazėje
        self.stdout.write('💾 Atnaujinu duomenų bazėje...')
        updated_count = 0

        for field_type, value_counts in field_counts.items():
            for value, count in value_counts.items():
                if not dry_run:
                    # Atnaujinti arba sukurti įrašą
                    suggestion, created = AutocompleteSuggestion.objects.get_or_create(
                        field_type=field_type,
                        value=value,
                        defaults={'usage_count': count}
                    )
                    if not created:
                        suggestion.usage_count = count
                        suggestion.save()
                updated_count += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(f'DRY RUN: būtų atnaujinta {updated_count} pasiūlymų'))
        else:
            self.stdout.write(self.style.SUCCESS(f'✅ Sėkmingai perskaičiuota {updated_count} pasiūlymų'))

