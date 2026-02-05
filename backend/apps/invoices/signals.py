"""
Django signal'ai sąskaitų moduliui.
Automatiškai atnaujina client_invoice_issued lauką užsakymuose.
Sinchronizuoja PurchaseInvoice payment_status su OrderCarrier.
"""
import logging
from django.db.models.signals import post_save, post_delete, pre_delete
from django.db import models
from django.dispatch import receiver
from .models import SalesInvoice, SalesInvoiceOrder, PurchaseInvoice
from apps.orders.models import Order, OrderCarrier

logger = logging.getLogger(__name__)


def _sync_order_partner_carrier_status(order_id, partner_id):
    """
    Apskaičiuoti apmokėjimo būseną iš visų PurchaseInvoice šiam (order_id, partner_id)
    ir atnaujinti OrderCarrier. Naudojama po save ir po delete.
    """
    all_invoices = PurchaseInvoice.objects.filter(
        partner_id=partner_id
    ).filter(
        models.Q(related_order_id=order_id) | models.Q(related_orders__id=order_id)
    ).distinct()
    total = all_invoices.count()
    if total == 0:
        OrderCarrier.objects.filter(
            order_id=order_id,
            partner_id=partner_id
        ).update(payment_status='not_paid', payment_date=None)
        return
    paid_count = all_invoices.filter(payment_status='paid').count()
    partially_count = all_invoices.filter(payment_status='partially_paid').count()
    if paid_count == total:
        carrier_status = 'paid'
        last_paid = (
            all_invoices.filter(payment_status='paid')
            .order_by('-payment_date')
            .values_list('payment_date', flat=True)
            .first()
        )
        carrier_payment_date = last_paid
    elif paid_count > 0 or partially_count > 0:
        carrier_status = 'partially_paid'
        last_paid = (
            all_invoices.filter(payment_status='paid')
            .order_by('-payment_date')
            .values_list('payment_date', flat=True)
            .first()
        )
        carrier_payment_date = last_paid
    else:
        carrier_status = 'not_paid'
        carrier_payment_date = None
    OrderCarrier.objects.filter(
        order_id=order_id,
        partner_id=partner_id
    ).update(
        payment_status=carrier_status,
        payment_date=carrier_payment_date
    )


def _sync_purchase_invoice_to_carriers(purchase_invoice):
    """
    Sinchronizuoti pirkimo sąskaitos payment_status su OrderCarrier.
    Jei (order, partner) turi kelias sąskaitas – naudoti suvestinę.
    """
    if not purchase_invoice.partner_id:
        return
    orders_to_check = []
    if purchase_invoice.related_order_id:
        orders_to_check.append(purchase_invoice.related_order_id)
    if hasattr(purchase_invoice, 'related_orders'):
        orders_to_check.extend(
            purchase_invoice.related_orders.values_list('id', flat=True)
        )
    for order_id in set(orders_to_check):
        try:
            _sync_order_partner_carrier_status(order_id, purchase_invoice.partner_id)
        except Exception as e:
            logger.warning(
                "Klaida sinchronizuojant PurchaseInvoice -> OrderCarrier order_id=%s: %s",
                order_id, e, exc_info=True
            )


def update_order_invoice_issued_flag(order):
    """
    Atnaujina client_invoice_issued lauką užsakymui.
    Tikrina ar užsakymas turi bent vieną sąskaitą.
    """
    try:
        from apps.invoices.models import SalesInvoice, SalesInvoiceOrder
        
        # Tikrinti ar yra sąskaitų - VISADA tikrinti DB tiesiogiai
        has_invoices = (
            SalesInvoice.objects.filter(related_order=order).exists() or
            SalesInvoiceOrder.objects.filter(order=order).exists()
        )
        
        # Atnaujinti lauką tik jei reikšmė skiriasi
        if order.client_invoice_issued != has_invoices:
            order.client_invoice_issued = has_invoices
            order.save(update_fields=['client_invoice_issued'])
            logger.debug(f"Atnaujintas client_invoice_issued={has_invoices} užsakymui {order.id}")
    except Exception as e:
        logger.error(f"Klaida atnaujinant client_invoice_issued užsakymui {order.id}: {e}", exc_info=True)


@receiver(post_save, sender=SalesInvoice)
def sales_invoice_saved(sender, instance, created, **kwargs):
    """
    Kai SalesInvoice yra sukurtas arba atnaujintas, atnaujinti client_invoice_issued.
    """
    try:
        # Jei yra related_order (ForeignKey)
        if instance.related_order:
            update_order_invoice_issued_flag(instance.related_order)
        
        # Jei yra related_orders (ManyToMany) - atnaujinti visus
        if hasattr(instance, 'related_orders'):
            for order in instance.related_orders.all():
                update_order_invoice_issued_flag(order)
    except Exception as e:
        logger.error(f"Klaida signal'e sales_invoice_saved: {e}", exc_info=True)


# Laikinas saugojimas order_id prieš trinant (naudojamas per pre_delete/post_delete)
_invoice_orders_cache = {}


@receiver(post_delete, sender=SalesInvoice)
def sales_invoice_deleted(sender, instance, **kwargs):
    """
    Kai SalesInvoice yra ištrintas, atnaujinti client_invoice_issued.
    """
    try:
        # Gauti išsaugotus order_id iš pre_delete signal'o
        invoice_id = instance.id if hasattr(instance, 'id') and instance.id else None
        related_order_ids = _invoice_orders_cache.pop(invoice_id, set())
        
        # Jei nėra išsaugotų ID, bandyti gauti iš related_order (jei dar egzistuoja)
        if not related_order_ids and hasattr(instance, 'related_order_id') and instance.related_order_id:
            related_order_ids.add(instance.related_order_id)
        
        # Atnaujinti visus susijusius užsakymus
        for order_id in related_order_ids:
            try:
                order = Order.objects.get(id=order_id)
                update_order_invoice_issued_flag(order)
            except Order.DoesNotExist:
                pass
            except Exception as e:
                logger.warning(f"Klaida atnaujinant užsakymą {order_id}: {e}")
    except Exception as e:
        logger.error(f"Klaida signal'e sales_invoice_deleted: {e}", exc_info=True)


@receiver(pre_delete, sender=SalesInvoice)
def sales_invoice_pre_delete(sender, instance, **kwargs):
    """
    Prieš trinant SalesInvoice, išsaugoti susijusius užsakymus.
    """
    try:
        # Išsaugoti susijusius užsakymus prieš trinimą
        related_order_ids = set()
        
        # Gauti užsakymus per ForeignKey
        if instance.related_order_id:
            related_order_ids.add(instance.related_order_id)
        
        # Gauti užsakymus per ManyToMany (per SalesInvoiceOrder)
        from apps.invoices.models import SalesInvoiceOrder
        m2m_order_ids = SalesInvoiceOrder.objects.filter(invoice=instance).values_list('order_id', flat=True)
        related_order_ids.update(m2m_order_ids)
        
        # Išsaugoti order_id sąrašą laikiniame cache'e
        if instance.id:
            _invoice_orders_cache[instance.id] = related_order_ids
    except Exception as e:
        logger.error(f"Klaida signal'e sales_invoice_pre_delete: {e}", exc_info=True)


@receiver(post_save, sender=SalesInvoiceOrder)
def sales_invoice_order_saved(sender, instance, created, **kwargs):
    """
    Kai SalesInvoiceOrder yra sukurtas arba atnaujintas, atnaujinti client_invoice_issued.
    """
    try:
        if instance.order:
            update_order_invoice_issued_flag(instance.order)
    except Exception as e:
        logger.error(f"Klaida signal'e sales_invoice_order_saved: {e}", exc_info=True)


@receiver(post_delete, sender=SalesInvoiceOrder)
def sales_invoice_order_deleted(sender, instance, **kwargs):
    """
    Kai SalesInvoiceOrder yra ištrintas, atnaujinti client_invoice_issued.
    """
    try:
        # Išsaugoti order_id prieš trinimą
        order_id = instance.order_id if hasattr(instance, 'order_id') else (instance.order.id if instance.order else None)
        
        if order_id:
            try:
                order = Order.objects.get(id=order_id)
                update_order_invoice_issued_flag(order)
            except Order.DoesNotExist:
                pass
            except Exception as e:
                logger.warning(f"Klaida atnaujinant užsakymą {order_id}: {e}")
    except Exception as e:
        logger.error(f"Klaida signal'e sales_invoice_order_deleted: {e}", exc_info=True)


# Laikinas saugojimas (order_ids, partner_id) prieš trinant PurchaseInvoice
_purchase_invoice_carrier_pairs_cache = {}


@receiver(pre_delete, sender=PurchaseInvoice)
def purchase_invoice_pre_delete(sender, instance, **kwargs):
    """Prieš trinant PurchaseInvoice, išsaugoti (order_ids, partner_id) sinchronizacijai."""
    try:
        if not instance.partner_id or not instance.id:
            return
        order_ids = set()
        if instance.related_order_id:
            order_ids.add(instance.related_order_id)
        if hasattr(instance, 'related_orders'):
            order_ids.update(instance.related_orders.values_list('id', flat=True))
        _purchase_invoice_carrier_pairs_cache[instance.id] = (list(order_ids), instance.partner_id)
    except Exception as e:
        logger.warning("Klaida purchase_invoice_pre_delete: %s", e)


@receiver(post_delete, sender=PurchaseInvoice)
def purchase_invoice_deleted(sender, instance, **kwargs):
    """Po PurchaseInvoice ištrynimo atnaujinti OrderCarrier pagal likusias sąskaitas."""
    try:
        pair = _purchase_invoice_carrier_pairs_cache.pop(instance.id if instance.id else None, None)
        if not pair:
            return
        order_ids, partner_id = pair
        for order_id in order_ids:
            try:
                _sync_order_partner_carrier_status(order_id, partner_id)
            except Exception as e:
                logger.warning("Klaida sinchronizuojant po PurchaseInvoice delete order_id=%s: %s", order_id, e)
    except Exception as e:
        logger.error("Klaida signal'e purchase_invoice_deleted: %s", e, exc_info=True)


@receiver(post_save, sender=PurchaseInvoice)
def purchase_invoice_saved(sender, instance, created, **kwargs):
    """
    Kai PurchaseInvoice yra sukurtas arba atnaujintas, sinchronizuoti payment_status
    su OrderCarrier, kad užsakymų sąraše būtų rodoma teisinga gautų sąskaitų apmokėjimo būsena.
    """
    try:
        _sync_purchase_invoice_to_carriers(instance)
    except Exception as e:
        logger.error("Klaida signal'e purchase_invoice_saved: %s", e, exc_info=True)
