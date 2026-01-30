"""
Django management komanda testinių duomenų generavimui.
Naudoja modulinę sistemą - koordinuoja visus modulių generatorius.
"""

from django.core.management.base import BaseCommand
from django.conf import settings
from apps.core.test_data import generate_all_test_data


class Command(BaseCommand):
    help = 'Generuoja testinius duomenis (tik DEBUG=True režime)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--count',
            type=int,
            default=100,
            help='Užsakymų skaičius (default: 100)',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stdout.write(
                self.style.ERROR('❌ Testinių duomenų generavimas leidžiamas tik DEBUG=True režime!')
            )
            return
        
        count = options.get('count', 100)
        
        self.stdout.write(self.style.WARNING(f'🚀 Pradedamas testinių duomenų generavimas ({count} užsakymų)...'))
        
        try:
            stats = generate_all_test_data(count)
            
            self.stdout.write(self.style.SUCCESS('\n✓ Testinių duomenų generavimas baigtas!'))
            self.stdout.write(f'  - Užsakymai: {stats["orders"]}')
            self.stdout.write(f'  - Sąskaitos: {stats["invoices"]}')
            
            if stats.get('errors'):
                self.stdout.write(self.style.WARNING(f'\n⚠️  Klaidų: {len(stats["errors"])}'))
                for error in stats['errors'][:5]:  # Rodyti tik pirmas 5
                    self.stdout.write(f'  - {error}')
                if len(stats['errors']) > 5:
                    self.stdout.write(f'  ... ir dar {len(stats["errors"]) - 5} klaidų')
            
        except ValueError as e:
            self.stdout.write(self.style.ERROR(f'❌ {str(e)}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Klaida: {str(e)}'))






