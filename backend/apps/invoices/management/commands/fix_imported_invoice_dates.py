"""
Management command to fix invoice dates for imported invoices.
If invoice issue_date equals import date (today) or is missing,
it updates the date based on related order dates.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime, timedelta
from apps.invoices.models import SalesInvoice, PurchaseInvoice
from apps.orders.models import Order


class Command(BaseCommand):
    help = 'Pataiso importuotų sąskaitų datas, naudojant susijusių užsakymų datas'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Rodo, ką būtų pakeista, bet nekeičia duomenų',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        today = timezone.now().date()
        
        # Rasti visas sąskaitas, kurios gali būti importuotos su neteisingomis datomis
        # (issue_date yra šiandienos data arba labai artima importo datai)
        # Patikrinti paskutinius 30 dienų, nes importas galėjo būti atliktas bet kada
        import_date_threshold = today - timedelta(days=30)
        
        self.stdout.write(f'Patikrinama sąskaitos su issue_date >= {import_date_threshold}...')
        
        # Sales Invoices
        sales_invoices = SalesInvoice.objects.filter(
            issue_date__gte=import_date_threshold,
            notes__icontains='Importuota'
        ).select_related('related_order')
        
        sales_fixed = 0
        for invoice in sales_invoices:
            new_date = None
            
            # Jei yra susijęs užsakymas, naudoti jo datą
            if invoice.related_order:
                # Pirmiausia bandyti loading_date arba unloading_date
                if invoice.related_order.loading_date:
                    new_date = invoice.related_order.loading_date.date()
                elif invoice.related_order.unloading_date:
                    new_date = invoice.related_order.unloading_date.date()
                elif invoice.related_order.created_at:
                    new_date = invoice.related_order.created_at.date()
            
            if new_date and new_date != invoice.issue_date:
                if dry_run:
                    self.stdout.write(
                        f'[DRY-RUN] SalesInvoice {invoice.invoice_number}: '
                        f'{invoice.issue_date} -> {new_date}'
                    )
                else:
                    # Atnaujinti due_date proporcingai
                    old_due = invoice.due_date
                    old_issue = invoice.issue_date
                    days_diff = (old_due - old_issue).days if old_due and old_issue else 30
                    
                    invoice.issue_date = new_date
                    invoice.due_date = new_date + timedelta(days=days_diff)
                    invoice.save()
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Pataisyta SalesInvoice {invoice.invoice_number}: '
                            f'{old_issue} -> {new_date}'
                        )
                    )
                sales_fixed += 1
        
        # Purchase Invoices
        purchase_invoices = PurchaseInvoice.objects.filter(
            issue_date__gte=import_date_threshold,
            notes__icontains='Importuota'
        ).prefetch_related('related_orders')
        
        purchase_fixed = 0
        for invoice in purchase_invoices:
            new_date = None
            
            # Jei yra susijęs užsakymas, naudoti jo datą
            related_orders = invoice.related_orders.all()
            if related_orders.exists():
                # Paimti pirmą užsakymą
                order = related_orders.first()
                # Pirmiausia bandyti unloading_date arba loading_date
                if order.unloading_date:
                    new_date = order.unloading_date.date()
                elif order.loading_date:
                    new_date = order.loading_date.date()
                elif order.created_at:
                    new_date = order.created_at.date()
            
            if new_date and new_date != invoice.issue_date:
                if dry_run:
                    self.stdout.write(
                        f'[DRY-RUN] PurchaseInvoice {invoice.received_invoice_number or invoice.invoice_number}: '
                        f'{invoice.issue_date} -> {new_date}'
                    )
                else:
                    # Atnaujinti due_date proporcingai
                    old_due = invoice.due_date
                    old_issue = invoice.issue_date
                    days_diff = (old_due - old_issue).days if old_due and old_issue else 30
                    
                    invoice.issue_date = new_date
                    invoice.received_date = new_date
                    invoice.due_date = new_date + timedelta(days=days_diff)
                    invoice.save()
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Pataisyta PurchaseInvoice {invoice.received_invoice_number or invoice.invoice_number}: '
                            f'{invoice.issue_date} -> {new_date}'
                        )
                    )
                purchase_fixed += 1
        
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f'\n[DRY-RUN] Rastos {sales_fixed} pardavimo sąskaitos ir {purchase_fixed} pirkimo sąskaitos, '
                    f'kurių datos būtų pataisytos.'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'\nPataisyta: {sales_fixed} pardavimo sąskaitų ir {purchase_fixed} pirkimo sąskaitų.'
                )
            )

