"""
Pašalina visus kontaktus iš visų partnerių: nustato contact_person=None visiems partneriams,
po to ištrina visus Contact įrašus. Vėliau galima suvesti naujus kontaktus.
Paleiskite: python manage.py clear_all_partner_contacts [--dry-run] [--yes]
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.partners.models import Contact, Partner


class Command(BaseCommand):
    help = 'Pašalina visus kontaktus iš visų partnerių: contact_person=None, po to trina visus Contact'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodo, ką būtų padaryta, bet nieko nekeičia',
        )
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Neklausti patvirtinimo (patogu skriptams/serveryje)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        skip_confirm = options['yes']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN – nieko nebus pakeista'))

        # Visi partneriai, kurie turi contact_person
        partners_with_contact = Partner.objects.exclude(contact_person__isnull=True)
        count_refs = partners_with_contact.count()
        # Visi kontaktai
        all_contacts = Contact.objects.all()
        count_contacts = all_contacts.count()

        self.stdout.write(f'Partnerių su contact_person: {count_refs}')
        self.stdout.write(f'Kontaktų iš viso: {count_contacts}')

        if count_refs == 0 and count_contacts == 0:
            self.stdout.write(self.style.SUCCESS('Partneriuose jau nėra kontaktų. Nieko daryti nereikia.'))
            return

        if dry_run:
            if count_refs:
                self.stdout.write('Būtų nustatytas contact_person=None šiems partneriams:')
                for p in partners_with_contact[:10]:
                    self.stdout.write(f'  - {p.name} ({p.code})')
                if count_refs > 10:
                    self.stdout.write(f'  ... ir dar {count_refs - 10} kitų')
            if count_contacts:
                self.stdout.write('Būtų ištrinti visi kontaktai (pirmi 10):')
                for c in all_contacts.select_related('partner')[:10]:
                    partner_name = c.partner.name if c.partner else '(be partnerio)'
                    self.stdout.write(f'  - {partner_name} | {c.first_name} {c.last_name} | {c.email or "-"}')
                if count_contacts > 10:
                    self.stdout.write(f'  ... ir dar {count_contacts - 10} kitų')
            self.stdout.write(self.style.WARNING(
                f'DRY RUN: būtų atnaujinta {count_refs} partnerių, ištrinta {count_contacts} kontaktų'
            ))
            return

        if not skip_confirm:
            confirm = input(
                f'\n⚠️  Ar tikrai norite pašalinti visus kontaktus iš visų partnerių '
                f'({count_refs} partnerių, {count_contacts} kontaktų)? (yes/no): '
            )
            if confirm.lower() not in ['yes', 'y', 'taip']:
                self.stdout.write(self.style.WARNING('Atšaukta'))
                return

        with transaction.atomic():
            updated = partners_with_contact.update(contact_person=None)
            self.stdout.write(self.style.SUCCESS(f'Nustatytas contact_person=None: {updated} partnerių'))
            deleted_count, _ = all_contacts.delete()
            self.stdout.write(self.style.SUCCESS(f'Ištrinta kontaktų: {deleted_count}'))
