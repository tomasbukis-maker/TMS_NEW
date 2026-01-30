import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from orders.models import Expedition

exp = Expedition.objects.filter(expedition_number__icontains='Eineros').first()
if exp:
    print(f'ID: {exp.id}')
    print(f'Loading date: {exp.loading_date}')
    print(f'Loading from: {exp.loading_date_from}')
    print(f'Loading to: {exp.loading_date_to}')
    print(f'Unloading date: {exp.unloading_date}')
    print(f'Unloading from: {exp.unloading_date_from}')
    print(f'Unloading to: {exp.unloading_date_to}')
else:
    print('Expedition not found')
