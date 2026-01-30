#!/usr/bin/env python
"""
Scriptas pritaikyti partner email_notify laukus per Django ORM
"""
import os
import sys
import django

# Nustatyti Django settings
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.settings')
django.setup()

from django.db import connection

def apply_migration():
    """Pritaikyti SQL pakeitimus"""
    with connection.cursor() as cursor:
        try:
            # Patikrinti, ar laukai jau egzistuoja
            cursor.execute("SHOW COLUMNS FROM partners LIKE 'email_notify_due_soon'")
            if cursor.fetchone():
                print("Laukai jau egzistuoja, praleidžiama.")
                return
            
            print("Pridedami email_notify laukai...")
            
            # Pridėti laukus
            cursor.execute("""
                ALTER TABLE partners
                ADD COLUMN email_notify_due_soon BOOLEAN DEFAULT TRUE NOT NULL
            """)
            
            cursor.execute("""
                ALTER TABLE partners
                ADD COLUMN email_notify_unpaid BOOLEAN DEFAULT TRUE NOT NULL
            """)
            
            cursor.execute("""
                ALTER TABLE partners
                ADD COLUMN email_notify_overdue BOOLEAN DEFAULT TRUE NOT NULL
            """)
            
            # Nustatyti numatytąsias reikšmes esamiems klientams
            cursor.execute("""
                UPDATE partners
                SET email_notify_due_soon = TRUE,
                    email_notify_unpaid = TRUE,
                    email_notify_overdue = TRUE
                WHERE is_client = TRUE
            """)
            
            print("✅ Laukai sėkmingai pridėti!")
            
        except Exception as e:
            print(f"❌ Klaida: {e}")
            raise

if __name__ == '__main__':
    apply_migration()

