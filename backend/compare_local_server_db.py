#!/usr/bin/env python3
"""
Palygina lokalų ir serverio DB: lentelių sąrašą ir eilučių skaičių.
Serverio DB pasiekiama per SSH tunelį: ssh -L 3307:localhost:3306 admin_ai@100.112.219.50

Paleisti: cd backend && python compare_local_server_db.py
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Tas pats config kaip sync_from_server.py
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


def get_connection(config):
    try:
        import pymysql
        return pymysql.connect(**config)
    except ImportError:
        import mysql.connector
        return mysql.connector.connect(**config)


def get_tables_and_counts(conn, db_name):
    """Grąžina dict: table_name -> row_count."""
    cur = conn.cursor()
    cur.execute("SHOW TABLES")
    tables = [row[0] for row in cur.fetchall()]
    counts = {}
    for table in tables:
        try:
            cur.execute(f"SELECT COUNT(*) FROM `{table}`")
            counts[table] = cur.fetchone()[0]
        except Exception as e:
            counts[table] = f"ERR: {e}"
    cur.close()
    return counts


def main():
    print("Prisijungiama prie lokalios DB (localhost:3306)...")
    try:
        local_conn = get_connection(LOCAL_DB_CONFIG)
        local_counts = get_tables_and_counts(local_conn, LOCAL_DB_CONFIG['database'])
        local_conn.close()
        print(f"  Lokalioje lentelių: {len(local_counts)}")
    except Exception as e:
        print(f"  Klaida: {e}")
        print("  Patikrinkite, ar lokalus MySQL veikia ir .env/local_settings atitinka.")
        return

    print("Prisijungiama prie serverio DB (127.0.0.1:3307 per SSH tunelį)...")
    try:
        server_conn = get_connection(SERVER_DB_CONFIG)
        server_counts = get_tables_and_counts(server_conn, SERVER_DB_CONFIG['database'])
        server_conn.close()
        print(f"  Serveryje lentelių: {len(server_counts)}")
    except Exception as e:
        print(f"  Klaida: {e}")
        print("  Atidarykite SSH tunelį: ssh -L 3307:localhost:3306 admin_ai@100.112.219.50")
        return

    all_tables = sorted(set(local_counts) | set(server_counts))
    only_local = [t for t in all_tables if t not in server_counts]
    only_server = [t for t in all_tables if t not in local_counts]
    in_both = [t for t in all_tables if t in local_counts and t in server_counts]

    diff_count = []
    for t in in_both:
        lc, sc = local_counts[t], server_counts[t]
        if lc != sc:
            diff_count.append((t, lc, sc))

    print()
    print("=" * 60)
    print("SKIRTUMAI (local vs server)")
    print("=" * 60)

    if only_local:
        print("\nLentelės tik lokaliai (nėra serveryje):")
        for t in only_local:
            print(f"  - {t}  (lokaliai eilučių: {local_counts[t]})")

    if only_server:
        print("\nLentelės tik serveryje (nėra lokaliai):")
        for t in only_server:
            print(f"  - {t}  (serveryje eilučių: {server_counts[t]})")

    if diff_count:
        print("\nLentelės su skirtingu eilučių skaičiumi (local | server):")
        for t, lc, sc in diff_count:
            print(f"  - {t}:  {lc}  |  {sc}")

    if not only_local and not only_server and not diff_count:
        print("\nLentelių sąrašas sutampa; visų lentelių eilučių skaičius vienodas.")
    else:
        total_local = sum(c for c in local_counts.values() if isinstance(c, int))
        total_server = sum(c for c in server_counts.values() if isinstance(c, int))
        print(f"\nIš viso eilučių: lokalė {total_local}, serveris {total_server}")

    print()


if __name__ == "__main__":
    main()
