from django.apps import AppConfig


class AuthConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.auth'
    label = 'tms_auth'  # Unikalus label, kad nesidubliuotų su django.contrib.auth
    verbose_name = 'Autentifikacija'

