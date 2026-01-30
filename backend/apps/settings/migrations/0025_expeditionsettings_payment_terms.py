# Generated manually to avoid KeyError: ('orders', 'orderstatushistory')

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0023_add_email_test_mode'),
    ]

    operations = [
        migrations.AddField(
            model_name='expeditionsettings',
            name='payment_terms',
            field=models.TextField(
                blank=True,
                default='30 kalendorinių dienų po PVM sąskaitos-faktūros ir važtaraščio su krovinio gavimo data ir gavėjo vardu, pavarde, parašu gavimo.',
                help_text='Apmokėjimo terminas, kuris bus rodomas ekspedicijos sutartyje. Naudojamas kaip numatytasis, jei vežėjo modelyje payment_terms nėra nustatytas.',
                verbose_name='Apmokėjimo terminas'
            ),
        ),
    ]

