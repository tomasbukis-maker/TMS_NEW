#!/usr/bin/env python3
"""
Sukuria lokaliai trūkstamas lenteles pagal serverio schemą (SHOW CREATE TABLE).
Serverio DB per SSH tunelį: ssh -L 3307:localhost:3306 admin_ai@100.112.219.50

Paleisti: cd backend && python sync_missing_tables_from_server.py
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

SERVER_DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3307,
    'user': 'tms_local',
    'password': 'tms_password_2025',
    'database': 'tms_db_local',
}
LOCAL_DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'tms_local',
    'password': 'tms_password_2025',
    'database': 'tms_db_local',
}

# Lentelės, kurių serveryje yra, lokaliai trūksta (palyginus compare_local_server_db.py)
TABLES_TO_SYNC = ['document_templates', 'settings_costexpeditionsettings']


def get_connection(config):
    try:
        import pymysql
        return pymysql.connect(**config)
    except ImportError:
        import mysql.connector
        return mysql.connector.connect(**config)


def main():
    print("Prisijungiama prie serverio DB (3307)...")
    try:
        server_conn = get_connection(SERVER_DB_CONFIG)
    except Exception as e:
        print(f"  Klaida: {e}. Atidarykite SSH tunelį: ssh -L 3307:localhost:3306 admin_ai@100.112.219.50")
        return

    print("Prisijungiama prie lokalios DB (3306)...")
    try:
        local_conn = get_connection(LOCAL_DB_CONFIG)
    except Exception as e:
        print(f"  Klaida: {e}")
        server_conn.close()
        return

    server_cur = server_conn.cursor()
    local_cur = local_conn.cursor()

    for table in TABLES_TO_SYNC:
        # Ar serveryje yra lentelė
        server_cur.execute("SHOW TABLES LIKE %s", (table,))
        if not server_cur.fetchone():
            print(f"  Praleidžiama {table}: nėra serveryje")
            continue

        # Ar lokaliai jau yra
        local_cur.execute("SHOW TABLES LIKE %s", (table,))
        if local_cur.fetchone():
            print(f"  Praleidžiama {table}: jau yra lokaliai")
            continue

        # Gauti CREATE TABLE iš serverio
        server_cur.execute(f"SHOW CREATE TABLE `{table}`")
        row = server_cur.fetchone()
        if not row:
            continue
        create_sql = row[1]  # CREATE TABLE ...
        # Pakeisti į CREATE TABLE IF NOT EXISTS (kai kurie serveriai grąžina be IF NOT EXISTS)
        if "CREATE TABLE " in create_sql and "IF NOT EXISTS" not in create_sql:
            create_sql = create_sql.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1)
        print(f"  Kuriama lokaliai: {table}")
        try:
            local_cur.execute(create_sql)
            local_conn.commit()
            print(f"    OK: {table}")
        except Exception as e:
            print(f"    Klaida: {e}")
            local_conn.rollback()

    server_cur.close()
    local_cur.close()
    server_conn.close()
    local_conn.close()
    print("Baigta.")


if __name__ == "__main__":
    main()
