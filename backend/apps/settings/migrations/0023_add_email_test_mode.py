# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0022_add_email_signature_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationsettings',
            name='email_test_mode',
            field=models.BooleanField(default=False, help_text='Jei įjungtas, visi automatiniai el. laiškai bus siunčiami į testavimo adresą, o ne tikriems gavėjams', verbose_name='Testavimo režimas'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='email_test_recipient',
            field=models.EmailField(blank=True, default='info@hotmail.lt', help_text='El. pašto adresas, į kurį bus siunčiami visi laiškai testavimo režime', max_length=255, verbose_name='Testavimo adresas'),
        ),
    ]

