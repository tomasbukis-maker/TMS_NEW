#!/usr/bin/env python3
"""
Vienintelis skriptas: lokalė = serveris (vienodi duomenys visur).
- Tik skaito iš serverio, serveryje nieko nenaikina.
- Pirmiausia sukuria lokaliai trūkstamas lenteles (pagal serverio schemą).
- Tada sinchronizuoja visas lenteles: serverio duomenys perrašo lokalius.
Reikia SSH tunelio: ssh -L 3307:localhost:3306 admin_ai@100.112.219.50
"""

import os
import sys
import django
from pathlib import Path
from datetime import datetime
import json

# Nustatyti Django environment
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'tms_project.local_settings')
django.setup()

from django.core.management import call_command
from django.db import connections, transaction
from django.core import serializers
from io import StringIO
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Duomenų bazės nustatymai
# Serverio DB (per SSH tunelį 100.112.219.50:3307 -> 127.0.0.1:3307)
# Serveryje naudoja tuos pačius duomenis kaip ir lokaliame
SERVER_DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 3307,  # SSH tunelio portas (turi būti atidarytas prieš paleidžiant)
    'user': 'tms_local',
    'password': 'tms_password_2025',
    'database': 'tms_db_local'
}

# Lokali DB (iš local_settings.py)
LOCAL_DB_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'tms_local',
    'password': 'tms_password_2025',
    'database': 'tms_db_local'
}

# Lentelių sinchronizavimo tvarka (priklausomybės – pirmiausia pagrindai)
ORDER_FIRST = [
    'partners', 'contacts', 'orders', 'order_carriers', 'cargo_items', 'order_costs',
    'sales_invoices', 'sales_invoice_orders', 'expense_invoices', 'purchase_invoices_related_orders',
]


def get_all_server_tables(server_conn):
    """Grąžina visų lentelių pavadinimus serveryje."""
    cur = server_conn.cursor()
    cur.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s ORDER BY TABLE_NAME", (LOCAL_DB_CONFIG['database'],))
    tables = [row[0] for row in cur.fetchall()]
    cur.close()
    return tables


def get_pk_column(server_conn, table_name):
    """Grąžina PK stulpelio pavadinimą tik jei PK vienas stulpelis (sync_table reikia)."""
    cur = server_conn.cursor()
    cur.execute("""
        SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND CONSTRAINT_NAME = 'PRIMARY'
        ORDER BY ORDINAL_POSITION
    """, (LOCAL_DB_CONFIG['database'], table_name))
    rows = cur.fetchall()
    cur.close()
    if not rows or len(rows) > 1:
        return None
    return rows[0][0]


def compare_table(server_conn, local_conn, table_name, pk_field='id', where_clause=None):
    """
    Palygina lentelę tarp serverio ir lokalios DB.
    Grąžina (count_server, count_local, ids_only_server, ids_only_local).
    """
    where_sql = f" WHERE {where_clause}" if where_clause else ""
    try:
        sc = server_conn.cursor()
        lc = local_conn.cursor()
        sc.execute(f"SELECT `{pk_field}` FROM `{table_name}`{where_sql}")
        server_ids = {row[0] for row in sc.fetchall()}
        lc.execute(f"SELECT `{pk_field}` FROM `{table_name}`{where_sql}")
        local_ids = {row[0] for row in lc.fetchall()}
        sc.close()
        lc.close()
        only_server = server_ids - local_ids
        only_local = local_ids - server_ids
        return len(server_ids), len(local_ids), only_server, only_local
    except Exception as e:
        logger.warning(f"  Nepavyko lyginti {table_name}: {e}")
        return None, None, set(), set()


def run_compare(server_conn, local_conn):
    """
    Palygina užsakymų, sąskaitų ir klientų (partnerių) duomenis: serveris vs lokalė.
    Išveda skaičius ir ID, kurių yra tik serveryje arba tik lokaliai.
    """
    logger.info("=" * 60)
    logger.info("📊 PALYGINIMAS: Serverio DB vs Lokalė (užsakymai, sąskaitos, klientai)")
    logger.info("=" * 60)

    # Lentelės, kurioms lyginti (lentelė, PK, optional WHERE)
    tables_to_compare = [
        ("partners", "id", None),
        ("partners (klientai is_client=1)", "id", "is_client = 1"),
        ("orders", "id", None),
        ("sales_invoices", "id", None),
        ("purchase_invoices", "id", None),
    ]

    for item in tables_to_compare:
        if " (" in item[0]:
            table_name = item[0].split(" (")[0]
            where_clause = item[2]
        else:
            table_name = item[0]
            where_clause = item[2]
        pk_field = item[1]

        c_s, c_l, only_s, only_l = compare_table(server_conn, local_conn, table_name, pk_field, where_clause)
        if c_s is None:
            continue

        label = item[0]
        logger.info("")
        logger.info(f"  📋 {label}")
        logger.info(f"     Serveris: {c_s} įrašų")
        logger.info(f"     Lokalė:   {c_l} įrašų")
        if c_s != c_l:
            logger.info(f"     ⚠️  Skirtumas: {c_s - c_l:+d}")
        if only_s:
            sample = sorted(only_s)[:30]
            logger.info(f"     Tik serveryje (ID): {len(only_s)} vnt. Pvz.: {sample}")
        if only_l:
            sample = sorted(only_l)[:30]
            logger.info(f"     Tik lokaliai (ID):  {len(only_l)} vnt. Pvz.: {sample}")
        if c_s == c_l and not only_s and not only_l:
            logger.info(f"     ✅ Sutampa")

    logger.info("")
    logger.info("=" * 60)
    logger.info("Palyginimas baigtas. Naudokite sync_from_server.py be --compare, kad sinchronizuotumėte.")
    logger.info("=" * 60)


def ensure_local_tables_from_server(server_conn, local_conn):
    """Sukuria lokaliai trūkstamas lenteles pagal serverio schemą. Serveryje nieko nenaikina."""
    server_cur = server_conn.cursor()
    local_cur = local_conn.cursor()
    server_cur.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s", (LOCAL_DB_CONFIG['database'],))
    server_tables = {row[0] for row in server_cur.fetchall()}
    local_cur.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = %s", (LOCAL_DB_CONFIG['database'],))
    local_tables = {row[0] for row in local_cur.fetchall()}
    missing = server_tables - local_tables
    for table in sorted(missing):
        server_cur.execute(f"SHOW CREATE TABLE `{table}`")
        row = server_cur.fetchone()
        if not row:
            continue
        create_sql = row[1].replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1)
        try:
            local_cur.execute(create_sql)
            local_conn.commit()
            logger.info(f"  Sukurta lentelė lokaliai: {table}")
        except Exception as e:
            logger.warning(f"  Nepavyko sukurti {table}: {e}")
            local_conn.rollback()
    server_cur.close()
    local_cur.close()


def create_backup():
    """Sukurti atsarginę kopiją lokalios DB"""
    logger.info("📦 Kuriama atsarginė kopija lokalios DB...")
    
    backup_dir = BASE_DIR.parent / 'backups'
    backup_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    backup_file = backup_dir / f"local_db_backup_before_sync_{timestamp}.json"
    
    try:
        # Naudoti Django dumpdata
        output = StringIO()
        # Exclude tik tuos, kurie gali egzistuoti
        exclude_args = []
        
        # Patikrinti, ar app egzistuoja prieš exclude
        from django.apps import apps
        installed_apps = [app.label for app in apps.get_app_configs()]
        
        if 'contenttypes' in installed_apps:
            exclude_args.extend(['--exclude', 'contenttypes'])
        if 'auth' in installed_apps:
            exclude_args.extend(['--exclude', 'auth.permission'])
        if 'admin' in installed_apps:
            exclude_args.extend(['--exclude', 'admin.LogEntry'])
        
        call_command(
            'dumpdata',
            *exclude_args,
            '--indent', '2',
            stdout=output
        )
        
        backup_content = output.getvalue()
        
        with open(backup_file, 'w', encoding='utf-8') as f:
            f.write(backup_content)
        
        file_size = os.path.getsize(backup_file) / (1024 * 1024)  # MB
        logger.info(f"✅ Atsarginė kopija sėkmingai sukurta: {backup_file} ({file_size:.2f} MB)")
        return str(backup_file)
        
    except Exception as e:
        logger.error(f"❌ Klaida kuriant atsarginę kopiją: {e}")
        raise


def get_server_connection():
    """Gauti prisijungimą prie serverio DB"""
    try:
        import pymysql
        connection = pymysql.connect(**SERVER_DB_CONFIG)
        logger.info("✅ Prisijungta prie serverio DB")
        return connection
    except ImportError:
        try:
            import mysql.connector
            connection = mysql.connector.connect(**SERVER_DB_CONFIG)
            logger.info("✅ Prisijungta prie serverio DB")
            return connection
        except ImportError:
            logger.error("❌ Reikia įdiegti pymysql arba mysql-connector-python")
            logger.error("pip install pymysql")
            sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Nepavyko prisijungti prie serverio DB: {e}")
        logger.error("⚠️  Patikrinkite, ar SSH tunelis atidarytas: ssh -L 3307:localhost:3306 user@100.112.219.50")
        raise


def get_local_connection():
    """Gauti prisijungimą prie lokalios DB"""
    try:
        import pymysql
        connection = pymysql.connect(**LOCAL_DB_CONFIG)
        logger.info("✅ Prisijungta prie lokalios DB")
        return connection
    except ImportError:
        try:
            import mysql.connector
            connection = mysql.connector.connect(**LOCAL_DB_CONFIG)
            logger.info("✅ Prisijungta prie lokalios DB")
            return connection
        except ImportError:
            logger.error("❌ Reikia įdiegti pymysql arba mysql-connector-python")
            logger.error("pip install pymysql")
            sys.exit(1)
    except Exception as e:
        logger.error(f"❌ Nepavyko prisijungti prie lokalios DB: {e}")
        raise


def sync_table(server_conn, local_conn, table_name, pk_field='id'):
    """Sinchronizuoti konkretą lentelę iš serverio į lokalų DB"""
    try:
        # Patikrinti, ar lentelė egzistuoja abiejose DB
        server_cursor = server_conn.cursor()
        server_cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
        if not server_cursor.fetchone():
            logger.info(f"  ⏭️  Praleidžiama: {table_name} (nėra serveryje)")
            return 0
        
        local_cursor = local_conn.cursor()
        local_cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
        if not local_cursor.fetchone():
            logger.info(f"  ⏭️  Praleidžiama: {table_name} (nėra lokaliame - reikia migracijų)")
            return 0
        
        logger.info(f"📊 Sinchronizuojama: {table_name}...")
        
        # Gauti visus įrašus iš serverio
        server_cursor.execute(f"SELECT * FROM `{table_name}`")
        server_rows = server_cursor.fetchall()
        server_columns = [desc[0] for desc in server_cursor.description]
        
        if not server_rows:
            logger.info(f"  ℹ️  Serverio DB neturi įrašų ({table_name})")
            return 0
        
        # Gauti esamus ID iš lokalios DB
        local_cursor.execute(f"SELECT `{pk_field}` FROM `{table_name}`")
        local_ids = {row[0] for row in local_cursor.fetchall()}
        
        # Sukurti dict su serverio duomenimis
        server_data = {}
        for row in server_rows:
            row_dict = dict(zip(server_columns, row))
            pk_value = row_dict[pk_field]
            server_data[pk_value] = row_dict
        
        # Sinchronizuoti: pridėti naujus arba atnaujinti esamus
        inserted = 0
        updated = 0
        
        for pk_value, row_data in server_data.items():
            # Paruošti VALUES sąrašą (tik tuos stulpelius, kurie egzistuoja lokaliame)
            # Pirmiausia patikrinti, kokie stulpeliai egzistuoja lokaliame ir jų tipai
            local_cursor.execute(f"DESCRIBE `{table_name}`")
            local_column_info = {row[0]: row for row in local_cursor.fetchall()}  # (Field, Type, Null, Key, Default, Extra)
            
            # Filtruoti stulpelius - tik tuos, kurie egzistuoja abiejose DB
            columns = []
            values = []
            for col in server_columns:
                if col == pk_field:
                    continue
                if col not in local_column_info:
                    # Laukas nėra lokaliame - praleisti
                    continue
                
                # Gauti lauko informaciją
                col_info = local_column_info[col]
                col_null = col_info[2]  # Null: YES arba NO
                col_default = col_info[4]  # Default reikšmė
                
                # Gauti reikšmę iš serverio
                value = row_data.get(col)
                
                # Jei reikšmė yra None ir laukas neturi default reikšmės ir Null=NO
                if value is None and col_null == 'NO' and col_default is None:
                    # Nustatyti default reikšmę pagal lauko tipą
                    col_type = str(col_info[1]).upper()
                    if 'VARCHAR' in col_type or 'TEXT' in col_type or 'CHAR' in col_type:
                        value = ''  # Tuščias stringas
                    elif 'INT' in col_type:
                        value = 0
                    elif 'DECIMAL' in col_type or 'FLOAT' in col_type or 'DOUBLE' in col_type:
                        value = 0.0
                    elif 'DATE' in col_type or 'DATETIME' in col_type or 'TIMESTAMP' in col_type:
                        value = None  # Palikti NULL (gali būti problema, bet bandysime)
                    else:
                        value = None  # Palikti NULL
                
                columns.append(col)
                values.append(value)
            
            # Jei yra laukų lokaliame, kurių nėra serveryje ir jie yra required - nustatyti default
            for col, col_info in local_column_info.items():
                if col == pk_field:
                    continue
                if col not in server_columns:
                    # Laukas yra lokaliame, bet nėra serveryje
                    col_null = col_info[2]
                    col_default = col_info[4]
                    if col_null == 'NO' and col_default is None:
                        # Required laukas be default - nustatyti pagal tipą
                        col_type = str(col_info[1]).upper()
                        if 'VARCHAR' in col_type or 'TEXT' in col_type or 'CHAR' in col_type:
                            columns.append(col)
                            values.append('')
                        elif 'INT' in col_type:
                            columns.append(col)
                            values.append(0)
                        elif 'DECIMAL' in col_type or 'FLOAT' in col_type or 'DOUBLE' in col_type:
                            columns.append(col)
                            values.append(0.0)
                        # Kiti tipai paliekami (gali būti NULL arba turės default)
            
            if not columns:
                logger.warning(f"  ⚠️  Nėra bendrų stulpelių ({table_name})")
                continue
            placeholders = ', '.join(['%s'] * len(values))
            column_names = ', '.join([f"`{col}`" for col in columns])
            
            # Naudoti INSERT ... ON DUPLICATE KEY UPDATE (MySQL sintaksė)
            # Tai automatiškai tvarko ir naujus, ir esamus įrašus
            set_clause = ', '.join([f"`{col}` = VALUES(`{col}`)" for col in columns])
            insert_query = f"""
                INSERT INTO `{table_name}` (`{pk_field}`, {column_names})
                VALUES (%s, {placeholders})
                ON DUPLICATE KEY UPDATE {set_clause}
            """
            
            try:
                local_cursor.execute(insert_query, [pk_value] + values)
                if pk_value in local_ids:
                    updated += 1
                else:
                    inserted += 1
            except Exception as insert_error:
                # Jei ForeignKey constraint klaida - praleisti (priklauso nuo kitų lentelių)
                error_str = str(insert_error)
                if 'foreign key constraint' in error_str.lower():
                    logger.debug(f"  ⏭️  Praleidžiama {pk_value} ({table_name}): ForeignKey constraint")
                    continue
                elif 'duplicate entry' in error_str.lower():
                    # Jau egzistuoja - bandyti atnaujinti
                    try:
                        set_clause = ', '.join([f"`{col}` = %s" for col in columns])
                        update_query = f"""
                            UPDATE `{table_name}` 
                            SET {set_clause}
                            WHERE `{pk_field}` = %s
                        """
                        local_cursor.execute(update_query, values + [pk_value])
                        updated += 1
                    except:
                        logger.debug(f"  ⏭️  Praleidžiama {pk_value} ({table_name}): Duplicate")
                        continue
                else:
                    raise
        
        local_conn.commit()
        
        logger.info(f"  ✅ {table_name}: +{inserted} naujų, ~{updated} atnaujinta")
        return inserted + updated
        
    except Exception as e:
        logger.error(f"  ❌ Klaida sinchronizuojant {table_name}: {e}")
        local_conn.rollback()
        return 0


def sync_table_to_server(local_conn, server_conn, table_name, pk_field='id'):
    """Į serverį prideda tik tas eilutes, kurių serveryje dar nėra (skaito iš local). Serveryje nieko nenaikina."""
    try:
        local_cursor = local_conn.cursor()
        server_cursor = server_conn.cursor()
        server_cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
        if not server_cursor.fetchone():
            logger.info(f"  ⏭️  Praleidžiama: {table_name} (nėra serveryje)")
            return 0
        local_cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
        if not local_cursor.fetchone():
            return 0

        local_cursor.execute(f"SELECT * FROM `{table_name}`")
        local_rows = local_cursor.fetchall()
        local_columns = [desc[0] for desc in local_cursor.description]
        if not local_rows:
            return 0

        server_cursor.execute(f"SELECT `{pk_field}` FROM `{table_name}`")
        server_ids = {row[0] for row in server_cursor.fetchall()}
        server_cursor.execute(f"DESCRIBE `{table_name}`")
        server_cols = {row[0]: row for row in server_cursor.fetchall()}

        added = 0
        for row in local_rows:
            row_dict = dict(zip(local_columns, row))
            pk_value = row_dict.get(pk_field)
            if pk_value is None or pk_value in server_ids:
                continue
            columns = []
            values = []
            for col in local_columns:
                if col not in server_cols:
                    continue
                columns.append(col)
                values.append(row_dict[col])
            if not columns:
                continue
            placeholders = ', '.join(['%s'] * len(values))
            col_list = ', '.join([f"`{c}`" for c in columns])
            try:
                server_cursor.execute(
                    f"INSERT INTO `{table_name}` ({col_list}) VALUES ({placeholders})",
                    values
                )
                server_conn.commit()
                server_ids.add(pk_value)
                added += 1
            except Exception as e:
                server_conn.rollback()
                if 'foreign key' in str(e).lower() or 'duplicate' in str(e).lower():
                    continue
                raise
        if added:
            logger.info(f"  ✅ {table_name}: +{added} pridėta į serverį")
        return added
    except Exception as e:
        logger.error(f"  ❌ Klaida {table_name}: {e}")
        server_conn.rollback()
        return 0


def update_legacy_dates_from_route_stops():
    """Atnaujinti senos sistemos datas pagal RouteStop duomenis"""
    try:
        logger.info("🔄 Atnaujinami legacy loading_date ir unloading_date laukai pagal route stops...")

        # Naudoti tą pačią DB jungtį kaip ir kitos script'o dalys
        import pymysql

        local_conn = pymysql.connect(**LOCAL_DB_CONFIG)
        local_cursor = local_conn.cursor()

        # Rasti užsakymus su route stops bet be legacy datų
        local_cursor.execute("""
            SELECT o.id, o.order_number, rs_loading.date_from as loading_date, rs_unloading.date_from as unloading_date
            FROM orders o
            LEFT JOIN order_route_stops rs_loading ON o.id = rs_loading.order_id AND rs_loading.stop_type = 'loading'
            LEFT JOIN order_route_stops rs_unloading ON o.id = rs_unloading.order_id AND rs_unloading.stop_type = 'unloading'
            WHERE o.loading_date IS NULL
              AND o.unloading_date IS NULL
              AND (rs_loading.id IS NOT NULL OR rs_unloading.id IS NOT NULL)
        """)

        orders_to_update = local_cursor.fetchall()
        updated_count = 0

        for order_id, order_number, route_loading_date, route_unloading_date in orders_to_update:
            # Atnaujinti užsakymo datas
            update_fields = []
            update_values = []

            if route_loading_date:
                update_fields.append("loading_date = %s")
                update_values.append(route_loading_date)
            if route_unloading_date:
                update_fields.append("unloading_date = %s")
                update_values.append(route_unloading_date)

            if update_fields:
                update_query = f"UPDATE orders SET {', '.join(update_fields)} WHERE id = %s"
                update_values.append(order_id)

                local_cursor.execute(update_query, update_values)
                updated_count += 1
                logger.debug(f"  ✅ Atnaujintas {order_number}: loading={route_loading_date}, unloading={route_unloading_date}")

        local_conn.commit()
        local_conn.close()

        logger.info(f"✅ Atnaujinta {updated_count} užsakymų legacy datos iš route stops")
        return updated_count

    except Exception as e:
        logger.error(f"❌ Klaida atnaujinant legacy datas: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return 0


def main():
    """Pagrindinė sinchronizacijos funkcija"""
    logger.info("=" * 60)
    logger.info("🔄 Pradedama sinchronizacija iš serverio DB į lokalų DB")
    logger.info("=" * 60)
    
    # 1. Sukurti atsarginę kopiją
    backup_file = None
    try:
        backup_file = create_backup()
        if backup_file:
            logger.info(f"💾 Atsarginė kopija: {backup_file}")
    except Exception as e:
        logger.error(f"❌ Nepavyko sukurti atsarginės kopijos: {e}")
        logger.warning("⚠️  Tęsiame be atsarginės kopijos (nerekomenduojama)")
    
    # 2. Prisijungti prie DB
    try:
        server_conn = get_server_connection()
        local_conn = get_local_connection()
    except Exception as e:
        logger.error(f"❌ Nepavyko prisijungti prie DB: {e}")
        return
    
    try:
        # 3. Sukurti lokaliai trūkstamas lenteles (tik skaitome iš serverio)
        logger.info("📋 Tikrinamos lentelės – sukuriame trūkstamas lokaliai...")
        ensure_local_tables_from_server(server_conn, local_conn)

        # 4. Visų lentelių sąrašas ir PK – sinchronizuojame visas
        all_tables = get_all_server_tables(server_conn)
        table_pk = {}
        for t in all_tables:
            pk = get_pk_column(server_conn, t)
            if pk:
                table_pk[t] = pk
            else:
                logger.debug(f"  Praleidžiama {t}: nėra vieno stulpelio PK")

        # Tvarka: pirmiausia ORDER_FIRST, likusios abėcėlės tvarka
        order_first_set = set(ORDER_FIRST)
        sorted_tables = [t for t in ORDER_FIRST if t in table_pk] + sorted(t for t in table_pk if t not in order_first_set)

        total_synced = 0
        logger.info(f"📊 Sinchronizuojamos {len(sorted_tables)} lentelės...")
        for table_name in sorted_tables:
            pk_field = table_pk[table_name]
            synced = sync_table(server_conn, local_conn, table_name, pk_field)
            total_synced += synced

        legacy_updated = update_legacy_dates_from_route_stops()

        logger.info("=" * 60)
        logger.info("✅ Baigta – lokalė = serveris (vienodi duomenys).")
        logger.info(f"   Įrašų sinchronizuota: {total_synced}")
        logger.info(f"   Legacy datos atnaujintos: {legacy_updated}")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"❌ Klaida sinchronizuojant: {e}")
        local_conn.rollback()
    finally:
        server_conn.close()
        local_conn.close()
        logger.info("🔌 DB ryšiai uždaryti")


if __name__ == '__main__':
    to_server = '--to-server' in sys.argv
    if to_server:
        logger.info("=" * 60)
        logger.info("📤 Local → Server: pridedame į serverį tai, ko serveryje trūksta")
        logger.info("=" * 60)
        backup_file = None
        try:
            backup_file = create_backup()
            if backup_file:
                logger.info(f"💾 Atsarginė kopija: {backup_file}")
        except Exception as e:
            logger.warning(f"Atsarginė kopija: {e}")
        try:
            server_conn = get_server_connection()
            local_conn = get_local_connection()
        except Exception as e:
            logger.error(f"❌ Nepavyko prisijungti: {e}")
            sys.exit(1)
        try:
            all_tables = get_all_server_tables(server_conn)
            table_pk = {}
            for t in all_tables:
                pk = get_pk_column(server_conn, t)
                if pk:
                    table_pk[t] = pk
            order_first_set = set(ORDER_FIRST)
            sorted_tables = [t for t in ORDER_FIRST if t in table_pk] + sorted(t for t in table_pk if t not in order_first_set)
            total = 0
            for table_name in sorted_tables:
                total += sync_table_to_server(local_conn, server_conn, table_name, table_pk[table_name])
            logger.info("=" * 60)
            logger.info(f"✅ Baigta. Pridėta į serverį: {total} įrašų.")
            logger.info("=" * 60)
        finally:
            server_conn.close()
            local_conn.close()
            logger.info("🔌 DB ryšiai uždaryti")
    else:
        main()
