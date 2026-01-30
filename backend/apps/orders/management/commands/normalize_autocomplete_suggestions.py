from django.core.management.base import BaseCommand
from django.db import transaction
from apps.orders.models import AutocompleteSuggestion
import re
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Normalizuoja esamus autocomplete pasiūlymus duomenų bazėje'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Rodo ką būtų padaryta, bet nedaro pakeitimų',
        )
        parser.add_argument(
            '--field-type',
            type=str,
            help='Normalizuoti tik konkretų laukelio tipą',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        field_type_filter = options.get('field_type')

        self.stdout.write('Pradedama normalizuoti autocomplete pasiūlymus...')

        # Gauname visus pasiūlymus
        queryset = AutocompleteSuggestion.objects.all()
        if field_type_filter:
            queryset = queryset.filter(field_type=field_type_filter)

        total_processed = 0
        total_merged = 0
        total_deleted = 0

        # Grupuojame pagal field_type
        field_types = queryset.values_list('field_type', flat=True).distinct()

        for field_type in field_types:
            self.stdout.write(f'Apdorojamas laukelio tipas: {field_type}')

            suggestions = AutocompleteSuggestion.objects.filter(field_type=field_type)
            suggestions_dict = {}

            for suggestion in suggestions:
                normalized_value = self.normalize_value(suggestion.value, field_type)

                if normalized_value in suggestions_dict:
                    # Rasti dublikatas - sujungiame
                    existing = suggestions_dict[normalized_value]
                    existing.usage_count += suggestion.usage_count
                    if suggestion.last_used_at and (not existing.last_used_at or suggestion.last_used_at > existing.last_used_at):
                        existing.last_used_at = suggestion.last_used_at

                    self.stdout.write(f'  Sujungiama: "{suggestion.value}" → "{normalized_value}" (naudojimų: {suggestion.usage_count})')

                    if not dry_run:
                        existing.save()
                        suggestion.delete()
                    total_merged += 1
                    total_deleted += 1
                else:
                    # Pirmas kartas arba normalizuota reikšmė skiriasi
                    if normalized_value != suggestion.value:
                        # Reikšmė buvo normalizuota
                        self.stdout.write(f'  Normalizuojama: "{suggestion.value}" → "{normalized_value}"')

                        if not dry_run:
                            suggestion.value = normalized_value
                            suggestion.save()

                    suggestions_dict[normalized_value] = suggestion
                    total_processed += 1

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - jokie pakeitimai nebuvo atlikti'))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'Normalizacija baigta: apdorota {total_processed} įrašų, '
                f'sujungta {total_merged} dublikatų, ištrinta {total_deleted} įrašų'
            ))

    def normalize_value(self, value, field_type):
        """Normalizuoja reikšmę"""
        if not value:
            return value

        normalized = value.strip()

        # Pašalinti kelis tarpus iš eilės
        normalized = re.sub(r'\s+', ' ', normalized)

        # Specialūs atvejai pagal laukelio tipą
        if field_type in ['address', 'order_notes', 'cargo_description']:
            # Pašalinti nereikalingus simbolius pabaigoje
            normalized = re.sub(r'[.,;]+$', '', normalized.strip())
            # Normalizuoti adresus
            if field_type == 'address':
                normalized = re.sub(r'\bg\.\s*', 'g. ', normalized, flags=re.IGNORECASE)
                normalized = re.sub(r'\bpl\.\s*', 'pl. ', normalized, flags=re.IGNORECASE)
                normalized = re.sub(r'\bpr\.\s*', 'pr. ', normalized, flags=re.IGNORECASE)

        elif field_type == 'city':
            # Miestams - title case
            normalized = normalized.title()
            normalized = re.sub(r'[.,;]+$', '', normalized.strip())

        elif field_type == 'country':
            # Šalims - title case ir mapping'ai
            normalized = normalized.title()
            country_mappings = {
                'Lt': 'Lietuva', 'Lt.': 'Lietuva', 'Lithuania': 'Lietuva',
                'Be': 'Belgija', 'Belgium': 'Belgija',
                'Nl': 'Nyderlandai', 'Netherlands': 'Nyderlandai',
                'Lv': 'Latvija', 'Latvia': 'Latvija',
                'Ee': 'Estija', 'Estonia': 'Estija',
                'Pl': 'Lenkija', 'Poland': 'Lenkija',
            }
            if normalized in country_mappings:
                normalized = country_mappings[normalized]

        return normalized.strip()
