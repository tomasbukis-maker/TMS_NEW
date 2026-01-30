from django.core.management.base import BaseCommand
from apps.invoices.models import SalesInvoice
from apps.settings.models import InvoiceSettings


class Command(BaseCommand):
    help = 'Atnaujina visas sąskaitas su neteisingais arba trūkstamais display_options'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Priversti visų sąskaitų display_options atnaujinti su numatytosiomis vertėmis iš nustatymų',
        )

    def handle(self, *args, **options):
        self.stdout.write('Pradedamas display_options taisymas...')
        
        # Gauti numatytąsias vertes iš InvoiceSettings
        invoice_settings = InvoiceSettings.load()
        default_display_options = invoice_settings.default_display_options or {}
        
        # Standartinė struktūra su visais laukais
        standard_structure = {
            'show_order_type': default_display_options.get('show_order_type', True),
            'show_cargo_info': default_display_options.get('show_cargo_info', True),
            'show_cargo_weight': default_display_options.get('show_cargo_weight', True),
            'show_cargo_ldm': default_display_options.get('show_cargo_ldm', True),
            'show_cargo_dimensions': default_display_options.get('show_cargo_dimensions', True),
            'show_cargo_properties': default_display_options.get('show_cargo_properties', True),
            'show_carriers': default_display_options.get('show_carriers', True),
            'show_carrier_name': default_display_options.get('show_carrier_name', True),
            'show_carrier_route': default_display_options.get('show_carrier_route', True),
            'show_carrier_dates': default_display_options.get('show_carrier_dates', True),
            'show_prices': default_display_options.get('show_prices', True),
            'show_my_price': default_display_options.get('show_my_price', True),
            'show_other_costs': default_display_options.get('show_other_costs', True),
        }
        
        updated_count = 0
        skipped_count = 0
        
        # Gauti visas sąskaitas
        invoices = SalesInvoice.objects.all()
        
        force_update = options.get('force', False)
        
        for invoice in invoices:
            needs_update = False
            current_options = invoice.display_options or {}
            
            # Jei --force, visada naudoti standartinę struktūrą su numatytosiomis vertėmis
            if force_update:
                invoice.display_options = standard_structure.copy()
                invoice.save(update_fields=['display_options'])
                updated_count += 1
                continue
            
            # Pradėti nuo standartinės struktūros
            updated_options = standard_structure.copy()
            
            # Jei yra esami display_options, išlaikyti jų vertes (jei jos tinkamos)
            # Bet pakeisti senus laukus į naują struktūrą
            if current_options:
                # Konvertuoti show_cargo_details į detalinius laukus (jei egzistuoja)
                if 'show_cargo_details' in current_options:
                    cargo_details = current_options.get('show_cargo_details', True)
                    updated_options['show_cargo_weight'] = cargo_details
                    updated_options['show_cargo_ldm'] = cargo_details
                    updated_options['show_cargo_dimensions'] = cargo_details
                    updated_options['show_cargo_properties'] = cargo_details
                    needs_update = True
                
                # Konvertuoti show_carrier_details į detalinius laukus (jei egzistuoja)
                if 'show_carrier_details' in current_options:
                    carrier_details = current_options.get('show_carrier_details', True)
                    updated_options['show_carrier_name'] = carrier_details
                    updated_options['show_carrier_route'] = carrier_details
                    updated_options['show_carrier_dates'] = carrier_details
                    needs_update = True
                
                # Konvertuoti show_price_details į detalinius laukus (jei egzistuoja)
                if 'show_price_details' in current_options:
                    price_details = current_options.get('show_price_details', True)
                    updated_options['show_my_price'] = price_details
                    updated_options['show_other_costs'] = price_details
                    needs_update = True
                
                # Perkelti teisingus naujus laukus iš esamų options
                for key in standard_structure.keys():
                    if key in current_options:
                        # Išlaikyti esamą vertę, jei ji yra
                        updated_options[key] = current_options[key]
            
            # Palyginti ar kas nors pasikeitė
            if not needs_update and current_options != updated_options:
                needs_update = True
            
            # Visada atnaujinti, jei struktūra neteisinga arba trūksta laukų
            if needs_update or set(current_options.keys()) != set(standard_structure.keys()):
                invoice.display_options = updated_options
                invoice.save(update_fields=['display_options'])
                updated_count += 1
            else:
                skipped_count += 1
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Atnaujinta {updated_count} sąskaitų. '
                f'Praleista {skipped_count} sąskaitų (jau turėjo teisingą struktūrą).'
            )
        )

