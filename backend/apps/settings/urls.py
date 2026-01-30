from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CompanyInfoViewSet,
    UserSettingsViewSet,
    InvoiceSettingsViewSet,
    OrderSettingsViewSet,
    # OrderAutoStatusSettingsViewSet,  # DEPRECATED
    OrderAutoStatusRuleViewSet,
    ExpeditionSettingsViewSet,
    WarehouseExpeditionSettingsViewSet,
    CostExpeditionSettingsViewSet,
    PVMRateViewSet,
    NotificationSettingsViewSet,
    UISettingsViewSet,
    EmailTemplateViewSet,
)

router = DefaultRouter()
router.register(r'company', CompanyInfoViewSet, basename='company-info')
router.register(r'user', UserSettingsViewSet, basename='user-settings')
router.register(r'invoice', InvoiceSettingsViewSet, basename='invoice-settings')
router.register(r'orders', OrderSettingsViewSet, basename='order-settings')
# router.register(r'order-auto-status', OrderAutoStatusSettingsViewSet, basename='order-auto-status-settings')  # DEPRECATED
router.register(r'order-auto-status-rules', OrderAutoStatusRuleViewSet, basename='order-auto-status-rules')
router.register(r'expedition', ExpeditionSettingsViewSet, basename='expedition-settings')
router.register(r'warehouse-expedition', WarehouseExpeditionSettingsViewSet, basename='warehouse-expedition-settings')
router.register(r'cost-expedition', CostExpeditionSettingsViewSet, basename='cost-expedition-settings')
router.register(r'pvm-rates', PVMRateViewSet, basename='pvm-rate')
router.register(r'notifications', NotificationSettingsViewSet, basename='notification-settings')
router.register(r'ui', UISettingsViewSet, basename='ui-settings')
router.register(r'email-templates', EmailTemplateViewSet, basename='email-template')

urlpatterns = [
    path('', include(router.urls)),
]

