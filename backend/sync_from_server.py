#!/usr/bin/env python3
"""
Sinchronizacijos skriptas iš serverio DB į lokalų DB.
Serverio duomenys turi viršenybę - jei yra konfliktų, serverio duomenys perrašys lokalius.

PIRMA padaro atsarginę kopiją lokalios DB, tada sinchronizuoja duomenis.
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

# Lentelės, kurias reikia sinchronizuoti (prioritetas)
# SVARBU: Sinchronizacija vyksta prioriteto tvarka - pirmiausia Partner, tada Order, tada Invoice
# Formatas: (table_name, pk_field_name)
SYNC_TABLES = [
    # 1. Partneriai (pirmiausia, nes kiti modeliai nuo jų priklauso)
    ('partners', 'id'),
    ('contacts', 'id'),
    # 2. Užsakymai
    ('orders', 'id'),
    ('order_carriers', 'id'),
    ('cargo_items', 'id'),
    ('order_costs', 'id'),
    # 3. Sąskaitos (priklauso nuo Partner ir Order)
    ('sales_invoices', 'id'),
    ('sales_invoice_orders', 'id'),  # ManyToMany tarp SalesInvoice ir Order
    ('expense_invoices', 'id'),  # PurchaseInvoice
    ('purchase_invoices_related_orders', 'id'),  # ManyToMany
]


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
    
    # 3. Sinchronizuoti modelius
    total_synced = 0

    try:
        for table_name, pk_field in SYNC_TABLES:
            synced = sync_table(server_conn, local_conn, table_name, pk_field)
            total_synced += synced

        # 4. Atnaujinti legacy datas iš route stops
        legacy_updated = update_legacy_dates_from_route_stops()

        logger.info("=" * 60)
        logger.info(f"✅ Sinchronizacija baigta!")
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
    main()
