/*** MDF / IDF LOCATION CARDS *********************************************
 *
 * Redesigns the "Edit / Rename MDFs & IDFs" location list (view_3577 and its
 * siblings on the survey / sales / sub pages) — the grids that used to host a
 * V1 worksheet. The raw Knack table crams a type column, a number, a name, two
 * note columns, a redundant computed display name, a pics thumb, a photo-edit
 * link, a delete link and a lifecycle flag into ~13 columns; with one HEADEND
 * and a stack of IDFs it reads as noise.
 *
 * Each location becomes a compact EDITABLE card: a type/number badge (the
 * HEADEND/MDF accented apart from the IDFs), a prominent name field, notes +
 * survey-notes inputs, and a photos / delete aside. Because this view exists to
 * rename + renumber locations, editing stays first-class — fields PUT directly
 * (only the columns Knack marks inline-editable get an input) and sync the
 * model in place, so there's no refetch flash and the caret stays put.
 *
 * REUSE ACROSS VIEWS: rather than a hardcoded view list, any rendered table
 * carrying the MDF/IDF signature (field_1641 type + field_1943 name + field_1642
 * computed display name) is transformed — so every sibling location grid picks
 * the design up automatically. The raw table is kept (display:none) for the
 * model + native links; a persisted "Table view" toggle restores it.
 ***************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-mdf-idf-cards-css';
  var EVENT_NS = '.scwMdfIdfCards';
  var MODE_LS  = 'scwMdfIdfCardsMode';   // 'cards' | 'table'

  // MDF/IDF location object fields (same object on every sibling view).
  var F = {
    type:        'field_1641',  // HEADEND / IDF
    num:         'field_2458',  // ## (IDF number)
    name:        'field_1943',  // NAME
    notes:       'field_1643',  // NOTES
    surveyNotes: 'field_2457',  // INPUT_survey notes
    displayName: 'field_1642',  // DISPLAY_mdf_idf_name (computed) — signature only
    pics:        'field_771'     // PICs (thumbnail)
  };
  // Strong signature for the MDF/IDF location object — all three required so we
  // never transform an unrelated grid.
  var SIGNATURE = [F.type, F.name, F.displayName];
  // Secondary editable fields, in card order. Rendered as inputs only when the
  // row's cell is inline-editable on that view (Knack marks it .cell-edit).
  var NOTE_FIELDS = [
    { key: F.notes,       label: 'Notes' },
    { key: F.surveyNotes, label: 'Survey notes' }
  ];

  // ── Delete gating ───────────────────────────────────────────
  // Per-view: the location delete only works while the SOW has NO associated
  // ClickUp task. view_3602 (sales build page, scene_1116): the workflow's
  // Initiate step creates the CU task and its link renders in the view_3491
  // details — from that point ops is working off these locations, so the
  // trash renders inert (grayed + tooltip) instead of deleting. Detection is
  // DOM-based (any clickup.com anchor inside cuLinkView — the same read
  // co-header-card.js uses), so no field key is needed; an empty link field
  // renders no anchor and the delete stays available. scanAll() re-runs on
  // every view render, so the gate re-evaluates when view_3491 populates
  // late or refreshes after Initiate.
  var DELETE_GATE = {
    'view_3602': {
      cuLinkView: 'view_3491',
      title: 'This SOW already has a ClickUp task — locations can’t be ' +
             'deleted once work is initiated.'
    }
  };
  function deleteGateActive(viewKey) {
    var gate = DELETE_GATE[viewKey];
    if (!gate) return null;
    var root = document.getElementById(gate.cuLinkView);
    if (!root) return null;   // gate view absent → fail open (delete allowed)
    return root.querySelector('a[href*="clickup.com"]') ? gate : null;
  }

  // ── model / cell reads ──────────────────────────────────────
  function viewModels(viewKey) {
    try {
      var v = Knack && Knack.views && Knack.views[viewKey];
      return (v && v.model && v.model.data && v.model.data.models) || null;
    } catch (e) { return null; }
  }
  function attrsFor(viewKey, recId) {
    var models = viewModels(viewKey);
    if (!models) return null;
    for (var i = 0; i < models.length; i++) {
      if (models[i].id === recId) return models[i].attributes;
    }
    return null;
  }
  function stripTags(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  // Plain value (tags stripped), model-first, DOM cell as fallback.
  function val(attrs, tr, field) {
    if (attrs) {
      var rawv = attrs[field + '_raw'];
      if (rawv != null && typeof rawv !== 'object') return String(rawv);
      var v = attrs[field];
      if (v != null && typeof v !== 'object') return stripTags(v);
    }
    var td = tr && tr.querySelector('td.' + field + ', td[data-field-key="' + field + '"]');
    return td ? stripTags(td.textContent) : '';
  }
  function isEditable(tr, field) {
    var td = tr && tr.querySelector('td.' + field + ', td[data-field-key="' + field + '"]');
    return !!(td && td.classList.contains('cell-edit'));
  }
  function isHeadend(typeVal) {
    var s = String(typeVal || '').toLowerCase();
    return s.indexOf('head') !== -1 || s.indexOf('mdf') !== -1;
  }

  // ── markup helpers ──────────────────────────────────────────
  function input(viewKey, recId, field, value, cls, extra) {
    return '<input type="text" class="scw-mdf-input ' + (cls || '') + '" ' +
      'data-view="' + esc(viewKey) + '" data-rec="' + esc(recId) + '" ' +
      'data-field="' + esc(field) + '" value="' + esc(value) + '" ' +
      'data-scw-saved-val="' + esc(value) + '" ' + (extra || '') + '>';
  }
  function readonlyVal(value) {
    return '<span class="scw-mdf-ro">' + esc(value || '—') + '</span>';
  }
  function iconSvg(name) {
    var p = {
      camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>' +
              '<circle cx="12" cy="13" r="4"/>',
      trash:  '<polyline points="3 6 5 6 21 6"/>' +
              '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
    };
    return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (p[name] || '') + '</svg>';
  }

  // Photos + delete aside — reuse the row's native Knack links so behaviour
  // (photo-edit page nav, Vue delete confirm) is preserved verbatim.
  function buildAside(viewKey, tr) {
    var aside = document.createElement('div');
    aside.className = 'scw-mdf-card__aside';

    var picCell = tr.querySelector('td.' + F.pics + ', td[data-field-key="' + F.pics + '"]');
    var picImg  = picCell && picCell.querySelector('img');

    var pageLink = tr.querySelector('a.kn-link-page');
    if (pageLink && pageLink.getAttribute('href')) {
      var photos = document.createElement('a');
      photos.className = 'scw-mdf-photos' + (picImg ? ' scw-mdf-photos--has' : '');
      photos.setAttribute('href', pageLink.getAttribute('href'));
      photos.setAttribute('title', picImg ? 'View / edit photos' : 'Add photos');
      if (picImg) {
        var thumb = picImg.cloneNode(true);
        thumb.className = 'scw-mdf-photos__thumb';
        thumb.removeAttribute('width'); thumb.removeAttribute('height');
        photos.appendChild(thumb);
      } else {
        photos.innerHTML = iconSvg('camera');
      }
      var plabel = document.createElement('span');
      plabel.textContent = picImg ? 'Photos' : 'Add photos';
      photos.appendChild(plabel);
      aside.appendChild(photos);
    }

    var delLink = tr.querySelector('a.kn-link-delete');
    if (delLink) {
      var gate = deleteGateActive(viewKey);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'scw-mdf-del' + (gate ? ' scw-mdf-del--gated' : '');
      del.setAttribute('title', gate ? gate.title : 'Delete location');
      del.innerHTML = iconSvg('trash');
      if (gate) {
        // Not the `disabled` attribute — disabled buttons swallow pointer
        // events and the explanatory tooltip never shows.
        del.setAttribute('aria-disabled', 'true');
        del.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
        });
      } else {
        del.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          delLink.click();
        });
      }
      aside.appendChild(del);
    }
    return aside;
  }

  // ── one card ────────────────────────────────────────────────
  // typeOptions: fn(currentVal) → <option> markup, seeded from this view's
  // distinct type values (so the type <select> invents nothing).
  function buildCard(viewKey, tr, typeOptions) {
    var recId = tr.id;
    var attrs = attrsFor(viewKey, recId);
    var typeVal = val(attrs, tr, F.type);
    var numVal  = val(attrs, tr, F.num);
    var nameVal = val(attrs, tr, F.name);
    var head    = isHeadend(typeVal);

    var card = document.createElement('div');
    card.className = 'scw-mdf-card' + (head ? ' scw-mdf-card--head' : ' scw-mdf-card--idf');
    card.setAttribute('data-rec-id', recId);

    // Type lives INSIDE the badge — as a select (styled to read as the badge
    // label) when editable, else a static label. No separate type control, so
    // the type isn't shown twice.
    var typeEditable = isEditable(tr, F.type) && typeof typeOptions === 'function';
    var typeInner = typeEditable
      ? '<select class="scw-mdf-input scw-mdf-badge__type-sel" data-view="' + esc(viewKey) +
          '" data-rec="' + esc(recId) + '" data-field="' + esc(F.type) +
          '" data-scw-saved-val="' + esc(typeVal) + '" aria-label="Type">' + typeOptions(typeVal) + '</select>'
      : '<span class="scw-mdf-badge__type">' + esc(typeVal || (head ? 'HEADEND' : 'IDF')) + '</span>';

    // Number: shown for IDFs (or anything that already has one). A HEADEND/MDF
    // is singular, so no empty "#" box there.
    var numEditable = isEditable(tr, F.num);
    var numCell = '';
    if (numVal || (numEditable && !head)) {
      numCell = numEditable
        ? input(viewKey, recId, F.num, numVal, 'scw-mdf-num', 'inputmode="numeric" placeholder="#" aria-label="Number"')
        : '<span class="scw-mdf-badge__num">' + esc(numVal) + '</span>';
    }
    var badge = '<div class="scw-mdf-badge">' + typeInner + numCell + '</div>';

    var nameField = isEditable(tr, F.name)
      ? input(viewKey, recId, F.name, nameVal, 'scw-mdf-name', 'placeholder="Location name" aria-label="Name"')
      : '<div class="scw-mdf-name scw-mdf-name--ro">' + esc(nameVal || '(unnamed)') + '</div>';

    var row1 = document.createElement('div');
    row1.className = 'scw-mdf-card__row1';
    row1.innerHTML = badge + '<div class="scw-mdf-card__namewrap">' + nameField + '</div>';
    row1.appendChild(buildAside(viewKey, tr));
    card.appendChild(row1);

    var noteBits = [];
    for (var i = 0; i < NOTE_FIELDS.length; i++) {
      var f = NOTE_FIELDS[i];
      var v = val(attrs, tr, f.key);
      var editable = isEditable(tr, f.key);
      if (!editable && !v) continue;
      noteBits.push(
        '<label class="scw-mdf-note"><span class="scw-mdf-note__l">' + esc(f.label) + '</span>' +
        (editable
          ? input(viewKey, recId, f.key, v, 'scw-mdf-note__input', 'placeholder="—"')
          : readonlyVal(v)) +
        '</label>');
    }
    if (noteBits.length) {
      var row2 = document.createElement('div');
      row2.className = 'scw-mdf-card__row2';
      row2.innerHTML = noteBits.join('');
      card.appendChild(row2);
    }
    return card;
  }

  // ── inline save ─────────────────────────────────────────────
  function saveInput(el) {
    var viewKey = el.getAttribute('data-view');
    var recId   = el.getAttribute('data-rec');
    var field   = el.getAttribute('data-field');
    if (!viewKey || !recId || !field) return;
    if (el.getAttribute('data-scw-saved-val') === el.value) return;   // unchanged
    if (!(window.SCW && SCW.mdfEdit)) return;
    var value = el.value;
    var body = {}; body[field] = value;
    el.classList.add('scw-mdf-input--saving');
    function flagErr() {
      el.classList.remove('scw-mdf-input--saving');
      el.classList.add('scw-mdf-input--err');
      setTimeout(function () { el.classList.remove('scw-mdf-input--err'); }, 2500);
    }
    // Shared core save (mdf-edit-core.js) — silent-drop detection,
    // display-formula verification, and model sync in place (no refetch /
    // re-render, so the caret stays put) — identical semantics to the
    // worksheet + compare-bid location editors.
    SCW.mdfEdit.save({
      viewKey:  viewKey,
      recordId: recId,
      fields:   body,
      onDone: function (res) {
        if (res.dropped.length) return;   // onDropped already flagged it
        el.classList.remove('scw-mdf-input--saving');
        el.setAttribute('data-scw-saved-val', value);
        el.classList.add('scw-mdf-input--saved');
        setTimeout(function () { el.classList.remove('scw-mdf-input--saved'); }, 1200);
      },
      onDropped: flagErr,
      onError: flagErr
    });
  }

  // ── transform ───────────────────────────────────────────────
  function matchesSignature(table) {
    for (var i = 0; i < SIGNATURE.length; i++) {
      if (!table.querySelector('th.' + SIGNATURE[i] + ', td.' + SIGNATURE[i])) return false;
    }
    return true;
  }
  function typeOptionsFactory(rows) {
    var seen = Object.create(null), types = [];
    for (var i = 0; i < rows.length; i++) {
      var td = rows[i].querySelector('td.' + F.type);
      var t = td ? stripTags(td.textContent) : '';
      if (t && !seen[t]) { seen[t] = true; types.push(t); }
    }
    return function (cur) {
      var opts = '', has = false;
      for (var j = 0; j < types.length; j++) {
        if (types[j] === cur) has = true;
        opts += '<option value="' + esc(types[j]) + '"' + (types[j] === cur ? ' selected' : '') +
          '>' + esc(types[j]) + '</option>';
      }
      if (cur && !has) opts = '<option value="' + esc(cur) + '" selected>' + esc(cur) + '</option>' + opts;
      return opts;
    };
  }
  function currentMode() {
    try { return localStorage.getItem(MODE_LS) === 'table' ? 'table' : 'cards'; }
    catch (e) { return 'cards'; }
  }
  function applyMode(view, mode) {
    if (mode === 'table') view.classList.remove('scw-mdf-cards-on');
    else view.classList.add('scw-mdf-cards-on');
    var btn = view.querySelector('.scw-mdf-toggle');
    if (btn) btn.textContent = (mode === 'table') ? '▤ Card view' : '▤ Table view';
  }
  function ensureChrome(view, wrapper) {
    if (!view.querySelector('.scw-mdf-toolbar')) {
      var toolbar = document.createElement('div');
      toolbar.className = 'scw-mdf-toolbar';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-mdf-toggle';
      btn.addEventListener('click', function () {
        var mode = view.classList.contains('scw-mdf-cards-on') ? 'table' : 'cards';
        try { localStorage.setItem(MODE_LS, mode); } catch (e) {}
        applyMode(view, mode);
        // Re-inject photo strips into whichever surface is now visible —
        // the cards (cards mode) or the native table rows (table mode).
        if (window.SCW && SCW.inlinePhotoRow &&
            typeof SCW.inlinePhotoRow.refresh === 'function') {
          SCW.inlinePhotoRow.refresh(view.id);
        }
      });
      toolbar.appendChild(btn);
      wrapper.parentNode.insertBefore(toolbar, wrapper);
    }
    var container = view.querySelector('.scw-mdf-cards');
    if (!container) {
      container = document.createElement('div');
      container.className = 'scw-mdf-cards';
      wrapper.parentNode.insertBefore(container, wrapper);
    }
    return container;
  }

  // Remove anything we injected and release the view (used when a worksheet
  // turns out to own it).
  function teardown(view) {
    view.classList.remove('scw-mdf-cards-on');
    var c = view.querySelector('.scw-mdf-cards'); if (c && c.parentNode) c.parentNode.removeChild(c);
    var t = view.querySelector('.scw-mdf-toolbar'); if (t && t.parentNode) t.parentNode.removeChild(t);
  }

  // True when a MOUNTED worksheet-v2 deployment manages this locations grid
  // (config mdfManage.viewKey — e.g. view_3617 on the survey scene):
  // worksheet-v2/mdf-notes.js folds the same editing into the worksheet's L1
  // headers and its static CSS hides this view's section, so cards here
  // would be an invisible second editor over the same records. Mount-based
  // (not config-based) so the cards remain a fallback if the worksheet
  // never mounts.
  function worksheetManagesView(viewKey) {
    try {
      var wcfg = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.cfg;
      if (!wcfg || typeof wcfg.viewCfg !== 'function') return false;
      var mounts = document.querySelectorAll('.scw-ws-v2[id^="scw-ws-v2-"]');
      for (var i = 0; i < mounts.length; i++) {
        var vc = wcfg.viewCfg(mounts[i].id.replace('scw-ws-v2-', ''));
        if (vc && vc.mdfManage && vc.mdfManage.viewKey === viewKey) return true;
      }
    } catch (e) { /* fall through — keep the cards */ }
    return false;
  }

  function transform(viewKey) {
    var view = document.getElementById(viewKey);
    if (!view) return;
    var table = view.querySelector('table.kn-table-table');
    var wrapper = view.querySelector('.kn-table-wrapper');
    if (!table || !wrapper) return;
    if (!matchesSignature(table)) return;

    // Defer to the device-worksheet / worksheet-v2 system. If it already turned
    // this view's rows into cards (data-scw-worksheet / scw-ws-row), that system
    // OWNS the view — stacking our cards on top double-renders it and leaves the
    // worksheet's own expand/collapse fighting our hidden table (reported on
    // view_3932). Tear down anything we built and bail. This runs on every
    // knack-view-render.any, so even if our scan won the initial race, the
    // worksheet's later render fires this and removes our cards.
    if (view.querySelector('tr[data-scw-worksheet], tr.scw-ws-row')) { teardown(view); return; }

    // Same deferral when a worksheet-v2 deployment MANAGES this grid via its
    // mdfManage config (the L1-header pencil + band own the editing there).
    if (worksheetManagesView(viewKey)) { teardown(view); return; }

    // Don't clobber an input the user is mid-edit in.
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('scw-mdf-input') && view.contains(ae)) return;

    var container = ensureChrome(view, wrapper);
    // Delete gate also covers the raw-table fallback ("Table view" toggle):
    // the native delete link hides while the gate is active, so the toggle
    // can't be used to bypass it.
    view.classList.toggle('scw-mdf-delgated', !!deleteGateActive(viewKey));
    var rows = table.querySelectorAll('tbody tr[id]');
    var typeOptions = typeOptionsFactory(rows);

    var frag = document.createDocumentFragment();
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.classList.contains('kn-tr-nodata')) continue;
      if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
      frag.appendChild(buildCard(viewKey, tr, typeOptions));
      n++;
    }
    container.innerHTML = '';
    if (n === 0) {
      var empty = document.createElement('div');
      empty.className = 'scw-mdf-empty';
      empty.textContent = 'No MDF / IDF locations yet.';
      container.appendChild(empty);
    } else {
      container.appendChild(frag);
    }
    applyMode(view, currentMode());

    // Let inline-photo-row inject its photo strip into each card we just
    // built. Its own render pass targets the (now display:none) native
    // table, so without this re-trigger the strip never reaches the visible
    // cards — it rebuilds the container.innerHTML here, wiping any strip, so
    // we repaint right after.
    if (window.SCW && SCW.inlinePhotoRow &&
        typeof SCW.inlinePhotoRow.refresh === 'function') {
      SCW.inlinePhotoRow.refresh(viewKey);
    }
  }

  // ── styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var ACC = 'var(--scw-accent, #2f5f91)';
    var css = [
      '.scw-mdf-cards-on .kn-table-wrapper { display: none !important; }',
      '.scw-mdf-cards-on .kn-records-nav { display: none !important; }',
      '.kn-view:not(.scw-mdf-cards-on) .scw-mdf-cards { display: none !important; }',

      '.scw-mdf-toolbar { display: flex; justify-content: flex-end; margin: 0 0 10px; }',
      '.scw-mdf-toggle { background: #fff; border: 1px solid #cbd5e1; color: #475569;',
      '  border-radius: 6px; padding: 4px 10px; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }',
      '.scw-mdf-toggle:hover { background: #f1f5f9; }',

      '.scw-mdf-cards { display: flex; flex-direction: column; gap: 10px; }',
      '.scw-mdf-empty { padding: 24px; text-align: center; color: #94a3b8; background: #fff;',
      '  border: 1px dashed #cbd5e1; border-radius: 10px; font: 500 14px/1.4 system-ui, sans-serif; }',

      '.scw-mdf-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;',
      '  padding: 10px 12px; box-shadow: 0 1px 2px rgba(15,23,42,.04); border-left: 4px solid #cbd5e1;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
      '.scw-mdf-card--head { border-left-color: ' + ACC + '; background: linear-gradient(0deg,#fff,rgba(var(--scw-accent-rgb,47,95,145),.05)); }',
      '.scw-mdf-card--idf  { border-left-color: #94a3b8; }',

      '.scw-mdf-card__row1 { display: flex; align-items: center; gap: 12px; }',
      '.scw-mdf-card__namewrap { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }',

      '.scw-mdf-badge { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px;',
      '  border-radius: 8px; background: #f1f5f9; min-width: 78px; justify-content: center; }',
      '.scw-mdf-card--head .scw-mdf-badge { background: rgba(var(--scw-accent-rgb,47,95,145),.12); }',
      '.scw-mdf-badge__type { font: 800 11px/1 system-ui, sans-serif; letter-spacing: .4px; text-transform: uppercase; color: #475569; }',
      '.scw-mdf-card--head .scw-mdf-badge__type { color: ' + ACC + '; }',
      '.scw-mdf-badge__num { font: 800 14px/1 system-ui, sans-serif; color: #1e293b; font-variant-numeric: tabular-nums; }',
      '.scw-mdf-num { width: 38px; padding: 3px 4px; text-align: center; border: 1px solid #cbd5e1; border-radius: 5px;',
      '  font: 700 13px/1 system-ui, sans-serif; background: #fff; font-variant-numeric: tabular-nums; }',

      '.scw-mdf-input { border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #1e293b;',
      '  font: 500 13px/1.3 system-ui, sans-serif; padding: 6px 8px; transition: border-color .15s, box-shadow .15s; }',
      '.scw-mdf-input:focus { outline: none; border-color: ' + ACC + '; box-shadow: 0 0 0 2px rgba(var(--scw-accent-rgb,47,95,145),.18); }',
      '.scw-mdf-input--saving { opacity: .6; }',
      '.scw-mdf-input--saved { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,.18); }',
      '.scw-mdf-input--err { border-color: #dc2626; box-shadow: 0 0 0 2px rgba(220,38,38,.18); }',
      '.scw-mdf-name { flex: 1 1 220px; min-width: 160px; font-weight: 700; font-size: 14px; }',
      '.scw-mdf-name--ro { padding: 6px 0; color: #0f172a; font-weight: 700; font-size: 14px; }',
      /* type lives in the badge — styled to read as the badge label, not a 2nd control */
      '.scw-mdf-badge__type-sel { border: none; background: transparent; margin: 0; padding: 0 2px 0 0;',
      '  font: 800 11px/1 system-ui, sans-serif; letter-spacing: .4px; text-transform: uppercase;',
      '  color: #475569; cursor: pointer; max-width: 120px; }',
      '.scw-mdf-card--head .scw-mdf-badge__type-sel { color: ' + ACC + '; }',
      '.scw-mdf-badge__type-sel:focus { outline: none; text-decoration: underline; }',
      '.scw-mdf-ro { color: #334155; font-size: 13px; padding: 6px 0; }',

      '.scw-mdf-card__row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin-top: 8px;',
      '  padding-top: 8px; border-top: 1px solid #f1f5f9; }',
      '@media (max-width: 640px) { .scw-mdf-card__row2 { grid-template-columns: 1fr; } }',
      '.scw-mdf-note { display: flex; flex-direction: column; gap: 3px; min-width: 0; }',
      '.scw-mdf-note__l { font: 700 10px/1 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .4px; color: #94a3b8; }',
      '.scw-mdf-note__input { width: 100%; box-sizing: border-box; }',

      '.scw-mdf-card__aside { flex: none; display: flex; align-items: center; gap: 6px; }',
      '.scw-mdf-photos { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px;',
      '  border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; color: #475569;',
      '  font: 600 12px/1 system-ui, sans-serif; text-decoration: none; cursor: pointer; }',
      '.scw-mdf-photos:hover { background: #f8fafc; }',
      '.scw-mdf-photos--has { border-color: ' + ACC + '; color: ' + ACC + '; }',
      '.scw-mdf-photos__thumb { width: 22px; height: 22px; object-fit: cover; border-radius: 4px; }',
      '.scw-mdf-del { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;',
      '  border: 1px solid #fecaca; border-radius: 6px; background: #fff; color: #b91c1c; cursor: pointer; }',
      '.scw-mdf-del:hover { background: #fef2f2; }',
      /* Gated delete (SOW has a ClickUp task) — inert gray, tooltip explains */
      '.scw-mdf-del--gated { border-color: #e2e8f0; color: #cbd5e1; cursor: not-allowed; }',
      '.scw-mdf-del--gated:hover { background: #fff; }',
      '.scw-mdf-delgated .kn-table-wrapper a.kn-link-delete { display: none !important; }',

      /* Photo strip injected by inline-photo-row.js (SCW.inlinePhotoRow.refresh).
         Full-width row beneath the card body, separated like row2. The strip
         itself (.scw-inline-photo-field / cards) is styled globally by
         inline-photo-row.js — we only frame the holder. */
      '.scw-mdf-card__photos { margin-top: 8px; padding-top: 8px;',
      '  border-top: 1px solid #f1f5f9; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // Scan every rendered table view and transform the ones carrying the MDF/IDF
  // signature — this is how the design reaches every sibling location grid
  // without a hardcoded view list. matchesSignature() bails cheaply on the rest.
  function scanAll() {
    var views = document.querySelectorAll('.kn-view.kn-table[id]');
    for (var i = 0; i < views.length; i++) {
      if (/^view_\d+$/.test(views[i].id)) transform(views[i].id);
    }
  }
  var _scanTimer = null;
  function scanSoon() {
    if (_scanTimer) clearTimeout(_scanTimer);
    _scanTimer = setTimeout(scanAll, 120);
  }

  // ── bindings ────────────────────────────────────────────────
  function bind() {
    // .any view/scene render → rescan. (knack-view-render.any doesn't reliably
    // pass the view object, so we rescan rather than read its arg.)
    $(document)
      .off('knack-view-render.any' + EVENT_NS).on('knack-view-render.any' + EVENT_NS, scanSoon)
      .off('knack-scene-render.any' + EVENT_NS).on('knack-scene-render.any' + EVENT_NS, scanSoon);

    // Commit a field on blur (focusout) or Enter; selects commit on change.
    document.addEventListener('focusout', function (e) {
      var el = e.target.closest && e.target.closest('input.scw-mdf-input, textarea.scw-mdf-input');
      if (el) saveInput(el);
    });
    document.addEventListener('change', function (e) {
      var el = e.target.closest && e.target.closest('select.scw-mdf-input');
      if (el) saveInput(el);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var el = e.target.closest && e.target.closest('input.scw-mdf-input');
      if (el) { e.preventDefault(); el.blur(); }
    });
  }

  injectStyles();
  bind();
  // Initial sweep — covers direct page hits + cached renders.
  setTimeout(scanAll, 200);
})();
/*** END MDF / IDF LOCATION CARDS *****************************************/
