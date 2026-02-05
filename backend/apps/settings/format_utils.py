"""
Piniginių sumų formatavimas pagal InvoiceSettings (dešimtainiai skaičiai, skyriklis, valiuta).
Naudojama el. laiškuose ir API atsakymuose, kad sumos būtų rodomos vienodai pagal sistemos nustatymus.
"""
from decimal import Decimal


def format_money(
    value,
    currency_code=None,
    currency_symbol=None,
    decimal_places=None,
    decimal_separator=None,
):
    """
    Formatuoja piniginę sumą pagal sąskaitų nustatymus.

    Args:
        value: Suma (Decimal, float arba skaičius kaip string).
        currency_code: Valiutos kodas (pvz. 'EUR'). Jei None – iš InvoiceSettings.
        currency_symbol: Valiutos simbolis (pvz. '€'). Jei None – iš InvoiceSettings.
        decimal_places: Skaitmenų po kablelio (0–6). Jei None – iš InvoiceSettings.
        decimal_separator: Skyriklis ',' arba '.'. Jei None – iš InvoiceSettings.

    Returns:
        Eilutė, pvz. "23,50 EUR" arba "23.50 €".
    """
    if value is None:
        return ''
    try:
        amount = Decimal(str(value))
    except (TypeError, ValueError):
        return str(value)

    if currency_code is None or currency_symbol is None or decimal_places is None or decimal_separator is None:
        from .models import InvoiceSettings
        settings = InvoiceSettings.load()
        currency_code = currency_code or (settings.currency_code or 'EUR')
        currency_symbol = currency_symbol if currency_symbol is not None else (settings.currency_symbol or '')
        decimal_places = decimal_places if decimal_places is not None else (settings.decimal_places if hasattr(settings, 'decimal_places') else 2)
        decimal_separator = decimal_separator if decimal_separator is not None else (settings.decimal_separator if hasattr(settings, 'decimal_separator') else ',')

    # Apvalinti iki decimal_places
    quantize = Decimal('1.' + '0' * decimal_places) if decimal_places > 0 else Decimal('1')
    amount = amount.quantize(quantize)

    # Formatuoti: Python visada naudoja tašką, pakeičiame į nustatytą skyriklį
    str_amount = f"{amount:.{decimal_places}f}"
    formatted = str_amount.replace('.', decimal_separator) if decimal_separator != '.' else str_amount

    # Valiuta: simbolis arba kodas
    currency_display = (currency_symbol.strip() or currency_code).strip()
    return f"{formatted} {currency_display}"
