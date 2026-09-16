/*** WORKSHEET V2 — DESIGNATOR EDIT (install worksheet, ops deploy page) *****
 *
 * The ONE identity edit the SCW team makes on a deployed cam/reader: its
 * designator — the drop PREFIX (config dropPrefix, install field_2823, a
 * connection to the Drop Prefix catalog) and drop NUMBER (config dropNumber,
 * install field_2798). The displayed label (field_2802 / field_2801) is a
 * server-side formula over the two, so it refreshes on the post-save refetch.
 *
 * Designators tie an install item to the site map, its photos and its QA
 * record, so this is deliberately HIGH-FRICTION:
 *
 *   1. the label cell shows a small pencil (card.js installDesignatorCell,
 *      only on views whose config sets designatorEdit:true — the ops deploy
 *      worksheet view_4093; the sub-portal + CO-removal clones strip it);
 *   2. clicking it opens a confirm that says, in so many words, "only do
 *      this if you're SURE it's correct and you won't create drift from the
 *      map" — Cancel is the default-safe path;
 *   3. only after confirming does the cell flip to an inline tray: the
 *      Prefix picker button (the shared Drop Prefix catalog picker in
 *      init.js, PUT through the source view) · the number input (edit.js
 *      blur/Enter save through the source view; dropNumber is in
 *      RECALC_DEPS so the recomputed label refetches) · Done.
 *
 * Edit mode is a per-record set here (not DOM state) so the tray survives
 * the card rebuilds every save triggers, until Done / Escape. Nothing here
 * writes to Knack directly — both fields ride the existing worksheet save
 * paths, including the dropped-write check (a column that isn't inline-
 * editable on the view surfaces as a "Knack didn't keep your change" toast
 * instead of silently reverting).
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};
  window.SCW.worksheetV2 = window.SCW.worksheetV2 || {};
  var ns = window.SCW.worksheetV2;

  // recordId → true while that row's designator tray is open.
  var editing = Object.create(null);

  var CSS_ID = 'scw-ws-v2-designator-css';
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      /* Read mode: label text + pencil side by side; the text keeps the
         ellipsis, the pencil never gets clipped. */
      '.scw-ws-v2-cell--label.scw-ws-v2-desig {',
      '  display: flex !important; align-items: center !important; gap: 3px !important;',
      '}',
      '.scw-ws-v2-desig-val {',
      '  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;',
      '}',
      '.scw-ws-v2-desig-edit {',
      '  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;',
      '  width: 18px; height: 18px; padding: 0; margin: 0;',
      '  border: 0; border-radius: 4px; background: transparent;',
      '  color: #94a3b8; opacity: .55; cursor: pointer;',
      '  transition: opacity 100ms ease, background 100ms ease, color 100ms ease;',
      '}',
      '.scw-ws-v2-card:hover .scw-ws-v2-desig-edit,',
      '.scw-ws-v2-desig-edit:focus-visible { opacity: 1; }',
      '.scw-ws-v2-desig-edit:hover { background: #fef3c7; color: #b45309; opacity: 1; }',
      '.scw-ws-v2-desig-edit:focus-visible { outline: 2px solid #b45309; outline-offset: 1px; }',
      /* Locked / read-only panels never show the pencil. */
      '.scw-ws-v2--readonly .scw-ws-v2-desig-edit,',
      '.scw-ws-v2-card--locked .scw-ws-v2-desig-edit { display: none !important; }',

      /* Edit mode: the cell keeps its 88px track; the tray floats over the
         cells to its right (amber frame = caution, per the repo warning
         palette) so the row grid never reflows. */
      '.scw-ws-v2-cell--label.scw-ws-v2-desig--editing {',
      '  position: relative !important; overflow: visible !important;',
      '  z-index: 6 !important; min-height: 26px !important;',
      '}',
      '.scw-ws-v2-desig-tray {',
      '  position: absolute; left: -6px; top: 50%; transform: translateY(-50%);',
      '  display: flex; align-items: center; gap: 5px; white-space: nowrap;',
      '  padding: 4px 8px; background: #fffbeb;',
      '  border: 1px solid #f59e0b; border-radius: 6px;',
      '  box-shadow: 0 4px 14px rgba(15, 23, 42, .14);',
      '  font: 500 12px/1.2 system-ui, -apple-system, sans-serif; color: #1f2937;',
      '}',
      '.scw-ws-v2-desig-prefix {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  min-width: 34px; padding: 3px 7px; margin: 0;',
      '  background: #fff; border: 1px solid #cbd5e1; border-radius: 4px;',
      '  font: 700 13px/1.2 system-ui, -apple-system, sans-serif; color: #07467c;',
      '  font-variant-numeric: tabular-nums; cursor: pointer;',
      '}',
      '.scw-ws-v2-desig-prefix::after {',
      '  content: "\\270E"; font-size: 11px; color: #94a3b8; font-weight: 400;',
      '}',
      '.scw-ws-v2-desig-prefix:hover { border-color: #07467c; }',
      '.scw-ws-v2-desig-dash { font-weight: 700; color: #64748b; }',
      '.scw-ws-v2-desig-tray .scw-ws-v2-desig-num {',
      '  width: 56px !important; padding: 3px 6px !important;',
      '  font: 700 13px/1.2 system-ui, -apple-system, sans-serif !important;',
      '  color: #07467c !important; background: #fff !important;',
      '  border: 1px solid #cbd5e1 !important; border-radius: 4px !important;',
      '}',
      '.scw-ws-v2-desig-done {',
      '  padding: 3px 9px; margin: 0 0 0 2px;',
      '  background: #07467c; color: #fff; border: 0; border-radius: 4px;',
      '  font: 600 12px/1.2 system-ui, -apple-system, sans-serif; cursor: pointer;',
      '}',
      '.scw-ws-v2-desig-done:hover { background: #0b5a9c; }',
      '.scw-ws-v2-desig-hint {',
      '  display: inline-flex; align-items: center; gap: 3px; margin-left: 4px;',
      '  font: 600 10px/1.2 system-ui, -apple-system, sans-serif; letter-spacing: .02em;',
      '  text-transform: uppercase; color: #b45309;',
      '}',
      '.scw-ws-v2-desig-hint-ic { display: inline-flex; color: #b45309; }',

      /* Confirm modal: the warning callout inside the shared confirm body. */
      '.scw-ws-v2-desig-warn {',
      '  display: flex; gap: 8px; align-items: flex-start; margin-top: 10px;',
      '  padding: 8px 10px; background: #fffbeb; border: 1px solid #fcd34d;',
      '  border-radius: 6px; color: #92400e; font: 500 12px/1.45 system-ui, sans-serif;',
      '}',
      '.scw-ws-v2-desig-warn svg { flex: 0 0 auto; margin-top: 1px; color: #b45309; }',
      '.scw-ws-v2-desig-current { margin-top: 8px; color: #334155; }',
      '.scw-ws-v2-desig-current strong { color: #07467c; font-variant-numeric: tabular-nums; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  var WARN_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  /** The friction copy. Exported so the wording lives in one place. */
  function confirmCopy(label) {
    return {
      title: 'Edit designator' + (label ? ' ' + label : '') + '?',
      body:
        'The designator (prefix + number) ties this item to the site map, its ' +
        'photos and its QA record.' +
        '<div class="scw-ws-v2-desig-warn">' + WARN_SVG +
          '<div>Only do this if you are <strong>sure</strong> the new value is ' +
          'correct and you are not going to create drift from the map. If the map ' +
          'is what is wrong, fix the map instead.</div>' +
        '</div>' +
        (label ? '<div class="scw-ws-v2-desig-current">Currently <strong>' + esc(label) + '</strong></div>' : ''),
      okLabel:     'I’m sure — edit it',
      cancelLabel: 'Cancel'
    };
  }

  function enabledFor(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return !!(vc && vc.designatorEdit === true);
    } catch (e) { return false; }
  }

  function isEditing(recordId) {
    return !!(recordId && editing[recordId]);
  }

  function findRecord(viewKey, recordId) {
    var records = (ns.data && typeof ns.data.readRecords === 'function' &&
      ns.data.readRecords(viewKey)) || [];
    for (var i = 0; i < records.length; i++) {
      if (records[i] && records[i].id === recordId) return records[i];
    }
    return null;
  }

  function cellFor(recordId) {
    if (!recordId) return null;
    return document.querySelector(
      '.scw-ws-v2-cell--label[data-scw-ws-v2-desig="' + String(recordId).replace(/"/g, '\\"') + '"]');
  }

  /** Re-render just the designator cell for a record (read ↔ edit). Falls
   *  back to a view notify (full card rebuild) when the cell isn't in the
   *  DOM or the card builder is missing. Returns the new cell or null. */
  function swapCell(viewKey, recordId) {
    var cell = cellFor(recordId);
    var rec  = findRecord(viewKey, recordId);
    if (!cell || !rec || !ns.card || typeof ns.card.installDesignatorCell !== 'function') {
      if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
      return null;
    }
    var cat = (ns.card && typeof ns.card.bucketCategoryOf === 'function')
      ? ns.card.bucketCategoryOf(rec, viewKey) : 'cam';
    var tmp = document.createElement('div');
    tmp.innerHTML = ns.card.installDesignatorCell(rec, viewKey, cat);
    var fresh = tmp.firstElementChild;
    if (!fresh) return null;
    cell.parentNode.replaceChild(fresh, cell);
    return fresh;
  }

  /** Pencil click: warn first, edit only on an explicit "I'm sure". */
  function begin(viewKey, recordId, label) {
    if (!enabledFor(viewKey) || !recordId) return Promise.resolve(false);
    if (isEditing(recordId)) return Promise.resolve(true);
    var copy = confirmCopy(label);
    var ask = (typeof ns.confirmModal === 'function')
      ? ns.confirmModal(copy)
      : Promise.resolve(window.confirm(copy.title + '\n\n' +
          'Only do this if you are SURE the new value is correct and you are ' +
          'not going to create drift from the map.'));
    return ask.then(function (ok) {
      if (!ok) return false;
      editing[recordId] = true;
      var fresh = swapCell(viewKey, recordId);
      var num = fresh && fresh.querySelector('.scw-ws-v2-desig-num');
      if (num) {
        try { num.focus(); num.select(); } catch (e) { /* ignore */ }
      }
      return true;
    });
  }

  /** Done / Escape: leave edit mode. A pending number edit has already been
   *  committed by edit.js on blur (Done's mousedown blurs the input first);
   *  Escape reverts the input before blurring so nothing saves. */
  function end(viewKey, recordId) {
    if (!isEditing(recordId)) return;
    delete editing[recordId];
    swapCell(viewKey, recordId);
  }

  function wire() {
    if (document.documentElement.hasAttribute('data-scw-ws-v2-desig-bound')) return;
    document.documentElement.setAttribute('data-scw-ws-v2-desig-bound', '1');

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var pencil = t.closest('[data-scw-ws-v2-desig-edit]');
      if (pencil) {
        e.preventDefault();
        e.stopPropagation();
        var cellR = pencil.closest('.scw-ws-v2-cell--label');
        var valEl = cellR && cellR.querySelector('.scw-ws-v2-desig-val');
        begin(pencil.getAttribute('data-scw-ws-v2-view'),
              pencil.getAttribute('data-scw-ws-v2-desig-edit'),
              valEl ? (valEl.textContent || '').trim() : '');
        return;
      }
      var done = t.closest('[data-scw-ws-v2-desig-done]');
      if (done) {
        e.preventDefault();
        e.stopPropagation();
        end(done.getAttribute('data-scw-ws-v2-view'),
            done.getAttribute('data-scw-ws-v2-desig-done'));
      }
    }, true);

    // Escape inside the number input cancels the typed value (edit.js's blur
    // commit sees no change) and closes the tray.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains('scw-ws-v2-desig-num')) return;
      var cell = t.closest && t.closest('[data-scw-ws-v2-desig]');
      if (!cell) return;
      e.preventDefault();
      e.stopPropagation();
      var prev = (t._scwWsV2Prev != null) ? t._scwWsV2Prev : (t.defaultValue || '');
      t.value = prev;
      t._scwWsV2Prev = prev;
      try { t.blur(); } catch (err) { /* ignore */ }
      end(cell.getAttribute('data-scw-ws-v2-view'), cell.getAttribute('data-scw-ws-v2-desig'));
    }, true);
  }

  ns.designator = {
    isEditing:   isEditing,
    begin:       begin,
    end:         end,
    enabledFor:  enabledFor,
    confirmCopy: confirmCopy
  };

  injectCss();
  wire();
})();
/*** END WORKSHEET V2 — DESIGNATOR EDIT **************************************/
