from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0013_notificationsettings_imap_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_sync_interval_minutes',
            field=models.IntegerField(
                default=5,
                help_text='Kas kiek minučių foniniu režimu sinchronizuoti IMAP (1–1440 minučių)',
                validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(1440)],
                verbose_name='IMAP sinchronizavimo intervalas (minutės)'
            ),
        ),
    ]


