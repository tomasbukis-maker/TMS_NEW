# Generated manually on 2025-11-19

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('partners', '0003_make_contact_names_optional'),
    ]

    operations = [
        migrations.AddField(
            model_name='partner',
            name='email_notify_due_soon',
            field=models.BooleanField(default=True, help_text='Siųsti priminimą apie artėjantį apmokėjimo terminą', verbose_name='Siųsti priminimą apie artėjantį terminą'),
        ),
        migrations.AddField(
            model_name='partner',
            name='email_notify_unpaid',
            field=models.BooleanField(default=True, help_text='Siųsti priminimą apie sueitį apmokėjimo terminą ir neapmokėtą sąskaitą', verbose_name='Siųsti priminimą apie sueitį terminą ir neapmokėtą sąskaitą'),
        ),
        migrations.AddField(
            model_name='partner',
            name='email_notify_overdue',
            field=models.BooleanField(default=True, help_text='Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą', verbose_name='Siųsti priminimą apie pradelstą apmokėjimo terminą/vėluojančią sąskaitą'),
        ),
    ]

