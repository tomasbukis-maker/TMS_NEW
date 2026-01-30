"""
Django management komanda testinių duomenų ištrynimui.
Naudoja modulinę sistemą - koordinuoja visus modulių deleters.
"""

from django.core.management.base import BaseCommand
from django.conf import settings
from apps.core.test_data import delete_all_test_data


class Command(BaseCommand):
    help = 'Ištrina visus testinius duomenis (tik DEBUG=True režime)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Praleisti patvirtinimo klausimą',
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stdout.write(
                self.style.ERROR('❌ Testinių duomenų ištrynimas leidžiamas tik DEBUG=True režime!')
            )
            return
        
        confirm = options.get('confirm', False)
        
        if not confirm:
            self.stdout.write(self.style.WARNING('⚠️  DĖMESYS: Bus ištrinti VISI testiniai duomenys!'))
            response = input('Ar tikrai tęsti? (taip/ne): ')
            if response.lower() not in ['taip', 'yes', 'y']:
                self.stdout.write(self.style.SUCCESS('Atšaukta.'))
                return
        
        self.stdout.write(self.style.WARNING('🗑️  Pradedamas testinių duomenų ištrynimas...'))
        
        try:
            stats = delete_all_test_data()
            
            self.stdout.write(self.style.SUCCESS('\n✓ Testinių duomenų ištrynimas baigtas!'))
            self.stdout.write(f'  - Ištrinta užsakymų: {stats["orders_deleted"]}')
            self.stdout.write(f'  - Ištrinta sąskaitų: {stats["invoices_deleted"]}')
            
            if stats.get('errors'):
                self.stdout.write(self.style.WARNING(f'\n⚠️  Klaidų: {len(stats["errors"])}'))
                for error in stats['errors']:
                    self.stdout.write(f'  - {error}')
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'❌ Klaida: {str(e)}'))






