"""Importuoja Infotrans CSV duomenis į TMS užsakymus ir sąskaitas."""

from __future__ import annotations

import argparse
import csv
import os
import sys
from datetime import datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Dict, List, Tuple

BASE_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = BASE_DIR / "backend"
for path in (BASE_DIR, BACKEND_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "tms_project.settings")

import django

django.setup()

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.orders.models import Order, OrderCarrier, PaymentStatus, CargoItem
from apps.invoices.models import SalesInvoice, PurchaseInvoice, ExpenseCategory
from apps.partners.models import Partner


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Importuoti Infotrans užsakymus į TMS.")
    parser.add_argument("--input", required=True, type=Path, help="Kelias iki infotrans_uzsakymai_enriched.csv")
    parser.add_argument("--expense-category-id", type=int, default=None, help="ExpenseCategory ID pirkimo sąskaitoms")
    parser.add_argument("--apply", action="store_true", help="Jei nenurodoma – veikia kaip dry-run, nieko neįrašo")
    parser.add_argument("--skip-existing", action="store_true", help="Praleisti užsakymus, jei toks numeris jau egzistuoja (numatytasis elgesys: praleidžia)")
    parser.add_argument("--default-manager-id", type=int, default=None, help="Vadybininko ID (jei reikia priskirti)")
    parser.add_argument("--limit", type=int, default=None, help="Maksimalus importuojamų eilučių skaičius (testavimui)")
    return parser.parse_args()


def to_decimal(value: str) -> Decimal:
    if not value:
        return Decimal("0.00")
    text = str(value).strip()
    if not text:
        return Decimal("0.00")
    text = text.replace("€", "").replace("EUR", "").replace(" ", "").replace(" ", "")
    text = text.replace(",", ".")
    try:
        return Decimal(text)
    except InvalidOperation:
        return Decimal("0.00")


def to_int(value: str) -> int | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text)
    except ValueError:
        return None


def to_date(value: str) -> datetime.date | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%d.%m.%y", "%y.%m.%d"):
        try:
            dt = datetime.strptime(text, fmt)
            return dt.date()
        except ValueError:
            continue
    return None


def to_datetime(date_value: datetime.date | None) -> datetime | None:
    if not date_value:
        return None
    tz = timezone.get_current_timezone()
    dt = datetime.combine(date_value, time(hour=8, minute=0))
    if settings.USE_TZ:
        return timezone.make_aware(dt, tz)
    return dt


def clean_invoice_number(value: str) -> str:
    if not value:
        return ""
    return value.replace("\ufeff", "").strip()


def ensure_expense_category(expense_category_id: int | None) -> ExpenseCategory:
    if expense_category_id:
        return ExpenseCategory.objects.get(id=expense_category_id)
    # bandome rasti dažniausiai naudojamas kategorijas
    for name in ("Išlaidos vežėjui", "Vezejas", "Vezejui"):
        cat = ExpenseCategory.objects.filter(name__iexact=name).first()
        if cat:
            return cat
    # fallback – paimti pirmą egzistuojantį įrašą
    cat = ExpenseCategory.objects.first()
    if cat:
        return cat
    raise RuntimeError("Nerasta jokia ExpenseCategory – sukurkite bent vieną įrašą prieš importą")


def pick_manager(manager_id: int | None):
    from apps.auth.models import User

    if manager_id:
        return User.objects.filter(id=manager_id).first()
    return User.objects.filter(is_active=True).order_by("id").first()


def import_orders(
    csv_path: Path,
    expense_category: ExpenseCategory,
    apply_changes: bool,
    skip_existing: bool,
    default_manager,
    limit: int | None = None,
) -> Dict[str, int]:
    stats = {
        "rows": 0,
        "orders_created": 0,
        "orders_skipped_existing": 0,
        "orders_skipped_missing_client": 0,
        "sales_created": 0,
        "sales_skipped_existing": 0,
        "purchase_created": 0,
        "purchase_skipped_missing_carrier": 0,
        "order_carriers_created": 0,
        "cargo_created": 0,
    }

    with csv_path.open(encoding="utf-8") as csv_file:
        reader = csv.DictReader(csv_file)
        for row in reader:
            stats["rows"] += 1
            # Patikrinti ar pasiektas limitas (po eilutės skaičiavimo)
            if limit is not None and stats["rows"] > limit:
                break
            order_number = row.get("order_number", "").strip()
            client_id_text = row.get("client_partner_id", "").strip()

            if not client_id_text:
                stats["orders_skipped_missing_client"] += 1
                continue

            client = Partner.objects.filter(id=int(client_id_text)).first()
            if not client:
                stats["orders_skipped_missing_client"] += 1
                continue

            existing_order = Order.objects.filter(order_number=order_number).first()
            if existing_order:
                stats["orders_skipped_existing"] += 1
                order = existing_order
                created = False
            else:
                if not apply_changes and skip_existing:
                    # dry-run atveju tiesiog praleidžiame, kad neskaičiuotume dvigubai
                    order = None
                else:
                    order = Order(order_number=order_number)
                created = True

            if order is None:
                continue

            # Užsakymo laukų paruošimas
            loading_date = to_date(row.get("loading_date", ""))
            unloading_date = to_date(row.get("unloading_date", ""))

            order.client = client
            order_type_value = row.get("order_type", "").strip()
            if order_type_value:
                order.order_type = order_type_value
            else:
                order.order_type = "Transportas"
            order.manager = default_manager
            order.status = Order.OrderStatus.FINISHED if row.get("sales_invoice_numbers") else Order.OrderStatus.EXECUTING

            client_amount = to_decimal(row.get("client_amount_eur", ""))
            carrier_amount = to_decimal(row.get("carrier_amount_eur", ""))

            order.price_net = client_amount
            order.client_price_net = client_amount
            order.my_price_net = carrier_amount

            order.vat_rate = Decimal("21.00")
            order.client_invoice_issued = bool(row.get("sales_invoice_numbers"))
            order.client_payment_status = PaymentStatus.NOT_PAID

            route_from_country = row.get("route_from_country", "").strip()
            route_from_postal = row.get("route_from_postal_code", "").strip()
            route_from_city = row.get("route_from_city", "").strip()
            route_to_country = row.get("route_to_country", "").strip()
            route_to_postal = row.get("route_to_postal_code", "").strip()
            route_to_city = row.get("route_to_city", "").strip()

            def compose_route(country, postal, city):
                parts = [part for part in (country, postal, city) if part]
                return " ".join(parts)

            order.route_from_country = route_from_country
            order.route_from_postal_code = route_from_postal
            order.route_from_city = route_from_city
            order.route_from = compose_route(route_from_country, route_from_postal, route_from_city)
            order.route_to_country = route_to_country
            order.route_to_postal_code = route_to_postal
            order.route_to_city = route_to_city
            order.route_to = compose_route(route_to_country, route_to_postal, route_to_city)

            order.order_date = to_datetime(loading_date) or to_datetime(unloading_date)
            order.loading_date = to_datetime(loading_date)
            order.unloading_date = to_datetime(unloading_date)

            weight = to_decimal(row.get("cargo_weight_kg", ""))
            ldm = to_decimal(row.get("cargo_ldm", ""))
            order.weight_kg = weight if weight else None
            order.ldm = ldm if ldm else None

            original_notes = row.get("notes", "").strip()
            expedition_number = row.get("expedition_number", "").strip()
            order.notes = original_notes if original_notes else ""

            if apply_changes:
                with transaction.atomic():
                    order.save()
            if created:
                stats["orders_created"] += 1

            # Cargo items
            cargo_description = (row.get("cargo_description") or "").strip()
            if cargo_description:
                create_cargo = True
                if order.pk:
                    create_cargo = not order.cargo_items.exists()
                if create_cargo:
                    cargo_item = CargoItem(
                        order=order,
                        sequence_order=1,
                        description=cargo_description,
                        weight_kg=weight if weight else None,
                        ldm=ldm if ldm else None,
                        is_palletized=bool(row.get("cargo_ep")),
                    )
                    if apply_changes:
                        with transaction.atomic():
                            cargo_item.save()
                    stats["cargo_created"] += 1

            # OrderCarrier
            carrier_id_text = row.get("carrier_partner_id", "").strip()
            if carrier_id_text:
                carrier_partner = Partner.objects.filter(id=int(carrier_id_text)).first()
                if carrier_partner:
                    existing_carrier = False
                    if order.pk:
                        existing_carrier = order.carriers.filter(partner=carrier_partner).exists()
                    if not existing_carrier:
                        carrier = OrderCarrier(
                            order=order,
                            partner=carrier_partner,
                            carrier_type=OrderCarrier.CarrierType.CARRIER,
                            sequence_order=1,
                            price_net=carrier_amount if carrier_amount else None,
                            route_from=order.route_from,
                            route_to=order.route_to,
                            loading_date=order.loading_date,
                            unloading_date=order.unloading_date,
                        )
                        # Nustatyti expedition_number po objekto sukūrimo, bet prieš save()
                        # Kad save() metodas nepakeistų importuoto numerio
                        if expedition_number:
                            carrier.expedition_number = expedition_number
                            # Nustatyti flag'ą, kad save() metodas neperrašytų importuoto numerio
                            carrier._expedition_number_was_set = True
                        if apply_changes:
                            with transaction.atomic():
                                carrier.save()
                        stats["order_carriers_created"] += 1
                else:
                    stats["purchase_skipped_missing_carrier"] += 1
            elif row.get("carrier_details", "").strip():
                stats["purchase_skipped_missing_carrier"] += 1

            # Sales invoice
            invoice_number = clean_invoice_number(row.get("sales_invoice_numbers", ""))
            if invoice_number:
                existing_invoice = SalesInvoice.objects.filter(invoice_number=invoice_number).first()
                if existing_invoice:
                    stats["sales_skipped_existing"] += 1
                else:
                    # Pirmiausia bandyti gauti datą iš CSV (sales_invoice_dates)
                    # Jei nėra, naudoti loading_date arba unloading_date
                    # Jei nėra nei vienos, naudoti užsakymo sukūrimo datą (jei order.pk), bet ne importo datą
                    issue_date = to_date(row.get("sales_invoice_dates", ""))
                    if not issue_date:
                        issue_date = loading_date or unloading_date
                    if not issue_date and order.pk:
                        # Jei užsakymas jau sukurtas, naudoti jo created_at datą
                        issue_date = order.created_at.date() if hasattr(order, 'created_at') and order.created_at else None
                    if not issue_date:
                        # Paskutinis fallback - naudoti šiandienos datą, bet tik jei tikrai nėra kitos datos
                        issue_date = datetime.today().date()
                    term_days = to_int(row.get("sales_invoice_terms", "")) or 0
                    due_date = issue_date + timedelta(days=term_days)
                    sales_invoice = SalesInvoice(
                        invoice_number=invoice_number,
                        partner=client,
                        related_order=order if order.pk else None,
                        amount_net=client_amount,
                        vat_rate=Decimal("21.00"),
                        issue_date=issue_date,
                        due_date=due_date,
                        notes=f"Importuota iš Infotrans (užsakymas {order_number})",
                    )
                    if apply_changes:
                        with transaction.atomic():
                            sales_invoice.save()
                            # Jei order dar nebuvo susietas, susieti dabar
                            if not sales_invoice.related_order and order.pk:
                                sales_invoice.related_order = order
                            sales_invoice.save()
                    stats["sales_created"] += 1

            # Purchase invoice
            purchase_number = clean_invoice_number(row.get("purchase_invoice_numbers", ""))
            if purchase_number:
                carrier_partner = None
                if row.get("carrier_partner_id", "").strip():
                    carrier_partner = Partner.objects.filter(id=int(row["carrier_partner_id"]) ).first()
                if not carrier_partner:
                    stats["purchase_skipped_missing_carrier"] += 1
                else:
                    existing_purchase = PurchaseInvoice.objects.filter(received_invoice_number=purchase_number).first()
                    if existing_purchase:
                        # dublikato atveju – praleidžiame
                        pass
                    else:
                        # Pirmiausia bandyti gauti datą iš CSV (purchase_invoice_dates)
                        # Jei nėra, naudoti unloading_date arba loading_date
                        # Jei nėra nei vienos, naudoti užsakymo sukūrimo datą (jei order.pk), bet ne importo datą
                        issue_date = to_date(row.get("purchase_invoice_dates", ""))
                        if not issue_date:
                            issue_date = unloading_date or loading_date
                        if not issue_date and order.pk:
                            # Jei užsakymas jau sukurtas, naudoti jo created_at datą
                            issue_date = order.created_at.date() if hasattr(order, 'created_at') and order.created_at else None
                        if not issue_date:
                            # Paskutinis fallback - naudoti šiandienos datą, bet tik jei tikrai nėra kitos datos
                            issue_date = datetime.today().date()
                        term_days = to_int(row.get("purchase_invoice_terms", "")) or 0
                        due_date = issue_date + timedelta(days=term_days)
                        purchase_invoice = PurchaseInvoice(
                            received_invoice_number=purchase_number,
                            partner=carrier_partner,
                            expense_category=expense_category,
                            amount_net=carrier_amount,
                            vat_rate=Decimal("21.00"),
                            issue_date=issue_date,
                            received_date=issue_date,
                            due_date=due_date,
                            notes=f"Importuota iš Infotrans (užsakymas {order_number})",
                        )
                        if apply_changes:
                            with transaction.atomic():
                                purchase_invoice.save()
                                if order.pk:
                                purchase_invoice.related_orders.add(order)
                                purchase_invoice.related_orders_amounts = [
                                    {"order_id": order.id, "amount": str(carrier_amount)}
                                ]
                                purchase_invoice.save()
                                    
                                    # Atnaujinti OrderCarrier.invoice_received flag'ą
                                    if carrier_partner:
                                        from apps.orders.models import OrderCarrier
                                        order_carriers = OrderCarrier.objects.filter(
                                            order=order,
                                            partner=carrier_partner
                                        )
                                        order_carriers.update(
                                            invoice_received=True,
                                            invoice_received_date=issue_date
                                        )
                        stats["purchase_created"] += 1

    return stats


def main() -> None:
    args = parse_arguments()
    if not args.input.exists():
        print(f"Input failas {args.input} nerastas", file=sys.stderr)
        sys.exit(1)

    expense_category = ensure_expense_category(args.expense_category_id)
    manager = pick_manager(args.default_manager_id)

    stats = import_orders(
        csv_path=args.input,
        expense_category=expense_category,
        apply_changes=args.apply,
        skip_existing=args.skip_existing,
        default_manager=manager,
        limit=args.limit,
    )

    mode = "REAL IMPORT" if args.apply else "DRY-RUN"
    print(f"=== {mode} BAIGTA ===")
    for key, value in stats.items():
        print(f"{key}: {value}")

    if not args.apply:
        print("Dry-run režimas: duomenys NEBUVO įrašyti. Paleiskite su --apply kad importuoti.")


if __name__ == "__main__":
    main()

