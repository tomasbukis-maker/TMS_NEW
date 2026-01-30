#!/usr/bin/env python3
"""
Skriptas, kuris pridės overdue_reminder_mode lauką tiesiogiai per SQL
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
from django.conf import settings

def add_column():
    """Pridėti lauką į duomenų bazę"""
    try:
        # Gauti duomenų bazės vardą iš settings
        db_name = settings.DATABASES['default']['NAME']
        print(f"Naudojama duomenų bazė: {db_name}")
        
        with connection.cursor() as cursor:
            # Patikrinti, ar laukas jau egzistuoja
            cursor.execute("""
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = %s
                AND TABLE_NAME = 'notificationsettings'
                AND COLUMN_NAME = 'overdue_reminder_mode'
            """, [db_name])
            exists = cursor.fetchone()[0]
            
            if exists == 0:
                # Pridėti lauką
                cursor.execute("""
                    ALTER TABLE notificationsettings 
                    ADD COLUMN overdue_reminder_mode VARCHAR(20) DEFAULT 'automatic' NOT NULL
                """)
                print("✓ Laukas sėkmingai pridėtas!")
            else:
                print("✓ Laukas jau egzistuoja.")
            
            # Fake'inti migraciją
            from django.db.migrations.recorder import MigrationRecorder
            recorder = MigrationRecorder(connection)
            try:
                recorder.record_applied('settings', '0027_notificationsettings_overdue_reminder_mode')
                print("✓ Migracija pažymėta kaip įvykdyta!")
            except Exception as e:
                print(f"⚠ Migracijos pažymėjimas nepavyko (bet laukas pridėtas): {e}")
            
            return True
            
    except Exception as e:
        print(f"✗ Klaida: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    print("Pridedamas overdue_reminder_mode laukas...")
    success = add_column()
    sys.exit(0 if success else 1)

