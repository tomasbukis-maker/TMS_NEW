# Valiutos ir skaičių formatavimo nustatymai sąskaitose

from django.db import migrations, models
from django.core.validators import MinValueValidator, MaxValueValidator


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0040_orderautostatusrule_conditions_logic'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoicesettings',
            name='currency_code',
            field=models.CharField(default='EUR', help_text='Pvz.: EUR, USD, GBP', max_length=10, verbose_name='Valiutos kodas'),
        ),
        migrations.AddField(
            model_name='invoicesettings',
            name='currency_symbol',
            field=models.CharField(blank=True, default='€', help_text='Pvz.: €, $, £. Jei tuščias, rodomas valiutos kodas.', max_length=10, verbose_name='Valiutos simbolis'),
        ),
        migrations.AddField(
            model_name='invoicesettings',
            name='decimal_places',
            field=models.IntegerField(default=2, help_text='Kiek skaitmenų po kablelio rodyti sumoms (0–6).', validators=[MinValueValidator(0), MaxValueValidator(6)], verbose_name='Skaitmenų po kablelio'),
        ),
        migrations.AddField(
            model_name='invoicesettings',
            name='decimal_separator',
            field=models.CharField(choices=[(',', 'Kablelis (,)'), ('.', 'Taškas (.)')], default=',', max_length=1, verbose_name='Dešimtainis skyriklis'),
        ),
    ]
