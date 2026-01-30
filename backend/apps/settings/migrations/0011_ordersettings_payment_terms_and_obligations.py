# Generated manually
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0010_notificationsettings'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordersettings',
            name='payment_terms',
            field=models.TextField(
                blank=True,
                default='30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.',
                help_text='Apmokėjimo terminas, kuris bus rodomas sutartyje',
                verbose_name='Apmokėjimo terminas'
            ),
        ),
        migrations.AddField(
            model_name='ordersettings',
            name='carrier_obligations',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Sąrašas punktų, pvz: [{"text": "Vežėjas privalomai turi turėti..."}]',
                verbose_name='Vežėjo teisės ir pareigos'
            ),
        ),
        migrations.AddField(
            model_name='ordersettings',
            name='client_obligations',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Sąrašas punktų, pvz: [{"text": "Pateikia Vežėjui..."}]',
                verbose_name='Užsakovo teisės ir pareigos'
            ),
        ),
    ]









