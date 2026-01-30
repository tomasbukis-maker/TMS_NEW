from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django_filters.rest_framework import DjangoFilterBackend
from django_filters import rest_framework as filters
from rest_framework import filters as drf_filters
from datetime import date
from .models import ExpenseSupplier, ExpenseCategory, ExpenseInvoice
from .serializers import (
    ExpenseSupplierSerializer, ExpenseCategorySerializer,
    ExpenseInvoiceSerializer
)


class ExpensePageNumberPagination(PageNumberPagination):
    """Paginacija išlaidų duomenims"""
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000


class ExpenseSupplierViewSet(viewsets.ModelViewSet):
    """Išlaidų tiekėjų CRUD operacijos"""
    queryset = ExpenseSupplier.objects.all().order_by('name')
    serializer_class = ExpenseSupplierSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ExpensePageNumberPagination
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_fields = ['status']
    search_fields = ['name', 'code', 'vat_code', 'phone', 'email']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """Išlaidų kategorijų CRUD operacijos"""
    queryset = ExpenseCategory.objects.all().order_by('name')
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'description']


class ExpenseInvoiceFilter(filters.FilterSet):
    """Filtrai išlaidų sąskaitoms"""
    issue_date__gte = filters.DateFilter(field_name='issue_date', lookup_expr='gte')
    issue_date__lte = filters.DateFilter(field_name='issue_date', lookup_expr='lte')
    due_date__gte = filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_date__lte = filters.DateFilter(field_name='due_date', lookup_expr='lte')
    
    class Meta:
        model = ExpenseInvoice
        fields = ['payment_status', 'supplier', 'category']


class ExpenseInvoiceViewSet(viewsets.ModelViewSet):
    """Išlaidų sąskaitų CRUD operacijos"""
    queryset = ExpenseInvoice.objects.select_related('supplier', 'category').all()
    serializer_class = ExpenseInvoiceSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ExpensePageNumberPagination
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter, drf_filters.OrderingFilter]
    filterset_class = ExpenseInvoiceFilter
    search_fields = ['invoice_number', 'supplier__name', 'notes']
    ordering_fields = ['issue_date', 'due_date', 'amount_total', 'created_at']
    ordering = ['-issue_date', '-created_at']
    
    def get_serializer_context(self):
        """Pridėti request į serializer context"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Grąžinti išlaidų statistiką"""
        from django.db.models import Sum, Count, Q
        from decimal import Decimal
        
        queryset = self.filter_queryset(self.get_queryset())
        
        # Bendros sumos
        total_stats = queryset.aggregate(
            total_amount=Sum('amount_total'),
            total_unpaid=Sum('amount_total', filter=Q(payment_status='unpaid')),
            total_overdue=Sum('amount_total', filter=Q(payment_status='overdue')),
            count_total=Count('id'),
            count_unpaid=Count('id', filter=Q(payment_status='unpaid')),
            count_overdue=Count('id', filter=Q(payment_status='overdue')),
        )
        
        # Sumos pagal kategorijas
        by_category = queryset.values('category__name').annotate(
            total=Sum('amount_total'),
            count=Count('id')
        ).order_by('-total')[:10]
        
        # Sumos pagal tiekėjus
        by_supplier = queryset.values('supplier__name').annotate(
            total=Sum('amount_total'),
            count=Count('id')
        ).order_by('-total')[:10]
        
        return Response({
            'total_amount': total_stats['total_amount'] or Decimal('0.00'),
            'total_unpaid': total_stats['total_unpaid'] or Decimal('0.00'),
            'total_overdue': total_stats['total_overdue'] or Decimal('0.00'),
            'count_total': total_stats['count_total'] or 0,
            'count_unpaid': total_stats['count_unpaid'] or 0,
            'count_overdue': total_stats['count_overdue'] or 0,
            'by_category': list(by_category),
            'by_supplier': list(by_supplier),
        })

