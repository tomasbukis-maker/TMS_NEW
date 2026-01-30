from django.db import models
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator
from decimal import Decimal


def expense_invoice_file_path(instance, filename):
    """Saugoti failus pagal sąskaitos ID"""
    return f'expenses/invoices/{instance.id}/{filename}'


class ExpenseSupplier(models.Model):
    """Išlaidų tiekėjų modelis (atskirti nuo transporto partnerių)"""
    
    class Status(models.TextChoices):
        ACTIVE = 'active', _('Aktyvus')
        BLOCKED = 'blocked', _('Užblokuotas')
    
    name = models.CharField(max_length=255, verbose_name=_('Pavadinimas'))
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        blank=True,
        verbose_name=_('Įmonės kodas')
    )
    vat_code = models.CharField(
        max_length=50,
        blank=True,
        db_index=True,
        verbose_name=_('PVM kodas')
    )
    address = models.TextField(blank=True, verbose_name=_('Adresas'))
    phone = models.CharField(max_length=50, blank=True, verbose_name=_('Telefonas'))
    email = models.EmailField(blank=True, verbose_name=_('El. paštas'))
    contact_person = models.CharField(max_length=255, blank=True, verbose_name=_('Kontaktinis asmuo'))
    bank_account = models.CharField(max_length=100, blank=True, verbose_name=_('Banko sąskaita'))
    payment_term_days = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_('Atsiskaitymo terminas (dienos)')
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
        verbose_name=_('Būsena')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'expense_suppliers'
        verbose_name = _('Išlaidų tiekėjas')
        verbose_name_plural = _('Išlaidų tiekėjai')
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['code']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.name}" + (f" ({self.code})" if self.code else "")


class ExpenseCategory(models.Model):
    """Išlaidų kategorijų modelis"""
    
    name = models.CharField(max_length=255, unique=True, verbose_name=_('Pavadinimas'))
    description = models.TextField(blank=True, verbose_name=_('Aprašymas'))
    is_active = models.BooleanField(default=True, db_index=True, verbose_name=_('Aktyvi'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'expense_categories_v2'
        verbose_name = _('Išlaidų kategorija')
        verbose_name_plural = _('Išlaidų kategorijos')
        ordering = ['name']
    
    def __str__(self):
        return self.name


class ExpenseInvoice(models.Model):
    """Išlaidų sąskaitų modelis (kitos įmonės išlaidos)"""
    
    class PaymentStatus(models.TextChoices):
        UNPAID = 'unpaid', _('Neapmokėta')
        PAID = 'paid', _('Apmokėta')
        OVERDUE = 'overdue', _('Vėluoja')
        PARTIALLY_PAID = 'partially_paid', _('Dalinis apmokėjimas')
    
    invoice_number = models.CharField(
        max_length=100,
        db_index=True,
        verbose_name=_('Sąskaitos numeris')
    )
    supplier = models.ForeignKey(
        ExpenseSupplier,
        on_delete=models.PROTECT,
        related_name='invoices',
        verbose_name=_('Tiekėjas')
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='invoices',
        verbose_name=_('Kategorija')
    )
    amount_net = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Suma be PVM')
    )
    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('21.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('PVM tarifas (%)')
    )
    vat_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('PVM suma')
    )
    amount_total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Bendra suma su PVM')
    )
    currency = models.CharField(
        max_length=3,
        default='EUR',
        verbose_name=_('Valiuta')
    )
    issue_date = models.DateField(verbose_name=_('Išrašymo data'))
    due_date = models.DateField(null=True, blank=True, verbose_name=_('Apmokėjimo terminas'))
    payment_date = models.DateField(null=True, blank=True, verbose_name=_('Apmokėjimo data'))
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
        db_index=True,
        verbose_name=_('Mokėjimo statusas')
    )
    payment_method = models.CharField(
        max_length=50,
        blank=True,
        verbose_name=_('Apmokėjimo būdas')
    )
    invoice_file = models.FileField(
        upload_to=expense_invoice_file_path,
        null=True,
        blank=True,
        verbose_name=_('Sąskaitos failas (PDF)')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'expense_invoices'
        verbose_name = _('Išlaidų sąskaita')
        verbose_name_plural = _('Išlaidų sąskaitos')
        ordering = ['-issue_date', '-created_at']
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['supplier']),
            models.Index(fields=['category']),
            models.Index(fields=['payment_status']),
            models.Index(fields=['issue_date']),
            models.Index(fields=['due_date']),
        ]
    
    def __str__(self):
        return f"{self.invoice_number} - {self.supplier.name}"
    
    def save(self, *args, **kwargs):
        """Automatiškai apskaičiuoti PVM ir bendrą sumą"""
        if self.amount_net and self.vat_rate is not None:
            self.vat_amount = (self.amount_net * self.vat_rate) / Decimal('100')
            self.amount_total = self.amount_net + self.vat_amount
        super().save(*args, **kwargs)

