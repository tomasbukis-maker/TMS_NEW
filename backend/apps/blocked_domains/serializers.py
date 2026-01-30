from rest_framework import serializers
from .models import BlockedDomain, TrustedSender


class BlockedDomainSerializer(serializers.ModelSerializer):
    """Serializer užblokuotiems domenams."""

    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        """Gauti vartotojo vardą saugiai."""
        if obj.created_by:
            full_name = obj.created_by.get_full_name()
            if full_name and full_name.strip():
                return full_name.strip()
            return obj.created_by.username
        return 'Nežinomas'

    class Meta:
        model = BlockedDomain
        fields = [
            'id', 'domain', 'created_at', 'updated_at',
            'created_by', 'created_by_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def create(self, validated_data):
        """Sukurti naują užblokuotą domeną."""
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class TrustedSenderSerializer(serializers.ModelSerializer):
    """Serializer patikimiems siuntėjams."""

    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        """Gauti vartotojo vardą saugiai."""
        if obj.created_by:
            full_name = obj.created_by.get_full_name()
            if full_name and full_name.strip():
                return full_name.strip()
            return obj.created_by.username
        return 'Nežinomas'

    class Meta:
        model = TrustedSender
        fields = [
            'id', 'email', 'created_at', 'updated_at',
            'created_by', 'created_by_name'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by']

    def create(self, validated_data):
        """Sukurti naują patikimą siuntėją."""
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)
