/*** WORKSHEET V2 — DISCONTINUED PRODUCTS BAR ********************************
 *
 * A full-width warning bar under the worksheet banner whenever any rendered
 * line item carries a product the catalog no longer offers (card.js
 * isDiscontinued → product-catalog.js, 2026-10-13). The ⊘ badge on a product
 * cell is easy to miss in a long grid; this names every such product with
 * its count. A click on a product highlights its cards and scrolls to the
 * first (the scope-tile gesture, same card class); a second click clears.
 *
 *   ns.discontinuedBar.collect(records, viewKey) → [{ name, ids }]
 *   ns.discontinuedBar.mount(viewKey, records)   — idempotent; removes the
 *                                                  bar when the scope is clean
 *
 * init.js mounts it after every render over the filtered (visible) records.
 ****************************************************************************/
(function () {
  'use strict';
  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var CLS = 'scw-ws-v2-discontinued-bar';
  var HL  = 'scw-ws-v2-card--scope-hl';
  var STYLE_ID = CLS + '-css';
  var SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function productKey(viewKey) {
    try {
      var f = ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(viewKey);
      return (f && f.product) || 'field_1949';
    } catch (e) { return 'field_1949'; }
  }
  function productLabel(rec, key) {
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw)) raw = raw[0];
    var s = (raw && raw.identifier) ? String(raw.identifier) : String(rec[key] == null ? '' : rec[key]);
    return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || 'Unnamed product';
  }

  /** [{ name, ids }] of the discontinued line items among `records`, by product name. */
  function collect(records, viewKey) {
    var out = [], byName = Object.create(null);
    if (!records || !ns.card || typeof ns.card.isDiscontinued !== 'function') return out;
    var key = productKey(viewKey);
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec || !rec.id) continue;
      var d = false;
      try { d = !!ns.card.isDiscontinued(rec, viewKey); } catch (e) { d = false; }
      if (!d) continue;
      var name = productLabel(rec, key);
      var e = byName[name];
      if (!e) { e = byName[name] = { name: name, ids: [] }; out.push(e); }
      e.ids.push(rec.id);
    }
    out.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }); });
    return out;
  }

  function html(list) {
    var n = 0;
    for (var i = 0; i < list.length; i++) n += list[i].ids.length;
    var h = '<span class="' + CLS + '-icon">' + SVG + '</span>' +
      '<span class="' + CLS + '-text"><b>' + n + ' discontinued product' + (n === 1 ? '' : 's') +
      '</b> on this scope — replace ' + (n === 1 ? 'it' : 'them') + ' before it goes out:</span>';
    for (var j = 0; j < list.length; j++) {
      var c = list[j].ids.length;
      h += '<button type="button" class="' + CLS + '-chip" aria-pressed="false" ' +
        'data-scw-ws-v2-disc-ids="' + esc(list[j].ids.join(',')) + '" ' +
        'title="Highlight ' + (c === 1 ? 'this line item' : 'these ' + c + ' line items') + '">' +
        esc(list[j].name) + (c > 1 ? '<span class="' + CLS + '-n">×' + c + '</span>' : '') + '</button>';
    }
    return h;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.' + CLS + ' { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; padding: 9px 14px;',
      '  background: #fffbeb; border-top: 1px solid #fcd34d; border-bottom: 1px solid #fcd34d; box-shadow: inset 4px 0 0 #b45309;',
      '  color: #78350f; font: 500 13px/1.35 system-ui, -apple-system, sans-serif; }',
      '.' + CLS + '-icon { display: inline-flex; color: #b45309; }',
      '.' + CLS + '-text b { font-weight: 800; color: #7c2d12; }',
      '.' + CLS + '-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid #f59e0b;',
      '  border-radius: 999px; background: #fff; color: #7c2d12; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }',
      '.' + CLS + '-chip:hover { background: #fef3c7; }',
      '.' + CLS + '-chip.is-on { background: #b45309; border-color: #b45309; color: #fff; }',
      '.' + CLS + '-n { font-weight: 800; opacity: .8; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function clearHighlight(container) {
    var lit = container.querySelectorAll('.' + HL);
    for (var c = 0; c < lit.length; c++) lit[c].classList.remove(HL);
    var on = container.querySelectorAll('.' + CLS + '-chip.is-on');
    for (var o = 0; o < on.length; o++) { on[o].classList.remove('is-on'); on[o].setAttribute('aria-pressed', 'false'); }
  }
  function onClick(e) {
    var chip = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-disc-ids]');
    if (!chip) return;
    var container = chip.closest('[id^="scw-ws-v2-"]');
    if (!container) return;
    e.preventDefault();
    var wasOn = chip.classList.contains('is-on');
    clearHighlight(container);
    if (wasOn) return;
    chip.classList.add('is-on');
    chip.setAttribute('aria-pressed', 'true');
    var ids = (chip.getAttribute('data-scw-ws-v2-disc-ids') || '').split(',');
    var first = null;
    for (var i = 0; i < ids.length; i++) {
      if (!ids[i]) continue;
      var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record="' + ids[i] + '"]');
      for (var k = 0; k < cards.length; k++) { cards[k].classList.add(HL); if (!first) first = cards[k]; }
    }
    if (first && typeof first.scrollIntoView === 'function') {
      try { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) { /* ignore */ }
    }
  }

  /** Mount / refresh / remove the bar for a view (idempotent). */
  function mount(viewKey, records) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    var list = collect(records, viewKey);
    var bar = container.querySelector(':scope > .' + CLS);
    if (!list.length) {
      if (bar) { clearHighlight(container); bar.parentNode.removeChild(bar); }
      return;
    }
    injectStyles();
    var h = html(list);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = CLS;
      bar.setAttribute('role', 'alert');
      var banner  = container.querySelector(':scope > .scw-ws-v2-banner');
      var toolbar = container.querySelector(':scope > .scw-ws-v2-toolbar');
      if (banner) container.insertBefore(bar, banner.nextSibling);
      else if (toolbar) container.insertBefore(bar, toolbar.nextSibling);
      else container.insertBefore(bar, container.firstChild);
      bar.addEventListener('click', onClick);
    }
    if (bar.getAttribute('data-scw-sig') !== h) { bar.innerHTML = h; bar.setAttribute('data-scw-sig', h); }
  }

  ns.discontinuedBar = { collect: collect, mount: mount };
})();
/*** END WORKSHEET V2 — DISCONTINUED PRODUCTS BAR ****************************/
