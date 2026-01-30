import csv
import logging
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from io import StringIO
from pathlib import Path
from datetime import datetime
from decimal import Decimal

from django.conf import settings
from django.core.management import call_command
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from apps.orders.models import Order, OrderCarrier
from apps.invoices.models import SalesInvoice, PurchaseInvoice
from apps.partners.models import Partner

logger = logging.getLogger(__name__)


class FullDatabaseExportView(APIView):
    """Paruošia pilną duomenų bazės eksportą (JSON dump + archyvas)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        temp_dir = tempfile.mkdtemp(prefix='logitrack_full_db_export_')
        dump_path = Path(temp_dir) / 'database.json'
        timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
        archive_name = f'logi_track_full_db_{timestamp}.tar.gz'
        archive_path = Path(temp_dir) / archive_name

        try:
            with open(dump_path, 'w', encoding='utf-8') as dump_file:
                call_command(
                    'dumpdata',
                    '--natural-foreign',
                    '--natural-primary',
                    '--indent',
                    '2',
                    '--database',
                    'default',
                    stdout=dump_file,
                )

            with tarfile.open(archive_path, 'w:gz') as tar:
                tar.add(dump_path, arcname='database.json')

            file_handle = open(archive_path, 'rb')
            response = FileResponse(
                file_handle,
                as_attachment=True,
                filename=archive_name,
                content_type='application/gzip',
            )
            response['Content-Length'] = archive_path.stat().st_size

            original_close = response.close

            def cleanup_response():
                try:
                    original_close()
                finally:
                    try:
                        file_handle.close()
                    except Exception:  # pragma: no cover
                        logger.warning('Nepavyko uždaryti laikino failo (pilnas DB eksportas).', exc_info=True)

                    for path in (archive_path, dump_path):
                        try:
                            if path.exists():
                                path.unlink()
                        except Exception:
                            logger.warning('Nepavyko pašalinti laikino failo %s', path, exc_info=True)

                    try:
                        shutil.rmtree(temp_dir, ignore_errors=True)
                    except Exception:
                        logger.warning('Nepavyko pašalinti laikino katalogo %s', temp_dir, exc_info=True)

            response.close = cleanup_response
            return response

        except Exception as exc:  # pragma: no cover
            logger.error('Pilnas DB eksportas nepavyko: %s', exc, exc_info=True)
            shutil.rmtree(temp_dir, ignore_errors=True)
            return Response(
                {'error': 'Nepavyko paruošti pilno DB eksporto. Bandykite dar kartą arba kreipkitės į administratorių.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class InfotransOrdersImportView(APIView):
    """Leidžia įkelti ir importuoti Infotrans CSV duomenis per UI."""

    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response({'error': 'Nepateiktas CSV failas.'}, status=status.HTTP_400_BAD_REQUEST)

        apply_changes = str(request.data.get('apply', 'true')).lower() == 'true'
        skip_existing = str(request.data.get('skip_existing', 'true')).lower() == 'true'

        expense_category_id = request.data.get('expense_category_id')
        default_manager_id = request.data.get('default_manager_id')
        limit = request.data.get('limit')
        if limit:
            try:
                limit = int(limit)
            except (ValueError, TypeError):
                limit = None
        else:
            limit = None

        temp_dir = tempfile.mkdtemp(prefix='logitrack_import_')
        temp_path = Path(temp_dir) / uploaded_file.name

        try:
            with temp_path.open('wb') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)

            tools_dir = Path(settings.BASE_DIR).parent / 'tools' / 'importers'
            script_path = tools_dir / 'import_infotrans_orders.py'
            if not script_path.exists():
                return Response(
                    {'error': 'Importavimo skriptas nerastas. Kreipkitės į administratorių.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            command = [
                sys.executable,
                str(script_path),
                '--input',
                str(temp_path),
            ]

            if expense_category_id:
                command.extend(['--expense-category-id', str(expense_category_id)])
            if default_manager_id:
                command.extend(['--default-manager-id', str(default_manager_id)])
            if apply_changes:
                command.append('--apply')
            if skip_existing:
                command.append('--skip-existing')
            if limit:
                command.extend(['--limit', str(limit)])

            process = subprocess.run(
                command,
                capture_output=True,
                text=True,
                cwd=str(Path(settings.BASE_DIR).parent),
                env={**os.environ},
            )

            stdout = process.stdout or ''
            stderr = process.stderr or ''

            if process.returncode != 0:
                logger.error('Infotrans importas nepavyko (status %s): %s', process.returncode, stderr)
                return Response(
                    {
                        'error': 'Importavimo metu įvyko klaida.',
                        'details': stderr.strip() or stdout.strip(),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            stats = {}
            for line in stdout.splitlines():
                if ':' in line:
                    key, value = line.split(':', 1)
                    key = key.strip()
                    value = value.strip()
                    if value.isdigit():
                        stats[key] = int(value)
                    else:
                        try:
                            stats[key] = float(value)
                        except ValueError:
                            stats[key] = value

            response_payload = {
                'success': True,
                'applied': apply_changes,
                'skip_existing': skip_existing,
                'stats': stats,
                'stdout': stdout.strip(),
            }

            if stderr.strip():
                response_payload['warnings'] = stderr.strip()

            return Response(response_payload)

        finally:
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:  # pragma: no cover
                logger.warning('Nepavyko pašalinti laikino katalogo po importo: %s', temp_dir, exc_info=True)


class InfotransOrdersDeleteView(APIView):
    """Ištrina užsakymus ir susijusius įrašus pagal CSV sąrašą."""

    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        # Patikrinti, ar prašoma ištrinti VISAS sąskaitas be CSV failo
        delete_all = str(request.data.get('delete_all', 'false')).lower() == 'true'
        
        if delete_all:
            dry_run = str(request.data.get('dry_run', 'true')).lower() == 'true'
            
            if dry_run:
                # Skaičiuoti kiek būtų ištrinta
                sales_count = SalesInvoice.objects.count()
                purchase_count = PurchaseInvoice.objects.count()
                
                return Response({
                    'success': True,
                    'dry_run': True,
                    'stats': {
                        'deleted_sales': sales_count,
                        'deleted_purchase': purchase_count,
                        'deleted_orders': 0,
                    },
                    'message': f'Dry-run: būtų ištrinta {sales_count} pardavimo ir {purchase_count} pirkimo sąskaitų'
                })
            else:
                # Ištrinti VISAS sąskaitas
                with transaction.atomic():
                    sales_count = SalesInvoice.objects.count()
                    purchase_count = PurchaseInvoice.objects.count()
                    
                    SalesInvoice.objects.all().delete()
                    PurchaseInvoice.objects.all().delete()
                    
                    logger.info(f'Infotrans delete ALL: ištrinta {sales_count} pardavimo ir {purchase_count} pirkimo sąskaitų')
                    
                    return Response({
                        'success': True,
                        'dry_run': False,
                        'stats': {
                            'deleted_sales': sales_count,
                            'deleted_purchase': purchase_count,
                            'deleted_orders': 0,
                        },
                        'message': f'Ištrinta {sales_count} pardavimo ir {purchase_count} pirkimo sąskaitų'
                    })
        
        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            logger.warning('Infotrans delete: nepateiktas failas')
            return Response({'error': 'Pasirinkite CSV failą arba pažymėkite "Ištrinti visas sąskaitas".'}, status=status.HTTP_400_BAD_REQUEST)

        dry_run = str(request.data.get('dry_run', 'true')).lower() == 'true'
        logger.info(f'Infotrans delete: pradedamas trynimas, dry_run={dry_run}, failas={uploaded_file.name}')

        temp_dir = tempfile.mkdtemp(prefix='logitrack_delete_')
        temp_path = Path(temp_dir) / uploaded_file.name

        try:
            with temp_path.open('wb') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            logger.info(f'Infotrans delete: failas išsaugotas į {temp_path}')

            order_numbers: set[str] = set()
            sales_numbers: set[str] = set()
            purchase_numbers: set[str] = set()
            row_count = 0

            try:
                with temp_path.open('r', encoding='utf-8-sig', newline='') as csv_file:
                    reader = csv.DictReader(csv_file)
                    for row in reader:
                        row_count += 1
                        order_number = (row.get('order_number') or '').strip()
                        if order_number:
                            order_numbers.add(order_number)

                            # Sales invoice numbers (gali būti kelios, atskirtos kableliais arba tarpais)
                        # TIKRINTI VISUS GALIMUS STULPELIUS
                        sales_invoice_numbers = (
                            row.get('sales_invoice_numbers') or 
                            row.get('sales_invoice_number') or 
                            row.get('invoice_number') or 
                            ''
                        ).strip()
                        if sales_invoice_numbers:
                            # Atskirti pagal kablelius arba tarpus
                            for num in sales_invoice_numbers.replace(',', ' ').split():
                                num = num.strip()
                                if num:
                                    sales_numbers.add(num)

                            # Purchase invoice numbers (gali būti kelios, atskirtos kableliais arba tarpais)
                        # TIKRINTI VISUS GALIMUS STULPELIUS
                        purchase_invoice_numbers = (
                            row.get('purchase_invoice_numbers') or 
                            row.get('purchase_invoice_number') or 
                            row.get('received_invoice_number') or 
                            ''
                        ).strip()
                        if purchase_invoice_numbers:
                            # Atskirti pagal kablelius arba tarpus
                            for num in purchase_invoice_numbers.replace(',', ' ').split():
                                num = num.strip()
                                if num:
                                    purchase_numbers.add(num)

            except Exception as e:
                logger.error(f'Infotrans delete: klaida skaitant CSV: {e}', exc_info=True)
                return Response(
                    {'error': f'Klaida skaitant CSV failą: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            logger.info(
                f'Infotrans delete: rasta {row_count} eilučių, '
                f'{len(order_numbers)} užsakymų, '
                f'{len(sales_numbers)} pardavimo sąskaitų, '
                f'{len(purchase_numbers)} pirkimo sąskaitų'
            )

            deleted_orders = 0
            deleted_sales = 0
            deleted_purchase = 0
            deleted_related_sales = 0
            deleted_related_purchase = 0
            errors = []

            # Rasti užsakymų ID (tiek dry-run, tiek tikram trinimui)
            order_ids = []
            if order_numbers:
                orders_to_delete = Order.objects.filter(order_number__in=order_numbers)
                order_ids = list(orders_to_delete.values_list('id', flat=True))

            # DRY-RUN režime - skaičiuoti, kiek būtų ištrinta
            if dry_run:
                if order_ids:
                    # Susijusios pardavimo sąskaitos (per ForeignKey)
                    related_sales = SalesInvoice.objects.filter(related_order_id__in=order_ids)
                    deleted_related_sales = related_sales.count()
                    deleted_sales += deleted_related_sales
                    
                    # Susijusios pirkimo sąskaitos (per ForeignKey - deprecated, bet vis dar naudojamas)
                    related_purchase_fk = PurchaseInvoice.objects.filter(related_order_id__in=order_ids)
                    deleted_related_purchase_fk = related_purchase_fk.count()
                    deleted_purchase += deleted_related_purchase_fk
                    
                    # Susijusios pirkimo sąskaitos (per ManyToMany)
                    related_purchase_m2m = PurchaseInvoice.objects.filter(related_orders__id__in=order_ids).distinct()
                    deleted_related_purchase_m2m = related_purchase_m2m.count()
                    # Sumuoti tik naujas (kurios neturi related_order_id)
                    deleted_related_purchase = deleted_related_purchase_fk + deleted_related_purchase_m2m - deleted_related_purchase_fk
                    if deleted_related_purchase < deleted_related_purchase_m2m:
                        deleted_related_purchase = deleted_related_purchase_m2m
                    deleted_purchase = deleted_related_purchase_m2m  # Many-to-many yra prioritetinis
                
                # Sąskaitos pagal CSV sąrašą
                    if sales_numbers:
                        sales_to_delete = SalesInvoice.objects.filter(invoice_number__in=sales_numbers)
                    deleted_sales_csv = sales_to_delete.count()
                    deleted_sales = deleted_sales_csv  # CSV prioritetas - trinti visas nurodytas
                
                if purchase_numbers:
                    purchase_to_delete = PurchaseInvoice.objects.filter(
                        received_invoice_number__in=purchase_numbers
                    )
                    deleted_purchase_csv = purchase_to_delete.count()
                    deleted_purchase = deleted_purchase_csv  # CSV prioritetas - trinti visas nurodytas
                
                if order_ids:
                    deleted_orders = len(order_ids)

            # TIKRAS TRYNIMAS
            else:
                with transaction.atomic():
                    # PIRMIAUSIAI trinti VISAS sąskaitas pagal CSV sąrašą (turi būti pirmiausia!)
                    # TRINTI VISAS CSV NURODYTAS SĄSKAITAS, NEPRIKLAUSOMAI NUO TO, AR YRA UŽSAKYMŲ AR NE
                    if sales_numbers:
                        sales_to_delete = SalesInvoice.objects.filter(invoice_number__in=sales_numbers)
                        deleted_sales_csv = sales_to_delete.count()
                        if deleted_sales_csv > 0:
                            sales_to_delete.delete()
                            deleted_sales = deleted_sales_csv
                            logger.info(f'Infotrans delete: ištrinta {deleted_sales_csv} pardavimo sąskaitų pagal CSV. Numeriai: {list(sales_numbers)[:10]}')
                        else:
                            logger.warning(f'Infotrans delete: nerasta pardavimo sąskaitų su numeriais iš CSV. Ieškota: {list(sales_numbers)[:10]}')

                    if purchase_numbers:
                        purchase_to_delete = PurchaseInvoice.objects.filter(
                            received_invoice_number__in=purchase_numbers
                        )
                        deleted_purchase_csv = purchase_to_delete.count()
                        if deleted_purchase_csv > 0:
                            purchase_to_delete.delete()
                            deleted_purchase = deleted_purchase_csv
                            logger.info(f'Infotrans delete: ištrinta {deleted_purchase_csv} pirkimo sąskaitų pagal CSV. Numeriai: {list(purchase_numbers)[:10]}')
                        else:
                            logger.warning(f'Infotrans delete: nerasta pirkimo sąskaitų su numeriais iš CSV. Ieškota: {list(purchase_numbers)[:10]}')
                    
                    # TADA trinti visas sąskaitas, susijusias su užsakymais (jei liko nesusietų)
                    if order_ids:
                        # Trinti visas pardavimo sąskaitas, susijusias su šiais užsakymais (per ForeignKey)
                        related_sales = SalesInvoice.objects.filter(related_order_id__in=order_ids)
                        deleted_related_sales = related_sales.count()
                        if deleted_related_sales > 0:
                            related_sales.delete()
                            deleted_sales += deleted_related_sales
                            logger.info(f'Infotrans delete: ištrinta {deleted_related_sales} pardavimo sąskaitų, susijusių su užsakymais (per ForeignKey)')
                        
                        # Trinti visas pirkimo sąskaitas, susijusias su šiais užsakymais (per ForeignKey)
                        related_purchase_fk = PurchaseInvoice.objects.filter(related_order_id__in=order_ids)
                        deleted_related_purchase_fk = related_purchase_fk.count()
                        if deleted_related_purchase_fk > 0:
                            related_purchase_fk.delete()
                            deleted_purchase += deleted_related_purchase_fk
                            logger.info(f'Infotrans delete: ištrinta {deleted_related_purchase_fk} pirkimo sąskaitų, susijusių su užsakymais (per ForeignKey)')
                        
                        # Trinti visas pirkimo sąskaitas, susijusias su šiais užsakymais (per ManyToMany)
                        related_purchase_m2m = PurchaseInvoice.objects.filter(related_orders__id__in=order_ids).distinct()
                        deleted_related_purchase_m2m = related_purchase_m2m.count()
                        if deleted_related_purchase_m2m > 0:
                            related_purchase_m2m.delete()
                            deleted_purchase += deleted_related_purchase_m2m
                            deleted_related_purchase = deleted_related_purchase_fk + deleted_related_purchase_m2m
                            logger.info(f'Infotrans delete: ištrinta {deleted_related_purchase_m2m} pirkimo sąskaitų, susijusių su užsakymais (per ManyToMany)')
                    
                    # GALIAUSIAI trinti užsakymus (po sąskaitų trynimo)
                    if order_numbers:
                        orders_to_delete = Order.objects.filter(order_number__in=order_numbers)
                        deleted_orders = orders_to_delete.count()
                        if deleted_orders > 0:
                            orders_to_delete.delete()
                            logger.info(f'Infotrans delete: ištrinta {deleted_orders} užsakymų')

            stats = {
                'deleted_orders': deleted_orders,
                'deleted_sales': deleted_sales,
                'deleted_purchase': deleted_purchase,
            }
            if not dry_run:
                stats.update({
                    'deleted_related_sales': deleted_related_sales,
                    'deleted_related_purchase': deleted_related_purchase,
                })

            return Response({
                'success': True,
                'dry_run': dry_run,
                'row_count': row_count,
                'stats': stats,
                'errors': errors,
            })

        finally:
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                logger.warning('Nepavyko pašalinti laikino katalogo po trynimo: %s', temp_dir, exc_info=True)


class PaymentImportView(APIView):
    """Importuoja mokėjimus iš CSV failo ir pažymi apmokėtas sąskaitas."""

    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request):
        uploaded_file = request.FILES.get('file')
        invoice_type = request.data.get('invoice_type', 'purchase')  # 'purchase' arba 'sales'
        dry_run = str(request.data.get('dry_run', 'true')).lower() == 'true'
        limit = request.data.get('limit')
        if limit:
            try:
                limit = int(limit)
            except (ValueError, TypeError):
                limit = None
        else:
            limit = None
        
        from_end = str(request.data.get('from_end', 'false')).lower() == 'true'

        if not uploaded_file:
            return Response({'error': 'Nepateiktas CSV failas.'}, status=status.HTTP_400_BAD_REQUEST)

        if invoice_type not in ['purchase', 'sales']:
            return Response({'error': 'Netinkamas invoice_type. Turi būti "purchase" arba "sales".'}, 
                          status=status.HTTP_400_BAD_REQUEST)

        temp_dir = tempfile.mkdtemp(prefix='logitrack_payment_import_')
        temp_path = Path(temp_dir) / uploaded_file.name

        try:
            # Išsaugoti failą
            with temp_path.open('wb') as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)

            stats = {
                'total_rows': 0,
                'matched': 0,
                'updated': 0,
                'not_found': 0,
                'errors': 0,
                'details': []
            }

            # Skaityti CSV failą
            try:
                # Jei from_end=True, imti paskutines N eilučių
                if from_end and limit:
                    with temp_path.open('r', encoding='latin-1') as csv_file:
                        lines = csv_file.readlines()
                        # Pirmoji eilutė yra header
                        header_line = lines[0]
                        data_lines = lines[1:]
                        # Imti paskutines N eilučių
                        selected_lines = data_lines[-limit:] if len(data_lines) > limit else data_lines
                        # Rekonstruoti CSV su header kaip string
                        csv_content = header_line + ''.join(selected_lines)
                        csv_file_obj = StringIO(csv_content)
                        reader = csv.DictReader(csv_file_obj, delimiter=';')
                        
                        for row in reader:
                            stats['total_rows'] += 1
                            
                            try:
                                # Gauti duomenis iš CSV (palaikyti abu formatus: purchase ir sales)
                                invoice_number = (row.get('Sàskaitos Nr.') or '').strip()
                                
                                # Partner name - skirtingi stulpeliai purchase ir sales
                                partner_name = (row.get('Kas iðraðë') or row.get('Mokëtojas / kam iðraðë') or '').strip()
                                
                                # Payment date - skirtingi formatai
                                payment_date_str = (row.get('Apmokëjimo data') or '').strip()
                                # Jei nėra tiesioginio payment_date, bandyti ištraukti iš "Apmokëjimøinfo" (sales formatas)
                                if not payment_date_str:
                                    payment_info = (row.get('Apmokëjimøinfo') or '').strip()
                                    if payment_info:
                                        # Ieškoti datos formato YYYY-MM-DD
                                        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', payment_info)
                                        if date_match:
                                            payment_date_str = date_match.group(1)
                                
                                # Paid amount - skirtingi stulpeliai
                                paid_amount_str = (row.get('Apmokëtaviso EUR') or row.get('Apmokëtaviso eur') or '').strip().replace(',', '.')
                                
                                # Expedition number - tik purchase
                                expedition_number = (row.get('Eksp. nr') or '').strip()
                                
                                # Order numbers - skirtingi stulpeliai
                                order_numbers_str = (row.get('Susijæ uþsakymai') or row.get('Uþsakymas(-ai)') or '').strip()

                                if not invoice_number:
                                    stats['not_found'] += 1
                                    stats['details'].append({
                                        'row': stats['total_rows'],
                                        'invoice_number': invoice_number or '(nera)',
                                        'status': 'error',
                                        'message': 'Nėra sąskaitos numerio'
                                    })
                                    continue

                                # Konvertuoti datas ir sumas
                                payment_date = None
                                if payment_date_str:
                                    try:
                                        # Bandyti skirtingus formatus
                                        for fmt in ['%Y-%m-%d', '%Y.%m.%d', '%d.%m.%Y', '%d/%m/%Y']:
                                            try:
                                                payment_date = datetime.strptime(payment_date_str, fmt).date()
                                                break
                                            except ValueError:
                                                continue
                                    except Exception:
                                        pass

                                paid_amount = None
                                if paid_amount_str:
                                    try:
                                        paid_amount = Decimal(paid_amount_str)
                                    except Exception:
                                        pass

                                # Rasti sąskaitą (naudoti tą pačią logiką kaip žemiau)
                                invoice = None
                                
                                if invoice_type == 'purchase':
                                    # 1. Rasti PurchaseInvoice pagal received_invoice_number (tikslus atitikimas)
                                    invoice = PurchaseInvoice.objects.filter(
                                        received_invoice_number__iexact=invoice_number
                                    ).first()
                                    
                                    # 2. Jei nerasta, bandyti pagal invoice_number
                                    if not invoice:
                                        invoice = PurchaseInvoice.objects.filter(
                                            invoice_number__iexact=invoice_number
                                        ).first()
                                    
                                    # 3. Jei nerasta, bandyti fuzzy matching (be tarpų, be specialių simbolių)
                                    if not invoice:
                                        clean_invoice_number = invoice_number.replace(' ', '').replace('/', '').replace('-', '').replace('.', '')
                                        all_purchase = PurchaseInvoice.objects.all()
                                        for inv in all_purchase:
                                            clean_received = (inv.received_invoice_number or '').replace(' ', '').replace('/', '').replace('-', '').replace('.', '')
                                            if clean_invoice_number and clean_received and (clean_invoice_number in clean_received or clean_received in clean_invoice_number):
                                                invoice = inv
                                                break
                                    
                                    # 4. Jei nerasta, bandyti pagal partner ir sumą (su tolerancija ±0.01)
                                    if not invoice and partner_name and paid_amount:
                                        invoices = PurchaseInvoice.objects.filter(
                                            partner__name__icontains=partner_name
                                        )
                                        for inv in invoices:
                                            if abs(float(inv.amount_total) - float(paid_amount)) < 0.01:
                                                invoice = inv
                                                break
                                    
                                    # 5. Jei nerasta, bandyti pagal ekspedicijos numerį
                                    if not invoice and expedition_number:
                                        carriers = OrderCarrier.objects.filter(
                                            expedition_number=expedition_number
                                        )
                                        for carrier in carriers:
                                            if carrier.order:
                                                invoices = PurchaseInvoice.objects.filter(
                                                    related_orders=carrier.order
                                                )
                                                if invoices.count() == 1:
                                                    invoice = invoices.first()
                                                    break
                                    
                                    # 6. Jei nerasta, bandyti pagal užsakymo numerį
                                    if not invoice and order_numbers_str:
                                        # Ištraukti užsakymo numerius (gali būti kelios, atskirtos tarpais)
                                        order_nums = []
                                        # Bandyti ištraukti numerius (pvz., "2019-194 UAB Ergolain" -> "2019-194")
                                        parts = order_numbers_str.split()
                                        for part in parts:
                                            if part and part[0].isdigit():
                                                order_nums.append(part.strip())
                                        
                                        for order_num in order_nums:
                                            try:
                                                order = Order.objects.get(order_number=order_num)
                                                invoices = PurchaseInvoice.objects.filter(
                                                    related_orders=order
                                                )
                                                if invoices.count() == 1:
                                                    invoice = invoices.first()
                                                    break
                                            except Order.DoesNotExist:
                                                continue
                                
                                else:  # sales
                                    # Rasti SalesInvoice pagal invoice_number
                                    invoice = SalesInvoice.objects.filter(
                                        invoice_number__iexact=invoice_number
                                    ).first()
                                    
                                    # Jei nerasta, bandyti pagal partner ir sumą
                                    if not invoice and partner_name and paid_amount:
                                        invoices = SalesInvoice.objects.filter(
                                            partner__name__icontains=partner_name,
                                            amount_total=paid_amount
                                        )
                                        if invoices.count() == 1:
                                            invoice = invoices.first()
                                    
                                    # Jei nerasta, bandyti pagal užsakymo numerį
                                    if not invoice and order_numbers_str:
                                        # Ištraukti užsakymo numerius (gali būti vienas arba keli)
                                        order_nums = []
                                        # Bandyti ištraukti numerius (pvz., "2024-339" arba "2024-339 UAB Transekspedicija")
                                        parts = order_numbers_str.split()
                                        for part in parts:
                                            if part and part[0].isdigit() and '-' in part:
                                                order_nums.append(part.strip())
                                        
                                        for order_num in order_nums:
                                            try:
                                                order = Order.objects.get(order_number=order_num)
                                                invoice = SalesInvoice.objects.filter(
                                                    related_order=order
                                                ).first()
                                                if invoice:
                                                    break
                                            except Order.DoesNotExist:
                                                continue

                                if invoice:
                                    stats['matched'] += 1
                                    
                                    # Validuoti payment_date - negali būti senesnė nei issue_date arba užsakymo data
                                    original_payment_date = payment_date
                                    if payment_date and invoice.issue_date:
                                        # Konvertuoti issue_date į date, jei reikia
                                        issue_date = invoice.issue_date
                                        if isinstance(issue_date, datetime):
                                            issue_date = issue_date.date()
                                        elif hasattr(issue_date, 'date'):
                                            issue_date = issue_date.date()
                                        
                                        if payment_date < issue_date:
                                            # Jei payment_date senesnė nei issue_date, naudoti issue_date
                                            payment_date = issue_date
                                    
                                    # Taip pat patikrinti susijusius užsakymus
                                    if payment_date:
                                        # SalesInvoice turi related_order (singular), ne related_orders
                                        if invoice_type == 'sales' and invoice.related_order:
                                            order = invoice.related_order
                                            if order.order_date:
                                                order_date = order.order_date.date() if isinstance(order.order_date, datetime) else order.order_date
                                                if payment_date < order_date:
                                                    payment_date = order_date
                                            if order.loading_date:
                                                loading_date = order.loading_date.date() if isinstance(order.loading_date, datetime) else order.loading_date
                                                if payment_date < loading_date:
                                                    payment_date = loading_date
                                            if order.unloading_date:
                                                unloading_date = order.unloading_date.date() if isinstance(order.unloading_date, datetime) else order.unloading_date
                                                if payment_date < unloading_date:
                                                    payment_date = unloading_date
                                        elif invoice_type == 'purchase':
                                            related_orders = invoice.related_orders.all()
                                            for order in related_orders:
                                                if order.order_date:
                                                    order_date = order.order_date.date() if isinstance(order.order_date, datetime) else order.order_date
                                                    if payment_date < order_date:
                                                        payment_date = order_date
                                                if order.loading_date:
                                                    loading_date = order.loading_date.date() if isinstance(order.loading_date, datetime) else order.loading_date
                                                    if payment_date < loading_date:
                                                        payment_date = loading_date
                                                if order.unloading_date:
                                                    unloading_date = order.unloading_date.date() if isinstance(order.unloading_date, datetime) else order.unloading_date
                                                    if payment_date < unloading_date:
                                                        payment_date = unloading_date
                                    
                                    if not dry_run:
                                        # Atnaujinti sąskaitą
                                        invoice.payment_status = 'paid'
                                        if payment_date:
                                            invoice.payment_date = payment_date
                                        invoice.save()
                                        stats['updated'] += 1
                                    
                                    # Nustatyti, kaip rasta
                                    match_method = 'sąskaitos numeris'
                                    if invoice_type == 'purchase':
                                        if invoice.received_invoice_number and invoice.received_invoice_number.lower() != invoice_number.lower():
                                            match_method = 'fuzzy matching'
                                    elif invoice_type == 'sales':
                                        if invoice.invoice_number and invoice.invoice_number.lower() != invoice_number.lower():
                                            match_method = 'fuzzy matching'
                                    
                                    if partner_name and paid_amount:
                                        match_method = 'klientas/vežėjas + suma'
                                    elif expedition_number:
                                        match_method = 'ekspedicijos numeris'
                                    elif order_numbers_str:
                                        match_method = 'užsakymo numeris'
                                    
                                    # Pridėti informaciją apie datos koregavimą
                                    date_adjusted = False
                                    if original_payment_date and payment_date and original_payment_date != payment_date:
                                        date_adjusted = True
                                    
                                    message = f'Rasta ({match_method}) ir {"atnaujinta" if not dry_run else "būtų atnaujinta"}'
                                    if date_adjusted:
                                        message += f' (data pakoreguota iš {original_payment_date} į {payment_date})'
                                    
                                    stats['details'].append({
                                        'row': stats['total_rows'],
                                        'invoice_number': invoice_number,
                                        'invoice_id': invoice.id,
                                        'status': 'matched',
                                        'message': message
                                    })
                                else:
                                    # Nerasta sąskaita - tiesiog praleisti, ne rodyti kaip klaidą
                                    stats['not_found'] += 1
                                    # Nerastos sąskaitos nepridedamos į detalių sąrašą, kad nebūtų užkrautas rezultatas
                            
                            except Exception as e:
                                stats['errors'] += 1
                                stats['details'].append({
                                    'row': stats['total_rows'],
                                    'invoice_number': invoice_number if 'invoice_number' in locals() else '(nera)',
                                    'status': 'error',
                                    'message': str(e)
                                })
                                logger.error(f'Klaida apdorojant eilutę {stats["total_rows"]}: {e}', exc_info=True)
                else:
                    # Normalus skaitymas nuo pradžios
                    with temp_path.open('r', encoding='latin-1') as csv_file:
                        reader = csv.DictReader(csv_file, delimiter=';')
                    
                        for row in reader:
                            # Patikrinti ar pasiektas limitas (prieš apdorojant eilutę)
                            if limit is not None and not from_end and stats['total_rows'] >= limit:
                                break
                            
                            stats['total_rows'] += 1
                            
                            try:
                                # Gauti duomenis iš CSV (palaikyti abu formatus: purchase ir sales)
                                invoice_number = (row.get('Sàskaitos Nr.') or '').strip()
                                
                                # Partner name - skirtingi stulpeliai purchase ir sales
                                partner_name = (row.get('Kas iðraðë') or row.get('Mokëtojas / kam iðraðë') or '').strip()
                                
                                # Payment date - skirtingi formatai
                                payment_date_str = (row.get('Apmokëjimo data') or '').strip()
                                # Jei nėra tiesioginio payment_date, bandyti ištraukti iš "Apmokëjimøinfo" (sales formatas)
                                if not payment_date_str:
                                    payment_info = (row.get('Apmokëjimøinfo') or '').strip()
                                    if payment_info:
                                        # Ieškoti datos formato YYYY-MM-DD
                                        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', payment_info)
                                        if date_match:
                                            payment_date_str = date_match.group(1)
                                
                                # Paid amount - skirtingi stulpeliai
                                paid_amount_str = (row.get('Apmokëtaviso EUR') or row.get('Apmokëtaviso eur') or '').strip().replace(',', '.')
                                
                                # Expedition number - tik purchase
                                expedition_number = (row.get('Eksp. nr') or '').strip()
                                
                                # Order numbers - skirtingi stulpeliai
                                order_numbers_str = (row.get('Susijæ uþsakymai') or row.get('Uþsakymas(-ai)') or '').strip()

                                if not invoice_number:
                                    stats['not_found'] += 1
                                    stats['details'].append({
                                        'row': stats['total_rows'],
                                        'invoice_number': invoice_number or '(nera)',
                                        'status': 'error',
                                        'message': 'Nėra sąskaitos numerio'
                                    })
                                    continue

                                # Konvertuoti datas ir sumas
                                payment_date = None
                                if payment_date_str:
                                    try:
                                        # Bandyti skirtingus formatus
                                        for fmt in ['%Y-%m-%d', '%Y.%m.%d', '%d.%m.%Y', '%d/%m/%Y']:
                                            try:
                                                payment_date = datetime.strptime(payment_date_str, fmt).date()
                                                break
                                            except ValueError:
                                                continue
                                    except Exception:
                                        pass

                                paid_amount = None
                                if paid_amount_str:
                                    try:
                                        paid_amount = Decimal(paid_amount_str)
                                    except Exception:
                                        pass

                                # Rasti sąskaitą
                                invoice = None
                                
                                if invoice_type == 'purchase':
                                    # 1. Rasti PurchaseInvoice pagal received_invoice_number (tikslus atitikimas)
                                    invoice = PurchaseInvoice.objects.filter(
                                        received_invoice_number__iexact=invoice_number
                                    ).first()
                                    
                                    # 2. Jei nerasta, bandyti pagal invoice_number
                                    if not invoice:
                                        invoice = PurchaseInvoice.objects.filter(
                                            invoice_number__iexact=invoice_number
                                        ).first()
                                    
                                    # 3. Jei nerasta, bandyti fuzzy matching (be tarpų, be specialių simbolių)
                                    if not invoice:
                                        clean_invoice_number = invoice_number.replace(' ', '').replace('/', '').replace('-', '').replace('.', '')
                                        all_purchase = PurchaseInvoice.objects.all()
                                        for inv in all_purchase:
                                            clean_received = (inv.received_invoice_number or '').replace(' ', '').replace('/', '').replace('-', '').replace('.', '')
                                            if clean_invoice_number and clean_received and (clean_invoice_number in clean_received or clean_received in clean_invoice_number):
                                                invoice = inv
                                                break
                                    
                                    # 4. Jei nerasta, bandyti pagal partner ir sumą (su tolerancija ±0.01)
                                    if not invoice and partner_name and paid_amount:
                                        invoices = PurchaseInvoice.objects.filter(
                                            partner__name__icontains=partner_name
                                        )
                                        for inv in invoices:
                                            if abs(float(inv.amount_total) - float(paid_amount)) < 0.01:
                                                invoice = inv
                                                break
                                    
                                    # 5. Jei nerasta, bandyti pagal ekspedicijos numerį
                                    if not invoice and expedition_number:
                                        carriers = OrderCarrier.objects.filter(
                                            expedition_number=expedition_number
                                        )
                                        for carrier in carriers:
                                            if carrier.order:
                                                invoices = PurchaseInvoice.objects.filter(
                                                    related_orders=carrier.order
                                                )
                                                if invoices.count() == 1:
                                                    invoice = invoices.first()
                                                    break
                                    
                                    # 6. Jei nerasta, bandyti pagal užsakymo numerį
                                    if not invoice and order_numbers_str:
                                        # Ištraukti užsakymo numerius (gali būti kelios, atskirtos tarpais)
                                        order_nums = []
                                        # Bandyti ištraukti numerius (pvz., "2019-194 UAB Ergolain" -> "2019-194")
                                        parts = order_numbers_str.split()
                                        for part in parts:
                                            if part and part[0].isdigit():
                                                order_nums.append(part.strip())
                                        
                                        for order_num in order_nums:
                                            try:
                                                order = Order.objects.get(order_number=order_num)
                                                invoices = PurchaseInvoice.objects.filter(
                                                    related_orders=order
                                                )
                                                if invoices.count() == 1:
                                                    invoice = invoices.first()
                                                    break
                                            except Order.DoesNotExist:
                                                continue
                                
                                else:  # sales
                                    # Rasti SalesInvoice pagal invoice_number
                                    invoice = SalesInvoice.objects.filter(
                                        invoice_number__iexact=invoice_number
                                    ).first()
                                    
                                    # Jei nerasta, bandyti pagal partner ir sumą
                                    if not invoice and partner_name and paid_amount:
                                        invoices = SalesInvoice.objects.filter(
                                            partner__name__icontains=partner_name,
                                            amount_total=paid_amount
                                        )
                                        if invoices.count() == 1:
                                            invoice = invoices.first()
                                    
                                    # Jei nerasta, bandyti pagal užsakymo numerį
                                    if not invoice and order_numbers_str:
                                        # Ištraukti užsakymo numerius (gali būti vienas arba keli)
                                        order_nums = []
                                        # Bandyti ištraukti numerius (pvz., "2024-339" arba "2024-339 UAB Transekspedicija")
                                        parts = order_numbers_str.split()
                                        for part in parts:
                                            if part and part[0].isdigit() and '-' in part:
                                                order_nums.append(part.strip())
                                        
                                        for order_num in order_nums:
                                            try:
                                                order = Order.objects.get(order_number=order_num)
                                                invoice = SalesInvoice.objects.filter(
                                                    related_order=order
                                                ).first()
                                                if invoice:
                                                    break
                                            except Order.DoesNotExist:
                                                continue

                                if invoice:
                                    stats['matched'] += 1
                                    
                                    # Validuoti payment_date - negali būti senesnė nei issue_date arba užsakymo data
                                    original_payment_date = payment_date
                                    if payment_date and invoice.issue_date:
                                        # Konvertuoti issue_date į date, jei reikia
                                        issue_date = invoice.issue_date
                                        if isinstance(issue_date, datetime):
                                            issue_date = issue_date.date()
                                        elif hasattr(issue_date, 'date'):
                                            issue_date = issue_date.date()
                                        
                                        if payment_date < issue_date:
                                            # Jei payment_date senesnė nei issue_date, naudoti issue_date
                                            payment_date = issue_date
                                    
                                    # Taip pat patikrinti susijusius užsakymus
                                    if payment_date:
                                        # SalesInvoice turi related_order (singular), ne related_orders
                                        if invoice_type == 'sales' and invoice.related_order:
                                            order = invoice.related_order
                                            if order.order_date:
                                                order_date = order.order_date.date() if isinstance(order.order_date, datetime) else order.order_date
                                                if payment_date < order_date:
                                                    payment_date = order_date
                                            if order.loading_date:
                                                loading_date = order.loading_date.date() if isinstance(order.loading_date, datetime) else order.loading_date
                                                if payment_date < loading_date:
                                                    payment_date = loading_date
                                            if order.unloading_date:
                                                unloading_date = order.unloading_date.date() if isinstance(order.unloading_date, datetime) else order.unloading_date
                                                if payment_date < unloading_date:
                                                    payment_date = unloading_date
                                        elif invoice_type == 'purchase':
                                            related_orders = invoice.related_orders.all()
                                            for order in related_orders:
                                                if order.order_date:
                                                    order_date = order.order_date.date() if isinstance(order.order_date, datetime) else order.order_date
                                                    if payment_date < order_date:
                                                        payment_date = order_date
                                                if order.loading_date:
                                                    loading_date = order.loading_date.date() if isinstance(order.loading_date, datetime) else order.loading_date
                                                    if payment_date < loading_date:
                                                        payment_date = loading_date
                                                if order.unloading_date:
                                                    unloading_date = order.unloading_date.date() if isinstance(order.unloading_date, datetime) else order.unloading_date
                                                    if payment_date < unloading_date:
                                                        payment_date = unloading_date
                                    
                                    if not dry_run:
                                        # Atnaujinti sąskaitą
                                        invoice.payment_status = 'paid'
                                        if payment_date:
                                            invoice.payment_date = payment_date
                                        invoice.save()
                                        stats['updated'] += 1
                                    
                                    # Nustatyti, kaip rasta
                                    match_method = 'sąskaitos numeris'
                                    if invoice_type == 'purchase':
                                        if invoice.received_invoice_number and invoice.received_invoice_number.lower() != invoice_number.lower():
                                            match_method = 'fuzzy matching'
                                    elif invoice_type == 'sales':
                                        if invoice.invoice_number and invoice.invoice_number.lower() != invoice_number.lower():
                                            match_method = 'fuzzy matching'
                                    
                                    if partner_name and paid_amount:
                                        match_method = 'klientas/vežėjas + suma'
                                    elif expedition_number:
                                        match_method = 'ekspedicijos numeris'
                                    elif order_numbers_str:
                                        match_method = 'užsakymo numeris'
                                    
                                    # Pridėti informaciją apie datos koregavimą
                                    date_adjusted = False
                                    if original_payment_date and payment_date and original_payment_date != payment_date:
                                        date_adjusted = True
                                    
                                    message = f'Rasta ({match_method}) ir {"atnaujinta" if not dry_run else "būtų atnaujinta"}'
                                    if date_adjusted:
                                        message += f' (data pakoreguota iš {original_payment_date} į {payment_date})'
                                    
                                    stats['details'].append({
                                        'row': stats['total_rows'],
                                        'invoice_number': invoice_number,
                                        'invoice_id': invoice.id,
                                        'status': 'matched',
                                        'message': message
                                    })
                                else:
                                    # Nerasta sąskaita - tiesiog praleisti, ne rodyti kaip klaidą
                                    stats['not_found'] += 1
                                    # Nerastos sąskaitos nepridedamos į detalių sąrašą, kad nebūtų užkrautas rezultatas
                            
                            except Exception as e:
                                stats['errors'] += 1
                                stats['details'].append({
                                    'row': stats['total_rows'],
                                    'invoice_number': invoice_number if 'invoice_number' in locals() else '(nera)',
                                    'status': 'error',
                                    'message': str(e)
                                })
                                logger.error(f'Klaida apdorojant eilutę {stats["total_rows"]}: {e}', exc_info=True)

            except Exception as e:
                logger.error(f'Klaida skaitant CSV failą: {e}', exc_info=True)
                return Response(
                    {'error': f'Klaida skaitant CSV failą: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            return Response({
                'success': True,
                'dry_run': dry_run,
                'invoice_type': invoice_type,
                'stats': stats,
            })

        finally:
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                logger.warning('Nepavyko pašalinti laikino katalogo po importo: %s', temp_dir, exc_info=True)
