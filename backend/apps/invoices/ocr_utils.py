"""
OCR utilities sąskaitų duomenų ištraukimui iš PDF tekstų.
"""
import re
import logging
from typing import Dict, List, Optional, Tuple
from decimal import Decimal, InvalidOperation
from datetime import datetime

logger = logging.getLogger(__name__)


class InvoiceDataExtractor:
    """
    Sąskaitų duomenų ištraukimo iš OCR teksto utilitas.
    """

    # Regex patterns
    DATE_PATTERNS = [
        r'\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b',  # DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
        r'\b(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b',  # YYYY.MM.DD, YYYY/MM/DD, YYYY-MM-DD
        r'\b(\d{1,2})\s+(\w{3,})\s+(\d{4})\b',       # DD Month YYYY (anglų formatas)
    ]

    AMOUNT_PATTERNS = [
        r'\b(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*€\b',     # 1.234,56 € arba 1234.56 €
        r'\b€\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b',     # € 1.234,56 arba €1234.56
        r'\b(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*EUR\b',   # 1.234,56 EUR
        r'\bSUMA[:\s]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b', # SUMA: 1234.56
        r'\bTOTAL[:\s]*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b', # TOTAL: 1234.56
    ]

    ORDER_NUMBER_PATTERNS = [
        # Specifiškesni patterns pirmiausia (aukštesnis prioritetas)
        r'(TRP\d{5,6})',  # TRP##### formatas
        r'\b(20\d{2}-\d{3})\b',  # 2025-178 formatas (užsakymo numeris)
        r'\b([A-Z]{2,4}\d{4,6})\b',  # TMS#### formatas
        r'\b(UŽS|ORD|INV)[-/]?(\d{4,6})\b',
        r'\b(E\d{5})\b',  # E##### sutarties formatas (E02519)
        r'([A-Z]{1,4}\d{5,6})',  # X##### formatas (bet ne PVM kodai)
        # Bendresni patterns (žemesnis prioritetas)
        r'\b(?:užsakym|order|nr\.?|no\.?)\s*[:#]?\s*([A-Z0-9\-]{3,20})\b',
    ]

    EXPEDITION_NUMBER_PATTERNS = [
        r'\b(?:ekspedicij|expedition|exp|tour|reisas|reis)\s*[:#]?\s*([A-Z0-9\-]{3,20})\b',
        r'\b(JTO|HR)\s+(\d{3,4})\b',  # JTO 127, HR 984 formatas
        r'\b([A-Z]{1,4}\d{4,6})\b',  # EXP#### arba E#### formatas
        r'\b(EKS|EXP)[-/]?(\d{4,6})\b',
        r'\b(\d{3})\b',  # 3 skaičių numeriai (475)
    ]

    INVOICE_NUMBER_PATTERNS = [
        r'\b(?:sąskait|saskait|invoice|inv|nr\.?|no\.?)\s*[:#]?\s*([A-Z0-9\-]{3,20})\b',
        r'\b(LOG\d{4,6})\b',  # LOG#### formatas
        r'\b(SASK|INV)[-/]?(\d{4,6})\b',
        r'\b(?:Invoice|INVOICE)\s+(\d{4,7})\b',  # "Invoice 699102" formatas - ištraukti tik skaičių
        r'\b(TRP\d{5,6})\b',  # TRP##### sąskaitos formatas
        r'\b([A-Z]{1,4}\d{5,6})\b',  # X##### sąskaitos formatas
        r'\b(\d{6,7})\b',  # Tiesiog skaičius (bet ne datos)
    ]

    def __init__(self, text: str):
        """Inicializuoti su ištrauktu tekstu iš PDF."""
        self.text = text or ""
        self.normalized_text = self._normalize_text(text)

    def _normalize_text(self, text: str) -> str:
        """Normalizuoti tekstą OCR apdorojimui."""
        if not text:
            return ""

        # Pašalinti daugybinį whitespace
        text = re.sub(r'\s+', ' ', text.strip())

        # Pašalinti nereikalingus simbolius, bet palikti svarbius
        text = re.sub(r'[^\w\s€$.,/-]', ' ', text)

        return text.upper()  # Konvertuoti į didžiąsias raides

    def extract_dates(self) -> List[datetime]:
        """Ištraukti datas iš teksto."""
        dates = []

        for pattern in self.DATE_PATTERNS:
            matches = re.findall(pattern, self.text, re.IGNORECASE)
            for match in matches:
                try:
                    if len(match) == 3:
                        # DD.MM.YYYY arba YYYY.MM.DD formatas
                        part1, part2, part3 = match

                        # Nustatyti kuris formatas
                        if len(part3) == 4:  # YYYY formatas
                            year, month, day = int(part3), int(part1), int(part2)
                        else:  # DD.MM.YYYY formatas
                            day, month, year = int(part1), int(part2), int(part3)

                        if 1 <= day <= 31 and 1 <= month <= 12 and 2000 <= year <= 2030:
                            date_obj = datetime(year, month, day)
                            if date_obj not in dates:
                                dates.append(date_obj)

                except (ValueError, TypeError):
                    continue

        # Rūšiuoti datas chronologiškai
        return sorted(list(set(dates)))

    def extract_amounts(self) -> List[Decimal]:
        """Ištraukti sumas iš teksto."""
        amounts = []

        for pattern in self.AMOUNT_PATTERNS:
            matches = re.findall(pattern, self.text, re.IGNORECASE)
            for match in matches:
                try:
                    # Išvalyti skaičių (pašalinti tarpus ir konvertuoti kablelius)
                    amount_str = match.replace(' ', '').replace(',', '.')
                    amount = Decimal(amount_str)

                    # Filtruoti protingas sumas (nuo 0.01 iki 999999.99)
                    if 0.01 <= amount <= 999999.99 and amount not in amounts:
                        amounts.append(amount)

                except (InvalidOperation, ValueError):
                    continue

        # Rūšiuoti sumas mažėjimo tvarka
        return sorted(list(set(amounts)), reverse=True)

    def extract_order_number(self) -> Optional[str]:
        """Ištraukti užsakymo numerį."""
        # Pirmiausia ieškoti kontekste (užsakymo žodžiai)
        context_patterns = [
            r'pagal\s+sutartį?\s*[:\-]?\s*([A-Z0-9\-]{3,15})',
            r'užsakymo?\s+nr\.?\s*[:\-]?\s*([A-Z0-9\-]{3,15})',
            r'order\s+nr\.?\s*[:\-]?\s*([A-Z0-9\-]{3,15})',
            r'užsakym\.?\s*[:\-]?\s*([A-Z0-9\-]{3,15})',
            r'ref\.?\s*[:\-]?\s*([A-Z0-9\-]{3,15})',
        ]

        for pattern in context_patterns:
            matches = re.findall(pattern, self.normalized_text, re.IGNORECASE)
            for match in matches:
                order_num = match.strip()
                if len(order_num) >= 3 and order_num.replace('-', '').replace('_', '').isalnum():
                    upper_num = order_num.upper()
                    if upper_num not in ['DATE', 'DUE', 'FROM', 'TO'] and len(upper_num) < 15:
                        return order_num

        # Jei kontekste nerasta, naudoti bendrus patterns bet su papildomais filtrais
        candidates = []

        for pattern in self.ORDER_NUMBER_PATTERNS:
            matches = re.findall(pattern, self.normalized_text, re.IGNORECASE)
            for match in matches:
                # Jei match yra tuple (iš grupių), sujungti
                if isinstance(match, tuple):
                    order_num = ''.join([m for m in match if m])
                else:
                    order_num = match

                # Išvalyti ir validuoti
                order_num = order_num.strip()
                if len(order_num) >= 3 and order_num.replace('-', '').replace('_', '').isalnum():
                    # Ignoruoti netinkamus žodžius ir kodus
                    upper_num = order_num.upper()
                    if upper_num not in ['DATE', 'DUE', 'FROM', 'TO', 'ADRESAS', 'BANKAS', 'PIRKĖJAS'] and \
                       not upper_num.startswith('LT') and not upper_num.startswith('PVM') and \
                       not upper_num.endswith('LT') and len(upper_num) < 15 and \
                       not re.match(r'^\d{6,}$', upper_num):  # Ne vien skaičiai (gali būti sąskaitos nr)
                        candidates.append(order_num)

        # Grąžinti pirmą kandidatą iš specifiškesnių patternų
        return candidates[0] if candidates else None

    def extract_expedition_number(self) -> Optional[str]:
        """Ištraukti ekspedicijos numerį."""
        for pattern in self.EXPEDITION_NUMBER_PATTERNS:
            matches = re.findall(pattern, self.normalized_text, re.IGNORECASE)
            for match in matches:
                # Jei match yra tuple (iš grupių), sujungti
                if isinstance(match, tuple):
                    exp_num = ''.join(match)
                else:
                    exp_num = match

                # Validuoti ekspedicijos numerį
                if len(exp_num) >= 3 and exp_num.replace('-', '').replace('_', '').isalnum():
                    return exp_num.strip()

        return None

    def extract_invoice_number(self) -> Optional[str]:
        """Ištraukti sąskaitos numerį."""
        # Pirmiausia ieškoti kontekste (sąskaitos žodžiai)
        context_patterns = [
            r'sąskait\.?\s+[:\-]?\s*([A-Z0-9\-]{3,20})',
            r'invoice\s+[:\-]?\s*([A-Z0-9\-]{3,20})',
            r'inv\.?\s+[:\-]?\s*([A-Z0-9\-]{3,20})',
            r'nr\.?\s+[:\-]?\s*([A-Z0-9\-]{3,20})',
            r'faktūr\.?\s+[:\-]?\s*([A-Z0-9\-]{3,20})',
        ]

        for pattern in context_patterns:
            matches = re.findall(pattern, self.normalized_text, re.IGNORECASE)
            for match in matches:
                inv_num = match.strip()
                if len(inv_num) >= 3 and inv_num.replace('-', '').replace('_', '').replace(' ', '').isalnum():
                    upper_num = inv_num.upper()
                    if upper_num not in ['DATE', 'DUE', 'FROM', 'TO'] and len(upper_num) < 20:
                        return inv_num

        # Jei kontekste nerasta, naudoti bendrus patterns
        candidates = []

        for pattern in self.INVOICE_NUMBER_PATTERNS:
            matches = re.findall(pattern, self.normalized_text, re.IGNORECASE)
            for match in matches:
                # Jei match yra tuple (iš grupių), sujungti
                if isinstance(match, tuple):
                    # Paimti tik ne-tuščias grupes
                    inv_num = ''.join([m for m in match if m])
                else:
                    inv_num = match

                # Išvalyti ir validuoti sąskaitos numerį
                inv_num = inv_num.strip()
                if len(inv_num) >= 3 and inv_num.replace('-', '').replace('_', '').replace(' ', '').isalnum():
                    # Pašalinti "DATE" jei tai nėra tikras numeris
                    upper_num = inv_num.upper()
                    if upper_num not in ['DATE', 'DUE', 'FROM', 'TO', 'ADRESAS', 'BANKAS', 'PIRKĖJAS'] and \
                       not upper_num.startswith('LT') and len(upper_num) < 20:
                        candidates.append(inv_num)

        # Grąžinti pirmą kandidatą
        return candidates[0] if candidates else None

    def extract_all_data(self) -> Dict:
        """Ištraukti visus duomenis vienu metu."""
        return {
            'dates': [d.strftime('%Y-%m-%d') for d in self.extract_dates()],
            'amounts': [str(a) for a in self.extract_amounts()],
            'order_number': self.extract_order_number(),
            'expedition_number': self.extract_expedition_number(),
            'invoice_number': self.extract_invoice_number(),
            'raw_text': self.text[:500] + '...' if len(self.text) > 500 else self.text
        }

    @staticmethod
    def detect_document_type(text: str) -> str:
        """Nustatyti dokumento tipą pagal tekstą."""
        text_upper = text.upper()

        # Sąskaitos žymės
        invoice_keywords = ['SĄSKAITA', 'INVOICE', 'SASKAIT', 'FAKTURA', 'BILL']
        if any(keyword in text_upper for keyword in invoice_keywords):
            return 'invoice'

        # CMR žymės
        cmr_keywords = ['CMR', 'CONSIGNMENT NOTE', 'KROVINIO VAŽTARAŠTIS']
        if any(keyword in text_upper for keyword in cmr_keywords):
            return 'cmr'

        # TIR žymės
        tir_keywords = ['TIR', 'CARNET TIR', 'TIR CARNET']
        if any(keyword in text_upper for keyword in tir_keywords):
            return 'tir'

        # Transporto dokumentai
        transport_keywords = ['VEŽĖJAS', 'SHIPPER', 'CARRIER', 'TRANSPORTAS']
        if any(keyword in text_upper for keyword in transport_keywords):
            return 'transport'

        return 'unknown'


def process_pdf_attachment(attachment) -> Dict:
    """
    Apdoroti PDF priedą ir ištraukti sąskaitos duomenis.
    """
    from apps.mail.mail_matching_helper_NEW import _extract_pdf_text

    try:
        # Ištraukti tekstą iš PDF
        text = _extract_pdf_text(attachment)

        if not text or not text.strip():
            logger.warning(f"Nepavyko ištraukti teksto iš PDF priedo {attachment.filename}")
            return {
                'success': False,
                'error': 'Nepavyko ištraukti teksto iš PDF',
                'document_type': 'unknown'
            }

        # Nustatyti dokumento tipą
        document_type = InvoiceDataExtractor.detect_document_type(text)

        # Ištraukti duomenis
        extractor = InvoiceDataExtractor(text)
        data = extractor.extract_all_data()

        logger.info(f"Sėkmingai apdorotas PDF priedas {attachment.filename} - tipas: {document_type}")

        return {
            'success': True,
            'document_type': document_type,
            'extracted_data': data,
            'attachment_id': attachment.id,
            'filename': attachment.filename
        }

    except Exception as e:
        logger.error(f"Klaida apdorojant PDF priedą {attachment.filename}: {e}")
        return {
            'success': False,
            'error': str(e),
            'document_type': 'unknown'
        }
