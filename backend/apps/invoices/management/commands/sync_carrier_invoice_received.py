"""Management command, kuris sinchronizuoja OrderCarrier.invoice_received flag'us pagal PurchaseInvoice."""

from django.core.management.base import BaseCommand
from django.db import models
from django.utils import timezone
from apps.orders.models import OrderCarrier
from apps.invoices.models import PurchaseInvoice


class Command(BaseCommand):
    help = 'Sinchronizuoja OrderCarrier.invoice_received flag\'us pagal PurchaseInvoice'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Rodyti ką būtų atnaujinta, bet neįrašyti pakeitimų',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN režimas: pakeitimai nebus įrašyti'))
        
        updated_count = 0
        checked_count = 0
        
        # Rasti visus OrderCarrier su partner
        all_carriers = OrderCarrier.objects.select_related('order', 'partner').all()
        
        for carrier in all_carriers:
            checked_count += 1
            if not carrier.partner:
                continue
            
            # Patikrinti ar yra PurchaseInvoice su šiuo order ir partner
            has_purchase_invoice = PurchaseInvoice.objects.filter(
                partner=carrier.partner
            ).filter(
                models.Q(related_order=carrier.order) | models.Q(related_orders__id=carrier.order.id)
            ).exists()
            
            # Atnaujinti invoice_received flag'ą
            if has_purchase_invoice and not carrier.invoice_received:
                # Rasti pirmą PurchaseInvoice, kad gauti received_date arba issue_date
                purchase_invoice = PurchaseInvoice.objects.filter(
                    partner=carrier.partner
                ).filter(
                    models.Q(related_order=carrier.order) | models.Q(related_orders__id=carrier.order.id)
                ).first()
                
                if purchase_invoice:
                    if not dry_run:
                        carrier.invoice_received = True
                        carrier.invoice_received_date = purchase_invoice.received_date or purchase_invoice.issue_date
                        carrier.save(update_fields=['invoice_received', 'invoice_received_date', 'updated_at'])
                    updated_count += 1
                    self.stdout.write(
                        f"Atnaujinta: OrderCarrier #{carrier.id} (Order: {carrier.order.order_number or carrier.order.id}, "
                        f"Partner: {carrier.partner.name})"
                    )
            elif not has_purchase_invoice and carrier.invoice_received:
                # Jei nėra PurchaseInvoice, bet OrderCarrier turi invoice_received=True,
                # palikti kaip yra (gali būti gauta per dokumentus)
                # Bet jei tikrai norime sinchronizuoti, galime nustatyti False
                # Šiuo metu paliekame kaip yra
                pass
        
        self.stdout.write(self.style.SUCCESS(
            f'\nPatikrinta: {checked_count} OrderCarrier\n'
            f'Atnaujinta: {updated_count} OrderCarrier'
        ))
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY-RUN: pakeitimai nebuvo įrašyti. Paleiskite be --dry-run kad įrašyti.'))

