import re
import logging
from datetime import timedelta
from typing import Iterable, List, Sequence, Set

from django.db import transaction
from django.db.models.functions import Upper
from django.utils import timezone

from .models import MailMessage

logger = logging.getLogger(__name__)

CANDIDATE_PATTERN = re.compile(r'[A-Z0-9][A-Z0-9\-/]{2,}')


def _normalize_candidate(value: str) -> str:
    return (value or '').strip().upper()


def _extract_pdf_text(attachment) -> str:
    """
    Ištraukia tekstą iš PDF priedo naudojant hibridinį metodą.
    Pirmiausia bando pdfplumber, jei nepavyksta - naudoja OCR.
    Grąžina tuščią eilutę, jei nepavyko arba failas nėra PDF.
    """
    if not attachment.file:
        return ''

    filename = (attachment.filename or '').lower()
    content_type = (attachment.content_type or '').lower()

    # Patikrinti ar tai PDF failas
    if not (filename.endswith('.pdf') or 'pdf' in content_type):
        return ''

    try:
        # HIBRIDINIS METODAS: pdfplumber + OCR fallback

        # 1. Pirmiausia bandome pdfplumber (tekstiniams PDF)
        text_parts = []
        pdf_text_found = False

        try:
            import pdfplumber

            if attachment.file.storage.exists(attachment.file.name):
                with attachment.file.open('rb') as pdf_file:
                    with pdfplumber.open(pdf_file) as pdf:
                        for page in pdf.pages:
                            try:
                                page_text = page.extract_text()
                                if page_text and page_text.strip():
                                    text_parts.append(page_text.strip())
                                    pdf_text_found = True
                            except Exception as e:
                                logger.warning(f"pdfplumber klaida puslapyje (attachment {attachment.id}): {e}")
                                continue
        except ImportError:
            logger.warning("pdfplumber biblioteka neįdiegta - praleidžiame tekstinį PDF apdorojimą")

        # Jei radome tekstą su pdfplumber - grąžiname jį
        if pdf_text_found and text_parts:
            logger.info(f"Sėkmingai ištrauktas tekstas iš PDF naudodamas pdfplumber (attachment {attachment.id})")
            return ' '.join(text_parts)

        # 2. Jei pdfplumber nerado teksto arba neįdiegtas - bandome OCR
        logger.info(f"PDF neturi ištraukiamo teksto arba pdfplumber nepavyko - bandome OCR (attachment {attachment.id})")

        try:
            import pytesseract
            from pdf2image import convert_from_bytes
            import tempfile
            import os

            # Patikrinti ar OCR įrankis įdiegtas
            try:
                pytesseract.get_tesseract_version()
            except Exception as e:
                logger.warning(f"Tesseract OCR neįdiegtas arba neveikia: {e}")
                return ''

            if attachment.file.storage.exists(attachment.file.name):
                with attachment.file.open('rb') as pdf_file:
                    pdf_bytes = pdf_file.read()

                    # Konvertuoti PDF į paveikslėlius
                    try:
                        images = convert_from_bytes(pdf_bytes, dpi=300, fmt='PNG')

                        ocr_texts = []
                        for i, image in enumerate(images[:5]):  # Apdorojame tik pirmus 5 puslapius
                            try:
                                # OCR su lietuvių kalba
                                text = pytesseract.image_to_string(image, lang='lit+eng')
                                if text and text.strip():
                                    ocr_texts.append(text.strip())
                            except Exception as e:
                                logger.warning(f"OCR klaida puslapyje {i+1} (attachment {attachment.id}): {e}")
                                continue

                        if ocr_texts:
                            final_text = ' '.join(ocr_texts)
                            logger.info(f"Sėkmingai ištrauktas tekstas iš PDF naudodamas OCR (attachment {attachment.id})")
                            return final_text

                    except Exception as e:
                        logger.warning(f"PDF konvertavimo į paveikslėlius klaida (attachment {attachment.id}): {e}")

        except ImportError as e:
            logger.warning(f"OCR bibliotekos neįdiegtos: {e}")

        # 3. Fallback į seną PyPDF2 metodą (jei viskas nepavyko)
        try:
            import PyPDF2

            if attachment.file.storage.exists(attachment.file.name):
                with attachment.file.open('rb') as pdf_file:
                    pdf_reader = PyPDF2.PdfReader(pdf_file)
                    fallback_texts = []

                    for page_num, page in enumerate(pdf_reader.pages[:3]):  # Tik pirmi 3 puslapiai
                        try:
                            page_text = page.extract_text()
                            if page_text and page_text.strip():
                                fallback_texts.append(page_text.strip())
                        except Exception as e:
                            logger.warning(f"PyPDF2 klaida puslapyje {page_num + 1} (attachment {attachment.id}): {e}")
                            continue

                    if fallback_texts:
                        logger.info(f"Ištrauktas tekstas naudodamas PyPDF2 fallback (attachment {attachment.id})")
                        return ' '.join(fallback_texts)

        except ImportError:
            logger.warning("PyPDF2 biblioteka neįdiegta")
        except Exception as e:
            logger.warning(f"PyPDF2 fallback klaida (attachment {attachment.id}): {e}")

        # Jei niekas nepavyko
        logger.warning(f"Nepavyko ištraukti teksto iš PDF failo {attachment.filename} (ID: {attachment.id}) jokiu metodu")
        return ''

    except Exception as e:
        logger.error(f"Kritinė klaida apdorojant PDF failą {attachment.filename} (ID: {attachment.id}): {e}")
        return ''


def _collect_text_chunks(message: MailMessage) -> List[str]:
    chunks = [
        message.subject or '',
        message.sender or '',
        message.recipients or '',
        message.cc or '',
        message.bcc or '',
        message.snippet or '',
        message.body_plain or '',
    ]
    if message.body_html:
        # Paprastas HTML išvalymas – pašaliname tag'us
        stripped = re.sub(r'<[^>]+>', ' ', message.body_html)
        chunks.append(stripped)
    for attachment in message.attachments.all():
        if attachment.filename:
            chunks.append(attachment.filename)
            # Naudoti išsaugotą OCR tekstą, jei yra (po OCR); kitaip ištraukti iš PDF
            if getattr(attachment, 'ocr_text', None) and (attachment.ocr_text or '').strip():
                chunks.append(attachment.ocr_text.strip())
            else:
                pdf_text = _extract_pdf_text(attachment)
                if pdf_text:
                    chunks.append(pdf_text)
                    # OCR APODOROJIMAS: Ištraukti sąskaitos duomenis (tik kai dar nėra ocr_text)
                    try:
                        from apps.invoices.ocr_utils import process_pdf_attachment
                        ocr_result = process_pdf_attachment(attachment)

                        if ocr_result['success']:
                            # Pridėti OCR duomenis į chunks
                            data = ocr_result['extracted_data']

                            if data.get('invoice_number'):
                                chunks.append(f"Sąskaitos nr: {data['invoice_number']}")
                            if data.get('order_number'):
                                chunks.append(f"Užsakymo nr: {data['order_number']}")
                            if data.get('expedition_number'):
                                chunks.append(f"Ekspedicijos nr: {data['expedition_number']}")
                            if data.get('amounts'):
                                chunks.append(f"Sumos: {', '.join(data['amounts'])}")
                            if data.get('dates'):
                                chunks.append(f"Datos: {', '.join(data['dates'])}")

                            # Išsaugoti OCR rezultatus į žinutės metadata
                            if not hasattr(message, 'ocr_results'):
                                message.ocr_results = {}
                            message.ocr_results[attachment.id] = ocr_result

                            logger.info(f"OCR duomenys ištraukti iš priedo {attachment.filename}: {data}")

                    except Exception as e:
                        logger.warning(f"OCR apdorojimo klaida priede {attachment.filename}: {e}")
    return chunks


def extract_candidates(chunks: Iterable[str]) -> Set[str]:
    candidates: Set[str] = set()
    for chunk in chunks:
        if not chunk:
            continue
        for match in CANDIDATE_PATTERN.findall(chunk.upper()):
            normalized = _normalize_candidate(match)
            if len(normalized) >= 3:
                candidates.add(normalized)
                # Jei kandidatas turi skyriklių (/ arba -), išskaidyti į atskirus kandidatus
                if '/' in normalized or '-' in normalized:
                    parts = re.split(r'[/\-]', normalized)
                    for part in parts:
                        part = part.strip()
                        if len(part) >= 3 and re.match(r'^[A-Z0-9\-]+$', part):
                            candidates.add(part)
    return candidates


def _match_orders(candidates: Sequence[str]):
    from apps.orders.models import Order

    if not candidates:
        return Order.objects.none()
    return (
        Order.objects.annotate(order_number_upper=Upper('order_number'))
        .filter(order_number_upper__in=candidates)
    )


def _match_expeditions(candidates: Sequence[str]):
    from apps.orders.models import OrderCarrier

    if not candidates:
        return OrderCarrier.objects.none()
    return (
        OrderCarrier.objects.annotate(expedition_number_upper=Upper('expedition_number'))
        .filter(expedition_number_upper__in=candidates)
    )


def _match_sales_invoices(candidates: Sequence[str]):
    from apps.invoices.models import SalesInvoice

    if not candidates:
        return SalesInvoice.objects.none()
    return (
        SalesInvoice.objects.annotate(invoice_number_upper=Upper('invoice_number'))
        .filter(invoice_number_upper__in=candidates)
    )


def _match_purchase_invoices(candidates: Sequence[str]):
    from apps.invoices.models import PurchaseInvoice

    if not candidates:
        return PurchaseInvoice.objects.none()
    return (
        PurchaseInvoice.objects.annotate(received_invoice_number_upper=Upper('received_invoice_number'))
        .filter(received_invoice_number_upper__in=candidates)
    )


def update_message_matches(message: MailMessage) -> None:
    """
    Atnaujina MailMessage matched_* laukus pagal turinį.
    Naudojama tiek IMAP sinchronizacijos metu, tiek signalams.
    """
    chunks = _collect_text_chunks(message)
    candidates = sorted(extract_candidates(chunks))

    orders = list(_match_orders(candidates))
    expeditions = list(_match_expeditions(candidates))
    sales_invoices = list(_match_sales_invoices(candidates))
    purchase_invoices = list(_match_purchase_invoices(candidates))

    # Jei turime related_order_id, bet helperis nerado jo tekste - pridėti jį
    if message.related_order_id and message.related_order_id not in [o.id for o in orders]:
        try:
            from apps.orders.models import Order
            related_order = Order.objects.get(id=message.related_order_id)
            orders.append(related_order)
        except Order.DoesNotExist:
            # Užsakymas neegzistuoja - išvalyti related_order_id
            message.related_order_id = None
            message.save(update_fields=['related_order_id'])

    with transaction.atomic():
        message.matched_orders.set(orders)
        message.matched_expeditions.set(expeditions)
        message.matched_sales_invoices.set(sales_invoices)
        message.matched_purchase_invoices.set(purchase_invoices)

        # Pažymėti, kad sutapimai jau apskaičiuoti – sąrašuose nebepildome teksto skenavimo
        message.matches_computed_at = timezone.now()
        fields_to_update = ['matches_computed_at']

        # Jei dar neturime priskirto užsakymo, o radome aiškų kandidatą – pasižymime
        if orders and not message.related_order_id:
            message.related_order_id = orders[0].id
            fields_to_update.append('related_order_id')
            if message.status == MailMessage.Status.NEW:
                message.status = MailMessage.Status.LINKED
                fields_to_update.append('status')
            message.save(update_fields=fields_to_update)
        elif message.status == MailMessage.Status.NEW and (orders or expeditions or sales_invoices or purchase_invoices):
            message.status = MailMessage.Status.LINKED
            fields_to_update.append('status')
            message.save(update_fields=fields_to_update)
        else:
            message.save(update_fields=fields_to_update)


def update_matches_for_order(order_id: int) -> None:
    """
    Iškviečiama po Order sukurimo: bando surasti laiškus, kuriuose galėtų būti šis numeris.
    """
    from apps.orders.models import Order
    from django.db.models import Q
    from django.utils import timezone

    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return

    order_number = _normalize_candidate(order.order_number or '')
    if not order_number:
        return

    recent_threshold = timezone.now() - timedelta(days=7)
    candidates = MailMessage.objects.filter(
        created_at__gte=recent_threshold,
    ).exclude(
        matched_orders=order,
    ).filter(
        Q(subject__icontains=order.order_number) |
        Q(snippet__icontains=order.order_number) |
        Q(body_plain__icontains=order.order_number) |
        Q(body_html__icontains=order.order_number)
    ).prefetch_related('attachments')[:200]

    for message in candidates:
        update_message_matches(message)


def update_matches_for_expedition(expedition_id: int) -> None:
    """
    Iškviečiama po OrderCarrier sukurimo ar atnaujinimo.
    """
    from apps.orders.models import OrderCarrier
    from django.db.models import Q
    from django.utils import timezone

    try:
        carrier = OrderCarrier.objects.select_related('order').get(id=expedition_id)
    except OrderCarrier.DoesNotExist:
        return

    expedition_number = _normalize_candidate(carrier.expedition_number or '')
    if not expedition_number:
        return

    recent_threshold = timezone.now() - timedelta(days=7)
    candidates = MailMessage.objects.filter(
        created_at__gte=recent_threshold,
    ).exclude(
        matched_expeditions=carrier,
    ).filter(
        Q(subject__icontains=carrier.expedition_number) |
        Q(snippet__icontains=carrier.expedition_number) |
        Q(body_plain__icontains=carrier.expedition_number) |
        Q(body_html__icontains=carrier.expedition_number)
    ).prefetch_related('attachments')[:200]

    for message in candidates:
        update_message_matches(message)

