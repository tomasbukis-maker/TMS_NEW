# Generated manually

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('mail', '0002_alter_mailmessage_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='EmailLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email_type', models.CharField(choices=[('reminder', 'Priminimas'), ('order', 'Užsakymas'), ('invoice', 'Sąskaita'), ('expedition', 'Ekspedicija'), ('custom', 'Kitas')], max_length=32, verbose_name='Tipas')),
                ('subject', models.CharField(max_length=512, verbose_name='Tema')),
                ('recipient_email', models.CharField(max_length=255, verbose_name='Gavėjo el. paštas')),
                ('recipient_name', models.CharField(blank=True, max_length=255, verbose_name='Gavėjo vardas')),
                ('related_order_id', models.IntegerField(blank=True, null=True, verbose_name='Susietas užsakymas')),
                ('related_invoice_id', models.IntegerField(blank=True, null=True, verbose_name='Susieta sąskaita')),
                ('related_expedition_id', models.IntegerField(blank=True, null=True, verbose_name='Susieta ekspedicija')),
                ('related_partner_id', models.IntegerField(blank=True, null=True, verbose_name='Susietas partneris')),
                ('status', models.CharField(choices=[('pending', 'Laukiama'), ('sent', 'Išsiųsta'), ('failed', 'Klaida')], default='pending', max_length=32, verbose_name='Būsena')),
                ('sent_at', models.DateTimeField(blank=True, null=True, verbose_name='Išsiųsta')),
                ('error_message', models.TextField(blank=True, verbose_name='Klaidos pranešimas')),
                ('body_text', models.TextField(blank=True, verbose_name='Turinys (tekstas)')),
                ('body_html', models.TextField(blank=True, verbose_name='Turinys (HTML)')),
                ('metadata', models.JSONField(blank=True, default=dict, verbose_name='Papildoma informacija')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Sukurta')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Atnaujinta')),
                ('sent_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sent_emails', to=settings.AUTH_USER_MODEL, verbose_name='Išsiuntė')),
            ],
            options={
                'verbose_name': 'El. laiškų istorija',
                'verbose_name_plural': 'El. laiškų istorija',
                'db_table': 'email_logs',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='emaillog',
            index=models.Index(fields=['email_type', '-created_at'], name='email_logs_email_t_created_idx'),
        ),
        migrations.AddIndex(
            model_name='emaillog',
            index=models.Index(fields=['related_order_id'], name='email_logs_related_order_idx'),
        ),
        migrations.AddIndex(
            model_name='emaillog',
            index=models.Index(fields=['related_invoice_id'], name='email_logs_related_invoice_idx'),
        ),
        migrations.AddIndex(
            model_name='emaillog',
            index=models.Index(fields=['status', '-created_at'], name='email_logs_status_created_idx'),
        ),
    ]

