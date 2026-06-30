/*** WORKSHEET V2 — SOW FILTER PILLS ******************************************
 *
 * Multi-select quick-filter strip mounted above the L1 list. One pill
 * per unique SOW (field_2154) connected to any record on the view,
 * plus a "(blank)" pill that scopes to records with no SOW, plus a
 * "Show All" reset. Pills toggle independently — clicking SW-1001
 * AND SW-1060 shows every card connected to EITHER SOW; clicking
 * "(blank)" alongside SW-1001 also surfaces no-SOW rows.
 *
 * Storage: comma-separated list of selected ids in localStorage. The
 * sentinel `__blank` represents the "no SOW connection" filter.
 * Empty string = Show All (no filter active).
 *
 * The container gets `data-scw-ws-v2-sow-filter` (a single comma-
 * joined value, for inspectability); per-card class `--sow-filtered`
 * does the actual hide. CSS can\'t do dynamic-id matching, so the
 * match logic runs in JS.
 *
 * Selection persists per (scene, viewKey). Stale ids that no longer
 * correspond to a real SOW are dropped silently on mount.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var BLANK = '__blank';

  function getSceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function storageKey(viewKey) {
    return 'scw:ws-v2:sow-filter:' + getSceneId() + ':' + viewKey;
  }
  function loadActive(viewKey) {
    try {
      var raw = localStorage.getItem(storageKey(viewKey)) || '';
      if (!raw) return [];
      return raw.split(',').filter(function (s) { return s.length; });
    } catch (e) { return []; }
  }
  function saveActive(viewKey, ids) {
    try {
      if (!ids || !ids.length) localStorage.removeItem(storageKey(viewKey));
      else                     localStorage.setItem(storageKey(viewKey), ids.join(','));
    } catch (e) {}
  }

  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim();
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // Per-view filter spec. Default = SOW (field_2154, labelled "SOW", names
  // sourced from the SOW grids). A view can override via config.filterPills
  // (e.g. survey filters by BID field_2415) — `field` may be a field key or
  // a logical name resolved through cfg.fields.
  function filterSpec(viewKey) {
    var vc = (ns.cfg && typeof ns.cfg.viewCfg === 'function')
      ? ns.cfg.viewCfg(viewKey) : null;
    if (vc && vc.filterPills && vc.filterPills.field) {
      var fp = vc.filterPills;
      var fk = fp.field;
      if (fk.indexOf('field_') !== 0 && ns.cfg && typeof ns.cfg.fields === 'function') {
        fk = ns.cfg.fields(viewKey)[fk] || fk;
      }
      return {
        fieldKey:   fk,
        label:      fp.label || 'Filter',
        nameViews:  fp.nameViews || null,
        nameField:  fp.nameField || null,
        appendName: !!fp.appendName   // show friendly name ON the pill, not just hover
      };
    }
    var sowK = (ns.cfg && ns.cfg.fields(viewKey).sow) || 'field_2154';
    return {
      fieldKey:  sowK,
      label:     'SOW',
      nameViews: ['view_3325', 'view_3918'],
      nameField: 'field_2126'
    };
  }

  // Map connection record id → friendly name, read from the spec's name
  // grids. The connection _raw payload only carries the identifier, not the
  // friendly name — so we look it up here for the pill hover tooltip. When
  // the spec has no nameViews (e.g. the Bid filter), returns an empty map
  // and the pill just shows its identifier.
  function nameById(spec) {
    var map = Object.create(null);
    if (!spec || !spec.nameViews || !spec.nameField) return map;
    for (var vi = 0; vi < spec.nameViews.length; vi++) {
      var v = window.Knack && Knack.views && Knack.views[spec.nameViews[vi]];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        if (!a || !a.id || map[a.id]) continue;
        var name = stripHtml(a[spec.nameField]);
        if (name) map[a.id] = name;
      }
    }
    return map;
  }

  function collectSowList(viewKey) {
    var v = window.Knack && Knack.views && Knack.views[viewKey];
    if (!v || !v.model || !v.model.data) return [];
    var models = v.model.data.models || [];
    var spec = filterSpec(viewKey);
    var SOWK = spec.fieldKey + '_raw';
    var nameMap = nameById(spec);
    var seen = Object.create(null);
    var list = [];
    for (var i = 0; i < models.length; i++) {
      var attrs = models[i] && models[i].attributes;
      if (!attrs) continue;
      var raw = attrs[SOWK];
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        var s = raw[j];
        if (!s || !s.id || seen[s.id]) continue;
        seen[s.id] = true;
        list.push({ id: s.id, label: stripHtml(s.identifier) || s.id, name: nameMap[s.id] || '' });
      }
    }
    list.sort(function (a, b) {
      return a.label.localeCompare(b.label, undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return list;
  }

  function applyFilter(container, activeIds, viewKey) {
    var hasAny = activeIds && activeIds.length > 0;
    if (hasAny) container.setAttribute('data-scw-ws-v2-sow-filter', activeIds.join(','));
    else container.removeAttribute('data-scw-ws-v2-sow-filter');

    // Refresh the pill active states (don\'t need to walk cards — the
    // re-render below rebuilds them from filtered records, so summary
    // counts adjust to match.)
    var activeSet = Object.create(null);
    var blankActive = false;
    for (var a = 0; a < activeIds.length; a++) {
      if (activeIds[a] === BLANK) blankActive = true;
      else activeSet[activeIds[a]] = true;
    }
    var strip = container.querySelector('.scw-ws-v2-sow-pills');
    if (strip) {
      var pills = strip.querySelectorAll('[data-scw-ws-v2-sow-pill]');
      for (var i = 0; i < pills.length; i++) {
        var pid = pills[i].getAttribute('data-scw-ws-v2-sow-pill');
        if (pid === '__all') {
          pills[i].classList.toggle('scw-ws-v2-sow-pill--active', !hasAny);
        } else {
          pills[i].classList.toggle('scw-ws-v2-sow-pill--active',
            activeSet[pid] || (pid === BLANK && blankActive));
        }
      }
    }

    // Trigger a re-render so the summary counts + grouping + cards
    // reflect the filtered subset. Falls back gracefully if data/render
    // aren\'t ready yet (initial boot).
    if (viewKey && ns.data && ns.render) {
      var records = ns.data.readRecords(viewKey);
      ns.render.renderView(viewKey, records);
    }
  }

  /** Filter a flat records array by the active SOW filter for this
   *  view. Public so render.js can apply it before group-tree build. */
  function filterRecords(viewKey, records) {
    var active = loadActive(viewKey);
    if (!active.length) return records;
    var activeSet = Object.create(null);
    var blankActive = false;
    for (var a = 0; a < active.length; a++) {
      if (active[a] === BLANK) blankActive = true;
      else activeSet[active[a]] = true;
    }
    var SOWK = filterSpec(viewKey).fieldKey + '_raw';
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var raw = r && r[SOWK];
      if (!Array.isArray(raw) || raw.length === 0) {
        if (blankActive) out.push(r);
        continue;
      }
      var hit = false;
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && activeSet[raw[j].id]) { hit = true; break; }
      }
      if (hit) out.push(r);
    }
    return out;
  }

  function mount(viewKey) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;

    var sows = collectSowList(viewKey);
    var body = container.querySelector('.scw-ws-v2-body');
    if (!body) return;

    var existing = container.querySelector(':scope > .scw-ws-v2-sow-pills');
    if (!sows.length) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      container.removeAttribute('data-scw-ws-v2-sow-filter');
      return;
    }

    var spec = filterSpec(viewKey);
    var html =
      '<div class="scw-ws-v2-sow-pills">' +
        '<span class="scw-ws-v2-sow-pills-label">' + esc(spec.label) + '</span>' +
        '<button type="button" class="scw-ws-v2-sow-pill" ' +
          'data-scw-ws-v2-sow-pill="__all">Show All</button>' +
        sows.map(function (s, i) {
          // Tooltip always shows "label — name". When the spec opts in via
          // appendName (e.g. the Bid filter), the friendly name is also shown
          // ON the pill (label — name); otherwise the pill stays terse.
          var tip = s.name ? (s.label + ' — ' + s.name) : s.label;
          var text = (spec.appendName && s.name) ? (s.label + ' — ' + s.name) : s.label;
          // Color swatch tying this pill to the row tint/bar of the same SOW/Bid.
          var dot = (window.SCW && SCW.sowColor)
            ? '<span class="scw-ws-v2-sow-pill-dot" style="background:' +
                SCW.sowColor.dot(i) + '"></span>'
            : '';
          return '<button type="button" class="scw-ws-v2-sow-pill" ' +
            'title="' + esc(tip) + '" ' +
            'data-scw-ws-v2-sow-pill="' + esc(s.id) + '">' + dot + esc(text) + '</button>';
        }).join('') +
        '<button type="button" class="scw-ws-v2-sow-pill scw-ws-v2-sow-pill--blank" ' +
          'data-scw-ws-v2-sow-pill="' + BLANK + '">(blank)</button>' +
      '</div>';

    if (existing) existing.outerHTML = html;
    else body.insertAdjacentHTML('beforebegin', html);

    var strip = container.querySelector(':scope > .scw-ws-v2-sow-pills');
    if (!strip) return;

    var valid = Object.create(null);
    for (var s = 0; s < sows.length; s++) valid[sows[s].id] = true;
    valid[BLANK] = true;
    var active = loadActive(viewKey).filter(function (id) { return valid[id]; });
    saveActive(viewKey, active);
    applyFilter(container, active, viewKey);

    if (!strip.hasAttribute('data-scw-bound')) {
      strip.setAttribute('data-scw-bound', '1');
      strip.addEventListener('click', function (e) {
        var pill = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-sow-pill]');
        if (!pill) return;
        var id = pill.getAttribute('data-scw-ws-v2-sow-pill');
        var current = loadActive(viewKey);
        var next;
        if (id === '__all') {
          next = [];
        } else {
          var idx = current.indexOf(id);
          if (idx === -1) { next = current.slice(); next.push(id); }
          else            { next = current.slice(); next.splice(idx, 1); }
        }
        saveActive(viewKey, next);
        applyFilter(container, next, viewKey);
      });
    }
  }

  // ── Row color coding ────────────────────────────────────────────────
  // Assign each SOW/Bid a stable color (by its sorted position in the
  // pill list) and paint every line-item card with the color(s) of the
  // SOW(s)/Bid(s) it's connected to: a left-edge bar (one segment per
  // SOW/Bid, so a row on several shows all of them) plus a faint wash.
  // Re-run after every render (cards are rebuilt) via render.js.
  function applyRowColors(viewKey) {
    if (!window.SCW || !SCW.sowColor) return;
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    var list = collectSowList(viewKey);
    var spec = filterSpec(viewKey);
    var SOWK = spec.fieldKey + '_raw';
    var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');

    function clear(card) {
      card.style.removeProperty('background-color');
      card.style.removeProperty('--scw-sow-bar');
      card.removeAttribute('data-scw-sow-colored');
    }
    if (!list.length) {
      for (var z = 0; z < cards.length; z++) clear(cards[z]);
      return;
    }

    var colorMap = SCW.sowColor.buildMap(list.map(function (s) { return s.id; }));
    var records = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(viewKey) : [];
    var byId = Object.create(null);
    for (var r = 0; r < records.length; r++) {
      if (records[r] && records[r].id) byId[records[r].id] = records[r];
    }

    for (var c = 0; c < cards.length; c++) {
      var card = cards[c];
      var rec = byId[card.getAttribute('data-scw-ws-v2-record')];
      var raw = rec && rec[SOWK];
      var idxs = [];
      if (Array.isArray(raw)) {
        for (var j = 0; j < raw.length; j++) {
          var id = raw[j] && raw[j].id;
          if (id != null && colorMap[id] != null) idxs.push(colorMap[id]);
        }
      }
      idxs = SCW.sowColor.normIndices(idxs);
      if (!idxs.length) { clear(card); continue; }
      card.style.setProperty('--scw-sow-bar', SCW.sowColor.barFor(idxs));
      // Inline !important beats the card's `background: #fff !important`
      // zebra/base rule, so the tint actually shows.
      card.style.setProperty('background-color', SCW.sowColor.tintFor(idxs, 0.13), 'important');
      card.setAttribute('data-scw-sow-colored', idxs.length > 1 ? 'multi' : '1');
    }
  }

  ns.sowFilter = {
    mount:          mount,
    loadActive:     loadActive,
    filterRecords:  filterRecords,
    applyRowColors: applyRowColors
  };
})();
/*** END WORKSHEET V2 — SOW FILTER PILLS **************************************/
