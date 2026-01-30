from django.contrib import admin
from .models import BlockedDomain, TrustedSender


@admin.register(BlockedDomain)
class BlockedDomainAdmin(admin.ModelAdmin):
    """Admin užblokuotiems domenams."""

    list_display = ['domain', 'created_by', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']


@admin.register(TrustedSender)
class TrustedSenderAdmin(admin.ModelAdmin):
    """Admin patikimiems siuntėjams."""

    list_display = ['email', 'created_by', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['domain']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = (
        (None, {
            'fields': ('domain', 'created_by')
        }),
        ('Laikai', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
