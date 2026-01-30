# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('settings', '0021_emailtemplate'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationsettings',
            name='email_signature',
            field=models.CharField(default='TMS Sistema', help_text='Pasirašymas, kuris bus naudojamas el. laiškuose (pvz.: "Loglena, UAB - TMS Sistema")', max_length=255, verbose_name='El. laiškų pasirašymas'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='email_auto_generated_notice',
            field=models.TextField(default='Šis laiškas sugeneruotas automatiškai. Į jį atsakyti nereikia.', help_text='Pranešimas, kuris bus pridėtas į automatiškai sugeneruotus el. laiškus', verbose_name='Pranešimas apie automatinį generavimą'),
        ),
        migrations.AddField(
            model_name='notificationsettings',
            name='email_contact_manager_notice',
            field=models.TextField(default='Kilus neaiškumams kreipkitės į vadybininką.', help_text='Pranešimas apie vadybininką, kuris bus pridėtas į el. laiškus (vadybininkas bus nustatomas pagal užsakymą/sąskaitą)', verbose_name='Pranešimas apie vadybininką'),
        ),
    ]

