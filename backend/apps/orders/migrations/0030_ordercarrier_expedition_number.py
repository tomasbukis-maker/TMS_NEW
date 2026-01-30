from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0024_order_other_costs_order_receiver_route_to_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExpeditionNumberSequence',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('last_number', models.IntegerField(default=0, verbose_name='Paskutinis ekspedicijos numeris')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atnaujinta')),
            ],
            options={
                'db_table': 'expedition_number_sequences',
                'verbose_name': 'Ekspedicijų numeracijos seka',
                'verbose_name_plural': 'Ekspedicijų numeracijos sekos',
            },
        ),
        migrations.AddField(
            model_name='ordercarrier',
            name='expedition_number',
            field=models.CharField(
                blank=True,
                null=True,
                max_length=32,
                unique=True,
                verbose_name='Ekspedicijos numeris',
            ),
        ),
    ]

