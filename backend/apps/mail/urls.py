from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    MailAttachmentViewSet,
    MailMessageViewSet,
    MailSenderViewSet,
    MailSyncStateViewSet,
    MailTagViewSet,
    EmailLogViewSet,
)

router = DefaultRouter()
router.register(r'messages', MailMessageViewSet, basename='mail-message')
router.register(r'attachments', MailAttachmentViewSet, basename='mail-attachment')
router.register(r'senders', MailSenderViewSet, basename='mail-sender')
router.register(r'tags', MailTagViewSet, basename='mail-tag')
router.register(r'sync-state', MailSyncStateViewSet, basename='mail-sync-state')
router.register(r'email-logs', EmailLogViewSet, basename='email-log')

urlpatterns = [
    path('', include(router.urls)),
]

