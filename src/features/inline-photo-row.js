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
 * Clicking an empty image placeholder navigates to the line item's
 * "add photo" page so the user can upload.
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
  var NONE_CLS     = 'scw-inline-photo-none';

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

      /* "No photo records" row-level placeholder */
      '.' + NONE_CLS + ' {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 10px 16px;',
      '  color: #94a3b8;',
      '  font-size: 12px;',
      '  font-style: italic;',
      '  border: 2px dashed #e2e8f0;',
      '  border-radius: 8px;',
      '  cursor: pointer;',
      '  transition: border-color 120ms ease, color 120ms ease;',
      '}',
      '.' + NONE_CLS + ':hover {',
      '  border-color: #295f91;',
      '  color: #295f91;',
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

  /** Find the "add photo" link href from a data row. */
  function getAddPhotoHref(tr) {
    var a = tr.querySelector('td.kn-table-link a.kn-link-page');
    return a ? (a.getAttribute('href') || '') : '';
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
   * Returns an array of { id, imgUrl, type } sorted by type then id.
   */
  function extractPhotoRecords(tr) {
    var map = {}; // photoRecordId → { imgUrl, type }

    // 1) field_771 — images
    //    Structure: td > span.col > a > span[id][data-kn] > img
    var imgCell = findCellByFieldKey(tr, 'field_771');
    if (imgCell) {
      var imgSpans = imgCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var i = 0; i < imgSpans.length; i++) {
        var rid = (imgSpans[i].id || '').trim();
        if (!rid) continue;
        var img = imgSpans[i].querySelector('img[data-kn-img-gallery]');
        map[rid] = {
          id: rid,
          imgUrl: img ? img.getAttribute('data-kn-img-gallery') : '',
          type: ''
        };
      }
    }

    // 2) field_2445 — photo type (CONFIG_photo type)
    //    Structure: td > span.col > span[id][data-kn] > span[class][data-kn]
    //    The outer span id = photo record ID
    //    The inner span text = type label (e.g. "Proposed Mounting Location")
    var typeCell = tr.querySelector('td.field_2445');
    if (typeCell) {
      var outerSpans = typeCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var j = 0; j < outerSpans.length; j++) {
        var rid2 = (outerSpans[j].id || '').trim();
        if (!rid2) continue;
        var inner = outerSpans[j].querySelector('span[data-kn="connection-value"]');
        var typeText = inner ? inner.textContent.trim() : '';
        if (map[rid2]) {
          map[rid2].type = typeText;
        } else {
          map[rid2] = { id: rid2, imgUrl: '', type: typeText };
        }
      }
    }

    // Convert to sorted array
    var arr = [];
    for (var k in map) {
      if (map.hasOwnProperty(k)) arr.push(map[k]);
    }

    // Sort: records with images first, then by type, then by id
    arr.sort(function (a, b) {
      var ai = a.imgUrl ? 0 : 1;
      var bi = b.imgUrl ? 0 : 1;
      if (ai !== bi) return ai - bi;
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

      // Get the add-photo link
      var addHref = getAddPhotoHref(tr);

      // Extract all connected photo records
      var photos = extractPhotoRecords(tr);

      // Build the injected row
      var photoTr = document.createElement('tr');
      photoTr.className = ROW_CLS;
      var td = document.createElement('td');
      td.setAttribute('colspan', String(cols));

      var strip = document.createElement('div');
      strip.className = STRIP_CLS;

      if (photos.length > 0) {
        // ── Has connected photo records ──
        for (var p = 0; p < photos.length; p++) {
          var photo = photos[p];
          var card = document.createElement('div');
          card.className = CARD_CLS;

          if (photo.imgUrl) {
            // Photo with image
            var imgEl = document.createElement('img');
            imgEl.className = IMG_CLS;
            imgEl.src = photo.imgUrl;
            imgEl.alt = labelText
              ? (photo.type || 'Photo') + ' for ' + labelText
              : 'Site survey photo';
            imgEl.title = 'Click to open full size';
            (function (url) {
              imgEl.addEventListener('click', function () {
                window.open(url, '_blank');
              });
            })(photo.imgUrl);
            card.appendChild(imgEl);
          } else {
            // Photo record exists but no image uploaded
            var empty = document.createElement('div');
            empty.className = EMPTY_CLS;
            empty.innerHTML =
              '<span class="scw-empty-icon">&#128247;</span>' +
              '<span>Upload photo</span>';
            empty.title = photo.type
              ? 'Upload: ' + photo.type
              : 'Click to upload photo';
            if (addHref) {
              (function (href) {
                empty.addEventListener('click', function () {
                  window.location.hash = href.replace(/^#/, '');
                });
              })(addHref);
            }
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

          strip.appendChild(card);
        }
      } else {
        // ── No connected photo records at all ──
        var none = document.createElement('div');
        none.className = NONE_CLS;
        none.innerHTML =
          '<span class="scw-empty-icon" style="font-size:20px;">&#128247;</span>' +
          '<span>No photo records &mdash; click to add</span>';
        if (addHref) {
          none.title = 'Navigate to add a photo';
          (function (href) {
            none.addEventListener('click', function () {
              window.location.hash = href.replace(/^#/, '');
            });
          })(addHref);
        }
        strip.appendChild(none);
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
