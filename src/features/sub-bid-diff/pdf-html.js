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

  /** Diff render — SELF-STYLED: every visual attribute is inline, so the
   *  fragment renders identically wherever it lands (spliced into the bid
   *  document, the standalone diff doc, or a Make-side concatenation where
   *  the PDF module strips <head> CSS). Class names stay for contexts where
   *  getPdfCss IS in scope, but nothing here depends on it. Mirrors the
   *  review-page panel: Status badge column, product sub-line, changed-field
   *  chips, tally strip, colored Δ (pos → rose, neg → green — same
   *  convention as sub-bid-diff/styles.js). */
  var FONT  = 'font-family:Arial,Helvetica,sans-serif;';
  var NAVY  = '#0f4c75', INK = '#0f172a', MUTED = '#64748b', LINE = '#e2e8f0';
  function deltaColor(n) {
    if (Math.abs(n || 0) <= (C.moneyEps || 0.005)) return '#475569';
    if (n > 0) return (C.TIERS && C.TIERS.added && C.TIERS.added.color) || '#be123c';
    return '#047857';
  }
  function buildDiff(grid, pkgId, pkgName) {
    if (!grid || !pkgId || !ns.render || typeof ns.render.distill !== 'function') return '';
    var res = ns.render.distill(grid, pkgId);
    var T = C.TIERS || {};
    var h = [];
    h.push('<div class="sbd-pdf" style="' + FONT + 'color:' + INK + ';">');
    h.push('<div class="view-title" style="font-size:17px;font-weight:800;color:' + NAVY +
           ';padding:0 0 8px;border-bottom:2px solid ' + NAVY + ';margin:0 0 12px;">' +
           'Sub-Bid Diff — ' + esc(pkgName || '') + '</div>');
    if (!res.total) {
      h.push('<div style="font-size:12px;font-weight:600;color:#047857;">' +
             '✓ Basis bid matches the SOW — no labor or coverage differences.</div>');
      h.push('</div>');
      return h.join('\n');
    }
    var c = res.counts || {};
    function stat(n, label) {
      return '<span style="display:inline-block;margin:0 18px 0 0;white-space:nowrap;">' +
        '<span style="font-size:15px;font-weight:800;">' + n + '</span> ' +
        '<span style="font-size:9.5px;font-weight:600;color:' + MUTED +
        ';text-transform:uppercase;letter-spacing:.04em;">' + esc(label) + '</span></span>';
    }
    h.push('<div style="margin:0 0 12px;">' +
      stat(c.added || 0, 'Not bid') +
      stat(c.orphan || 0, 'Bid only') +
      stat(c.material || 0, 'Labor change') +
      stat(c.spec || 0, 'Spec change') +
      '<span style="display:inline-block;white-space:nowrap;">' +
        '<span style="font-size:15px;font-weight:800;color:' + deltaColor(res.laborDelta) + ';">' +
          signedMoney(res.laborDelta) + '</span> ' +
        '<span style="font-size:9.5px;font-weight:600;color:' + MUTED +
        ';text-transform:uppercase;letter-spacing:.04em;">labor Δ (SOW − sub)</span></span>' +
      '</div>');
    var TH  = 'padding:6px 8px;font-size:9px;font-weight:700;text-transform:uppercase;' +
              'letter-spacing:.05em;color:' + MUTED + ';border-bottom:2px solid ' + NAVY + ';';
    var TD  = 'padding:6px 8px;border-bottom:1px solid ' + LINE + ';vertical-align:top;font-size:11px;';
    var NUM = TD + 'text-align:right;white-space:nowrap;';
    h.push('<table class="product-table" style="width:100%;border-collapse:collapse;">');
    h.push('<thead><tr>' +
      '<th style="' + TH + 'text-align:left;width:74px;">Status</th>' +
      '<th style="' + TH + 'text-align:left;">Line item</th>' +
      '<th style="' + TH + 'text-align:right;width:78px;">SOW labor</th>' +
      '<th style="' + TH + 'text-align:right;width:78px;">Sub bid</th>' +
      '<th style="' + TH + 'text-align:right;width:78px;">Δ</th>' +
      '</tr></thead><tbody>');
    for (var i = 0; i < res.exceptions.length; i++) {
      var e = res.exceptions[i];
      var def = T[e.tier] || {};
      var badge = '<span style="display:inline-block;padding:2px 8px;border-radius:999px;' +
                  'font-size:9px;font-weight:700;color:#fff;white-space:nowrap;background:' +
                  (def.color || '#475569') + ';">' + esc(def.label || e.tier) + '</span>';
      var meta = '';
      if (e.product) meta += '<div style="font-size:10px;color:' + MUTED + ';margin-top:1px;">' +
                             esc(e.product) + '</div>';
      if (e.fields && e.fields.length) {
        meta += '<div style="font-size:9.5px;color:#4f46e5;margin-top:1px;">changed: ' +
                esc(e.fields.join(', ')) + '</div>';
      }
      if (e.note) meta += '<div style="font-size:9.5px;color:#94a3b8;margin-top:1px;">' +
                          esc(e.note) + '</div>';
      h.push('<tr class="l3-row" style="page-break-inside:avoid;">' +
        '<td style="' + TD + '">' + badge + '</td>' +
        '<td style="' + TD + '"><div style="font-weight:600;">' + esc(e.label) + '</div>' + meta + '</td>' +
        '<td style="' + NUM + '">' + (e.tier === 'orphan' ? '—' : money(e.sowFee)) + '</td>' +
        '<td style="' + NUM + '">' + (e.tier === 'added' ? '—' : money(e.bidLabor)) + '</td>' +
        '<td style="' + NUM + 'font-weight:700;color:' + deltaColor(e.delta) + ';">' +
          signedMoney(e.delta) + '</td></tr>');
    }
    h.push('</tbody></table>');
    h.push('<div style="margin:10px 0 0;padding:8px 10px;background:#f8fafc;border:1px solid ' +
           LINE + ';text-align:right;font-size:12px;page-break-inside:avoid;">' +
      '<span style="font-weight:700;">Labor Δ (SOW − sub)&nbsp;&nbsp;</span>' +
      '<span style="font-weight:800;color:' + deltaColor(res.laborDelta) + ';">' +
        signedMoney(res.laborDelta) + '</span></div>');
    h.push('</div>');
    return h.join('\n');
  }

  ns.pdfHtml = { buildBid: buildBid, buildDiff: buildDiff };
})();
/*** END SUB-BID DIFF — PDF HTML RENDERS *************************************/
