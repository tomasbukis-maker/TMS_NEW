import os
import django
import sys

# Nustatome Django aplinką
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from apps.orders.models import OrderCarrier

def check_carriers():
    print("--- Paskutiniai vežėjų įrašai ---")
    carriers = OrderCarrier.objects.order_by('-id')[:5]
    for c in carriers:
        print(f"ID: {c.id}, Partner: {c.partner.name}, Payment Terms: '{c.payment_terms}'")

if __name__ == "__main__":
    check_carriers()
