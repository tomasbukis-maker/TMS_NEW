from django.core.management.base import BaseCommand
from apps.invoices.tasks import update_overdue_invoices


class Command(BaseCommand):
    help = 'Atnaujina vėluojančių sąskaitų statusą ir vėlavimo dienas'

    def handle(self, *args, **options):
        self.stdout.write('Pradedamas vėluojančių sąskaitų atnaujinimas...')
        result = update_overdue_invoices()
        
        self.stdout.write(
            self.style.SUCCESS(
                f'Atnaujinta: {result["sales_invoices_updated"]} pardavimo sąskaitų, '
                f'{result["purchase_invoices_updated"]} pirkimo sąskaitų'
            )
        )

