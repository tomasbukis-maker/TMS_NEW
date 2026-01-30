"""
Core serializers
"""
from rest_framework import serializers
from .models import ActivityLog, StatusTransitionRule


class ActivityLogSerializer(serializers.ModelSerializer):
    """Veiksmų istorijos serializer"""
    
    action_type_display = serializers.CharField(
        source='get_action_type_display',
        read_only=True
    )
    user_display = serializers.SerializerMethodField()
    content_object_info = serializers.SerializerMethodField()
    
    class Meta:
        model = ActivityLog
        fields = [
            'id',
            'action_type',
            'action_type_display',
            'description',
            'content_type',
            'object_id',
            'content_object_info',
            'metadata',
            'user',
            'user_display',
            'user_name',
            'ip_address',
            'user_agent',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
        ]
    
    def get_user_display(self, obj):
        """Grąžina vartotojo vardą"""
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return obj.user_name or 'Sistema'
    
    def get_content_object_info(self, obj):
        """Grąžina susijusio objekto informaciją"""
        if not obj.content_type or not obj.object_id:
            return None
        
        try:
            model_class = obj.content_type.model_class()
            instance = model_class.objects.get(pk=obj.object_id)
            
            # Grąžinti pagrindinę informaciją priklausomai nuo modelio
            info = {
                'model': obj.content_type.model,
                'id': obj.object_id,
            }
            
            # Pridėti specifinę informaciją pagal modelį
            if hasattr(instance, 'order_number'):
                info['order_number'] = instance.order_number
            elif hasattr(instance, 'invoice_number'):
                info['invoice_number'] = instance.invoice_number
            elif hasattr(instance, 'received_invoice_number'):
                info['invoice_number'] = instance.received_invoice_number
            elif hasattr(instance, 'name'):
                info['name'] = instance.name
            
            return info
        except Exception:
            return {
                'model': obj.content_type.model,
                'id': obj.object_id,
                'error': 'Objektas nebeegzistuoja'
            }


class StatusTransitionRuleSerializer(serializers.ModelSerializer):
    """Statusų perėjimų taisyklių serializer"""
    
    entity_type_display = serializers.CharField(
        source='get_entity_type_display',
        read_only=True
    )
    
    class Meta:
        model = StatusTransitionRule
        fields = [
            'id',
            'entity_type',
            'entity_type_display',
            'current_status',
            'allowed_next_statuses',
            'is_active',
            'order',
            'description',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'created_at',
            'updated_at',
        ]
    
    def validate_allowed_next_statuses(self, value):
        """Validuoti, kad allowed_next_statuses yra masyvas"""
        if not isinstance(value, list):
            raise serializers.ValidationError("Leistini statusai turi būti masyvas")
        return value
