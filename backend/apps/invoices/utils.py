from datetime import datetime
from decimal import Decimal
import re
from typing import Optional
from .models import InvoiceNumberSequence, SalesInvoice


def _generate_invoice_items_structure(invoice):
    """
    Generuoja invoice_items struktūrą be visible laukų - tik pagal užsakymą ir display_options.
    Naudojama calculate_visible_items_indexes funkcijoje.
    """
    from decimal import Decimal
    from datetime import datetime, date
    from apps.orders.models import Order
    from apps.settings.models import InvoiceSettings
    
    invoice_items = []
    
    # Gauti display_options
    display_options = invoice.display_options or {}
    if not display_options:
        invoice_settings = InvoiceSettings.load()
        display_options = invoice_settings.default_display_options or {}
    
    has_manual = bool(invoice.manual_lines)
    
    # Jei yra related_order ir nėra manual_lines - formuoti iš užsakymo
    if invoice.related_order and not has_manual:
        try:
            order = Order.objects.prefetch_related('carriers__partner').select_related('client').get(id=invoice.related_order.id)
            
            # Formuoti užsakymo aprašymą pagrindinei eilutei
            order_desc_parts = []
            # Užsakymo data ir numeris (sujungta vienoje eilutėje)
            if order.order_date and order.order_number:
                try:
                    if isinstance(order.order_date, datetime):
                        date_str = order.order_date.strftime('%Y.%m.%d')
                    elif isinstance(order.order_date, date):
                        date_str = order.order_date.strftime('%Y.%m.%d')
                    else:
                        date_str = str(order.order_date)
                    order_desc_parts.append(f"Užsakymo data ir numeris: {date_str} / {order.order_number}")
                except (AttributeError, ValueError) as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Could not format order date/number for order {order.id}: {e}")
            elif order.order_date:
                try:
                    if isinstance(order.order_date, datetime):
                        date_str = order.order_date.strftime('%Y.%m.%d')
                    elif isinstance(order.order_date, date):
                        date_str = order.order_date.strftime('%Y.%m.%d')
                    else:
                        date_str = str(order.order_date)
                    order_desc_parts.append(f"Užsakymo data: {date_str}")
                except (AttributeError, ValueError) as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Could not format order date for order {order.id}: {e}")
            
            route_str = f"{order.route_from or 'Nenurodytas'} - {order.route_to or 'Nenurodytas'}"
            order_desc_parts.append(f"Maršrutas: {route_str}")
            
            if order.loading_date:
                try:
                    if isinstance(order.loading_date, datetime):
                        order_desc_parts.append(f"Pakrovimo data: {order.loading_date.strftime('%Y.%m.%d')}")
                    elif isinstance(order.loading_date, date):
                        order_desc_parts.append(f"Pakrovimo data: {order.loading_date.strftime('%Y.%m.%d')}")
                except (AttributeError, ValueError) as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Could not format loading date for order {order.id}: {e}")
            
            if order.unloading_date:
                try:
                    if isinstance(order.unloading_date, datetime):
                        order_desc_parts.append(f"Iškrovimo data: {order.unloading_date.strftime('%Y.%m.%d')}")
                    elif isinstance(order.unloading_date, date):
                        order_desc_parts.append(f"Iškrovimo data: {order.unloading_date.strftime('%Y.%m.%d')}")
                except (AttributeError, ValueError) as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"Could not format unloading date for order {order.id}: {e}")
            
            show_carriers = display_options.get('show_carriers', True)
            show_prices = display_options.get('show_prices', True)
            
            # Pagrindinė eilutė su užsakymo info (visada pridedama)
            # SVARBU: Visada naudoti tikras kainas, nepriklausomai nuo display_options
            # display_options turi įtakos tik rodymui HTML/PDF, bet ne kainos apskaičiavimui
            if order_desc_parts:
                # Gauti sumą iš SalesInvoiceOrder, jei egzistuoja
                base_amount = Decimal('0.00')
                try:
                    from apps.invoices.models import SalesInvoiceOrder
                    link = SalesInvoiceOrder.objects.filter(invoice=invoice, order=order).first()
                    if link:
                        base_amount = link.amount_net
                except Exception:
                    pass
                
                # Jei nėra SalesInvoiceOrder ryšio, naudoti client_price_net
                if base_amount == Decimal('0.00'):
                    if order.client_price_net:
                        base_amount = order.client_price_net
                    elif order.price_net:
                        base_amount = order.price_net
                    elif order.carriers.exists() and order.carriers.count() == 1:
                        single_carrier = order.carriers.first()
                        if single_carrier and single_carrier.price_net:
                            base_amount = single_carrier.price_net
                    elif order.carriers.exists():
                        total_carrier_price = sum(c.price_net or Decimal('0.00') for c in order.carriers.all())
                        if total_carrier_price > 0:
                            base_amount = total_carrier_price
                
                base_vat = base_amount * (invoice.vat_rate / 100)
                base_total = base_amount + base_vat
                
                invoice_items.append({
                    'description': '\n'.join(order_desc_parts),
                    'amount_net': float(base_amount),
                    'vat_amount': float(base_vat),
                    'amount_total': float(base_total),
                    'vat_rate': float(invoice.vat_rate),
                    'type': 'main_route',
                    'visible': show_prices  # Tik rodymui, ne kainos apskaičiavimui
                })
            
            # Vežėjų eilutės
            # SVARBU: Visada įtraukti vežėjų eilutes į kainą, nepriklausomai nuo display_options
            # display_options turi įtakos tik rodymui HTML/PDF, bet ne kainos apskaičiavimui
            if order.carriers.exists():
                carriers_list = list(order.carriers.all().order_by('sequence_order'))
                for idx, carrier in enumerate(carriers_list):
                    carrier_desc_parts = []
                    if carrier.partner:
                        carrier_type_display = 'Vežėjas' if carrier.carrier_type == 'carrier' else 'Sandėlis'
                        carrier_desc_parts.append(f"{carrier_type_display}: {carrier.partner.name}")
                    
                    if carrier.route_from or carrier.route_to:
                        carrier_route = f"{carrier.route_from or 'Nenurodytas'} - {carrier.route_to or 'Nenurodytas'}"
                        carrier_desc_parts.append(f"Maršrutas: {carrier_route}")
                    
                    if carrier.loading_date:
                        if isinstance(carrier.loading_date, (datetime, date)):
                            if isinstance(carrier.loading_date, datetime):
                                carrier_desc_parts.append(f"Pakrovimo data: {carrier.loading_date.date().strftime('%Y.%m.%d')}")
                            else:
                                carrier_desc_parts.append(f"Pakrovimo data: {carrier.loading_date.strftime('%Y.%m.%d')}")
                    
                    if carrier.unloading_date:
                        if isinstance(carrier.unloading_date, (datetime, date)):
                            if isinstance(carrier.unloading_date, datetime):
                                carrier_desc_parts.append(f"Iškrovimo data: {carrier.unloading_date.date().strftime('%Y.%m.%d')}")
                            else:
                                carrier_desc_parts.append(f"Iškrovimo data: {carrier.unloading_date.strftime('%Y.%m.%d')}")
                    
                    full_desc = '\n'.join(carrier_desc_parts) if carrier_desc_parts else 'Pervežimo paslaugos'
                    
                    carrier_amount_net = carrier.price_net or Decimal('0.00')
                    carrier_vat = carrier_amount_net * (invoice.vat_rate / 100)
                    carrier_total = carrier_amount_net + carrier_vat
                    
                    invoice_items.append({
                        'description': full_desc,
                        'amount_net': float(carrier_amount_net),
                        'vat_amount': float(carrier_vat),
                        'amount_total': float(carrier_total),
                        'vat_rate': float(invoice.vat_rate),
                        'type': 'carrier',
                        'visible': show_carriers and show_prices  # Tik rodymui, ne kainos apskaičiavimui
                    })
            
            # PASTABA: "Mano paslaugos" eilutė niekada nerodoma HTML/PDF peržiūroje
            # Kitos išlaidos
            # SVARBU: Visada įtraukti kitas išlaidas į kainą, nepriklausomai nuo display_options
            show_other_costs = display_options.get('show_other_costs', True)
            if order.other_costs:
                for cost in order.other_costs:
                    if isinstance(cost, dict) and 'amount' in cost:
                        cost_amount = Decimal(str(cost['amount']))
                        cost_desc = cost.get('description', 'Kitos išlaidos')
                        cost_vat = cost_amount * (invoice.vat_rate / 100)
                        cost_total = cost_amount + cost_vat
                        invoice_items.append({
                            'description': cost_desc,
                            'amount_net': float(cost_amount),
                            'vat_amount': float(cost_vat),
                            'amount_total': float(cost_total),
                            'vat_rate': float(invoice.vat_rate),
                            'type': 'other_cost',
                            'visible': show_prices and show_other_costs  # Tik rodymui, ne kainos apskaičiavimui
                        })
        except Exception:
            pass
    
    # Jei vis dar nėra eilučių
    if not invoice_items:
        vat_amount = invoice.amount_net * (invoice.vat_rate / 100)
        invoice_items.append({
            'description': 'Paslaugos',
            'amount_net': float(invoice.amount_net),
            'vat_amount': float(vat_amount),
            'amount_total': float(invoice.amount_total),
            'vat_rate': float(invoice.vat_rate),
            'type': 'default'
        })
    
    return invoice_items


def calculate_visible_items_indexes(invoice):
    """
    Apskaičiuoja visible_items_indexes pagal display_options ir invoice_items struktūrą.
    Grąžina masyvą su indeksais, kurie turėtų būti rodomi HTML peržiūroje.
    """
    from apps.settings.models import InvoiceSettings
    
    # Generuoti invoice_items struktūrą
    invoice_items = _generate_invoice_items_structure(invoice)
    
    if not invoice_items:
        return []
    
    # Gauti display_options
    display_options = invoice.display_options or {}
    if not display_options:
        invoice_settings = InvoiceSettings.load()
        display_options = invoice_settings.default_display_options or {}
    
    show_carriers = display_options.get('show_carriers', True)
    show_prices = display_options.get('show_prices', True)
    show_my_price = display_options.get('show_my_price', display_options.get('show_price_details', True))
    show_other_costs = display_options.get('show_other_costs', display_options.get('show_price_details', True))
    
    visible_indexes = []
    
    for idx, item in enumerate(invoice_items):
        # Pirmiausia patikrinti, ar yra 'visible' laukas (jei nustatytas, naudoti jį)
        if 'visible' in item:
            if item.get('visible', True):
                visible_indexes.append(idx)
            continue
        
        item_type = item.get('type')
        
        # Jei turime type lauką, naudoti jį
        if item_type:
            if item_type == 'main_route':
                visible_indexes.append(idx)
            elif item_type == 'carrier':
                if show_carriers:
                    visible_indexes.append(idx)
            elif item_type == 'my_price':
                if show_prices and show_my_price:
                    visible_indexes.append(idx)
            elif item_type == 'other_cost':
                if show_prices and show_other_costs:
                    visible_indexes.append(idx)
            else:
                visible_indexes.append(idx)
        else:
            # Fallback - identifikuoti pagal description
            desc = item.get('description', '').lower()
            desc_clean = desc.replace('<br>', ' ').replace('<br/>', ' ').replace('\n', ' ').replace('\r', ' ')
            
            # Pagrindinė eilutė (maršrutas) visada rodoma
            if 'maršrutas' in desc_clean and (idx == 0 or not any('vežėjas' in d.get('description', '').lower().replace('<br>', ' ').replace('\n', ' ') or 'sandėlis' in d.get('description', '').lower().replace('<br>', ' ').replace('\n', ' ') for d in invoice_items[:idx])):
                visible_indexes.append(idx)
            # Vežėjų eilutės
            elif 'vežėjas' in desc_clean or 'sandėlis' in desc_clean:
                if show_carriers:
                    visible_indexes.append(idx)
            # "Mano paslaugos" eilutė - NIEKADA nerodoma
            elif 'mano paslaugos' in desc_clean:
                # Niekada nerodoma HTML/PDF peržiūroje
                pass
            # Kitos išlaidos eilutės
            elif any(cost_word in desc_clean for cost_word in ['kitos išlaidos', 'keltas', 'keltuvas']):
                if show_prices and show_other_costs:
                    visible_indexes.append(idx)
            # Manual lines ir kitos - pagal nutylėjimą rodomos
            else:
                visible_indexes.append(idx)
    
    return visible_indexes


def _extract_numeric_suffix(invoice_number: str, prefix: str) -> tuple[Optional[int], str]:
    """
    Iš sąskaitos numerio ištraukia skaitinę dalį ir separatorius tarp prefikso ir skaitmenų.
    """
    if not invoice_number:
        return None, ''

    invoice_str = invoice_number.strip()
    if len(invoice_str) < len(prefix):
        return None, ''

    prefix_upper = prefix.upper()
    if invoice_str[:len(prefix)].upper() != prefix_upper:
        return None, ''

    suffix = invoice_str[len(prefix):]
    match = re.search(r'(\d+)(?!.*\d)', suffix)
    if not match:
        return None, suffix

    numeric_str = match.group(1)
    separator = suffix[:match.start(1)]
    try:
        return int(numeric_str), separator
    except ValueError:
        return None, separator


def find_invoice_number_gaps(prefix: str = None, width: int = None, max_gaps: int = 5) -> list:
    """
    Suranda tarpus sąskaitų numeracijoje.
    Grąžina sąrašą tuščių numerių (tarpų), kurie yra tarp egzistuojančių numerių.
    
    Args:
        prefix: Sąskaitos numerio prefix (pvz. 'LOG')
        width: Skaitmenų skaičius (pvz. 7)
        max_gaps: Maksimalus tarpų skaičius grąžinimui (default: 5)
    
    Returns:
        List of tuples: [(start_gap, end_gap), ...] - tarpų diapazonai
    """
    from apps.settings.models import InvoiceSettings
    
    if prefix is None or width is None:
        settings = InvoiceSettings.load()
        if prefix is None:
            prefix = settings.invoice_prefix_sales or 'LOG'
        if width is None:
            width = settings.invoice_number_width or 7
    
    prefix_upper = prefix.upper()

    # Gauti visus numerius su prefix
    all_numbers = SalesInvoice.objects.filter(
        invoice_number__istartswith=prefix_upper
    ).values_list('invoice_number', flat=True)

    # Išgauti skaitines dalis
    numeric_parts = []
    for number in all_numbers:
        num, _ = _extract_numeric_suffix(number, prefix)
        if num is not None:
            numeric_parts.append(num)

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

            # Visada rodyti kaip diapazoną
            gaps.append((gap_start, gap_end))

            if len(gaps) >= max_gaps:
                break

    return gaps[:max_gaps]


def get_first_available_gap_number(prefix: str = None, width: int = None):
    """
    Suranda pirmą tuščią numerį iš tarpų sąskaitų numeracijoje.
    Grąžina formatuotą numerį (pvz. 'LOG0003991') arba None, jei tarpų nėra.
    """
    gaps = find_invoice_number_gaps(prefix=prefix, width=width, max_gaps=1)
    if not gaps:
        return None
    
    # Pirmas tarpas
    gap = gaps[0]
    gap_start = gap[0]
    
    # Formatuoti numerį
    if prefix is None or width is None:
        from apps.settings.models import InvoiceSettings
        settings = InvoiceSettings.load()
        if prefix is None:
            prefix = settings.invoice_prefix_sales or 'LOG'
        if width is None:
            width = settings.invoice_number_width or 7
    
    # Naudoti tą patį separator kaip didžiausiam numeriui, jei toks yra
    _, separator = get_max_existing_invoice_number(prefix, width, return_separator=True)
    separator = separator or ''

    return f"{prefix}{separator}{gap_start:0{width}d}"


def get_max_existing_invoice_number(prefix: str = None, width: int = None, return_separator: bool = False):
    """
    Suranda didžiausią egzistuojantį sąskaitos numerį su duotu prefix.
    Grąžina skaitinę dalį (be prefix).
    Filtruoja ir SalesInvoice, ir PurchaseInvoice.
    """
    from apps.settings.models import InvoiceSettings
    from .models import PurchaseInvoice
    
    if prefix is None or width is None:
        settings = InvoiceSettings.load()
        if prefix is None:
            prefix = settings.invoice_prefix_sales or 'LOG'
        if width is None:
            width = settings.invoice_number_width or 7
    
    prefix_upper = prefix.upper()
    max_number = 0
    separator_for_max = ''

    # Gauti visus numerius su prefix iš SalesInvoice
    sales_numbers = SalesInvoice.objects.filter(
        invoice_number__istartswith=prefix_upper
    ).values_list('invoice_number', flat=True)

    # Gauti visus numerius su prefix iš PurchaseInvoice
    purchase_numbers = PurchaseInvoice.objects.filter(
        invoice_number__istartswith=prefix_upper
    ).values_list('invoice_number', flat=True)

    # Sujungti abu sąrašus
    all_numbers = list(sales_numbers) + list(purchase_numbers)

    for number in all_numbers:
        num, separator_candidate = _extract_numeric_suffix(number, prefix)
        if num is None:
            continue
        if num > max_number:
            max_number = num
            separator_for_max = separator_candidate or ''

    if return_separator:
        return max_number, separator_for_max
    return max_number


def synchronize_invoice_sequence(prefix: str = None, width: int = None) -> None:
    """
    Sinchronizuoja InvoiceNumberSequence su didžiausiu egzistuojančiu numeriu.
    VISADA atnaujina seką, net jei tai reiškia sekos sumažinimą.
    """
    from apps.settings.models import InvoiceSettings
    from datetime import datetime
    
    current_year = datetime.now().year
    
    if prefix is None or width is None:
        settings = InvoiceSettings.load()
        if prefix is None:
            prefix = settings.invoice_prefix_sales or 'LOG'
        if width is None:
            width = settings.invoice_number_width or 7
    
    max_existing, _ = get_max_existing_invoice_number(prefix, width, return_separator=True)
    
    # VISADA atnaujinti seką pagal didžiausią egzistuojantį numerį
    sequence, _ = InvoiceNumberSequence.objects.get_or_create(
        year=current_year,
        defaults={'last_number': 0}
    )
    
    # Atnaujinti seką, net jei max_existing mažesnis nei sequence.last_number
    # (tai gali atsitikti trinant paskutinę sąskaitą)
    if max_existing != sequence.last_number:
        sequence.last_number = max_existing
        sequence.save(update_fields=['last_number'])


def generate_invoice_number(prefix: str = None, width: int = None) -> str:
    """
    Generuoja unikalų sąskaitos numerį pagal metus ir prefix, naudojant seką per einamuosius metus.
    Formatas: PREFIX + zero-pad sekos numeris.
    Pvz.: LOG0001234 (kai width=7, prefix='LOG')
    
    Jei prefix arba width nenurodyti, naudoja InvoiceSettings nustatymus.
    
    DĖMESYS: Kadangi InvoiceNumberSequence neturi prefix lauko, kiekvienas prefix turi
    savo unikalų numerį gauti iš DB pagal prefix. Naudojame get_max_existing_invoice_number
    ir patikriname, ar numeris jau egzistuoja prieš grąžinant.
    """
    from apps.settings.models import InvoiceSettings
    from django.db.models import F
    from django.db import transaction
    
    current_year = datetime.now().year
    
    # Gauti nustatymus, jei prefix arba width nenurodyti
    if prefix is None or width is None:
        settings = InvoiceSettings.load()
        if prefix is None:
            prefix = settings.invoice_prefix_sales or 'LOG'
        if width is None:
            width = settings.invoice_number_width or 7

    # Pirmiausia sinchronizuoti seką su didžiausiu egzistuojančiu numeriu šiam prefix
    synchronize_invoice_sequence(prefix, width)
    
    # Gauti maksimalų egzistuojantį numerį šiam prefix
    max_existing, separator = get_max_existing_invoice_number(prefix, width, return_separator=True)
    
    # Gauname arba sukuriame seką šiems metams su row-level lock (select_for_update)
    # Tai užtikrina, kad tik viena užklausa gali atnaujinti seką vienu metu
    with transaction.atomic():
        # Bandyti gauti seką su lock
        try:
            sequence = InvoiceNumberSequence.objects.select_for_update().get(year=current_year)
        except InvoiceNumberSequence.DoesNotExist:
            # Jei neegzistuoja, sukurti (bet gali būti race condition)
            try:
                sequence = InvoiceNumberSequence.objects.create(year=current_year, last_number=0)
            except Exception:
                # Jei kitoje užklausoje jau sukurtas, bandyti gauti dar kartą
                sequence = InvoiceNumberSequence.objects.select_for_update().get(year=current_year)
        
        # Naudoti maksimalų egzistuojantį numerį + 1 kaip pradžios tašką
        # (kadangi skirtingi prefix dalijasi tą pačią seką, turime naudoti maksimalų)
        # Bet jei sequence.last_number didesnis, naudoti jį
        start_number = max(max_existing + 1, sequence.last_number + 1)
        
        # Atomiškai nustatyti numerį naudojant F() expression
        InvoiceNumberSequence.objects.filter(id=sequence.id).update(
            last_number=start_number
        )
        
        # Perkrauti objektą iš DB, kad gautume atnaujintą last_number
        sequence.refresh_from_db()
        
        # Naudoti atnaujintą numerį
        next_number = sequence.last_number
    
    # Formatas be metų ir brūkšnio: PREFIX + zero-pad(next_number)
    separator = separator or ''
    invoice_number = f"{prefix}{separator}{next_number:0{width}d}"
    
    # Patikrinti, ar numeris jau egzistuoja (apsauga nuo dublikatų)
    # Tai yra svarbu, nes skirtingi prefix gali gauti tą patį numerį iš sekos
    from .models import PurchaseInvoice
    max_attempts = 10
    attempts = 0
    while (SalesInvoice.objects.filter(invoice_number=invoice_number).exists() or 
           PurchaseInvoice.objects.filter(invoice_number=invoice_number).exists()):
        attempts += 1
        if attempts >= max_attempts:
            raise ValueError(f"Neįmanoma sugeneruoti unikalaus numerio su prefix {prefix} po {max_attempts} bandymų")
        
        # Gauti maksimalų egzistuojantį numerį dar kartą (gali būti atnaujintas)
        max_existing, separator = get_max_existing_invoice_number(prefix, width, return_separator=True)
        
        # Didinti numerį ir bandyti dar kartą
        with transaction.atomic():
            sequence = InvoiceNumberSequence.objects.select_for_update().get(year=current_year)
            # Naudoti maksimalų + 1 arba sekos numerį + 1, kas didesnis
            next_candidate = max(max_existing + 1, sequence.last_number + 1)
            InvoiceNumberSequence.objects.filter(id=sequence.id).update(
                last_number=next_candidate
            )
            sequence.refresh_from_db()
            next_number = sequence.last_number
        
        separator = separator or ''
        invoice_number = f"{prefix}{separator}{next_number:0{width}d}"

    return invoice_number


def amount_to_words(amount: Decimal, lang: str = 'lt') -> str:
    """
    Konvertuoja sumą į tekstą pagal nurodytą kalbą.
    """
    if lang == 'en':
        return amount_to_words_en(amount)
    elif lang == 'ru':
        return amount_to_words_ru(amount)
    return amount_to_words_lt(amount)


def amount_to_words_en(amount: Decimal) -> str:
    """
    Converts amount to English text.
    E.g.: 1318.90 -> "One thousand three hundred eighteen EUR, 90ct."
    """
    from num2words import num2words
    
    euros = int(amount)
    cents = int((amount - Decimal(euros)) * 100)
    
    try:
        words = num2words(euros, lang='en').replace(',', '')
        result = words.capitalize() + ' EUR'
        result += f', {cents:02d}ct.'
        return result
    except Exception:
        # Fallback if num2words is not installed
        return f"{amount:.2f} EUR"


def amount_to_words_ru(amount: Decimal) -> str:
    """
    Converts amount to Russian text.
    E.g.: 1318.90 -> "Одна тысяча триста восемнадцать EUR, 90ct."
    """
    from num2words import num2words
    
    euros = int(amount)
    cents = int((amount - Decimal(euros)) * 100)
    
    try:
        words = num2words(euros, lang='ru')
        result = words.capitalize() + ' EUR'
        result += f', {cents:02d}ct.'
        return result
    except Exception:
        # Fallback if num2words is not installed
        return f"{amount:.2f} EUR"


def amount_to_words_lt(amount: Decimal) -> str:
    """
    Konvertuoja sumą į lietuvių kalbos tekstą.
    Pvz.: 1318.90 -> "Vienas tūkstantis trys šimtai aštuoniolika EUR, 90ct."
    """
    # Skaičiai lietuviškai
    ones = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni']
    tens = ['', 'dešimt', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 'penkiasdešimt', 
            'šešiasdešimt', 'septyniasdešimt', 'aštuoniasdešimt', 'devyniasdešimt']
    teens = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika', 'penkiolika',
             'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika']
    hundreds = ['', 'šimtas', 'du šimtai', 'trys šimtai', 'keturi šimtai', 'penki šimtai',
                'šeši šimtai', 'septyni šimtai', 'aštuoni šimtai', 'devyni šimtai']
    thousands = ['', 'tūkstantis', 'tūkstančiai', 'tūkstančių']
    
    # Skirstome į eurus ir centus
    euros = int(amount)
    cents = int((amount - Decimal(euros)) * 100)
    
    words_parts = []
    
    if euros == 0:
        words_parts.append('nulis')
    else:
        # Tūkstančiai
        thousands_part = euros // 1000
        if thousands_part > 0:
            if thousands_part == 1:
                words_parts.append('vienas tūkstantis')
            elif thousands_part < 10:
                words_parts.append(ones[thousands_part] + ' ' + 
                                  (thousands[2] if thousands_part > 1 else thousands[1]))
            else:
                # Sudėtingesnės tūkstančių kombinacijos
                thousands_str = number_to_words_lt_helper(thousands_part)
                words_parts.append(thousands_str + ' ' + thousands[3])
        
        # Šimtai, dešimtys, vienetai (likęs dalis)
        remainder = euros % 1000
        if remainder > 0:
            remainder_str = number_to_words_lt_helper(remainder)
            words_parts.append(remainder_str)
    
    # Sujungiame visus žodžius
    result = ' '.join(words_parts).strip() + ' EUR'
    
    # Pridedame centus
    if cents > 0:
        cents_str = number_to_words_lt_helper(cents)
        result += f', {cents}ct.'
    else:
        result += ', 00ct.'
    
    return result


def number_to_words_lt_helper(num: int) -> str:
    """Pagalbinė funkcija skaičių konvertavimui į žodžius (iki 999)"""
    ones = ['', 'vienas', 'du', 'trys', 'keturi', 'penki', 'šeši', 'septyni', 'aštuoni', 'devyni']
    tens = ['', 'dešimt', 'dvidešimt', 'trisdešimt', 'keturiasdešimt', 'penkiasdešimt', 
            'šešiasdešimt', 'septyniasdešimt', 'aštuoniasdešimt', 'devyniasdešimt']
    teens = ['dešimt', 'vienuolika', 'dvylika', 'trylika', 'keturiolika', 'penkiolika',
             'šešiolika', 'septyniolika', 'aštuoniolika', 'devyniolika']
    hundreds = ['', 'šimtas', 'du šimtai', 'trys šimtai', 'keturi šimtai', 'penki šimtai',
                'šeši šimtai', 'septyni šimtai', 'aštuoni šimtai', 'devyni šimtai']
    
    if num == 0:
        return ''
    
    parts = []
    
    # Šimtai
    hundreds_digit = num // 100
    if hundreds_digit > 0:
        parts.append(hundreds[hundreds_digit])
    
    # Dešimtys ir vienetai
    remainder = num % 100
    if remainder >= 10 and remainder < 20:
        parts.append(teens[remainder - 10])
    else:
        tens_digit = remainder // 10
        ones_digit = remainder % 10
        if tens_digit > 0:
            parts.append(tens[tens_digit])
        if ones_digit > 0:
            parts.append(ones[ones_digit])
    
    return ' '.join(parts).strip()

