"""
Core modulio URL konfigūracija.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    generate_test_data, delete_test_data, ActivityLogViewSet,
    change_status, get_allowed_transitions, StatusTransitionRuleViewSet
)

router = DefaultRouter()
router.register(r'activity-logs', ActivityLogViewSet, basename='activity-log')
router.register(r'status-transition-rules', StatusTransitionRuleViewSet, basename='status-transition-rule')

app_name = 'core'

urlpatterns = [
    path('test-data/generate/', generate_test_data, name='generate-test-data'),
    path('test-data/delete/', delete_test_data, name='delete-test-data'),
    path('status/change/', change_status, name='change-status'),
    path('status/allowed-transitions/', get_allowed_transitions, name='allowed-transitions'),
    path('', include(router.urls)),
]






