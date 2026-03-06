/*************  Inline Photo Rows – view_3512  **********************/
/**
 * After view_3512 renders, scans each data row for photos in the PICs
 * column (field_771:thumb_14).  When images are found, a full-width
 * preview row is injected directly beneath that data row showing a
 * larger version of the photo(s).
 *
 * The original thumbnail URL (.../thumb_14/file.jpg) is swapped for
 * the original-size URL (.../original/file.jpg) and displayed at a
 * constrained max-height so the surveyor can see the photo in context
 * without leaving the grid.
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────
  var TARGET_VIEWS = ['view_3512'];
  var PHOTO_FIELD  = 'field_771:thumb_14';   // CSS class on the <td>
  var CSS_ID       = 'scw-inline-photo-row-css';
  var ROW_CLS      = 'scw-inline-photo-row';
  var STRIP_CLS    = 'scw-inline-photo-strip';
  var IMG_CLS      = 'scw-inline-photo-img';

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

      /* Flex strip for multiple photos */
      '.' + STRIP_CLS + ' {',
      '  display: flex;',
      '  flex-wrap: wrap;',
      '  gap: 10px;',
      '  align-items: flex-start;',
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
    if (!headerRow) return 18; // fallback
    var count = 0;
    var cells = headerRow.children;
    for (var i = 0; i < cells.length; i++) {
      count += parseInt(cells[i].getAttribute('colspan') || '1', 10);
    }
    return count;
  }

  // ── Core ────────────────────────────────────────────────────────

  function processView(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;

    var table = viewEl.querySelector('table.kn-table');
    if (!table) return;

    var cols = colCount(table);
    var rows = table.querySelectorAll('tbody tr');

    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];

      // Skip group-header rows and already-injected photo rows
      if (tr.classList.contains('kn-table-group')) continue;
      if (tr.classList.contains(ROW_CLS)) continue;

      // Find the PICs cell – Knack uses a colon in the class name
      // so we can't use querySelector with the raw class; iterate instead.
      var picCell = null;
      var cells = tr.getElementsByTagName('td');
      for (var c = 0; c < cells.length; c++) {
        if (cells[c].className.indexOf(PHOTO_FIELD) !== -1) {
          picCell = cells[c];
          break;
        }
      }
      if (!picCell) continue;

      // Gather all <img> elements inside the PICs cell
      var imgs = picCell.querySelectorAll('img[data-kn-img-gallery]');
      if (!imgs.length) continue;

      // Build the photo preview row
      var photoTr = document.createElement('tr');
      photoTr.className = ROW_CLS;
      var td = document.createElement('td');
      td.setAttribute('colspan', String(cols));
      td.style.cssText = 'text-align: left;';

      var strip = document.createElement('div');
      strip.className = STRIP_CLS;

      // Also grab the Label from the row for an aria-label
      var labelCell = tr.querySelector('td.field_2364');
      var labelText = labelCell ? (labelCell.textContent || '').trim() : '';

      for (var j = 0; j < imgs.length; j++) {
        var origUrl = toOriginalUrl(imgs[j].getAttribute('data-kn-img-gallery'));
        var img = document.createElement('img');
        img.className = IMG_CLS;
        img.src = origUrl;
        img.alt = labelText ? ('Photo for ' + labelText) : 'Site survey photo';
        img.title = 'Click to open full size';

        // Click → open in new tab
        (function (url) {
          img.addEventListener('click', function () {
            window.open(url, '_blank');
          });
        })(origUrl);

        strip.appendChild(img);
      }

      td.appendChild(strip);
      photoTr.appendChild(td);

      // Insert right after the current data row
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
