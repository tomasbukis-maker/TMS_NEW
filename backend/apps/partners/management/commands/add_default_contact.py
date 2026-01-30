"""
Management komanda, kuri prideda arba atnaujina numatytąjį kontaktinį asmenį visiems klientams.
Paleiskite: python manage.py add_default_contact
"""
from django.core.management.base import BaseCommand
from apps.partners.models import Partner, Contact


class Command(BaseCommand):
    help = 'Prideda arba atnaujina numatytąjį kontaktinį asmenį visiems klientams'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Tik parodo, ką būtų padaryta, bet nieko nekeičia',
        )
        parser.add_argument(
            '--first-name',
            default='Tomas',
            help='Kontaktinio asmens vardas (numatytoji reikšmė: Tomas)',
        )
        parser.add_argument(
            '--last-name',
            default='Admin',
            help='Kontaktinio asmens pavardė (numatytoji reikšmė: Admin)',
        )
        parser.add_argument(
            '--email',
            default='info@hotmail.lt',
            help='Kontaktinio asmens el. paštas (numatytoji reikšmė: info@hotmail.lt)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        first_name = options['first_name']
        last_name = options['last_name']
        email = options['email']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - nieko nebus pakeista'))

        # Gauname visus klientus (partnerius su is_client=True)
        clients = Partner.objects.filter(is_client=True).prefetch_related('contacts')
        self.stdout.write(f'Rasta {clients.count()} klientų')

        if clients.count() == 0:
            self.stdout.write(self.style.WARNING('Nerasta nė vieno kliento'))
            return

        created_count = 0
        updated_count = 0

        for client in clients:
            # Tikriname ar jau egzistuoja kontaktas su šiuo email'u
            existing_contact = client.contacts.filter(email=email).first()

            if existing_contact:
                # Atnaujiname esamą kontaktą
                if (existing_contact.first_name != first_name or
                    existing_contact.last_name != last_name):
                    if not dry_run:
                        existing_contact.first_name = first_name
                        existing_contact.last_name = last_name
                        existing_contact.save()
                    updated_count += 1
                    self.stdout.write(f'Atnaujinta: {client.name} - {existing_contact.first_name} {existing_contact.last_name}')
                else:
                    self.stdout.write(f'Jau egzistuoja: {client.name} - {existing_contact.first_name} {existing_contact.last_name}')
            else:
                # Sukuriame naują kontaktą
                if not dry_run:
                    new_contact = Contact.objects.create(
                        partner=client,
                        first_name=first_name,
                        last_name=last_name,
                        email=email,
                        position='Administratorius'
                    )
                    # Nustatome kaip pagrindinį kontaktą, jei nėra kito pagrindinio
                    if not client.contact_person:
                        client.contact_person = new_contact
                        client.save()
                created_count += 1
                self.stdout.write(f'Sukurta: {client.name} - {first_name} {last_name}')

        if dry_run:
            self.stdout.write(self.style.WARNING(f'DRY RUN: būtų sukurta {created_count} ir atnaujinta {updated_count} kontaktų'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Sėkmingai sukurta {created_count} ir atnaujinta {updated_count} kontaktinių asmenų'))

            # Iš viso klientų su kontaktais statistika
            clients_with_contacts = Partner.objects.filter(is_client=True, contacts__isnull=False).distinct().count()
            total_contacts = Contact.objects.filter(partner__is_client=True).count()
            self.stdout.write(f'Iš viso klientų su kontaktais: {clients_with_contacts}')
            self.stdout.write(f'Iš viso kontaktų klientams: {total_contacts}')







