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
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var TARGET_VIEWS = ['view_3512'];
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
  var MISSING_CLS  = 'scw-inline-photo-missing';

  // Columns to hide in the original table (we show the data inline instead)
  var HIDE_COLS = ['field_2445', 'field_2446', 'field_2447'];

  // ── CSS ─────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* The injected <tr> */
      '.' + ROW_CLS + ' {',
      '  background: #f9fafb;',
      '}',
      '.' + ROW_CLS + ' > td {',
      '  padding: 8px 12px !important;',
      '  border-bottom: 2px solid #e2e8f0 !important;',
      '}',

      /* Flex strip for photo cards */
      '.' + STRIP_CLS + ' {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 12px;',
      '  align-items: flex-start;',
      '}',

      /* Card wrapper */
      '.' + CARD_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  width: 200px;',
      '}',

      /* Photo image */
      '.' + IMG_CLS + ' {',
      '  width: 200px;',
      '  height: 150px;',
      '  object-fit: cover;',
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
      '  height: 150px;',
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

      /* Add-photo button (far left of strip) */
      '.' + ADD_BTN_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 4px;',
      '  width: 56px;',
      '  min-height: 150px;',
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
      '  background: #dc2626;',
      '  border-radius: 3px;',
      '  box-sizing: border-box;',
      '}',

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

      '/* Hide the raw connected-field columns we now display inline */',
      '#view_3512 th.field_2445,',
      '#view_3512 td.field_2445,',
      '#view_3512 th.field_2446,',
      '#view_3512 td.field_2446,',
      '#view_3512 th.field_2447,',
      '#view_3512 td.field_2447 {',
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

  /** Build the edit-doc-photo hash path for a photo record. */
  function editPhotoHash(photoRecordId) {
    var surveyId = getSurveyRequestId();
    if (!surveyId) return '';
    return 'subcontractor-portal/site-survey-request-details/' +
      surveyId + '/edit-doc-photo/' + photoRecordId;
  }

  /** Build the add-photo-to-survey-line-item hash path. */
  function addPhotoHash(lineItemId) {
    var surveyId = getSurveyRequestId();
    if (!surveyId) return '';
    return 'subcontractor-portal/site-survey-request-details/' +
      surveyId + '/add-photo-to-survey-line-item/' + lineItemId;
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
        map[rid] = { id: rid, imgUrl: '', type: '', required: false, completed: false };
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
        ensure(rid2).type = inner ? inner.textContent.trim() : '';
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

    // Convert to sorted array
    var arr = [];
    for (var k in map) {
      if (map.hasOwnProperty(k)) arr.push(map[k]);
    }

    // Sort: missing-required first, then by type, then by id
    arr.sort(function (a, b) {
      var aMissing = (a.required && !a.completed) ? 0 : 1;
      var bMissing = (b.required && !b.completed) ? 0 : 1;
      if (aMissing !== bMissing) return aMissing - bMissing;
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.id.localeCompare(b.id);
    });

    return arr;
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
      var labelCell = tr.querySelector('td.field_2364');
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

      // ── "+" Add photo button (far left) ──
      var addBtn = document.createElement('div');
      addBtn.className = ADD_BTN_CLS;
      addBtn.innerHTML =
        '<span class="scw-add-icon">+</span>' +
        '<span>Add</span>';
      addBtn.title = 'Add a new photo record';
      (function (lid) {
        addBtn.addEventListener('click', function () {
          var h = addPhotoHash(lid);
          if (h) window.location.hash = h;
        });
      })(lineItemId);
      strip.appendChild(addBtn);

      if (photos.length > 0) {
        // ── Has connected photo records ──
        for (var p = 0; p < photos.length; p++) {
          var photo = photos[p];
          var isMissing = photo.required && !photo.completed;
          var card = document.createElement('div');
          card.className = CARD_CLS;
          if (photo.required) card.classList.add(REQ_CLS);

          if (photo.imgUrl) {
            // Photo with image
            var imgEl = document.createElement('img');
            imgEl.className = IMG_CLS;
            imgEl.src = photo.imgUrl;
            imgEl.alt = labelText
              ? (photo.type || 'Photo') + ' for ' + labelText
              : 'Site survey photo';
            imgEl.title = 'Click to edit photo';
            (function (rid) {
              imgEl.addEventListener('click', function () {
                var h = editPhotoHash(rid);
                if (h) window.location.hash = h;
              });
            })(photo.id);
            card.appendChild(imgEl);
          } else {
            // Photo record exists but no image uploaded
            var empty = document.createElement('div');
            empty.className = EMPTY_CLS;
            if (isMissing) empty.classList.add(MISSING_CLS);
            empty.innerHTML =
              '<span class="scw-empty-icon">&#128247;</span>' +
              '<span>' + (isMissing ? 'Required' : 'Upload photo') + '</span>';
            empty.title = photo.type
              ? 'Upload: ' + photo.type
              : 'Click to edit photo';
            (function (rid) {
              empty.addEventListener('click', function () {
                var h = editPhotoHash(rid);
                if (h) window.location.hash = h;
              });
            })(photo.id);
            card.appendChild(empty);
          }

          // Photo type label beneath
          if (photo.type) {
            var typeEl = document.createElement('div');
            typeEl.className = TYPE_CLS;
            typeEl.textContent = photo.type;
            typeEl.title = photo.type;
            card.appendChild(typeEl);
          }

          // "Required" chip — only when required AND not yet completed
          if (photo.required && !photo.completed) {
            var chip = document.createElement('div');
            chip.className = REQ_CHIP_CLS;
            chip.textContent = 'Required';
            card.appendChild(chip);
          }

          strip.appendChild(card);
        }
      }

      td.appendChild(strip);
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
