from django.contrib import admin
from .models import ExpenseSupplier, ExpenseCategory, ExpenseInvoice


@admin.register(ExpenseSupplier)
class ExpenseSupplierAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'status', 'created_at']
    list_filter = ['status']
    search_fields = ['name', 'code', 'vat_code']


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name']


@admin.register(ExpenseInvoice)
class ExpenseInvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'supplier', 'category', 'amount_total', 'payment_status', 'issue_date']
    list_filter = ['payment_status', 'category', 'issue_date']
    search_fields = ['invoice_number', 'supplier__name']
    date_hierarchy = 'issue_date'

