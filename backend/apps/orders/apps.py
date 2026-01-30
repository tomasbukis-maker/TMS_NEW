from django.apps import AppConfig


class OrdersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.orders'
    verbose_name = 'Užsakymai'

    def ready(self):
        # Importuoti signalus
        from . import signals  # noqa: F401
        from . import order_notifications  # noqa: F401


        # Importuoti signalus
        from . import signals  # noqa: F401


        # Importuoti signalus
        from . import signals  # noqa: F401


        # Importuoti signalus
        from . import signals  # noqa: F401


        # Importuoti signalus
        from . import signals  # noqa: F401


        # Importuoti signalus
        from . import signals  # noqa: F401

