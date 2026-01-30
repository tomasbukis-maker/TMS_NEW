from django.contrib import admin
from .models import Partner, Contact


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ['first_name', 'last_name', 'email', 'phone', 'position', 'is_trusted', 'is_advertising']
    search_fields = ['first_name', 'last_name', 'email', 'phone']
    list_filter = ['position', 'is_trusted', 'is_advertising', 'partner']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Partner)
class PartnerAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'vat_code', 'is_client', 'is_supplier', 'status', 'created_at']
    search_fields = ['name', 'code', 'vat_code']
    list_filter = ['is_client', 'is_supplier', 'status']
    fieldsets = (
        ('Pagrindinė informacija', {
            'fields': ('name', 'code', 'vat_code', 'address')
        }),
        ('Tipas', {
            'fields': ('is_client', 'is_supplier')
        }),
        ('Kontaktai', {
            'fields': ('contact_person', 'payment_term_days')
        }),
        ('Kita', {
            'fields': ('status', 'notes')
        }),
    )

