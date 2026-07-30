/*************  Inline Photo Rows – view_3512  **********************/
/**
 * After view_3512 renders, injects a photo-preview row beneath every
 * data row in the grid.
 *
 * Data is read entirely from the DOM — no API calls.
 *
 * For each line-item row we union the connected photo record IDs found
 * in two columns:
 *   - field_771  (PICs)           → span[id][data-kn="connection-value"] > img
 *   - field_2445 (CONFIG_photo type) → span[id][data-kn="connection-value"] > span
 *
 * Each photo record gets its own card showing:
 *   - The image (or an upload-placeholder if no image)
 *   - The photo-type label from field_2445 underneath
 *
 * Clicking any photo card navigates to the edit-doc-photo page
 * for that specific photo record.
 *
 * Knack Builder Setup (per view):
 *   - field_771 (PICs) must have "Click the thumbnail to view the full-size
 *     image" enabled. Without this, Knack does not render the <img> element
 *     with `data-kn-img-gallery` in the DOM, and photos will appear as empty
 *     upload placeholders even when an image is attached to the record.
 *   - field_2445 (CONFIG_photo type), field_2446 (Required), field_2447
 *     (Completed), and field_114 (INPUT_notes) should be included in the
 *     view — they are hidden via CSS but their DOM data is read for metadata.
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  // NOTE: view_3586 + view_3610 (sales/ops build SOW) + view_3505 (survey)
  // removed — fully v2; worksheet-v2/photos.js renders those pages' photo
  // strips. Other v2-cutover views (view_4093/4056/3921) remain here for now
  // but are inert via the offsetParent (display:none) guard in processView;
  // they'll be pulled surface-by-surface as each is de-v1'd.
  var TARGET_VIEWS = ['view_3512', 'view_3559', 'view_3577', 'view_3602', 'view_3313', 'view_3596', 'view_3997', 'view_3608', 'view_3617', 'view_4093', 'view_4056', 'view_3921', 'view_3800', 'view_3803'];
  var CSS_ID       = 'scw-inline-photo-row-css';
  var ROW_CLS      = 'scw-inline-photo-row';
  var STRIP_CLS    = 'scw-inline-photo-strip';
  var CARD_CLS     = 'scw-inline-photo-card';
  var IMG_CLS      = 'scw-inline-photo-img';
  var TYPE_CLS     = 'scw-inline-photo-type';
  var EMPTY_CLS    = 'scw-inline-photo-empty';
  var ADD_BTN_CLS  = 'scw-inline-photo-add';
  var REQ_CLS      = 'scw-inline-photo-required';
  var REQ_CHIP_CLS = 'scw-inline-photo-req-chip';
  var REQ_CHIP_GREEN_CLS = 'scw-inline-photo-req-chip-green';
  var MISSING_CLS  = 'scw-inline-photo-missing';
  var DRAG_SRC_CLS = 'scw-photo-drag-source';
  var DROP_OK_CLS  = 'scw-photo-drop-target';
  var DROP_HOVER_CLS = 'scw-photo-drop-hover';
  var PENDING_CLS  = 'scw-photo-pending';
  var CONFIRM_CLS  = 'scw-photo-confirm-overlay';

  // Columns to hide in the original table (we show the data inline instead)
  var HIDE_COLS = ['field_114', 'field_2445', 'field_2446', 'field_2447'];
  var NOTES_CLS = 'scw-inline-photo-notes';

  // View-specific add-photo URL path segments
  var ADD_PHOTO_PATHS = {
    'view_3313': 'add-photo-to-sow-line-item',
    'view_4093': 'add-photo-to-install-line-item',
    'view_4056': 'add-photo-to-install-line-item',
    'view_3921': 'add-photo-to-sow-line-item',
    'view_3559': 'add-photo-to-mdf-idf',
    'view_3577': 'add-photo-to-mdf-idf2',
    'view_3602': 'add-photo-to-mdf-idf2',
    'view_3596': 'add-photo-to-sow-line-item3',
    'view_3997': 'add-photo-to-sow-line-item3',
    'view_3608': 'add-photo-to-sow-line-item2',
    'view_3617': 'add-photo-to-mdf-idf4',
    'view_3803': 'add-photo-to-mdf-idf'
  };
  var DEFAULT_ADD_PATH = 'add-photo-to-survey-line-item';

  // ── Identity-aware bulk upload from the "Add photo" button ──────────
  // Map a photo-strip view to the line-item-scoped linkField the bulk-upload
  // modal ships to Make, derived from the view's add-photo path segment so a
  // new view added to ADD_PHOTO_PATHS is covered automatically. Make branches
  // on this value to connect the uploaded photo to the right line-item object.
  // MDF/IDF views return '' (not a line item) → the caller falls back to the
  // Knack add-photo edit page.
  function bulkLinkFieldFor(viewId) {
    var path = ADD_PHOTO_PATHS[viewId] || DEFAULT_ADD_PATH;
    if (path.indexOf('survey-line-item')  !== -1) return 'surveyLineItemID';
    if (path.indexOf('install-line-item') !== -1) return 'installLineItemID';
    if (path.indexOf('sow-line-item')     !== -1) return 'sowLineItemID';
    return '';   // mdf-idf (and anything else) — not wired to the bulk modal
  }

  // Best-effort human label for a line item (its Knack display identifier),
  // used purely to reassure the user which item they're uploading to. Returns
  // '' when unknown — the modal then shows the generic "this line item" notice.
  function lineItemLabelFor(lineItemId, viewId) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewId];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        if (models[i] && models[i].id === lineItemId) {
          var a = models[i].attributes || {};
          var id = a.identifier || a.name || '';
          return String(id).replace(/<[^>]*>/g, '').trim();
        }
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  // Open the bulk-photos modal seeded with THIS line item's identity so every
  // uploaded photo POSTs { recordId: <lineItemId>, linkField: <type> } and
  // Make connects it to the correct line item. Returns true when it opened
  // (caller then skips the edit-page navigation). Gated by CONFIG so uploads
  // don't route to Make before the scenario handles the new linkFields.
  function openBulkForLineItem(lineItemId, viewId) {
    if (!(window.SCW && SCW.CONFIG && SCW.CONFIG.PHOTO_ADD_BULK_MODAL)) return false;
    if (!(window.SCW && SCW.bulkUpload && typeof SCW.bulkUpload.open === 'function')) return false;
    var linkField = bulkLinkFieldFor(viewId);
    if (!linkField) return false;
    SCW.bulkUpload.open({
      linkField:            linkField,
      // Scope flag → modal shows a "this line item only" callout and drops the
      // parent-SOW auto-match copy (which doesn't apply to a per-line-item
      // upload). targetLabel: best-effort row label, else the generic notice.
      lineItemUpload:       true,
      targetLabel:          lineItemLabelFor(lineItemId, viewId),
      // Refresh this line item in its own photo-strip view on modal close so
      // the newly-connected photos surface without a manual reload.
      refreshRecordInViews: [viewId],
      refreshViews:         [],
      reloadOnClose:        false
    }, lineItemId);
    return true;
  }

  // ── CSS ─────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* The injected <tr> — background/border controlled by
         device-worksheet.js so the pair reads as one unit */
      '.' + ROW_CLS + ' {',
      '  background: transparent;',
      '}',
      '.' + ROW_CLS + ' > td {',
      '  padding: 10px 20px 14px 16px !important;',
      '}',

      /* Wrapper — mimics .scw-ws-field layout so photos align with field values */
      '.scw-inline-photo-field {',
      '  display: flex;',
      '  gap: 8px;',
      '  align-items: flex-start;',
      '}',

      /* "Photos" label — matches .scw-ws-field-label styling */
      '.scw-inline-photo-label {',
      '  flex: 0 0 auto;',
      '  min-width: 100px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  color: #4b5563;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.3px;',
      '  padding-top: 5px;',
      '  white-space: nowrap;',
      '}',

      /* Flex strip for photo cards */
      '.' + STRIP_CLS + ' {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 12px;',
      '  align-items: flex-start;',
      '  flex: 1;',
      '  min-width: 0;',
      '}',

      /* Card wrapper */
      '.' + CARD_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '}',

      /* Override Knack default ".kn-content img { max-width:100% }" */
      '.kn-content .' + IMG_CLS + ' {',
      '  max-width: none;',
      '}',

      /* Photo image — natural width, capped height */
      '.' + IMG_CLS + ' {',
      '  width: auto;',
      '  max-height: 200px;',
      '  border-radius: 6px;',
      '  border: 1px solid #ddd;',
      '  box-shadow: 0 1px 4px rgba(0,0,0,.08);',
      '  cursor: grab;',
      /* This is a POINTER-based drag (see inline-photo-row.js), so native
         dragging only gets in the way — turn it OFF on the image and kill
         selection so a press-drag never selects the photo instead. */
      '  -webkit-user-drag: none !important;',
      '  user-select: none; -webkit-user-select: none;',
      '  transition: transform 120ms ease, box-shadow 120ms ease;',
      '}',
      '.' + IMG_CLS + ':hover {',
      '  transform: scale(1.03);',
      '  box-shadow: 0 3px 12px rgba(0,0,0,.15);',
      '}',

      /* Empty photo placeholder (no image uploaded yet) */
      '.' + EMPTY_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 6px;',
      '  width: 200px;',
      '  height: 200px;',
      '  border: 2px dashed #cbd5e1;',
      '  border-radius: 6px;',
      '  background: #f8fafc;',
      '  color: #94a3b8;',
      '  font-size: 12px;',
      '  cursor: pointer;',
      '  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;',
      '}',
      '.' + EMPTY_CLS + ':hover {',
      '  border-color: #295f91;',
      '  color: #295f91;',
      '  background: #eff6ff;',
      '}',
      '.' + EMPTY_CLS + ' .scw-empty-icon {',
      '  font-size: 28px;',
      '  line-height: 1;',
      '}',

      /* Photo type label beneath image */
      '.' + TYPE_CLS + ' {',
      '  margin-top: 4px;',
      '  width: 100%;',
      '  min-width: 80px;',
      '  padding: 3px 6px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.3;',
      '  color: #475569;',
      '  background: #e2e8f0;',
      '  border-radius: 3px;',
      '  text-align: center;',
      '  white-space: nowrap;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '}',

      /* Add-photo button (end of strip) */
      '.' + ADD_BTN_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 4px;',
      '  width: 56px;',
      '  min-height: 200px;',
      '  border: 2px dashed #cbd5e1;',
      '  border-radius: 6px;',
      '  background: #f8fafc;',
      '  color: #94a3b8;',
      '  font-size: 11px;',
      '  cursor: pointer;',
      '  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;',
      '  flex-shrink: 0;',
      '}',
      '.' + ADD_BTN_CLS + ':hover {',
      '  border-color: #295f91;',
      '  color: #295f91;',
      '  background: #eff6ff;',
      '}',
      '.' + ADD_BTN_CLS + ' .scw-add-icon {',
      '  font-size: 28px;',
      '  line-height: 1;',
      '  font-weight: 300;',
      '}',

      /* When the add button is the only item in the strip (no photos),
         make it square — height matches width */
      '.' + ADD_BTN_CLS + '.scw-photo-add-solo {',
      '  min-height: 56px;',
      '  height: 56px;',
      '}',

      /* Required chip */
      '.' + REQ_CHIP_CLS + ' {',
      '  margin-top: 2px;',
      '  width: 100%;',
      '  padding: 2px 6px;',
      '  font-size: 9px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.5px;',
      '  text-align: center;',
      '  color: #fff;',
      '  border-radius: 3px;',
      '  box-sizing: border-box;',
      '}',

      /* Green chip — required + completed */
      '.' + REQ_CHIP_GREEN_CLS + ' { background: #16a34a; }',

      /* Red chip — required + not completed */
      '.' + REQ_CHIP_CLS + ':not(.' + REQ_CHIP_GREEN_CLS + ') { background: #dc2626; }',

      /* Missing required photo — card-level highlight */
      '.' + MISSING_CLS + ' {',
      '  border-color: #dc2626 !important;',
      '  background: #fef2f2 !important;',
      '  color: #dc2626 !important;',
      '}',
      '.' + MISSING_CLS + ':hover {',
      '  border-color: #b91c1c !important;',
      '  background: #fee2e2 !important;',
      '  color: #b91c1c !important;',
      '}',

      /* Required photo that IS completed — subtle indicator on image border */
      '.' + CARD_CLS + '.' + REQ_CLS + ' .' + IMG_CLS + ' {',
      '  border-color: #16a34a;',
      '}',

      /* ── Drag-and-drop states ── */

      /* Source card while dragging */
      '.' + DRAG_SRC_CLS + ' {',
      '  opacity: 0.45;',
      '  transform: scale(0.95);',
      '  transition: opacity 150ms ease, transform 150ms ease;',
      '}',

      /* Floating clone that follows the cursor during a pointer drag. */
      '.scw-photo-drag-clone {',
      '  position: fixed;',
      '  z-index: 99999;',
      '  pointer-events: none;',
      '  transform: translate(-50%, -50%);',
      '  opacity: 0.9;',
      '  width: 120px; height: 120px;',
      '  border-radius: 8px;',
      '  border: 2px solid #16a34a;',
      '  box-shadow: 0 8px 24px rgba(0,0,0,0.35);',
      '  overflow: hidden;',
      '  background: #fff;',
      '}',
      '.scw-photo-drag-clone img {',
      '  width: 100%; height: 100%; object-fit: cover; display: block;',
      '}',
      /* While a pointer drag is in progress, force the grabbing cursor and
         kill text selection page-wide. */
      'body.scw-photo-dragging, body.scw-photo-dragging * {',
      '  cursor: grabbing !important;',
      '  user-select: none !important; -webkit-user-select: none !important;',
      '}',

      /* Valid drop target highlight (pulsing green dashed border) */
      '.' + DROP_OK_CLS + ' .' + EMPTY_CLS + ' {',
      '  border-color: #16a34a !important;',
      '  border-width: 2px !important;',
      '  border-style: dashed !important;',
      '  background: #f0fdf4 !important;',
      '  color: #16a34a !important;',
      '  animation: scw-pulse-border 1.2s ease-in-out infinite;',
      '}',
      '@keyframes scw-pulse-border {',
      '  0%, 100% { border-color: #16a34a; }',
      '  50% { border-color: #86efac; }',
      '}',

      /* Drop target hover — bolder highlight */
      '.' + DROP_HOVER_CLS + ' .' + EMPTY_CLS + ' {',
      '  border-color: #15803d !important;',
      '  border-width: 3px !important;',
      '  border-style: solid !important;',
      '  background: #dcfce7 !important;',
      '  color: #15803d !important;',
      '  box-shadow: 0 0 0 3px rgba(22,163,74,0.2);',
      '  animation: none;',
      '}',

      /* Helper text shown on valid targets during drag */
      '.' + DROP_OK_CLS + ' .scw-drop-helper {',
      '  display: block;',
      '}',
      '.scw-drop-helper {',
      '  display: none;',
      '  font-size: 10px;',
      '  font-weight: 600;',
      '  margin-top: 4px;',
      '  text-align: center;',
      '  color: #16a34a;',
      '}',

      /* Pending state after drop */
      '.' + PENDING_CLS + ' {',
      '  position: relative;',
      '  pointer-events: none;',
      '}',
      '.' + PENDING_CLS + ' .' + EMPTY_CLS + ' {',
      '  border-color: #3b82f6 !important;',
      '  background: #eff6ff !important;',
      '  color: #3b82f6 !important;',
      '  animation: none;',
      '}',

      /* Confirmation overlay */
      '.' + CONFIRM_CLS + ' {',
      '  position: absolute;',
      '  top: 0; left: 0; right: 0; bottom: 0;',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 6px;',
      '  background: rgba(255,255,255,0.95);',
      '  border-radius: 6px;',
      '  border: 2px solid #3b82f6;',
      '  z-index: 10;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-text {',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  color: #1e40af;',
      '  text-align: center;',
      '  padding: 0 8px;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-btns {',
      '  display: flex;',
      '  gap: 6px;',
      '}',
      '.' + CONFIRM_CLS + ' button {',
      '  padding: 4px 12px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  border-radius: 4px;',
      '  border: none;',
      '  cursor: pointer;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-yes {',
      '  background: #16a34a;',
      '  color: #fff;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-yes:hover {',
      '  background: #15803d;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-no {',
      '  background: #e2e8f0;',
      '  color: #475569;',
      '}',
      '.' + CONFIRM_CLS + ' .scw-confirm-no:hover {',
      '  background: #cbd5e1;',
      '}',

      /* Notes beneath the card — truncated to two lines */
      '.' + NOTES_CLS + ' {',
      '  margin-top: 2px;',
      '  max-width: 200px;',
      '  padding: 2px 6px;',
      '  font-size: 10px;',
      '  line-height: 1.3;',
      '  color: #64748b;',
      '  text-align: center;',
      '  box-sizing: border-box;',
      '  display: -webkit-box;',
      '  -webkit-line-clamp: 2;',
      '  -webkit-box-orient: vertical;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  word-break: break-word;',
      '}',

      '/* Hide the raw connected-field columns we now display inline */',
      '#view_3512 th.field_114,',
      '#view_3512 td.field_114,',
      '#view_3512 th.field_2445,',
      '#view_3512 td.field_2445,',
      '#view_3512 th.field_2446,',
      '#view_3512 td.field_2446,',
      '#view_3512 th.field_2447,',
      '#view_3512 td.field_2447,',
      '#view_3559 th.field_114,',
      '#view_3559 td.field_114,',
      '#view_3559 th.field_2445,',
      '#view_3559 td.field_2445,',
      '#view_3559 th.field_2446,',
      '#view_3559 td.field_2446,',
      '#view_3559 th.field_2447,',
      '#view_3559 td.field_2447,',
      '#view_3577 th.field_114,',
      '#view_3577 td.field_114,',
      '#view_3577 th.field_2445,',
      '#view_3577 td.field_2445,',
      '#view_3577 th.field_2446,',
      '#view_3577 td.field_2446,',
      '#view_3577 th.field_2447,',
      '#view_3577 td.field_2447,',
      '#view_3602 th.field_114,',
      '#view_3602 td.field_114,',
      '#view_3602 th.field_2445,',
      '#view_3602 td.field_2445,',
      '#view_3602 th.field_2446,',
      '#view_3602 td.field_2446,',
      '#view_3602 th.field_2447,',
      '#view_3602 td.field_2447,',
      '#view_3617 th.field_114,',
      '#view_3617 td.field_114,',
      '#view_3617 th.field_2445,',
      '#view_3617 td.field_2445,',
      '#view_3617 th.field_2446,',
      '#view_3617 td.field_2446,',
      '#view_3617 th.field_2447,',
      '#view_3617 td.field_2447,',
      '#view_3313 th.field_114,',
      '#view_3313 td.field_114,',
      '#view_3313 th.field_2445,',
      '#view_3313 td.field_2445,',
      '#view_3313 th.field_2446,',
      '#view_3313 td.field_2446,',
      '#view_3313 th.field_2447,',
      '#view_3313 td.field_2447,',
      '#view_3921 th.field_114,',
      '#view_3921 td.field_114,',
      '#view_3921 th.field_2445,',
      '#view_3921 td.field_2445,',
      '#view_3921 th.field_2446,',
      '#view_3921 td.field_2446,',
      '#view_3921 th.field_2447,',
      '#view_3921 td.field_2447,',
      '#view_4093 th.field_114,',
      '#view_4093 td.field_114,',
      '#view_4093 th.field_2445,',
      '#view_4093 td.field_2445,',
      '#view_4093 th.field_2446,',
      '#view_4093 td.field_2446,',
      '#view_4093 th.field_2447,',
      '#view_4093 td.field_2447,',
      // QA fields on PIC — read by device-worksheet for chit state,
      // never displayed as their own column.
      '#view_4093 th.field_2859,',
      '#view_4093 td.field_2859,',
      '#view_4093 th.field_2860,',
      '#view_4093 td.field_2860,',
      '#view_4093 th.field_2861,',
      '#view_4093 td.field_2861,',
      '#view_4093 th.field_2865,',
      '#view_4093 td.field_2865,',
      // "WHAT WE'RE INSTALLING" (view_4056) — same install columns as view_4093.
      '#view_4056 th.field_114,',
      '#view_4056 td.field_114,',
      '#view_4056 th.field_2445,',
      '#view_4056 td.field_2445,',
      '#view_4056 th.field_2446,',
      '#view_4056 td.field_2446,',
      '#view_4056 th.field_2447,',
      '#view_4056 td.field_2447,',
      '#view_4056 th.field_2859,',
      '#view_4056 td.field_2859,',
      '#view_4056 th.field_2860,',
      '#view_4056 td.field_2860,',
      '#view_4056 th.field_2861,',
      '#view_4056 td.field_2861,',
      '#view_4056 th.field_2865,',
      '#view_4056 td.field_2865 {',
      '  display: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Swap thumb_14 → original in an S3 image URL. */
  function toOriginalUrl(url) {
    return url.replace('/thumb_14/', '/original/');
  }

  /** Column count for colspan. */
  function colCount(table) {
    var row = table.querySelector('thead tr');
    if (!row) return 21;
    var n = 0;
    var cells = row.children;
    for (var i = 0; i < cells.length; i++) {
      n += parseInt(cells[i].getAttribute('colspan') || '1', 10);
    }
    return n;
  }

  /**
   * Extract the survey request record ID from the current URL hash.
   * URL pattern: #subcontractor-portal/site-survey-request-details/{surveyRequestId}/...
   */
  function getSurveyRequestId() {
    var hash = window.location.hash || '';
    var match = hash.match(/site-survey-request-details\/([a-f0-9]{24})/);
    return match ? match[1] : '';
  }

  /**
   * Extract the SOW base path from the current URL hash.
   * Supported URL patterns:
   *   #team-calendar/project-dashboard/{id}/build-sow/{id}/...
   *   #team-calendar/project-dashboard/{id}/build-quote/{id}/...
   *   #sales-portal/company-details/{id}/scope-of-work-details/{id}/...
   *   #team-calendar/project-dashboard/{id}/deploy/{id}/...
   */
  function getBuildSowBasePath() {
    var hash = window.location.hash || '';
    var patterns = [
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/review-bids\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/deploy\/[a-f0-9]{24})/,
      /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/,
      /(proposals\/scope-of-work\/[a-f0-9]{24})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = hash.match(patterns[i]);
      if (match) return match[1];
    }
    return '';
  }

  function navigateToHash(hashPath) {
    if (!hashPath) return;
    window.location.hash = hashPath;
  }

  // Views that use the build-sow URL structure instead of survey.
  // Also covers the deploy page (view_4093) which uses the
  // same #team-calendar/project-dashboard/{id}/deploy/{id}/
  // base path — extracted by getBuildSowBasePath().
  var SOW_VIEWS = { 'view_3313': true, 'view_3577': true, 'view_3602': true, 'view_3921': true, 'view_3596': true, 'view_3997': true, 'view_4093': true, 'view_4056': true };

  /** Build the edit-photo hash path for a photo record. */
  function editPhotoHash(photoRecordId, viewId) {
    if (viewId && SOW_VIEWS[viewId]) {
      var sowBase = getBuildSowBasePath();
      if (!sowBase) return '';
      // sales-portal/scope-of-work-details → edit-doc-photo2
      // deploy (view_4093)                → edit-doc-photo3
      // build-sow/build-quote (default)   → edit-photo
      var editSlug;
      if (viewId === 'view_4093' || viewId === 'view_4056') {
        editSlug = 'edit-doc-photo3';
      } else if (sowBase.indexOf('scope-of-work-details') !== -1) {
        editSlug = 'edit-doc-photo2';
      } else {
        editSlug = 'edit-photo';
      }
      return sowBase + '/' + editSlug + '/' + photoRecordId;
    }
    var surveyId = getSurveyRequestId();
    if (!surveyId) return '';
    return 'subcontractor-portal/site-survey-request-details/' +
      surveyId + '/edit-doc-photo/' + photoRecordId;
  }

  /** Build the add-photo hash path (view-specific segment). */
  function addPhotoHash(lineItemId, viewId) {
    if (viewId && SOW_VIEWS[viewId]) {
      var sowBase = getBuildSowBasePath();
      if (!sowBase) return '';
      var pathSegment = ADD_PHOTO_PATHS[viewId] || DEFAULT_ADD_PATH;
      return sowBase + '/' + pathSegment + '/' + lineItemId;
    }
    var surveyId = getSurveyRequestId();
    if (!surveyId) return '';
    var pathSegment = (viewId && ADD_PHOTO_PATHS[viewId]) || DEFAULT_ADD_PATH;
    return 'subcontractor-portal/site-survey-request-details/' +
      surveyId + '/' + pathSegment + '/' + lineItemId;
  }

  /**
   * Find a cell by data-field-key (works for field_771 which has
   * a colon in its CSS class making querySelector unreliable).
   */
  function findCellByFieldKey(tr, fieldKey) {
    var cells = tr.getElementsByTagName('td');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('data-field-key') === fieldKey) return cells[i];
    }
    return null;
  }

  /**
   * Find ALL cells matching data-field-key. Some views render the same
   * field as multiple columns (e.g. raw field_771 + field_771:thumb_14)
   * where only the thumb cell carries the data-kn-img-gallery img.
   */
  function findAllCellsByFieldKey(tr, fieldKey) {
    var out = [];
    var cells = tr.getElementsByTagName('td');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('data-field-key') === fieldKey) out.push(cells[i]);
    }
    return out;
  }

  // ── Photo record extraction ─────────────────────────────────────

  /**
   * Extract all connected photo records from a single line-item row.
   *
   * Returns an array of { id, imgUrl, type, required, completed }
   * sorted by: missing-required first, then type, then id.
   */
  function extractPhotoRecords(tr) {
    var map = {}; // photoRecordId → { imgUrl, type, required, completed }

    /** Ensure a record entry exists in the map. */
    function ensure(rid) {
      if (!map[rid]) {
        map[rid] = { id: rid, imgUrl: '', type: '', typeId: '', required: false, completed: false, notes: '' };
      }
      return map[rid];
    }

    // 1) field_771 — images. Some views render two field_771 columns
    // (raw + thumb_14); only the thumb cell has the data-kn-img-gallery
    // attribute. Walk every matching cell and prefer the first non-empty
    // image URL per record.
    var imgCells = findAllCellsByFieldKey(tr, 'field_771');
    for (var ic = 0; ic < imgCells.length; ic++) {
      var imgSpans = imgCells[ic].querySelectorAll('span[id][data-kn="connection-value"]');
      for (var i = 0; i < imgSpans.length; i++) {
        var rid = (imgSpans[i].id || '').trim();
        if (!rid) continue;
        var rec = ensure(rid);
        if (rec.imgUrl) continue;
        var img = imgSpans[i].querySelector('img[data-kn-img-gallery]');
        var url = img ? img.getAttribute('data-kn-img-gallery') : '';
        if (!url && img) url = img.getAttribute('src') || '';
        if (url) rec.imgUrl = url;
      }
    }

    // 2) field_2445 — photo type (CONFIG_photo type)
    var typeCell = tr.querySelector('td.field_2445');
    if (typeCell) {
      var outerSpans = typeCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var j = 0; j < outerSpans.length; j++) {
        var rid2 = (outerSpans[j].id || '').trim();
        if (!rid2) continue;
        var inner = outerSpans[j].querySelector('span[data-kn="connection-value"]');
        var rec2 = ensure(rid2);
        rec2.type = inner ? inner.textContent.trim() : '';
        rec2.typeId = inner ? (inner.id || '').trim() : '';
      }
    }

    // 3) field_2446 — required (Yes/No)
    var reqCell = tr.querySelector('td.field_2446');
    if (reqCell) {
      var reqSpans = reqCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var r = 0; r < reqSpans.length; r++) {
        var rid3 = (reqSpans[r].id || '').trim();
        if (!rid3) continue;
        var val = (reqSpans[r].textContent || '').trim().toLowerCase();
        ensure(rid3).required = (val === 'yes');
      }
    }

    // 4) field_2447 — completed (Yes/No)
    var compCell = tr.querySelector('td.field_2447');
    if (compCell) {
      var compSpans = compCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var c = 0; c < compSpans.length; c++) {
        var rid4 = (compSpans[c].id || '').trim();
        if (!rid4) continue;
        var cval = (compSpans[c].textContent || '').trim().toLowerCase();
        ensure(rid4).completed = (cval === 'yes');
      }
    }

    // 5) field_114 — INPUT_notes
    var notesCell = tr.querySelector('td.field_114');
    if (notesCell) {
      var notesSpans = notesCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var n = 0; n < notesSpans.length; n++) {
        var rid5 = (notesSpans[n].id || '').trim();
        if (!rid5) continue;
        ensure(rid5).notes = (notesSpans[n].textContent || '').trim();
      }
    }

    // Convert to sorted array
    var arr = [];
    for (var k in map) {
      if (map.hasOwnProperty(k)) arr.push(map[k]);
    }

    // Sort: missing-required (required + incomplete) first, then required, then by type, then id
    arr.sort(function (a, b) {
      var aMissing = (a.required && !a.completed) ? 0 : 1;
      var bMissing = (b.required && !b.completed) ? 0 : 1;
      if (aMissing !== bMissing) return aMissing - bMissing;
      var aReq = a.required ? 0 : 1;
      var bReq = b.required ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.id.localeCompare(b.id);
    });

    return arr;
  }

  // ── Drag-and-drop handlers ─────────────────────────────────────

  // We deliberately DO NOT use native HTML5 drag-and-drop here. Inside
  // Knack/KTL the native gesture proved unreliable across browsers and
  // re-renders — repeatedly we'd see `dragstart` fire yet the drag never
  // visibly engage (no ghost, no droppable targets), and drops silently
  // failed. This is a pointer-based drag we fully control: a floating
  // clone follows the cursor and we hit-test the slot underneath with
  // document.elementFromPoint. It depends on NONE of the native drag
  // machinery (draggable attr, -webkit-user-drag, dataTransfer, the
  // browser ghost image), so Knack can't interfere with it.

  var dragSourceCard = null;   // card actively being dragged
  var pendingSource  = null;   // mousedown candidate (promotes to source past threshold)
  var pendingX = 0, pendingY = 0;
  var dragClone = null;        // floating ghost element that follows the cursor
  var dragHoverCard = null;    // current DROP_OK card under the cursor
  var justDragged = false;     // guards the click handler right after a drop
  var DRAG_THRESHOLD = 5;      // px of movement before a press becomes a drag

  /** Resolve the photo card from an event. */
  function cardFromEvent(e) {
    return (e.target && e.target.closest) ? e.target.closest('.' + CARD_CLS) : null;
  }

  /** Find the parent strip element for a card. Falls back to the card's
   *  immediate parent so target-scoping still works if the strip wrapper
   *  class isn't found (e.g. a moved/re-wrapped card). */
  function getStrip(card) {
    var el = card.parentElement;
    while (el && !el.classList.contains(STRIP_CLS)) el = el.parentElement;
    return el || card.parentElement;
  }

  /** Highlight valid drop targets in the same strip: any OTHER photo card
   *  that is still EMPTY (no image yet) — required or not. The drag gesture
   *  itself works on every row (confirmed via probe: dragstart fires, cards
   *  are draggable); the original empty-AND-required rule meant that once a
   *  row's required slots were filled there were no targets left to light
   *  up, so the photo lifted but had nowhere to go and snapped back — which
   *  reads as "can't pick it up." Lighting up every open slot lets you keep
   *  assigning photos to the remaining type slots. (Filled slots stay
   *  excluded so a drop can never silently overwrite an existing photo.) */
  function highlightTargets(strip, sourceId) {
    if (!strip) return;
    var cards = strip.querySelectorAll('.' + CARD_CLS);
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.getAttribute('data-photo-id') === sourceId) continue;
      if (c.getAttribute('data-photo-has-image') === 'true') continue;
      c.classList.add(DROP_OK_CLS);
    }
  }

  /** Clear all drag highlights. */
  function clearHighlights() {
    var all = document.querySelectorAll('.' + DROP_OK_CLS + ', .' + DROP_HOVER_CLS);
    for (var i = 0; i < all.length; i++) {
      all[i].classList.remove(DROP_OK_CLS, DROP_HOVER_CLS);
    }
  }

  /** Build the floating ghost that follows the cursor during a drag. */
  function makeClone(card) {
    var clone = document.createElement('div');
    clone.className = 'scw-photo-drag-clone';
    var img = card.querySelector('img');
    if (img) {
      var ci = document.createElement('img');
      ci.src = img.src;
      clone.appendChild(ci);
    }
    document.body.appendChild(clone);
    return clone;
  }

  function positionClone(x, y) {
    if (dragClone) { dragClone.style.left = x + 'px'; dragClone.style.top = y + 'px'; }
  }

  /** The DROP_OK card under the cursor (clone temporarily hidden so it
   *  doesn't shadow elementFromPoint). Returns null if none. */
  function targetUnder(x, y) {
    var prev = dragClone ? dragClone.style.display : null;
    if (dragClone) dragClone.style.display = 'none';
    var el = document.elementFromPoint(x, y);
    if (dragClone) dragClone.style.display = prev || '';
    var card = (el && el.closest) ? el.closest('.' + CARD_CLS) : null;
    return (card && card.classList.contains(DROP_OK_CLS)) ? card : null;
  }

  function startDrag(card, x, y) {
    dragSourceCard = card;
    card.classList.add(DRAG_SRC_CLS);
    dragClone = makeClone(card);
    positionClone(x, y);
    var strip = getStrip(card);
    if (strip) highlightTargets(strip, card.getAttribute('data-photo-id'));
    document.body.classList.add('scw-photo-dragging');
  }

  /** Tear down the drag. If dropTarget is a valid slot, fire the confirm. */
  function endDrag(dropTarget) {
    if (dragClone && dragClone.parentNode) dragClone.parentNode.removeChild(dragClone);
    dragClone = null;
    if (dragHoverCard) { dragHoverCard.classList.remove(DROP_HOVER_CLS); dragHoverCard = null; }
    var src = dragSourceCard;
    if (src) src.classList.remove(DRAG_SRC_CLS);
    clearHighlights();
    document.body.classList.remove('scw-photo-dragging');
    dragSourceCard = null;

    if (dropTarget && src) {
      var detail = {
        sourceRecordId:  src.getAttribute('data-photo-id'),
        sourcePhotoType: src.getAttribute('data-photo-type') || '',
        sourceRequired:  src.getAttribute('data-photo-required') === 'true',
        sourceNotes:     src.getAttribute('data-photo-notes') || '',
        targetRecordId:  dropTarget.getAttribute('data-photo-id'),
        targetPhotoType: dropTarget.getAttribute('data-photo-type') || 'this slot',
        targetRequired:  dropTarget.getAttribute('data-photo-required') === 'true',
        targetNotes:     dropTarget.getAttribute('data-photo-notes') || '',
        surveyRequestId: getSurveyRequestId()
      };
      showConfirmation(dropTarget, detail);
    }
  }

  function onPhotoMouseDown(e) {
    if (e.button !== 0) return;                       // left button only
    var card = cardFromEvent(e);
    if (!card || card.getAttribute('data-photo-has-image') !== 'true') return;
    pendingSource = card;
    pendingX = e.clientX;
    pendingY = e.clientY;
  }

  function onPhotoMouseMove(e) {
    if (dragSourceCard) {
      positionClone(e.clientX, e.clientY);
      var t = targetUnder(e.clientX, e.clientY);
      if (t !== dragHoverCard) {
        if (dragHoverCard) dragHoverCard.classList.remove(DROP_HOVER_CLS);
        dragHoverCard = t;
        if (dragHoverCard) dragHoverCard.classList.add(DROP_HOVER_CLS);
      }
      e.preventDefault();                             // suppress text selection
      return;
    }
    if (pendingSource) {
      var dx = e.clientX - pendingX, dy = e.clientY - pendingY;
      if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
        startDrag(pendingSource, e.clientX, e.clientY);
        pendingSource = null;
      }
    }
  }

  function onPhotoMouseUp(e) {
    if (dragSourceCard) {
      var t = targetUnder(e.clientX, e.clientY);
      // Block the click that follows a drag so we don't navigate to edit.
      justDragged = true;
      setTimeout(function () { justDragged = false; }, 0);
      endDrag(t);
      e.preventDefault();
    }
    pendingSource = null;
  }

  function onPhotoKeyDown(e) {
    if (e.key === 'Escape' && dragSourceCard) endDrag(null);
  }

  // Pointer wiring — bound once on document so it works regardless of where
  // a photo card lives (e.g. a wsTr moved into the bid-review expand panel)
  // or how often the strip is rebuilt.
  if (!document.documentElement.hasAttribute('data-scw-photo-drag-bound')) {
    document.documentElement.setAttribute('data-scw-photo-drag-bound', '1');
    document.addEventListener('mousedown', onPhotoMouseDown, true);
    document.addEventListener('mousemove', onPhotoMouseMove, true);
    document.addEventListener('mouseup',   onPhotoMouseUp,   true);
    document.addEventListener('keydown',   onPhotoKeyDown,   true);
  }

  /** Show a confirmation overlay on the target card before dispatching. */
  function showConfirmation(card, detail) {
    card.style.position = 'relative';
    var overlay = document.createElement('div');
    overlay.className = CONFIRM_CLS;
    overlay.innerHTML =
      '<div class="scw-confirm-text">Use this photo for<br><b>' +
      detail.targetPhotoType + '</b>?</div>' +
      '<div class="scw-confirm-btns">' +
        '<button class="scw-confirm-yes">Confirm</button>' +
        '<button class="scw-confirm-no">Cancel</button>' +
      '</div>';

    overlay.querySelector('.scw-confirm-yes').addEventListener('click', function () {
      overlay.remove();
      dispatchPhotoDrop(card, detail);
    });

    overlay.querySelector('.scw-confirm-no').addEventListener('click', function () {
      overlay.remove();
    });

    card.appendChild(overlay);
  }

  /**
   * Dispatch the photo-drop to the registered handler.
   *
   * Default: POST metadata to the configured Make webhook.
   * Override: set window.SCW.onPhotoDrop = function(detail, ui) { … }
   *
   *   detail — { sourceRecordId, sourcePhotoType, targetRecordId,
   *              targetPhotoType, surveyRequestId }
   *
   *   ui     — { setPending(), setSuccess(), setError(msg) }
   *            Helper to control the target card's visual state.
   */
  function dispatchPhotoDrop(card, detail) {
    var ui = buildDropUI(card);

    // Check for custom callback first
    if (window.SCW && typeof window.SCW.onPhotoDrop === 'function') {
      window.SCW.onPhotoDrop(detail, ui);
      return;
    }

    // Default: POST to Make webhook
    var webhookUrl = (window.SCW && window.SCW.CONFIG && window.SCW.CONFIG.MAKE_PHOTO_MOVE_WEBHOOK) || '';
    if (!webhookUrl) {
      console.error('[SCW] No MAKE_PHOTO_MOVE_WEBHOOK configured and no onPhotoDrop callback registered');
      return;
    }

    ui.setPending();

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detail)
    })
    .then(function (resp) {
      if (!resp.ok) throw new Error('Webhook returned ' + resp.status);
      return resp.json().catch(function () { return {}; });
    })
    .then(function () {
      ui.setSuccess();
    })
    .catch(function (err) {
      console.error('[SCW] Photo drop handler error:', err);
      ui.setError('Failed — click to retry');
    });
  }

  // ── Direct upload via Make webhook ──────────────────────────────
  // Browser reads the file as base64 and POSTs to MAKE_PHOTO_UPLOAD_WEBHOOK.
  // Make decodes + uploads to Knack's REST API. We can't call the REST
  // API directly because that needs the X-Knack-REST-API-Key, which we
  // can't ship in client JS.

  // photoRecordId → true while an upload + post-upload poll is in flight.
  // processView consults this to re-apply the spinner overlay if the
  // strip re-renders during the poll window.
  var pendingUploads = {};
  var POLL_INTERVAL_MS = 4000;
  var POLL_TIMEOUT_MS  = 90000;

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // result is "data:image/jpeg;base64,XXXXX" — strip the prefix.
        var s = reader.result || '';
        var comma = String(s).indexOf(',');
        resolve(comma >= 0 ? String(s).substring(comma + 1) : String(s));
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  function getTriggeredBy() {
    try {
      var u = window.Knack && Knack.getUserAttributes && Knack.getUserAttributes();
      if (u) return { id: u.id || '', name: u.name || '', email: u.email || '' };
    } catch (e) { /* ignore */ }
    return { id: '', name: '', email: '' };
  }

  function dispatchPhotoUpload(card, photoRecordId, lineItemId, viewId, file) {
    var ui = buildDropUI(card);
    var webhookUrl = (window.SCW && window.SCW.CONFIG &&
                      window.SCW.CONFIG.MAKE_PHOTO_UPLOAD_WEBHOOK) || '';
    if (!webhookUrl) {
      console.error('[SCW] MAKE_PHOTO_UPLOAD_WEBHOOK not configured');
      ui.setError('Upload not configured');
      return;
    }
    if (!file) return;
    // Conservative cap — base64 inflates by 4/3, Make webhooks bog down
    // past ~25MB body. iPhone photos are typically 3–8MB so this is plenty.
    if (file.size > 20 * 1024 * 1024) {
      ui.setError('File too large (max 20MB)');
      return;
    }

    pendingUploads[photoRecordId] = true;
    ui.setPending();

    readFileAsBase64(file).then(function (b64) {
      return fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoRecordId: photoRecordId,
          lineItemId:    lineItemId,
          viewId:        viewId,
          filename:      file.name || 'photo.jpg',
          mimeType:      file.type || 'image/jpeg',
          sizeBytes:     file.size,
          dataBase64:    b64,
          triggeredBy:   getTriggeredBy()
        })
      });
    }).then(function (resp) {
      // Webhook contract:
      //   { success: true }              → Knack upload finished, stop polling
      //   { success: false, error: "..."} → show error, stop polling
      //   anything else (no body, opaque CORS, 408 from Make's 40s
      //   timeout, network glitch) → fall back to polling so a slow
      //   scenario that finishes in the background still updates the UI.
      if (resp && resp.status && resp.status >= 400) {
        throw new Error('Webhook returned ' + resp.status);
      }
      // Permissive body parse — accept JSON even if Make's response
      // header isn't application/json (Make's "Webhook response" module
      // sometimes defaults to text/plain).
      return resp.text().then(function (txt) {
        var body = null;
        try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = null; }
        console.log('[SCW] photo upload webhook response:', resp.status, txt);
        return body;
      }).then(function (body) {
        if (body && body.success === false) {
          delete pendingUploads[photoRecordId];
          ui.setError(body.error || 'Upload failed');
          return;
        }
        if (body && body.success === true) {
          // Make says the Knack record is updated. One fetch + fast DOM
          // poll (500ms × up to 6s) to catch the re-render quickly. Then
          // fall back to the slower long-poll loop as a safety net.
          var v = window.Knack && Knack.views && Knack.views[viewId];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
          var ticks = 0;
          (function fastCheck() {
            if (!pendingUploads[photoRecordId]) return;
            if (photoHasImageInDOM(viewId, photoRecordId)) {
              delete pendingUploads[photoRecordId];
              return;
            }
            ticks++;
            if (ticks < 12) {
              setTimeout(fastCheck, 500);
            } else {
              pollForPhotoArrival(photoRecordId, viewId);
            }
          })();
          return;
        }
        // No structured response → original polling behaviour.
        pollForPhotoArrival(photoRecordId, viewId);
      });
    }).catch(function (err) {
      console.error('[SCW] Photo upload error:', err);
      delete pendingUploads[photoRecordId];
      ui.setError('Upload failed — click to retry');
    });
  }

  // After the webhook succeeds, Make's actual upload to Knack runs
  // asynchronously. Poll the view's model until the photo record's
  // field_771 has an image URL, then stop — the natural re-render path
  // (model.fetch → knack-view-render → processView) will swap the spinner
  // card for the real image card.
  function pollForPhotoArrival(photoRecordId, viewId) {
    var startedAt = Date.now();

    function tick() {
      if (!pendingUploads[photoRecordId]) return;

      var v = window.Knack && Knack.views && Knack.views[viewId];
      if (!v || !v.model || typeof v.model.fetch !== 'function') {
        delete pendingUploads[photoRecordId];
        return;
      }

      v.model.fetch();

      // Give the fetch + view re-render a beat to settle, then check the
      // DOM. processView re-runs on knack-view-render and will re-apply
      // the spinner if pendingUploads still has us.
      setTimeout(function () {
        if (photoHasImageInDOM(viewId, photoRecordId)) {
          delete pendingUploads[photoRecordId];
          return;
        }
        if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
          delete pendingUploads[photoRecordId];
          console.warn('[SCW] Photo upload poll timed out for', photoRecordId);
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      }, 1000);
    }

    setTimeout(tick, POLL_INTERVAL_MS);
  }

  function photoHasImageInDOM(viewId, photoRecordId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return false;
    // field_771 may render two cells (raw + thumb_14) — either with an
    // <img> means the upload landed.
    var spans = viewEl.querySelectorAll(
      'td[data-field-key="field_771"] span[id][data-kn="connection-value"],' +
      'td.field_771 span[id][data-kn="connection-value"]'
    );
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].id !== photoRecordId) continue;
      if (spans[i].querySelector('img')) return true;
    }
    return false;
  }

  function openFilePickerForUpload(card, photoRecordId, lineItemId, viewId) {
    // Per-click <input type=file> — disposable so the same file can be
    // re-picked after a failed upload without resetting any persistent
    // input element.
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (file) dispatchPhotoUpload(card, photoRecordId, lineItemId, viewId, file);
      document.body.removeChild(input);
    });
    document.body.appendChild(input);
    input.click();
  }

  /**
   * Build a UI control object for the target card.
   * Lets the callback (or default handler) drive visual state
   * without touching DOM directly.
   */
  function buildDropUI(card) {
    var emptyEl = card.querySelector('.' + EMPTY_CLS);

    // Inject spinner keyframes if not present
    if (!document.getElementById('scw-spin-keyframes')) {
      var kf = document.createElement('style');
      kf.id = 'scw-spin-keyframes';
      kf.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
      document.head.appendChild(kf);
    }

    return {
      /** Show spinning gear + "Processing…" */
      setPending: function () {
        card.classList.add(PENDING_CLS);
        if (emptyEl) {
          emptyEl.innerHTML =
            '<span class="scw-empty-icon" style="animation: spin 1s linear infinite">&#9881;</span>' +
            '<span>Processing\u2026</span>';
        }
      },

      /** Clear pending state and refresh the parent view. */
      setSuccess: function () {
        card.classList.remove(PENDING_CLS);
        if (typeof Knack !== 'undefined' && Knack.views) {
          for (var vi = 0; vi < TARGET_VIEWS.length; vi++) {
            var v = Knack.views[TARGET_VIEWS[vi]];
            if (v && v.model) v.model.fetch();
          }
        }
      },

      /** Show warning icon + message. Click retries the last dispatchPhotoDrop. */
      setError: function (msg) {
        card.classList.remove(PENDING_CLS);
        if (emptyEl) {
          emptyEl.innerHTML =
            '<span class="scw-empty-icon">&#9888;</span>' +
            '<span>' + (msg || 'Error') + '</span>';
          emptyEl.style.cursor = 'pointer';
        }
      }
    };
  }

  // ── DOM injection ───────────────────────────────────────────────

  function processView(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    // Skip hidden views entirely. On worksheet-v2 pages the native Knack
    // table is `display:none !important` (v2 renders its own cards AND its
    // own photo strips via worksheet-v2/photos.js), so building inline-
    // photo-row strips in that hidden table is pure invisible work — it was
    // the single heaviest handler on view_3586 (~10ms PER render) and the
    // user never sees any of it. offsetParent is null whenever the element
    // or any ancestor is display:none, so this one check covers every
    // v2-cutover view (view_3586/3915/4056/3505/3610) automatically, and
    // self-corrects on any scene where the view IS visible (v1 still primary).
    if (viewEl.offsetParent === null) return;

    var table = viewEl.querySelector('table.kn-table');
    if (!table) return;

    // When mdf-idf-cards owns this view (view_3577 + MDF/IDF siblings) the
    // native table is display:none and the visible surface is .scw-mdf-card
    // nodes. In that mode we inject the strip INTO the matching card instead
    // of the hidden table; mdf-idf-cards re-calls SCW.inlinePhotoRow.refresh()
    // after it rebuilds cards so the strip survives its innerHTML reset.
    var cardsMode = viewEl.classList.contains('scw-mdf-cards-on');

    var cols = colCount(table);
    var rows = table.querySelectorAll('tbody tr');

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];

      // Skip group headers and already-injected rows
      if (tr.classList.contains('kn-table-group')) continue;
      if (tr.classList.contains(ROW_CLS)) continue;

      // Skip rows without a record ID
      var lineItemId = tr.getAttribute('id');
      if (!lineItemId) continue;

      // Idempotency: if this data row already has its photo row injected
      // (a partial re-render that didn't wipe it, or a debounced second
      // pass), don't build and inject a duplicate. Skipped in cards mode —
      // there the strip lives in the location card (rebuilt idempotently
      // below), not as a sibling <tr>.
      if (!cardsMode) {
        var existingNext = tr.nextElementSibling;
        if (existingNext && existingNext.classList &&
            existingNext.classList.contains(ROW_CLS)) continue;
      }

      // Get the label for alt text
      var labelCell = tr.querySelector('td.field_2364') || tr.querySelector('td.field_1642');
      var labelText = labelCell ? (labelCell.textContent || '').trim() : '';

      // Extract all connected photo records
      var photos = extractPhotoRecords(tr);

      var strip = document.createElement('div');
      strip.className = STRIP_CLS;

      // ── "+" Add photo button (appended at end of strip) ──
      var addBtn = document.createElement('div');
      addBtn.className = ADD_BTN_CLS;
      addBtn.innerHTML =
        '<span class="scw-add-icon">+</span>' +
        '<span>Add</span>';
      addBtn.title = 'Add a new photo record';
      // Click handled by the single delegated listener registered at
      // module init — see init block below. Attributes carry the
      // payload so we don't need a per-row closure.
      addBtn.setAttribute('data-scw-photo-action', 'add');
      addBtn.setAttribute('data-scw-line-id', lineItemId);

      if (photos.length === 0) {
        addBtn.classList.add('scw-photo-add-solo');
      }

      if (photos.length > 0) {
        // ── Has connected photo records ──
        for (var p = 0; p < photos.length; p++) {
          var photo = photos[p];
          var isMissing = photo.required && !photo.completed;
          var card = document.createElement('div');
          card.className = CARD_CLS;
          if (photo.required) card.classList.add(REQ_CLS);

          // Data attributes for drag-and-drop
          card.setAttribute('data-photo-id', photo.id);
          card.setAttribute('data-photo-type', photo.type || '');
          card.setAttribute('data-photo-type-id', photo.typeId || '');
          card.setAttribute('data-photo-required', photo.required ? 'true' : 'false');
          card.setAttribute('data-photo-has-image', photo.imgUrl ? 'true' : 'false');
          card.setAttribute('data-photo-notes', photo.notes || '');

          if (photo.imgUrl) {
            // Photo with image — a POINTER-drag source (the pointer engine
            // above tracks mousedown/move/up on .scw-inline-photo-card). We
            // explicitly DISABLE native dragging on both the card and the
            // image so the browser's flaky native drag can't hijack the
            // pointer gesture mid-drag.
            card.setAttribute('draggable', 'false');

            var imgEl = document.createElement('img');
            imgEl.className = IMG_CLS;
            imgEl.setAttribute('draggable', 'false');
            imgEl.src = photo.imgUrl;
            imgEl.alt = labelText
              ? (photo.type || 'Photo') + ' for ' + labelText
              : 'Site survey photo';
            imgEl.title = 'Drag to an empty required slot, or click to edit';
            // Click → edit handled by the delegated listener at module
            // init. The card already carries data-photo-id; we just tag
            // it as an edit target so the handler picks it up.
            card.setAttribute('data-scw-photo-action', 'edit');
            card.appendChild(imgEl);
          } else {
            // Photo record exists but no image uploaded — potential drop target
            var empty = document.createElement('div');
            empty.className = EMPTY_CLS;
            if (isMissing) empty.classList.add(MISSING_CLS);
            empty.innerHTML =
              '<span class="scw-empty-icon">&#128247;</span>' +
              '<span>' + (isMissing ? 'Required' : 'Upload photo') + '</span>';

            // Click → edit-doc-photo page, handled by the delegated
            // listener at module init. The card already carries
            // data-photo-id; tag the card as an edit target so the
            // handler picks it up regardless of where on the card the
            // user clicked. (The previous inline-upload-via-Make path
            // is left behind in openFilePickerForUpload /
            // dispatchPhotoUpload for possible future revival.)
            empty.title = photo.type
              ? 'Upload: ' + photo.type
              : 'Click to edit photo';
            card.setAttribute('data-scw-photo-action', 'edit');
            card.appendChild(empty);

            // If an upload+poll cycle is still in flight for this record,
            // re-apply the spinner so the visual state survives the
            // re-render that model.fetch triggers each poll tick.
            if (pendingUploads[photo.id]) {
              buildDropUI(card).setPending();
            }

            // Drop helper text (hidden until this card becomes a drag
            // target). Added for every empty slot now — any open slot is a
            // valid target, not just required ones.
            var helper = document.createElement('div');
            helper.className = 'scw-drop-helper';
            helper.textContent = 'Drop to use for ' + (photo.type || 'this slot');
            card.appendChild(helper);

            // Drop-target events are delegated on document (see the
            // one-time binding near the drag handlers) so a moved /
            // re-rendered card still accepts drops.
          }

          // Photo type label beneath
          if (photo.type) {
            var typeEl = document.createElement('div');
            typeEl.className = TYPE_CLS;
            typeEl.textContent = photo.type;
            typeEl.title = photo.type;
            card.appendChild(typeEl);
          }

          // Required chip — red if incomplete, green with checkmark if complete
          if (photo.required) {
            var chip = document.createElement('div');
            chip.className = REQ_CHIP_CLS;
            if (photo.completed) {
              chip.classList.add(REQ_CHIP_GREEN_CLS);
              chip.textContent = '\u2713 Required';
            } else {
              chip.textContent = 'Required';
            }
            card.appendChild(chip);
          }

          // Notes beneath the card
          if (photo.notes) {
            var notesEl = document.createElement('div');
            notesEl.className = NOTES_CLS;
            notesEl.textContent = photo.notes;
            notesEl.title = photo.notes;
            card.appendChild(notesEl);
          }

          strip.appendChild(card);
        }
      }

      // ── Append "+" button at the end ──
      strip.appendChild(addBtn);

      // Wrap strip in a field-like layout with a "Photos" label
      var fieldWrapper = document.createElement('div');
      fieldWrapper.className = 'scw-inline-photo-field';

      var photoLabel = document.createElement('div');
      photoLabel.className = 'scw-inline-photo-label';
      photoLabel.textContent = 'Photos';

      fieldWrapper.appendChild(photoLabel);
      fieldWrapper.appendChild(strip);

      if (cardsMode) {
        // mdf-idf-cards mode: drop the strip into the matching location card
        // (the native table it lives in is hidden). Idempotent — replace any
        // strip a prior pass left so re-renders don't stack duplicates.
        var ownerCard = viewEl.querySelector(
          '.scw-mdf-card[data-rec-id="' + lineItemId + '"]');
        if (ownerCard) {
          var prevHolder = ownerCard.querySelector('.scw-mdf-card__photos');
          if (prevHolder) ownerCard.removeChild(prevHolder);
          var holder = document.createElement('div');
          holder.className = 'scw-mdf-card__photos';
          holder.appendChild(fieldWrapper);
          ownerCard.appendChild(holder);
        }
        // No matching card yet (cards not built this pass) → discard; the
        // refresh() call from mdf-idf-cards rebuilds once cards exist.
      } else {
        var photoTr = document.createElement('tr');
        photoTr.className = ROW_CLS;
        var td = document.createElement('td');
        td.setAttribute('colspan', String(cols));
        td.appendChild(fieldWrapper);
        photoTr.appendChild(td);
        tr.parentNode.insertBefore(photoTr, tr.nextSibling);
      }
    }
  }

  // ── Init ────────────────────────────────────────────────────────
  injectCss();

  // Single delegated click listener for every photo-card "Add" / "Edit"
  // action across every TARGET view. Replaces the per-card / per-image
  // / per-empty addEventListener calls that processView used to attach
  // — on a view with 100 rows × 5 photos each, that was ~600 listener
  // attaches per render. Now: 1 listener for the lifetime of the page.
  //
  // Routing is by data-scw-photo-action on the closest ancestor:
  //   - addBtn   → action="add",  data-scw-line-id on the same element
  //   - card     → action="edit", data-photo-id    on the same element
  // viewId is read from the enclosing .kn-view ancestor, gated by
  // TARGET_VIEWS so we never claim a click on someone else's grid.
  var TARGET_VIEW_SET = {};
  for (var tv = 0; tv < TARGET_VIEWS.length; tv++) TARGET_VIEW_SET[TARGET_VIEWS[tv]] = true;

  document.addEventListener('click', function (e) {
    // A pointer drag ends with a click on the source card — swallow it so
    // dropping a photo doesn't also navigate to its edit page.
    if (justDragged) { justDragged = false; return; }
    var target = e.target && e.target.closest && e.target.closest('[data-scw-photo-action]');
    if (!target) return;
    var viewEl = target.closest('.kn-view');
    if (!viewEl || !TARGET_VIEW_SET[viewEl.id]) return;

    var action = target.getAttribute('data-scw-photo-action');
    if (action === 'add') {
      var lineId = target.getAttribute('data-scw-line-id');
      if (!lineId) return;
      // Identity-aware bulk upload first; fall back to the Knack add-photo
      // edit page when the modal isn't applicable (MDF/IDF view, module not
      // loaded, or CONFIG.PHOTO_ADD_BULK_MODAL off).
      if (openBulkForLineItem(lineId, viewEl.id)) return;
      var addH = addPhotoHash(lineId, viewEl.id);
      if (addH) navigateToHash(addH);
    } else if (action === 'edit') {
      var photoId = target.getAttribute('data-photo-id');
      if (!photoId) return;
      var editH = editPhotoHash(photoId, viewEl.id);
      if (editH) navigateToHash(editH);
    }
  });

  // Debounced per-view processing. Knack re-renders a view several times
  // for a single user action (inline edit → model.fetch → render, plus our
  // own cascade refetches), and processView rebuilds every photo row from
  // scratch (~10-40ms each) on every one of them. Coalescing the burst into
  // a single rebuild is the dominant win — photo rows already vanish/reappear
  // on each render, so the short delay is imperceptible, and the idempotency
  // guard in processView keeps a surviving row from being duplicated.
  var PROCESS_DEBOUNCE_MS = 50;
  var _processTimers = {};
  function scheduleProcess(vid) {
    if (_processTimers[vid]) clearTimeout(_processTimers[vid]);
    _processTimers[vid] = setTimeout(function () {
      _processTimers[vid] = null;
      var done = (window.SCW && SCW.perf)
        ? SCW.perf('inline-photo-row ' + vid) : null;
      processView(vid);
      if (done) done();
    }, PROCESS_DEBOUNCE_MS);
  }

  for (var v = 0; v < TARGET_VIEWS.length; v++) {
    (function (vid) {
      $(document).on('knack-view-render.' + vid, function () {
        scheduleProcess(vid);
      });
    })(TARGET_VIEWS[v]);
  }

  // Synchronous refresh hook so mdf-idf-cards can re-inject the photo strip
  // into the location cards immediately after it rebuilds them — its
  // container.innerHTML reset wipes any strip we injected, so it calls this
  // right after to repaint. See processView's cardsMode branch.
  window.SCW = window.SCW || {};
  SCW.inlinePhotoRow = SCW.inlinePhotoRow || {};
  SCW.inlinePhotoRow.refresh = function (viewKey) {
    try { processView(viewKey); } catch (e) {}
  };
})();
/*************  Inline Photo Rows – view_3512  **********************/
