#!/bin/bash
# TMS: pilnas DB atnaujinimas iš serverio į lokalų (Server → Local)
# Naudoja SQL: mysqldump serveryje, mysql import lokaliai – pilna DB kopija be Django serializacijos.
#
# Tik importas (dumpas jau atsisiųstas): ./sync_db_from_server.sh import_only backups/sync_from_server_YYYY-MM-DD_HH-MM-SS.sql

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Įkelti .env (šaknyje arba backend/)
if [ -f .env ]; then set -a && . .env && set +a; fi
if [ -f backend/.env ]; then set -a && . backend/.env && set +a; fi

SERVER_HOST="100.112.219.50"
SERVER_USER="admin_ai"
export SSHPASS="${TMS_DEPLOY_PASS:-asdfghjkl_ai}"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
REMOTE_SQL="/tmp/tms_sync_dump.sql"
LOCAL_SQL="${1:-backups/sync_from_server_$DATE.sql}"
BACKUP_SQL="backups/local_before_sync_$DATE.sql"

DB_NAME="${DB_NAME_LOCAL:-tms_db_local}"
DB_USER="${DB_USER_LOCAL:-tms_local}"
DB_PASS="${DB_PASSWORD_LOCAL:-tms_password_2025}"
DB_HOST="${DB_HOST_LOCAL:-localhost}"
DB_PORT="${DB_PORT_LOCAL:-3306}"

IMPORT_ONLY=false
if [ "${1:-}" = "import_only" ]; then
  IMPORT_ONLY=true
  LOCAL_SQL="${2:-}"
  if [ -z "$LOCAL_SQL" ] || [ ! -f "$LOCAL_SQL" ]; then
    echo "Naudojimas: $0 import_only <path/to/dump.sql>"
    echo "Pvz.: $0 import_only backups/sync_from_server_2026-02-03_15-16-33.sql"
    exit 1
  fi
fi

echo "=============================================="
if $IMPORT_ONLY; then
  echo "📥 Tik importas (dumpas: $LOCAL_SQL)"
else
  echo "📥 Pilnas DB atnaujinimas (SQL): serveris → local"
fi
echo "=============================================="

mkdir -p backups

if ! $IMPORT_ONLY; then
LOCAL_SQL="backups/sync_from_server_$DATE.sql"

# 1. Serveryje: mysqldump (pilna DB į SQL)
echo ""
echo "[1/4] Serveryje: mysqldump..."
# Serveryje: mysqldump (numatytieji: tms_db_local, tms_local – jei kitokie, nustatyk SERVER_DB_* prieš paleidžiant)
sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "cd /var/www/tms/backend && mysqldump -h localhost -P 3306 -u tms_local -ptms_password_2025 --single-transaction --routines --triggers --add-drop-table tms_db_local > /tmp/tms_sync_dump.sql && ls -la /tmp/tms_sync_dump.sql"

# 2. Atsisiųsti SQL į lokalų
echo ""
echo "[2/4] Atsisiunčiama SQL į lokalų..."
sshpass -e scp -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST:$REMOTE_SQL" "$LOCAL_SQL"
sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "rm -f $REMOTE_SQL"

if [ ! -s "$LOCAL_SQL" ]; then
    echo "❌ Klaida: atsisiųstas SQL failas tuščias arba neegzistuoja."
    exit 1
fi
echo "✅ Failas: $LOCAL_SQL ($(du -h "$LOCAL_SQL" | cut -f1))"

# 3. Lokalioje: atsarginė kopija dabartinės DB (mysqldump)
echo ""
echo "[3/4] Lokalioje: atsarginė kopija (mysqldump) prieš perrašymą..."
if command -v mysqldump >/dev/null 2>&1; then
  mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" \
    --single-transaction --add-drop-table \
    "$DB_NAME" > "$BACKUP_SQL" 2>/dev/null && echo "✅ Atsarginė kopija: $BACKUP_SQL" || rm -f "$BACKUP_SQL"
else
  echo "⚠️  mysqldump nerastas – praleidžiame atsarginę kopiją."
fi
fi

# 4. Lokalioje: importuoti SQL (mysql) – išjungti FK tikrinimą importo metu
echo ""
echo "[4/4] Lokalioje: importuojami serverio duomenys (mysql)..."
if ! (
  echo "SET FOREIGN_KEY_CHECKS=0;"
  cat "$LOCAL_SQL"
  echo "SET FOREIGN_KEY_CHECKS=1;"
) | mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" 2>&1; then
  echo ""
  echo "❌ Importo klaida. Jei matote 'mysql_native_password cannot be loaded':"
  echo "   Lokalus MySQL 9.x neturi šio plėtinio. Pakeiskite vartotojo autentifikaciją (kaip root):"
  echo "   mysql -u root -p -e \"ALTER USER '${DB_USER}'@'localhost' IDENTIFIED WITH caching_sha2_password BY '${DB_PASS}'; FLUSH PRIVILEGES;\""
  echo "   Tada paleiskite tik importą: $0 import_only $LOCAL_SQL"
  exit 1
fi

echo ""
echo "=============================================="
echo "🎉 Pilnas DB atnaujinimas (SQL) baigtas."
echo "   Lokalus DB dabar atitinka serverio DB."
echo "   Serverio dump: $LOCAL_SQL"
echo "   Atsarginė kopija (jei sukurta): $BACKUP_SQL"
echo "=============================================="
