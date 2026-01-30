#!/bin/bash
# TMS Pilnos atsarginės kopijos kūrimo skriptas

# Nustatymai
BACKUP_DIR="backups"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
DB_BACKUP_NAME="tms_db_backup_$DATE.sql"
PROJECT_BACKUP_NAME="tms_full_backup_$DATE.tar.gz"

echo "📂 Pradedamas atsarginės kopijos kūrimas..."

# Sukurti atsarginių kopijų katalogą, jei nėra
mkdir -p "$BACKUP_DIR"

# 1. Duomenų bazės kopija
echo "🗄️  Kuriama duomenų bazės kopija (Django dumpdata)..."
cd backend
source venv/bin/activate
# Naudojame dumpdata, nes tai nepriklauso nuo DB draiverių naršyklėje
python manage.py dumpdata --exclude auth.permission --exclude contenttypes > "../$BACKUP_DIR/$DB_BACKUP_NAME.json"
cd ..

if [ $? -eq 0 ]; then
    echo "✅ Duomenų bazės kopija sėkmingai sukurta: $BACKUP_DIR/$DB_BACKUP_NAME.json"
else
    echo "❌ Klaida kuriant duomenų bazės kopiją!"
fi

# 2. Projekto failų kopija (be venv, node_modules ir .git)
echo "📦 Kuriama projekto failų archyvas..."
tar --exclude="backend/venv" \
    --exclude="frontend/node_modules" \
    --exclude=".git" \
    --exclude="$BACKUP_DIR" \
    -czf "$BACKUP_DIR/$PROJECT_BACKUP_NAME" .

if [ $? -eq 0 ]; then
    echo "✅ Projekto failų archyvas sėkmingai sukurtas: $BACKUP_DIR/$PROJECT_BACKUP_NAME"
else
    echo "❌ Klaida kuriant projekto archyvą!"
fi

echo ""
echo "🎉 Atsarginė kopija baigta!"
echo "📍 Failai rasti: $BACKUP_DIR/"
ls -lh "$BACKUP_DIR/"
