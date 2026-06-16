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

  // Map SOW record id → name (field_2126), read from the SOW source views
  // (same ones bulk.js sources its SOW candidates from). The connection
  // payload on field_2154_raw only carries the SW-#### identifier, not the
  // friendly name — so we look it up here for the pill hover tooltip.
  function sowNameById() {
    var map = Object.create(null);
    var views = ['view_3325', 'view_3918'];
    for (var vi = 0; vi < views.length; vi++) {
      var v = window.Knack && Knack.views && Knack.views[views[vi]];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        if (!a || !a.id || map[a.id]) continue;
        var name = stripHtml(a.field_2126);
        if (name) map[a.id] = name;
      }
    }
    return map;
  }

  function collectSowList(viewKey) {
    var v = window.Knack && Knack.views && Knack.views[viewKey];
    if (!v || !v.model || !v.model.data) return [];
    var models = v.model.data.models || [];
    var SOWK = ((ns.cfg && ns.cfg.fields(viewKey).sow) || 'field_2154') + '_raw';
    var nameMap = sowNameById();
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
    var SOWK = ((ns.cfg && ns.cfg.fields(viewKey).sow) || 'field_2154') + '_raw';
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

    var html =
      '<div class="scw-ws-v2-sow-pills">' +
        '<span class="scw-ws-v2-sow-pills-label">SOW</span>' +
        '<button type="button" class="scw-ws-v2-sow-pill" ' +
          'data-scw-ws-v2-sow-pill="__all">Show All</button>' +
        sows.map(function (s) {
          // Hover tooltip shows the SOW name (field_2126); fall back to the
          // SW-#### label when a record has no name loaded.
          var tip = s.name ? (s.label + ' — ' + s.name) : s.label;
          return '<button type="button" class="scw-ws-v2-sow-pill" ' +
            'title="' + esc(tip) + '" ' +
            'data-scw-ws-v2-sow-pill="' + esc(s.id) + '">' + esc(s.label) + '</button>';
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

  ns.sowFilter = {
    mount:          mount,
    loadActive:     loadActive,
    filterRecords:  filterRecords
  };
})();
/*** END WORKSHEET V2 — SOW FILTER PILLS **************************************/
