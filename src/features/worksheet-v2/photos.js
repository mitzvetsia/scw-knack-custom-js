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
        map[rid] = {
          id: rid, imgUrl: '', type: '', required: false, completed: false, notes: '',
          // Photo QA (PIC object) — populated only when the QA columns are
          // present on the source view (install surface). Defaults keep the
          // chit in a neutral "Pending" state everywhere else.
          qaStatus: 'Pending', qaClient: 'N/A', qaNotes: '', qaHistory: '',
          qaCompletedBy: '', qaCompletedDate: '', qaPresent: false
        };
      }
      return map[rid];
    }

    // Per-view field map — photo sub-record keys (image/type/required/
    // completed/notes) can differ per deployment.
    var F = (ns.cfg && ns.cfg.fields(sourceViewKey)) || {};
    var FK_IMG  = F.photoImage     || 'field_771';
    var FK_TYPE = F.photoType      || 'field_2445';
    var FK_REQ  = F.photoRequired  || 'field_2446';
    var FK_COMP = F.photoCompleted || 'field_2447';
    var FK_NOTE = F.photoNotes     || 'field_114';
    // Photo QA fields on the PIC object (matches qa-popover.js). Read only
    // when surfaced as connection columns on the source view — absent on
    // most surfaces, in which case the chit stays Pending / non-blocking.
    var FK_QA_STATUS   = F.photoQaStatus        || 'field_2859';
    var FK_QA_CLIENT   = F.photoQaClient        || 'field_2860';
    var FK_QA_NOTES    = F.photoQaNotes         || 'field_2861';
    var FK_QA_BY       = F.photoQaCompletedBy   || 'field_2862';
    var FK_QA_DATE     = F.photoQaCompletedDate || 'field_2863';
    var FK_QA_HISTORY  = F.photoQaHistory       || 'field_2865';

    var imgCells = findAllCellsByFieldKey(tr, FK_IMG);
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

    var typeCell = findCellByFieldKey(tr, FK_TYPE);
    if (typeCell) {
      var outerSpans = typeCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var j = 0; j < outerSpans.length; j++) {
        var rid2 = (outerSpans[j].id || '').trim();
        if (!rid2) continue;
        var inner = outerSpans[j].querySelector('span[data-kn="connection-value"]');
        ensure(rid2).type = inner ? inner.textContent.trim() : '';
      }
    }

    var reqCell = findCellByFieldKey(tr, FK_REQ);
    if (reqCell) {
      var reqSpans = reqCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var r = 0; r < reqSpans.length; r++) {
        var rid3 = (reqSpans[r].id || '').trim();
        if (!rid3) continue;
        var v = (reqSpans[r].textContent || '').trim().toLowerCase();
        ensure(rid3).required = (v === 'yes');
      }
    }

    var compCell = findCellByFieldKey(tr, FK_COMP);
    if (compCell) {
      var compSpans = compCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var c = 0; c < compSpans.length; c++) {
        var rid4 = (compSpans[c].id || '').trim();
        if (!rid4) continue;
        var cv = (compSpans[c].textContent || '').trim().toLowerCase();
        ensure(rid4).completed = (cv === 'yes');
      }
    }

    var notesCell = findCellByFieldKey(tr, FK_NOTE);
    if (notesCell) {
      var notesSpans = notesCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var n = 0; n < notesSpans.length; n++) {
        var rid5 = (notesSpans[n].id || '').trim();
        if (!rid5) continue;
        ensure(rid5).notes = (notesSpans[n].textContent || '').trim();
      }
    }

    // ── Photo QA fields (install surface) ────────────────────────────
    // Each QA cell, when present, repeats the per-photo connection-value
    // span keyed by the PIC record id — same DOM contract qa-popover.js
    // reads off the worksheet <tr>. Connection fields (status/client/by)
    // nest an inner connection-value span carrying the display text.
    function eachQaSpan(fieldKey, apply) {
      var cell = findCellByFieldKey(tr, fieldKey);
      if (!cell) return false;
      var spans = cell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var i = 0; i < spans.length; i++) {
        var rid = (spans[i].id || '').trim();
        if (!rid) continue;
        apply(ensure(rid), spans[i]);
      }
      return true;
    }
    function spanText(span) {
      var inner = span.querySelector('span[data-kn="connection-value"]');
      return ((inner ? inner.textContent : span.textContent) || '').trim();
    }
    if (eachQaSpan(FK_QA_STATUS, function (rec, span) {
      var t = spanText(span); if (t) { rec.qaStatus = t; rec.qaPresent = true; }
    })) {
      eachQaSpan(FK_QA_CLIENT,  function (rec, span) { var t = spanText(span); if (t) rec.qaClient = t; });
      eachQaSpan(FK_QA_NOTES,   function (rec, span) { rec.qaNotes = (span.textContent || '').trim(); });
      eachQaSpan(FK_QA_BY,      function (rec, span) { rec.qaCompletedBy = spanText(span); });
      eachQaSpan(FK_QA_DATE,    function (rec, span) { rec.qaCompletedDate = (span.textContent || '').trim(); });
      eachQaSpan(FK_QA_HISTORY, function (rec, span) { rec.qaHistory = (span.innerHTML || '').trim(); });
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
    // Survey scene (view_3505): #subcontractor-portal/site-survey-request-
    // details/<id>/edit-doc-photo/<photoId> — matches v1 inline-photo-row.
    var survey = surveyBasePath();
    if (survey) return '#' + survey + '/edit-doc-photo/' + photoRecordId + '/';
    var base = buildSowBasePath();
    if (!base) return '';
    // Deploy scene (install line items, view_3915) uses edit-doc-photo3;
    // sales scope-of-work-details uses edit-doc-photo2; build-SOW uses edit-photo.
    var slug = (base.indexOf('/deploy/') !== -1) ? 'edit-doc-photo3'
      : (base.indexOf('scope-of-work-details') !== -1) ? 'edit-doc-photo2'
      : 'edit-photo';
    return '#' + base + '/' + slug + '/' + photoRecordId + '/';
  }
  function addPhotoHref(lineItemId) {
    // Survey scene: .../add-photo-to-survey-line-item/<lineItemId>.
    var survey = surveyBasePath();
    if (survey) return '#' + survey + '/add-photo-to-survey-line-item/' + lineItemId + '/';
    var base = buildSowBasePath();
    if (!base) return '';
    // Deploy scene → install line item; everywhere else → SOW line item.
    var addSlug = (base.indexOf('/deploy/') !== -1)
      ? 'add-photo-to-install-line-item' : 'add-photo-to-sow-line-item';
    return '#' + base + '/' + addSlug + '/' + lineItemId + '/';
  }

  /** Survey-scene base path. Returns '' off the survey scene so the
   *  SOW/sales/deploy callers above fall through to buildSowBasePath. */
  function surveyBasePath() {
    var hash = window.location.hash || '';
    var m = hash.match(/site-survey-request-details\/([a-f0-9]{24})/);
    return m ? ('subcontractor-portal/site-survey-request-details/' + m[1]) : '';
  }

  /** Public API: build a strip element for one record. Returns null
   *  if there are no photos AND we can\'t build an add link (no usable
   *  base path) — saves visual noise on routes we don\'t support. */
  // Photo delete is enabled ONLY on the OPS surfaces — the build-SOW
  // worksheet (view_3962) and the bid-comparison grid (view_3921, whose
  // expand-panel cards build with that source key). Sales (view_3586) and
  // every other surface stay delete-free. The delete itself rides the
  // native kn-link-delete on the photo's row in whatever DOC_photos grid
  // is on the page (see the delegated handler below).
  var PHOTO_DELETE_VIEWS = { view_3962: 1, view_3921: 1 };

  // Per-surface DOC_photos grid used for the REST-DELETE fallback when the
  // photo's row isn't in the DOM (paginated grid). view_3584 is the
  // delete-enabled photos grid on the build-SOW scene. The review-bids
  // scene's photos grid is unconfirmed — native-link path still works
  // there when the row is present.
  var PHOTO_GRID_FALLBACK_VIEWS = { view_3962: 'view_3584', view_3921: '' };

  // Photo-delete settling registry. Between the optimistic card removal and
  // the authoritative refetch, Knack re-renders rebuild the strip from the
  // STALE source row (the photo connection is still on it) — without this
  // the deleted card resurrects for a beat and then vanishes again ("weird
  // flashing"). buildStrip skips any photo here; entries expire after 20s
  // so a silently-failed delete can't hide a real photo forever.
  var pendingPhotoDeletes = Object.create(null);
  function isPhotoDeletePending(id) {
    var ts = pendingPhotoDeletes[id];
    if (!ts) return false;
    if (Date.now() - ts > 20000) { delete pendingPhotoDeletes[id]; return false; }
    return true;
  }

  var PHOTO_TRASH_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<polyline points="3 6 5 6 21 6"></polyline>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
    '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
    '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>';

  // ── Photo QA chit (install surface) ──────────────────────────────
  // Surfaces a photo's QA state on its strip card and opens the photo QA
  // panel (qa-popover.js openForAnchor) on click. Mirrors the chit-state
  // model qa-popover.js uses (computeChitState). Only rendered when the
  // source view exposed QA columns (p.qaPresent) — i.e. the install
  // worksheet (view_3915). Other surfaces render no chit.
  var QA_CHIT_VIEWS = { view_3915: 1 };

  function qaChitState(p) {
    if (!p.completed) return 'missing';
    var s = (p.qaStatus || '').toLowerCase();
    if (s === 'fail') return 'fail';
    if (s === 'pass') {
      var c = (p.qaClient || '').toLowerCase();
      if (c === '' || c === 'n/a' || c === 'approved' || c === 'bypassed') return 'done';
      return 'half-pass';
    }
    return 'pending';
  }
  function qaChitLabel(state) {
    return ({ missing: 'No photo', pending: 'Needs QA', 'half-pass': 'Client pending',
              done: 'Signed off', fail: 'Failed' })[state] || 'Needs QA';
  }
  var QA_ICONS = {
    done:    '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    fail:    '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    pending: '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
  };
  // "Needs QA" RULE (assumption — see GOAL): a photo needs QA when it is
  // REQUIRED (field_2446 = Yes). Non-required photos get NO QA status served
  // and open the modal as a plain big-photo viewer (no QA sidebar). To change
  // the rule later, this is the one line to edit.
  function photoNeedsQa(p) { return !!p.required; }

  function qaChitHtml(p) {
    var state = qaChitState(p);
    var icon = QA_ICONS[state] || QA_ICONS.pending;
    return '<span class="scw-ws-v2-photo-qa-chit is-' + state + '"' +
      ' data-scw-ws-v2-photo-qa="' + escapeHtml(p.id) + '"' +
      ' data-qa-status="'   + escapeHtml(p.qaStatus || 'Pending') + '"' +
      ' data-qa-client="'   + escapeHtml(p.qaClient || 'N/A')     + '"' +
      ' data-qa-notes="'    + escapeHtml(p.qaNotes || '')         + '"' +
      ' data-qa-history="'  + escapeHtml(p.qaHistory || '')       + '"' +
      ' data-qa-by="'       + escapeHtml(p.qaCompletedBy || '')   + '"' +
      ' data-qa-date="'     + escapeHtml(p.qaCompletedDate || '') + '"' +
      ' data-qa-type="'     + escapeHtml(p.type || 'Photo')       + '"' +
      ' data-qa-img="'      + escapeHtml(p.imgUrl || '')          + '"' +
      ' title="Photo QA — ' + escapeHtml(qaChitLabel(state)) + ' (click to review)">' +
        icon + '<span class="scw-ws-v2-photo-qa-chit-state">' + qaChitLabel(state) + '</span>' +
      '</span>';
  }

  function buildStrip(rec, sourceViewKey) {
    var photos = extractPhotoRecords(sourceViewKey, rec.id);
    var qaEnabled = !!QA_CHIT_VIEWS[sourceViewKey];
    var addHref = addPhotoHref(rec.id);
    // When there are no photos AND no add route, there's nothing to
    // render. Otherwise keep the strip so the user always has a way
    // to attach the first photo from the card.
    if (!photos.length && !addHref) return null;

    var strip = document.createElement('div');
    strip.className = 'scw-ws-v2-photos' +
      (photos.length ? '' : ' scw-ws-v2-photos--add-only');
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
      // Mid-delete photo — keep it out of rebuilds until the refetch
      // confirms it's gone (see pendingPhotoDeletes).
      if (p.id && isPhotoDeletePending(p.id)) continue;
      var href = editPhotoHref(p.id);
      var missing = p.required && !p.completed;
      var cls = 'scw-ws-v2-photo-card' +
        (p.required ? ' scw-ws-v2-photo-card--required' : '') +
        (missing   ? ' scw-ws-v2-photo-card--missing'  : '');
      var thumb = p.imgUrl
        ? '<img class="scw-ws-v2-photo-img" draggable="false" src="' + escapeHtml(p.imgUrl) + '" alt="">'
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
      // Metadata for the in-place photo viewer (lightbox). Carries the
      // full-size url + identity so the delegated click handler can build
      // the viewer without re-scraping the source view.
      var reqState = p.required ? (p.completed ? 'done' : 'missing') : '';
      var needsQa = photoNeedsQa(p);
      // QA snapshot attrs on the card itself (install surface) so a click on
      // the THUMBNAIL can open the same QA modal as the chit — without
      // re-scraping the source view. needsQa drives whether the modal shows
      // the QA sidebar (true) or opens as a plain big-photo viewer (false).
      var qaCardAttrs = (qaEnabled && p.id && p.imgUrl)
        ? ' data-scw-ws-v2-photo-needsqa="' + (needsQa ? '1' : '0') + '"' +
          ' data-qa-status="'  + escapeHtml(p.qaStatus || 'Pending') + '"' +
          ' data-qa-client="'  + escapeHtml(p.qaClient || 'N/A')     + '"' +
          ' data-qa-notes="'   + escapeHtml(p.qaNotes || '')         + '"' +
          ' data-qa-history="' + escapeHtml(p.qaHistory || '')       + '"' +
          ' data-qa-by="'      + escapeHtml(p.qaCompletedBy || '')   + '"' +
          ' data-qa-date="'    + escapeHtml(p.qaCompletedDate || '') + '"'
        : '';
      var dataAttrs =
        ' data-scw-ws-v2-photo-url="'  + escapeHtml(p.imgUrl || '') + '"' +
        ' data-scw-ws-v2-photo-id="'   + escapeHtml(p.id)          + '"' +
        ' data-scw-ws-v2-photo-type="' + escapeHtml(p.type || '')  + '"' +
        ' data-scw-ws-v2-photo-req="'  + reqState + '"' +
        qaCardAttrs +
        // v1-parity drag attrs: filled cards are drag sources, required +
        // image-less cards are drop targets (drag-to-fill-required-slot).
        ' data-photo-id="'         + escapeHtml(p.id) + '"' +
        ' data-photo-has-image="'  + (p.imgUrl ? 'true' : 'false') + '"' +
        ' data-photo-required="'   + (p.required ? 'true' : 'false') + '"' +
        ' data-photo-type="'       + escapeHtml(p.type || '') + '"' +
        ' data-photo-notes="'      + escapeHtml(p.notes || '') + '"';
      // Pointer-based drag (below) handles dragging — native HTML5 draggable
      // is suppressed by KTL on these anchors, so we don't use it. Mark filled
      // cards so the grab cursor + pointer-drag opt-in.
      var draggableAttr = p.imgUrl ? ' data-scw-ws-v2-photo-drag="1"' : '';
      // OPS-only photo delete (see PHOTO_DELETE_VIEWS). Only on cards that
      // hold a real photo record; placeholders have nothing to delete.
      var delBtn = (PHOTO_DELETE_VIEWS[sourceViewKey] && p.id)
        ? '<button type="button" class="scw-ws-v2-photo-del" ' +
            'data-scw-ws-v2-photo-del="' + escapeHtml(p.id) + '" ' +
            'data-scw-ws-v2-photo-view="' + escapeHtml(sourceViewKey) + '" ' +
            'title="Delete photo">' + PHOTO_TRASH_SVG + '</button>'
        : '';
      // Photo QA chit — install surface only, only on cards that hold an
      // actual photo, AND only on photos that NEED QA (required). Non-QA
      // photos are not served a QA status (they still open the big-photo
      // modal, just without the QA sidebar).
      var qaChit = (qaEnabled && p.id && p.imgUrl && photoNeedsQa(p))
        ? qaChitHtml(p) : '';
      html +=
        '<a class="' + cls + '"' + openAttrs + dataAttrs + draggableAttr +
            ' title="' + escapeHtml((p.type || 'Photo') + (p.required ? ' (Required)' : '')) + '">' +
          thumb + typeHtml + reqHtml + qaChit + delBtn +
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

  /* ── In-place photo viewer (ported from bid-review-v2's photo viewer) ──
   * Clicking a thumbnail in the inline strip opens a fullscreen lightbox
   * with a large stage, prev/next + a thumbnail strip to flip between the
   * row's photos, "Open ↗" (full size, new tab), and an "Edit" deep-link
   * to Knack's edit page so that capability isn't lost. Esc / backdrop /
   * ✕ dismiss; ← / → navigate. */
  function captionFor(item) {
    var bits = [];
    if (item.type) bits.push(item.type);
    if (item.req === 'missing') bits.push('Required — not completed');
    else if (item.req === 'done') bits.push('Required ✓');
    return bits.join(' · ');
  }

  function openLightbox(items, startIdx) {
    if (!items || !items.length) return;
    var idx = (startIdx >= 0 && startIdx < items.length) ? startIdx : 0;

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-lightbox';
    overlay.innerHTML =
      '<div class="scw-ws-v2-lightbox-bar">' +
        '<span class="scw-ws-v2-lightbox-caption"></span>' +
        '<span class="scw-ws-v2-lightbox-actions">' +
          '<a class="scw-ws-v2-lightbox-open" target="_blank" rel="noopener">Open ↗</a>' +
          '<a class="scw-ws-v2-lightbox-edit">Edit</a>' +
          '<button type="button" class="scw-ws-v2-lightbox-close" aria-label="Close">✕</button>' +
        '</span>' +
      '</div>' +
      '<div class="scw-ws-v2-lightbox-main">' +
        '<button type="button" class="scw-ws-v2-lightbox-nav scw-ws-v2-lightbox-nav--prev" aria-label="Previous">‹</button>' +
        '<div class="scw-ws-v2-lightbox-stage"><img alt=""></div>' +
        '<button type="button" class="scw-ws-v2-lightbox-nav scw-ws-v2-lightbox-nav--next" aria-label="Next">›</button>' +
      '</div>' +
      '<div class="scw-ws-v2-lightbox-strip"></div>';

    var stageImg = overlay.querySelector('.scw-ws-v2-lightbox-stage img');
    var caption  = overlay.querySelector('.scw-ws-v2-lightbox-caption');
    var openLink = overlay.querySelector('.scw-ws-v2-lightbox-open');
    var editLink = overlay.querySelector('.scw-ws-v2-lightbox-edit');
    var strip    = overlay.querySelector('.scw-ws-v2-lightbox-strip');
    var prevBtn  = overlay.querySelector('.scw-ws-v2-lightbox-nav--prev');
    var nextBtn  = overlay.querySelector('.scw-ws-v2-lightbox-nav--next');
    var multi    = items.length > 1;

    if (!multi) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      strip.style.display = 'none';
    } else {
      for (var i = 0; i < items.length; i++) {
        (function (j) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'scw-ws-v2-lightbox-thumb';
          var t = document.createElement('img');
          t.src = items[j].url; t.alt = ''; t.loading = 'lazy';
          btn.appendChild(t);
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            idx = j; render();
          });
          strip.appendChild(btn);
        })(i);
      }
    }

    function render() {
      var item = items[idx];
      stageImg.src = item.url;
      caption.textContent = captionFor(item);
      openLink.href = item.url;
      if (item.editHref && item.editHref !== '#') {
        editLink.href = item.editHref;
        editLink.style.display = '';
      } else {
        editLink.style.display = 'none';
      }
      if (multi) {
        var thumbs = strip.children;
        for (var i = 0; i < thumbs.length; i++) {
          thumbs[i].classList.toggle('scw-ws-v2-lightbox-thumb--active', i === idx);
        }
      }
    }

    function go(delta) {
      idx = (idx + delta + items.length) % items.length;
      render();
    }
    function dismiss() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') dismiss();
      else if (e.key === 'ArrowLeft' && multi)  go(-1);
      else if (e.key === 'ArrowRight' && multi) go(1);
    }

    prevBtn.addEventListener('click', function (e) { e.stopPropagation(); go(-1); });
    nextBtn.addEventListener('click', function (e) { e.stopPropagation(); go(1); });
    overlay.querySelector('.scw-ws-v2-lightbox-close')
      .addEventListener('click', function (e) { e.stopPropagation(); dismiss(); });
    // Clicking the stage image zooms-to-fit toggle is overkill — clicking
    // anywhere on the backdrop (but not the bar/strip/nav/img) dismisses.
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.classList.contains('scw-ws-v2-lightbox-main') ||
          e.target.classList.contains('scw-ws-v2-lightbox-stage')) {
        dismiss();
      }
    });
    // Don't let the Edit link's hash navigation be swallowed; allow default.
    editLink.addEventListener('click', function () { dismiss(); });

    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    render();
  }

  // Delegated photo-delete (OPS surfaces only — the trash button renders
  // solely on PHOTO_DELETE_VIEWS strips). CAPTURE phase so the lightbox
  // open / edit-page navigation on the wrapping <a> never fires. The
  // delete rides the native kn-link-delete on the photo's own row in
  // whatever DOC_photos grid is on the page — same auto-confirmed
  // two-click-to-one-click pattern as the per-row line-item trash.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-photo-del-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-photo-del-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest &&
                e.target.closest('[data-scw-ws-v2-photo-del]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      var photoId = btn.getAttribute('data-scw-ws-v2-photo-del');
      var viewKey = btn.getAttribute('data-scw-ws-v2-photo-view') || '';
      if (!photoId) return;

      function refetchSoon() {
        setTimeout(function () {
          if (viewKey && ns.data && typeof ns.data.refetchAndNotify === 'function') {
            ns.data.refetchAndNotify(viewKey);
          }
        }, 1500);
      }
      function dropCard() {
        var card = btn.closest('.scw-ws-v2-photo-card');
        if (card && card.parentNode) card.parentNode.removeChild(card);
      }

      // Path 1 — the photo record's row in the photos source grid, if the
      // grid is on the page AND the row is on its current pagination page.
      // Photo ids are 24-hex and unique, so a page-wide lookup is safe.
      var link = document.querySelector(
        'tr[id="' + photoId + '"] a.kn-link-delete'
      );
      if (link) {
        pendingPhotoDeletes[photoId] = Date.now();
        dropCard();
        if (typeof ns.autoConfirmKnackDelete === 'function') ns.autoConfirmKnackDelete();
        link.click();
        refetchSoon();
        return;
      }

      // Path 2 — view-scoped REST DELETE through the photos grid. Covers
      // the common case where the grid is paginated and the photo's row
      // isn't in the DOM. Works for any delete-enabled view on the
      // CURRENT scene (knackRecordUrl is pages/<current scene>/views/…).
      var gridKey = PHOTO_GRID_FALLBACK_VIEWS[viewKey] || '';
      if (gridKey && window.SCW && typeof SCW.knackAjax === 'function' &&
          typeof SCW.knackRecordUrl === 'function') {
        pendingPhotoDeletes[photoId] = Date.now();
        dropCard();
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(gridKey, photoId),
          type: 'DELETE',
          success: function () { refetchSoon(); },
          error: function (xhr) {
            console.warn('[scw-ws-v2] photo delete: REST DELETE via ' + gridKey +
              ' failed for ' + photoId, xhr && xhr.status, xhr && xhr.responseText);
            // Let the card come back — the delete didn't land.
            delete pendingPhotoDeletes[photoId];
            refetchSoon();
          }
        });
        return;
      }

      console.warn('[scw-ws-v2] photo delete: no kn-link-delete row for ' +
        photoId + ' and no fallback grid configured for ' + viewKey +
        ' — is the DOC_photos grid (with Delete enabled) on this page?');
    }, true);
  }

  // Shared opener for the photo QA modal (qa-popover.js openForAnchor). Both
  // the QA chit AND the photo thumbnail (install surface) route through here
  // so they open the IDENTICAL modal off the same snapshot.
  //
  // `el` supplies the QA data-* attrs (the chit, or the photo card itself);
  // `photoId`, `type`, `imgUrl`, `needsQa` come from the caller. When needsQa
  // is false, the modal opens as a plain big-photo viewer (no QA sidebar) —
  // qa-popover.js reads snapshot.needsQa to decide.
  function openPhotoQaModal(el, photoId, type, imgUrl, needsQa) {
    if (!(window.SCW && SCW.qaPopover && typeof SCW.qaPopover.openAnchor === 'function')) {
      console.warn('[scw-ws-v2] photo QA: SCW.qaPopover.openAnchor unavailable');
      return false;
    }
    if (!photoId) return false;

    // Resolve which source view this card belongs to so we can refetch it
    // after a save (rebuilds the strip with the fresh QA state).
    var viewKey = '';
    var host = el.closest('[data-scw-ws-v2-view]') ||
               (el.closest('.scw-ws-v2-card') &&
                el.closest('.scw-ws-v2-card').querySelector('[data-scw-ws-v2-view]'));
    if (host) viewKey = host.getAttribute('data-scw-ws-v2-view') || '';

    var snapshot = {
      type:          type || el.getAttribute('data-qa-type') || 'Photo',
      imgUrl:        imgUrl || el.getAttribute('data-qa-img') || '',
      status:        el.getAttribute('data-qa-status')   || 'Pending',
      client:        el.getAttribute('data-qa-client')   || 'N/A',
      notes:         el.getAttribute('data-qa-notes')    || '',
      history:       el.getAttribute('data-qa-history')  || '',
      completedBy:   el.getAttribute('data-qa-by')       || '',
      completedDate: el.getAttribute('data-qa-date')     || '',
      completed:     true,
      needsQa:       !!needsQa
    };

    SCW.qaPopover.openAnchor(el, photoId, snapshot, function () {
      // Refetch the source view so the strip rebuilds from authoritative
      // data (the QA columns now reflect the save).
      if (viewKey && ns.data && typeof ns.data.refetchAndNotify === 'function') {
        setTimeout(function () { ns.data.refetchAndNotify(viewKey); }, 800);
      }
    });
    return true;
  }

  // Delegated photo-QA chit click (install surface). CAPTURE phase so the
  // wrapping <a>'s lightbox / edit-page navigation never fires. Opens the
  // shared photo QA modal. The chit only ever renders on photos that NEED
  // QA, so this always opens with the QA sidebar (needsQa=true). Bound once.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-photo-qa-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-photo-qa-bound', '1');
    document.addEventListener('click', function (e) {
      var chit = e.target && e.target.closest &&
                 e.target.closest('[data-scw-ws-v2-photo-qa]');
      if (!chit) return;
      e.preventDefault();
      e.stopPropagation();
      openPhotoQaModal(
        chit,
        chit.getAttribute('data-scw-ws-v2-photo-qa'),
        chit.getAttribute('data-qa-type') || 'Photo',
        chit.getAttribute('data-qa-img') || '',
        true   // chit only renders on needs-QA photos
      );
    }, true);
  }

  // Delegated: intercept thumbnail clicks → open the viewer instead of
  // navigating to Knack's edit page. Placeholder cards (no image) and the
  // "+ Add" pill fall through to their default hash navigation. Bound once.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-photo-viewer-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-photo-viewer-bound', '1');
    document.addEventListener('click', function (e) {
      var card = e.target.closest && e.target.closest('a.scw-ws-v2-photo-card');
      if (!card) return;
      // No image to view → let it navigate to the edit page as before.
      if (!card.getAttribute('data-scw-ws-v2-photo-url')) return;

      // Install surface (QA_CHIT_VIEWS): clicking the photo opens the SAME QA
      // modal as the chit — unifying the entry point. The needsqa attr is only
      // emitted on those views, so other surfaces (bid-review/sales/etc.) fall
      // through to the lightbox below unchanged. Required photos open with the
      // QA sidebar; non-required open as a plain big-photo viewer (needsQa=0).
      if (card.hasAttribute('data-scw-ws-v2-photo-needsqa')) {
        var needsQa = card.getAttribute('data-scw-ws-v2-photo-needsqa') === '1';
        var opened = openPhotoQaModal(
          card,
          card.getAttribute('data-scw-ws-v2-photo-id'),
          card.getAttribute('data-scw-ws-v2-photo-type') || 'Photo',
          card.getAttribute('data-scw-ws-v2-photo-url') || '',
          needsQa
        );
        if (opened) { e.preventDefault(); e.stopPropagation(); return; }
        // openPhotoQaModal failed (qaPopover unavailable) — fall through to
        // the lightbox so the user can still see the photo.
      }

      var stripEl = card.closest('.scw-ws-v2-photos-strip');
      if (!stripEl) return;
      var anchors = stripEl.querySelectorAll('a.scw-ws-v2-photo-card');
      var items = [], clickedIdx = 0;
      for (var i = 0; i < anchors.length; i++) {
        var url = anchors[i].getAttribute('data-scw-ws-v2-photo-url') || '';
        if (!url) continue;   // skip placeholders in the viewer
        if (anchors[i] === card) clickedIdx = items.length;
        items.push({
          url:      url,
          id:       anchors[i].getAttribute('data-scw-ws-v2-photo-id')   || '',
          type:     anchors[i].getAttribute('data-scw-ws-v2-photo-type') || '',
          req:      anchors[i].getAttribute('data-scw-ws-v2-photo-req')  || '',
          editHref: anchors[i].getAttribute('href') || ''
        });
      }
      if (!items.length) return;
      e.preventDefault();
      e.stopPropagation();
      openLightbox(items, clickedIdx);
    });
  }

  /* ── Drag-to-fill-required-slot (v1 parity) ───────────────────────
   * Drag a filled photo card onto an empty REQUIRED slot in the same
   * strip → confirm → dispatch the same payload v1 uses (window.SCW.
   * onPhotoDrop, else SCW.CONFIG.MAKE_PHOTO_MOVE_WEBHOOK). Delegated on
   * document so it survives re-renders + the bid-review expand panel. */
  var CARD_SEL = 'a.scw-ws-v2-photo-card';
  var dragSrc = null;

  function cardOf(e) { return (e.target && e.target.closest) ? e.target.closest(CARD_SEL) : null; }
  function stripOf(card) {
    var el = card && card.parentElement;
    while (el && !el.classList.contains('scw-ws-v2-photos-strip')) el = el.parentElement;
    return el;
  }
  function isFilled(card)   { return card && card.getAttribute('data-photo-has-image') === 'true'; }
  function isReqEmpty(card) {
    return card && card.getAttribute('data-photo-has-image') !== 'true' &&
           card.getAttribute('data-photo-required') === 'true';
  }
  // Drop target for drag-to-fill/replace: ANY required slot (empty OR already
  // filled). Dropping onto a filled required slot REPLACES which photo serves
  // that required type. (Was empty-only — which showed no targets once the
  // required slots were already filled.)
  function isReqSlot(card) {
    return card && card.getAttribute('data-photo-required') === 'true';
  }
  function clearDragState() {
    var all = document.querySelectorAll(
      '.scw-ws-v2-photo-drop-ok, .scw-ws-v2-photo-drop-hover, .scw-ws-v2-photo-drag-src');
    for (var i = 0; i < all.length; i++) {
      all[i].classList.remove('scw-ws-v2-photo-drop-ok',
        'scw-ws-v2-photo-drop-hover', 'scw-ws-v2-photo-drag-src');
    }
  }

  function getSurveyRequestId() {
    var hash = window.location.hash || '';
    var m = hash.match(/[a-f0-9]{24}/);
    return m ? m[0] : '';
  }
  function getViewKeyFor(card) {
    var host = card.closest('[data-scw-ws-v2-view]') ||
               (card.closest('.scw-ws-v2-card') &&
                card.closest('.scw-ws-v2-card').querySelector('[data-scw-ws-v2-view]'));
    return host ? host.getAttribute('data-scw-ws-v2-view') : '';
  }

  function dispatchPhotoMove(detail, viewKey) {
    function refresh() {
      if (viewKey && ns.data && typeof ns.data.refetchAndNotify === 'function') {
        setTimeout(function () { ns.data.refetchAndNotify(viewKey); }, 1500);
      }
    }
    if (window.SCW && typeof window.SCW.onPhotoDrop === 'function') {
      window.SCW.onPhotoDrop(detail, { setPending: function(){}, setSuccess: refresh, setError: function(){} });
      return;
    }
    var url = (window.SCW && window.SCW.CONFIG && window.SCW.CONFIG.MAKE_PHOTO_MOVE_WEBHOOK) || '';
    if (!url) { console.warn('[scw-ws-v2] No MAKE_PHOTO_MOVE_WEBHOOK / onPhotoDrop'); return; }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(detail) })
      .then(function () { refresh(); })
      .catch(function () { refresh(); });   // Make webhooks often CORS-block the response
  }

  function confirmMove(targetCard, detail, viewKey) {
    var existing = targetCard.querySelector('.scw-ws-v2-photo-confirm');
    if (existing) return;
    var ov = document.createElement('div');
    ov.className = 'scw-ws-v2-photo-confirm';
    ov.innerHTML =
      '<div class="scw-ws-v2-photo-confirm-text">Use this photo for<br><b>' +
        escapeHtml(detail.targetPhotoType || 'this slot') + '</b>?</div>' +
      '<div class="scw-ws-v2-photo-confirm-btns">' +
        '<button type="button" class="scw-ws-v2-photo-confirm-no">Cancel</button>' +
        '<button type="button" class="scw-ws-v2-photo-confirm-yes">Confirm</button>' +
      '</div>';
    ov.addEventListener('click', function (e) { e.stopPropagation(); e.preventDefault(); });
    ov.querySelector('.scw-ws-v2-photo-confirm-no').addEventListener('click', function () {
      ov.parentNode && ov.parentNode.removeChild(ov);
    });
    ov.querySelector('.scw-ws-v2-photo-confirm-yes').addEventListener('click', function () {
      ov.parentNode && ov.parentNode.removeChild(ov);
      targetCard.classList.add('scw-ws-v2-photo-card--pending');
      dispatchPhotoMove(detail, viewKey);
    });
    targetCard.appendChild(ov);
  }

  // POINTER-BASED drag (KTL suppresses native HTML5 drag-and-drop on these
  // anchors, so we implement drag with mousedown/move/up + a floating ghost).
  // Threshold avoids hijacking plain clicks (which open the QA modal/lightbox);
  // a click that follows a real drag is suppressed.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-photo-drag-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-photo-drag-bound', '1');

    var DRAG_THRESHOLD = 6;
    var pCard = null, pStartX = 0, pStartY = 0, pDragging = false,
        pGhost = null, pHover = null, pSuppressClick = false;

    function pHighlightTargets(card) {
      // Mirror v1 inline-photo-row: valid drop targets are any OTHER card that
      // is still EMPTY (no image yet), required or not. Filled slots are
      // excluded so a drop can never silently overwrite an existing photo.
      var strip = stripOf(card);
      if (!strip) return;
      var srcId = card.getAttribute('data-photo-id');
      var cards = strip.querySelectorAll(CARD_SEL);
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].getAttribute('data-photo-id') === srcId) continue;
        if (cards[i].getAttribute('data-photo-has-image') === 'true') continue;
        cards[i].classList.add('scw-ws-v2-photo-drop-ok');
      }
    }
    // The drop-ok card under the cursor — temporarily hide the ghost so it
    // doesn't shadow elementFromPoint (mirrors v1's targetUnder).
    function pTargetUnder(x, y) {
      var prev = pGhost ? pGhost.style.display : null;
      if (pGhost) pGhost.style.display = 'none';
      var el = document.elementFromPoint(x, y);
      if (pGhost) pGhost.style.display = prev || '';
      var t = (el && el.closest) ? el.closest(CARD_SEL) : null;
      return (t && t.classList.contains('scw-ws-v2-photo-drop-ok')) ? t : null;
    }
    function pMoveGhost(x, y) {
      if (pGhost) { pGhost.style.left = (x + 14) + 'px'; pGhost.style.top = (y + 14) + 'px'; }
    }
    function pCleanup() {
      clearDragState();
      if (pGhost && pGhost.parentNode) pGhost.parentNode.removeChild(pGhost);
      pGhost = null; pDragging = false; pCard = null; pHover = null;
      document.body.style.userSelect = '';
    }

    document.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var card = cardOf(e);
      if (!isFilled(card)) return;
      pCard = card; pStartX = e.clientX; pStartY = e.clientY; pDragging = false;
    }, true);

    document.addEventListener('mousemove', function (e) {
      if (!pCard) return;
      if (!pDragging) {
        if (Math.abs(e.clientX - pStartX) + Math.abs(e.clientY - pStartY) < DRAG_THRESHOLD) return;
        // Start the drag.
        pDragging = true;
        pCard.classList.add('scw-ws-v2-photo-drag-src');
        pHighlightTargets(pCard);
        document.body.style.userSelect = 'none';
        pGhost = document.createElement('div');
        pGhost.className = 'scw-ws-v2-photo-ghost';
        var img = pCard.querySelector('.scw-ws-v2-photo-img');
        if (img && img.tagName === 'IMG' && img.src) {
          var gi = document.createElement('img'); gi.src = img.src; pGhost.appendChild(gi);
        }
        document.body.appendChild(pGhost);
      }
      e.preventDefault();
      pMoveGhost(e.clientX, e.clientY);
      var ok = pTargetUnder(e.clientX, e.clientY);
      if (pHover && pHover !== ok) pHover.classList.remove('scw-ws-v2-photo-drop-hover');
      if (ok) ok.classList.add('scw-ws-v2-photo-drop-hover');
      pHover = ok;
    }, true);

    document.addEventListener('mouseup', function () {
      if (!pCard) return;
      var wasDragging = pDragging, src = pCard, target = pHover;
      if (wasDragging && target) {
        var detail = {
          sourceRecordId:  src.getAttribute('data-photo-id'),
          sourcePhotoType: src.getAttribute('data-photo-type') || '',
          sourceRequired:  src.getAttribute('data-photo-required') === 'true',
          sourceNotes:     src.getAttribute('data-photo-notes') || '',
          targetRecordId:  target.getAttribute('data-photo-id'),
          targetPhotoType: target.getAttribute('data-photo-type') || 'this slot',
          targetRequired:  target.getAttribute('data-photo-required') === 'true',
          targetNotes:     target.getAttribute('data-photo-notes') || '',
          surveyRequestId: getSurveyRequestId()
        };
        var viewKey = getViewKeyFor(target);
        confirmMove(target, detail, viewKey);
      }
      pCleanup();
      if (wasDragging) {
        // Swallow the click that fires after the drag so the QA modal /
        // lightbox doesn't open on drop.
        pSuppressClick = true;
        setTimeout(function () { pSuppressClick = false; }, 50);
      }
    }, true);

    document.addEventListener('click', function (e) {
      if (pSuppressClick) { e.preventDefault(); e.stopPropagation(); pSuppressClick = false; }
    }, true);

    // Escape cancels an in-progress drag (mirrors v1).
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pDragging) pCleanup();
    }, true);
  }

  ns.photos = {
    buildStrip:           buildStrip,
    extractPhotoRecords:  extractPhotoRecords,
    openLightbox:         openLightbox
  };
})();
/*** END WORKSHEET V2 — PHOTOS ************************************************/
