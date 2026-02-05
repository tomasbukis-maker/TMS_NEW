import re
import logging

# pyright: reportAttributeAccessIssue=false

import mimetypes

from django.http import FileResponse, Http404
from django.db.models import Q

from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import MailAttachment, MailMessage, MailMessageTag, MailSender, MailSyncState, MailTag, EmailLog
from apps.partners.models import Contact


class MailPagePagination(PageNumberPagination):
    page_size = 10
from .serializers import (
    MailAttachmentSerializer,
    MailMessageSerializer,
    MailSenderSerializer,
    MailSyncStateSerializer,
    MailTagSerializer,
    EmailLogSerializer,
)
from .services import sync_imap
from .bounce_handler import process_bounce_emails
from apps.orders.models import Order, OrderCarrier
from apps.partners.models import Contact
from email.utils import getaddresses
from .utils import extract_email_from_sender

logger = logging.getLogger(__name__)


class EmailLogPageNumberPagination(PageNumberPagination):
    """Puslapiavimas el. laiškų log'ams"""
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class MailMessageViewSet(viewsets.ModelViewSet):
    queryset = MailMessage.objects.prefetch_related(
        'attachments__related_purchase_invoice__partner',  # Optimizuota užklausa purchase invoice info
        'message_tags__tag',
        'matched_orders',
        'matched_expeditions',
        'matched_sales_invoices',
        'matched_purchase_invoices',
    ).all()
    serializer_class = MailMessageSerializer

    def optimize_sender_queries(self, messages):
        """
        Optimizuoja sender_record užklausas - daro vieną bulk užklausą vietoj N+1
        """
        if not messages:
            return

        # Surenkame visus unikalius sender_email
        sender_emails = set()
        for msg in messages:
            if msg.sender_email:
                sender_emails.add(msg.sender_email.lower())

        if not sender_emails:
            return

        # Viena užklausa visiems sender'iams
        from apps.partners.models import Contact
        senders = list(Contact.objects.filter(
            email__in=sender_emails
        ).values('id', 'email', 'first_name', 'last_name', 'is_trusted', 'is_advertising'))

        # Sukuriame mapping'ą
        sender_map = {}
        for sender in senders:
            email_key = sender['email'].lower()
            sender_map[email_key] = {
                'id': sender['id'],
                'email': sender['email'],
                'name': f"{sender['first_name']} {sender['last_name']}".strip() or sender['email'],
                'is_trusted': sender['is_trusted'],
                'is_advertising': sender['is_advertising'],
            }

        # Priskiriame global cache prie messages (visos žinios apie visus sender'ius)
        for msg in messages:
            msg._global_sender_cache = sender_map

        # Priskiriame cached sender'ius prie messages (pagreitinimui)
        for msg in messages:
            if msg.sender_email:
                msg._cached_sender_record = sender_map.get(msg.sender_email.lower())

    def get_paginated_queryset_with_senders(self, queryset):
        """
        Gauna paginuotus duomenis su optimizuotais sender'iais
        """
        page = self.paginate_queryset(queryset)
        if page is not None:
            # Optimizuojame tik šio puslapio sender'ius
            self.optimize_sender_queries(page)
            return page, True
        else:
            # Optimizuojame visus rezultatus
            messages = list(queryset)
            self.optimize_sender_queries(messages)
            return messages, False
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['subject', 'sender', 'recipients', 'snippet', 'message_id']
    ordering = ['-date']
    pagination_class = MailPagePagination

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        folder_param = self.request.query_params.get('folder')
        has_matches_param = self.request.query_params.get('has_matches')
        is_promotional_param = self.request.query_params.get('is_promotional')
        
        if status_param:
            qs = qs.filter(status=status_param)
        if folder_param:
            qs = qs.filter(folder=folder_param)
        
        # Filtras susietiems/nesusietiems laiškams
        if has_matches_param == 'true':
            # Susieti laiškai - turi matched_orders, matched_expeditions, matched_sales_invoices arba matched_purchase_invoices
            qs = qs.filter(
                Q(matched_orders__isnull=False) |
                Q(matched_expeditions__isnull=False) |
                Q(matched_sales_invoices__isnull=False) |
                Q(matched_purchase_invoices__isnull=False)
            ).distinct()
        elif has_matches_param == 'false':
            # Nesusieti laiškai - neturi jokių susiejimų
            # Taip pat neįtraukiame reklaminių laiškų
            qs = qs.filter(
                matched_orders__isnull=True,
                matched_expeditions__isnull=True,
                matched_sales_invoices__isnull=True,
                matched_purchase_invoices__isnull=True,
                is_promotional=False
            ).distinct()
        
        # Filtras reklaminiams laiškams
        if is_promotional_param == 'true':
            qs = qs.filter(is_promotional=True)
        elif is_promotional_param == 'false':
            qs = qs.filter(is_promotional=False)
        
        advertising_emails = list(Contact.objects.filter(is_advertising=True).values_list('email', flat=True))
        if advertising_emails:
            qs = qs.exclude(sender_email__in=advertising_emails)
        
        return qs

    def get_serializer_context(self):
        return super().get_serializer_context()

    def _apply_filters(self, queryset, request):
        """Taikyti bendrus filtrus: status, folder"""
        # Status filtras
        status_param = request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        # Folder filtras
        folder_param = request.query_params.get('folder')
        if folder_param:
            queryset = queryset.filter(folder=folder_param)

        # Išskirti reklaminius siuntėjus
        advertising_emails = list(Contact.objects.filter(is_advertising=True).values_list('email', flat=True))
        if advertising_emails:
            queryset = queryset.exclude(sender_email__in=advertising_emails)

        return queryset

    @action(detail=False, methods=['get'])
    def linked(self, request):
        """Susieti laiškai: realiai susieti + visi laiškai kurie turi užsakymo/ekspedicijos numerį tekste (įskaitant sistemos laiškus)"""
        self.request = request

        # Naudojame tą patį algoritmą kaip by-order endpoint'as, bet BE filtro prieš sistemos laiškus
        # Gauname užsakymo numerį iš query params (bet čia jo nėra, tai ieškome visų)
        from apps.orders.models import Order, OrderCarrier

        # Gauname visus numerius
        all_order_numbers = set(str(num).strip().upper() for num in Order.objects.exclude(order_number__isnull=True).exclude(order_number='').values_list('order_number', flat=True) if num)
        all_exp_numbers = set(str(num).strip().upper() for num in OrderCarrier.objects.exclude(expedition_number__isnull=True).exclude(expedition_number='').values_list('expedition_number', flat=True) if num)

        # Kuriam sąlygą kuri randa laiškus su bet kuriuo numeriu
        number_condition = Q()
        for number in all_order_numbers | all_exp_numbers:
            number_condition |= (
                Q(subject__icontains=number) |
                Q(snippet__icontains=number) |
                Q(body_plain__icontains=number)
            )

        # Sujungiame: realiai susieti + turi numerį tekste
        queryset = self.get_queryset().filter(
            Q(matched_orders__isnull=False) |
            Q(matched_expeditions__isnull=False) |
            Q(matched_sales_invoices__isnull=False) |
            Q(matched_purchase_invoices__isnull=False) |
            Q(related_order_id__isnull=False) |
            number_condition
        ).distinct()

        queryset = self._apply_filters(queryset, request)

        # Ordering ir search filtrai
        queryset = self.filter_queryset(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            # OPTMIZACIJA: Bulk load sender'iai vienu SELECT
            self.optimize_sender_queries(page)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # OPTMIZACIJA: Bulk load sender'iai vienu SELECT
        messages = list(queryset)
        self.optimize_sender_queries(messages)
        serializer = self.get_serializer(messages, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def unlinked(self, request):
        """Tik nesusieti laiškai (neturi jokių susiejimų ir nėra reklaminiai)"""
        self.request = request
        queryset = self.get_queryset().filter(
            matched_orders__isnull=True,
            matched_expeditions__isnull=True,
            matched_sales_invoices__isnull=True,
            matched_purchase_invoices__isnull=True,
            is_promotional=False
        ).distinct()

        queryset = self._apply_filters(queryset, request)

        # Ordering ir search filtrai
        queryset = self.filter_queryset(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            # OPTMIZACIJA: Bulk load sender'iai vienu SELECT
            self.optimize_sender_queries(page)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # OPTMIZACIJA: Bulk load sender'iai vienu SELECT
        messages = list(queryset)
        self.optimize_sender_queries(messages)
        serializer = self.get_serializer(messages, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def promotional(self, request):
        """Tik reklaminiai laiškai"""
        self.request = request
        queryset = self.get_queryset().filter(is_promotional=True)

        queryset = self._apply_filters(queryset, request)

        # Ordering ir search filtrai
        queryset = self.filter_queryset(queryset)

        page = self.paginate_queryset(queryset)
        if page is not None:
            # OPTMIZACIJA: Bulk load sender'iai vienu SELECT
            self.optimize_sender_queries(page)
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # OPTMIZACIJA: Bulk load sender'iai vienu SELECT
        messages = list(queryset)
        self.optimize_sender_queries(messages)
        serializer = self.get_serializer(messages, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def sync(self, request):
        limit = request.data.get('limit')
        try:
            limit = int(limit) if limit is not None else 50
        except (TypeError, ValueError):
            limit = 50
        result = sync_imap(limit=limit)
        status_code = status.HTTP_200_OK if result.get('status') == 'ok' else status.HTTP_400_BAD_REQUEST
        return Response(result, status=status_code)

    @action(detail=True, methods=['post'])
    def add_tag(self, request, pk=None):
        mail_message = self.get_object()
        tag_id = request.data.get('tag_id')
        if not tag_id:
            return Response({'error': 'tag_id privalomas'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            tag = MailTag.objects.get(pk=tag_id)
        except MailTag.DoesNotExist:
            return Response({'error': 'Žyma nerasta'}, status=status.HTTP_404_NOT_FOUND)

        MailMessageTag.objects.get_or_create(mail_message=mail_message, tag=tag)
        return Response(self.get_serializer(mail_message).data)

    @action(detail=True, methods=['post'])
    def remove_tag(self, request, pk=None):
        mail_message = self.get_object()
        tag_id = request.data.get('tag_id')
        if not tag_id:
            return Response({'error': 'tag_id privalomas'}, status=status.HTTP_400_BAD_REQUEST)

        MailMessageTag.objects.filter(mail_message=mail_message, tag_id=tag_id).delete()
        return Response(self.get_serializer(mail_message).data)

    @action(detail=False, methods=['get'], url_path='match-summary')
    def match_summary(self, request):
        """Grąžina užsakymų ir ekspedicijų numerius, rastus laiškuose arba susietus su laiškais."""

        from apps.orders.models import Order, OrderCarrier
        from django.db.models import Exists, OuterRef

        # 1. Pirmiausia gauname VISUS užsakymų ir ekspedicijų numerius iš DB
        order_numbers = {
            (num or '').strip().upper()
            for num in Order.objects.exclude(order_number__isnull=True).exclude(order_number='').values_list('order_number', flat=True)
        }
        expedition_numbers = {
            (num or '').strip().upper()
            for num in OrderCarrier.objects.exclude(expedition_number__isnull=True).exclude(expedition_number='').values_list('expedition_number', flat=True)
        }

        matched_orders = set()
        matched_expeditions = set()

        # 2. Randame užsakymus kurie turi SUSIETUS laiškus (matched_mail_messages ARBA related_order_id)

        # Užsakymai su susietais laiškais
        orders_with_messages = Order.objects.filter(
            matched_mail_messages__isnull=False
        ).values_list('order_number', flat=True)

        for order_num in orders_with_messages:
            if order_num:
                matched_orders.add(order_num.strip().upper())

        # BONUS: Užsakymai su tiesiogiai susietais laiškais (related_order_id)
        from django.db.models import Exists, OuterRef
        orders_with_direct_messages = Order.objects.filter(
            Exists(MailMessage.objects.filter(related_order_id=OuterRef('pk')))
        ).values_list('order_number', flat=True)

        for order_num in orders_with_direct_messages:
            if order_num:
                matched_orders.add(order_num.strip().upper())

        # Ekspedicijos su susietais laiškais
        expeditions_with_messages = OrderCarrier.objects.filter(
            matched_mail_messages__isnull=False
        ).values_list('expedition_number', flat=True)

        for exp_num in expeditions_with_messages:
            if exp_num:
                matched_expeditions.add(exp_num.strip().upper())

        # 3. BONUS: Ieškome numerių laiškų turinyje (jei OCR neveikia, bent jau turime susietus)
        # Išskyrus laiškus kurie buvo priskirti rankiniu būdu
        queryset = self.get_queryset().exclude(manually_assigned=True).prefetch_related('attachments')

        for message in queryset:
            pieces = [
                message.subject or '',
                message.sender or '',
                message.recipients or '',
                message.cc or '',
                message.bcc or '',
                message.snippet or '',
                message.body_plain or '',
            ]

            if message.body_html:
                pieces.append(MailMessageSerializer._strip_html(message.body_html))

            for attachment in message.attachments.all():
                if attachment.filename:
                    pieces.append(attachment.filename)

                # ✅ Naudoti išsaugotus OCR rezultatus (greita!)
                if attachment.ocr_processed and attachment.ocr_text:
                    pieces.append(attachment.ocr_text)

            combined = ' '.join(pieces)
            if not combined:
                continue

            candidates = set(re.findall(r'[A-Z0-9][A-Z0-9\-/]{2,}', combined.upper()))

            for candidate in candidates:
                if candidate in order_numbers:
                    matched_orders.add(candidate)
                if candidate in expedition_numbers:
                    matched_expeditions.add(candidate)

        return Response({
            'order_numbers': sorted(matched_orders),
            'expedition_numbers': sorted(matched_expeditions),
        })

    @action(detail=False, methods=['get'], url_path='by-expedition')
    def by_expedition(self, request):
        """Grąžina laiškus, kuriuose rastas konkretus ekspedicijos numeris."""

        raw_number = request.query_params.get('number')
        if not raw_number:
            return Response({'detail': "Parametras 'number' privalomas."}, status=status.HTTP_400_BAD_REQUEST)

        expedition_number = raw_number.strip().upper()
        if not expedition_number:
            return Response({'detail': "Parametras 'number' negali būti tuščias."}, status=status.HTTP_400_BAD_REQUEST)

        serializer_context = self.get_serializer_context()
        matched_messages = []

        queryset = self.get_queryset().prefetch_related('attachments')

        for message in queryset:
            serializer = self.get_serializer(message)
            data = serializer.data
            matches = data.get('matches') or {}
            expeditions = matches.get('expeditions') or []

            if any((value or '').strip().upper() == expedition_number for value in expeditions):
                matched_messages.append(data)

        return Response({
            'number': expedition_number,
            'messages': matched_messages,
        })

    @action(detail=False, methods=['get'], url_path='by-order')
    def by_order(self, request):
        """Grąžina laiškus, kuriuose rastas konkretus užsakymo numeris."""

        raw_number = request.query_params.get('number')
        if not raw_number:
            return Response({'detail': "Parametras 'number' privalomas."}, status=status.HTTP_400_BAD_REQUEST)

        order_number = raw_number.strip().upper()
        if not order_number:
            return Response({'detail': "Parametras 'number' negali būti tuščias."}, status=status.HTTP_400_BAD_REQUEST)

        # Optimizuota paieška: pirmiausia filtruojame pagal related_order_id
        from apps.orders.models import Order
        from django.db.models import Q
        
        order = None
        order_id = None
        try:
            order = Order.objects.only('id').get(order_number__iexact=order_number)
            order_id = order.id
        except Order.DoesNotExist:
            pass
        
        # Nustatyti request, kad get_queryset() galėtų naudoti filtrus
        self.request = request

        # Rasti laiškus, kurie yra susieti su užsakymu (visos susiejimo formos)
        directly_linked = self.get_queryset().none()
        matched_linked = self.get_queryset().none()

        if order_id:
            # Tiesiogiai susieti (related_order_id)
            directly_linked = self.get_queryset().filter(related_order_id=order_id).prefetch_related(
                'attachments__related_purchase_invoice__partner'
            )

            # ManyToMany susieti (matched_orders)
            matched_linked = self.get_queryset().filter(matched_orders=order_id).prefetch_related(
                'attachments__related_purchase_invoice__partner'
            )

        # Rasti laiškus, kuriuose užsakymo numeris gali būti tekste
        # Optimizuota: filtruojame tik svarbiausius laukus (subject, snippet, body_plain)
        # body_html paliekame, bet tik jei kiti laukai neranda
        text_search = self.get_queryset().filter(
            Q(subject__icontains=order_number) |
            Q(snippet__icontains=order_number) |
            Q(body_plain__icontains=order_number)
        ).prefetch_related('attachments__related_purchase_invoice__partner')

        # Jei nerasta tekste, tikrinti body_html (lėčiau)
        if not text_search.exists() and not directly_linked.exists() and not matched_linked.exists():
            text_search = self.get_queryset().filter(
                Q(body_html__icontains=order_number)
            ).prefetch_related('attachments__related_purchase_invoice__partner')

        # Sujungti visus queryset'us ir pašalinti dublikatus, limit'as 200 laiškų
        # Svarbu: directly_linked turi pirmenybę prieš matched_linked
        combined_queryset = (directly_linked | matched_linked.exclude(id__in=directly_linked.values_list('id', flat=True)) | text_search.exclude(id__in=directly_linked.values_list('id', flat=True)).exclude(id__in=matched_linked.values_list('id', flat=True))).distinct()[:200]

        # Užkrauti order_numbers cache vieną kartą (tik jei reikia)
        serializer_context = self.get_serializer_context()
        matched_messages = []

        # Serializuoti kombinuotą queryset'ą (jau deduplikuotą)
        processed_ids = set()
        for message in combined_queryset:
            if message.id not in processed_ids:
                processed_ids.add(message.id)
                serializer = self.get_serializer(message, context=serializer_context)
                matched_messages.append(serializer.data)

        return Response({
            'number': order_number,
            'messages': matched_messages,
        })

    def _add_sender_email_to_client(self, mail_message: MailMessage, order: Order):
        """Prideda email adresą iš sender lauko prie kliento kontaktų"""
        if not order or not order.client:
            return
        
        sender_email = extract_email_from_sender(mail_message.sender or '')
        if not sender_email:
            return
        
        # Patikrinti, ar kontaktas jau egzistuoja
        if Contact.objects.filter(partner=order.client, email__iexact=sender_email).exists():
            return
        
        # Pridėti naują kontaktą
        try:
            Contact.objects.create(
                partner=order.client,
                email=sender_email,
                first_name='',
                last_name='',
                notes=f'Automatiškai pridėtas iš el. laiško (ID: {mail_message.id})'
            )
        except Exception as e:
            logger.warning(f'Nepavyko pridėti kontakto iš el. laiško: {e}')

    @action(detail=True, methods=['post'], url_path='assign')
    def assign(self, request, pk=None):
        """Rankiniu būdu priskiria laišką prie užsakymo arba ekspedicijos."""
        mail_message = self.get_object()

        # Naujas būdas - naudoti order_id (pageidaujamasis)
        order_id = request.data.get('order_id')
        if order_id:
            try:
                order = Order.objects.get(id=order_id)
                # Išvalyti esamus priskyrimus
                mail_message.matched_orders.clear()
                mail_message.matched_expeditions.clear()
                # Priskirti naują užsakymą
                mail_message.matched_orders.add(order)
                mail_message.related_order_id = order.id
                # Pažymėti kaip rankiniu būdu priskirtą (apsauga nuo OCR)
                mail_message.manually_assigned = True
                mail_message.save(update_fields=['related_order_id', 'manually_assigned'])
                matched_order = order
            except Order.DoesNotExist:
                return Response(
                    {'error': f'Užsakymas su ID "{order_id}" nerastas'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # Senas būdas - backward compatibility
            order_number = request.data.get('order_number', '').strip()
            expedition_number = request.data.get('expedition_number', '').strip()

            if not order_number and not expedition_number:
                return Response(
                    {'error': 'Reikia nurodyti užsakymo ID arba užsakymo numerį arba ekspedicijos numerį'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            matched_order = None

            # Rasti užsakymą pagal numerį
            if order_number:
                try:
                    order = Order.objects.get(order_number__iexact=order_number)
                    mail_message.related_order_id = order.id
                    mail_message.save(update_fields=['related_order_id'])
                    mail_message.matched_orders.add(order)
                    matched_order = order
                except Order.DoesNotExist:
                    return Response(
                        {'error': f'Užsakymas su numeriu "{order_number}" nerastas'},
                        status=status.HTTP_404_NOT_FOUND
                    )
                except Order.MultipleObjectsReturned:
                    return Response(
                        {'error': f'Rasti keli užsakymai su numeriu "{order_number}"'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Rasti ekspediciją pagal numerį ir priskirti jos užsakymą
            if expedition_number:
                try:
                    carrier = OrderCarrier.objects.get(expedition_number__iexact=expedition_number)
                    if carrier.order:
                        mail_message.related_order_id = carrier.order.id
                        mail_message.save(update_fields=['related_order_id'])
                        mail_message.matched_orders.add(carrier.order)
                        matched_order = carrier.order
                    else:
                        return Response(
                            {'error': f'Ekspedicija "{expedition_number}" neturi susijusio užsakymo'},
                            status=status.HTTP_400_BAD_REQUEST
                        )
                    mail_message.matched_expeditions.add(carrier)
                except OrderCarrier.DoesNotExist:
                    return Response(
                        {'error': f'Ekspedicija su numeriu "{expedition_number}" nerasta'},
                        status=status.HTTP_404_NOT_FOUND
                    )
                except OrderCarrier.MultipleObjectsReturned:
                    return Response(
                        {'error': f'Rastos kelios ekspedicijos su numeriu "{expedition_number}"'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

        # Pridėti sender email prie kliento kontaktų
        if matched_order:
            self._add_sender_email_to_client(mail_message, matched_order)

        # Atnaujinti statusą į 'linked', jei dar nėra
        if mail_message.status == 'new':
            mail_message.status = 'linked'
            mail_message.save(update_fields=['status'])

        return Response(self.get_serializer(mail_message).data)


class MailSenderViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.filter(
        Q(is_trusted=True) | Q(is_advertising=True)
    ).order_by('email')
    serializer_class = MailSenderSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['email', 'first_name', 'last_name']
    ordering = ['email']

    def _apply_sender_policies(self, sender: Contact):
        messages_qs = MailMessage.objects.filter(sender_email__iexact=sender.email)
        if sender.is_advertising:
            messages_qs.delete()
        elif sender.is_trusted:
            messages_qs.update(is_promotional=False)

    def perform_create(self, serializer):
        sender = serializer.save()
        self._apply_sender_policies(sender)

    def perform_update(self, serializer):
        sender = serializer.save()
        self._apply_sender_policies(sender)

    @action(detail=True, methods=['post'])
    def trust(self, request, pk=None):
        sender = self.get_object()
        sender.is_trusted = True
        sender.is_advertising = False
        sender.save(update_fields=['is_trusted', 'is_advertising'])
        self._apply_sender_policies(sender)
        return Response(self.get_serializer(sender).data)

    @action(detail=True, methods=['post'])
    def advertising(self, request, pk=None):
        sender = self.get_object()
        sender.is_advertising = True
        sender.is_trusted = False
        sender.save(update_fields=['is_advertising', 'is_trusted'])
        self._apply_sender_policies(sender)
        return Response(self.get_serializer(sender).data)

    def perform_destroy(self, instance):
        # Prieš ištrinant siuntėją, pašaliname VISUS susietus laiškus
        MailMessage.objects.filter(sender_email__iexact=instance.email).delete()
        super().perform_destroy(instance)


class MailAttachmentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MailAttachment.objects.select_related('mail_message')
    serializer_class = MailAttachmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        message_id = self.request.query_params.get('mail_message')
        if message_id:
            qs = qs.filter(mail_message_id=message_id)
        return qs

    @action(detail=True, methods=['get'], url_path='download')
    def download(self, request, pk=None):
        attachment = self.get_object()
        file_field = attachment.file
        if not file_field:
            raise Http404('Attachment file nerastas.')

        content_type = attachment.content_type or mimetypes.guess_type(attachment.filename or '')[0] or 'application/octet-stream'

        try:
            file_field.open('rb')
        except FileNotFoundError:
            return Response({'detail': 'Priedo failas nerastas serveryje.'}, status=status.HTTP_404_NOT_FOUND)

        response = FileResponse(file_field, content_type=content_type)
        filename = attachment.filename or file_field.name
        if filename:
            response['Content-Disposition'] = f'inline; filename="{filename}"'
        try:
            response['Content-Length'] = file_field.size
        except (AttributeError, OSError):
            pass
        return response

    @action(detail=True, methods=['get'], url_path='check-purchase-invoice')
    def check_purchase_invoice(self, request, pk=None):
        """
        Patikrina, ar priedas jau yra naudojamas kaip purchase invoice file.
        Grąžina purchase invoice informaciją, jei rastas.
        """
        from apps.invoices.models import PurchaseInvoice
        import os
        
        attachment = self.get_object()
        
        if not attachment.file:
            return Response({
                'has_invoice': False,
                'invoice': None
            })
        
        try:
            # Patikrinti pagal failo kelio palyginimą
            attachment_path = attachment.file.path
            attachment_filename = os.path.basename(attachment_path)
            
            # Rasti purchase invoices, kurie turi tą patį failą
            purchase_invoices = PurchaseInvoice.objects.filter(
                invoice_file__isnull=False
            ).exclude(invoice_file='')
            
            found_invoice = None
            for invoice in purchase_invoices:
                if invoice.invoice_file:
                    try:
                        invoice_path = invoice.invoice_file.path
                        invoice_filename = os.path.basename(invoice_path)
                        # Palyginti failų pavadinimus arba kelius
                        if attachment_filename == invoice_filename or attachment_path == invoice_path:
                            found_invoice = invoice
                            break
                    except (ValueError, AttributeError):
                        continue
            
            if found_invoice:
                return Response({
                    'has_invoice': True,
                    'invoice': {
                        'id': found_invoice.id,
                        'received_invoice_number': found_invoice.received_invoice_number,
                        'partner_name': found_invoice.partner.name if found_invoice.partner else None,
                        'amount_net': str(found_invoice.amount_net),
                        'issue_date': found_invoice.issue_date.isoformat() if found_invoice.issue_date else None,
                    }
                })
            
            # Taip pat patikrinti pagal filename (jei failo pavadinimas atitinka)
            filename_match = PurchaseInvoice.objects.filter(
                invoice_file__isnull=False
            ).exclude(invoice_file='').filter(
                invoice_file__icontains=attachment.filename
            ).first()
            
            if filename_match:
                return Response({
                    'has_invoice': True,
                    'invoice': {
                        'id': filename_match.id,
                        'received_invoice_number': filename_match.received_invoice_number,
                        'partner_name': filename_match.partner.name if filename_match.partner else None,
                        'amount_net': str(filename_match.amount_net),
                        'issue_date': filename_match.issue_date.isoformat() if filename_match.issue_date else None,
                    }
                })
            
            return Response({
                'has_invoice': False,
                'invoice': None
            })
        except Exception as e:
            logger.error(f'Klaida tikrinant purchase invoice priedui {attachment.id}: {e}', exc_info=True)
            return Response({
                'has_invoice': False,
                'invoice': None,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MailTagViewSet(viewsets.ModelViewSet):
    queryset = MailTag.objects.all()
    serializer_class = MailTagSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering = ['name']


class MailSyncStateViewSet(viewsets.ModelViewSet):
    queryset = MailSyncState.objects.all()
    serializer_class = MailSyncStateSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'put', 'patch', 'delete']

    def get_queryset(self):
        qs = super().get_queryset()
        folder = self.request.query_params.get('folder')
        if folder:
            qs = qs.filter(folder=folder)
        return qs


class EmailLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EmailLog.objects.select_related('sent_by').all()
    serializer_class = EmailLogSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = EmailLogPageNumberPagination
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['email_type', 'status', 'related_order_id', 'related_invoice_id', 'related_expedition_id', 'related_partner_id']
    search_fields = ['subject', 'recipient_email', 'recipient_name']
    ordering_fields = ['created_at', 'sent_at']
    ordering = ['-created_at']
    
    @action(detail=False, methods=['get'], url_path='recent-failed')
    def recent_failed(self, request):
        """Grąžina paskutinius nepavykusius el. laiškų siuntimus (be autentifikacijos, tik debug)"""
        failed_logs = EmailLog.objects.filter(status='failed').order_by('-created_at')[:10]
        results = []
        for log in failed_logs:
            results.append({
                'id': log.id,
                'email_type': log.email_type,
                'subject': log.subject,
                'recipient_email': log.recipient_email,
                'recipient_email_len': len(log.recipient_email) if log.recipient_email else 0,
                'recipient_email_repr': repr(log.recipient_email),
                'error_message': log.error_message,
                'created_at': log.created_at.isoformat() if log.created_at else None,
                'related_invoice_id': log.related_invoice_id,
                'related_partner_id': log.related_partner_id,
            })
        return Response({'results': results, 'count': len(results)})
    
    @action(detail=False, methods=['get'], url_path='statistics')
    def statistics(self, request):
        """Grąžina el. laiškų statistiką"""
        from django.db.models import Count, Q
        from django.utils import timezone
        from datetime import timedelta
        
        now = timezone.now()
        today = now.date()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)
        
        # Bendra statistika
        total = EmailLog.objects.count()
        sent = EmailLog.objects.filter(status='sent').count()
        failed = EmailLog.objects.filter(status='failed').count()
        pending = EmailLog.objects.filter(status='pending').count()
        
        # Pagal tipą
        by_type = EmailLog.objects.values('email_type').annotate(
            count=Count('id')
        ).order_by('-count')
        
        # Pagal dieną (paskutinės 30 dienų)
        by_day = EmailLog.objects.filter(
            created_at__gte=month_ago
        ).extra(
            select={'day': 'DATE(created_at)'}
        ).values('day').annotate(
            count=Count('id')
        ).order_by('day')
        
        # Paskutinės 7 dienos
        last_7_days = EmailLog.objects.filter(
            created_at__gte=week_ago
        ).count()
        
        # Paskutinės 24 valandos
        last_24h = EmailLog.objects.filter(
            created_at__gte=now - timedelta(hours=24)
        ).count()
        
        return Response({
            'total': total,
            'sent': sent,
            'failed': failed,
            'pending': pending,
            'by_type': list(by_type),
            'by_day': list(by_day),
            'last_7_days': last_7_days,
            'last_24h': last_24h,
        })
    
    @action(detail=False, methods=['post'], url_path='process-bounces')
    def process_bounces(self, request):
        """
        Rankiniu būdu apdoroja bounce laiškus ir susieja juos su EmailLog.
        POST /api/mail/email-logs/process-bounces/
        """
        try:
            result = process_bounce_emails()
            return Response({
                'status': 'ok',
                'processed': result['processed'],
                'total_checked': result['total_checked'],
                'message': f'Apdoroti {result["processed"]} bounce laiškai iš {result["total_checked"]} patikrintų'
            })
        except Exception as e:
            logger.error(f'Klaida apdorojant bounce laiškus: {e}', exc_info=True)
            return Response({
                'status': 'error',
                'message': f'Klaida: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

