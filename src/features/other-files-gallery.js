/*** FEATURE: Other Files gallery (view_3942) ******************************
 *
 * Replaces the raw "Other Files" DOC_file table on the deploy scene with a
 * thumbnail gallery: image files render their Knack thumb/S3 preview,
 * everything else gets an extension tile. Clicking a tile proxies the row's
 * native kn-view-asset anchor (Knack's viewer/download still handles it);
 * the pencil proxies the row's "edit" page link.
 *
 * FILE TYPE stays editable (field_2877, connection → CONFIG_file type):
 * the type chip opens a picker and saves via a view-based PUT through this
 * view. Option list sources, in order:
 *   1. TYPE_SOURCE_VIEW — a hidden all-records CONFIG_file type grid on the
 *      scene (Builder TODO; set the view + label field below when added).
 *   2. Fallback: the UNION of types already in use across this scene's
 *      models (this view + the closeout views) — covers the common types
 *      with zero Builder work.
 *   3. If neither yields options, the chip falls back to the native edit
 *      page (same as the pencil) so the ability is never lost.
 ****************************************************************************/
(function () {
  'use strict';

  var VIEW        = 'view_3942';
  var FILE_FIELD  = 'field_68';
  var TYPE_FIELD  = 'field_2877';
  // Required/notes/closeout live on the hidden DOC inline-edit grid
  // (view_3941 — the same save view closeout-deliverables.js PUTs
  // through), NOT on view_3942. Reads come from its model, writes PUT
  // through it. Each control feature-detects its column on the save view
  // first (view_3942 as fallback exposure), so the gallery degrades
  // gracefully until Builder exposes a field.
  var SAVE_VIEW      = 'view_3941';
  var REQUIRED_FIELD = 'field_2894';  // FLAG_required (Yes/No)
  var NOTES_FIELD    = 'field_588';   // INPUT_notes
  var CLOSEOUT_FIELD = 'field_2885';  // REL_install closeout (connection)
  // The page's closeout record — read from the closeout grid on the same
  // scene (first row). Flipping a file to Required stamps this onto the
  // DOC so it joins the closeout deliverables.
  var CLOSEOUT_VIEW  = 'view_3940';
  // Builder TODO: hidden all-records grid of CONFIG_file type on the deploy
  // scene. When added, set the view key + the label (name) field key and the
  // picker gets the FULL catalog instead of the in-use union.
  var TYPE_SOURCE_VIEW  = '';
  var TYPE_LABEL_FIELD  = '';
  // Extra views whose models are scanned for in-use types (fallback source).
  var TYPE_UNION_VIEWS  = [VIEW, 'view_3940', 'view_3941'];

  var STYLE_ID = 'scw-ofg-css';
  var EVENT_NS = '.scwOtherFilesGallery';
  var IMG_EXT  = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '#' + VIEW + ' .kn-table-wrapper,',
      '#' + VIEW + ' .kn-records-nav { display: none !important; }',
      '.scw-ofg-grid { display: grid; gap: 12px; margin-top: 8px;',
      '  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }',
      '.scw-ofg-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px;',
      '  overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,.04); position: relative;',
      '  font-family: system-ui, -apple-system, sans-serif; }',
      '.scw-ofg-thumb { display: block; width: 100%; height: 110px; cursor: pointer;',
      '  background: #f1f5f9; border: 0; padding: 0; }',
      '.scw-ofg-thumb img { width: 100%; height: 110px; object-fit: cover; display: block; }',
      '.scw-ofg-ext { display: flex; align-items: center; justify-content: center;',
      '  height: 110px; font: 800 18px/1 system-ui, sans-serif; color: #64748b;',
      '  letter-spacing: .06em; text-transform: uppercase; }',
      '.scw-ofg-body { padding: 8px 10px 9px; }',
      '.scw-ofg-name { display: block; font: 600 11.5px/1.35 system-ui, sans-serif;',
      '  color: #0f4c75; cursor: pointer; word-break: break-all;',
      '  max-height: 2.7em; overflow: hidden; text-decoration: none; }',
      '.scw-ofg-name:hover { text-decoration: underline; }',
      '.scw-ofg-foot { display: flex; align-items: center; gap: 6px; margin-top: 7px; }',
      '.scw-ofg-type { display: inline-flex; align-items: center; gap: 4px; cursor: pointer;',
      '  border-radius: 999px; padding: 3px 9px; font: 600 10.5px/1.2 system-ui, sans-serif;',
      '  background: #eef2f7; color: #334155; border: 1px solid #cbd5e1; max-width: 100%; }',
      '.scw-ofg-type:hover { background: #e2e8f0; }',
      '.scw-ofg-type.is-empty { background: #fff; border-style: dashed; color: #64748b; }',
      '.scw-ofg-edit { margin-left: auto; display: inline-flex; align-items: center;',
      '  justify-content: center; width: 24px; height: 24px; border-radius: 6px;',
      '  cursor: pointer; color: #64748b; background: transparent;',
      '  border: 1px solid transparent; padding: 0; }',
      '.scw-ofg-edit:hover { background: #eef2f7; border-color: #cbd5e1; color: #0f4c75; }',
      '.scw-ofg-note { display: block; margin-top: 5px; cursor: pointer;',
      '  font: 400 11px/1.4 system-ui, sans-serif; color: #475569;',
      '  max-height: 2.8em; overflow: hidden; }',
      '.scw-ofg-note:hover { color: #0f4c75; }',
      '.scw-ofg-note.is-empty { color: #94a3b8; font-style: italic; }',
      '.scw-ofg-req { display: inline-flex; align-items: center; gap: 4px; cursor: pointer;',
      '  border-radius: 999px; padding: 3px 9px; font: 600 10.5px/1.2 system-ui, sans-serif;',
      '  background: #fff; color: #64748b; border: 1px dashed #cbd5e1; }',
      '.scw-ofg-req:hover { background: #f8fafc; }',
      '.scw-ofg-req.is-on { background: #dcfce7; border: 1px solid #86efac; color: #15803d; }',
      '.scw-ofg-pop__body { padding: 10px 12px; }',
      '.scw-ofg-pop__ta { width: 100%; min-height: 84px; box-sizing: border-box;',
      '  border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; resize: vertical;',
      '  font: 12.5px/1.45 system-ui, -apple-system, sans-serif; }',
      '.scw-ofg-pop__ta:focus { outline: none; border-color: #0f4c75;',
      '  box-shadow: 0 0 0 2px rgba(15,76,117,.15); }',
      '.scw-ofg-pop__foot { display: flex; justify-content: flex-end; gap: 8px;',
      '  padding: 0 12px 10px; }',
      '.scw-ofg-pop__btn { padding: 6px 12px; border-radius: 5px; cursor: pointer;',
      '  font: 600 12px/1.2 system-ui, sans-serif; border: 1px solid transparent; }',
      '.scw-ofg-pop__btn--cancel { background: #fff; color: #475569; border-color: #cbd5e1; }',
      '.scw-ofg-pop__btn--ok { background: #0f4c75; color: #fff; }',
      // Type picker popover (fixed, anchored near the chip)
      '.scw-ofg-pop { position: fixed; z-index: 100000; background: #fff;',
      '  border: 1px solid #cbd5e1; border-radius: 8px; min-width: 180px; max-width: 260px;',
      '  box-shadow: 0 12px 30px rgba(15,23,42,.25); overflow: hidden;',
      '  font: 12.5px/1.4 system-ui, -apple-system, sans-serif; }',
      '.scw-ofg-pop__head { padding: 7px 12px; background: #f8fafc; font-weight: 700;',
      '  color: #334155; border-bottom: 1px solid #e2e8f0; }',
      '.scw-ofg-pop__list { max-height: 240px; overflow-y: auto; }',
      '.scw-ofg-pop__opt { display: block; width: 100%; text-align: left; cursor: pointer;',
      '  padding: 7px 12px; border: 0; background: #fff; font: inherit; color: #0f172a; }',
      '.scw-ofg-pop__opt:hover { background: #eff6ff; }',
      '.scw-ofg-pop__opt.is-current { font-weight: 700; color: #0f4c75; }',
      '.scw-ofg-pop__opt--clear { color: #be123c; border-top: 1px solid #eef2f7; }',
      '.scw-ofg-pop__status { padding: 7px 12px; color: #0f4c75; font-weight: 600; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  function modelAttrsById(viewKey) {
    var out = {};
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var ms = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < ms.length; i++) {
        if (ms[i] && ms[i].id) out[ms[i].id] = ms[i].attributes || {};
      }
    } catch (e) { /* view not on scene */ }
    return out;
  }

  // ── Type options ──────────────────────────────────────────────────
  function typeOptions() {
    var seen = {};
    var out = [];
    function add(id, label) {
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push({ id: id, label: label || '(unnamed)' });
    }
    if (TYPE_SOURCE_VIEW) {
      var cat = modelAttrsById(TYPE_SOURCE_VIEW);
      for (var cid in cat) add(cid, String(cat[cid][TYPE_LABEL_FIELD] || '').trim());
    }
    if (!out.length) {
      // Fallback: union of types already in use across the scene's models.
      for (var vi = 0; vi < TYPE_UNION_VIEWS.length; vi++) {
        var recs = modelAttrsById(TYPE_UNION_VIEWS[vi]);
        for (var rid in recs) {
          var raw = recs[rid][TYPE_FIELD + '_raw'];
          if (Array.isArray(raw)) {
            for (var ri = 0; ri < raw.length; ri++) {
              if (raw[ri] && raw[ri].id) add(raw[ri].id, String(raw[ri].identifier || '').trim());
            }
          }
        }
      }
    }
    out.sort(function (a, b) {
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  function putDoc(viewKey, recId, fields, done) {
    if (!(window.SCW && typeof SCW.knackAjax === 'function')) { done(false); return; }
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(viewKey, recId),
      type: 'PUT',
      data: JSON.stringify(fields),
      success: function () { done(true); },
      error:   function () { done(false); }
    });
  }

  /** The page's closeout record id — first row of the closeout grid on
   *  this scene (one closeout per project). */
  function closeoutRecordId() {
    var row = document.querySelector('#' + CLOSEOUT_VIEW + ' tbody tr[id]');
    return row ? row.id : '';
  }

  /** Which view exposes a field as a column — the save view preferred
   *  (hidden views keep their DOM), view_3942 as fallback. A view-based
   *  PUT only accepts fields the view exposes, so the answer is both
   *  "can we show this control" and "where do we write it". */
  function columnView(fk) {
    if (document.querySelector('#' + SAVE_VIEW + ' thead th.' + fk)) return SAVE_VIEW;
    if (document.querySelector('#' + VIEW + ' thead th.' + fk)) return VIEW;
    return '';
  }

  function stripHtml(s) {
    var div = document.createElement('div');
    div.innerHTML = String(s == null ? '' : s);
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function refetch() {
    // Refresh the save view's model FIRST (it's the read source for
    // required/notes), then the gallery view — its render event rebuilds
    // the cards against the fresh save-view model.
    try {
      var sv = window.Knack && Knack.views && Knack.views[SAVE_VIEW];
      if (sv && sv.model && typeof sv.model.fetch === 'function') sv.model.fetch();
    } catch (e) { /* best-effort */ }
    setTimeout(function () {
      try {
        var v = window.Knack && Knack.views && Knack.views[VIEW];
        if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
      } catch (e) { /* best-effort */ }
    }, 350);
    // The closeout grid (view_3940) renders the deliverables strip from
    // its OWN connection columns — a required flip that (un)links the DOC
    // to the closeout (field_2885) doesn't show up there until ITS model
    // refetches (its fetch re-fires knack-view-render, which rebuilds the
    // strip). Fetch twice, staggered, so a lagging reverse-connection
    // update still lands without the user refreshing the page.
    function fetchCloseout() {
      try {
        var cv = window.Knack && Knack.views && Knack.views[CLOSEOUT_VIEW];
        if (cv && cv.model && typeof cv.model.fetch === 'function') cv.model.fetch();
      } catch (e) { /* best-effort */ }
    }
    setTimeout(fetchCloseout, 700);
    setTimeout(fetchCloseout, 2800);
  }

  function closePopover() {
    var p = document.querySelector('.scw-ofg-pop');
    if (p) p.remove();
    document.removeEventListener('mousedown', onDocDown, true);
  }
  function onDocDown(e) {
    var p = document.querySelector('.scw-ofg-pop');
    if (p && !p.contains(e.target)) closePopover();
  }

  function openTypePicker(anchorEl, recId, currentId, fallbackNav) {
    closePopover();
    var opts = typeOptions();
    if (!opts.length) { fallbackNav(); return; }

    var pop = document.createElement('div');
    pop.className = 'scw-ofg-pop';
    var listHtml = '';
    for (var i = 0; i < opts.length; i++) {
      listHtml += '<button type="button" class="scw-ofg-pop__opt' +
        (opts[i].id === currentId ? ' is-current' : '') + '" data-type-id="' +
        esc(opts[i].id) + '">' + esc(opts[i].label) + '</button>';
    }
    if (currentId) {
      listHtml += '<button type="button" class="scw-ofg-pop__opt scw-ofg-pop__opt--clear" ' +
        'data-type-id="">Clear type</button>';
    }
    pop.innerHTML =
      '<div class="scw-ofg-pop__head">File type</div>' +
      '<div class="scw-ofg-pop__list">' + listHtml + '</div>';
    document.body.appendChild(pop);

    var r = anchorEl.getBoundingClientRect();
    var vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    pop.style.left = Math.min(r.left, vw - pop.offsetWidth - 12) + 'px';
    pop.style.top  = (r.bottom + 6 + pop.offsetHeight > vh
      ? Math.max(8, r.top - pop.offsetHeight - 6)
      : r.bottom + 6) + 'px';

    pop.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-type-id]');
      if (!btn) return;
      var id = btn.getAttribute('data-type-id');
      pop.innerHTML = '<div class="scw-ofg-pop__status">Saving…</div>';
      var fields = {};
      fields[TYPE_FIELD] = id ? [id] : [];   // [] clears the connection
      putDoc(columnView(TYPE_FIELD) || VIEW, recId, fields, function (ok) {
        closePopover();
        if (ok) refetch();
        else alert('Could not save the file type — try again.');
      });
    });
    setTimeout(function () {
      document.addEventListener('mousedown', onDocDown, true);
    }, 0);
  }

  function openNotesEditor(anchorEl, recId, currentText) {
    closePopover();
    var pop = document.createElement('div');
    pop.className = 'scw-ofg-pop';
    pop.style.width = '260px';
    pop.innerHTML =
      '<div class="scw-ofg-pop__head">Notes</div>' +
      '<div class="scw-ofg-pop__body">' +
        '<textarea class="scw-ofg-pop__ta"></textarea>' +
      '</div>' +
      '<div class="scw-ofg-pop__foot">' +
        '<button type="button" class="scw-ofg-pop__btn scw-ofg-pop__btn--cancel">Cancel</button>' +
        '<button type="button" class="scw-ofg-pop__btn scw-ofg-pop__btn--ok">Save</button>' +
      '</div>';
    document.body.appendChild(pop);
    var ta = pop.querySelector('.scw-ofg-pop__ta');
    ta.value = currentText || '';

    var r = anchorEl.getBoundingClientRect();
    var vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    pop.style.left = Math.min(r.left, vw - pop.offsetWidth - 12) + 'px';
    pop.style.top  = (r.bottom + 6 + pop.offsetHeight > vh
      ? Math.max(8, r.top - pop.offsetHeight - 6)
      : r.bottom + 6) + 'px';
    setTimeout(function () { ta.focus(); }, 30);

    pop.querySelector('.scw-ofg-pop__btn--cancel').addEventListener('click', closePopover);
    pop.querySelector('.scw-ofg-pop__btn--ok').addEventListener('click', function () {
      var fields = {};
      fields[NOTES_FIELD] = ta.value.trim();
      pop.innerHTML = '<div class="scw-ofg-pop__status">Saving…</div>';
      putDoc(columnView(NOTES_FIELD) || SAVE_VIEW, recId, fields, function (ok) {
        closePopover();
        if (ok) refetch();
        else alert('Could not save the notes — try again.');
      });
    });
    setTimeout(function () {
      document.addEventListener('mousedown', onDocDown, true);
    }, 0);
  }

  // ── Cards ─────────────────────────────────────────────────────────
  // caps: which optional columns view_3942 actually exposes.
  function buildCard(row, attrs, caps) {
    var recId  = row.id;
    var assetA = row.querySelector('td.' + FILE_FIELD + ' a.kn-view-asset') ||
                 row.querySelector('td.' + FILE_FIELD + ' a[href]');
    var editA  = row.querySelector('td.kn-table-link a, .kn-table-link a');
    var raw    = (attrs && attrs[FILE_FIELD + '_raw']) || null;
    var name   = (raw && raw.filename) ||
                 (assetA ? assetA.textContent.replace(/\s+/g, ' ').trim() : 'File');
    var thumb  = raw ? (raw.thumb_url || (IMG_EXT.test(name) ? raw.url : '')) : '';
    var extM   = name.match(/\.([a-z0-9]{1,5})$/i);
    var ext    = extM ? extM[1] : 'file';

    var typeRaw   = attrs && attrs[TYPE_FIELD + '_raw'];
    var typeId    = (Array.isArray(typeRaw) && typeRaw.length && typeRaw[0]) ? (typeRaw[0].id || '') : '';
    var typeLabel = (Array.isArray(typeRaw) && typeRaw.length && typeRaw[0]) ?
      String(typeRaw[0].identifier || '').trim() : '';

    // Required/notes live on the SAVE VIEW's model (view_3941 — the DOC
    // inline-edit grid); fall back to a view_3942 cell if the field is
    // exposed there instead.
    function readDocField(fk) {
      var sv = modelAttrsById(SAVE_VIEW)[recId];
      if (sv && sv[fk] !== undefined) return stripHtml(sv[fk]);
      var td = row.querySelector('td.' + fk);
      return td ? td.textContent.replace(/\s+/g, ' ').trim() : '';
    }
    var notesTxt   = caps.notes ? readDocField(NOTES_FIELD) : '';
    var isRequired = caps.required && /^yes$/i.test(readDocField(REQUIRED_FIELD));

    var card = document.createElement('div');
    card.className = 'scw-ofg-card';
    card.innerHTML =
      '<button type="button" class="scw-ofg-thumb" title="Open file">' +
        (thumb
          ? '<img src="' + esc(thumb) + '" alt="" loading="lazy">'
          : '<span class="scw-ofg-ext">' + esc(ext) + '</span>') +
      '</button>' +
      '<div class="scw-ofg-body">' +
        '<a class="scw-ofg-name" href="javascript:void(0)">' + esc(name) + '</a>' +
        (caps.notes
          ? '<span class="scw-ofg-note' + (notesTxt ? '' : ' is-empty') + '" title="Edit notes">' +
              esc(notesTxt || '+ Add note') + '</span>'
          : '') +
        '<div class="scw-ofg-foot">' +
          '<button type="button" class="scw-ofg-type' + (typeLabel ? '' : ' is-empty') + '"' +
            ' title="Set file type">' + esc(typeLabel || '+ Type') + '</button>' +
          (caps.required
            ? '<button type="button" class="scw-ofg-req' + (isRequired ? ' is-on' : '') + '"' +
                ' title="Toggle closeout-required">' + (isRequired ? '✓ Required' : 'Required?') + '</button>'
            : '') +
          (editA
            ? '<button type="button" class="scw-ofg-edit" title="Edit file record">' +
                '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
                'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
                '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>' +
              '</button>'
            : '') +
        '</div>' +
      '</div>';

    function openAsset(e) { e.preventDefault(); if (assetA) assetA.click(); }
    card.querySelector('.scw-ofg-thumb').addEventListener('click', openAsset);
    card.querySelector('.scw-ofg-name').addEventListener('click', openAsset);

    function navEdit() { if (editA) editA.click(); }
    var editBtn = card.querySelector('.scw-ofg-edit');
    if (editBtn) editBtn.addEventListener('click', navEdit);

    card.querySelector('.scw-ofg-type').addEventListener('click', function () {
      openTypePicker(this, recId, typeId, navEdit);
    });

    var noteEl = card.querySelector('.scw-ofg-note');
    if (noteEl) noteEl.addEventListener('click', function () {
      openNotesEditor(this, recId, notesTxt);
    });

    var reqBtn = card.querySelector('.scw-ofg-req');
    if (reqBtn) reqBtn.addEventListener('click', function () {
      var next = !isRequired;
      var reqView = columnView(REQUIRED_FIELD) || SAVE_VIEW;
      var cloView = caps.closeout ? (columnView(CLOSEOUT_FIELD) || SAVE_VIEW) : '';
      var fields = {};
      fields[REQUIRED_FIELD] = next ? 'Yes' : 'No';
      // Required ⇄ closeout membership travel together: flipping ON stamps
      // the page's closeout record onto the DOC (the deliverables strip
      // picks it up); flipping OFF clears the link again. The closeout
      // connection lives on view_3941 — ride the same PUT when both
      // fields share a view, else chain a second PUT.
      var cloFields = null;
      if (cloView) {
        var cloVal = [];
        if (next) {
          var clo = closeoutRecordId();
          if (clo) cloVal = [clo];
          else if (window.console) {
            console.warn('[scw-ofg] no closeout record found on this scene — ' +
              'required flag set WITHOUT the closeout link');
          }
        }
        if (cloView === reqView) fields[CLOSEOUT_FIELD] = cloVal;
        else { cloFields = {}; cloFields[CLOSEOUT_FIELD] = cloVal; }
      }
      reqBtn.disabled = true;
      reqBtn.textContent = 'Saving…';
      putDoc(reqView, recId, fields, function (ok) {
        if (!ok) {
          reqBtn.disabled = false;
          reqBtn.textContent = isRequired ? '✓ Required' : 'Required?';
          alert('Could not save the required flag — try again.');
          return;
        }
        if (!cloFields) { refetch(); return; }
        putDoc(cloView, recId, cloFields, function (ok2) {
          refetch();
          if (!ok2) alert('Required flag saved, but the closeout link did not — try the flip again.');
        });
      });
    });

    return card;
  }

  function render() {
    var viewEl = document.getElementById(VIEW);
    if (!viewEl) return;
    injectCss();

    var prior = viewEl.querySelector(':scope > .scw-ofg-grid');
    if (prior) prior.remove();
    closePopover();

    var rows = viewEl.querySelectorAll('tbody tr[id]');
    if (!rows.length) return;

    var attrsById = modelAttrsById(VIEW);
    var caps = {
      required: !!columnView(REQUIRED_FIELD),
      notes:    !!columnView(NOTES_FIELD),
      closeout: !!columnView(CLOSEOUT_FIELD)
    };
    var grid = document.createElement('div');
    grid.className = 'scw-ofg-grid';
    for (var i = 0; i < rows.length; i++) {
      grid.appendChild(buildCard(rows[i], attrsById[rows[i].id], caps));
    }
    viewEl.appendChild(grid);
  }

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW, function () { setTimeout(render, 30); }, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(render, 150); });
})();
/*** END FEATURE: Other Files gallery **************************************/
