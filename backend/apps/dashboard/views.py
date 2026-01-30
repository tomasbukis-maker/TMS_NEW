from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q, Sum, Count
from django.utils import timezone
from datetime import timedelta, datetime
from apps.invoices.models import SalesInvoice, PurchaseInvoice, SalesInvoiceOrder
from apps.invoices.utils import find_invoice_number_gaps, get_max_existing_invoice_number
from apps.orders.models import Order, OrderCarrier
from apps.partners.models import Partner
from decimal import Decimal


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_statistics(request):
    """
    Grąžina statistiką pagrindinio lango (dashboard) rodymui:
    - Neapmokėtos išrašytos sąskaitos (kiekis ir suma)
    - Neapmokėtos gautos sąskaitos (kiekis ir suma)
    - Vėluojančios gautos/išrašytos sąskaitos (kiekis)
    - Užsakymai šį mėnesį: baigti/nebaigti/nauji (kiekis)
    - Nauji klientai šį mėnesį (kiekis)
    
    Parametrai:
    - period_type: 'all' arba 'month' (default: 'month')
    - year: metai (default: dabartiniai metai)
    - month: mėnuo 1-12 (default: dabartinis mėnuo, jei period_type='month')
    """
    try:
        today = timezone.now().date()
        
        # Datų filtras
        period_type = request.GET.get('period_type', 'month')  # 'all' arba 'month'
        year_param = request.GET.get('year')
        month_param = request.GET.get('month')
        filter_by = request.GET.get('filter_by', '')  # Pagal ką filtruoti: issue_date, due_date, payment_date, created_at, order_date, loading_date, unloading_date, first_order, first_invoice
        
        if period_type == 'all':
            # Nuo pradžių
            date_from = None
            date_to = None
        else:
            # Mėnesio pasirinkimas
            if year_param:
                year = int(year_param)
            else:
                year = today.year
            
            if month_param:
                month = int(month_param)
            else:
                month = today.month
            
            # Pirmoji mėnesio diena
            date_from = today.replace(year=year, month=month, day=1)
            # Paskutinė mėnesio diena
            if month == 12:
                date_to = today.replace(year=year + 1, month=1, day=1) - timedelta(days=1)
            else:
                date_to = today.replace(year=year, month=month + 1, day=1) - timedelta(days=1)
        
        first_day_of_month = date_from if date_from else None
        last_day_of_month = date_to if date_to else None
        
        # 1. Išrašytos sąskaitos (sales invoices) - filtruojame pagal pasirinktą lauką
        # Neįtraukti testinių duomenų (pagal partnerio pavadinimą)
        sales_invoices_query = SalesInvoice.objects.exclude(
            partner__name__icontains='test'
        ).exclude(
            partner__name__icontains='demo'
        ).exclude(
            partner__name__icontains='testinis'
        )
        
        # Nustatyti pagal ką filtruoti sąskaitas
        if filter_by == 'due_date':
            # Filtruoti pagal termino datą
            if first_day_of_month and last_day_of_month:
                sales_invoices_query = sales_invoices_query.filter(
                    due_date__gte=first_day_of_month,
                    due_date__lte=last_day_of_month
                )
        elif filter_by == 'payment_date':
            # Filtruoti pagal mokėjimo datą (tik apmokėtoms)
            if first_day_of_month and last_day_of_month:
                sales_invoices_query = sales_invoices_query.filter(
                    payment_date__gte=first_day_of_month,
                    payment_date__lte=last_day_of_month
                )
        elif filter_by == 'created_at':
            # Filtruoti pagal sukūrimo datą
            if first_day_of_month and last_day_of_month:
                from django.utils import timezone as tz_util
                date_from_dt = tz_util.make_aware(datetime.combine(first_day_of_month, datetime.min.time()))
                date_to_dt = tz_util.make_aware(datetime.combine(last_day_of_month, datetime.max.time()))
                sales_invoices_query = sales_invoices_query.filter(
                    created_at__gte=date_from_dt,
                    created_at__lte=date_to_dt
                )
        else:
            # Default: filtruoti pagal issue_date (išrašymo datą)
            if first_day_of_month and last_day_of_month:
                sales_invoices_query = sales_invoices_query.filter(
                    issue_date__gte=first_day_of_month,
                    issue_date__lte=last_day_of_month
                )
        
        # Neapmokėtos išrašytos sąskaitos
        unpaid_sales = sales_invoices_query.filter(
            payment_status__in=['unpaid', 'partially_paid']
        ).select_related('partner').order_by('issue_date', 'created_at')
        unpaid_sales_count = unpaid_sales.count()
        unpaid_sales_total = unpaid_sales.aggregate(
            total=Sum('amount_total')
        )['total'] or Decimal('0.00')
        
        # Apmokėtos išrašytos sąskaitos
        paid_sales = sales_invoices_query.filter(
            payment_status='paid'
        )
        paid_sales_count = paid_sales.count()
        paid_sales_total = paid_sales.aggregate(
            total=Sum('amount_total')
        )['total'] or Decimal('0.00')
        
        # 3 seniausios neapmokėtos išrašytos sąskaitos
        oldest_unpaid_sales = unpaid_sales[:3]
        oldest_unpaid_sales_list = [
            {
                'invoice_number': inv.invoice_number,
                'partner_name': inv.partner.name,
                'amount_total': str(inv.amount_total),
                'issue_date': inv.issue_date.isoformat() if inv.issue_date else None,
                'due_date': inv.due_date.isoformat() if inv.due_date else None,
            }
            for inv in oldest_unpaid_sales
        ]
        
        # 2. Gautos sąskaitos (purchase invoices) - filtruojame pagal pasirinktą lauką
        purchase_invoices_query = PurchaseInvoice.objects.all()
        
        # Nustatyti pagal ką filtruoti sąskaitas
        if filter_by == 'due_date':
            # Filtruoti pagal termino datą
            if first_day_of_month and last_day_of_month:
                purchase_invoices_query = purchase_invoices_query.filter(
                    due_date__gte=first_day_of_month,
                    due_date__lte=last_day_of_month
                )
        elif filter_by == 'payment_date':
            # Filtruoti pagal mokėjimo datą (tik apmokėtoms)
            if first_day_of_month and last_day_of_month:
                purchase_invoices_query = purchase_invoices_query.filter(
                    payment_date__gte=first_day_of_month,
                    payment_date__lte=last_day_of_month
                )
        elif filter_by == 'created_at':
            # Filtruoti pagal sukūrimo datą
            if first_day_of_month and last_day_of_month:
                from django.utils import timezone as tz_util
                date_from_dt = tz_util.make_aware(datetime.combine(first_day_of_month, datetime.min.time()))
                date_to_dt = tz_util.make_aware(datetime.combine(last_day_of_month, datetime.max.time()))
                purchase_invoices_query = purchase_invoices_query.filter(
                    created_at__gte=date_from_dt,
                    created_at__lte=date_to_dt
                )
        else:
            # Default: filtruoti pagal issue_date (išrašymo datą)
            if first_day_of_month and last_day_of_month:
                purchase_invoices_query = purchase_invoices_query.filter(
                    issue_date__gte=first_day_of_month,
                    issue_date__lte=last_day_of_month
                )
        
        # Neapmokėtos gautos sąskaitos
        unpaid_purchase = purchase_invoices_query.filter(
            payment_status__in=['unpaid', 'partially_paid']
        ).select_related('partner').order_by('issue_date', 'created_at')
        unpaid_purchase_count = unpaid_purchase.count()
        unpaid_purchase_total = unpaid_purchase.aggregate(
            total=Sum('amount_total')
        )['total'] or Decimal('0.00')
        
        # Apmokėtos gautos sąskaitos
        paid_purchase = purchase_invoices_query.filter(
            payment_status='paid'
        )
        paid_purchase_count = paid_purchase.count()
        paid_purchase_total = paid_purchase.aggregate(
            total=Sum('amount_total')
        )['total'] or Decimal('0.00')
        
        # 3 seniausios neapmokėtos gautos sąskaitos
        oldest_unpaid_purchase = unpaid_purchase[:3]
        oldest_unpaid_purchase_list = [
            {
                'invoice_number': inv.received_invoice_number or inv.invoice_number or f'INV{inv.id}',
                'partner_name': inv.partner.name,
                'amount_total': str(inv.amount_total),
                'issue_date': inv.issue_date.isoformat() if inv.issue_date else None,
                'due_date': inv.due_date.isoformat() if inv.due_date else None,
            }
            for inv in oldest_unpaid_purchase
        ]
        
        # 3. Vėluojančios sąskaitos (overdue)
        # Išrašytos sąskaitos su due_date < today
        overdue_sales = SalesInvoice.objects.filter(
            Q(payment_status__in=['unpaid', 'partially_paid']) &
            Q(due_date__lt=today)
        )
        
        # Filtruoti pagal pasirinktą lauką
        if filter_by == 'due_date':
            # Filtruoti pagal termino datą
            if first_day_of_month and last_day_of_month:
                overdue_sales = overdue_sales.filter(
                    due_date__gte=first_day_of_month,
                    due_date__lte=last_day_of_month
                )
        elif filter_by == 'payment_date':
            # Filtruoti pagal mokėjimo datą
            if first_day_of_month and last_day_of_month:
                overdue_sales = overdue_sales.filter(
                    payment_date__gte=first_day_of_month,
                    payment_date__lte=last_day_of_month
                )
        elif filter_by == 'created_at':
            # Filtruoti pagal sukūrimo datą
            if first_day_of_month and last_day_of_month:
                from django.utils import timezone as tz_util
                date_from_dt = tz_util.make_aware(datetime.combine(first_day_of_month, datetime.min.time()))
                date_to_dt = tz_util.make_aware(datetime.combine(last_day_of_month, datetime.max.time()))
                overdue_sales = overdue_sales.filter(
                    created_at__gte=date_from_dt,
                    created_at__lte=date_to_dt
                )
        else:
            # Default: filtruoti pagal issue_date
            if first_day_of_month and last_day_of_month:
                overdue_sales = overdue_sales.filter(
                    issue_date__gte=first_day_of_month,
                    issue_date__lte=last_day_of_month
                )
        overdue_sales = overdue_sales.select_related('partner').order_by('due_date', 'issue_date')
        overdue_sales_count = overdue_sales.count()
        
        # Išsaugoti queryset sąrašą prieš naudojimą (kad galėtume naudoti vėliau)
        overdue_sales_list = list(overdue_sales)
        
        # 3 seniausios vėluojančios išrašytos sąskaitos
        oldest_overdue_sales = overdue_sales_list[:3]
        oldest_overdue_sales_list = [
            {
                'invoice_number': inv.invoice_number,
                'partner_name': inv.partner.name,
                'amount_total': str(inv.amount_total),
                'issue_date': inv.issue_date.isoformat() if inv.issue_date else None,
                'due_date': inv.due_date.isoformat() if inv.due_date else None,
            }
            for inv in oldest_overdue_sales
        ]
        
        # Gautos sąskaitos su due_date < today
        overdue_purchase = PurchaseInvoice.objects.filter(
            Q(payment_status__in=['unpaid', 'partially_paid']) &
            Q(due_date__lt=today)
        )
        
        # Filtruoti pagal pasirinktą lauką
        if filter_by == 'due_date':
            # Filtruoti pagal termino datą
            if first_day_of_month and last_day_of_month:
                overdue_purchase = overdue_purchase.filter(
                    due_date__gte=first_day_of_month,
                    due_date__lte=last_day_of_month
                )
        elif filter_by == 'payment_date':
            # Filtruoti pagal mokėjimo datą
            if first_day_of_month and last_day_of_month:
                overdue_purchase = overdue_purchase.filter(
                    payment_date__gte=first_day_of_month,
                    payment_date__lte=last_day_of_month
                )
        elif filter_by == 'created_at':
            # Filtruoti pagal sukūrimo datą
            if first_day_of_month and last_day_of_month:
                from django.utils import timezone as tz_util
                date_from_dt = tz_util.make_aware(datetime.combine(first_day_of_month, datetime.min.time()))
                date_to_dt = tz_util.make_aware(datetime.combine(last_day_of_month, datetime.max.time()))
                overdue_purchase = overdue_purchase.filter(
                    created_at__gte=date_from_dt,
                    created_at__lte=date_to_dt
                )
        else:
            # Default: filtruoti pagal issue_date
            if first_day_of_month and last_day_of_month:
                overdue_purchase = overdue_purchase.filter(
                    issue_date__gte=first_day_of_month,
                    issue_date__lte=last_day_of_month
                )
        overdue_purchase = overdue_purchase.select_related('partner').order_by('due_date', 'issue_date')
        overdue_purchase_count = overdue_purchase.count()
        
        # Išsaugoti queryset sąrašą prieš naudojimą (kad galėtume naudoti vėliau)
        overdue_purchase_list = list(overdue_purchase)
        
        # 3 seniausios vėluojančios gautos sąskaitos
        oldest_overdue_purchase = overdue_purchase_list[:3]
        oldest_overdue_purchase_list = [
            {
                'invoice_number': inv.received_invoice_number or inv.invoice_number or f'INV{inv.id}',
                'partner_name': inv.partner.name,
                'amount_total': str(inv.amount_total),
                'issue_date': inv.issue_date.isoformat() if inv.issue_date else None,
                'due_date': inv.due_date.isoformat() if inv.due_date else None,
            }
            for inv in oldest_overdue_purchase
        ]
        
        # 4. Užsakymai (filtruojami pagal pasirinktą datą)
        if first_day_of_month and last_day_of_month:
            from django.utils import timezone as tz_util
            date_from_dt = tz_util.make_aware(datetime.combine(first_day_of_month, datetime.min.time()))
            date_to_dt = tz_util.make_aware(datetime.combine(last_day_of_month, datetime.max.time()))
            
            if filter_by == 'order_date':
                # Filtruoti pagal užsakymo datą
                orders_this_month = Order.objects.filter(
                    order_date__gte=date_from_dt,
                    order_date__lte=date_to_dt
                )
            elif filter_by == 'loading_date':
                # Filtruoti pagal pakrovimo datą
                orders_this_month = Order.objects.filter(
                    loading_date__gte=date_from_dt,
                    loading_date__lte=date_to_dt
                )
            elif filter_by == 'unloading_date':
                # Filtruoti pagal iškrovimo datą
                orders_this_month = Order.objects.filter(
                    unloading_date__gte=date_from_dt,
                    unloading_date__lte=date_to_dt
                )
            else:
                # Default: filtruoti pagal created_at (sukūrimo datą)
                orders_this_month = Order.objects.filter(
                    created_at__gte=date_from_dt,
                    created_at__lte=date_to_dt
                )
        else:
            orders_this_month = Order.objects.all()
        
        orders_finished = orders_this_month.filter(status='finished').count()
        orders_unfinished = orders_this_month.exclude(status='finished').exclude(status='canceled').count()
        orders_new = orders_this_month.filter(status='new').count()
        
        # 5. Nauji klientai (filtruojami pagal pasirinktą datą)
        if first_day_of_month and last_day_of_month:
            from django.utils import timezone as tz_util
            date_from_dt = tz_util.make_aware(tz_util.datetime.combine(first_day_of_month, tz_util.datetime.min.time()))
            date_to_dt = tz_util.make_aware(tz_util.datetime.combine(last_day_of_month, tz_util.datetime.max.time()))
            
            if filter_by == 'first_order':
                # Filtruoti pagal pirmą užsakymą
                new_clients_count = Partner.objects.filter(
                    is_client=True,
                    orders__created_at__gte=date_from_dt,
                    orders__created_at__lte=date_to_dt
                ).distinct().count()
            elif filter_by == 'first_invoice':
                # Filtruoti pagal pirmą sąskaitą
                new_clients_count = Partner.objects.filter(
                    is_client=True,
                    sales_invoices__issue_date__gte=first_day_of_month,
                    sales_invoices__issue_date__lte=last_day_of_month
                ).distinct().count()
            else:
                # Default: filtruoti pagal created_at (sukūrimo datą)
                new_clients_count = Partner.objects.filter(
                    is_client=True,
                    created_at__gte=date_from_dt,
                    created_at__lte=date_to_dt
                ).count()
        else:
            new_clients_count = Partner.objects.filter(is_client=True).count()
        
        # 6. Finansinė statistika šį mėnesį
        # Pelnas iš užsakymų šį mėnesį
        # FILTRAVIMAS: Rodome užsakymus pagal pasirinktą filtravimo variantą
        if first_day_of_month and last_day_of_month:
            from django.utils import timezone as tz_util
            date_from_dt = tz_util.make_aware(datetime.combine(first_day_of_month, datetime.min.time()))
            date_to_dt = tz_util.make_aware(datetime.combine(last_day_of_month, datetime.max.time()))
            
            if filter_by == 'payment_date':
                # Filtruoti pagal mokėjimo datą (užsakymai su apmokėtomis sąskaitomis)
                orders_this_month_with_prices = Order.objects.filter(
                    client_price_net__isnull=False
                ).filter(
                    Q(sales_invoices__payment_date__gte=first_day_of_month, sales_invoices__payment_date__lte=last_day_of_month) |
                    Q(purchase_invoices_m2m__payment_date__gte=first_day_of_month, purchase_invoices_m2m__payment_date__lte=last_day_of_month)
                ).distinct()
            elif filter_by == 'order_date':
                # Filtruoti pagal užsakymo datą
                orders_this_month_with_prices = Order.objects.filter(
                    client_price_net__isnull=False,
                    order_date__gte=date_from_dt,
                    order_date__lte=date_to_dt
                )
            elif filter_by == 'loading_date':
                # Filtruoti pagal pakrovimo datą
                orders_this_month_with_prices = Order.objects.filter(
                    client_price_net__isnull=False,
                    loading_date__gte=date_from_dt,
                    loading_date__lte=date_to_dt
                )
            elif filter_by == 'unloading_date':
                # Filtruoti pagal iškrovimo datą
                orders_this_month_with_prices = Order.objects.filter(
                    client_price_net__isnull=False,
                    unloading_date__gte=date_from_dt,
                    unloading_date__lte=date_to_dt
                )
            else:
                # Default: užsakymai su sąskaitomis pasirinktame mėnesyje arba užsakymai su tikrąja data
                # Rasti užsakymus, kurie turi sąskaitas pasirinktame mėnesyje
                orders_with_invoices_this_month = Order.objects.filter(
                    client_price_net__isnull=False
                ).filter(
                    # Užsakymai su SalesInvoice, išrašytomis šį mėnesį
                    Q(sales_invoices__issue_date__gte=first_day_of_month, sales_invoices__issue_date__lte=last_day_of_month) |
                    # Užsakymai su PurchaseInvoice, išrašytomis šį mėnesį
                    Q(purchase_invoices_m2m__issue_date__gte=first_day_of_month, purchase_invoices_m2m__issue_date__lte=last_day_of_month)
                ).distinct()
                
                # Rasti užsakymus, kurių tikroji data yra pasirinktame mėnesyje
                orders_with_dates_this_month = Order.objects.filter(
                    client_price_net__isnull=False
                ).filter(
                    Q(order_date__date__gte=first_day_of_month, order_date__date__lte=last_day_of_month) |
                    Q(order_date__isnull=True, loading_date__date__gte=first_day_of_month, loading_date__date__lte=last_day_of_month) |
                    Q(order_date__isnull=True, loading_date__isnull=True, unloading_date__date__gte=first_day_of_month, unloading_date__date__lte=last_day_of_month)
                ).distinct()
                
                # Sujungti abu rinkinius
                orders_this_month_with_prices = (orders_with_invoices_this_month | orders_with_dates_this_month).distinct()
        else:
            # Jei period_type='all', naudoti visus užsakymus
            orders_this_month_with_prices = Order.objects.filter(
            client_price_net__isnull=False
        )
        monthly_profit = Decimal('0.00')
        monthly_revenue = Decimal('0.00')
        monthly_expenses = Decimal('0.00')
        
        for order in orders_this_month_with_prices:
            # Kliento kaina
            client_price = Decimal(str(order.client_price_net)) if order.client_price_net else Decimal('0.00')
            monthly_revenue += client_price
            
            # Vežėjų kainos
            carrier_costs = Decimal('0.00')
            if order.carriers.exists():
                carrier_costs = order.carriers.aggregate(
                    total=Sum('price_net')
                )['total'] or Decimal('0.00')
                if carrier_costs:
                    carrier_costs = Decimal(str(carrier_costs))
            
            # Kitos išlaidos
            other_costs = Decimal('0.00')
            if hasattr(order, 'other_costs') and order.other_costs:
                if isinstance(order.other_costs, list):
                    for cost in order.other_costs:
                        if isinstance(cost, dict) and 'amount' in cost:
                            other_costs += Decimal(str(cost['amount']))
            
            monthly_expenses += carrier_costs + other_costs
            monthly_profit += client_price - carrier_costs - other_costs
        
        # Apmokėtos ir neapmokėtos sąskaitos (filtruojamos pagal pasirinktą lauką)
        if first_day_of_month and last_day_of_month:
            # Išrašytos sąskaitos
            if filter_by == 'due_date':
                sales_invoices_period = SalesInvoice.objects.filter(
                    due_date__gte=first_day_of_month,
                    due_date__lte=last_day_of_month
                )
            elif filter_by == 'payment_date':
                sales_invoices_period = SalesInvoice.objects.filter(
                    payment_date__gte=first_day_of_month,
                    payment_date__lte=last_day_of_month
                )
            elif filter_by == 'created_at':
                from django.utils import timezone as tz_util
                date_from_dt = tz_util.make_aware(datetime.combine(first_day_of_month, datetime.min.time()))
                date_to_dt = tz_util.make_aware(datetime.combine(last_day_of_month, datetime.max.time()))
                sales_invoices_period = SalesInvoice.objects.filter(
                    created_at__gte=date_from_dt,
                    created_at__lte=date_to_dt
                )
            else:
                # Default: pagal issue_date
                sales_invoices_period = SalesInvoice.objects.filter(
                    issue_date__gte=first_day_of_month,
                    issue_date__lte=last_day_of_month
                )
            
            paid_sales_this_month = sales_invoices_period.filter(
                payment_status='paid'
            ).aggregate(total=Sum('amount_total'))['total'] or Decimal('0.00')
            unpaid_sales_this_month = sales_invoices_period.filter(
                payment_status__in=['unpaid', 'partially_paid']
            ).aggregate(total=Sum('amount_total'))['total'] or Decimal('0.00')
            
            # Gautos sąskaitos
            if filter_by == 'due_date':
                purchase_invoices_period = PurchaseInvoice.objects.filter(
                    due_date__gte=first_day_of_month,
                    due_date__lte=last_day_of_month
                )
            elif filter_by == 'payment_date':
                purchase_invoices_period = PurchaseInvoice.objects.filter(
                    payment_date__gte=first_day_of_month,
                    payment_date__lte=last_day_of_month
                )
            elif filter_by == 'created_at':
                from django.utils import timezone as tz_util
                date_from_dt = tz_util.make_aware(datetime.combine(first_day_of_month, datetime.min.time()))
                date_to_dt = tz_util.make_aware(datetime.combine(last_day_of_month, datetime.max.time()))
                purchase_invoices_period = PurchaseInvoice.objects.filter(
                    created_at__gte=date_from_dt,
                    created_at__lte=date_to_dt
                )
            else:
                # Default: pagal issue_date
                purchase_invoices_period = PurchaseInvoice.objects.filter(
                    issue_date__gte=first_day_of_month,
                    issue_date__lte=last_day_of_month
                )
            
            paid_purchase_this_month = purchase_invoices_period.filter(
                payment_status='paid'
            ).aggregate(total=Sum('amount_total'))['total'] or Decimal('0.00')
            unpaid_purchase_this_month = purchase_invoices_period.filter(
                payment_status__in=['unpaid', 'partially_paid']
            ).aggregate(total=Sum('amount_total'))['total'] or Decimal('0.00')
        else:
            # Visos sąskaitos (nuo pradžių)
            paid_sales_this_month = SalesInvoice.objects.filter(
                payment_status='paid'
            ).aggregate(total=Sum('amount_total'))['total'] or Decimal('0.00')
            unpaid_sales_this_month = SalesInvoice.objects.filter(
                payment_status__in=['unpaid', 'partially_paid']
            ).aggregate(total=Sum('amount_total'))['total'] or Decimal('0.00')
            
            paid_purchase_this_month = PurchaseInvoice.objects.filter(
                payment_status='paid'
            ).aggregate(total=Sum('amount_total'))['total'] or Decimal('0.00')
            unpaid_purchase_this_month = PurchaseInvoice.objects.filter(
                payment_status__in=['unpaid', 'partially_paid']
            ).aggregate(total=Sum('amount_total'))['total'] or Decimal('0.00')
        
        cash_flow = paid_sales_this_month - paid_purchase_this_month
        
        # 7. Užsakymai be vežėjų (NEPRIKLAUSOMAI nuo datų filtro - tai yra "dabar" informacija)
        orders_without_carriers_query = Order.objects.filter(
            status__in=['new', 'assigned', 'executing']
        ).annotate(carrier_count=Count('carriers')).filter(carrier_count=0)
        # Tracking duomenys NENAUDOJA datų filtro - jie rodo visus aktualius užsakymus
        orders_without_carriers = orders_without_carriers_query.count()
        # Gauti užsakymų sąrašą be vežėjų (tooltip'ui)
        orders_without_carriers_list = [
            {
                'id': order.id,
                'order_number': order.order_number or f'#{order.id}',
                'client_name': order.client.name if order.client else '-',
            }
            for order in orders_without_carriers_query.select_related('client')[:50]
        ]
        
        # 8. Užsakymai be sąskaitų (bet kokio statuso, kurie neturi nei pardavimo, nei pirkimo sąskaitų) (NEPRIKLAUSOMAI nuo datų filtro)
        # Tikrinti visus užsakymus, kurie neturi nei sales_invoices, nei purchase_invoices_m2m
        orders_without_invoices_query = Order.objects.exclude(
            status='canceled'
        ).annotate(
            sales_inv_count=Count('sales_invoices'),
            purchase_inv_count=Count('purchase_invoices_m2m')
        ).filter(
            sales_inv_count=0,
            purchase_inv_count=0
        ).select_related('client')
        # Tracking duomenys NENAUDOJA datų filtro - jie rodo visus aktualius užsakymus
        orders_without_invoices = orders_without_invoices_query.count()
        # Gauti užsakymų be sąskaitų sąrašą (tooltip'ui)
        orders_without_invoices_list = [
            {
                'id': order.id,
                'order_number': order.order_number or f'#{order.id}',
                'client_name': order.client.name if order.client else '-',
                'status': order.status,
            }
            for order in orders_without_invoices_query[:50]
        ]
        
        # 9. Artimiausi užsakymai (pakrovimo/iškrovimo datos per 3-7 dienas)
        from django.utils import timezone as tz_util
        today_datetime = tz_util.now()
        upcoming_date = today_datetime + timedelta(days=7)
        
        upcoming_orders = Order.objects.filter(
            Q(loading_date__gte=today_datetime, loading_date__lte=upcoming_date) |
            Q(unloading_date__gte=today_datetime, unloading_date__lte=upcoming_date)
        ).exclude(status='canceled').select_related('client').order_by('loading_date', 'unloading_date')[:5]
        
        upcoming_orders_list = []
        for order in upcoming_orders:
            loading_date_str = None
            if order.loading_date:
                if isinstance(order.loading_date, str):
                    loading_date_str = order.loading_date
                elif hasattr(order.loading_date, 'date'):
                    loading_date_str = order.loading_date.date().isoformat()
                else:
                    loading_date_str = order.loading_date.isoformat()
            
            unloading_date_str = None
            if order.unloading_date:
                if isinstance(order.unloading_date, str):
                    unloading_date_str = order.unloading_date
                elif hasattr(order.unloading_date, 'date'):
                    unloading_date_str = order.unloading_date.date().isoformat()
                else:
                    unloading_date_str = order.unloading_date.isoformat()
            
            route_from = order.route_from or f"{order.route_from_city or ''}, {order.route_from_country or ''}".strip(', ') or '-'
            route_to = order.route_to or f"{order.route_to_city or ''}, {order.route_to_country or ''}".strip(', ') or '-'
            
            upcoming_orders_list.append({
                'id': order.id,
                'order_number': order.order_number or f'#{order.id}',
                'client_name': order.client.name if order.client else '-',
                'loading_date': loading_date_str,
                'unloading_date': unloading_date_str,
                'status': order.status,
                'route_from': route_from,
                'route_to': route_to,
            })
        
        # 10. Užsakymai su vėluojančiomis sąskaitomis (NEPRIKLAUSOMAI nuo datų filtro)
        # Patikrinti per sales invoices su due_date < today ARBA issue_date senesnė nei 30 dienų ir payment_status unpaid/partially_paid
        # Naudojame related_orders ryšį per SalesInvoice
        overdue_invoice_ids = SalesInvoice.objects.filter(
            Q(due_date__lt=today) | Q(issue_date__lt=today - timedelta(days=30)),
            payment_status__in=['unpaid', 'partially_paid']
        ).values_list('id', flat=True)
        
        # Gauti užsakymus, susijusius su vėluojančiomis sąskaitomis
        overdue_order_ids = SalesInvoiceOrder.objects.filter(
            invoice_id__in=overdue_invoice_ids
        ).values_list('order_id', flat=True).distinct()
        
        orders_with_overdue_query = Order.objects.filter(id__in=overdue_order_ids)
        # Tracking duomenys NENAUDOJA datų filtro - jie rodo visus aktualius užsakymus
        orders_with_overdue = orders_with_overdue_query.count()
        
        # 11. Vežėjai be gautų sąskaitų (užsakymai baigti, bet vežėjams negautos sąskaitos) (NEPRIKLAUSOMAI nuo datų filtro)
        carriers_without_invoices_query = OrderCarrier.objects.filter(
            order__status='finished',
            invoice_received=False
        )
        # Tracking duomenys NENAUDOJA datų filtro - jie rodo visus aktualius užsakymus
        # PIRMA suskaičiuoti visus, PO TO apriboti sąrašą rodymui
        carriers_without_invoices_count = carriers_without_invoices_query.count()
        carriers_without_invoices_list_data = carriers_without_invoices_query.select_related('order', 'partner').order_by('order__created_at')[:50]
        
        carriers_without_invoices_list = [
            {
                'order_id': carrier.order.id,
                'order_number': carrier.order.order_number or f'#{carrier.order.id}',
                'carrier_name': carrier.partner.name if carrier.partner else '-',
                'order_created': carrier.order.created_at.isoformat() if carrier.order.created_at else None,
            }
            for carrier in carriers_without_invoices_list_data
        ]
        
        # 12. Vežėjai su vėluojančiomis sąskaitomis (NEPRIKLAUSOMAI nuo datų filtro)
        carriers_with_overdue_query = OrderCarrier.objects.filter(
            due_date__lt=today,
            payment_status__in=['unpaid', 'partially_paid']
        )
        # Tracking duomenys NENAUDOJA datų filtro - jie rodo visus aktualius užsakymus
        # PIRMA suskaičiuoti visus, PO TO apriboti sąrašą rodymui
        carriers_with_overdue_count = carriers_with_overdue_query.count()
        carriers_with_overdue_list_data = carriers_with_overdue_query.select_related('order', 'partner').order_by('due_date')[:50]
        
        carriers_with_overdue_list = [
            {
                'order_id': carrier.order.id,
                'order_number': carrier.order.order_number or f'#{carrier.order.id}',
                'carrier_name': carrier.partner.name if carrier.partner else '-',
                'due_date': carrier.due_date.isoformat() if carrier.due_date else None,
                'overdue_days': (today - carrier.due_date).days if carrier.due_date else 0,
            }
            for carrier in carriers_with_overdue_list_data
        ]
        
        # 13. Pranešimai (skubūs)
        alerts = []
        if overdue_sales_count > 0:
            # Gauti visų vėluojančių išrašytų sąskaitų sąrašą (tooltip'ui)
            overdue_sales_all = [
                {
                    'id': inv.id,
                    'invoice_number': inv.invoice_number,
                    'partner_name': inv.partner.name if inv.partner else '-',
                    'amount_total': str(inv.amount_total),
                    'due_date': inv.due_date.isoformat() if inv.due_date else None,
                }
                for inv in overdue_sales_list[:50]
            ]
            alerts.append({
                'type': 'error',
                'message': f'⚠️ {overdue_sales_count} vėluojančios išrašytos sąskaitos',
                'link': '/invoices?status=overdue&type=sales',
                'details': overdue_sales_all  # Detalesnė informacija tooltip'ui
            })
        if overdue_purchase_count > 0:
            # Gauti visų vėluojančių gautų sąskaitų sąrašą (tooltip'ui)
            overdue_purchase_all = [
                {
                    'id': inv.id,
                    'invoice_number': inv.received_invoice_number or inv.invoice_number or f'INV{inv.id}',
                    'partner_name': inv.partner.name if inv.partner else '-',
                    'amount_total': str(inv.amount_total),
                    'due_date': inv.due_date.isoformat() if inv.due_date else None,
                }
                for inv in overdue_purchase_list[:50]
            ]
            alerts.append({
                'type': 'error',
                'message': f'⚠️ {overdue_purchase_count} vėluojančios gautos sąskaitos',
                'link': '/invoices?status=overdue&type=purchase',
                'details': overdue_purchase_all  # Detalesnė informacija tooltip'ui
            })
        if orders_without_carriers > 0:
            alerts.append({
                'type': 'warning',
                'message': f'⚠️ {orders_without_carriers} užsakymai be vežėjų',
                'link': '/orders?status=new,assigned,executing',
                'details': orders_without_carriers_list  # Užsakymų sąrašas tooltip'ui
            })
        if orders_without_invoices > 0:
            alerts.append({
                'type': 'info',
                'message': f'ℹ️ {orders_without_invoices} užsakymai be sąskaitų',
                'link': '/orders',
                'details': orders_without_invoices_list  # Užsakymų sąrašas tooltip'ui
            })
        
        # Patikrinti ar yra tarpų sąskaitų numeracijoje
        # Gauti visus tarpus (be limito, kad tooltip galėtų rodyti visus)
        invoice_gaps = find_invoice_number_gaps(max_gaps=1000)  # Didelis limitas, kad gautume visus
        if invoice_gaps:
            from apps.settings.models import InvoiceSettings
            inv_settings = InvoiceSettings.load()
            prefix = inv_settings.invoice_prefix_sales or 'LOG'
            width = inv_settings.invoice_number_width or 7
            _, separator = get_max_existing_invoice_number(prefix, width, return_separator=True)
            separator = separator or ''
            
            # Formatuoti tarpus - pirmi 3 rodymui pagrindiniame pranešime
            gap_messages = []
            all_gaps_formatted = []  # Visi tarpus tooltip'ui
            
            for gap in invoice_gaps[:3]:  # Rodyti tik pirmus 3 tarpus pagrindiniame pranešime
                if gap[0] == gap[1]:
                    # Vienas numeris
                    gap_messages.append(f"{prefix}{separator}{gap[0]:0{width}d}")
                else:
                    # Diapazonas
                    gap_messages.append(
                        f"{prefix}{separator}{gap[0]:0{width}d}-{prefix}{separator}{gap[1]:0{width}d}"
                    )
            
            # Formatuoti visus tarpus tooltip'ui
            # Kiekvienam tarpui rodyti diapazoną IR visus numerius tame diapazone
            all_gaps_formatted = []
            for gap in invoice_gaps:
                gap_start = gap[0]
                gap_end = gap[1]
                
                # Formatuoti diapazoną
                if gap_start == gap_end:
                    # Vienas numeris
                    gap_range = f"{prefix}{separator}{gap_start:0{width}d}"
                    gap_numbers = [f"{prefix}{separator}{gap_start:0{width}d}"]
                else:
                    # Diapazonas
                    gap_range = f"{prefix}{separator}{gap_start:0{width}d}-{prefix}{separator}{gap_end:0{width}d}"
                    # Generuoti visus numerius diapazone
                    gap_numbers = [f"{prefix}{separator}{num:0{width}d}" for num in range(gap_start, gap_end + 1)]
                
                # Pridėti kaip objektą su diapazonu ir numeriais
                all_gaps_formatted.append({
                    'range': gap_range,
                    'numbers': gap_numbers,
                    'count': len(gap_numbers)
                })
            
            # Skaičiuoti tikrą tarpų skaičių (ne elementų skaičių masyve)
            # Kiekvienas tuple yra vienas tarpas (ar vienas numeris, ar diapazonas)
            total_gaps_count = len(invoice_gaps)
            
            gaps_text = ', '.join(gap_messages)
            if len(invoice_gaps) > 3:
                gaps_text += f' (+{len(invoice_gaps) - 3} dar)'
            
            alerts.append({
                'type': 'warning',
                'message': f'⚠️ Yra tarpų sąskaitų numeracijoje: {gaps_text}',
                'link': '/settings',
                'gaps': all_gaps_formatted,  # Visi tarpus tooltip'ui
                'gaps_count': total_gaps_count  # Tikras tarpų skaičius
            })
        
        return Response({
            'invoices': {
                'unpaid_sales': {
                    'count': unpaid_sales_count,
                    'total': str(unpaid_sales_total),
                    'oldest_invoices': oldest_unpaid_sales_list
                },
                'paid_sales': {
                    'count': paid_sales_count,
                    'total': str(paid_sales_total),
                },
                'unpaid_purchase': {
                    'count': unpaid_purchase_count,
                    'total': str(unpaid_purchase_total),
                    'oldest_invoices': oldest_unpaid_purchase_list
                },
                'paid_purchase': {
                    'count': paid_purchase_count,
                    'total': str(paid_purchase_total),
                },
                'overdue_sales': {
                    'count': overdue_sales_count,
                    'oldest_invoices': oldest_overdue_sales_list
                },
                'overdue_purchase': {
                    'count': overdue_purchase_count,
                    'oldest_invoices': oldest_overdue_purchase_list
                }
            },
            'orders': {
                'finished': orders_finished,
                'unfinished': orders_unfinished,
                'new': orders_new
            },
            'clients': {
                'new_this_month': new_clients_count
            },
            'finance': {
                'monthly_profit': str(monthly_profit),
                'monthly_revenue': str(monthly_revenue),
                'monthly_expenses': str(monthly_expenses),
                'cash_flow': str(cash_flow),
                'paid_revenue': str(paid_sales_this_month),
                'unpaid_revenue': str(unpaid_sales_this_month),
                'paid_expenses': str(paid_purchase_this_month),
                'unpaid_expenses': str(unpaid_purchase_this_month),
            },
            'orders_tracking': {
                'without_carriers': orders_without_carriers,
                'finished_without_invoices': orders_without_invoices,  # Dabar rodo visus užsakymus be sąskaitų, ne tik baigtus
                'with_overdue_invoices': orders_with_overdue,
                'upcoming': upcoming_orders_list,
            },
            'carriers_tracking': {
                'without_invoices': {
                    'count': carriers_without_invoices_count,
                    'list': carriers_without_invoices_list
                },
                'with_overdue': {
                    'count': carriers_with_overdue_count,
                    'list': carriers_with_overdue_list
                }
            },
            'alerts': alerts
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'Klaida gaunant statistiką: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def clients_with_overdue_invoices(request):
    """
    Grąžina klientus su daugiausiai vėluojančių apmokėti sąskaitų.
    Surūšiuoti pagal vėluojančių sąskaitų skaičių (mažėjančiai).
    """
    try:
        today = timezone.now().date()
        
        # Rasti klientus su vėluojančiomis sąskaitomis
        clients_with_overdue = Partner.objects.filter(
            is_client=True,
            sales_invoices__payment_status__in=['unpaid', 'partially_paid'],
            sales_invoices__due_date__lt=today
        ).annotate(
            overdue_count=Count('sales_invoices', filter=Q(
                sales_invoices__payment_status__in=['unpaid', 'partially_paid'],
                sales_invoices__due_date__lt=today
            )),
            overdue_total=Sum('sales_invoices__amount_total', filter=Q(
                sales_invoices__payment_status__in=['unpaid', 'partially_paid'],
                sales_invoices__due_date__lt=today
            ))
        ).filter(overdue_count__gt=0).order_by('-overdue_count', '-overdue_total')[:20]
        
        clients_list = []
        for client in clients_with_overdue:
            # Gauti visas vėluojančias sąskaitas
            overdue_invoices = SalesInvoice.objects.filter(
                partner=client,
                payment_status__in=['unpaid', 'partially_paid'],
                due_date__lt=today
            ).order_by('due_date')
            
            clients_list.append({
                'id': client.id,
                'name': client.name,
                'overdue_count': client.overdue_count or 0,
                'overdue_total': str(client.overdue_total or Decimal('0.00')),
                'oldest_overdue_date': overdue_invoices[0].due_date.isoformat() if overdue_invoices.exists() else None,
                'invoices': [
                    {
                        'invoice_number': inv.invoice_number,
                        'amount_total': str(inv.amount_total),
                        'due_date': inv.due_date.isoformat() if inv.due_date else None,
                        'overdue_days': (today - inv.due_date).days if inv.due_date else 0,
                    }
                    for inv in overdue_invoices[:5]  # Pirmos 5 sąskaitos
                ]
            })
        
        return Response({
            'clients': clients_list
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'Klaida gaunant klientų sąrašą: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def carriers_with_overdue_invoices(request):
    """
    Grąžina vežėjus su daugiausiai vėluojančių apmokėti sąskaitų.
    Surūšiuoti pagal vėluojančių sąskaitų skaičių (mažėjančiai).
    """
    try:
        today = timezone.now().date()
        
        # Rasti vežėjus su vėluojančiomis sąskaitomis per OrderCarrier
        # Vežėjai yra tie partneriai, kurie yra OrderCarrier įrašuose
        carriers_with_overdue = Partner.objects.filter(
            order_carriers__due_date__lt=today,
            order_carriers__payment_status__in=['unpaid', 'partially_paid']
        ).annotate(
            overdue_count=Count('order_carriers', filter=Q(
                order_carriers__due_date__lt=today,
                order_carriers__payment_status__in=['unpaid', 'partially_paid']
            )),
            overdue_total=Sum('order_carriers__price_net', filter=Q(
                order_carriers__due_date__lt=today,
                order_carriers__payment_status__in=['unpaid', 'partially_paid']
            ))
        ).filter(overdue_count__gt=0).distinct().order_by('-overdue_count', '-overdue_total')[:20]
        
        carriers_list = []
        for carrier in carriers_with_overdue:
            # Gauti visas vėluojančias sąskaitas per OrderCarrier
            overdue_carriers = OrderCarrier.objects.filter(
                partner=carrier,
                due_date__lt=today,
                payment_status__in=['unpaid', 'partially_paid']
            ).select_related('order').order_by('due_date')
            
            carriers_list.append({
                'id': carrier.id,
                'name': carrier.name,
                'overdue_count': carrier.overdue_count or 0,
                'overdue_total': str(carrier.overdue_total or Decimal('0.00')),
                'oldest_overdue_date': overdue_carriers[0].due_date.isoformat() if overdue_carriers.exists() else None,
                'orders': [
                    {
                        'order_id': oc.order.id,
                        'order_number': oc.order.order_number or f'#{oc.order.id}',
                        'price_net': str(oc.price_net) if oc.price_net else '0.00',
                        'due_date': oc.due_date.isoformat() if oc.due_date else None,
                        'overdue_days': (today - oc.due_date).days if oc.due_date else 0,
                    }
                    for oc in overdue_carriers[:5]  # Pirmi 5 užsakymai
                ]
            })
        
        return Response({
            'carriers': carriers_list
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'Klaida gaunant vežėjų sąrašą: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

