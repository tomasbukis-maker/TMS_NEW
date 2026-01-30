# Generated manually
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0019_merge_20251119_1134'),
    ]

    operations = [
        migrations.CreateModel(
            name='UISettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status_colors', models.JSONField(blank=True, default=dict, help_text='JSON objektas su spalvomis pagal būsenas: {"invoices": {"paid": "#28a745", "not_paid": "#dc3545", ...}, "expeditions": {"new": "#17a2b8", ...}, "orders": {"new": "#17a2b8", ...}}', verbose_name='Būsenų spalvos')),
                ('notes', models.TextField(blank=True, verbose_name='Pastabos')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'UI nustatymai',
                'verbose_name_plural': 'UI nustatymai',
                'db_table': 'ui_settings',
            },
        ),
    ]

