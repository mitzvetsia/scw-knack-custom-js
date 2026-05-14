#!/usr/bin/env bash
# Push the current branch to origin and immediately purge jsDelivr's
# edge cache for that branch's bundle, so the next page load on the
# Knack app side sees the new commit without the usual minutes-long
# branch-URL propagation delay.
#
# Usage:  bash push.sh
#
# Idempotent. Safe to run even if there's nothing new to push.
set -e

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REPO="mitzvetsia/scw-knack-custom-js"

if [[ -z "$BRANCH" || "$BRANCH" == "HEAD" ]]; then
  echo "❌ Could not determine current branch (detached HEAD?)."
  exit 1
fi

# ── Push (with retry on network blips) ──────────────────────────────
push_with_retry() {
  local delay=2
  for attempt in 1 2 3 4; do
    if git push -u origin "$BRANCH"; then
      return 0
    fi
    echo "↻ push attempt $attempt failed; retrying in ${delay}s…"
    sleep "$delay"
    delay=$(( delay * 2 ))
  done
  echo "❌ git push failed after 4 attempts."
  return 1
}

push_with_retry

# ── Purge jsDelivr edge cache for the branch URL ────────────────────
# jsDelivr's purge endpoint is a plain GET on the asset URL prefixed
# with purge.jsdelivr.net. A 200 means the cache entry was invalidated;
# next request to cdn.jsdelivr.net refetches from origin.
PURGE_URL="https://purge.jsdelivr.net/gh/${REPO}@${BRANCH}/dist/knack-bundle.js"
echo "↻ Purging jsDelivr cache…"
echo "  $PURGE_URL"

# Use curl if available; fall back to wget. Either way, don't let a
# transient purge failure break the push flow.
if command -v curl >/dev/null 2>&1; then
  if curl -fsS -o /dev/null -w "  ↳ HTTP %{http_code}\n" --max-time 15 "$PURGE_URL"; then
    echo "✔ Cache purged."
  else
    echo "⚠ Purge request failed (non-fatal); CDN will refresh on its own within ~12h."
  fi
elif command -v wget >/dev/null 2>&1; then
  if wget -q -O /dev/null --timeout=15 "$PURGE_URL"; then
    echo "✔ Cache purged."
  else
    echo "⚠ Purge request failed (non-fatal); CDN will refresh on its own within ~12h."
  fi
else
  echo "⚠ Neither curl nor wget available — skipping purge."
fi
