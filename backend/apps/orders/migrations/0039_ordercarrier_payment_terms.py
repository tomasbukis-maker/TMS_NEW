# Generated manually to avoid KeyError: ('orders', 'orderstatushistory')

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0037_ordercarrier_vat_rate_ordercarrier_vat_rate_article'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordercarrier',
            name='payment_terms',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Apmokėjimo terminas, kuris bus rodomas ekspedicijos sutartyje. Jei tuščias, bus naudojamas numatytasis iš ekspedicijų nustatymų.',
                verbose_name='Apmokėjimo terminas'
            ),
        ),
    ]

