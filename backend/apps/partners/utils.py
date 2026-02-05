import re


def normalize_partner_code(code: str) -> str:
    if not code:
        return ''
    cleaned = re.sub(r"[^0-9A-Za-z]", "", code.strip())
    return cleaned.upper()


def normalize_vat_code(vat: str) -> str:
    """Pašalina tarpus, taškus, brūkšnelius – palieka tik raidės ir skaitmenys (ISO šalies kodas + kodo dalis)."""
    if not vat:
        return ''
    cleaned = re.sub(r"[^0-9A-Za-z]", "", vat.strip())
    return cleaned.upper()


# —— 1 žingsnis: Šiukšlių valymas (Sanity Check) ——
# Taisyklė: pašaliname tarpus, taškus, brūkšnelius. Tikriname: bent 7 simboliai, ne akivaizdžios nesąmonės.
_SANITY_MIN_LENGTH = 7
_SANITY_BLOCKLIST = frozenset([
    "123", "1234", "12345", "123456", "test", "testas", "nėra", "nera",
    "nežinau", "nezinau", "n/a", "na", "xxx", "none", "null", "ne", "x", "0", "1", "-",
])


def _normalize_for_validation(value: str) -> str:
    """Valymas: tarpai, taškai, brūkšneliai pašalinami, likusi dalis uppercase."""
    if not value or not value.strip():
        return ""
    return re.sub(r"[^0-9A-Za-z]", "", value.strip()).upper()


def _sanity_check(cleaned: str, min_length: int = _SANITY_MIN_LENGTH) -> bool:
    """
    Ar kodas praeina sanity check: bent min_length simbolių, ne iš blocklist.
    Tuščiam cleaned (pvz. PVM neprivalomas) nereikia tikrinti – tai atskirai logikoje.
    """
    if not cleaned:
        return True  # tuščias – priimamas tik kur leidžiama (PVM)
    if len(cleaned) < min_length:
        return False
    if cleaned.lower() in _SANITY_BLOCKLIST:
        return False
    return True


# —— 2 žingsnis: Lietuviški kodai ——
# Įmonės kodas: 7 (seni) arba 9 (nauji) skaitmenys. PVM: LT + 9 arba 12 skaitmenų.
_COMPANY_CODE_7 = re.compile(r"^\d{7}$")
_COMPANY_CODE_9 = re.compile(r"^\d{9}$")
_LT_VAT_PATTERN = re.compile(r"^LT\d{9}$|^LT\d{12}$", re.IGNORECASE)


def _lt_company_code_control_digit_ok(digits_only: str) -> bool:
    """
    Bonus: LT 9 skaitmenų įmonės kodo kontrolinis skaitmuo (9-as skaitmuo).
    Galima įdėti matematinį algoritmą (svoriai, mod 11) – be interneto patikrina, ar kodas realus.
    Kol kas visada True (neimplementuota).
    """
    if len(digits_only) != 9:
        return True
    # TODO: oficialus LR įmonės kodo kontrolinio skaitmens algoritmas (svoriai, mod 11)
    return True


def _is_valid_lt_company_code(digits_only: str) -> bool:
    """Ar atitinka LT įmonės kodo formatą: tiksliai 7 arba 9 skaitmenys (+ optional kontrolinis)."""
    if not (_COMPANY_CODE_7.match(digits_only) or _COMPANY_CODE_9.match(digits_only)):
        return False
    return _lt_company_code_control_digit_ok(digits_only)


def _is_valid_lt_vat(cleaned: str) -> bool:
    """Ar atitinka LT PVM: LT + 9 arba 12 skaitmenų."""
    return bool(_LT_VAT_PATTERN.match(cleaned))


# —— 3 žingsnis: ES įmonių RegEx (pagal šalies kodą PL, DE, LV...) ——
# GB nebegalioja VIES po Brexit; Šiaurės Airija naudoja XI.
_EU_VAT_PATTERN = re.compile(
    r"^(ATU[0-9]{8}|BE[01][0-9]{9}|BG[0-9]{9,10}|CY[0-9]{8}[A-Z]|CZ[0-9]{8,10}|"
    r"DE[0-9]{9}|DK[0-9]{8}|EE[0-9]{9}|EL[0-9]{9}|ES[A-Z][0-9]{7}(?:[0-9]|[A-Z])|"
    r"FI[0-9]{8}|FR[0-9A-Z]{2}[0-9]{9}|HR[0-9]{11}|HU[0-9]{8}|IE[0-9]{7}[A-Z]{1,2}|"
    r"IT[0-9]{11}|LT(?:[0-9]{9}|[0-9]{12})|LU[0-9]{8}|LV[0-9]{11}|MT[0-9]{8}|"
    r"NL[0-9]{9}B[0-9]{2}|PL[0-9]{10}|PT[0-9]{9}|RO[1-9][0-9]{1,9}|SE[0-9]{12}|"
    r"SI[0-9]{8}|SK[0-9]{10})$",
    re.IGNORECASE,
)


def is_valid_company_code(code: str) -> bool:
    """
    4 žingsnių logika:
    1) Sanity: valymas, bent 7 simboliai, ne blocklist („test“, „nežinau“ ir t. t.).
    2) LT: 7 arba 9 skaitmenys (griežtas filtras).
    3) ES RegEx: jei ne LT – tikriname pagal šalies kodą (PL, DE, LV...) su ES PVM regex.
    4) VIES – kvietimas atskirai, kai formatas jau teisingas (ne čia).
    """
    if not code or not code.strip():
        return False
    cleaned = _normalize_for_validation(code)
    # 1 žingsnis: sanity
    if not _sanity_check(cleaned):
        return False
    # 2 žingsnis: LT įmonės kodas (tik skaičiai, 7 arba 9)
    digits_only = re.sub(r"\D", "", cleaned)
    if _is_valid_lt_company_code(digits_only):
        return True
    # 3 žingsnis: ne LT – ES RegEx (dažnai užsienio „įm. kodas“ = PVM)
    if _EU_VAT_PATTERN.match(cleaned):
        return True
    # Jei yra raidžių bet neatitiko ES formato (pvz. 7EXPRESSMB, ALGIRDASKA001) – neteisingas
    if re.search(r"[A-Za-z]", cleaned):
        return False
    # Užsienio: tik skaičiai, 8–15 skaitmenų (pvz. PL NIP tik skaičiais)
    if 8 <= len(digits_only) <= 15:
        return True
    return False


def get_company_code_format(code: str) -> str | None:
    """
    Grąžina: 'current' (9 skaitmenys), 'legacy' (7 skaitmenų), arba None (netinkamas).
    Naudinga UI rodyti „Pasenęs formatas“ 7 skaitmenų kodams.
    """
    if not code or not code.strip():
        return None
    digits_only = re.sub(r"\D", "", code.strip())
    if _COMPANY_CODE_9.match(digits_only):
        return "current"
    if _COMPANY_CODE_7.match(digits_only):
        return "legacy"
    return None


def is_valid_vat_code(vat: str) -> bool:
    """
    Ar PVM kodas atitinka vieną iš ES šalių formatų.
    - Tuščias = OK (nereikalaujama PVM).
    - Prieš tikrinimą kodas normalizuojamas: pašalinami tarpai, taškai, brūkšneliai.
    - Priimami formatai: AT, BE, BG, CY, CZ, DE, DK, EE, EL, ES, FI, FR, HR, HU, IE, IT,
      LT (9 arba 12 skaitmenų), LU, LV, MT, NL (su B), PL, PT, RO, SE, SI, SK.
    - Raidės leidžiamos (FR, NL, IE, ES ir kt.). GB nebegalioja VIES po Brexit.
    """
    if not vat or not vat.strip():
        return True
    cleaned = _normalize_for_validation(vat)
    if not cleaned:
        return True
    if not _sanity_check(cleaned):
        return False
    if _is_valid_lt_vat(cleaned):
        return True
    return bool(_EU_VAT_PATTERN.match(cleaned))


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

