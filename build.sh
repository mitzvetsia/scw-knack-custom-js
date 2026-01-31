#!/usr/bin/env bash
set -e

mkdir -p dist

cat \
  src/config.js \
  src/util.js \
  src/features/proposals.js \
  src/features/ratking.js \
  > dist/knack-bundle.js

echo "✔ Built dist/knack-bundle.js"
