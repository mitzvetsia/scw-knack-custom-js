#!/usr/bin/env bash
set -e

mkdir -p dist

cat \
  src/config.js \
  src/util.js \
  src/features/ratking.js \
  src/features/proposals.js \
  src/features/group-collapse.js \
  src/features/sow-line-item-dto-hide-show-fields.js
  > dist/knack-bundle.js

echo "✔ Built dist/knack-bundle.js"
