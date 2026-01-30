"""
PaymentService - Centralizuotas mokėjimų valdymo servisas

Šis servisas yra vienintelis būdas keisti payment_status ir valdyti mokėjimus.
Visi payment_status pakeitimai turi eiti per šį servisą.
"""
import logging
from decimal import Decimal
from django.utils import timezone
from datetime import datetime
from typing import Optional, Union, List, Dict, Any
from django.contrib.auth import get_user_model

from .models import SalesInvoice, PurchaseInvoice, InvoicePayment

logger = logging.getLogger(__name__)
User = get_user_model()


class PaymentService:
    """Centralizuotas mokėjimų valdymo servisas"""
    
    @staticmethod
    def _get_invoice(invoice_type: str, invoice_id: int) -> Union[SalesInvoice, PurchaseInvoice]:
        """Gauti sąskaitą pagal tipą ir ID"""
        if invoice_type == 'sales':
            return SalesInvoice.objects.get(id=invoice_id)
        elif invoice_type == 'purchase':
            return PurchaseInvoice.objects.get(id=invoice_id)
        else:
            raise ValueError(f"Netinkamas invoice_type: {invoice_type}. Turi būti 'sales' arba 'purchase'")
    
    @staticmethod
    def _update_payment_status(invoice: Union[SalesInvoice, PurchaseInvoice], user=None, request=None) -> bool:
        """
        Automatiškai atnaujina payment_status pagal paid_amount ir remaining_amount.
        Naudoja StatusService statusų pakeitimams.
        
        Returns:
            bool: True jei payment_status pasikeitė, False jei nepasikeitė
        """
        old_status = invoice.payment_status
        paid_amount = invoice.paid_amount
        remaining_amount = invoice.remaining_amount
        total_amount = invoice.amount_total
        
        # Apskaičiuoti naują payment_status
        if paid_amount >= total_amount and remaining_amount <= Decimal('0.01'):
            new_status = 'paid'
        elif paid_amount > Decimal('0.00') and remaining_amount > Decimal('0.01'):
            new_status = 'partially_paid'
        else:
            new_status = 'unpaid'
        
        # Atnaujinti payment_status, jei pasikeitė
        if old_status != new_status:
            try:
                # Naudoti StatusService statusų pakeitimui
                from apps.core.services.status_service import StatusService
                
                entity_type = 'sales_invoice' if isinstance(invoice, SalesInvoice) else 'purchase_invoice'
                StatusService.change_status(
                    entity_type=entity_type,
                    entity_id=invoice.id,
                    new_status=new_status,
                    user=user,
                    reason='Automatinis statuso atnaujinimas pagal mokėjimų sumą',
                    request=request,
                    skip_validation=True  # Automatinis perėjimas, praleisti validaciją
                )
                
                # Atnaujinti invoice objektą
                invoice.refresh_from_db()
                
                # Jei nėra mokėjimų, išvalyti payment_date
                if new_status == 'unpaid' and invoice.payment_date:
                    invoice.payment_date = None
                    invoice.save(update_fields=['payment_date'])
                
                logger.info(f'Payment status updated via StatusService: invoice_id={invoice.id}, invoice_type={type(invoice).__name__}, old_status={old_status}, new_status={new_status}')
                return True
            except Exception as e:
                # Jei StatusService nepavyko, naudoti seną metodą (fallback)
                logger.warning(f'Failed to update payment status via StatusService, using fallback: {e}')
                update_fields = ['payment_status']
                
                if new_status == 'unpaid' and invoice.payment_date:
                    invoice.payment_date = None
                    update_fields.append('payment_date')
                
                invoice.payment_status = new_status
                invoice.save(update_fields=update_fields)
                return True
        
        return False
    
    @staticmethod
    def add_payment(
        invoice_type: str,
        invoice_id: int,
        amount: Decimal,
        payment_date: str,
        payment_method: str = '',
        notes: str = '',
        created_by: Optional[User] = None,
        offset_invoice_ids: Optional[List[int]] = None,
        request=None
    ) -> Dict[str, Any]:
        """
        Pridėti mokėjimą prie sąskaitos ir automatiškai atnaujinti payment_status.
        
        Args:
            invoice_type: 'sales' arba 'purchase'
            invoice_id: Sąskaitos ID
            amount: Mokėjimo suma
            payment_date: Mokėjimo data (YYYY-MM-DD formatas)
            payment_method: Mokėjimo būdas (pvz. 'Pavedimu', 'Sudengta')
            notes: Pastabos
            created_by: Vartotojas, kuris sukūrė mokėjimą
            offset_invoice_ids: Mūsų išrašytų sąskaitų ID sąrašas (naudojama su 'Sudengta' metodu)
        
        Returns:
            Dict su payment objekto duomenimis ir atnaujinta sąskaita
        """
        if amount <= Decimal('0.00'):
            raise ValueError("Mokėjimo suma turi būti didesnė už 0")
        
        # Suapvalinti iki 2 skaitmenų po kablelio
        amount = amount.quantize(Decimal('0.01'))
        
        # Gauti sąskaitą
        invoice = PaymentService._get_invoice(invoice_type, invoice_id)
        
        # Konvertuoti payment_date į date objektą
        if isinstance(payment_date, str):
            payment_date_obj = datetime.strptime(payment_date, '%Y-%m-%d').date()
        else:
            payment_date_obj = payment_date
        
        # Sukurti mokėjimą
        payment = None
        offset_payment_ids = []
        offset_invoice_numbers = []
        
        if invoice_type == 'sales':
            payment = InvoicePayment.objects.create(
                sales_invoice=invoice,
                amount=amount,
                payment_date=payment_date_obj,
                payment_method=payment_method,
                notes=notes,
                created_by=created_by
            )
        else:  # purchase
            # Sukurti mokėjimą vežėjo sąskaitai
            if amount >= Decimal('0.01'):
                payment = InvoicePayment.objects.create(
                    purchase_invoice=invoice,
                    amount=amount,
                    payment_date=payment_date_obj,
                    payment_method=payment_method,
                    notes=notes,
                    created_by=created_by
                )
            
            # Jei sudengiame pirkimo sąskaitą su mūsų išrašytomis sąskaitomis
            if payment_method == 'Sudengta' and offset_invoice_ids:
                for offset_invoice_id in offset_invoice_ids:
                    try:
                        offset_invoice = SalesInvoice.objects.get(id=offset_invoice_id)
                        offset_invoice_remaining = Decimal(str(offset_invoice.remaining_amount))
                        
                        # Sukurti mokėjimą su likusia suma
                        if offset_invoice_remaining > 0:
                            offset_invoice_numbers.append(offset_invoice.invoice_number)
                            offset_payment = InvoicePayment.objects.create(
                                sales_invoice=offset_invoice,
                                amount=offset_invoice_remaining,
                                payment_date=payment_date_obj,
                                payment_method='Sudengta',
                                notes=f'Sudengta su vežėjo sąskaita {invoice.received_invoice_number or invoice.invoice_number}. {notes}',
                                created_by=created_by
                            )
                            offset_payment_ids.append(offset_payment.id)
                    except SalesInvoice.DoesNotExist:
                        continue
                
                # Saugoti ryšį tarp mokėjimų notes lauke
                if offset_payment_ids and offset_invoice_numbers:
                    offset_invoices_text = ', '.join(offset_invoice_numbers)
                    offset_info = f'Sudengta su mūsų išrašytomis sąskaitomis: {offset_invoices_text}'
                    if notes:
                        offset_info = f'{offset_info}. {notes}'
                    
                    if payment:
                        if not payment.notes:
                            payment.notes = f'OFFSET_PAYMENT_IDS:{",".join(map(str, offset_payment_ids))}. {offset_info}'
                        else:
                            payment.notes = f'OFFSET_PAYMENT_IDS:{",".join(map(str, offset_payment_ids))}. {offset_info}. {payment.notes}'
                        payment.save()
                    elif offset_payment_ids:
                        # Jei mokėjimas vežėjo sąskaitai nebuvo sukurtas, saugoti pirmoje mūsų išrašytos sąskaitos mokėjimo notes lauke
                        first_offset_payment = InvoicePayment.objects.get(id=offset_payment_ids[0])
                        if not first_offset_payment.notes:
                            first_offset_payment.notes = f'OFFSET_PAYMENT_IDS:{",".join(map(str, offset_payment_ids))}. {offset_info}'
                        else:
                            first_offset_payment.notes = f'OFFSET_PAYMENT_IDS:{",".join(map(str, offset_payment_ids))}. {offset_info}. {first_offset_payment.notes}'
                        first_offset_payment.save()
        
        # Atnaujinti sąskaitą
        invoice.refresh_from_db()
        
        # Automatiškai atnaujinti payment_status
        status_changed = PaymentService._update_payment_status(invoice, user=created_by, request=request)
        
        # Jei pilnai apmokėta, nustatyti payment_date (jei nėra)
        if invoice.payment_status == 'paid' and not invoice.payment_date and payment:
            invoice.payment_date = payment.payment_date
            invoice.save(update_fields=['payment_date'])
        
        # Atnaujinti invoice iš DB, kad gautume naujausius duomenis
        invoice.refresh_from_db()
        
        # Registruoti veiksmą ActivityLog
        if payment:
            try:
                from apps.core.services.activity_log_service import ActivityLogService
                ActivityLogService.log_payment_added(payment, invoice_type, user=created_by, request=request)
            except Exception as e:
                logger.warning(f"Failed to log payment addition: {e}")
        
        # Registruoti offset mokėjimus (jei yra)
        if offset_payment_ids:
            try:
                from apps.core.services.activity_log_service import ActivityLogService
                for offset_payment_id in offset_payment_ids:
                    try:
                        offset_payment = InvoicePayment.objects.get(id=offset_payment_id)
                        ActivityLogService.log_payment_added(offset_payment, 'sales', user=created_by, request=request)
                    except InvoicePayment.DoesNotExist:
                        continue
            except Exception as e:
                logger.warning(f"Failed to log offset payment addition: {e}")
        
        return {
            'payment': payment,
            'invoice': invoice,
            'status_changed': status_changed
        }
    
    @staticmethod
    def delete_payment(payment_id: int, request=None, user: Optional[User] = None) -> Dict[str, Any]:
        """
        Ištrinti mokėjimą ir automatiškai atnaujinti payment_status.

        Jei trinamas mokėjimas su "Sudengta" metodu, ištrina susijusius mokėjimus.

        Args:
            payment_id: Mokėjimo ID

        Returns:
            Dict su atnaujinta sąskaita
        """
        try:
            payment = InvoicePayment.objects.get(id=payment_id)
        except InvoicePayment.DoesNotExist:
            raise ValueError(f"Mokėjimas su ID {payment_id} neegzistuoja arba jau buvo ištrintas.")
        invoice = payment.sales_invoice or payment.purchase_invoice
        invoice_type = 'sales' if payment.sales_invoice else 'purchase'
        
        # Saugoti payment duomenis prieš ištrynimą (reikalinga ActivityLog)
        payment_data = {
            'id': payment.id,
            'amount': payment.amount,
            'payment_date': payment.payment_date,
            'payment_method': payment.payment_method,
            'notes': payment.notes
        }
        
        # Jei trinamas mokėjimas su "Sudengta" metodu, rasti ir ištrinti susijusius mokėjimus
        if payment.payment_method == 'Sudengta':
            import re
            # Jei trinamas purchase invoice mokėjimas, rasti sales invoice mokėjimus
            if payment.purchase_invoice and payment.notes:
                match = re.search(r'OFFSET_PAYMENT_IDS:([0-9,]+)', payment.notes)
                if match:
                    offset_payment_ids_str = match.group(1)
                    offset_payment_ids = [int(id_str) for id_str in offset_payment_ids_str.split(',') if id_str.strip()]
                    # Ištrinti susijusius mokėjimus mūsų išrašytoms sąskaitoms
                    for offset_payment_id in offset_payment_ids:
                        try:
                            offset_payment = InvoicePayment.objects.get(id=offset_payment_id)
                            offset_payment.delete()
                        except InvoicePayment.DoesNotExist:
                            continue
            # Jei trinamas sales invoice mokėjimas, rasti kitus susijusius mokėjimus
            elif payment.sales_invoice and payment.notes:
                match = re.search(r'OFFSET_PAYMENT_IDS:([0-9,]+)', payment.notes)
                if match:
                    offset_payment_ids_str = match.group(1)
                    offset_payment_ids = [int(id_str) for id_str in offset_payment_ids_str.split(',') if id_str.strip()]
                    # Ištrinti kitus susijusius mokėjimus (kitus sales invoice mokėjimus)
                    for offset_payment_id in offset_payment_ids:
                        if offset_payment_id != payment_id:  # Neištrinti paties mokėjimo
                            try:
                                offset_payment = InvoicePayment.objects.get(id=offset_payment_id)
                                offset_payment.delete()
                            except InvoicePayment.DoesNotExist:
                                continue
                    # Rasti purchase invoice mokėjimą, kuris turi šį mokėjimą OFFSET_PAYMENT_IDS sąraše
                    purchase_payments = InvoicePayment.objects.filter(
                        purchase_invoice__isnull=False,
                        payment_method='Sudengta',
                        notes__contains='OFFSET_PAYMENT_IDS:'
                    )
                    for purchase_payment in purchase_payments:
                        if purchase_payment.notes:
                            match = re.search(r'OFFSET_PAYMENT_IDS:([0-9,]+)', purchase_payment.notes)
                            if match:
                                purchase_offset_ids = [int(id_str) for id_str in match.group(1).split(',') if id_str.strip()]
                                if payment_id in purchase_offset_ids:
                                    purchase_payment.delete()
                                    break
        
        # Ištrinti mokėjimą (tik vieną kartą)
        payment.delete()
        
        # Atnaujinti sąskaitą
        invoice.refresh_from_db()
        
        # Automatiškai atnaujinti payment_status
        status_changed = PaymentService._update_payment_status(invoice, user=created_by, request=request)
        
        # Atnaujinti invoice iš DB, kad gautume naujausius duomenis
        invoice.refresh_from_db()
        
        # Registruoti veiksmą ActivityLog
        try:
            from apps.core.services.activity_log_service import ActivityLogService
            # Sukurti laikiną payment objektą su duomenimis
            class TempPayment:
                def __init__(self, payment_data_dict, invoice_obj, invoice_type_str):
                    self.id = payment_data_dict['id']
                    self.amount = payment_data_dict['amount']
                    self.payment_date = payment_data_dict['payment_date']
                    self.invoice = invoice_obj
                    self.invoice_id = invoice_obj.id if invoice_obj else None
                    if invoice_type_str == 'sales':
                        self.sales_invoice = invoice_obj
                        self.purchase_invoice = None
                    else:
                        self.sales_invoice = None
                        self.purchase_invoice = invoice_obj
            
            temp_payment = TempPayment(payment_data, invoice, invoice_type)
            ActivityLogService.log_payment_deleted(temp_payment, invoice_type, user=user, request=request)
        except Exception as e:
            logger.warning(f"Failed to log payment deletion: {e}")
        
        return {
            'invoice': invoice,
            'status_changed': status_changed
        }
    
    @staticmethod
    def mark_as_paid(
        invoice_type: str,
        invoice_id: int,
        payment_date: Optional[str] = None,
        payment_method: str = 'Pavedimu',
        notes: str = 'Automatiškai sukurtas mokėjimas, kai sąskaita pažymėta kaip apmokėta',
        created_by: Optional[User] = None,
        request=None
    ) -> Dict[str, Any]:
        """
        Pažymėti sąskaitą kaip apmokėtą (sukuria InvoicePayment įrašą, jei reikia).
        
        Args:
            invoice_type: 'sales' arba 'purchase'
            invoice_id: Sąskaitos ID
            payment_date: Mokėjimo data (YYYY-MM-DD formatas). Jei None, naudojama šiandienos data
            payment_method: Mokėjimo būdas
            notes: Pastabos
            created_by: Vartotojas, kuris pažymėjo sąskaitą
        
        Returns:
            Dict su payment objekto duomenimis ir atnaujinta sąskaita
        """
        invoice = PaymentService._get_invoice(invoice_type, invoice_id)
        
        # Patikrinti, ar jau yra mokėjimų ir kokia likusi suma
        existing_payments = InvoicePayment.objects.filter(
            **{f'{invoice_type}_invoice': invoice}
        )
        existing_count = existing_payments.count()
        paid_amount = invoice.paid_amount
        remaining_amount = invoice.remaining_amount
        
        # Sukurti InvoicePayment įrašą, jei:
        # 1. Nėra jokių mokėjimų, ARBA
        # 2. Yra likusi suma, kurią reikia apmokėti
        if existing_count == 0 or remaining_amount > Decimal('0.01'):
            # Sukurti InvoicePayment įrašą su likusia suma (arba visa suma, jei nėra mokėjimų)
            if existing_count == 0:
                payment_amount = invoice.amount_total
            else:
                payment_amount = remaining_amount
            
            # Nustatyti payment_date
            if payment_date is None:
                payment_date_to_use = timezone.now().date()
            elif isinstance(payment_date, str):
                try:
                    payment_date_to_use = datetime.strptime(payment_date, '%Y-%m-%d').date()
                except (ValueError, TypeError):
                    payment_date_to_use = timezone.now().date()
            else:
                payment_date_to_use = payment_date
            
            # Sukurti mokėjimą
            if invoice_type == 'sales':
                payment = InvoicePayment.objects.create(
                    sales_invoice=invoice,
                    amount=payment_amount,
                    payment_date=payment_date_to_use,
                    payment_method=payment_method,
                    notes=notes,
                    created_by=created_by
                )
            else:  # purchase
                payment = InvoicePayment.objects.create(
                    purchase_invoice=invoice,
                    amount=payment_amount,
                    payment_date=payment_date_to_use,
                    payment_method=payment_method,
                    notes=notes,
                    created_by=created_by
                )
            
            logger.info(f'Created InvoicePayment: invoice_id={invoice.id}, invoice_type={invoice_type}, amount={payment_amount}, date={payment_date_to_use}')
        else:
            payment = None
            logger.info(f'Skipping InvoicePayment creation: already {existing_count} payment(s) exist and remaining_amount is {remaining_amount}')
        
        # Atnaujinti sąskaitą
        invoice.refresh_from_db()
        
        # Automatiškai atnaujinti payment_status
        status_changed = PaymentService._update_payment_status(invoice, user=created_by, request=request)
        
        # Nustatyti payment_date, jei nėra
        if invoice.payment_status == 'paid' and not invoice.payment_date:
            if payment:
                invoice.payment_date = payment.payment_date
            elif payment_date:
                if isinstance(payment_date, str):
                    try:
                        invoice.payment_date = datetime.strptime(payment_date, '%Y-%m-%d').date()
                    except (ValueError, TypeError):
                        invoice.payment_date = timezone.now().date()
                else:
                    invoice.payment_date = payment_date
            else:
                invoice.payment_date = timezone.now().date()
            invoice.save(update_fields=['payment_date'])
        
        # Atnaujinti invoice iš DB, kad gautume naujausius duomenis
        invoice.refresh_from_db()
        
        return {
            'payment': payment,
            'invoice': invoice,
            'status_changed': status_changed
        }
    
    @staticmethod
    def mark_as_unpaid(
        invoice_type: str,
        invoice_id: int,
        user: Optional[User] = None,
        request=None
    ) -> Dict[str, Any]:
        """
        Pažymėti sąskaitą kaip neapmokėtą (ištrina visus mokėjimus).
        
        Args:
            invoice_type: 'sales' arba 'purchase'
            invoice_id: Sąskaitos ID
        
        Returns:
            Dict su atnaujinta sąskaita
        """
        invoice = PaymentService._get_invoice(invoice_type, invoice_id)
        
        # Ištrinti visus mokėjimus
        InvoicePayment.objects.filter(
            **{f'{invoice_type}_invoice': invoice}
        ).delete()
        
        # Atnaujinti sąskaitą
        invoice.refresh_from_db()
        
        # Automatiškai atnaujinti payment_status
        status_changed = PaymentService._update_payment_status(invoice, user=user, request=request)
        
        # Išvalyti payment_date
        if invoice.payment_date:
            invoice.payment_date = None
            invoice.save(update_fields=['payment_date'])
        
        # Atnaujinti invoice iš DB, kad gautume naujausius duomenis
        invoice.refresh_from_db()
        
        return {
            'invoice': invoice,
            'status_changed': status_changed
        }
