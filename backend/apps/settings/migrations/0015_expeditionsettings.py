from django.db import migrations, models
from django.core.validators import MinValueValidator, MaxValueValidator


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0014_notificationsettings_imap_sync_interval'),
    ]

    operations = [
        migrations.CreateModel(
            name='ExpeditionSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('expedition_prefix', models.CharField(default='E', max_length=10, verbose_name='Ekspedicijos numerio prefiksas')),
                ('expedition_number_width', models.IntegerField(default=5, validators=[MinValueValidator(1), MaxValueValidator(10)], verbose_name='Ekspedicijos numerio skaitmenų skaičius (NNNNN)')),
                ('auto_numbering', models.BooleanField(default=True, verbose_name='Automatinis ekspedicijų numeravimas')),
                ('notes', models.TextField(blank=True, verbose_name='Pastabos')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Ekspedicijos nustatymai',
                'verbose_name_plural': 'Ekspedicijos nustatymai',
                'db_table': 'expedition_settings',
            },
        ),
    ]

