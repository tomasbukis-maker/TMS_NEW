# Local settings for development - overrides production settings
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(os.path.join(BASE_DIR, '.env'))

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('DB_NAME_LOCAL', 'tms_db_local'),
        'USER': os.getenv('DB_USER_LOCAL', 'tms_local'),
        'PASSWORD': os.getenv('DB_PASSWORD_LOCAL', 'tms_password_2025'),
        'HOST': os.getenv('DB_HOST_LOCAL', 'localhost'),
        'PORT': os.getenv('DB_PORT_LOCAL', '3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
            'init_command': "SET NAMES 'utf8mb4'; "
        },
    }
}

DEBUG = True
SECRET_KEY = 'django-insecure-local-dev-key-change-in-production'
ALLOWED_HOSTS = ['*']
CORS_ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
DATABASE_ROUTERS = [] # Disable synchronization for local development
