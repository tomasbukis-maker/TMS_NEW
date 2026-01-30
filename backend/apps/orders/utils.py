from datetime import datetime
from django.db import transaction
from .models import OrderNumberSequence, ExpeditionNumberSequence
from apps.settings.models import ExpeditionSettings


def _get_expedition_format():
    """Atgalinio suderinamumo funkcija - naudoja carrier nustatymus"""
    return _get_expedition_format_for_type('carrier')


def _get_expedition_format_for_type(expedition_type: str):
    """Grąžina formatą pagal tipą: 'carrier', 'warehouse', 'cost'"""
    from apps.settings.models import ExpeditionSettings, WarehouseExpeditionSettings, CostExpeditionSettings

    if expedition_type == 'warehouse':
        settings_obj = WarehouseExpeditionSettings.load()
    elif expedition_type == 'cost':
        settings_obj = CostExpeditionSettings.load()
    else:  # carrier or default
        settings_obj = ExpeditionSettings.load()

    prefix = settings_obj.expedition_prefix or ('E' if expedition_type != 'warehouse' and expedition_type != 'cost' else 'WH-')
    width = settings_obj.expedition_number_width or 5
    return prefix, width


def generate_expedition_number(prefix: str = None, expedition_type: str = 'carrier') -> str:
    """Generuoja ekspedicijos numerį pagal tipą"""
    if prefix is None:
        prefix, width = _get_expedition_format_for_type(expedition_type)
    else:
        # Jei prefix paduotas, naudojame jį su default width
        if expedition_type == 'warehouse':
            from apps.settings.models import WarehouseExpeditionSettings
            settings_obj = WarehouseExpeditionSettings.load()
        elif expedition_type == 'cost':
            from apps.settings.models import CostExpeditionSettings
            settings_obj = CostExpeditionSettings.load()
        else:
            from apps.settings.models import ExpeditionSettings
            settings_obj = ExpeditionSettings.load()
        width = settings_obj.expedition_number_width or 5

    # Generuojame numerį iš sekos pagal tipą
    with transaction.atomic():
        sequence, _ = ExpeditionNumberSequence.objects.select_for_update().get_or_create(
            pk=1,
            defaults={'last_carrier_number': 0, 'last_warehouse_number': 0, 'last_cost_number': 0}
        )

        if expedition_type == 'carrier':
            sequence.last_carrier_number += 1
            current_number = sequence.last_carrier_number
            sequence.save(update_fields=['last_carrier_number'])
        elif expedition_type == 'warehouse':
            sequence.last_warehouse_number += 1
            current_number = sequence.last_warehouse_number
            sequence.save(update_fields=['last_warehouse_number'])
        elif expedition_type == 'cost':
            sequence.last_cost_number += 1
            current_number = sequence.last_cost_number
            sequence.save(update_fields=['last_cost_number'])
        else:
            # Fallback į carrier
            sequence.last_carrier_number += 1
            current_number = sequence.last_carrier_number
            sequence.save(update_fields=['last_carrier_number'])

    # Formatavimas
    formatted_number = f"{prefix}{current_number:0{width}d}"
    return formatted_number


def generate_order_number(width: int = 3, using: str = 'default') -> str:
    """
    Sugeneruoja užsakymo numerį formatu PREFIX-NNN (pagal order_prefix arba metus).
    
    Args:
        width: Numerio plotis (default: 3)
        using: Database alias (default: 'default')
    
    Note:
        MUST be called from within an existing transaction. The select_for_update() lock
        prevents race conditions by locking the sequence row until the transaction commits.
        This ensures the number generation and INSERT happen atomically.
        
        This function uses a retry mechanism to handle race conditions when creating
        the sequence row for the first time.
        
        CRITICAL: This function MUST be called from within a transaction.atomic() block
        to ensure the lock is held until the INSERT completes.
    """
    from apps.settings.models import OrderSettings
    from django.db import IntegrityError
    from django.db.models import F
    import logging
    
    logger = logging.getLogger(__name__)
    
    settings = OrderSettings.load()
    # Naudoti order_prefix, jei nustatytas, kitu atveju - dabartinius metus
    prefix = settings.order_prefix.strip() if settings.order_prefix else str(datetime.now().year)
    year = int(prefix) if prefix.isdigit() else datetime.now().year
    
    # Retry mechanism: jei kyla IntegrityError dėl race condition, bandyti dar kartą
    max_retries = 5
    for attempt in range(max_retries):
        try:
            # Bandyti gauti eilutę su lock (select_for_update)
            # Jei neegzistuoja, bandyti sukurti
            try:
                # Pirmiausia bandyti gauti su lock - tai užrakina eilutę iki transakcijos commit
                # Naudojame nowait=False (default), kad lauktų, jei kita transakcija jau užrakė eilutę
                sequence = OrderNumberSequence.objects.using(using).select_for_update(nowait=False).get(year=year)
            except OrderNumberSequence.DoesNotExist:
                # Jei neegzistuoja, bandyti sukurti
                # Naudoti get_or_create su select_for_update nėra galima, todėl naudojame try/except
                try:
                    # Bandyti sukurti eilutę
                    # IMPORTANT: Sukurti be lock, tada iš karto užrakinti
                    sequence = OrderNumberSequence.objects.using(using).create(
                        year=year,
                        last_number=0
                    )
                    # Po sukūrimo, vėl gauti su lock, kad užtikrintume, jog turime teisingą versiją
                    # ir kad eilutė yra užrakinta
                    # CRITICAL: Re-fetch su lock, kad užtikrintume, jog turime teisingą versiją
                    sequence = OrderNumberSequence.objects.using(using).select_for_update(nowait=False).get(pk=sequence.pk)
                except IntegrityError:
                    # Jei kyla IntegrityError, reiškia kita transakcija jau sukūrė eilutę
                    # Gauti ją su lock (gali užtrukti, jei kita transakcija dar nėra commit'inusi)
                    # CRITICAL: Naudoti pk vietoj year, kad būtų tiksliau
                    try:
                        sequence = OrderNumberSequence.objects.using(using).select_for_update(nowait=False).get(year=year)
                    except OrderNumberSequence.DoesNotExist:
                        # Jei vis dar neegzistuoja po IntegrityError, tai keista, bet bandyti dar kartą
                        logger.warning(f"Sequence for year {year} does not exist after IntegrityError, retrying...")
                        raise
            
            # Dabar užrakinta eilutė - saugiai galime atnaujinti
            # KRITIŠKA: Naudojame Python increment + save() ant užrakintos eilutės.
            # select_for_update() užrakina eilutę iki transakcijos commit, todėl tik viena
            # transakcija gali atlikti šią operaciją vienu metu. Tai užtikrina, kad numeriai
            # bus unikalūs ir sekantys.
            #
            # IMPORTANT: save() ant užrakintos eilutės turėtų veikti teisingai, nes lock
            # yra aktyvus visą transakcijos laiką. Python increment + save() yra patikimesnis
            # nei F() su update(), nes garantuoja, kad operacija vyksta ant užrakintos eilutės.
            
            # Perskaityti dabartinę reikšmę iš užrakintos eilutės
            old_number = sequence.last_number
            
            # Patikrinti, ar reikšmė yra teisinga (saugiklis)
            if old_number < 0:
                logger.error(f"Invalid sequence number: {old_number} (year={year}, pk={sequence.pk})")
                raise IntegrityError(f"Invalid sequence number: {old_number}")
            
            # Padidinti reikšmę Python lygmenyje
            new_number = old_number + 1
            
            # Išsaugoti atnaujintą reikšmę ant užrakintos eilutės
            # IMPORTANT: save() su update_fields užtikrina, kad atnaujinamas tik last_number laukas
            # ir kad operacija vyksta ant užrakintos eilutės (nes eilutė vis dar užrakinta)
            sequence.last_number = new_number
            sequence.save(update_fields=['last_number', 'updated_at'])
            
            # Logging for debugging
            formatted_number = f"{prefix}-{new_number:0{width}d}"
            logger.info(f"Generated order number: {formatted_number} (year={year}, sequence_pk={sequence.pk}, old={old_number}, new={new_number}, attempt={attempt + 1})")
            
            # Grąžinti suformatuotą numerį
            return formatted_number
            
        except IntegrityError as e:
            # Jei vis dar kyla IntegrityError (pvz., dėl race condition sekos sukūrime),
            # bandyti dar kartą, jei dar yra bandymų
            if attempt < max_retries - 1:
                # Trumpas laukimas prieš bandant dar kartą (milisekundės)
                import time
                time.sleep(0.01 * (attempt + 1))  # 10ms, 20ms, 30ms, etc.
                continue
            else:
                # Jei visi bandymai nepavyko, pakelti klaidą
                raise


def find_expedition_number_gaps_by_type(carrier_type: str = 'carrier', max_gaps: int = 5) -> list:
    """
    Suranda tarpus ekspedicijų numeracijoje pagal tipą.
    Grąžina sąrašą tuščių numerių (tarpų), kurie yra tarp egzistuojančių numerių.

    Args:
        carrier_type: Carrier tipas ('carrier', 'warehouse', 'cost')
        max_gaps: Maksimalus tarpų skaičius grąžinimui (default: 5)

    Returns:
        List of tuples: [(start_gap, end_gap), ...] - tarpų diapazonai
    """
    from .models import OrderCarrier, OrderCost

    # Gauti prefix ir width pagal tipą
    if carrier_type == 'warehouse':
        from apps.settings.models import WarehouseExpeditionSettings
        settings = WarehouseExpeditionSettings.load()
        prefix = settings.expedition_prefix or 'WH-'
        width = settings.expedition_number_width or 5
    elif carrier_type == 'cost':
        from apps.settings.models import CostExpeditionSettings
        settings = CostExpeditionSettings.load()
        prefix = settings.expedition_prefix or 'ISL-'
        width = settings.expedition_number_width or 5
    else:
        from apps.settings.models import ExpeditionSettings
        settings = ExpeditionSettings.load()
        prefix = settings.expedition_prefix or 'E'
        width = settings.expedition_number_width or 5

    # Gauti visus numerius pagal tipą
    if carrier_type == 'cost':
        # Išlaidoms naudojame OrderCost modelį
        all_numbers = OrderCost.objects.exclude(
            expedition_number__isnull=True
        ).exclude(
            expedition_number__exact=''
        ).values_list('expedition_number', flat=True)
    else:
        # Vežėjams ir sandėliams naudojame OrderCarrier
        queryset = OrderCarrier.objects.exclude(
            expedition_number__isnull=True
        ).exclude(
            expedition_number__exact=''
        )

        if carrier_type != 'carrier':
            queryset = queryset.filter(carrier_type=carrier_type)

        all_numbers = queryset.values_list('expedition_number', flat=True)

    # Išgauti skaitines dalis
    numeric_parts = []
    for number in all_numbers:
        if not number:
            continue
        # Pašalinti prefix ir gauti skaitinę dalį
        number_str = str(number).upper()
        if number_str.startswith(prefix.upper()):
            numeric_str = number_str[len(prefix):].strip()
            try:
                num = int(numeric_str)
                numeric_parts.append(num)
            except ValueError:
                continue

    if not numeric_parts:
        return []

    # Surūšiuoti numerius
    numeric_parts.sort()

    # Rasti tarpus
    gaps = []
    for i in range(len(numeric_parts) - 1):
        current = numeric_parts[i]
        next_num = numeric_parts[i + 1]

        # Jei tarpas didesnis nei 1 (pvz. 3990, 4042 - tarpas nuo 3991 iki 4041)
        if next_num - current > 1:
            gap_start = current + 1
            gap_end = next_num - 1

            # Jei tarpas didelis, rodyti tik pirmą ir paskutinį
            if gap_end - gap_start > 10:
                gaps.append((gap_start, gap_end))
            else:
                # Jei tarpas mažas, rodyti visus numerius
                for gap_num in range(gap_start, gap_end + 1):
                    gaps.append((gap_num, gap_num))
                    if len(gaps) >= max_gaps:
                        break

            if len(gaps) >= max_gaps:
                break

    return gaps[:max_gaps]


def find_expedition_number_gaps(prefix: str = None, width: int = None, max_gaps: int = 5) -> list:
    """
    Suranda tarpus ekspedicijų numeracijoje (atgalinis suderinamumas).
    Naudoja naująją funkciją su 'carrier' tipu.
    """
    # Naudoti naują funkciją su 'carrier' tipu dėl atgalinio suderinamumo
    return find_expedition_number_gaps_by_type(carrier_type='carrier', max_gaps=max_gaps)

    # Išgauti skaitines dalis
    numeric_parts = []
    for number in all_numbers:
        if not number:
            continue
        # Pašalinti prefix ir gauti skaitinę dalį
        number_str = str(number).upper()
        if number_str.startswith(prefix_upper):
            numeric_str = number_str[len(prefix_upper):].strip()
            try:
                num = int(numeric_str)
                numeric_parts.append(num)
            except ValueError:
                continue

    if not numeric_parts:
        return []
    
    # Surūšiuoti numerius
    numeric_parts.sort()
    
    # Rasti tarpus
    gaps = []
    for i in range(len(numeric_parts) - 1):
        current = numeric_parts[i]
        next_num = numeric_parts[i + 1]
        
        # Jei tarpas didesnis nei 1 (pvz. 3990, 4042 - tarpas nuo 3991 iki 4041)
        if next_num - current > 1:
            gap_start = current + 1
            gap_end = next_num - 1
            
            # Jei tarpas didelis, rodyti tik pirmą ir paskutinį
            if gap_end - gap_start > 10:
                gaps.append((gap_start, gap_end))
            else:
                # Jei tarpas mažas, rodyti visus numerius
                for gap_num in range(gap_start, gap_end + 1):
                    gaps.append((gap_num, gap_num))
                    if len(gaps) >= max_gaps:
                        break
            
            if len(gaps) >= max_gaps:
                break
    
    return gaps[:max_gaps]


def get_first_available_expedition_gap_number(prefix: str = None, width: int = None):
    """
    Suranda pirmą tuščią numerį iš tarpų ekspedicijų numeracijoje.
    Grąžina formatuotą numerį (pvz. 'E00391') arba None, jei tarpų nėra.
    """
    gaps = find_expedition_number_gaps(prefix=prefix, width=width, max_gaps=1)
    if not gaps:
        return None
    
    # Pirmas tarpas
    gap = gaps[0]
    gap_start = gap[0]
    
    # Formatuoti numerį
    if prefix is None or width is None:
        prefix, width = _get_expedition_format()
    
    return f"{prefix}{gap_start:0{width}d}"


def _parse_order_number(order_number: str):
    """
    Parsina užsakymo numerį formatu PREFIX-NNN arba PREFIXNNN.
    Grąžina (prefix, numeric_part) arba (None, None), jei nepavyko parsinti.
    """
    if not order_number:
        return None, None
    
    order_number = str(order_number).strip()
    
    # Bandyti formatą PREFIX-NNN (pvz. 2025-001)
    if '-' in order_number:
        parts = order_number.split('-', 1)
        if len(parts) == 2:
            prefix = parts[0].strip()
            numeric_str = parts[1].strip()
            try:
                numeric_part = int(numeric_str)
                return prefix, numeric_part
            except ValueError:
                pass
    
    # Bandyti formatą PREFIXNNN (pvz. 2025001)
    # Ieškoti paskutinio skaitmenų bloko
    import re
    match = re.search(r'(\d+)$', order_number)
    if match:
        numeric_str = match.group(1)
        prefix = order_number[:match.start()]
        try:
            numeric_part = int(numeric_str)
            return prefix, numeric_part
        except ValueError:
            pass
    
    return None, None


def find_order_number_gaps(prefix: str = None, width: int = None, max_gaps: int = 5) -> list:
    """
    Suranda tarpus užsakymų numeracijoje.
    Grąžina sąrašą tuščių numerių (tarpų), kurie yra tarp egzistuojančių numerių.
    
    Args:
        prefix: Užsakymo numerio prefix (pvz. '2025' arba custom prefix)
        width: Skaitmenų skaičius (pvz. 3)
        max_gaps: Maksimalus tarpų skaičius grąžinimui (default: 5)
    
    Returns:
        List of tuples: [(start_gap, end_gap), ...] - tarpų diapazonai
    """
    from .models import Order
    from apps.settings.models import OrderSettings
    
    if prefix is None or width is None:
        settings = OrderSettings.load()
        if prefix is None:
            prefix = settings.order_prefix.strip() if settings.order_prefix else str(datetime.now().year)
        if width is None:
            width = settings.order_number_width or 3
    
    prefix = str(prefix).strip()

    # Gauti visus numerius su prefix
    # Bandyti rasti numerius, kurie prasideda su prefix
    all_orders = Order.objects.filter(
        order_number__isnull=False
    ).exclude(order_number='').values_list('order_number', flat=True)

    # Išgauti skaitines dalis pagal prefix
    numeric_parts = []
    for number in all_orders:
        if not number:
            continue
        parsed_prefix, numeric_part = _parse_order_number(number)
        if parsed_prefix and parsed_prefix == prefix and numeric_part is not None:
            numeric_parts.append(numeric_part)

    if not numeric_parts:
        return []
    
    # Surūšiuoti numerius
    numeric_parts.sort()
    
    # Rasti tarpus
    gaps = []
    for i in range(len(numeric_parts) - 1):
        current = numeric_parts[i]
        next_num = numeric_parts[i + 1]
        
        # Jei tarpas didesnis nei 1 (pvz. 100, 105 - tarpas nuo 101 iki 104)
        if next_num - current > 1:
            gap_start = current + 1
            gap_end = next_num - 1
            
            # Jei tarpas didelis, rodyti tik pirmą ir paskutinį
            if gap_end - gap_start > 10:
                gaps.append((gap_start, gap_end))
            else:
                # Jei tarpas mažas, rodyti visus numerius
                for gap_num in range(gap_start, gap_end + 1):
                    gaps.append((gap_num, gap_num))
                    if len(gaps) >= max_gaps:
                        break
            
            if len(gaps) >= max_gaps:
                break
    
    return gaps[:max_gaps]


def get_first_available_order_gap_number(prefix: str = None, width: int = None):
    """
    Suranda pirmą tuščią numerį iš tarpų užsakymų numeracijoje.
    Grąžina formatuotą numerį (pvz. '2025-101') arba None, jei tarpų nėra.
    """
    gaps = find_order_number_gaps(prefix=prefix, width=width, max_gaps=1)
    if not gaps:
        return None
    
    # Pirmas tarpas
    gap = gaps[0]
    gap_start = gap[0]
    
    # Formatuoti numerį
    if prefix is None or width is None:
        from apps.settings.models import OrderSettings
        settings = OrderSettings.load()
        if prefix is None:
            prefix = settings.order_prefix.strip() if settings.order_prefix else str(datetime.now().year)
        if width is None:
            width = settings.order_number_width or 3
    
    return f"{prefix}-{gap_start:0{width}d}"








































