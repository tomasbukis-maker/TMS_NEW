from django.db import migrations, models


def migrate_order_type_forward(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    mapping = {
        'transport': 'Transportas',
        'logistics': 'Logistika',
        'other': 'Kita',
    }
    for order in Order.objects.all():
        original = order.order_type or ''
        transformed = mapping.get(original, original)
        if transformed != original:
            order.order_type = transformed
            order.save(update_fields=['order_type'])


def migrate_order_type_backward(apps, schema_editor):
    Order = apps.get_model('orders', 'Order')
    reverse_mapping = {
        'Transportas': 'transport',
        'Logistika': 'logistics',
        'Kita': 'other',
    }
    for order in Order.objects.all():
        original = order.order_type or ''
        transformed = reverse_mapping.get(original, original)
        if transformed != original:
            order.order_type = transformed
            order.save(update_fields=['order_type'])


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0034_remove_ordercarrier_documents_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='order',
            name='order_type',
            field=models.CharField(
                blank=True,
                default='',
                max_length=100,
                verbose_name='Užsakymo tipas',
            ),
        ),
        migrations.RunPython(migrate_order_type_forward, migrate_order_type_backward),
    ]

