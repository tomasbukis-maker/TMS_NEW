"""
Invoices modulio testinių duomenų generatorių sistema.
Generuoja testines sąskaitas naudojant esamus duomenis ir užsakymus.
"""

from django.utils import timezone
from django.db import transaction
from datetime import timedelta, date
from decimal import Decimal
import random
import logging

from apps.invoices.models import SalesInvoice, PurchaseInvoice
from apps.invoices.utils import generate_invoice_number
from apps.partners.models import Partner
from apps.orders.models import Order

logger = logging.getLogger(__name__)

# Testinių duomenų identifikatorius
TEST_DATA_PREFIX = '[TEST_DATA]'


def generate_invoices_test_data(order_ids: list = None, count_per_order: int = 2):
    """
    Generuoja testines sąskaitas naudojant esamus užsakymus ir partnerius.
    
    Args:
        order_ids: Užsakymų ID sąrašas (jei None - naudoja visus)
        count_per_order: Sąskaitų skaičius per užsakymą
        
    Returns:
        dict: Statistika sugeneruotų sąskaitų
    """
    if order_ids is None:
        # Naudoti visus užsakymus (bet tik testinius)
        test_orders = Order.objects.filter(notes__startswith=TEST_DATA_PREFIX)
        order_ids = list(test_orders.values_list('id', flat=True))
    
    if not order_ids:
        logger.warning("Nėra užsakymų testinių sąskaitų generavimui")
        return {'created': 0, 'invoice_ids': [], 'errors': []}
    
    # Patikrinti ar yra partnerių
    clients = list(Partner.objects.filter(is_client=True, status='active'))
    suppliers = list(Partner.objects.filter(is_supplier=True, status='active'))
    
    if not clients:
        raise ValueError("Nėra klientų! Pirmiausia sukurkite klientus.")
    
    if not suppliers:
        raise ValueError("Nėra tiekėjų! Pirmiausia sukurkite tiekėjus.")
    
    invoice_ids = []
    errors = []
    created_count = 0
    
    invoice_types = ['pre_invoice', 'final', 'proforma']
    payment_statuses = ['unpaid', 'paid', 'overdue', 'partially_paid']
    
    # Kiekvieną užsakymą apdorojame atskiroje transakcijoje, kad išvengtume dublikatų
    # kai generate_invoice_number naudoja select_for_update()
    for order_id in order_ids:
        # Kiekvienas užsakymas atskiroje transakcijoje
        try:
            with transaction.atomic():
                order = Order.objects.get(id=order_id)
                client = order.client
                
                # Generuoti 1-3 pardavimo sąskaitas per užsakymą
                num_invoices = random.randint(1, min(count_per_order, 3))
                
                for inv_idx in range(num_invoices):
                    # Datos
                    base_date = order.order_date.date() if order.order_date else timezone.now().date()
                    issue_date = base_date + timedelta(days=random.randint(0, 30))
                    due_date = issue_date + timedelta(days=random.randint(7, 60))
                    
                    # Mokėjimo būsena
                    payment_status = random.choice(payment_statuses)
                    
                    # Jei apmokėta - nustatyti mokėjimo datą
                    payment_date = None
                    if payment_status == 'paid':
                        payment_date = issue_date + timedelta(days=random.randint(1, (due_date - issue_date).days))
                    elif payment_status == 'overdue':
                        # Vėluojanti - mokėjimo data praėjusi
                        payment_date = None
                        due_date = timezone.now().date() - timedelta(days=random.randint(1, 90))
                    
                    # Kainos
                    amount_net = order.client_price_net or order.price_net or Decimal('1000.00')
                    vat_rate = order.vat_rate or Decimal('21.00')
                    amount_total = amount_net * (1 + vat_rate / 100)
                    
                    # Sukurti pardavimo sąskaitą
                    from apps.settings.models import InvoiceSettings
                    invoice_settings = InvoiceSettings.load()
                    prefix = invoice_settings.invoice_prefix_sales or 'LOG'
                    width = invoice_settings.invoice_number_width or 7
                    invoice_number = generate_invoice_number(prefix=prefix, width=width)
                    
                    sales_invoice = SalesInvoice.objects.create(
                        invoice_number=invoice_number,
                        invoice_type=random.choice(invoice_types),
                        partner=client,
                        related_order=order,
                        payment_status=payment_status,
                        amount_net=amount_net,
                        vat_rate=vat_rate,
                        vat_rate_article='PVM tarifo straipsnis',
                        amount_total=amount_total,
                        issue_date=issue_date,
                        due_date=due_date,
                        payment_date=payment_date,
                        overdue_days=max(0, (timezone.now().date() - due_date).days) if payment_status == 'overdue' else 0,
                        notes=f"{TEST_DATA_PREFIX} Testinė pardavimo sąskaita #{inv_idx+1}",
                        display_options={
                            'show_order_type': True,
                            'show_cargo_info': True,
                            'show_carriers': True,
                            'show_prices': True,
                        }
                    )
                    
                    invoice_ids.append(sales_invoice.id)
                    created_count += 1
                
                # Generuoti 0-2 pirkimo sąskaitas per užsakymą (jei yra vežėjai)
                if order.carriers.exists():
                    num_purchase = random.randint(0, 2)
                    
                    for purch_idx in range(num_purchase):
                        # Pasirinkti atsitiktinį vežėją
                        carrier = random.choice(list(order.carriers.all()))
                        supplier = carrier.partner
                        
                        # Datos
                        base_date = order.order_date.date() if order.order_date else timezone.now().date()
                        issue_date = base_date + timedelta(days=random.randint(-30, 30))
                        due_date = issue_date + timedelta(days=random.randint(7, 60))
                        
                        # Mokėjimo būsena
                        payment_status = random.choice(payment_statuses)
                        payment_date = None
                        if payment_status == 'paid':
                            payment_date = issue_date + timedelta(days=random.randint(1, (due_date - issue_date).days))
                        elif payment_status == 'overdue':
                            due_date = timezone.now().date() - timedelta(days=random.randint(1, 90))
                        
                        # Kainos
                        amount_net = carrier.price_net or Decimal('500.00')
                        vat_rate = Decimal('21.00')
                        amount_total = amount_net * (1 + vat_rate / 100)
                        
                        # Sukurti pirkimo sąskaitą
                        from apps.settings.models import InvoiceSettings
                        invoice_settings = InvoiceSettings.load()
                        # invoice_prefix_purchase laukas buvo pašalintas, naudojame default
                        prefix = 'INV'  # Default pirkimo sąskaitų prefiksas
                        width = invoice_settings.invoice_number_width or 7
                        invoice_number = generate_invoice_number(prefix=prefix, width=width)
                        
                        purchase_invoice = PurchaseInvoice.objects.create(
                            invoice_number=invoice_number,
                            received_invoice_number=f"INV-{random.randint(1000, 9999)}",
                            partner=supplier,
                            related_order=order,
                            payment_status=payment_status,
                            amount_net=amount_net,
                            vat_rate=vat_rate,
                            amount_total=amount_total,
                            issue_date=issue_date,
                            due_date=due_date,
                            payment_date=payment_date,
                            overdue_days=max(0, (timezone.now().date() - due_date).days) if payment_status == 'overdue' else 0,
                            notes=f"{TEST_DATA_PREFIX} Testinė pirkimo sąskaita #{purch_idx+1}",
                        )
                        
                        invoice_ids.append(purchase_invoice.id)
                        created_count += 1
        except Order.DoesNotExist:
            error_msg = f"Užsakymas #{order_id} nerastas"
            logger.warning(error_msg)
            errors.append(error_msg)
            continue
        except Exception as e:
            error_msg = f"Klaida kuriant sąskaitas užsakymui #{order_id}: {str(e)}"
            logger.error(error_msg, exc_info=True)
            errors.append(error_msg)
            # Jei klaida, atšaukti tik šios užsakymo transakciją
            continue
    
    return {
        'created': created_count,
        'invoice_ids': invoice_ids,
        'errors': errors
    }


def delete_invoices_test_data():
    """
    Ištrina visas testines sąskaitas (su TEST_DATA_PREFIX notes).
    
    Returns:
        dict: Statistika ištrintų sąskaitų
    """
    deleted_count = 0
    errors = []
    
    try:
        # Rasti visas testines sąskaitas
        test_sales = SalesInvoice.objects.filter(notes__startswith=TEST_DATA_PREFIX)
        test_purchase = PurchaseInvoice.objects.filter(notes__startswith=TEST_DATA_PREFIX)
        
        with transaction.atomic():
            sales_deleted = test_sales.delete()[0]
            purchase_deleted = test_purchase.delete()[0]
            deleted_count = sales_deleted + purchase_deleted
        
        logger.info(f"Ištrinta {deleted_count} testinių sąskaitų ({sales_deleted} pardavimo, {purchase_deleted} pirkimo)")
        
    except Exception as e:
        error_msg = f"Klaida trinant testines sąskaitas: {str(e)}"
        logger.error(error_msg, exc_info=True)
        errors.append(error_msg)
    
    return {
        'deleted': deleted_count,
        'errors': errors
    }





