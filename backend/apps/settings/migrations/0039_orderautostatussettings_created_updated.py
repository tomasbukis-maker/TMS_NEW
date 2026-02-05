# Generated manually: add created_at, updated_at to OrderAutoStatusSettings

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0038_add_order_auto_status_rules'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderautostatussettings',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AddField(
            model_name='orderautostatussettings',
            name='updated_at',
            field=models.DateTimeField(auto_now=True, null=True),
        ),
    ]
