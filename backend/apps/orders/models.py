from django.db import models
from django.utils.translation import gettext_lazy as _
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal
from apps.partners.models import Partner
from apps.auth.models import User


class City(models.Model):
    """Miestų/lokacijų lentelė, naudojama visiems 'iš/į' laukams"""
    name = models.CharField(
        max_length=255,
        unique=True,
        verbose_name=_('Pavadinimas')
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'cities'
        verbose_name = _('Miestas/Lokacija')
        verbose_name_plural = _('Miestai/Lokacijos')
        ordering = ['name']
    
    def __str__(self):
        return self.name


class RouteContact(models.Model):
    """Siuntėjų/gavėjų komplektų lentelė - saugo visą adresų informaciją kartu su pavadinimu"""
    
    class ContactType(models.TextChoices):
        SENDER = 'sender', _('Siuntėjas')
        RECEIVER = 'receiver', _('Gavėjas')
    
    contact_type = models.CharField(
        max_length=20,
        choices=ContactType.choices,
        verbose_name=_('Tipas')
    )
    name = models.CharField(
        max_length=500,
        verbose_name=_('Siuntėjas/Gavėjas')
    )
    country = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('Šalis')
    )
    postal_code = models.CharField(
        max_length=20,
        blank=True,
        verbose_name=_('Pašto kodas')
    )
    city = models.CharField(
        max_length=255,
        blank=True,
        verbose_name=_('Miestas')
    )
    address = models.CharField(
        max_length=500,
        blank=True,
        verbose_name=_('Adresas')
    )
    usage_count = models.IntegerField(
        default=1,
        verbose_name=_('Naudojimų skaičius')
    )
    last_used_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_('Paskutinį kartą naudota')
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_('Sukurta')
    )
    
    class Meta:
        db_table = 'route_contacts'
        verbose_name = _('Maršruto kontaktas')
        verbose_name_plural = _('Maršruto kontaktai')
        unique_together = [['contact_type', 'name', 'country', 'postal_code', 'city', 'address']]
        indexes = [
            models.Index(fields=['contact_type', 'name']),
            models.Index(fields=['contact_type', '-usage_count', '-last_used_at']),
        ]
        ordering = ['-usage_count', '-last_used_at']
    
    def __str__(self):
        return f"{self.get_contact_type_display()}: {self.name}"


class VehicleType(models.Model):
    """Mašinos tipų lentelė"""
    name = models.CharField(
        max_length=255,
        unique=True,
        verbose_name=_('Pavadinimas')
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'vehicle_types'
        verbose_name = _('Mašinos tipas')
        verbose_name_plural = _('Mašinos tipai')
        ordering = ['name']
    
    def __str__(self):
        return self.name


class OtherCostType(models.Model):
    """Papildomų išlaidų tipų lentelė"""
    description = models.CharField(
        max_length=255,
        unique=True,
        verbose_name=_('Aprašymas')
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'other_cost_types'
        verbose_name = _('Išlaidų tipas')
        verbose_name_plural = _('Išlaidų tipai')
        ordering = ['description']
    
    def __str__(self):
        return self.description


class OrderNumberSequence(models.Model):
    """Užsakymų numeracijos seka - saugo sekos numerį kiekvieniems metams"""
    year = models.IntegerField(
        db_index=True,
        unique=True,
        verbose_name=_('Metai')
    )
    last_number = models.IntegerField(
        default=0,
        verbose_name=_('Paskutinis numeris')
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_('Atnaujinta')
    )
    
    class Meta:
        db_table = 'order_number_sequences'
        verbose_name = _('Užsakymų numeracijos seka')
        verbose_name_plural = _('Užsakymų numeracijos sekos')
        ordering = ['-year']
    
    def __str__(self):
        return f"{self.year}: {self.last_number}"


class ExpeditionNumberSequence(models.Model):
    """Ekspedicijų numeracijos seka (globalus skaitiklis be metų)."""

    last_carrier_number = models.IntegerField(
        default=0,
        verbose_name=_('Paskutinis vežėjo ekspedicijos numeris')
    )
    last_warehouse_number = models.IntegerField(
        default=0,
        verbose_name=_('Paskutinis sandėlio ekspedicijos numeris')
    )
    last_cost_number = models.IntegerField(
        default=0,
        verbose_name=_('Paskutinis išlaidų ekspedicijos numeris')
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_('Atnaujinta')
    )

    class Meta:
        db_table = 'expedition_number_sequences'
        verbose_name = _('Ekspedicijų numeracijos seka')
        verbose_name_plural = _('Ekspedicijų numeracijos sekos')

    def __str__(self):
        return f"Vežėjai: {self.last_carrier_number}, Sandėliai: {self.last_warehouse_number}, Išlaidos: {self.last_cost_number}"


class AutocompleteSuggestion(models.Model):
    """Autocomplete pasiūlymų lentelė - saugo anksčiau įvestas reikšmes"""
    
    class FieldType(models.TextChoices):
        COUNTRY = 'country', _('Šalis')
        POSTAL_CODE = 'postal_code', _('Pašto kodas')
        CITY = 'city', _('Miestas')
        ADDRESS = 'address', _('Adresas')
        CARGO_DESCRIPTION = 'cargo_description', _('Krovinių aprašymas')
        ORDER_NOTES = 'order_notes', _('Užsakymo pastabos')
        CARRIER_NOTES = 'carrier_notes', _('Vežėjo pastabos')
        VEHICLE_TYPE = 'vehicle_type', _('Mašinos tipas')
        ORDER_TYPE = 'order_type', _('Užsakymo tipas')
    
    field_type = models.CharField(
        max_length=50,
        choices=FieldType.choices,
        db_index=True,
        verbose_name=_('Lauko tipas')
    )
    value = models.CharField(
        max_length=500,
        verbose_name=_('Reikšmė')
    )
    usage_count = models.IntegerField(
        default=1,
        verbose_name=_('Naudojimų skaičius')
    )
    last_used_at = models.DateTimeField(
        auto_now=True,
        verbose_name=_('Paskutinį kartą naudota')
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name=_('Sukurta')
    )
    
    class Meta:
        db_table = 'autocomplete_suggestions'
        verbose_name = _('Autocomplete pasiūlymas')
        verbose_name_plural = _('Autocomplete pasiūlymai')
        unique_together = [['field_type', 'value']]
        indexes = [
            models.Index(fields=['field_type', 'value']),
            models.Index(fields=['field_type', '-usage_count', '-last_used_at']),
        ]
        ordering = ['-usage_count', '-last_used_at']
    
    def __str__(self):
        return f"{self.get_field_type_display()}: {self.value}"


class Order(models.Model):
    """Užsakymų modelis"""
    
    class OrderStatus(models.TextChoices):
        NEW = 'new', _('Naujas')
        ASSIGNED = 'assigned', _('Priskirtas')
        EXECUTING = 'executing', _('Vykdomas')
        WAITING_FOR_DOCS = 'waiting_for_docs', _('Laukiama Dokumentų')
        WAITING_FOR_PAYMENT = 'waiting_for_payment', _('Laukiama Apmokėjimo')
        FINISHED = 'finished', _('Baigtas')
        CLOSED = 'closed', _('Uždarytas')
        CANCELED = 'canceled', _('Atšauktas')
    
    client = models.ForeignKey(
        Partner,
        on_delete=models.PROTECT,
        related_name='orders',
        limit_choices_to={'is_client': True},
        verbose_name=_('Klientas')
    )
    order_number = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        verbose_name=_('Užsakymo numeris')
    )
    client_order_number = models.CharField(
        max_length=100,
        blank=True,
        default='',
        verbose_name=_('Užsakovo užsakymo numeris')
    )
    order_type = models.CharField(
        max_length=100,
        blank=True,
        default='',
        verbose_name=_('Užsakymo tipas')
    )

    @property
    def order_type_display(self) -> str:
        return self.order_type or ''
    manager = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='managed_orders',
        verbose_name=_('Vadybininkas')
    )
    status = models.CharField(
        max_length=30,
        choices=OrderStatus.choices,
        default=OrderStatus.NEW,
        db_index=True,
        verbose_name=_('Būsena')
    )
    
    # Kainos
    price_net = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Kaina (be PVM)')
    )
    client_price_net = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Kaina klientui (be PVM)')
    )
    my_price_net = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Mano kaina (be PVM)')
    )
    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal('21.00'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name=_('PVM tarifas (%)')
    )
    vat_rate_article = models.CharField(
        max_length=500,
        blank=True,
        verbose_name=_('PVM tarifo straipsnis')
    )
    
    # Sąskaitos ir mokėjimai
    client_invoice_issued = models.BooleanField(default=False, verbose_name=_('Išrašyta kliento sąskaita'))
    client_invoice_received = models.BooleanField(default=False, verbose_name=_('Gauta kliento sąskaita'))
    client_payment_status = models.CharField(
        max_length=20,
        choices=[
            ('not_paid', _('Neapmokėta')),
            ('partially_paid', _('Dalinai apmokėta')),
            ('paid', _('Apmokėta'))
        ],
        default='not_paid',
        verbose_name=_('Kliento mokėjimo būklė')
    )
    
    # Maršrutas (bendri laukai - paliekami palaikymui)
    route_from = models.CharField(max_length=500, blank=True, verbose_name=_('Maršrutas iš'))
    route_to = models.CharField(max_length=500, blank=True, verbose_name=_('Maršrutas į'))
    route_type = models.CharField(
        max_length=20,
        choices=[
            ('simple', _('Paprastas (1 → 1)')),
            ('multi_stop', _('Daugiataškis')),
            ('multi_cargo', _('Daugiakrovininis')),
            ('multi_carrier', _('Daugiavežėjinis'))
        ],
        default='simple',
        verbose_name=_('Maršruto tipas')
    )
    use_new_route_system = models.BooleanField(
        default=False,
        help_text=_('Jei True, naudojami RouteStop ir CargoItemNew modeliai'),
        verbose_name=_('Naudoti naują maršruto sistemą')
    )

    # Detali maršruto informacija
    route_from_country = models.CharField(max_length=255, blank=True, verbose_name=_('Maršrutas iš - Šalis'))
    route_from_postal_code = models.CharField(max_length=20, blank=True, verbose_name=_('Maršrutas iš - Pašto kodas'))
    route_from_city = models.CharField(max_length=255, blank=True, verbose_name=_('Maršrutas iš - Miestas'))
    route_from_address = models.CharField(max_length=500, blank=True, verbose_name=_('Maršrutas iš - Adresas'))
    route_to_country = models.CharField(max_length=255, blank=True, verbose_name=_('Maršrutas į - Šalis'))
    route_to_postal_code = models.CharField(max_length=20, blank=True, verbose_name=_('Maršrutas į - Pašto kodas'))
    route_to_city = models.CharField(max_length=255, blank=True, verbose_name=_('Maršrutas į - Miestas'))
    route_to_address = models.CharField(max_length=500, blank=True, verbose_name=_('Maršrutas į - Adresas'))
    
    # Siuntėjas ir gavėjas maršrutuose
    sender_route_from = models.CharField(max_length=500, blank=True, verbose_name=_('Siuntėjas maršrute iš'))
    receiver_route_to = models.CharField(max_length=500, blank=True, verbose_name=_('Gavėjas maršrute į'))
    
    # Datos
    order_date = models.DateTimeField(null=True, blank=True, verbose_name=_('Užsakymo data'))
    loading_date = models.DateTimeField(null=True, blank=True, verbose_name=_('Pakrovimo data'))
    unloading_date = models.DateTimeField(null=True, blank=True, verbose_name=_('Iškrovimo data'))

    # Datų intervalai (papildomi laukai) - su laiku
    loading_date_from = models.DateTimeField(null=True, blank=True, verbose_name=_('Pakrovimas nuo'))
    loading_date_to = models.DateTimeField(null=True, blank=True, verbose_name=_('Pakrovimas iki'))
    unloading_date_from = models.DateTimeField(null=True, blank=True, verbose_name=_('Iškrovimas nuo'))
    unloading_date_to = models.DateTimeField(null=True, blank=True, verbose_name=_('Iškrovimas iki'))
    
    # Krovinio savybės
    is_partial = models.BooleanField(default=False, verbose_name=_('Dalinis'))
    weight_kg = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Svoris (kg)')
    )
    ldm = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('LDM')
    )
    length_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Ilgis (m)')
    )
    width_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Plotis (m)')
    )
    height_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Aukštis (m)')
    )
    is_palletized = models.BooleanField(default=False, verbose_name=_('Paletemis'))
    is_stackable = models.BooleanField(default=False, verbose_name=_('Stabeliuojamas'))
    
    vehicle_type = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        verbose_name=_('Mašinos tipas')
    )
    # Varnelės (papildomos savybės)
    requires_forklift = models.BooleanField(default=False, verbose_name=_('Reikalingas keltuvas'))
    requires_crane = models.BooleanField(default=False, verbose_name=_('Reikalingas kranas'))
    requires_special_equipment = models.BooleanField(default=False, verbose_name=_('Reikalinga speciali įranga'))
    fragile = models.BooleanField(default=False, verbose_name=_('Trapus'))
    hazardous = models.BooleanField(default=False, verbose_name=_('Pavojingas'))
    temperature_controlled = models.BooleanField(default=False, verbose_name=_('Temperatūros kontrolė'))
    requires_permit = models.BooleanField(default=False, verbose_name=_('Reikalingas leidimas'))
    
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    
    # Kitos išlaidos (papildomos išlaidos užsakymui)
    other_costs = models.JSONField(
        blank=True,
        default=list,
        help_text=_('JSON masyvas su aprašymais ir sumomis, pvz: [{"description": "Draudimas", "amount": 50.00}]'),
        verbose_name=_('Kitos išlaidos')
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_orders',
        verbose_name=_('Sukūrė')
    )
    
    class Meta:
        db_table = 'orders'
        verbose_name = _('Užsakymas')
        verbose_name_plural = _('Užsakymai')
        indexes = [
            models.Index(fields=['order_number']),
            models.Index(fields=['client']),
            models.Index(fields=['status']),
            models.Index(fields=['manager']),
            models.Index(fields=['created_at']),
        ]
    
    def __str__(self):
        return f"{self.order_number or ('Užsakymas #' + str(self.id))} - {self.client.name}"
    
    def save(self, *args, **kwargs):
        """
        Automatiškai nustato client_payment_status pagal sąskaitas:
        - Jei nėra sąskaitų ir client_invoice_issued=False -> 'not_paid'
        - Jei yra sąskaitų, bet jos neapmokėtos -> 'not_paid' (bet galima rankiniu pakeisti)
        - Vėluojančios sąskaitos neperrašo rankiniu nustatyto statuso
        """
        from django.utils import timezone
        from django.db import connections
        
        # Užtikrinti, kad yra duomenų bazės ryšys
        try:
            connections['default'].ensure_connection()
        except Exception:
            pass
        
        # Order number generavimas dabar vyksta tik per OrderViewSet.perform_create()
        # Pašalinta automatinė generacija čia, kad išvengtume race conditions ir dublikatų
        super().save(*args, **kwargs)
    
    @property
    def price_with_vat(self):
        """Apskaičiuoja kainą su PVM"""
        try:
            return self.price_net * (1 + Decimal(str(self.vat_rate)) / 100)
        except (AttributeError, TypeError):
            return None
    
    @property
    def vat_amount(self):
        """Apskaičiuoja PVM sumą"""
        try:
            return self.price_net * (Decimal(str(self.vat_rate)) / 100)
        except (AttributeError, TypeError):
            return None
    
    @property
    def client_price_with_vat(self):
        """Apskaičiuoja kliento kainą su PVM"""
        try:
            if self.client_price_net:
                return self.client_price_net * (1 + Decimal(str(self.vat_rate)) / 100)
        except (AttributeError, TypeError):
            pass
        return None
    
    @property
    def client_vat_amount(self):
        """Apskaičiuoja kliento PVM sumą"""
        try:
            if self.client_price_net:
                return self.client_price_net * (Decimal(str(self.vat_rate)) / 100)
        except (AttributeError, TypeError):
            pass
        return None
    
    @property
    def calculated_client_price_net(self):
        """Apskaičiuoja kliento kainą pagal vežėjų kainas + mano kainą + kitas išlaidas"""
        try:
            # Jei instance dar neturi PK, negalime pasiekti related objects
            if self.pk is None:
                # Grąžinti tik my_price_net ir other_costs, jei yra
                my_price = self.my_price_net or Decimal('0.00')
                
                # Kitos išlaidos iš other_costs JSONField
                other_costs_total = Decimal('0.00')
                if hasattr(self, 'other_costs') and self.other_costs:
                    if isinstance(self.other_costs, list):
                        for cost in self.other_costs:
                            if isinstance(cost, dict) and 'amount' in cost:
                                try:
                                    other_costs_total += Decimal(str(cost['amount']))
                                except (ValueError, TypeError):
                                    pass
                
                return my_price + other_costs_total
            
            transport_cost = sum(c.price_net for c in self.carriers.all() if c.price_net)
            my_price = self.my_price_net or Decimal('0.00')
            
            # Kitos išlaidos iš other_costs JSONField
            other_costs_total = Decimal('0.00')
            if hasattr(self, 'other_costs') and self.other_costs:
                if isinstance(self.other_costs, list):
                    for cost in self.other_costs:
                        if isinstance(cost, dict) and 'amount' in cost:
                            try:
                                other_costs_total += Decimal(str(cost['amount']))
                            except (ValueError, TypeError):
                                pass
            
            return transport_cost + my_price + other_costs_total
        except (AttributeError, TypeError, ValueError):
            return None
    
    @property
    def payment_status_info(self):
        """Grąžina detalų mokėjimo būklės informaciją"""
        try:
            # Jei instance dar neturi PK, negalime pasiekti related objects
            if self.pk is None:
                return {
                    'status': 'not_paid',
                    'message': 'Nėra sąskaitų',
                    'has_invoices': False,
                    'invoice_issued': False
                }
            
            from apps.invoices.models import SalesInvoice, SalesInvoiceOrder
            
            # VISADA tikrinti DB tiesiogiai, kad būtų tikri duomenys (ypač po trinimo)
            invoice_ids = set()
            # Tikrinti per ForeignKey
            invoice_ids.update(SalesInvoice.objects.filter(related_order=self).values_list('id', flat=True))
            # Tikrinti per ManyToMany
            invoice_ids.update(SalesInvoiceOrder.objects.filter(order=self).values_list('invoice_id', flat=True))

            if not invoice_ids:
                return {
                    'status': 'not_paid',
                    'message': 'Nėra sąskaitų',
                    'has_invoices': False,
                    'invoice_issued': self.client_invoice_issued
                }
            
            invoices = SalesInvoice.objects.filter(id__in=invoice_ids)
            
            # Tikrinti apmokėjimo statusą
            if self.client_payment_status == 'paid':
                # Rasti paskutinę apmokėjimo datą
                paid_invoices = invoices.filter(payment_status='paid', payment_date__isnull=False)
                if paid_invoices.exists():
                    last_payment = paid_invoices.order_by('-payment_date').first()
                    return {
                        'status': 'paid',
                        'message': 'Apmokėta',
                        'has_invoices': True,
                        'invoice_issued': self.client_invoice_issued,
                        'payment_date': last_payment.payment_date.isoformat()
                    }
                return {
                    'status': 'paid',
                    'message': 'Apmokėta',
                    'has_invoices': True,
                    'invoice_issued': self.client_invoice_issued
                }
            
            elif self.client_payment_status == 'partially_paid':
                return {
                    'status': 'partially_paid',
                    'message': 'Dalinai apmokėta',
                    'has_invoices': True,
                    'invoice_issued': self.client_invoice_issued
                }
            
            else:
                # Tikrinti ar yra vėluojančių sąskaitų
                from django.utils import timezone
                today = timezone.now().date()
                
                overdue_invoices = invoices.filter(
                    payment_status='unpaid',
                    due_date__lt=today
                )
                
                if overdue_invoices.exists():
                    max_overdue = overdue_invoices.order_by('due_date').first()
                    overdue_days = (today - max_overdue.due_date).days
                    return {
                        'status': 'overdue',
                        'message': f'Vėluoja apmokėti ({overdue_days} d.)',
                        'has_invoices': True,
                        'invoice_issued': self.client_invoice_issued,
                        'overdue_days': overdue_days
                    }
                
                return {
                    'status': 'not_paid',
                    'message': 'Neapmokėta',
                    'has_invoices': True,
                    'invoice_issued': self.client_invoice_issued
                }
        except Exception as e:
            return {
                'status': 'not_paid',
                'message': 'Neapmokėta',
                'has_invoices': False,
                'invoice_issued': False
            }

    @property
    def mail_attachment_indicator(self):
        """Palikta atgaliniam suderinamumui – pagrindiniai duomenys gaunami per API veiksmą."""
        return None


class PaymentStatus(models.TextChoices):
    NOT_PAID = 'not_paid', _('Neapmokėta')
    PARTIALLY_PAID = 'partially_paid', _('Dalinai apmokėta')
    PAID = 'paid', _('Apmokėta')


class OrderCarrier(models.Model):
    """Užsakymo vežėjų/sandėlių modelis"""
    
    class CarrierType(models.TextChoices):
        CARRIER = 'carrier', _('Vežėjas')
        WAREHOUSE = 'warehouse', _('Sandėlys')
    
    class Status(models.TextChoices):
        NEW = 'new', _('Naujas')
        IN_PROGRESS = 'in_progress', _('Vykdomas')
        COMPLETED = 'completed', _('Baigtas')
        CANCELLED = 'cancelled', _('Atšauktas')
    
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='carriers',
        verbose_name=_('Užsakymas')
    )
    partner = models.ForeignKey(
        Partner,
        on_delete=models.PROTECT,
        related_name='order_carriers',
        verbose_name=_('Partneris')
    )
    expedition_number = models.CharField(
        max_length=32,
        null=True,
        blank=True,
        verbose_name=_('Ekspedicijos numeris'),
        db_index=True,
    )
    carrier_type = models.CharField(
        max_length=20,
        choices=CarrierType.choices,
        default=CarrierType.CARRIER,
        verbose_name=_('Tipas')
    )
    sequence_order = models.IntegerField(default=0, verbose_name=_('Eiliškumas'))
    price_net = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Kaina (be PVM)')
    )
    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name=_('PVM tarifas (%)'),
        help_text=_('Jei nenurodytas, naudojamas užsakymo PVM tarifas')
    )
    vat_rate_article = models.CharField(
        max_length=500,
        blank=True,
        verbose_name=_('PVM tarifo straipsnis')
    )
    route_from = models.CharField(max_length=500, blank=True, verbose_name=_('Maršrutas iš'))
    route_to = models.CharField(max_length=500, blank=True, verbose_name=_('Maršrutas į'))
    # Detali maršruto informacija
    route_from_country = models.CharField(max_length=255, blank=True, verbose_name=_('Maršrutas iš - Šalis'))
    route_from_postal_code = models.CharField(max_length=20, blank=True, verbose_name=_('Maršrutas iš - Pašto kodas'))
    route_from_city = models.CharField(max_length=255, blank=True, verbose_name=_('Maršrutas iš - Miestas'))
    route_from_address = models.CharField(max_length=500, blank=True, verbose_name=_('Maršrutas iš - Adresas'))
    sender_name = models.CharField(max_length=500, blank=True, verbose_name=_('Siuntėjo pavadinimas'))
    route_to_country = models.CharField(max_length=255, blank=True, verbose_name=_('Maršrutas į - Šalis'))
    route_to_postal_code = models.CharField(max_length=20, blank=True, verbose_name=_('Maršrutas į - Pašto kodas'))
    route_to_city = models.CharField(max_length=255, blank=True, verbose_name=_('Maršrutas į - Miestas'))
    route_to_address = models.CharField(max_length=500, blank=True, verbose_name=_('Maršrutas į - Adresas'))
    receiver_name = models.CharField(max_length=500, blank=True, verbose_name=_('Gavėjo pavadinimas'))
    loading_date = models.DateTimeField(null=True, blank=True, verbose_name=_('Pakrovimo data'))
    unloading_date = models.DateTimeField(null=True, blank=True, verbose_name=_('Iškrovimo data'))

    # Datų intervalai (papildomi laukai) - su laiku
    loading_date_from = models.DateTimeField(null=True, blank=True, verbose_name=_('Pakrovimas nuo'))
    loading_date_to = models.DateTimeField(null=True, blank=True, verbose_name=_('Pakrovimas iki'))
    unloading_date_from = models.DateTimeField(null=True, blank=True, verbose_name=_('Iškrovimas nuo'))
    unloading_date_to = models.DateTimeField(null=True, blank=True, verbose_name=_('Iškrovimas iki'))

    # Custom laukai (tik jei skiriasi nuo užsakymo)
    custom_route_from = models.CharField(max_length=500, blank=True, null=True, verbose_name=_('Custom maršrutas iš'))
    custom_route_to = models.CharField(max_length=500, blank=True, null=True, verbose_name=_('Custom maršrutas į'))
    custom_route_from_country = models.CharField(max_length=255, blank=True, null=True, verbose_name=_('Custom maršrutas iš - Šalis'))
    custom_route_from_city = models.CharField(max_length=255, blank=True, null=True, verbose_name=_('Custom maršrutas iš - Miestas'))
    custom_route_from_address = models.CharField(max_length=500, blank=True, null=True, verbose_name=_('Custom maršrutas iš - Adresas'))
    custom_route_to_country = models.CharField(max_length=255, blank=True, null=True, verbose_name=_('Custom maršrutas į - Šalis'))
    custom_route_to_city = models.CharField(max_length=255, blank=True, null=True, verbose_name=_('Custom maršrutas į - Miestas'))
    custom_route_to_address = models.CharField(max_length=500, blank=True, null=True, verbose_name=_('Custom maršrutas į - Adresas'))
    custom_loading_date_from = models.DateTimeField(null=True, blank=True, verbose_name=_('Custom pakrovimas nuo'))
    custom_loading_date_to = models.DateTimeField(null=True, blank=True, verbose_name=_('Custom pakrovimas iki'))
    custom_unloading_date_from = models.DateTimeField(null=True, blank=True, verbose_name=_('Custom iškrovimas nuo'))
    custom_unloading_date_to = models.DateTimeField(null=True, blank=True, verbose_name=_('Custom iškrovimas iki'))

    # Vėliavėlės (ar turi custom duomenis)
    has_custom_route = models.BooleanField(default=False, verbose_name=_('Turi custom maršrutą'))
    has_custom_dates = models.BooleanField(default=False, verbose_name=_('Turi custom datas'))

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        verbose_name=_('Statusas')
    )
    invoice_issued = models.BooleanField(default=False, verbose_name=_('Išrašyta sąskaita'))
    invoice_received = models.BooleanField(default=False, verbose_name=_('Gauta sąskaita'))
    invoice_received_date = models.DateField(null=True, blank=True, verbose_name=_('Kada gauta sąskaita'))
    payment_days = models.IntegerField(null=True, blank=True, verbose_name=_('Mokėjimo terminas (dienų)'), help_text=_('Per kiek dienų nuo sąskaitos gavimo reikia apmokėti'))
    due_date = models.DateField(null=True, blank=True, verbose_name=_('Apmokėti iki'))
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.NOT_PAID,
        verbose_name=_('Mokėjimo būklė')
    )
    payment_date = models.DateField(null=True, blank=True, verbose_name=_('Apmokėjimo data'))
    payment_terms = models.TextField(
        blank=True,
        verbose_name=_('Apmokėjimo terminas'),
        help_text=_('Apmokėjimo terminas, kuris bus rodomas ekspedicijos sutartyje. Jei tuščias, bus naudojamas numatytasis iš ekspedicijų nustatymų.')
    )
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_carriers'
        verbose_name = _('Užsakymo vežėjas/Sandėlys')
        verbose_name_plural = _('Užsakymo vežėjai/Sandėliai')
        ordering = ['sequence_order', 'id']
        indexes = [
            models.Index(fields=['expedition_number']),
        ]
    
    def __str__(self):
        return f"{self.order} - {self.partner.name} ({self.get_carrier_type_display()})"

    # ===== EFEKTYVŪS DUOMENYS (custom arba iš užsakymo) =====

    @property
    def effective_route_from(self):
        """Grąžina maršrutą IŠ: custom jei turi, arba iš užsakymo"""
        return self.custom_route_from or self.order.route_from

    @property
    def effective_route_to(self):
        """Grąžina maršrutą Į: custom jei turi, arba iš užsakymo"""
        return self.custom_route_to or self.order.route_to

    @property
    def effective_route_from_country(self):
        """Grąžina šalį IŠ: custom jei turi, arba iš užsakymo"""
        return self.custom_route_from_country or self.order.route_from_country

    @property
    def effective_route_from_city(self):
        """Grąžina miestą IŠ: custom jei turi, arba iš užsakymo"""
        return self.custom_route_from_city or self.order.route_from_city

    @property
    def effective_route_from_address(self):
        """Grąžina adresą IŠ: custom jei turi, arba iš užsakymo"""
        return self.custom_route_from_address or self.order.route_from_address

    @property
    def effective_route_to_country(self):
        """Grąžina šalį Į: custom jei turi, arba iš užsakymo"""
        return self.custom_route_to_country or self.order.route_to_country

    @property
    def effective_route_to_city(self):
        """Grąžina miestą Į: custom jei turi, arba iš užsakymo"""
        return self.custom_route_to_city or self.order.route_to_city

    @property
    def effective_route_to_address(self):
        """Grąžina adresą Į: custom jei turi, arba iš užsakymo"""
        return self.custom_route_to_address or self.order.route_to_address

    @property
    def effective_loading_date_from(self):
        """Grąžina pakrovimo datą nuo: custom jei turi, arba iš užsakymo"""
        return self.custom_loading_date_from or self.order.loading_date_from

    @property
    def effective_loading_date_to(self):
        """Grąžina pakrovimo datą iki: custom jei turi, arba iš užsakymo"""
        return self.custom_loading_date_to or self.order.loading_date_to

    @property
    def effective_unloading_date_from(self):
        """Grąžina iškrovimo datą nuo: custom jei turi, arba iš užsakymo"""
        return self.custom_unloading_date_from or self.order.unloading_date_from

    @property
    def effective_unloading_date_to(self):
        """Grąžina iškrovimo datą iki: custom jei turi, arba iš užsakymo"""
        return self.custom_unloading_date_to or self.order.unloading_date_to

    def save(self, *args, **kwargs):
        """Automatiškai sugeneruoja ekspedicijos numerį ir apskaičiuoja due_date."""
        # ===== NUSTATOM CUSTOM VĖLIAVĖLES =====
        self.has_custom_route = bool(
            self.custom_route_from or
            self.custom_route_to or
            self.custom_route_from_country or
            self.custom_route_from_city or
            self.custom_route_from_address or
            self.custom_route_to_country or
            self.custom_route_to_city or
            self.custom_route_to_address
        )

        self.has_custom_dates = bool(
            self.custom_loading_date_from or
            self.custom_loading_date_to or
            self.custom_unloading_date_from or
            self.custom_unloading_date_to
        )

        # Generuoti ekspedicijos numerį tiek vežėjams, tiek sandėliams
        if (
            not self.expedition_number
            and self.carrier_type in [self.CarrierType.CARRIER, self.CarrierType.WAREHOUSE]
            and (not self.pk or not hasattr(self, '_expedition_number_was_set'))
        ):
            try:
                from apps.settings.models import ExpeditionSettings
                from .utils import generate_expedition_number

                # Nustatome expedition_type pagal carrier_type
                expedition_type = 'warehouse' if self.carrier_type == self.CarrierType.WAREHOUSE else 'carrier'
                self.expedition_number = generate_expedition_number(expedition_type=expedition_type)
            except Exception:
                # Jei nepavyko sugeneruoti numerio – paliekame tuščią
                pass

        from datetime import timedelta
        
        # Jei yra invoice_received_date ir payment_days, bet nėra due_date, apskaičiuojame
        if self.invoice_received_date and self.payment_days:
            calculated_due_date = self.invoice_received_date + timedelta(days=self.payment_days)
            # Apskaičiuojame due_date tik jei jis nėra nustatytas arba jei skaičiuotasis skiriasi
            # (taip vartotojas gali tiesiogiai pasirinkti datą, ir ji nebus perrašyta)
            if not self.due_date:
                self.due_date = calculated_due_date
            # Jei due_date jau nustatytas, bet jis skiriasi nuo apskaičiuoto pagal received_date + payment_days,
            # atnaujiname (galbūt pasikeitė received_date arba payment_days)
            elif self.due_date != calculated_due_date:
                # Atnaujiname tik jei due_date atitinka seną apskaičiuotąją datą (t. y. buvo apskaičiuota)
                # Kitaip paliekame vartotojo pasirinktą datą
                self.due_date = calculated_due_date
        
        # Išsaugoti payment_status prieš save, kad galėtume palyginti
        old_payment_status = None
        if self.pk:
            try:
                old_instance = OrderCarrier.objects.get(pk=self.pk)
                old_payment_status = old_instance.payment_status
            except OrderCarrier.DoesNotExist:
                pass
        
        super().save(*args, **kwargs)
        
        # Sinchronizuoti payment_status su susijusiais PurchaseInvoice
        if old_payment_status != self.payment_status:
            try:
                from apps.invoices.models import PurchaseInvoice
                
                # Rasti susijusias PurchaseInvoice pagal order ir partner
                if self.order and self.partner:
                    purchase_invoices = PurchaseInvoice.objects.filter(
                        related_order=self.order,
                        partner=self.partner
                    )
                    
                    # Taip pat rasti pagal invoice_number iš dokumentų
                    invoice_documents = self.documents.filter(
                        document_type=OrderCarrierDocument.DocumentType.INVOICE
                    ).exclude(invoice_number__isnull=True).exclude(invoice_number='')
                    
                    if invoice_documents.exists():
                        invoice_numbers = list(invoice_documents.values_list('invoice_number', flat=True))
                        purchase_invoices_by_number = PurchaseInvoice.objects.filter(
                            received_invoice_number__in=invoice_numbers
                        )
                        purchase_invoices = purchase_invoices.union(purchase_invoices_by_number)
                    
                    # Atnaujinti payment_status
                    status_mapping = {
                        'not_paid': PurchaseInvoice.PaymentStatus.UNPAID,
                        'partially_paid': PurchaseInvoice.PaymentStatus.PARTIALLY_PAID,
                        'paid': PurchaseInvoice.PaymentStatus.PAID
                    }
                    
                    new_status = status_mapping.get(self.payment_status)
                    if new_status:
                        for invoice in purchase_invoices:
                            if invoice.payment_status != new_status:
                                invoice.payment_status = new_status
                                invoice.payment_date = self.payment_date
                                invoice.save(update_fields=['payment_status', 'payment_date'])
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Klaida sinchronizuojant OrderCarrier.payment_status su PurchaseInvoice: {e}", exc_info=True)
    
    @property
    def calculated_status(self):
        """
        Automatiškai apskaičiuoja statusą pagal datas:
        - Nauja: jei nėra loading_date, arba dabartinė data yra iki loading_date
        - Vykdoma: jei yra loading_date, bet nėra unloading_date, arba dabar data yra tarp loading_date ir unloading_date datų, arba daugiau nei loading_date
        - Baigta: jei dabar yra daugiau nei unloading_date
        """
        try:
            from django.utils import timezone
            
            now = timezone.now()
            
            # Jei nėra loading_date, arba dabartinė data yra iki loading_date -> Nauja
            if not self.loading_date:
                return self.Status.NEW.value
            
            loading_date = self.loading_date
            if now < loading_date:
                return self.Status.NEW.value
            
            # Jei yra loading_date, bet nėra unloading_date -> Vykdoma
            if not self.unloading_date:
                return self.Status.IN_PROGRESS.value
            
            unloading_date = self.unloading_date
            
            # Jei dabar yra daugiau nei unloading_date -> Baigta
            if now > unloading_date:
                return self.Status.COMPLETED.value
            
            # Jei dabar data yra tarp loading_date ir unloading_date -> Vykdoma
            if loading_date <= now <= unloading_date:
                return self.Status.IN_PROGRESS.value
            
            # Fallback: jei loading_date > unloading_date (neteisingas atvejis), grąžinti Vykdoma
            return self.Status.IN_PROGRESS.value
        except (AttributeError, Exception) as e:
            # Jei klaida, grąžinti esamą statusą arba default
            try:
                return self.status if hasattr(self, 'status') and self.status else self.Status.NEW.value
            except:
                return self.Status.NEW.value
    
    @property
    def price_with_vat(self):
        """Apskaičiuoja kainą su PVM"""
        try:
            if self.price_net:
                # Naudoti vežėjo PVM tarifą, jei jis yra, kitaip užsakymo PVM tarifą
                vat_rate = self.vat_rate
                if vat_rate is None and hasattr(self, 'order') and self.order and hasattr(self.order, 'vat_rate'):
                    vat_rate = self.order.vat_rate
                # Jei vat_rate yra 0, grąžinti price_net (be PVM)
                if vat_rate is not None:
                    if Decimal(str(vat_rate)) == 0:
                        return self.price_net
                    return self.price_net * (1 + Decimal(str(vat_rate)) / 100)
        except (AttributeError, TypeError, Exception):
            pass
        return None
    
    @property
    def vat_amount(self):
        """Apskaičiuoja PVM sumą"""
        try:
            if self.price_net:
                # Naudoti vežėjo PVM tarifą, jei jis yra, kitaip užsakymo PVM tarifą
                vat_rate = self.vat_rate
                if vat_rate is None and hasattr(self, 'order') and self.order and hasattr(self.order, 'vat_rate'):
                    vat_rate = self.order.vat_rate
                # Jei vat_rate yra 0, grąžinti 0
                if vat_rate is not None:
                    if Decimal(str(vat_rate)) == 0:
                        return Decimal('0.00')
                    return self.price_net * (Decimal(str(vat_rate)) / 100)
        except (AttributeError, TypeError, Exception):
            pass
        return None
    
    @property
    def payment_status_info(self):
        """Grąžina detalų apmokėjimo būklės informaciją"""
        try:
            if self.payment_status == 'paid':
                if self.payment_date:
                    payment_date_str = self.payment_date.strftime('%Y-%m-%d')
                    try:
                        year, month, day = payment_date_str.split('-')
                        payment_date_display = f'{day}.{month}.{year}'
                        return {
                            'status': 'paid',
                            'message': f'Apmokėtas ({payment_date_display})',
                            'payment_date': self.payment_date.isoformat()
                        }
                    except:
                        return {
                            'status': 'paid',
                            'message': f'Apmokėtas ({payment_date_str})',
                            'payment_date': self.payment_date.isoformat()
                        }
                else:
                    return {
                        'status': 'paid',
                        'message': 'Apmokėtas'
                    }
            elif self.payment_status == 'partially_paid':
                if self.payment_date:
                    payment_date_str = self.payment_date.strftime('%Y-%m-%d')
                    try:
                        year, month, day = payment_date_str.split('-')
                        payment_date_display = f'{day}.{month}.{year}'
                        return {
                            'status': 'partially_paid',
                            'message': f'Dalinai apmokėtas ({payment_date_display})',
                            'payment_date': self.payment_date.isoformat()
                        }
                    except:
                        return {
                            'status': 'partially_paid',
                            'message': f'Dalinai apmokėtas ({payment_date_str})',
                            'payment_date': self.payment_date.isoformat()
                        }
                else:
                    return {
                        'status': 'partially_paid',
                        'message': 'Dalinai apmokėtas'
                    }
            else:
                # Patikrinti ar sąskaita vėluoja (jei yra due_date)
                from django.utils import timezone
                today = timezone.now().date()
                
                if self.due_date and self.due_date < today:
                    overdue_days = (today - self.due_date).days
                    return {
                        'status': 'overdue',
                        'message': f'Vėluoja apmokėti ({overdue_days} d.)',
                        'overdue_days': overdue_days,
                        'due_date': self.due_date.isoformat()
                    }
                elif self.due_date:
                    # Dar ne vėluoja, bet yra terminas
                    return {
                        'status': 'not_paid',
                        'message': 'Neapmokėtas',
                        'due_date': self.due_date.isoformat()
                    }
                else:
                    # Nėra termino datos
                    return {
                        'status': 'not_paid',
                        'message': 'Neapmokėtas'
                    }
        except (AttributeError, Exception):
            # Fallback jei yra klaida
            return {
                'status': 'not_paid',
                'message': 'Neapmokėtas'
            }


class OrderCarrierDocument(models.Model):
    class DocumentType(models.TextChoices):
        INVOICE = 'invoice', _('Sąskaita')
        CMR = 'cmr', _('CMR')
        OTHER = 'other', _('Kiti dokumentai')

    order_carrier = models.ForeignKey(
        OrderCarrier,
        on_delete=models.CASCADE,
        related_name='documents',
        verbose_name=_('Ekspedicija')
    )
    document_type = models.CharField(
        max_length=32,
        choices=DocumentType.choices,
        default=DocumentType.OTHER,
        verbose_name=_('Dokumento tipas')
    )
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name=_('Suma (be PVM)')
    )
    invoice_number = models.CharField(
        max_length=128,
        null=True,
        blank=True,
        verbose_name=_('Sąskaitos numeris')
    )
    cmr_number = models.CharField(
        max_length=128,
        null=True,
        blank=True,
        verbose_name=_('CMR numeris')
    )
    issue_date = models.DateField(null=True, blank=True, verbose_name=_('Išrašymo data'))
    received_date = models.DateField(null=True, blank=True, verbose_name=_('Gavimo data'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_carrier_documents'
        verbose_name = _('Ekspedicijos dokumentas')
        verbose_name_plural = _('Ekspedicijos dokumentai')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.order_carrier} - {self.get_document_type_display()}"


class OrderCost(models.Model):
    """Papildomų išlaidų modelis - veikia kaip virtualūs tiekėjai"""

    class CostType(models.TextChoices):
        INSURANCE = 'insurance', _('Draudimas')
        CUSTOMS = 'customs', _('Muitinės paslaugos')
        STORAGE = 'storage', _('Saugojimas/Sandėliavimas')
        FUEL = 'fuel', _('Kuras/Degalinės')
        TOLL = 'toll', _('Kelių mokestis')
        REPAIR = 'repair', _('Remontas')
        OTHER = 'other', _('Kita')

    class Status(models.TextChoices):
        NEW = 'new', _('Nauja')
        IN_PROGRESS = 'in_progress', _('Vykdoma')
        COMPLETED = 'completed', _('Užbaigta')
        CANCELLED = 'cancelled', _('Atšaukta')

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='costs',
        verbose_name=_('Užsakymas')
    )
    partner = models.ForeignKey(
        'partners.Partner',
        on_delete=models.PROTECT,
        related_name='order_costs',
        verbose_name=_('Tiekėjas/Partneris')
    )
    cost_type = models.CharField(
        max_length=20,
        choices=CostType.choices,
        default=CostType.OTHER,
        verbose_name=_('Išlaidų tipas')
    )
    expedition_number = models.CharField(
        max_length=32,
        null=True,
        blank=True,
        verbose_name=_('Išlaidų numeris'),
        db_index=True,
    )

    # Finansinė informacija
    amount_net = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Suma (be PVM)')
    )
    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name=_('PVM tarifas (%)'),
        help_text=_('Jei nenurodytas, naudojamas užsakymo PVM tarifas')
    )
    vat_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name=_('PVM suma')
    )
    amount_with_vat = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name=_('Suma su PVM')
    )

    # Sąskaitų valdymas
    invoice_issued = models.BooleanField(default=False, verbose_name=_('Sąskaita išrašyta'))
    invoice_received = models.BooleanField(default=False, verbose_name=_('Sąskaita gauta'))
    invoice_number = models.CharField(
        max_length=128,
        null=True,
        blank=True,
        verbose_name=_('Sąskaitos numeris')
    )
    invoice_date = models.DateField(null=True, blank=True, verbose_name=_('Sąskaitos data'))

    # Mokėjimo informacija
    payment_status = models.CharField(
        max_length=20,
        choices=[
            ('not_paid', _('Neapmokėta')),
            ('partially_paid', _('Dalinai apmokėta')),
            ('paid', _('Apmokėta'))
        ],
        default='not_paid',
        verbose_name=_('Mokėjimo būsena')
    )
    payment_date = models.DateField(null=True, blank=True, verbose_name=_('Apmokėjimo data'))
    due_date = models.DateField(null=True, blank=True, verbose_name=_('Apmokėti iki'))
    payment_terms = models.TextField(
        blank=True,
        verbose_name=_('Mokėjimo sąlygos')
    )

    # Papildoma informacija
    description = models.TextField(blank=True, verbose_name=_('Aprašymas'))
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        verbose_name=_('Būsena')
    )
    sequence_order = models.IntegerField(default=0, verbose_name=_('Eiliškumas'))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_costs'
        verbose_name = _('Papildoma išlaida')
        verbose_name_plural = _('Papildomos išlaidos')
        ordering = ['sequence_order', 'id']
        indexes = [
            models.Index(fields=['order', 'cost_type']),
            models.Index(fields=['expedition_number']),
            models.Index(fields=['status', 'due_date']),
        ]

    def __str__(self):
        return f"{self.order.order_number} - {self.get_cost_type_display()} - {self.partner.name}"

    def save(self, *args, **kwargs):
        """Automatiškai apskaičiuoja PVM ir sugeneruoja išlaidų numerį."""
        # Apskaičiuoti PVM sumą ir sumą su PVM
        if self.amount_net is not None:
            # Naudoti savo PVM tarifą arba užsakymo
            vat_rate = self.vat_rate
            if vat_rate is None and self.order:
                vat_rate = self.order.vat_rate

            if vat_rate is not None:
                vat_rate_decimal = Decimal(str(vat_rate))
                self.vat_amount = (self.amount_net * vat_rate_decimal / 100).quantize(Decimal('0.01'))
                self.amount_with_vat = (self.amount_net + self.vat_amount).quantize(Decimal('0.01'))
            else:
                self.vat_amount = Decimal('0.00')
                self.amount_with_vat = self.amount_net

        # Generuoti išlaidų numerį
        if not self.expedition_number:
            try:
                from apps.settings.models import ExpeditionSettings
                from .utils import generate_expedition_number

                self.expedition_number = generate_expedition_number(expedition_type='cost')
            except Exception:
                # Jei nepavyko sugeneruoti numerio – paliekame tuščią
                pass

        # Apskaičiuoti due_date jei reikia
        if self.invoice_date and not self.due_date:
            # Paprastas 30 dienų terminas
            from datetime import timedelta
            self.due_date = self.invoice_date + timedelta(days=30)

        super().save(*args, **kwargs)

    @property
    def days_overdue(self):
        """Grąžina kiek dienų pradelsta"""
        if self.due_date and self.payment_status != 'paid':
            from datetime import date
            today = date.today()
            if today > self.due_date:
                return (today - self.due_date).days
        return 0

    @property
    def is_overdue(self):
        """Ar pradelsta apmokėti"""
        return self.days_overdue > 0


class CargoItem(models.Model):
    """Krovinių aprašymų modelis"""
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='cargo_items',
        verbose_name=_('Užsakymas')
    )
    loading_stop = models.ForeignKey(
        'RouteStop',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='loading_cargo_items',
        verbose_name=_('Pakrovimo sustojimas')
    )
    unloading_stop = models.ForeignKey(
        'RouteStop',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='unloading_cargo_items',
        verbose_name=_('Iškrovimo sustojimas')
    )
    sequence_order = models.IntegerField(default=0, verbose_name=_('Eiliškumas'))
    reference_number = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        verbose_name=_('Referencinis numeris')
    )
    description = models.TextField(blank=True, verbose_name=_('Aprašymas'))
    units = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name=_('Vienetai')
    )
    weight_kg = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Svoris (kg)')
    )
    ldm = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('LDM')
    )
    pallet_count = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name=_('Paletių skaičius')
    )
    package_count = models.IntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        verbose_name=_('Pakuočių skaičius')
    )
    length_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Ilgis (m)')
    )
    width_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Plotis (m)')
    )
    height_m = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.00'))],
        verbose_name=_('Aukštis (m)')
    )
    is_palletized = models.BooleanField(default=False, verbose_name=_('Paletemis'))
    is_stackable = models.BooleanField(default=False, verbose_name=_('Stabeliuojamas'))
    vehicle_type = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        verbose_name=_('Mašinos tipas')
    )
    requires_forklift = models.BooleanField(default=False, verbose_name=_('Reikalingas keltuvas'))
    requires_crane = models.BooleanField(default=False, verbose_name=_('Reikalingas kranas'))
    requires_special_equipment = models.BooleanField(default=False, verbose_name=_('Reikalinga speciali įranga'))
    fragile = models.BooleanField(default=False, verbose_name=_('Trapus'))
    hazardous = models.BooleanField(default=False, verbose_name=_('Pavojingas'))
    temperature_controlled = models.BooleanField(default=False, verbose_name=_('Temperatūros kontrolė'))
    requires_permit = models.BooleanField(default=False, verbose_name=_('Reikalingas leidimas'))
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'cargo_items'
        verbose_name = _('Krovinio aprašymas')
        verbose_name_plural = _('Krovinių aprašymai')
        ordering = ['sequence_order', 'id']
        indexes = [
            models.Index(fields=['order']),
        ]
    
    def __str__(self):
        return f"{self.order} - {self.description[:50] if self.description else 'Be aprašymo'}"


class RouteStop(models.Model):
    """Maršruto sustojimų modelis - leidžia turėti kelis pakrovimus/iškrovimus"""
    
    class StopType(models.TextChoices):
        LOADING = 'loading', _('Pakrovimas')
        UNLOADING = 'unloading', _('Iškrovimas')

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='route_stops',
        verbose_name=_('Užsakymas')
    )
    stop_type = models.CharField(
        max_length=20,
        choices=StopType.choices,
        verbose_name=_('Sustojimo tipas')
    )
    sequence_order = models.IntegerField(default=0, verbose_name=_('Eiliškumas'))
    
    # Adreso informacija
    name = models.CharField(max_length=500, blank=True, verbose_name=_('Siuntėjas/Gavėjas'))
    country = models.CharField(max_length=255, blank=True, verbose_name=_('Šalis'))
    postal_code = models.CharField(max_length=20, blank=True, verbose_name=_('Pašto kodas'))
    city = models.CharField(max_length=255, blank=True, verbose_name=_('Miestas'))
    address = models.CharField(max_length=500, blank=True, verbose_name=_('Adresas'))
    
    # Datos
    date_from = models.DateTimeField(null=True, blank=True, verbose_name=_('Data nuo'))
    date_to = models.DateTimeField(null=True, blank=True, verbose_name=_('Data iki'))
    
    notes = models.TextField(blank=True, verbose_name=_('Pastabos'))
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'order_route_stops'
        verbose_name = _('Maršruto sustojimas')
        verbose_name_plural = _('Maršruto sustojimai')
        ordering = ['sequence_order', 'id']

    def __str__(self):
        return f"{self.get_stop_type_display()} - {self.city or '?'}, {self.country or '?'}"
