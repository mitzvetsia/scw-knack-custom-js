/*** WORKSHEET V2 — SUMMARY ***************************************************
 *
 * Per-L1 summary panel — table of products with per-product counts,
 * cabling / exterior / plenum metrics (cam/reader bucket only), qty, and
 * total sub bid. Mirrors v1's mdf-summary-panel.js shape so users get
 * the same at-a-glance information they\'re used to.
 *
 * Columns:
 *   Product | Exist Cabling | New Cabling | Exterior | Interior | Plenum
 *           | Qty | Sub Bid
 *
 * Cabling / Exterior / Interior / Plenum cells stay blank for non-cam
 * products. Avg sub bid is the SUM of every sub bid value across the
 * product\'s rows (matches v1\'s "total sub bid" per product).
 *
 * The panel sits at the top of each L1 body so it\'s always visible in
 * default mode and is the only thing visible in "Summary only" mode.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim();
  }
  function readNum(rec, fieldKey) {
    if (!rec) return 0;
    var raw = rec[fieldKey + '_raw'];
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      var n = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
      return isNaN(n) ? 0 : n;
    }
    var s = (rec[fieldKey] || '').toString().replace(/<[^>]*>/g, '');
    var v = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return isNaN(v) ? 0 : v;
  }
  function isYes(rec, fieldKey) {
    var raw = rec && rec[fieldKey + '_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = (rec && rec[fieldKey] || '').toString().trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }
  function fmtMoney(n) {
    if (!isFinite(n)) n = 0;
    return '$' + n.toLocaleString(undefined, {
      minimumFractionDigits: 0, maximumFractionDigits: 0
    });
  }
  function fmtNum(n) { return n ? String(n) : ''; }

  // ── Aggregate records by product, grouped by bucket category ──
  // Skips assumptions and services entirely (per v1 parity) — the
  // summary table is about countable hardware, not text-only buckets.
  // Returns:
  //   { sections: [{label, products, subtotal}], totals }
  // where sections are ordered: cam/reader first, then "default"
  // (networking / headend / everything else).
  function aggregate(records) {
    var bucketCategoryOf = (ns.card && ns.card.bucketCategoryOf) ||
                           function () { return 'default'; };

    var groups = {
      cam:      { label: 'Camera / Reader',     byProduct: Object.create(null),
                  subtotal: emptyAgg(), minSort: Infinity },
      'default':{ label: 'Networking / Headend', byProduct: Object.create(null),
                  subtotal: emptyAgg(), minSort: Infinity }
    };
    var totals = emptyAgg();

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r) continue;
      var cat = bucketCategoryOf(r);
      // Skip assumptions / services — they don\'t belong in the
      // hardware summary.
      if (cat === 'assumptions' || cat === 'services') continue;
      var groupKey = (cat === 'cam') ? 'cam' : 'default';
      var grp = groups[groupKey];

      // Track the section\'s sort key = minimum field_2218 (proposal
      // bucket sortOrder) across its records, so the section ordering
      // matches the main grid\'s L2 sort.
      var so = readNum(r, 'field_2218');
      if (isFinite(so) && so < grp.minSort) grp.minSort = so;

      var prod = stripHtml(r.field_1949) || '(unnamed)';
      var qty = readNum(r, 'field_1964') || 1;

      var p = grp.byProduct[prod];
      if (!p) {
        p = grp.byProduct[prod] = {
          label: prod,
          isCamReader: groupKey === 'cam',
          labels: [],
          count: 0, existCabling: 0, newCabling: 0,
          exterior: 0, interior: 0, plenum: 0, subBidSum: 0
        };
      }

      p.count += qty;
      grp.subtotal.count += qty;
      totals.count       += qty;

      if (groupKey === 'cam') {
        var devLabel = stripHtml(r.field_1950);
        if (devLabel) p.labels.push(devLabel);

        if (r.field_2461 != null && stripHtml(r.field_2461) !== '') {
          if (isYes(r, 'field_2461')) {
            p.existCabling++; grp.subtotal.existCabling++; totals.existCabling++;
          } else {
            p.newCabling++;   grp.subtotal.newCabling++;   totals.newCabling++;
          }
        }
        if (r.field_1984 != null && stripHtml(r.field_1984) !== '') {
          if (isYes(r, 'field_1984')) {
            p.exterior++; grp.subtotal.exterior++; totals.exterior++;
          } else {
            p.interior++; grp.subtotal.interior++; totals.interior++;
          }
        }
        if (isYes(r, 'field_1983')) {
          p.plenum++; grp.subtotal.plenum++; totals.plenum++;
        }
      }

      var bid = readNum(r, 'field_2150');
      if (bid > 0) {
        p.subBidSum         += bid;
        grp.subtotal.subBidSum += bid;
        totals.subBidSum    += bid;
      }
    }

    function productList(byProduct) {
      var out = [];
      for (var k in byProduct) out.push(byProduct[k]);
      out.sort(function (a, b) {
        return a.label.localeCompare(b.label, undefined,
          { numeric: true, sensitivity: 'base' });
      });
      return out;
    }

    var sections = [];
    var camProducts = productList(groups.cam.byProduct);
    if (camProducts.length) {
      sections.push({
        key: 'cam',
        label: groups.cam.label,
        isCamReader: true,
        sortOrder: groups.cam.minSort,
        products: camProducts,
        subtotal: groups.cam.subtotal
      });
    }
    var defProducts = productList(groups['default'].byProduct);
    if (defProducts.length) {
      sections.push({
        key: 'default',
        label: groups['default'].label,
        isCamReader: false,
        sortOrder: groups['default'].minSort,
        products: defProducts,
        subtotal: groups['default'].subtotal
      });
    }
    // Sort sections by their minimum field_2218 (proposal bucket
    // sortOrder) so the grouping order matches the main grid\'s L2
    // ordering. Ties fall back to the original push order so
    // cam/reader still wins when both buckets resolve to the same
    // sortOrder (e.g. when the field is missing on records).
    sections.sort(function (a, b) {
      var ao = isFinite(a.sortOrder) ? a.sortOrder : Infinity;
      var bo = isFinite(b.sortOrder) ? b.sortOrder : Infinity;
      return ao - bo;
    });

    return { sections: sections, totals: totals };
  }

  function emptyAgg() {
    return { count: 0, existCabling: 0, newCabling: 0,
             exterior: 0, interior: 0, plenum: 0, subBidSum: 0 };
  }

  function collectRecords(l1) {
    var all = [];
    var l2s = l1.l2 || [];
    for (var i = 0; i < l2s.length; i++) {
      var recs = (l2s[i] && l2s[i].records) || [];
      for (var j = 0; j < recs.length; j++) all.push(recs[j]);
    }
    return all;
  }

  function productRow(p, isSubtotal) {
    var cls = isSubtotal ? ' class="scw-ws-v2-summary-row--total"' : '';
    var showCR = isSubtotal ? true : p.isCamReader;
    var labels = '';
    if (!isSubtotal && p.isCamReader && p.labels.length) {
      var sorted = p.labels.slice().sort(function (a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });
      labels = '<span class="scw-ws-v2-summary-labels">' +
        sorted.map(esc).join(', ') + '</span>';
    }
    return '<tr' + cls + '>' +
      '<td class="scw-ws-v2-summary-prod">' + esc(p.label) + labels + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.existCabling) : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.newCabling)   : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.exterior)     : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.interior)     : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + (showCR ? fmtNum(p.plenum)       : '') + '</td>' +
      '<td class="scw-ws-v2-summary-num">' + fmtNum(p.count) + '</td>' +
      '<td class="scw-ws-v2-summary-money">' +
        (p.subBidSum > 0 ? esc(fmtMoney(p.subBidSum)) : '') +
      '</td>' +
    '</tr>';
  }

  function tableHeaderRow() {
    return '<thead><tr>' +
      '<th class="scw-ws-v2-summary-prod">Product</th>' +
      '<th class="scw-ws-v2-summary-num" title="Existing cabling">Exist Cab</th>' +
      '<th class="scw-ws-v2-summary-num" title="New cabling">New Cab</th>' +
      '<th class="scw-ws-v2-summary-num">Ext</th>' +
      '<th class="scw-ws-v2-summary-num">Int</th>' +
      '<th class="scw-ws-v2-summary-num">Plen</th>' +
      '<th class="scw-ws-v2-summary-num">Qty</th>' +
      '<th class="scw-ws-v2-summary-money">Sub Bid</th>' +
    '</tr></thead>';
  }

  function sectionHeadRow(label) {
    return '<tr class="scw-ws-v2-summary-row--bucket">' +
      '<td colspan="8">' + esc(label) + '</td>' +
    '</tr>';
  }

  function subtotalRow(label, sub, isCam) {
    var p = {
      label: label,
      count: sub.count,
      isCamReader: isCam,
      labels: [],
      existCabling: sub.existCabling,
      newCabling:   sub.newCabling,
      exterior:     sub.exterior,
      interior:     sub.interior,
      plenum:       sub.plenum,
      subBidSum:    sub.subBidSum
    };
    return productRow(p, true);
  }

  function buildSectionsRows(agg, opts) {
    opts = opts || {};
    var rows = '';
    for (var s = 0; s < agg.sections.length; s++) {
      var sec = agg.sections[s];
      rows += sectionHeadRow(sec.label);
      for (var i = 0; i < sec.products.length; i++) {
        rows += productRow(sec.products[i], false);
      }
      // Per-bucket subtotal — only when the section has >1 product
      // OR the user asked for it explicitly via opts.alwaysSubtotal.
      if (opts.alwaysSubtotal || sec.products.length > 1) {
        rows += subtotalRow(sec.label + ' subtotal', sec.subtotal, sec.isCamReader);
      }
    }
    // Grand total — across both sections
    if (agg.sections.length > 1) {
      rows += subtotalRow('Total', agg.totals, true);
    }
    return rows;
  }

  var CHEV_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  var WARN_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/>' +
    '<line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  /** Issue-chip strip rendered into the summary head. Reads from
   *  ns.warnings cache (analyzed once per render in render.js). Empty
   *  string when there are no flagged records in the given set. */
  function fmtIssueChips(recordIds) {
    if (!ns.warnings || typeof ns.warnings.getCountsForRecords !== 'function') return '';
    if (!recordIds.length) return '';
    var counts;
    try { counts = ns.warnings.getCountsForRecords(recordIds); }
    catch (e) { return ''; }
    var labels = ns.warnings.LABELS || {};
    var types  = ns.warnings.TYPES  || [];
    var parts = [];
    for (var t = 0; t < types.length; t++) {
      var k = types[t];
      var n = counts[k] || 0;
      if (!n) continue;
      parts.push(
        '<span class="scw-ws-v2-warn-chip" title="' +
          n + ' ' + esc(labels[k] || k) + '">' +
          WARN_SVG +
          '<span class="scw-ws-v2-warn-chip-n">' + n + '</span>' +
          '<span class="scw-ws-v2-warn-chip-l">' + esc(labels[k] || k) + '</span>' +
        '</span>'
      );
    }
    return parts.length
      ? '<span class="scw-ws-v2-warn-chips">' + parts.join('') + '</span>'
      : '';
  }

  function collectRecordIds(l1) {
    var out = [];
    var l2s = (l1 && l1.l2) || [];
    for (var i = 0; i < l2s.length; i++) {
      var recs = (l2s[i] && l2s[i].records) || [];
      for (var j = 0; j < recs.length; j++) if (recs[j] && recs[j].id) out.push(recs[j].id);
    }
    return out;
  }

  function fmtSummaryStat(totals) {
    var bits = [];
    if (totals.count) bits.push(totals.count + ' items');
    if (totals.subBidSum) bits.push(fmtMoney(totals.subBidSum));
    return bits.join(' · ');
  }

  function buildL1Summary(l1) {
    var recs = collectRecords(l1);
    var agg = aggregate(recs);
    if (!agg.sections.length) {
      var wrapEmpty = document.createElement('div');
      wrapEmpty.className = 'scw-ws-v2-summary scw-ws-v2-summary--empty';
      wrapEmpty.innerHTML = '<div class="scw-ws-v2-summary-empty">' +
        'No hardware in ' + esc(l1.label) + '.</div>';
      return wrapEmpty;
    }

    var tableHtml =
      '<table class="scw-ws-v2-summary-table">' +
        tableHeaderRow() +
        '<tbody>' + buildSectionsRows(agg) + '</tbody>' +
      '</table>';

    var chips = fmtIssueChips(collectRecordIds(l1));
    var wrap = document.createElement('div');
    wrap.className = 'scw-ws-v2-summary';
    wrap.innerHTML =
      '<button type="button" class="scw-ws-v2-summary-head" ' +
        'data-scw-ws-v2-summary-toggle aria-expanded="false">' +
        '<span class="scw-ws-v2-summary-chev">' + CHEV_SVG + '</span>' +
        '<span class="scw-ws-v2-summary-title">Summary</span>' +
        '<span class="scw-ws-v2-summary-stats">' + esc(fmtSummaryStat(agg.totals)) + '</span>' +
        chips +
      '</button>' +
      '<div class="scw-ws-v2-summary-body">' + tableHtml + '</div>';
    return wrap;
  }

  /** Grand summary — aggregates EVERY record across every L1. */
  function buildGrandSummary(tree) {
    var all = [];
    for (var i = 0; i < tree.length; i++) {
      all = all.concat(collectRecords(tree[i]));
    }
    var agg = aggregate(all);
    if (!agg.sections.length) {
      var wrapEmpty = document.createElement('div');
      wrapEmpty.className = 'scw-ws-v2-grand-summary scw-ws-v2-grand-summary--empty';
      wrapEmpty.innerHTML = '<div class="scw-ws-v2-summary-empty">' +
        'No hardware line items yet.</div>';
      return wrapEmpty;
    }

    var tableHtml =
      '<table class="scw-ws-v2-summary-table">' +
        tableHeaderRow() +
        '<tbody>' + buildSectionsRows(agg, { alwaysSubtotal: true }) + '</tbody>' +
      '</table>';

    var allIds = [];
    for (var ri = 0; ri < all.length; ri++) if (all[ri] && all[ri].id) allIds.push(all[ri].id);
    var grandChips = fmtIssueChips(allIds);

    var wrap = document.createElement('div');
    wrap.className = 'scw-ws-v2-grand-summary';
    wrap.innerHTML =
      '<button type="button" class="scw-ws-v2-summary-head scw-ws-v2-summary-head--grand" ' +
        'data-scw-ws-v2-summary-toggle aria-expanded="false">' +
        '<span class="scw-ws-v2-summary-chev">' + CHEV_SVG + '</span>' +
        '<span class="scw-ws-v2-summary-title">Summary</span>' +
        '<span class="scw-ws-v2-summary-stats">' +
          all.length + ' line items · ' + esc(fmtSummaryStat(agg.totals)) +
        '</span>' +
        grandChips +
      '</button>' +
      '<div class="scw-ws-v2-summary-body">' + tableHtml + '</div>';
    return wrap;
  }

  ns.summary = {
    buildL1Summary:    buildL1Summary,
    buildGrandSummary: buildGrandSummary
  };
})();
/*** END WORKSHEET V2 — SUMMARY ***********************************************/
