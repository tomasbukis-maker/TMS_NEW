from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PartnerViewSet, ContactViewSet, PartnerImportViewSet

router = DefaultRouter()
router.register(r'partners', PartnerViewSet, basename='partner')
router.register(r'contacts', ContactViewSet, basename='contact')
router.register(r'import', PartnerImportViewSet, basename='partner-import')

urlpatterns = [
    path('', include(router.urls)),
]

