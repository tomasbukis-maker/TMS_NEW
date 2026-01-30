#!/usr/bin/env python
"""
Scriptas pritaikyti email_notify_manager_invoices lauką per Django ORM
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
            # Patikrinti, ar laukas jau egzistuoja
            cursor.execute("SHOW COLUMNS FROM partners LIKE 'email_notify_manager_invoices'")
            if cursor.fetchone():
                print("Laukas jau egzistuoja, praleidžiama.")
                return
            
            print("Pridedamas email_notify_manager_invoices laukas...")
            
            # Pridėti lauką
            cursor.execute("""
                ALTER TABLE partners
                ADD COLUMN email_notify_manager_invoices BOOLEAN DEFAULT TRUE NOT NULL
            """)
            
            # Nustatyti numatytąsias reikšmes esamiems tiekėjams
            cursor.execute("""
                UPDATE partners
                SET email_notify_manager_invoices = TRUE
                WHERE is_supplier = TRUE
            """)
            
            print("✅ Laukas sėkmingai pridėtas!")
            
        except Exception as e:
            print(f"❌ Klaida: {e}")
            raise

if __name__ == '__main__':
    apply_migration()

