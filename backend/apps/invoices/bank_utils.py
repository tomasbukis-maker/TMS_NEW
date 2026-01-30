import csv
import io
from datetime import datetime
from decimal import Decimal
from django.utils import timezone
from django.db import transaction as db_transaction
from .models import SalesInvoice, PurchaseInvoice


class BankTransaction:
    """Banko operacijos modelis"""
    
    def __init__(self, date, amount, description, invoice_number=None, partner_name=None):
        self.date = date
        self.amount = amount
        self.description = description
        self.invoice_number = invoice_number
        self.partner_name = partner_name
        self.matched = False
        self.matched_invoice = None
        self.match_type = None  # 'sales' or 'purchase'
        self.match_confidence = 0.0  # 0.0 - 1.0


def parse_csv_bank_statement(csv_file):
    """
    Apdoroja CSV banko išrašo failą.
    Laukia formatą: data, suma, aprašymas
    """
    transactions = []
    
    try:
        # Nuskaitome failą
        content = csv_file.read()
        if isinstance(content, bytes):
            content = content.decode('utf-8')
        
        csv_reader = csv.DictReader(io.StringIO(content))
        
        for row in csv_reader:
            try:
                # Bandoma rasti datos lauką
                date_field = None
                amount_field = None
                description_field = None
                
                for field in row.keys():
                    field_lower = field.lower()
                    if 'data' in field_lower or 'date' in field_lower:
                        date_field = field
                    if 'suma' in field_lower or 'amount' in field_lower or 'sum' in field_lower:
                        amount_field = field
                    if 'aprašymas' in field_lower or 'description' in field_lower or 'info' in field_lower:
                        description_field = field
                
                if not all([date_field, amount_field, description_field]):
                    continue
                
                # Apdorojame datą
                date_str = row[date_field].strip()
                try:
                    date = datetime.strptime(date_str, '%Y-%m-%d').date()
                except:
                    try:
                        date = datetime.strptime(date_str, '%d.%m.%Y').date()
                    except:
                        continue
                
                # Apdorojame sumą
                amount_str = row[amount_field].replace(',', '.').replace(' ', '')
                try:
                    amount = Decimal(amount_str)
                except:
                    continue
                
                description = row[description_field].strip()
                
                # Bandome ištraukti sąskaitos numerį iš aprašymo
                invoice_number = extract_invoice_number(description)
                partner_name = extract_partner_name(description)
                
                transaction = BankTransaction(
                    date=date,
                    amount=abs(amount),  # Visada teigiamas
                    description=description,
                    invoice_number=invoice_number,
                    partner_name=partner_name
                )
                
                transactions.append(transaction)
                
            except Exception as e:
                continue
        
        return transactions
        
    except Exception as e:
        raise ValueError(f"Klaida apdorojant CSV failą: {str(e)}")


def extract_invoice_number(description):
    """Ištraukia sąskaitos numerį iš aprašymo"""
    import re
    # Ieškome formatų: SF2025-0001, PI2025-0001, 2025-0001
    patterns = [
        r'(SF\d{4}-\d{4})',
        r'(PI\d{4}-\d{4})',
        r'(\d{4}-\d{4})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, description.upper())
        if match:
            return match.group(1)
    
    return None


def extract_partner_name(description):
    """Bandoma ištraukti partnerio pavadinimą (paprastas variantas)"""
    # Paprasčiausias variantas - pirmi žodžiai iki kablelio arba skaičiaus
    import re
    # Pašaliname sąskaitos numerį ir skaičius
    cleaned = re.sub(r'(SF\d{4}-\d{4}|PI\d{4}-\d{4}|\d{4}-\d{4})', '', description)
    cleaned = cleaned.strip()
    
    # Paimame pirmus 50 simbolių kaip partnerio pavadinimą
    if cleaned:
        return cleaned[:50].strip()
    
    return None


def match_transaction_to_invoice(transaction, all_sales_invoices=None, all_purchase_invoices=None):
    """
    Bando suderinti banko operaciją su sąskaita.
    Grąžina (matched_invoice, match_type, confidence)
    
    Optimizuota: naudoja užkrautas invoices list'us, kad išvengtų N+1 queries.
    """
    best_match = None
    best_confidence = 0.0
    match_type = None
    
    # Jei neperduotos užkrautos invoices, naudoti seną būdą (backward compatibility)
    use_optimized = all_sales_invoices is not None and all_purchase_invoices is not None
    
    if use_optimized:
        # Filtruojame memory'e
        # 1. Bandoma rasti pagal sąskaitos numerį ir sumą (aukščiausias prioritetas)
        if transaction.invoice_number:
            # Sales invoices
            sales_matches = [
                inv for inv in all_sales_invoices
                if transaction.invoice_number.upper() in inv.invoice_number.upper()
                and inv.payment_status in ['unpaid', 'partially_paid']
            ]
            
            for invoice in sales_matches:
                if abs(float(invoice.amount_total) - float(transaction.amount)) < 0.01:
                    confidence = 0.95
                    if transaction.partner_name and transaction.partner_name.lower() in invoice.partner.name.lower():
                        confidence = 1.0
                    
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'sales'
            
            # Purchase invoices
            purchase_matches = [
                inv for inv in all_purchase_invoices
                if transaction.invoice_number.upper() in inv.invoice_number.upper()
                and inv.payment_status in ['unpaid', 'partially_paid']
            ]
            
            for invoice in purchase_matches:
                if abs(float(invoice.amount_total) - float(transaction.amount)) < 0.01:
                    confidence = 0.95
                    if transaction.partner_name and transaction.partner_name.lower() in invoice.partner.name.lower():
                        confidence = 1.0
                    
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'purchase'
        
        # 2. Jei nerasta pagal numerį, bandoma pagal sumą ir partnerio pavadinimą
        if best_confidence < 0.8 and transaction.partner_name:
            # Sales invoices
            sales_matches = [
                inv for inv in all_sales_invoices
                if transaction.partner_name.lower() in inv.partner.name.lower()
                and inv.payment_status in ['unpaid', 'partially_paid']
            ]
            
            for invoice in sales_matches:
                amount_diff = abs(float(invoice.amount_total) - float(transaction.amount))
                if abs(amount_diff) < 0.01:
                    confidence = 0.7
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'sales'
            
            # Purchase invoices
            purchase_matches = [
                inv for inv in all_purchase_invoices
                if transaction.partner_name.lower() in inv.partner.name.lower()
                and inv.payment_status in ['unpaid', 'partially_paid']
            ]
            
            for invoice in purchase_matches:
                amount_diff = abs(float(invoice.amount_total) - float(transaction.amount))
                if abs(amount_diff) < 0.01:
                    confidence = 0.7
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'purchase'
        
        # 3. Paskutinis variantas - tik pagal sumą (žemas prioritetas)
        if best_confidence < 0.5:
            # Tikriname sales invoices (tik pirmus 50)
            sales_matches = [
                inv for inv in all_sales_invoices[:50]
                if inv.payment_status in ['unpaid', 'partially_paid']
                and inv.amount_total is not None
            ]
            
            for invoice in sales_matches:
                if abs(float(invoice.amount_total) - float(transaction.amount)) < 0.01:
                    confidence = 0.3
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'sales'
    else:
        # Senasis būdas (backward compatibility)
        # 1. Bandoma rasti pagal sąskaitos numerį ir sumą (aukščiausias prioritetas)
        if transaction.invoice_number:
            # Sales invoices
            sales_matches = SalesInvoice.objects.filter(
                invoice_number__icontains=transaction.invoice_number,
                payment_status__in=['unpaid', 'partially_paid']
            ).select_related('partner')
            
            for invoice in sales_matches:
                if abs(float(invoice.amount_total) - float(transaction.amount)) < 0.01:
                    confidence = 0.95
                    if transaction.partner_name and transaction.partner_name.lower() in invoice.partner.name.lower():
                        confidence = 1.0
                    
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'sales'
            
            # Purchase invoices
            purchase_matches = PurchaseInvoice.objects.filter(
                invoice_number__icontains=transaction.invoice_number,
                payment_status__in=['unpaid', 'partially_paid']
            ).select_related('partner')
            
            for invoice in purchase_matches:
                if abs(float(invoice.amount_total) - float(transaction.amount)) < 0.01:
                    confidence = 0.95
                    if transaction.partner_name and transaction.partner_name.lower() in invoice.partner.name.lower():
                        confidence = 1.0
                    
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'purchase'
        
        # 2. Jei nerasta pagal numerį, bandoma pagal sumą ir partnerio pavadinimą
        if best_confidence < 0.8 and transaction.partner_name:
            # Sales invoices
            sales_matches = SalesInvoice.objects.filter(
                partner__name__icontains=transaction.partner_name,
                payment_status__in=['unpaid', 'partially_paid']
            ).select_related('partner')
            
            for invoice in sales_matches:
                amount_diff = abs(float(invoice.amount_total) - float(transaction.amount))
                if abs(amount_diff) < 0.01:
                    confidence = 0.7
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'sales'
            
            # Purchase invoices
            purchase_matches = PurchaseInvoice.objects.filter(
                partner__name__icontains=transaction.partner_name,
                payment_status__in=['unpaid', 'partially_paid']
            ).select_related('partner')
            
            for invoice in purchase_matches:
                amount_diff = abs(float(invoice.amount_total) - float(transaction.amount))
                if abs(amount_diff) < 0.01:
                    confidence = 0.7
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'purchase'
        
        # 3. Paskutinis variantas - tik pagal sumą (žemas prioritetas)
        if best_confidence < 0.5:
            # Tikriname sales invoices
            sales_matches = SalesInvoice.objects.filter(
                payment_status__in=['unpaid', 'partially_paid']
            ).exclude(amount_total__isnull=True).select_related('partner')[:50]
            
            for invoice in sales_matches:
                if abs(float(invoice.amount_total) - float(transaction.amount)) < 0.01:
                    confidence = 0.3
                    if confidence > best_confidence:
                        best_match = invoice
                        best_confidence = confidence
                        match_type = 'sales'
    
    transaction.matched = best_confidence >= 0.5
    transaction.matched_invoice = best_match
    transaction.match_type = match_type
    transaction.match_confidence = best_confidence
    
    return best_match, match_type, best_confidence


def process_bank_statement(transactions):
    """
    Apdoroja banko išrašą ir suderina su sąskaitomis.
    Grąžina rezultatų sąrašą su kiekvienos operacijos statusu.
    
    Optimizuota: naudoja bulk_update vietoj individual save() operacijų.
    """
    results = []
    matched_count = 0
    
    # Užkrauti visas unpaid/partially_paid invoices vieną kartą (optimizacija)
    all_sales_invoices = list(SalesInvoice.objects.filter(
        payment_status__in=['unpaid', 'partially_paid']
    ).select_related('partner').all())
    
    all_purchase_invoices = list(PurchaseInvoice.objects.filter(
        payment_status__in=['unpaid', 'partially_paid']
    ).select_related('partner').all())
    
    # Apdoroti visas transactions
    for transaction in transactions:
        invoice, match_type, confidence = match_transaction_to_invoice(
            transaction,
            all_sales_invoices=all_sales_invoices,
            all_purchase_invoices=all_purchase_invoices
        )
        
        result = {
            'date': transaction.date.isoformat(),
            'amount': str(transaction.amount),
            'description': transaction.description,
            'matched': transaction.matched,
            'match_type': match_type,
            'confidence': confidence,
            'invoice_number': invoice.invoice_number if invoice else None,
            'invoice_id': invoice.id if invoice else None,
        }
        
        # Jei suderinta, naudoti PaymentService.mark_as_paid()
        if transaction.matched and invoice:
            from .payment_service import PaymentService
            
            try:
                # Naudoti PaymentService, kad būtų sukurtas InvoicePayment įrašas
                result = PaymentService.mark_as_paid(
                    invoice_type=match_type,
                    invoice_id=invoice.id,
                    payment_date=transaction.date.strftime('%Y-%m-%d'),
                    payment_method='Banko pavedimas',
                    notes=f'Automatiškai suderinta su banko išrašu. Suma: {transaction.amount}',
                    created_by=None  # Banko importas nėra susijęs su konkrečiu vartotoju
                )
                matched_count += 1
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f'Klaida pažymint sąskaitą kaip apmokėtą per PaymentService: {e}', exc_info=True)
                # Tęsti su kitais invoice'ais net jei vienas nepavyko
        
        results.append(result)
    
    return {
        'total_transactions': len(transactions),
        'matched_count': matched_count,
        'unmatched_count': len(transactions) - matched_count,
        'results': results
    }

