from django.core.management.base import BaseCommand
from apps.invoices.models import SalesInvoice
from apps.orders.models import Order
from decimal import Decimal


class Command(BaseCommand):
    help = 'Perskaičiuoja sąskaitų amount_net ir amount_total pagal related_order.calculated_client_price_net'

    def handle(self, *args, **options):
        updated_count = 0
        invoices = SalesInvoice.objects.filter(related_order__isnull=False).select_related('related_order')
        
        for invoice in invoices:
            try:
                order = invoice.related_order
                if order:
                    # Perskaičiuoti amount_net pagal calculated_client_price_net
                    calculated_amount_net = order.calculated_client_price_net or order.client_price_net
                    if calculated_amount_net:
                        old_amount_net = invoice.amount_net
                        old_amount_total = invoice.amount_total
                        
                        invoice.amount_net = calculated_amount_net
                        # Perskaičiuoti amount_total
                        invoice.amount_total = calculated_amount_net * (1 + invoice.vat_rate / 100)
                        invoice.save(update_fields=['amount_net', 'amount_total'])
                        
                        updated_count += 1
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'Sąskaita {invoice.invoice_number}: '
                                f'amount_net {old_amount_net} -> {invoice.amount_net}, '
                                f'amount_total {old_amount_total} -> {invoice.amount_total}'
                            )
                        )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'Klaida sąskaitoje {invoice.invoice_number}: {e}')
                )
        
        self.stdout.write(self.style.SUCCESS(f'\nIš viso atnaujinta: {updated_count} sąskaitų'))


