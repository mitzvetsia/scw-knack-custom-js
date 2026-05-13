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

# Purge jsDelivr's edge cache for both the tag URL and the latest commit
# SHA URL so the next request pulls fresh bytes immediately instead of
# waiting on the edge TTL (which can be 1-2 minutes).  Best-effort —
# don't fail the release if the purge endpoint is slow or unreachable.
SHA="$(git rev-parse HEAD)"
PURGE_URLS=(
  "https://purge.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${VERSION}/dist/knack-bundle.js"
  "https://purge.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${SHA}/dist/knack-bundle.js"
)
echo "🧹 Purging jsDelivr cache..."
for url in "${PURGE_URLS[@]}"; do
  if curl -fsSL --max-time 10 "$url" > /dev/null; then
    echo "   ✓ ${url}"
  else
    echo "   ⚠ purge failed (non-fatal): ${url}"
  fi
done

echo "CDN:"
echo "https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${VERSION}/dist/knack-bundle.js"
