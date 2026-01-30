from django.contrib import admin
from .models import Order, OrderCarrier, City, VehicleType, OtherCostType


@admin.register(City)
class CityAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_at']
    search_fields = ['name']
    ordering = ['name']


@admin.register(VehicleType)
class VehicleTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_at']
    search_fields = ['name']
    ordering = ['name']


@admin.register(OtherCostType)
class OtherCostTypeAdmin(admin.ModelAdmin):
    list_display = ['description', 'created_at']
    search_fields = ['description']
    ordering = ['description']


class OrderCarrierInline(admin.TabularInline):
    model = OrderCarrier
    extra = 0
    fields = ['partner', 'carrier_type', 'expedition_number', 'sequence_order', 'price_net', 'status', 'invoice_issued', 'invoice_received', 'payment_status']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'order_number', 'client', 'status', 'manager', 'price_net', 'route_from', 'route_to', 'created_at'
    ]
    list_filter = ['status', 'order_type', 'manager', 'created_at']
    search_fields = ['order_number', 'client__name', 'client__code', 'route_from', 'route_to']
    readonly_fields = ['created_at', 'updated_at', 'created_by']
    fieldsets = (
        ('Pagrindinė informacija', {
            'fields': ('client', 'order_type', 'status', 'manager')
        }),
        ('Finansinė informacija', {
            'fields': ('price_net', 'vat_rate')
        }),
        ('Maršrutas', {
            'fields': ('route_from', 'route_to', 'loading_date', 'unloading_date')
        }),
        ('Kita', {
            'fields': ('notes', 'created_by', 'created_at', 'updated_at')
        }),
    )
    inlines = [OrderCarrierInline]
    
    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(OrderCarrier)
class OrderCarrierAdmin(admin.ModelAdmin):
    list_display = ['order', 'partner', 'carrier_type', 'expedition_number', 'sequence_order', 'price_net', 'status', 'payment_status']
    list_filter = ['carrier_type', 'status', 'payment_status', 'invoice_issued', 'created_at']
    search_fields = ['order__id', 'partner__name', 'partner__code', 'expedition_number']
    readonly_fields = ['created_at', 'updated_at']
