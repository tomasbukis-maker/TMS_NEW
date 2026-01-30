# Generated manually
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0020_uisettings'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('template_type', models.CharField(choices=[('reminder_due_soon', 'Artėja terminas apmokėjimui'), ('reminder_unpaid', 'Neapmokėta sąskaita'), ('reminder_overdue', 'Vėluojama apmokėti sąskaita'), ('order_to_client', 'Užsakymas klientui'), ('order_to_carrier', 'Užsakymas vežėjui'), ('invoice_to_client', 'Sąskaita klientui')], max_length=50, unique=True, verbose_name='Šablono tipas')),
                ('subject', models.CharField(help_text='El. laiško antraštė. Galite naudoti kintamuosius: {invoice_number}, {order_number}, {partner_name}, {amount}, {due_date}, {overdue_days}', max_length=512, verbose_name='Antraštė')),
                ('body_text', models.TextField(help_text='El. laiško turinys paprastu tekstu. Galite naudoti kintamuosius: {invoice_number}, {order_number}, {partner_name}, {amount}, {due_date}, {overdue_days}', verbose_name='Turinys (tekstas)')),
                ('body_html', models.TextField(blank=True, help_text='El. laiško turinys HTML formatu. Jei tuščias, bus naudojamas tekstinis turinys.', verbose_name='Turinys (HTML)')),
                ('is_active', models.BooleanField(default=True, help_text='Jei neaktyvus, bus naudojamas numatytasis šablonas', verbose_name='Aktyvus')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'El. laiško šablonas',
                'verbose_name_plural': 'El. laiškų šablonai',
                'db_table': 'email_templates',
                'ordering': ['template_type'],
            },
        ),
    ]

