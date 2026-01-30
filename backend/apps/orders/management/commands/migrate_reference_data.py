"""
Migracijos scriptas, kuris ištraukia unikalias reikšmes iš Order lentelės
ir užpildo City, VehicleType, OtherCostType lenteles
"""
from django.core.management.base import BaseCommand
from apps.orders.models import Order, OrderCarrier, City, VehicleType, OtherCostType


class Command(BaseCommand):
    help = 'Migruoja duomenis iš Order lentelės į City, VehicleType, OtherCostType lenteles'

    def handle(self, *args, **options):
        self.stdout.write('Pradedama migracija...')
        
        # Migruoti miestus iš route_from ir route_to
        cities_count = 0
        routes_from = Order.objects.exclude(route_from='').exclude(route_from__isnull=True).values_list('route_from', flat=True).distinct()
        for route in routes_from:
            if route and route.strip():
                city, created = City.objects.get_or_create(name=route.strip())
                if created:
                    cities_count += 1
        
        routes_to = Order.objects.exclude(route_to='').exclude(route_to__isnull=True).values_list('route_to', flat=True).distinct()
        for route in routes_to:
            if route and route.strip():
                city, created = City.objects.get_or_create(name=route.strip())
                if created:
                    cities_count += 1
        
        # Migruoti miestus iš OrderCarrier
        carrier_routes_from = OrderCarrier.objects.exclude(route_from='').exclude(route_from__isnull=True).values_list('route_from', flat=True).distinct()
        for route in carrier_routes_from:
            if route and route.strip():
                city, created = City.objects.get_or_create(name=route.strip())
                if created:
                    cities_count += 1
        
        carrier_routes_to = OrderCarrier.objects.exclude(route_to='').exclude(route_to__isnull=True).values_list('route_to', flat=True).distinct()
        for route in carrier_routes_to:
            if route and route.strip():
                city, created = City.objects.get_or_create(name=route.strip())
                if created:
                    cities_count += 1
        
        self.stdout.write(self.style.SUCCESS(f'Migruota {cities_count} miestų/lokacijų'))
        
        # Migruoti mašinos tipus
        vehicle_types_count = 0
        vehicle_types = Order.objects.exclude(vehicle_type='').exclude(vehicle_type__isnull=True).values_list('vehicle_type', flat=True).distinct()
        for vehicle_type_name in vehicle_types:
            if vehicle_type_name and vehicle_type_name.strip():
                vehicle_type, created = VehicleType.objects.get_or_create(name=vehicle_type_name.strip())
                if created:
                    vehicle_types_count += 1
        
        self.stdout.write(self.style.SUCCESS(f'Migruota {vehicle_types_count} mašinos tipų'))
        
        # Migruoti išlaidų tipus
        other_costs_count = 0
        orders = Order.objects.exclude(other_costs__isnull=True).exclude(other_costs=[])
        for order in orders:
            if order.other_costs and isinstance(order.other_costs, list):
                for cost in order.other_costs:
                    if isinstance(cost, dict) and cost.get('description'):
                        cost_type, created = OtherCostType.objects.get_or_create(
                            description=cost['description'].strip()
                        )
                        if created:
                            other_costs_count += 1
        
        self.stdout.write(self.style.SUCCESS(f'Migruota {other_costs_count} išlaidų tipų'))
        
        self.stdout.write(self.style.SUCCESS('\nMigracija sėkmingai baigta!'))

