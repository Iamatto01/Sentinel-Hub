#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
#  rebrand-router-container.sh
#
#  Rebrands the OmniRoute Docker container's compiled frontend to
#  "Sentinel Route" — removing all "OmniRoute", "Omni Router", "omni2",
#  "OMNIPROXY", and "Sentinel Proxy" references from the compiled JS/HTML
#  inside the running container (specifically targeting the Provider Topology
#  graph, sidebar navigation, and home headers).
#
#  Usage (on Kali):  bash /home/kali/server/SentinelMaster/scripts/rebrand-router-container.sh
# ──────────────────────────────────────────────────────────────────────────
set -euo pipefail

# Auto-detect container name: 9router or docker-proxy
if docker ps --format '{{.Names}}' | grep -qx "9router"; then
  CONTAINER="9router"
elif docker ps --format '{{.Names}}' | grep -qx "docker-proxy"; then
  CONTAINER="docker-proxy"
else
  echo "ERROR: Neither '9router' nor 'docker-proxy' is running."
  echo "       Current containers:"
  docker ps --format '{{.Names}}'
  exit 1
fi

CHUNK_DIR="/app/.build/next/static/chunks"
HTML_DIR="/app/.build/next/server"

echo "=== Rebranding '$CONTAINER' frontend to 'Sentinel Route' ==="
echo ""

# ── 1. Find all files containing old branding ──────────────────────────
echo "[1/5] Scanning for old branding inside $CONTAINER..."

TARGETS=$(docker exec "$CONTAINER" sh -c "
  grep -rl -e 'OmniRoute' -e 'Omni Router' -e 'omni2' -e 'Sentinel Proxy' \
    -e 'OMNIPROXY' -e 'OmniProxy' -e 'omni-proxy' \
    $CHUNK_DIR/ $HTML_DIR/ 2>/dev/null || true
" | sort -u)

if [ -z "$TARGETS" ]; then
  echo "   No files found with old branding. Container may already be rebranded."
else
  FILE_COUNT=$(echo "$TARGETS" | wc -l)
  echo "   Found $FILE_COUNT file(s) to patch."

  # ── 2. Apply sed replacements ─────────────────────────────────────────
  echo ""
  echo "[2/5] Applying replacements inside container..."
  docker exec "$CONTAINER" sh -c "
    for f in $TARGETS; do
      sed -i \
        -e 's/OmniRoute/Sentinel Route/g' \
        -e 's/Omni Router/Sentinel Route/g' \
        -e 's/Omni router/Sentinel Route/g' \
        -e 's/omni router/Sentinel Route/g' \
        -e 's/OMNIPROXY/SENTINEL ROUTE/g' \
        -e 's/OmniProxy/Sentinel Route/g' \
        -e 's/omniProxy/sentinelRoute/g' \
        -e 's/omni-proxy/sentinel-route/g' \
        -e 's/omni2/Sentinel Route/g' \
        -e 's/Omni2/Sentinel Route/g' \
        -e 's/Sentinel Proxy/Sentinel Route/g' \
        -e 's/sentinel-proxy/sentinel-route/g' \
        -e 's/sentinel_proxy/sentinel_route/g' \
        \"\$f\" 2>/dev/null || true
    done
    echo '   sed replacements applied.'
  "
fi

# ── 3. Update Service Worker to bust client PWA cache ──────────────────
echo ""
echo "[3/5] Updating Service Worker (sw.js) to force client cache purge..."
CACHE_TAG="sentinel-route-$(date +%Y%m%d%H%M%S)"
docker exec "$CONTAINER" sh -c "
  if [ -f /app/public/sw.js ]; then
    sed -i 's/const CACHE_NAME = \"[^\"]*\";/const CACHE_NAME = \"$CACHE_TAG\";/g' /app/public/sw.js 2>/dev/null || true
    echo '   sw.js cache version bumped to $CACHE_TAG'
  fi
"

# ── 4. Verify post-replacement ────────────────────────────────────────
echo ""
echo "[4/5] Auditing remaining branding in container:"
docker exec "$CONTAINER" sh -c "
  REMAIN=\$(grep -rc -i 'omniroute\|omni.router\|omni2\|sentinel.proxy' $CHUNK_DIR/ $HTML_DIR/ 2>/dev/null | grep -v ':0$' || true)
  if [ -z \"\$REMAIN\" ]; then
    echo '  ✅ CLEAN — no old OmniRoute/Sentinel Proxy branding remains.'
  else
    echo '  ⚠️ Remaining matches (internal or config):'
    echo \"\$REMAIN\"
  fi
"

# ── 5. Restart container and commit image ─────────────────────────────
echo ""
echo "[5/5] Restarting container and committing image..."
docker restart "$CONTAINER"
echo "   Restarted $CONTAINER."

docker commit "$CONTAINER" sentinel-proxy:omniroute-3.8.50-pwfix
echo "   ✅ Committed $CONTAINER to image 'sentinel-proxy:omniroute-3.8.50-pwfix'."

echo ""
echo "=========================================================="
echo "  ✅ REBRAND COMPLETE: 'Sentinel Route' is now active!"
echo "  Hard refresh your browser (Ctrl + Shift + R) on:"
echo "  https://router.sentinelai.studio/home"
echo "=========================================================="
