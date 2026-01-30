from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OrderViewSet,
    OrderCarrierViewSet,
    OrderCostViewSet,
    OrderCarrierDocumentViewSet,
    CityViewSet,
    VehicleTypeViewSet,
    OtherCostTypeViewSet,
    CargoItemViewSet,
    AutocompleteSuggestionViewSet,
    RouteContactViewSet,
    RouteStopViewSet,
)

router = DefaultRouter()
router.register(r'orders', OrderViewSet, basename='order')
router.register(r'autocomplete', AutocompleteSuggestionViewSet, basename='autocomplete')
router.register(r'route-contacts', RouteContactViewSet, basename='route-contact')
router.register(r'carriers', OrderCarrierViewSet, basename='order-carrier')
router.register(r'order-costs', OrderCostViewSet, basename='order-cost')
router.register(r'carrier-documents', OrderCarrierDocumentViewSet, basename='order-carrier-document')
router.register(r'cargo-items', CargoItemViewSet, basename='cargo-item')
router.register(r'route-stops', RouteStopViewSet, basename='route-stop')
router.register(r'cities', CityViewSet, basename='city')
router.register(r'vehicle-types', VehicleTypeViewSet, basename='vehicletype')
router.register(r'other-cost-types', OtherCostTypeViewSet, basename='othercosttype')

urlpatterns = [
    path('', include(router.urls)),
]

