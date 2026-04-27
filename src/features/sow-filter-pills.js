/*************  Connection-filter pills above grid views  *************/
/**
 * Adds a quick-filter pill strip above a grid view, listing every unique
 * connected record on a given connection field, plus a "Show All" reset.
 * Clicking a pill scopes the grid to rows that connect to that record.
 *
 * Configured per-target in the TARGETS array below:
 *   - view_3610 / field_2154 ("SOW") — Scope of Work Line Items
 *   - view_3505 / field_2415 ("Bid") — Survey Line Items
 *
 * Both views share the same row layout: a card row (tr.scw-ws-row[id])
 * is the canonical record marker; an inline-photo row immediately
 * follows; a worksheet "data" row sits adjacent to the card row (either
 * before or after, depending on row class). indexRows() pairs every
 * non-card row with its nearest card row inside the same group so a
 * filter hides each record's full triplet as a unit.
 *
 * Coexists with group-collapse's exclusive accordion: rows are hidden
 * via a class with !important so jQuery .show()/.hide() from group-
 * collapse can't override the filter when expanding/collapsing groups.
 *
 * Selection persists per (scene, view) in localStorage; a stale
 * selection (e.g. the connected record was deleted) gracefully falls
 * back to "Show All" instead of leaving every row hidden.
 */
(function () {
  'use strict';

  // ── Targets ─────────────────────────────────────────────
  // To enable the strip on another grid view, add a target here.
  // `label` is the singular noun shown in the strip header ("SOW:" /
  // "Bid:"); `pluralPath` is only used for log messages.
  var TARGETS = [
    { viewId: 'view_3610', fieldKey: 'field_2154', label: 'SOW' },
    { viewId: 'view_3505', fieldKey: 'field_2415', label: 'Bid' }
  ];

  var STYLE_ID  = 'scw-conn-filter-pills-css';
  var STRIP_CLS = 'scw-conn-filter-strip';
  var HIDE_CLS  = 'scw-conn-filter-hidden';
  var EVENT_NS  = '.scwConnFilter';

  // ── Styles ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Strip container
      '.' + STRIP_CLS + ' {',
      '  display: flex; flex-wrap: wrap; align-items: center;',
      '  gap: 6px; margin: 0 0 12px;',
      '  padding: 8px 10px;',
      '  background: #f8fafc;',
      '  border: 1px solid #e2e8f0;',
      '  border-radius: 6px;',
      '  font: 12px/1.3 system-ui, -apple-system, sans-serif;',
      '}',
      '.' + STRIP_CLS + '__label {',
      '  font-weight: 600; color: #475569; margin-right: 4px;',
      '  letter-spacing: 0.02em; text-transform: uppercase; font-size: 11px;',
      '}',
      // Pill base
      '.' + STRIP_CLS + '__pill {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 10px;',
      '  border: 1px solid #cbd5e1;',
      '  background: #fff; color: #1f2937;',
      '  border-radius: 999px;',
      '  font-weight: 600; font-size: 12px;',
      '  cursor: pointer; user-select: none;',
      '  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;',
      '}',
      '.' + STRIP_CLS + '__pill:hover {',
      '  background: #f1f5f9; border-color: #94a3b8;',
      '}',
      // Active pill — primary teal, matches the ops-review pill language
      '.' + STRIP_CLS + '__pill.is-active {',
      '  background: #0891b2; border-color: #0e7490; color: #fff;',
      '}',
      '.' + STRIP_CLS + '__pill.is-active:hover {',
      '  background: #0e7490;',
      '}',
      // "All" pill — slightly different so it reads as a reset
      '.' + STRIP_CLS + '__pill--all:not(.is-active) {',
      '  background: transparent;',
      '}',
      // Per-pill record count
      '.' + STRIP_CLS + '__count {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  min-width: 18px; padding: 0 5px;',
      '  background: rgba(15, 23, 42, 0.08); color: #475569;',
      '  border-radius: 9px; font-size: 11px; font-weight: 600;',
      '}',
      '.' + STRIP_CLS + '__pill.is-active .' + STRIP_CLS + '__count {',
      '  background: rgba(255, 255, 255, 0.25); color: #fff;',
      '}',
      // Filter-hidden rows — !important so we can't be defeated by
      // jQuery .show() that group-collapse runs when expanding an
      // accordion group.
      'tr.' + HIDE_CLS + ' {',
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
  function storageKey(target) {
    return 'scw:conn-filter:' + getCurrentSceneId() + ':' + target.viewId;
  }
  function loadSelected(target) {
    try { return localStorage.getItem(storageKey(target)) || ''; }
    catch (e) { return ''; }
  }
  function saveSelected(target, recordId) {
    try {
      if (recordId) localStorage.setItem(storageKey(target), recordId);
      else          localStorage.removeItem(storageKey(target));
    } catch (e) { /* ignore */ }
  }

  // ── Connection collection from Knack model ──────────────
  // Returns { items, recordConns, totalRecords } where:
  //   items[]      = { id, label, count } sorted by label (natural sort)
  //   recordConns  = { recordId: { connId: true } } — fast lookup
  function collectConnections(target) {
    var byId = {};
    var recordConns = {};
    var totalRecords = 0;

    var v = window.Knack && Knack.views && Knack.views[target.viewId];
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return null;

    var rawKey = target.fieldKey + '_raw';
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var attrs = m && m.attributes;
      if (!attrs) continue;
      totalRecords++;

      var raw = attrs[rawKey];
      if (!Array.isArray(raw)) continue;

      var perRecord = recordConns[m.id] || (recordConns[m.id] = {});
      for (var j = 0; j < raw.length; j++) {
        var conn = raw[j];
        if (!conn || !conn.id) continue;
        if (!byId[conn.id]) {
          byId[conn.id] = {
            id: conn.id,
            label: String(conn.identifier || conn.id),
            count: 0
          };
        }
        if (!perRecord[conn.id]) {
          perRecord[conn.id] = true;
          byId[conn.id].count++;
        }
      }
    }

    var items = Object.keys(byId).map(function (k) { return byId[k]; });
    items.sort(function (a, b) {
      return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
    });

    return { items: items, recordConns: recordConns, totalRecords: totalRecords };
  }

  // ── DOM row indexing ────────────────────────────────────
  // Walk the tbody and group every <tr> by the record id it belongs
  // to. Card rows have id="<24-hex>"; everything else (photo rows,
  // worksheet data rows) is paired with its nearest card row inside
  // the same group. This avoids depending on view-specific edit-link
  // URL patterns, which differ between view_3610 and view_3505.
  function indexRows(target) {
    var view = document.getElementById(target.viewId);
    if (!view) return null;
    var tbody = view.querySelector('table tbody');
    if (!tbody) return null;

    var ID_RE = /^[a-f0-9]{24}$/i;
    var children = tbody.children;
    var n = children.length;

    // First pass: locate group headers and card rows by index.
    var groupAt = new Array(n);  // for each row index, which group bucket it belongs to
    var groups = [];             // [{ tr, recordIds: {} }]
    var cardIndices = [];        // [{ idx, recordId }]
    var cur = -1;                // current group bucket (-1 = before first group)

    for (var i = 0; i < n; i++) {
      var tr = children[i];
      if (tr.classList.contains('kn-table-group')) {
        groups.push({ tr: tr, recordIds: {} });
        cur = groups.length - 1;
        groupAt[i] = -1;  // group header itself isn't a member of any bucket
        continue;
      }
      groupAt[i] = cur;
      if (tr.classList.contains('scw-ws-row') && tr.id && ID_RE.test(tr.id)) {
        cardIndices.push({ idx: i, recordId: tr.id });
      }
    }

    // Second pass: assign every non-group, non-divider row to a record.
    var rowsByRecord = {};
    for (var r = 0; r < n; r++) {
      var row = children[r];
      if (row.classList.contains('kn-table-group')) continue;
      if (row.classList.contains('scw-synth-divider')) continue;

      var recordId = null;
      if (row.classList.contains('scw-ws-row') && row.id && ID_RE.test(row.id)) {
        recordId = row.id;
      } else {
        // Find nearest card row inside the same group bucket.
        var bucket = groupAt[r];
        var minDist = Infinity;
        for (var c = 0; c < cardIndices.length; c++) {
          var ci = cardIndices[c];
          if (groupAt[ci.idx] !== bucket) continue;
          var d = Math.abs(ci.idx - r);
          if (d < minDist) { minDist = d; recordId = ci.recordId; }
        }
      }
      if (!recordId) continue;

      if (!rowsByRecord[recordId]) rowsByRecord[recordId] = [];
      rowsByRecord[recordId].push(row);

      var b = groupAt[r];
      if (b >= 0) groups[b].recordIds[recordId] = true;
    }

    return { rowsByRecord: rowsByRecord, groupHeaders: groups };
  }

  // ── Apply filter ────────────────────────────────────────
  function applyFilter(target, selectedId, data) {
    if (!data) data = collectConnections(target);
    if (!data) return;
    var idx = indexRows(target);
    if (!idx) return;

    var recordIds = Object.keys(idx.rowsByRecord);
    for (var i = 0; i < recordIds.length; i++) {
      var rid = recordIds[i];
      var hide = false;
      if (selectedId) {
        var perRecord = data.recordConns[rid];
        hide = !(perRecord && perRecord[selectedId]);
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
      if (!selectedId) {
        anyVisible = true;
      } else {
        var ids = Object.keys(grp.recordIds);
        for (var k = 0; k < ids.length; k++) {
          var pr = data.recordConns[ids[k]];
          if (pr && pr[selectedId]) { anyVisible = true; break; }
        }
      }
      grp.tr.classList.toggle(HIDE_CLS, !anyVisible);
    }
  }

  // ── Pill strip render ───────────────────────────────────
  function renderStrip(target, data, selectedId) {
    var view = document.getElementById(target.viewId);
    if (!view) return;
    var nav = view.querySelector('.kn-records-nav');
    if (!nav) return;

    // Tear down any prior strip — Knack rebuilds the view from
    // scratch on lots of events; we want fresh markup, not stale.
    var prior = nav.querySelector('.' + STRIP_CLS);
    if (prior) prior.parentNode.removeChild(prior);

    if (!data || !data.items.length) return;

    var strip = document.createElement('div');
    strip.className = STRIP_CLS;
    strip.setAttribute('data-view-id', target.viewId);

    var label = document.createElement('span');
    label.className = STRIP_CLS + '__label';
    label.textContent = target.label + ':';
    strip.appendChild(label);

    function addPill(opts) {
      var pill = document.createElement('button');
      pill.type = 'button';
      pill.className = STRIP_CLS + '__pill' + (opts.extraCls ? ' ' + opts.extraCls : '');
      if (opts.active) pill.classList.add('is-active');
      pill.setAttribute('data-conn-id', opts.connId || '');

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
      connId:   '',
      label:    'Show All',
      count:    data.totalRecords,
      active:   !selectedId,
      extraCls: STRIP_CLS + '__pill--all'
    });

    data.items.forEach(function (item) {
      addPill({
        connId: item.id,
        label:  item.label,
        count:  item.count,
        active: selectedId === item.id
      });
    });

    nav.insertBefore(strip, nav.firstChild);
  }

  // ── Lookup target by view container ─────────────────────
  function findTargetForElement(el) {
    for (var i = 0; i < TARGETS.length; i++) {
      if (el.closest('#' + TARGETS[i].viewId)) return TARGETS[i];
    }
    return null;
  }

  // ── Click handling (delegated) ──────────────────────────
  document.addEventListener('click', function (e) {
    var pill = e.target.closest && e.target.closest('.' + STRIP_CLS + '__pill');
    if (!pill) return;
    var target = findTargetForElement(pill);
    if (!target) return;

    var connId = pill.getAttribute('data-conn-id') || '';
    saveSelected(target, connId);

    // Update active class without a full re-render — cheaper and
    // keeps focus on the clicked pill.
    var view = document.getElementById(target.viewId);
    var siblings = view ? view.querySelectorAll('.' + STRIP_CLS + '__pill') : [];
    for (var i = 0; i < siblings.length; i++) {
      siblings[i].classList.toggle(
        'is-active',
        (siblings[i].getAttribute('data-conn-id') || '') === connId
      );
    }

    var data = collectConnections(target);
    applyFilter(target, connId, data);
  });

  // ── Refresh entry point per target ──────────────────────
  function refresh(target) {
    var data = collectConnections(target);
    if (!data) return;
    var selected = loadSelected(target);
    if (selected && !data.items.some(function (it) { return it.id === selected; })) {
      selected = '';
      saveSelected(target, '');
    }
    renderStrip(target, data, selected);
    applyFilter(target, selected, data);
  }

  // ── Bindings ────────────────────────────────────────────
  injectStyles();

  TARGETS.forEach(function (target) {
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      // 200ms after view-render — gives device-worksheet's
      // transformView (also at ~150ms) a beat to finish swapping rows
      // in. Matches the cadence of other view-3610/view-3505 features.
      SCW.onViewRender(target.viewId, function () {
        setTimeout(function () { refresh(target); }, 200);
      }, 'scwConnFilter_' + target.viewId);
    }

    $(document)
      .off('knack-cell-update.' + target.viewId + EVENT_NS)
      .on('knack-cell-update.' + target.viewId + EVENT_NS, function () {
        setTimeout(function () { refresh(target); }, 200);
      });

    if (document.getElementById(target.viewId)) {
      setTimeout(function () { refresh(target); }, 200);
    }
  });
})();
/*************  Connection-filter pills  *************/
