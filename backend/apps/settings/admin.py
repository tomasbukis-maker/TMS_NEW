from django.contrib import admin
from .models import CompanyInfo, UserSettings, InvoiceSettings, EmailTemplate, ExpeditionSettings, WarehouseExpeditionSettings, CostExpeditionSettings, OrderSettings, OrderAutoStatusSettings, OrderAutoStatusRule


@admin.register(CompanyInfo)
class CompanyInfoAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'city', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Pagrindinė informacija', {
            'fields': ('name', 'code', 'vat_code')
        }),
        ('Adresas', {
            'fields': ('address', 'city', 'postal_code', 'country')
        }),
        ('Kontaktai', {
            'fields': ('phone', 'email')
        }),
        ('Banko informacija', {
            'fields': ('bank_name', 'bank_account', 'bank_code')
        }),
        ('Kita', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ['user', 'language', 'date_format', 'timezone', 'updated_at']
    list_filter = ['language', 'date_format', 'timezone']
    readonly_fields = ['created_at', 'updated_at']
    search_fields = ['user__username', 'user__email']


@admin.register(InvoiceSettings)
class InvoiceSettingsAdmin(admin.ModelAdmin):
    list_display = ['default_vat_rate', 'default_payment_term_days', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Numatytieji nustatymai', {
            'fields': ('default_vat_rate', 'default_payment_term_days')
        }),
        ('Numeravimas', {
            'fields': ('invoice_prefix_sales', 'invoice_prefix_purchase', 'auto_numbering')
        }),
        ('Kita', {
            'fields': ('invoice_footer_text', 'notes', 'created_at', 'updated_at')
        }),
    )


@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ['template_type', 'is_active', 'updated_at']
    list_filter = ['template_type', 'is_active']
    readonly_fields = ['created_at', 'updated_at']
    search_fields = ['subject', 'body_text']
    fieldsets = (
        ('Pagrindinė informacija', {
            'fields': ('template_type', 'is_active')
        }),
        ('Turinys', {
            'fields': ('subject', 'body_text', 'body_html')
        }),
        ('Kita', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(OrderSettings)
class OrderSettingsAdmin(admin.ModelAdmin):
    list_display = ['order_prefix', 'order_number_width', 'auto_numbering', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Užsakymų numeravimo nustatymai', {
            'fields': ('order_prefix', 'order_number_width', 'auto_numbering')
        }),
        ('Finansiniai nustatymai', {
            'fields': ('my_price_percentage', 'payment_terms')
        }),
        ('Vežėjų įsipareigojimai', {
            'fields': ('carrier_obligations',)
        }),
        ('Kliento įsipareigojimai', {
            'fields': ('client_obligations',)
        }),
        ('Kita', {
            'fields': ('notes', 'created_at', 'updated_at')
        }),
    )


@admin.register(ExpeditionSettings)
class ExpeditionSettingsAdmin(admin.ModelAdmin):
    list_display = ['expedition_prefix', 'expedition_number_width', 'auto_numbering', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Vežėjų ekspedicijų nustatymai', {
            'fields': ('expedition_prefix', 'expedition_number_width', 'auto_numbering')
        }),
        ('Kita', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(WarehouseExpeditionSettings)
class WarehouseExpeditionSettingsAdmin(admin.ModelAdmin):
    list_display = ['expedition_prefix', 'expedition_number_width', 'auto_numbering', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Sandėlių ekspedicijų nustatymai', {
            'fields': ('expedition_prefix', 'expedition_number_width', 'auto_numbering')
        }),
        ('Kita', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(CostExpeditionSettings)
class CostExpeditionSettingsAdmin(admin.ModelAdmin):
    list_display = ['expedition_prefix', 'expedition_number_width', 'auto_numbering', 'updated_at']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Išlaidų numeravimo nustatymai', {
            'fields': ('expedition_prefix', 'expedition_number_width', 'auto_numbering')
        }),
        ('Kita', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(OrderAutoStatusSettings)
class OrderAutoStatusSettingsAdmin(admin.ModelAdmin):
    list_display = ['enabled', 'auto_new_to_assigned', 'auto_assigned_to_executing', 'auto_executing_to_waiting', 'auto_waiting_to_payment', 'auto_payment_to_finished', 'auto_finished_to_closed', 'days_after_unloading']
    fieldsets = (
        ('Bendri nustatymai', {
            'fields': ('enabled',)
        }),
        ('Automatiniai statusų keitimai', {
            'fields': (
                'auto_new_to_assigned',
                'auto_assigned_to_executing',
                'auto_executing_to_waiting',
                'days_after_unloading',
                'auto_waiting_to_payment',
                'auto_payment_to_finished',
                'auto_finished_to_closed',
            )
        }),
    )

    def has_add_permission(self, request):
        # Neleisti pridėti naujų įrašų, nes tai singleton
        return not OrderAutoStatusSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        # Neleisti trinti įrašų
        return False


@admin.register(OrderAutoStatusRule)
class OrderAutoStatusRuleAdmin(admin.ModelAdmin):
    list_display = ['from_status', 'to_status', 'get_conditions_count', 'logic_operator', 'enabled', 'priority', 'updated_at']
    list_filter = ['enabled', 'logic_operator', 'from_status', 'to_status']
    search_fields = ['from_status', 'to_status']
    ordering = ['-priority', 'from_status']
    fieldsets = (
        ('Taisyklė', {
            'fields': ('from_status', 'to_status', 'conditions', 'logic_operator', 'enabled', 'priority')
        }),
        ('Kita', {
            'fields': ('created_at', 'updated_at')
        }),
    )
    readonly_fields = ['created_at', 'updated_at']

    def get_conditions_count(self, obj):
        return len(obj.conditions) if obj.conditions else 0
    get_conditions_count.short_description = 'Sąlygų kiekis'
