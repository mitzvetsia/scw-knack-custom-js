/*** WORKSHEET V2 — DISCONTINUED PRODUCTS BAR ********************************
 *
 * A full-width warning bar under the worksheet banner whenever any rendered
 * line item carries a product the catalog no longer offers (card.js
 * isDiscontinued → product-catalog.js, 2026-10-13). The ⊘ badge on a product
 * cell is easy to miss in a long grid; this names every such product with
 * its count. A click on a product highlights its cards and scrolls to the
 * first (the scope-tile gesture, same card class); a second click clears.
 *
 * Accessories (2026-11-12 — "clicking on the pill with the item that is
 * discontinued is not doing anything … the discontinued items are CHILD
 * items"): an accessory folded under its parent has NO card of its own, only
 * a chip in the parent's Mounting Hardware line, so the click found nothing to
 * light. Each discontinued line now carries its parent (the view's `parent`
 * key, field_2464 on the SOW object); a click on a line with no card lights
 * the PARENT card and the accessory's chip (data-scw-ws-v2-acc-chip), opens
 * the parent's detail, and scrolls to the chip. Every hit also opens a closed
 * MDF/IDF group first (summary.revealCard — the scope tiles' rule), which the
 * bar never did for top-level cards either.
 *
 *   ns.discontinuedBar.collect(records, viewKey) → [{ name, ids, parents }]
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
  var CHIP_HL = 'scw-ws-v2-mh-chip-wrap--hl';
  var STYLE_ID = CLS + '-css';
  var SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function fieldsOf(viewKey) {
    try {
      return (ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(viewKey)) || {};
    } catch (e) { return {}; }
  }
  function productKey(viewKey) { return fieldsOf(viewKey).product || 'field_1949'; }
  function parentKey(viewKey) { return fieldsOf(viewKey).parent || 'field_2464'; }
  function productLabel(rec, key) {
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw)) raw = raw[0];
    var s = (raw && raw.identifier) ? String(raw.identifier) : String(rec[key] == null ? '' : rec[key]);
    return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || 'Unnamed product';
  }
  function parentOf(rec, key) {
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw)) raw = raw[0];
    return (raw && raw.id) ? String(raw.id) : '';
  }

  /** [{ name, ids, parents }] of the discontinued line items among `records`, by product
   *  name. parents[i] = the parent line item of ids[i] ('' for a top-level line). */
  function collect(records, viewKey) {
    var out = [], byName = Object.create(null);
    if (!records || !ns.card || typeof ns.card.isDiscontinued !== 'function') return out;
    var key = productKey(viewKey), pkey = parentKey(viewKey);
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec || !rec.id) continue;
      var d = false;
      try { d = !!ns.card.isDiscontinued(rec, viewKey); } catch (e) { d = false; }
      if (!d) continue;
      var name = productLabel(rec, key);
      var e = byName[name];
      if (!e) { e = byName[name] = { name: name, ids: [], parents: [] }; out.push(e); }
      e.ids.push(rec.id);
      e.parents.push(parentOf(rec, pkey));
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
      var acc = 0;
      for (var p = 0; p < list[j].parents.length; p++) if (list[j].parents[p]) acc++;
      h += '<button type="button" class="' + CLS + '-chip" aria-pressed="false" ' +
        'data-scw-ws-v2-disc-ids="' + esc(list[j].ids.join(',')) + '" ' +
        'data-scw-ws-v2-disc-parents="' + esc(list[j].parents.join(',')) + '" ' +
        'title="Highlight ' + (c === 1 ? 'this line item' : 'these ' + c + ' line items') +
        (acc ? (acc === c ? ' (an accessory: shown under ' + (c === 1 ? 'its device' : 'their devices') + ')'
                          : ' (' + acc + ' under ' + (acc === 1 ? 'its device' : 'their devices') + ')') : '') + '">' +
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
      '.' + CLS + '-n { font-weight: 800; opacity: .8; }',
      '.' + CHIP_HL + ' { outline: 2px solid #b45309 !important; outline-offset: 1px !important; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function clearHighlight(container) {
    var lit = container.querySelectorAll('.' + HL + ', .' + CHIP_HL);
    for (var c = 0; c < lit.length; c++) lit[c].classList.remove(HL, CHIP_HL);
    var on = container.querySelectorAll('.' + CLS + '-chip.is-on');
    for (var o = 0; o < on.length; o++) { on[o].classList.remove('is-on'); on[o].setAttribute('aria-pressed', 'false'); }
  }
  function cardsFor(container, id) {
    return container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record="' + id + '"]');
  }
  /** Open a card's detail panel (where the Mounting Hardware chips live). The card's
   *  own expand button, so the open state persists the way a click would. */
  function openDetail(card) {
    if (!card || card.classList.contains('scw-ws-v2-card--open')) return;
    var id = card.getAttribute('data-scw-ws-v2-record');
    var btn = id && card.querySelector('[data-scw-ws-v2-expand="' + id + '"]');
    if (btn) btn.click();
    if (!card.classList.contains('scw-ws-v2-card--open')) card.classList.add('scw-ws-v2-card--open');
  }

  /** Light every target; open a closed group first (it can re-render the cards, so
   *  query again after it), then scroll to the first hit. */
  function apply(container, ids, parents, attempt) {
    var first = null, firstCard = null;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id) continue;
      var cards = cardsFor(container, id);
      if (cards.length) {
        for (var k = 0; k < cards.length; k++) {
          cards[k].classList.add(HL);
          if (!first) { first = cards[k]; firstCard = cards[k]; }
        }
        continue;
      }
      // A folded accessory: its chip on the parent card, else the parent card itself.
      var chip = container.querySelector('[data-scw-ws-v2-acc-chip="' + id + '"]');
      var pcard = chip ? chip.closest('.scw-ws-v2-card') : null;
      if (!pcard && parents[i]) pcard = cardsFor(container, parents[i])[0] || null;
      if (!pcard) continue;
      pcard.classList.add(HL);
      if (chip) chip.classList.add(CHIP_HL);
      if (!first) { first = chip || pcard; firstCard = pcard; }
    }
    if (!first) return;
    if (attempt < 3 && ns.summary && typeof ns.summary.revealCard === 'function' &&
        ns.summary.revealCard(firstCard)) {
      setTimeout(function () { apply(container, ids, parents, attempt + 1); }, 60);
      return;
    }
    if (first !== firstCard) openDetail(firstCard);
    if (typeof first.scrollIntoView === 'function') {
      try { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (err) { /* ignore */ }
    }
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
    // A deliberate jump: the scroll guard must not chase it back.
    try { if (window.SCW.v2ScrollAnchor && window.SCW.v2ScrollAnchor.cancel) window.SCW.v2ScrollAnchor.cancel(); } catch (err) { /* ignore */ }
    var ids = (chip.getAttribute('data-scw-ws-v2-disc-ids') || '').split(',');
    var parents = (chip.getAttribute('data-scw-ws-v2-disc-parents') || '').split(',');
    apply(container, ids, parents, 0);
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
