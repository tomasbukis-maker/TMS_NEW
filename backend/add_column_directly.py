#!/usr/bin/env python3
"""
Skriptas, kuris pridės lauką tiesiogiai per SQL, jei Django nėra prieinamas
Reikia nustatyti duomenų bazės prisijungimo duomenis
"""
import sys

# Jei turite pymysql arba mysql-connector-python
try:
    import pymysql
    USE_PYMYSQL = True
except ImportError:
    try:
        import mysql.connector
        USE_PYMYSQL = False
    except ImportError:
        print("Reikia įdiegti pymysql arba mysql-connector-python")
        print("pip install pymysql")
        sys.exit(1)

# Duomenų bazės prisijungimo duomenys (pakeiskite pagal savo nustatymus)
DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3307,  # SSH tunelio portas
    'user': 'tms_user',
    'password': 'Tms2024!',
    'database': 'tms_db'
}

def add_column():
    """Pridėti lauką į duomenų bazę"""
    try:
        if USE_PYMYSQL:
            connection = pymysql.connect(**DB_CONFIG)
        else:
            connection = mysql.connector.connect(**DB_CONFIG)
        
        cursor = connection.cursor()
        
        # Patikrinti, ar laukas jau egzistuoja
        cursor.execute("""
            SELECT COUNT(*) 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = %s
            AND TABLE_NAME = 'notificationsettings'
            AND COLUMN_NAME = 'overdue_reminder_mode'
        """, (DB_CONFIG['database'],))
        
        exists = cursor.fetchone()[0]
        
        if exists == 0:
            # Pridėti lauką
            cursor.execute("""
                ALTER TABLE notificationsettings 
                ADD COLUMN overdue_reminder_mode VARCHAR(20) DEFAULT 'automatic' NOT NULL
            """)
            connection.commit()
            print("✓ Laukas sėkmingai pridėtas!")
        else:
            print("✓ Laukas jau egzistuoja.")
        
        cursor.close()
        connection.close()
        return True
        
    except Exception as e:
        print(f"✗ Klaida: {e}")
        return False

if __name__ == '__main__':
    print("Pridedamas overdue_reminder_mode laukas...")
    success = add_column()
    sys.exit(0 if success else 1)

