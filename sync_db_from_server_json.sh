#!/bin/bash
# TMS: duomenų bazė iš serverio į lokalų per Django dumpdata/loaddata (JSON)
# Nereikia MySQL importo – tinka kai lokaliai MySQL 9 auth klaida arba SQLite.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SERVER_HOST="100.112.219.50"
SERVER_USER="admin_ai"
export SSHPASS="${TMS_DEPLOY_PASS:-asdfghjkl_ai}"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
TEMP_JSON="backups/sync_from_server_$DATE.json"

echo "=============================================="
echo "  Duomenų bazė: SERVERIS → LOKALUS (JSON)"
echo "=============================================="

mkdir -p backups

# 1. Serveryje: dumpdata
echo ""
echo "[1/3] Serveryje: eksportuojami duomenys..."
sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "cd /var/www/tms/backend && ./venv/bin/python manage.py dumpdata --exclude auth.permission --exclude contenttypes --exclude admin.LogEntry --indent 2 -o /tmp/sync_from_server.json && echo OK"

# 2. Atsisiųsti JSON
echo ""
echo "[2/3] Atsisiunčiama į lokalų..."
sshpass -e scp -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST:/tmp/sync_from_server.json" "$TEMP_JSON"
sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "rm -f /tmp/sync_from_server.json"

if [ ! -s "$TEMP_JSON" ]; then
  echo "❌ Atsisiųstas failas tuščias arba neegzistuoja."
  exit 1
fi
SIZE=$(du -h "$TEMP_JSON" | cut -f1)
echo "✅ $TEMP_JSON - $SIZE"

# 3. Lokaliai: migrate, flush, loaddata
echo ""
echo "[3/3] Lokaliai: migracijos, flush, loaddata..."
cd backend
source venv/bin/activate
python manage.py migrate --no-input
python manage.py flush --no-input
python manage.py loaddata "../$TEMP_JSON"
cd ..

echo ""
echo "=============================================="
echo "Duomenu baze sinchronizuota: serveris -> local."
echo "   Failas: $TEMP_JSON"
echo "=============================================="
