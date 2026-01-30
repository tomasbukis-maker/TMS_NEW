import re


def normalize_partner_code(code: str) -> str:
    if not code:
        return ''
    # Trim, upper, remove non-alphanumeric
    cleaned = re.sub(r"[^0-9A-Za-z]", "", code.strip())
    return cleaned.upper()


def normalize_vat_code(vat: str) -> str:
    if not vat:
        return ''
    cleaned = re.sub(r"[^0-9A-Za-z]", "", vat.strip())
    return cleaned.upper()


def normalize_partner_name(name: str) -> str:
    if not name:
        return ''
    # Collapse spaces, remove extra punctuation, uppercase
    cleaned = re.sub(r"\s+", " ", name.strip())
    return cleaned.upper()


_LT_MOJIBAKE_MAP = {
    # lowercase
    'à': 'ą', 'è': 'č', 'ê': 'ę', 'ë': 'ė', 'ì': 'į', 'ð': 'š', 'ù': 'ū', 'û': 'ų', 'þ': 'ž',
    'á': 'į', 'ä': 'ą', 'ö': 'ė',
    # uppercase
    'À': 'Ą', 'È': 'Č', 'Ê': 'Ę', 'Ë': 'Ė', 'Ì': 'Į', 'Ð': 'Š', 'Ù': 'Ū', 'Û': 'Ų', 'Þ': 'Ž',
    'Á': 'Į', 'Ä': 'Ą', 'Ö': 'Ė',
}


def fix_lithuanian_diacritics(text: str) -> str:
    """Best-effort pataiso dažniausius lietuvių diakritikų mojibake atvejus.
    Nekeičia jau teisingų UTF-8 raidžių.
    """
    if not text:
        return text
    return ''.join(_LT_MOJIBAKE_MAP.get(ch, ch) for ch in text)

