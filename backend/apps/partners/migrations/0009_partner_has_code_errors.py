# Generated migration: add has_code_errors to Partner

from django.db import migrations, models


def backfill_has_code_errors(apps, schema_editor):
    """Apskaičiuoja has_code_errors visiems esamiems partneriams."""
    Partner = apps.get_model('partners', 'Partner')
    # Import here to avoid loading utils at migration parse time
    from apps.partners.utils import is_valid_company_code, is_valid_vat_code
    for p in Partner.objects.only('id', 'code', 'vat_code').iterator(chunk_size=500):
        has_errors = not (
            is_valid_company_code(p.code or '') and is_valid_vat_code(p.vat_code or '')
        )
        if p.has_code_errors != has_errors:
            Partner.objects.filter(pk=p.pk).update(has_code_errors=has_errors)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('partners', '0008_merge_20251216_1858'),
    ]

    operations = [
        migrations.AddField(
            model_name='partner',
            name='has_code_errors',
            field=models.BooleanField(db_index=True, default=False, help_text='Įmonės arba PVM kodas neteisingo formato – rodoma tik su filtru „Su klaidomis“.', verbose_name='Kodo klaidos'),
        ),
        migrations.RunPython(backfill_has_code_errors, noop),
    ]
