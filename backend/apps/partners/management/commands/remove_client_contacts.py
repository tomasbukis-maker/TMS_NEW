"""
Išvalo kontaktus iš klientų: nustato contact_person=None visiems klientams,
po to ištrina visus Contact, kurių partneris yra klientas (partner.is_client=True).
Paleiskite serveryje: python manage.py remove_client_contacts [--dry-run]
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.partners.models import Contact, Partner


class Command(BaseCommand):
    help = 'Pašalina kontaktus iš visų klientų: contact_person=None, po to trina Contact (partner.is_client=True)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodo, ką būtų padaryta, bet nieko nekeičia',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN – nieko nebus pakeista'))

        # Klientai, kurie turi contact_person
        clients_with_contact = Partner.objects.filter(is_client=True).exclude(contact_person__isnull=True)
        count_refs = clients_with_contact.count()
        # Kontaktai, kurių partneris klientas
        client_contacts = Contact.objects.filter(partner__is_client=True)
        count_contacts = client_contacts.count()

        self.stdout.write(f'Klientų su contact_person: {count_refs}')
        self.stdout.write(f'Kontaktų (partner.is_client=True): {count_contacts}')

        if count_refs == 0 and count_contacts == 0:
            self.stdout.write(self.style.SUCCESS('Visi klientai jau be kontaktų. Nieko daryti nereikia.'))
            return

        if dry_run:
            if count_refs:
                self.stdout.write('Būtų nustatytas contact_person=None šiems klientams:')
                for p in clients_with_contact[:10]:
                    self.stdout.write(f'  - {p.name} ({p.code})')
                if count_refs > 10:
                    self.stdout.write(f'  ... ir dar {count_refs - 10} kitų')
            if count_contacts:
                self.stdout.write('Būtų ištrinti šie kontaktai (pirmi 10):')
                for c in client_contacts.select_related('partner')[:10]:
                    partner_name = c.partner.name if c.partner else '?'
                    self.stdout.write(f'  - {partner_name} | {c.first_name} {c.last_name} | {c.email}')
                if count_contacts > 10:
                    self.stdout.write(f'  ... ir dar {count_contacts - 10} kitų')
            self.stdout.write(self.style.WARNING(f'DRY RUN: būtų atnaujinta {count_refs} partnerių, ištrinta {count_contacts} kontaktų'))
            return

        with transaction.atomic():
            updated = clients_with_contact.update(contact_person=None)
            self.stdout.write(self.style.SUCCESS(f'Nustatytas contact_person=None: {updated} klientų'))
            deleted_count, _ = client_contacts.delete()
            self.stdout.write(self.style.SUCCESS(f'Ištrinta kontaktų: {deleted_count}'))
