#!/bin/bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")" && pwd)}"
cd "$DEPLOY_DIR"

echo "Building with BASE_PATH=/grocerygenius..."
npm run build:deploy

# Verify the built artifact has correct asset paths
grep -q '/grocerygenius/assets/' dist/public/index.html \
  || { echo "ERROR: Built HTML has wrong asset paths"; exit 1; }

echo "Restarting PM2 process..."
pm2 restart grocerygenius

sleep 2

# Verify the site responds
HEALTH_URL="${HEALTH_URL:-${APP_URL:-http://localhost:8080}/}"
if curl -sf "$HEALTH_URL" > /dev/null; then
  echo "Deploy verified: site is live"
else
  echo "WARNING: Site not responding after deploy"
  exit 1
fi
