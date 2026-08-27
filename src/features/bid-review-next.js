/*** BID REVIEW NEXT — blank-slate rebuild prototype (scene_1155) ************
 *
 * The blank-slate compare the UX triage asked for, rendered BELOW the
 * current grid so the team can evaluate it against live data without
 * losing anything. Reads SCW.bidReviewV2.builtState (the same transform
 * the real grid renders from) — it builds NO data pipeline of its own and
 * WRITES NOTHING. Actions land after the direction is approved.
 *
 * Layout per the triage spec:
 *   - one section per SOW (stacked — "bounce between SOWs" profile)
 *   - dense single header band: SOW# · name · counts · money
 *   - tools row: sub-bid diff as a one-line summary pill (distill() from
 *     sub-bid-diff — same engine, same numbers) that expands to the tally
 *   - the grid: MDF/IDF groups → tight rows, ONE bid column (the basis),
 *     Δ column, warning chips. Removed/off-SOW rows collapse to a count.
 *   - color only where something is wrong (rose = not bid / gaps,
 *     amber = warnings). Everything else neutral.
 ****************************************************************************/
(function () {
  'use strict';

  var MOUNT_ID = 'scw-br-next';
  var STYLE_ID = 'scw-br-next-css';
  var LS_OPEN  = 'scwBrNextOpen';       // whole prototype expanded?
  var P = 'scw-brn';

  function v2()  { return window.SCW && window.SCW.bidReviewV2; }
  function sbd() { return window.SCW && window.SCW.subBidDiff; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function money(n) {
    var neg = (n || 0) < 0;
    return (neg ? '-$' : '$') + Math.abs(n || 0)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function signed(n) {
    if (Math.abs(n || 0) <= 0.005) return '$0.00';
    return (n > 0 ? '+' : '-') + '$' + Math.abs(n)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(rec, fk) {
    if (!rec || !fk) return 0;
    var v = rec[fk + '_raw'];
    if (v == null || v === '') v = rec[fk];
    if (v == null) return 0;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function protoOpen() {
    try { return localStorage.getItem(LS_OPEN) !== '0'; } catch (e) { return true; }
  }
  function setProtoOpen(open) {
    try { localStorage.setItem(LS_OPEN, open ? '1' : '0'); } catch (e) {}
  }

  // ── CSS ────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '#' + MOUNT_ID + ' { margin: 26px 0 60px; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      // Prototype band — unmistakably not the real page.
      '.' + P + '-band { display: flex; align-items: center; gap: 12px; cursor: pointer;',
      '  background: repeating-linear-gradient(-45deg, #0f172a, #0f172a 14px, #1e293b 14px, #1e293b 28px);',
      '  color: #fff; border-radius: 10px 10px 0 0; padding: 10px 16px; }',
      '.' + P + '-band__tag { background: #fbbf24; color: #0f172a; border-radius: 999px;',
      '  font: 800 10.5px/1.6 ui-monospace, monospace; letter-spacing: .1em; padding: 2px 10px; }',
      '.' + P + '-band__t { font: 700 13.5px/1.3 system-ui, sans-serif; }',
      '.' + P + '-band__s { color: #94a3b8; font-size: 12px; flex: 1 1 auto; }',
      '.' + P + '-band__car { color: #94a3b8; font-size: 12px; }',
      '.' + P + '-body { border: 2px dashed #cbd5e1; border-top: none;',
      '  border-radius: 0 0 10px 10px; background: #fff; padding: 14px 16px 20px; }',
      '#' + MOUNT_ID + '.is-closed .' + P + '-body { display: none; }',

      // SOW section
      '.' + P + '-sow { border: 1px solid #e2e8f0; border-radius: 10px; margin-top: 14px; overflow: hidden; }',
      '.' + P + '-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;',
      '  padding: 9px 14px; background: #0f4c75; color: #fff; }',
      '.' + P + '-head__num { font: 700 13px/1.3 ui-monospace, monospace; }',
      '.' + P + '-head__nm { font: 600 13px/1.3 system-ui, sans-serif; color: #dbeafe;',
      '  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.' + P + '-head__m { font: 600 12px/1.3 ui-monospace, monospace; color: #bfdbfe;',
      '  font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.' + P + '-head__m b { color: #fff; font-weight: 700; }',

      // tools row (diff summary pill)
      '.' + P + '-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap;',
      '  padding: 7px 14px; background: #f8fafc; border-bottom: 1px solid #eef2f7; }',
      '.' + P + '-pill { display: inline-flex; align-items: center; gap: 7px; cursor: pointer;',
      '  border: 1px solid #e2e8f0; background: #fff; border-radius: 999px; padding: 4px 12px;',
      '  font: 600 11.5px/1.5 system-ui, sans-serif; color: #334155; }',
      '.' + P + '-pill:hover { border-color: #0f4c75; color: #0f4c75; }',
      '.' + P + '-pill__warn { color: #be123c; font-weight: 700; }',
      '.' + P + '-pill__ok { color: #15803d; }',
      '.' + P + '-tally { display: none; padding: 8px 14px; gap: 8px; flex-wrap: wrap;',
      '  background: #f8fafc; border-bottom: 1px solid #eef2f7; }',
      '.' + P + '-sow.tally-open .' + P + '-tally { display: flex; }',
      '.' + P + '-stat { font: 600 11.5px/1.5 system-ui, sans-serif; color: #475569;',
      '  border: 1px solid #e2e8f0; background: #fff; border-radius: 7px; padding: 4px 10px; }',
      '.' + P + '-stat b { font-variant-numeric: tabular-nums; }',

      // grid
      '.' + P + '-tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }',
      '.' + P + '-tbl th { text-align: left; font: 700 10px/1.6 ui-monospace, monospace;',
      '  letter-spacing: .08em; text-transform: uppercase; color: #94a3b8;',
      '  padding: 7px 12px 5px; border-bottom: 1px solid #e2e8f0; background: #fff; }',
      '.' + P + '-tbl th.r, .' + P + '-tbl td.r { text-align: right;',
      '  font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.' + P + '-grp td { background: #f1f5f9; color: #0f172a;',
      '  font: 700 11.5px/1.5 system-ui, sans-serif; padding: 5px 12px;',
      '  border-top: 1px solid #e2e8f0; cursor: pointer; }',
      '.' + P + '-grp__n { color: #64748b; font-weight: 600; margin-left: 8px; }',
      '.' + P + '-grp__rm { color: #94a3b8; font-weight: 600; float: right; }',
      '.' + P + '-tbl td { padding: 5px 12px; border-top: 1px solid #f1f5f9; color: #0f172a; }',
      '.' + P + '-row--acc td:first-child { padding-left: 30px; color: #475569; }',
      '.' + P + '-lbl { font-weight: 600; }',
      '.' + P + '-prod { color: #64748b; margin-left: 8px; }',
      '.' + P + '-nobid { color: #be123c; font-weight: 700; }',
      '.' + P + '-dpos { color: #be123c; }',
      '.' + P + '-dneg { color: #15803d; }',
      '.' + P + '-dzero { color: #94a3b8; }',
      '.' + P + '-sow.groups-closed .' + P + '-grp-rows { display: none; }',
      // warning chips reuse v2's own chip markup/classes (summaryChipsHtml)
      '.' + P + '-tbl .scw-br-v2-chip { transform: scale(.92); transform-origin: left center; }',
      '.' + P + '-note { padding: 8px 14px; color: #64748b; font-size: 12px; }',
      '.' + P + '-foot { margin-top: 10px; color: #94a3b8; font-size: 11.5px; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Per-SOW section ────────────────────────────────────────
  function basisInfo(grid) {
    var S = sbd();
    var basisId = '';
    try {
      if (S && S.render && typeof S.render.basisFor === 'function') {
        basisId = S.render.basisFor(grid.sowId) || '';
      }
    } catch (e) { basisId = ''; }
    if (!basisId || basisId === 'K1') return { id: basisId, name: basisId === 'K1' ? 'K1 (self-perform)' : '' };
    for (var i = 0; i < (grid.packages || []).length; i++) {
      if (grid.packages[i].id === basisId) {
        return { id: basisId, name: grid.packages[i].name || grid.packages[i].bidName || 'Basis bid' };
      }
    }
    return { id: basisId, name: 'Basis bid' };
  }

  function distillFor(grid, basisId) {
    var S = sbd();
    if (!S || !S.render || typeof S.render.distill !== 'function') return null;
    if (!basisId || basisId === 'K1') return null;
    try { return S.render.distill(grid, basisId); } catch (e) { return null; }
  }

  function rowHtml(row, basisId, FK, warnHtml) {
    var isNoBid = !!(row.noBid || row.surveyNoBid);
    var sd = row.sowItemData || {};
    var qty = sd.qty != null && sd.qty !== 0 ? sd.qty
            : (row.detail && row.detail.qty != null ? row.detail.qty : '');
    var sowFee = sd.installFee != null ? (Number(sd.installFee) || 0) : 0;
    var cell = basisId && row.cellsByPackage ? row.cellsByPackage[basisId] : null;
    var bidLabor = cell ? num(cell, FK.labor) : null;
    var delta = (bidLabor == null) ? sowFee : (sowFee - bidLabor);
    var dCls = Math.abs(delta) <= 0.005 ? 'dzero' : (delta > 0 ? 'dpos' : 'dneg');
    return '<tr class="' + P + '-row' + (row.isAccessory ? ' ' + P + '-row--acc' : '') + '">' +
      '<td><span class="' + P + '-lbl">' + esc(row.displayLabel || '—') + '</span>' +
        '<span class="' + P + '-prod">' + esc(row.productName || (sd.productName || '')) + '</span>' +
        (warnHtml || '') + '</td>' +
      '<td class="r">' + esc(qty === '' ? '' : qty) + '</td>' +
      '<td class="r">' + money(sowFee) + '</td>' +
      '<td class="r">' + (bidLabor == null
        ? (basisId ? '<span class="' + P + '-nobid">not bid</span>' : '—')
        : money(bidLabor)) + '</td>' +
      '<td class="r ' + P + '-' + dCls + '">' + (basisId ? signed(delta) : '—') + '</td>' +
    '</tr>';
  }

  function sectionHtml(grid) {
    var FK = (v2() && v2().CONFIG && v2().CONFIG.fieldKeys) || {};
    var W = v2() && v2().warnings;
    var basis = basisInfo(grid);
    var res = distillFor(grid, basis.id);

    var head =
      '<div class="' + P + '-head">' +
        '<span class="' + P + '-head__num">' + esc(grid.sowName || grid.sowId) + '</span>' +
        '<span class="' + P + '-head__nm"></span>' +
        '<span class="' + P + '-head__m">sub bid <b>' + money(grid.sowTotals && grid.sowTotals.subBid) + '</b>' +
        ' · install <b>' + money(grid.sowTotals && grid.sowTotals.install) + '</b></span>' +
      '</div>';

    // Diff summary pill — same engine as the real panel (distill), so the
    // numbers can never disagree with it.
    var pill;
    if (!basis.id) {
      pill = '<span class="' + P + '-pill" data-brn-tally>no basis bid chosen — showing SOW only</span>';
    } else if (basis.id === 'K1') {
      pill = '<span class="' + P + '-pill" data-brn-tally>K1 — self-perform, nothing to diff</span>';
    } else {
      var gaps = (res && res.coverageGaps) || 0;
      var d = res ? (res.totalDelta != null ? res.totalDelta : res.laborDelta) : 0;
      pill = '<span class="' + P + '-pill" data-brn-tally>' +
        'basis: ' + esc(basis.name) +
        ' · Δ ' + signed(d) +
        (gaps ? ' · <span class="' + P + '-pill__warn">⚠ ' + gaps + ' gap' + (gaps === 1 ? '' : 's') + '</span>'
              : ' · <span class="' + P + '-pill__ok">✓ covered</span>') +
        '</span>';
    }
    var tally = '';
    if (res) {
      tally = '<div class="' + P + '-tally">' +
        '<span class="' + P + '-stat">not bid <b>' + res.counts.added + '</b></span>' +
        '<span class="' + P + '-stat">bid only <b>' + res.counts.orphan + '</b></span>' +
        '<span class="' + P + '-stat">labor Δ <b>' + res.counts.material + '</b></span>' +
        '<span class="' + P + '-stat">spec Δ <b>' + res.counts.spec + '</b></span>' +
      '</div>';
    }

    var body = '<table class="' + P + '-tbl"><thead><tr>' +
      '<th>Item</th><th class="r">Qty</th><th class="r">SOW labor</th>' +
      '<th class="r">' + (basis.id && basis.id !== 'K1' ? 'Basis bid' : 'Bid') + '</th>' +
      '<th class="r">Δ</th></tr></thead><tbody>';

    var groups = grid.groups || [];
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      var rows = grp.rows || [];
      var removedN = 0;
      for (var sg = 0; sg < (grp.subgroups || []).length; sg++) {
        removedN += (grp.subgroups[sg].rows || []).length;
      }
      var kept = [];
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (!row || row.offSow || row.removed || row.otherBidItem) { removedN++; continue; }
        kept.push(row);
      }
      if (!kept.length && !removedN) continue;
      body += '<tr class="' + P + '-grp" data-brn-grp><td colspan="5">' +
        esc(grp.label || 'No MDF / IDF') +
        '<span class="' + P + '-grp__n">' + kept.length + '</span>' +
        (removedN ? '<span class="' + P + '-grp__rm">+' + removedN + ' removed / off-SOW</span>' : '') +
        '</td></tr>';
      for (var k = 0; k < kept.length; k++) {
        var warnHtml = '';
        if (W && typeof W.summaryChipsHtml === 'function' && kept[k].sowItem) {
          try { warnHtml = W.summaryChipsHtml([kept[k].sowItem]) || ''; } catch (e) { warnHtml = ''; }
        }
        body += rowHtml(kept[k], (basis.id !== 'K1' ? basis.id : ''), FK, warnHtml);
      }
    }
    body += '</tbody></table>';

    return '<section class="' + P + '-sow" data-brn-sow="' + esc(grid.sowId) + '">' +
      head +
      '<div class="' + P + '-tools">' + pill + '</div>' +
      tally + body +
    '</section>';
  }

  // ── Mount + render ─────────────────────────────────────────
  function render() {
    var ns2 = v2();
    var host = ns2 && ns2.CONFIG && document.getElementById(ns2.CONFIG.mountId);
    if (!host || !host.parentNode) return;
    var state = ns2.builtState;
    if (!state || !state.sowGrids || !state.sowGrids.length) return;
    injectCss();

    var mount = document.getElementById(MOUNT_ID);
    if (!mount) {
      mount = document.createElement('div');
      mount.id = MOUNT_ID;
      host.parentNode.insertBefore(mount, host.nextSibling);
      if (!protoOpen()) mount.classList.add('is-closed');
    }

    var html =
      '<div class="' + P + '-band" data-brn-band>' +
        '<span class="' + P + '-band__tag">NEXT</span>' +
        '<span class="' + P + '-band__t">Blank-slate compare — prototype</span>' +
        '<span class="' + P + '-band__s">reads the same live data · writes nothing · the page above is untouched</span>' +
        '<span class="' + P + '-band__car">' + (protoOpen() ? '▾ hide' : '▸ show') + '</span>' +
      '</div>' +
      '<div class="' + P + '-body">';
    for (var i = 0; i < state.sowGrids.length; i++) {
      try { html += sectionHtml(state.sowGrids[i]); }
      catch (e) { /* one bad SOW never kills the prototype */ }
    }
    html += '<div class="' + P + '-foot">Prototype scope: read-only. Basis follows the ' +
      'real selector above; Δ = SOW labor − basis bid per line. Actions (revise, ' +
      'remove, CRs, publish) stay on the real page until this direction is approved.</div>' +
    '</div>';
    mount.innerHTML = html;
  }

  // Band + group collapse (delegated once).
  function bindOnce() {
    if (document.documentElement.hasAttribute('data-scw-brn-bound')) return;
    document.documentElement.setAttribute('data-scw-brn-bound', '1');
    document.addEventListener('click', function (e) {
      var band = e.target.closest && e.target.closest('[data-brn-band]');
      if (band) {
        var m = document.getElementById(MOUNT_ID);
        if (m) {
          var closed = m.classList.toggle('is-closed');
          setProtoOpen(!closed);
          var car = band.querySelector('.' + P + '-band__car');
          if (car) car.textContent = closed ? '▸ show' : '▾ hide';
        }
        return;
      }
      var pillEl = e.target.closest && e.target.closest('[data-brn-tally]');
      if (pillEl) {
        var sec = pillEl.closest('.' + P + '-sow');
        if (sec) sec.classList.toggle('tally-open');
        return;
      }
      var grpEl = e.target.closest && e.target.closest('[data-brn-grp]');
      if (grpEl) {
        // Collapse the rows until the next group header.
        var tr = grpEl.nextElementSibling;
        var hide = !grpEl.hasAttribute('data-brn-grp-closed');
        grpEl.toggleAttribute('data-brn-grp-closed', hide);
        while (tr && !tr.hasAttribute('data-brn-grp')) {
          tr.style.display = hide ? 'none' : '';
          tr = tr.nextElementSibling;
        }
      }
    });
  }

  // Re-render on the same signal the real grid uses. Debounced — builtState
  // is already fresh by the time subscribers run (render.js sets it first).
  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; render(); }, 350);
  }

  function boot() {
    var ns2 = v2();
    if (!ns2 || !ns2.data || typeof ns2.data.subscribe !== 'function') return false;
    ns2.data.subscribe(schedule);
    bindOnce();
    schedule();
    return true;
  }

  // v2 loads earlier in the bundle, so boot directly; retry briefly in case
  // config wasn't ready (scene gating).
  if (!boot()) {
    var tries = 0;
    var iv = setInterval(function () {
      if (boot() || ++tries > 20) clearInterval(iv);
    }, 500);
  }
})();
/*** END BID REVIEW NEXT *****************************************************/
