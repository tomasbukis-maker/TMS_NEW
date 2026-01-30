from django.contrib import admin
from .models import (
    SalesInvoice, PurchaseInvoice, ExpenseCategory, InvoiceNumberSequence, InvoiceReminder
)


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'description', 'created_at']
    search_fields = ['name', 'description']


@admin.register(SalesInvoice)
class SalesInvoiceAdmin(admin.ModelAdmin):
    list_display = [
        'invoice_number', 'partner', 'invoice_type', 'payment_status',
        'amount_total', 'due_date', 'overdue_days', 'issue_date'
    ]
    list_filter = ['invoice_type', 'payment_status', 'issue_date', 'due_date']
    search_fields = ['invoice_number', 'partner__name', 'partner__code']
    readonly_fields = ['created_at', 'updated_at', 'invoice_number']
    fieldsets = (
        ('Pagrindinė informacija', {
            'fields': ('invoice_number', 'invoice_type', 'partner', 'related_order')
        }),
        ('Finansinė informacija', {
            'fields': ('amount_net', 'vat_rate', 'amount_total', 'payment_status')
        }),
        ('Datės', {
            'fields': ('issue_date', 'due_date', 'payment_date')
        }),
        ('Kita', {
            'fields': ('credit_invoice', 'overdue_days', 'notes', 'created_at', 'updated_at')
        }),
    )


@admin.register(PurchaseInvoice)
class PurchaseInvoiceAdmin(admin.ModelAdmin):
    list_display = [
        'invoice_number', 'partner', 'payment_status',
        'amount_total', 'due_date', 'overdue_days', 'expense_category', 'issue_date'
    ]
    list_filter = ['payment_status', 'expense_category', 'issue_date', 'due_date']
    search_fields = ['invoice_number', 'partner__name', 'partner__code']
    readonly_fields = ['created_at', 'updated_at', 'invoice_number']
    fieldsets = (
        ('Pagrindinė informacija', {
            'fields': ('invoice_number', 'partner', 'related_order', 'expense_category')
        }),
        ('Finansinė informacija', {
            'fields': ('amount_net', 'vat_rate', 'amount_total', 'payment_status')
        }),
        ('Datės', {
            'fields': ('issue_date', 'due_date', 'payment_date')
        }),
        ('Kita', {
            'fields': ('overdue_days', 'notes', 'created_at', 'updated_at')
        }),
    )


@admin.register(InvoiceNumberSequence)
class InvoiceNumberSequenceAdmin(admin.ModelAdmin):
    list_display = ['year', 'last_number', 'updated_at']
    readonly_fields = ['updated_at']


@admin.register(InvoiceReminder)
class InvoiceReminderAdmin(admin.ModelAdmin):
    list_display = ['invoice', 'reminder_type', 'last_sent_at', 'sent_count', 'created_at']
    list_filter = ['reminder_type', 'last_sent_at']
    search_fields = ['invoice__invoice_number', 'invoice__partner__name']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Pagrindinė informacija', {
            'fields': ('invoice', 'reminder_type')
        }),
        ('Siuntimo informacija', {
            'fields': ('last_sent_at', 'sent_count')
        }),
        ('Kita', {
            'fields': ('created_at', 'updated_at')
        }),
    )

