# Generated manually for matches_computed_at

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('mail', '0019_add_related_purchase_invoice_to_attachment'),
    ]

    operations = [
        migrations.AddField(
            model_name='mailmessage',
            name='matches_computed_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Kada paskutinį kartą buvo paleista sutapimų logika – sąrašuose naudojame tik DB, nebekuriame teksto.',
                null=True,
                verbose_name='Sutapimai apskaičiuoti',
            ),
        ),
    ]
