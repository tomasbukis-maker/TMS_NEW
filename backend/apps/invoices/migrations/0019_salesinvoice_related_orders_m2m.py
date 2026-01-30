# Generated manually due to migration history conflicts

from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
from decimal import Decimal


class Migration(migrations.Migration):

    dependencies = [
        ('invoices', '0017_add_invoice_reminder'),
        ('orders', '0039_ordercarrier_payment_terms'),
    ]

    operations = [
        # 1. Create the intermediate model SalesInvoiceOrder
        migrations.CreateModel(
            name='SalesInvoiceOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount_net', models.DecimalField(
                    decimal_places=2,
                    default=Decimal('0.00'),
                    max_digits=10,
                    validators=[django.core.validators.MinValueValidator(Decimal('0.00'))],
                    verbose_name='Suma be PVM'
                )),
                ('amount_total', models.DecimalField(
                    decimal_places=2,
                    default=Decimal('0.00'),
                    max_digits=10,
                    validators=[django.core.validators.MinValueValidator(Decimal('0.00'))],
                    verbose_name='Suma su PVM'
                )),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Sukurta')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atnaujinta')),
                ('invoice', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='invoice_orders',
                    to='invoices.salesinvoice',
                    verbose_name='Sąskaita'
                )),
                ('order', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sales_invoice_links',
                    to='orders.order',
                    verbose_name='Užsakymas'
                )),
            ],
            options={
                'verbose_name': 'Sąskaitos užsakymo ryšys',
                'verbose_name_plural': 'Sąskaitų užsakymo ryšiai',
                'db_table': 'sales_invoice_orders',
            },
        ),
        
        # 2. Add indexes
        migrations.AddIndex(
            model_name='salesinvoiceorder',
            index=models.Index(fields=['invoice', 'order'], name='sales_invoice_orders_inv_ord_idx'),
        ),
        migrations.AddIndex(
            model_name='salesinvoiceorder',
            index=models.Index(fields=['order'], name='sales_invoice_orders_order_idx'),
        ),
        
        # 3. Add unique constraint
        migrations.AddConstraint(
            model_name='salesinvoiceorder',
            constraint=models.UniqueConstraint(fields=['invoice', 'order'], name='unique_sales_invoice_order'),
        ),
        
        # 4. Add ManyToMany field to SalesInvoice
        migrations.AddField(
            model_name='salesinvoice',
            name='related_orders',
            field=models.ManyToManyField(
                blank=True,
                related_name='sales_invoices_m2m',
                through='invoices.SalesInvoiceOrder',
                through_fields=('invoice', 'order'),
                to='orders.order',
                verbose_name='Susiję užsakymai (keli)'
            ),
        ),
    ]

