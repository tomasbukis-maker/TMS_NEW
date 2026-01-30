"""
Management komanda, kuri išvalo kontaktinius asmenis iš klientų duomenų.
Paleiskite: python manage.py clear_client_emails
"""
from django.core.management.base import BaseCommand
from apps.partners.models import Contact, Partner


class Command(BaseCommand):
    help = 'Išvalo kontaktinius asmenis iš klientų duomenų'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodo, ką būtų padaryta, bet nieko nekeičia',
        )
        parser.add_argument(
            '--clients-only',
            action='store_true',
            help='Išvalo tik klientų kontaktus (partner.is_client=True), ne tiekėjų',
        )
        parser.add_argument(
            '--emails-only',
            action='store_true',
            help='Išvalo tik el. pašto adresus, ne kontaktinius asmenis',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        clients_only = options['clients_only']
        emails_only = options['emails_only']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - nieko nebus pakeista'))

        # Pasirenkame kontaktus
        if clients_only:
            if emails_only:
                contacts = Contact.objects.filter(
                    partner__is_client=True
                ).exclude(email='').select_related('partner')
                action_desc = 'klientų kontaktų su el. paštu'
            else:
                contacts = Contact.objects.filter(
                    partner__is_client=True
                ).select_related('partner')
                action_desc = 'klientų kontaktų'
        else:
            if emails_only:
                contacts = Contact.objects.exclude(email='').select_related('partner')
                action_desc = 'kontaktų su el. paštu'
            else:
                contacts = Contact.objects.all().select_related('partner')
                action_desc = 'visų kontaktų'

        self.stdout.write(f'Rasta {contacts.count()} {action_desc}')

        if contacts.count() == 0:
            self.stdout.write(self.style.SUCCESS(f'Nėra {action_desc}'))
            return

        # Rodyti ką būtų ištrinta
        if emails_only:
            self.stdout.write('Kontaktai kurių el. paštas būtų ištrintas:')
            for contact in contacts[:10]:  # Rodyti pirmus 10
                partner_name = contact.partner.name if contact.partner else 'Nėra partnerio'
                contact_name = f"{contact.first_name} {contact.last_name}".strip()
                if not contact_name:
                    contact_name = f"ID: {contact.id}"
                self.stdout.write(f'  - {partner_name} | {contact_name}: {contact.email}')
        else:
            self.stdout.write('Kontaktai kurie būtų ištrinti:')
            for contact in contacts[:10]:  # Rodyti pirmus 10
                partner_name = contact.partner.name if contact.partner else 'Nėra partnerio'
                contact_name = f"{contact.first_name} {contact.last_name}".strip()
                if not contact_name:
                    contact_name = f"ID: {contact.id}"
                details = []
                if contact.email:
                    details.append(f"email: {contact.email}")
                if contact.phone:
                    details.append(f"tel: {contact.phone}")
                if contact.position:
                    details.append(f"pareigos: {contact.position}")
                details_str = f" ({', '.join(details)})" if details else ""
                self.stdout.write(f'  - {partner_name} | {contact_name}{details_str}')

        if contacts.count() > 10:
            self.stdout.write(f'  ... ir dar {contacts.count() - 10} kitų')

        # Patvirtinimas jei ne dry-run
        if not dry_run:
            if emails_only:
                action_text = f'ištrinti el. pašto adresus iš {contacts.count()} kontaktų'
            else:
                action_text = f'IŠTRINTI {contacts.count()} kontaktinius asmenis VISAM LAIKUI'

            confirm = input(f'\n⚠️  DĖMESYS: Ar tikrai norite {action_text}? (yes/no): ')
            if confirm.lower() not in ['yes', 'y', 'taip']:
                self.stdout.write(self.style.WARNING('Atšaukta'))
                return

        # Atliekame veiksmą
        if not dry_run:
            if emails_only:
                updated_count = contacts.update(email='')
                self.stdout.write(self.style.SUCCESS(f'Sėkmingai ištrinta {updated_count} el. pašto adresų'))
            else:
                deleted_count = contacts.delete()[0]  # delete() grąžina (deleted_count, details)
                self.stdout.write(self.style.SUCCESS(f'Sėkmingai ištrinta {deleted_count} kontaktinių asmenų'))
        else:
            if emails_only:
                self.stdout.write(self.style.WARNING(f'DRY RUN: būtų ištrinta {contacts.count()} el. pašto adresų'))
            else:
                self.stdout.write(self.style.WARNING(f'DRY RUN: būtų ištrinta {contacts.count()} kontaktinių asmenų'))
