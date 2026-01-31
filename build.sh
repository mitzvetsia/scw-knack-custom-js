#!/usr/bin/env bash
set -e

mkdir -p dist

cat \
  src/config.js \
  src/util.js \
  src/features/ratking.js \
  src/features/proposals.js \
  > dist/knack-bundle.js

echo "✔ Built dist/knack-bundle.js"
