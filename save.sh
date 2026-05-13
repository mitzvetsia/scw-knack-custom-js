#!/usr/bin/env bash
set -e

MSG="$*"
if [[ -z "$MSG" ]]; then
  echo "❌ Commit message required (ex: ./save.sh \"Fix totals L3 hide logic\")"
  exit 1
fi

# Stage everything…
git add -A

# …but do NOT include the built artifact in these “work” commits
git restore --staged dist/knack-bundle.js 2>/dev/null || true

# If dist was modified locally, keep it out of the commit
# (optional) also revert it so it doesn't keep showing up
# git restore dist/knack-bundle.js 2>/dev/null || true

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
