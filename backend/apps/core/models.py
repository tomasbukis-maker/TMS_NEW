# Core models
from django.db import models
from django.utils.translation import gettext_lazy as _
from django.contrib.contenttypes.models import ContentType
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.auth import get_user_model

User = get_user_model()


class ActivityLog(models.Model):
    """Veiksmų istorijos modelis - registruoja visus svarbius veiksmus sistemoje"""
    
    class ActionType(models.TextChoices):
        # Užsakymai
        ORDER_CREATED = 'order_created', _('Užsakymas sukurtas')
        ORDER_UPDATED = 'order_updated', _('Užsakymas atnaujintas')
        ORDER_DELETED = 'order_deleted', _('Užsakymas ištrintas')
        ORDER_STATUS_CHANGED = 'order_status_changed', _('Užsakymo būsena pakeista')
        ORDER_FIELD_UPDATED = 'order_field_updated', _('Užsakymo laukas pakeistas')

        # Sąskaitos
        SALES_INVOICE_CREATED = 'sales_invoice_created', _('Pardavimo sąskaita sukurta')
        SALES_INVOICE_UPDATED = 'sales_invoice_updated', _('Pardavimo sąskaita atnaujinta')
        SALES_INVOICE_DELETED = 'sales_invoice_deleted', _('Pardavimo sąskaita ištrinta')
        PURCHASE_INVOICE_CREATED = 'purchase_invoice_created', _('Pirkimo sąskaita sukurta')
        PURCHASE_INVOICE_UPDATED = 'purchase_invoice_updated', _('Pirkimo sąskaita atnaujinta')
        PURCHASE_INVOICE_DELETED = 'purchase_invoice_deleted', _('Pirkimo sąskaita ištrinta')
        
        # Mokėjimai
        PAYMENT_ADDED = 'payment_added', _('Mokėjimas pridėtas')
        PAYMENT_DELETED = 'payment_deleted', _('Mokėjimas ištrintas')
        PAYMENT_STATUS_CHANGED = 'payment_status_changed', _('Mokėjimo būsena pakeista')
        
        # Partneriai
        PARTNER_CREATED = 'partner_created', _('Partneris sukurtas')
        PARTNER_UPDATED = 'partner_updated', _('Partneris atnaujintas')
        PARTNER_DELETED = 'partner_deleted', _('Partneris ištrintas')
        
        # Statusų pakeitimai
        INVOICE_STATUS_CHANGED = 'invoice_status_changed', _('Sąskaitos būsena pakeista')
        CARRIER_STATUS_CHANGED = 'carrier_status_changed', _('Vežėjo būsena pakeista')
        COST_STATUS_CHANGED = 'cost_status_changed', _('Išlaidų būsena pakeista')
        
        # Kiti
        SETTINGS_UPDATED = 'settings_updated', _('Nustatymai atnaujinti')
        FILE_UPLOADED = 'file_uploaded', _('Failas įkeltas')
        FILE_DELETED = 'file_deleted', _('Failas ištrintas')
        EMAIL_SENT = 'email_sent', _('El. laiškas išsiųstas')
        CUSTOM = 'custom', _('Kitas veiksmas')
    
    # Veiksmo informacija
    action_type = models.CharField(
        max_length=50,
        choices=ActionType.choices,
        verbose_name=_('Veiksmo tipas')
    )
    description = models.TextField(
        verbose_name=_('Aprašymas'),
        help_text=_('Detalus veiksmo aprašymas')
    )
    
    # Susijęs objektas (GenericForeignKey)
    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        verbose_name=_('Susijęs objektas (tipas)')
    )
    object_id = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name=_('Susijęs objektas (ID)')
    )
    content_object = GenericForeignKey('content_type', 'object_id')
    
    # Papildoma informacija (JSON)
    metadata = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Papildoma informacija'),
        help_text=_('Papildomi duomenys JSON formatu (pvz., senos/naujos reikšmės)')
    )
    
    # Vartotojas, kuris atliko veiksmą
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activity_logs',
        verbose_name=_('Vartotojas')
    )
    user_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('Vartotojo vardas'),
        help_text=_('Išsaugomas vartotojo vardas, jei vartotojas bus ištrintas')
    )
    
    # IP adresas ir user agent (audit trail)
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        verbose_name=_('IP adresas')
    )
    user_agent = models.TextField(
        blank=True,
        verbose_name=_('User Agent')
    )
    
    # Laiko žymės
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True,
        verbose_name=_('Sukurta')
    )
    
    class Meta:
        db_table = 'activity_logs'
        verbose_name = _('Veiksmų istorija')
        verbose_name_plural = _('Veiksmų istorija')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['action_type', '-created_at']),
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['user', '-created_at']),
        ]
    
    def __str__(self) -> str:
        return f"{self.get_action_type_display()} - {self.description[:50]}"


class StatusTransitionRule(models.Model):
    """Statusų perėjimų taisyklių modelis"""
    
    class EntityType(models.TextChoices):
        ORDER = 'order', _('Užsakymas')
        SALES_INVOICE = 'sales_invoice', _('Pardavimo sąskaita')
        PURCHASE_INVOICE = 'purchase_invoice', _('Pirkimo sąskaita')
        ORDER_CARRIER = 'order_carrier', _('Užsakymo vežėjas')
        ORDER_COST = 'order_cost', _('Užsakymo išlaida')
    
    entity_type = models.CharField(
        max_length=30,
        choices=EntityType.choices,
        verbose_name=_('Objekto tipas'),
        db_index=True
    )
    current_status = models.CharField(
        max_length=50,
        verbose_name=_('Dabartinis statusas'),
        db_index=True
    )
    allowed_next_statuses = models.JSONField(
        default=list,
        verbose_name=_('Leistini kiti statusai'),
        help_text=_('JSON masyvas su leistinų statusų reikšmėmis')
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name=_('Aktyvus'),
        help_text=_('Jei neaktyvus, taisyklė nebus naudojama')
    )
    order = models.IntegerField(
        default=0,
        verbose_name=_('Eiliškumas'),
        help_text=_('Taisyklių tvarka (mažesnis skaičius = aukščiau)')
    )
    description = models.TextField(
        blank=True,
        verbose_name=_('Aprašymas'),
        help_text=_('Papildomas taisyklės aprašymas')
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_('Sukurta')
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_('Atnaujinta')
    )
    
    class Meta:
        db_table = 'status_transition_rules'
        verbose_name = _('Statusų perėjimo taisyklė')
        verbose_name_plural = _('Statusų perėjimo taisyklės')
        ordering = ['entity_type', 'order', 'current_status']
        unique_together = [['entity_type', 'current_status']]
        indexes = [
            models.Index(fields=['entity_type', 'current_status']),
            models.Index(fields=['is_active', 'entity_type']),
        ]
    
    def __str__(self) -> str:
        return f"{self.get_entity_type_display()} - {self.current_status} → {', '.join(self.allowed_next_statuses)}"
