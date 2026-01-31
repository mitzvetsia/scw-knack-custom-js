#!/usr/bin/env bash
set -e

mkdir -p dist

cat \
  src/config.js \
  src/util.js \
  src/features/ratking.js \
  src/features/proposals.js \
  src/features/group-collapse.js \
  src/features/add-sow-line-item-dto-hide-show-fields.js \
  src/features/highlight-duplicate-cells.js \
  src/features/replace-content-with-icon.js \
  src/features/change-record-limit.js \
  src/features/lock-fields.js \
  src/features/truncate-expand-function.js \
  src/features/legacy/checkbox-grid.field_739.js \
  src/features/sync-checkboxes \
  src/features/survey-form-drag-drop-files.js \
  src/features/hide-navigation.js \
  src/features/legacy/expand-collapse-legacy-function.js \
  src/features/calc-install-fee-adjustment.js
  > dist/knack-bundle.js

echo "✔ Built dist/knack-bundle.js"
