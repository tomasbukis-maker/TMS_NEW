#!/bin/bash
# TMS lokalus paleidimas: backend (port 8000) + frontend (port 3000)
# Naudojimas: ./run_local.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BACKEND_PID=""
cleanup() {
  if [ -n "$BACKEND_PID" ]; then
    echo ""
    echo "Sustabdant backend (PID $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM

# 1. Backend
echo "=============================================="
echo "  TMS – lokalus paleidimas"
echo "=============================================="
echo "[1/2] Backend (Django) – port 8000..."

if lsof -i :8000 >/dev/null 2>&1; then
  echo "      Port 8000 jau užimtas – tikėtina, backend jau veikia."
else
  cd backend
  if [ ! -d "venv" ]; then
    echo "      Kuriamas venv ir diegiami paketai..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -q -r requirements.txt
  else
    source venv/bin/activate
  fi
  python manage.py runserver 0.0.0.0:8000 &
  BACKEND_PID=$!
  cd ..
  echo "      Backend paleistas (PID $BACKEND_PID). Laukiama 3 s..."
  sleep 3
fi

# 2. Frontend
echo "[2/2] Frontend (React) – port 3000..."
cd frontend
if [ ! -d "node_modules" ]; then
  echo "      Diegiami npm paketai..."
  npm install --legacy-peer-deps
fi
echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000  (atidaryk šį adresą naršyklėje)"
echo "  Sustabdyti: Ctrl+C"
echo "=============================================="
npm start
