#!/bin/bash
# Skriptas migracijos vykdymui serveryje

cd /var/www/tms/backend
source /var/www/tms/venv/bin/activate
python manage.py migrate settings

echo "Migracija baigta!"

