/*** WORKSHEET V2 — SORT ******************************************************
 *
 * "Sort by ▾" dropdown mounted into the v2 toolbar. Mirrors v1\'s
 * device-worksheet-sort.js — a small set of preset sort rules per view
 * with localStorage persistence, applied via groups.js when records
 * are organised into L2 buckets.
 *
 * Presets (hard-coded for the SOW Line Items source view — extend
 * later if a second v2 view ships with different columns):
 *   - default : the existing field_2218 → field_2240 → field_1951
 *               sort (bucket sortOrder → drop prefix → drop number)
 *   - label   : field_1950 asc (drop label)
 *   - sub-bid : field_2150 desc (highest sub bid first)
 *   - qty     : field_1964 desc
 *   - sow     : field_2154 asc, then field_1950 asc
 *
 * Public API:
 *   ns.sort.mount(viewKey)           — wire the dropdown into the toolbar
 *   ns.sort.getActivePreset(viewKey) — returns the preset object groups.js
 *                                      should honour. null = default.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var PRESETS = [
    { id: 'default', label: 'Default' },
    { id: 'label',   label: 'Label',   field: 'field_1950', type: 'text',   order: 'asc' },
    { id: 'sub-bid', label: 'Sub bid', field: 'field_2150', type: 'number', order: 'desc' },
    { id: 'qty',     label: 'Qty',     field: 'field_1964', type: 'number', order: 'desc' },
    { id: 'sow',     label: 'By SOW',  rule: [
      { field: 'field_2154', order: 'asc',  type: 'text'   },
      { field: 'field_1950', order: 'asc',  type: 'text'   }
    ]}
  ];

  function getSceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function storageKey(viewKey) {
    return 'scw:ws-v2:sort:' + getSceneId() + ':' + viewKey;
  }
  function loadActiveId(viewKey) {
    try { return localStorage.getItem(storageKey(viewKey)) || 'default'; }
    catch (e) { return 'default'; }
  }
  function saveActiveId(viewKey, id) {
    try { localStorage.setItem(storageKey(viewKey), id); }
    catch (e) {}
  }

  function getActivePreset(viewKey) {
    var id = loadActiveId(viewKey);
    if (id === 'default') return null;
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  var CARET_SVG =
    '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function buildDropdown(viewKey) {
    var wrap = document.createElement('div');
    wrap.className = 'scw-ws-v2-sort';

    var activeId = loadActiveId(viewKey);
    var active = null;
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === activeId) { active = PRESETS[i]; break; }
    }
    if (!active) active = PRESETS[0];

    wrap.innerHTML =
      '<button type="button" class="scw-ws-v2-sort-btn" data-scw-ws-v2-sort-btn aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="scw-ws-v2-sort-btn-label">Sort</span>' +
        '<span class="scw-ws-v2-sort-btn-value">' + esc(active.label) + '</span>' +
        CARET_SVG +
      '</button>' +
      '<div class="scw-ws-v2-sort-menu" role="listbox">' +
        PRESETS.map(function (p) {
          var sel = p.id === activeId ? ' scw-ws-v2-sort-item--active' : '';
          return '<button type="button" class="scw-ws-v2-sort-item' + sel + '" ' +
            'role="option" data-scw-ws-v2-sort-id="' + esc(p.id) + '">' +
            esc(p.label) +
          '</button>';
        }).join('') +
      '</div>';
    return wrap;
  }

  function rerender(viewKey) {
    if (!ns.data || !ns.render) return;
    var records = ns.data.readRecords(viewKey);
    ns.render.renderView(viewKey, records);
  }

  function mount(viewKey) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    var toolbar = container.querySelector('.scw-ws-v2-toolbar');
    if (!toolbar) return;
    if (toolbar.querySelector('.scw-ws-v2-sort')) return; // already mounted

    var dd = buildDropdown(viewKey);
    // Insert AFTER the mode group (Expand/Summary) but BEFORE the
    // Photos toggle group, so it reads with the mode controls.
    var modeGroup = toolbar.querySelector('.scw-ws-v2-toolbar-group');
    if (modeGroup && modeGroup.nextSibling) {
      toolbar.insertBefore(dd, modeGroup.nextSibling);
    } else {
      toolbar.appendChild(dd);
    }

    var btn  = dd.querySelector('[data-scw-ws-v2-sort-btn]');
    var menu = dd.querySelector('.scw-ws-v2-sort-menu');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = dd.classList.toggle('scw-ws-v2-sort--open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    menu.addEventListener('click', function (e) {
      var it = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-sort-id]');
      if (!it) return;
      var id = it.getAttribute('data-scw-ws-v2-sort-id');
      saveActiveId(viewKey, id);
      var items = menu.querySelectorAll('[data-scw-ws-v2-sort-id]');
      for (var i = 0; i < items.length; i++) {
        items[i].classList.toggle('scw-ws-v2-sort-item--active',
          items[i].getAttribute('data-scw-ws-v2-sort-id') === id);
      }
      var lbl = it.textContent.trim();
      var v = dd.querySelector('.scw-ws-v2-sort-btn-value');
      if (v) v.textContent = lbl;
      dd.classList.remove('scw-ws-v2-sort--open');
      btn.setAttribute('aria-expanded', 'false');
      rerender(viewKey);
    });

    document.addEventListener('click', function (e) {
      if (!dd.contains(e.target)) {
        dd.classList.remove('scw-ws-v2-sort--open');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  ns.sort = {
    mount:           mount,
    getActivePreset: getActivePreset,
    PRESETS:         PRESETS
  };
})();
/*** END WORKSHEET V2 — SORT **************************************************/
