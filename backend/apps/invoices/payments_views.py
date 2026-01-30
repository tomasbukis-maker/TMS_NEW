from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q, Sum, Count
from django.utils import timezone
from django.shortcuts import get_object_or_404
from decimal import Decimal
from datetime import datetime, timedelta
from .models import SalesInvoice, PurchaseInvoice, InvoicePayment
from .payment_service import PaymentService


class PaymentPageNumberPagination(PageNumberPagination):
    """Paginacija mokėjimų sąskaitoms"""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def unpaid_invoices_list(request):
    """
    Grąžina neapmokėtas sąskaitas (gautas ir išrašytas) su mokėjimų istorija
    Su puslapiavimu
    """
    try:
        invoice_type = request.GET.get('type', 'all')  # 'sales', 'purchase', 'all'
        page = int(request.GET.get('page', 1))
        page_size = int(request.GET.get('page_size', 50))
        
        # Gauti visas išrašytas sąskaitas (ne tik neapmokėtas)
        sales_invoices = []
        sales_total_count = 0
        if invoice_type in ['all', 'sales']:
            unpaid_sales = SalesInvoice.objects.all().select_related('partner').prefetch_related('payment_history').order_by('due_date', 'issue_date')
            
            sales_total_count = unpaid_sales.count()
            
            # Puslapiavimas
            start = (page - 1) * page_size
            end = start + page_size
            unpaid_sales = unpaid_sales[start:end]
            
            for inv in unpaid_sales:
                paid_amount = inv.paid_amount
                remaining = inv.remaining_amount
                payments = inv.payment_history.all().order_by('-payment_date')
                
                # Apskaičiuoti overdue_days dinamiškai, jei due_date praėjo
                today = timezone.now().date()
                overdue_days = inv.overdue_days
                if inv.due_date and inv.due_date < today and inv.payment_status not in ['paid', 'overdue']:
                    calculated_overdue = (today - inv.due_date).days
                    if calculated_overdue > 0:
                        overdue_days = calculated_overdue
                        # Atnaujinti duomenų bazėje, jei skiriasi (tik jei reikia)
                        if inv.overdue_days != calculated_overdue or inv.payment_status != 'overdue':
                            try:
                                SalesInvoice.objects.filter(id=inv.id).update(
                                    overdue_days=calculated_overdue,
                                    payment_status='overdue'
                                )
                            except Exception:
                                # Jei atnaujinimas nepavyko, tiesiog naudoti apskaičiuotą reikšmę
                                pass
                
                sales_invoices.append({
                    'id': inv.id,
                    'invoice_number': inv.invoice_number,
                    'partner': {
                        'id': inv.partner.id,
                        'name': inv.partner.name,
                        'code': inv.partner.code or ''
                    },
                    'issue_date': inv.issue_date.isoformat() if inv.issue_date else None,
                    'due_date': inv.due_date.isoformat() if inv.due_date else None,
                    'amount_total': str(inv.amount_total),
                    'paid_amount': str(paid_amount),
                    'remaining_amount': str(remaining),
                    'payment_status': inv.payment_status,
                    'overdue_days': overdue_days,
                    'payments': [
                        {
                            'id': p.id,
                            'amount': str(p.amount),
                            'payment_date': p.payment_date.isoformat() if p.payment_date else None,
                            'payment_method': p.payment_method or '',
                            'notes': p.notes or '',
                            'created_at': p.created_at.isoformat() if p.created_at else None
                        }
                        for p in payments
                    ]
                })
        
        # Gauti visas gautas sąskaitas (ne tik neapmokėtas)
        purchase_invoices = []
        purchase_total_count = 0
        if invoice_type in ['all', 'purchase']:
            unpaid_purchase = PurchaseInvoice.objects.all().select_related('partner').prefetch_related('payment_history').order_by('due_date', 'issue_date')
            
            purchase_total_count = unpaid_purchase.count()
            
            # Puslapiavimas
            start = (page - 1) * page_size
            end = start + page_size
            unpaid_purchase_list = list(unpaid_purchase[start:end])
            
            # Optimizuoti: užkrauti visus MailAttachment'us vienu kartu
            from apps.mail.models import MailAttachment
            invoice_ids = [inv.id for inv in unpaid_purchase_list]
            attachments_map = {
                att.related_purchase_invoice_id: att
                for att in MailAttachment.objects.filter(
                    related_purchase_invoice_id__in=invoice_ids
                )
            }
            
            for inv in unpaid_purchase_list:
                paid_amount = inv.paid_amount
                remaining = inv.remaining_amount
                payments = inv.payment_history.all().order_by('-payment_date')
                
                # Apskaičiuoti overdue_days dinamiškai, jei due_date praėjo
                today = timezone.now().date()
                overdue_days = inv.overdue_days
                if inv.due_date and inv.due_date < today and inv.payment_status not in ['paid', 'overdue']:
                    calculated_overdue = (today - inv.due_date).days
                    if calculated_overdue > 0:
                        overdue_days = calculated_overdue
                        # Atnaujinti duomenų bazėje, jei skiriasi (tik jei reikia)
                        if inv.overdue_days != calculated_overdue or inv.payment_status != 'overdue':
                            try:
                                PurchaseInvoice.objects.filter(id=inv.id).update(
                                    overdue_days=calculated_overdue,
                                    payment_status='overdue'
                                )
                            except Exception:
                                # Jei atnaujinimas nepavyko, tiesiog naudoti apskaičiuotą reikšmę
                                pass
                
                # Gauti invoice_file_url (kaip PurchaseInvoiceSerializer.get_invoice_file_url)
                invoice_file_url = None
                if inv.invoice_file:
                    try:
                        invoice_file_url = request.build_absolute_uri(inv.invoice_file.url)
                    except Exception:
                        pass
                else:
                    # Patikrinti, ar yra MailAttachment su related_purchase_invoice (iš jau užkrauto žemėlapio)
                    attachment = attachments_map.get(inv.id)
                    if attachment and attachment.file:
                        try:
                            invoice_file_url = request.build_absolute_uri(attachment.file.url)
                        except Exception as e:
                            import logging
                            logger = logging.getLogger(__name__)
                            logger.debug(f"Klaida gaunant MailAttachment file URL: {e}")
                            pass
                
                purchase_invoices.append({
                    'id': inv.id,
                    'invoice_number': inv.received_invoice_number or inv.invoice_number or f'INV{inv.id}',
                    'partner': {
                        'id': inv.partner.id,
                        'name': inv.partner.name,
                        'code': inv.partner.code or ''
                    },
                    'issue_date': inv.issue_date.isoformat() if inv.issue_date else None,
                    'due_date': inv.due_date.isoformat() if inv.due_date else None,
                    'amount_total': str(inv.amount_total),
                    'paid_amount': str(paid_amount),
                    'remaining_amount': str(remaining),
                    'payment_status': inv.payment_status,
                    'overdue_days': overdue_days,
                    'invoice_file': inv.invoice_file.name if inv.invoice_file else None,
                    'invoice_file_url': invoice_file_url,
                    'payments': [
                        {
                            'id': p.id,
                            'amount': str(p.amount),
                            'payment_date': p.payment_date.isoformat() if p.payment_date else None,
                            'payment_method': p.payment_method or '',
                            'notes': p.notes or '',
                            'created_at': p.created_at.isoformat() if p.created_at else None
                        }
                        for p in payments
                    ]
                })
        
        # Apskaičiuoti puslapių skaičių
        sales_total_pages = (sales_total_count + page_size - 1) // page_size if sales_total_count > 0 else 0
        purchase_total_pages = (purchase_total_count + page_size - 1) // page_size if purchase_total_count > 0 else 0
        
        return Response({
            'sales_invoices': sales_invoices,
            'purchase_invoices': purchase_invoices,
            'pagination': {
                'page': page,
                'page_size': page_size,
                'sales_count': sales_total_count,
                'sales_total_pages': sales_total_pages,
                'purchase_count': purchase_total_count,
                'purchase_total_pages': purchase_total_pages
            }
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'Klaida gaunant sąskaitas: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_payment(request):
    """
    Pridėti mokėjimą prie sąskaitos
    Jei payment_method == 'Sudengta' ir yra offset_invoice_ids, sukuria mokėjimus mūsų išrašytoms sąskaitoms
    """
    try:
        invoice_type = request.data.get('invoice_type')  # 'sales' arba 'purchase'
        invoice_id = request.data.get('invoice_id')
        amount = Decimal(str(request.data.get('amount', '0')))
        payment_date = request.data.get('payment_date')
        payment_method = request.data.get('payment_method', '')
        notes = request.data.get('notes', '')
        offset_invoice_ids = request.data.get('offset_invoice_ids', [])  # Mūsų išrašytų sąskaitų ID sąrašas
        
        if not invoice_type or not invoice_id or amount <= 0:
            return Response({
                'error': 'Trūksta reikalingų duomenų'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Naudoti PaymentService
        result = PaymentService.add_payment(
            invoice_type=invoice_type,
            invoice_id=invoice_id,
            amount=amount,
            payment_date=payment_date,
            payment_method=payment_method,
            notes=notes,
            created_by=request.user,
            offset_invoice_ids=offset_invoice_ids if offset_invoice_ids else None,
            request=request
        )
        
        payment = result['payment']
        invoice = result['invoice']
        
        return Response({
            'success': True,
            'payment': {
                'id': payment.id if payment else None,
                'amount': str(payment.amount) if payment else '0.00',
                'payment_date': payment.payment_date.isoformat() if payment and payment.payment_date else None,
                'payment_method': payment.payment_method if payment else '',
                'notes': payment.notes if payment else ''
            },
            'invoice': {
                'id': invoice.id,
                'payment_status': invoice.payment_status,
                'paid_amount': str(invoice.paid_amount),
                'remaining_amount': str(invoice.remaining_amount)
            }
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f'Klaida pridedant mokėjimą: {str(e)}', exc_info=True)
        return Response({
            'error': f'Klaida pridedant mokėjimą: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_payment(request, payment_id):
    """
    Pašalinti mokėjimą
    Jei trinamas mokėjimas su "Sudengta" metodu, ištrina susijusius mokėjimus
    """
    try:
        # Naudoti PaymentService
        result = PaymentService.delete_payment(payment_id, request=request, user=request.user)
        invoice = result['invoice']
        
        return Response({
            'success': True,
            'invoice': {
                'id': invoice.id,
                'payment_status': invoice.payment_status,
                'paid_amount': str(invoice.paid_amount),
                'remaining_amount': str(invoice.remaining_amount)
            }
        }, status=status.HTTP_200_OK)
        
    except ValueError as e:
        # Mokėjimas neegzistuoja
        return Response({
            'error': str(e)
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f'Klaida šalinant mokėjimą: {str(e)}', exc_info=True)
        return Response({
            'error': f'Klaida šalinant mokėjimą: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_as_paid(request):
    """
    Pažymėti sąskaitą kaip apmokėtą
    Naudoja PaymentService.mark_as_paid(), kuris automatiškai sukuria InvoicePayment įrašą
    """
    try:
        invoice_type = request.data.get('invoice_type')  # 'sales' arba 'purchase'
        invoice_id = request.data.get('invoice_id')
        payment_date = request.data.get('payment_date')
        payment_method = request.data.get('payment_method', 'Pavedimu')
        notes = request.data.get('notes', 'Pažymėta kaip apmokėta')
        
        if not invoice_type or not invoice_id:
            return Response({
                'error': 'Trūksta reikalingų duomenų (invoice_type, invoice_id)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Naudoti PaymentService
        result = PaymentService.mark_as_paid(
            invoice_type=invoice_type,
            invoice_id=invoice_id,
            payment_date=payment_date,
            payment_method=payment_method,
            notes=notes,
            created_by=request.user
        )
        
        payment = result['payment']
        invoice = result['invoice']
        
        return Response({
            'success': True,
            'payment': {
                'id': payment.id if payment else None,
                'amount': str(payment.amount) if payment else '0.00',
                'payment_date': payment.payment_date.isoformat() if payment and payment.payment_date else None,
                'payment_method': payment.payment_method if payment else '',
                'notes': payment.notes if payment else ''
            },
            'invoice': {
                'id': invoice.id,
                'payment_status': invoice.payment_status,
                'paid_amount': str(invoice.paid_amount),
                'remaining_amount': str(invoice.remaining_amount),
                'payment_date': invoice.payment_date.isoformat() if invoice.payment_date else None
            }
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f'Klaida pažymint sąskaitą kaip apmokėtą: {str(e)}', exc_info=True)
        return Response({
            'error': f'Klaida pažymint sąskaitą kaip apmokėtą: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_as_unpaid(request):
    """
    Pažymėti sąskaitą kaip neapmokėtą
    Naudoja PaymentService.mark_as_unpaid(), kuris ištrina visus mokėjimus
    """
    try:
        invoice_type = request.data.get('invoice_type')  # 'sales' arba 'purchase'
        invoice_id = request.data.get('invoice_id')
        
        if not invoice_type or not invoice_id:
            return Response({
                'error': 'Trūksta reikalingų duomenų (invoice_type, invoice_id)'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Naudoti PaymentService
        result = PaymentService.mark_as_unpaid(
            invoice_type=invoice_type,
            invoice_id=invoice_id
        )
        
        invoice = result['invoice']
        
        return Response({
            'success': True,
            'invoice': {
                'id': invoice.id,
                'payment_status': invoice.payment_status,
                'paid_amount': str(invoice.paid_amount),
                'remaining_amount': str(invoice.remaining_amount),
                'payment_date': invoice.payment_date.isoformat() if invoice.payment_date else None
            }
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f'Klaida pažymint sąskaitą kaip neapmokėtą: {str(e)}', exc_info=True)
        return Response({
            'error': f'Klaida pažymint sąskaitą kaip neapmokėtą: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def payment_statistics(request):
    """
    Grąžina mokėjimų statistiką (skolų sumas, kiekis ir t.t.)
    Su galimybe filtruoti pagal laikotarpį
    """
    try:
        today = timezone.now().date()
        
        # Laikotarpio filtrai
        date_from = request.GET.get('date_from')
        date_to = request.GET.get('date_to')
        
        # Base queryset'ai
        sales_base = SalesInvoice.objects.all()
        purchase_base = PurchaseInvoice.objects.all()
        
        # Filtruoti pagal laikotarpį (jei nurodytas)
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                sales_base = sales_base.filter(due_date__gte=date_from_obj)
                purchase_base = purchase_base.filter(due_date__gte=date_from_obj)
            except ValueError:
                pass
        
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                sales_base = sales_base.filter(due_date__lte=date_to_obj)
                purchase_base = purchase_base.filter(due_date__lte=date_to_obj)
            except ValueError:
                pass
        
        # IŠRAŠYTOS SĄSKAITOS (Sales)
        # Neapmokėtos išrašytos sąskaitos
        unpaid_sales = sales_base.filter(
            payment_status__in=['unpaid', 'partially_paid', 'overdue']
        )
        unpaid_sales_count = unpaid_sales.count()
        unpaid_sales_total = unpaid_sales.aggregate(
            total=Sum('amount_total')
        )['total'] or Decimal('0.00')
        unpaid_sales_remaining = sum(
            Decimal(inv.remaining_amount) for inv in unpaid_sales
        )
        
        # Vėluojančios išrašytos sąskaitos
        overdue_sales = unpaid_sales.filter(
            Q(due_date__lt=today) | Q(payment_status='overdue')
        )
        overdue_sales_count = overdue_sales.count()
        overdue_sales_total = sum(
            Decimal(inv.remaining_amount) for inv in overdue_sales
        )
        
        # GAUTOS SĄSKAITOS (Purchase)
        # Neapmokėtos gautos sąskaitos
        unpaid_purchase = purchase_base.filter(
            payment_status__in=['unpaid', 'partially_paid', 'overdue']
        )
        unpaid_purchase_count = unpaid_purchase.count()
        unpaid_purchase_total = unpaid_purchase.aggregate(
            total=Sum('amount_total')
        )['total'] or Decimal('0.00')
        unpaid_purchase_remaining = sum(
            Decimal(inv.remaining_amount) for inv in unpaid_purchase
        )
        
        # Vėluojančios gautos sąskaitos
        overdue_purchase = unpaid_purchase.filter(
            Q(due_date__lt=today) | Q(payment_status='overdue')
        )
        overdue_purchase_count = overdue_purchase.count()
        overdue_purchase_total = sum(
            Decimal(inv.remaining_amount) for inv in overdue_purchase
        )
        
        # BENDRA STATISTIKA
        total_unpaid_count = unpaid_sales_count + unpaid_purchase_count
        total_unpaid_remaining = unpaid_sales_remaining + unpaid_purchase_remaining
        total_overdue_count = overdue_sales_count + overdue_purchase_count
        total_overdue_remaining = overdue_sales_total + overdue_purchase_total
        
        # Skirtumas (kiek turime gauti - kiek turime sumokėti)
        net_balance = unpaid_sales_remaining - unpaid_purchase_remaining
        
        return Response({
            'sales': {
                'unpaid_count': unpaid_sales_count,
                'unpaid_total': str(unpaid_sales_total),
                'unpaid_remaining': str(unpaid_sales_remaining),
                'overdue_count': overdue_sales_count,
                'overdue_remaining': str(overdue_sales_total)
            },
            'purchase': {
                'unpaid_count': unpaid_purchase_count,
                'unpaid_total': str(unpaid_purchase_total),
                'unpaid_remaining': str(unpaid_purchase_remaining),
                'overdue_count': overdue_purchase_count,
                'overdue_remaining': str(overdue_purchase_total)
            },
            'total': {
                'unpaid_count': total_unpaid_count,
                'unpaid_remaining': str(total_unpaid_remaining),
                'overdue_count': total_overdue_count,
                'overdue_remaining': str(total_overdue_remaining),
                'net_balance': str(net_balance)
            },
            'period': {
                'date_from': date_from,
                'date_to': date_to
            }
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'Klaida gaunant statistiką: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
