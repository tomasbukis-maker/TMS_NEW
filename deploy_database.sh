#!/bin/bash
# TMS Duomenų bazės sinchronizavimo skriptas (Local -> Server 100.112.219.50)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Tas pats serveris kaip deploy_to_server.sh
SERVER_HOST="100.112.219.50"
SERVER_USER="admin_ai"
export SSHPASS="${TMS_DEPLOY_PASS:-asdfghjkl_ai}"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
TEMP_DATA="backups/data_sync_$DATE.json"

echo "📂 Pradedama duomenų bazės sinchronizacija..."

# 1. Išeksportuoti vietinius duomenis
echo "📊 Eksportuojami vietiniai duomenys..."
mkdir -p backups
cd backend
source venv/bin/activate
# Fix: admin.LogEntry vietoj admin.log
python manage.py dumpdata --exclude auth.permission --exclude contenttypes --exclude admin.LogEntry --indent 2 > "../$TEMP_DATA"
EXIT_CODE=$?
cd ..

if [ $EXIT_CODE -eq 0 ] && [ -s "$TEMP_DATA" ]; then
    echo "✅ Duomenys paruošti: $TEMP_DATA ($(du -h "$TEMP_DATA" | cut -f1))"
else
    echo "❌ Klaida eksportuojant duomenis (failas tuščias arba įvyko klaida)!"
    exit 1
fi

# 2. Nusiųsti failą į serverį
echo "🚚 Siunčiama į serverį..."
sshpass -e scp -o StrictHostKeyChecking=no "$TEMP_DATA" "$SERVER_USER@$SERVER_HOST:/tmp/sync_data.json"

# 3. Įkelti duomenis serveryje
echo "⚙️  Atnaujinama duomenų bazės struktūra ir įkeliami duomenys..."
sshpass -e ssh -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" << 'EOF_SERVER'
cd /var/www/tms/backend
PY="/var/www/tms/backend/venv/bin/python"
# 1. Pirmiausia sutvarkome struktūrą
echo "🚀 Vykdomos migracijos..."
$PY manage.py migrate
# 2. Išvalome visą DB (flush), kad loaddata neįkeltų dublikatų
echo "🧹 Išvalome serverio duomenų bazę (bus įkelti lokalūs duomenys)..."
$PY manage.py flush --no-input
# 3. Įkeliame duomenis
echo "📥 Įkeliami duomenys..."
$PY manage.py loaddata /tmp/sync_data.json
rm -f /tmp/sync_data.json
echo "✅ Procesas serveryje baigtas!"
EOF_SERVER

echo ""
echo "🎉 Sinchronizacija baigta! Serveris dabar turi identiškus duomenis kaip ir jūsų lokalioje versijoje."
