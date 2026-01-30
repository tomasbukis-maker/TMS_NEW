# Generated migration to create default status transition rules

from django.db import migrations


def create_default_status_rules(apps, schema_editor):
    """Sukurti numatytąsias statusų perėjimų taisykles"""
    StatusTransitionRule = apps.get_model('core', 'StatusTransitionRule')
    
    # Patikrinti, ar jau yra taisyklių
    if StatusTransitionRule.objects.exists():
        return  # Jei jau yra, nieko nedaryti
    
    default_rules = [
        # Order statusai
        {'entity_type': 'order', 'current_status': 'new', 'allowed_next_statuses': ['assigned', 'executing', 'canceled'], 'order': 1},
        {'entity_type': 'order', 'current_status': 'assigned', 'allowed_next_statuses': ['executing', 'waiting_for_docs', 'canceled'], 'order': 2},
        {'entity_type': 'order', 'current_status': 'executing', 'allowed_next_statuses': ['waiting_for_docs', 'finished', 'canceled'], 'order': 3},
        {'entity_type': 'order', 'current_status': 'waiting_for_docs', 'allowed_next_statuses': ['finished', 'executing', 'canceled'], 'order': 4},
        {'entity_type': 'order', 'current_status': 'finished', 'allowed_next_statuses': [], 'order': 5},
        {'entity_type': 'order', 'current_status': 'canceled', 'allowed_next_statuses': [], 'order': 6},
        
        # Sales Invoice payment statusai
        {'entity_type': 'sales_invoice', 'current_status': 'unpaid', 'allowed_next_statuses': ['partially_paid', 'paid', 'overdue'], 'order': 1},
        {'entity_type': 'sales_invoice', 'current_status': 'partially_paid', 'allowed_next_statuses': ['paid', 'unpaid', 'overdue'], 'order': 2},
        {'entity_type': 'sales_invoice', 'current_status': 'paid', 'allowed_next_statuses': ['unpaid', 'partially_paid'], 'order': 3},
        {'entity_type': 'sales_invoice', 'current_status': 'overdue', 'allowed_next_statuses': ['paid', 'partially_paid', 'unpaid'], 'order': 4},
        
        # Purchase Invoice payment statusai
        {'entity_type': 'purchase_invoice', 'current_status': 'unpaid', 'allowed_next_statuses': ['partially_paid', 'paid', 'overdue'], 'order': 1},
        {'entity_type': 'purchase_invoice', 'current_status': 'partially_paid', 'allowed_next_statuses': ['paid', 'unpaid', 'overdue'], 'order': 2},
        {'entity_type': 'purchase_invoice', 'current_status': 'paid', 'allowed_next_statuses': ['unpaid', 'partially_paid'], 'order': 3},
        {'entity_type': 'purchase_invoice', 'current_status': 'overdue', 'allowed_next_statuses': ['paid', 'partially_paid', 'unpaid'], 'order': 4},
        
        # OrderCarrier payment statusai
        {'entity_type': 'order_carrier', 'current_status': 'not_paid', 'allowed_next_statuses': ['partially_paid', 'paid'], 'order': 1},
        {'entity_type': 'order_carrier', 'current_status': 'partially_paid', 'allowed_next_statuses': ['paid', 'not_paid'], 'order': 2},
        {'entity_type': 'order_carrier', 'current_status': 'paid', 'allowed_next_statuses': ['not_paid', 'partially_paid'], 'order': 3},
        
        # OrderCost statusai
        {'entity_type': 'order_cost', 'current_status': 'new', 'allowed_next_statuses': ['in_progress', 'completed', 'cancelled'], 'order': 1},
        {'entity_type': 'order_cost', 'current_status': 'in_progress', 'allowed_next_statuses': ['completed', 'cancelled', 'new'], 'order': 2},
        {'entity_type': 'order_cost', 'current_status': 'completed', 'allowed_next_statuses': [], 'order': 3},
        {'entity_type': 'order_cost', 'current_status': 'cancelled', 'allowed_next_statuses': ['new', 'in_progress'], 'order': 4},
    ]
    
    for rule_data in default_rules:
        StatusTransitionRule.objects.create(**rule_data)


def reverse_create_default_status_rules(apps, schema_editor):
    """Reverse migracija - nieko nedaryti (taisykles gali būti ištrintos rankiniu būdu)"""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_add_status_transition_rules'),
    ]

    operations = [
        migrations.RunPython(
            code=create_default_status_rules,
            reverse_code=reverse_create_default_status_rules,
        ),
    ]
