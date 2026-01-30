from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0044_delete_orderstatushistory'),
        ('invoices', '0020_remove_salesinvoiceorder_unique_sales_invoice_order_and_more'),
        ('mail', '0004_rename_email_logs_email_t_created_idx_email_logs_email_t_6d62ae_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='mailmessage',
            name='matched_expeditions',
            field=models.ManyToManyField(
                blank=True,
                related_name='matched_mail_messages',
                to='orders.ordercarrier',
                verbose_name='Rastos ekspedicijos',
            ),
        ),
        migrations.AddField(
            model_name='mailmessage',
            name='matched_orders',
            field=models.ManyToManyField(
                blank=True,
                related_name='matched_mail_messages',
                to='orders.order',
                verbose_name='Rasti užsakymo įrašai',
            ),
        ),
        migrations.AddField(
            model_name='mailmessage',
            name='matched_purchase_invoices',
            field=models.ManyToManyField(
                blank=True,
                related_name='matched_mail_messages',
                to='invoices.purchaseinvoice',
                verbose_name='Rastos gaunamos sąskaitos',
            ),
        ),
        migrations.AddField(
            model_name='mailmessage',
            name='matched_sales_invoices',
            field=models.ManyToManyField(
                blank=True,
                related_name='matched_mail_messages',
                to='invoices.salesinvoice',
                verbose_name='Rastos pardavimo sąskaitos',
            ),
        ),
    ]

