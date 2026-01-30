from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ExpenseSupplierViewSet, ExpenseCategoryViewSet, ExpenseInvoiceViewSet

router = DefaultRouter()
router.register(r'suppliers', ExpenseSupplierViewSet, basename='expense-supplier')
router.register(r'categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'invoices', ExpenseInvoiceViewSet, basename='expense-invoice')

urlpatterns = [
    path('', include(router.urls)),
]

from rest_framework.routers import DefaultRouter
from .views import ExpenseSupplierViewSet, ExpenseCategoryViewSet, ExpenseInvoiceViewSet

router = DefaultRouter()
router.register(r'suppliers', ExpenseSupplierViewSet, basename='expense-supplier')
router.register(r'categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'invoices', ExpenseInvoiceViewSet, basename='expense-invoice')

urlpatterns = [
    path('', include(router.urls)),
]

