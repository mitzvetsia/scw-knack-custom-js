/*** WORKSHEET V2 — SEARCH BOX **********************************************
 *
 * A free-text search box at the top of the v2 panel. Filters the worksheet to
 * line items whose key fields match the query — product, drop label, prefix,
 * MDF/IDF, connected devices, and the notes/description text. Multi-word =
 * AND (every token must appear somewhere).
 *
 * Mirrors the SOW-filter contract: the heavy lifting is `filterRecords()`,
 * which render.js calls (after the SOW filter) so the search narrows the
 * RECORD set — grouping, summary counts and cards all rebuild from the
 * filtered subset, no manual card-hiding. While a query is active the panel
 * gets `scw-ws-v2-search-active`, which force-opens every MDF/IDF group so a
 * match inside a collapsed group is still visible.
 *
 * Query is transient (module memory, per source view) — intentionally NOT
 * persisted, so a reload starts clean.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var STYLE_ID = 'scw-ws-v2-search-css';
  var rawByView = Object.create(null);   // viewKey → what the user typed
  var qByView   = Object.create(null);   // viewKey → lowercased query
  var _debounce = Object.create(null);

  function getRaw(v) { return rawByView[v] || ''; }
  function getQ(v)   { return qByView[v] || ''; }
  function setQuery(v, raw) {
    raw = raw || '';
    var q = raw.trim().toLowerCase();
    if (q) { rawByView[v] = raw; qByView[v] = q; }
    else   { delete rawByView[v]; delete qByView[v]; }
  }

  function stripHtml(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ' '); }

  // Build one lowercased searchable string for a record from its key fields
  // (identity + connections + notes). Connection fields contribute every
  // connected identifier; plain fields contribute their text.
  function searchTextFor(rec, F) {
    var parts = [];
    function add(key) {
      if (!key) return;
      var raw = rec[key + '_raw'];
      if (Array.isArray(raw)) {
        for (var i = 0; i < raw.length; i++) {
          if (raw[i]) parts.push(stripHtml(raw[i].identifier != null ? raw[i].identifier : raw[i].id));
        }
      } else {
        var v = rec[key];
        if (v != null && typeof v !== 'object') parts.push(stripHtml(v));
      }
    }
    add(F.displayLabel); add(F.labelAlt); add(F.productName); add(F.product);
    add(F.dropPrefix); add(F.dropNumber); add(F.mdfIdf);
    add(F.connectedDevices); add(F.connectedDevice);
    add(F.scwNotes); add(F.surveyNotes); add(F.laborDesc);
    add(F.bid); add(F.mounting);
    return parts.join(' ').toLowerCase();
  }

  /** Public: narrow a records array by the active query. Called by render.js
   *  after the SOW filter. No query → returns the array unchanged. */
  function filterRecords(viewKey, records) {
    var q = getQ(viewKey);
    if (!q) return records;
    var F = (ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(viewKey)) || {};
    var tokens = q.split(/\s+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var txt = searchTextFor(records[i], F);
      var ok = true;
      for (var t = 0; t < tokens.length; t++) {
        if (txt.indexOf(tokens[t]) === -1) { ok = false; break; }
      }
      if (ok) out.push(records[i]);
    }
    return out;
  }

  function visibleCount(viewKey) {
    var all = (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(viewKey) : [];
    if (ns.sowFilter && typeof ns.sowFilter.filterRecords === 'function') {
      all = ns.sowFilter.filterRecords(viewKey, all);
    }
    return filterRecords(viewKey, all).length;
  }

  function updateMeta(viewKey, container) {
    var bar = container.querySelector(':scope > .scw-ws-v2-search');
    if (!bar) return;
    var q = getQ(viewKey);
    var clear = bar.querySelector('.scw-ws-v2-search-clear');
    if (clear) clear.style.display = q ? '' : 'none';
    var meta = bar.querySelector('.scw-ws-v2-search-count');
    if (!meta) return;
    if (!q) { meta.textContent = ''; return; }
    var n = visibleCount(viewKey);
    meta.textContent = n + ' match' + (n === 1 ? '' : 'es');
  }

  function rerender(viewKey) {
    if (ns.data && ns.render) ns.render.renderView(viewKey, ns.data.readRecords(viewKey));
  }

  function onInput(viewKey, container, value) {
    setQuery(viewKey, value);
    container.classList.toggle('scw-ws-v2-search-active', !!getQ(viewKey));
    clearTimeout(_debounce[viewKey]);
    _debounce[viewKey] = setTimeout(function () {
      rerender(viewKey);
      updateMeta(viewKey, container);
    }, 160);
  }

  function searchIcon() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.scw-ws-v2-search { display: flex; align-items: center; gap: 8px;',
      '  padding: 8px 12px 4px; }',
      '.scw-ws-v2-search-ic { color: #94a3b8; display: flex; flex: 0 0 auto;',
      '  position: absolute; margin-left: 11px; pointer-events: none; }',
      '.scw-ws-v2-search-field { position: relative; flex: 1 1 auto; display: flex; align-items: center; }',
      '.scw-ws-v2-search-input { width: 100%; box-sizing: border-box;',
      '  border: 1px solid #cbd5e1; border-radius: 8px; background: #fff;',
      '  padding: 8px 34px 8px 36px;',
      '  font: 14px/1.3 system-ui, -apple-system, sans-serif; color: #0f172a; }',
      '.scw-ws-v2-search-input::placeholder { color: #94a3b8; }',
      '.scw-ws-v2-search-input:focus { outline: none; border-color: #93c5fd;',
      '  box-shadow: 0 0 0 3px rgba(147,197,253,.25); }',
      '.scw-ws-v2-search-clear { position: absolute; right: 8px; top: 50%;',
      '  transform: translateY(-50%); border: none; background: #e2e8f0; color: #475569;',
      '  width: 18px; height: 18px; border-radius: 50%; cursor: pointer;',
      '  font: 700 13px/1 system-ui, sans-serif; display: flex; align-items: center;',
      '  justify-content: center; padding: 0; }',
      '.scw-ws-v2-search-clear:hover { background: #cbd5e1; color: #1f2937; }',
      '.scw-ws-v2-search-count { flex: 0 0 auto; white-space: nowrap;',
      '  font: 600 12px/1 system-ui, sans-serif; color: #64748b; min-width: 60px; text-align: right; }',
      /* While searching, force every MDF/IDF group open so matches inside a
         collapsed group are visible. */
      '.scw-ws-v2-search-active .scw-ws-v2-l1-body { display: block !important; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  /** Mount the search box once, above the list. Idempotent — on re-mount it
   *  only restores the input value (when not focused) so a re-render can't
   *  clobber what the user is typing. */
  function mount(viewKey) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    injectStyles();
    container.classList.toggle('scw-ws-v2-search-active', !!getQ(viewKey));

    var bar = container.querySelector(':scope > .scw-ws-v2-search');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'scw-ws-v2-search';
      bar.innerHTML =
        '<div class="scw-ws-v2-search-field">' +
          '<span class="scw-ws-v2-search-ic">' + searchIcon() + '</span>' +
          '<input type="text" class="scw-ws-v2-search-input" autocomplete="off" ' +
            'spellcheck="false" aria-label="Search line items" ' +
            'placeholder="Search line items — product, label, MDF/IDF, notes…">' +
          '<button type="button" class="scw-ws-v2-search-clear" title="Clear search" ' +
            'aria-label="Clear search" style="display:none">&times;</button>' +
        '</div>' +
        '<span class="scw-ws-v2-search-count" aria-live="polite"></span>';
      // Above the SOW/Bid pills (or the body if there are none).
      var anchor = container.querySelector(':scope > .scw-ws-v2-sow-pills') ||
                   container.querySelector(':scope > .scw-ws-v2-body');
      container.insertBefore(bar, anchor || null);

      var input = bar.querySelector('.scw-ws-v2-search-input');
      input.value = getRaw(viewKey);
      input.addEventListener('input', function () { onInput(viewKey, container, input.value); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.keyCode === 27) { input.value = ''; onInput(viewKey, container, ''); }
      });
      bar.querySelector('.scw-ws-v2-search-clear').addEventListener('click', function () {
        input.value = ''; onInput(viewKey, container, ''); input.focus();
      });
    } else {
      var input2 = bar.querySelector('.scw-ws-v2-search-input');
      if (input2 && document.activeElement !== input2) input2.value = getRaw(viewKey);
    }
    updateMeta(viewKey, container);
  }

  ns.search = { mount: mount, filterRecords: filterRecords };
})();
/*** END WORKSHEET V2 — SEARCH BOX ******************************************/
