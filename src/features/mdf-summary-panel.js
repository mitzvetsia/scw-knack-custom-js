/*** FEATURE: Per-L1-group summary panel on view_3610 ***/
/**
 * For each MDF/IDF L1 group on the SOW Line Items grid (view_3610),
 * inject a small details-panel <tr> right after the group header. The
 * panel renders a compact grid summarizing the rows under the group
 * by PRODUCT, with a totals row at the bottom.
 *
 * Columns:
 *   Product | Qty | Cabling Existing | Cabling New | Exterior | Interior | Plenum | Avg Sub Bid
 *
 * Cabling, Exterior/Interior, and Plenum are camera-or-reader-only
 * metrics (proposal bucket = 6481e5ba38f283002898113c). For non-cam/
 * reader products those cells render as "—". Average sub bid is
 * computed across all rows that carry a sub-bid value, regardless of
 * bucket.
 *
 * Row order matches the SOW Line Items grid: products sort by their
 * bucket's minimum field_2218 (sortOrder), then alphabetical by label.
 *
 * SOW filter integration: when sow-filter-pills.js applies its filter,
 * filter-hidden rows (.scw-conn-filter-hidden) are dropped from the
 * aggregation so the summary always reflects the visible data.
 *
 * The summary <tr> sits inside the kn-table tbody between the L1
 * header and the first data row, so group-collapse picks it up in the
 * expand/collapse toggle automatically.
 */
(function () {
  'use strict';

  var TARGET_VIEW = 'view_3610';
  var STYLE_ID    = 'scw-mdf-summary-css';
  var NS          = '.scwMdfSummary';
  var ROW_CLASS   = 'scw-mdf-summary-row';

  // Field keys used in the aggregation. These line up with the cam/
  // reader bucketOverride on view_3610 (see device-worksheet.js); for
  // products that don't carry these fields the values just don't
  // contribute, so the summary degrades gracefully.
  var FIELD_PRODUCT   = 'field_1949';   // product label
  var FIELD_BUCKET    = 'field_2219';   // proposal bucket (connection id)
  var FIELD_SORT      = 'field_2218';   // bucket sort order on the row
  var FIELD_CABLING   = 'field_2461';   // existing cabling Y/N
  var FIELD_EXTERIOR  = 'field_1984';   // exterior Y/N
  var FIELD_PLENUM    = 'field_1983';   // plenum Y/N
  var FIELD_SUBBID    = 'field_2150';   // sub bid amount

  // Bucket id for cameras OR readers — only rows in this bucket
  // contribute to cabling / exterior / plenum aggregations.
  var CAM_READER_BUCKET = '6481e5ba38f283002898113c';

  // Filter class applied by sow-filter-pills.js to rows the user has
  // filtered out via the pill strip. Rows carrying this class are
  // skipped during aggregation.
  var FILTER_HIDDEN_CLASS = 'scw-conn-filter-hidden';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      'tr.' + ROW_CLASS + ' > td {' +
      '  background: #f8fafc;' +
      '  padding: 10px 14px;' +
      '  border-top: 1px solid #e2e8f0;' +
      '  border-bottom: 1px solid #e2e8f0;' +
      '}' +
      '.scw-mdf-summary-table {' +
      '  width: 100%; max-width: 920px;' +
      '  border-collapse: collapse;' +
      '  font: 400 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  color: #1e293b;' +
      '}' +
      '.scw-mdf-summary-table th,' +
      '.scw-mdf-summary-table td {' +
      '  padding: 5px 10px;' +
      '  text-align: center;' +
      '  border-bottom: 1px solid #e2e8f0;' +
      '}' +
      '.scw-mdf-summary-table th {' +
      '  font-size: 10px; font-weight: 700;' +
      '  color: #64748b;' +
      '  text-transform: uppercase; letter-spacing: 0.05em;' +
      '  background: #eef2f7;' +
      '  border-bottom: 1px solid #cbd5e1;' +
      '  white-space: nowrap;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-product {' +
      '  text-align: left; color: #07467c; font-weight: 600;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-num {' +
      '  font-variant-numeric: tabular-nums;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-empty {' +
      '  color: #cbd5e1;' +
      '}' +
      '.scw-mdf-summary-table tr.scw-mdf-total td {' +
      '  background: #e0e7ff; color: #1e3a8a;' +
      '  font-weight: 700; border-top: 2px solid #94a3b8;' +
      '  border-bottom: none;' +
      '}' +
      '.scw-mdf-summary-table tr.scw-mdf-total td.scw-mdf-product {' +
      '  color: #1e3a8a; text-align: left;' +
      '}';
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────────
  function readVal(attrs, fieldKey) {
    if (!attrs) return '';
    var raw = attrs[fieldKey + '_raw'];
    if (raw != null && typeof raw !== 'object') return String(raw);
    var v = attrs[fieldKey];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').trim();
  }
  function readBucketId(attrs) {
    if (!attrs) return '';
    var raw = attrs[FIELD_BUCKET + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) return raw[0].id;
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }
  function readNum(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function isYes(v) {
    if (v === true) return true;
    if (typeof v === 'string') return /^yes$/i.test(v.trim());
    return false;
  }
  function fmtMoney(n) {
    if (!isFinite(n)) return '$0';
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function emptyCell() {
    return '<td class="scw-mdf-empty">—</td>';
  }
  function num(n) {
    return '<td class="scw-mdf-num">' + n + '</td>';
  }

  // ── Aggregation ─────────────────────────────────────────────
  // Returns:
  //   {
  //     products: [
  //       { label, count, isCamReader, minBucketSort,
  //         existCabling, newCabling, exterior, interior, plenum,
  //         subBidSum, subBidCount }
  //     ],
  //     totals: { count, existCabling, newCabling, exterior, interior, plenum }
  //   }
  function aggregate(attrsList) {
    var byProduct = {};
    var totals = {
      count: 0, existCabling: 0, newCabling: 0,
      exterior: 0, interior: 0, plenum: 0
    };

    for (var i = 0; i < attrsList.length; i++) {
      var a = attrsList[i];
      var label = readVal(a, FIELD_PRODUCT) || '(no product)';
      var bucketId = readBucketId(a);
      var sortOrder = readNum(readVal(a, FIELD_SORT));

      var p = byProduct[label];
      if (!p) {
        p = {
          label:         label,
          count:         0,
          isCamReader:   false,
          minBucketSort: Infinity,
          existCabling:  0, newCabling: 0,
          exterior:      0, interior:   0,
          plenum:        0,
          subBidSum:     0, subBidCount: 0
        };
        byProduct[label] = p;
      }

      p.count++;
      totals.count++;

      if (sortOrder > 0 && sortOrder < p.minBucketSort) p.minBucketSort = sortOrder;

      // Cabling / exterior / plenum — cam-or-reader bucket only.
      if (bucketId === CAM_READER_BUCKET) {
        p.isCamReader = true;

        var cab = readVal(a, FIELD_CABLING);
        if (cab !== '') {
          if (isYes(cab)) { p.existCabling++; totals.existCabling++; }
          else            { p.newCabling++;   totals.newCabling++; }
        }

        var ext = readVal(a, FIELD_EXTERIOR);
        if (ext !== '') {
          if (isYes(ext)) { p.exterior++; totals.exterior++; }
          else            { p.interior++; totals.interior++; }
        }

        if (isYes(readVal(a, FIELD_PLENUM))) {
          p.plenum++; totals.plenum++;
        }
      }

      // Sub bid — by product, regardless of bucket.
      var bid = readNum(readVal(a, FIELD_SUBBID));
      if (bid > 0) {
        p.subBidSum   += bid;
        p.subBidCount += 1;
      }
    }

    // Sort products by min bucket sortOrder (matches the grid's row
    // order), then alphabetical by label as a tiebreaker.
    var products = Object.keys(byProduct).map(function (k) { return byProduct[k]; });
    products.sort(function (a, b) {
      var ao = isFinite(a.minBucketSort) ? a.minBucketSort : 1e9;
      var bo = isFinite(b.minBucketSort) ? b.minBucketSort : 1e9;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });

    return { products: products, totals: totals };
  }

  // ── Build the panel HTML ────────────────────────────────────
  function buildPanelHtml(data) {
    if (!data || !data.products.length) return '';

    var rows = data.products.map(function (p) {
      var avgBid = p.subBidCount > 0 ? (p.subBidSum / p.subBidCount) : null;
      return '<tr>' +
        '<td class="scw-mdf-product">' + escapeHtml(p.label) + '</td>' +
        num(p.count) +
        (p.isCamReader ? num(p.existCabling) : emptyCell()) +
        (p.isCamReader ? num(p.newCabling)   : emptyCell()) +
        (p.isCamReader ? num(p.exterior)     : emptyCell()) +
        (p.isCamReader ? num(p.interior)     : emptyCell()) +
        (p.isCamReader ? num(p.plenum)       : emptyCell()) +
        (avgBid != null
          ? '<td class="scw-mdf-num">' + fmtMoney(avgBid) + '</td>'
          : emptyCell()) +
      '</tr>';
    }).join('');

    var t = data.totals;
    var totalRow = '<tr class="scw-mdf-total">' +
      '<td class="scw-mdf-product">Total</td>' +
      num(t.count) +
      num(t.existCabling) +
      num(t.newCabling) +
      num(t.exterior) +
      num(t.interior) +
      num(t.plenum) +
      emptyCell() +
    '</tr>';

    return '' +
      '<table class="scw-mdf-summary-table">' +
        '<thead><tr>' +
          '<th style="text-align:left;">Product</th>' +
          '<th>Qty</th>' +
          '<th>Existing<br>Cabling</th>' +
          '<th>New<br>Cabling</th>' +
          '<th>Exterior</th>' +
          '<th>Interior</th>' +
          '<th>Plenum</th>' +
          '<th>Avg Sub Bid</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + totalRow + '</tbody>' +
      '</table>';
  }

  function buildAttrsLookup() {
    var idx = {};
    try {
      var v = window.Knack && Knack.views && Knack.views[TARGET_VIEW];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (models) {
        for (var i = 0; i < models.length; i++) {
          var m = models[i];
          var attrs = m.attributes || m;
          if (attrs && attrs.id) idx[attrs.id] = attrs;
        }
      }
    } catch (e) { /* ignore */ }
    return idx;
  }

  // ── Transform ───────────────────────────────────────────────
  function transform() {
    var view = document.getElementById(TARGET_VIEW);
    if (!view) return;
    var tbody = view.querySelector('table.kn-table tbody');
    if (!tbody) return;

    // Drop previous summaries — recompute is idempotent.
    var prev = tbody.querySelectorAll('tr.' + ROW_CLASS);
    for (var p = 0; p < prev.length; p++) prev[p].remove();

    var attrsById = buildAttrsLookup();
    if (!Object.keys(attrsById).length) return;

    var sampleRow = tbody.querySelector('tr:not(.' + ROW_CLASS + ')');
    var colCount = sampleRow ? sampleRow.children.length : 99;

    var rows = Array.prototype.slice.call(tbody.children);
    var currentL1 = null;
    var currentList = [];

    function flush(_l1, _list) {
      if (!_l1 || !_list.length) return;
      var data = aggregate(_list);
      var html = buildPanelHtml(data);
      if (!html) return;
      var summaryRow = document.createElement('tr');
      summaryRow.className = ROW_CLASS;
      var td = document.createElement('td');
      td.colSpan = colCount;
      td.innerHTML = html;
      summaryRow.appendChild(td);
      // Insert immediately after the L1 header so the row lives in
      // the group's row block (group-collapse toggles the whole block).
      _l1.parentNode.insertBefore(summaryRow, _l1.nextSibling);
    }

    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      if (tr.classList.contains('kn-group-level-1')) {
        flush(currentL1, currentList);
        currentL1 = tr;
        currentList = [];
      } else if (tr.classList.contains('kn-table-group')) {
        // L2 group rows roll into the parent L1 totals.
      } else if (
        !tr.classList.contains('kn-table-totals') &&
        !tr.classList.contains(ROW_CLASS) &&
        !tr.classList.contains(FILTER_HIDDEN_CLASS) &&
        tr.id && attrsById[tr.id]
      ) {
        currentList.push(attrsById[tr.id]);
      }
    }
    flush(currentL1, currentList);
  }

  injectStyles();

  // Debounced scheduler — multiple lifecycle events can fire in quick
  // succession (knack-view-render + scw-worksheet-ready, filter
  // changes, edit saves) and we want them to collapse into one DOM
  // update.
  var _t = null;
  function schedule() {
    if (_t) clearTimeout(_t);
    _t = setTimeout(function () { _t = null; transform(); }, 120);
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(TARGET_VIEW, schedule, NS);
  } else {
    $(document)
      .off('knack-view-render.' + TARGET_VIEW + NS)
      .on('knack-view-render.' + TARGET_VIEW + NS, schedule);
  }

  // device-worksheet emits this after its row transform completes.
  document.addEventListener('scw-worksheet-ready', function (e) {
    if (e && e.detail && e.detail.viewId === TARGET_VIEW) schedule();
  });

  // After inline edits the cell is patched and a record-saved event
  // fires — recompute so the summary reflects the new value.
  $(document).on('scw-record-saved' + NS, schedule);

  // sow-filter-pills toggles the .scw-conn-filter-hidden class on
  // rows. Watch the tbody for that class change so the summary
  // refreshes when the user picks a SOW filter pill. MutationObserver
  // on the tbody attributes catches both add and remove.
  function bindFilterObserver() {
    var view = document.getElementById(TARGET_VIEW);
    if (!view) return;
    var tbody = view.querySelector('table.kn-table tbody');
    if (!tbody || tbody.__scwMdfFilterObs) return;
    var mo = new MutationObserver(function () { schedule(); });
    mo.observe(tbody, {
      subtree:    true,
      attributes: true,
      attributeFilter: ['class']
    });
    tbody.__scwMdfFilterObs = mo;
  }
  $(document).on('knack-view-render.' + TARGET_VIEW + NS + 'Obs', function () {
    setTimeout(bindFilterObserver, 200);
  });

  if (document.getElementById(TARGET_VIEW)) {
    schedule();
    setTimeout(bindFilterObserver, 500);
  }
})();
