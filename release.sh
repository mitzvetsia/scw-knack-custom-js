#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VERSION="$1"

if [[ -z "$VERSION" ]]; then
  echo "❌ Version required (ex: ./release.sh v1.1.14)"
  exit 1
fi

echo "🔍 Checking git status (release expects a clean tree before build)..."
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree not clean. Commit or stash changes before releasing so only build artifacts are added."
  git status --short
  exit 1
fi


echo "📦 Building bundle..."
bash "$SCRIPT_DIR/build.sh"

echo "📝 Staging changes..."
git add -A

echo "✅ Committing..."
git commit -m "Release ${VERSION}"

echo "⬆️  Pushing to GitHub..."
git push origin main

echo "🏷️  Tagging ${VERSION}..."
git tag "${VERSION}"
git push origin "${VERSION}"

echo "🎉 Release ${VERSION} complete!"

# Purge jsDelivr's edge cache AND pre-warm it by GETting the URL.
# Purge alone doesn't fill the cache — it just marks the entry stale.
# A follow-up GET forces jsDelivr to fetch from GitHub origin and store
# in edge.  Subsequent browser requests then hit a warm cache (~50ms)
# instead of paying the cold-origin penalty (~15-30s).  Best-effort —
# failures here don't abort the release.
SHA="$(git rev-parse HEAD)"
echo "🧹 Purging + pre-warming jsDelivr..."
for ref in "${VERSION}" "${SHA}"; do
  PURGE="https://purge.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${ref}/dist/knack-bundle.js"
  WARM="https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${ref}/dist/knack-bundle.js"
  curl -fsSL --max-time 15 "$PURGE" > /dev/null \
    && echo "   ✓ purge ${ref:0:12}" \
    || echo "   ⚠ purge ${ref:0:12} failed (non-fatal)"
  curl -fsSL --max-time 30 "$WARM" > /dev/null \
    && echo "   ✓ warm  ${ref:0:12}" \
    || echo "   ⚠ warm  ${ref:0:12} failed (non-fatal)"
done

echo "CDN:"
echo "https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${VERSION}/dist/knack-bundle.js"
