/*** SOW ITEM TRAY — bid review page (scene_1155) *****************************
 *
 * A collapsed drawer at the foot of every SOW section listing the project's
 * line items that are NOT on that SOW, so a reviewer can pull one in without
 * leaving the comparison grid.
 *
 * WHY A TRAY AND NOT MORE GRID ROWS:
 *   The grid is a comparison surface — SOW vs bid, for the items on THIS SOW.
 *   Items belonging to other SOWs are shopping, not comparison, and mixing
 *   them into the same rows is what made "On these bids — belong to another
 *   SOW" read as a contradiction. The tray is deliberately separated, sits
 *   below the table, and is collapsed until asked for.
 *
 * GROUPING (the order the user asked for):
 *   1. "Not on any SOW"   — line items with no field_2154 connection at all.
 *   2. "On SOW <name>"    — one group per other SOW, natural-sorted by name.
 *   Items inside a group use the canonical worksheet order (field_2218 asc,
 *   then natural label) via worksheet-v2's exported comparator, so the tray
 *   reads in the same sequence as every other record list in the app.
 *
 * COLLAPSE: the tray itself starts closed. Inside, a group starts closed too
 *   UNLESS it holds an item that is already on this section's bid — those are
 *   the ones a reviewer is most likely acting on, so they open on sight while
 *   everything else stays out of the way. Both states persist per SOW.
 *
 * ADDING: field_2154 is a MULTI connection, so "add to this SOW" is a union,
 *   never a replace — the item keeps every SOW it was already on and gains
 *   this one. That is the same sharing the margin cascade warns about, so the
 *   button says so before it writes.
 *
 * Reads : SCW.bidReviewV2.data (view_3921 model)
 * Writes: field_2154 PUT through view_3921 (cell-editable on this scene)
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var CFG = {
    sceneKey:     'scene_1155',
    itemsViewKey: 'view_3921',
    sowConnField: 'field_2154',
    labelField:   'field_1950',
    productField: 'field_1949',
    qtyField:     'field_1964',
    feeField:     'field_2151',
    eventNs:      '.scwSowTray',
    cssId:        'scw-sow-tray-css'
  };

  var P = 'scw-sow-tray';
  var LS = 'scw:sow-tray:';

  // ── State ───────────────────────────────────────────────────────────────

  function sceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function readFlag(key, dflt) {
    try {
      var v = localStorage.getItem(LS + sceneId() + ':' + key);
      return v == null ? dflt : v === '1';
    } catch (e) { return dflt; }
  }
  function writeFlag(key, on) {
    try { localStorage.setItem(LS + sceneId() + ':' + key, on ? '1' : '0'); }
    catch (e) { /* ignore */ }
  }

  // ── Data ────────────────────────────────────────────────────────────────

  function records() {
    try {
      var d = window.SCW && SCW.bidReviewV2 && SCW.bidReviewV2.data;
      if (d && typeof d.readRecords === 'function') {
        return d.readRecords(CFG.itemsViewKey) || [];
      }
    } catch (e) { /* fall through */ }
    return [];
  }

  function sowsOf(rec) {
    var raw = rec && rec[CFG.sowConnField + '_raw'];
    if (Array.isArray(raw)) return raw;
    if (raw && raw.id) return [raw];
    return [];
  }

  function plain(rec, key) {
    if (!rec) return '';
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw)) return raw.length && raw[0] ? String(raw[0].identifier || '') : '';
    if (raw && typeof raw === 'object') return String(raw.identifier || '');
    var v = (raw != null && raw !== '') ? raw : rec[key];
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }

  function itemLabel(rec) {
    var lbl  = plain(rec, CFG.labelField);
    var prod = plain(rec, CFG.productField);
    if (lbl && prod && prod !== lbl) return lbl + ' · ' + prod;
    return lbl || prod || (rec && rec.id) || 'Line item';
  }

  function money(rec) {
    var v = plain(rec, CFG.feeField);
    return v || '';
  }

  /** Canonical comparator — reuse worksheet-v2's so this list matches the
   *  worksheet order (CLAUDE.md picker rule). Label-sort if it isn't loaded. */
  function itemCmp() {
    var pk = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.picker;
    if (pk && typeof pk.canonicalItemSort === 'function') {
      return pk.canonicalItemSort(itemLabel);
    }
    return function (a, b) {
      return String(itemLabel(a)).localeCompare(String(itemLabel(b)),
        undefined, { numeric: true, sensitivity: 'base' });
    };
  }

  /** Every project line item NOT on this SOW, bucketed the way the tray
   *  renders them: no-SOW first, then one group per other-SOW combination. */
  function buildGroups(sowId, section) {
    var recs = records();
    var noSow = [], bySow = Object.create(null), order = [];

    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (!rec || !rec.id) continue;
      var sows = sowsOf(rec);
      var onThis = false, names = [];
      for (var s = 0; s < sows.length; s++) {
        if (!sows[s] || !sows[s].id) continue;
        if (sows[s].id === sowId) { onThis = true; break; }
        names.push(String(sows[s].identifier || sows[s].id).trim());
      }
      if (onThis) continue;                    // already here — not tray material

      if (!names.length) { noSow.push(rec); continue; }
      names.sort();
      var key = names.join(', ');
      if (!bySow[key]) { bySow[key] = { key: key, label: 'On SOW ' + key, items: [] }; order.push(key); }
      bySow[key].items.push(rec);
    }

    var cmp = itemCmp();
    var groups = [];
    if (noSow.length) {
      noSow.sort(cmp);
      groups.push({ key: '__none__', label: 'Not on any SOW', items: noSow });
    }
    order.sort(function (a, b) {
      return String(a).localeCompare(String(b), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    for (var o = 0; o < order.length; o++) {
      var g = bySow[order[o]];
      g.items.sort(cmp);
      groups.push(g);
    }

    // "On this bid" = the item already renders somewhere in this section (as
    // an off-SOW / other-SOW row), which only happens when a bid carries it.
    for (var gi = 0; gi < groups.length; gi++) {
      var grp = groups[gi];
      grp.onBid = 0;
      for (var it = 0; it < grp.items.length; it++) {
        var rid = grp.items[it].id;
        var hit = section && section.querySelector('[data-sow-item-id="' + rid + '"]');
        grp.items[it]._onBid = !!hit;
        if (hit) grp.onBid++;
      }
    }
    return groups;
  }

  // ── Write ───────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;',
               '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, type) {
    try {
      var br = window.SCW && SCW.bidReview;
      if (br && typeof br.renderToast === 'function') { br.renderToast(msg, type); return; }
    } catch (e) { /* fall through */ }
    if (type === 'error') console.warn('[scw-sow-tray] ' + msg);
  }

  /** UNION, never replace: field_2154 is a multi-connection and the item's
   *  existing SOWs must survive, or adding it here silently removes it from
   *  the SOW it came from. */
  function addToSow(recordId, sowId, btn) {
    var recs = records(), rec = null;
    for (var i = 0; i < recs.length; i++) {
      if (recs[i] && recs[i].id === recordId) { rec = recs[i]; break; }
    }
    if (!rec) { toast('That line item is no longer loaded — refresh and retry', 'error'); return; }

    var ids = [], sows = sowsOf(rec);
    for (var s = 0; s < sows.length; s++) {
      if (sows[s] && sows[s].id) ids.push(sows[s].id);
    }
    if (ids.indexOf(sowId) !== -1) return;    // already there
    ids.push(sowId);

    var body = {};
    body[CFG.sowConnField] = ids;

    btn.disabled = true;
    btn.textContent = 'Adding…';
    var restore = btn.getAttribute('data-label') || '+ Add to this SOW';

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(CFG.itemsViewKey, recordId),
      type: 'PUT',
      data: JSON.stringify(body),
      success: function () {
        btn.textContent = 'Added ✓';
        toast('Added to this SOW — it is now on ' + ids.length + ' SOW' +
              (ids.length === 1 ? '' : 's'), 'success');
        try {
          var d = window.SCW && SCW.bidReviewV2 && SCW.bidReviewV2.data;
          if (d && typeof d.refetchAll === 'function') setTimeout(d.refetchAll, 600);
        } catch (e) { /* next render picks it up */ }
      },
      error: function (xhr) {
        console.warn('[scw-sow-tray] add to SOW failed', xhr && xhr.status);
        btn.textContent = 'Failed';
        toast('Could not add that line item — please try again', 'error');
        setTimeout(function () { btn.textContent = restore; btn.disabled = false; }, 2500);
      }
    });
  }

  // ── Styles ──────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(CFG.cssId)) return;
    var css = [
      // Separated from the grid on purpose: its own inset card, muted ground,
      // a rule above it. It must never read as another band of the table.
      '.' + P + ' {',
      '  margin: 14px 0 4px; border: 1px solid #e2e8f0; border-radius: 10px;',
      '  background: #f8fafc; overflow: hidden;',
      '  font: 12.5px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;',
      '}',
      '.' + P + '-head {',
      '  display: flex; align-items: center; gap: 9px; width: 100%;',
      '  padding: 10px 14px; cursor: pointer; border: 0; background: transparent;',
      '  text-align: left; color: #334155;',
      '}',
      '.' + P + '-head:hover { background: #f1f5f9; }',
      '.' + P + '-chev { display: inline-flex; transition: transform 120ms ease; color: #64748b; }',
      '.' + P + '--open > .' + P + '-head .' + P + '-chev { transform: rotate(180deg); }',
      '.' + P + '-title { font: 700 12.5px/1.2 system-ui, sans-serif; color: #0f172a; }',
      '.' + P + '-count {',
      '  display: inline-flex; align-items: center; padding: 1px 8px;',
      '  border-radius: 999px; background: #e2e8f0; color: #475569;',
      '  font: 700 11px/1.5 system-ui, sans-serif;',
      '}',
      '.' + P + '-hint { color: #64748b; margin-left: auto; font-size: 11.5px; }',
      '.' + P + '-body { display: none; padding: 0 10px 10px; }',
      '.' + P + '--open > .' + P + '-body { display: block; }',
      // Groups
      '.' + P + '-grp { border: 1px solid #e2e8f0; border-radius: 8px;',
      '  background: #fff; margin-top: 8px; overflow: hidden; }',
      '.' + P + '-ghead {',
      '  display: flex; align-items: center; gap: 8px; width: 100%;',
      '  padding: 7px 11px; cursor: pointer; border: 0; background: #fff;',
      '  text-align: left;',
      '}',
      '.' + P + '-ghead:hover { background: #f8fafc; }',
      '.' + P + '-gchev { display: inline-flex; transition: transform 120ms ease; color: #94a3b8; }',
      '.' + P + '-grp--open .' + P + '-gchev { transform: rotate(180deg); }',
      '.' + P + '-glabel { font: 700 12px/1.2 system-ui, sans-serif; color: #0f4c75; }',
      '.' + P + '-gcount { color: #64748b; font-size: 11.5px; }',
      '.' + P + '-gbid {',
      '  margin-left: auto; display: inline-flex; align-items: center;',
      '  padding: 1px 8px; border-radius: 999px;',
      '  background: #e0e7ff; border: 1px solid #c7d2fe; color: #4338ca;',
      '  font: 700 10.5px/1.5 system-ui, sans-serif;',
      '}',
      '.' + P + '-glist { display: none; border-top: 1px solid #eef2f7; }',
      '.' + P + '-grp--open .' + P + '-glist { display: block; }',
      // Rows
      '.' + P + '-item {',
      '  display: flex; align-items: center; gap: 10px;',
      '  padding: 6px 11px; border-top: 1px solid #f1f5f9;',
      '}',
      '.' + P + '-item:first-child { border-top: 0; }',
      '.' + P + '-item:hover { background: #f8fafc; }',
      '.' + P + '-il { flex: 1 1 auto; min-width: 0; color: #0f172a;',
      '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.' + P + '-ibid {',
      '  flex: 0 0 auto; padding: 1px 7px; border-radius: 999px;',
      '  background: #e0e7ff; border: 1px solid #c7d2fe; color: #4338ca;',
      '  font: 700 10px/1.5 system-ui, sans-serif;',
      '}',
      '.' + P + '-ifee { flex: 0 0 auto; color: #475569; font-weight: 600;',
      '  font-size: 11.5px; white-space: nowrap; }',
      '.' + P + '-add {',
      '  flex: 0 0 auto; padding: 3px 10px; border-radius: 5px;',
      '  border: 1px solid #cbd5e1; background: #fff; color: #0f4c75;',
      '  cursor: pointer; font: 600 11.5px/1.3 system-ui, sans-serif;',
      '  white-space: nowrap;',
      '}',
      '.' + P + '-add:hover { background: #eff6ff; border-color: #93c5fd; }',
      '.' + P + '-add:disabled { opacity: .55; cursor: not-allowed; }',
      '.' + P + '-empty { padding: 10px 12px; color: #64748b; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = CFG.cssId;
    s.textContent = css;
    document.head.appendChild(s);
  }

  var CHEV = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  // ── Render ──────────────────────────────────────────────────────────────

  function groupHtml(sowId, grp) {
    // Closed unless it holds something already on this section's bid.
    var openKey = sowId + ':g:' + grp.key;
    var open = readFlag(openKey, grp.onBid > 0);

    var rows = '';
    for (var i = 0; i < grp.items.length; i++) {
      var rec = grp.items[i];
      var fee = money(rec);
      rows += '<div class="' + P + '-item">' +
        '<span class="' + P + '-il" title="' + esc(itemLabel(rec)) + '">' +
          esc(itemLabel(rec)) + '</span>' +
        (rec._onBid ? '<span class="' + P + '-ibid">on this bid</span>' : '') +
        (fee ? '<span class="' + P + '-ifee">' + esc(fee) + '</span>' : '') +
        '<button type="button" class="' + P + '-add" data-scw-tray-add="' +
          esc(rec.id) + '" data-sow-id="' + esc(sowId) + '" ' +
          'data-label="+ Add to this SOW" ' +
          'title="Connect this line item to this SOW as well — it stays on ' +
          'the SOW(s) it is already on">+ Add to this SOW</button>' +
      '</div>';
    }

    return '<div class="' + P + '-grp' + (open ? ' ' + P + '-grp--open' : '') +
        '" data-scw-tray-grp="' + esc(openKey) + '">' +
      '<button type="button" class="' + P + '-ghead" data-scw-tray-gtoggle>' +
        '<span class="' + P + '-gchev">' + CHEV + '</span>' +
        '<span class="' + P + '-glabel">' + esc(grp.label) + '</span>' +
        '<span class="' + P + '-gcount">' + grp.items.length + ' item' +
          (grp.items.length === 1 ? '' : 's') + '</span>' +
        (grp.onBid ? '<span class="' + P + '-gbid">' + grp.onBid +
          ' on this bid</span>' : '') +
      '</button>' +
      '<div class="' + P + '-glist">' + rows + '</div>' +
    '</div>';
  }

  function trayHtml(sowId, groups) {
    var total = 0, onBid = 0;
    for (var i = 0; i < groups.length; i++) {
      total += groups[i].items.length;
      onBid += groups[i].onBid;
    }
    if (!total) return '';

    var open = readFlag(sowId + ':tray', false);
    var body = '';
    for (var g = 0; g < groups.length; g++) body += groupHtml(sowId, groups[g]);

    return '<div class="' + P + (open ? ' ' + P + '--open' : '') +
        '" data-scw-tray="' + esc(sowId) + '">' +
      '<button type="button" class="' + P + '-head" data-scw-tray-toggle>' +
        '<span class="' + P + '-chev">' + CHEV + '</span>' +
        '<span class="' + P + '-title">Items not on this SOW</span>' +
        '<span class="' + P + '-count">' + total + '</span>' +
        (onBid ? '<span class="' + P + '-gbid">' + onBid + ' on this bid</span>' : '') +
        '<span class="' + P + '-hint">add any of them to this SOW</span>' +
      '</button>' +
      '<div class="' + P + '-body">' + body + '</div>' +
    '</div>';
  }

  function mount() {
    var sections = document.querySelectorAll('.scw-bid-review-v2__sow[data-sow-id]');
    if (!sections.length) return;
    injectStyles();

    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var sowId = sec.getAttribute('data-sow-id');
      // The synthetic "no matching SOW" grid has no SOW to add to.
      if (!sowId || sowId.charAt(0) === '_') continue;

      var prior = sec.querySelector(':scope > [data-scw-tray]');
      var html = trayHtml(sowId, buildGroups(sowId, sec));
      if (!html) {
        if (prior && prior.parentNode) prior.parentNode.removeChild(prior);
        continue;
      }
      var holder = document.createElement('div');
      holder.innerHTML = html;
      var fresh = holder.firstChild;

      if (!prior) sec.appendChild(fresh);
      else if (prior.innerHTML !== fresh.innerHTML) {
        prior.parentNode.replaceChild(fresh, prior);
      }
    }
  }

  // ── Bindings ────────────────────────────────────────────────────────────

  if (!document.documentElement.hasAttribute('data-scw-sow-tray-bound')) {
    document.documentElement.setAttribute('data-scw-sow-tray-bound', '1');

    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;

      var add = e.target.closest('[data-scw-tray-add]');
      if (add) {
        e.preventDefault(); e.stopPropagation();
        if (add.disabled) return;
        addToSow(add.getAttribute('data-scw-tray-add'),
                 add.getAttribute('data-sow-id'), add);
        return;
      }

      var gt = e.target.closest('[data-scw-tray-gtoggle]');
      if (gt) {
        e.preventDefault(); e.stopPropagation();
        var grp = gt.closest('[data-scw-tray-grp]');
        if (!grp) return;
        var on = !grp.classList.contains(P + '-grp--open');
        grp.classList.toggle(P + '-grp--open', on);
        writeFlag(grp.getAttribute('data-scw-tray-grp'), on);
        return;
      }

      var tt = e.target.closest('[data-scw-tray-toggle]');
      if (tt) {
        e.preventDefault(); e.stopPropagation();
        var tray = tt.closest('[data-scw-tray]');
        if (!tray) return;
        var openNow = !tray.classList.contains(P + '--open');
        tray.classList.toggle(P + '--open', openNow);
        writeFlag(tray.getAttribute('data-scw-tray') + ':tray', openNow);
      }
    });
  }

  var _t = null, _suppress = false, _obs = null;
  function mountSoon() {
    if (_t) clearTimeout(_t);
    _t = setTimeout(function () {
      _suppress = true;
      try { mount(); } finally { setTimeout(function () { _suppress = false; }, 0); }
    }, 140);
  }

  /** The v2 grid rebuilds its body wholesale on each data tick and emits no
   *  "rendered" event, so an observer is the only reliable after-render hook
   *  (same pattern as sales-revision-column.js / sow-margin-cascade.js). */
  function observe() {
    if (_obs) return;
    var el = document.getElementById(
      (SCW.bidReviewV2 && SCW.bidReviewV2.CONFIG && SCW.bidReviewV2.CONFIG.mountId) ||
      'scw-bid-review-v2');
    if (!el) return;
    _obs = new MutationObserver(function () {
      if (_suppress) return;
      mountSoon();
    });
    _obs.observe(el, { childList: true, subtree: true });
  }

  function boot() { mountSoon(); observe(); }

  SCW.onSceneRender(CFG.sceneKey, boot, CFG.eventNs);
  SCW.onViewRender(CFG.itemsViewKey, boot, CFG.eventNs);

  SCW.sowItemTray = { mount: mount, buildGroups: buildGroups, CONFIG: CFG };
})();
/*** END SOW ITEM TRAY *******************************************************/
