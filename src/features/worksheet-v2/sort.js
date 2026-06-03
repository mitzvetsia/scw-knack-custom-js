/*** WORKSHEET V2 — SORT ******************************************************
 *
 * "Sort by ▾" dropdown — bidirectional presets mirror v1\'s
 * device-worksheet-sort.js. Storage shape: "<presetId>|<direction>"
 * (direction omitted on compound presets like "By SOW" / "Default").
 * Clicking the active bidirectional preset FLIPS its direction;
 * clicking an inactive one selects it with its default direction
 * (text → asc, number → desc).
 *
 * Public API:
 *   ns.sort.mount(viewKey)
 *   ns.sort.getActivePreset(viewKey)  → object groups.js consumes
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var PRESETS = [
    { id: 'default', label: 'Default' },
    { id: 'label',   label: 'Label',   field: 'field_1950', type: 'text'   },
    { id: 'sub-bid', label: 'Sub bid', field: 'field_2150', type: 'number' },
    { id: 'qty',     label: 'Qty',     field: 'field_1964', type: 'number' },
    { id: 'sow',     label: 'By SOW',  rule: [
      { field: 'field_2154', order: 'asc', type: 'text' },
      { field: 'field_1950', order: 'asc', type: 'text' }
    ]}
  ];

  function isBidirectional(p) { return !!(p && p.field && !p.rule); }
  function defaultDir(p)      { return (p && p.type === 'text') ? 'asc' : 'desc'; }
  function findPreset(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  function getSceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function storageKey(viewKey) {
    return 'scw:ws-v2:sort:' + getSceneId() + ':' + viewKey;
  }
  function loadRaw(viewKey) {
    try { return localStorage.getItem(storageKey(viewKey)) || 'default'; }
    catch (e) { return 'default'; }
  }
  function saveRaw(viewKey, v) {
    try { localStorage.setItem(storageKey(viewKey), v); } catch (e) {}
  }

  function parse(stored) {
    if (!stored) return { presetId: '', direction: '' };
    var bar = stored.indexOf('|');
    if (bar < 0) return { presetId: stored, direction: '' };
    return { presetId: stored.substring(0, bar), direction: stored.substring(bar + 1) };
  }
  function serialize(presetId, direction) {
    if (!presetId) return '';
    return direction ? presetId + '|' + direction : presetId;
  }

  function getActivePreset(viewKey) {
    var sel = parse(loadRaw(viewKey));
    if (!sel.presetId || sel.presetId === 'default') return null;
    var p = findPreset(sel.presetId);
    if (!p) return null;
    if (isBidirectional(p)) {
      var dir = sel.direction || defaultDir(p);
      return { id: p.id, field: p.field, type: p.type, order: dir };
    }
    return p;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function dirGlyph(d) { return d === 'desc' ? '↓' : '↑'; }

  var CARET_SVG =
    '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function summaryText(viewKey) {
    var sel = parse(loadRaw(viewKey));
    var p = findPreset(sel.presetId) || PRESETS[0];
    var dir = '';
    if (isBidirectional(p) && sel.presetId === p.id) {
      dir = ' ' + dirGlyph(sel.direction || defaultDir(p));
    }
    return p.label + dir;
  }

  function buildDropdown(viewKey) {
    var sel = parse(loadRaw(viewKey));
    var dd = document.createElement('div');
    dd.className = 'scw-ws-v2-sort';

    var menuItems = PRESETS.map(function (p) {
      var active = sel.presetId === p.id;
      var glyph = '';
      if (isBidirectional(p)) {
        var dir = active ? (sel.direction || defaultDir(p)) : defaultDir(p);
        glyph = '<span class="scw-ws-v2-sort-item-dir' +
                (active ? ' scw-ws-v2-sort-item-dir--active' : '') +
                '">' + dirGlyph(dir) + '</span>';
      }
      return '<button type="button" class="scw-ws-v2-sort-item' +
        (active ? ' scw-ws-v2-sort-item--active' : '') +
        '" role="option" data-scw-ws-v2-sort-id="' + esc(p.id) + '">' +
        '<span class="scw-ws-v2-sort-item-label">' + esc(p.label) + '</span>' +
        glyph +
      '</button>';
    }).join('');

    dd.innerHTML =
      '<button type="button" class="scw-ws-v2-sort-btn" data-scw-ws-v2-sort-btn aria-haspopup="listbox" aria-expanded="false">' +
        '<span class="scw-ws-v2-sort-btn-label">Sort</span>' +
        '<span class="scw-ws-v2-sort-btn-value">' + esc(summaryText(viewKey)) + '</span>' +
        CARET_SVG +
      '</button>' +
      '<div class="scw-ws-v2-sort-menu" role="listbox">' + menuItems + '</div>';
    return dd;
  }

  function rerender(viewKey) {
    if (!ns.data || !ns.render) return;
    var records = ns.data.readRecords(viewKey);
    ns.render.renderView(viewKey, records);
  }

  function refreshDropdown(dd, viewKey) {
    var v = dd.querySelector('.scw-ws-v2-sort-btn-value');
    if (v) v.textContent = summaryText(viewKey);
    var sel = parse(loadRaw(viewKey));
    var items = dd.querySelectorAll('[data-scw-ws-v2-sort-id]');
    for (var i = 0; i < items.length; i++) {
      var id = items[i].getAttribute('data-scw-ws-v2-sort-id');
      var p  = findPreset(id);
      var active = id === sel.presetId;
      items[i].classList.toggle('scw-ws-v2-sort-item--active', active);
      var dirEl = items[i].querySelector('.scw-ws-v2-sort-item-dir');
      if (dirEl && p && isBidirectional(p)) {
        var dir = active ? (sel.direction || defaultDir(p)) : defaultDir(p);
        dirEl.textContent = dirGlyph(dir);
        dirEl.classList.toggle('scw-ws-v2-sort-item-dir--active', active);
      }
    }
  }

  function mount(viewKey) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    var toolbar = container.querySelector('.scw-ws-v2-toolbar');
    if (!toolbar) return;
    var existing = toolbar.querySelector('.scw-ws-v2-sort');
    if (existing) { refreshDropdown(existing, viewKey); return; }

    var dd = buildDropdown(viewKey);
    var modeGroup = toolbar.querySelector('.scw-ws-v2-toolbar-group');
    if (modeGroup && modeGroup.nextSibling) toolbar.insertBefore(dd, modeGroup.nextSibling);
    else toolbar.appendChild(dd);

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
      var p  = findPreset(id);
      var prev = parse(loadRaw(viewKey));
      var nextDir = '';
      if (p && isBidirectional(p)) {
        if (prev.presetId === id) {
          var cur = prev.direction || defaultDir(p);
          nextDir = (cur === 'desc') ? 'asc' : 'desc';
        } else {
          nextDir = defaultDir(p);
        }
      }
      saveRaw(viewKey, serialize(id, nextDir));
      dd.classList.remove('scw-ws-v2-sort--open');
      btn.setAttribute('aria-expanded', 'false');
      refreshDropdown(dd, viewKey);
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
