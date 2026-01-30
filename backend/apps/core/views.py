"""
Core modulio API endpoint'ai.
Testinių duomenų valdymo endpoint'ai.
Veiksmų istorijos endpoint'ai.
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework import viewsets
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q
from django.conf import settings
from apps.core.test_data import generate_all_test_data, delete_all_test_data
from apps.core.models import ActivityLog, StatusTransitionRule
from apps.core.serializers import ActivityLogSerializer, StatusTransitionRuleSerializer
import logging

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_test_data(request):
    """
    Generuoja testinius duomenis.
    Leidžiama tik DEBUG=True režime.
    """
    if not settings.DEBUG:
        return Response(
            {'error': 'Testinių duomenų generavimas leidžiamas tik DEBUG=True režime'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    count = request.data.get('count', 100)
    
    try:
        stats = generate_all_test_data(count)
        
        return Response({
            'success': True,
            'message': f'Sukurta {stats["orders"]} užsakymų ir {stats["invoices"]} sąskaitų',
            'stats': {
                'orders': stats['orders'],
                'invoices': stats['invoices'],
            },
            'errors': stats.get('errors', [])
        }, status=status.HTTP_200_OK)
        
    except ValueError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"Error generating test data: {str(e)}", exc_info=True)
        return Response(
            {'error': f'Klaida: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def delete_test_data(request):
    """
    Ištrina visus testinius duomenis.
    Leidžiama tik DEBUG=True režime.
    """
    if not settings.DEBUG:
        return Response(
            {'error': 'Testinių duomenų ištrynimas leidžiamas tik DEBUG=True režime'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    try:
        stats = delete_all_test_data()
        
        return Response({
            'success': True,
            'message': f'Ištrinta {stats["orders_deleted"]} užsakymų ir {stats["invoices_deleted"]} sąskaitų',
            'stats': {
                'orders_deleted': stats['orders_deleted'],
                'invoices_deleted': stats['invoices_deleted'],
            },
            'errors': stats.get('errors', [])
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"Error deleting test data: {str(e)}", exc_info=True)
        return Response(
            {'error': f'Klaida: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_status(request):
    """
    Pakeisti objekto statusą per StatusService
    POST /api/core/status/change/
    Body: {
        "entity_type": "order" | "sales_invoice" | "purchase_invoice" | "order_carrier" | "order_cost",
        "entity_id": 123,
        "new_status": "finished",
        "reason": "Pakeitimo priežastis (optional)"
    }
    """
    try:
        # Lazy import, kad išvengtume cikliško import'o
        from apps.core.services.status_service import StatusService
        
        entity_type = request.data.get('entity_type')
        entity_id = request.data.get('entity_id')
        new_status = request.data.get('new_status')
        reason = request.data.get('reason', '')
        
        if not entity_type or not entity_id or not new_status:
            return Response(
                {'error': 'Trūksta reikalingų duomenų (entity_type, entity_id, new_status)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Naudoti StatusService
        result = StatusService.change_status(
            entity_type=entity_type,
            entity_id=entity_id,
            new_status=new_status,
            user=request.user,
            reason=reason,
            request=request
        )
        
        return Response({
            'success': True,
            'old_status': result['old_status'],
            'new_status': result['new_status'],
            'message': result['message']
        })
    except ValueError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )
    except Exception as e:
        logger.error(f"Error changing status: {e}", exc_info=True)
        return Response(
            {'error': f'Klaida keičiant statusą: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_allowed_transitions(request):
    """
    Gauti leistinus statusų perėjimus
    GET /api/core/status/allowed-transitions/?entity_type=order&current_status=new
    """
    try:
        # Lazy import, kad išvengtume cikliško import'o
        from apps.core.services.status_service import StatusService
        
        entity_type = request.query_params.get('entity_type')
        current_status = request.query_params.get('current_status')
        
        if not entity_type or not current_status:
            return Response(
                {'error': 'Trūksta reikalingų parametrų (entity_type, current_status)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        allowed = StatusService.get_allowed_transitions(entity_type, current_status)
        
        return Response({
            'entity_type': entity_type,
            'current_status': current_status,
            'allowed_transitions': allowed
        })
    except Exception as e:
        logger.error(f"Error getting allowed transitions: {e}", exc_info=True)
        return Response(
            {'error': f'Klaida gaunant leistinus perėjimus: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


class ActivityLogPagination(PageNumberPagination):
    """Paginacija veiksmų istorijai"""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000


class ActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Veiksmų istorijos ViewSet - tik skaitymas
    """
    serializer_class = ActivityLogSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ActivityLogPagination
    
    def get_queryset(self):
        """Filtruoti veiksmų istoriją pagal parametrus"""
        queryset = ActivityLog.objects.all().select_related('user', 'content_type').order_by('-created_at')
        
        # Filtravimas pagal veiksmo tipą
        action_type = self.request.query_params.get('action_type', None)
        if action_type:
            queryset = queryset.filter(action_type=action_type)
        
        # Filtravimas pagal vartotoją
        user_id = self.request.query_params.get('user_id', None)
        if user_id:
            queryset = queryset.filter(user_id=user_id)
        
        # Filtravimas pagal susijusį objektą
        content_type = self.request.query_params.get('content_type', None)
        object_id = self.request.query_params.get('object_id', None)
        if content_type and object_id:
            queryset = queryset.filter(content_type__model=content_type, object_id=object_id)
        
        # Filtravimas pagal datą
        date_from = self.request.query_params.get('date_from', None)
        date_to = self.request.query_params.get('date_to', None)
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        # Paieška pagal aprašymą
        search = self.request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(description__icontains=search)
        
        return queryset


class StatusTransitionRuleViewSet(viewsets.ModelViewSet):
    """
    Statusų perėjimų taisyklių ViewSet
    """
    queryset = StatusTransitionRule.objects.all()
    serializer_class = StatusTransitionRuleSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filtruoti taisykles pagal parametrus"""
        queryset = super().get_queryset()
        
        # Filtravimas pagal entity_type
        entity_type = self.request.query_params.get('entity_type', None)
        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)
        
        # Filtravimas pagal is_active
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            is_active_bool = is_active.lower() in ['true', '1', 'yes']
            queryset = queryset.filter(is_active=is_active_bool)
        
        return queryset.order_by('entity_type', 'order', 'current_status')
    
    def perform_create(self, serializer):
        """Sukurti taisyklę ir išvalyti StatusService cache'ą"""
        instance = serializer.save()
        # Išvalyti cache'ą, kad naujos taisyklės būtų naudojamos
        from apps.core.services.status_service import StatusService
        StatusService.clear_cache()
        return instance
    
    def perform_update(self, serializer):
        """Atnaujinti taisyklę ir išvalyti StatusService cache'ą"""
        instance = serializer.save()
        # Išvalyti cache'ą, kad atnaujintos taisyklės būtų naudojamos
        from apps.core.services.status_service import StatusService
        StatusService.clear_cache()
        return instance
    
    def perform_destroy(self, instance):
        """Ištrinti taisyklę ir išvalyti StatusService cache'ą"""
        instance.delete()
        # Išvalyti cache'ą, kad pakeitimai būtų matomi
        from apps.core.services.status_service import StatusService
        StatusService.clear_cache()


