from django.core.management.base import BaseCommand
from django.db import connection


TARGET_TABLES = [
    # Partners module
    'partners',
    'contacts',
    # Orders module
    'orders',
    'order_carriers',
    'cities',
    'vehicle_types',
    'other_cost_types',
    # Invoices module
    'sales_invoices',
    'purchase_invoices',
    'expense_categories',
]


class Command(BaseCommand):
    help = 'Konvertuoja teksto laukus į utf8mb4_unicode_ci nurodytose lentelėse'

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            self.stdout.write(self.style.NOTICE('ALTER DATABASE -> utf8mb4_unicode_ci'))
            try:
                cursor.execute("SELECT DATABASE()")
                db_name = cursor.fetchone()[0]
                cursor.execute(
                    f"ALTER DATABASE `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'DB alter skip: {e}'))

            for table in TARGET_TABLES:
                self.stdout.write(self.style.NOTICE(f'Converting table {table} -> utf8mb4_unicode_ci'))
                try:
                    cursor.execute(
                        f"ALTER TABLE `{table}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    )
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Table convert skip {table}: {e}'))

                # Perrašome žinomas tekstines kolonas, jei konvertas nepadengė
                if table == 'partners':
                    cols = [
                        ('name', 'VARCHAR(255)', 'NOT NULL'),
                        ('code', 'VARCHAR(50)', 'NOT NULL'),
                        ('vat_code', 'VARCHAR(50)', 'NOT NULL'),
                        ('address', 'LONGTEXT', 'NOT NULL'),
                        ('status', 'VARCHAR(20)', 'NOT NULL'),
                        ('notes', 'LONGTEXT', 'NOT NULL'),
                    ]
                elif table == 'contacts':
                    cols = [
                        ('first_name', 'VARCHAR(100)', 'NOT NULL'),
                        ('last_name', 'VARCHAR(100)', 'NOT NULL'),
                        ('email', 'VARCHAR(254)', 'NOT NULL'),
                        ('phone', 'VARCHAR(20)', 'NOT NULL'),
                        ('position', 'VARCHAR(100)', 'NOT NULL'),
                        ('notes', 'LONGTEXT', 'NOT NULL'),
                    ]
                elif table == 'orders':
                    cols = [
                        ('route_from', 'VARCHAR(255)', 'NOT NULL'),
                        ('route_to', 'VARCHAR(255)', 'NOT NULL'),
                        ('notes', 'LONGTEXT', 'NOT NULL'),
                        ('vehicle_type', 'VARCHAR(255)', 'NULL'),
                    ]
                elif table == 'order_carriers':
                    cols = [
                        ('route_from', 'VARCHAR(255)', 'NOT NULL'),
                        ('route_to', 'VARCHAR(255)', 'NOT NULL'),
                        ('notes', 'LONGTEXT', 'NOT NULL'),
                    ]
                elif table == 'sales_invoices':
                    cols = [
                        ('invoice_number', 'VARCHAR(50)', 'NOT NULL'),
                        ('notes', 'LONGTEXT', 'NOT NULL'),
                    ]
                elif table == 'purchase_invoices':
                    cols = [
                        ('invoice_number', 'VARCHAR(50)', 'NULL'),
                        ('received_invoice_number', 'VARCHAR(50)', 'NOT NULL'),
                        ('notes', 'LONGTEXT', 'NOT NULL'),
                    ]
                elif table == 'expense_categories':
                    cols = [
                        ('name', 'VARCHAR(255)', 'NOT NULL'),
                        ('description', 'LONGTEXT', 'NOT NULL'),
                    ]
                elif table == 'cities':
                    cols = [
                        ('name', 'VARCHAR(255)', 'NOT NULL'),
                    ]
                elif table == 'vehicle_types':
                    cols = [
                        ('name', 'VARCHAR(255)', 'NOT NULL'),
                    ]
                elif table == 'other_cost_types':
                    cols = [
                        ('description', 'VARCHAR(255)', ' NOT NULL'),
                    ]
                else:
                    cols = []

                if cols:
                    alters = []
                    for name, typ, nullspec in cols:
                        alters.append(
                            f"MODIFY `{name}` {typ} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci {nullspec}"
                        )
                    try:
                        cursor.execute(f"ALTER TABLE `{table}` " + ", ".join(alters))
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(f'Cols modify skip {table}: {e}'))

        self.stdout.write(self.style.SUCCESS('Charset conversion completed'))


