/*************  Inline Photo Rows – view_3512  **********************/
/**
 * After view_3512 renders, injects a photo-preview row beneath every
 * data row in the grid.
 *
 *  - Rows WITH photos  → large preview of the original image(s)
 *  - Rows WITHOUT photos → a placeholder inviting the user to upload
 *
 * Each photo row also shows field_2445 (photo caption / notes) beneath
 * the image, fetched via Knack API.  The caption is inline-editable:
 * click to edit, blur or Enter to save.
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var TARGET_VIEWS = ['view_3512'];
  var PHOTO_FIELD  = 'field_771:thumb_14';   // CSS class on the <td>
  var CAPTION_FIELD = 'field_2445';
  var CSS_ID       = 'scw-inline-photo-row-css';
  var ROW_CLS      = 'scw-inline-photo-row';
  var STRIP_CLS    = 'scw-inline-photo-strip';
  var CARD_CLS     = 'scw-inline-photo-card';
  var IMG_CLS      = 'scw-inline-photo-img';
  var CAPTION_CLS  = 'scw-inline-photo-caption';
  var EMPTY_CLS    = 'scw-inline-photo-empty';
  var SAVE_IND_CLS = 'scw-inline-photo-saving';

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

      /* Flex strip for multiple photos / cards */
      '.' + STRIP_CLS + ' {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 12px;',
      '  align-items: flex-start;',
      '}',

      /* Card wrapper around each photo + caption */
      '.' + CARD_CLS + ' {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  max-width: 320px;',
      '}',

      /* Each photo */
      '.' + IMG_CLS + ' {',
      '  max-height: 180px;',
      '  max-width: 320px;',
      '  border-radius: 6px;',
      '  border: 1px solid #ddd;',
      '  box-shadow: 0 1px 4px rgba(0,0,0,.08);',
      '  cursor: pointer;',
      '  transition: transform 120ms ease, box-shadow 120ms ease;',
      '  object-fit: contain;',
      '}',
      '.' + IMG_CLS + ':hover {',
      '  transform: scale(1.03);',
      '  box-shadow: 0 3px 12px rgba(0,0,0,.15);',
      '}',

      /* Caption below photo */
      '.' + CAPTION_CLS + ' {',
      '  margin-top: 6px;',
      '  width: 100%;',
      '  min-height: 24px;',
      '  padding: 4px 8px;',
      '  font-size: 12px;',
      '  line-height: 1.4;',
      '  color: #334155;',
      '  background: #fff;',
      '  border: 1px solid #e2e8f0;',
      '  border-radius: 4px;',
      '  cursor: text;',
      '  transition: border-color 120ms ease, box-shadow 120ms ease;',
      '  white-space: pre-wrap;',
      '  word-break: break-word;',
      '  outline: none;',
      '}',
      '.' + CAPTION_CLS + ':hover {',
      '  border-color: #94a3b8;',
      '}',
      '.' + CAPTION_CLS + ':focus {',
      '  border-color: #295f91;',
      '  box-shadow: 0 0 0 2px rgba(41,95,145,.18);',
      '}',
      '.' + CAPTION_CLS + '[data-placeholder]:empty::before {',
      '  content: attr(data-placeholder);',
      '  color: #94a3b8;',
      '  font-style: italic;',
      '}',

      /* Saving indicator */
      '.' + SAVE_IND_CLS + ' {',
      '  border-color: #f59e0b !important;',
      '}',

      /* Empty / no-photo placeholder */
      '.' + EMPTY_CLS + ' {',
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
      '.' + EMPTY_CLS + ':hover {',
      '  border-color: #295f91;',
      '  color: #295f91;',
      '}',
      '.' + EMPTY_CLS + ' .scw-empty-icon {',
      '  font-size: 20px;',
      '  line-height: 1;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Swap thumb_14 → original in an S3 image URL. */
  function toOriginalUrl(thumbUrl) {
    return thumbUrl.replace('/thumb_14/', '/original/');
  }

  /** Count the number of columns in the table header row. */
  function colCount(table) {
    var headerRow = table.querySelector('thead tr');
    if (!headerRow) return 18;
    var count = 0;
    var cells = headerRow.children;
    for (var i = 0; i < cells.length; i++) {
      count += parseInt(cells[i].getAttribute('colspan') || '1', 10);
    }
    return count;
  }

  /** Find the "add photo" link in a data row and return its href. */
  function getAddPhotoHref(tr) {
    var link = tr.querySelector('td.kn-table-link a.kn-link-page');
    return link ? (link.getAttribute('href') || '') : '';
  }

  /** Get the Knack object key for a view (at runtime). */
  function getObjectKey(viewId) {
    try {
      return Knack.views[viewId].model.view.source.object;
    } catch (e) {
      return '';
    }
  }

  // ── Knack API helpers ───────────────────────────────────────────

  function knackApiHeaders() {
    return {
      'X-Knack-Application-Id': Knack.application_id,
      'X-Knack-REST-API-Key': 'knack',
      'Authorization': Knack.getUserToken(),
      'Content-Type': 'application/json'
    };
  }

  /**
   * Fetch field_2445 values for a list of record IDs.
   * Resolves with { recordId: captionText, ... }
   */
  function fetchCaptions(objectKey, recordIds) {
    if (!objectKey || !recordIds.length) {
      return $.Deferred().resolve({}).promise();
    }

    // Batch: fetch each record individually (Knack has no bulk-get by IDs).
    // Use a single GET per record; they're small and fast.
    var dfd = $.Deferred();
    var results = {};
    var pending = recordIds.length;

    recordIds.forEach(function (recId) {
      $.ajax({
        url: 'https://api.knack.com/v1/objects/' + objectKey + '/records/' + recId,
        type: 'GET',
        headers: knackApiHeaders()
      })
        .done(function (rec) {
          results[recId] = (rec[CAPTION_FIELD] || '');
        })
        .fail(function () {
          results[recId] = '';
        })
        .always(function () {
          pending--;
          if (pending === 0) dfd.resolve(results);
        });
    });

    return dfd.promise();
  }

  /**
   * Save field_2445 for a single record.
   */
  function saveCaption(objectKey, recordId, value) {
    var data = {};
    data[CAPTION_FIELD] = value;
    return $.ajax({
      url: 'https://api.knack.com/v1/objects/' + objectKey + '/records/' + recordId,
      type: 'PUT',
      headers: knackApiHeaders(),
      data: JSON.stringify(data)
    });
  }

  // ── Core ────────────────────────────────────────────────────────

  function processView(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    var table = viewEl.querySelector('table.kn-table');
    if (!table) return;

    var cols = colCount(table);
    var objectKey = getObjectKey(viewId);
    var rows = table.querySelectorAll('tbody tr');

    // Collect record IDs for caption fetch
    var recordIds = [];
    var dataRows = [];

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.classList.contains('kn-table-group')) continue;
      if (tr.classList.contains(ROW_CLS)) continue;
      var recId = tr.getAttribute('id');
      if (recId) {
        recordIds.push(recId);
        dataRows.push(tr);
      }
    }

    // Inject photo rows immediately (don't wait for captions)
    var captionEls = {}; // recordId → caption DOM element
    for (var d = 0; d < dataRows.length; d++) {
      var row = dataRows[d];
      var rid = row.getAttribute('id');

      // Find the PICs cell
      var picCell = null;
      var cells = row.getElementsByTagName('td');
      for (var c = 0; c < cells.length; c++) {
        if (cells[c].className.indexOf(PHOTO_FIELD) !== -1) {
          picCell = cells[c];
          break;
        }
      }
      if (!picCell) continue;

      var imgs = picCell.querySelectorAll('img[data-kn-img-gallery]');
      var hasPhotos = imgs.length > 0;

      // Build the photo preview row
      var photoTr = document.createElement('tr');
      photoTr.className = ROW_CLS;
      var td = document.createElement('td');
      td.setAttribute('colspan', String(cols));
      td.style.cssText = 'text-align: left;';

      var strip = document.createElement('div');
      strip.className = STRIP_CLS;

      // Grab the Label for alt text
      var labelCell = row.querySelector('td.field_2364');
      var labelText = labelCell ? (labelCell.textContent || '').trim() : '';

      if (hasPhotos) {
        // ── Has photos: show preview + editable caption ──
        for (var j = 0; j < imgs.length; j++) {
          var origUrl = toOriginalUrl(imgs[j].getAttribute('data-kn-img-gallery'));

          var card = document.createElement('div');
          card.className = CARD_CLS;

          var img = document.createElement('img');
          img.className = IMG_CLS;
          img.src = origUrl;
          img.alt = labelText ? ('Photo for ' + labelText) : 'Site survey photo';
          img.title = 'Click to open full size';
          (function (url) {
            img.addEventListener('click', function () {
              window.open(url, '_blank');
            });
          })(origUrl);
          card.appendChild(img);

          // Caption element (contenteditable)
          var cap = document.createElement('div');
          cap.className = CAPTION_CLS;
          cap.setAttribute('contenteditable', 'true');
          cap.setAttribute('data-placeholder', 'Add caption\u2026');
          cap.setAttribute('data-record-id', rid);
          cap.setAttribute('spellcheck', 'true');
          card.appendChild(cap);

          // Store reference for later population
          if (!captionEls[rid]) captionEls[rid] = [];
          captionEls[rid].push(cap);

          strip.appendChild(card);
        }
      } else {
        // ── No photos: show upload placeholder ──
        var addHref = getAddPhotoHref(row);
        var empty = document.createElement('div');
        empty.className = EMPTY_CLS;
        empty.innerHTML =
          '<span class="scw-empty-icon">&#128247;</span>' +
          '<span>No photo &mdash; click to add one</span>';
        if (addHref) {
          empty.title = 'Navigate to add a photo';
          empty.addEventListener('click', function (href) {
            return function () { window.location.hash = href.replace(/^#/, ''); };
          }(addHref));
        }
        strip.appendChild(empty);
      }

      td.appendChild(strip);
      photoTr.appendChild(td);
      row.parentNode.insertBefore(photoTr, row.nextSibling);
    }

    // ── Fetch captions and populate ──
    fetchCaptions(objectKey, recordIds).then(function (captions) {
      Object.keys(captionEls).forEach(function (recId) {
        var text = captions[recId] || '';
        // Strip HTML tags Knack might return — display plain text
        var cleaned = text.replace(/<[^>]*>/g, '').trim();
        captionEls[recId].forEach(function (el) {
          el.textContent = cleaned;
        });
      });
    });

    // ── Delegated save-on-blur for captions ──
    $(viewEl)
      .off('focusout.scwCaption')
      .on('focusout.scwCaption', '.' + CAPTION_CLS, function () {
        var el = this;
        var recId = el.getAttribute('data-record-id');
        var newVal = (el.textContent || '').trim();
        if (!recId || !objectKey) return;

        el.classList.add(SAVE_IND_CLS);
        saveCaption(objectKey, recId, newVal)
          .always(function () {
            el.classList.remove(SAVE_IND_CLS);
          })
          .fail(function () {
            el.style.borderColor = '#ef4444';
            setTimeout(function () { el.style.borderColor = ''; }, 2000);
          });
      });

    // Enter key → blur (save) instead of newline
    $(viewEl)
      .off('keydown.scwCaption')
      .on('keydown.scwCaption', '.' + CAPTION_CLS, function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.blur();
        }
      });
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
