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
 *
 * Mounting is delegated to SCW.toolbar — this file owns the markup,
 * state, and filter logic. The toolbar registry calls mount() on
 * accordion-subtree mutations; mount only builds when the strip is
 * missing, otherwise it refreshes the active state. Full data rebuilds
 * are triggered explicitly on knack-cell-update.
 */
(function () {
  'use strict';

  // ── Targets ─────────────────────────────────────────────
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
      '.' + STRIP_CLS + ' {',
      '  display: flex; flex-wrap: wrap; align-items: center;',
      '  gap: 6px; margin: 0 0 12px;',
      '  padding: 8px 10px;',
      '  background: var(--scw-surface-subtle);',
      '  border: 1px solid var(--scw-border-subtle);',
      '  border-radius: 6px;',
      '  font: 12px/1.3 system-ui, -apple-system, sans-serif;',
      '}',
      '.' + STRIP_CLS + '__label {',
      '  font-weight: 600; color: var(--scw-text-caption); margin-right: 4px;',
      '  letter-spacing: 0.02em; text-transform: uppercase; font-size: 11px;',
      '}',
      '.' + STRIP_CLS + '__pill {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 4px 10px;',
      '  border: 1px solid var(--scw-border-default);',
      '  background: var(--scw-surface-base); color: var(--scw-text-default);',
      '  border-radius: 999px;',
      '  font-weight: 600; font-size: 12px;',
      '  cursor: pointer; user-select: none;',
      '  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;',
      '}',
      '.' + STRIP_CLS + '__pill:hover {',
      '  background: var(--scw-surface-muted); border-color: var(--scw-border-strong);',
      '}',
      '.' + STRIP_CLS + '__pill.is-active {',
      '  background: var(--scw-accent); border-color: var(--scw-accent-strong); color: var(--scw-surface-base);',
      '}',
      '.' + STRIP_CLS + '__pill.is-active:hover {',
      '  background: var(--scw-accent-strong);',
      '}',
      '.' + STRIP_CLS + '__pill--all:not(.is-active) {',
      '  background: transparent;',
      '}',
      '.' + STRIP_CLS + '__count {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  min-width: 18px; padding: 0 5px;',
      '  background: rgba(15, 23, 42, 0.08); color: var(--scw-text-caption);',
      '  border-radius: 9px; font-size: 11px; font-weight: 600;',
      '}',
      '.' + STRIP_CLS + '__pill.is-active .' + STRIP_CLS + '__count {',
      '  background: rgba(255, 255, 255, 0.25); color: var(--scw-surface-base);',
      '}',
      'tr.' + HIDE_CLS + ' {',
      '  display: none !important;',
      '}',
      // ── SOW/Bid color coding ──
      '.' + STRIP_CLS + '__dot {',
      '  display: inline-block; width: 9px; height: 9px; border-radius: 50%;',
      '  flex: 0 0 auto;',
      '}',
      // Left-edge color bar on each device card — one segment per SOW/Bid
      // (via --scw-sow-bar) so a card on more than one shows every color.
      '.scw-ws-card[data-scw-sow-colored] { position: relative; }',
      '.scw-ws-card[data-scw-sow-colored]::before {',
      '  content: ""; position: absolute; left: 0; top: 0; bottom: 0;',
      '  width: 7px; background: var(--scw-sow-bar, transparent);',
      '  z-index: 1; pointer-events: none; border-radius: 4px 0 0 4px;',
      '}',
      '.scw-ws-card[data-scw-sow-colored="multi"]::before { width: 9px; }'
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
  function indexRows(target) {
    var view = document.getElementById(target.viewId);
    if (!view) return null;
    var tbody = view.querySelector('table.kn-table tbody');
    if (!tbody) return null;

    var ID_RE = /^[a-f0-9]{24}$/i;
    var children = tbody.children;
    var n = children.length;

    var groupAt = new Array(n);
    var groups = [];
    var cardIndices = [];
    var cur = -1;

    for (var i = 0; i < n; i++) {
      var tr = children[i];
      if (tr.classList.contains('kn-table-group')) {
        groups.push({ tr: tr, recordIds: {} });
        cur = groups.length - 1;
        groupAt[i] = -1;
        continue;
      }
      groupAt[i] = cur;
      if (tr.classList.contains('scw-ws-row') && tr.id && ID_RE.test(tr.id)) {
        cardIndices.push({ idx: i, recordId: tr.id });
      }
    }

    var rowsByRecord = {};
    for (var r = 0; r < n; r++) {
      var row = children[r];
      if (row.classList.contains('kn-table-group')) continue;
      if (row.classList.contains('scw-synth-divider')) continue;

      var recordId = null;
      if (row.classList.contains('scw-ws-row') && row.id && ID_RE.test(row.id)) {
        recordId = row.id;
      } else {
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

    try {
      document.dispatchEvent(new CustomEvent('scw-conn-filter-changed', {
        detail: { viewId: target.viewId, selectedId: selectedId || null }
      }));
    } catch (e) { /* ignore */ }
  }

  // ── Pill strip render ───────────────────────────────────
  // Builds fresh markup from data. Pure-ish: only DOM creation.
  function buildStrip(target, data, selectedId) {
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

      // Color swatch tying the pill to its SOW/Bid row color.
      if (opts.dotColor) {
        var dot = document.createElement('span');
        dot.className = STRIP_CLS + '__dot';
        dot.style.background = opts.dotColor;
        pill.appendChild(dot);
      }

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

    data.items.forEach(function (item, i) {
      addPill({
        connId:   item.id,
        label:    item.label,
        count:    item.count,
        active:   selectedId === item.id,
        dotColor: (window.SCW && SCW.sowColor) ? SCW.sowColor.dot(i) : ''
      });
    });
    return strip;
  }

  // ── Row color coding ────────────────────────────────────
  // Paint each device card with the color(s) of the SOW(s)/Bid(s) it's
  // connected to — a left-edge bar (one segment per connection). Stable
  // color per SOW/Bid by its sorted position in the pill list (the same
  // index the pill dots use).
  function colorRows(target, data) {
    if (!window.SCW || !SCW.sowColor) return;
    if (!data) data = collectConnections(target);
    if (!data) return;
    var view = document.getElementById(target.viewId);
    if (!view) return;
    var colorMap = SCW.sowColor.buildMap(data.items.map(function (it) { return it.id; }));
    var rows = view.querySelectorAll('tr.scw-ws-row[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var cardEl = tr.querySelector('.scw-ws-card');
      if (!cardEl) continue;
      var conns = data.recordConns[tr.id];
      var idxs = [];
      if (conns) {
        for (var cid in conns) {
          if (conns.hasOwnProperty(cid) && colorMap[cid] != null) idxs.push(colorMap[cid]);
        }
      }
      idxs = SCW.sowColor.normIndices(idxs);
      if (!idxs.length) {
        cardEl.style.removeProperty('--scw-sow-bar');
        cardEl.removeAttribute('data-scw-sow-colored');
        continue;
      }
      cardEl.style.setProperty('--scw-sow-bar', SCW.sowColor.barFor(idxs));
      cardEl.setAttribute('data-scw-sow-colored', idxs.length > 1 ? 'multi' : '1');
    }
  }

  // Idempotent strip mount used by the toolbar registry. Builds if
  // missing; otherwise refreshes only the .is-active class so the
  // strip survives Knack re-renders without flickering or losing the
  // user's interaction state.
  function ensureStrip(target, nav) {
    var data = collectConnections(target);
    if (!data || !data.items.length) return;

    var selected = loadSelected(target);
    if (selected && !data.items.some(function (it) { return it.id === selected; })) {
      selected = '';
      saveSelected(target, '');
    }

    var existing = nav.querySelector(
      '.' + STRIP_CLS + '[data-view-id="' + target.viewId + '"]'
    );
    if (existing) {
      // Just sync active class — markup is still valid.
      var pills = existing.querySelectorAll('.' + STRIP_CLS + '__pill');
      for (var i = 0; i < pills.length; i++) {
        var connId = pills[i].getAttribute('data-conn-id') || '';
        pills[i].classList.toggle('is-active', connId === selected);
      }
      // Re-apply row colors — a worksheet re-render may have rebuilt the
      // cards (wiping the inline bar) since the strip was last mounted.
      colorRows(target, data);
      return;
    }

    nav.appendChild(buildStrip(target, data, selected));
    applyFilter(target, selected, data);
    colorRows(target, data);
  }

  // Full rebuild — used when underlying data may have changed (cell
  // edits, fresh fetch). Removes any prior strip from anywhere the view
  // contains it, then lets the registry's next mount call recreate it.
  function rebuildStrip(target) {
    var view = document.getElementById(target.viewId);
    if (!view) return;
    var prior = view.querySelectorAll(
      '.' + STRIP_CLS + '[data-view-id="' + target.viewId + '"]'
    );
    for (var i = 0; i < prior.length; i++) prior[i].parentNode.removeChild(prior[i]);

    var nav = view.querySelector('.kn-records-nav');
    if (nav) ensureStrip(target, nav);
  }

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
    colorRows(target, data);
  });

  // ── Bindings ────────────────────────────────────────────
  injectStyles();

  TARGETS.forEach(function (target) {
    // Re-color after every worksheet render (cards get rebuilt on edits,
    // filter changes, group toggles). Debounced to absorb bursts.
    var colorTimer = null;
    $(document)
      .off('knack-view-render.' + target.viewId + EVENT_NS + 'Color')
      .on('knack-view-render.' + target.viewId + EVENT_NS + 'Color', function () {
        if (colorTimer) clearTimeout(colorTimer);
        colorTimer = setTimeout(function () { colorRows(target); }, 150);
      });
    SCW.toolbar.register({
      id:    'filter-pills-' + target.viewId,
      slot:  SCW.toolbar.SLOTS.filter,
      viewMatch: function (viewEl) { return viewEl.id === target.viewId; },
      mount: function (viewEl, nav) {
        ensureStrip(target, nav);
      }
    });

    // Cell-update fires when a row's data changes — connections might
    // have been added/removed; force a full rebuild so counts stay
    // accurate. Debounce to absorb bursts (bulk edits).
    var cellTimer = null;
    $(document)
      .off('knack-cell-update.' + target.viewId + EVENT_NS)
      .on('knack-cell-update.' + target.viewId + EVENT_NS, function () {
        if (cellTimer) clearTimeout(cellTimer);
        cellTimer = setTimeout(function () { rebuildStrip(target); }, 200);
      });
  });
})();
/*************  Connection-filter pills  *************/
