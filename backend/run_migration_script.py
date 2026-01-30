#!/usr/bin/env python3
"""
Skriptas, kuris vykdo migraciją tiesiogiai per Django ORM
"""
import os
import sys
import django

# Nustatyti Django settings
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')

try:
    django.setup()
except Exception as e:
    print(f"Klaida nustatant Django: {e}")
    sys.exit(1)

from django.db import connection
from django.core.management import call_command

def run_migration():
    """Vykdyti migraciją"""
    try:
        print("Vykdoma migracija...")
        call_command('migrate', 'settings', verbosity=2)
        print("Migracija sėkmingai įvykdyta!")
        return True
    except Exception as e:
        print(f"Klaida vykdant migraciją: {e}")
        # Jei migracija nepavyko, bandyti pridėti lauką tiesiogiai per SQL
        try:
            print("\nBandoma pridėti lauką tiesiogiai per SQL...")
            with connection.cursor() as cursor:
                # Patikrinti, ar laukas jau egzistuoja
                cursor.execute("""
                    SELECT COUNT(*) 
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'notificationsettings'
                    AND COLUMN_NAME = 'overdue_reminder_mode'
                """)
                exists = cursor.fetchone()[0]
                
                if exists == 0:
                    cursor.execute("""
                        ALTER TABLE notificationsettings 
                        ADD COLUMN overdue_reminder_mode VARCHAR(20) DEFAULT 'automatic' NOT NULL
                    """)
                    print("Laukas sėkmingai pridėtas per SQL!")
                    return True
                else:
                    print("Laukas jau egzistuoja.")
                    return True
        except Exception as sql_error:
            print(f"Klaida vykdant SQL: {sql_error}")
            return False

if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)

