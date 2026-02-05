#!/bin/bash
# TMS deployment: local -> server 100.112.219.50
# Naudojimas: ./deploy_to_server.sh
# Reikia: sshpass, ssh prieiga prie admin_ai@100.112.219.50

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SERVER_USER="admin_ai"
SERVER_HOST="100.112.219.50"
SERVER_TMS="/var/www/tms"
REMOTE_TMP="/tmp/tms_deploy"
# Slaptažodis: admin_ai@100.112.219.50
DEPLOY_PASS="${TMS_DEPLOY_PASS:-asdfghjkl_ai}"

echo "=============================================="
echo "  TMS Deployment: LOCAL -> SERVER"
echo "=============================================="

# 1. Lokaliai: build frontend (kad CSS/JS būtų pilni; CI=false kad įspėjimai neblokuotų)
echo "[1/5] Building frontend locally..."
cd frontend
if [ ! -d "node_modules" ]; then
  npm install --legacy-peer-deps
fi
CI=false npm run build
cd ..
echo "     OK: frontend/build ready"

# 2. Sukurti deployment archyvą (be venv, node_modules, media, backups)
echo "[2/5] Creating deployment package..."
DEPLOY_ARCHIVE="tms_deploy_$(date +%Y%m%d_%H%M%S).tar.gz"
rm -f tms_deploy_*.tar.gz 2>/dev/null || true

# macOS: neįtraukti extended attributes į archyvą (kad serverio tar nešvaistytų įspėjimų)
export COPYFILE_DISABLE=1 2>/dev/null || true
tar -czf "$DEPLOY_ARCHIVE" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.env' \
  --exclude='backups' \
  --exclude='logs' \
  --exclude='*.log' \
  --exclude='media' \
  --exclude='*.sqlite3' \
  backend \
  frontend/build \
  frontend/package.json \
  frontend/public \
  frontend/src \
  frontend/tsconfig.json \
  frontend/.gitignore \
  2>/dev/null || true

# Patikrinti ar build yra archive
if ! tar -tzf "$DEPLOY_ARCHIVE" 2>/dev/null | grep -q "frontend/build/index.html"; then
  echo "     ERROR: frontend/build/index.html not in archive. Run 'npm run build' in frontend/ first."
  exit 1
fi

SIZE_MB=$(du -m "$DEPLOY_ARCHIVE" | cut -f1)
echo "     OK: $DEPLOY_ARCHIVE ($SIZE_MB MB)"

# 3. Nukopijuoti į serverį (su sshpass)
echo "[3/5] Uploading to server..."
export SSHPASS="$DEPLOY_PASS"
sshpass -e scp -o StrictHostKeyChecking=no "$DEPLOY_ARCHIVE" "${SERVER_USER}@${SERVER_HOST}:/tmp/"

# Patikrinti dydį serveryje
REMOTE_SIZE=$(sshpass -e ssh -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" "stat -c%s /tmp/$(basename $DEPLOY_ARCHIVE) 2>/dev/null || echo 0")
LOCAL_SIZE=$(stat -f%z "$DEPLOY_ARCHIVE" 2>/dev/null || stat -c%s "$DEPLOY_ARCHIVE")
if [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
  echo "     ERROR: Upload size mismatch (local $LOCAL_SIZE vs remote $REMOTE_SIZE). Retry or check network."
  exit 1
fi
echo "     OK: Upload verified"

# 4. Serveryje: išpakuoti ir paleisti
echo "[4/5] Deploying on server..."
sshpass -e ssh -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" "bash -s" -- "$(basename $DEPLOY_ARCHIVE)" "$SERVER_TMS" << 'REMOTE_SCRIPT'
set -e
ARCHIVE_NAME="$1"
TMS_DIR="$2"
ARCHIVE_PATH="/tmp/$ARCHIVE_NAME"

# Išsaugoti .env
[ -f "$TMS_DIR/backend/.env" ] && cp "$TMS_DIR/backend/.env" /tmp/tms_backup_env

# Sustabdyti servisus
sudo pkill -f gunicorn 2>/dev/null || true
sudo pkill -f "python3 -m http.server 3000" 2>/dev/null || true
sleep 2

# Išpakuoti (2>/dev/null slopina macOS xattr įspėjimus)
mkdir -p /tmp/tms_extract
cd /tmp/tms_extract
tar -xzf "$ARCHIVE_PATH" 2>/dev/null
echo "     [remote] Extract OK"

# Backend: kopijuoti tik kodą (sudo – rašymas į /var/www/tms)
echo "     [remote] Copying backend..."
if [ -d "backend" ]; then
  for item in backend/*; do
    name=$(basename "$item")
    [ "$name" = "venv" ] && continue
    [ "$name" = ".env" ] && continue
    [ "$name" = "media" ] && continue
    sudo rm -rf "$TMS_DIR/backend/$name" 2>/dev/null
    sudo cp -r "$item" "$TMS_DIR/backend/"
  done
fi

echo "     [remote] Copying frontend..."
# Frontend: build + package.json, src, public (sudo)
if [ -d "frontend/build" ]; then
  sudo rm -rf "$TMS_DIR/frontend/build"
  sudo cp -r frontend/build "$TMS_DIR/frontend/"
fi
[ -f "frontend/package.json" ] && sudo cp frontend/package.json "$TMS_DIR/frontend/"
[ -d "frontend/src" ] && sudo rm -rf "$TMS_DIR/frontend/src" && sudo cp -r frontend/src "$TMS_DIR/frontend/"
[ -d "frontend/public" ] && sudo rm -rf "$TMS_DIR/frontend/public" && sudo cp -r frontend/public "$TMS_DIR/frontend/"
[ -f "frontend/tsconfig.json" ] && sudo cp frontend/tsconfig.json "$TMS_DIR/frontend/"

# Atkurti .env
[ -f /tmp/tms_backup_env ] && sudo cp /tmp/tms_backup_env "$TMS_DIR/backend/.env"
echo "     [remote] Permissions..."
# Teisės
sudo chown -R www-data:www-data "$TMS_DIR/frontend/build" 2>/dev/null || true
sudo chown -R www-data:www-data "$TMS_DIR/backend" 2>/dev/null || true

# Backend: pip ir migracijos
echo "     [remote] Pip and migrate..."
mkdir -p "$TMS_DIR/logs"
cd "$TMS_DIR/backend"
[ -f venv/bin/activate ] && source venv/bin/activate
pip install -q -r requirements.txt || { echo "     [remote] pip FAILED"; exit 1; }
python manage.py migrate --noinput || { echo "     [remote] migrate FAILED"; exit 1; }

# Gunicorn (nohup kad išliktų po SSH atsijungimo)
echo "     [remote] Starting Gunicorn..."
nohup sudo -u www-data "$TMS_DIR/backend/venv/bin/python" "$TMS_DIR/backend/venv/bin/gunicorn" \
  --bind 127.0.0.1:8000 --workers 3 --timeout 120 \
  --access-logfile "$TMS_DIR/logs/gunicorn_access.log" \
  --error-logfile "$TMS_DIR/logs/gunicorn_error.log" \
  tms_project.wsgi:application </dev/null >>"$TMS_DIR/logs/gunicorn_nohup.log" 2>&1 &
sleep 2

# Frontend statika (nohup kad išliktų po SSH atsijungimo)
echo "     [remote] Starting frontend HTTP server..."
cd "$TMS_DIR/frontend/build"
nohup sudo -u www-data python3 -m http.server 3000 </dev/null >>"$TMS_DIR/logs/frontend_http.log" 2>&1 &
sleep 2

rm -rf /tmp/tms_extract
rm -f "$ARCHIVE_PATH"
echo "     Server deploy done."
REMOTE_SCRIPT

echo "[5/5] Verifying..."
sleep 4
HTTP_F=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_HOST}/" 2>/dev/null || echo "000")
HTTP_A=$(curl -s -o /dev/null -w "%{http_code}" "http://${SERVER_HOST}/api/partners/" 2>/dev/null || echo "000")

echo "     Frontend: $HTTP_F | API: $HTTP_A"
echo "=============================================="
if [ "$HTTP_F" = "200" ]; then
  echo "  DEPLOYMENT OK. TMS: http://${SERVER_HOST}/"
else
  echo "  WARN: Frontend returned $HTTP_F. Check: ssh ${SERVER_USER}@${SERVER_HOST}"
fi
echo "=============================================="
