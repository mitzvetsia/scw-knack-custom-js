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
      var href = editPhotoHref(p.id);
      var missing = p.required && !p.completed;
      var cls = 'scw-ws-v2-photo-card' +
        (p.required ? ' scw-ws-v2-photo-card--required' : '') +
        (missing   ? ' scw-ws-v2-photo-card--missing'  : '');
      var thumb = p.imgUrl
        ? '<img class="scw-ws-v2-photo-img" draggable="true" src="' + escapeHtml(p.imgUrl) + '" alt="">'
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
      var dataAttrs =
        ' data-scw-ws-v2-photo-url="'  + escapeHtml(p.imgUrl || '') + '"' +
        ' data-scw-ws-v2-photo-id="'   + escapeHtml(p.id)          + '"' +
        ' data-scw-ws-v2-photo-type="' + escapeHtml(p.type || '')  + '"' +
        ' data-scw-ws-v2-photo-req="'  + reqState + '"' +
        // v1-parity drag attrs: filled cards are drag sources, required +
        // image-less cards are drop targets (drag-to-fill-required-slot).
        ' data-photo-id="'         + escapeHtml(p.id) + '"' +
        ' data-photo-has-image="'  + (p.imgUrl ? 'true' : 'false') + '"' +
        ' data-photo-required="'   + (p.required ? 'true' : 'false') + '"' +
        ' data-photo-type="'       + escapeHtml(p.type || '') + '"' +
        ' data-photo-notes="'      + escapeHtml(p.notes || '') + '"';
      var draggableAttr = p.imgUrl ? ' draggable="true"' : '';
      html +=
        '<a class="' + cls + '"' + openAttrs + dataAttrs + draggableAttr +
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

  if (!document.documentElement.hasAttribute('data-scw-ws-v2-photo-drag-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-photo-drag-bound', '1');

    document.addEventListener('dragstart', function (e) {
      var card = cardOf(e);
      if (!isFilled(card)) return;
      dragSrc = card;
      card.classList.add('scw-ws-v2-photo-drag-src');
      try { e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('text/plain', card.getAttribute('data-photo-id') || ''); } catch (x) {}
      var strip = stripOf(card);
      if (strip) {
        var cards = strip.querySelectorAll(CARD_SEL);
        for (var i = 0; i < cards.length; i++) {
          if (cards[i] !== card && isReqEmpty(cards[i])) {
            cards[i].classList.add('scw-ws-v2-photo-drop-ok');
          }
        }
      }
    }, true);

    document.addEventListener('dragend', function () {
      clearDragState();
      dragSrc = null;
    }, true);

    document.addEventListener('dragover', function (e) {
      if (!dragSrc) return;
      var card = cardOf(e);
      if (!card || !card.classList.contains('scw-ws-v2-photo-drop-ok')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('dragenter', function (e) {
      if (!dragSrc) return;
      var card = cardOf(e);
      if (!card || !card.classList.contains('scw-ws-v2-photo-drop-ok')) return;
      e.preventDefault();
      card.classList.add('scw-ws-v2-photo-drop-hover');
    });
    document.addEventListener('dragleave', function (e) {
      var card = cardOf(e);
      if (!card || card.contains(e.relatedTarget)) return;
      card.classList.remove('scw-ws-v2-photo-drop-hover');
    });
    document.addEventListener('drop', function (e) {
      var targetCard = cardOf(e);
      if (!targetCard || !targetCard.classList.contains('scw-ws-v2-photo-drop-ok') || !dragSrc) return;
      e.preventDefault();
      var detail = {
        sourceRecordId:  dragSrc.getAttribute('data-photo-id'),
        sourcePhotoType: dragSrc.getAttribute('data-photo-type') || '',
        sourceRequired:  dragSrc.getAttribute('data-photo-required') === 'true',
        sourceNotes:     dragSrc.getAttribute('data-photo-notes') || '',
        targetRecordId:  targetCard.getAttribute('data-photo-id'),
        targetPhotoType: targetCard.getAttribute('data-photo-type') || 'this slot',
        targetRequired:  targetCard.getAttribute('data-photo-required') === 'true',
        targetNotes:     targetCard.getAttribute('data-photo-notes') || '',
        surveyRequestId: getSurveyRequestId()
      };
      var viewKey = getViewKeyFor(targetCard);
      clearDragState();
      confirmMove(targetCard, detail, viewKey);
    });
  }

  ns.photos = {
    buildStrip:           buildStrip,
    extractPhotoRecords:  extractPhotoRecords,
    openLightbox:         openLightbox
  };
})();
/*** END WORKSHEET V2 — PHOTOS ************************************************/
