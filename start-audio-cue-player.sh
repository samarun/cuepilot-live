#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required."
  exit 1
fi
if [ ! -f dist/index.html ]; then
  echo "Production build not found. Running npm run build..."
  npm run build
fi
npm start
