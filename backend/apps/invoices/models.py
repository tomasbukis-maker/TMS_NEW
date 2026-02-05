from django.db import models
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator
from decimal import Decimal
from apps.partners.models import Partner
from apps.orders.models import Order


def purchase_invoice_file_path(instance, filename):
    """Saugoti failus pagal sąskaitos ID"""
    return f'invoices/purchase/{instance.id}/{filename}'


class ExpenseCategory(models.Model):
    """Išlaidų kategorijų modelis (purchase_invoices)"""
    
    name = models.CharField(max_length=255, unique=True, verbose_name=_('Pavadinimas'))
    description = models.TextField(blank=True, verbose_name=_('Aprašymas'))
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'expense_categories'
        verbose_name = _('Išlaidų kategorija')
        verbose_name_plural = _('Išlaidų kategorijos')
    
    def __str__(self) -> str:
        return str(self.name)


class SalesInvoice(models.Model):
    """Pardavimo sąskaitų modelis (Išrašomos)"""
    
    class InvoiceType(models.TextChoices):
        PRE_INVOICE = 'pre_invoice', _('Pro forma sąskaita')
        FINAL = 'final', _('Galutinė sąskaita')
        CREDIT = 'credit', _('Kreditinė sąskaita')
        PROFORMA = 'proforma', _('Proforma')
    
    class PaymentStatus(models.TextChoices):
        UNPAID = 'unpaid', _('Neapmokėta')
        PAID = 'paid', _('Apmokėta')
        OVERDUE = 'overdue', _('Vėluoja')
        PARTIALLY_PAID = 'partially_paid', _('Dalinis apmokėjimas')
    
    invoice_number = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name=_('Sąskaitos numeris')
    )
    invoice_type = models.CharField(
        max_length=20,
        choices=InvoiceType.choices,
        default=InvoiceType.FINAL,
        verbose_name=_('Sąskaitos tipas')
    )
    partner = models.ForeignKey(
        Partner,
        on_delete=models.PROTECT,
        related_name='sales_invoices',
        limit_choices_to={'is_client': True},
        verbose_name=_('Klientas')
    )
    related_order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales_invoices',
        verbose_name=_('Susijęs užsakymas')
    )
    related_orders = models.ManyToManyField(
        Order,
        blank=True,
        related_name='sales_invoices_m2m',
        through='SalesInvoiceOrder',
        through_fields=('invoice', 'order'),
        verbose_name=_('Susiję užsakymai (keli)')
    )
    credit_invoice = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='original_invoices',
        verbose_name=_('Kreditinė sąskaita')
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
        db_index=True,
        verbose_name=_('Mokėjimo būsena')
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
        verbose_name=_('PVM tarifas (%)')
    )
    vat_rate_article = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('PVM straipsnis'),
        help_text=_('PVM įstatymo straipsnis (pvz. 5 str. 7 d., 6 str.)')
    )
    amount_total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Suma su PVM')
    )
    issue_date = models.DateField(verbose_name=_('Išrašymo data'))
    due_date = models.DateField(verbose_name=_('Mokėjimo terminas'))
    payment_date = models.DateField(null=True, blank=True, verbose_name=_('Mokėjimo data'))
    overdue_days = models.IntegerField(default=0, validators=[MinValueValidator(0)], verbose_name=_('Vėlavimo dienos'))  # type: ignore[call-overload]
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    # Rankiniu būdu nurodomos eilutės (naudojama kuriant be susijusio užsakymo)
    manual_lines = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Rankinės eilutės'),
        help_text=_('JSON masyvas su eilutėmis: [{"description": "...", "quantity": 1, "price": "100.00", ...}, ...]')
    )
    display_options = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Rodymo parinktys'),
        help_text=_('JSON objektas su rodymo parinktimis')
    )
    visible_items_indexes = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Matomų elementų indeksai'),
        help_text=_('JSON masyvas su matomų elementų indeksais')
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'sales_invoices'
        verbose_name = _('Pardavimo sąskaita')
        verbose_name_plural = _('Pardavimo sąskaitos')
        ordering = ['-issue_date', '-created_at']
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['partner']),
            models.Index(fields=['payment_status']),
            models.Index(fields=['due_date']),
        ]
    
    def __str__(self):
        return f"{self.invoice_number} - {self.partner.name}"
    
    @property
    def paid_amount(self):
        """Apskaičiuoti apmokėtą sumą iš mokėjimų istorijos"""
        try:
            return self.payment_history.aggregate(
                total=models.Sum('amount')
            )['total'] or Decimal('0.00')
        except (AttributeError, Exception):
            return Decimal('0.00')
    
    @property
    def remaining_amount(self):
        """Apskaičiuoti likusią sumą"""
        try:
            return self.amount_total - self.paid_amount
        except (AttributeError, Exception):
            return self.amount_total or Decimal('0.00')

    @property
    def effective_amount_net(self):
        """Suma be PVM: kai susieta keli užsakymai – visų susietų užsakymų sumų suma; kai vienas – saugota amount_net."""
        try:
            if hasattr(self, 'invoice_orders') and self.invoice_orders.exists():
                from django.db.models import Sum
                total = self.invoice_orders.aggregate(s=Sum('amount'))['s']
                if total is not None:
                    return total
        except (AttributeError, Exception):
            pass
        return self.amount_net or Decimal('0.00')

    @property
    def effective_amount_total(self):
        """Suma su PVM: effective_amount_net * (1 + vat_rate/100)."""
        try:
            net = self.effective_amount_net
            vat = (self.vat_rate or Decimal('0')) / Decimal('100')
            return net * (Decimal('1') + vat)
        except (AttributeError, TypeError, Exception):
            return self.amount_total or Decimal('0.00')


class SalesInvoiceOrder(models.Model):
    """Tarpinė lentelė tarp SalesInvoice ir Order (ManyToMany)"""
    
    invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name='invoice_orders'
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='order_sales_invoices'
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name=_('Suma'),
        help_text=_('Kiek šis užsakymas sudaro iš visos sąskaitos sumos')
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'sales_invoice_orders'
        unique_together = ['invoice', 'order']
        verbose_name = _('Sąskaitos užsakymas')
        verbose_name_plural = _('Sąskaitos užsakymai')
    
    def __str__(self) -> str:
        invoice_num = self.invoice.invoice_number if self.invoice else 'N/A'
        order_num = self.order.order_number if self.order else 'N/A'
        
        return f"{invoice_num} -> {order_num}"


class PurchaseInvoice(models.Model):
    """Pirkimo sąskaitų modelis (Gaunamos)"""
    
    class PaymentStatus(models.TextChoices):
        UNPAID = 'unpaid', _('Neapmokėta')
        PAID = 'paid', _('Apmokėta')
        OVERDUE = 'overdue', _('Vėluoja')
        PARTIALLY_PAID = 'partially_paid', _('Dalinis apmokėjimas')
    
    invoice_number = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        verbose_name=_('Sistemos sąskaitos numeris (neprivalomas)')
    )
    received_invoice_number = models.CharField(
        max_length=50,
        db_index=True,
        verbose_name=_('Tiekėjo sąskaitos numeris')
    )
    partner = models.ForeignKey(
        Partner,
        on_delete=models.PROTECT,
        related_name='purchase_invoices',
        limit_choices_to={'is_supplier': True},
        verbose_name=_('Tiekėjas')
    )
    related_order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_invoices',
        verbose_name=_('Susijęs užsakymas'),
        help_text=_('DEPRECATED: Naudokite related_orders. Palikta suderinamumui.')
    )
    related_orders = models.ManyToManyField(
        Order,
        related_name='purchase_invoices_m2m',
        blank=True,
        verbose_name=_('Susiję užsakymai')
    )
    related_orders_amounts = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Užsakymų sumos'),
        help_text=_('JSON masyvas su užsakymų sumomis: [{"order_id": 1, "amount": "100.00"}, ...]')
    )
    expense_category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        null=True,
        blank=False,
        related_name='purchase_invoices',
        verbose_name=_('Išlaidų kategorija')
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
        db_index=True,
        verbose_name=_('Mokėjimo būsena')
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
        verbose_name=_('PVM tarifas (%)')
    )
    amount_total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Suma su PVM')
    )
    issue_date = models.DateField(verbose_name=_('Tiekėjo sąskaitos išrašymo data'))
    received_date = models.DateField(null=True, blank=True, verbose_name=_('Gavimo data'))
    due_date = models.DateField(verbose_name=_('Mokėjimo terminas'))
    payment_date = models.DateField(null=True, blank=True, verbose_name=_('Mokėjimo data'))
    invoice_file = models.FileField(
        upload_to='invoices/purchase/',
        null=True,
        blank=True,
        verbose_name=_('Sąskaitos failas (PDF)')
    )
    related_attachment = models.ForeignKey(
        'mail.MailAttachment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchase_invoices',
        verbose_name=_('Susijęs priedas')
    )
    overdue_days = models.IntegerField(default=0, validators=[MinValueValidator(0)], verbose_name=_('Vėlavimo dienos'))  # type: ignore[call-overload]
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'purchase_invoices'
        verbose_name = _('Pirkimo sąskaita')
        verbose_name_plural = _('Pirkimo sąskaitos')
        indexes = [
            models.Index(fields=['invoice_number']),
            models.Index(fields=['partner']),
            models.Index(fields=['payment_status']),
            models.Index(fields=['due_date']),
        ]
    
    def __str__(self):
        return f"{self.received_invoice_number} - {self.partner.name}"
    
    @property
    def paid_amount(self):
        """Apskaičiuoti apmokėtą sumą iš mokėjimų istorijos"""
        try:
            return self.payment_history.aggregate(
                total=models.Sum('amount')
            )['total'] or Decimal('0.00')
        except (AttributeError, Exception):
            return Decimal('0.00')
    
    @property
    def remaining_amount(self):
        """Apskaičiuoti likusią sumą"""
        try:
            return self.amount_total - self.paid_amount
        except (AttributeError, Exception):
            return self.amount_total or Decimal('0.00')


class InvoicePayment(models.Model):
    """Mokėjimų istorijos modelis - saugo kada ir kiek buvo apmokėta"""
    
    # Galima susieti su SalesInvoice arba PurchaseInvoice
    sales_invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name='payment_history',
        null=True,
        blank=True,
        verbose_name=_('Išrašyta sąskaita')
    )
    purchase_invoice = models.ForeignKey(
        PurchaseInvoice,
        on_delete=models.CASCADE,
        related_name='payment_history',
        null=True,
        blank=True,
        verbose_name=_('Gauta sąskaita')
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        verbose_name=_('Apmokėta suma')
    )
    payment_date = models.DateField(verbose_name=_('Mokėjimo data'))
    payment_method = models.CharField(
        max_length=50,
        blank=True,
        verbose_name=_('Mokėjimo būdas'),
        help_text=_('pvz. Banko pavedimas, Grynieji, Kortelė')
    )
    notes = models.TextField(
        blank=True,
        verbose_name=_('Pastabos')
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'tms_auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_payments',
        verbose_name=_('Sukūrė')
    )
    
    class Meta:
        db_table = 'invoice_payments'
        verbose_name = _('Sąskaitos mokėjimas')
        verbose_name_plural = _('Sąskaitų mokėjimai')
        ordering = ['-payment_date', '-created_at']
        indexes = [
            models.Index(fields=['sales_invoice']),
            models.Index(fields=['purchase_invoice']),
            models.Index(fields=['payment_date']),
        ]
    
    def clean(self):
        """Patikrinti, kad yra arba sales_invoice, arba purchase_invoice"""
        from django.core.exceptions import ValidationError
        if not self.sales_invoice and not self.purchase_invoice:
            raise ValidationError(_('Turite nurodyti arba išrašytą, arba gautą sąskaitą'))
        if self.sales_invoice and self.purchase_invoice:
            raise ValidationError(_('Negalima nurodyti ir išrašytos, ir gautos sąskaitos'))
    
    def save(self, *args, **kwargs):
        """Automatiškai atnaujinti sąskaitos payment_status"""
        self.full_clean()
        super().save(*args, **kwargs)
        
        # Atnaujinti sąskaitos statusą
        invoice = self.sales_invoice or self.purchase_invoice
        if invoice:
            # Atnaujinti iš duomenų bazės, kad gautume naujausius duomenis
            invoice.refresh_from_db()
            
            # Apskaičiuoti apmokėtą sumą tiesiogiai iš payment_history (su naujuoju įrašu)
            paid = invoice.payment_history.aggregate(
                total=models.Sum('amount')
            )['total'] or Decimal('0.00')
            
            total = invoice.amount_total
            
            if paid >= total:
                invoice.payment_status = SalesInvoice.PaymentStatus.PAID if self.sales_invoice else PurchaseInvoice.PaymentStatus.PAID
                invoice.payment_date = self.payment_date
            elif paid > Decimal('0.00'):
                invoice.payment_status = SalesInvoice.PaymentStatus.PARTIALLY_PAID if self.sales_invoice else PurchaseInvoice.PaymentStatus.PARTIALLY_PAID
                invoice.payment_date = None  # Dar ne visai apmokėta
            else:
                invoice.payment_status = SalesInvoice.PaymentStatus.UNPAID if self.sales_invoice else PurchaseInvoice.PaymentStatus.UNPAID
                invoice.payment_date = None
            
            # Atnaujinti vėlavimo dienas
            from django.utils import timezone
            today = timezone.now().date()
            if invoice.due_date and invoice.due_date < today and invoice.payment_status not in [SalesInvoice.PaymentStatus.PAID, PurchaseInvoice.PaymentStatus.PAID]:
                invoice.overdue_days = (today - invoice.due_date).days
                if invoice.payment_status not in [SalesInvoice.PaymentStatus.OVERDUE, PurchaseInvoice.PaymentStatus.OVERDUE]:
                    invoice.payment_status = SalesInvoice.PaymentStatus.OVERDUE if self.sales_invoice else PurchaseInvoice.PaymentStatus.OVERDUE
            else:
                invoice.overdue_days = 0
            
            invoice.save(update_fields=['payment_status', 'payment_date', 'overdue_days'])
    
    def delete(self, *args, **kwargs):
        """Automatiškai atnaujinti sąskaitos payment_status po mokėjimo ištrynimo"""
        invoice = self.sales_invoice or self.purchase_invoice
        
        # Išsaugoti invoice_id prieš ištrynimą
        invoice_id = invoice.id if invoice else None
        invoice_type = 'sales' if self.sales_invoice else 'purchase'
        
        # Ištrinti mokėjimą
        super().delete(*args, **kwargs)
        
        # Atnaujinti sąskaitos statusą po ištrynimo
        if invoice_id:
            from django.utils import timezone
            today = timezone.now().date()
            
            if invoice_type == 'sales':
                try:
                    invoice = SalesInvoice.objects.get(id=invoice_id)
                except SalesInvoice.DoesNotExist:
                    return
            else:
                try:
                    invoice = PurchaseInvoice.objects.get(id=invoice_id)
                except PurchaseInvoice.DoesNotExist:
                    return
            
            # Apskaičiuoti apmokėtą sumą po ištrynimo
            paid = invoice.payment_history.aggregate(
                total=models.Sum('amount')
            )['total'] or Decimal('0.00')
            
            total = invoice.amount_total
            
            # Atnaujinti payment_status
            if paid >= total:
                invoice.payment_status = SalesInvoice.PaymentStatus.PAID if invoice_type == 'sales' else PurchaseInvoice.PaymentStatus.PAID
                invoice.payment_date = invoice.payment_history.order_by('-payment_date').first().payment_date if invoice.payment_history.exists() else None
            elif paid > Decimal('0.00'):
                invoice.payment_status = SalesInvoice.PaymentStatus.PARTIALLY_PAID if invoice_type == 'sales' else PurchaseInvoice.PaymentStatus.PARTIALLY_PAID
                invoice.payment_date = None
            else:
                invoice.payment_status = SalesInvoice.PaymentStatus.UNPAID if invoice_type == 'sales' else PurchaseInvoice.PaymentStatus.UNPAID
                invoice.payment_date = None
            
            # Atnaujinti vėlavimo dienas
            if invoice.due_date and invoice.due_date < today:
                overdue_days = (today - invoice.due_date).days
                invoice.overdue_days = overdue_days
                if invoice.payment_status not in [SalesInvoice.PaymentStatus.PAID, PurchaseInvoice.PaymentStatus.PAID]:
                    invoice.payment_status = SalesInvoice.PaymentStatus.OVERDUE if invoice_type == 'sales' else PurchaseInvoice.PaymentStatus.OVERDUE
            else:
                invoice.overdue_days = 0
            
            invoice.save(update_fields=['payment_status', 'payment_date', 'overdue_days'])
    
    def __str__(self):
        invoice_type = 'Išrašyta' if self.sales_invoice else 'Gauta'
        invoice_num = self.sales_invoice.invoice_number if self.sales_invoice else self.purchase_invoice.received_invoice_number if self.purchase_invoice else 'N/A'
        return f"{invoice_type} {invoice_num} - {self.amount} EUR ({self.payment_date})"


class InvoiceNumberSequence(models.Model):
    """Sąskaitų numeracijos sekos modelis"""
    
    year = models.IntegerField(unique=True, db_index=True, verbose_name=_('Metai'))
    last_number = models.IntegerField(default=0, validators=[MinValueValidator(0)], verbose_name=_('Paskutinis numeris'))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_('Atnaujinta'))
    
    class Meta:
        db_table = 'invoice_number_sequences'
        verbose_name = _('Sąskaitų numeracijos seka')
        verbose_name_plural = _('Sąskaitų numeracijos sekos')
    
    def __str__(self):
        return f"{self.year}: {self.last_number}"


class InvoiceReminder(models.Model):
    """Sąskaitų priminimų modelis"""
    
    class ReminderType(models.TextChoices):
        DUE_SOON = 'due_soon', _('Artėja terminas')
        UNPAID = 'unpaid', _('Neapmokėta sąskaita')
        OVERDUE = 'overdue', _('Vėluojama apmokėti')
    
    invoice = models.ForeignKey(
        SalesInvoice,
        on_delete=models.CASCADE,
        related_name='reminders',
        verbose_name=_('Sąskaita')
    )
    reminder_type = models.CharField(
        max_length=20,
        choices=ReminderType.choices,
        verbose_name=_('Priminimo tipas')
    )
    last_sent_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Paskutinio siuntimo data'))
    sent_count = models.IntegerField(default=0, validators=[MinValueValidator(0)], verbose_name=_('Siuntimų skaičius'))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Sukurta'))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_('Atnaujinta'))
    
    class Meta:
        db_table = 'invoice_reminders'
        verbose_name = _('Sąskaitos priminimas')
        verbose_name_plural = _('Sąskaitų priminimai')
        unique_together = [['invoice', 'reminder_type']]
        indexes = [
            models.Index(fields=['invoice', 'reminder_type']),
            models.Index(fields=['last_sent_at']),
        ]
    
    def __str__(self):
        return f"{self.invoice.invoice_number} - {self.get_reminder_type_display()}"
