#!/bin/bash
echo "🚀 TMS SISTEMOS DEPLOYMENT - KODAS Į SERVERĮ"
echo "Nukopijuojami failai, bet NE duomenys"
echo ""

# Spalvos
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Nustatymai
SSH_HOST="192.168.9.26"
SSH_USER="tomas"
export SSHPASS="asdfghjkl"

RSYNC_CMD="sshpass -e ssh -o StrictHostKeyChecking=no"
SSH_CMD="sshpass -e ssh -o StrictHostKeyChecking=no $SSH_USER@$SSH_HOST"

echo -e "${BLUE}[STEP]${NC} Tikrinamas ryšys..."
$SSH_CMD "echo 'OK'" || { echo "❌ Nepavyko prisijungti"; exit 1; }

echo -e "${GREEN}[INFO]${NC} Prisijungta prie serverio: $SSH_USER@$SSH_HOST"

echo -e "${BLUE}[STEP]${NC} Kuriamas backup..."
$SSH_CMD "mkdir -p /var/www/tms/backups"

echo -e "${BLUE}[STEP]${NC} Kopijuojami backend failai..."
rsync -rltz -e "$RSYNC_CMD" --exclude="__pycache__" --exclude="venv" --no-owner --no-group apps/ "$SSH_USER@$SSH_HOST:/var/www/tms/backend/apps/"
rsync -rltz -e "$RSYNC_CMD" --no-owner --no-group tms_project/ "$SSH_USER@$SSH_HOST:/var/www/tms/backend/tms_project/"
rsync -az -e "$RSYNC_CMD" ../backend/templates/ "$SSH_USER@$SSH_HOST:/var/www/tms/backend/templates/"
rsync -az -e "$RSYNC_CMD" deploy_tms.sh "$SSH_USER@$SSH_HOST:/var/www/tms/backend/"

echo -e "${BLUE}[STEP]${NC} Kopijuojami frontend failai..."
rsync -az -e "$RSYNC_CMD" --exclude="node_modules" --exclude="build" ../frontend/src/ "$SSH_USER@$SSH_HOST:/var/www/tms/frontend/src/"
rsync -az -e "$RSYNC_CMD" ../frontend/package.json ../frontend/package-lock.json "$SSH_USER@$SSH_HOST:/var/www/tms/frontend/"

echo -e "${BLUE}[STEP]${NC} Atnaujinamos dependencies serveryje..."
$SSH_CMD << EOF_SERVER
# Fix permissions first
echo '$SSHPASS' | sudo -S chown -R tomas:www-data /var/www/tms/backend /var/www/tms/frontend

cd /var/www/tms/backend
bash -c "source venv/bin/activate && pip install -q -r requirements.txt"

cd ../frontend
echo "Installing frontend dependencies..."
npm install --legacy-peer-deps
echo "Building frontend..."
npm run build
echo "✅ Dependencies atnaujintos"
EOF_SERVER

echo -e "${BLUE}[STEP]${NC} Perkraunamas backend..."
$SSH_CMD "echo '$SSHPASS' | sudo -S systemctl restart tms-backend.service"

echo ""
echo -e "${GREEN}[SUCCESS]${NC} ✅ TMS SISTEMOS DEPLOYMENT BAIGTAS!"
echo "📍 Sistema prieinama: http://$SSH_HOST"
echo ""
echo -e "${YELLOW}[WARNING]${NC} ⚠️  DUOMENYS NEBUVO SINCHRONIZUOTI!"
echo -e "${YELLOW}[INFO]${NC} 🚀 Jei reikia duomenų - paleiskite: ./deploy_database.sh"
