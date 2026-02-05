from rest_framework import serializers
from datetime import datetime
from django.db import transaction
from typing import Optional
from .models import (
    CompanyInfo,
    UserSettings,
    InvoiceSettings,
    OrderSettings,
    OrderAutoStatusSettings,
    OrderAutoStatusRule,
    ExpeditionSettings,
    WarehouseExpeditionSettings,
    CostExpeditionSettings,
    PVMRate,
    NotificationSettings,
    UISettings,
    EmailTemplate,
)
from apps.orders.models import OrderNumberSequence, ExpeditionNumberSequence, Order, OrderCarrier, OrderCost
from apps.invoices.models import InvoiceNumberSequence, SalesInvoice


class CompanyInfoSerializer(serializers.ModelSerializer):
    """Įmonės rekvizitų serializer"""
    logo_url = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = CompanyInfo
        fields = [
            'id', 'name', 'code', 'vat_code', 'address', 'correspondence_address', 'city',
            'postal_code', 'country', 'phone', 'email',
            'bank_name', 'bank_account', 'bank_code', 'logo', 'logo_url', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'logo_url']
    
    def get_logo_url(self, obj):
        """Grąžina pilną URL logotipui"""
        if obj.logo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.logo.url)
            return obj.logo.url
        return None


class UserSettingsSerializer(serializers.ModelSerializer):
    """Vartotojo nustatymų serializer"""
    
    user_id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    role = serializers.SerializerMethodField(read_only=True)
    last_login = serializers.DateTimeField(source='user.last_login', read_only=True)
    position = serializers.CharField(source='user.position', required=False, allow_blank=True)
    signature_image_url = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = UserSettings
        fields = [
            'id', 'user_id', 'username',
            'role', 'last_login',
            'first_name', 'last_name', 'email', 'phone', 'position',
            'signature_image', 'signature_image_url',
            'language', 'date_format', 'timezone',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'user_id', 'username', 'role', 'last_login', 'created_at', 'updated_at', 'signature_image_url']
    
    def update(self, instance, validated_data):
        """Perrašytas update metodas, kad apdorotų position laukelį"""
        # Ištraukti position iš validated_data, jei yra (nested field)
        position_value = None
        if 'user' in validated_data and isinstance(validated_data['user'], dict) and 'position' in validated_data['user']:
            position_value = validated_data.pop('user')['position']
        elif 'position' in validated_data:
            position_value = validated_data.pop('position')
        
        # Ištraukti User modelio laukus (jie yra ir UserSettings, ir User)
        user_first_name = validated_data.get('first_name')
        user_last_name = validated_data.get('last_name')
        user_email = validated_data.get('email')
        user_phone = validated_data.get('phone')
        
        # Atnaujinti UserSettings laukus (visi validated_data laukai)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Atnaujinti User modelio duomenis
        if instance.user:
            user = instance.user
            update_fields = []
            
            if user_first_name is not None:
                user.first_name = user_first_name
                update_fields.append('first_name')
            if user_last_name is not None:
                user.last_name = user_last_name
                update_fields.append('last_name')
            if user_email is not None:
                user.email = user_email
                update_fields.append('email')
            if user_phone is not None:
                user.phone = user_phone
                update_fields.append('phone')
            if position_value is not None:
                user.position = position_value
                update_fields.append('position')
            
            if update_fields:
                user.save(update_fields=update_fields)
        
        return instance
    
    def save(self, **kwargs):
        """Išsaugoti nustatymus ir atnaujinti User modelio duomenis"""
        # Jei yra instance, naudoti update metodą
        if self.instance is not None:
            self.instance = self.update(self.instance, self.validated_data)
            return self.instance
        # Kitu atveju naudoti create
        return super().save(**kwargs)

    def get_role(self, obj):
        user = getattr(obj, 'user', None)
        if user and user.role:
            return user.role.get_name_display()
        return 'Be rolės'
    
    def get_signature_image_url(self, obj):
        """Grąžina pilną URL parašo/stampo paveikslėliui"""
        if obj.signature_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.signature_image.url)
            return obj.signature_image.url
        return None


class InvoiceSettingsSerializer(serializers.ModelSerializer):
    """Sąskaitų nustatymų serializer"""
    
    last_invoice_number = serializers.SerializerMethodField(read_only=True)
    next_invoice_number = serializers.SerializerMethodField(read_only=True)
    next_invoice_number_edit = serializers.CharField(write_only=True, required=False, allow_blank=True)
    
    class Meta:
        model = InvoiceSettings
        fields = [
            'id', 'default_vat_rate', 'default_payment_term_days',
            'invoice_prefix_sales', 'invoice_number_width',
            'invoice_footer_text', 'auto_numbering',
            'currency_code', 'currency_symbol', 'decimal_places', 'decimal_separator',
            'default_display_options', 'notes',
            'last_invoice_number', 'next_invoice_number', 'next_invoice_number_edit',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_invoice_number', 'next_invoice_number']
    
    def validate_next_invoice_number_edit(self, value):
        """Validuoja sekantį sąskaitos numerį"""
        if not value or value.strip() == '':
            return value
        
        value = value.strip().upper()
        
        # Gauti prefix ir width iš instance arba initial_data (jei jie keičiami)
        prefix = None
        width = None
        
        # Pirmiausia bandyti iš initial_data (jei keičiami) - validacijos metu validated_data dar nėra
        if 'invoice_prefix_sales' in self.initial_data:
            prefix = self.initial_data['invoice_prefix_sales']
        elif self.instance:
            prefix = self.instance.invoice_prefix_sales
        
        if 'invoice_number_width' in self.initial_data:
            width = self.initial_data['invoice_number_width']
        elif self.instance:
            width = self.instance.invoice_number_width
        
        prefix = prefix or 'LOG'
        width = width or 7
        
        if not value.startswith(prefix):
            raise serializers.ValidationError(f"Sąskaitos numeris turi prasidėti su '{prefix}'")
        
        # Ištraukti skaičių
        number_part = value[len(prefix):]
        try:
            number = int(number_part)
            if number < 1:
                raise serializers.ValidationError("Sąskaitos numerio skaičius turi būti didesnis už 0")
            
            # Patikrinti ar skaitmenų skaičius atitinka width
            if len(number_part) != width:
                raise serializers.ValidationError(f"Sąskaitos numerio skaitmenų skaičius turi būti {width}")
        except ValueError:
            raise serializers.ValidationError("Sąskaitos numerio skaitinė dalis turi būti skaičius")
        
        return value
    
    def save(self, **kwargs):
        """Išsaugoti nustatymus ir atnaujinti skaitliuką, jei nurodytas next_invoice_number_edit"""
        instance = super().save(**kwargs)
        
        # Jei nurodytas next_invoice_number_edit, atnaujinti InvoiceNumberSequence
        # Saugiai patikrinti ar validated_data yra prieinamas (jis meta AssertionError jei nėra is_valid())
        try:
            next_invoice_number = self.validated_data.get('next_invoice_number_edit')
            if next_invoice_number and next_invoice_number.strip():
                current_year = datetime.now().year
                prefix = instance.invoice_prefix_sales or 'LOG'
                
                # Ištraukti skaičių iš numerio
                number_str = next_invoice_number.strip().upper()[len(prefix):]
                try:
                    next_number = int(number_str)
                    # Atnaujinti skaitliuką (last_number turi būti next_number - 1, nes kai kuriama sąskaita, jis padidinamas +1)
                    sequence, _ = InvoiceNumberSequence.objects.get_or_create(
                        year=current_year,
                        defaults={'last_number': max(0, next_number - 1)}
                    )
                    if sequence.last_number != next_number - 1:
                        sequence.last_number = max(0, next_number - 1)
                        sequence.save()
                except (ValueError, IndexError):
                    pass  # Jei klaida, ignoruoti
        except (AttributeError, AssertionError):
            # Jei validated_data nėra prieinamas (nėra iškviestas is_valid()), ignoruoti
            pass
        
        return instance
    
    def get_last_invoice_number(self, obj):
        """Grąžina paskutinės išrašytos sąskaitos numerį - pagal skaitinę vertę, ne datą"""
        from apps.invoices.utils import get_max_existing_invoice_number
        
        prefix = obj.invoice_prefix_sales or 'LOG'
        width = obj.invoice_number_width or 7
        
        # Rasti maksimalų sąskaitos numerį su tuo pačiu prefix'u (pagal skaitinę vertę)
        # Naudoti optimizuotą funkciją, kuri naudoja _extract_numeric_suffix
        max_number = get_max_existing_invoice_number(prefix=prefix, width=width)
        
        if max_number > 0:
            return f"{prefix}{max_number:0{width}d}"
        return None
    
    def get_next_invoice_number(self, obj):
        """Apskaičiuoja sekantį sąskaitos numerį. Jei skaitliukas atsilieka nuo paskutinės sąskaitos, sinchronizuoja."""
        from apps.invoices.utils import get_max_existing_invoice_number
        
        current_year = datetime.now().year
        sequence, _ = InvoiceNumberSequence.objects.get_or_create(
            year=current_year,
            defaults={'last_number': 0}
        )

        prefix = obj.invoice_prefix_sales or 'LOG'
        width = obj.invoice_number_width or 7

        # Rasti maksimalų sąskaitos numerį su tuo pačiu prefix'u (pagal skaitinę vertę)
        # Naudoti optimizuotą funkciją, kuri naudoja _extract_numeric_suffix
        max_number = get_max_existing_invoice_number(prefix=prefix, width=width)

        # Sinchronizuoti skaitliuką su maksimaliu numeriu
        if max_number > sequence.last_number:
            sequence.last_number = max_number
            sequence.save(update_fields=['last_number'])

        # Jei yra maksimalus numeris, naudoti jį, kitu atveju - sekos numerį
        if max_number > 0:
            next_number = max_number + 1
        else:
            next_number = sequence.last_number + 1
            
        return f"{prefix}{next_number:0{width}d}"


class OrderSettingsSerializer(serializers.ModelSerializer):
    """Užsakymų nustatymų serializer"""
    last_order_number = serializers.SerializerMethodField(read_only=True)
    next_order_number = serializers.SerializerMethodField(read_only=True)
    next_order_number_edit = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = OrderSettings
        fields = [
            'id', 'order_prefix', 'order_number_width', 'auto_numbering', 'my_price_percentage',
            'payment_terms', 'payment_terms_en', 'payment_terms_ru',
            'carrier_obligations', 'client_obligations', 'notes',
            'last_order_number', 'next_order_number', 'next_order_number_edit',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_order_number', 'next_order_number']

    def validate_carrier_obligations(self, value):
        """Validuoti, kad carrier_obligations yra teisingo formato"""
        if not isinstance(value, list):
            raise serializers.ValidationError("carrier_obligations turi būti masyvas")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Kiekvienas carrier_obligations elementas turi būti objektas")
            if 'text' not in item or not isinstance(item['text'], str):
                raise serializers.ValidationError("Kiekvienas carrier_obligations elementas turi turėti 'text' lauką")
            if not item['text'].strip():
                raise serializers.ValidationError("carrier_obligations punktai negali būti tušti")
        return value

    def validate_client_obligations(self, value):
        """Validuoti, kad client_obligations yra teisingo formato"""
        if not isinstance(value, list):
            raise serializers.ValidationError("client_obligations turi būti masyvas")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Kiekvienas client_obligations elementas turi būti objektas")
            if 'text' not in item or not isinstance(item['text'], str):
                raise serializers.ValidationError("Kiekvienas client_obligations elementas turi turėti 'text' lauką")
            if not item['text'].strip():
                raise serializers.ValidationError("client_obligations punktai negali būti tušti")
        return value

    def validate_next_order_number_edit(self, value):
        if not value or value.strip() == '':
            return value
        value = value.strip()
        # Tikriname formatą PREFIX-NNN (PREFIX gali būti bet koks tekstas, pvz.: 2025, LOG, etc.)
        parts = value.split('-')
        if len(parts) != 2:
            raise serializers.ValidationError("Numeris turi būti formatu PREFIX-NNN, pvz.: 2025-001")
        prefix_part = parts[0]
        number_part = parts[1]
        if not prefix_part or not prefix_part.strip():
            raise serializers.ValidationError("Prefiksas negali būti tuščias")
        if not number_part.isdigit():
            raise serializers.ValidationError("Skaitinė dalis turi būti skaičius")
        # Naudoti initial_data validacijos metu, validated_data nėra prieinamas
        width = self.initial_data.get('order_number_width', getattr(self.instance, 'order_number_width', 3) or 3)
        if len(number_part) != width:
            raise serializers.ValidationError(f"Skaitmenų skaičius turi būti {width}")
        if int(number_part) < 1:
            raise serializers.ValidationError("Skaičius turi būti didesnis už 0")
        # Jei prefiksas yra skaičius (metai), patikrinti, kad būtų tinkamas
        if prefix_part.isdigit():
            year = int(prefix_part)
            if year < 2000 or year > 9999:
                raise serializers.ValidationError("Metai neteisingi numerio pradžioje")
        return value

    def save(self, **kwargs):
        instance = super().save(**kwargs)
        # Saugiai patikrinti ar validated_data yra prieinamas (jis meta AssertionError jei nėra is_valid())
        try:
            if 'next_order_number_edit' in self.validated_data:
                edited = self.validated_data.get('next_order_number_edit')
                if edited and edited.strip():
                    parts = edited.split('-')
                    prefix_part = parts[0]
                    number = int(parts[1])
                    # Jei prefiksas yra skaičius (metai), naudoti kaip year, kitu atveju - dabartinius metus
                    year = int(prefix_part) if prefix_part.isdigit() else datetime.now().year
                    seq, _ = OrderNumberSequence.objects.get_or_create(year=year, defaults={'last_number': 0})
                    # last_number = next - 1
                    desired_last = max(0, number - 1)
                    if seq.last_number != desired_last:
                        seq.last_number = desired_last
                        seq.save()
        except (AttributeError, AssertionError):
            # Jei validated_data nėra prieinamas (nėra iškviestas is_valid()), ignoruoti
            pass
        return instance

    def get_last_order_number(self, obj):
        last = Order.objects.exclude(order_number__isnull=True).exclude(order_number='').order_by('-created_at').first()
        return last.order_number if last else None

    def get_next_order_number(self, obj):
        from datetime import datetime
        # Naudoti order_prefix, jei nustatytas, kitu atveju - dabartinius metus
        prefix = obj.order_prefix.strip() if obj.order_prefix else str(datetime.now().year)
        year = int(prefix) if prefix.isdigit() else datetime.now().year
        seq, _ = OrderNumberSequence.objects.get_or_create(year=year, defaults={'last_number': 0})
        width = obj.order_number_width or 3
        return f"{prefix}-{seq.last_number + 1:0{width}d}"


class ExpeditionSettingsSerializer(serializers.ModelSerializer):
    """Ekspedicijų numeravimo nustatymų serializer"""

    last_expedition_number = serializers.SerializerMethodField(read_only=True)
    next_expedition_number = serializers.SerializerMethodField(read_only=True)
    next_expedition_number_edit = serializers.CharField(required=False, allow_blank=True, write_only=False)

    class Meta:
        model = ExpeditionSettings
        fields = [
            'id',
            'expedition_prefix',
            'expedition_number_width',
            'auto_numbering',
            'payment_terms',
            'payment_terms_en',
            'payment_terms_ru',
            'carrier_obligations',
            'client_obligations',
            'last_expedition_number',
            'next_expedition_number',
            'next_expedition_number_edit',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_expedition_number', 'next_expedition_number']

    def get_last_expedition_number(self, obj):
        """Grąžina paskutinį naudotą ekspedicijos numerį (didžiausią iš visų tipų)"""
        from django.db.models import Max

        # Rasti didžiausią expedition_number iš visų OrderCarrier objektų
        result = OrderCarrier.objects.exclude(
            expedition_number__isnull=True
        ).exclude(
            expedition_number__exact=''
        ).aggregate(max_number=Max('expedition_number'))

        return result['max_number']

    def get_next_expedition_number(self, obj):
        """Grąžina sekantį ekspedicijos numerį"""
        if obj.auto_numbering:
            from apps.orders.models import ExpeditionNumberSequence
            try:
                sequence = ExpeditionNumberSequence.objects.get(pk=1)
                next_number = sequence.last_carrier_number + 1
                prefix = obj.expedition_prefix or 'E'
                width = obj.expedition_number_width or 5
                number_str = str(next_number).zfill(width)
                return f"{prefix}{number_str}"
            except ExpeditionNumberSequence.DoesNotExist:
                prefix = obj.expedition_prefix or 'E'
                width = obj.expedition_number_width or 5
                number_str = str(1).zfill(width)
                return f"{prefix}{number_str}"
        return None

    def to_representation(self, instance):
        """Prideda next_expedition_number_edit lauką į atsakymą"""
        data = super().to_representation(instance)
        data['next_expedition_number_edit'] = self.get_next_expedition_number(instance)
        return data

    def _get_current_prefix(self) -> str:
        """Grąžina dabartinį prefiksa"""
        if self.instance:
            return self.instance.expedition_prefix or 'E'
        return self.initial_data.get('expedition_prefix', 'E')

    def _get_current_width(self) -> int:
        """Grąžina dabartinį skaičių plotį"""
        if self.instance:
            return self.instance.expedition_number_width or 5
        return self.initial_data.get('expedition_number_width', 5)

    def validate_next_expedition_number_edit(self, value):
        """Validuoja įvestą sekantį ekspedicijos numerį"""
        if not value or value.strip() == '':
            return value

        value = value.strip()
        prefix = self._get_current_prefix()
        width = self._get_current_width()

        if not value.upper().startswith(prefix.upper()):
            raise serializers.ValidationError(f'Numeris turi prasidėti prefiksu "{prefix}".')

        numeric_part = value[len(prefix):]
        if not numeric_part.isdigit():
            raise serializers.ValidationError('Po prefikso turi būti tik skaitmenys.')

        if len(numeric_part) != width:
            raise serializers.ValidationError(f'Skaitmenų skaičius turi būti {width}.')

        if int(numeric_part) < 1:
            raise serializers.ValidationError('Skaičius turi būti didesnis už 0.')

        return value

    def save(self, **kwargs):
        """Išsaugo nustatymus ir atnaujina seką, jei nurodytas next_expedition_number_edit"""
        instance = super().save(**kwargs)

        # Apdoroti next_expedition_number_edit
        try:
            if 'next_expedition_number_edit' in self.validated_data:
                edited = self.validated_data.get('next_expedition_number_edit')
                if edited and edited.strip():
                    prefix = instance.expedition_prefix or 'E'
                    width = instance.expedition_number_width or 5

                    numeric_part = edited[len(prefix):]
                    number = int(numeric_part)

                    # Atnaujinti ExpeditionNumberSequence
                    sequence, _ = ExpeditionNumberSequence.objects.get_or_create(
                        pk=1,
                        defaults={'last_carrier_number': 0, 'last_warehouse_number': 0, 'last_cost_number': 0}
                    )

                    # last_carrier_number = next - 1
                    desired_last = max(0, number - 1)
                    if sequence.last_carrier_number != desired_last:
                        sequence.last_carrier_number = desired_last
                        sequence.save()
        except (AttributeError, AssertionError):
            # Jei validated_data nėra prieinamas (nėra iškviestas is_valid()), ignoruoti
            pass

        return instance


class WarehouseExpeditionSettingsSerializer(serializers.ModelSerializer):
    """Sandėlių ekspedicijų numeravimo nustatymų serializer"""

    last_warehouse_number = serializers.SerializerMethodField(read_only=True)
    next_warehouse_number = serializers.SerializerMethodField(read_only=True)
    next_warehouse_number_edit = serializers.CharField(required=False, allow_blank=True, write_only=False)

    def get_last_warehouse_number(self, obj):
        """Grąžina paskutinį naudotą sandėlių ekspedicijos numerį (didžiausią)"""
        from django.db.models import Max

        # Rasti didžiausią expedition_number iš warehouse tipo carriers
        result = OrderCarrier.objects.filter(
            carrier_type='warehouse'
        ).exclude(
            expedition_number__isnull=True
        ).exclude(
            expedition_number__exact=''
        ).aggregate(max_number=Max('expedition_number'))

        return result['max_number']

    def get_next_warehouse_number(self, obj):
        """Grąžina sekantį sandėlių ekspedicijos numerį"""
        if obj.auto_numbering:
            from apps.orders.models import ExpeditionNumberSequence
            try:
                sequence = ExpeditionNumberSequence.objects.get(pk=1)
                next_number = sequence.last_warehouse_number + 1
                prefix = obj.expedition_prefix or 'WH-'
                width = obj.expedition_number_width or 5
                number_str = str(next_number).zfill(width)
                return f"{prefix}{number_str}"
            except ExpeditionNumberSequence.DoesNotExist:
                prefix = obj.expedition_prefix or 'WH-'
                width = obj.expedition_number_width or 5
                number_str = str(1).zfill(width)
                return f"{prefix}{number_str}"
        return None

    def to_representation(self, instance):
        """Prideda next_warehouse_number_edit lauką į atsakymą"""
        data = super().to_representation(instance)
        data['next_warehouse_number_edit'] = self.get_next_warehouse_number(instance)
        return data

    def validate_next_warehouse_number_edit(self, value):
        """Validuoja įvestą sekantį sandėlių ekspedicijos numerį"""
        if not value or value.strip() == '':
            return value

        value = value.strip()
        # Naudoti duomenis iš initial_data arba instance
        prefix = self.initial_data.get('expedition_prefix', getattr(self.instance, 'expedition_prefix', 'WH-'))
        width = self.initial_data.get('expedition_number_width', getattr(self.instance, 'expedition_number_width', 5))

        if not value.upper().startswith(prefix.upper()):
            raise serializers.ValidationError(f'Numeris turi prasidėti prefiksu "{prefix}".')

        numeric_part = value[len(prefix):]
        if not numeric_part.isdigit():
            raise serializers.ValidationError('Po prefikso turi būti tik skaitmenys.')

        if len(numeric_part) != width:
            raise serializers.ValidationError(f'Skaitmenų skaičius turi būti {width}.')

        if int(numeric_part) < 1:
            raise serializers.ValidationError('Skaičius turi būti didesnis už 0.')

        return value

    def save(self, **kwargs):
        """Išsaugo nustatymus ir atnaujina seką, jei nurodytas next_warehouse_number_edit"""
        instance = super().save(**kwargs)

        # Apdoroti next_warehouse_number_edit
        try:
            if 'next_warehouse_number_edit' in self.validated_data:
                edited = self.validated_data.get('next_warehouse_number_edit')
                if edited and edited.strip():
                    prefix = instance.expedition_prefix or 'WH-'
                    width = instance.expedition_number_width or 5

                    numeric_part = edited[len(prefix):]
                    number = int(numeric_part)

                    # Atnaujinti ExpeditionNumberSequence warehouse lauką
                    from apps.orders.models import ExpeditionNumberSequence
                    sequence, _ = ExpeditionNumberSequence.objects.get_or_create(
                        pk=1,
                        defaults={'last_carrier_number': 0, 'last_warehouse_number': 0, 'last_cost_number': 0}
                    )

                    # last_warehouse_number = next - 1
                    desired_last = max(0, number - 1)
                    if sequence.last_warehouse_number != desired_last:
                        sequence.last_warehouse_number = desired_last
                        sequence.save(update_fields=['last_warehouse_number'])
        except (AttributeError, AssertionError):
            # Jei validated_data nėra prieinamas (nėra iškviestas is_valid()), ignoruoti
            pass

        return instance

    class Meta:
        model = WarehouseExpeditionSettings
        fields = [
            'id',
            'expedition_prefix',
            'expedition_number_width',
            'auto_numbering',
            'last_warehouse_number',
            'next_warehouse_number',
            'next_warehouse_number_edit',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_warehouse_number', 'next_warehouse_number']



class CostExpeditionSettingsSerializer(serializers.ModelSerializer):
    """Išlaidų numeravimo nustatymų serializer"""

    last_cost_number = serializers.SerializerMethodField(read_only=True)
    next_cost_number = serializers.SerializerMethodField(read_only=True)
    next_cost_number_edit = serializers.CharField(required=False, allow_blank=True, write_only=False)

    def get_last_cost_number(self, obj):
        """Grąžina paskutinį naudotą išlaidų ekspedicijos numerį (didžiausią)"""
        from django.db.models import Max

        # Rasti didžiausią expedition_number iš OrderCost objektų
        result = OrderCost.objects.exclude(
            expedition_number__isnull=True
        ).exclude(
            expedition_number__exact=''
        ).aggregate(max_number=Max('expedition_number'))

        return result['max_number']

    def get_next_cost_number(self, obj):
        """Grąžina sekantį išlaidų ekspedicijos numerį"""
        if obj.auto_numbering:
            from apps.orders.models import ExpeditionNumberSequence
            try:
                sequence = ExpeditionNumberSequence.objects.get(pk=1)
                next_number = sequence.last_cost_number + 1
                prefix = obj.expedition_prefix or 'ISL-'
                width = obj.expedition_number_width or 5
                number_str = str(next_number).zfill(width)
                return f"{prefix}{number_str}"
            except ExpeditionNumberSequence.DoesNotExist:
                prefix = obj.expedition_prefix or 'ISL-'
                width = obj.expedition_number_width or 5
                number_str = str(1).zfill(width)
                return f"{prefix}{number_str}"
        return None

    def to_representation(self, instance):
        """Prideda next_cost_number_edit lauką į atsakymą"""
        data = super().to_representation(instance)
        data['next_cost_number_edit'] = self.get_next_cost_number(instance)
        return data

    def validate_next_cost_number_edit(self, value):
        """Validuoja įvestą sekantį išlaidų ekspedicijos numerį"""
        if not value or value.strip() == '':
            return value

        value = value.strip()
        # Naudoti duomenis iš initial_data arba instance
        prefix = self.initial_data.get('expedition_prefix', getattr(self.instance, 'expedition_prefix', 'ISL-'))
        width = self.initial_data.get('expedition_number_width', getattr(self.instance, 'expedition_number_width', 5))

        if not value.upper().startswith(prefix.upper()):
            raise serializers.ValidationError(f'Numeris turi prasidėti prefiksu "{prefix}".')

        numeric_part = value[len(prefix):]
        if not numeric_part.isdigit():
            raise serializers.ValidationError('Po prefikso turi būti tik skaitmenys.')

        if len(numeric_part) != width:
            raise serializers.ValidationError(f'Skaitmenų skaičius turi būti {width}.')

        if int(numeric_part) < 1:
            raise serializers.ValidationError('Skaičius turi būti didesnis už 0.')

        return value

    def save(self, **kwargs):
        """Išsaugo nustatymus ir atnaujina seką, jei nurodytas next_cost_number_edit"""
        instance = super().save(**kwargs)

        # Apdoroti next_cost_number_edit
        try:
            if 'next_cost_number_edit' in self.validated_data:
                edited = self.validated_data.get('next_cost_number_edit')
                if edited and edited.strip():
                    prefix = instance.expedition_prefix or 'ISL-'
                    width = instance.expedition_number_width or 5

                    numeric_part = edited[len(prefix):]
                    number = int(numeric_part)

                    # Atnaujinti ExpeditionNumberSequence cost lauką
                    from apps.orders.models import ExpeditionNumberSequence
                    sequence, _ = ExpeditionNumberSequence.objects.get_or_create(
                        pk=1,
                        defaults={'last_carrier_number': 0, 'last_warehouse_number': 0, 'last_cost_number': 0}
                    )

                    # last_cost_number = next - 1
                    desired_last = max(0, number - 1)
                    if sequence.last_cost_number != desired_last:
                        sequence.last_cost_number = desired_last
                        sequence.save(update_fields=['last_cost_number'])
        except (AttributeError, AssertionError):
            # Jei validated_data nėra prieinamas (nėra iškviestas is_valid()), ignoruoti
            pass

        return instance

    class Meta:
        model = CostExpeditionSettings
        fields = [
            'id',
            'expedition_prefix',
            'expedition_number_width',
            'auto_numbering',
            'payment_terms', 'payment_terms_en', 'payment_terms_ru',
            'carrier_obligations', 'client_obligations',
            'last_cost_number',
            'next_cost_number',
            'next_cost_number_edit',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_cost_number', 'next_cost_number']

        read_only_fields = ['id', 'created_at', 'updated_at', 'last_expedition_number', 'next_expedition_number']

    def validate_carrier_obligations(self, value):
        """Validuoti, kad carrier_obligations yra teisingo formato"""
        if not isinstance(value, list):
            raise serializers.ValidationError("carrier_obligations turi būti masyvas")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Kiekvienas carrier_obligations elementas turi būti objektas")
            if 'text' not in item or not isinstance(item['text'], str):
                raise serializers.ValidationError("Kiekvienas carrier_obligations elementas turi turėti 'text' lauką")
            if not item['text'].strip():
                raise serializers.ValidationError("carrier_obligations punktai negali būti tušti")
        return value

    def validate_client_obligations(self, value):
        """Validuoti, kad client_obligations yra teisingo formato"""
        if not isinstance(value, list):
            raise serializers.ValidationError("client_obligations turi būti masyvas")
        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Kiekvienas client_obligations elementas turi būti objektas")
            if 'text' not in item or not isinstance(item['text'], str):
                raise serializers.ValidationError("Kiekvienas client_obligations elementas turi turėti 'text' lauką")
            if not item['text'].strip():
                raise serializers.ValidationError("client_obligations punktai negali būti tušti")
        return value

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._next_expedition_override = None
        self._cached_last_number: Optional[int] = None

    def _get_current_prefix(self) -> str:
        if 'expedition_prefix' in self.initial_data:
            value = self.initial_data.get('expedition_prefix')
            if isinstance(value, str) and value.strip():
                return value.strip()
        if self.instance:
            return self.instance.expedition_prefix or 'E'
        return 'E'

    def _get_current_width(self) -> int:
        if 'expedition_number_width' in self.initial_data:
            try:
                width = int(self.initial_data.get('expedition_number_width'))
                if width >= 1:
                    return width
            except (TypeError, ValueError):
                pass
        if self.instance:
            return self.instance.expedition_number_width or 5
        return 5

    def _sync_sequence_with_existing(self, obj: ExpeditionSettings) -> int:
        """Grąžina didžiausią sistemoje esantį numerį ir, jei reikia, pakoreguoja seką."""

        if self._cached_last_number is not None:
            return self._cached_last_number

        prefix = obj.expedition_prefix or 'E'
        width = obj.expedition_number_width or 5

        sequence, _ = ExpeditionNumberSequence.objects.get_or_create(
            pk=1,
            defaults={'last_number': 0}
        )

        max_number = sequence.last_number or 0

        carrier_numbers = OrderCarrier.objects.filter(
            expedition_number__isnull=False
        ).exclude(
            expedition_number__exact=''
        ).values_list('expedition_number', flat=True)

        prefix_upper = prefix.upper()

        for value in carrier_numbers:
            cleaned = (value or '').strip()
            if not cleaned:
                continue

            normalized = cleaned.upper()
            if not normalized.startswith(prefix_upper):
                continue

            numeric_part = normalized[len(prefix):]
            if not numeric_part.isdigit():
                continue

            number = int(numeric_part)
            if number > max_number:
                max_number = number

        if max_number > sequence.last_number:
            sequence.last_number = max_number
            sequence.save(update_fields=['last_number', 'updated_at'])

        self._cached_last_number = max_number
        return max_number

    def get_last_expedition_number(self, obj: ExpeditionSettings):
        max_number = self._sync_sequence_with_existing(obj)
        if not max_number:
            return None
        prefix = obj.expedition_prefix or 'E'
        width = obj.expedition_number_width or 5
        return f"{prefix}{max_number:0{width}d}"

    def get_next_expedition_number(self, obj: ExpeditionSettings):
        last_number = self._sync_sequence_with_existing(obj)
        prefix = obj.expedition_prefix or 'E'
        width = obj.expedition_number_width or 5
        return f"{prefix}{(last_number + 1):0{width}d}"

    def validate_next_expedition_number_edit(self, value: str) -> str:
        if value in [None, '']:
            self._next_expedition_override = None
            return ''

        if not isinstance(value, str):
            raise serializers.ValidationError('Neteisingas formato tipas.')

        value = value.strip()
        prefix = self._get_current_prefix()
        width = self._get_current_width()

        if not value.upper().startswith(prefix.upper()):
            raise serializers.ValidationError(f'Numeris turi prasidėti prefiksu "{prefix}".')

        numeric_part = value[len(prefix):]
        if not numeric_part.isdigit():
            raise serializers.ValidationError('Po prefikso turi būti tik skaitmenys.')

        if len(numeric_part) != width:
            raise serializers.ValidationError(f'Skaitmenų skaičius turi būti {width}.')

        number = int(numeric_part)
        if number < 1:
            raise serializers.ValidationError('Numeris turi būti didesnis už 0.')

        self._next_expedition_override = number
        return value

    def save(self, **kwargs):
        next_override = self._next_expedition_override
        self.validated_data.pop('next_expedition_number_edit', None)
        instance = super().save(**kwargs)

        if next_override is not None:
            with transaction.atomic():
                sequence, _ = ExpeditionNumberSequence.objects.select_for_update().get_or_create(
                    pk=1,
                    defaults={'last_number': 0}
                )
                sequence.last_number = max(0, next_override - 1)
                sequence.save(update_fields=['last_number', 'updated_at'])
                self._cached_last_number = sequence.last_number

        # Po išsaugojimo išvalome override, kad neatkartotų pakartotinai
        self._next_expedition_override = None
        return instance


class PVMRateSerializer(serializers.ModelSerializer):
    """PVM tarifų su straipsniais serializer"""
    
    class Meta:
        model = PVMRate
        fields = [
            'id', 'rate', 'article', 'article_en', 'article_ru', 
            'is_active', 'sequence_order',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class NotificationSettingsSerializer(serializers.ModelSerializer):
    """Pranešimų nustatymų serializer"""
    
    class Meta:
        model = NotificationSettings
        fields = [
            'id',
            # SMTP nustatymai
            'smtp_enabled', 'smtp_host', 'smtp_port', 'smtp_use_tls',
            'smtp_username', 'smtp_password', 'smtp_from_email', 'smtp_from_name',
            # IMAP nustatymai
            'imap_enabled', 'imap_host', 'imap_port', 'imap_use_ssl', 'imap_use_starttls',
            'imap_username', 'imap_password', 'imap_folder', 'imap_sync_interval_minutes',
            # Automatiniai el. laiškų pranešimai - SĄSKAITOS
            'email_notify_due_soon_enabled', 'email_notify_due_soon_days_before',
            'email_notify_due_soon_recipient', 'email_notify_due_soon_min_amount',
            'email_notify_unpaid_enabled', 'email_notify_unpaid_interval_days',
            'email_notify_unpaid_recipient', 'email_notify_unpaid_min_amount',
            'email_notify_overdue_enabled', 'email_notify_overdue_min_days',
            'email_notify_overdue_max_days', 'email_notify_overdue_interval_days',
            'email_notify_overdue_recipient', 'email_notify_overdue_min_amount',
            'overdue_reminder_mode',
            # UŽSAKYMAI
            'email_notify_new_order_enabled', 'email_notify_new_order_recipient',
            'email_notify_order_status_changed_enabled', 'email_notify_order_status_changed_recipient',
            # EKSPEDICIJOS
            'email_notify_new_expedition_enabled', 'email_notify_new_expedition_recipient',
            'email_notify_expedition_status_changed_enabled', 'email_notify_expedition_status_changed_recipient',
            # MOKĖJIMAI
            'email_notify_payment_received_enabled', 'email_notify_payment_received_recipient',
            'email_notify_payment_received_min_amount',
            'email_notify_partial_payment_enabled', 'email_notify_partial_payment_recipient',
            # KRITINĖS SĄSKAITOS
            'email_notify_high_amount_invoice_enabled', 'email_notify_high_amount_threshold',
            'email_notify_high_amount_recipient',
            # El. laiškų pasirašymas ir pranešimai
            'email_signature', 'email_auto_generated_notice', 'email_contact_manager_notice',
            # Testavimo režimas el. laiškams
            'email_test_mode', 'email_test_recipient',
            # UI pranešimų nustatymai
            'toast_duration_ms', 'toast_position', 'toast_enable_sound',
            'toast_success_color', 'toast_error_color', 'toast_info_color',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'smtp_password': {'write_only': True},
            'imap_password': {'write_only': True},
        }


class UISettingsSerializer(serializers.ModelSerializer):
    """UI nustatymų serializer - spalviniai būsenų nustatymai"""
    
    class Meta:
        model = UISettings
        fields = [
            'id', 'status_colors', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def validate_status_colors(self, value):
        """Validuoja status_colors struktūrą"""
        if not isinstance(value, dict):
            raise serializers.ValidationError("status_colors turi būti objektas (dict)")
        
        # Tikriname, ar yra reikalingi raktai
        expected_keys = ['invoices', 'expeditions', 'orders', 'payment_colors']
        for key in expected_keys:
            if key not in value:
                value[key] = {}
        
        # Validuojame invoices spalvas
        if 'invoices' in value:
            invoice_statuses = ['paid', 'not_paid', 'partially_paid', 'overdue']
            for status in invoice_statuses:
                if status in value['invoices']:
                    color = value['invoices'][status]
                    if not isinstance(color, str) or not color.startswith('#'):
                        raise serializers.ValidationError(
                            f"Invoice status '{status}' spalva turi būti hex formatu (pvz. #28a745)"
                        )
        
        # Validuojame expeditions spalvas
        if 'expeditions' in value:
            expedition_statuses = ['new', 'in_progress', 'completed', 'cancelled']
            for status in expedition_statuses:
                if status in value['expeditions']:
                    color = value['expeditions'][status]
                    if not isinstance(color, str) or not color.startswith('#'):
                        raise serializers.ValidationError(
                            f"Expedition status '{status}' spalva turi būti hex formatu (pvz. #17a2b8)"
                        )
        
        # Validuojame orders spalvas
        if 'orders' in value:
            order_statuses = ['new', 'assigned', 'executing', 'waiting_for_docs', 'finished', 'canceled']
            for status in order_statuses:
                if status in value['orders']:
                    color = value['orders'][status]
                    if not isinstance(color, str) or not color.startswith('#'):
                        raise serializers.ValidationError(
                            f"Order status '{status}' spalva turi būti hex formatu (pvz. #17a2b8)"
                        )
        
        # Validuojame payment_colors spalvas
        if 'payment_colors' in value:
            payment_statuses = ['no_invoice', 'unpaid', 'partially_paid', 'paid']
            for status in payment_statuses:
                if status in value['payment_colors']:
                    color = value['payment_colors'][status]
                    if not isinstance(color, str) or not color.startswith('#'):
                        raise serializers.ValidationError(
                            f"Payment status '{status}' spalva turi būti hex formatu (pvz. #000000)"
                        )
        
        return value


class EmailTemplateSerializer(serializers.ModelSerializer):
    """El. laiškų šablonų serializer"""
    
    template_type_display = serializers.CharField(source='get_template_type_display', read_only=True)
    
    class Meta:
        model = EmailTemplate
        fields = [
            'id', 'template_type', 'template_type_display',
            'subject', 'body_text', 'body_html', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'template_type_display', 'created_at', 'updated_at']


class OrderAutoStatusSettingsSerializer(serializers.ModelSerializer):
    """Užsakymų automatinio statusų keitimo nustatymų serializer"""
    
    class Meta:
        model = OrderAutoStatusSettings
        fields = [
            'id', 'enabled', 'auto_new_to_assigned', 'auto_assigned_to_executing',
            'auto_executing_to_waiting', 'auto_waiting_to_payment',
            'auto_payment_to_finished', 'auto_finished_to_closed', 'days_after_unloading'
        ]
        read_only_fields = ['id']
    
    def save(self, **kwargs):
        """Išsaugoti nustatymus (singleton pattern)"""
        instance, _ = OrderAutoStatusSettings.objects.get_or_create(pk=1)
        for attr, value in self.validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance


class OrderAutoStatusRuleSerializer(serializers.ModelSerializer):
    """Automatinio statusų keitimo taisyklės serializer"""
    
    class Meta:
        model = OrderAutoStatusRule
        fields = [
            'id', 'from_status', 'to_status', 'conditions', 'logic_operator',
            'enabled', 'priority', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

