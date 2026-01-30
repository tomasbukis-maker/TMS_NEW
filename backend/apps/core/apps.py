from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'
    
    def ready(self):
        """Registruoti sinchronizacijos signals kai Django apps yra paruošti"""
        from apps.core.signals import register_sync_signals
        register_sync_signals()

