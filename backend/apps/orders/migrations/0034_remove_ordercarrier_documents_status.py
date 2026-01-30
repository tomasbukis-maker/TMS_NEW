from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0033_ordercarrierdocument_numbers'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='ordercarrier',
            name='documents_status',
        ),
    ]

