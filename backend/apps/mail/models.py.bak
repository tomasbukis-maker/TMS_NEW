from django.db import models
from django.utils.functional import cached_property
from django.utils.translation import gettext_lazy as _

from .utils import extract_email_from_sender, normalize_email
from apps.partners.models import Contact


def attachment_upload_path(instance, filename):
    """Generate upload path for mail attachments."""
    return f'mail_attachments/{instance.mail_message_id}/{filename}'


class MailSender(models.Model):
    email = models.CharField(max_length=255, unique=True, verbose_name=_('El. pašto adresas'))
    name = models.CharField(max_length=255, blank=True, verbose_name=_('Vardas / Įmonė'))
    is_trusted = models.BooleanField(default=False, verbose_name=_('Patikimas siuntėjas'))
    is_advertising = models.BooleanField(default=False, verbose_name=_('Reklaminis siuntėjas'))
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Sukurtas'))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_('Atnaujintas'))

    class Meta:
        verbose_name = _('Siuntėjas')
        verbose_name_plural = _('Siuntėjai')
        ordering = ['email']

    def __str__(self):
        return self.name or self.email

    def save(self, *args, **kwargs):
        self.email = normalize_email(self.email)
        super().save(*args, **kwargs)


class MailMessage(models.Model):
    class Status(models.TextChoices):
        NEW = 'new', _('Naujas')
        LINKED = 'linked', _('Skaitytas')
        IGNORED = 'ignored', _('Ignoruotas')
        TASK = 'task', _('Užduotis')

    uid = models.CharField(
        max_length=128,
        unique=True,
        verbose_name=_('IMAP UID'),
        help_text=_('Unikalus IMAP laiško identifikatorius (per aplanką).'),
    )
    message_id = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('Message-ID'),
        help_text=_('Laiško Message-ID antraštė, jei yra.'),
    )
    subject = models.CharField(max_length=512, blank=True, verbose_name=_('Tema'))
    sender = models.CharField(max_length=512, verbose_name=_('Siuntėjas'))
    sender_email = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('Siuntėjo el. paštas (normalizuotas)'),
        help_text=_('Automatiškai užpildoma iš siuntėjo lauko'),
        db_index=True,
    )
    recipients = models.TextField(blank=True, verbose_name=_('Gavėjai (To)'))
    cc = models.TextField(blank=True, verbose_name=_('Kopija (CC)'))
    bcc = models.TextField(blank=True, verbose_name=_('Nematomos kopijos (BCC)'))
    date = models.DateTimeField(verbose_name=_('Laiško data'))
    folder = models.CharField(max_length=255, default='INBOX', verbose_name=_('Aplankas'))
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.NEW,
        verbose_name=_('Būsena'),
    )
    flags = models.CharField(max_length=255, blank=True, verbose_name=_('IMAP vėliavėlės'))
    snippet = models.TextField(blank=True, verbose_name=_('Trumpas turinio fragmentas'))
    body_plain = models.TextField(blank=True, verbose_name=_('Turinys (paprastas tekstas)'))
    body_html = models.TextField(blank=True, verbose_name=_('Turinys (HTML)'))
    metadata = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Papildoma informacija'),
        help_text=_('Saugomos papildomos IMAP antraštės ar pagalbiniai duomenys.'),
    )
    related_order_id = models.IntegerField(null=True, blank=True, verbose_name=_('Susietas užsakymo ID'))
    related_partner_id = models.IntegerField(null=True, blank=True, verbose_name=_('Susietas partnerio ID'))
    assigned_to_id = models.IntegerField(
        null=True,
        blank=True,
        verbose_name=_('Priskirta vartotojui (ID)'),
        help_text=_('Jei reikia, priskiriame laišką konkretų vartotojui TMS sistemoje.'),
    )
    matched_orders = models.ManyToManyField(
        'orders.Order',
        related_name='matched_mail_messages',
        blank=True,
        verbose_name=_('Rasti užsakymo įrašai'),
    )
    matched_expeditions = models.ManyToManyField(
        'orders.OrderCarrier',
        related_name='matched_mail_messages',
        blank=True,
        verbose_name=_('Rastos ekspedicijos'),
    )
    matched_sales_invoices = models.ManyToManyField(
        'invoices.SalesInvoice',
        related_name='matched_mail_messages',
        blank=True,
        verbose_name=_('Rastos pardavimo sąskaitos'),
    )
    matched_purchase_invoices = models.ManyToManyField(
        'invoices.PurchaseInvoice',
        related_name='matched_mail_messages',
        blank=True,
        verbose_name=_('Rastos gaunamos sąskaitos'),
    )
    is_promotional = models.BooleanField(
        default=False,
        verbose_name=_('Reklaminis laiškas'),
        help_text=_('Automatiškai nustatomas, jei laiškas atpažįstamas kaip reklaminis.'),
        db_index=True,
    )
    manually_assigned = models.BooleanField(
        default=False,
        verbose_name=_('Rankiniu būdu priskirta'),
        help_text=_('True jei laiškas buvo priskirtas prie užsakymo rankiniu būdu (apsauga nuo OCR pakeitimų)'),
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Sukurta'))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_('Atnaujinta'))

    class Meta:
        db_table = 'mail_messages'
        verbose_name = _('Laiškas')
        verbose_name_plural = _('Laiškai')
        ordering = ['-date']
        indexes = [
            models.Index(fields=['status'], name='mail_messages_status_idx'),
            models.Index(fields=['folder'], name='mail_messages_folder_idx'),
            models.Index(fields=['-date'], name='mail_messages_date_idx'),
            models.Index(fields=['status', '-date'], name='mail_messages_status_date_idx'),
            models.Index(fields=['is_promotional'], name='mail_msg_promo_idx'),
            models.Index(fields=['sender_email'], name='mail_messages_sender_email_idx'),
        ]

    def save(self, *args, **kwargs):
        if self.sender:
            self.sender_email = normalize_email(extract_email_from_sender(self.sender))
        else:
            self.sender_email = ''
        super().save(*args, **kwargs)

    @property
    def sender_record(self):
        # Pirmiausia tikriname ar yra cached versija (N+1 optimizacija)
        if hasattr(self, '_cached_sender_record'):
            return self._cached_sender_record

        # Bandom rasti global cache (jei yra bulk užklausa)
        global_sender_cache = getattr(self, '_global_sender_cache', None)
        if global_sender_cache and self.sender_email:
            cached = global_sender_cache.get(self.sender_email.lower())
            if cached is not None:
                self._cached_sender_record = cached  # Išsaugome instance lygyje
                return cached

        # Fallback į duomenų bazę
        if not self.sender_email:
            return None
        return Contact.objects.filter(email__iexact=self.sender_email).first()

    @property
    def sender_status(self):
        sender = self.sender_record
        if not sender:
            return 'default'

        # Jei sender yra cached dict versija
        if isinstance(sender, dict):
            if sender.get('is_advertising'):
                return 'advertising'
            if sender.get('is_trusted'):
                return 'trusted'
            return 'default'

        # Jei sender yra Contact objektas
        if sender.is_advertising:
            return 'advertising'
        if sender.is_trusted:
            return 'trusted'
        return 'default'

    def __str__(self):
        return f'{self.subject or "(be temos)"} — {self.sender}'


class MailAttachment(models.Model):
    mail_message = models.ForeignKey(
        MailMessage,
        related_name='attachments',
        on_delete=models.CASCADE,
        verbose_name=_('Laiškas'),
    )
    filename = models.CharField(max_length=255, verbose_name=_('Failo pavadinimas'))
    content_type = models.CharField(max_length=128, blank=True, verbose_name=_('Turinio tipas'))
    size = models.PositiveIntegerField(default=0, verbose_name=_('Dydis (baitais)'))
    file = models.FileField(upload_to=attachment_upload_path, verbose_name=_('Failas'))
    metadata = models.JSONField(default=dict, blank=True, verbose_name=_('Papildoma informacija'))

    # OCR laukai
    ocr_text = models.TextField(blank=True, null=True, verbose_name=_('OCR tekstas'))
    ocr_processed = models.BooleanField(default=False, verbose_name=_('OCR atlikta'))
    ocr_processed_at = models.DateTimeField(blank=True, null=True, verbose_name=_('OCR atlikta'))
    ocr_error = models.TextField(blank=True, null=True, verbose_name=_('OCR klaida'))

    # Susiejimas su purchase invoice (jei priedas buvo naudotas sukurti purchase invoice)
    related_purchase_invoice = models.ForeignKey(
        'invoices.PurchaseInvoice',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='source_attachment',
        verbose_name=_('Susijusi gauta sąskaita'),
        help_text=_('Jei priedas buvo naudotas sukurti purchase invoice, čia saugomas ryšys')
    )

    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Sukurta'))

    class Meta:
        db_table = 'mail_attachments'
        verbose_name = _('Laiško priedas')
        verbose_name_plural = _('Laiško priedai')

    def __str__(self):
        return self.filename


class MailTag(models.Model):
    name = models.CharField(max_length=100, unique=True, verbose_name=_('Žyma'))
    color = models.CharField(max_length=7, default='#6b7280', verbose_name=_('Spalva (HEX)'))
    description = models.CharField(max_length=255, blank=True, verbose_name=_('Aprašymas'))
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Sukurta'))

    class Meta:
        db_table = 'mail_tags'
        verbose_name = _('Laiško žyma')
        verbose_name_plural = _('Laiško žymos')
        ordering = ['name']

    def __str__(self):
        return self.name


class MailMessageTag(models.Model):
    mail_message = models.ForeignKey(
        MailMessage,
        related_name='message_tags',
        on_delete=models.CASCADE,
        verbose_name=_('Laiškas'),
    )
    tag = models.ForeignKey(
        MailTag,
        related_name='tag_messages',
        on_delete=models.CASCADE,
        verbose_name=_('Žyma'),
    )
    applied_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Pridėta'))

    class Meta:
        db_table = 'mail_message_tags'
        unique_together = ('mail_message', 'tag')
        verbose_name = _('Žymos ir laiško ryšys')
        verbose_name_plural = _('Žymos ir laiško ryšiai')

    def __str__(self):
        return f'{self.mail_message_id} -> {self.tag_id}'


class MailSyncState(models.Model):
    folder = models.CharField(max_length=255, default='INBOX', verbose_name=_('Aplankas'))
    last_synced_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Paskutinė sinchronizacija'))
    last_uid = models.CharField(
        max_length=128,
        blank=True,
        verbose_name=_('Paskutinis sinchronizuotas UID'),
    )
    status = models.CharField(max_length=32, blank=True, verbose_name=_('Būsena'))
    message = models.TextField(blank=True, verbose_name=_('Pastabos / klaidos'))
    metadata = models.JSONField(default=dict, blank=True, verbose_name=_('Papildoma informacija'))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_('Atnaujinta'))

    class Meta:
        db_table = 'mail_sync_state'
        verbose_name = _('Sinchronizacijos būsena')
        verbose_name_plural = _('Sinchronizacijos būsenos')

    def __str__(self):
        return f'{self.folder} ({self.last_synced_at or "nesinchronizuota"})'


class EmailLog(models.Model):
    """El. laiškų siuntimo istorija"""
    
    class EmailType(models.TextChoices):
        REMINDER = 'reminder', _('Priminimas')
        ORDER = 'order', _('Užsakymas')
        INVOICE = 'invoice', _('Sąskaita')
        EXPEDITION = 'expedition', _('Ekspedicija')
        MANAGER_NOTIFICATION = 'manager_notification', _('Pranešimas vadybininkui')
        CUSTOM = 'custom', _('Kitas')
    
    class Status(models.TextChoices):
        PENDING = 'pending', _('Laukiama')
        SENT = 'sent', _('Išsiųsta')
        FAILED = 'failed', _('Klaida')
    
    # Pagrindinė informacija
    email_type = models.CharField(
        max_length=32,
        choices=EmailType.choices,
        verbose_name=_('Tipas')
    )
    subject = models.CharField(max_length=512, verbose_name=_('Tema'))
    recipient_email = models.CharField(max_length=255, verbose_name=_('Gavėjo el. paštas'))
    recipient_name = models.CharField(max_length=255, blank=True, verbose_name=_('Gavėjo vardas'))
    
    # Susiję objektai
    related_order_id = models.IntegerField(null=True, blank=True, verbose_name=_('Susietas užsakymas'))
    related_invoice_id = models.IntegerField(null=True, blank=True, verbose_name=_('Susieta sąskaita'))
    related_expedition_id = models.IntegerField(null=True, blank=True, verbose_name=_('Susieta ekspedicija'))
    related_partner_id = models.IntegerField(null=True, blank=True, verbose_name=_('Susietas partneris'))
    
    # Siuntimo duomenys
    status = models.CharField(
        max_length=32,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name=_('Būsena')
    )
    sent_at = models.DateTimeField(null=True, blank=True, verbose_name=_('Išsiųsta'))
    error_message = models.TextField(blank=True, verbose_name=_('Klaidos pranešimas'))
    
    # Turinys
    body_text = models.TextField(blank=True, verbose_name=_('Turinys (tekstas)'))
    body_html = models.TextField(blank=True, verbose_name=_('Turinys (HTML)'))
    
    # Papildoma informacija
    metadata = models.JSONField(default=dict, blank=True, verbose_name=_('Papildoma informacija'))
    
    # Vartotojas, kuris siuntė
    sent_by = models.ForeignKey(
        'tms_auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_emails',
        verbose_name=_('Išsiuntė')
    )
    
    created_at = models.DateTimeField(auto_now_add=True, verbose_name=_('Sukurta'))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_('Atnaujinta'))
    
    class Meta:
        db_table = 'email_logs'
        verbose_name = _('El. laiškų istorija')
        verbose_name_plural = _('El. laiškų istorija')
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email_type', '-created_at']),
            models.Index(fields=['related_order_id']),
            models.Index(fields=['related_invoice_id']),
            models.Index(fields=['status', '-created_at']),
        ]
    
    def __str__(self):
        return f'{self.get_email_type_display()} → {self.recipient_email} ({self.get_status_display()})'

