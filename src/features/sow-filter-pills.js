/*************  SOW filter pills above view_3610  *************/
/**
 * Adds a quick-filter pill strip above the Scope of Work Line Items grid
 * (view_3610). Each unique SOW that any row connects to via field_2154
 * gets its own pill (label = SW-####). Clicking a pill scopes the grid
 * to rows that connect to that SOW; clicking "Show All" resets.
 *
 * Why this is useful: a single line item can connect to multiple SOWs
 * (e.g. a shared assumption appears in SW-1001 AND SW-1060). The grid
 * doesn't otherwise let the user focus on one SOW at a time.
 *
 * Coexists with group-collapse's exclusive accordion: rows are hidden
 * via a class with !important so jQuery .show()/.hide() from group-
 * collapse can't override the filter. Group headers are auto-hidden
 * when none of their child records match the current SOW.
 *
 * Filter selection persists in localStorage per (scene, view).
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────
  var VIEW_ID    = 'view_3610';
  var SOW_FIELD  = 'field_2154';
  var STYLE_ID   = 'scw-sow-filter-pills-css';
  var STRIP_CLS  = 'scw-sow-filter-strip';
  var HIDE_CLS   = 'scw-sow-filter-hidden';
  var EVENT_NS   = '.scwSowFilter';

  // ── Styles ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Strip container
      '#' + VIEW_ID + ' .' + STRIP_CLS + ' {',
      '  display: flex; flex-wrap: wrap; align-items: center;',
      '  gap: 6px; margin: 0 0 12px;',
      '  padding: 8px 10px;',
      '  background: #f8fafc;',
      '  border: 1px solid #e2e8f0;',
      '  border-radius: 6px;',
      '  font: 12px/1.3 system-ui, -apple-system, sans-serif;',
      '}',
      '#' + VIEW_ID + ' .' + STRIP_CLS + '__label {',
      '  font-weight: 600; color: #475569; margin-right: 4px;',
      '  letter-spacing: 0.02em; text-transform: uppercase; font-size: 11px;',
      '}',
      // Pill base
      '#' + VIEW_ID + ' .' + STRIP_CLS + '__pill {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 10px;',
      '  border: 1px solid #cbd5e1;',
      '  background: #fff; color: #1f2937;',
      '  border-radius: 999px;',
      '  font-weight: 600; font-size: 12px;',
      '  cursor: pointer; user-select: none;',
      '  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;',
      '}',
      '#' + VIEW_ID + ' .' + STRIP_CLS + '__pill:hover {',
      '  background: #f1f5f9; border-color: #94a3b8;',
      '}',
      // Active pill — primary teal, matches the ops-review pill language
      '#' + VIEW_ID + ' .' + STRIP_CLS + '__pill.is-active {',
      '  background: #0891b2; border-color: #0e7490; color: #fff;',
      '}',
      '#' + VIEW_ID + ' .' + STRIP_CLS + '__pill.is-active:hover {',
      '  background: #0e7490;',
      '}',
      // "All" pill — slightly different so it reads as a reset, not a SOW
      '#' + VIEW_ID + ' .' + STRIP_CLS + '__pill--all:not(.is-active) {',
      '  background: transparent;',
      '}',
      // Per-pill record count
      '#' + VIEW_ID + ' .' + STRIP_CLS + '__count {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  min-width: 18px; padding: 0 5px;',
      '  background: rgba(15, 23, 42, 0.08); color: #475569;',
      '  border-radius: 9px; font-size: 11px; font-weight: 600;',
      '}',
      '#' + VIEW_ID + ' .' + STRIP_CLS + '__pill.is-active .' + STRIP_CLS + '__count {',
      '  background: rgba(255, 255, 255, 0.25); color: #fff;',
      '}',
      // Filter-hidden rows — !important so we can't be defeated by jQuery
      // .show() that group-collapse runs when expanding an accordion.
      '#' + VIEW_ID + ' tr.' + HIDE_CLS + ' {',
      '  display: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Scene detection (for storage key scoping) ───────────
  function getCurrentSceneId() {
    var bodyId = document.body && document.body.id;
    if (bodyId) {
      var m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    try {
      var k = window.Knack && Knack.router && Knack.router.scene_view;
      if (k && k.model && k.model.attributes && k.model.attributes.key) {
        return k.model.attributes.key;
      }
    } catch (e) { /* ignore */ }
    return 'unknown_scene';
  }

  // ── Persisted state ─────────────────────────────────────
  function storageKey() {
    return 'scw:sow-filter:' + getCurrentSceneId() + ':' + VIEW_ID;
  }
  function loadSelected() {
    try { return localStorage.getItem(storageKey()) || ''; }
    catch (e) { return ''; }
  }
  function saveSelected(sowId) {
    try {
      if (sowId) localStorage.setItem(storageKey(), sowId);
      else       localStorage.removeItem(storageKey());
    } catch (e) { /* ignore */ }
  }

  // ── SOW collection from Knack model ─────────────────────
  // Returns an array of { id, label, count } sorted by label, plus
  // the per-record SOW set (recordId -> Set of sow ids).
  function collectSows() {
    var sowsById = {};       // sowId -> { id, label, count }
    var recordSows = {};     // recordId -> Set(sowId)
    var totalRecords = 0;

    var v = window.Knack && Knack.views && Knack.views[VIEW_ID];
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return null;

    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var attrs = m && m.attributes;
      if (!attrs) continue;
      totalRecords++;

      var raw = attrs[SOW_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;

      var perRecord = recordSows[m.id] || (recordSows[m.id] = {});
      for (var j = 0; j < raw.length; j++) {
        var conn = raw[j];
        if (!conn || !conn.id) continue;
        if (!sowsById[conn.id]) {
          sowsById[conn.id] = {
            id: conn.id,
            label: String(conn.identifier || conn.id),
            count: 0
          };
        }
        if (!perRecord[conn.id]) {
          perRecord[conn.id] = true;
          sowsById[conn.id].count++;
        }
      }
    }

    var sows = Object.keys(sowsById).map(function (k) { return sowsById[k]; });
    sows.sort(function (a, b) {
      // Natural sort so SW-2 sorts before SW-10
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });

    return { sows: sows, recordSows: recordSows, totalRecords: totalRecords };
  }

  // ── DOM row indexing ────────────────────────────────────
  // Walk the tbody and group every <tr> by the record id it belongs to.
  // Card rows have id="<24-hex>". Photo rows are immediate next siblings
  // of card rows. Worksheet data rows carry the record id inside the
  // edit-link href (.../edit-from-nvr-grid3/<24-hex>).
  function indexRows() {
    var view = document.getElementById(VIEW_ID);
    if (!view) return null;
    var tbody = view.querySelector('table tbody');
    if (!tbody) return null;

    var rowsByRecord = {};   // recordId -> [tr, tr, ...]
    var groupHeaders = [];   // [{ tr, recordIds: Set }]
    var currentGroup = null;

    var ID_RE = /^[a-f0-9]{24}$/i;
    var children = tbody.children;
    var lastCardId = null;

    for (var i = 0; i < children.length; i++) {
      var tr = children[i];

      if (tr.classList.contains('kn-table-group')) {
        currentGroup = { tr: tr, recordIds: {} };
        groupHeaders.push(currentGroup);
        lastCardId = null;
        continue;
      }

      var recordId = null;

      if (tr.classList.contains('scw-ws-row') && tr.id && ID_RE.test(tr.id)) {
        recordId = tr.id;
        lastCardId = recordId;
      } else if (tr.classList.contains('scw-inline-photo-row')) {
        // Photo row inherits from the most recent card row.
        recordId = lastCardId;
      } else if (tr.hasAttribute('data-scw-worksheet')) {
        // Worksheet "raw" row — find the record id from the edit link.
        var link = tr.querySelector('a[href*="/edit-from-nvr-grid3/"]');
        if (link) {
          var m = String(link.getAttribute('href') || '').match(/edit-from-nvr-grid3\/([a-f0-9]{24})/i);
          if (m) recordId = m[1];
        }
      } else if (tr.classList.contains('scw-synth-divider')) {
        // Synthetic divider between assumption block and real groups.
        // Treat as group boundary so the next records aren't lumped in.
        lastCardId = null;
        continue;
      }

      if (recordId) {
        if (!rowsByRecord[recordId]) rowsByRecord[recordId] = [];
        rowsByRecord[recordId].push(tr);
        if (currentGroup) currentGroup.recordIds[recordId] = true;
      }
    }

    return { rowsByRecord: rowsByRecord, groupHeaders: groupHeaders };
  }

  // ── Apply filter ────────────────────────────────────────
  function applyFilter(selectedSowId, data) {
    if (!data) data = collectSows();
    if (!data) return;
    var idx = indexRows();
    if (!idx) return;

    var recordIds = Object.keys(idx.rowsByRecord);

    for (var i = 0; i < recordIds.length; i++) {
      var rid = recordIds[i];
      var hide = false;
      if (selectedSowId) {
        var perRecord = data.recordSows[rid];
        hide = !(perRecord && perRecord[selectedSowId]);
      }
      var trs = idx.rowsByRecord[rid];
      for (var j = 0; j < trs.length; j++) {
        trs[j].classList.toggle(HIDE_CLS, hide);
      }
    }

    // Hide group headers whose records are all filtered out.
    for (var g = 0; g < idx.groupHeaders.length; g++) {
      var grp = idx.groupHeaders[g];
      var anyVisible = false;
      if (!selectedSowId) {
        anyVisible = true;
      } else {
        var ids = Object.keys(grp.recordIds);
        for (var k = 0; k < ids.length; k++) {
          var pr = data.recordSows[ids[k]];
          if (pr && pr[selectedSowId]) { anyVisible = true; break; }
        }
      }
      grp.tr.classList.toggle(HIDE_CLS, !anyVisible);
    }
  }

  // ── Pill strip render ───────────────────────────────────
  function renderStrip(data, selectedSowId) {
    var view = document.getElementById(VIEW_ID);
    if (!view) return;
    var nav = view.querySelector('.kn-records-nav');
    if (!nav) return;

    // Tear down any prior strip — Knack re-renders the view from
    // scratch on a lot of events; we want fresh markup, not stale.
    var prior = nav.querySelector('.' + STRIP_CLS);
    if (prior) prior.parentNode.removeChild(prior);

    if (!data || !data.sows.length) return;

    var strip = document.createElement('div');
    strip.className = STRIP_CLS;

    var label = document.createElement('span');
    label.className = STRIP_CLS + '__label';
    label.textContent = 'SOW:';
    strip.appendChild(label);

    function addPill(opts) {
      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = STRIP_CLS + '__pill' + (opts.extraCls ? ' ' + opts.extraCls : '');
      if (opts.active) pill.classList.add('is-active');
      pill.setAttribute('data-sow-id', opts.sowId || '');

      var text = document.createElement('span');
      text.textContent = opts.label;
      pill.appendChild(text);

      if (opts.count != null) {
        var countEl = document.createElement('span');
        countEl.className = STRIP_CLS + '__count';
        countEl.textContent = String(opts.count);
        pill.appendChild(countEl);
      }
      strip.appendChild(pill);
    }

    addPill({
      sowId:    '',
      label:    'Show All',
      count:    data.totalRecords,
      active:   !selectedSowId,
      extraCls: STRIP_CLS + '__pill--all'
    });

    data.sows.forEach(function (sow) {
      addPill({
        sowId:  sow.id,
        label:  sow.label,
        count:  sow.count,
        active: selectedSowId === sow.id
      });
    });

    nav.insertBefore(strip, nav.firstChild);
  }

  // ── Click handling ──────────────────────────────────────
  // Delegated, attached once at module load.
  document.addEventListener('click', function (e) {
    var pill = e.target.closest && e.target.closest('.' + STRIP_CLS + '__pill');
    if (!pill) return;
    var view = pill.closest('#' + VIEW_ID);
    if (!view) return;

    var sowId = pill.getAttribute('data-sow-id') || '';
    saveSelected(sowId);

    // Update active class without a full re-render — cheaper and
    // avoids losing focus on the clicked pill.
    var siblings = view.querySelectorAll('.' + STRIP_CLS + '__pill');
    for (var i = 0; i < siblings.length; i++) {
      siblings[i].classList.toggle(
        'is-active',
        (siblings[i].getAttribute('data-sow-id') || '') === sowId
      );
    }

    var data = collectSows();
    applyFilter(sowId, data);
  });

  // ── Render entry point ──────────────────────────────────
  function refresh() {
    var data = collectSows();
    if (!data) return;
    var selected = loadSelected();
    // If the persisted SOW is no longer in the data set (e.g. its
    // record was deleted), drop the selection back to "All".
    if (selected && !data.sows.some(function (s) { return s.id === selected; })) {
      selected = '';
      saveSelected('');
    }
    renderStrip(data, selected);
    applyFilter(selected, data);
  }

  // ── Bindings ────────────────────────────────────────────
  injectStyles();
  if (window.SCW && typeof SCW.onViewRender === 'function') {
    // 150ms after view-render — gives device-worksheet's transformView
    // (which runs at 150ms too) a beat to finish swapping rows in,
    // and matches the cadence of other view_3610 features.
    SCW.onViewRender(VIEW_ID, function () {
      setTimeout(refresh, 200);
    }, 'scwSowFilter');
  }

  // Re-apply on inline-edit cell updates so the strip stays accurate
  // when a row's SOW connections change.
  $(document)
    .off('knack-cell-update.' + VIEW_ID + EVENT_NS)
    .on('knack-cell-update.' + VIEW_ID + EVENT_NS, function () {
      setTimeout(refresh, 200);
    });

  // First render — if the view is already in the DOM when this script
  // loads, apply immediately.
  if (document.getElementById(VIEW_ID)) {
    setTimeout(refresh, 200);
  }
})();
/*************  SOW filter pills  *************/
