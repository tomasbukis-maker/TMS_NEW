from rest_framework import serializers
from .models import Partner, Contact
from .utils import (
    normalize_partner_code,
    fix_lithuanian_diacritics,
    is_valid_company_code,
    is_valid_vat_code,
    get_company_code_format,
)


class ContactSerializer(serializers.ModelSerializer):
    """Kontakto serializer"""
    partner_id = serializers.PrimaryKeyRelatedField(
        source='partner', queryset=Partner.objects.all(), write_only=True, required=False, allow_null=True
    )
    name = serializers.SerializerMethodField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)

    def get_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.email

    class Meta:
        model = Contact
        fields = ['id', 'partner_id', 'name', 'first_name', 'last_name', 'email', 'phone', 'position', 'notes', 'is_trusted', 'is_advertising', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        # Pataisom LT raides jei reikia
        if 'first_name' in attrs and attrs['first_name']:
            attrs['first_name'] = fix_lithuanian_diacritics(attrs['first_name'])
        if 'last_name' in attrs and attrs['last_name']:
            attrs['last_name'] = fix_lithuanian_diacritics(attrs['last_name'])
        if 'position' in attrs and attrs['position']:
            attrs['position'] = fix_lithuanian_diacritics(attrs['position'])
        return attrs


class PartnerSerializer(serializers.ModelSerializer):
    """Partnerio serializer"""
    contact_person = ContactSerializer(read_only=True)
    contact_person_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    contacts = ContactSerializer(many=True, read_only=True)
    contacts_count = serializers.SerializerMethodField()
    code_valid = serializers.SerializerMethodField()
    vat_code_valid = serializers.SerializerMethodField()
    company_code_format = serializers.SerializerMethodField()

    class Meta:
        model = Partner
        fields = [
            'id', 'name', 'code', 'vat_code', 'address',
            'code_valid', 'vat_code_valid', 'company_code_format', 'has_code_errors',
            'contact_person', 'contact_person_id', 'contacts', 'contacts_count', 'payment_term_days',
            'email_notify_due_soon', 'email_notify_unpaid', 'email_notify_overdue',
            'email_notify_manager_invoices',
            'status', 'status_display', 'is_supplier', 'is_client',
            'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'has_code_errors']
    
    def get_contacts_count(self, obj):
        """Grąžina kontaktų skaičių"""
        # Jei yra anotuotas contacts_count (iš annotate), naudojame jį
        if hasattr(obj, 'contacts_count'):
            return obj.contacts_count
        # Kitu atveju skaičiuojame
        return obj.contacts.count()

    def get_code_valid(self, obj):
        """Ar įmonės kodas atitinka formatą (9 skaitmenys)."""
        return is_valid_company_code(obj.code or '')

    def get_vat_code_valid(self, obj):
        """Ar PVM kodas teisingas (tuščias; LT+9 arba LT+12 skaitmenų)."""
        return is_valid_vat_code(obj.vat_code or '')

    def get_company_code_format(self, obj):
        """'current' (9 sk.), 'legacy' (7 sk.), arba null (netinkamas)."""
        return get_company_code_format(obj.code or '')
    
    def validate(self, attrs):
        """Validacija: privalo būti arba klientas, arba tiekėjas"""
        is_supplier = attrs.get('is_supplier', self.instance.is_supplier if self.instance else False)
        is_client = attrs.get('is_client', self.instance.is_client if self.instance else False)
        
        if not is_supplier and not is_client:
            raise serializers.ValidationError(
                "Partneris privalo būti arba Klientas, arba Tiekėjas (arba abu)."
            )

        # Normalizuojame code ir tikriname dublikatus (pagal normalizuotą reikšmę)
        incoming_code = attrs.get('code', self.instance.code if self.instance else None)
        if incoming_code:
            normalized = normalize_partner_code(incoming_code)
            attrs['code'] = normalized
            qs = Partner.objects.all()
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            for existing in qs.only('id', 'code'):
                if normalize_partner_code(existing.code) == normalized:
                    raise serializers.ValidationError({
                        'code': 'Partneris su tokiu įmonės kodu jau egzistuoja.'
                    })
        # Pataisome pavadinimą (LT diakritikai)
        if 'name' in attrs and attrs['name']:
            attrs['name'] = fix_lithuanian_diacritics(attrs['name'])
        if 'address' in attrs and attrs['address']:
            attrs['address'] = fix_lithuanian_diacritics(attrs['address'])
        return attrs

