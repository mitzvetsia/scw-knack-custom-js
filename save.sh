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
echo "✅ Saved source changes (dist excluded)."
