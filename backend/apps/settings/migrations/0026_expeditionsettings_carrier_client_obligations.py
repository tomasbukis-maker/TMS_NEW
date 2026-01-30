# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0025_expeditionsettings_payment_terms'),
    ]

    operations = [
        migrations.AddField(
            model_name='expeditionsettings',
            name='carrier_obligations',
            field=models.JSONField(blank=True, default=list, help_text='Sąrašas punktų, pvz: [{"text": "Vežėjas privalomai turi turėti..."}]', verbose_name='Vežėjo teisės ir pareigos'),
        ),
        migrations.AddField(
            model_name='expeditionsettings',
            name='client_obligations',
            field=models.JSONField(blank=True, default=list, help_text='Sąrašas punktų, pvz: [{"text": "Pateikia Vežėjui..."}]', verbose_name='Užsakovo teisės ir pareigos'),
        ),
    ]

