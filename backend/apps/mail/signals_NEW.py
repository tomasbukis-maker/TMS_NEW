from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.orders.models import Order, OrderCarrier

from .mail_matching_helper_NEW import (
    update_matches_for_order,
    update_matches_for_expedition,
)


@receiver(post_save, sender=Order)
def handle_order_post_save(sender, instance: Order, created: bool, update_fields=None, **kwargs):
    update_fields = update_fields or set()
    should_schedule = created or 'order_number' in update_fields
    if not should_schedule:
        return
    if not instance.order_number:
        return

    transaction.on_commit(lambda: update_matches_for_order(instance.id))


@receiver(post_save, sender=OrderCarrier)
def handle_order_carrier_post_save(sender, instance: OrderCarrier, created: bool, update_fields=None, **kwargs):
    update_fields = update_fields or set()
    should_schedule = created or 'expedition_number' in update_fields
    if not should_schedule:
        return
    if not instance.expedition_number:
        return

    transaction.on_commit(lambda: update_matches_for_expedition(instance.id))


