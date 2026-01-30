from django.apps import AppConfig


class InvoicesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.invoices'
    verbose_name = 'Sąskaitos'
    
    def ready(self):
        """Užregistruoti signal'us"""
        import apps.invoices.signals  # noqa

