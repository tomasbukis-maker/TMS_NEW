from rest_framework import viewsets, status
import re
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as filters
from rest_framework import filters as drf_filters
from rest_framework.exceptions import ValidationError
from datetime import datetime, timedelta, date
from django.utils import timezone
from django.shortcuts import get_object_or_404, render
from django.http import HttpResponse
from django.db import models
from decimal import Decimal
from io import BytesIO
from xhtml2pdf import pisa
from django.core.mail import EmailMessage, get_connection
from smtplib import SMTPException
import socket
from .models import SalesInvoice, PurchaseInvoice, ExpenseCategory, SalesInvoiceOrder, InvoicePayment
from .serializers import (
    SalesInvoiceSerializer, SalesInvoiceListSerializer, PurchaseInvoiceSerializer, ExpenseCategorySerializer
)
from .utils import generate_invoice_number, amount_to_words, get_max_existing_invoice_number, synchronize_invoice_sequence, get_first_available_gap_number, find_invoice_number_gaps
from .bank_utils import parse_csv_bank_statement, process_bank_statement
from .tasks import update_overdue_invoices
from .email_service import send_debtor_reminder_email, send_debtor_reminder_bulk
from apps.mail.email_logger import send_email_message_with_logging
from apps.orders.models import Order
from apps.settings.models import CompanyInfo, InvoiceSettings
from apps.settings.email_utils import render_email_template
import logging

logger = logging.getLogger(__name__)


class InvoicePageNumberPagination(PageNumberPagination):
    """Paginacija sąskaitoms su page_size parametru"""
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000


class SalesInvoiceFilter(filters.FilterSet):
    """Filtrai pardavimo sąskaitoms"""
    issue_date__gte = filters.DateFilter(field_name='issue_date', lookup_expr='gte')
    issue_date__lte = filters.DateFilter(field_name='issue_date', lookup_expr='lte')
    due_date__gte = filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_date__lte = filters.DateFilter(field_name='due_date', lookup_expr='lte')
    related_order = filters.NumberFilter(method='filter_related_order')
    
    def filter_related_order(self, queryset, name, value):
        """Filtruoja pagal related_order ForeignKey ARBA ManyToMany ryšį per SalesInvoiceOrder"""
        from apps.invoices.models import SalesInvoiceOrder
        from django.db.models import Q
        
        # Rasti sąskaitų ID, kurios susijusios su užsakymu per ForeignKey
        fk_invoice_ids = set(queryset.filter(related_order_id=value).values_list('id', flat=True))
        
        # Rasti sąskaitų ID, kurios susijusios su užsakymu per ManyToMany
        m2m_invoice_ids = set(SalesInvoiceOrder.objects.filter(order_id=value).values_list('invoice_id', flat=True))
        
        # Sujungti abu ID rinkinius
        all_invoice_ids = fk_invoice_ids | m2m_invoice_ids
        
        # Filtruoti queryset pagal sujungtus ID
        return queryset.filter(id__in=all_invoice_ids)
    
    class Meta:
        model = SalesInvoice
        fields = ['invoice_type', 'payment_status', 'partner', 'related_order']


class PurchaseInvoiceFilter(filters.FilterSet):
    """Filtrai pirkimo sąskaitams"""
    issue_date__gte = filters.DateFilter(field_name='issue_date', lookup_expr='gte')
    issue_date__lte = filters.DateFilter(field_name='issue_date', lookup_expr='lte')
    due_date__gte = filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_date__lte = filters.DateFilter(field_name='due_date', lookup_expr='lte')
    related_order = filters.NumberFilter(method='filter_related_order')

    def filter_related_order(self, queryset, name, value):
        """Filtruoja pagal related_order ForeignKey ARBA ManyToMany ryšį"""
        from django.db.models import Q

        # Rasti sąskaitų ID, kurios susijusios su užsakymu per ForeignKey
        fk_invoice_ids = set(queryset.filter(related_order_id=value).values_list('id', flat=True))

        # Rasti sąskaitų ID, kurios susijusios su užsakymu per ManyToMany
        m2m_invoice_ids = set(queryset.filter(related_orders__id=value).values_list('id', flat=True))

        # Sujungti abu ID rinkinius
        all_invoice_ids = fk_invoice_ids.union(m2m_invoice_ids)

        # Grąžinti sąskaitas pagal ID
        if all_invoice_ids:
            return queryset.filter(id__in=all_invoice_ids)
        else:
            return queryset.none()

    class Meta:
        model = PurchaseInvoice
        fields = ['payment_status', 'partner', 'related_order', 'expense_category']


class SalesInvoiceViewSet(viewsets.ModelViewSet):
    """Pardavimo sąskaitų CRUD operacijos"""
    queryset = SalesInvoice.objects.select_related(
        'partner',
        'related_order',
        'related_order__client',
        'related_order__manager'
    ).prefetch_related(
        'related_order__carriers',
        'related_order__carriers__partner',
        'related_order__sales_invoices',
        'related_orders',
        'invoice_orders__order',
        'payment_history'
    ).all()
    serializer_class = SalesInvoiceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = InvoicePageNumberPagination
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_class = SalesInvoiceFilter
    search_fields = ['invoice_number', 'partner__name', 'partner__code']
    ordering_fields = ['issue_date', 'due_date', 'created_at', 'invoice_number']
    ordering = ['-issue_date', '-invoice_number']
    
    def get_serializer_class(self):
        """Naudoti supaprastintą serializer'į sąrašui, pilną - detail veiksmams"""
        if self.action == 'list':
            return SalesInvoiceListSerializer
        return SalesInvoiceSerializer

    def _extract_order_ids(self, serializer):
        # Ištraukti additional_order_ids, jei nėra - naudoti tuščią masyvą
        additional_ids = serializer.validated_data.pop('additional_order_ids', None)
        if additional_ids is None:
            # Jei nėra validated_data, bandyti gauti iš request.data (gali būti, kad serializer nevalidavo)
            if hasattr(serializer, 'initial_data') and 'additional_order_ids' in serializer.initial_data:
                additional_ids = serializer.initial_data.get('additional_order_ids', [])
            else:
                additional_ids = []
        # Užtikrinti, kad additional_ids būtų masyvas
        if not isinstance(additional_ids, list):
            additional_ids = []
        primary_order_id = serializer.validated_data.get('related_order_id')
        order_ids = []
        if primary_order_id:
            order_ids.append(primary_order_id)
        for oid in additional_ids:
            if oid and oid not in order_ids:
                order_ids.append(oid)
        return order_ids

    def _fetch_orders_sequence(self, order_ids):
        if not order_ids:
            return []
        orders = Order.objects.select_related('client').prefetch_related('carriers').filter(id__in=order_ids)
        orders_map = {order.id: order for order in orders}
        ordered_list = [orders_map[oid] for oid in order_ids if oid in orders_map]
        if len(ordered_list) != len(order_ids):
            missing = set(order_ids) - set(orders_map.keys())
            raise ValidationError(f"Užsakymų nerasta: {', '.join(str(m) for m in missing)}")
        return ordered_list

    def _ensure_partner_consistency(self, serializer, orders):
        if not orders:
            return
        first_partner_id = orders[0].client_id
        for order in orders:
            if order.client_id != first_partner_id:
                raise ValidationError("Visi pasirinktų užsakymų klientai turi sutapti.")
        partner_id = serializer.validated_data.get('partner_id')
        if partner_id is None:
            serializer.validated_data['partner_id'] = first_partner_id
        elif partner_id != first_partner_id:
            raise ValidationError("Pasirinktas klientas nesutampa su užsakymų klientu.")

    def _compute_order_amount(self, order):
        if order.client_price_net is not None:
            return Decimal(str(order.client_price_net))
        calculated = getattr(order, 'calculated_client_price_net', None)
        if calculated is not None:
            return Decimal(str(calculated))
        return Decimal('0.00')

    def perform_create(self, serializer):
        """Priskiria sąskaitos numerį, sumuoja pasirinktų užsakymų sumas ir išsaugo ryšius."""
        provided_number = serializer.validated_data.get('invoice_number')
        
        # Optimizacija: užkrauti visas esamas invoice_numbers vieną kartą
        existing_numbers = set(SalesInvoice.objects.values_list('invoice_number', flat=True))
        
        # Jei pateiktas numeris – naudoti, bet patikrinti unikalumą; jei toks jau yra, generuoti sekantį
        if isinstance(provided_number, str) and provided_number.strip():
            candidate = provided_number.strip().upper()
            if candidate in existing_numbers:
                # Sugeneruoti sekantį laisvą numerį (sinchronizacija jau atlikta generate_invoice_number viduje)
                invoice_number = generate_invoice_number()
                # Jei vis tiek kolizija (retai), rasti pirmą laisvą numerį
                max_attempts = 10
                attempts = 0
                while invoice_number in existing_numbers and attempts < max_attempts:
                    # Panaudoti seką, bet rasti pirmą laisvą numerį
                    from apps.settings.models import InvoiceSettings
                    from apps.invoices.models import InvoiceNumberSequence
                    from datetime import datetime
                    inv_settings = InvoiceSettings.load()
                    prefix = (inv_settings.invoice_prefix_sales or 'LOG')
                    width = inv_settings.invoice_number_width or 7
                    current_year = datetime.now().year
                    seq, _ = InvoiceNumberSequence.objects.get_or_create(year=current_year)
                    seq.last_number += 1
                    seq.save()
                    invoice_number = f"{prefix}{seq.last_number:0{width}d}"
                    attempts += 1
                if invoice_number in existing_numbers:
                    # Jei vis tiek kolizija po max_attempts, naudoti pateiktą su unikalumu
                    import uuid
                    invoice_number = f"{candidate}_{uuid.uuid4().hex[:4]}"
            else:
                invoice_number = candidate
        else:
            # Generuoti automatiškai
            invoice_number = generate_invoice_number()
            # Jei kolizija (labai retai), rasti pirmą laisvą
            if invoice_number in existing_numbers:
                from apps.invoices.models import InvoiceNumberSequence
                from datetime import datetime
                inv_settings = InvoiceSettings.load()
                prefix = (inv_settings.invoice_prefix_sales or 'LOG')
                width = inv_settings.invoice_number_width or 7
                current_year = datetime.now().year
                seq, _ = InvoiceNumberSequence.objects.get_or_create(year=current_year)
                seq.last_number += 1
                seq.save()
                invoice_number = f"{prefix}{seq.last_number:0{width}d}"

        # Gauti numatytąsias display_options vertes iš InvoiceSettings
        from apps.settings.models import InvoiceSettings
        invoice_settings = InvoiceSettings.load()
        default_display_options = invoice_settings.default_display_options or {}
        
        # Jei serializer duomenyse nėra display_options, naudoti numatytąsias
        if 'display_options' not in serializer.validated_data or not serializer.validated_data.get('display_options'):
            serializer.validated_data['display_options'] = default_display_options.copy()
        else:
            # Sujungti numatytąsias vertes su perduotais duomenimis
            invoice_display_options = serializer.validated_data.get('display_options', {})
            merged_options = {**default_display_options, **invoice_display_options}
            serializer.validated_data['display_options'] = merged_options
        
        # Jei pateiktos manual_lines – perskaičiuoti amount_net pagal eilučių sumą (net jei yra related_order)
        order_ids = self._extract_order_ids(serializer)
        orders_sequence = self._fetch_orders_sequence(order_ids) if order_ids else []
        self._ensure_partner_consistency(serializer, orders_sequence)

        manual_lines = serializer.validated_data.get('manual_lines') or []
        order_amounts = {}
        vat_rates = []
        if manual_lines:
            total_net = sum(Decimal(str(item.get('amount_net') or 0)) for item in manual_lines)
            serializer.validated_data['amount_net'] = total_net
            if orders_sequence:
                _, order_amounts, vat_rates = self._calculate_orders_totals(orders_sequence)
                if ('vat_rate' not in serializer.validated_data or serializer.validated_data.get('vat_rate') in (None, '')) and vat_rates:
                    serializer.validated_data['vat_rate'] = vat_rates[0]
        # Jei nėra manual_lines, bet yra related_order, perskaičiuoti amount_net iš užsakymo
        # PRIORITETAS: jei yra client_price_net, naudoti jį (jis jau turi papildomas išlaidas)
        # Jei nėra client_price_net, naudoti calculated_client_price_net (transporto + mano + papildomos)
        elif orders_sequence:
            total_net, order_amounts, vat_rates = self._calculate_orders_totals(orders_sequence)
            serializer.validated_data['amount_net'] = total_net
            if ('vat_rate' not in serializer.validated_data or serializer.validated_data.get('vat_rate') in (None, '')) and vat_rates:
                serializer.validated_data['vat_rate'] = vat_rates[0]
        invoice = serializer.save(invoice_number=invoice_number)

        # Jei visible_items_indexes nėra nustatytas, apskaičiuoti pagal display_options
        if not invoice.visible_items_indexes or len(invoice.visible_items_indexes) == 0:
            from .utils import calculate_visible_items_indexes
            try:
                visible_indexes = calculate_visible_items_indexes(invoice)
                if visible_indexes:
                    invoice.visible_items_indexes = visible_indexes
                    invoice.save(update_fields=['visible_items_indexes'])
            except Exception as e:
                # Jei klaida, palikti tuščią (visos rodomos pagal nutylėjimą)
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Klaida apskaičiuojant visible_items_indexes: {e}")

        # Visada sinchronizuoti seką su didžiausiu egzistuojančiu numeriu
        try:
            from .utils import synchronize_invoice_sequence
            synchronize_invoice_sequence()
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Klaida sinchronizuojant sąskaitos numeracijos seką: {e}")

        self._sync_invoice_orders(invoice, orders_sequence, order_amounts)
        
        # Registruoti veiksmą ActivityLog
        try:
            from apps.core.services.activity_log_service import ActivityLogService
            ActivityLogService.log_sales_invoice_created(invoice, user=self.request.user, request=self.request)
        except Exception as e:
            logger.warning(f"Failed to log sales invoice creation: {e}")
    
    def _calculate_orders_totals(self, orders_sequence):
        """Apskaičiuoja bendrą sumą iš visų užsakymų"""
        total_net = Decimal('0.00')
        order_amounts = {}
        vat_rates = []
        
        for order in orders_sequence:
            # Prioritetas: client_price_net (jei įvestas rankiniu būdu)
            # Jei nėra, naudoti calculated_client_price_net
            amount = order.client_price_net or order.calculated_client_price_net or Decimal('0.00')
            order_amounts[order.id] = amount
            total_net += amount
            
            if order.vat_rate and order.vat_rate not in vat_rates:
                vat_rates.append(order.vat_rate)
        
        return total_net, order_amounts, vat_rates
    
    def _sync_invoice_orders(self, invoice, orders_sequence, order_amounts):
        """Sinchronizuoja užsakymus su sąskaita per SalesInvoiceOrder intermediate modelį"""
        from apps.invoices.models import SalesInvoiceOrder
        from apps.orders.models import Order
        
        if not orders_sequence:
            return
        
        # Išsaugoti senuosius ID prieš trinant
        previous_ids = set(SalesInvoiceOrder.objects.filter(invoice=invoice).values_list('order_id', flat=True))
        
        # Ištrinti esamus ryšius
        SalesInvoiceOrder.objects.filter(invoice=invoice).delete()
        
        # Sukurti naujus ryšius kiekvienam užsakymui
        bulk_relations = []
        new_ids = set()
        vat_rate = invoice.vat_rate or Decimal('21.00')
        
        for order in orders_sequence:
            amount_net = order_amounts.get(order.id, Decimal('0.00'))
            
            bulk_relations.append(SalesInvoiceOrder(
                invoice=invoice,
                order=order,
                amount=amount_net
            ))
            new_ids.add(order.id)
        
        if bulk_relations:
            SalesInvoiceOrder.objects.bulk_create(bulk_relations)
        
        # Atnaujinti client_invoice_issued flag'us
        # Pastaba: bulk_create nevykdo signal'ų, todėl reikia rankiniu būdu atnaujinti
        # Naudojame tą pačią logiką kaip signal'uose
        all_affected_ids = new_ids | previous_ids
        
        for order_id in all_affected_ids:
            try:
                order = Order.objects.get(id=order_id)
                # Tikrinti ar yra sąskaitų - VISADA tikrinti DB tiesiogiai
                from apps.invoices.models import SalesInvoice, SalesInvoiceOrder
                has_invoices = (
                    SalesInvoice.objects.filter(related_order=order).exists() or
                    SalesInvoiceOrder.objects.filter(order=order).exists()
                )
                # Atnaujinti lauką tik jei reikšmė skiriasi
                if order.client_invoice_issued != has_invoices:
                    order.client_invoice_issued = has_invoices
                    order.save(update_fields=['client_invoice_issued'])
            except Order.DoesNotExist:
                pass
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Klaida atnaujinant client_invoice_issued užsakymui {order_id}: {e}")
    
    def perform_update(self, serializer):
        """Atnaujina sąskaitą ir sinchronizuoja užsakymus"""
        order_ids = self._extract_order_ids(serializer)
        orders_sequence = self._fetch_orders_sequence(order_ids) if order_ids else []
        self._ensure_partner_consistency(serializer, orders_sequence)
        
        manual_lines = serializer.validated_data.get('manual_lines') or []
        order_amounts = {}
        vat_rates = []
        
        if manual_lines:
            total_net = sum(Decimal(str(item.get('amount_net') or 0)) for item in manual_lines)
            serializer.validated_data['amount_net'] = total_net
            if orders_sequence:
                _, order_amounts, vat_rates = self._calculate_orders_totals(orders_sequence)
                if ('vat_rate' not in serializer.validated_data or serializer.validated_data.get('vat_rate') in (None, '')) and vat_rates:
                    serializer.validated_data['vat_rate'] = vat_rates[0]
        elif orders_sequence:
            total_net, order_amounts, vat_rates = self._calculate_orders_totals(orders_sequence)
            serializer.validated_data['amount_net'] = total_net
            if ('vat_rate' not in serializer.validated_data or serializer.validated_data.get('vat_rate') in (None, '')) and vat_rates:
                serializer.validated_data['vat_rate'] = vat_rates[0]
        
        invoice = serializer.save()
        self._sync_invoice_orders(invoice, orders_sequence, order_amounts)
        
        # Registruoti veiksmą ActivityLog
        try:
            from apps.core.services.activity_log_service import ActivityLogService
            ActivityLogService.log_sales_invoice_updated(invoice, user=self.request.user, request=self.request)
        except Exception as e:
            logger.warning(f"Failed to log sales invoice update: {e}")
    
    def perform_destroy(self, instance):
        """
        Trinant sąskaitą, patikrinti ar trinama paskutinė (didžiausia) sąskaita.
        Jei taip - atnaujinti numeracijos seką su didžiausiu likusiu numeriu.
        Jei trinama vidurinė/senesnė sąskaita - sekantis numeris nesikeičia.
        
        Pastaba: client_invoice_issued flag'ų atnaujinimas dabar vykdomas automatiškai per signal'us.
        """
        try:
            from apps.settings.models import InvoiceSettings
            
            # Gauti nustatymus
            inv_settings = InvoiceSettings.load()
            prefix = (inv_settings.invoice_prefix_sales or 'LOG')
            width = inv_settings.invoice_number_width or 7
            
            # Patikrinti ar trinamas numeris prasideda prefix
            deleted_number = None
            if instance.invoice_number and instance.invoice_number.upper().startswith(prefix.upper()):
                suffix = instance.invoice_number[len(prefix):]
                match = re.search(r'(\d+)(?!.*\d)', suffix)
                if match:
                    try:
                        deleted_number = int(match.group(1))
                    except ValueError:
                        deleted_number = None
            
            # Registruoti veiksmą ActivityLog prieš ištrynimą
            try:
                from apps.core.services.activity_log_service import ActivityLogService
                ActivityLogService.log_sales_invoice_deleted(instance, user=self.request.user, request=self.request)
            except Exception as e:
                logger.warning(f"Failed to log sales invoice deletion: {e}")
            
            # Ištrinti sąskaitą (signal'ai automatiškai atnaujins client_invoice_issued)
            super().perform_destroy(instance)
            
            # Jei trinamas numeris su prefix, patikrinti ar tai buvo didžiausias
            if deleted_number is not None:
                # Surasti didžiausią likusį numerį (po trinimo)
                max_existing, _ = get_max_existing_invoice_number(prefix, width, return_separator=True)
                
                # Jei trinta sąskaita buvo didžiausia arba lygi didžiausiam (po trinimo max_existing jau mažesnis)
                # Tai reiškia, kad trinta buvo paskutinė - reikia atnaujinti seką
                # Jei trinta vidurinė/senesnė - sekantis numeris nesikeičia
                if deleted_number >= max_existing:
                    # Sinchronizuoti seką su didžiausiu likusiu numeriu
                    synchronize_invoice_sequence(prefix, width)
                    
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Klaida trinant sąskaitą ir atnaujinant numeracijos seką: {e}", exc_info=True)
            # Jei klaida, vis tiek ištrinti sąskaitą (jei dar neištrinta)
            try:
                super().perform_destroy(instance)
            except:
                pass
    
    @action(detail=False, methods=['get'])
    def get_first_gap_number(self, request):
        """
        Grąžina pirmą tuščią numerį iš tarpų sąskaitų numeracijoje.
        GET /api/invoices/sales/get_first_gap_number/
        """
        try:
            gap_number = get_first_available_gap_number()
            if gap_number:
                return Response({
                    'has_gap': True,
                    'gap_number': gap_number,
                    'message': f'Yra tuščias numeris: {gap_number}'
                })
            else:
                return Response({
                    'has_gap': False,
                    'gap_number': None,
                    'message': 'Tarpų nėra'
                })
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Klaida gaunant pirmą tuščią numerį: {e}", exc_info=True)
            return Response({
                'has_gap': False,
                'gap_number': None,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'])
    def get_gaps(self, request):
        """
        Grąžina visus tarpus sąskaitų numeracijoje.
        GET /api/invoices/sales/get_gaps/
        """
        try:
            max_gaps = int(request.query_params.get('max_gaps', 5))
            gaps = find_invoice_number_gaps(max_gaps=max_gaps)
            
            # Formatuoti tarpus su prefix ir width
            from apps.settings.models import InvoiceSettings
            settings = InvoiceSettings.load()
            prefix = settings.invoice_prefix_sales or 'LOG'
            width = settings.invoice_number_width or 7
            
            formatted_gaps = []
            for gap in gaps:
                gap_start, gap_end = gap
                if gap_start == gap_end:
                    # Vienas numeris
                    formatted_gaps.append({
                        'number': f"{prefix}{gap_start:0{width}d}",
                        'range': f"{prefix}{gap_start:0{width}d}",
                        'count': 1
                    })
                else:
                    # Diapazonas
                    formatted_gaps.append({
                        'number': f"{prefix}{gap_start:0{width}d}",
                        'range': f"{prefix}{gap_start:0{width}d} - {prefix}{gap_end:0{width}d}",
                        'count': gap_end - gap_start + 1
                    })
            
            return Response({
                'has_gaps': len(formatted_gaps) > 0,
                'gaps': formatted_gaps,
                'gaps_count': sum(g['count'] for g in formatted_gaps),
                'message': f'Rasta {len(formatted_gaps)} tarpų' if formatted_gaps else 'Tarpų nėra'
            })
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Klaida gaunant sąskaitų tarpus: {e}", exc_info=True)
            return Response({
                'has_gaps': False,
                'gaps': [],
                'gaps_count': 0,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['post'])
    def generate_from_order(self, request):
        """
        Generuoja sąskaitą pagal užsakymą.
        Body: { "order_id": 1, "invoice_type": "final", "invoice_number": "LOG0003991" (optional) }
        """
        order_id = request.data.get('order_id')
        invoice_type = request.data.get('invoice_type', 'final')
        provided_invoice_number = request.data.get('invoice_number')
        
        try:
            # Gauname užsakymą su visais duomenis (vežėjai, klientas) - reikalinga calculated_client_price_net apskaičiavimui
            order = Order.objects.select_related('client').prefetch_related('carriers').get(id=order_id)
        except Order.DoesNotExist:
            return Response(
                {"error": "Užsakymas nerastas."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Apskaičiuojame sumas iš užsakymo
        # PRIORITETAS: jei yra client_price_net, naudoti jį (jis jau turi papildomas išlaidas)
        # Jei nėra client_price_net, naudoti calculated_client_price_net (transporto + mano + papildomos)
        if order.client_price_net:
            amount_net = order.client_price_net
        else:
            amount_net = order.calculated_client_price_net
        vat_rate = order.vat_rate
        if amount_net:
            amount_total = amount_net * (1 + vat_rate / 100)
        else:
            amount_total = Decimal('0.00')
        
        # Nustatome mokėjimo terminą (pagal partnerio payment_term_days)
        issue_date = timezone.now().date()
        due_date = issue_date + timedelta(days=order.client.payment_term_days or 30)
        
        # Gauti numatytąsias display_options vertes iš InvoiceSettings
        invoice_settings = InvoiceSettings.load()
        default_display_options = invoice_settings.default_display_options or {}
        
        # Nustatyti sąskaitos numerį
        if isinstance(provided_invoice_number, str) and provided_invoice_number.strip():
            # Jei pateiktas numeris - naudoti jį
            invoice_number = provided_invoice_number.strip().upper()
            # Patikrinti ar numeris jau egzistuoja
            if SalesInvoice.objects.filter(invoice_number=invoice_number).exists():
                # Jei egzistuoja, generuoti naują
                invoice_number = generate_invoice_number()
        else:
            # Jei nepateiktas - generuoti automatiškai
            invoice_number = generate_invoice_number()
        
        # Sukuriame sąskaitą
        invoice = SalesInvoice.objects.create(
            invoice_number=invoice_number,
            invoice_type=invoice_type,
            partner=order.client,
            related_order=order,
            amount_net=amount_net,
            vat_rate=vat_rate,
            amount_total=amount_total,
            issue_date=issue_date,
            due_date=due_date,
            display_options=default_display_options.copy()
        )

        SalesInvoiceOrder.objects.create(
            invoice=invoice,
            order=order,
            amount=amount_net or Decimal('0.00')
        )
        # Pastaba: client_invoice_issued dabar atnaujinamas automatiškai per signal'us
        
        # Apskaičiuoti visible_items_indexes pagal display_options
        from .utils import calculate_visible_items_indexes
        try:
            visible_indexes = calculate_visible_items_indexes(invoice)
            if visible_indexes:
                invoice.visible_items_indexes = visible_indexes
                invoice.save(update_fields=['visible_items_indexes'])
        except Exception as e:
            # Jei klaida, palikti tuščią (visos rodomos pagal nutylėjimą)
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Klaida apskaičiuojant visible_items_indexes: {e}")
        
        # Sinchronizuoti seką, jei naudotas pateiktas numeris
        if isinstance(provided_invoice_number, str) and provided_invoice_number.strip():
            synchronize_invoice_sequence()
        
        serializer = SalesInvoiceSerializer(invoice)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    
    def _get_invoice_labels(self, lang):
        """Grąžina vertimus sąskaitos šablonui"""
        if lang == 'en':
            return {
                'invoice_title': 'VAT INVOICE',
                'number': 'No.',
                'date': 'Date:',
                'due_date': 'Due date:',
                'seller': 'Seller:',
                'buyer': 'Buyer:',
                'code': 'Code:',
                'vat_code': 'VAT:',
                'address': 'Address:',
                'bank': 'Bank:',
                'account': 'Acc.:',
                'description': 'Description',
                'amount': 'Amount',
                'vat_rate': 'VAT %',
                'vat_amount': 'VAT amount',
                'total': 'Total',
                'total_eur': 'Total EUR:',
                'amount_in_words': 'Amount in words:',
                'notes': 'Notes:',
                'issued_by': 'Issued by:',
                'received_by': 'Received by:',
                'signature': 'Signature',
                'name_surname': 'First name, last name',
                'date_label': 'Date',
            }
        elif lang == 'ru':
            return {
                'invoice_title': 'СЧЕТ-ФАКТУРА НДС',
                'number': '№',
                'date': 'Дата:',
                'due_date': 'Срок оплаты:',
                'seller': 'Продавец:',
                'buyer': 'Покупатель:',
                'code': 'Код:',
                'vat_code': 'НДС:',
                'address': 'Адрес:',
                'bank': 'Банк:',
                'account': 'Счет:',
                'description': 'Описание',
                'amount': 'Сумма',
                'vat_rate': 'НДС %',
                'vat_amount': 'Сумма НДС',
                'total': 'Итого',
                'total_eur': 'Итого EUR:',
                'amount_in_words': 'Сумма прописью:',
                'notes': 'Примечания:',
                'issued_by': 'Выписал:',
                'received_by': 'Принял:',
                'signature': 'Подпись',
                'name_surname': 'Имя, фамилия',
                'date_label': 'Дата',
            }
        else: # LT
            return {
                'invoice_title': 'PVM SĄSKAITA-FAKTŪRA',
                'number': 'Nr.',
                'date': 'Data:',
                'due_date': 'Mokėjimo terminas:',
                'seller': 'Pardavėjas:',
                'buyer': 'Pirkėjas:',
                'code': 'Kodas:',
                'vat_code': 'PVM kodas:',
                'address': 'Adresas:',
                'bank': 'Bankas:',
                'account': 'Sąsk.:',
                'description': 'Aprašymas',
                'amount': 'Suma',
                'vat_rate': 'PVM %',
                'vat_amount': 'PVM suma',
                'total': 'Iš viso',
                'total_eur': 'Iš viso EUR:',
                'amount_in_words': 'Suma žodžiais:',
                'notes': 'Pastabos:',
                'issued_by': 'Sąskaitą išrašė:',
                'received_by': 'Sąskaitą priėmė:',
                'signature': 'Parašas',
                'name_surname': 'Vardas, pavardė',
                'date_label': 'Data',
            }

    def _prepare_invoice_context(self, invoice, request, lang=None):
        """Paruošia sąskaitos kontekstą su visais užsakymo duomenimis"""
        from apps.invoices.utils import amount_to_words
        
        # Gauti kalbą iš parametro arba užklausos arba numatytąją
        if not lang:
            lang = request.GET.get('lang', request.data.get('lang', 'lt')).lower()
        if lang not in ['lt', 'en', 'ru']:
            lang = 'lt'
            
        company = CompanyInfo.load()
        order = None
        invoice_items = []
        
        # Gauti rodymo pasirinkimus iš sąskaitos arba numatytąsias vertes iš InvoiceSettings
        display_options = invoice.display_options
        if not display_options:
            invoice_settings = InvoiceSettings.load()
            display_options = invoice_settings.default_display_options or {}
        
        # Paruošti vertimus šablonui
        labels = self._get_invoice_labels(lang)
        
        # Krovinių informacija
        show_cargo_info = display_options.get('show_cargo_info', True)
        show_cargo_weight = display_options.get('show_cargo_weight', display_options.get('show_cargo_details', True))
        show_cargo_ldm = display_options.get('show_cargo_ldm', display_options.get('show_cargo_details', True))
        show_cargo_dimensions = display_options.get('show_cargo_dimensions', display_options.get('show_cargo_details', True))
        show_cargo_properties = display_options.get('show_cargo_properties', display_options.get('show_cargo_details', True))
        # Vežėjai ir sandėliai
        show_carriers = display_options.get('show_carriers', True)
        show_carrier_name = display_options.get('show_carrier_name', display_options.get('show_carrier_details', True))
        show_carrier_route = display_options.get('show_carrier_route', display_options.get('show_carrier_details', True))
        show_carrier_dates = display_options.get('show_carrier_dates', display_options.get('show_carrier_details', True))
        # Kainos
        show_prices = display_options.get('show_prices', True)
        show_my_price = display_options.get('show_my_price', display_options.get('show_price_details', True))
        show_other_costs = display_options.get('show_other_costs', display_options.get('show_price_details', True))
        
        has_manual = bool(invoice.manual_lines)
        
        # Gauti visus susietus užsakymus (ManyToMany) su sumomis iš SalesInvoiceOrder
        related_orders = []
        amounts_map = {}
        
        try:
            # Gauti užsakymus per related_orders (ManyToMany)
            related_orders = list(invoice.related_orders.prefetch_related(
                'carriers__partner', 
                'cargo_items', 
                'route_stops'
            ).select_related('client').all())
            
            # Gauti individualias sumas kiekvienam užsakymui iš SalesInvoiceOrder
            try:
                from apps.invoices.models import SalesInvoiceOrder
                amounts_map = {
                    link.order_id: link.amount
                    for link in SalesInvoiceOrder.objects.filter(invoice=invoice).select_related('order')
                    if link.amount is not None
                }
            except Exception:
                pass
            
            # Backward compatibility: jei related_orders tuščias, bet yra related_order (senasis ForeignKey), naudoti jį
            if not related_orders and invoice.related_order:
                try:
                    order = Order.objects.prefetch_related(
                        'carriers__partner',
                        'cargo_items',
                        'route_stops'
                    ).select_related('client').get(id=invoice.related_order.id)
                    related_orders = [order]
                except Order.DoesNotExist:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Užsakymas {invoice.related_order.id} neegzistuoja sąskaitai {invoice.id}")
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Klaida užkraunant užsakymus sąskaitai {invoice.id}: {e}", exc_info=True)
        
        # Iteruoti per visus užsakymus ir sukurti invoice_items kiekvienam
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[HTML PREVIEW] Sąskaita {invoice.invoice_number}: rastas related_orders skaičius: {len(related_orders)}")
        
        # Pagrindinio užsakymo informacija (jei tik vienas)
        main_order_info = None
        if len(related_orders) == 1:
            order = related_orders[0]
            info_parts = []
            if order.order_date and order.order_number:
                date_str = order.order_date.strftime('%Y.%m.%d') if hasattr(order.order_date, 'strftime') else str(order.order_date)
                label = 'Užsakymas' if lang == 'lt' else ('Order' if lang == 'en' else 'Заказ')
                info_parts.append(f"{label}: {date_str} / {order.order_number}")
            
            if order.client_order_number:
                label = 'Užsakovo Nr.' if lang == 'lt' else ('Client PO' if lang == 'en' else 'Заказ клиента')
                info_parts.append(f"{label}: {order.client_order_number}")
            
            if info_parts:
                main_order_info = " | ".join(info_parts)

        for order in related_orders:
            if not order:
                continue
            logger.info(f"[HTML PREVIEW] Apdorojamas užsakymas: {order.order_number}")
            
            # Gauti krovinius
            cargos = list(order.cargo_items.all().order_by('sequence_order'))
            net_amount = amounts_map.get(order.id, order.client_price_net or order.price_net or Decimal('0.00'))
            
            if not cargos:
                # Jei krovinių sąrašo nėra - viena eilutė (senoji logika)
                order_desc_parts = []
                
                # Maršrutas (nauja arba sena sistema)
                stops = list(order.route_stops.all().order_by('sequence_order'))
                route_str = ""
                if stops:
                    r_parts = []
                    for s in stops:
                        stop_label = '🛫' if s.stop_type == 'loading' else '🛬'
                        d_info = f" ({s.date_from.strftime('%Y.%m.%d')})" if s.date_from else ""
                        r_parts.append(f"{stop_label} {s.city or s.country or '?'}{d_info}")
                    route_str = ' → '.join(r_parts)
                else:
                    # Sena sistema: naudojame order laukus
                    old_parts = []
                    # Pakrovimas
                    f_city = order.route_from_city or ""
                    f_country = order.route_from_country or ""
                    f_loc = ", ".join(filter(None, [f_city, f_country])) or order.route_from
                    if f_loc:
                        d_info = f" ({order.loading_date.strftime('%Y.%m.%d')})" if order.loading_date else ""
                        old_parts.append(f"🛫 {f_loc}{d_info}")
                    # Iškrovimas
                    t_city = order.route_to_city or ""
                    t_country = order.route_to_country or ""
                    t_loc = ", ".join(filter(None, [t_city, t_country])) or order.route_to
                    if t_loc:
                        d_info = f" ({order.unloading_date.strftime('%Y.%m.%d')})" if order.unloading_date else ""
                        old_parts.append(f"🛬 {t_loc}{d_info}")
                    route_str = ' → '.join(old_parts)
                
                if route_str:
                    label = 'Maršrutas' if lang == 'lt' else ('Route' if lang == 'en' else 'Маршрут')
                    order_desc_parts.append(f"<b>{label}:</b> {route_str}")
                
                # Krovinio informacija iš pagrindinių laukų (fallback)
                c_info = []
                if order.weight_kg: c_info.append(f"{order.weight_kg} kg")
                if order.ldm: c_info.append(f"{order.ldm} LDM")
                if c_info:
                    label = 'Krovinys' if lang == 'lt' else ('Cargo' if lang == 'en' else 'Груз')
                    order_desc_parts.append(f"• {label} ({', '.join(c_info)})")

                # Užsakymo informacija (tik jei keli užsakymai sąskaitoje)
                if len(related_orders) > 1 and order.order_date and order.order_number:
                    date_str = order.order_date.strftime('%Y.%m.%d') if hasattr(order.order_date, 'strftime') else str(order.order_date)
                    label = 'Užsakymas' if lang == 'lt' else ('Order' if lang == 'en' else 'Заказ')
                    info = f"<b>{label}:</b> {date_str} / {order.order_number}"
                    if order.client_order_number:
                        c_label = 'Užsakovo Nr.' if lang == 'lt' else ('PO' if lang == 'en' else '№ зак.')
                        info += f" ({c_label}: {order.client_order_number})"
                    order_desc_parts.append(info)

                if order_desc_parts:
                    order_vat_rate = order.vat_rate if order.vat_rate is not None else invoice.vat_rate
                    order_vat_rate_article = order.vat_rate_article if hasattr(order, 'vat_rate_article') and order.vat_rate_article else ''
                    v_val = net_amount * (order_vat_rate / 100)
                    invoice_items.append({
                        'description': '<br>'.join(order_desc_parts),
                        'amount_net': net_amount if not has_manual else Decimal('0.00'),
                        'vat_amount': v_val if not has_manual else Decimal('0.00'),
                        'amount_total': (net_amount + v_val) if not has_manual else Decimal('0.00'),
                        'vat_rate': float(order_vat_rate),
                        'vat_rate_article': order_vat_rate_article,
                    })
            else:
                # JUNGIAME: Visi kroviniai vienoje eilutėje, bet atskirti vizualiai
                order_desc_blocks = []
                
                # 1. Bendras antraštė (Užsakymo numeris - tik jei keli užsakymai sąskaitoje)
                header = ""
                if len(related_orders) > 1 and order.order_date and order.order_number:
                    date_str = order.order_date.strftime('%Y.%m.%d') if hasattr(order.order_date, 'strftime') else str(order.order_date)
                    label = 'Užsakymas' if lang == 'lt' else ('Order' if lang == 'en' else 'Заказ')
                    header = f"<b>{label}:</b> {date_str} / {order.order_number}"
                    if order.client_order_number:
                        c_label = 'Užsakovo Nr.' if lang == 'lt' else ('PO' if lang == 'en' else '№ зак.')
                        header += f" ({c_label}: {order.client_order_number})"
                
                # 2. Kiekvieno krovinio blokas
                for idx, cargo in enumerate(cargos):
                    cargo_parts = []
                    
                    # Maršrutas šiam kroviniui
                    if cargo.loading_stop or cargo.unloading_stop:
                        r_parts = []
                        if cargo.loading_stop:
                            s = cargo.loading_stop
                            d_info = f" ({s.date_from.strftime('%Y.%m.%d')})" if s.date_from else ""
                            r_parts.append(f"🛫 {s.city or s.country or '?'}{d_info}")
                        if cargo.unloading_stop:
                            s = cargo.unloading_stop
                            d_info = f" ({s.date_from.strftime('%Y.%m.%d')})" if s.date_from else ""
                            r_parts.append(f"🛬 {s.city or s.country or '?'}{d_info}")
                        
                        label = 'Maršrutas' if lang == 'lt' else ('Route' if lang == 'en' else 'Маршрут')
                        cargo_parts.append(f"<b>{label}:</b> {' → '.join(r_parts)}")
                    elif idx == 0:
                        # Jei kroviniui nieko nepriskirta, rodom bendrą maršrutą tik pirmoje eilutėje
                        stops = list(order.route_stops.all().order_by('sequence_order'))
                        route_str = ""
                        if stops:
                            r_parts = []
                            for s in stops:
                                stop_label = '🛫' if s.stop_type == 'loading' else '🛬'
                                d_info = f" ({s.date_from.strftime('%Y.%m.%d')})" if s.date_from else ""
                                r_parts.append(f"{stop_label} {s.city or s.country or '?'}{d_info}")
                            route_str = ' → '.join(r_parts)
                        else:
                            # Sena sistema: naudojame order laukus
                            old_parts = []
                            # Pakrovimas
                            f_city = order.route_from_city or ""
                            f_country = order.route_from_country or ""
                            f_loc = ", ".join(filter(None, [f_city, f_country])) or order.route_from
                            if f_loc:
                                d_info = f" ({order.loading_date.strftime('%Y.%m.%d')})" if order.loading_date else ""
                                old_parts.append(f"🛫 {f_loc}{d_info}")
                            # Iškrovimas
                            t_city = order.route_to_city or ""
                            t_country = order.route_to_country or ""
                            t_loc = ", ".join(filter(None, [t_city, t_country])) or order.route_to
                            if t_loc:
                                d_info = f" ({order.unloading_date.strftime('%Y.%m.%d')})" if order.unloading_date else ""
                                old_parts.append(f"🛬 {t_loc}{d_info}")
                            route_str = ' → '.join(old_parts)
                        
                        if route_str:
                            label = 'Maršrutas' if lang == 'lt' else ('Route' if lang == 'en' else 'Маршрут')
                            cargo_parts.append(f"<b>{label}:</b> {route_str}")
                    
                    # Krovinio detalės
                    c_info = []
                    desc = cargo.description
                    if not desc or desc.lower() in ['krovinys', 'cargo', 'груз']:
                        desc = 'Груз' if lang == 'ru' else ('Cargo' if lang == 'en' else 'Krovinys')
                    
                    if cargo.weight_kg: c_info.append(f"{cargo.weight_kg} kg")
                    if cargo.pallet_count: c_info.append(f"{cargo.pallet_count} pal.")
                    if cargo.ldm: c_info.append(f"{cargo.ldm} LDM")
                    if cargo.length_m or cargo.width_m or cargo.height_m:
                        c_info.append(f"{cargo.length_m or 0}x{cargo.width_m or 0}x{cargo.height_m or 0}m")
                    
                    specs = []
                    if cargo.requires_forklift: specs.append('Keltuvas' if lang == 'lt' else 'Forklift')
                    if cargo.requires_crane: specs.append('Kranas' if lang == 'lt' else 'Crane')
                    if cargo.requires_special_equipment: specs.append('Spec. įranga' if lang == 'lt' else 'Spec. equipment')
                    if cargo.fragile: specs.append('Trapus' if lang == 'lt' else 'Fragile')
                    if cargo.hazardous: specs.append('ADR')
                    if specs: c_info.append(", ".join(specs))

                    cargo_line = f"• {desc}"
                    if c_info: cargo_line += f" ({', '.join(c_info)})"
                    cargo_parts.append(cargo_line)
                    
                    order_desc_blocks.append('<br>'.join(cargo_parts))

                # Sujungiame viską į vieną tekstą su punktyrine linija tarp blokų
                separator = '<div style="border-top: 1px dashed #ccc; margin: 5px 0;"></div>'
                full_description = (header + ("<br>" if header else "")) if header else ""
                full_description += separator.join(order_desc_blocks)

                # Viena eilutė su bendra kaina
                order_vat_rate = order.vat_rate if order.vat_rate is not None else invoice.vat_rate
                order_vat_rate_article = order.vat_rate_article if hasattr(order, 'vat_rate_article') and order.vat_rate_article else ''
                v_val = net_amount * (order_vat_rate / 100)
                invoice_items.append({
                    'description': full_description,
                    'amount_net': net_amount if not has_manual else Decimal('0.00'),
                    'vat_amount': v_val if not has_manual else Decimal('0.00'),
                    'amount_total': (net_amount + v_val) if not has_manual else Decimal('0.00'),
                    'vat_rate': float(order_vat_rate),
                    'vat_rate_article': order_vat_rate_article,
                })

            # PRIDĖTI VEŽĖJŲ EILUTES (nerodome klientų sąskaitose)
            if False: # Išjungta pagal vartotojo prašymą: vezeju saskaitoje klientui nerodyti
                if order and show_carriers and order.carriers.exists():
                    carriers_list = list(order.carriers.all().order_by('sequence_order'))
                    for carrier in carriers_list:
                        carrier_desc_parts = []
                        if show_carrier_name and carrier.partner:
                            c_type = 'Vežėjas' if carrier.carrier_type == 'carrier' else 'Sandėlis'
                            carrier_desc_parts.append(f"<b>{c_type}:</b> {carrier.partner.name}")
                        if show_carrier_route and (carrier.route_from or carrier.route_to):
                            carrier_desc_parts.append(f"<b>Maršrutas:</b> {carrier.route_from or '?'} - {carrier.route_to or '?'}")
                        if show_carrier_dates:
                            if carrier.loading_date:
                                d_str = carrier.loading_date.date().strftime('%Y.%m.%d') if hasattr(carrier.loading_date, 'date') else carrier.loading_date.strftime('%Y.%m.%d')
                                carrier_desc_parts.append(f"<b>Pakrovimo data:</b> {d_str}")
                            if carrier.unloading_date:
                                d_str = carrier.unloading_date.date().strftime('%Y.%m.%d') if hasattr(carrier.unloading_date, 'date') else carrier.unloading_date.strftime('%Y.%m.%d')
                                carrier_desc_parts.append(f"<b>Iškrovimo data:</b> {d_str}")
                        
                        if carrier_desc_parts:
                            invoice_items.append({
                                'description': '<br>'.join(carrier_desc_parts),
                                'amount_net': Decimal('0.00'),
                                'vat_amount': Decimal('0.00'),
                                'amount_total': Decimal('0.00'),
                            })
            
                # Pridėti kitas išlaidas (jei leidžiama rodyti kainas detaliau)
                # PASTABA: "Mano paslaugos" eilutė niekada nerodoma HTML/PDF peržiūroje
                if order and show_prices:
                    # Pridėti kitas išlaidas jei leidžiama rodyti
                    if show_other_costs and hasattr(order, 'other_costs') and order.other_costs:
                        other_costs = order.other_costs
                        if isinstance(other_costs, list) and len(other_costs) > 0:
                            for cost in other_costs:
                                if isinstance(cost, dict) and 'amount' in cost:
                                    cost_amount = Decimal(str(cost['amount']))
                                    cost_desc = cost.get('description', 'Kitos išlaidos')
                                    order_vat_rate = order.vat_rate if order.vat_rate is not None else invoice.vat_rate
                                    order_vat_rate_article = order.vat_rate_article if hasattr(order, 'vat_rate_article') and order.vat_rate_article else ''
                                    cost_vat = cost_amount * (order_vat_rate / 100)
                                    cost_total = cost_amount + cost_vat
                                    invoice_items.append({
                                        'description': f'<b>{cost_desc}</b>',
                                        'amount_net': cost_amount,
                                        'vat_amount': cost_vat,
                                        'amount_total': cost_total,
                                        'vat_rate': float(order_vat_rate),
                                        'vat_rate_article': order_vat_rate_article,
                                    })
        
        # Jei yra rankinės eilutės – jas PRIDĖTI
        if invoice.manual_lines:
            try:
                for ml in invoice.manual_lines:
                    desc = str(ml.get('description') or '').strip() or 'Paslaugos'
                    net = Decimal(str(ml.get('amount_net') or '0'))
                    line_vat_rate = Decimal(str(ml.get('vat_rate') if ml.get('vat_rate') is not None else invoice.vat_rate))
                    line_vat_rate_article = ml.get('vat_rate_article', '') if ml.get('vat_rate_article') else ''
                    vat = net * (line_vat_rate / 100)
                    total = net + vat
                    invoice_items.append({
                        'description': desc,
                        'amount_net': net,
                        'vat_amount': vat,
                        'amount_total': total,
                        'vat_rate': float(line_vat_rate),
                        'vat_rate_article': line_vat_rate_article,
                    })
            except Exception:
                pass

        # Jei vis dar nėra eilučių, naudoti bendrą sumą kaip vieną eilutę
        if not invoice_items:
            vat_amount = invoice.amount_net * (invoice.vat_rate / 100)
            invoice_vat_rate_article = getattr(invoice, 'vat_rate_article', '')
            invoice_items.append({
                'description': 'Paslaugos',
                'amount_net': invoice.amount_net,
                'vat_amount': vat_amount,
                'amount_total': invoice.amount_total,
                'vat_rate': float(invoice.vat_rate),
                'vat_rate_article': invoice_vat_rate_article,
            })
        
        # SVARBU: Pirmiausia apskaičiuoti sumas iš VISŲ eilučių (nepriklausomai nuo display_options)
        # Visos eilutės visada turi būti įtrauktos į galutinę kainą
        all_invoice_items = invoice_items.copy()  # Išsaugoti visas eilutes sumoms
        
        # Perskaičiuoti bendras sumas iš VISŲ invoice_items (jei yra eilučių)
        # SVARBU: Naudoti sumas iš VISŲ eilučių, nepriklausomai nuo visible_items_indexes
        if all_invoice_items and len(all_invoice_items) > 0:
            # Decimal jau importuotas faile viršuje
            total_net = sum(Decimal(str(item.get('amount_net', 0))) for item in all_invoice_items)
            total_vat = sum(Decimal(str(item.get('vat_amount', 0))) for item in all_invoice_items)
            total_with_vat = sum(Decimal(str(item.get('amount_total', 0))) for item in all_invoice_items)
            
            # Atnaujinti invoice objektą su perskaičiuotomis sumomis (tik šiam preview, ne DB)
            invoice.amount_net = total_net
            invoice.amount_total = total_with_vat
            vat_amount = total_vat
        else:
            # Jei nėra eilučių, naudoti esamas sumas
            vat_amount = invoice.amount_total - invoice.amount_net
        
        # Filtruoti invoice_items pagal visible_items_indexes - rodyti tik pažymėtas eilutes (tik rodymui HTML/PDF)
        # SVARBU: Jei sąskaita susieta su užsakymu per related_orders, IGNORUOJAME filtrus, kad parodyti visus krovinius
        visible_indexes = invoice.visible_items_indexes if invoice.visible_items_indexes else []
        if visible_indexes and len(visible_indexes) > 0 and not related_orders:
            invoice_items = [item for idx, item in enumerate(invoice_items) if idx in visible_indexes]
        
        # Konvertuoti sumą į žodžius
        amount_in_words = amount_to_words(invoice.amount_total, lang=lang)
        
        # Surinkti visus unikalius 0% PVM tarifus su jų straipsniais iš invoice_items
        zero_vat_articles = []
        seen_articles = set()
        for item in invoice_items:
            item_vat_rate = item.get('vat_rate', 0)
            item_vat_rate_article = item.get('vat_rate_article', '')
            # Jei PVM tarifas yra 0% ir yra straipsnis, pridėti
            if float(item_vat_rate) == 0.0 and item_vat_rate_article:
                # Unikalūs straipsniai (pagal tekstą)
                if item_vat_rate_article not in seen_articles:
                    seen_articles.add(item_vat_rate_article)
                    zero_vat_articles.append(item_vat_rate_article)
        
        # Bandyti išversti vat_rate_article, jei tai standartinis straipsnis
        translated_articles = []
        if zero_vat_articles and lang != 'lt':
            from apps.settings.models import PVMRate
            for article in zero_vat_articles:
                try:
                    rate_obj = PVMRate.objects.filter(article=article).first()
                    if rate_obj:
                        if lang == 'en' and rate_obj.article_en:
                            translated_articles.append(rate_obj.article_en)
                        elif lang == 'ru' and rate_obj.article_ru:
                            translated_articles.append(rate_obj.article_ru)
                        else:
                            translated_articles.append(article)
                    else:
                        translated_articles.append(article)
                except Exception:
                    translated_articles.append(article)
        else:
            translated_articles = zero_vat_articles

        # Kas išrašė
        invoice_issuer = None
        signature_url = None
        if request.user:
            # Gauti vardą ir pavardę iš UserSettings (jei yra), arba iš User modelio
            first_name = None
            last_name = None
            try:
                if hasattr(request.user, 'user_settings') and request.user.user_settings:
                    first_name = request.user.user_settings.first_name
                    last_name = request.user.user_settings.last_name
            except:
                pass
            
            # Fallback į User modelio laukus
            if not first_name and hasattr(request.user, 'first_name'):
                first_name = request.user.first_name
            if not last_name and hasattr(request.user, 'last_name'):
                last_name = request.user.last_name
            
            # Formuoti pilną vardą
            full_name = f"{first_name or ''} {last_name or ''}".strip()
            
            # Gauti pareigas iš User modelio
            position = None
            if hasattr(request.user, 'position') and request.user.position:
                position = request.user.position
            
            # Formuoti invoice_issuer: Pareigos Vardas Pavardė
            if full_name:
                if position:
                    invoice_issuer = f"{position} {full_name}"
                else:
                    invoice_issuer = full_name

            # Parašo/stampo paveikslėlis
            if hasattr(request.user, 'user_settings') and request.user.user_settings.signature_image:
                if request:
                    signature_url = request.build_absolute_uri(request.user.user_settings.signature_image.url)
                else:
                    from django.conf import settings
                    signature_url = f"{settings.MEDIA_URL}{request.user.user_settings.signature_image.name}"
        
        # Logotipo URL - naudoti absoliutų URL
        logo_url = None
        if company.logo:
            if request:
                logo_url = request.build_absolute_uri(company.logo.url)
            else:
                # Jei nėra request (pvz., iš komandos), naudoti relative path
                from django.conf import settings
                logo_url = f"{settings.MEDIA_URL}{company.logo.name}"
        
        # Paruošti pakrovimo/iškrovimo informaciją
        loading_unloading_info = []
        if related_orders:
            for order in related_orders:
                # Gauti ekspedicijos numerį iš pirmo OrderCarrier (jei yra)
                expedition_number = None
                if hasattr(order, 'carriers') and order.carriers.exists():
                    first_carrier = order.carriers.first()
                    if first_carrier and first_carrier.expedition_number:
                        expedition_number = first_carrier.expedition_number
                
                order_info = {
                    'order_number': order.order_number,
                    'client_order_number': order.client_order_number,
                    'expedition_number': expedition_number,
                    'loading': {},
                    'unloading': {}
                }
                
                # Pakrovimo informacija
                if order.route_from_country or order.route_from_city or order.route_from_address:
                    loading_parts = []
                    if order.route_from_address:
                        loading_parts.append(order.route_from_address)
                    if order.route_from_city:
                        loading_parts.append(order.route_from_city)
                    if order.route_from_postal_code:
                        loading_parts.append(order.route_from_postal_code)
                    if order.route_from_country:
                        loading_parts.append(order.route_from_country)
                    order_info['loading']['address'] = ', '.join(loading_parts) if loading_parts else order.route_from
                    
                    if order.sender_route_from:
                        order_info['loading']['sender'] = order.sender_route_from
                    # Pakrovimo datos su laiku (NUO -> IKI)
                    if order.loading_date_from or order.loading_date_to:
                        date_parts = []
                        if order.loading_date_from:
                            if hasattr(order.loading_date_from, 'strftime'):
                                # Jei laikas yra 00:00, nerodyti laiko
                                if hasattr(order.loading_date_from, 'hour') and (order.loading_date_from.hour != 0 or order.loading_date_from.minute != 0):
                                    date_parts.append(order.loading_date_from.strftime('%Y.%m.%d') + ' / ' + order.loading_date_from.strftime('%H:%M') + 'h')
                                else:
                                    date_parts.append(order.loading_date_from.strftime('%Y.%m.%d'))
                            else:
                                date_parts.append(str(order.loading_date_from))
                        if order.loading_date_to:
                            if hasattr(order.loading_date_to, 'strftime'):
                                # Jei laikas yra 00:00, nerodyti laiko
                                if hasattr(order.loading_date_to, 'hour') and (order.loading_date_to.hour != 0 or order.loading_date_to.minute != 0):
                                    date_parts.append(order.loading_date_to.strftime('%Y.%m.%d') + ' / ' + order.loading_date_to.strftime('%H:%M') + 'h')
                                else:
                                    date_parts.append(order.loading_date_to.strftime('%Y.%m.%d'))
                            else:
                                date_parts.append(str(order.loading_date_to))
                        if date_parts:
                            order_info['loading']['date'] = ' → '.join(date_parts)
                    elif order.loading_date:
                        # Fallback į seną loading_date lauką
                        if hasattr(order.loading_date, 'strftime'):
                            if hasattr(order.loading_date, 'hour') and (order.loading_date.hour != 0 or order.loading_date.minute != 0):
                                order_info['loading']['date'] = order.loading_date.strftime('%Y.%m.%d') + ' / ' + order.loading_date.strftime('%H:%M') + 'h'
                            else:
                                order_info['loading']['date'] = order.loading_date.strftime('%Y.%m.%d')
                        else:
                            order_info['loading']['date'] = str(order.loading_date)
                
                # Iškrovimo informacija
                if order.route_to_country or order.route_to_city or order.route_to_address:
                    unloading_parts = []
                    if order.route_to_address:
                        unloading_parts.append(order.route_to_address)
                    if order.route_to_city:
                        unloading_parts.append(order.route_to_city)
                    if order.route_to_postal_code:
                        unloading_parts.append(order.route_to_postal_code)
                    if order.route_to_country:
                        unloading_parts.append(order.route_to_country)
                    order_info['unloading']['address'] = ', '.join(unloading_parts) if unloading_parts else order.route_to
                    
                    if order.receiver_route_to:
                        order_info['unloading']['receiver'] = order.receiver_route_to
                    # Iškrovimo datos su laiku (NUO -> IKI)
                    if order.unloading_date_from or order.unloading_date_to:
                        date_parts = []
                        if order.unloading_date_from:
                            if hasattr(order.unloading_date_from, 'strftime'):
                                # Jei laikas yra 00:00, nerodyti laiko
                                if hasattr(order.unloading_date_from, 'hour') and (order.unloading_date_from.hour != 0 or order.unloading_date_from.minute != 0):
                                    date_parts.append(order.unloading_date_from.strftime('%Y.%m.%d') + ' / ' + order.unloading_date_from.strftime('%H:%M') + 'h')
                                else:
                                    date_parts.append(order.unloading_date_from.strftime('%Y.%m.%d'))
                            else:
                                date_parts.append(str(order.unloading_date_from))
                        if order.unloading_date_to:
                            if hasattr(order.unloading_date_to, 'strftime'):
                                # Jei laikas yra 00:00, nerodyti laiko
                                if hasattr(order.unloading_date_to, 'hour') and (order.unloading_date_to.hour != 0 or order.unloading_date_to.minute != 0):
                                    date_parts.append(order.unloading_date_to.strftime('%Y.%m.%d') + ' / ' + order.unloading_date_to.strftime('%H:%M') + 'h')
                                else:
                                    date_parts.append(order.unloading_date_to.strftime('%Y.%m.%d'))
                            else:
                                date_parts.append(str(order.unloading_date_to))
                        if date_parts:
                            order_info['unloading']['date'] = ' → '.join(date_parts)
                    elif order.unloading_date:
                        # Fallback į seną unloading_date lauką
                        if hasattr(order.unloading_date, 'strftime'):
                            if hasattr(order.unloading_date, 'hour') and (order.unloading_date.hour != 0 or order.unloading_date.minute != 0):
                                order_info['unloading']['date'] = order.unloading_date.strftime('%Y.%m.%d') + ' / ' + order.unloading_date.strftime('%H:%M') + 'h'
                            else:
                                order_info['unloading']['date'] = order.unloading_date.strftime('%Y.%m.%d')
                        else:
                            order_info['unloading']['date'] = str(order.unloading_date)
                
                # Pridėti tik jei yra bent viena informacija
                if order_info['loading'] or order_info['unloading']:
                    loading_unloading_info.append(order_info)
        
        return {
            'invoice': invoice,
            'company': company,
            'logo_url': logo_url,
            'order': order,
            'main_order_info': main_order_info,
            'invoice_items': invoice_items,
            'vat_amount': vat_amount,
            'vat_rate_articles': translated_articles,  # Masyvas su 0% PVM straipsniais
            'amount_in_words': amount_in_words,
            'invoice_issuer': invoice_issuer,
            'signature_url': signature_url,
            'labels': labels,
            'lang': lang,
            'loading_unloading_info': loading_unloading_info,
        }
    
    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        """
        Grąžina HTML sąskaitos peržiūrą
        """
        try:
            invoice = self.get_object()
            context = self._prepare_invoice_context(invoice, request)
            return render(request, 'invoices/sales_invoice.html', context)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Klaida generuojant sąskaitos HTML preview: {e}", exc_info=True)
            from rest_framework.response import Response
            from rest_framework import status
            return Response(
                {'error': f'Klaida generuojant sąskaitos peržiūrą: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        """
        Grąžina PDF sąskaitos versiją - visiškai identišką HTML peržiūrai
        """
        try:
            invoice = self.get_object()
            context = self._prepare_invoice_context(invoice, request)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Klaida paruošiant sąskaitos PDF kontekstą: {e}", exc_info=True)
            from rest_framework.response import Response
            from rest_framework import status
            return Response(
                {'error': f'Klaida paruošiant sąskaitos PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content_type='application/json'
            )
        
        # Konvertuoti logo į base64, jei yra (kad veiktų PDF be priklausomybės nuo URL)
        from apps.settings.models import CompanyInfo
        company = CompanyInfo.load()
        
        # Logo konvertavimas į base64
        if context.get('logo_url'):
            try:
                from django.core.files.storage import default_storage
                from django.conf import settings
                import base64
                from urllib.parse import urlparse
                import os
                
                logo_url = context['logo_url']
                logo_file = None
                
                # Jei tai absoliutus URL, ištraukti failo kelią
                if logo_url.startswith('http'):
                    parsed = urlparse(logo_url)
                    # Rasti /media/ dalį URL
                    if '/media/' in parsed.path:
                        file_path = parsed.path.split('/media/')[-1]
                    elif settings.MEDIA_URL.lstrip('/') in parsed.path:
                        file_path = parsed.path.split(settings.MEDIA_URL.lstrip('/'))[-1]
                    else:
                        file_path = None
                    
                    if file_path:
                        full_path = os.path.join(settings.MEDIA_ROOT, file_path)
                        if os.path.exists(full_path):
                            logo_file = full_path
                elif logo_url.startswith('/'):
                    # Relative path
                    if logo_url.startswith(settings.MEDIA_URL):
                        file_path = logo_url.replace(settings.MEDIA_URL, '').lstrip('/')
                    else:
                        file_path = logo_url.lstrip('/').replace('media/', '')
                    
                    full_path = os.path.join(settings.MEDIA_ROOT, file_path)
                    if os.path.exists(full_path):
                        logo_file = full_path
                
                # Bandyti naudoti company.logo tiesiogiai
                if not logo_file and company.logo:
                    try:
                        logo_file = company.logo.path
                    except:
                        pass
                
                # Jei radome failą, konvertuoti į base64
                if logo_file and os.path.exists(logo_file):
                    try:
                        with open(logo_file, 'rb') as f:
                            file_content = f.read()
                        file_ext = logo_file.split('.')[-1].lower()
                        mime_type = 'image/png' if file_ext == 'png' else 'image/jpeg' if file_ext in ['jpg', 'jpeg'] else 'image/gif'
                        logo_base64 = base64.b64encode(file_content).decode('utf-8')
                        context['logo_url'] = f"data:{mime_type};base64,{logo_base64}"
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.info(f"Logo konvertuotas į base64: {len(file_content)} bytes, type: {mime_type}")
                    except Exception as logo_error:
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.error(f"Klaida konvertuojant logo į base64: {logo_error}")
                        # Palikti originalų URL jei base64 nepavyko
                        pass
            except Exception as e:
                # Jei nepavyko konvertuoti į base64, palikti URL
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Could not convert logo to base64: {e}")
                pass
        
        # Generuoti HTML su visais duomenimis
        html_string = render(request, 'invoices/sales_invoice.html', context).content.decode('utf-8')
        
        # Tik minimalus valymas - pašalinti tik script tag'us ir action buttons HTML
        html_string = re.sub(r'<div[^>]*class=["\'][^"\']*action-buttons[^"\']*["\'][^>]*>.*?</div>\s*', '', html_string, flags=re.DOTALL)
        html_string = re.sub(r'<script[^>]*>.*?</script>', '', html_string, flags=re.DOTALL | re.IGNORECASE)
        html_string = re.sub(r'<div[^>]*id=["\']toastContainer["\'][^>]*>.*?</div>\s*', '', html_string, flags=re.DOTALL)
        
        # NEPAŠALINTI @media print stilių - užsakymuose jie veikia gerai
        # Problema gali būti kitur, ne @media print stiliuose
        
        # Bandyti naudoti WeasyPrint (puikus HTML/CSS palaikymas Linux serveryje)
        try:
            from weasyprint import HTML, CSS
            from django.conf import settings
            import logging
            logger = logging.getLogger(__name__)
            import os
            
            # WeasyPrint base_url - svarbu vaizdų apdorojimui
            base_url = request.build_absolute_uri('/')
            html_doc = HTML(string=html_string, base_url=base_url)
            
            # CSS - tik minimalus @page, template jau turi visą reikalingą CSS
            # Neperrašome esamų stilių, tik nustatome puslapio parametrus
            pdf_css_string = """
                @page {
                    size: A4;
                    margin: 0;
                }
            """
            css_doc = CSS(string=pdf_css_string)
            
            # Generuoti PDF - template CSS naudojamas automatiškai
            pdf_bytes = html_doc.write_pdf(stylesheets=[css_doc])
            
            response = HttpResponse(pdf_bytes, content_type='application/pdf')
            response['Content-Disposition'] = f'inline; filename="{invoice.invoice_number}.pdf"'
            return response
            
        except (ImportError, OSError) as e:
            # WeasyPrint nėra įdiegtas arba trūksta sisteminių bibliotekų
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"WeasyPrint nepasiekiamas: {e}, naudojamas xhtml2pdf fallback")
        except Exception as e:
            # Kitos WeasyPrint klaidos
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"WeasyPrint klaida: {e}, naudojamas xhtml2pdf fallback")
        
        # Fallback į xhtml2pdf jei WeasyPrint nepavyko
        try:
            result = BytesIO()
            
            def link_callback(uri, rel):
                """Handles images and other resources for PDF generation"""
                from urllib.parse import urlparse, urljoin
                from django.conf import settings
                import os
                
                # Jei tai data URI, grąžinti kaip yra
                if uri.startswith('data:'):
                    return uri
                
                # Jei tai relative path, paversti į absoliutų
                if uri.startswith('/'):
                    if uri.startswith(settings.MEDIA_URL):
                        # Media failas - bandyti gauti absoliutų kelią
                        file_path = uri.replace(settings.MEDIA_URL, '')
                        full_path = os.path.join(settings.MEDIA_ROOT, file_path)
                        if os.path.exists(full_path):
                            return f"file://{full_path}"
                    # Jei kitaip - naudoti base URL
                    base_url = request.build_absolute_uri('/').rstrip('/')
                    return urljoin(base_url, uri)
                
                # Jei tai absoliutus URL, grąžinti kaip yra
                return uri
            
            # Generuoti PDF su pagerinta link_callback funkcija
            pdf = pisa.pisaDocument(
                BytesIO(html_string.encode("UTF-8")), 
                result,
                encoding='UTF-8',
                link_callback=link_callback,
                show_error_as_pdf=False
            )
            
            if not pdf.err:
                response = HttpResponse(result.getvalue(), content_type='application/pdf')
                response['Content-Disposition'] = f'inline; filename="{invoice.invoice_number}.pdf"'
                return response
            else:
                # Detalesnė klaidos informacija
                error_msg = str(pdf.err) if pdf.err else "Nežinoma PDF generavimo klaida"
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"PDF generavimo klaida (xhtml2pdf): {error_msg}")
                from rest_framework.response import Response
                from rest_framework import status
                return Response(
                    {'error': f'Klaida generuojant PDF: {error_msg}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    content_type='application/json'
                )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Klaida generuojant sąskaitos PDF: {e}", exc_info=True)
            from rest_framework.response import Response
            from rest_framework import status
            return Response(
                {'error': f'Klaida generuojant PDF: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content_type='application/json'
            )
    
    @action(detail=True, methods=['post'])
    def send_email(self, request, pk=None):
        """Siunčia sąskaitos PDF el. paštu"""
        invoice = self.get_object()
        
        # Priimti masyvą email'ų arba vieną email (atgalinis suderinamumas)
        emails = request.data.get('emails', [])
        if not emails:
            # Jei nėra masyvo, bandyti gauti vieną email
            email = request.data.get('email', '').strip()
            if email:
                emails = [email]
        
        if not emails:
            return Response(
                {'success': False, 'error': 'Nenurodytas el. pašto adresas'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Pridėti naujus kontaktus, jei yra
        contacts_to_add = request.data.get('contacts_to_add', [])
        if contacts_to_add and invoice.partner:
            from apps.partners.models import Contact
            for contact_data in contacts_to_add:
                email_addr = contact_data.get('email', '').strip()
                if email_addr:
                    # Patikrinti, ar kontaktas jau egzistuoja
                    if not Contact.objects.filter(partner=invoice.partner, email__iexact=email_addr).exists():
                        Contact.objects.create(
                            partner=invoice.partner,
                            email=email_addr,
                            first_name=contact_data.get('first_name', '').strip() or '',
                            last_name=contact_data.get('last_name', '').strip() or ''
                        )
        
        try:
            # Gauti kalbą iš užklausos duomenų
            lang = request.data.get('lang', 'lt')
            
            # Generuoti PDF - naudoti TIKSLIAI tą patį metodą kaip pdf() endpoint'as
            context = self._prepare_invoice_context(invoice, request, lang=lang)
            html_string = render(request, 'invoices/sales_invoice.html', context).content.decode('utf-8')
            
            # Tik minimalus valymas - pašalinti tik script tag'us ir action buttons HTML
            import re
            html_string = re.sub(r'<div[^>]*class=["\'][^"\']*action-buttons[^"\']*["\'][^>]*>.*?</div>\s*', '', html_string, flags=re.DOTALL)
            html_string = re.sub(r'<script[^>]*>.*?</script>', '', html_string, flags=re.DOTALL | re.IGNORECASE)
            html_string = re.sub(r'<div[^>]*id=["\']toastContainer["\'][^>]*>.*?</div>\s*', '', html_string, flags=re.DOTALL)
            
            # NEPAŠALINTI @media print stilių - užsakymuose jie veikia gerai
            # Problema gali būti kitur, ne @media print stiliuose
            
            pdf_bytes = None
            
            # Bandyti naudoti WeasyPrint (geresnė kokybė)
            try:
                from weasyprint import HTML, CSS
                base_url = request.build_absolute_uri('/')
                html_doc = HTML(string=html_string, base_url=base_url)
                
                pdf_css_string = """
                    @page {
                        size: A4;
                        margin: 0;
                    }
                """
                css_doc = CSS(string=pdf_css_string)
                
                pdf_bytes = html_doc.write_pdf(stylesheets=[css_doc])
                logger.info("WeasyPrint sėkmingai sugeneravo PDF el. laiške")
                
            except (ImportError, OSError) as e:
                logger.warning(f"WeasyPrint nepasiekiamas el. laiške: {e}, naudojamas xhtml2pdf fallback")
            except Exception as e:
                logger.error(f"WeasyPrint klaida el. laiške: {e}, naudojamas xhtml2pdf fallback")
            
            # Fallback į xhtml2pdf
            if not pdf_bytes:
                try:
                    from io import BytesIO
                    from xhtml2pdf import pisa
                    
                    result = BytesIO()
                    
                    def link_callback(uri, rel):
                        from urllib.parse import urlparse, urljoin
                        from django.conf import settings
                        import os
                        
                        if uri.startswith('data:'):
                            return uri
                        
                        if uri.startswith('/'):
                            if uri.startswith(settings.MEDIA_URL):
                                file_path = uri.replace(settings.MEDIA_URL, '')
                                full_path = os.path.join(settings.MEDIA_ROOT, file_path)
                                if os.path.exists(full_path):
                                    return f"file://{full_path}"
                            base_url = request.build_absolute_uri('/').rstrip('/')
                            return urljoin(base_url, uri)
                        
                        return uri
                    
                    pdf = pisa.pisaDocument(
                        BytesIO(html_string.encode("UTF-8")), 
                        result,
                        encoding='UTF-8',
                        link_callback=link_callback,
                        show_error_as_pdf=False
                    )
                    
                    if pdf.err:
                        error_msg = str(pdf.err) if pdf.err else "Nežinoma PDF generavimo klaida"
                        logger.error(f"xhtml2pdf klaida el. laiške: {error_msg}")
                        return Response(
                            {'success': False, 'error': f'PDF generavimo klaida: {error_msg}'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR
                        )
                    
                    pdf_bytes = result.getvalue()
                    
                    # Patikrinti, ar tikrai PDF (prasideda su %PDF)
                    if not pdf_bytes or not pdf_bytes.startswith(b'%PDF'):
                        error_msg = "Generuotas failas nėra PDF formatas"
                        logger.error(f"xhtml2pdf klaida el. laiške: {error_msg}")
                        if pdf_bytes:
                            logger.error(f"Grąžintas turinys (pirmi 500 simbolių): {pdf_bytes[:500]}")
                        return Response(
                            {'success': False, 'error': f'PDF generavimo klaida: {error_msg}'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR
                        )
                    
                except ImportError:
                    logger.error("xhtml2pdf nepasiekiamas el. laiške")
                    return Response(
                        {'success': False, 'error': 'PDF generavimo biblioteka nepasiekiama'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
            
            if not pdf_bytes:
                return Response(
                    {'success': False, 'error': 'Nepavyko generuoti PDF'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Naudoti NotificationSettings nustatymus
            from apps.settings.models import NotificationSettings
            config = NotificationSettings.load()
            
            if not config.smtp_enabled:
                return Response(
                    {'success': False, 'error': 'SMTP siuntimas nėra įjungtas. Įjunkite „Įjungti el. laiškų siuntimą" ir išsaugokite nustatymus.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            missing_fields = []
            if not config.smtp_host:
                missing_fields.append('SMTP serveris')
            if not config.smtp_port:
                missing_fields.append('SMTP portas')
            if not config.smtp_username:
                missing_fields.append('SMTP naudotojas')
            if not config.smtp_password:
                missing_fields.append('SMTP slaptažodis')
            if not config.smtp_from_email:
                missing_fields.append('Numatytasis siuntėjas (el. paštas)')
            
            if missing_fields:
                return Response(
                    {'success': False, 'error': 'Nepakanka SMTP nustatymų. Trūksta laukų: ' + ', '.join(missing_fields)},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Formuoti from_email su vardu, jei yra
            from_email = f"{config.smtp_from_name or 'TMS Sistema'} <{config.smtp_from_email}>"
            
            # Sukurti SMTP connection su NotificationSettings nustatymais
            use_tls = bool(config.smtp_use_tls)
            use_ssl = False
            if not use_tls and config.smtp_port in (465, 587):
                use_ssl = config.smtp_port == 465
            
            # Siųsti el. laišką naudojant šabloną
            # Paruošti context su sąskaitos duomenimis
            invoice_context = {
                'invoice_number': invoice.invoice_number or 'N/A',
                'issue_date': invoice.issue_date.strftime('%Y-%m-%d') if invoice.issue_date else 'N/A',
                'due_date': invoice.due_date.strftime('%Y-%m-%d') if invoice.due_date else 'N/A',
                'partner_name': invoice.partner.name if invoice.partner else '',
                'amount': str(invoice.amount_total),
                'amount_total': str(invoice.amount_total),
            }
            
            # Renderinti šabloną (naudojant vieną kartą visiems gavėjams)
            email_content = render_email_template(
                template_type='invoice_to_client',
                context=invoice_context,
                is_auto_generated=True,
                lang=lang
            )
            
            subject = email_content['subject']
            message = email_content['body_text']
            
            try:
                # Siųsti į visus nurodytus email adresus
                sent_count = 0
                failed_emails = []
                
                for email in emails:
                    try:
                        logger.info(f"Siunčiamas el. laiškas su SMTP nustatymais: host={config.smtp_host}, port={config.smtp_port}, use_tls={use_tls}, use_ssl={use_ssl}, from={from_email}, to={email}")
                        
                        connection = get_connection(
                            backend='django.core.mail.backends.smtp.EmailBackend',
                            host=config.smtp_host,
                            port=config.smtp_port,
                            username=config.smtp_username,
                            password=config.smtp_password,
                            use_tls=use_tls,
                            use_ssl=use_ssl,
                            timeout=10,
                        )
                        
                        email_msg = EmailMessage(
                            subject=subject,
                            body=message,
                            from_email=from_email,
                            to=[email],
                            connection=connection,
                        )
                        
                        # Sukurti failo vardą su sąskaitos numeriu
                        filename = f"saskaita_{invoice.invoice_number}.pdf"
                        email_msg.attach(filename, pdf_bytes, 'application/pdf')
                        
                        # Siųsti su istorijos įrašymu
                        try:
                            result = send_email_message_with_logging(
                                email_message=email_msg,
                                email_type='invoice',
                                related_invoice_id=invoice.id,
                                related_partner_id=invoice.partner.id if invoice.partner else None,
                                sent_by=request.user if hasattr(request, 'user') and request.user.is_authenticated else None,
                                metadata={'recipient_name': invoice.partner.name if invoice.partner else ''}
                            )
                            # Jei grąžina rezultatą su success, patikrinti
                            if isinstance(result, dict) and not result.get('success'):
                                logger.error(f"Nepavyko išsiųsti el. laiško į {email}: {result.get('error', 'Nežinoma klaida')}")
                                failed_emails.append(email)
                            else:
                                logger.info(f"El. laiškas sėkmingai išsiųstas į {email} (sąskaita {invoice.invoice_number})")
                                sent_count += 1
                        except Exception as email_error:
                            logger.error(f"Nepavyko išsiųsti el. laiško į {email}: {email_error}")
                            failed_emails.append(email)
                    except Exception as email_error:
                        logger.error(f"Nepavyko išsiųsti el. laiško į {email}: {email_error}")
                        failed_emails.append(email)
                
                if failed_emails:
                    return Response({
                        'success': True,
                        'sent': sent_count > 0,
                        'message': f'El. laiškas išsiųstas į {sent_count} adresą/us. Nepavyko siųsti į: {", ".join(failed_emails)}',
                        'failed_emails': failed_emails
                    })
                else:
                    return Response({
                        'success': True,
                        'sent': True,
                        'message': f'El. laiškas sėkmingai išsiųstas į {sent_count} adresą/us'
                    })
                
            except (SMTPException, OSError, socket.error) as exc:
                logger.exception('Nepavyko išsiųsti el. laiško: %s', exc)
                error_message = str(exc)
                # Patobulinti klaidos žinutę
                if 'authentication failed' in error_message.lower() or 'invalid credentials' in error_message.lower():
                    error_message = 'SMTP autentifikacijos klaida. Patikrinkite SMTP naudotojo vardą ir slaptažodį.'
                elif 'connection' in error_message.lower() or 'refused' in error_message.lower():
                    error_message = 'Nepavyko prisijungti prie SMTP serverio. Patikrinkite SMTP serverio adresą ir portą.'
                elif 'timeout' in error_message.lower():
                    error_message = 'SMTP serverio prisijungimo laikas baigėsi. Patikrinkite tinklo ryšį ir SMTP nustatymus.'
                
                return Response(
                    {'success': False, 'error': f'Klaida siunčiant el. laišką: {error_message}', 'sent': False},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
        except Exception as e:
            logger.error(f"Klaida siunčiant el. laišką: {e}", exc_info=True)
            error_message = str(e)
            # Patobulinti klaidos žinutę
            if 'authentication failed' in error_message.lower() or 'invalid credentials' in error_message.lower():
                error_message = 'SMTP autentifikacijos klaida. Patikrinkite SMTP naudotojo vardą ir slaptažodį.'
            elif 'connection' in error_message.lower() or 'refused' in error_message.lower():
                error_message = 'Nepavyko prisijungti prie SMTP serverio. Patikrinkite SMTP serverio adresą ir portą.'
            elif 'timeout' in error_message.lower():
                error_message = 'SMTP serverio prisijungimo laikas baigėsi. Patikrinkite tinklo ryšį ir SMTP nustatymus.'
            
            return Response(
                {'success': False, 'error': f'Klaida siunčiant el. laišką: {error_message}', 'sent': False},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['post'])
    def send_reminder(self, request, pk=None):
        """
        Siunčia priminimą apie sąskaitą.
        
        Body (optional):
        {
            "reminder_type": "due_soon" | "unpaid" | "overdue"  // Jei nenurodyta, nustatoma automatiškai
        }
        """
        invoice = self.get_object()
        
        # Patikrinti, ar sąskaita yra neapmokėta arba vėluojanti (nebent rankinis siuntimas)
        reminder_type = request.data.get('reminder_type')
        if reminder_type is None:
            # Jei reminder_type nenurodytas, patikrinti sąskaitos statusą
            if invoice.payment_status not in ['unpaid', 'overdue', 'partially_paid']:
                return Response(
                    {'success': False, 'error': 'Sąskaita jau apmokėta'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        # Patikrinti, ar partneris turi el. pašto adresą arba yra testavimo režimas
        from apps.settings.models import NotificationSettings
        notification_settings = NotificationSettings.load()
        
        # Patikrinti, ar partneris egzistuoja
        if not invoice.partner:
            return Response(
                {'success': False, 'error': 'Sąskaita neturi susieto partnerio'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Patikrinti, ar partneris turi el. pašto adresą (tik jei testavimo režimas neįjungtas)
        # Jei testavimo režimas įjungtas, leisti siųsti net jei nėra email (naudoti testavimo adresą)
        if not notification_settings.email_test_mode:
            has_email = (
                invoice.partner.contact_person and 
                invoice.partner.contact_person.email and
                invoice.partner.contact_person.email.strip() and
                '@' in invoice.partner.contact_person.email.strip()
            )
            if not has_email:
                return Response(
                    {'success': False, 'error': 'Partneris neturi el. pašto adreso. Įjunkite testavimo režimą nustatymuose arba pridėkite el. pašto adresą partnerio kontaktiniam asmeniui.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        try:
            sent_by = request.user if hasattr(request, 'user') and request.user.is_authenticated else None
            result = send_debtor_reminder_email(invoice, sent_by=sent_by, reminder_type=reminder_type)
            
            if result.get('success'):
                return Response({
                    'success': True,
                    'message': 'Priminimas sėkmingai išsiųstas'
                })
            else:
                error_message = result.get('error', 'Nepavyko išsiųsti priminimo')
                logger.error(f"Priminimo siuntimo klaida sąskaitai {invoice.id}: {error_message}")
                return Response(
                    {'success': False, 'error': error_message},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            logger.error(f"Klaida siunčiant priminimą: {e}", exc_info=True)
            return Response(
                {'success': False, 'error': f'Klaida siunčiant priminimą: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PurchaseInvoiceViewSet(viewsets.ModelViewSet):
    """Pirkimo sąskaitų CRUD operacijos"""
    queryset = PurchaseInvoice.objects.select_related('partner', 'related_order', 'expense_category').prefetch_related('related_orders', 'payment_history').all()
    serializer_class = PurchaseInvoiceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = InvoicePageNumberPagination
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_class = PurchaseInvoiceFilter
    search_fields = ['invoice_number', 'received_invoice_number', 'partner__name', 'partner__code']
    ordering_fields = ['issue_date', 'received_date', 'due_date', 'created_at']
    ordering = ['-created_at']
    
    def get_serializer_context(self):
        """Pridėti request į serializer context"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    def perform_create(self, serializer):
        """Sukuria purchase invoice, nustato ryšį su mail attachment (jei nurodytas source_attachment_id),
        atnaujina OrderCarrier.invoice_received flag'ą ir siunčia pranešimą vadybininkui"""
        from apps.mail.models import MailAttachment
        import logging
        
        logger = logging.getLogger(__name__)
        
        # Išsaugoti source_attachment_id prieš sukūrimą
        # Su multipart/form-data Django REST Framework apdoroja per request.data
        # Bet kartais reikia patikrinti ir request.POST
        source_attachment_id = None
        
        # DRF su multipart/form-data apdoroja per request.data (QueryDict)
        # Taip pat patikrinti request.POST, jei request.data tuščias
        if hasattr(self.request, 'data'):
            # request.data gali būti QueryDict (multipart) arba dict (JSON)
            if hasattr(self.request.data, 'get'):
                source_attachment_id = self.request.data.get('source_attachment_id')
            elif isinstance(self.request.data, dict):
                source_attachment_id = self.request.data.get('source_attachment_id')
        
        # Fallback: patikrinti request.POST (standartinis Django)
        if not source_attachment_id and hasattr(self.request, 'POST'):
            source_attachment_id = self.request.POST.get('source_attachment_id')
        
        logger.info(f'Creating purchase invoice, source_attachment_id: {source_attachment_id}')
        
        # Sukurti invoice
        invoice = serializer.save()
        
        # Jei nurodytas source_attachment_id, nustatyti ryšį
        if source_attachment_id:
            try:
                # Konvertuoti į int, jei string
                attachment_id = int(source_attachment_id) if isinstance(source_attachment_id, str) else source_attachment_id
                attachment = MailAttachment.objects.get(id=attachment_id)
                attachment.related_purchase_invoice = invoice
                attachment.save(update_fields=['related_purchase_invoice'])
                logger.info(f'Successfully linked attachment {attachment_id} to purchase invoice {invoice.id}')
            except (MailAttachment.DoesNotExist, ValueError, TypeError) as e:
                logger.warning(f'Failed to link attachment {source_attachment_id} to purchase invoice {invoice.id}: {e}')
        
        # Atnaujinti OrderCarrier.invoice_received flag'ą, jei yra susijęs užsakymas ir partner
        self._update_carrier_invoice_received(invoice)
        
        # Siųsti pranešimą vadybininkui, jei partneris turi įjungtą pranešimą
        try:
            from .email_service import send_manager_notification_about_purchase_invoice
            send_manager_notification_about_purchase_invoice(invoice, sent_by=self.request.user)
        except Exception as e:
            logger.warning(f'Failed to send manager notification: {e}')
        
        # Registruoti veiksmą ActivityLog
        try:
            from apps.core.services.activity_log_service import ActivityLogService
            ActivityLogService.log_purchase_invoice_created(invoice, user=self.request.user, request=self.request)
        except Exception as e:
            logger.warning(f"Failed to log purchase invoice creation: {e}")
    
    def perform_update(self, serializer):
        """Atnaujina pirkimo sąskaitą"""
        invoice = serializer.save()
        
        # Registruoti veiksmą ActivityLog
        try:
            from apps.core.services.activity_log_service import ActivityLogService
            ActivityLogService.log_purchase_invoice_updated(invoice, user=self.request.user, request=self.request)
        except Exception as e:
            logger.warning(f"Failed to log purchase invoice update: {e}")
    
    def perform_destroy(self, instance):
        """
        Trinant pirkimo sąskaitą:
        1. Pašalinti ryšį su mail attachment (jei yra)
        2. Atnaujinti OrderCarrier.invoice_received = False, jei nėra kitų sąskaitų su tuo pačiu related_order ir partner
        """
        from apps.orders.models import OrderCarrier
        from apps.mail.models import MailAttachment
        
        # Saugoti informaciją prieš trinant
        invoice_id = instance.id
        related_order = instance.related_order
        partner = instance.partner
        
        # Pašalinti ryšį su mail attachment (jei yra)
        MailAttachment.objects.filter(related_purchase_invoice=instance).update(related_purchase_invoice=None)
        
        # Registruoti veiksmą ActivityLog prieš ištrynimą
        try:
            from apps.core.services.activity_log_service import ActivityLogService
            ActivityLogService.log_purchase_invoice_deleted(instance, user=self.request.user, request=self.request)
        except Exception as e:
            logger.warning(f"Failed to log purchase invoice deletion: {e}")
        
        # Iškviesti standartinį trinimą
        super().perform_destroy(instance)
        
        # Jei sąskaita buvo susijusi su užsakymu ir partner, patikrinti ar reikia atnaujinti OrderCarrier
        if related_order and partner:
            # Rasti OrderCarrier objektus su tuo pačiu order ir partner
            order_carriers = OrderCarrier.objects.filter(
                order=related_order,
                partner=partner
            )
            
            # Patikrinti ar yra kitų PurchaseInvoice su tuo pačiu order ir partner
            # Dabar instance jau ištrintas, todėl nereikia exclude(id=invoice_id)
            remaining_invoices = PurchaseInvoice.objects.filter(
                related_order=related_order,
                partner=partner
            )
            
            # Jei nėra kitų sąskaitų, atnaujinti invoice_received = False visiems OrderCarrier
            # su tuo pačiu order ir partner, kurie turi invoice_received = True
            if not remaining_invoices.exists():
                # Atnaujinti visus OrderCarrier su invoice_received = True
                order_carriers.filter(invoice_received=True).update(
                    invoice_received=False,
                    updated_at=timezone.now()
                )
    
    def perform_update(self, serializer):
        """Atnaujinti PurchaseInvoice ir sinchronizuoti OrderCarrier.invoice_received"""
        # Patikrinti, ar keičiasi payment_status į 'unpaid' arba ar yra nauja sąskaita
        old_instance = self.get_object()
        purchase_invoice = serializer.save()
        
        # Atnaujinti OrderCarrier.invoice_received flag'ą
        self._update_carrier_invoice_received(purchase_invoice)
        
        # Siųsti pranešimą vadybininkui, jei:
        # 1. Partneris turi įjungtą pranešimą
        # 2. Sąskaita yra neapmokėta (payment_status='unpaid')
        # 3. Tai nauja sąskaita arba payment_status pasikeitė į 'unpaid'
        if purchase_invoice.payment_status == 'unpaid':
            try:
                from .email_service import send_manager_notification_about_purchase_invoice
                # Siųsti tik jei tai nauja sąskaita arba payment_status pasikeitė į 'unpaid'
                if old_instance.payment_status != 'unpaid':
                    send_manager_notification_about_purchase_invoice(purchase_invoice, sent_by=self.request.user)
            except Exception as e:
                logger.warning(f"Nepavyko siųsti pranešimo vadybininkui apie tiekėjo sąskaitą: {e}")
    
    def _update_carrier_invoice_received(self, purchase_invoice):
        """Atnaujinti OrderCarrier.invoice_received flag'ą pagal PurchaseInvoice"""
        from apps.orders.models import OrderCarrier
        from django.utils import timezone
        
        partner = purchase_invoice.partner
        if not partner:
            return
        
        # Rasti visus susijusius užsakymus (per related_order arba related_orders)
        orders_to_check = []
        if purchase_invoice.related_order:
            orders_to_check.append(purchase_invoice.related_order)
        if purchase_invoice.related_orders.exists():
            orders_to_check.extend(purchase_invoice.related_orders.all())
        
        # Unikalūs užsakymai
        orders_to_check = list(set(orders_to_check))
        
        for order in orders_to_check:
            # Rasti OrderCarrier su tuo pačiu order ir partner
            order_carriers = OrderCarrier.objects.filter(
                order=order,
                partner=partner
            )
            
            # Patikrinti ar yra PurchaseInvoice su šiuo order ir partner
            from apps.invoices.models import PurchaseInvoice
            has_purchase_invoice = PurchaseInvoice.objects.filter(
                partner=partner
            ).filter(
                models.Q(related_order=order) | models.Q(related_orders__id=order.id)
            ).exists()
            
            # Atnaujinti invoice_received flag'ą
            if has_purchase_invoice:
                order_carriers.filter(invoice_received=False).update(
                    invoice_received=True,
                    invoice_received_date=purchase_invoice.received_date or purchase_invoice.issue_date,
                    updated_at=timezone.now()
                )
            else:
                # Jei nėra PurchaseInvoice, bet OrderCarrier turi invoice_received=True,
                # palikti kaip yra (gali būti gauta per dokumentus)
                pass
    
    @action(detail=True, methods=['post'])
    def send_email(self, request, pk=None):
        """Siunčia purchase invoice PDF el. paštu"""
        invoice = self.get_object()
        
        # Priimti masyvą email'ų arba vieną email (atgalinis suderinamumas)
        emails = request.data.get('emails', [])
        if not emails:
            # Jei nėra masyvo, bandyti gauti vieną email
            email = request.data.get('email', '').strip()
            if email:
                emails = [email]
        
        if not emails:
            return Response(
                {'success': False, 'error': 'Nenurodytas el. pašto adresas'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Pridėti naujus kontaktus, jei yra
        contacts_to_add = request.data.get('contacts_to_add', [])
        if contacts_to_add and invoice.partner:
            from apps.partners.models import Contact
            for contact_data in contacts_to_add:
                email_addr = contact_data.get('email', '').strip()
                if email_addr:
                    # Patikrinti, ar kontaktas jau egzistuoja
                    if not Contact.objects.filter(partner=invoice.partner, email__iexact=email_addr).exists():
                        Contact.objects.create(
                            partner=invoice.partner,
                            email=email_addr,
                            first_name=contact_data.get('first_name', '').strip() or '',
                            last_name=contact_data.get('last_name', '').strip() or ''
                        )
        
        try:
            # Gauti PDF failą - naudoti invoice_file arba related_attachment
            pdf_bytes = None
            filename = f"{invoice.received_invoice_number or invoice.invoice_number or f'INV{invoice.id}'}.pdf"
            
            # Pirmiausia tikrinti invoice_file
            if invoice.invoice_file:
                try:
                    pdf_bytes = invoice.invoice_file.read()
                except Exception as e:
                    logger.warning(f"Nepavyko perskaityti invoice_file: {e}")
            
            # Jei nėra invoice_file, tikrinti related_attachment arba reverse relationship
            if not pdf_bytes:
                from apps.mail.models import MailAttachment
                attachment = None
                if invoice.related_attachment and invoice.related_attachment.file:
                    attachment = invoice.related_attachment
                else:
                    # Reverse relationship
                    attachment = MailAttachment.objects.filter(related_purchase_invoice=invoice).first()
                
                if attachment and attachment.file:
                    try:
                        pdf_bytes = attachment.file.read()
                    except Exception as e:
                        logger.warning(f"Nepavyko perskaityti attachment file: {e}")
            
            if not pdf_bytes:
                return Response(
                    {'success': False, 'error': 'Nepavyko rasti sąskaitos PDF failo'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            # Gauti SMTP nustatymus
            from apps.settings.models import NotificationSettings
            try:
                config = NotificationSettings.objects.first()
            except NotificationSettings.DoesNotExist:
                return Response(
                    {'success': False, 'error': 'SMTP nustatymai nerasti'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            if not config:
                return Response(
                    {'success': False, 'error': 'SMTP nustatymai nerasti'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Patikrinti, ar yra visi reikalingi laukai
            missing_fields = []
            if not config.smtp_host:
                missing_fields.append('SMTP serveris')
            if not config.smtp_port:
                missing_fields.append('SMTP portas')
            if not config.smtp_username:
                missing_fields.append('SMTP naudotojas')
            if not config.smtp_password:
                missing_fields.append('SMTP slaptažodis')
            if not config.smtp_from_email:
                missing_fields.append('Numatytasis siuntėjas (el. paštas)')
            
            if missing_fields:
                return Response(
                    {'success': False, 'error': 'Nepakanka SMTP nustatymų. Trūksta laukų: ' + ', '.join(missing_fields)},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Formuoti from_email su vardu, jei yra
            from_email = f"{config.smtp_from_name or 'TMS Sistema'} <{config.smtp_from_email}>"
            
            # Sukurti SMTP connection su NotificationSettings nustatymais
            use_tls = bool(config.smtp_use_tls)
            use_ssl = False
            if not use_tls and config.smtp_port in (465, 587):
                use_ssl = config.smtp_port == 465
            
            # Formuoti el. laiško turinį
            invoice_number = invoice.received_invoice_number or invoice.invoice_number or f'Sąskaita #{invoice.id}'
            subject = f"Sąskaita {invoice_number}"
            
            message_text = f"""
Sveiki,

Pridedame gautą sąskaitą.

Detalės:
- Tiekėjas: {invoice.partner.name if invoice.partner else 'Nenurodyta'}
- Sąskaitos numeris: {invoice_number}
- Suma be PVM: {invoice.amount_net} EUR
- PVM: {invoice.vat_rate}%
- Suma su PVM: {invoice.amount_total} EUR
- Išrašymo data: {invoice.issue_date}
- Mokėjimo terminas: {invoice.due_date}

Su pagarba,
TMS Sistema
"""
            
            sent_count = 0
            failed_emails = []
            
            for email_addr in emails:
                try:
                    email_addr = email_addr.strip()
                    if not email_addr:
                        continue
                    
                    # Sukurti el. laišką
                    from email.mime.multipart import MIMEMultipart
                    from email.mime.text import MIMEText
                    from email.mime.base import MIMEBase
                    from email import encoders
                    
                    email_msg = MIMEMultipart()
                    email_msg['From'] = from_email
                    email_msg['To'] = email_addr
                    email_msg['Subject'] = subject
                    email_msg.attach(MIMEText(message_text, 'plain', 'utf-8'))
                    
                    # Pridėti PDF kaip priedą
                    pdf_attachment = MIMEBase('application', 'pdf')
                    pdf_attachment.set_payload(pdf_bytes)
                    encoders.encode_base64(pdf_attachment)
                    pdf_attachment.add_header('Content-Disposition', f'attachment; filename={filename}')
                    email_msg.attach(pdf_attachment)
                    
                    # Siųsti el. laišką
                    import smtplib
                    smtp_server = smtplib.SMTP_SSL(config.smtp_host, config.smtp_port) if use_ssl else smtplib.SMTP(config.smtp_host, config.smtp_port)
                    
                    if use_tls and not use_ssl:
                        smtp_server.starttls()
                    
                    smtp_server.login(config.smtp_username, config.smtp_password)
                    smtp_server.send_message(email_msg)
                    smtp_server.quit()
                    
                    # Įrašyti į email log'ą
                    try:
                        result = send_email_message_with_logging(
                            email_message=email_msg,
                            email_type='invoice',
                            related_invoice_id=None,  # Purchase invoice neturi related_invoice_id
                            related_partner_id=invoice.partner.id if invoice.partner else None,
                            sent_by=request.user if hasattr(request, 'user') and request.user.is_authenticated else None,
                            metadata={
                                'recipient_name': invoice.partner.name if invoice.partner else '',
                                'purchase_invoice_id': invoice.id,
                                'purchase_invoice_number': invoice_number
                            }
                        )
                        logger.info(f"El. laiškas sėkmingai išsiųstas į {email_addr} (purchase invoice {invoice_number})")
                        sent_count += 1
                    except Exception as log_error:
                        logger.warning(f"Nepavyko įrašyti į email log'ą: {log_error}")
                        # Vis tiek laikyti sėkmingu, jei el. laiškas išsiųstas
                        sent_count += 1
                        
                except Exception as email_error:
                    logger.error(f"Nepavyko išsiųsti el. laiško į {email_addr}: {email_error}")
                    failed_emails.append(email_addr)
            
            if sent_count > 0:
                return Response({
                    'success': True,
                    'message': f'Sėkmingai išsiųsta {sent_count} el. laiškų',
                    'sent_count': sent_count,
                    'failed_emails': failed_emails
                }, status=status.HTTP_200_OK)
            else:
                return Response({
                    'success': False,
                    'error': 'Nepavyko išsiųsti el. laiškų',
                    'failed_emails': failed_emails
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except Exception as e:
            logger.error(f"Klaida siunčiant purchase invoice el. paštu: {e}", exc_info=True)
            return Response(
                {'success': False, 'error': f'Klaida siunčiant el. paštą: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def generate_from_order_carrier(self, request):
        """
        Generuoja pirkimo sąskaitą pagal OrderCarrier.
        Body: { "order_carrier_id": 1, "expense_category_id": 1, "received_invoice_number": "..." }
        """
        from apps.orders.models import OrderCarrier
        
        order_carrier_id = request.data.get('order_carrier_id')
        expense_category_id = request.data.get('expense_category_id')
        
        if not order_carrier_id:
            return Response(
                {"error": "Nepateiktas order_carrier_id."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            order_carrier = OrderCarrier.objects.select_related(
                'order', 'partner', 'order__client'
            ).get(id=order_carrier_id)
        except OrderCarrier.DoesNotExist:
            return Response(
                {"error": "OrderCarrier nerastas."},
                status=status.HTTP_404_NOT_FOUND
            )
        
        if not expense_category_id:
            return Response(
                {"error": "Nepateikta išlaidų kategorija."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Apskaičiuoti sumas
        amount_net = order_carrier.price_net or Decimal('0.00')
        vat_rate = order_carrier.order.vat_rate if order_carrier.order else Decimal('21.00')
        amount_total = amount_net * (1 + vat_rate / 100)
        
        # Nustatyti datas - naudoti iš request.data, jei pateiktos
        from datetime import datetime as dt
        
        # Issue date
        issue_date_str = request.data.get('issue_date')
        if issue_date_str:
            try:
                issue_date = dt.strptime(issue_date_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                # Jei nepavyko konvertuoti, naudoti loading_date arba šiandien
                if order_carrier.loading_date:
                    if isinstance(order_carrier.loading_date, datetime):
                        issue_date = order_carrier.loading_date.date()
                    elif isinstance(order_carrier.loading_date, date):
                        issue_date = order_carrier.loading_date
                    else:
                        issue_date = timezone.now().date()
                else:
                    issue_date = timezone.now().date()
        else:
            # Jei nepateikta issue_date, naudoti loading_date arba šiandien
            if order_carrier.loading_date:
                if isinstance(order_carrier.loading_date, datetime):
                    issue_date = order_carrier.loading_date.date()
                elif isinstance(order_carrier.loading_date, date):
                    issue_date = order_carrier.loading_date
                else:
                    issue_date = timezone.now().date()
            else:
                issue_date = timezone.now().date()
        
        # Received date
        received_date_str = request.data.get('received_date')
        if received_date_str:
            try:
                received_date = dt.strptime(received_date_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                received_date = timezone.now().date()
        else:
            received_date = timezone.now().date()
        
        # Due date
        due_date_str = request.data.get('due_date')
        if due_date_str:
            try:
                due_date = dt.strptime(due_date_str, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                due_date = received_date + timedelta(days=30)
        else:
            due_date = received_date + timedelta(days=30)
        
        # Sukurti sąskaitą (be automatiškai generuojamo invoice_number)
        invoice = PurchaseInvoice.objects.create(
            received_invoice_number=request.data.get('received_invoice_number', ''),
            partner=order_carrier.partner,
            related_order=order_carrier.order,
            expense_category_id=expense_category_id,
            amount_net=amount_net,
            vat_rate=vat_rate,
            amount_total=amount_total,
            issue_date=issue_date,
            received_date=received_date,
            due_date=due_date
        )
        
        # Atnaujinti OrderCarrier - pažymėti, kad sąskaita gauta
        order_carrier.invoice_received = True
        order_carrier.save(update_fields=['invoice_received', 'updated_at'])
        
        serializer = PurchaseInvoiceSerializer(invoice)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """Išlaidų kategorijų CRUD operacijos"""
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [drf_filters.SearchFilter]
    search_fields = ['name', 'description']


class BankImportViewSet(viewsets.ViewSet):
    """Banko išrašo importo ir suderinimo operacijos"""
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['post'])
    def upload(self, request):
        """
        Įkelia CSV banko išrašą ir suderina su sąskaitomis.
        Body: multipart/form-data su 'file' lauku
        """
        if 'file' not in request.FILES:
            return Response(
                {"error": "Nepateiktas failas."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        csv_file = request.FILES['file']
        
        try:
            # Parsiname CSV failą
            transactions = parse_csv_bank_statement(csv_file)
            
            # Suderiname su sąskaitomis
            result = process_bank_statement(transactions)
            
            return Response(result, status=status.HTTP_200_OK)
            
        except ValueError as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except Exception as e:
            return Response(
                {"error": f"Klaida apdorojant failą: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['get'])
    def debtors(self, request):
        """
        Grąžina debitorių (vėluojančių klientų) ataskaitą.
        Query params: overdue_days_min, overdue_days_max
        """
        overdue_days_min = request.query_params.get('overdue_days_min', 0)
        overdue_days_max = request.query_params.get('overdue_days_max', None)
        
        queryset = SalesInvoice.objects.filter(
            payment_status='overdue'
        ).select_related('partner', 'related_order')
        
        try:
            overdue_days_min = int(overdue_days_min)
            if overdue_days_max:
                overdue_days_max = int(overdue_days_max)
                queryset = queryset.filter(
                    overdue_days__gte=overdue_days_min,
                    overdue_days__lte=overdue_days_max
                )
            else:
                queryset = queryset.filter(overdue_days__gte=overdue_days_min)
        except ValueError:
            pass
        
        queryset = queryset.order_by('-overdue_days', '-due_date')
        
        serializer = SalesInvoiceSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def creditors(self, request):
        """
        Grąžina kreditorių (vėluojančių tiekėjų) ataskaitą.
        Query params: overdue_days_min, overdue_days_max
        """
        overdue_days_min = request.query_params.get('overdue_days_min', 0)
        overdue_days_max = request.query_params.get('overdue_days_max', None)
        
        queryset = PurchaseInvoice.objects.filter(
            payment_status='overdue'
        ).select_related('partner', 'related_order')
        
        try:
            overdue_days_min = int(overdue_days_min)
            if overdue_days_max:
                overdue_days_max = int(overdue_days_max)
                queryset = queryset.filter(
                    overdue_days__gte=overdue_days_min,
                    overdue_days__lte=overdue_days_max
                )
            else:
                queryset = queryset.filter(overdue_days__gte=overdue_days_min)
        except ValueError:
            pass
        
        queryset = queryset.order_by('-overdue_days', '-due_date')
        
        serializer = PurchaseInvoiceSerializer(queryset, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def update_overdue(self, request):
        """
        Rankinis vėlavimo atnaujinimas (gali būti naudojamas vietoj cron job).
        """
        result = update_overdue_invoices()
        return Response(result, status=status.HTTP_200_OK)
    
    @action(detail=False, methods=['post'])
    def send_reminder_email(self, request):
        """
        Siunčia priminimo el. laišką debitoriui.
        Body: { "invoice_id": 1 }
        """
        invoice_id = request.data.get('invoice_id')
        if not invoice_id:
            return Response(
                {"error": "Nepateiktas invoice_id"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            invoice = SalesInvoice.objects.select_related(
                'partner', 'partner__contact_person'
            ).get(id=invoice_id)
            
            result = send_debtor_reminder_email(invoice)
            
            if result['success']:
                return Response(result, status=status.HTTP_200_OK)
            else:
                return Response(result, status=status.HTTP_400_BAD_REQUEST)
                
        except SalesInvoice.DoesNotExist:
            return Response(
                {"error": "Sąskaita nerasta"},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=False, methods=['post'])
    def send_reminder_emails_bulk(self, request):
        """
        Siunčia priminimus keliems debitoriams vienu metu.
        Body: { "invoice_ids": [1, 2, 3] }
        """
        invoice_ids = request.data.get('invoice_ids', [])
        if not invoice_ids:
            return Response(
                {"error": "Nepateiktas invoice_ids sąrašas"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        result = send_debtor_reminder_bulk(invoice_ids)
        return Response(result, status=status.HTTP_200_OK)
    
    # Pašalinta - nereikalinga, nes purchase invoice'ams naudojami originalūs PDF failai
    # 
