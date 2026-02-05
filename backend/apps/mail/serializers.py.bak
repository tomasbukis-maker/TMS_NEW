from rest_framework import serializers
from rest_framework.reverse import reverse
import re
from email.header import decode_header
from email.utils import getaddresses
from django.conf import settings

from apps.orders.models import Order
from apps.invoices.models import SalesInvoice, PurchaseInvoice
from apps.partners.models import Contact

from .models import MailAttachment, MailMessage, MailMessageTag, MailSender, MailSyncState, MailTag, EmailLog


def decode_mime_words(value: str) -> str:
    try:
        decoded = decode_header(value)
        return ''.join(
            part.decode(enc or 'utf-8', errors='replace') if isinstance(part, bytes) else part
            for part, enc in decoded
        )
    except Exception:
        return value


def decode_address_list(value: str) -> str:
    if not value:
        return ''
    try:
        addresses = getaddresses([value])
        formatted = []
        for name, addr in addresses:
            name_decoded = decode_mime_words(name) if name else ''
            addr_clean = (addr or '').strip()
            if not addr_clean:
                continue
            if name_decoded:
                formatted.append(f"{name_decoded} <{addr_clean}>")
            else:
                formatted.append(addr_clean)
        return ', '.join(formatted)
    except Exception:
        return value


class MailAttachmentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    has_purchase_invoice = serializers.SerializerMethodField()
    purchase_invoice_info = serializers.SerializerMethodField()

    class Meta:
        model = MailAttachment
        fields = [
            'id',
            'filename',
            'content_type',
            'size',
            'file',
            'download_url',
            'metadata',
            'created_at',
            'has_purchase_invoice',
            'purchase_invoice_info',
        ]
        read_only_fields = fields

    def get_download_url(self, obj: MailAttachment) -> str:
        request = self.context.get('request')
        if request:
            return reverse('mail-attachment-download', args=[obj.pk], request=request)
        base = getattr(settings, 'FRONTEND_BASE_URL', None)
        if base:
            return f"{base.rstrip('/')}/api/mail/attachments/{obj.pk}/download/"
        return f"/api/mail/attachments/{obj.pk}/download/"

    def get_has_purchase_invoice(self, obj: MailAttachment) -> bool:
        """Patikrina, ar priedas jau yra naudojamas kaip purchase invoice file.
        Naudoja related_purchase_invoice ForeignKey, kad išvengtų papildomų užklausų.
        """
        # Jei turime tiesioginį ryšį per ForeignKey, naudoti jį (be papildomų užklausų)
        # Patikrinti ar related_purchase_invoice_id yra nustatytas (ne None)
        if hasattr(obj, 'related_purchase_invoice_id'):
            return obj.related_purchase_invoice_id is not None
        # Fallback - patikrinti ar related_purchase_invoice objektas egzistuoja
        if hasattr(obj, 'related_purchase_invoice'):
            return obj.related_purchase_invoice is not None
        return False

    def get_purchase_invoice_info(self, obj: MailAttachment) -> dict | None:
        """Grąžina purchase invoice informaciją, jei priedas jau susietas.
        Naudoja related_purchase_invoice ForeignKey su select_related, kad išvengtų papildomų užklausų.
        """
        # Jei turime tiesioginį ryšį per ForeignKey, naudoti jį (be papildomų užklausų)
        if hasattr(obj, 'related_purchase_invoice') and obj.related_purchase_invoice:
            invoice = obj.related_purchase_invoice
            return {
                'id': invoice.id,
                'received_invoice_number': invoice.received_invoice_number,
                'partner_name': invoice.partner.name if invoice.partner else None,
                'amount_net': str(invoice.amount_net),
                'issue_date': invoice.issue_date.isoformat() if invoice.issue_date else None,
            }
        return None


class MailTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailTag
        fields = ['id', 'name', 'color', 'description', 'created_at']
        read_only_fields = ['id', 'created_at']


class MailMessageTagSerializer(serializers.ModelSerializer):
    tag = MailTagSerializer(read_only=True)
    tag_id = serializers.PrimaryKeyRelatedField(
        queryset=MailTag.objects.all(), source='tag', write_only=True
    )

    class Meta:
        model = MailMessageTag
        fields = ['id', 'tag', 'tag_id', 'applied_at']
        read_only_fields = ['id', 'tag', 'applied_at']


class MailSenderSerializer(serializers.ModelSerializer):
    # Suderiname su senu MailSender formatu
    name = serializers.SerializerMethodField()

    def get_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.email

    class Meta:
        model = Contact
        fields = [
            'id',
            'email',
            'name',
            'is_trusted',
            'is_advertising',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class MailMessageSerializer(serializers.ModelSerializer):
    attachments = MailAttachmentSerializer(many=True, read_only=True)
    tags = MailMessageTagSerializer(source='message_tags', many=True, read_only=True)
    matches = serializers.SerializerMethodField(read_only=True)
    ocr_results = serializers.SerializerMethodField(read_only=True)
    matched_sales_invoices = serializers.SerializerMethodField(read_only=True)
    matched_purchase_invoices = serializers.SerializerMethodField(read_only=True)
    sender_display = serializers.SerializerMethodField(read_only=True)
    recipients_display = serializers.SerializerMethodField(read_only=True)
    cc_display = serializers.SerializerMethodField(read_only=True)
    bcc_display = serializers.SerializerMethodField(read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    sender_email = serializers.CharField(read_only=True)
    sender_status = serializers.CharField(read_only=True)
    sender_record = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MailMessage
        fields = [
            'id',
            'uid',
            'message_id',
            'subject',
            'sender',
            'sender_email',
            'sender_status',
            'sender_record',
            'recipients',
            'cc',
            'bcc',
            'date',
            'folder',
            'status',
            'status_display',
            'flags',
            'snippet',
            'body_plain',
            'body_html',
            'metadata',
            'related_order_id',
            'related_partner_id',
            'assigned_to_id',
            'attachments',
            'tags',
            'matches',
            'ocr_results',
            'matched_sales_invoices',
            'matched_purchase_invoices',
            'sender_display',
            'recipients_display',
            'cc_display',
            'bcc_display',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
            'attachments',
            'tags',
            'uid',
            'message_id',
            'flags',
            'metadata',
            'status_display',
            'sender_email',
            'sender_status',
            'sender_record',
        ]

    @staticmethod
    def _strip_html(value: str) -> str:
        return re.sub(r'<[^>]+>', ' ', value)

    def get_matches(self, obj: MailMessage):
        # Naudoti prefetched duomenis tiesiogiai, ne values_list() (kuris gali sukelti papildomas užklausas)
        orders = sorted({
            (order.order_number or '').strip()
            for order in obj.matched_orders.all()
            if order.order_number
        })
        sales_invoices = sorted({
            (inv.invoice_number or '').strip()
            for inv in obj.matched_sales_invoices.all()
            if inv.invoice_number
        })
        purchase_invoices = sorted({
            (inv.received_invoice_number or '').strip()
            for inv in obj.matched_purchase_invoices.all()
            if inv.received_invoice_number
        })
        expeditions = sorted({
            (exp.expedition_number or '').strip()
            for exp in obj.matched_expeditions.all()
            if exp.expedition_number
        })

        if orders or sales_invoices or purchase_invoices or expeditions:
            return {
                'orders': orders,
                'sales_invoices': sales_invoices,
                'purchase_invoices': purchase_invoices,
                'expeditions': expeditions,
            }

        # Fallback senesniems duomenims, kurie dar neturi išankstinių atitikčių
        context = self.context or {}
        order_numbers = context.get('order_numbers')
        sales_numbers = context.get('sales_invoice_numbers')
        purchase_numbers = context.get('purchase_invoice_numbers')
        expedition_numbers = context.get('expedition_numbers')

        if order_numbers is None:
            if not hasattr(self, '_order_numbers_cache'):
                self._order_numbers_cache = set(
                    (value or '').upper()
                    for value in Order.objects.exclude(order_number__isnull=True).values_list('order_number', flat=True)
                    if value
                )
            order_numbers = self._order_numbers_cache
        if sales_numbers is None:
            if not hasattr(self, '_sales_invoice_numbers_cache'):
                self._sales_invoice_numbers_cache = set(
                    (value or '').upper()
                    for value in SalesInvoice.objects.exclude(invoice_number__isnull=True).values_list('invoice_number', flat=True)
                    if value
                )
            sales_numbers = self._sales_invoice_numbers_cache
        if purchase_numbers is None:
            if not hasattr(self, '_purchase_invoice_numbers_cache'):
                self._purchase_invoice_numbers_cache = set(
                    (value or '').upper()
                    for value in PurchaseInvoice.objects.exclude(received_invoice_number__isnull=True).values_list('received_invoice_number', flat=True)
                    if value
                )
            purchase_numbers = self._purchase_invoice_numbers_cache
        if expedition_numbers is None:
            if not hasattr(self, '_expedition_numbers_cache'):
                from apps.orders.models import OrderCarrier
                self._expedition_numbers_cache = set(
                    (value or '').upper()
                    for value in OrderCarrier.objects.exclude(expedition_number__isnull=True).exclude(expedition_number='').values_list('expedition_number', flat=True)
                    if value
                )
            expedition_numbers = self._expedition_numbers_cache

        pieces = [
            obj.subject or '',
            obj.sender or '',
            obj.recipients or '',
            obj.cc or '',
            obj.bcc or '',
            obj.snippet or '',
            obj.body_plain or '',
        ]
        if obj.body_html:
            pieces.append(self._strip_html(obj.body_html))
        # Naudoti prefetched attachments tiesiogiai
        attachments_list = list(obj.attachments.all())
        if attachments_list:
            pieces.extend(att.filename or '' for att in attachments_list)

        combined = ' '.join(pieces)
        normalized = combined.upper()
        candidates = set(re.findall(r'[A-Z0-9][A-Z0-9\-/]{2,}', normalized))

        matched_orders = sorted(s for s in candidates if s in order_numbers)
        matched_sales = sorted(s for s in candidates if s in sales_numbers)
        matched_purchase = sorted(s for s in candidates if s in purchase_numbers)
        matched_expeditions = sorted(s for s in candidates if s in expedition_numbers)

        if not (matched_orders or matched_sales or matched_purchase or matched_expeditions):
            return None

        return {
            'orders': matched_orders,
            'sales_invoices': matched_sales,
            'purchase_invoices': matched_purchase,
            'expeditions': matched_expeditions,
        }

    def get_sender_display(self, obj: MailMessage) -> str:
        # Pirmiausia bandome rasti siuntėją pagal email tarp kontaktų
        sender_email = obj.sender_email or obj.sender
        if sender_email:
            try:
                contact = Contact.objects.filter(email__iexact=sender_email).first()
                if contact and (contact.first_name or contact.last_name):
                    # Jei turime kontaktą su vardu, jį naudojame
                    name = f"{contact.first_name} {contact.last_name}".strip()
                    return f"{name} <{sender_email}>"
            except Exception:
                pass
        # Fallback į originalų formatą
        return decode_address_list(obj.sender or '')

    def get_ocr_results(self, obj: MailMessage) -> dict:
        """Grąžina OCR rezultatus iš PDF priedų."""
        results = {}
        for attachment in obj.attachments.filter(filename__endswith='.pdf'):
            try:
                from apps.invoices.ocr_utils import process_pdf_attachment
                ocr_result = process_pdf_attachment(attachment)
                if ocr_result['success']:
                    results[attachment.filename] = {
                        'document_type': ocr_result.get('document_type'),
                        'extracted_data': ocr_result['extracted_data']
                    }
            except Exception as e:
                results[attachment.filename] = {'error': str(e)}
        return results

    def get_matched_sales_invoices(self, obj: MailMessage):
        """Grąžina susietas pardavimo sąskaitas."""
        return [{
            'id': invoice.id,
            'invoice_number': invoice.invoice_number,
            'partner': {'name': invoice.partner.name},
            'amount_total': str(invoice.amount_total)
        } for invoice in obj.matched_sales_invoices.all()]

    def get_matched_purchase_invoices(self, obj: MailMessage):
        """Grąžina susietas pirkimo sąskaitas."""
        return [{
            'id': invoice.id,
            'received_invoice_number': invoice.received_invoice_number,
            'partner': {'name': invoice.partner.name},
            'amount_total': str(invoice.amount_total)
        } for invoice in obj.matched_purchase_invoices.all()]

    def get_recipients_display(self, obj: MailMessage) -> str:
        return decode_address_list(obj.recipients or '')

    def get_cc_display(self, obj: MailMessage) -> str:
        return decode_address_list(obj.cc or '')

    def get_bcc_display(self, obj: MailMessage) -> str:
        return decode_address_list(obj.bcc or '')

    def get_sender_record(self, obj: MailMessage):
        # Dabar sender_record property pats naudoja cached versiją
        sender = obj.sender_record
        if not sender:
            return None

        # Jei tai cached versija (dict), grąžiname ją
        if isinstance(sender, dict):
            return sender

        # Jei tai Contact objektas, formatuojame
        name = f"{sender.first_name} {sender.last_name}".strip()
        if not name:
            name = sender.email  # Fallback į email

        return {
            'id': sender.id,
            'email': sender.email,
            'name': name,
            'is_trusted': sender.is_trusted,
            'is_advertising': sender.is_advertising,
        }


class MailSyncStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MailSyncState
        fields = [
            'id',
            'folder',
            'last_synced_at',
            'last_uid',
            'status',
            'message',
            'metadata',
            'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']


class EmailLogSerializer(serializers.ModelSerializer):
    email_type_display = serializers.CharField(source='get_email_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    sent_by_username = serializers.CharField(source='sent_by.username', read_only=True)
    
    class Meta:
        model = EmailLog
        fields = [
            'id',
            'email_type',
            'email_type_display',
            'subject',
            'recipient_email',
            'recipient_name',
            'related_order_id',
            'related_invoice_id',
            'related_expedition_id',
            'related_partner_id',
            'status',
            'status_display',
            'sent_at',
            'error_message',
            'body_text',
            'body_html',
            'metadata',
            'sent_by',
            'sent_by_username',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'email_type_display',
            'status_display',
            'sent_by_username',
            'created_at',
            'updated_at',
        ]

