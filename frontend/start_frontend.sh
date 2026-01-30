#!/bin/bash
# Frontend serverio paleidimo skriptas

cd "$(dirname "$0")"

echo "📦 Tikrinami dependencies..."

# Patikrinti, ar node_modules egzistuoja
if [ ! -d "node_modules" ]; then
    echo "❌ node_modules nerastas! Diegiami dependencies..."
    
    # Patikrinti, ar yra package-lock.json arba yarn.lock
    if [ -f "yarn.lock" ]; then
        echo "📦 Naudojamas Yarn..."
        yarn install
    else
        echo "📦 Naudojamas NPM..."
        npm install
    fi
else
    echo "✅ Dependencies įdiegti"
fi

echo "🚀 Paleidžiamas React development serveris..."
echo "📍 Serveris bus prieinamas: http://localhost:3000"
echo ""
echo "Sustabdyti serverį: Ctrl+C"
echo ""

# Paleisti development serverį
if [ -f "yarn.lock" ]; then
    yarn start
else
    npm start
fi

