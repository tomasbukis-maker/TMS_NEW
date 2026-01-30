from django.core.management.base import BaseCommand
from apps.mail.models import MailAttachment
from apps.invoices.models import PurchaseInvoice
import re
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Susieja esamas purchase invoices su mail attachments pagal sąskaitos numerį'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Rodo, kas būtų susieta, bet nekeičia duomenų',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - nieko nebus pakeista\n'))
        
        # Rasti visas purchase invoices
        invoices = PurchaseInvoice.objects.all()
        self.stdout.write(f'Rasta {invoices.count()} purchase invoices\n')
        
        # Rasti visus PDF attachments
        pdf_attachments = MailAttachment.objects.filter(
            filename__icontains='.pdf'
        ).exclude(
            related_purchase_invoice__isnull=False
        )  # Tik tie, kurie dar nesusieti
        
        self.stdout.write(f'Rasta {pdf_attachments.count()} PDF attachments (be susietų invoice)\n\n')
        
        matches = []
        linked = 0
        already_linked_invoices = set()  # Kad nesusietų kelis kartus tą patį invoice
        
        for inv in invoices:
            # Praleisti, jei jau susieta
            if inv.id in already_linked_invoices:
                continue
                
            inv_number = inv.received_invoice_number.strip().upper()
            if not inv_number:
                continue
            
            # Normalizuoti numerį (pašalinti tarpus, minusus, underscore)
            inv_normalized = re.sub(r'[^A-Z0-9]', '', inv_number)
            
            # Ieškoti attachment'ų su tuo pačiu numeriu (tik pirmąjį)
            found_match = False
            for att in pdf_attachments:
                # Praleisti, jei jau susietas
                if att.related_purchase_invoice_id:
                    continue
                    
                att_filename_upper = att.filename.upper()
                
                # Normalizuoti attachment filename
                att_normalized = re.sub(r'[^A-Z0-9]', '', att_filename_upper)
                
                # Patikrinti ar numeris yra failo pavadinime
                if inv_normalized in att_normalized or att_normalized in inv_normalized:
                    # Papildomas patikrinimas - ar numeris tikrai atitinka (ne tik dalis)
                    # Ieškoti numerio kaip atskiro žodžio arba panašaus
                    if inv_number in att_filename_upper or self._numbers_match(inv_number, att_filename_upper):
                        matches.append((inv, att))
                        if not dry_run:
                            att.related_purchase_invoice = inv
                            att.save(update_fields=['related_purchase_invoice'])
                            linked += 1
                            already_linked_invoices.add(inv.id)
                            found_match = True
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f'✅ Susieta: Invoice {inv.id} ({inv.received_invoice_number}) <-> Attachment {att.id} ({att.filename})'
                                )
                            )
                        else:
                            self.stdout.write(
                                f'🔗 BŪTŲ SUSIETA: Invoice {inv.id} ({inv.received_invoice_number}) <-> Attachment {att.id} ({att.filename})'
                            )
                        break  # Susieti tik pirmąjį attachment'ą
        
        if dry_run:
            self.stdout.write(self.style.WARNING(f'\nDRY RUN: būtų susieta {len(matches)} atitikmenų'))
        else:
            self.stdout.write(self.style.SUCCESS(f'\nSėkmingai susieta {linked} atitikmenų'))
    
    def _numbers_match(self, inv_number: str, filename: str) -> bool:
        """Patikrina, ar sąskaitos numeris atitinka failo pavadinime"""
        # Ištraukti visus skaičius ir raides iš abiejų
        inv_clean = re.sub(r'[^A-Z0-9]', '', inv_number.upper())
        filename_clean = re.sub(r'[^A-Z0-9]', '', filename.upper())
        
        # Jei numeris yra failo pavadinime kaip atskiras žodis arba panašus
        if inv_clean in filename_clean:
            # Patikrinti, ar tai ne per trumpas atitikmuo (mažiau nei 4 simboliai)
            if len(inv_clean) >= 4:
                return True
        
        return False
