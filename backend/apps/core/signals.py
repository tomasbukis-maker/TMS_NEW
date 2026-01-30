"""
Django signals for automatic database synchronization.
Automatically syncs data to replica database when models are saved/deleted.
"""

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from apps.core.db_sync import sync_to_replica
import logging

logger = logging.getLogger(__name__)

# Import visi modeliai, kuriuos reikia sinchronizuoti
from apps.orders.models import Order, OrderCarrier, CargoItem
from apps.invoices.models import SalesInvoice, PurchaseInvoice, InvoiceNumberSequence
from apps.partners.models import Partner, Contact
from apps.settings.models import (
    CompanyInfo, UserSettings, InvoiceSettings, OrderSettings,
    PVMRate
)
from django.contrib.auth import get_user_model

User = get_user_model()

# Visi modeliai, kuriuos reikia sinchronizuoti
SYNC_MODELS = [
    # Orders
    Order, OrderCarrier, CargoItem,
    # Invoices
    SalesInvoice, PurchaseInvoice,
    # Partners
    Partner, Contact,
    # Settings
    CompanyInfo, UserSettings, InvoiceSettings, OrderSettings,
    PVMRate, InvoiceNumberSequence,
    # Auth
    User,
]


def register_sync_signals():
    """Registruoti sinchronizacijos signals visiems modeliams"""
    for model in SYNC_MODELS:
        post_save.connect(
            sync_model_save,
            sender=model,
            weak=False
        )
        post_delete.connect(
            sync_model_delete,
            sender=model,
            weak=False
        )


@receiver(post_save)
def sync_model_save(sender, instance, created, **kwargs):
    """Sinchronizuoti po save()"""
    # Patikrinti, ar tai modelis, kurį reikia sinchronizuoti
    if sender not in SYNC_MODELS:
        return
    
    # Lokaliame development'e (DEBUG=True) VISIŠKAI išjungti replica sync
    from django.conf import settings
    if settings.DEBUG:
        # Lokaliame development'e ne sync'uojame į replica - praleisti visiškai
        return
    
    # Production - visada bandyti sync
    try:
        sync_to_replica(instance)
    except Exception as e:
        logger.error(f"Error syncing {sender.__name__} (pk={instance.pk}): {str(e)}", exc_info=True)


@receiver(post_delete)
def sync_model_delete(sender, instance, **kwargs):
    """Sinchronizuoti po delete() - ištrinti iš replica DB"""
    if sender not in SYNC_MODELS:
        return
    
    # Lokaliame development'e (DEBUG=True) VISIŠKAI išjungti replica sync
    from django.conf import settings
    if settings.DEBUG:
        # Lokaliame development'e ne sync'uojame į replica - praleisti visiškai
        return
    
    # Production - visada bandyti sync
    model_class = instance.__class__
    try:
        model_class.objects.using('replica').filter(pk=instance.pk).delete()
        logger.info(f"Deleted {model_class.__name__} (pk={instance.pk}) from replica")
    except Exception as e:
        logger.error(f"Error deleting from replica: {str(e)}", exc_info=True)

