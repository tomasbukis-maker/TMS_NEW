#!/bin/bash
# TMS Duomenų bazės sinchronizavimo skriptas (Local -> Server)

# Nustatymai
SSH_HOST="192.168.9.26"
SSH_USER="tomas"
export SSHPASS="asdfghjkl"
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
sshpass -e scp -o StrictHostKeyChecking=no "$TEMP_DATA" "$SSH_USER@$SSH_HOST:/tmp/sync_data.json"

# 3. Įkelti duomenis serveryje
echo "⚙️  Atnaujinama duomenų bazės struktūra ir įkeliami duomenys..."
sshpass -e ssh -o StrictHostKeyChecking=no "$SSH_USER@$SSH_HOST" << 'EOF_SERVER'
cd /var/www/tms/backend
source venv/bin/activate
# 1. Pirmiausia sutvarkome struktūrą
echo "🚀 Vykdomos migracijos..."
python manage.py migrate
# 2. Įkeliame duomenis
echo "📥 Įkeliami duomenys..."
python manage.py loaddata /tmp/sync_data.json
rm /tmp/sync_data.json
echo "✅ Procesas serveryje baigtas!"
EOF_SERVER

echo ""
echo "🎉 Sinchronizacija baigta! Serveris dabar turi identiškus duomenis kaip ir jūsų lokalioje versijoje."
