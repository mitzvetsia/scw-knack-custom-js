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
  var TARGET_VIEWS = ['view_3512', 'view_3505', 'view_3559', 'view_3577', 'view_3602', 'view_3313', 'view_3586', 'view_3596', 'view_3608', 'view_3610', 'view_3617', 'view_3800', 'view_3803'];
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
    'view_3610': 'add-photo-to-sow-line-item',
    'view_3586': 'add-photo-to-sow-line-item',
    'view_3559': 'add-photo-to-mdf-idf',
    'view_3577': 'add-photo-to-mdf-idf2',
    'view_3602': 'add-photo-to-mdf-idf2',
    'view_3596': 'add-photo-to-sow-line-item3',
    'view_3608': 'add-photo-to-sow-line-item2',
    'view_3617': 'add-photo-to-mdf-idf4',
    'view_3803': 'add-photo-to-mdf-idf'
  };
  var DEFAULT_ADD_PATH = 'add-photo-to-survey-line-item';

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
      '  cursor: pointer;',
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
      '#view_3505 th.field_114,',
      '#view_3505 td.field_114,',
      '#view_3505 th.field_2445,',
      '#view_3505 td.field_2445,',
      '#view_3505 th.field_2446,',
      '#view_3505 td.field_2446,',
      '#view_3505 th.field_2447,',
      '#view_3505 td.field_2447,',
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
      '#view_3313 th.field_114,',
      '#view_3313 td.field_114,',
      '#view_3313 th.field_2445,',
      '#view_3313 td.field_2445,',
      '#view_3313 th.field_2446,',
      '#view_3313 td.field_2446,',
      '#view_3313 th.field_2447,',
      '#view_3313 td.field_2447,',
      '#view_3610 th.field_114,',
      '#view_3610 td.field_114,',
      '#view_3610 th.field_2445,',
      '#view_3610 td.field_2445,',
      '#view_3610 th.field_2446,',
      '#view_3610 td.field_2446,',
      '#view_3610 th.field_2447,',
      '#view_3610 td.field_2447,',
      '#view_3586 th.field_114,',
      '#view_3586 td.field_114,',
      '#view_3586 th.field_2445,',
      '#view_3586 td.field_2445,',
      '#view_3586 th.field_2446,',
      '#view_3586 td.field_2446,',
      '#view_3586 th.field_2447,',
      '#view_3586 td.field_2447 {',
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
   */
  function getBuildSowBasePath() {
    var hash = window.location.hash || '';
    var patterns = [
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
      /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/,
      /(proposals\/scope-of-work\/[a-f0-9]{24})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = hash.match(patterns[i]);
      if (match) return match[1];
    }
    return '';
  }

  // Views that use the build-sow URL structure instead of survey
  var SOW_VIEWS = { 'view_3313': true, 'view_3577': true, 'view_3602': true, 'view_3586': true, 'view_3610': true, 'view_3596': true };

  /** Build the edit-photo hash path for a photo record. */
  function editPhotoHash(photoRecordId, viewId) {
    if (viewId && SOW_VIEWS[viewId]) {
      var sowBase = getBuildSowBasePath();
      if (!sowBase) return '';
      // sales-portal/scope-of-work-details uses edit-doc-photo2; build-sow/build-quote uses edit-photo
      var editSlug = sowBase.indexOf('scope-of-work-details') !== -1 ? 'edit-doc-photo2' : 'edit-photo';
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

    // 1) field_771 — images
    var imgCell = findCellByFieldKey(tr, 'field_771');
    if (imgCell) {
      var imgSpans = imgCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var i = 0; i < imgSpans.length; i++) {
        var rid = (imgSpans[i].id || '').trim();
        if (!rid) continue;
        var rec = ensure(rid);
        var img = imgSpans[i].querySelector('img[data-kn-img-gallery]');
        rec.imgUrl = img ? img.getAttribute('data-kn-img-gallery') : '';
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

  var dragSourceCard = null;

  /** Find the parent strip element for a card. */
  function getStrip(card) {
    var el = card.parentElement;
    while (el && !el.classList.contains(STRIP_CLS)) el = el.parentElement;
    return el;
  }

  /** Highlight all valid empty-required targets in the same strip. */
  function highlightTargets(strip, sourceId) {
    var cards = strip.querySelectorAll('.' + CARD_CLS);
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.getAttribute('data-photo-id') === sourceId) continue;
      if (c.getAttribute('data-photo-has-image') === 'true') continue;
      if (c.getAttribute('data-photo-required') !== 'true') continue;
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

  function handleDragStart(e) {
    dragSourceCard = e.currentTarget;
    dragSourceCard.classList.add(DRAG_SRC_CLS);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', dragSourceCard.getAttribute('data-photo-id'));

    var strip = getStrip(dragSourceCard);
    if (strip) highlightTargets(strip, dragSourceCard.getAttribute('data-photo-id'));
  }

  function handleDragEnd() {
    if (dragSourceCard) dragSourceCard.classList.remove(DRAG_SRC_CLS);
    clearHighlights();
    dragSourceCard = null;
  }

  function handleDragOver(e) {
    var card = e.currentTarget;
    if (!card.classList.contains(DROP_OK_CLS)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleDragEnter(e) {
    var card = e.currentTarget;
    if (!card.classList.contains(DROP_OK_CLS)) return;
    e.preventDefault();
    card.classList.add(DROP_HOVER_CLS);
  }

  function handleDragLeave(e) {
    var card = e.currentTarget;
    // Only remove hover if actually leaving the card (not entering a child)
    if (card.contains(e.relatedTarget)) return;
    card.classList.remove(DROP_HOVER_CLS);
  }

  function handleDrop(e) {
    e.preventDefault();
    var targetCard = e.currentTarget;
    if (!targetCard.classList.contains(DROP_OK_CLS)) return;
    if (!dragSourceCard) return;

    var sourceId = dragSourceCard.getAttribute('data-photo-id');
    var sourceType = dragSourceCard.getAttribute('data-photo-type') || '';
    var targetId = targetCard.getAttribute('data-photo-id');
    var targetType = targetCard.getAttribute('data-photo-type') || 'this slot';

    clearHighlights();
    if (dragSourceCard) dragSourceCard.classList.remove(DRAG_SRC_CLS);

    // Build metadata payload — no mutation assumptions
    var sourceRequired = dragSourceCard.getAttribute('data-photo-required') === 'true';
    var sourceNotes = dragSourceCard.getAttribute('data-photo-notes') || '';
    var targetRequired = targetCard.getAttribute('data-photo-required') === 'true';
    var targetNotes = targetCard.getAttribute('data-photo-notes') || '';
    var detail = {
      sourceRecordId: sourceId,
      sourcePhotoType: sourceType,
      sourceRequired: sourceRequired,
      sourceNotes: sourceNotes,
      targetRecordId: targetId,
      targetPhotoType: targetType,
      targetRequired: targetRequired,
      targetNotes: targetNotes,
      surveyRequestId: getSurveyRequestId()
    };

    // Show confirmation overlay on the target card
    showConfirmation(targetCard, detail);
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

    var table = viewEl.querySelector('table.kn-table');
    if (!table) return;

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

      // Get the label for alt text
      var labelCell = tr.querySelector('td.field_2364') || tr.querySelector('td.field_1642');
      var labelText = labelCell ? (labelCell.textContent || '').trim() : '';

      // Extract all connected photo records
      var photos = extractPhotoRecords(tr);

      // Build the injected row
      var photoTr = document.createElement('tr');
      photoTr.className = ROW_CLS;
      var td = document.createElement('td');
      td.setAttribute('colspan', String(cols));

      var strip = document.createElement('div');
      strip.className = STRIP_CLS;

      // ── "+" Add photo button (appended at end of strip) ──
      var addBtn = document.createElement('div');
      addBtn.className = ADD_BTN_CLS;
      addBtn.innerHTML =
        '<span class="scw-add-icon">+</span>' +
        '<span>Add</span>';
      addBtn.title = 'Add a new photo record';
      (function (lid, vid) {
        addBtn.addEventListener('click', function () {
          var h = addPhotoHash(lid, vid);
          if (h) window.location.hash = h;
        });
      })(lineItemId, viewId);

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
            // Photo with image — draggable source
            card.setAttribute('draggable', 'true');
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', handleDragEnd);

            var imgEl = document.createElement('img');
            imgEl.className = IMG_CLS;
            imgEl.src = photo.imgUrl;
            imgEl.alt = labelText
              ? (photo.type || 'Photo') + ' for ' + labelText
              : 'Site survey photo';
            imgEl.title = 'Drag to an empty required slot, or click to edit';
            (function (rid, vid) {
              imgEl.addEventListener('click', function () {
                var h = editPhotoHash(rid, vid);
                if (h) window.location.hash = h;
              });
            })(photo.id, viewId);
            card.appendChild(imgEl);
          } else {
            // Photo record exists but no image uploaded — potential drop target
            var empty = document.createElement('div');
            empty.className = EMPTY_CLS;
            if (isMissing) empty.classList.add(MISSING_CLS);
            empty.innerHTML =
              '<span class="scw-empty-icon">&#128247;</span>' +
              '<span>' + (isMissing ? 'Required' : 'Upload photo') + '</span>';
            empty.title = photo.type
              ? 'Upload: ' + photo.type
              : 'Click to edit photo';
            (function (rid, vid) {
              empty.addEventListener('click', function () {
                var h = editPhotoHash(rid, vid);
                if (h) window.location.hash = h;
              });
            })(photo.id, viewId);
            card.appendChild(empty);

            // Drop helper text (hidden until drag starts)
            if (photo.required && !photo.completed) {
              var helper = document.createElement('div');
              helper.className = 'scw-drop-helper';
              helper.textContent = 'Drop to use for ' + (photo.type || 'this slot');
              card.appendChild(helper);
            }

            // Drop target events
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('dragenter', handleDragEnter);
            card.addEventListener('dragleave', handleDragLeave);
            card.addEventListener('drop', handleDrop);
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

      td.appendChild(fieldWrapper);
      photoTr.appendChild(td);
      tr.parentNode.insertBefore(photoTr, tr.nextSibling);
    }
  }

  // ── Init ────────────────────────────────────────────────────────
  injectCss();

  for (var v = 0; v < TARGET_VIEWS.length; v++) {
    (function (vid) {
      $(document).on('knack-view-render.' + vid, function () {
        processView(vid);
      });
    })(TARGET_VIEWS[v]);
  }
})();
/*************  Inline Photo Rows – view_3512  **********************/
