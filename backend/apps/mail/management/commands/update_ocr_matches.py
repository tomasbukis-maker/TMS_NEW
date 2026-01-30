from django.core.management.base import BaseCommand
from django.db import transaction
from apps.mail.models import MailMessage
from apps.mail.mail_matching_helper_NEW import update_message_matches


class Command(BaseCommand):
    help = 'Atnaujina OCR atpažinimą ir susiejimus visiems laiškams su PDF priedais'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodyti ką būtų padaryta, bet nieko nekeisti',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Apriboti laiškų skaičių (naudinga testavimui)',
        )
        parser.add_argument(
            '--message-id',
            type=int,
            default=None,
            help='Apdoroti tik konkretų laišką pagal ID',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        limit = options['limit']
        message_id = options['message_id']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - nieko nebus keičiama'))

        # Rasti laiškus su PDF priedais
        if message_id:
            messages = MailMessage.objects.filter(id=message_id)
            self.stdout.write(f'Apdorosime konkretų laišką ID: {message_id}')
        else:
            messages = MailMessage.objects.filter(
                attachments__filename__endswith='.pdf'
            ).distinct().order_by('-date')

            if limit:
                messages = messages[:limit]
                self.stdout.write(f'Apdorosime {limit} naujausių laiškų su PDF priedais')
            else:
                self.stdout.write(f'Apdorosime VISUS laiškus su PDF priedais ({messages.count()})')

        processed = 0
        updated = 0

        for message in messages:
            processed += 1

            if processed % 10 == 0:
                self.stdout.write(f'Apdorota: {processed} laiškų...')

            pdf_count = message.attachments.filter(filename__endswith='.pdf').count()
            old_matches_count = message.matched_orders.count() + message.matched_expeditions.count()

            if not dry_run:
                try:
                    # Iš naujo apdoroti laišką
                    update_message_matches(message)

                    # Iš naujo nuskaityti iš DB
                    message.refresh_from_db()
                    new_matches_count = message.matched_orders.count() + message.matched_expeditions.count()

                    if new_matches_count > old_matches_count:
                        updated += 1
                        self.stdout.write(
                            f'✅ Atnaujinta: "{message.subject[:50]}..." '
                            f'(PDF: {pdf_count}, Susiejimų: {old_matches_count} → {new_matches_count})'
                        )
                    elif dry_run:
                        self.stdout.write(
                            f'📄 "{message.subject[:50]}..." '
                            f'(PDF: {pdf_count}, Susiejimų: {new_matches_count})'
                        )

                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'Klaida apdorojant laišką {message.id}: {e}')
                    )
            else:
                # Dry run - parodyti ką būtų padaryta
                self.stdout.write(
                    f'📄 "{message.subject[:50]}..." '
                    f'(PDF: {pdf_count}, Dabartinių susiejimų: {old_matches_count})'
                )

        self.stdout.write(self.style.SUCCESS(
            f'\\n✅ Baigta! Apdorota: {processed} laiškų'
        ))

        if not dry_run:
            self.stdout.write(self.style.SUCCESS(
                f'Atnaujinta susiejimų: {updated} laiškų'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                'Tai buvo DRY RUN - nieko nebuvo pakeista'
            ))







