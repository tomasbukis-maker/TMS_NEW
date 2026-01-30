from django.contrib import admin

from .models import MailAttachment, MailMessage, MailMessageTag, MailSender, MailSyncState, MailTag, EmailLog


@admin.register(MailMessage)
class MailMessageAdmin(admin.ModelAdmin):
    list_display = ('id', 'subject', 'sender', 'sender_email', 'date', 'status', 'folder')
    list_filter = ('status', 'folder', 'date')
    search_fields = ('subject', 'sender', 'recipients', 'message_id', 'uid')
    ordering = ('-date',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(MailAttachment)
class MailAttachmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'filename', 'content_type', 'size', 'mail_message')
    search_fields = ('filename', 'content_type')
    readonly_fields = ('created_at',)


@admin.register(MailTag)
class MailTagAdmin(admin.ModelAdmin):
    list_display = ('name', 'color', 'description')
    search_fields = ('name',)


@admin.register(MailMessageTag)
class MailMessageTagAdmin(admin.ModelAdmin):
    list_display = ('mail_message', 'tag', 'applied_at')
    list_filter = ('tag',)


@admin.register(MailSyncState)
class MailSyncStateAdmin(admin.ModelAdmin):
    list_display = ('folder', 'last_synced_at', 'last_uid', 'status', 'updated_at')
    search_fields = ('folder', 'status', 'last_uid')
    readonly_fields = ('updated_at',)


@admin.register(EmailLog)
class EmailLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'email_type', 'subject', 'recipient_email', 'status', 'sent_at', 'created_at')
    list_filter = ('email_type', 'status', 'created_at')
    search_fields = ('subject', 'recipient_email', 'recipient_name')
    readonly_fields = ('created_at', 'updated_at', 'sent_at')
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'


@admin.register(MailSender)
class MailSenderAdmin(admin.ModelAdmin):
    list_display = ('email', 'name', 'is_trusted', 'is_advertising', 'created_at')
    list_filter = ('is_trusted', 'is_advertising', 'created_at')
    search_fields = ('email', 'name')
    readonly_fields = ('created_at', 'updated_at')

