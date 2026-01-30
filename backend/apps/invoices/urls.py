from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SalesInvoiceViewSet, PurchaseInvoiceViewSet, ExpenseCategoryViewSet,
    BankImportViewSet
)

router = DefaultRouter()
router.register(r'sales', SalesInvoiceViewSet, basename='sales-invoice')
router.register(r'purchase', PurchaseInvoiceViewSet, basename='purchase-invoice')
router.register(r'expense-categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'bank', BankImportViewSet, basename='bank-import')

urlpatterns = [
    path('', include(router.urls)),
    # Laikinai išjungta, kad patikrintume, ar tai sukelia problemą
    # path('payments/unpaid/', unpaid_invoices_list, name='unpaid-invoices-list'),
    # path('payments/add/', add_payment, name='add-payment'),
    # path('payments/<int:payment_id>/delete/', delete_payment, name='delete-payment'),
]

# Lazy import, kad išvengtume importavimo metu vykdomų side effect'ų
def get_payment_urls():
    from .payments_views import unpaid_invoices_list, add_payment, delete_payment, payment_statistics, mark_as_paid, mark_as_unpaid
    return [
        path('payments/unpaid/', unpaid_invoices_list, name='unpaid-invoices-list'),
        path('payments/add/', add_payment, name='add-payment'),
        path('payments/<int:payment_id>/delete/', delete_payment, name='delete-payment'),
        path('payments/statistics/', payment_statistics, name='payment-statistics'),
        path('payments/mark-as-paid/', mark_as_paid, name='mark-as-paid'),
        path('payments/mark-as-unpaid/', mark_as_unpaid, name='mark-as-unpaid'),
    ]

urlpatterns += get_payment_urls()