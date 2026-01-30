"""
Management komanda sinchronizavimui į nuotolinę DB.
Naudojama pradiniam duomenų kopijavimui arba atkūrimui po nesėkmės.
"""

from django.core.management.base import BaseCommand
from django.db import connections
from apps.core.db_sync import bulk_sync_to_replica
from apps.orders.models import Order, OrderCarrier, CargoItem, OtherCost
from apps.invoices.models import SalesInvoice, PurchaseInvoice, SalesInvoiceItem, PurchaseInvoiceItem
from apps.partners.models import Partner, Contact
from apps.settings.models import (
    CompanyInfo, UserSettings, InvoiceSettings, OrderSettings,
    PVMRate, InvoiceNumberSequence
)
from django.contrib.auth import get_user_model
import logging

logger = logging.getLogger(__name__)
User = get_user_model()

# Visi modeliai, kuriuos reikia sinchronizuoti
SYNC_MODELS = [
    ('User', User),
    ('Partner', Partner),
    ('Contact', Contact),
    ('Order', Order),
    ('OrderCarrier', OrderCarrier),
    ('CargoItem', CargoItem),
    ('OtherCost', OtherCost),
    ('SalesInvoice', SalesInvoice),
    ('SalesInvoiceItem', SalesInvoiceItem),
    ('PurchaseInvoice', PurchaseInvoice),
    ('PurchaseInvoiceItem', PurchaseInvoiceItem),
    ('CompanyInfo', CompanyInfo),
    ('UserSettings', UserSettings),
    ('InvoiceSettings', InvoiceSettings),
    ('OrderSettings', OrderSettings),
    ('PVMRate', PVMRate),
    ('InvoiceNumberSequence', InvoiceNumberSequence),
]


class Command(BaseCommand):
    help = 'Sinchronizuoti visus duomenis iš lokalių DB į nuotolinę DB (replica)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--model',
            type=str,
            help='Sinchronizuoti tik konkretų modelį (pvz., Order, Partner)',
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Išvalyti nuotolinę DB prieš sinchronizaciją (DANGER!)',
        )
        parser.add_argument(
            '--test',
            action='store_true',
            help='Tik testuoti prisijungimą, nesiųsti duomenų',
        )

    def handle(self, *args, **options):
        model_name = options.get('model')
        clear_first = options.get('clear', False)
        test_only = options.get('test', False)

        # Patikrinti prisijungimą
        self.stdout.write('Patikrinama DB prisijungimai...')
        
        try:
            default_conn = connections['default']
            default_conn.ensure_connection()
            self.stdout.write(self.style.SUCCESS('✓ Lokali DB: prisijungimas OK'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Lokali DB: {str(e)}'))
            return

        try:
            replica_conn = connections['replica']
            replica_conn.ensure_connection()
            self.stdout.write(self.style.SUCCESS('✓ Nuotolinė DB: prisijungimas OK'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Nuotolinė DB: {str(e)}'))
            self.stdout.write(self.style.WARNING('Tęsiame tik su lokalių DB...'))
            return

        if test_only:
            self.stdout.write(self.style.SUCCESS('Prisijungimai veikia! Testas baigtas.'))
            return

        # Išvalyti nuotolinę DB jei reikia
        if clear_first:
            self.stdout.write(self.style.WARNING('⚠️  Išvaloma nuotolinė DB...'))
            for model_label, model_class in SYNC_MODELS:
                try:
                    model_class.objects.using('replica').all().delete()
                    self.stdout.write(f'  - Išvalytas: {model_label}')
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'  - Klaida išvalant {model_label}: {str(e)}'))

        # Sinchronizuoti visus modelius
        total_synced = 0
        
        for model_label, model_class in SYNC_MODELS:
            if model_name and model_label.lower() != model_name.lower():
                continue
            
            self.stdout.write(f'\nSinchronizuojamas: {model_label}...')
            
            try:
                # Gaukime queryset iš lokalių DB
                queryset = model_class.objects.using('default').all()
                count = queryset.count()
                
                if count == 0:
                    self.stdout.write(f'  - Nėra duomenų ({model_label})')
                    continue
                
                # Sinchronizuoti
                synced = bulk_sync_to_replica(model_class, queryset)
                total_synced += synced
                
                self.stdout.write(self.style.SUCCESS(f'  ✓ Sinchronizuota: {synced} įrašų ({model_label})'))
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'  ✗ Klaida sinchronizuojant {model_label}: {str(e)}'))
                logger.error(f"Error syncing {model_label}: {str(e)}", exc_info=True)

        self.stdout.write(self.style.SUCCESS(f'\n✓ Sinchronizacija baigta! Iš viso: {total_synced} įrašų'))









