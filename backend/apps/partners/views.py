from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.db.models import Count, Sum, Max, Min, Q
from django.utils import timezone
from decimal import Decimal
import re
import requests
from xml.etree import ElementTree
from .models import Partner, Contact
from .utils import normalize_partner_code, normalize_partner_name, normalize_vat_code, fix_lithuanian_diacritics
from apps.orders.models import Order, OrderCarrier
from apps.invoices.models import SalesInvoice, PurchaseInvoice
from .serializers import PartnerSerializer, ContactSerializer
from .import_utils import import_partners_from_file


class PartnerPageNumberPagination(PageNumberPagination):
    """Paginacija partneriams su page_size parametru"""
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


class PartnerViewSet(viewsets.ModelViewSet):
    """Partnerių CRUD operacijos"""
    queryset = Partner.objects.select_related('contact_person').prefetch_related('contacts').annotate(contacts_count=Count('contacts')).all()
    serializer_class = PartnerSerializer
    pagination_class = PartnerPageNumberPagination
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_client', 'is_supplier', 'status']
    search_fields = ['name', 'code', 'vat_code']
    ordering_fields = ['name', 'code', 'created_at']
    ordering = ['name']

    @action(detail=False, methods=['get'])
    def duplicates_preview(self, request):
        """Grąžina dublikatų grupes pagal pasirinktą lauką: code|name|vat (query param 'by')."""
        by = (request.query_params.get('by') or 'code').lower()
        if by not in ('code', 'name', 'vat'):
            by = 'code'
        groups = {}
        qs = Partner.objects.all().only('id', 'name', 'code', 'vat_code')
        for p in qs:
            if by == 'code':
                key = normalize_partner_code(p.code)
            elif by == 'name':
                key = normalize_partner_name(p.name)
            else:
                key = normalize_vat_code(p.vat_code)
            groups.setdefault(key, []).append({'id': p.id, 'name': p.name, 'code': p.code, 'vat_code': p.vat_code})
        dup_groups = [
            {'by': by, 'key': k, 'partners': v}
            for k, v in groups.items() if k and len(v) > 1
        ]
        return Response({'count': len(dup_groups), 'groups': dup_groups})

    @action(detail=False, methods=['post'])
    def duplicates_merge(self, request):
        """
        Sujungia partnerius: perkelia ryšius į primary_id ir ištrina duplicate_ids.
        Body: {"primary_id": int, "duplicate_ids": [int, ...]}
        """
        primary_id = request.data.get('primary_id')
        duplicate_ids = request.data.get('duplicate_ids') or []
        if not primary_id or not isinstance(duplicate_ids, list) or not duplicate_ids:
            return Response({'error': 'primary_id ir duplicate_ids būtini'}, status=status.HTTP_400_BAD_REQUEST)
        if primary_id in duplicate_ids:
            return Response({'error': 'primary_id negali būti duplicate_ids sąraše'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            primary = Partner.objects.get(pk=primary_id)
        except Partner.DoesNotExist:
            return Response({'error': 'primary partner nerastas'}, status=status.HTTP_404_NOT_FOUND)

        # Patikrinam, kad visi dublikatų kodai atitinka normalizuotą kodą (nebūtina, bet saugiau)
        primary_norm = normalize_partner_code(primary.code)
        to_merge = Partner.objects.filter(pk__in=duplicate_ids)

        # Perkeliame ryšius
        # Orders: client, carrier
        Order.objects.filter(client__in=to_merge).update(client=primary)
        Order.objects.filter(carrier__in=to_merge).update(carrier=primary)
        OrderCarrier.objects.filter(partner__in=to_merge).update(partner=primary)
        # Invoices: sales partner, purchase partner
        SalesInvoice.objects.filter(partner__in=to_merge).update(partner=primary)
        PurchaseInvoice.objects.filter(partner__in=to_merge).update(partner=primary)
        # Contacts: priskirti prie primary
        Contact.objects.filter(partner__in=to_merge).update(partner=primary)

        # Jei primary neturi contact_person, o dub turi – paimam pirmą
        if not primary.contact_person:
            first_contact = Contact.objects.filter(partner=primary).first()
            if first_contact:
                primary.contact_person = first_contact
                primary.save(update_fields=['contact_person'])

        # Ištrinam dublikatų partnerius
        deleted_ids = list(to_merge.values_list('id', flat=True))
        to_merge.delete()

        return Response({
            'success': True,
            'primary_id': primary_id,
            'deleted_ids': deleted_ids,
            'normalized_code': primary_norm
        })

    @action(detail=False, methods=['post'])
    def fix_names(self, request):
        """Pataiso partnerių ir kontaktų pavadinimus/rašybą (LT diakritikai)."""
        updated_partners = 0
        updated_contacts = 0
        for p in Partner.objects.all():
            new_name = fix_lithuanian_diacritics(p.name or '')
            new_address = fix_lithuanian_diacritics(p.address or '')
            to_update = []
            if new_name != (p.name or ''):
                p.name = new_name
                to_update.append('name')
            if new_address != (p.address or ''):
                p.address = new_address
                to_update.append('address')
            if to_update:
                p.save(update_fields=to_update)
                updated_partners += 1
        for c in Contact.objects.all():
            fn = fix_lithuanian_diacritics(c.first_name or '')
            ln = fix_lithuanian_diacritics(c.last_name or '')
            pos = fix_lithuanian_diacritics(c.position or '')
            notes = fix_lithuanian_diacritics(c.notes or '')
            to_update = []
            if fn != (c.first_name or ''):
                c.first_name = fn
                to_update.append('first_name')
            if ln != (c.last_name or ''):
                c.last_name = ln
                to_update.append('last_name')
            if pos != (c.position or ''):
                c.position = pos
                to_update.append('position')
            if notes != (c.notes or ''):
                c.notes = notes
                to_update.append('notes')
            if to_update:
                c.save(update_fields=to_update)
                updated_contacts += 1
        return Response({'success': True, 'updated_partners': updated_partners, 'updated_contacts': updated_contacts})

    @action(detail=False, methods=['get'])
    def resolve_name(self, request):
        """Bando gauti juridinio asmens pavadinimą pagal PVM kodą (VIES). Query: vat_code=LTxxxxxxxxx"""
        vat_code = request.query_params.get('vat_code') or request.query_params.get('vat')
        if not vat_code:
            return Response({'error': 'Reikalingas vat_code, pvz.: LT123456789'}, status=status.HTTP_400_BAD_REQUEST)
        vat_code = vat_code.strip().upper()
        m = re.match(r'^([A-Z]{2})([0-9A-Za-z]+)$', vat_code)
        if not m:
            return Response({'error': 'Neteisingas PVM formato kodas'}, status=status.HTTP_400_BAD_REQUEST)
        country, number = m.group(1), m.group(2)
        # SOAP užklausa į VIES
        url = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService'
        envelope = f'''<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soap:Body>
    <urn:checkVat>
      <urn:countryCode>{country}</urn:countryCode>
      <urn:vatNumber>{number}</urn:vatNumber>
    </urn:checkVat>
  </soap:Body>
  </soap:Envelope>'''
        headers = {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'urn:ec.europa.eu:taxud:vies:services:checkVat:types#checkVat'
        }
        try:
            resp = requests.post(url, data=envelope.encode('utf-8'), headers=headers, timeout=15)
            resp.raise_for_status()
            tree = ElementTree.fromstring(resp.content)
            ns = {
                'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
                'ns2': 'urn:ec.europa.eu:taxud:vies:services:checkVat:types'
            }
            body = tree.find('soap:Body', ns)
            if body is None:
                return Response({'error': 'Blogas VIES atsakymas'}, status=502)
            result = body.find('ns2:checkVatResponse', ns)
            if result is None:
                return Response({'error': 'VIES negrąžino rezultato'}, status=502)
            valid = (result.findtext('ns2:valid', default='false', namespaces=ns) or '').lower() == 'true'
            name = result.findtext('ns2:name', default='', namespaces=ns) or ''
            address = result.findtext('ns2:address', default='', namespaces=ns) or ''
            if not valid:
                return Response({'valid': False, 'name': None, 'address': None})
            name = name if name and name != '---' else ''
            address = address if address and address != '---' else ''
            return Response({'valid': True, 'name': name or None, 'address': address or None})
        except requests.RequestException as e:
            return Response({'error': f'VIES neprieinamas: {e}'}, status=502)

    # Paieška pagal įmonės kodą – pašalinta pagal kliento prašymą. Paliktas tik VIES pagal PVM kodą.

    @action(detail=False, methods=['post'])
    def duplicates_merge_auto(self, request):
        """
        Masinis sujungimas: pagal 'by' (code|name|vat) automatiškai parenka primary (mažiausias ID)
        ir sujungia likusius tame pačiame kvietime.
        Body (optional): {"by": "code|name|vat"}
        """
        by = (request.data.get('by') or request.query_params.get('by') or 'code').lower()
        if by not in ('code', 'name', 'vat'):
            by = 'code'
        groups = {}
        qs = Partner.objects.all().only('id', 'name', 'code', 'vat_code')
        for p in qs:
            if by == 'code':
                key = normalize_partner_code(p.code)
            elif by == 'name':
                key = normalize_partner_name(p.name)
            else:
                key = normalize_vat_code(p.vat_code)
            groups.setdefault(key, []).append(p)

        merged = []
        skipped = []
        with transaction.atomic():
            for key, plist in groups.items():
                if not key or len(plist) < 2:
                    continue
                # Pasirenkam primary su mažiausiu ID
                plist_sorted = sorted(plist, key=lambda x: x.id)
                primary = plist_sorted[0]
                dups = plist_sorted[1:]
                if not dups:
                    continue
                # Perkeliame ryšius kaip ir duplicates_merge
                Order.objects.filter(client__in=dups).update(client=primary)
                Order.objects.filter(carrier__in=dups).update(carrier=primary)
                OrderCarrier.objects.filter(partner__in=dups).update(partner=primary)
                SalesInvoice.objects.filter(partner__in=dups).update(partner=primary)
                PurchaseInvoice.objects.filter(partner__in=dups).update(partner=primary)
                Contact.objects.filter(partner__in=dups).update(partner=primary)
                if not primary.contact_person:
                    first_contact = Contact.objects.filter(partner=primary).first()
                    if first_contact:
                        primary.contact_person = first_contact
                        primary.save(update_fields=['contact_person'])
                deleted_ids = list(Partner.objects.filter(pk__in=[p.id for p in dups]).values_list('id', flat=True))
                if not deleted_ids:
                    skipped.append({'key': key})
                    continue
                Partner.objects.filter(pk__in=deleted_ids).delete()
                merged.append({
                    'by': by,
                    'key': key,
                    'primary_id': primary.id,
                    'deleted_ids': deleted_ids
                })

        return Response({
            'success': True,
            'merged_groups': len(merged),
            'merged': merged,
            'skipped': skipped
        })




    @action(detail=True, methods=['get'], url_path='unpaid-invoices-info')
    def unpaid_invoices_info(self, request, pk=None):
        """Grąžina kliento neapmokėtų sąskaitų informaciją"""
        partner = self.get_object()
        
        if not partner.is_client:
            return Response({
                'count': 0,
                'total_amount': '0.00',
                'max_overdue_days': 0
            })
        
        unpaid_invoices = SalesInvoice.objects.filter(
            partner=partner,
            payment_status__in=['unpaid', 'overdue', 'partially_paid']
        )
        
        count = unpaid_invoices.count()
        total_amount = unpaid_invoices.aggregate(
            total=Sum('amount_total')
        )['total'] or Decimal('0.00')
        
        max_overdue = unpaid_invoices.aggregate(
            max_days=Max('overdue_days')
        )['max_days'] or 0
        
        # Jei nėra overdue_days, bet yra sąskaitų su praėjusiu due_date, skaičiuoti pagal due_date
        if max_overdue == 0:
            today = timezone.now().date()
            # Rasti visas sąskaitas su praėjusiu due_date (ne tik overdue status)
            overdue_invoices = unpaid_invoices.filter(
                due_date__lt=today
            )
            if overdue_invoices.exists():
                # Rasti seniausią (mažiausią) due_date ir skaičiuoti vėlavimą
                min_due_date = overdue_invoices.aggregate(
                    min_date=Min('due_date')
                )['min_date']
                if min_due_date:
                    max_overdue = (today - min_due_date).days
        
        return Response({
            'count': count,
            'total_amount': str(total_amount),
            'max_overdue_days': max_overdue
        })

    @action(detail=True, methods=['get'], url_path='unpaid-purchase-invoices-info')
    def unpaid_purchase_invoices_info(self, request, pk=None):
        """Grąžina vežėjo neapmokėtų gautų sąskaitų informaciją"""
        partner = self.get_object()
        
        if not partner.is_supplier:
            return Response({
                'count': 0,
                'total_amount': '0.00',
                'max_overdue_days': 0
            })
        
        unpaid_invoices = PurchaseInvoice.objects.filter(
            partner=partner,
            payment_status__in=['unpaid', 'overdue', 'partially_paid']
        )
        
        count = unpaid_invoices.count()
        total_amount = unpaid_invoices.aggregate(
            total=Sum('amount_total')
        )['total'] or Decimal('0.00')
        
        max_overdue = unpaid_invoices.aggregate(
            max_days=Max('overdue_days')
        )['max_days'] or 0
        
        # Jei nėra overdue_days, bet yra sąskaitų su praėjusiu due_date, skaičiuoti pagal due_date
        if max_overdue == 0:
            today = timezone.now().date()
            # Rasti visas sąskaitas su praėjusiu due_date (ne tik overdue status)
            overdue_invoices = unpaid_invoices.filter(
                due_date__lt=today
            )
            if overdue_invoices.exists():
                # Rasti seniausią (mažiausią) due_date ir skaičiuoti vėlavimą
                min_due_date = overdue_invoices.aggregate(
                    min_date=Min('due_date')
                )['min_date']
                if min_due_date:
                    max_overdue = (today - min_due_date).days
        
        return Response({
            'count': count,
            'total_amount': str(total_amount),
            'max_overdue_days': max_overdue
        })


class ContactViewSet(viewsets.ModelViewSet):
    """Kontaktinių asmenų CRUD operacijos"""
    queryset = Contact.objects.all()
    serializer_class = ContactSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['partner']
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    ordering_fields = ['last_name', 'first_name']
    ordering = ['last_name', 'first_name']

    def _apply_sender_policies(self, sender: Contact):
        """Taiko siuntėjo politikas - ištrina reklaminių siuntėjų laiškus"""
        from apps.mail.models import MailMessage
        messages_qs = MailMessage.objects.filter(sender_email__iexact=sender.email)
        if sender.is_advertising:
            messages_qs.delete()
        elif sender.is_trusted:
            messages_qs.update(is_promotional=False)

    @action(detail=True, methods=['post'])
    def trust(self, request, pk=None):
        """Pažymi kontaktą kaip patikimą"""
        sender = self.get_object()
        sender.is_trusted = True
        sender.is_advertising = False
        sender.save(update_fields=['is_trusted', 'is_advertising'])
        self._apply_sender_policies(sender)
        return Response(self.get_serializer(sender).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def advertising(self, request, pk=None):
        """Pazymi kontakta kaip reklamini ir istrina visus jo laiskus"""
        from apps.mail.models import MailMessage
        from django.db import transaction
        import logging

        logger = logging.getLogger(__name__)
        sender = self.get_object()

        logger.warning(f'=== ADVERTISING ACTION START ===')
        logger.warning(f'Sender: {sender.email} (ID: {sender.id})')
        logger.warning(f'Current status - Advertising: {sender.is_advertising}, Trusted: {sender.is_trusted}')

        # Patikriname kiek laiškų yra PRIEŠ
        messages_before = MailMessage.objects.filter(sender_email__iexact=sender.email).count()
        logger.warning(f'Messages before: {messages_before}')

        try:
            with transaction.atomic():
                # Išsaugome kontaktą
                sender.is_advertising = True
                sender.is_trusted = False
                sender.save(update_fields=['is_advertising', 'is_trusted'])
                logger.warning(f'Saved sender {sender.email} as advertising (DB updated)')

                # Ištriname laiškus
                messages_qs = MailMessage.objects.filter(sender_email__iexact=sender.email)
                message_count = messages_qs.count()
                logger.warning(f'Found {message_count} messages to delete')

                if message_count > 0:
                    deleted_count = messages_qs.delete()
                    logger.warning(f'DELETED {deleted_count[0]} messages from database')
                else:
                    logger.warning('No messages to delete')

                # Patikriname kiek laiškų liko PO
                messages_after = MailMessage.objects.filter(sender_email__iexact=sender.email).count()
                logger.warning(f'Messages after: {messages_after}')
                logger.warning(f'=== ADVERTISING ACTION END ===')

        except Exception as e:
            logger.error(f'ERROR in advertising action for {sender.email}: {e}')
            logger.error(f'=== ADVERTISING ACTION FAILED ===')
            raise

        return Response(self.get_serializer(sender).data)


class PartnerImportViewSet(viewsets.ViewSet):
    """Partnerių importo operacijos"""
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['post'])
    def upload(self, request):
        """
        Įkelia XLSX arba CSV failą ir importuoja partnerius.
        Body: multipart/form-data su 'file' lauku
        
        Query params:
        - is_client=true/false (default: true)
        - is_supplier=true/false (default: false)
        - update_existing=true/false (default: false)
        """
        if 'file' not in request.FILES:
            return Response(
                {"error": "Nepateiktas failas."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        file = request.FILES['file']
        
        # Parametrai
        is_client = request.data.get('is_client', 'true').lower() == 'true'
        is_supplier = request.data.get('is_supplier', 'false').lower() == 'true'
        update_existing = request.data.get('update_existing', 'false').lower() == 'true'
        
        # Importuojame
        result = import_partners_from_file(
            file=file,
            is_client=is_client,
            is_supplier=is_supplier,
            update_existing=update_existing
        )
        
        if result['success']:
            return Response(result, status=status.HTTP_200_OK)
        else:
            return Response(result, status=status.HTTP_400_BAD_REQUEST)