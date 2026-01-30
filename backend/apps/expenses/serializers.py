from rest_framework import serializers
from .models import ExpenseSupplier, ExpenseCategory, ExpenseInvoice


class ExpenseSupplierSerializer(serializers.ModelSerializer):
    """Išlaidų tiekėjų serializer"""
    
    class Meta:
        model = ExpenseSupplier
        fields = [
            'id', 'name', 'code', 'vat_code', 'address', 'phone', 'email',
            'contact_person', 'payment_term_days', 'bank_account', 'status', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """Išlaidų kategorijų serializer"""
    
    class Meta:
        model = ExpenseCategory
        fields = ['id', 'name', 'description', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class ExpenseInvoiceSerializer(serializers.ModelSerializer):
    """Išlaidų sąskaitų serializer"""
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    payment_status_display = serializers.CharField(source='get_payment_status_display', read_only=True)
    invoice_file_url = serializers.SerializerMethodField()
    
    class Meta:
        model = ExpenseInvoice
        fields = [
            'id', 'invoice_number', 'supplier', 'supplier_name', 'category', 'category_name',
            'amount_net', 'vat_rate', 'vat_amount', 'amount_total', 'currency',
            'issue_date', 'due_date', 'payment_date', 'payment_status', 'payment_status_display',
            'payment_method', 'invoice_file', 'invoice_file_url', 'notes', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_invoice_file_url(self, obj):
        """Grąžinti pilną URL failui"""
        if obj.invoice_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.invoice_file.url)
            return obj.invoice_file.url
        return None

