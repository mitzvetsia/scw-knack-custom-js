#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MSG="$*"
if [[ -z "$MSG" ]]; then
  echo "❌ Commit message required (ex: ./save.sh \"Fix totals L3 hide logic\")"
  exit 1
fi

# Rebuild dist/knack-bundle.js so the new SHA serves the new code on
# jsDelivr.  save.sh used to be source-only, but the iteration loop is
# "save → bump SHA in Knack → test" — and that only works if dist is
# fresh at the new SHA. Build is fast (~1s) so we always do it.
echo "📦 Building bundle..."
bash "$SCRIPT_DIR/build.sh"

# Stage everything (now including the rebuilt dist).
git add -A

git commit -m "$MSG"
git push

# Pre-warm jsDelivr for this commit's SHA URL so the next page load
# hits a warm edge cache instead of paying the GitHub-origin penalty
# (which can be 15-30s on a cold SHA). Best-effort — log on failure,
# don't abort the save.
SHA="$(git rev-parse HEAD)"
WARM_URL="https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${SHA}/dist/knack-bundle.js"
PURGE_URL="https://purge.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${SHA}/dist/knack-bundle.js"

echo "🧹 Purging + pre-warming jsDelivr for ${SHA:0:7}..."
# Purge first (instructs jsDelivr to drop any stale edge copy) then GET
# to force a fresh origin fetch + edge cache fill.
curl -fsSL --max-time 15 "$PURGE_URL" > /dev/null \
  && echo "   ✓ purge ok" \
  || echo "   ⚠ purge failed (non-fatal)"
curl -fsSL --max-time 30 "$WARM_URL" > /dev/null \
  && echo "   ✓ warm ok (cache now hot for this SHA)" \
  || echo "   ⚠ warm failed (non-fatal — next user request will do the warm)"

echo "✅ Saved source changes (dist excluded)."
echo "CDN URL for Knack <script src>:"
echo "  $WARM_URL"
