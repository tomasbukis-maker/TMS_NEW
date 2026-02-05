"""
Tikrina ar OrderCarrier su invoice_received=True turi atitinkamą PurchaseInvoice.
Jei nėra – išveda sąrašą ir gali ištaisyti (--fix).
"""
from django.core.management.base import BaseCommand
from django.db.models import Q
from apps.orders.models import OrderCarrier
from apps.invoices.models import PurchaseInvoice


class Command(BaseCommand):
    help = 'Tikrina neteisingas „gauti dokumentai“ varneles (invoice_received=True be PurchaseInvoice)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Ištaisyti: nustatyti invoice_received=False ten, kur nėra PurchaseInvoice',
        )

    def handle(self, *args, **options):
        do_fix = options['fix']
        qs = OrderCarrier.objects.filter(invoice_received=True).select_related('order', 'partner')
        bad = []
        for c in qs:
            has_invoice = PurchaseInvoice.objects.filter(
                partner=c.partner
            ).filter(
                Q(related_order=c.order) | Q(related_orders__id=c.order_id)
            ).exists()
            if not has_invoice:
                bad.append(c)

        if not bad:
            self.stdout.write(self.style.SUCCESS('Neteisingų varnelių nėra. Visi OrderCarrier su invoice_received=True turi atitinkamą PurchaseInvoice.'))
            return

        self.stdout.write(self.style.WARNING(
            f'Neteisingos varnelės: {len(bad)} OrderCarrier turi invoice_received=True, bet nėra PurchaseInvoice su tuo order+partner.'
        ))
        for c in bad:
            order_num = c.order.order_number if c.order else f'#{c.order_id}'
            partner_name = c.partner.name if c.partner else f'partner_id={c.partner_id}'
            self.stdout.write(f'  OrderCarrier id={c.id}  order={order_num}  partner={partner_name}  (order_id={c.order_id}, partner_id={c.partner_id})')

        if do_fix:
            updated = 0
            for c in bad:
                c.invoice_received = False
                c.invoice_received_date = None
                c.save(update_fields=['invoice_received', 'invoice_received_date', 'updated_at'])
                updated += 1
            self.stdout.write(self.style.SUCCESS(f'Ištaisyta: {updated} įrašų.'))
        else:
            self.stdout.write('Paleisk su --fix, kad nustatytum invoice_received=False šiems įrašams.')
