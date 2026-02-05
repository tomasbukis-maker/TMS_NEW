# Fix: add vat_amount and amount_with_vat to order_costs if missing
# (e.g. when 0060 was marked applied but DB was restored or migrated elsewhere)

from django.db import migrations


def add_vat_columns_if_missing(apps, schema_editor):
    """Add vat_amount and amount_with_vat to order_costs only if they don't exist."""
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'order_costs'
              AND COLUMN_NAME IN ('vat_amount', 'amount_with_vat')
        """)
        existing = {row[0] for row in cursor.fetchall()}

        if 'vat_amount' not in existing:
            cursor.execute(
                "ALTER TABLE order_costs ADD COLUMN vat_amount DECIMAL(10,2) NULL"
            )
        if 'amount_with_vat' not in existing:
            cursor.execute(
                "ALTER TABLE order_costs ADD COLUMN amount_with_vat DECIMAL(10,2) NULL"
            )


def noop_reverse(apps, schema_editor):
    """No reverse: we don't drop columns to avoid data loss."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0066_add_new_order_statuses'),
    ]

    operations = [
        migrations.RunPython(add_vat_columns_if_missing, noop_reverse),
    ]
