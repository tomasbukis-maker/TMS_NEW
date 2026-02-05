#!/bin/bash
# TMS media failų sinchronizavimas: lokalus backend/media -> serveris
# Įskaitant laiškų prisegtukus (mail_attachments/), sąskaitų failus, logotipus ir kt.
# Naudojimas: ./deploy_media.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SERVER_USER="admin_ai"
SERVER_HOST="100.112.219.50"
SERVER_MEDIA="/var/www/tms/backend/media"
LOCAL_MEDIA="backend/media"
DEPLOY_PASS="${TMS_DEPLOY_PASS:-asdfghjkl_ai}"

echo "=============================================="
echo "  TMS Media: LOCAL -> SERVER"
echo "=============================================="

if [ ! -d "$LOCAL_MEDIA" ]; then
  echo "Katalogas $LOCAL_MEDIA neegzistuoja. Nėra ką siųsti."
  exit 0
fi

SIZE=$(du -sh "$LOCAL_MEDIA" 2>/dev/null | cut -f1)
echo "Lokalus media: $LOCAL_MEDIA ($SIZE)"
echo "Serveryje: ${SERVER_USER}@${SERVER_HOST}:${SERVER_MEDIA}"
echo ""

export SSHPASS="$DEPLOY_PASS"

# Sukurti media katalogą serveryje, jei jo nėra
sshpass -e ssh -o StrictHostKeyChecking=no "${SERVER_USER}@${SERVER_HOST}" "mkdir -p $SERVER_MEDIA"

# Rsync: sinchronizuoti failus (nauji/ pakeisti; nešalina serverio papildomų failų)
if command -v rsync &>/dev/null; then
  echo "Sinchronizacija (rsync)..."
  # --no-times: išvengti "failed to set times - Operation not permitted" serveryje
  sshpass -e rsync -avz --no-times --progress -e "ssh -o StrictHostKeyChecking=no" \
    "$LOCAL_MEDIA/" \
    "${SERVER_USER}@${SERVER_HOST}:${SERVER_MEDIA}/"
else
  echo "rsync nerastas, naudojamas scp..."
  sshpass -e scp -o StrictHostKeyChecking=no -r "$LOCAL_MEDIA"/* "${SERVER_USER}@${SERVER_HOST}:${SERVER_MEDIA}/"
fi

echo ""
echo "Media sinchronizacija baigta."
