"""
Management komanda automatiniam priminimų siuntimui apie sąskaitas.
Turėtų būti vykdoma kasdien per cron job arba periodinį task scheduler.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from apps.invoices.models import SalesInvoice
from apps.invoices.email_service import send_debtor_reminder_email
from apps.settings.models import NotificationSettings
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Automatiškai siunčia priminimus apie sąskaitas (artėja terminas, neapmokėta, vėluojama)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Parodyti, kokiems sąskaitoms būtų siunčiami priminimai, bet nesiųsti',
        )
        parser.add_argument(
            '--reminder-type',
            type=str,
            choices=['due_soon', 'unpaid', 'overdue', 'all'],
            default='all',
            help='Kokio tipo priminimus siųsti (due_soon, unpaid, overdue, all)',
        )

    def handle(self, *args, **options):
        reminder_type_filter = options.get('reminder_type', 'all')
        dry_run = options.get('dry_run', False)
        
        self.stdout.write('Pradedamas automatinis priminimų siuntimas...')
        
        notification_settings = NotificationSettings.load()
        today = timezone.now().date()
        
        # Skaičiavimas ir siuntimas
        results = {
            'due_soon': {'checked': 0, 'sent': 0, 'skipped': 0, 'errors': 0},
            'unpaid': {'checked': 0, 'sent': 0, 'skipped': 0, 'errors': 0},
            'overdue': {'checked': 0, 'sent': 0, 'skipped': 0, 'errors': 0},
        }
        
        # Patikrinti, ar yra įjungti automatiniai priminimai
        if not any([
            notification_settings.email_notify_due_soon_enabled,
            notification_settings.email_notify_unpaid_enabled,
            notification_settings.email_notify_overdue_enabled
        ]):
            self.stdout.write(
                self.style.WARNING('Visi automatiniai priminimai išjungti nustatymuose. Siuntimas praleistas.')
            )
            return
        
        # DUE_SOON - Artėja terminas
        if reminder_type_filter in ['due_soon', 'all'] and notification_settings.email_notify_due_soon_enabled:
            self.stdout.write('\n--- Artėja terminas (due_soon) ---')
            days_before = notification_settings.email_notify_due_soon_days_before or 3
            
            # Rasti sąskaitas, kurių terminas artėja
            due_date_start = today
            due_date_end = today + timedelta(days=days_before)
            
            invoices = SalesInvoice.objects.filter(
                payment_status='unpaid',
                due_date__gte=due_date_start,
                due_date__lte=due_date_end
            ).select_related('partner', 'partner__contact_person')
            
            for invoice in invoices:
                results['due_soon']['checked'] += 1
                result = self._send_reminder(invoice, 'due_soon', dry_run)
                self._update_results(results['due_soon'], result)
        
        # UNPAID - Neapmokėta sąskaita
        if reminder_type_filter in ['unpaid', 'all'] and notification_settings.email_notify_unpaid_enabled:
            self.stdout.write('\n--- Neapmokėta sąskaita (unpaid) ---')
            interval_days = notification_settings.email_notify_unpaid_interval_days or 7
            
            # Rasti sąskaitas, kurių terminas pasiekė (šiandien arba praėjo), bet dar neapmokėtos
            invoices = SalesInvoice.objects.filter(
                payment_status='unpaid',
                due_date__lte=today
            ).select_related('partner', 'partner__contact_person')
            
            for invoice in invoices:
                # Patikrinti, ar reikia siųsti pagal intervalą
                from apps.invoices.models import InvoiceReminder
                reminder, created = InvoiceReminder.objects.get_or_create(
                    invoice=invoice,
                    reminder_type='unpaid',
                    defaults={'sent_count': 0}
                )
                
                if not created and reminder.last_sent_at:
                    days_since_last = (timezone.now() - reminder.last_sent_at).days
                    if days_since_last < interval_days:
                        results['unpaid']['skipped'] += 1
                        continue
                
                results['unpaid']['checked'] += 1
                result = self._send_reminder(invoice, 'unpaid', dry_run)
                self._update_results(results['unpaid'], result)
        
        # OVERDUE - Vėluojama apmokėti
        if reminder_type_filter in ['overdue', 'all'] and notification_settings.email_notify_overdue_enabled:
            self.stdout.write('\n--- Vėluojama apmokėti (overdue) ---')
            interval_days = notification_settings.email_notify_overdue_interval_days or 7
            overdue_min_days = notification_settings.email_notify_overdue_min_days or 0
            overdue_max_days = notification_settings.email_notify_overdue_max_days or 365
            
            # Rasti sąskaitas, kurių terminas praėjo ir statusas overdue arba partially_paid
            invoices = SalesInvoice.objects.filter(
                payment_status__in=['overdue', 'partially_paid'],
                due_date__lt=today
            ).select_related('partner', 'partner__contact_person')
            
            for invoice in invoices:
                # Patikrinti vėlavimo dienas
                if invoice.overdue_days < overdue_min_days:
                    results['overdue']['skipped'] += 1
                    continue
                
                if overdue_max_days > 0 and invoice.overdue_days > overdue_max_days:
                    results['overdue']['skipped'] += 1
                    continue
                
                # Patikrinti, ar reikia siųsti pagal intervalą
                from apps.invoices.models import InvoiceReminder
                reminder, created = InvoiceReminder.objects.get_or_create(
                    invoice=invoice,
                    reminder_type='overdue',
                    defaults={'sent_count': 0}
                )
                
                if not created and reminder.last_sent_at:
                    days_since_last = (timezone.now() - reminder.last_sent_at).days
                    if days_since_last < interval_days:
                        results['overdue']['skipped'] += 1
                        continue
                
                results['overdue']['checked'] += 1
                result = self._send_reminder(invoice, 'overdue', dry_run)
                self._update_results(results['overdue'], result)
        
        # Rezultatų suvestinė
        self.stdout.write('\n' + '='*60)
        self.stdout.write('REZULTATŲ SUVESTINĖ')
        self.stdout.write('='*60)
        
        for reminder_type, stats in results.items():
            if stats['checked'] > 0:
                self.stdout.write(f"\n{reminder_type.upper()}:")
                self.stdout.write(f"  Patikrinta: {stats['checked']}")
                self.stdout.write(f"  Išsiųsta: {stats['sent']}")
                self.stdout.write(f"  Praleista: {stats['skipped']}")
                self.stdout.write(f"  Klaidos: {stats['errors']}")
        
        total_checked = sum(s['checked'] for s in results.values())
        total_sent = sum(s['sent'] for s in results.values())
        total_skipped = sum(s['skipped'] for s in results.values())
        total_errors = sum(s['errors'] for s in results.values())
        
        self.stdout.write(f"\nVISIŠKAI:")
        self.stdout.write(f"  Patikrinta: {total_checked}")
        self.stdout.write(f"  Išsiųsta: {total_sent}")
        self.stdout.write(f"  Praleista: {total_skipped}")
        self.stdout.write(f"  Klaidos: {total_errors}")
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY RUN MODE - priminimai NEBUVO siunčiami'))
        else:
            if total_sent > 0:
                self.stdout.write(self.style.SUCCESS(f'\nPriminimų siuntimas baigtas. Išsiųsta: {total_sent}'))
            else:
                self.stdout.write(self.style.WARNING('\nPriminimų siuntimas baigtas. Niekas nebuvo išsiųsta.'))
    
    def _send_reminder(self, invoice, reminder_type, dry_run=False):
        """Siunčia priminimą ir grąžina rezultatą"""
        try:
            if dry_run:
                self.stdout.write(
                    f"  [DRY RUN] Būtų siųstas priminimas: {invoice.invoice_number} "
                    f"({reminder_type}) -> {invoice.partner.name}"
                )
                return {'success': True, 'dry_run': True}
            
            result = send_debtor_reminder_email(
                invoice=invoice,
                reminder_type=reminder_type,
                sent_by=None  # Automatinis siuntimas
            )
            
            if result.get('success'):
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  ✓ Išsiųstas priminimas: {invoice.invoice_number} "
                        f"({reminder_type}) -> {invoice.partner.name}"
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"  ⚠ Praleistas: {invoice.invoice_number} "
                        f"({reminder_type}) -> {invoice.partner.name}: {result.get('error', 'Nežinoma klaida')}"
                    )
                )
            
            return result
        
        except Exception as e:
            logger.error(f"Klaida siunčiant priminimą {invoice.invoice_number}: {e}", exc_info=True)
            self.stdout.write(
                self.style.ERROR(
                    f"  ✗ Klaida: {invoice.invoice_number} ({reminder_type}): {str(e)}"
                )
            )
            return {'success': False, 'error': str(e)}
    
    def _update_results(self, results_dict, result):
        """Atnaujina rezultatų žodyną"""
        if result.get('dry_run'):
            results_dict['sent'] += 1
        elif result.get('success'):
            results_dict['sent'] += 1
        elif result.get('error'):
            # Jei klaida, bet tai ne sistema klaida (pvz., partnerio nustatymai), laikyti kaip praleistą
            error_msg = result.get('error', '')
            if 'nėra įjungto' in error_msg.lower() or 'išjungtas' in error_msg.lower():
                results_dict['skipped'] += 1
            else:
                results_dict['errors'] += 1
        else:
            results_dict['errors'] += 1

