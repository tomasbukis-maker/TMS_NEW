# Generated manually - InvoiceReminder model migration
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0016_merge_20251119_1140'),
    ]

    operations = [
        migrations.CreateModel(
            name='InvoiceReminder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reminder_type', models.CharField(choices=[('due_soon', 'Artėja terminas'), ('unpaid', 'Neapmokėta sąskaita'), ('overdue', 'Vėluojama apmokėti')], max_length=20, verbose_name='Priminimo tipas')),
                ('last_sent_at', models.DateTimeField(blank=True, null=True, verbose_name='Paskutinio siuntimo data')),
                ('sent_count', models.IntegerField(default=0, validators=[django.core.validators.MinValueValidator(0)], verbose_name='Siuntimų skaičius')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Sukurta')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atnaujinta')),
                ('invoice', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reminders', to='invoices.salesinvoice', verbose_name='Sąskaita')),
            ],
            options={
                'verbose_name': 'Sąskaitos priminimas',
                'verbose_name_plural': 'Sąskaitų priminimai',
                'db_table': 'invoice_reminders',
            },
        ),
        migrations.AddIndex(
            model_name='invoicereminder',
            index=models.Index(fields=['invoice', 'reminder_type'], name='invoice_rem_invoice_123456_idx'),
        ),
        migrations.AddIndex(
            model_name='invoicereminder',
            index=models.Index(fields=['last_sent_at'], name='invoice_rem_last_se_123456_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='invoicereminder',
            unique_together={('invoice', 'reminder_type')},
        ),
    ]

