from django.db import models
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator
from django.db.models.signals import post_save
from django.dispatch import receiver


class Contact(models.Model):
    """Kontaktinių asmenų modelis"""
    
    partner = models.ForeignKey(
        'Partner',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='contacts',
        verbose_name=_('Partneris')
    )
    first_name = models.CharField(max_length=100, blank=True, verbose_name=_('Vardas'))
    last_name = models.CharField(max_length=100, blank=True, verbose_name=_('Pavardė'))
    email = models.EmailField(blank=True, verbose_name=_('El. paštas'))
    phone = models.CharField(max_length=20, blank=True, verbose_name=_('Telefonas'))
    position = models.CharField(max_length=100, blank=True, verbose_name=_('Pareigos'))
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))

    # Mail sender classification
    is_trusted = models.BooleanField(default=False, verbose_name=_('Patikimas siuntėjas'))
    is_advertising = models.BooleanField(default=False, verbose_name=_('Reklaminis siuntėjas'))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'contacts'
        verbose_name = _('Kontaktinis asmuo')
        verbose_name_plural = _('Kontaktiniai asmenys')
        indexes = [
            models.Index(fields=['first_name', 'last_name']),
        ]
    
    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class Partner(models.Model):
    """Partnerių (klientų/tiekėjų) modelis"""
    
    class Status(models.TextChoices):
        ACTIVE = 'active', _('Aktyvus')
        BLOCKED = 'blocked', _('Užblokuotas')
    
    name = models.CharField(max_length=255, verbose_name=_('Pavadinimas'))
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name=_('Įmonės kodas')
    )
    vat_code = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        verbose_name=_('PVM kodas')
    )
    address = models.TextField(blank=True, verbose_name=_('Adresas'))
    contact_person = models.ForeignKey(
        Contact,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='partners',
        verbose_name=_('Kontaktinis asmuo')
    )
    payment_term_days = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_('Atsiskaitymo terminas (dienos)')
    )
    # El. pašto priminimų nustatymai (tik klientams)
    email_notify_due_soon = models.BooleanField(
        default=True,
        verbose_name=_('Siųsti priminimą apie artėjantį terminą'),
        help_text=_('Siųsti priminimą apie artėjantį apmokėjimo terminą')
    )
    email_notify_unpaid = models.BooleanField(
        default=True,
        verbose_name=_('Siųsti priminimą apie sueitį terminą ir neapmokėtą sąskaitą'),
        help_text=_('Siųsti priminimą apie sueitį apmokėjimo terminą ir neapmokėtą sąskaitą')
    )
    email_notify_overdue = models.BooleanField(
        default=True,
        verbose_name=_('Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą'),
        help_text=_('Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą')
    )
    # El. pašto pranešimai vadybininkui apie tiekėjo sąskaitas (tik tiekėjams)
    email_notify_manager_invoices = models.BooleanField(
        default=True,
        verbose_name=_('Siųsti vadybininkui pranešimą apie tiekėjo sąskaitas'),
        help_text=_('Jei pažymėta, vadybininkui bus siunčiami pranešimai apie tiekėjo sąskaitas, kurias reikia apmokėti')
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
        verbose_name=_('Būsena')
    )
    is_supplier = models.BooleanField(default=False, db_index=True, verbose_name=_('Tiekėjas'))
    is_client = models.BooleanField(default=False, db_index=True, verbose_name=_('Klientas'))
    has_code_errors = models.BooleanField(
        default=False,
        db_index=True,
        verbose_name=_('Kodo klaidos'),
        help_text=_('Įmonės arba PVM kodas neteisingo formato – rodoma tik su filtru „Su klaidomis“.')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        from .utils import is_valid_company_code, is_valid_vat_code
        self.has_code_errors = not (
            is_valid_company_code(self.code or '') and is_valid_vat_code(self.vat_code or '')
        )
        super().save(*args, **kwargs)

    class Meta:
        db_table = 'partners'
        verbose_name = _('Partneris')
        verbose_name_plural = _('Partneriai')
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['code']),
            models.Index(fields=['status']),
            models.Index(fields=['is_supplier', 'is_client']),
            models.Index(fields=['has_code_errors']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.code})"
    
    def clean(self):
        """Validacija: partneris privalo būti arba klientas, arba tiekėjas"""
        from django.core.exceptions import ValidationError
        if not self.is_supplier and not self.is_client:
            raise ValidationError("Partneris privalo būti arba Klientas, arba Tiekėjas (arba abu).")


# Signal handlers
@receiver(post_save, sender=Contact)
def handle_advertising_contact(sender, instance, **kwargs):
    """Automatiškai ištrina reklaminių siuntėjų laiškus"""
    if instance.is_advertising and not instance.is_trusted:
        from apps.mail.models import MailMessage
        messages_qs = MailMessage.objects.filter(sender_email__iexact=instance.email)
        message_count = messages_qs.count()

        if message_count > 0:
            deleted_count = messages_qs.delete()
            print(f'AUTOMATIC CLEANUP: Deleted {deleted_count[0]} messages from advertising sender {instance.email}')
        else:
            print(f'AUTOMATIC CLEANUP: No messages to delete for advertising sender {instance.email}')

