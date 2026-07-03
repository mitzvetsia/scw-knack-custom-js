/*** PHOTO GRID MANAGER (view_3931 "Additional Photos") ***********************
 *
 * Turns a photo table into a thumbnail CARD GRID without cloning anything:
 * the native <tr>/<td> elements are restyled via CSS (tbody → grid, tr →
 * card, td → labeled field row). Because the real cells stay in place and
 * visible, everything native keeps working inside the gallery:
 *
 *   - Knack inline cell editing (td.cell-edit click → popover editor)
 *   - The image lightbox (a.kn-img-gallery)
 *   - The per-row native "delete" link (individual delete + Knack confirm)
 *
 * On top of that it adds BULK DELETE: a selection checkbox on each card,
 * a Select all / Clear + "Delete Selected (N)" bar above the grid, and a
 * delete engine that runs each DELETE through a concurrency-capped queue
 * with retry-and-backoff (Knack silently 429s past ~10 req/s — see the
 * CLAUDE.md "Pushing many PUTs at once" rule; deletes are no different).
 *
 * A persisted "Table view" toggle restores the raw table (same idiom as
 * files-gallery.js) for anyone who wants the classic layout.
 *
 * Config-driven (VIEWS) so other photo tables can opt in later.
 ****************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-pgm-css';
  var EVENT_NS = '.scwPhotoGridManager';
  var MODE_LS  = 'scwPhotoGridMode';   // 'grid' | 'table'

  var VIEWS = [
    {
      id: 'view_3931',
      imageField: 'field_771',
      // Labeled field rows, in card order. editable is informational —
      // the cell keeps whatever cell-edit behavior Knack gave it.
      fields: [
        { key: 'field_2445', label: 'Photo Type' },
        { key: 'field_2342', label: 'SOW Line Item' },
        { key: 'field_2849', label: 'Install Line Item' },
        { key: 'field_2419', label: 'Survey Line Item' },
        { key: 'field_114',  label: 'Notes' }
      ],
      empty: 'No photos yet.'
    }
  ];

  // Delete queue tuning (mirror-connection-sync's knackPutKeepalive shape).
  var MAX_CONCURRENT = 4;
  var MAX_ATTEMPTS   = 4;
  var BASE_BACKOFF   = 600; // ms

  var _selected = {};   // viewId -> { recordId: true }

  function cfgFor(viewId) {
    for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i].id === viewId) return VIEWS[i];
    return null;
  }
  function selSet(viewId) {
    return (_selected[viewId] = _selected[viewId] || {});
  }
  function selCount(viewId) {
    return Object.keys(selSet(viewId)).length;
  }

  // ── styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var rules = [];
    for (var i = 0; i < VIEWS.length; i++) {
      var v = VIEWS[i];
      var on = '#' + v.id + '.scw-pgm-on';

      // Table → responsive card grid (native elements, just restyled).
      rules.push(on + ' table.kn-table-table { display: block; border: 0 !important; background: transparent; }');
      rules.push(on + ' table.kn-table-table thead { display: none; }');
      rules.push(on + ' table.kn-table-table tbody { display: grid;' +
        ' grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }');
      rules.push(on + ' tbody tr { display: flex; flex-direction: column; position: relative;' +
        ' background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;' +
        ' box-shadow: 0 1px 2px rgba(15,23,42,.05); }');
      rules.push(on + ' tbody tr.scw-pgm-selected { border-color: #2f5f91;' +
        ' box-shadow: 0 0 0 2px rgba(47,95,145,.25); }');
      rules.push(on + ' tbody tr > td { display: block; border: 0 !important; background: transparent !important;' +
        ' padding: 5px 12px; font: 12.5px/1.4 system-ui, -apple-system, sans-serif; }');
      rules.push(on + ' tbody tr > td > span[class^="col-"] { display: block; }');

      // Image cell — full-bleed thumb at the top of the card.
      var imgTd = on + ' tbody tr > td[data-field-key="' + v.imageField + '"]';
      rules.push(imgTd + ' { padding: 0; order: -1; }');
      rules.push(imgTd + ' a.kn-img-gallery { display: block; }');
      rules.push(imgTd + ' img { display: block; width: 100%; aspect-ratio: 4 / 3;' +
        ' object-fit: cover; background: #f1f5f9; cursor: zoom-in; }');
      rules.push('@supports not (aspect-ratio: 1) { ' + imgTd + ' img { height: 160px; } }');

      // Field labels above each value.
      for (var f = 0; f < v.fields.length; f++) {
        rules.push(on + ' tbody tr > td[data-field-key="' + v.fields[f].key + '"]::before {' +
          ' content: "' + v.fields[f].label + '"; display: block;' +
          ' font: 700 10px/1.2 system-ui, sans-serif; letter-spacing: .4px;' +
          ' text-transform: uppercase; color: #94a3b8; margin-bottom: 1px; }');
      }
      // Editable affordance + empty placeholder.
      rules.push(on + ' tbody tr > td.cell-edit { cursor: pointer; border-radius: 6px; }');
      rules.push(on + ' tbody tr > td.cell-edit:hover { background: #f1f5f9 !important; }');
      rules.push(on + ' tbody tr > td[data-scw-pgm-empty="1"] > span[class^="col-"] { min-height: 14px; }');
      rules.push(on + ' tbody tr > td[data-scw-pgm-empty="1"] > span[class^="col-"]::after {' +
        ' content: "—"; color: #cbd5e1; }');

      // Native delete link — pinned to the card footer, styled as a quiet
      // destructive action.
      rules.push(on + ' tbody tr > td.kn-table-link { margin-top: auto; padding: 8px 12px 10px;' +
        ' border-top: 1px solid #f1f5f9 !important; text-align: right; }');
      rules.push(on + ' tbody tr > td.kn-table-link a.kn-link-delete { font: 600 11.5px/1 system-ui, sans-serif;' +
        ' color: #be123c; text-decoration: none; padding: 4px 8px; border: 1px solid #fecdd3;' +
        ' border-radius: 5px; background: #fff; }');
      rules.push(on + ' tbody tr > td.kn-table-link a.kn-link-delete:hover { background: #fff1f2; }');

      // Table-mode: hide grid chrome.
      rules.push('#' + v.id + ':not(.scw-pgm-on) .scw-pgm-check { display: none; }');
    }
    rules = rules.concat([
      // Selection checkbox — overlays the image, top-left.
      '.scw-pgm-check { position: absolute; top: 8px; left: 8px; z-index: 3;',
      '  display: flex; align-items: center; justify-content: center;',
      '  width: 24px; height: 24px; border-radius: 6px; cursor: pointer;',
      '  background: rgba(255,255,255,.92); border: 1px solid #cbd5e1;',
      '  box-shadow: 0 1px 3px rgba(15,23,42,.25); }',
      '.scw-pgm-check input { margin: 0; cursor: pointer; width: 14px; height: 14px; }',

      // Bulk bar.
      '.scw-pgm-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;',
      '  margin: 0 0 12px; padding: 8px 10px; background: #f8fafc;',
      '  border: 1px solid #e2e8f0; border-radius: 8px;',
      '  font: 12.5px/1.3 system-ui, -apple-system, sans-serif; color: #475569; }',
      '.scw-pgm-bar__btn { background: #fff; border: 1px solid #cbd5e1; color: #475569;',
      '  border-radius: 6px; padding: 5px 10px; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }',
      '.scw-pgm-bar__btn:hover { background: #f1f5f9; }',
      '.scw-pgm-bar__del { background: #be123c; border: 1px solid #be123c; color: #fff;',
      '  border-radius: 6px; padding: 5px 12px; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }',
      '.scw-pgm-bar__del:hover { background: #9f1239; }',
      '.scw-pgm-bar__del:disabled { background: #e2e8f0; border-color: #e2e8f0; color: #94a3b8;',
      '  cursor: not-allowed; }',
      '.scw-pgm-bar__spring { flex: 1; }',
      '.scw-pgm-bar__count { font-weight: 700; color: #0f172a; }',

      // Confirm modal.
      '.scw-pgm-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.55);',
      '  z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 20px; }',
      '.scw-pgm-modal { background: #fff; color: #0f172a; border-radius: 10px; max-width: 440px;',
      '  width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,.35);',
      '  font: 14px/1.4 system-ui, -apple-system, sans-serif; overflow: hidden; }',
      '.scw-pgm-modal__head { padding: 13px 18px; background: #be123c; color: #fff;',
      '  font-weight: 700; font-size: 14px; }',
      '.scw-pgm-modal__body { padding: 16px 18px; }',
      '.scw-pgm-modal__foot { padding: 12px 18px; border-top: 1px solid #e2e8f0;',
      '  display: flex; justify-content: flex-end; gap: 8px; background: #f8fafc; }',
      '.scw-pgm-modal__foot button { padding: 7px 14px; border-radius: 5px;',
      '  font: 600 13px/1.2 system-ui, sans-serif; cursor: pointer; border: 1px solid transparent; }',
      '.scw-pgm-modal__cancel { background: #fff; color: #475569; border-color: #cbd5e1 !important; }',
      '.scw-pgm-modal__ok { background: #be123c; color: #fff; }',
      '.scw-pgm-modal__ok:disabled { opacity: .6; cursor: wait; }',

      // Toast.
      '.scw-pgm-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
      '  z-index: 100001; background: #0f172a; color: #fff; padding: 10px 18px; border-radius: 8px;',
      '  font: 600 13px/1.3 system-ui, sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.3); }'
    ]);
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = rules.join('\n');
    document.head.appendChild(s);
  }

  // ── mode ────────────────────────────────────────────────────
  function currentMode() {
    try { return localStorage.getItem(MODE_LS) === 'table' ? 'table' : 'grid'; }
    catch (e) { return 'grid'; }
  }
  function applyMode(view, mode) {
    view.classList.toggle('scw-pgm-on', mode !== 'table');
    var btn = view.querySelector('.scw-pgm-toggle');
    if (btn) btn.textContent = (mode === 'table') ? '▦ Gallery view' : '▤ Table view';
  }

  // ── toast ───────────────────────────────────────────────────
  function toast(msg, ms) {
    var t = document.createElement('div');
    t.className = 'scw-pgm-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 3500);
  }

  // ── confirm modal ───────────────────────────────────────────
  function confirmDelete(n, onOk) {
    var backdrop = document.createElement('div');
    backdrop.className = 'scw-pgm-backdrop';
    backdrop.innerHTML =
      '<div class="scw-pgm-modal">' +
        '<div class="scw-pgm-modal__head">Delete ' + n + ' photo' + (n !== 1 ? 's' : '') + '?</div>' +
        '<div class="scw-pgm-modal__body">' +
          '<p>This permanently deletes the selected photo record' + (n !== 1 ? 's' : '') +
          '. This cannot be undone.</p>' +
        '</div>' +
        '<div class="scw-pgm-modal__foot">' +
          '<button type="button" class="scw-pgm-modal__cancel">Cancel</button>' +
          '<button type="button" class="scw-pgm-modal__ok">Delete ' + n + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(backdrop);
    function close() { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }
    backdrop.querySelector('.scw-pgm-modal__cancel').addEventListener('click', close);
    backdrop.querySelector('.scw-pgm-modal__ok').addEventListener('click', function () {
      this.disabled = true;
      this.textContent = 'Deleting…';
      onOk(close);
    });
  }

  // ── delete engine: capped queue + retry/backoff, settle-don't-reject ──
  function deleteRecords(viewId, ids, done) {
    var results = [];
    var idx = 0, inFlight = 0;

    function isTransient(status) {
      return status === 429 || status === 408 || status === 0 || (status >= 500 && status <= 599);
    }
    function attempt(recordId, attemptNo, settle) {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(viewId, recordId),
        type: 'DELETE',
        success: function () { settle({ ok: true, recordId: recordId, status: 200 }); },
        error: function (xhr) {
          var st = (xhr && xhr.status) || 0;
          if (isTransient(st) && attemptNo < MAX_ATTEMPTS) {
            var delay = BASE_BACKOFF * Math.pow(2, attemptNo - 1) + Math.random() * 250;
            setTimeout(function () { attempt(recordId, attemptNo + 1, settle); }, delay);
          } else {
            settle({ ok: false, recordId: recordId, status: st });
          }
        }
      });
    }
    function pump() {
      while (inFlight < MAX_CONCURRENT && idx < ids.length) {
        (function (recordId) {
          inFlight++;
          idx++;
          attempt(recordId, 1, function (res) {
            inFlight--;
            results.push(res);
            if (!res.ok) console.warn('[scw-pgm] delete failed', res.recordId, res.status);
            if (results.length === ids.length) done(results);
            else pump();
          });
        })(ids[idx]);
      }
    }
    pump();
  }

  function runBulkDelete(cfg) {
    var ids = Object.keys(selSet(cfg.id));
    if (!ids.length) return;
    confirmDelete(ids.length, function (closeModal) {
      deleteRecords(cfg.id, ids, function (results) {
        closeModal();
        var failed = results.filter(function (r) { return !r.ok; });
        _selected[cfg.id] = {};
        if (!failed.length) {
          toast(ids.length + ' photo' + (ids.length !== 1 ? 's' : '') + ' deleted.');
        } else if (failed.length === ids.length) {
          toast('Delete failed — no photos were removed. Try again.', 5000);
        } else {
          toast((ids.length - failed.length) + ' deleted, ' + failed.length +
                ' failed — refresh and retry the rest.', 6000);
        }
        try {
          var v = Knack.views && Knack.views[cfg.id];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
        } catch (e) { /* view refresh best-effort */ }
      });
    });
  }

  // ── chrome (bulk bar + toggle) ──────────────────────────────
  function updateBar(cfg) {
    var view = document.getElementById(cfg.id);
    if (!view) return;
    var n = selCount(cfg.id);
    var count = view.querySelector('.scw-pgm-bar__count');
    var del = view.querySelector('.scw-pgm-bar__del');
    if (count) count.textContent = n ? (n + ' selected') : 'None selected';
    if (del) {
      del.disabled = n === 0;
      del.textContent = n ? ('Delete Selected (' + n + ')') : 'Delete Selected';
    }
  }

  function ensureChrome(cfg, view, wrapper) {
    if (view.querySelector('.scw-pgm-bar')) return;
    var bar = document.createElement('div');
    bar.className = 'scw-pgm-bar';
    bar.innerHTML =
      '<button type="button" class="scw-pgm-bar__btn scw-pgm-bar__all">Select all</button>' +
      '<button type="button" class="scw-pgm-bar__btn scw-pgm-bar__none">Clear</button>' +
      '<span class="scw-pgm-bar__count">None selected</span>' +
      '<span class="scw-pgm-bar__spring"></span>' +
      '<button type="button" class="scw-pgm-bar__del" disabled>Delete Selected</button>' +
      '<button type="button" class="scw-pgm-bar__btn scw-pgm-toggle"></button>';
    wrapper.parentNode.insertBefore(bar, wrapper);

    bar.querySelector('.scw-pgm-bar__all').addEventListener('click', function () {
      var set = selSet(cfg.id);
      var rows = view.querySelectorAll('tbody tr[id]');
      for (var i = 0; i < rows.length; i++) {
        if (/^[a-f0-9]{24}$/i.test(rows[i].id)) set[rows[i].id] = true;
      }
      syncSelectionUi(cfg);
    });
    bar.querySelector('.scw-pgm-bar__none').addEventListener('click', function () {
      _selected[cfg.id] = {};
      syncSelectionUi(cfg);
    });
    bar.querySelector('.scw-pgm-bar__del').addEventListener('click', function () {
      runBulkDelete(cfg);
    });
    bar.querySelector('.scw-pgm-toggle').addEventListener('click', function () {
      var mode = view.classList.contains('scw-pgm-on') ? 'table' : 'grid';
      try { localStorage.setItem(MODE_LS, mode); } catch (e) {}
      applyMode(view, mode);
    });
  }

  function syncSelectionUi(cfg) {
    var view = document.getElementById(cfg.id);
    if (!view) return;
    var set = selSet(cfg.id);
    var rows = view.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var on = !!set[rows[i].id];
      rows[i].classList.toggle('scw-pgm-selected', on);
      var cb = rows[i].querySelector('.scw-pgm-check input');
      if (cb) cb.checked = on;
    }
    updateBar(cfg);
  }

  // ── per-row enhancement (idempotent, re-runs each render) ───
  function enhanceRows(cfg, view) {
    var rows = view.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (!/^[a-f0-9]{24}$/i.test(tr.id)) continue;

      // Selection checkbox (once per rendered row).
      if (!tr.querySelector('.scw-pgm-check')) {
        var lbl = document.createElement('label');
        lbl.className = 'scw-pgm-check';
        lbl.innerHTML = '<input type="checkbox">';
        lbl.addEventListener('click', function (e) { e.stopPropagation(); });
        lbl.querySelector('input').addEventListener('change', (function (recordId) {
          return function () {
            var set = selSet(cfg.id);
            if (this.checked) set[recordId] = true;
            else delete set[recordId];
            syncSelectionUi(cfg);
          };
        })(tr.id));
        tr.appendChild(lbl);
      }

      // Mark empty field cells so CSS can show a "—" placeholder.
      for (var f = 0; f < cfg.fields.length; f++) {
        var td = tr.querySelector('td[data-field-key="' + cfg.fields[f].key + '"]');
        if (!td) continue;
        var txt = (td.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (txt) td.removeAttribute('data-scw-pgm-empty');
        else td.setAttribute('data-scw-pgm-empty', '1');
      }
    }
  }

  // ── transform ───────────────────────────────────────────────
  function transform(cfg) {
    var view = document.getElementById(cfg.id);
    if (!view) return;
    var wrapper = view.querySelector('.kn-table-wrapper');
    if (!wrapper) return;

    // Drop selections for records no longer rendered (deleted elsewhere,
    // paginated away) so the count can't refer to invisible rows.
    var set = selSet(cfg.id);
    var live = {};
    var rows = view.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) live[rows[i].id] = true;
    Object.keys(set).forEach(function (id) { if (!live[id]) delete set[id]; });

    ensureChrome(cfg, view, wrapper);
    enhanceRows(cfg, view);
    applyMode(view, currentMode());
    syncSelectionUi(cfg);
  }

  // ── bindings ────────────────────────────────────────────────
  injectStyles();
  for (var v = 0; v < VIEWS.length; v++) {
    (function (cfg) {
      var handler = function () { setTimeout(function () { transform(cfg); }, 80); };
      if (window.SCW && typeof SCW.onViewRender === 'function') {
        SCW.onViewRender(cfg.id, handler, EVENT_NS);
      } else {
        $(document)
          .off('knack-view-render.' + cfg.id + EVENT_NS)
          .on('knack-view-render.' + cfg.id + EVENT_NS, handler);
      }
      if (document.getElementById(cfg.id)) handler();
    })(VIEWS[v]);
  }
})();
/*** END PHOTO GRID MANAGER ***************************************************/
