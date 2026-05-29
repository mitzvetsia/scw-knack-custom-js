/*** WORKSHEET V2 — PHOTOS ****************************************************
 *
 * Inline photo strip beneath each v2 card. Always-visible (matches v1's
 * inline-photo-row.js UX), shows a thumbnail per attached photo plus an
 * "+ Add" pill. Click a thumbnail → navigate to Knack's edit-photo
 * page (same URL shape v1 uses on view_3610).
 *
 * Data extraction mirrors v1's extractPhotoRecords(), but reads from
 * view_3962's <tr id="<recordId>"> rather than v1's view_3610. The
 * fields used (field_771 image, field_2445 type, field_2446 required,
 * field_2447 completed, field_114 notes) must be present on view_3962.
 *
 * NOT included in v1 of this module:
 *   - drag-drop reordering / cross-line-item moves
 *   - inline file upload (Replace Image / drop-to-upload)
 *   - the custom photo-edit modal (Known Issue #10)
 * Those can land later — this gets parity on the photo-visibility piece
 * which is what the user asked for.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function findCellByFieldKey(tr, fieldKey) {
    var cells = tr.getElementsByTagName('td');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('data-field-key') === fieldKey) return cells[i];
    }
    return null;
  }
  function findAllCellsByFieldKey(tr, fieldKey) {
    var cells = tr.getElementsByTagName('td');
    var out = [];
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('data-field-key') === fieldKey) out.push(cells[i]);
    }
    return out;
  }

  /** Walk the source-view <tr> for this record and pull a list of
   *  attached photo records: { id, imgUrl, type, required, completed, notes } */
  function extractPhotoRecords(sourceViewKey, recordId) {
    var view = document.getElementById(sourceViewKey);
    if (!view) return [];
    var tr = view.querySelector('tr[id="' + recordId + '"]');
    if (!tr) return [];

    var map = Object.create(null);
    function ensure(rid) {
      if (!map[rid]) {
        map[rid] = { id: rid, imgUrl: '', type: '', required: false, completed: false, notes: '' };
      }
      return map[rid];
    }

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

    var typeCell = findCellByFieldKey(tr, 'field_2445');
    if (typeCell) {
      var outerSpans = typeCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var j = 0; j < outerSpans.length; j++) {
        var rid2 = (outerSpans[j].id || '').trim();
        if (!rid2) continue;
        var inner = outerSpans[j].querySelector('span[data-kn="connection-value"]');
        ensure(rid2).type = inner ? inner.textContent.trim() : '';
      }
    }

    var reqCell = findCellByFieldKey(tr, 'field_2446');
    if (reqCell) {
      var reqSpans = reqCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var r = 0; r < reqSpans.length; r++) {
        var rid3 = (reqSpans[r].id || '').trim();
        if (!rid3) continue;
        var v = (reqSpans[r].textContent || '').trim().toLowerCase();
        ensure(rid3).required = (v === 'yes');
      }
    }

    var compCell = findCellByFieldKey(tr, 'field_2447');
    if (compCell) {
      var compSpans = compCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var c = 0; c < compSpans.length; c++) {
        var rid4 = (compSpans[c].id || '').trim();
        if (!rid4) continue;
        var cv = (compSpans[c].textContent || '').trim().toLowerCase();
        ensure(rid4).completed = (cv === 'yes');
      }
    }

    var notesCell = findCellByFieldKey(tr, 'field_114');
    if (notesCell) {
      var notesSpans = notesCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var n = 0; n < notesSpans.length; n++) {
        var rid5 = (notesSpans[n].id || '').trim();
        if (!rid5) continue;
        ensure(rid5).notes = (notesSpans[n].textContent || '').trim();
      }
    }

    var arr = [];
    for (var k in map) arr.push(map[k]);
    // Sort: required+incomplete first, then required, then by type, then id
    arr.sort(function (a, b) {
      var am = (a.required && !a.completed) ? 0 : 1;
      var bm = (b.required && !b.completed) ? 0 : 1;
      if (am !== bm) return am - bm;
      var ar = a.required ? 0 : 1;
      var br = b.required ? 0 : 1;
      if (ar !== br) return ar - br;
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.id.localeCompare(b.id);
    });
    return arr;
  }

  // ── URL helpers (matches inline-photo-row.js for view_3610) ────
  function buildSowBasePath() {
    var hash = window.location.hash || '';
    var patterns = [
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/review-bids\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/deploy\/[a-f0-9]{24})/,
      /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/,
      /(proposals\/scope-of-work\/[a-f0-9]{24})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = hash.match(patterns[i]);
      if (m) return m[1];
    }
    return '';
  }

  function editPhotoHref(photoRecordId) {
    var base = buildSowBasePath();
    if (!base) return '';
    var slug = (base.indexOf('scope-of-work-details') !== -1)
      ? 'edit-doc-photo2' : 'edit-photo';
    return '#' + base + '/' + slug + '/' + photoRecordId + '/';
  }
  function addPhotoHref(lineItemId) {
    var base = buildSowBasePath();
    if (!base) return '';
    return '#' + base + '/add-photo-to-sow-line-item/' + lineItemId + '/';
  }

  /** Public API: build a strip element for one record. Returns null
   *  if there are no photos AND we can\'t build an add link (no usable
   *  base path) — saves visual noise on routes we don\'t support. */
  function buildStrip(rec, sourceViewKey) {
    var photos = extractPhotoRecords(sourceViewKey, rec.id);
    // Empty strips clutter every expanded card with a stray "+ Add"
    // icon and a blank row of dead space. If this record has no
    // attached photos, render nothing — the top-toolbar "+ Add Photos"
    // CTA handles the no-photos-yet path.
    if (!photos.length) return null;
    var addHref = addPhotoHref(rec.id);

    var strip = document.createElement('div');
    strip.className = 'scw-ws-v2-photos';
    strip.setAttribute('data-scw-ws-v2-photos', rec.id);

    // SVG picture icon — used in the add button and (eventually) anywhere
    // we need an "image" affordance. Outline-style so it sits well on
    // the dashed placeholder background.
    var PIC_SVG =
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
        '<rect x="3" y="3" width="18" height="18" rx="2"></rect>' +
        '<circle cx="9" cy="9" r="1.8"></circle>' +
        '<path d="M21 16l-5-5-9 9"></path>' +
      '</svg>';

    var html = '<div class="scw-ws-v2-photos-strip">';

    for (var i = 0; i < photos.length; i++) {
      var p = photos[i];
      var href = editPhotoHref(p.id);
      var missing = p.required && !p.completed;
      var cls = 'scw-ws-v2-photo-card' +
        (p.required ? ' scw-ws-v2-photo-card--required' : '') +
        (missing   ? ' scw-ws-v2-photo-card--missing'  : '');
      var thumb = p.imgUrl
        ? '<img class="scw-ws-v2-photo-img" src="' + escapeHtml(p.imgUrl) + '" alt="">'
        : '<div class="scw-ws-v2-photo-img scw-ws-v2-photo-img--placeholder">No image</div>';
      var typeHtml = p.type
        ? '<div class="scw-ws-v2-photo-type">' + escapeHtml(p.type) + '</div>'
        : '';
      var reqHtml = '';
      if (p.required) {
        reqHtml = '<div class="scw-ws-v2-photo-req' +
                    (p.completed ? ' scw-ws-v2-photo-req--ok' : '') +
                  '">' + (p.completed ? 'REQUIRED &#10003;' : 'REQUIRED') + '</div>';
      }
      var openAttrs = href
        ? ' href="' + escapeHtml(href) + '"'
        : ' href="#" data-no-nav="1"';
      html +=
        '<a class="' + cls + '"' + openAttrs +
            ' title="' + escapeHtml((p.type || 'Photo') + (p.required ? ' (Required)' : '')) + '">' +
          thumb + typeHtml + reqHtml +
        '</a>';
    }

    if (addHref) {
      html += '<a class="scw-ws-v2-photo-add' +
                (photos.length ? '' : ' scw-ws-v2-photo-add--solo') +
                '" href="' + escapeHtml(addHref) + '" title="Add photo" aria-label="Add photo">' +
                PIC_SVG +
              '</a>';
    }

    html += '</div>';
    strip.innerHTML = html;
    return strip;
  }

  ns.photos = {
    buildStrip:           buildStrip,
    extractPhotoRecords:  extractPhotoRecords
  };
})();
/*** END WORKSHEET V2 — PHOTOS ************************************************/
