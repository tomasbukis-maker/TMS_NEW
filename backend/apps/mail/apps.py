from django.apps import AppConfig


class MailConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.mail'
    verbose_name = 'Pašto modulis'

    def ready(self):
        from .services import start_mail_sync_scheduler
        from . import signals_NEW  # noqa: F401

        start_mail_sync_scheduler()

