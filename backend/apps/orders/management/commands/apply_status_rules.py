from django.core.management.base import BaseCommand
from django.db import transaction
from apps.orders.models import Order
from apps.orders.signals import auto_update_order_status


class Command(BaseCommand):
    help = 'Apply automatic status change rules to all existing orders'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without actually changing anything',
        )
        parser.add_argument(
            '--status',
            type=str,
            help='Apply rules only to orders with specific status (e.g., "new", "assigned")',
        )
        parser.add_argument(
            '--order-number',
            type=str,
            help='Apply rules only to specific order number',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        # Filter orders based on arguments
        orders = Order.objects.all()

        if options['status']:
            orders = orders.filter(status=options['status'])

        if options['order_number']:
            orders = orders.filter(order_number=options['order_number'])

        total_orders = orders.count()

        if total_orders == 0:
            self.stdout.write(
                self.style.WARNING('No orders found matching the criteria.')
            )
            return

        self.stdout.write(
            self.style.SUCCESS(f'Found {total_orders} orders to process.')
        )

        if dry_run:
            self.stdout.write(
                self.style.WARNING('DRY RUN MODE - No changes will be made.')
            )

        processed = 0
        updated = 0
        skipped = 0

        for order in orders:
            old_status = order.status

            if dry_run:
                # Simulate the status update
                try:
                    # Create a temporary copy to test the rules
                    temp_order = Order.objects.get(pk=order.pk)
                    auto_update_order_status(Order, temp_order)
                    new_status = temp_order.status
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'Error simulating rule application for order {order.order_number}: {e}')
                    )
                    continue
            else:
                # Actually apply the rules
                try:
                    order.save()  # This will trigger the auto_update_order_status signal
                    order.refresh_from_db()
                    new_status = order.status
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'Error applying rules to order {order.order_number}: {e}')
                    )
                    continue

            processed += 1

            if old_status != new_status:
                updated += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Updated: {order.order_number} | {old_status} → {new_status}'
                    )
                )
            else:
                skipped += 1
                if not dry_run and options.get('verbosity', 1) >= 2:
                    self.stdout.write(
                        f'No change: {order.order_number} | {old_status}'
                    )

            # Show progress every 100 orders
            if processed % 100 == 0:
                self.stdout.write(f'Processed {processed}/{total_orders} orders...')

        # Summary
        self.stdout.write('\n' + '='*50)
        self.stdout.write(
            self.style.SUCCESS(
                f'SUMMARY: Processed {processed} orders, Updated {updated}, Skipped {skipped}'
            )
        )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    'This was a dry run. Run without --dry-run to apply changes.'
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS('All status rules have been applied!')
            )