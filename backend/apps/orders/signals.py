"""
Django signals for Order model automatic status updates
"""
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone
from datetime import timedelta
import logging

from .models import Order, OrderCarrier

logger = logging.getLogger(__name__)


def evaluate_condition(order, condition):
    """
    Įvertina vieną sąlygą užsakymui.
    Sąlygos formatas: {"type": "carrier_added", "params": {...}}
    """
    cond_type = condition.get('type')
    params = condition.get('params', {})

    # Vežėjo sąlygos
    if cond_type == 'carrier_added':
        return order.carriers.exists()

    elif cond_type == 'carrier_not_exists':
        return not order.carriers.exists()

    elif cond_type == 'carrier_in_list':
        carrier_ids = params.get('ids', [])
        if not carrier_ids:
            return False
        return order.carriers.filter(id__in=carrier_ids).exists()

    # Datos sąlygos
    elif cond_type == 'dates_between':
        if not order.loading_date or not order.unloading_date:
            return False
        today = timezone.now().date()
        loading_date = order.loading_date
        if hasattr(loading_date, 'date'):
            loading_date = loading_date.date()
        unloading_date = order.unloading_date
        if hasattr(unloading_date, 'date'):
            unloading_date = unloading_date.date()
        return loading_date <= today <= unloading_date

    elif cond_type == 'unloading_passed':
        if not order.unloading_date:
            return False
        today = timezone.now().date()
        unloading_date = order.unloading_date
        if hasattr(unloading_date, 'date'):
            unloading_date = unloading_date.date()
        days_after = params.get('days_after_unloading', 0)
        threshold_date = today - timedelta(days=days_after)
        return unloading_date < threshold_date

    # Santykinės datos sąlygos su šiandiena
    elif cond_type == 'loading_date_is_today':
        if not order.loading_date:
            return False
        today = timezone.now().date()
        loading_date = order.loading_date
        if hasattr(loading_date, 'date'):
            loading_date = loading_date.date()
        return loading_date == today

    elif cond_type == 'loading_date_passed':
        if not order.loading_date:
            return False
        today = timezone.now().date()
        loading_date = order.loading_date
        if hasattr(loading_date, 'date'):
            loading_date = loading_date.date()
        return loading_date < today

    elif cond_type == 'loading_date_upcoming':
        if not order.loading_date:
            return False
        today = timezone.now().date()
        loading_date = order.loading_date
        if hasattr(loading_date, 'date'):
            loading_date = loading_date.date()
        return loading_date > today

    elif cond_type == 'unloading_date_is_today':
        if not order.unloading_date:
            return False
        today = timezone.now().date()
        unloading_date = order.unloading_date
        if hasattr(unloading_date, 'date'):
            unloading_date = unloading_date.date()
        return unloading_date == today

    elif cond_type == 'unloading_date_passed':
        if not order.unloading_date:
            return False
        today = timezone.now().date()
        unloading_date = order.unloading_date
        if hasattr(unloading_date, 'date'):
            unloading_date = unloading_date.date()
        return unloading_date < today

    elif cond_type == 'unloading_date_upcoming':
        if not order.unloading_date:
            return False
        today = timezone.now().date()
        unloading_date = order.unloading_date
        if hasattr(unloading_date, 'date'):
            unloading_date = unloading_date.date()
        return unloading_date > today

    elif cond_type == 'days_since_created':
        days = params.get('days', 0)
        if not days:
            return False
        created_date = order.created_at.date()
        today = timezone.now().date()
        days_passed = (today - created_date).days
        return days_passed >= days

    elif cond_type == 'overdue_more_than_days':
        days = params.get('days', 0)
        if not days:
            return False
        # TODO: Implement overdue logic based on your business rules
        return False

    # Sąskaitų sąlygos
    elif cond_type == 'docs_received_and_invoice_sent':
        # Visi vežėjai turi gautus dokumentus
        all_carriers_have_docs = True
        carriers = order.carriers.all()
        if carriers.exists():
            for carrier in carriers:
                if not carrier.invoice_received:
                    all_carriers_have_docs = False
                    break
        else:
            all_carriers_have_docs = False

        # Klientas turi išrašytą sąskaitą
        client_has_invoice = order.client_invoice_issued
        return all_carriers_have_docs and client_has_invoice

    elif cond_type == 'invoice_issued':
        return order.client_invoice_issued

    elif cond_type == 'invoice_not_issued':
        return not order.client_invoice_issued

    elif cond_type == 'invoice_received':
        # TODO: Implement invoice received logic
        return False

    elif cond_type == 'invoice_not_received':
        # TODO: Implement invoice not received logic
        return False

    elif cond_type == 'invoice_paid':
        return order.client_payment_status == 'paid'

    elif cond_type == 'invoice_not_paid':
        return order.client_payment_status != 'paid'

    elif cond_type == 'client_paid':
        return order.client_payment_status == 'paid'

    elif cond_type == 'carriers_paid':
        carriers = order.carriers.all()
        if not carriers.exists():
            return False
        for carrier in carriers:
            if carrier.payment_status != 'paid':
                return False
        return True

    # Finansinės sąlygos
    elif cond_type == 'amount_greater_than':
        amount = params.get('amount', 0)
        if not amount:
            return False
        return order.total_amount >= amount

    elif cond_type == 'amount_less_than':
        amount = params.get('amount', 0)
        if not amount:
            return False
        return order.total_amount < amount

    elif cond_type == 'profit_margin_greater_than':
        margin = params.get('margin', 0)
        if not margin:
            return False
        # TODO: Implement profit margin calculation
        return False

    elif cond_type == 'profit_margin_less_than':
        margin = params.get('margin', 0)
        if not margin:
            return False
        # TODO: Implement profit margin calculation
        return False

    # Kategorijų sąlygos
    elif cond_type == 'client_in_list':
        client_ids = params.get('ids', [])
        if not client_ids:
            return False
        return order.client_id in client_ids

    elif cond_type == 'order_type':
        order_type = params.get('order_type')
        if not order_type:
            return False
        return order.order_type == order_type

    elif cond_type == 'order_priority':
        priority = params.get('priority')
        if not priority:
            return False
        return order.priority == priority

    elif cond_type == 'cargo_type':
        cargo_type = params.get('cargo_type')
        if not cargo_type:
            return False
        return order.cargo_type == cargo_type

    # Laiko sąlygos
    elif cond_type == 'day_of_week':
        day = params.get('day')
        if not day:
            return False
        today = timezone.now().weekday() + 1  # Monday = 1, Sunday = 7
        return str(today) == str(day)

    elif cond_type == 'business_hours':
        enabled = params.get('enabled', False)
        if not enabled:
            return False
        now = timezone.now()
        hour = now.hour
        return 9 <= hour <= 18 and now.weekday() < 5  # Monday-Friday, 9-18

    elif cond_type == 'weekend':
        enabled = params.get('enabled', False)
        if not enabled:
            return False
        now = timezone.now()
        return now.weekday() >= 5  # Saturday=5, Sunday=6

    # Kitos sąlygos
    elif cond_type == 'has_attachments':
        enabled = params.get('enabled', False)
        if not enabled:
            return False
        # TODO: Implement attachment check
        return False

    elif cond_type == 'has_notes':
        enabled = params.get('enabled', False)
        if not enabled:
            return False
        return bool(order.notes)

    elif cond_type == 'requires_special_equipment':
        enabled = params.get('enabled', False)
        if not enabled:
            return False
        return order.requires_special_equipment

    elif cond_type == 'international_transport':
        enabled = params.get('enabled', False)
        if not enabled:
            return False
        return order.international_transport

    return False


@receiver(pre_save, sender=Order)
def auto_update_order_status(sender, instance: Order, **kwargs):
    """
    Automatiškai keisti užsakymo statusą pagal dinamines taisykles.

    Naudoja tik OrderAutoStatusRule sistemą - visas hardcoded logikas pašalintas.
    """
    try:
        # Patikrinti ar tai rekursinis iškvietimas (kai signalas iškviečia save)
        if hasattr(instance, '_status_update_in_progress'):
            return
        instance._status_update_in_progress = True

        from apps.settings.models import OrderAutoStatusRule

        # Jei statusas yra "canceled", nieko nedaryti rankiniu būdu
        if instance.status == Order.OrderStatus.CANCELED:
            return

        # Patikrinti dinamines taisykles
        dynamic_rules = OrderAutoStatusRule.objects.filter(
            from_status=instance.status,
            enabled=True
        ).order_by('-priority')

        for rule in dynamic_rules:
            conditions = rule.conditions
            if not conditions:
                continue

            results = [evaluate_condition(instance, cond) for cond in conditions]

            if rule.logic_operator == 'AND':
                triggered = all(results) if results else False
            else:  # OR
                triggered = any(results) if results else False

            if triggered:
                old_status = instance.status
                instance.status = rule.to_status
                logger.info(f"Order {instance.id}: Dynamic rule triggered! {old_status} -> {instance.status} (logic: {rule.logic_operator})")
                # Neberašyti čia - statusas bus išsaugotas kartu su kitais laukais
                return  # Pritaikius taisyklę, išeiname (viena taisyklė per vieną save)

    except Exception as e:
        # Neleisti signal'ui sugadinti užsakymo išsaugojimo
        logger.error(f"Error in auto_update_order_status for order {instance.id}: {e}", exc_info=True)
    finally:
        # Išvalyti flag'ą
        if hasattr(instance, '_status_update_in_progress'):
            delattr(instance, '_status_update_in_progress')


@receiver(post_save, sender=OrderCarrier)
def carrier_changed_update_order_status(sender, instance, created, **kwargs):
    """
    Kai pridedamas arba keičiamas vežėjas, patikrinti ar reikia keisti užsakymo statusą.
    """
    try:
        # Išsaugoti užsakymą, kad būtų iškviestas pre_save signalas
        instance.order.save()
        logger.info(f"OrderCarrier {instance.id} changed, checking order {instance.order.id} status update")
    except Exception as e:
        logger.error(f"Error in carrier_changed_update_order_status: {e}", exc_info=True)
