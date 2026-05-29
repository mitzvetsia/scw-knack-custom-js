/*** WORKSHEET V2 — SOW FILTER PILLS ******************************************
 *
 * Quick-filter strip mounted above the L1 list. One pill per unique
 * SOW (field_2154) connected to any record on the view, plus a
 * "Show All" pill. Clicking a SOW pill hides cards that don\'t connect
 * to that SOW; "Show All" resets.
 *
 * Implementation:
 *   - Cards carry a `data-scw-ws-v2-sow` attribute holding the
 *     space-separated SOW record ids (added by card.js).
 *   - The container gets `data-scw-ws-v2-sow-filter="<sowId>"` when a
 *     filter is active. CSS hides every card whose data-sow attr
 *     doesn\'t include the selected id.
 *   - Empty L1 sections (where every card got filtered) auto-hide via
 *     CSS using :has() (per-L1 has zero visible cards). Falls back
 *     gracefully on browsers without :has().
 *   - Selection persists per (scene, viewKey) in localStorage.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  function getSceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function storageKey(viewKey) {
    return 'scw:ws-v2:sow-filter:' + getSceneId() + ':' + viewKey;
  }
  function loadActive(viewKey) {
    try { return localStorage.getItem(storageKey(viewKey)) || ''; }
    catch (e) { return ''; }
  }
  function saveActive(viewKey, sowId) {
    try {
      if (sowId) localStorage.setItem(storageKey(viewKey), sowId);
      else       localStorage.removeItem(storageKey(viewKey));
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

  /** Collect unique SOWs from the source view\'s records — returns
   *  [{id, label}] sorted by label (numeric-aware so SW-1001 < SW-1002). */
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

  function applyFilter(container, sowId) {
    if (sowId) container.setAttribute('data-scw-ws-v2-sow-filter', sowId);
    else container.removeAttribute('data-scw-ws-v2-sow-filter');

    // Per-card class toggle: cards whose data-scw-ws-v2-sow does NOT
    // include the active SOW id get the --sow-filtered class. CSS
    // can\'t do dynamic attribute matching for a runtime-chosen value,
    // so we do it in JS.
    var cards = container.querySelectorAll('.scw-ws-v2-card');
    for (var c = 0; c < cards.length; c++) {
      if (!sowId) {
        cards[c].classList.remove('scw-ws-v2-card--sow-filtered');
        continue;
      }
      var attr = cards[c].getAttribute('data-scw-ws-v2-sow') || '';
      var ids = attr.split(/\s+/);
      var hit = false;
      for (var k = 0; k < ids.length; k++) if (ids[k] === sowId) { hit = true; break; }
      cards[c].classList.toggle('scw-ws-v2-card--sow-filtered', !hit);
    }

    var strip = container.querySelector('.scw-ws-v2-sow-pills');
    if (!strip) return;
    var pills = strip.querySelectorAll('[data-scw-ws-v2-sow-pill]');
    for (var i = 0; i < pills.length; i++) {
      var pid = pills[i].getAttribute('data-scw-ws-v2-sow-pill');
      pills[i].classList.toggle('scw-ws-v2-sow-pill--active',
        pid === sowId || (!sowId && pid === '__all'));
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
      // No SOWs → no pills. Strip any stale one and clear filter.
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
      '</div>';

    if (existing) {
      existing.outerHTML = html;
    } else {
      // Mount BEFORE the body so the strip sits above the grand summary.
      body.insertAdjacentHTML('beforebegin', html);
    }

    var strip = container.querySelector(':scope > .scw-ws-v2-sow-pills');
    if (!strip) return;

    var active = loadActive(viewKey);
    // Validate the stored selection — if the SOW no longer exists,
    // reset to Show All.
    var stillValid = false;
    for (var s = 0; s < sows.length; s++) if (sows[s].id === active) { stillValid = true; break; }
    if (!stillValid) {
      active = '';
      saveActive(viewKey, '');
    }
    applyFilter(container, active);

    if (!strip.hasAttribute('data-scw-bound')) {
      strip.setAttribute('data-scw-bound', '1');
      strip.addEventListener('click', function (e) {
        var pill = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-sow-pill]');
        if (!pill) return;
        var id = pill.getAttribute('data-scw-ws-v2-sow-pill');
        var next = id === '__all' ? '' : id;
        saveActive(viewKey, next);
        applyFilter(container, next);
      });
    }
  }

  ns.sowFilter = {
    mount:       mount,
    loadActive:  loadActive
  };
})();
/*** END WORKSHEET V2 — SOW FILTER PILLS **************************************/
