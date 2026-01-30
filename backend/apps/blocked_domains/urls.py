from rest_framework.routers import DefaultRouter
from .views import BlockedDomainViewSet, TrustedSenderViewSet

router = DefaultRouter()
router.register(r'blocked-domains', BlockedDomainViewSet)
router.register(r'trusted-senders', TrustedSenderViewSet)

urlpatterns = router.urls
