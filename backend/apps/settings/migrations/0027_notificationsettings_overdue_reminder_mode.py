# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0026_expeditionsettings_carrier_client_obligations'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationsettings',
            name='overdue_reminder_mode',
            field=models.CharField(
                choices=[
                    ('automatic', 'Automatinis'),
                    ('manual', 'Rankinis'),
                    ('both', 'Automatinis ir rankinis'),
                ],
                default='automatic',
                help_text='Kaip siųsti priminimus apie vėluojančias sąskaitas',
                max_length=20,
                verbose_name='Priminimų siuntimo būdas (vėluojama)'
            ),
        ),
    ]

