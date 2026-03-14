#!/bin/bash
set -euo pipefail

cd /opt/grocerygenius

echo "Building with BASE_PATH=/grocerygenius..."
npm run build:deploy

# Verify the built artifact has correct asset paths
grep -q '/grocerygenius/assets/' dist/public/index.html \
  || { echo "ERROR: Built HTML has wrong asset paths"; exit 1; }

echo "Restarting PM2 process..."
pm2 restart grocerygenius

sleep 2

# Verify the site responds
if curl -sf https://pezant.ca/grocerygenius/ > /dev/null; then
  echo "Deploy verified: site is live"
else
  echo "WARNING: Site not responding after deploy"
  exit 1
fi
