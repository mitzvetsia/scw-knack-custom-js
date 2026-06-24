/*** SUB-BID DIFF — PDF HTML RENDERS *****************************************
 *
 * Two HTML *fragments* that read as closely as possible to the markup the
 * proposal/bid PDF pipeline emits (proposal-pdf-export.js → buildPdfHtml /
 * getPdfCss): the same `l1-section` / `l1-header` / `l2-header` /
 * `product-table` / `l3-row` / `col-qty` / `col-cost` / `l1-footer` classes.
 *
 *   buildBid(grid, pkgId)  → the chosen basis bid, grouped MDF/IDF → bucket,
 *                            labor-only ("Cost" column = sub-bid labor).
 *   buildDiff(grid, pkgId) → the distilled diff (what's off vs the SOW),
 *                            same blue/orange visual language.
 *
 * Both are CLASS-NAMED FRAGMENTS (no <html>/<style>): when Make stamps them
 * onto the published proposal, getPdfCss() is already in scope so they render
 * native. The fragments are carried on the field_2941 snapshot blob
 * (bidHtml / diffHtml) so they travel with the SOW to the proposal page.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.subBidDiff;
  if (!ns || !ns.CONFIG) return;
  var C = ns.CONFIG;

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
  function signedMoney(n) {
    if (Math.abs(n || 0) <= (C.moneyEps || 0.005)) return '$0.00';
    return (n > 0 ? '+$' : '-$') + Math.abs(n)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // Rich-text labor descriptions arrive as HTML; normalize <b>/<p> like the
  // PDF renderer does so the fragment matches buildPdfHtml's l4 content.
  function descHtml(v) {
    if (v == null || v === '') return '';
    return String(v)
      .replace(/<b>/gi, '<span style="font-weight:700">')
      .replace(/<\/b>/gi, '</span>')
      .replace(/<p>/gi, '<div>')
      .replace(/<\/p>/gi, '</div>');
  }

  /** Group a SOW grid's rows for the basis package: L1 (MDF/IDF, in the
   *  grid's canonical group order) → L2 buckets (proposal bucket, first-seen
   *  order) → rows that actually have a cell on pkgId. */
  function groupForBid(grid, pkgId) {
    var l1s = [];
    var groups = grid.groups || [{ label: '', rows: grid.rows || [] }];
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      var rows = grp.rows || [];
      var buckets = [];
      var byBucket = Object.create(null);
      var total = 0, any = false;
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row || row.offSow) continue;
        var cell = row.cellsByPackage && row.cellsByPackage[pkgId];
        if (!cell) continue;
        any = true;
        var bkey = row.proposalBucket || '—';
        if (!byBucket[bkey]) { byBucket[bkey] = { label: row.proposalBucket || '', items: [] }; buckets.push(byBucket[bkey]); }
        var labor = Number(cell.labor) || 0;
        total += labor;
        byBucket[bkey].items.push({
          label: row.displayLabel || cell.productName || row.productName || '(line item)',
          qty:   cell.qty != null ? cell.qty : '',
          labor: labor,
          desc:  cell.laborDesc || ''
        });
      }
      if (any) l1s.push({ label: grp.label || '', buckets: buckets, total: total });
    }
    return l1s;
  }

  /** Basis-bid render — MDF/IDF → bucket → line items, labor-only. */
  function buildBid(grid, pkgId, pkgName) {
    if (!grid || !pkgId) return '';
    var l1s = groupForBid(grid, pkgId);
    if (!l1s.length) return '';
    var h = [];
    h.push('<div class="view-title">Sub Bid — ' + esc(pkgName || '') + '</div>');
    var grand = 0;
    for (var i = 0; i < l1s.length; i++) {
      var l1 = l1s[i];
      grand += l1.total;
      h.push('<div class="l1-section">');
      if (l1.label) h.push('<div class="l1-header">' + esc(l1.label) + '</div>');
      for (var b = 0; b < l1.buckets.length; b++) {
        var bucket = l1.buckets[b];
        if (bucket.label) h.push('<div class="l2-header">' + esc(bucket.label) + '</div>');
        h.push('<table class="product-table">');
        h.push('<thead><tr><th class="col-desc"></th><th class="col-qty">Qty</th><th class="col-cost">Labor</th></tr></thead>');
        h.push('<tbody>');
        for (var k = 0; k < bucket.items.length; k++) {
          var it = bucket.items[k];
          h.push('<tr class="l3-row"><td>' + esc(it.label) + '</td>' +
                 '<td class="col-qty">' + esc(it.qty) + '</td>' +
                 '<td class="col-cost">' + money(it.labor) + '</td></tr>');
          if (it.desc) {
            h.push('<tr class="l4-row"><td class="l4-desc">' + descHtml(it.desc) +
                   '</td><td class="col-qty"></td><td class="col-cost"></td></tr>');
          }
        }
        h.push('</tbody></table>');
      }
      h.push('<div class="l1-footer"><div class="l1-footer-line l1-line--final">' +
             '<span class="l1-footer-label">Sub Bid Labor</span>' +
             '<span class="l1-footer-value">' + money(l1.total) + '</span></div></div>');
      h.push('</div>');
    }
    h.push('<div class="project-totals"><div class="pt-line pt-line--final">' +
           '<span class="pt-label">Sub Bid Total</span>' +
           '<span class="pt-value">' + money(grand) + '</span></div></div>');
    return h.join('\n');
  }

  /** Diff render — distilled exceptions in the bid-PDF visual language. */
  function buildDiff(grid, pkgId, pkgName) {
    if (!grid || !pkgId || !ns.render || typeof ns.render.distill !== 'function') return '';
    var res = ns.render.distill(grid, pkgId);
    var T = C.TIERS || {};
    var h = [];
    h.push('<div class="view-title">Sub-Bid Diff — ' + esc(pkgName || '') + '</div>');
    h.push('<div class="l1-section">');
    if (!res.total) {
      h.push('<div class="l2-header">✓ Basis bid matches the SOW — no labor or coverage differences.</div>');
      h.push('</div>');
      return h.join('\n');
    }
    var c = res.counts || {};
    h.push('<div class="l2-header">' +
           (c.material || 0) + ' labor · ' + (c.spec || 0) + ' spec · ' +
           (c.added || 0) + ' not bid · ' + (c.orphan || 0) + ' bid only · ' +
           'labor Δ ' + signedMoney(res.laborDelta) + '</div>');
    h.push('<table class="product-table">');
    h.push('<thead><tr><th class="col-desc">Line item</th>' +
           '<th class="col-qty">SOW labor</th><th class="col-cost">Sub bid</th>' +
           '<th class="col-cost">Δ</th></tr></thead><tbody>');
    for (var i = 0; i < res.exceptions.length; i++) {
      var e = res.exceptions[i];
      var def = T[e.tier] || {};
      var badge = '<span style="display:inline-block;padding:1px 7px;border-radius:999px;' +
                  'font-size:9px;font-weight:700;color:#fff;background:' + (def.color || '#475569') +
                  '">' + esc(def.label || e.tier) + '</span>';
      var fields = (e.fields && e.fields.length)
        ? ' <span style="color:#4f46e5;font-size:10px;">(' + esc(e.fields.join(', ')) + ')</span>' : '';
      var note = e.note ? ' <span style="color:#94a3b8;font-size:10px;">' + esc(e.note) + '</span>' : '';
      h.push('<tr class="l3-row"><td>' + badge + ' ' + esc(e.label) + fields + note + '</td>' +
             '<td class="col-qty">' + (e.tier === 'orphan' ? '—' : money(e.sowFee)) + '</td>' +
             '<td class="col-cost">' + (e.tier === 'added' ? '—' : money(e.bidLabor)) + '</td>' +
             '<td class="col-cost">' + signedMoney(e.delta) + '</td></tr>');
    }
    h.push('</tbody></table>');
    h.push('<div class="l1-footer"><div class="l1-footer-line l1-line--final">' +
           '<span class="l1-footer-label">Labor Δ (SOW − sub)</span>' +
           '<span class="l1-footer-value">' + signedMoney(res.laborDelta) + '</span></div></div>');
    h.push('</div>');
    return h.join('\n');
  }

  ns.pdfHtml = { buildBid: buildBid, buildDiff: buildDiff };
})();
/*** END SUB-BID DIFF — PDF HTML RENDERS *************************************/
