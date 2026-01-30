# Generated manually for adding route detail fields to OrderCarrier

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0050_add_sender_receiver_to_ordercarrier'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordercarrier',
            name='route_from_country',
            field=models.CharField(blank=True, max_length=255, verbose_name='Maršrutas iš - Šalis'),
        ),
        migrations.AddField(
            model_name='ordercarrier',
            name='route_from_postal_code',
            field=models.CharField(blank=True, max_length=20, verbose_name='Maršrutas iš - Pašto kodas'),
        ),
        migrations.AddField(
            model_name='ordercarrier',
            name='route_from_city',
            field=models.CharField(blank=True, max_length=255, verbose_name='Maršrutas iš - Miestas'),
        ),
        migrations.AddField(
            model_name='ordercarrier',
            name='route_from_address',
            field=models.CharField(blank=True, max_length=500, verbose_name='Maršrutas iš - Adresas'),
        ),
        migrations.AddField(
            model_name='ordercarrier',
            name='route_to_country',
            field=models.CharField(blank=True, max_length=255, verbose_name='Maršrutas į - Šalis'),
        ),
        migrations.AddField(
            model_name='ordercarrier',
            name='route_to_postal_code',
            field=models.CharField(blank=True, max_length=20, verbose_name='Maršrutas į - Pašto kodas'),
        ),
        migrations.AddField(
            model_name='ordercarrier',
            name='route_to_city',
            field=models.CharField(blank=True, max_length=255, verbose_name='Maršrutas į - Miestas'),
        ),
        migrations.AddField(
            model_name='ordercarrier',
            name='route_to_address',
            field=models.CharField(blank=True, max_length=500, verbose_name='Maršrutas į - Adresas'),
        ),
    ]