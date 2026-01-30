"""Papildomai praturtina konvertuotą CSV partnerių informacija iš DB."""

from __future__ import annotations

import argparse
import csv
import os
import sys
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, Tuple

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"
for path in (BASE_DIR, BACKEND_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "tms_project.settings")

import django

django.setup()

from apps.partners.models import Partner


MANUAL_NAME_OVERRIDES = {
    "d. marcinkeviči": 'D. Marcinkevičiaus gamybinė- komercinė įmonė "Medėja"',
    "uab inovatyvių": 'UAB Inovatyviø baldø fabrikas',
    "u. inovatyvių": 'UAB Inovatyviø baldø fabrikas',
    "uab collicare": 'UAB ColliCare Logistics',
    "7 express, mb": '7 Express, MB',
    "m. čyžienės in": 'M. ČYŽIENĖS INDIVIDUALI ĮMONĖ MILČIJA',
    "v. stonkaus ko": 'V. Stonkaus komercinė firma, UAB',
}

MANUAL_PREFIX_OVERRIDES = [
    ("uab uliss", "UAB Uliss"),
]


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sulygina infotrans CSV partnerius su DB.")
    parser.add_argument("--input", required=True, type=Path, help="Kelias iki convert_infotrans_orders.py sugeneruoto CSV")
    parser.add_argument("--output", required=True, type=Path, help="Kelias iki naujo CSV su papildomais laukais")
    parser.add_argument("--min-score", type=float, default=0.65, help="Minimalus atitikimo koeficientas [0-1]")
    return parser.parse_args()


def normalise_name(value: str) -> str:
    if not value:
        return ""
    text = value.lower()
    replacements = {
        "\u2013": "-",
        "\u2014": "-",
        "\u201c": "",
        "\u201d": "",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = text.replace("..", "")
    text = text.replace("…", "")
    text = text.replace("\"", "")
    text = text.replace("'", "")
    text = text.replace("&amp;", "&")
    text = text.replace("&", " and ")
    text = text.replace("`", "")
    text = text.replace("“", "").replace("”", "")
    # pašalinti įmonių formos žymėjimus tik iš pradžios
    text = text.strip()
    prefixes = [
        "uab",
        "sia",
        "ou",
        "mb",
        "iĮ",
        "įi",
        "iį",
        "ii",
        "ab",
    ]
    for prefix in prefixes:
        if text.startswith(prefix + " "):
            text = text[len(prefix) + 1 :]
            break
    # iš likusio pašaliname visus ne alfa skaitmenis
    cleaned = []
    for ch in text:
        if ch.isalnum():
            cleaned.append(ch)
        elif ch in " ":
            cleaned.append(" ")
    normalised = "".join(cleaned)
    normalised = " ".join(normalised.split())
    return normalised


def load_partners() -> Dict[int, Tuple[str, str]]:
    partners: Dict[int, Tuple[str, str]] = {}
    for partner in Partner.objects.all().only("id", "name"):
        partners[partner.id] = (partner.name, normalise_name(partner.name))
    return partners


def best_match(value: str, partners: Dict[int, Tuple[str, str]], min_score: float) -> Tuple[int, str, float]:
    if not value:
        return 0, "", 0.0
    normalised_value = normalise_name(value)
    if not normalised_value:
        return 0, "", 0.0

    lower_raw = value.lower().strip()
    name_override = MANUAL_NAME_OVERRIDES.get(lower_raw)
    if not name_override:
        for prefix, target in MANUAL_PREFIX_OVERRIDES:
            if lower_raw.startswith(prefix):
                name_override = target
                break
    if name_override:
        partner = Partner.objects.filter(name__iexact=name_override).first()
        if partner:
            return partner.id, partner.name, 1.0

    best_id = 0
    best_name = ""
    best_score = 0.0
    for partner_id, (raw_name, normalised_name) in partners.items():
        if not normalised_name:
            continue
        score = SequenceMatcher(None, normalised_value, normalised_name).ratio()
        if score > best_score:
            best_score = score
            best_id = partner_id
            best_name = raw_name
    if best_score >= min_score:
        return best_id, best_name, best_score
    return 0, "", best_score


def enrich_csv(input_path: Path, output_path: Path, min_score: float) -> Tuple[int, int]:
    partners = load_partners()
    with input_path.open(encoding="utf-8") as input_file:
        reader = csv.DictReader(input_file)
        fieldnames = reader.fieldnames or []
        extra_fields = [
            "client_partner_id",
            "client_partner_name",
            "client_partner_score",
            "carrier_partner_id",
            "carrier_partner_name",
            "carrier_partner_score",
        ]
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8", newline="") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=fieldnames + extra_fields)
            writer.writeheader()
            total = 0
            matched = 0
            for row in reader:
                total += 1
                client_id, client_name, client_score = best_match(row.get("client_name_clean", ""), partners, min_score)
                carrier_id, carrier_name, carrier_score = best_match(row.get("carrier_details_clean", ""), partners, min_score)

                display_client_name = client_name if client_id else row.get("client_name_clean", "")
                display_carrier_name = carrier_name if carrier_id else row.get("carrier_details_clean", "")
                row["client_name"] = display_client_name
                row["carrier_details"] = display_carrier_name
                if client_id:
                    matched += 1
                enriched = {
                    **row,
                    "client_partner_id": client_id or "",
                    "client_partner_name": client_name,
                    "client_partner_score": f"{client_score:.2f}" if client_id else "",
                    "carrier_partner_id": carrier_id or "",
                    "carrier_partner_name": carrier_name,
                    "carrier_partner_score": f"{carrier_score:.2f}" if carrier_id else "",
                }
                writer.writerow(enriched)
    return total, matched


def main() -> None:
    args = parse_arguments()
    if not args.input.exists():
        print(f"Input failas {args.input} nerastas", file=sys.stderr)
        sys.exit(1)

    total, matched = enrich_csv(args.input, args.output, args.min_score)
    print(f"Apdorota įrašų: {total}. Rasti klientų sutapimai: {matched}.")


if __name__ == "__main__":
    main()

