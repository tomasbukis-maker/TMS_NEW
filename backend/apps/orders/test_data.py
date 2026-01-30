"""
Orders modulio testinių duomenų generatorių sistema.
Generuoja testinius užsakymus naudojant esamus duomenis iš DB.
"""

from django.utils import timezone
from django.db import transaction
from datetime import timedelta, datetime
from decimal import Decimal
import random
import logging

from apps.orders.models import Order, OrderCarrier, CargoItem
from apps.partners.models import Partner
from apps.auth.models import User

logger = logging.getLogger(__name__)

# Testinių duomenų identifikatorius - naudojamas ištrynimui
TEST_DATA_PREFIX = '[TEST_DATA]'


def generate_orders_test_data(count: int = 100):
    """
    Generuoja testinius užsakymus naudojant esamus partnerius, vežėjus ir vadybininkus.
    Užsakymai paskirstomi per datas: kai kurios dienos turės 1-3 užsakymus, kitos dienos neturės jokių.
    
    Args:
        count: Užsakymų skaičius
        
    Returns:
        dict: Statistika sugeneruotų užsakymų
    """
    # Patikrinti ar yra reikalingų duomenų
    clients = list(Partner.objects.filter(is_client=True, status='active'))
    suppliers = list(Partner.objects.filter(is_supplier=True, status='active'))
    managers = list(User.objects.filter(is_active=True))
    
    if not clients:
        raise ValueError("Nėra klientų (Partner su is_client=True)! Pirmiausia sukurkite klientus.")
    
    if not suppliers:
        raise ValueError("Nėra vežėjų/tiekėjų (Partner su is_supplier=True)! Pirmiausia sukurkite vežėjus.")
    
    if not managers:
        raise ValueError("Nėra vadybininkų (User)! Pirmiausia sukurkite vartotojus.")
    
    # Testiniai duomenys
    countries = ['Lietuva', 'Latvija', 'Estija', 'Lenkija', 'Vokietija', 'Švedija']
    cities = ['Vilnius', 'Kaunas', 'Klaipėda', 'Šiauliai', 'Panevėžys', 'Riga', 'Tallinn', 'Warsaw', 'Berlin', 'Stockholm']
    vehicle_types = ['Sunkvežimis', 'Furgonas', 'Traukinys', 'Jūrų transportas', 'Oro transportas']
    cargo_descriptions = [
        'Medienos krovinys', 'Metalo gaminiai', 'Maisto produktai', 'Elektronika',
        'Tekstilė', 'Chemikalai', 'Statybinės medžiagos', 'Automobiliai',
        'Aplinkos apsaugos įranga', 'Farmacijos produktai'
    ]
    
    order_ids = []
    errors = []
    created_count = 0
    
    statuses = ['new', 'in_progress', 'finished', 'canceled']
    order_types = ['transport', 'warehouse', 'combined']
    
    # Generuoti datas su paskirstymu: kai kurios dienos turės 1-3 užsakymus, kitos neturės jokių
    # Sukurti sąrašą galimų datų (per paskutinius 365 dienų)
    available_dates = []
    for days_back in range(365):
        date = (timezone.now() - timedelta(days=days_back)).date()
        available_dates.append(date)
    
    # Paskirstyti užsakymus realistiškai:
    # - Kai kurios dienos turės 1-3 užsakymus
    # - Dauguma dienų neturės jokių užsakymų
    date_orders_map = {}  # {date: [order_indices]}
    orders_assigned = 0
    
    # Paskirstyti užsakymus per datas
    # Kiekvieną užsakymą priskiriame atsitiktinei dienai
    # Kai kurios dienos gaus 1-3 užsakymus, kitos neturės jokių
    max_attempts = count * 10  # Apsauga nuo begalinio ciklo
    attempts = 0
    
    while orders_assigned < count and attempts < max_attempts:
        attempts += 1
        
        # Pasirinkti atsitiktinę datą
        selected_date = random.choice(available_dates)
        
        # Jei diena jau turi 3 užsakymus, bandyti kitą dieną
        if selected_date in date_orders_map and len(date_orders_map[selected_date]) >= 3:
            # Rasti dieną, kuri dar neturi 3 užsakymų
            available_for_orders = [d for d in available_dates if d not in date_orders_map or len(date_orders_map[d]) < 3]
            if not available_for_orders:
                # Jei visos dienos jau turi 3 užsakymus, priskirti bet kuriai dienai
                selected_date = random.choice(available_dates)
            else:
                selected_date = random.choice(available_for_orders)
        
        # Pridėti užsakymą šiai dienai
        if selected_date not in date_orders_map:
            date_orders_map[selected_date] = []
        
        date_orders_map[selected_date].append(orders_assigned)
        orders_assigned += 1
        
        # Kartais pridėti dar vieną užsakymą tos pačios dienos (jei dar ne 3)
        # 30% tikimybė pridėti dar vieną užsakymą tos pačios dienos
        if orders_assigned < count and random.random() < 0.3:
            if len(date_orders_map[selected_date]) < 3:
                date_orders_map[selected_date].append(orders_assigned)
                orders_assigned += 1
                
                # 10% tikimybė pridėti trečią užsakymą tos pačios dienos
                if orders_assigned < count and random.random() < 0.1:
                    if len(date_orders_map[selected_date]) < 3:
                        date_orders_map[selected_date].append(orders_assigned)
                        orders_assigned += 1
    
    with transaction.atomic():
        for date, order_indices in date_orders_map.items():
            # Konvertuoti date į datetime (pradžia dienos)
            base_datetime = timezone.make_aware(datetime.combine(date, datetime.min.time()))
            
            for idx_in_day, original_index in enumerate(order_indices):
                try:
                    # Pasirinkti atsitiktinius duomenis
                    client = random.choice(clients)
                    manager = random.choice(managers) if managers else None
                    status = random.choice(statuses)
                    order_type = random.choice(order_types)
                    
                    # Datos - skirtingos valandos per dieną (jei keli užsakymai per dieną)
                    hours_offset = random.randint(0, 23) if len(order_indices) > 1 else random.randint(8, 18)
                    minutes_offset = random.randint(0, 59)
                    base_datetime_with_time = base_datetime + timedelta(hours=hours_offset, minutes=minutes_offset)
                    
                    # Sukūrimo data - mažiau nei order_date (užsakymas sukurtas prieš order_date)
                    created_at_date = base_datetime_with_time - timedelta(days=random.randint(0, 7), hours=random.randint(0, 12))
                    order_date = base_datetime_with_time
                    loading_date = base_datetime_with_time + timedelta(days=random.randint(1, 7)) if status != 'new' else None
                    unloading_date = loading_date + timedelta(days=random.randint(1, 14)) if loading_date and status in ['finished', 'in_progress'] else None
                    
                    # Maršrutas
                    from_country = random.choice(countries)
                    from_city = random.choice(cities)
                    to_country = random.choice(countries)
                    to_city = random.choice(cities)
                    
                    # Kainos
                    price_net = Decimal(str(random.uniform(100, 5000))).quantize(Decimal('0.01'))
                    client_price_net = price_net * Decimal('1.15')  # +15% marža
                    my_price_net = Decimal(str(random.uniform(50, 500))).quantize(Decimal('0.01'))
                    vat_rate = Decimal('21.00')
                    
                    # Mokėjimo būsena
                    payment_statuses = ['not_paid', 'partially_paid', 'paid']
                    client_payment_status = random.choice(payment_statuses)
                    client_invoice_issued = client_payment_status != 'not_paid'
                    client_invoice_received = random.choice([True, False]) if client_invoice_issued else False
                    
                    # Krovinių savybės
                    weight_kg = Decimal(str(random.uniform(100, 20000))).quantize(Decimal('0.01'))
                    ldm = Decimal(str(random.uniform(1, 50))).quantize(Decimal('0.01'))
                    length_m = Decimal(str(random.uniform(2, 15))).quantize(Decimal('0.01'))
                    width_m = Decimal(str(random.uniform(1.5, 3))).quantize(Decimal('0.01'))
                    height_m = Decimal(str(random.uniform(1.5, 4))).quantize(Decimal('0.01'))
                    
                    # Sukurti užsakymą
                    order = Order.objects.create(
                        client=client,
                        manager=manager,
                        status=status,
                        order_type=order_type,
                        
                        # Maršrutas
                        route_from_country=from_country,
                        route_from_city=from_city,
                        route_from_postal_code=str(random.randint(10000, 99999)),
                        route_from_address=f"{random.randint(1, 100)} {random.choice(['Gatvė', 'Ave.', 'Pl.'])}",
                        route_to_country=to_country,
                        route_to_city=to_city,
                        route_to_postal_code=str(random.randint(10000, 99999)),
                        route_to_address=f"{random.randint(1, 100)} {random.choice(['Gatvė', 'Ave.', 'Pl.'])}",
                        
                        # Datos
                        order_date=order_date,
                        loading_date=loading_date,
                        unloading_date=unloading_date,
                        
                        # Kainos
                        price_net=price_net,
                        client_price_net=client_price_net,
                        my_price_net=my_price_net,
                        vat_rate=vat_rate,
                        vat_rate_article='PVM tarifo straipsnis',
                        
                        # Mokėjimai
                        client_payment_status=client_payment_status,
                        client_invoice_issued=client_invoice_issued,
                        client_invoice_received=client_invoice_received,
                        
                        # Krovinių savybės
                        weight_kg=weight_kg,
                        ldm=ldm,
                        length_m=length_m,
                        width_m=width_m,
                        height_m=height_m,
                        is_palletized=random.choice([True, False]),
                        is_stackable=random.choice([True, False]),
                        fragile=random.choice([True, False]),
                        hazardous=random.choice([True, False]),
                        temperature_controlled=random.choice([True, False]),
                        requires_permit=random.choice([True, False]),
                        requires_forklift=random.choice([True, False]),
                        requires_crane=random.choice([True, False]),
                        requires_special_equipment=random.choice([True, False]),
                        
                        vehicle_type=random.choice(vehicle_types),
                        
                        # Pastabos su testinių duomenų identifikatoriumi
                        notes=f"{TEST_DATA_PREFIX} Testinis užsakymas #{original_index+1}. {random.choice(cargo_descriptions)}",
                        
                        is_partial=random.choice([True, False]),
                    )
                    
                    # Atnaujinti created_at su skirtinga data (auto_now_add ignoruoja perduodamas reikšmes)
                    # Naudojame update(), kad nustatytume created_at su skirtingomis datomis
                    Order.objects.filter(id=order.id).update(created_at=created_at_date)
                    order.refresh_from_db()  # Atnaujinti order objektą iš DB
                    
                    order_ids.append(order.id)
                    created_count += 1
                    
                    # Sukurti vežėjus (1-3 vežėjai per užsakymą)
                    num_carriers = random.randint(1, 3)
                    selected_suppliers = random.sample(suppliers, min(num_carriers, len(suppliers)))
                    
                    for idx, supplier in enumerate(selected_suppliers):
                        carrier_price = Decimal(str(random.uniform(50, 1000))).quantize(Decimal('0.01'))
                        carrier_status = random.choice(['new', 'in_progress', 'completed'])
                        
                        # Maršrutas vežėjui (gali skirtis nuo užsakymo maršruto)
                        carrier_from_country = random.choice(countries)
                        carrier_from_city = random.choice(cities)
                        carrier_to_country = random.choice(countries)
                        carrier_to_city = random.choice(cities)
                        carrier_route_from = f"{carrier_from_city}, {carrier_from_country}"
                        carrier_route_to = f"{carrier_to_city}, {carrier_to_country}"
                        
                        # Vežėjo datos (gali skirtis nuo užsakymo datų)
                        carrier_loading_date = None
                        carrier_unloading_date = None
                        if carrier_status != 'new' and loading_date:
                            if isinstance(loading_date, datetime):
                                carrier_loading_date = loading_date + timedelta(hours=random.randint(-12, 12))
                            else:
                                carrier_loading_date = timezone.make_aware(datetime.combine(loading_date, datetime.min.time())) + timedelta(hours=random.randint(-12, 12))
                        
                        if carrier_status == 'completed' and carrier_loading_date:
                            carrier_unloading_date = carrier_loading_date + timedelta(days=random.randint(1, 14))
                        
                        # Mokėjimo būsena
                        payment_statuses = ['not_paid', 'paid', 'partially_paid']
                        payment_status = random.choice(payment_statuses) if carrier_status == 'completed' else 'not_paid'
                        payment_date = None
                        if payment_status == 'paid' and carrier_status == 'completed' and carrier_unloading_date:
                            if isinstance(carrier_unloading_date, datetime):
                                payment_date = (carrier_unloading_date + timedelta(days=random.randint(1, 30))).date()
                            else:
                                payment_date = carrier_unloading_date + timedelta(days=random.randint(1, 30))
                        
                        # Invoice received date
                        invoice_received_date_value = None
                        if carrier_status == 'completed' and carrier_unloading_date:
                            if isinstance(carrier_unloading_date, datetime):
                                invoice_received_date_value = (carrier_unloading_date + timedelta(days=random.randint(1, 7))).date()
                            else:
                                invoice_received_date_value = carrier_unloading_date + timedelta(days=random.randint(1, 7))
                        
                        # Payment days (mokėjimo terminas dienomis)
                        payment_days_value = random.randint(7, 30) if invoice_received_date_value else None
                        
                        # Due date
                        due_date_value = None
                        if invoice_received_date_value and payment_days_value:
                            due_date_value = invoice_received_date_value + timedelta(days=payment_days_value)
                        elif carrier_unloading_date:
                            if isinstance(carrier_unloading_date, datetime):
                                due_date_value = (carrier_unloading_date + timedelta(days=random.randint(7, 30))).date()
                            else:
                                due_date_value = carrier_unloading_date + timedelta(days=random.randint(7, 30))
                        
                        OrderCarrier.objects.create(
                            order=order,
                            partner=supplier,
                            carrier_type=random.choice(['carrier', 'warehouse']),
                            sequence_order=idx,
                            price_net=carrier_price,
                            route_from=carrier_route_from,
                            route_to=carrier_route_to,
                            loading_date=carrier_loading_date,
                            unloading_date=carrier_unloading_date,
                            status=carrier_status,
                            invoice_issued=random.choice([True, False]) if carrier_status != 'new' else False,
                            invoice_received=random.choice([True, False]) if carrier_status in ['completed'] else False,
                            invoice_received_date=invoice_received_date_value,
                            payment_days=payment_days_value,
                            payment_status=payment_status,
                            payment_date=payment_date,
                            notes=f"{TEST_DATA_PREFIX} Vežėjo pastabos #{idx+1}",
                            due_date=due_date_value,
                        )
                    
                    # Sukurti cargo items (1-5 krovinių aprašymų)
                    num_cargo_items = random.randint(1, 5)
                    for cargo_idx in range(num_cargo_items):
                        CargoItem.objects.create(
                            order=order,
                            sequence_order=cargo_idx,
                            description=random.choice(cargo_descriptions),
                            weight_kg=Decimal(str(random.uniform(10, 5000))).quantize(Decimal('0.01')),
                            ldm=Decimal(str(random.uniform(0.5, 10))).quantize(Decimal('0.01')),
                            length_m=Decimal(str(random.uniform(1, 5))).quantize(Decimal('0.01')),
                            width_m=Decimal(str(random.uniform(0.5, 2))).quantize(Decimal('0.01')),
                            height_m=Decimal(str(random.uniform(0.5, 2))).quantize(Decimal('0.01')),
                            is_palletized=random.choice([True, False]),
                            is_stackable=random.choice([True, False]),
                            vehicle_type=random.choice(vehicle_types),
                            requires_forklift=random.choice([True, False]),
                            requires_crane=random.choice([True, False]),
                            requires_special_equipment=random.choice([True, False]),
                            fragile=random.choice([True, False]),
                            hazardous=random.choice([True, False]),
                            temperature_controlled=random.choice([True, False]),
                            requires_permit=random.choice([True, False]),
                        )
                    
                except Exception as e:
                    error_msg = f"Klaida kuriant užsakymą #{original_index+1}: {str(e)}"
                    logger.error(error_msg, exc_info=True)
                    errors.append(error_msg)
                    continue
    
    return {
        'created': created_count,
        'order_ids': order_ids,
        'errors': errors
    }


def delete_orders_test_data():
    """
    Ištrina visus testinius užsakymus (su TEST_DATA_PREFIX notes).
    
    Returns:
        dict: Statistika ištrintų užsakymų
    """
    deleted_count = 0
    errors = []
    
    try:
        # Rasti visus testinius užsakymus
        test_orders = Order.objects.filter(notes__startswith=TEST_DATA_PREFIX)
        order_ids = list(test_orders.values_list('id', flat=True))
        
        # Ištrinti su susijusiais objektais (CargoItem, OrderCarrier)
        # bus ištrinti automatiškai dėl CASCADE
        with transaction.atomic():
            deleted_count = test_orders.delete()[0]
        
        logger.info(f"Ištrinta {deleted_count} testinių užsakymų ir susijusių objektų")
        
    except Exception as e:
        error_msg = f"Klaida trinant testinius užsakymus: {str(e)}"
        logger.error(error_msg, exc_info=True)
        errors.append(error_msg)
    
    return {
        'deleted': deleted_count,
        'errors': errors
    }

