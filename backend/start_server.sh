#!/bin/bash
# Backend serverio paleidimo skriptas

cd "$(dirname "$0")"

# Patikrinti, ar virtual environment egzistuoja
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment nerastas! Kuriamas naujas..."
    python3 -m venv venv
    source venv/bin/activate
    echo "📦 Diegiami dependencies..."
    pip install -r requirements.txt
else
    echo "✅ Virtual environment rastas"
    source venv/bin/activate
fi

# Patikrinti, ar Django įdiegtas
if ! python -c "import django" 2>/dev/null; then
    echo "❌ Django nerastas! Diegiami dependencies..."
    pip install -r requirements.txt
fi

# Patikrinti, ar reikia paleisti migrations
echo "🔍 Tikrinamos migracijos..."
python manage.py showmigrations --plan | grep "\[ \]" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "⚠️  Yra neapplied migrations. Paleidžiamos migracijos..."
    python manage.py migrate
else
    echo "✅ Visos migracijos pritaikytos"
fi

echo "🚀 Paleidžiamas Django serveris..."
echo "📍 Serveris bus prieinamas: http://localhost:8000"
echo ""
echo "Sustabdyti serverį: Ctrl+C"
echo ""
# Paleisti su 0.0.0.0, kad klausytų visų interfeisų (tai padeda su proxy)
python manage.py runserver 0.0.0.0:8000

