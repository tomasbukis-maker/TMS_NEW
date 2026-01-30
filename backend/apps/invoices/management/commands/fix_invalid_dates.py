from django.core.management.base import BaseCommand
from django.db import connection
from apps.invoices.models import SalesInvoice, PurchaseInvoice
from datetime import datetime, date
import re


class Command(BaseCommand):
    help = 'Pataiso neteisingas datas sąskaitose (pvz., 2025-12-130 -> 2025-12-13)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Rodo, kas būtų pataisyta, bet nekeičia duomenų',
        )

    def fix_date_string(self, date_str):
        """
        Pataiso neteisingą datą su 3+ skaitmenimis dienos vietoje.
        Pavyzdžiai:
        - "2025-12-130" -> "2025-12-13"
        - "2025-12-110" -> "2025-12-11"
        """
        if not date_str:
            return None
        
        # Patikrinti, ar yra neteisingas formatas su 3+ skaitmenimis dienos vietoje
        date_match = re.match(r'^(\d{4})-(\d{1,2})-(\d{2,})$', str(date_str))
        if date_match:
            year = int(date_match.group(1))
            month = int(date_match.group(2))
            day = int(date_match.group(3))
            
            # Jei diena yra didesnė nei 31, tai tikriausiai yra klaida
            if day > 31:
                day_str = date_match.group(3)
                # Bandyti paimti pirmus 2 skaitmenis (pvz., "130" -> "13", "110" -> "11")
                first_two = int(day_str[:2])
                if first_two <= 31 and first_two > 0:
                    day = first_two
                else:
                    # Jei pirmi 2 skaitmenys neteisingi, bandyti paimti paskutinius 2
                    last_two = int(day_str[-2:])
                    if last_two <= 31 and last_two > 0:
                        day = last_two
                    else:
                        # Fallback: paimti pirmus 2 skaitmenis bet kokiu atveju
                        day = first_two if first_two > 0 else 1
                
                # Užtikrinti, kad diena būtų tarp 1 ir 31
                if day < 1 or day > 31:
                    day = 1
                
                try:
                    fixed_date = date(year, month, day)
                    return fixed_date
                except ValueError:
                    self.stdout.write(
                        self.style.WARNING(f'Negalima pataisyti datos: {date_str}')
                    )
                    return None
        
        # Jei data atrodo teisinga, bandyti parsinti
        try:
            if isinstance(date_str, str):
                # Bandyti parsinti iš įvairių formatų
                for fmt in ['%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S']:
                    try:
                        parsed = datetime.strptime(date_str.split('T')[0].split(' ')[0], '%Y-%m-%d')
                        return parsed.date()
                    except:
                        continue
            elif isinstance(date_str, date):
                return date_str
        except:
            pass
        
        return None

    def fix_invoice_dates(self, model_class, model_name, table_name, dry_run=False):
        """Pataiso datas tam tikro tipo sąskaitose naudojant raw SQL"""
        fixed_count = 0
        error_count = 0
        
        with connection.cursor() as cursor:
            # Rasti visas sąskaitas su neteisingomis datomis (3+ skaitmenys dienos vietoje)
            # Naudojame CAST arba CONVERT, kad gautume datos kaip string
            query = f"""
                SELECT id, 
                       CAST(due_date AS CHAR) as due_date_str,
                       CAST(issue_date AS CHAR) as issue_date_str,
                       CAST(COALESCE(payment_date, '') AS CHAR) as payment_date_str
                FROM {table_name}
                WHERE CAST(due_date AS CHAR) REGEXP '^[0-9]{{4}}-[0-9]{{1,2}}-[0-9]{{3,}}'
                   OR CAST(issue_date AS CHAR) REGEXP '^[0-9]{{4}}-[0-9]{{1,2}}-[0-9]{{3,}}'
                   OR (payment_date IS NOT NULL AND CAST(payment_date AS CHAR) REGEXP '^[0-9]{{4}}-[0-9]{{1,2}}-[0-9]{{3,}}')
            """
            
            cursor.execute(query)
            rows = cursor.fetchall()
            
            for row in rows:
                invoice_id = row[0]
                due_date_str = row[1] if row[1] else None
                issue_date_str = row[2] if row[2] else None
                payment_date_str = row[3] if row[3] else None
                
                updates = {}
                
                # Patikrinti due_date
                if due_date_str and re.match(r'^\d{4}-\d{1,2}-\d{3,}', due_date_str):
                    fixed_date = self.fix_date_string(due_date_str)
                    if fixed_date:
                        updates['due_date'] = fixed_date
                        self.stdout.write(
                            f'  {model_name} ID {invoice_id}: due_date {due_date_str} -> {fixed_date}'
                        )
                
                # Patikrinti issue_date
                if issue_date_str and re.match(r'^\d{4}-\d{1,2}-\d{3,}', issue_date_str):
                    fixed_date = self.fix_date_string(issue_date_str)
                    if fixed_date:
                        updates['issue_date'] = fixed_date
                        self.stdout.write(
                            f'  {model_name} ID {invoice_id}: issue_date {issue_date_str} -> {fixed_date}'
                        )
                
                # Patikrinti payment_date
                if payment_date_str and re.match(r'^\d{4}-\d{1,2}-\d{3,}', payment_date_str):
                    fixed_date = self.fix_date_string(payment_date_str)
                    if fixed_date:
                        updates['payment_date'] = fixed_date
                        self.stdout.write(
                            f'  {model_name} ID {invoice_id}: payment_date {payment_date_str} -> {fixed_date}'
                        )
                
                # Atnaujinti duomenis
                if updates:
                    if not dry_run:
                        try:
                            # Naudoti Django ORM, kad atnaujintume
                            invoice = model_class.objects.get(pk=invoice_id)
                            for field, value in updates.items():
                                setattr(invoice, field, value)
                            invoice.save()
                            fixed_count += 1
                        except Exception as e:
                            error_count += 1
                            self.stdout.write(
                                self.style.ERROR(f'Klaida pataisant {model_name} ID {invoice_id}: {e}')
                            )
                    else:
                        fixed_count += 1
        
        return fixed_count, error_count

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - duomenys nebus keičiami'))
        
        self.stdout.write('Pradedamas neteisingų datų taisymas...')
        self.stdout.write('')
        
        # Pataisyti pardavimo sąskaitas
        self.stdout.write('Tikrinamos pardavimo sąskaitos...')
        sales_fixed, sales_errors = self.fix_invoice_dates(
            SalesInvoice, 'SalesInvoice', 'sales_invoices', dry_run
        )
        
        # Pataisyti pirkimo sąskaitas
        self.stdout.write('Tikrinamos pirkimo sąskaitos...')
        purchase_fixed, purchase_errors = self.fix_invoice_dates(
            PurchaseInvoice, 'PurchaseInvoice', 'purchase_invoices', dry_run
        )
        
        self.stdout.write('')
        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Rasta pataisyti: {sales_fixed} pardavimo sąskaitų, '
                    f'{purchase_fixed} pirkimo sąskaitų'
                )
            )
            self.stdout.write(self.style.WARNING('DRY RUN - duomenys nebuvo keičiami. Paleiskite be --dry-run, kad pataisytumėte.'))
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Pataisyta: {sales_fixed} pardavimo sąskaitų, '
                    f'{purchase_fixed} pirkimo sąskaitų'
                )
            )
            if sales_errors > 0 or purchase_errors > 0:
                self.stdout.write(
                    self.style.ERROR(
                        f'Klaidų: {sales_errors} pardavimo sąskaitų, '
                        f'{purchase_errors} pirkimo sąskaitų'
                    )
                )

