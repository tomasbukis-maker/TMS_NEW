from django.db import models
from django.conf import settings


class BlockedDomain(models.Model):
    """Modelis užblokuotiems domenams saugoti."""

    domain = models.CharField(
        max_length=255,
        unique=True,
        verbose_name='Domenas',
        help_text='Domenas, kurio laiškai bus slepiami (pvz.: gmail.com, yahoo.com)'
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Sukurtas'
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Atnaujintas'
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        verbose_name='Sukūrė'
    )

    class Meta:
        ordering = ['domain']
        verbose_name = 'Užblokuotas domenas'
        verbose_name_plural = 'Užblokuoti domenai'

    def __str__(self):
        return self.domain

    def delete_emails_from_domain(self):
        """Ištrinti visus laiškus iš šio domeno."""
        from apps.mail.models import MailMessage
        import re

        # Filtruoti laiškus, kurių siuntėjo adresas baigiasi @domain arba turi @domain viduje <>
        deleted_count = MailMessage.objects.filter(
            sender__regex=fr'@{re.escape(self.domain)}(\s*>|\s*$)'
        ).delete()[0]
        return deleted_count


class TrustedSender(models.Model):
    """Modelis patikimiems siuntėjams saugoti (kurie nėra reklama)."""

    email = models.EmailField(
        unique=True,
        verbose_name='El. pašto adresas',
        help_text='Siuntėjo el. pašto adresas, kuris nėra laikomas reklaminiu'
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Sukurtas'
    )

    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Atnaujintas'
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        verbose_name='Sukūrė'
    )

    class Meta:
        ordering = ['email']
        verbose_name = 'Patikimas siuntėjas'
        verbose_name_plural = 'Patikimi siuntėjai'

    def __str__(self):
        return self.email