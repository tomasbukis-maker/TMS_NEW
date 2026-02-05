from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.translation import gettext_lazy as _
from decimal import Decimal
import os


class OrderSettings(models.Model):
    """Užsakymų nustatymai (vienas įrašas visai sistemai)"""
    order_prefix = models.CharField(
        max_length=10,
        default='',
        blank=True,
        verbose_name=_('Užsakymo numerio prefiksas'),
        help_text=_('Prefiksas, kuris bus pridėtas numerio pradžioje (pvz.: 2025). Jei tuščias, bus naudojami dabartiniai metai.')
    )
    order_number_width = models.IntegerField(
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        verbose_name=_('Užsakymo numerio skaitmenų skaičius (NNN)')
    )
    auto_numbering = models.BooleanField(
        default=True,
        verbose_name=_('Automatinis užsakymų numeravimas')
    )
    my_price_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=15.00,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        verbose_name=_('Mano kainos procentas nuo bendros užsakymo kainos (%)'),
        help_text=_('Automatiškai apskaičiuojama "mano kaina" kaip šis procentas nuo bendros sumos (vežėjų/sandėlių kainos + kitos išlaidos)')
    )
    payment_terms = models.TextField(
        blank=True,
        default='30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.',
        verbose_name=_('Apmokėjimo terminas (LT)'),
        help_text=_('Apmokėjimo terminas lietuvių kalba')
    )
    payment_terms_en = models.TextField(
        blank=True,
        verbose_name=_('Apmokėjimo terminas (EN)'),
        help_text=_('Apmokėjimo terminas anglų kalba')
    )
    payment_terms_ru = models.TextField(
        blank=True,
        verbose_name=_('Apmokėjimo terminas (RU)'),
        help_text=_('Apmokėjimo terminas rusų kalba')
    )
    carrier_obligations = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Vežėjo teisės ir pareigos'),
        help_text=_('Sąrašas punktų, pvz: [{"text": "...", "text_en": "...", "text_ru": "..."}]')
    )
    client_obligations = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Užsakovo teisės ir pareigos'),
        help_text=_('Sąrašas punktų, pvz: [{"text": "...", "text_en": "...", "text_ru": "..."}]')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    clear_autocomplete_on_reset = models.BooleanField(
        default=False,
        verbose_name=_('Išvalyti autocomplete duomenis')
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_settings'
        verbose_name = _('Užsakymų nustatymai')
        verbose_name_plural = _('Užsakymų nustatymai')

    def __str__(self):
        return 'Užsakymų nustatymai'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class ExpeditionSettings(models.Model):
    """VEŽĖJŲ ekspedicijos numeravimo nustatymai (vienas įrašas visai sistemai)."""

    expedition_prefix = models.CharField(
        max_length=10,
        default='E',
        verbose_name=_('Vežėjų ekspedicijos numerio prefiksas')
    )
    expedition_number_width = models.IntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        verbose_name=_('Vežėjų ekspedicijos numerio skaitmenų skaičius (NNNNN)')
    )
    auto_numbering = models.BooleanField(
        default=True,
        verbose_name=_('Automatinis vežėjų ekspedicijų numeravimas')
    )
    payment_terms = models.TextField(
        blank=True,
        default='30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.',
        verbose_name=_('Apmokėjimo terminas (LT)'),
        help_text=_('Apmokėjimo terminas lietuvių kalba')
    )
    payment_terms_en = models.TextField(
        blank=True,
        verbose_name=_('Apmokėjimo terminas (EN)'),
        help_text=_('Apmokėjimo terminas anglų kalba')
    )
    payment_terms_ru = models.TextField(
        blank=True,
        verbose_name=_('Apmokėjimo terminas (RU)'),
        help_text=_('Apmokėjimo terminas rusų kalba')
    )
    carrier_obligations = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Vežėjo teisės ir pareigos'),
        help_text=_('Sąrašas punktų, pvz: [{"text": "...", "text_en": "...", "text_ru": "..."}]')
    )
    client_obligations = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Užsakovo teisės ir pareigos'),
        help_text=_('Sąrašas punktų, pvz: [{"text": "...", "text_en": "...", "text_ru": "..."}]')
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        """Grąžina vienintelį įrašą arba sukuria naują"""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj


class WarehouseExpeditionSettings(models.Model):
    """SANDELĮ ekspedicijos numeravimo nustatymai (vienas įrašas visai sistemai)."""

    expedition_prefix = models.CharField(
        max_length=10,
        default='WH-',
        verbose_name=_('Sandėlių ekspedicijos numerio prefiksas')
    )
    expedition_number_width = models.IntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        verbose_name=_('Sandėlių ekspedicijos numerio skaitmenų skaičius (NNNNN)')
    )
    auto_numbering = models.BooleanField(
        default=True,
        verbose_name=_('Automatinis sandėlių ekspedicijų numeravimas')
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        """Grąžina vienintelį įrašą arba sukuria naują"""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

    class Meta:
        verbose_name = _('2. Sandėlių nustatymai')
        verbose_name_plural = _('2. Sandėlių nustatymai')


class CostExpeditionSettings(models.Model):
    """IŠLAIDŲ numeravimo nustatymai (vienas įrašas visai sistemai)."""

    expedition_prefix = models.CharField(
        max_length=10,
        default='COST-',
        verbose_name=_('Išlaidų numerio prefiksas')
    )

    @classmethod
    def load(cls):
        """Grąžina vienintelį įrašą arba sukuria naują"""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj
    expedition_number_width = models.IntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        verbose_name=_('Išlaidų numerio skaitmenų skaičius (NNNNN)')
    )
    auto_numbering = models.BooleanField(
        default=True,
        verbose_name=_('Automatinis išlaidų numeravimas')
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def load(cls):
        """Grąžina vienintelį įrašą arba sukuria naują"""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj

    class Meta:
        verbose_name = _('3. Pap. išlaidų nustatymai')
        verbose_name_plural = _('3. Pap. išlaidų nustatymai')

    payment_terms = models.TextField(
        blank=True,
        default='30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.',
        verbose_name=_('Apmokėjimo terminas (LT)'),
        help_text=_('Apmokėjimo terminas lietuvių kalba')
    )
    payment_terms_en = models.TextField(
        blank=True,
        verbose_name=_('Apmokėjimo terminas (EN)'),
        help_text=_('Apmokėjimo terminas anglų kalba')
    )
    payment_terms_ru = models.TextField(
        blank=True,
        verbose_name=_('Apmokėjimo terminas (RU)'),
        help_text=_('Apmokėjimo terminas rusų kalba')
    )
    carrier_obligations = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Vežėjo teisės ir pareigos'),
        help_text=_('Sąrašas punktų, pvz: [{"text": "...", "text_en": "...", "text_ru": "..."}]')
    )
    client_obligations = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Užsakovo teisės ir pareigos'),
        help_text=_('Sąrašas punktų, pvz: [{"text": "...", "text_en": "...", "text_ru": "..."}]')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'expedition_settings'
        verbose_name = _('1. Ekspedicijos nustatymai')
        verbose_name_plural = _('1. Ekspedicijos nustatymai')

    def __str__(self):
        return 'Ekspedicijos nustatymai'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


def company_logo_upload_path(instance, filename):
    """Grąžina kelio linką įmonės logotipui"""
    ext = filename.split('.')[-1]
    return f'company_logos/logo_{instance.pk}.{ext}'


def user_signature_upload_path(instance, filename):
    """Grąžina kelio linką vartotojo parašo/stampo paveikslėliui"""
    ext = filename.split('.')[-1]
    return f'user_signatures/signature_{instance.user_id}_{instance.pk}.{ext}'


class CompanyInfo(models.Model):
    """Įmonės rekvizitų modelis (vienas įrašas visai sistemai)"""
    
    name = models.CharField(max_length=255, verbose_name=_('Įmonės pavadinimas'))
    code = models.CharField(max_length=50, verbose_name=_('Įmonės kodas'))
    vat_code = models.CharField(max_length=50, blank=True, verbose_name=_('PVM kodas'))
    address = models.TextField(verbose_name=_('Adresas'))
    correspondence_address = models.TextField(
        blank=True,
        verbose_name=_('Adresas korespondencijai'),
        help_text=_('Jei nenurodytas, bus naudojamas pagrindinis adresas')
    )
    city = models.CharField(max_length=100, verbose_name=_('Miestas'))
    postal_code = models.CharField(max_length=20, blank=True, verbose_name=_('Pašto kodas'))
    country = models.CharField(max_length=100, default='Lietuva', verbose_name=_('Šalis'))
    phone = models.CharField(max_length=50, blank=True, verbose_name=_('Telefonas'))
    email = models.EmailField(blank=True, verbose_name=_('El. paštas'))
    bank_name = models.CharField(max_length=255, blank=True, verbose_name=_('Banko pavadinimas'))
    bank_account = models.CharField(max_length=50, blank=True, verbose_name=_('Banko sąskaita'))
    bank_code = models.CharField(max_length=20, blank=True, verbose_name=_('Banko kodas'))
    logo = models.ImageField(
        upload_to=company_logo_upload_path,
        null=True,
        blank=True,
        verbose_name=_('Logotipas'),
        help_text=_('Įmonės logotipas, kuris bus rodomas sąskaitose')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'company_info'
        verbose_name = _('Įmonės informacija')
        verbose_name_plural = _('Įmonės informacija')
    
    def __str__(self):
        return self.name or ''
    
    def save(self, *args, **kwargs):
        # Užtikrinti, kad bus tik vienas įrašas - perrašyti esamą
        self.pk = 1
        
        # Jei keičiamas logotipas, ištrinti seną
        if self.pk:
            try:
                old_instance = CompanyInfo.objects.get(pk=self.pk)
                if old_instance.logo and old_instance.logo != self.logo:
                    # Ištrinti seną logotipo failą
                    if os.path.isfile(old_instance.logo.path):
                        os.remove(old_instance.logo.path)
            except CompanyInfo.DoesNotExist:
                pass
        
        super().save(*args, **kwargs)
    
    @classmethod
    def load(cls):
        """Grąžina vienintelį įrašą arba sukuria naują (visada naudojame default DB)."""
        obj, created = cls.objects.using('default').get_or_create(pk=1)
        return obj


class UserSettings(models.Model):
    """Vartotojo nustatymų modelis"""
    
    user = models.OneToOneField(
        'tms_auth.User',
        on_delete=models.CASCADE,
        related_name='user_settings',
        verbose_name=_('Vartotojas')
    )
    # Asmeninė informacija
    first_name = models.CharField(
        max_length=150,
        blank=True,
        verbose_name=_('Vardas')
    )
    last_name = models.CharField(
        max_length=150,
        blank=True,
        verbose_name=_('Pavardė')
    )
    email = models.EmailField(
        blank=True,
        verbose_name=_('El. paštas')
    )
    phone = models.CharField(
        max_length=20,
        blank=True,
        verbose_name=_('Telefonas')
    )
    signature_image = models.ImageField(
        upload_to=user_signature_upload_path,
        null=True,
        blank=True,
        verbose_name=_('Parašo/Stampo paveikslėlis'),
        help_text=_('Parašo arba stampo paveikslėlis, naudojamas dokumentuose')
    )
    # Nustatymai
    language = models.CharField(
        max_length=10,
        default='lt',
        choices=[('lt', 'Lietuvių'), ('en', 'English')],
        verbose_name=_('Kalba')
    )
    date_format = models.CharField(
        max_length=20,
        default='YYYY-MM-DD',
        choices=[
            ('YYYY-MM-DD', 'YYYY-MM-DD'),
            ('DD/MM/YYYY', 'DD/MM/YYYY'),
            ('MM/DD/YYYY', 'MM/DD/YYYY'),
        ],
        verbose_name=_('Datos formatas')
    )
    timezone = models.CharField(
        max_length=50,
        default='Europe/Vilnius',
        verbose_name=_('Laiko juosta')
    )
    items_per_page = models.IntegerField(
        default=100,
        verbose_name=_('Elementų per puslapį')
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'user_settings'
        verbose_name = _('Vartotojo nustatymai')
        verbose_name_plural = _('Vartotojo nustatymai')
    
    def __str__(self):
        username = getattr(self.user, 'username', None)
        return f"{username} nustatymai" if username else 'Nustatymai'


class InvoiceSettings(models.Model):
    """Sąskaitų nustatymų modelis (vienas įrašas visai sistemai)"""
    
    default_vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=21.00,
        verbose_name=_('Numatytasis PVM tarifas (%)')
    )
    default_payment_term_days = models.IntegerField(
        default=30,
        verbose_name=_('Numatytasis mokėjimo terminas (dienos)')
    )
    invoice_prefix_sales = models.CharField(
        max_length=10,
        default='LOG',
        verbose_name=_('Pardavimo sąskaitų prefiksas')
    )
    invoice_number_width = models.IntegerField(
        default=7,
        validators=[MinValueValidator(1), MaxValueValidator(10)],
        verbose_name=_('Sąskaitos numerio skaitmenų skaičius')
    )
    invoice_footer_text = models.TextField(
        blank=True,
        verbose_name=_('Sąskaitos apačios tekstas')
    )
    auto_numbering = models.BooleanField(
        default=True,
        verbose_name=_('Automatinis numeravimas')
    )
    # Valiutos ir skaičių formatavimas
    currency_code = models.CharField(
        max_length=10,
        default='EUR',
        verbose_name=_('Valiutos kodas'),
        help_text=_('Pvz.: EUR, USD, GBP')
    )
    currency_symbol = models.CharField(
        max_length=10,
        default='€',
        blank=True,
        verbose_name=_('Valiutos simbolis'),
        help_text=_('Pvz.: €, $, £. Jei tuščias, rodomas valiutos kodas.')
    )
    decimal_places = models.IntegerField(
        default=2,
        validators=[MinValueValidator(0), MaxValueValidator(6)],
        verbose_name=_('Skaitmenų po kablelio'),
        help_text=_('Kiek skaitmenų po kablelio rodyti sumoms (0–6).')
    )
    decimal_separator = models.CharField(
        max_length=1,
        default=',',
        choices=[(',', _('Kablelis (,)')), ('.', _('Taškas (.)'))],
        verbose_name=_('Dešimtainis skyriklis')
    )
    # Rodymo pasirinkimai pagal nutylėjimą
    default_display_options = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Numatytieji rodymo pasirinkimai'),
        help_text=_('JSON objektas su numatytosiomis vertėmis, ką rodyti sąskaitoje: '
                   '{"show_cargo_info": true, "show_cargo_weight": true, ...}')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'invoice_settings'
        verbose_name = _('Sąskaitų nustatymai')
        verbose_name_plural = _('Sąskaitų nustatymai')
    
    def __str__(self):
        return 'Sąskaitų nustatymai'
    
    def save(self, *args, **kwargs):
        # Užtikrinti, kad bus tik vienas įrašas
        self.pk = 1
        super().save(*args, **kwargs)
    
    @classmethod
    def load(cls):
        """Grąžina vienintelį įrašą arba sukuria naują"""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj


class UISettings(models.Model):
    """UI nustatymų modelis - statusų spalvų nustatymai (vienas įrašas visai sistemai)"""
    
    # Spalviniai nustatymai pagal būsenas
    status_colors = models.JSONField(
        default=dict,
        blank=True,
        verbose_name=_('Statusų spalvos'),
        help_text=_('JSON objektas su spalvomis pagal statusus: '
                   '{"invoices": {"paid": "#28a745", "not_paid": "#dc3545", ...}, '
                   '"expeditions": {"new": "#17a2b8", ...}, '
                   '"orders": {"new": "#17a2b8", ...}, '
                   '"payment_colors": {"no_invoice": "#000000", "unpaid": "#dc3545", "partially_paid": "#ffc107", "paid": "#28a745"}}')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'ui_settings'
        verbose_name = _('UI nustatymai')
        verbose_name_plural = _('UI nustatymai')
    
    def __str__(self):
        return 'UI nustatymai'
    
    def save(self, *args, **kwargs):
        # Užtikrinti, kad bus tik vienas įrašas
        self.pk = 1
        super().save(*args, **kwargs)
    
    @classmethod
    def load(cls):
        """Grąžina vienintelį įrašą arba sukuria naują su default reikšmėmis"""
        obj, created = cls.objects.get_or_create(
            pk=1,
            defaults={
                'status_colors': {
                    'invoices': {
                        'paid': '#28a745',
                        'not_paid': '#dc3545',
                        'partially_paid': '#ffc107',
                        'overdue': '#fd7e14',
                    },
                    'expeditions': {
                        'new': '#17a2b8',
                        'in_progress': '#007bff',
                        'completed': '#28a745',
                        'cancelled': '#dc3545',
                    },
                    'orders': {
                        'new': '#17a2b8',
                        'assigned': '#ffc107',
                        'executing': '#007bff',
                        'waiting_for_docs': '#ffc107',
                        'waiting_for_payment': '#ffc107',
                        'finished': '#28a745',
                        'closed': '#28a745',
                        'canceled': '#dc3545',
                    },
                    'payment_colors': {
                        'no_invoice': '#000000',
                        'unpaid': '#dc3545',
                        'partially_paid': '#ffc107',
                        'paid': '#28a745',
                    }
                }
            }
        )
        return obj


class PVMRate(models.Model):
    """PVM tarifų su straipsniais modelis - galima turėti kelis variantus"""
    rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name=_('PVM tarifas (%)')
    )
    article = models.CharField(
        max_length=255,
        verbose_name=_('Straipsnis (LT)'),
        help_text=_('PVM įstatymo straipsnis lietuvių kalba (pvz. 5 str. 7 d., 6 str., ir t.t.)'),
        blank=True
    )
    article_en = models.CharField(
        max_length=255,
        verbose_name=_('Straipsnis (EN)'),
        help_text=_('PVM įstatymo straipsnis anglų kalba'),
        blank=True,
        default=''
    )
    article_ru = models.CharField(
        max_length=255,
        verbose_name=_('Straipsnis (RU)'),
        help_text=_('PVM įstatymo straipsnis rusų kalba'),
        blank=True,
        default=''
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name=_('Aktyvus'),
        help_text=_('Jei neaktyvus, nebus rodomas sąskaitų formose')
    )
    sequence_order = models.IntegerField(
        default=0,
        verbose_name=_('Eiliškumas'),
        help_text=_('Nustato tvarką rodant sąraše')
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'pvm_rates'
        verbose_name = _('PVM tarifas su straipsniu')
        verbose_name_plural = _('PVM tarifai su straipsniais')
        ordering = ['sequence_order', 'rate']
    
    def __str__(self):
        article_text = f" ({self.article})" if self.article else ""
        return f"{self.rate}%{article_text}"


class NotificationSettings(models.Model):
    """Pranešimų nustatymų modelis (vienas įrašas visai sistemai)"""
    
    # SMTP nustatymai
    smtp_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Įjungti el. laiškų siuntimą'),
        help_text=_('Jei įjungta, sistema siųs el. laiškus')
    )
    smtp_host = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('SMTP serveris'),
        help_text=_('Pvz.: smtp.gmail.com')
    )
    smtp_port = models.IntegerField(
        default=587,
        validators=[MinValueValidator(1), MaxValueValidator(65535)],
        verbose_name=_('SMTP portas'),
        help_text=_('Dažniausiai: 587 (TLS) arba 465 (SSL)')
    )
    smtp_use_tls = models.BooleanField(
        default=True,
        verbose_name=_('Naudoti TLS'),
        help_text=_('Jei ne, naudojamas SSL')
    )
    smtp_username = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('SMTP naudotojas')
    )
    smtp_password = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('SMTP slaptažodis'),
        help_text=_('Saugojamas užšifruotas')
    )
    smtp_from_email = models.EmailField(
        blank=True,
        verbose_name=_('Numatytasis siuntėjas (el. paštas)')
    )
    smtp_from_name = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('Numatytasis siuntėjas (vardas)')
    )

    # IMAP nustatymai (gaunami laiškai)
    imap_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Įjungti gaunamų laiškų sinchronizavimą'),
        help_text=_('Jei įjungta, sistema periodiškai tikrins pašto dėžutę per IMAP')
    )
    imap_host = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('IMAP serveris'),
        help_text=_('Pvz.: imap.serveris.lt')
    )
    imap_port = models.IntegerField(
        default=993,
        validators=[MinValueValidator(1), MaxValueValidator(65535)],
        verbose_name=_('IMAP portas'),
        help_text=_('Dažniausiai: 993 (SSL) arba 143 (STARTTLS)')
    )
    imap_use_ssl = models.BooleanField(
        default=True,
        verbose_name=_('Naudoti SSL'),
        help_text=_('Jei išjungta, bus bandoma naudoti paprastą prisijungimą arba STARTTLS')
    )
    imap_use_starttls = models.BooleanField(
        default=False,
        verbose_name=_('Naudoti STARTTLS'),
        help_text=_('Galima įjungti, jei serveris palaiko STARTTLS (naudojama kai SSL išjungtas)')
    )
    imap_username = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('IMAP naudotojas')
    )
    imap_password = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('IMAP slaptažodis'),
        help_text=_('Saugojamas užšifruotas')
    )
    imap_folder = models.CharField(
        max_length=255,
        default='INBOX',
        verbose_name=_('IMAP aplankas'),
        help_text=_('Kurį aplanką sinchronizuoti, pvz. INBOX')
    )
    imap_sync_interval_minutes = models.IntegerField(
        default=5,
        validators=[MinValueValidator(1), MaxValueValidator(1440)],
        verbose_name=_('IMAP sinchronizavimo intervalas (minutės)'),
        help_text=_('Kas kiek minučių foniniu režimu sinchronizuoti IMAP (1–1440 minučių)')
    )
    
    # Automatiniai el. laiškų pranešimai - SĄSKAITOS
    # Artėja terminas apmokėjimui
    email_notify_due_soon_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Siųsti priminimą apie artėjantį terminą'),
        help_text=_('Automatiškai siųsti priminimus apie artėjantį apmokėjimo terminą')
    )
    email_notify_due_soon_days_before = models.IntegerField(
        default=3,
        validators=[MinValueValidator(0), MaxValueValidator(30)],
        verbose_name=_('Priminimas X dienų prieš terminą'),
        help_text=_('Kiek dienų prieš terminą siųsti priminimą')
    )
    email_notify_due_soon_recipient = models.CharField(
        max_length=20,
        default='client',
        choices=[
            ('client', _('Klientui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (artėja terminas)'),
        help_text=_('Kam siųsti priminimą apie artėjantį terminą')
    )
    email_notify_due_soon_min_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_('Minimali suma (artėja terminas)'),
        help_text=_('Siųsti tik jei suma didesnė už nurodytą (0 = be apribojimų)')
    )
    
    # Neapmokėta sąskaita
    email_notify_unpaid_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Siųsti priminimą apie neapmokėtas sąskaitas'),
        help_text=_('Periodiškai siųsti priminimus apie neapmokėtas sąskaitas')
    )
    email_notify_unpaid_interval_days = models.IntegerField(
        default=7,
        validators=[MinValueValidator(1), MaxValueValidator(30)],
        verbose_name=_('Priminimo intervalas (dienos)'),
        help_text=_('Kas kiek dienų siųsti priminimą')
    )
    email_notify_unpaid_recipient = models.CharField(
        max_length=20,
        default='client',
        choices=[
            ('client', _('Klientui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (neapmokėta)'),
        help_text=_('Kam siųsti priminimą apie neapmokėtas sąskaitas')
    )
    email_notify_unpaid_min_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_('Minimali suma (neapmokėta)'),
        help_text=_('Siųsti tik jei suma didesnė už nurodytą (0 = be apribojimų)')
    )
    
    # Vėluojama apmokėti
    email_notify_overdue_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Siųsti priminimą apie vėluojančias sąskaitas'),
        help_text=_('Automatiškai siųsti priminimus apie vėluojančias sąskaitas')
    )
    email_notify_overdue_min_days = models.IntegerField(
        default=1,
        validators=[MinValueValidator(0), MaxValueValidator(365)],
        verbose_name=_('Minimalus vėlavimas (dienos)'),
        help_text=_('Siųsti tik jei vėlavimas didesnis už nurodytą dienų skaičių')
    )
    email_notify_overdue_max_days = models.IntegerField(
        default=365,
        validators=[MinValueValidator(0), MaxValueValidator(365)],
        verbose_name=_('Maksimalus vėlavimas (dienos)'),
        help_text=_('Siųsti tik jei vėlavimas mažesnis už nurodytą dienų skaičių (0 = be apribojimų)')
    )
    email_notify_overdue_interval_days = models.IntegerField(
        default=7,
        validators=[MinValueValidator(1), MaxValueValidator(30)],
        verbose_name=_('Priminimo intervalas (dienos)'),
        help_text=_('Kas kiek dienų siųsti priminimą')
    )
    email_notify_overdue_recipient = models.CharField(
        max_length=20,
        default='client',
        choices=[
            ('client', _('Klientui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (vėluojama)'),
        help_text=_('Kam siųsti priminimą apie vėluojančias sąskaitas')
    )
    email_notify_overdue_min_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_('Minimali suma (vėluojama)'),
        help_text=_('Siųsti tik jei suma didesnė už nurodytą (0 = be apribojimų)')
    )
    overdue_reminder_mode = models.CharField(
        max_length=20,
        default='automatic',
        choices=[
            ('automatic', _('Automatinis')),
            ('manual', _('Rankinis')),
            ('both', _('Automatinis ir rankinis')),
        ],
        verbose_name=_('Priminimų siuntimo būdas (vėluojama)'),
        help_text=_('Kaip siųsti priminimus apie vėluojančias sąskaitas')
    )
    
    # UŽSAKYMAI
    email_notify_new_order_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Pranešti apie naujus užsakymus'),
        help_text=_('Siųsti pranešimą apie naują užsakymą')
    )
    email_notify_new_order_recipient = models.CharField(
        max_length=20,
        default='manager',
        choices=[
            ('client', _('Klientui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (naujas užsakymas)'),
        help_text=_('Kam siųsti pranešimą apie naują užsakymą')
    )
    
    email_notify_order_status_changed_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Pranešti apie užsakymo statuso pakeitimą'),
        help_text=_('Siųsti pranešimą kai užsakymo statusas pasikeičia')
    )
    email_notify_order_status_changed_recipient = models.CharField(
        max_length=20,
        default='manager',
        choices=[
            ('client', _('Klientui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (statuso pakeitimas)'),
        help_text=_('Kam siųsti pranešimą apie užsakymo statuso pakeitimą')
    )
    
    # EKSPEDICIJOS
    email_notify_new_expedition_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Pranešti apie naujas ekspedicijas'),
        help_text=_('Siųsti pranešimą apie naują ekspediciją')
    )
    email_notify_new_expedition_recipient = models.CharField(
        max_length=20,
        default='manager',
        choices=[
            ('carrier', _('Vežėjui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (nauja ekspedicija)'),
        help_text=_('Kam siųsti pranešimą apie naują ekspediciją')
    )
    
    email_notify_expedition_status_changed_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Pranešti apie ekspedicijos statuso pakeitimą'),
        help_text=_('Siųsti pranešimą kai ekspedicijos statusas pasikeičia')
    )
    email_notify_expedition_status_changed_recipient = models.CharField(
        max_length=20,
        default='manager',
        choices=[
            ('carrier', _('Vežėjui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (ekspedicijos statuso pakeitimas)'),
        help_text=_('Kam siųsti pranešimą apie ekspedicijos statuso pakeitimą')
    )
    
    # MOKĖJIMAI
    email_notify_payment_received_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Pranešti apie gautus mokėjimus'),
        help_text=_('Siųsti pranešimą kai gautas mokėjimas')
    )
    email_notify_payment_received_recipient = models.CharField(
        max_length=20,
        default='manager',
        choices=[
            ('client', _('Klientui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (gautas mokėjimas)'),
        help_text=_('Kam siųsti pranešimą apie gautą mokėjimą')
    )
    email_notify_payment_received_min_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_('Minimali suma (mokėjimas)'),
        help_text=_('Siųsti tik jei suma didesnė už nurodytą (0 = be apribojimų)')
    )
    
    email_notify_partial_payment_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Pranešti apie dalinius mokėjimus'),
        help_text=_('Siųsti pranešimą kai gautas dalinis mokėjimas')
    )
    email_notify_partial_payment_recipient = models.CharField(
        max_length=20,
        default='manager',
        choices=[
            ('client', _('Klientui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (dalinis mokėjimas)'),
        help_text=_('Kam siųsti pranešimą apie dalinį mokėjimą')
    )
    
    # KRITINĖS SĄSKAITOS
    email_notify_high_amount_invoice_enabled = models.BooleanField(
        default=False,
        verbose_name=_('Pranešti apie didelės sumos sąskaitas'),
        help_text=_('Siųsti pranešimą apie sąskaitas, kurių suma viršija nustatytą ribą')
    )
    email_notify_high_amount_threshold = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=10000,
        validators=[MinValueValidator(0)],
        verbose_name=_('Sumos riba'),
        help_text=_('Siųsti pranešimą jei sąskaitos suma viršija šią ribą')
    )
    email_notify_high_amount_recipient = models.CharField(
        max_length=20,
        default='manager',
        choices=[
            ('client', _('Klientui')),
            ('manager', _('Vadybininkui')),
            ('both', _('Abiems')),
        ],
        verbose_name=_('Kam siųsti (didelė suma)'),
        help_text=_('Kam siųsti pranešimą apie didelės sumos sąskaitas')
    )
    
    # El. laiškų pasirašymas ir pranešimai
    email_signature = models.CharField(
        max_length=255,
        default='TMS Sistema',
        verbose_name=_('El. laiškų pasirašymas'),
        help_text=_('Pasirašymas, kuris bus naudojamas el. laiškuose (pvz.: "Loglena, UAB - TMS Sistema")')
    )
    email_auto_generated_notice = models.TextField(
        default='Šis laiškas sugeneruotas automatiškai. Į jį atsakyti nereikia.',
        verbose_name=_('Pranešimas apie automatinį generavimą'),
        help_text=_('Pranešimas, kuris bus pridėtas į automatiškai sugeneruotus el. laiškus')
    )
    email_contact_manager_notice = models.TextField(
        default='Kilus neaiškumams kreipkitės į vadybininką.',
        verbose_name=_('Pranešimas apie vadybininką'),
        help_text=_('Pranešimas apie vadybininką, kuris bus pridėtas į el. laiškus (vadybininkas bus nustatomas pagal užsakymą/sąskaitą)')
    )
    
    # Testavimo režimas el. laiškams
    email_test_mode = models.BooleanField(
        default=False,
        verbose_name=_('Testavimo režimas'),
        help_text=_('Jei įjungtas, visi automatiniai el. laiškai bus siunčiami į testavimo adresą, o ne tikriems gavėjams')
    )
    email_test_recipient = models.EmailField(
        max_length=255,
        default='info@hotmail.lt',
        blank=True,
        verbose_name=_('Testavimo adresas'),
        help_text=_('El. pašto adresas, į kurį bus siunčiami visi laiškai testavimo režime')
    )
    
    # UI pranešimų (Toast) nustatymai
    toast_duration_ms = models.IntegerField(
        default=3500,
        validators=[MinValueValidator(1000), MaxValueValidator(10000)],
        verbose_name=_('Pranešimų trukmė (milisekundės)'),
        help_text=_('Kiek laiko rodyti pranešimą (1000-10000 ms)')
    )
    toast_position = models.CharField(
        max_length=20,
        default='center',
        choices=[
            ('top', _('Viršuje')),
            ('center', _('Centre')),
            ('bottom', _('Apačioje')),
        ],
        verbose_name=_('Pranešimų pozicija')
    )
    toast_enable_sound = models.BooleanField(
        default=False,
        verbose_name=_('Garso signalas'),
        help_text=_('Groti garso signalą rodant pranešimą')
    )
    toast_success_color = models.CharField(
        max_length=7,
        default='#28a745',
        verbose_name=_('Sėkmės pranešimų spalva'),
        help_text=_('Hex spalvos kodas, pvz.: #28a745')
    )
    toast_error_color = models.CharField(
        max_length=7,
        default='#dc3545',
        verbose_name=_('Klaidos pranešimų spalva'),
        help_text=_('Hex spalvos kodas, pvz.: #dc3545')
    )
    toast_info_color = models.CharField(
        max_length=7,
        default='#17a2b8',
        verbose_name=_('Informacijos pranešimų spalva'),
        help_text=_('Hex spalvos kodas, pvz.: #17a2b8')
    )
    
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'notification_settings'
        verbose_name = _('Pranešimų nustatymai')
        verbose_name_plural = _('Pranešimų nustatymai')
    
    def __str__(self):
        return 'Pranešimų nustatymai'
    
    def save(self, *args, **kwargs):
        # Užtikrinti, kad bus tik vienas įrašas
        self.pk = 1
        super().save(*args, **kwargs)
    
    @classmethod
    def load(cls):
        """Grąžina vienintelį įrašą arba sukuria naują"""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj


class EmailTemplate(models.Model):
    """El. laiškų šablonų modelis"""
    
    class TemplateType(models.TextChoices):
        REMINDER_DUE_SOON = 'reminder_due_soon', _('Artėja terminas apmokėjimui')
        REMINDER_UNPAID = 'reminder_unpaid', _('Neapmokėta sąskaita')
        REMINDER_OVERDUE = 'reminder_overdue', _('Vėluojama apmokėti sąskaita')
        ORDER_TO_CLIENT = 'order_to_client', _('Užsakymas klientui')
        ORDER_TO_CARRIER = 'order_to_carrier', _('Užsakymas vežėjui')
        INVOICE_TO_CLIENT = 'invoice_to_client', _('Sąskaita klientui')
    
    template_type = models.CharField(
        max_length=50,
        choices=TemplateType.choices,
        unique=True,
        verbose_name=_('Šablono tipas')
    )
    _VARS_HELP = _(
        'Kintamieji pagal šabloną. '
        'Sąskaita/priminimai: {invoice_number}, {order_number}, {client_order_number}, {partner_name}, {amount}, {amount_net}, {amount_total}, {vat_rate}, {issue_date}, {due_date}, {overdue_days}, {payment_status}, {manager_name}, {other_unpaid_invoices}, {route_from}, {route_to}, {loading_date}, {unloading_date}, {order_date}. '
        'Užsakymas klientui/vežėjui: {order_number}, {client_order_number}, {order_date}, {partner_name}, {partner_code}, {partner_vat_code}, {route_from}, {route_to}, {loading_date}, {unloading_date}, {price_net}, {price_with_vat}, {manager_name}; vežėjui dar {expedition_number}.'
    )
    subject = models.CharField(
        max_length=512,
        verbose_name=_('Antraštė'),
        help_text=_VARS_HELP
    )
    body_text = models.TextField(
        verbose_name=_('Turinys (tekstas)'),
        help_text=_VARS_HELP
    )
    body_html = models.TextField(
        blank=True,
        verbose_name=_('Turinys (HTML)'),
        help_text=_('El. laiško turinys HTML formatu. Naudokite tuos pačius kintamuosius kaip tekste. Jei tuščias, bus naudojamas tekstinis turinys.')
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name=_('Aktyvus'),
        help_text=_('Jei neaktyvus, bus naudojamas numatytasis šablonas')
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'email_templates'
        verbose_name = _('El. laiško šablonas')
        verbose_name_plural = _('El. laiškų šablonai')
        ordering = ['template_type']
    
    def __str__(self):
        return self.get_template_type_display()
    
    @classmethod
    def get_template(cls, template_type: str, lang: str = 'lt'):
        """Grąžina šabloną pagal tipą arba numatytąjį"""
        try:
            # Kol kas modelis neturi lang lauko, tad grąžiname numatytąjį su vertimais
            # Ateityje čia bus galima ieškoti šablono pagal tipą IR kalbą DB
            template = cls.objects.get(template_type=template_type, is_active=True)
            
            # Jei kalba ne lietuvių, o šablonas yra aktyvus, bet mes norime vertimo,
            # šiuo metu turime grąžinti numatytąjį vertimą, nes DB nėra vietos kitiems vertimams.
            if lang and lang.lower() != 'lt':
                return cls._get_default_template(template_type, lang=lang)
                
            return template
        except cls.DoesNotExist:
            # Grąžinti numatytąjį šabloną
            return cls._get_default_template(template_type, lang=lang)
    
    @classmethod
    def _get_default_template(cls, template_type: str, lang: str = 'lt'):
        """Grąžina numatytąjį šabloną pagal tipą ir kalbą"""
        lang = lang.lower() if lang else 'lt'
        
        defaults_lt = {
            'reminder_due_soon': {
                'subject': 'Priminimas: artėja terminas apmokėjimui - {invoice_number}',
                'body_text': 'Sveiki,\n\nPrimename, kad artėja Jūsų sąskaitos {invoice_number} apmokėjimo terminas.\n\nDetalės:\n- Sąskaitos numeris: {invoice_number}\n- Suma: {amount} EUR\n- Mokėjimo terminas: {due_date}\n\nPrašome sumokėti sąskaitą laiku.'
            },
            'reminder_unpaid': {
                'subject': 'Priminimas: neapmokėta sąskaita {invoice_number}',
                'body_text': 'Sveiki,\n\nPrimename, kad Jūsų sąskaita {invoice_number} dar nėra apmokėta.\n\nDetalės:\n- Sąskaitos numeris: {invoice_number}\n- Suma: {amount} EUR\n- Mokėjimo terminas: {due_date}\n\nPrašome sumokėti sąskaitą kuo greičiau.'
            },
            'reminder_overdue': {
                'subject': 'Priminimas: vėluojama apmokėti sąskaitą {invoice_number}',
                'body_text': 'Sveiki,\n\nPrimename, kad Jūsų sąskaita {invoice_number} yra vėluojanti.\n\nDetalės:\n- Sąskaitos numeris: {invoice_number}\n- Suma: {amount} EUR\n- Vėlavimo dienos: {overdue_days}\n- Mokėjimo terminas: {due_date}\n\nPrašome sumokėti sąskaitą kuo greičiau.'
            },
            'order_to_client': {
                'subject': 'Užsakymo sutartis {order_number}',
                'body_text': 'Sveiki,\n\nPridedame užsakymo sutarties PDF dokumentą.\n\nUžsakymo numeris: {order_number}\nData: {order_date}'
            },
            'order_to_carrier': {
                'subject': 'Vežėjo sutartis {order_number}',
                'body_text': 'Sveiki,\n\nPridėjame vežėjo sutartį užsakymui {order_number}.'
            },
            'invoice_to_client': {
                'subject': 'Sąskaita {invoice_number}',
                'body_text': 'Sveiki,\n\nPridėjame Jūsų sąskaitą {invoice_number}.\n\nDetalės:\n- Sąskaitos numeris: {invoice_number}\n- Suma: {amount} EUR\n- Mokėjimo terminas: {due_date}'
            }
        }
        
        defaults_en = {
            'reminder_due_soon': {
                'subject': 'Reminder: payment due soon - {invoice_number}',
                'body_text': 'Hello,\n\nThis is a reminder that the payment for invoice {invoice_number} is due soon.\n\nDetails:\n- Invoice number: {invoice_number}\n- Amount: {amount} EUR\n- Due date: {due_date}\n\nPlease ensure timely payment.'
            },
            'reminder_unpaid': {
                'subject': 'Reminder: unpaid invoice {invoice_number}',
                'body_text': 'Hello,\n\nThis is a reminder that invoice {invoice_number} is still unpaid.\n\nDetails:\n- Invoice number: {invoice_number}\n- Amount: {amount} EUR\n- Due date: {due_date}\n\nPlease arrange payment as soon as possible.'
            },
            'reminder_overdue': {
                'subject': 'Reminder: overdue invoice {invoice_number}',
                'body_text': 'Hello,\n\nThis is a reminder that invoice {invoice_number} is overdue.\n\nDetails:\n- Invoice number: {invoice_number}\n- Amount: {amount} EUR\n- Overdue days: {overdue_days}\n- Due date: {due_date}\n\nPlease arrange payment immediately.'
            },
            'order_to_client': {
                'subject': 'Transportation Order {order_number}',
                'body_text': 'Hello,\n\nPlease find the attached transportation order (PDF).\n\nOrder number: {order_number}\nDate: {order_date}'
            },
            'order_to_carrier': {
                'subject': 'Carrier Agreement {order_number}',
                'body_text': 'Hello,\n\nPlease find the attached carrier agreement for order {order_number}.'
            },
            'invoice_to_client': {
                'subject': 'Invoice {invoice_number}',
                'body_text': 'Hello,\n\nPlease find the attached invoice {invoice_number}.\n\nDetails:\n- Invoice number: {invoice_number}\n- Amount: {amount} EUR\n- Due date: {due_date}'
            }
        }
        
        defaults_ru = {
            'reminder_due_soon': {
                'subject': 'Напоминание: приближается срок оплаты - {invoice_number}',
                'body_text': 'Здравствуйте,\n\nНапоминаем, что приближается срок оплаты счета {invoice_number}.\n\nДетали:\n- Номер счета: {invoice_number}\n- Сумма: {amount} EUR\n- Срок оплаты: {due_date}\n\nПожалуйста, оплатите счет вовремя.'
            },
            'reminder_unpaid': {
                'subject': 'Напоминание: неоплаченный счет {invoice_number}',
                'body_text': 'Здравствуйте,\n\nНапоминаем, что счет {invoice_number} еще не оплачен.\n\nДетали:\n- Номер счета: {invoice_number}\n- Сумма: {amount} EUR\n- Срок оплаты: {due_date}\n\nПожалуйста, оплатите счет как можно скорее.'
            },
            'reminder_overdue': {
                'subject': 'Напоминание: просроченный счет {invoice_number}',
                'body_text': 'Здравствуйте,\n\nНапоминаем, что оплата счета {invoice_number} просрочена.\n\nДетали:\n- Номер счета: {invoice_number}\n- Сумма: {amount} EUR\n- Дней просрочки: {overdue_days}\n- Срок оплаты: {due_date}\n\nПожалуйста, оплатите счет немедленно.'
            },
            'order_to_client': {
                'subject': 'Договор-заказ на перевозку {order_number}',
                'body_text': 'Здравствуйте,\n\nВо вложении находится договор-заказ на перевозку (PDF).\n\nНомер заказа: {order_number}\nДата: {order_date}'
            },
            'order_to_carrier': {
                'subject': 'Договор с перевозчиком {order_number}',
                'body_text': 'Здравствуйте,\n\nВо вложении находится договор с перевозчиком для заказа {order_number}.'
            },
            'invoice_to_client': {
                'subject': 'Счет {invoice_number}',
                'body_text': 'Здравствуйте,\n\nВо вложении находится ваш счет {invoice_number}.\n\nДетали:\n- Номер счета: {invoice_number}\n- Сумма: {amount} EUR\n- Срок оплаты: {due_date}'
            }
        }
        
        all_defaults = {
            'lt': defaults_lt,
            'en': defaults_en,
            'ru': defaults_ru
        }
        
        lang_defaults = all_defaults.get(lang, defaults_lt)
        
        data = lang_defaults.get(template_type, {
            'subject': 'El. laiškas iš TMS sistemos' if lang == 'lt' else ('Email from TMS system' if lang == 'en' else 'Электронное письмо из системы TMS'),
            'body_text': 'Sveiki,\n\nJūs gavote el. laišką iš TMS sistemos.' if lang == 'lt' else ('Hello,\n\nYou have received an email from TMS system.' if lang == 'en' else 'Здравствуйте,\n\nВы получили электронное письмо из системы TMS.')
        })
        
        # Sukurti pseudo-objektą su numatytomis reikšmėmis
        class DefaultTemplate:
            def __init__(self, data):
                self.subject = data['subject']
                self.body_text = data['body_text']
                self.body_html = data.get('body_html', '')
        
        return DefaultTemplate(data)


class OrderAutoStatusSettings(models.Model):
    """Automatinio užsakymų statusų keitimo nustatymai"""
    
    # Ar įjungtas automatinis statusų keitimas
    enabled = models.BooleanField(
        default=True,
        verbose_name=_('Įjungti automatinį statusų keitimą'),
        help_text=_('Jei įjungta, užsakymų statusai bus keičiami automatiškai pagal datas ir kitus kriterijus')
    )
    
    # Taisyklės pagal vartotojo reikalavimus:
    # 1. new -> assigned: kai atsiranda vežėjas
    # 2. assigned -> executing: jei data tarp pakrovimo ir iškrovimo
    # 3. executing -> waiting_for_docs: jei data vėliau iškrovimo
    # 4. waiting_for_docs -> waiting_for_payment: jei dokumentai gauti ir sąskaita išsiųsta
    # 5. waiting_for_payment -> finished: jei apmokėjimas iš kliento gautas
    # 6. finished -> closed: kai sumokėta vežėjui
    
    # Ar automatiškai keisti iš "new" į "assigned" kai atsiranda vežėjas
    auto_new_to_assigned = models.BooleanField(
        default=True,
        verbose_name=_('Automatiškai keisti iš "Naujas" į "Priskirtas"'),
        help_text=_('Kai užsakymui priskiriamas vežėjas, automatiškai keisti statusą į "Priskirtas"')
    )
    
    # Ar automatiškai keisti iš "assigned" į "executing" kai data tarp pakrovimo ir iškrovimo
    auto_assigned_to_executing = models.BooleanField(
        default=True,
        verbose_name=_('Automatiškai keisti iš "Priskirtas" į "Vykdomas"'),
        help_text=_('Kai šiandien yra tarp pakrovimo ir iškrovimo datų, automatiškai keisti statusą į "Vykdomas"')
    )
    
    # Ar automatiškai keisti iš "executing" į "waiting_for_docs" kai unloading_date < today
    auto_executing_to_waiting = models.BooleanField(
        default=True,
        verbose_name=_('Automatiškai keisti iš "Vykdomas" į "Laukiama Dokumentų"'),
        help_text=_('Kai iškrovimo data praėjo, automatiškai keisti statusą į "Laukiama Dokumentų"')
    )
    
    # Ar automatiškai keisti iš "waiting_for_docs" į "waiting_for_payment" kai dokumentai gauti ir sąskaita išsiųsta
    auto_waiting_to_payment = models.BooleanField(
        default=True,
        verbose_name=_('Automatiškai keisti iš "Laukiama Dokumentų" į "Laukiama Apmokėjimo"'),
        help_text=_('Kai visi dokumentai gauti iš vežėjo ir sąskaita išsiųsta užsakovui, automatiškai keisti statusą į "Laukiama Apmokėjimo"')
    )
    
    # Ar automatiškai keisti iš "waiting_for_payment" į "finished" kai klientas apmokėjo
    auto_payment_to_finished = models.BooleanField(
        default=True,
        verbose_name=_('Automatiškai keisti iš "Laukiama Apmokėjimo" į "Baigtas"'),
        help_text=_('Kai apmokėjimas iš kliento gautas, automatiškai keisti statusą į "Baigtas"')
    )
    
    # Ar automatiškai keisti iš "finished" į "closed" kai sumokėta vežėjui
    auto_finished_to_closed = models.BooleanField(
        default=True,
        verbose_name=_('Automatiškai keisti iš "Baigtas" į "Uždarytas"'),
        help_text=_('Kai sumokėta visiems vežėjams, automatiškai keisti statusą į "Uždarytas"')
    )
    
    # Kiek dienų po iškrovimo datos keisti į "waiting_for_docs" (0 = tą pačią dieną)
    days_after_unloading = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name=_('Dienų po iškrovimo'),
        help_text=_('Kiek dienų po iškrovimo datos keisti statusą į "Laukiama Dokumentų" (0 = tą pačią dieną)')
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = _('Užsakymų automatinio statusų keitimo nustatymai')
        verbose_name_plural = _('Užsakymų automatinio statusų keitimo nustatymai')
    
    @classmethod
    def load(cls):
        """Gauti arba sukurti nustatymus (singleton pattern)"""
        obj, created = cls.objects.get_or_create(pk=1)
        return obj
    
    def __str__(self):
        return f"Automatinio statusų keitimo nustatymai (Įjungta: {self.enabled})"


class OrderAutoStatusRule(models.Model):
    """Automatinio užsakymų statusų keitimo taisyklės su sąlygomis"""
    
    LOGIC_OPERATORS = [
        ('AND', _('Visi (AND)')),
        ('OR', _('Bet kuris (OR)')),
    ]
    
    from_status = models.CharField(
        max_length=50,
        verbose_name=_('Iš statuso'),
        help_text=_('Pradinis statusas')
    )
    
    to_status = models.CharField(
        max_length=50,
        verbose_name=_('Į statusą'),
        help_text=_('Tikslas statusas')
    )
    
    conditions = models.JSONField(
        default=list,
        blank=True,
        verbose_name=_('Sąlygos'),
        help_text=_('Sąrašas sąlygų: [{"type": "...", "params": {...}}, ...]')
    )
    
    logic_operator = models.CharField(
        max_length=10,
        choices=LOGIC_OPERATORS,
        default='AND',
        verbose_name=_('Logika'),
        help_text=_('Kaip kombinuoti sąlygas: AND (visos) arba OR (bent viena)')
    )
    
    enabled = models.BooleanField(
        default=True,
        verbose_name=_('Įjungta'),
        help_text=_('Ar ši taisyklė aktyvi')
    )
    
    priority = models.IntegerField(
        default=0,
        verbose_name=_('Prioritetas'),
        help_text=_('Kuo didesnis skaičius, tuo aukštesnis prioritetas (pirmiau tikrinama)')
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = _('Automatinio statusų keitimo taisyklė')
        verbose_name_plural = _('Automatinio statusų keitimo taisyklės')
        ordering = ['-priority', 'from_status']
    
    def __str__(self):
        return f"{self.from_status} → {self.to_status} ({len(self.conditions)} sąlygos, {self.logic_operator})"
