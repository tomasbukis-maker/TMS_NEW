"""
Django settings for tms_project project.
"""

from pathlib import Path
from datetime import timedelta
import os
from dotenv import load_dotenv

# MySQL with PyMySQL - turi būti prieš kitus imports
import pymysql
pymysql.install_as_MySQLdb()

load_dotenv()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/4.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-change-me-in-production')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DEBUG', 'True') == 'True'

# Leisti visus host'us - internal network
ALLOWED_HOSTS = ['*']  # Leidžiame visus IP adresus vidaus tinklui


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'apps.core',  # Core app for DB synchronization
    'apps.auth',
    'apps.partners',
    'apps.orders',
    'apps.invoices',
    'apps.expenses',  # Išlaidų sistema (atskirta nuo transporto)
    'apps.settings',
    'apps.dashboard',
    'apps.tools',
    'apps.mail',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'tms_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'tms_project.wsgi.application'


# Database
# https://docs.djangoproject.com/en/4.2/ref/settings/#databases

# Lokali DB (default) - naudojama visoms operacijoms
# Nuotolinė DB (replica) - sinchronizuojama automatiškai
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('DB_NAME_LOCAL', os.getenv('DB_NAME', 'tms_db_local')),
        'USER': os.getenv('DB_USER_LOCAL', 'tms_local'),
        'PASSWORD': os.getenv('DB_PASSWORD_LOCAL', ''),
        'HOST': os.getenv('DB_HOST_LOCAL', 'localhost'),
        'PORT': os.getenv('DB_PORT_LOCAL', '3307'),
        'OPTIONS': {
            'charset': 'utf8mb4',
            'init_command': "SET NAMES 'utf8mb4'; "
        },
    },
    'replica': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('DB_NAME_REMOTE', os.getenv('DB_NAME', 'lonalt_tms_db')),
        'USER': os.getenv('DB_USER_REMOTE', os.getenv('DB_USER', 'lonalt_tms_db')),
        'PASSWORD': os.getenv('DB_PASSWORD_REMOTE', os.getenv('DB_PASSWORD', 'w3vDZ5JWZxSUrgs9')),
        'HOST': os.getenv('DB_HOST_REMOTE', 'sykas.serveriai.lt'),
        'PORT': os.getenv('DB_PORT_REMOTE', '3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
            'init_command': "SET NAMES 'utf8mb4'; "
        },
    }
}

# Database router - nukreipia rašymą į default, sinchronizacija vyksta per signals
DATABASE_ROUTERS = ['apps.core.db_sync.DatabaseSyncRouter']


# Password validation
# https://docs.djangoproject.com/en/4.2/ref/settings/#password-validation

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/4.2/topics/i18n/
from django.utils.translation import gettext_lazy as _

LANGUAGE_CODE = 'lt'

TIME_ZONE = 'Europe/Vilnius'

USE_I18N = True

USE_TZ = True

LANGUAGES = [
    ('lt', _('Lithuanian')),
    ('en', _('English')),
    ('ru', _('Russian')),
]

LOCALE_PATHS = [
    BASE_DIR / 'locale',
]


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/4.2/howto/static-files/

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Mail attachments server path (optional)
# Jei nustatytas, priedai automatiškai kopijuojami ir į šį katalogą sinchronizacijos metu
# Jei None, priedai saugomi tik MEDIA_ROOT
ATTACHMENTS_SERVER_PATH = os.environ.get('ATTACHMENTS_SERVER_PATH', None)

# Server attachments path for syncing missing attachments (optional)
# Lokaliame TMS: nurodykite serverio katalogą iš kur kopijuoti trūkstamus priedus
# Pvz.: '/var/www/tms/media/mail_attachments' (jei mount'intas) arba 'tomas@192.168.9.26:/var/www/tms/media/mail_attachments' (SSH)
SERVER_ATTACHMENTS_PATH = os.environ.get('SERVER_ATTACHMENTS_PATH', None)
SERVER_SSH_PATH = os.environ.get('SERVER_SSH_PATH', None)  # SSH kelias, pvz.: 'tomas@192.168.9.26:/var/www/tms/media'

# External URLs
FRONTEND_BASE_URL = os.environ.get('FRONTEND_BASE_URL', '')

# Default primary key field type
# https://docs.djangoproject.com/en/4.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Custom User Model
AUTH_USER_MODEL = 'tms_auth.User'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 1000,
    'DEFAULT_FILTER_BACKENDS': [
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
}

# JWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# CSRF Settings - leisti visus origins vidaus tinklui
# Su ALLOWED_HOSTS=['*'], tuščias CSRF_TRUSTED_ORIGINS leidžia visus origins
CSRF_TRUSTED_ORIGINS = []

# CSRF Cookie settings - neapriboti domenu, kad veiktų su visais IP
CSRF_COOKIE_DOMAIN = None
# HTTPS palaikymas - jei naudojamas HTTPS (nginx proxy), bus automatiškai TRUE
CSRF_COOKIE_SECURE = os.getenv('CSRF_COOKIE_SECURE', 'False').lower() == 'true'
CSRF_COOKIE_HTTPONLY = False
CSRF_USE_SESSIONS = False

# Session Cookie settings - kad veiktų su visais IP adresais
SESSION_COOKIE_DOMAIN = None
# HTTPS palaikymas - jei naudojamas HTTPS (nginx proxy), bus automatiškai TRUE
SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'False').lower() == 'true'
SESSION_COOKIE_HTTPONLY = True

# Reverse Proxy Settings - kad Django suprastų, kad naudoja reverse proxy
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# HTTPS support (jei nginx proxy naudoja HTTPS)
# SECURE_PROXY_SSL_HEADER leidžia Django detekti HTTPS per proxy
# Nginx automatiškai prideda X-Forwarded-Proto header, todėl Django gali atpažinti HTTPS
if os.getenv('USE_HTTPS', 'False').lower() == 'true':
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
else:
    # HTTP režimas - nenaudosime SSL header
    SECURE_PROXY_SSL_HEADER = None

# CORS Settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.9.11:3000",
    "http://192.168.9.26",
    "https://192.168.9.26",
]

# Development mode - allow all origins (be careful in production!)
# For production, we still allow all origins since it's internal network
CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_CREDENTIALS = True

# Email Settings
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER)

# Local settings override
try:
    from .local_settings import *
except ImportError:
    pass


# CSRF Cookie settings - neapriboti domenu, kad veiktų su visais IP
CSRF_COOKIE_DOMAIN = None
# HTTPS palaikymas - jei naudojamas HTTPS (nginx proxy), bus automatiškai TRUE
CSRF_COOKIE_SECURE = os.getenv('CSRF_COOKIE_SECURE', 'False').lower() == 'true'
CSRF_COOKIE_HTTPONLY = False
CSRF_USE_SESSIONS = False

# Session Cookie settings - kad veiktų su visais IP adresais
SESSION_COOKIE_DOMAIN = None
# HTTPS palaikymas - jei naudojamas HTTPS (nginx proxy), bus automatiškai TRUE
SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'False').lower() == 'true'
SESSION_COOKIE_HTTPONLY = True

# Reverse Proxy Settings - kad Django suprastų, kad naudoja reverse proxy
USE_X_FORWARDED_HOST = True
USE_X_FORWARDED_PORT = True

# HTTPS support (jei nginx proxy naudoja HTTPS)
# SECURE_PROXY_SSL_HEADER leidžia Django detekti HTTPS per proxy
# Nginx automatiškai prideda X-Forwarded-Proto header, todėl Django gali atpažinti HTTPS
if os.getenv('USE_HTTPS', 'False').lower() == 'true':
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
else:
    # HTTP režimas - nenaudosime SSL header
    SECURE_PROXY_SSL_HEADER = None

# CORS Settings
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.9.11:3000",
    "http://192.168.9.26",
    "https://192.168.9.26",
]

# Development mode - allow all origins (be careful in production!)
# For production, we still allow all origins since it's internal network
CORS_ALLOW_ALL_ORIGINS = True

CORS_ALLOW_CREDENTIALS = True

# Email Settings
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER)

# Local settings override
try:
    from .local_settings import *
except ImportError:
    pass
