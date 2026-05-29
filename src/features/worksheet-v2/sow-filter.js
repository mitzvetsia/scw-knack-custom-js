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

  function collectSowList(viewKey) {
    var v = window.Knack && Knack.views && Knack.views[viewKey];
    if (!v || !v.model || !v.model.data) return [];
    var models = v.model.data.models || [];
    var seen = Object.create(null);
    var list = [];
    for (var i = 0; i < models.length; i++) {
      var attrs = models[i] && models[i].attributes;
      if (!attrs) continue;
      var raw = attrs.field_2154_raw;
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        var s = raw[j];
        if (!s || !s.id || seen[s.id]) continue;
        seen[s.id] = true;
        list.push({ id: s.id, label: stripHtml(s.identifier) || s.id });
      }
    }
    list.sort(function (a, b) {
      return a.label.localeCompare(b.label, undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return list;
  }

  function applyFilter(container, activeIds) {
    var hasAny = activeIds && activeIds.length > 0;
    if (hasAny) container.setAttribute('data-scw-ws-v2-sow-filter', activeIds.join(','));
    else container.removeAttribute('data-scw-ws-v2-sow-filter');

    // Per-card class toggle. A card is visible (no --sow-filtered)
    // if at least one of its SOW ids is in activeIds, OR if it has
    // no SOW ids and the "(blank)" sentinel is active.
    var activeSet = Object.create(null);
    var blankActive = false;
    for (var a = 0; a < activeIds.length; a++) {
      if (activeIds[a] === BLANK) blankActive = true;
      else activeSet[activeIds[a]] = true;
    }

    var cards = container.querySelectorAll('.scw-ws-v2-card');
    for (var c = 0; c < cards.length; c++) {
      if (!hasAny) {
        cards[c].classList.remove('scw-ws-v2-card--sow-filtered');
        continue;
      }
      var attr = cards[c].getAttribute('data-scw-ws-v2-sow') || '';
      var ids  = attr ? attr.split(/\s+/) : [];
      var hit = false;
      if (!ids.length) {
        hit = blankActive;
      } else {
        for (var k = 0; k < ids.length; k++) {
          if (activeSet[ids[k]]) { hit = true; break; }
        }
      }
      cards[c].classList.toggle('scw-ws-v2-card--sow-filtered', !hit);
    }

    var strip = container.querySelector('.scw-ws-v2-sow-pills');
    if (!strip) return;
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
          return '<button type="button" class="scw-ws-v2-sow-pill" ' +
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
    applyFilter(container, active);

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
          // Toggle individual pill in/out of the active set.
          var idx = current.indexOf(id);
          if (idx === -1) {
            next = current.slice();
            next.push(id);
          } else {
            next = current.slice();
            next.splice(idx, 1);
          }
        }
        saveActive(viewKey, next);
        applyFilter(container, next);
      });
    }
  }

  ns.sowFilter = {
    mount:      mount,
    loadActive: loadActive
  };
})();
/*** END WORKSHEET V2 — SOW FILTER PILLS **************************************/
