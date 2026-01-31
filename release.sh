#!/usr/bin/env bash
set -e

VERSION="$1"

if [[ -z "$VERSION" ]]; then
  echo "❌ Version required (ex: ./release.sh v1.1.14)"
  exit 1
fi

echo "🔍 Checking git status..."
if [[ -n "$(git status --porcelain)" ]]; then
  echo "❌ Working tree not clean. Commit or stash first."
  exit 1
fi


echo "📦 Building bundle..."
bash build.sh

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
echo "CDN:"
echo "https://cdn.jsdelivr.net/gh/mitzvetsia/scw-knack-custom-js@${VERSION}/dist/knack-bundle.js"
