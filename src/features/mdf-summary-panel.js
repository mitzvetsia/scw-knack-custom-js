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
  var GRAND_CLASS = 'scw-mdf-grand-summary';

  // Field keys used in the aggregation. These line up with the cam/
  // reader bucketOverride on view_3610 (see device-worksheet.js); for
  // products that don't carry these fields the values just don't
  // contribute, so the summary degrades gracefully.
  var FIELD_PRODUCT   = 'field_1949';   // product label
  var FIELD_QTY       = 'field_1964';   // quantity per row
  var FIELD_LABEL     = 'field_1950';   // device label (cam/reader rows)
  var FIELD_BUCKET    = 'field_2219';   // proposal bucket (connection id)
  var FIELD_SORT      = 'field_2218';   // bucket sort order on the row
  var FIELD_CABLING   = 'field_2461';   // existing cabling Y/N
  var FIELD_EXTERIOR  = 'field_1984';   // exterior Y/N
  var FIELD_PLENUM    = 'field_1983';   // plenum Y/N
  var FIELD_SUBBID    = 'field_2151';   // sub bid total per row (summed in the Total Sub Bid column)

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
      '  width: 100%;' +
      '  table-layout: fixed;' +
      '  border-collapse: collapse;' +
      '  font: 400 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  color: #1e293b;' +
      '  background: #ffffff;' +
      '  border: 1px solid #cbd5e1;' +
      '  border-radius: 4px;' +
      '  overflow: hidden;' +
      '}' +
      // !important on the alignment rules — Knack's .kn-table td
      // selector has the same specificity (0,2,0) as ours and may load
      // after, so center alignment was bleeding to whatever Knack set.
      '.scw-mdf-summary-table th,' +
      '.scw-mdf-summary-table td {' +
      '  padding: 5px 10px !important;' +
      '  text-align: center !important;' +
      '  border-bottom: 1px solid #e2e8f0;' +
      '  vertical-align: middle !important;' +
      '}' +
      '.scw-mdf-summary-table th {' +
      '  font-size: 10px; font-weight: 700;' +
      '  color: #475569;' +
      '  text-transform: uppercase; letter-spacing: 0.05em;' +
      '  background: #e2e8f0;' +
      '  border-bottom: 2px solid #94a3b8;' +
      '  white-space: nowrap;' +
      '}' +
      '.scw-mdf-summary-table th.scw-mdf-product-h,' +
      '.scw-mdf-summary-table td.scw-mdf-product {' +
      '  text-align: left !important;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-product {' +
      '  color: #1e293b; font-weight: 500;' +
      '  padding-left: 22px !important;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-product .scw-mdf-label-list {' +
      '  display: block;' +
      '  margin-top: 4px;' +
      '  font: 400 11px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  color: #64748b;' +
      '  word-break: break-word;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-num {' +
      '  font-variant-numeric: tabular-nums;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-empty {' +
      '  color: #cbd5e1;' +
      '}' +
      // Bucket section heading — the leading row of each bucket group.
      // Solid slate band with all-caps label spanning the full width;
      // doubles as the visual separator between buckets so the eye can
      // skim "Networking → Other Equipment → Camera or Reader" without
      // hunting for italicized subtotals.
      '.scw-mdf-summary-table tr.scw-mdf-bucket-head td {' +
      '  background: #334155 !important;' +
      '  color: #f1f5f9 !important;' +
      '  font: 700 10.5px/1 system-ui, -apple-system, "Segoe UI", sans-serif !important;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.08em;' +
      '  padding: 7px 14px !important;' +
      '  text-align: left !important;' +
      '  border-bottom: 1px solid #1e293b;' +
      '}' +
      // Camera-or-Reader band carries inline column labels for the
      // cabling/exterior/interior/plenum block. The label cell stays
      // big-and-left like other bucket heads; the column-label cells
      // are smaller, centered, and tighter so they read as headers
      // rather than as section titles.
      '.scw-mdf-summary-table tr.scw-mdf-bucket-head--cr td.scw-mdf-bh-col {' +
      '  font: 700 9.5px/1.15 system-ui, -apple-system, "Segoe UI", sans-serif !important;' +
      '  text-align: center !important;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.04em;' +
      '  padding: 7px 4px !important;' +
      '  white-space: normal;' +
      '  color: #cbd5e1 !important;' +
      '}' +
      // Visual gap between bucket sections — a sliver of the panel
      // background shows through above every bucket-head except the
      // first. Cheaper than a spacer row and doesn't fight colspan.
      '.scw-mdf-summary-table tbody tr.scw-mdf-bucket-head:not(:first-child) td {' +
      '  border-top: 6px solid #f8fafc;' +
      '}' +
      // Bucket subtotal — semi-bold, light slate band; pairs visually
      // with the dark bucket-head above and clearly closes the section.
      '.scw-mdf-summary-table tr.scw-mdf-subtotal td {' +
      '  background: #e2e8f0; color: #0f172a;' +
      '  font-weight: 700;' +
      '  border-top: 1px solid #94a3b8;' +
      '  border-bottom: 1px solid #94a3b8;' +
      '}' +
      '.scw-mdf-summary-table tr.scw-mdf-subtotal td.scw-mdf-product {' +
      '  color: #0f172a; text-align: left; padding-left: 22px !important;' +
      '}' +
      // Grand Total — strongest visual weight: deep blue band, white
      // text, no border bleed. Always the bottom anchor of the panel.
      '.scw-mdf-summary-table tr.scw-mdf-total td {' +
      '  background: #1e3a8a; color: #ffffff;' +
      '  font-weight: 800; font-size: 12.5px;' +
      '  border-top: 2px solid #1e3a8a;' +
      '  border-bottom: none;' +
      '}' +
      '.scw-mdf-summary-table tr.scw-mdf-total td.scw-mdf-product {' +
      '  color: #ffffff; text-align: left;' +
      '  text-transform: uppercase; letter-spacing: 0.05em;' +
      '  padding-left: 14px !important;' +
      '}' +
      // Grand-summary wrapper — mounted above the kn-table so it sits
      // outside Knack's grouping/pagination machinery. Uses the same
      // .scw-mdf-summary-table renderer; only the chrome differs.
      '.' + GRAND_CLASS + ' {' +
      '  margin: 8px 0 12px;' +
      '  padding: 10px 14px;' +
      '  background: #f1f5f9;' +
      '  border: 1px solid #cbd5e1;' +
      '  border-radius: 4px;' +
      '}' +
      '.' + GRAND_CLASS + ' .scw-mdf-grand-title {' +
      '  font: 700 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  color: #475569;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.06em;' +
      '  margin-bottom: 6px;' +
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
  function readBucketLabel(attrs) {
    if (!attrs) return '';
    var raw = attrs[FIELD_BUCKET + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].identifier || '';
    if (raw && typeof raw === 'object' && raw.identifier) return raw.identifier;
    // Fallback to the rendered value (HTML stripped) if _raw is absent.
    return readVal(attrs, FIELD_BUCKET);
  }
  function readNum(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function isYes(v) {
    if (v === true) return true;
    // Match "yes" AND "true" — Knack stores Yes/No fields as booleans
    // in *_raw, which readVal stringifies to "true"/"false". Without
    // the "true" branch, every chit reading from the raw value got
    // miscounted as No.
    if (typeof v === 'string') return /^(yes|true)$/i.test(v.trim());
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
  function blankCell() {
    return '<td></td>';
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
      exterior: 0, interior: 0, plenum: 0,
      subBidSum: 0, subBidCount: 0
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
          bucketId:      bucketId,
          bucketLabel:   readBucketLabel(a),
          minBucketSort: Infinity,
          firstSeenIdx:  i,
          existCabling:  0, newCabling: 0,
          exterior:      0, interior:   0,
          plenum:        0,
          subBidSum:     0, subBidCount: 0,
          labels:        []
        };
        byProduct[label] = p;
      }
      // First non-empty bucket wins — handles rows where the bucket is
      // missing on some records.
      if (!p.bucketId && bucketId) {
        p.bucketId = bucketId;
        p.bucketLabel = readBucketLabel(a);
      }

      // Qty column sums field_1964 (per-row quantity), not record count.
      // Rows with a missing/zero qty contribute 0.
      var qty = readNum(readVal(a, FIELD_QTY));
      p.count       += qty;
      totals.count  += qty;

      // Use >= 0 (not > 0) — bucket sortOrder of 0 is legitimate
      // (e.g. "Networking or Headend"). Excluding it left those products
      // with minBucketSort = Infinity and dropped them to the bottom of
      // the summary even though the data rows put them at the top.
      if (sortOrder >= 0 && sortOrder < p.minBucketSort) p.minBucketSort = sortOrder;

      // Cabling / exterior / plenum — cam-or-reader bucket only.
      if (bucketId === CAM_READER_BUCKET) {
        p.isCamReader = true;

        var devLabel = readVal(a, FIELD_LABEL);
        if (devLabel) p.labels.push(devLabel);

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

      // Sub bid — by product, regardless of bucket. Tracked on totals
      // too so the Total row can show a weighted average.
      var bid = readNum(readVal(a, FIELD_SUBBID));
      if (bid > 0) {
        p.subBidSum   += bid;
        p.subBidCount += 1;
        totals.subBidSum   += bid;
        totals.subBidCount += 1;
      }
    }

    // Sort products by min bucket sortOrder (field_2218 — the same
    // proposal-bucket sort order used to order data rows in the grid),
    // then by first-seen row index so the tiebreaker mirrors the
    // visible grid order rather than reverting to alphabetic.
    var products = Object.keys(byProduct).map(function (k) { return byProduct[k]; });
    products.sort(function (a, b) {
      var ao = isFinite(a.minBucketSort) ? a.minBucketSort : 1e9;
      var bo = isFinite(b.minBucketSort) ? b.minBucketSort : 1e9;
      if (ao !== bo) return ao - bo;
      return a.firstSeenIdx - b.firstSeenIdx;
    });

    return { products: products, totals: totals };
  }

  // ── Build the panel HTML ────────────────────────────────────
  // Column order: Product, ExistCabling, NewCabling, Exterior, Interior,
  // Plenum, Qty, Avg Sub Bid. Cabling/exterior/plenum cells stay blank
  // for non-cam/reader rows (no "—" placeholder) — those metrics only
  // apply to the Camera or Reader bucket and the column labels live on
  // that bucket's head row.
  function productRowHtml(p, opts) {
    opts = opts || {};
    var totalBid = p.subBidCount > 0 ? p.subBidSum : null;
    var labelList = '';
    if (!opts.isSubtotal && p.isCamReader && p.labels.length) {
      var sorted = p.labels.slice().sort(function (a, b) {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });
      labelList = '<span class="scw-mdf-label-list">' +
        sorted.map(escapeHtml).join(', ') +
        '</span>';
    }
    var cls = opts.isSubtotal ? ' class="scw-mdf-subtotal"' : '';
    // Cam/reader-only metrics show on cam/reader product rows AND on
    // the cam/reader bucket subtotal (opts.bucketIsCR). For everything
    // else those columns are empty.
    var showCR = opts.isSubtotal ? !!opts.bucketIsCR : p.isCamReader;
    return '<tr' + cls + '>' +
      '<td class="scw-mdf-product">' + escapeHtml(p.label) + labelList + '</td>' +
      (showCR ? num(p.existCabling) : blankCell()) +
      (showCR ? num(p.newCabling)   : blankCell()) +
      (showCR ? num(p.exterior)     : blankCell()) +
      (showCR ? num(p.interior)     : blankCell()) +
      (showCR ? num(p.plenum)       : blankCell()) +
      num(p.count) +
      (totalBid != null
        ? '<td class="scw-mdf-num">' + fmtMoney(totalBid) + '</td>'
        : blankCell()) +
    '</tr>';
  }

  // Sum the per-bucket subtotal struct from a slice of products.
  function bucketSubtotal(products, label) {
    var st = {
      label: label, count: 0, isCamReader: false,
      existCabling: 0, newCabling: 0,
      exterior: 0, interior: 0, plenum: 0,
      subBidSum: 0, subBidCount: 0
    };
    for (var i = 0; i < products.length; i++) {
      var p = products[i];
      st.count        += p.count;
      st.existCabling += p.existCabling;
      st.newCabling   += p.newCabling;
      st.exterior     += p.exterior;
      st.interior     += p.interior;
      st.plenum       += p.plenum;
      st.subBidSum    += p.subBidSum;
      st.subBidCount  += p.subBidCount;
      if (p.isCamReader) st.isCamReader = true;
    }
    return st;
  }

  function buildPanelHtml(data) {
    if (!data || !data.products.length) return '';

    // Walk products in their already-sorted order (by minBucketSort,
    // then firstSeenIdx). Whenever the bucket changes, emit a subtotal
    // row for the previous bucket. Only emit subtotals when there is
    // more than one bucket present — a single-bucket panel just gets
    // the grand Total at the bottom.
    var groups = [];
    var current = null;
    for (var i = 0; i < data.products.length; i++) {
      var p = data.products[i];
      var key = p.bucketId || ('__sort_' + (isFinite(p.minBucketSort) ? p.minBucketSort : 'na'));
      if (!current || current.key !== key) {
        current = {
          key:   key,
          label: p.bucketLabel || 'Other',
          items: []
        };
        groups.push(current);
      }
      current.items.push(p);
    }

    // Emit a bucket-head row when:
    //   (a) multiple buckets are present (visual separator), or
    //   (b) this is the Camera or Reader bucket — its band carries the
    //       cabling/exterior/interior/plenum column labels, since those
    //       metrics only apply to that bucket and don't belong in the
    //       table-wide thead.
    var hasMultipleBuckets = groups.length > 1;
    var rows = '';
    for (var g = 0; g < groups.length; g++) {
      var grp = groups[g];
      var isCR = grp.key === CAM_READER_BUCKET;

      if (isCR) {
        // Camera-or-Reader band: bucket name in the Product column,
        // per-column labels in the cabling/exterior/interior/plenum
        // columns. Right-side Qty + Avg Sub Bid columns left blank
        // (their labels live in the table thead).
        rows +=
          '<tr class="scw-mdf-bucket-head scw-mdf-bucket-head--cr">' +
            '<td class="scw-mdf-bh-label">' + escapeHtml(grp.label) + '</td>' +
            '<td class="scw-mdf-bh-col">Existing<br>Cabling</td>' +
            '<td class="scw-mdf-bh-col">New<br>Cabling</td>' +
            '<td class="scw-mdf-bh-col">Exterior</td>' +
            '<td class="scw-mdf-bh-col">Interior</td>' +
            '<td class="scw-mdf-bh-col">Plenum</td>' +
            '<td></td>' +
            '<td></td>' +
          '</tr>';
      } else if (hasMultipleBuckets) {
        rows += '<tr class="scw-mdf-bucket-head">' +
          '<td colspan="8">' + escapeHtml(grp.label) + '</td>' +
        '</tr>';
      }

      for (var k = 0; k < grp.items.length; k++) {
        rows += productRowHtml(grp.items[k]);
      }

      if (hasMultipleBuckets) {
        var st = bucketSubtotal(grp.items, 'Subtotal');
        rows += productRowHtml(st, { isSubtotal: true, bucketIsCR: isCR });
      }
    }

    // Total: only Qty and Total Sub Bid (sum of field_2151 across every
    // contributing row). Cabling/exterior/etc are blank — those metrics
    // are camera-or-reader-specific and don't make sense on a project-
    // wide grand total line.
    var t = data.totals;
    var grandTotal = t.subBidCount > 0 ? t.subBidSum : null;
    var totalRow = '<tr class="scw-mdf-total">' +
      '<td class="scw-mdf-product">Total</td>' +
      blankCell() +
      blankCell() +
      blankCell() +
      blankCell() +
      blankCell() +
      num(t.count) +
      (grandTotal != null
        ? '<td class="scw-mdf-num">' + fmtMoney(grandTotal) + '</td>'
        : blankCell()) +
    '</tr>';

    // Fixed colgroup so every L1 summary table renders with the same
    // column widths regardless of product-name length. Without this, a
    // long product name in one group would push the numeric columns
    // right while neighbouring groups stayed compact, and the panels
    // wouldn't visually line up under each other.
    //
    // Column order: Product, ExistCabling, NewCabling, Exterior,
    // Interior, Plenum, Qty, AvgSubBid. Qty + AvgSubBid live last
    // because they're the only two columns that apply to every row;
    // the cabling/exterior/etc block sits in the middle and is empty
    // for non-cam/reader rows.
    return '' +
      '<table class="scw-mdf-summary-table">' +
        '<colgroup>' +
          '<col style="width:42%">' +     // Product
          '<col style="width:10%">' +     // Existing Cabling
          '<col style="width:10%">' +     // New Cabling
          '<col style="width:8%">' +      // Exterior
          '<col style="width:8%">' +      // Interior
          '<col style="width:6%">' +      // Plenum
          '<col style="width:6%">' +      // Qty
          '<col style="width:10%">' +     // Avg Sub Bid
        '</colgroup>' +
        '<thead><tr>' +
          '<th class="scw-mdf-product-h">Product</th>' +
          '<th colspan="5"></th>' +
          '<th>Qty</th>' +
          '<th>Total Sub Bid</th>' +
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
    var grandList = [];

    function flush(_l1, _list) {
      if (!_l1 || !_list.length) return;
      // Skip synthetic L1 groups ("Project Wide Services" /
      // "Project Wide Assumptions") — those rows aren't part of an
      // MDF/IDF, so the summary doesn't make sense for them.
      if (_l1.classList.contains('scw-synthetic-group')) return;
      var data = aggregate(_list);
      var html = buildPanelHtml(data);
      if (!html) return;
      var summaryRow = document.createElement('tr');
      summaryRow.className = ROW_CLASS;
      // Mirror the L1 header's current collapse state. group-collapse
      // applies/removes display:none on toggle, so this is just the
      // initial-state alignment for rows that were collapsed before
      // the summary was injected.
      if (_l1.classList.contains('scw-collapsed')) {
        summaryRow.style.display = 'none';
      }
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
        // Only count the visible card rows. The original Knack data row
        // (tr[data-scw-worksheet]) and inserted photo row share the
        // record id, so without this filter every record was walked
        // multiple times — doubling counts/labels and corrupting the
        // firstSeenIdx ordering used by aggregate's sort.
        tr.classList.contains('scw-ws-row') &&
        !tr.classList.contains(FILTER_HIDDEN_CLASS) &&
        tr.id && attrsById[tr.id]
      ) {
        currentList.push(attrsById[tr.id]);
        // Skip rows that belong to a synthetic L1 ("Project Wide
        // Services" / "Project Wide Assumptions") — same exclusion the
        // per-L1 flush() applies, so the grand totals match the sum of
        // the visible per-L1 panels.
        if (!currentL1 || !currentL1.classList.contains('scw-synthetic-group')) {
          grandList.push(attrsById[tr.id]);
        }
      }
    }
    flush(currentL1, currentList);

    renderGrand(view, grandList);
  }

  function renderGrand(view, list) {
    var prev = view.querySelector('.' + GRAND_CLASS);
    if (prev) prev.remove();
    if (!list.length) return;

    var html = buildPanelHtml(aggregate(list));
    if (!html) return;

    var wrap = document.createElement('div');
    wrap.className = GRAND_CLASS;
    wrap.innerHTML =
      '<div class="scw-mdf-grand-title">Summary — All Groups</div>' + html;

    // Mount just above the kn-table so the grand summary sits outside
    // Knack's grouping/pagination machinery (and isn't toggled by
    // group-collapse).
    var table = view.querySelector('table.kn-table');
    if (table && table.parentNode) {
      table.parentNode.insertBefore(wrap, table);
    }
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

  // Primary refresh trigger after a SOW filter pill click — sow-filter-
  // pills.js dispatches this CustomEvent from applyFilter(). Direct
  // event > tbody MutationObserver because Knack frequently rebuilds
  // the tbody, leaving observers attached to detached elements.
  document.addEventListener('scw-conn-filter-changed', function (e) {
    if (e && e.detail && e.detail.viewId === TARGET_VIEW) schedule();
  });

  // Fallback: MutationObserver on tbody for filter-class changes that
  // didn't go through the event path (DevTools, future callers, etc.).
  // Re-bound on every view render since Knack may have replaced tbody.
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
