"""
Cron job užduotys - vėlavimo sekimas
"""
from django.utils import timezone
from datetime import timedelta
from .models import SalesInvoice, PurchaseInvoice


def update_overdue_invoices():
    """
    Atnaujina vėlavimo dienas ir payment_status į 'overdue'.
    Turi būti vykdoma kasdien per cron job.
    """
    today = timezone.now().date()
    
    # Sales invoices
    sales_invoices = SalesInvoice.objects.filter(
        payment_status__in=['unpaid', 'partially_paid'],
        due_date__lt=today
    )
    
    for invoice in sales_invoices:
        overdue_days = (today - invoice.due_date).days
        invoice.overdue_days = overdue_days
        invoice.payment_status = 'overdue'
        invoice.save()
    
    # Purchase invoices
    purchase_invoices = PurchaseInvoice.objects.filter(
        payment_status__in=['unpaid', 'partially_paid'],
        due_date__lt=today
    )
    
    for invoice in purchase_invoices:
        overdue_days = (today - invoice.due_date).days
        invoice.overdue_days = overdue_days
        invoice.payment_status = 'overdue'
        invoice.save()
    
    return {
        'sales_invoices_updated': sales_invoices.count(),
        'purchase_invoices_updated': purchase_invoices.count()
    }

