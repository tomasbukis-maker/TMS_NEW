from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0012_companyinfo_correspondence_address'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_enabled',
            field=models.BooleanField(default=False, help_text='Jei įjungta, sistema periodiškai tikrins pašto dėžutę per IMAP', verbose_name='Įjungti gaunamų laiškų sinchronizavimą'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_folder',
            field=models.CharField(default='INBOX', help_text='Kurį aplanką sinchronizuoti, pvz. INBOX', max_length=255, verbose_name='IMAP aplankas'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_host',
            field=models.CharField(blank=True, help_text='Pvz.: imap.serveris.lt', max_length=255, verbose_name='IMAP serveris'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_password',
            field=models.CharField(blank=True, help_text='Saugojamas užšifruotas', max_length=255, verbose_name='IMAP slaptažodis'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_port',
            field=models.IntegerField(default=993, help_text='Dažniausiai: 993 (SSL) arba 143 (STARTTLS)', validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(65535)], verbose_name='IMAP portas'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_use_ssl',
            field=models.BooleanField(default=True, help_text='Jei išjungta, bus bandoma naudoti paprastą prisijungimą arba STARTTLS', verbose_name='Naudoti SSL'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_use_starttls',
            field=models.BooleanField(default=False, help_text='Galima įjungti, jei serveris palaiko STARTTLS (naudojama kai SSL išjungtas)', verbose_name='Naudoti STARTTLS'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='imap_username',
            field=models.CharField(blank=True, max_length=255, verbose_name='IMAP naudotojas'),
        ),
    ]

