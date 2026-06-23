/*** SUB-BID DIFF — RENDER ***************************************************
 *
 * Distills v2's already-computed diff (SCW.bidReviewV2.transform.buildState)
 * into a short, read-only "what's off vs the basis bid" verdict. Does NOT
 * recompute or re-render the grid — single source of truth is v2's state.
 *
 * The basis bid is ALWAYS an explicit choice (persisted SOW→bid field, or
 * an interim in-session selector). No overlap auto-pick.
 *
 * Included exception types (everything else is suppressed):
 *   - material : matched line, SOW fee ≠ sub bid labor
 *   - added    : SOW line that REQUIRES a bid (field_2479 ≠ No) but has none
 *   - orphan   : bid line pointing outside THIS SOW (bid-only or other-SOW)
 * Excluded: covered (equal), field_2479=No, and removed (on neither side —
 * v2 already drops those from grid.rows).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.subBidDiff;
  if (!ns || !ns.CONFIG) return;
  var C = ns.CONFIG, T = C.TIERS;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function money(n) {
    var neg = n < 0;
    return (neg ? '-$' : '$') + Math.abs(n || 0)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function signedMoney(n) {
    if (Math.abs(n || 0) <= C.moneyEps) return '$0.00';
    return (n > 0 ? '+$' : '-$') + Math.abs(n)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyEq(a, b) { return Math.abs((a || 0) - (b || 0)) <= C.moneyEps; }

  /** field_2479 (Require Sub Bid) reads No / false. Blank ≠ No (unknown). */
  function isReqNo(v) {
    if (Array.isArray(v)) v = v[0];
    if (v && typeof v === 'object') v = v.identifier || v.id || '';
    var s = String(v == null ? '' : v).trim().toLowerCase();
    return s === 'no' || s === 'false';
  }

  // Explicit, per-SOW basis selection. No default — the user must choose.
  // Keyed by sowId. Seeded from the persisted field when configured.
  var selectedByGrid = Object.create(null);
  var savedByGrid    = Object.create(null);  // sowId → true once PUT succeeds
  var savingGrid     = Object.create(null);  // sowId → true while a write is in flight

  /** Persist the basis bid on the SOW (field_2942, single connection) via the
   *  SOW write view. Optimistic: caller updates selection + re-renders first. */
  function writeBasis(sowId, pkgId) {
    if (!C.basisBidField || !sowId) return;
    if (!(window.SCW && typeof SCW.knackAjax === 'function' && SCW.knackRecordUrl)) return;
    var body = {};
    body[C.basisBidField] = pkgId ? [pkgId] : [];
    savingGrid[sowId] = true; render();
    SCW.knackAjax({
      url: SCW.knackRecordUrl(C.basisBidView, sowId),
      type: 'PUT',
      data: JSON.stringify(body)
    }).then(function () {
      savingGrid[sowId] = false;
      if (pkgId) savedByGrid[sowId] = true; else delete savedByGrid[sowId];
      render();
    }, function (xhr) {
      savingGrid[sowId] = false;
      console.warn('[scw-sub-bid-diff] basis write failed', sowId, xhr && xhr.status);
      render();
    });
  }

  // ── source reads ───────────────────────────────────────────────────────
  function v2data() { return window.SCW.bidReviewV2 && window.SCW.bidReviewV2.data; }
  function readView(k) {
    var d = v2data();
    if (d && typeof d.readRecords === 'function') return d.readRecords(k);
    try {
      var v = Knack.views[k];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      return models.map(function (m) { return m.attributes || m.toJSON(); });
    } catch (e) { return []; }
  }

  /** Persisted basis bid id for a SOW (reads CONFIG.basisBidField off the
   *  SOW records view). '' when unconfigured or unset. */
  function persistedBasis(sowId) {
    if (!C.basisBidField) return '';
    var sows = readView(C.basisBidView);
    for (var i = 0; i < sows.length; i++) {
      if (sows[i] && sows[i].id === sowId) {
        var raw = sows[i][C.basisBidField + '_raw'];
        if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
        if (raw && raw.id) return raw.id;
        return '';
      }
    }
    return '';
  }

  function basisFor(sowId) {
    return persistedBasis(sowId) || selectedByGrid[sowId] || '';
  }

  // ── distill one SOW grid against the chosen basis package ───────────────
  function distill(grid, pkgId) {
    var ex = [];
    var counts = { material: 0, spec: 0, added: 0, orphan: 0 };
    var laborDelta = 0;
    var rows = grid.rows || [];
    var v2t = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.transform;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row) continue;
      var cell = row.cellsByPackage && row.cellsByPackage[pkgId];

      // Orphan — bid line that points outside THIS SOW (bid-only OR other-SOW).
      if (row.offSow) {
        if (!cell) continue;                    // not on the basis package
        var ol = Number(cell.labor) || 0;
        laborDelta -= ol; counts.orphan++;
        ex.push({
          tier: 'orphan',
          label: row.displayLabel || row.productName ||
                 (cell.productName || '') || '(bid item)',
          product: cell.productName || row.productName || '',
          note: (row.otherSowNames && row.otherSowNames.length)
                  ? 'on ' + row.otherSowNames.join(', ') : 'not on this SOW',
          sowFee: 0, bidLabor: ol, delta: -ol
        });
        continue;
      }

      // Matched to this SOW. Exclude require-sub-bid = No.
      if (isReqNo(row.requireSubBidSow)) continue;

      var sowFee = (row.sowItemData && Number(row.sowItemData.fee)) ||
                   Number(row.sowFee) || 0;
      var label  = row.displayLabel ||
                   (row.sowItemData && row.sowItemData.productName) ||
                   row.productName || '(line item)';
      var product = (row.sowItemData && row.sowItemData.productName) ||
                    row.productName || row.sowProduct || '';

      if (!cell) {
        // SOW line that requires a bid but isn't on the basis bid → gap.
        laborDelta += sowFee; counts.added++;
        ex.push({ tier: 'added', label: label, product: product,
                  note: 'not on basis bid', sowFee: sowFee, bidLabor: 0, delta: sowFee });
        continue;
      }

      var bidLabor = Number(cell.labor) || 0;
      var feeDiff = !moneyEq(sowFee, bidLabor);

      // Non-labor spec diffs (labor desc / connected-to / connected-devices /
      // conduit) come straight from v2's getMismatches so they match the grid.
      var changed = [];
      var mm = null;
      if (v2t && typeof v2t.getMismatches === 'function') {
        try { mm = v2t.getMismatches(row, cell); } catch (e) { mm = null; }
      }
      if (mm) {
        if (mm.laborDesc)  changed.push('labor desc');
        if (mm.connTo)     changed.push('connected to');
        if (mm.connDevice) changed.push('connected devices');
        if (mm.conduit)    changed.push('conduit');
      }

      if (!feeDiff && !changed.length) continue;   // covered — suppressed

      if (feeDiff) {
        var d = sowFee - bidLabor;
        laborDelta += d; counts.material++;
        ex.push({ tier: 'material', label: label, product: product,
                  note: changed.length ? 'also: ' + changed.join(', ') : '',
                  sowFee: sowFee, bidLabor: bidLabor, delta: d });
      } else {
        counts.spec++;
        ex.push({ tier: 'spec', label: label, product: product,
                  note: 'changed: ' + changed.join(', '),
                  sowFee: sowFee, bidLabor: bidLabor, delta: 0 });
      }
    }

    // Order: material → spec → added → orphan, then by |delta| desc.
    var order = { material: 0, spec: 1, added: 2, orphan: 3 };
    ex.sort(function (a, b) {
      if (order[a.tier] !== order[b.tier]) return order[a.tier] - order[b.tier];
      return Math.abs(b.delta) - Math.abs(a.delta);
    });
    return {
      exceptions: ex, counts: counts, laborDelta: laborDelta,
      coverageGaps: counts.added + counts.orphan,
      total: ex.length
    };
  }

  // ── HTML builders ───────────────────────────────────────────────────────
  function pkgOption(p, selId) {
    var bits = [p.bidName || p.name || 'Bid'];
    if (p.bidStatus) bits.push(p.bidStatus);
    bits.push((p.onSowItemCount || 0) + ' on SOW');
    return '<option value="' + esc(p.id) + '"' + (p.id === selId ? ' selected' : '') +
      '>' + esc(bits.join(' · ')) + '</option>';
  }

  function selector(grid, selId, persisted) {
    var pkgs = grid.packages || [];
    var opts = '<option value="">— choose the basis bid —</option>' +
      pkgs.map(function (p) { return pkgOption(p, selId); }).join('');
    var note;
    if (savingGrid[grid.sowId]) {
      note = '<span class="scw-sbd-baseline__meta">saving…</span>';
    } else if (selId && (persisted || savedByGrid[grid.sowId])) {
      note = '<span class="scw-sbd-baseline__meta scw-sbd-baseline__meta--saved">✓ saved as the basis for this SOW → proposal</span>';
    } else if (selId) {
      note = '<span class="scw-sbd-baseline__meta">not saved yet</span>';
    } else {
      note = '<span class="scw-sbd-baseline__meta">choose the bid this SOW → proposal is built on</span>';
    }
    return '<div class="scw-sbd-baseline">' +
      '<label>Basis bid:</label>' +
      '<select data-scw-sbd-basis data-sow-id="' + esc(grid.sowId) + '"' +
        (savingGrid[grid.sowId] ? ' disabled' : '') + '>' + opts + '</select>' +
      note + '</div>';
  }

  function tally(res) {
    function stat(n, label) {
      return '<div class="scw-sbd-stat"><span class="scw-sbd-stat__n">' + n +
        '</span><span class="scw-sbd-stat__l">' + esc(label) + '</span></div>';
    }
    var d = res.laborDelta;
    var dCls = Math.abs(d) <= C.moneyEps ? 'zero' : (d > 0 ? 'pos' : 'neg');
    return '<div class="scw-sbd-tally">' +
      stat(res.counts.material, 'Labor change') +
      stat(res.counts.spec, 'Spec change') +
      stat(res.counts.added, 'Not bid') +
      stat(res.counts.orphan, 'Bid only') +
      '<div class="scw-sbd-stat scw-sbd-stat--delta"><span class="scw-sbd-stat__n ' + dCls +
        '">' + signedMoney(d) + '</span><span class="scw-sbd-stat__l">labor Δ (SOW − sub)</span></div>' +
      '</div>';
  }

  function flag(res) {
    if (res.coverageGaps > 0) {
      return '<div class="scw-sbd-flag scw-sbd-flag--gap">⚠️ ' + res.coverageGaps +
        ' coverage gap' + (res.coverageGaps === 1 ? '' : 's') +
        ' — SOW lines needing a bid, or bid lines off this SOW.</div>';
    }
    if (res.total === 0) {
      return '<div class="scw-sbd-flag scw-sbd-flag--ok">✓ Basis bid matches the SOW — no labor or coverage differences.</div>';
    }
    return '';
  }

  function badge(tier) {
    var def = T[tier] || T.material;
    return '<span class="scw-sbd-badge" style="background:' + def.color + '">' +
      esc(def.label) + '</span>';
  }
  function deltaCell(n) {
    if (Math.abs(n) <= C.moneyEps) return '<td class="scw-sbd-num scw-sbd-delta-zero">—</td>';
    return '<td class="scw-sbd-num ' + (n > 0 ? 'scw-sbd-delta-pos' : 'scw-sbd-delta-neg') +
      '">' + signedMoney(n) + '</td>';
  }
  function exRow(r) {
    return '<tr class="scw-sbd-row scw-sbd-row--' + r.tier + '">' +
      '<td>' + badge(r.tier) + '</td>' +
      '<td><div class="scw-sbd-label">' + esc(r.label) + '</div>' +
        (r.product ? '<div class="scw-sbd-product">' + esc(r.product) + '</div>' : '') +
        (r.note ? '<div class="scw-sbd-mdf">' + esc(r.note) + '</div>' : '') + '</td>' +
      '<td class="scw-sbd-num">' + (r.tier === 'orphan' ? '—' : money(r.sowFee)) + '</td>' +
      '<td class="scw-sbd-num">' + (r.tier === 'added' ? '—' : money(r.bidLabor)) + '</td>' +
      deltaCell(r.delta) + '</tr>';
  }
  function exTable(res) {
    if (!res.exceptions.length) return '';
    return '<table class="scw-sbd-table"><thead><tr>' +
      '<th>Status</th><th>Line item</th>' +
      '<th class="scw-sbd-num">SOW labor</th><th class="scw-sbd-num">Sub bid</th>' +
      '<th class="scw-sbd-num">Δ</th></tr></thead><tbody>' +
      res.exceptions.map(exRow).join('') + '</tbody></table>';
  }

  function gridSection(grid) {
    var selId = basisFor(grid.sowId);
    var persisted = !!(C.basisBidField && persistedBasis(grid.sowId));
    var head = '<div class="scw-sbd-sow-head">' +
      '<span class="scw-sbd-sow-name">' + esc(grid.sowName || 'SOW') + '</span></div>';
    var sel = selector(grid, selId, persisted);

    if (!selId) {
      return '<section class="scw-sbd-sec">' + head + sel +
        '<div class="scw-sbd-empty">Select the basis bid above to see what differs vs the SOW.</div>' +
        '</section>';
    }
    var res = distill(grid, selId);
    return '<section class="scw-sbd-sec">' + head + sel +
      tally(res) + flag(res) + exTable(res) + '</section>';
  }

  function render() {
    var container = document.getElementById(C.mountId);
    if (!container) return;
    var body = container.querySelector('.scw-sbd-body');
    if (!body) return;

    var v2t = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.transform;
    if (!v2t || typeof v2t.buildState !== 'function') {
      body.innerHTML = '<div class="scw-sbd-empty">Bid-review v2 not loaded — diff unavailable.</div>';
      return;
    }
    var state = v2t.buildState(
      readView(C.bidViewKey), readView(C.sowItemsViewKey), readView(C.bidPkgViewKey));

    if (!state || state.isEmpty || !state.sowGrids.length) {
      body.innerHTML = '<div class="scw-sbd-empty">No bid + SOW data loaded yet.</div>';
      return;
    }
    body.innerHTML = state.sowGrids.map(gridSection).join('');
  }

  function bindOnce() {
    if (document.documentElement.hasAttribute('data-scw-sbd-bound')) return;
    document.documentElement.setAttribute('data-scw-sbd-bound', '1');
    document.addEventListener('change', function (e) {
      var sel = e.target.closest && e.target.closest('[data-scw-sbd-basis]');
      if (!sel) return;
      var sowId = sel.getAttribute('data-sow-id');
      if (!sowId) return;
      var pkgId = sel.value || '';
      selectedByGrid[sowId] = pkgId;   // optimistic — diff shows immediately
      if (C.basisBidField) writeBasis(sowId, pkgId);  // persist (re-renders)
      else render();
    });
  }

  ns.render = { render: render, bindOnce: bindOnce, distill: distill };
})();
/*** END SUB-BID DIFF — RENDER ***********************************************/
