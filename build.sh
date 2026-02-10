#!/usr/bin/env bash
set -e

mkdir -p dist

cat \
  src/config.js \
  src/util.js \
  src/features/global-styles.js \
  src/features/ratking/modal-backdrop-click-disable.js \
  src/features/ratking/default-field-values.js \
  src/features/ratking/post-inline-edit-behavior.js \
  src/features/ratking/timepicker-init.js \
  src/features/ratking/discount-copy-tweaks.js \
  src/features/ratking/hash-bump-record-update.js \
  src/features/ratking/scene-776-stub.js \
  src/features/proposal-grid.js \
  src/features/group-collapse.js \
  src/features/SOW-line-item-DTO-bucket-field-visibility.js \
  src/features/highlight-duplicate-cells.js \
  src/features/replace-content-with-icon.js \
  src/features/change-record-limit.js \
  src/features/lock-fields.js \
  src/features/truncate-expand-function.js \
  src/features/sync-checkboxes \
  src/features/survey-form-drag-drop-files.js \
  src/features/hide-navigation.js \
  src/features/calc-install-fee-adjustment.js \
  src/features/instructions-placement.js \
  src/features/sales-edit-proposal-refresh-controls.js \
  src/features/exception-grid-handler.js \
  src/features/set_unified_product_field.js \
  src/features/bucket-field-visibility_add-product.js \
  src/features/style-detail-labels.js \
  src/features/legacy/checkbox-grid.field_739.js \
  src/features/legacy/expand-collapse-legacy-function.js \
  src/features/legacy/add-checkboxes.js \
  src/features/legacy/get-tl-photos.js \
  > dist/knack-bundle.js

echo "✔ Built dist/knack-bundle.js"
