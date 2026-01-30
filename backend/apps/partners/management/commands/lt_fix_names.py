from django.core.management.base import BaseCommand
from apps.partners.models import Partner, Contact
from apps.partners.utils import fix_lithuanian_diacritics


class Command(BaseCommand):
    help = 'Pataiso lietuviškas raides Partner ir Contact įrašuose'

    def handle(self, *args, **options):
        updated_partners = 0
        updated_contacts = 0

        for p in Partner.objects.all():
            name = fix_lithuanian_diacritics(p.name or '')
            address = fix_lithuanian_diacritics(p.address or '')
            fields = []
            if name != (p.name or ''):
                p.name = name
                fields.append('name')
            if address != (p.address or ''):
                p.address = address
                fields.append('address')
            if fields:
                p.save(update_fields=fields)
                updated_partners += 1

        for c in Contact.objects.all():
            fn = fix_lithuanian_diacritics(c.first_name or '')
            ln = fix_lithuanian_diacritics(c.last_name or '')
            pos = fix_lithuanian_diacritics(c.position or '')
            notes = fix_lithuanian_diacritics(c.notes or '')
            fields = []
            if fn != (c.first_name or ''):
                c.first_name = fn
                fields.append('first_name')
            if ln != (c.last_name or ''):
                c.last_name = ln
                fields.append('last_name')
            if pos != (c.position or ''):
                c.position = pos
                fields.append('position')
            if notes != (c.notes or ''):
                c.notes = notes
                fields.append('notes')
            if fields:
                c.save(update_fields=fields)
                updated_contacts += 1

        self.stdout.write(self.style.SUCCESS(
            f'Atnaujinta: partners={updated_partners}, contacts={updated_contacts}'
        ))


