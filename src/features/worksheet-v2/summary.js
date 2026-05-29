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

  // ── Aggregate records by product ────────────────────────────
  function aggregate(records) {
    var CAM = (ns.card && ns.card.CAM_READER_BUCKET) || '6481e5ba38f283002898113c';
    var bucketIdOf = (ns.card && ns.card.bucketIdOf) || function () { return ''; };

    var byProduct = Object.create(null);
    var totals = {
      count: 0, existCabling: 0, newCabling: 0,
      exterior: 0, interior: 0, plenum: 0, subBidSum: 0
    };

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r) continue;
      var prod = stripHtml(r.field_1949) || '(unnamed)';
      var bucketId = bucketIdOf(r);
      var qty = readNum(r, 'field_1964') || 1;

      var p = byProduct[prod];
      if (!p) {
        p = byProduct[prod] = {
          label: prod,
          count: 0,
          isCamReader: false,
          labels: [],
          existCabling: 0, newCabling: 0,
          exterior: 0, interior: 0, plenum: 0,
          subBidSum: 0
        };
        byProduct[prod] = p;
      }

      p.count += qty;
      totals.count += qty;

      if (bucketId === CAM) {
        p.isCamReader = true;
        var devLabel = stripHtml(r.field_1950);
        if (devLabel) p.labels.push(devLabel);

        // Cabling: field_2461 (existing) Yes/No
        if (r.field_2461 != null && stripHtml(r.field_2461) !== '') {
          if (isYes(r, 'field_2461')) { p.existCabling++; totals.existCabling++; }
          else                          { p.newCabling++;   totals.newCabling++; }
        }
        // Exterior: field_1984 Yes/No → interior is implicit "not yes"
        if (r.field_1984 != null && stripHtml(r.field_1984) !== '') {
          if (isYes(r, 'field_1984')) { p.exterior++; totals.exterior++; }
          else                          { p.interior++; totals.interior++; }
        }
        if (isYes(r, 'field_1983')) { p.plenum++; totals.plenum++; }
      }

      var bid = readNum(r, 'field_2150');
      if (bid > 0) {
        p.subBidSum  += bid;
        totals.subBidSum += bid;
      }
    }

    var products = [];
    for (var k in byProduct) products.push(byProduct[k]);
    products.sort(function (a, b) {
      // Cam/reader products first (they group naturally at the top),
      // then alphabetical by label.
      if (a.isCamReader !== b.isCamReader) return a.isCamReader ? -1 : 1;
      return a.label.localeCompare(b.label, undefined,
        { numeric: true, sensitivity: 'base' });
    });

    return { products: products, totals: totals };
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

  function buildL1Summary(l1) {
    var recs = collectRecords(l1);
    if (!recs.length) {
      var wrapEmpty = document.createElement('div');
      wrapEmpty.className = 'scw-ws-v2-summary scw-ws-v2-summary--empty';
      wrapEmpty.innerHTML = '<div class="scw-ws-v2-summary-empty">' +
        'No line items in ' + esc(l1.label) + ' yet.</div>';
      return wrapEmpty;
    }
    var agg = aggregate(recs);
    var rows = '';
    for (var i = 0; i < agg.products.length; i++) {
      rows += productRow(agg.products[i], false);
    }
    var totalProd = {
      label: 'Total',
      count: agg.totals.count,
      isCamReader: true,
      labels: [],
      existCabling: agg.totals.existCabling,
      newCabling:   agg.totals.newCabling,
      exterior:     agg.totals.exterior,
      interior:     agg.totals.interior,
      plenum:       agg.totals.plenum,
      subBidSum:    agg.totals.subBidSum
    };
    rows += productRow(totalProd, true);

    var html =
      '<table class="scw-ws-v2-summary-table">' +
        '<thead><tr>' +
          '<th class="scw-ws-v2-summary-prod">Product</th>' +
          '<th class="scw-ws-v2-summary-num" title="Existing cabling">Exist Cab</th>' +
          '<th class="scw-ws-v2-summary-num" title="New cabling">New Cab</th>' +
          '<th class="scw-ws-v2-summary-num">Ext</th>' +
          '<th class="scw-ws-v2-summary-num">Int</th>' +
          '<th class="scw-ws-v2-summary-num">Plen</th>' +
          '<th class="scw-ws-v2-summary-num">Qty</th>' +
          '<th class="scw-ws-v2-summary-money">Sub Bid</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';

    var wrap = document.createElement('div');
    wrap.className = 'scw-ws-v2-summary';
    wrap.innerHTML = html;
    return wrap;
  }

  ns.summary = {
    buildL1Summary: buildL1Summary
  };
})();
/*** END WORKSHEET V2 — SUMMARY ***********************************************/
