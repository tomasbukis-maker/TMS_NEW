from rest_framework import serializers
from decimal import Decimal
from datetime import datetime, date
from .models import SalesInvoice, PurchaseInvoice, ExpenseCategory, SalesInvoiceOrder
from apps.partners.serializers import PartnerSerializer
from apps.orders.serializers import OrderSerializer


class JSONListField(serializers.Field):
    """JSON masyvo laukas"""
    def to_representation(self, value):
        return value if value is not None else []
    
    def to_internal_value(self, data):
        if data is None:
            return []
        if isinstance(data, str):
            # Jei gavome JSON stringą (pvz., iš FormData), parsinti
            try:
                import json
                data = json.loads(data)
            except (json.JSONDecodeError, ValueError):
                raise serializers.ValidationError('Neteisingas JSON formatas')
        if not isinstance(data, list):
            raise serializers.ValidationError('Privalo būti masyvas')
        return data


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """Išlaidų kategorijų serializer"""
    
    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class SalesInvoiceListSerializer(serializers.ModelSerializer):
    """Supaprastintas serializer sąskaitų sąrašui"""
    invoice_type_display = serializers.CharField(source='get_invoice_type_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    paid_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    remaining_amount = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    
    class Meta:
        model = SalesInvoice
        fields = [
            'id', 'invoice_number', 'invoice_type', 'invoice_type_display',
            'partner', 'related_order', 'related_order_id', 'credit_invoice',
            'payment_status', 'payment_status_display',
            'amount_net', 'vat_rate', 'vat_rate_article', 'amount_total',
            'paid_amount', 'remaining_amount',
            'issue_date', 'due_date', 'payment_date', 'related_orders',
            'overdue_days', 'created_at'
        ]
        read_only_fields = ['id', 'amount_total', 'paid_amount', 'remaining_amount', 'overdue_days', 'created_at', 'related_order_id']
    
    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Kai susieta keli užsakymai – rodyti visų susietų užsakymų sumų sumą
        try:
            effective_total = instance.effective_amount_total
            data['amount_net'] = str(instance.effective_amount_net)
            data['amount_total'] = str(effective_total)
            data['remaining_amount'] = str(effective_total - instance.paid_amount)
        except (AttributeError, Exception):
            pass
        # Užtikrinti, kad vat_rate būtų skaičius (sąraše rodyti „be PVM“ / „su PVM“)
        try:
            data['vat_rate'] = str(instance.vat_rate) if instance.vat_rate is not None else '0'
        except (AttributeError, Exception):
            data['vat_rate'] = '0'
        try:
            data['partner'] = {
                'id': instance.partner.id,
                'name': instance.partner.name,
                'code': getattr(instance.partner, 'code', '')
            }
        except (AttributeError, Exception):
            data['partner'] = {'id': 0, 'name': 'N/A', 'code': ''}
        
        try:
            if instance.related_order:
                data['related_order'] = {
                    'id': instance.related_order.id,
                    'order_number': instance.related_order.order_number or f'Užsakymas #{instance.related_order.id}'
                }
            else:
                data['related_order'] = None
        except (AttributeError, Exception):
            data['related_order'] = None
        # Apmokėjimo datą rodyti tik kai sąskaita apmokėta – kad Partnerių puslapyje neapmokėtos nerodytų klaidingos datos
        if getattr(instance, 'payment_status', None) != 'paid':
            data['payment_date'] = None
        return data


class SalesInvoiceSerializer(serializers.ModelSerializer):
    """Pardavimo sąskaitos serializer"""
    partner = PartnerSerializer(read_only=True)
    partner_id = serializers.IntegerField(write_only=True)
    related_order = OrderSerializer(read_only=True)
    related_order_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    invoice_type_display = serializers.CharField(source='get_invoice_type_display', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    invoice_items = serializers.SerializerMethodField()
    related_orders = serializers.SerializerMethodField(read_only=True)
    payment_history = serializers.SerializerMethodField(read_only=True)
    additional_order_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        allow_empty=True
    )
    
    class Meta:
        model = SalesInvoice
        fields = [
            'id', 'invoice_number', 'invoice_type', 'invoice_type_display',
            'partner', 'partner_id', 'related_order', 'related_order_id',
            'credit_invoice', 'payment_status', 'payment_status_display',
            'amount_net', 'vat_rate', 'vat_rate_article', 'amount_total',
            'paid_amount', 'remaining_amount',
            'manual_lines',
            'issue_date', 'due_date', 'payment_date', 'related_orders', 'additional_order_ids',
            'overdue_days', 'notes', 'display_options', 'invoice_items', 'visible_items_indexes',
            'payment_history', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'amount_total', 'paid_amount', 'remaining_amount', 'overdue_days', 'created_at', 'updated_at', 'invoice_items', 'related_orders']
        extra_kwargs = {
            'invoice_number': {'required': False, 'allow_blank': True}
        }

    def to_representation(self, instance):
        """Kai susieta keli užsakymai – amount_net/amount_total = visų susietų užsakymų sumų suma."""
        data = super().to_representation(instance)
        try:
            data['amount_net'] = str(instance.effective_amount_net)
            data['amount_total'] = str(instance.effective_amount_total)
            data['remaining_amount'] = str(instance.effective_amount_total - instance.paid_amount)
        except (AttributeError, Exception):
            pass
        return data

    def get_payment_history(self, obj):
        """Grąžina mokėjimų istoriją"""
        payments = obj.payment_history.all().order_by('-payment_date', '-created_at')
        return [{
            'id': p.id,
            'amount': str(p.amount),
            'payment_date': p.payment_date.isoformat() if p.payment_date else None,
            'payment_method': p.payment_method or '',
            'notes': p.notes or '',
            'created_at': p.created_at.isoformat() if p.created_at else None
        } for p in payments]

    def get_related_orders(self, obj):
        try:
            orders = list(obj.related_orders.select_related('client').all())
            if obj.related_order_id and (not any(o.id == obj.related_order_id for o in orders)) and obj.related_order:
                orders.insert(0, obj.related_order)
            amounts_map = {}
            if hasattr(obj, 'invoice_orders'):
                for link in obj.invoice_orders.all():
                    amounts_map[link.order.id] = str(link.amount)
            return [{
                'id': order.id,
                'order_number': order.order_number or f'Užsakymas #{order.id}',
                'order_date': order.order_date.isoformat() if order.order_date else None,
                'amount': amounts_map.get(order.id, '0.00'),
            } for order in orders]
        except Exception:
            return []

    def _order_route_description(self, order):
        """Sudaro maršruto aprašymą iš užsakymo (route_stops arba route_from/route_to). Jei maršruto nėra – grąžina bendrą pavadinimą."""
        route_parts = []
        stops = list(order.route_stops.all().order_by('sequence_order'))
        if stops:
            for s in stops:
                stop_label = '🛫' if s.stop_type == 'loading' else '🛬'
                loc = (s.city or s.country or '').strip() or '?'
                d_info = f" ({s.date_from.strftime('%Y.%m.%d')})" if getattr(s, 'date_from', None) else ""
                route_parts.append(f"{stop_label} {loc}{d_info}")
        else:
            f_city = (order.route_from_city or "").strip()
            f_country = (order.route_from_country or "").strip()
            f_loc = ", ".join(filter(None, [f_city, f_country])).strip() or (order.route_from or "").strip()
            t_city = (order.route_to_city or "").strip()
            t_country = (order.route_to_country or "").strip()
            t_loc = ", ".join(filter(None, [t_city, t_country])).strip() or (order.route_to or "").strip()
            if f_loc:
                route_parts.append(f"🛫 {f_loc}")
            if t_loc:
                route_parts.append(f"🛬 {t_loc}")
        if route_parts:
            return "Maršrutas: " + " → ".join(route_parts)
        return "Prekės ir paslaugos"

    def get_invoice_items(self, obj):
        """Grąžina sąskaitos eilutes. PVM tarifas imamas iš užsakymo (order.vat_rate), jei jis nustatytas – kad 0% PVM užsakymai nerodytų PVM."""
        invoice_items = []
        display_options = obj.display_options or {}
        
        # Pirmiausia iš invoice_orders (M2M) – keli užsakymai vienoje sąskaitoje
        try:
            if hasattr(obj, 'invoice_orders') and obj.invoice_orders.exists():
                for link in obj.invoice_orders.select_related('order').all():
                    order = link.order
                    amount_net = float(link.amount) if link.amount is not None else 0.0
                    vat_rate = float(order.vat_rate) if order.vat_rate is not None else (float(obj.vat_rate) if obj.vat_rate else 0.0)
                    vat_amount = amount_net * vat_rate / 100.0
                    invoice_items.append({
                        'description': self._order_route_description(order),
                        'amount_net': amount_net,
                        'vat_amount': vat_amount,
                        'amount_total': amount_net + vat_amount,
                        'vat_rate': vat_rate
                    })
            elif obj.related_order:
                order = obj.related_order
                amount_net = float(obj.amount_net) if obj.amount_net is not None else 0.0
                vat_rate = float(order.vat_rate) if order.vat_rate is not None else (float(obj.vat_rate) if obj.vat_rate else 0.0)
                vat_amount = amount_net * vat_rate / 100.0
                description = self._order_route_description(order)
                invoice_items.append({
                    'description': description,
                    'amount_net': amount_net,
                    'vat_amount': vat_amount,
                    'amount_total': amount_net + vat_amount,
                    'vat_rate': vat_rate
                })
        except Exception:
            pass
        
        if obj.manual_lines:
            for line in obj.manual_lines:
                vat_rate = float(line.get('vat_rate', obj.vat_rate)) if line.get('vat_rate') else float(obj.vat_rate) if obj.vat_rate else 0.0
                amount_net = float(line.get('amount_net', 0))
                vat_amount = amount_net * vat_rate / 100.0
                invoice_items.append({
                    'description': line.get('description', ''),
                    'amount_net': amount_net,
                    'vat_amount': vat_amount,
                    'amount_total': amount_net + vat_amount,
                    'vat_rate': vat_rate
                })
        
        return invoice_items

    def validate_manual_lines(self, value):
        if not value:
            return value
        if not isinstance(value, list):
            raise serializers.ValidationError('Privalo būti sąrašas')
        return value

    def create(self, validated_data):
        partner_id = validated_data.pop('partner_id', None)
        related_order_id = validated_data.pop('related_order_id', None)
        if partner_id is not None:
            validated_data['partner_id'] = partner_id
        if related_order_id is not None:
            validated_data['related_order_id'] = related_order_id
        
        amount_net = validated_data.get('amount_net')
        vat_rate = validated_data.get('vat_rate', Decimal('21.00'))
        if amount_net is not None:
            if isinstance(amount_net, str):
                amount_net = Decimal(amount_net)
            if isinstance(vat_rate, str):
                vat_rate = Decimal(vat_rate)
            validated_data['amount_total'] = amount_net * (Decimal('1.00') + vat_rate / Decimal('100.00'))
        
        return super().create(validated_data)

    def update(self, instance, validated_data):
        partner_id = validated_data.pop('partner_id', None)
        related_order_id = validated_data.pop('related_order_id', None)
        validated_data.pop('payment_status', None)
        
        if 'payment_date' in validated_data:
            payment_date_val = validated_data['payment_date']
            if payment_date_val == '' or payment_date_val is None:
                validated_data['payment_date'] = None
        
        if partner_id is not None:
            validated_data['partner_id'] = partner_id
        if related_order_id is not None:
            validated_data['related_order_id'] = related_order_id
        
        # Kai keičiamas vat_rate arba amount_net – perskaičiuoti amount_total
        amount_net = validated_data.get('amount_net')
        vat_rate = validated_data.get('vat_rate')
        if amount_net is not None or vat_rate is not None:
            net = Decimal(str(amount_net)) if amount_net is not None else (instance.amount_net or Decimal('0'))
            rate = Decimal(str(vat_rate)) if vat_rate is not None else (instance.vat_rate or Decimal('0'))
            if isinstance(net, str):
                net = Decimal(net)
            if isinstance(rate, str):
                rate = Decimal(rate)
            validated_data['amount_total'] = net * (Decimal('1.00') + rate / Decimal('100.00'))
        
        return super().update(instance, validated_data)


class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    """Pirkimo sąskaitos serializer"""
    partner = PartnerSerializer(read_only=True)
    partner_id = serializers.IntegerField(write_only=True)
    related_order = OrderSerializer(read_only=True)
    related_order_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    related_orders = serializers.SerializerMethodField(read_only=True)
    related_order_ids = JSONListField(required=False, allow_null=True)
    related_orders_amounts = JSONListField(required=False, allow_null=True)
    expense_category = ExpenseCategorySerializer(read_only=True)
    expense_category_id = serializers.CharField(write_only=True, required=False, allow_blank=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    payment_history = serializers.SerializerMethodField(read_only=True)
    invoice_file_url = serializers.SerializerMethodField()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if getattr(instance, 'payment_status', None) != 'paid':
            data['payment_date'] = None
        return data

    def create(self, validated_data):
        related_order_ids = validated_data.pop('related_order_ids', [])
        related_orders_amounts = validated_data.pop('related_orders_amounts', [])
        expense_category_id = validated_data.pop('expense_category_id', None)
        
        if expense_category_id and str(expense_category_id).strip():
            try:
                category = ExpenseCategory.objects.get(id=int(expense_category_id))
                validated_data['expense_category'] = category
            except (ExpenseCategory.DoesNotExist, ValueError, TypeError):
                pass
        
        amount_net = validated_data.get('amount_net')
        vat_rate = validated_data.get('vat_rate', Decimal('21.00'))
        if amount_net is not None:
            if isinstance(amount_net, str):
                amount_net = Decimal(amount_net)
            if isinstance(vat_rate, str):
                vat_rate = Decimal(vat_rate)
            validated_data['amount_total'] = amount_net * (Decimal('1.00') + vat_rate / Decimal('100.00'))
        
        invoice = super().create(validated_data)
        
        if related_order_ids:
            invoice.related_orders.set(related_order_ids)
        if related_orders_amounts:
            invoice.related_orders_amounts = related_orders_amounts
            invoice.save(update_fields=['related_orders_amounts'])
        
        return invoice

    def update(self, instance, validated_data):
        related_order_ids = validated_data.pop('related_order_ids', None)
        related_orders_amounts = validated_data.pop('related_orders_amounts', None)
        # payment_status leidžiame atnaujinti per PATCH (redagavime)
        
        if 'payment_date' in validated_data:
            payment_date_val = validated_data['payment_date']
            if payment_date_val == '' or payment_date_val is None:
                validated_data['payment_date'] = None
        
        # Kai keičiamas amount_net arba vat_rate – perskaičiuoti amount_total (jis read_only, todėl reikia įrašyti rankiniu būdu)
        amount_net = validated_data.get('amount_net')
        vat_rate = validated_data.get('vat_rate')
        if amount_net is not None or vat_rate is not None:
            net = amount_net if amount_net is not None else instance.amount_net
            rate = vat_rate if vat_rate is not None else instance.vat_rate
            if net is not None and rate is not None:
                net = Decimal(str(net)) if not isinstance(net, Decimal) else net
                rate = Decimal(str(rate)) if not isinstance(rate, Decimal) else rate
                validated_data['amount_total'] = net * (Decimal('1.00') + rate / Decimal('100.00'))
        
        invoice = super().update(instance, validated_data)
        
        if related_order_ids is not None:
            invoice.related_orders.set(related_order_ids)
            # Atnaujinti ir seną related_order (FK), kad užsakymo Finansai skiltyje
            # nerodytų šios sąskaitos užsakymams, kurie buvo pašalinti iš related_orders
            first_id = None
            if related_order_ids:
                first_id = related_order_ids[0]
                if first_id is not None and not isinstance(first_id, int):
                    first_id = int(first_id)
            if invoice.related_order_id != first_id:
                invoice.related_order_id = first_id
                invoice.save(update_fields=['related_order_id'])
            # Kai atjungiame visus užsakymus, išvalyti ir related_orders_amounts, kad nebeliktų „dalinio apmokėjimo“ pėdsakų
            if not related_order_ids:
                invoice.related_orders_amounts = []
                invoice.save(update_fields=['related_orders_amounts'])
        if related_orders_amounts is not None:
            invoice.related_orders_amounts = related_orders_amounts
            invoice.save(update_fields=['related_orders_amounts'])
        
        return invoice

    def get_related_orders(self, obj):
        """Grąžina susijusius užsakymus su jų sumomis"""
        orders = obj.related_orders.all()
        amounts_dict = {item.get('order_id'): item.get('amount', '0.00') for item in (obj.related_orders_amounts or [])}
        
        return [{
            'id': order.id,
            'order_number': order.order_number or f'Užsakymas #{order.id}',
            'order_date': order.order_date.isoformat() if order.order_date else None,
            'amount': amounts_dict.get(order.id, '0.00'),
        } for order in orders]
    
    def get_payment_history(self, obj):
        """Grąžina mokėjimų istoriją"""
        payments = obj.payment_history.all().order_by('-payment_date', '-created_at')
        return [{
            'id': p.id,
            'amount': str(p.amount),
            'payment_date': p.payment_date.isoformat() if p.payment_date else None,
            'payment_method': p.payment_method or '',
            'notes': p.notes or '',
            'created_at': p.created_at.isoformat() if p.created_at else None
        } for p in payments]
    
    def get_invoice_file_url(self, obj):
        """Grąžina pilną URL į failą"""
        request = self.context.get('request')
        
        if obj.invoice_file:
            if request:
                return request.build_absolute_uri(obj.invoice_file.url)
            return obj.invoice_file.url
        
        if obj.related_attachment and obj.related_attachment.file:
            if request:
                return request.build_absolute_uri(obj.related_attachment.file.url)
            return obj.related_attachment.file.url
        
        try:
            from apps.mail.models import MailAttachment
            attachment = MailAttachment.objects.filter(related_purchase_invoice=obj).first()
            if attachment and attachment.file:
                if request:
                    return request.build_absolute_uri(attachment.file.url)
                return attachment.file.url
        except Exception:
            pass
        
        return None

    def validate_expense_category_id(self, value):
        """Validuoti expense_category_id"""
        if not value or value.strip() == '':
            return value
        
        try:
            category_id = int(value)
            ExpenseCategory.objects.get(id=category_id)
            return value
        except (ValueError, ExpenseCategory.DoesNotExist):
            raise serializers.ValidationError('Neteisinga išlaidų kategorija')

    class Meta:
        model = PurchaseInvoice
        fields = [
            'id', 'invoice_number', 'received_invoice_number', 'partner', 'partner_id',
            'related_order', 'related_order_id', 'related_orders', 'related_order_ids', 'related_orders_amounts',
            'expense_category', 'expense_category_id',
            'payment_status', 'payment_status_display',
            'amount_net', 'vat_rate', 'amount_total',
            'paid_amount', 'remaining_amount',
            'issue_date', 'received_date', 'due_date', 'payment_date',
            'invoice_file', 'invoice_file_url', 'overdue_days', 'notes', 'payment_history', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'amount_total', 'paid_amount', 'remaining_amount', 'overdue_days', 'created_at', 'updated_at']
