/*** FEATURE: Per-L1-group summary panel on every device-worksheet view *******/
/**
 * For each MDF/IDF L1 group on a device-worksheet grid, inject a small
 * details-panel <tr> right after the group header. The panel renders a
 * compact grid summarizing the rows under the group by PRODUCT, with a
 * totals row at the bottom. Plus a single "grand summary" panel above
 * the table aggregating every visible row.
 *
 * Auto-targets every view that renders worksheet card rows
 * (tr.scw-ws-row), the same canonical marker as
 * device-worksheet-toolbar.js. New worksheet views get summaries
 * without per-view configuration.
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

  var STYLE_ID    = 'scw-mdf-summary-css';
  var NS          = '.scwMdfSummary';
  var ROW_CLASS   = 'scw-mdf-summary-row';
  var GRAND_CLASS = 'scw-mdf-grand-summary';
  var CARD_CLASS  = 'scw-mdf-card';

  // ── Per-panel collapsed-state persistence ────────────────────
  // Keyed by (scene, view, panelKey).  panelKey is "grand" for the
  // grand summary, the L1 group's label text for per-group panels.
  function getMdfSceneId() {
    var bodyId = document.body && document.body.id;
    if (bodyId) {
      var m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    return 'unknown_scene';
  }
  function panelStorageKey(viewId, panelKey) {
    return 'scw:mdf-panel:' + getMdfSceneId() + ':' + viewId + ':' + panelKey;
  }
  function isPanelCollapsed(viewId, panelKey) {
    try { return localStorage.getItem(panelStorageKey(viewId, panelKey)) === 'collapsed'; }
    catch (e) { return false; }
  }
  function savePanelCollapsed(viewId, panelKey, collapsed) {
    try {
      if (collapsed) localStorage.setItem(panelStorageKey(viewId, panelKey), 'collapsed');
      else           localStorage.removeItem(panelStorageKey(viewId, panelKey));
    } catch (e) { /* ignore */ }
  }

  function wrapInCard(html, opts) {
    var collapsed = isPanelCollapsed(opts.viewId, opts.panelKey);
    return '<div class="' + CARD_CLASS +
      (collapsed ? ' ' + CARD_CLASS + '--collapsed' : '') + '" ' +
      'data-view-id="' + escapeHtml(opts.viewId) + '" ' +
      'data-panel-key="' + escapeHtml(opts.panelKey) + '">' +
      '<button type="button" class="' + CARD_CLASS + '__head">' +
        '<span class="' + CARD_CLASS + '__title">' + escapeHtml(opts.title) + '</span>' +
        '<svg class="' + CARD_CLASS + '__chevron" viewBox="0 0 24 24" ' +
          'fill="none" stroke="currentColor" stroke-width="2.5" ' +
          'stroke-linecap="round" stroke-linejoin="round">' +
          '<polyline points="6 9 12 15 18 9"></polyline></svg>' +
      '</button>' +
      '<div class="' + CARD_CLASS + '__body">' + html + '</div>' +
    '</div>';
  }

  // Document-level click handler — one binding, handles every card.
  // Idempotent via the data-attribute flag so reloads don't stack
  // duplicate listeners.
  if (!document.documentElement.hasAttribute('data-scw-mdf-card-bound')) {
    document.documentElement.setAttribute('data-scw-mdf-card-bound', '1');
    document.addEventListener('click', function (e) {
      var head = e.target && e.target.closest && e.target.closest('.' + CARD_CLASS + '__head');
      if (!head) return;
      var card = head.closest('.' + CARD_CLASS);
      if (!card) return;
      var nowCollapsed = !card.classList.contains(CARD_CLASS + '--collapsed');
      card.classList.toggle(CARD_CLASS + '--collapsed', nowCollapsed);
      savePanelCollapsed(
        card.getAttribute('data-view-id') || '',
        card.getAttribute('data-panel-key') || '',
        nowCollapsed
      );
    });
  }

  // ── Per-view field maps ─────────────────────────────────
  // The default targets SOW Line Items (view_3610 family). Other
  // worksheet objects need their own entry — same role shape, different
  // field keys. The bucket record IDs below (CAM_READER_BUCKET) are the
  // SAME across all worksheet objects because they reference the same
  // Proposal Bucket records — only the field keys vary.
  //
  // To add a new worksheet view: inspect a row's data attributes (or
  // grep the view\'s table headers in DevTools) and map each role to
  // the appropriate field key on that object. Views that already map
  // 1:1 to one of the entries below should reuse it via FIELD_ALIASES.
  var FIELD_MAPS = {
    // SOW Line Items — view_3610 / view_3921 family.
    'default': {
      product:  'field_1949',  // product label (full SKU)
      qty:      'field_1964',  // quantity per row
      label:    'field_1950',  // device label (cam/reader rows: E-001, I-002, ...)
      bucket:   'field_2219',  // proposal bucket connection
      sort:     'field_2218',  // bucket sort order (same field on every worksheet)
      cabling:  'field_2461',  // existing cabling Y/N
      exterior: 'field_1984',  // exterior Y/N
      plenum:   'field_1983',  // plenum Y/N
      subbid:   'field_2151'   // sub bid total per row
    },
    // Survey Line Items — subcontractor portal (view_3505 + family).
    'view_3505': {
      product:  'field_2627',
      qty:      'field_2399',
      label:    'field_2365',
      bucket:   'field_2366',
      sort:     'field_2218',
      cabling:  'field_2370',
      exterior: 'field_2372',
      plenum:   'field_2371',
      subbid:   'field_2401'
    },
    // SOW Line Items — sales portal (view_3586). Same schema as the
    // 3610 family for product/qty/label/bucket/cabling/exterior, but
    // the aggregation column reads field_2269 (line item total) since
    // view_3586 doesn't expose field_2151 (sub bid total). Plenum
    // (field_1983) may not appear on every row — aggregation treats
    // missing cells as 0 which is correct here.
    'view_3586': {
      product:  'field_1949',
      qty:      'field_1964',
      label:    'field_1950',
      bucket:   'field_2219',
      sort:     'field_2218',
      cabling:  'field_2461',
      exterior: 'field_1984',
      plenum:   'field_1983',
      subbid:   'field_2269'
    },
    // Deploy / Install Line Items — view_3915. Install records have one
    // device per row with no quantity field, so qtyMode:'count' makes
    // each row contribute 1 to the Qty aggregation. No sub-bid field on
    // this object — the subbid column lands at 0 (the "Total Sub Bid"
    // header is misleading on this view but acceptable for v1).
    'view_3915': {
      product:  'field_2790',
      qty:      'field_2819',   // unused when qtyMode='count'; harmless placeholder
      qtyMode:  'count',
      label:    'field_2819',
      bucket:   'field_2822',
      sort:     'field_2218',
      cabling:  'field_2807',
      exterior: 'field_2805',
      plenum:   'field_2806',
      subbid:   ''              // no sub bid on install object — aggregation = 0
    }
  };

  // Views that share another view\'s schema. Add an alias here instead
  // of duplicating the field map.
  var FIELD_ALIASES = {
    // Subcontractor-portal sibling views (haven\'t yet been DOM-inspected;
    // add one when confirmed):
    // 'view_3559': 'view_3505',
  };

  function fieldsFor(viewId) {
    var key = FIELD_ALIASES[viewId] || viewId;
    return FIELD_MAPS[key] || FIELD_MAPS['default'];
  }

  // Explicit opt-in — only views listed below (or aliased to one) get
  // summary panels. Auto-detection by tr.scw-ws-row is too broad: it
  // matches MDF/IDF views (view_3617), photo views, and other sibling
  // worksheet-shaped views whose schemas don't map to the summary
  // aggregation. Rendering an empty "(no product)/Total: 0" panel on
  // those views is best-case useless and worst-case interferes with
  // Knack's render cycle.
  //
  // To enable a new view: add it to FIELD_MAPS (with its schema) or
  // FIELD_ALIASES (sharing another view's schema).
  function isSupportedView(viewId) {
    return Object.prototype.hasOwnProperty.call(FIELD_MAPS, viewId) ||
           Object.prototype.hasOwnProperty.call(FIELD_ALIASES, viewId) ||
           viewId === 'view_3610' || viewId === 'view_3921';
    // Note: view_3586 and view_3915 already have explicit FIELD_MAPS
    // entries, so they're matched by the first hasOwnProperty check.
  }

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
      '  background: var(--scw-surface-subtle);' +
      '  padding: 10px 14px;' +
      '  border-top: 1px solid var(--scw-border-subtle);' +
      '  border-bottom: 1px solid var(--scw-border-subtle);' +
      '}' +
      '.scw-mdf-summary-table {' +
      '  width: 100%;' +
      '  table-layout: fixed;' +
      '  border-collapse: collapse;' +
      '  font: 400 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  color: var(--scw-text-default);' +
      '  background: var(--scw-surface-base);' +
      '  border: 1px solid var(--scw-border-default);' +
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
      '  border-bottom: 1px solid var(--scw-border-subtle);' +
      '  vertical-align: middle !important;' +
      '}' +
      '.scw-mdf-summary-table th {' +
      '  font-size: 10px; font-weight: 700;' +
      '  color: var(--scw-text-caption);' +
      '  text-transform: uppercase; letter-spacing: 0.05em;' +
      '  background: transparent;' +
      '  border-bottom: 1px solid var(--scw-border-default);' +
      '  white-space: nowrap;' +
      '  padding-top: 4px !important; padding-bottom: 8px !important;' +
      '}' +
      '.scw-mdf-summary-table th.scw-mdf-product-h,' +
      '.scw-mdf-summary-table td.scw-mdf-product {' +
      '  text-align: left !important;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-product {' +
      '  color: var(--scw-text-default); font-weight: 500;' +
      '  padding-left: 22px !important;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-product .scw-mdf-label-list {' +
      '  display: block;' +
      '  margin-top: 4px;' +
      '  font: 400 11px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  color: var(--scw-text-muted);' +
      '  word-break: break-word;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-num {' +
      '  font-variant-numeric: tabular-nums;' +
      '}' +
      // Right-align numeric columns (Qty + Total Sub Bid) in BOTH header
      // and data rows so the digits line up under their labels rather
      // than floating centered. Tabular-nums above keeps glyph widths
      // uniform so the right edge is genuinely flush.
      '.scw-mdf-summary-table th.scw-mdf-num-h,' +
      '.scw-mdf-summary-table td.scw-mdf-num {' +
      '  text-align: right !important;' +
      '  padding-right: 14px !important;' +
      '}' +
      '.scw-mdf-summary-table td.scw-mdf-empty {' +
      '  color: var(--scw-border-default);' +
      '}' +
      // Bucket section heading — no fill, just a small uppercase muted
      // label that acts as a section header. Section separation is a
      // thin top-border for every bucket head except the first.
      '.scw-mdf-summary-table tr.scw-mdf-bucket-head td {' +
      '  background: transparent !important;' +
      '  color: var(--scw-text-caption) !important;' +
      '  font: 600 10px/1 system-ui, -apple-system, "Segoe UI", sans-serif !important;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.08em;' +
      '  padding: 14px 14px 4px !important;' +
      '  text-align: left !important;' +
      '  border-bottom: 0 !important;' +
      '}' +
      // Camera-or-Reader band carries inline column labels for the
      // cabling/exterior/interior/plenum block. Same muted treatment as
      // the rest of the section header so it doesn\'t shout.
      '.scw-mdf-summary-table tr.scw-mdf-bucket-head--cr td.scw-mdf-bh-col {' +
      '  font: 600 9.5px/1.15 system-ui, -apple-system, "Segoe UI", sans-serif !important;' +
      '  text-align: center !important;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.04em;' +
      '  padding: 14px 4px 4px !important;' +
      '  white-space: normal;' +
      '  color: var(--scw-text-caption) !important;' +
      '  border-left: 0 !important;' +
      '}' +
      // Thin hairline at the top of each bucket section (skip first).
      // This is the only chrome separating sections — no band needed.
      '.scw-mdf-summary-table tbody tr.scw-mdf-bucket-head:not(:first-child) td {' +
      '  border-top: 1px solid var(--scw-border-subtle);' +
      '}' +
      // Bucket subtotal — no fill, top hairline + slightly bolder text.
      '.scw-mdf-summary-table tr.scw-mdf-subtotal td {' +
      '  background: transparent !important;' +
      '  color: var(--scw-text-body);' +
      '  font-weight: 600;' +
      '  border-top: 1px solid var(--scw-border-subtle);' +
      '  border-bottom: 0;' +
      '}' +
      '.scw-mdf-summary-table tr.scw-mdf-subtotal td.scw-mdf-product {' +
      '  color: var(--scw-text-muted); text-align: left; padding-left: 22px !important;' +
      '}' +
      // Grand Total — no fill, double-strength top border + bold text
      // as the table\'s closing emphasis.
      '.scw-mdf-summary-table tr.scw-mdf-total td {' +
      '  background: transparent !important;' +
      '  color: var(--scw-text-emphasis);' +
      '  font-weight: 700; font-size: 12.5px;' +
      '  border-top: 2px solid var(--scw-border-default);' +
      '  border-bottom: none;' +
      '  padding-top: 8px !important;' +
      '}' +
      '.scw-mdf-summary-table tr.scw-mdf-total td.scw-mdf-product {' +
      '  color: var(--scw-text-emphasis); text-align: left;' +
      '  text-transform: uppercase; letter-spacing: 0.05em;' +
      '  padding-left: 14px !important;' +
      '}' +
      // Per-row dividers — tone down so they read as alignment lines
      // not a striped pattern.  Skip on the last visible row of a group
      // (subtotal/total already carry their own top border).
      '.scw-mdf-summary-table tbody td {' +
      '  border-bottom-color: transparent !important;' +
      '}' +
      // Grand-summary outer wrapper — just margins; the card chrome
      // inside does the actual styling.
      '.' + GRAND_CLASS + ' {' +
      '  margin: 4px 0 14px;' +
      '  padding: 0;' +
      '  background: transparent;' +
      '  border: 0;' +
      '}' +
      // ── Card chrome (shared between grand + per-L1 panels) ──
      '.' + CARD_CLASS + ' {' +
      '  background: var(--scw-surface-base, #fff);' +
      '  border: 1px solid var(--scw-border-default, #d1d5db);' +
      '  border-left: 4px solid var(--scw-accent, #0f4c75);' +
      '  border-radius: 8px;' +
      '  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);' +
      '  overflow: hidden;' +
      '  margin: 0;' +
      '}' +
      '.' + ROW_CLASS + ' .' + CARD_CLASS + ' {' +
      // L1 panel sits inside a table row; tighten outer margins so it
      // hugs the row container rather than floating.
      '  margin: 4px 0;' +
      '}' +
      '.' + CARD_CLASS + '__head {' +
      '  display: flex; align-items: center; gap: 8px;' +
      '  width: 100%;' +
      '  padding: 10px 14px;' +
      '  background: var(--scw-surface-subtle, #f8fafc);' +
      '  border: 0; border-bottom: 1px solid var(--scw-border-subtle, #e2e8f0);' +
      '  cursor: pointer; text-align: left;' +
      '  font: 700 11px/1 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  text-transform: uppercase;' +
      '  letter-spacing: 0.08em;' +
      '  color: var(--scw-text-default, #1f2937);' +
      '  transition: background 120ms ease;' +
      '}' +
      '.' + CARD_CLASS + '__head:hover {' +
      '  background: var(--scw-surface-muted, #f1f5f9);' +
      '}' +
      '.' + CARD_CLASS + '__title { flex: 1 1 auto; }' +
      '.' + CARD_CLASS + '__chevron {' +
      '  width: 14px; height: 14px; flex: 0 0 auto;' +
      '  color: var(--scw-text-muted, #64748b);' +
      '  transition: transform 150ms ease;' +
      '}' +
      '.' + CARD_CLASS + '--collapsed .' + CARD_CLASS + '__chevron {' +
      '  transform: rotate(-90deg);' +
      '}' +
      '.' + CARD_CLASS + '--collapsed .' + CARD_CLASS + '__head {' +
      '  border-bottom-color: transparent;' +
      '}' +
      '.' + CARD_CLASS + '__body {' +
      '  padding: 10px 14px 14px;' +
      '}' +
      '.' + CARD_CLASS + '--collapsed .' + CARD_CLASS + '__body {' +
      '  display: none;' +
      '}' +
      // Inner table needs no extra border now that the card has it.
      '.' + CARD_CLASS + ' .scw-mdf-summary-table {' +
      '  border: 0; border-radius: 0;' +
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
  function readBucketId(attrs, fields) {
    if (!attrs) return '';
    var raw = attrs[fields.bucket + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0] && raw[0].id) return raw[0].id;
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }
  function readBucketLabel(attrs, fields) {
    if (!attrs) return '';
    var raw = attrs[fields.bucket + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].identifier || '';
    if (raw && typeof raw === 'object' && raw.identifier) return raw.identifier;
    // Fallback to the rendered value (HTML stripped) if _raw is absent.
    return readVal(attrs, fields.bucket);
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
  function aggregate(attrsList, fields) {
    var byProduct = {};
    var totals = {
      count: 0, existCabling: 0, newCabling: 0,
      exterior: 0, interior: 0, plenum: 0,
      subBidSum: 0, subBidCount: 0
    };

    for (var i = 0; i < attrsList.length; i++) {
      var a = attrsList[i];
      var label = readVal(a, fields.product) || '(no product)';
      var bucketId = readBucketId(a, fields);
      var sortOrder = readNum(readVal(a, fields.sort));

      var p = byProduct[label];
      if (!p) {
        p = {
          label:         label,
          count:         0,
          isCamReader:   false,
          bucketId:      bucketId,
          bucketLabel:   readBucketLabel(a, fields),
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
        p.bucketLabel = readBucketLabel(a, fields);
      }

      // Qty column sums the per-row quantity, not record count. Rows
      // with a missing/zero qty contribute 0. Views whose underlying
      // object has no quantity field (e.g. install records on view_3915,
      // one device per row) set qtyMode='count' to contribute 1/row.
      var qty = (fields.qtyMode === 'count')
        ? 1
        : readNum(readVal(a, fields.qty));
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

        var devLabel = readVal(a, fields.label);
        if (devLabel) p.labels.push(devLabel);

        var cab = readVal(a, fields.cabling);
        if (cab !== '') {
          if (isYes(cab)) { p.existCabling++; totals.existCabling++; }
          else            { p.newCabling++;   totals.newCabling++; }
        }

        var ext = readVal(a, fields.exterior);
        if (ext !== '') {
          if (isYes(ext)) { p.exterior++; totals.exterior++; }
          else            { p.interior++; totals.interior++; }
        }

        if (isYes(readVal(a, fields.plenum))) {
          p.plenum++; totals.plenum++;
        }
      }

      // Sub bid — by product, regardless of bucket. Tracked on totals
      // too so the Total row can show a weighted average.
      var bid = readNum(readVal(a, fields.subbid));
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
      (opts.hideSubbid
        ? ''
        : (totalBid != null
            ? '<td class="scw-mdf-num">' + fmtMoney(totalBid) + '</td>'
            : blankCell())) +
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

  function buildPanelHtml(data, fields) {
    if (!data || !data.products.length) return '';
    // Views without a sub-bid field on their underlying object (e.g.
    // view_3915 install records) suppress the Total Sub Bid column
    // entirely — it'd just render as "$0.00" everywhere, which is
    // misleading.
    var hideSubbid = !!(fields && !fields.subbid);
    var subbidColspan = hideSubbid ? 7 : 8;  // colspan on bucket-head full-width row

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
            (hideSubbid ? '' : '<td></td>') +
          '</tr>';
      } else if (hasMultipleBuckets) {
        rows += '<tr class="scw-mdf-bucket-head">' +
          '<td colspan="' + subbidColspan + '">' + escapeHtml(grp.label) + '</td>' +
        '</tr>';
      }

      for (var k = 0; k < grp.items.length; k++) {
        rows += productRowHtml(grp.items[k], { hideSubbid: hideSubbid });
      }

      if (hasMultipleBuckets) {
        var st = bucketSubtotal(grp.items, 'Subtotal');
        rows += productRowHtml(st, { isSubtotal: true, bucketIsCR: isCR, hideSubbid: hideSubbid });
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
      (hideSubbid
        ? ''
        : (grandTotal != null
            ? '<td class="scw-mdf-num">' + fmtMoney(grandTotal) + '</td>'
            : blankCell())) +
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
      '<table class="scw-mdf-summary-table' +
        (hideSubbid ? ' scw-mdf-summary-table--no-subbid' : '') + '">' +
        '<colgroup>' +
          '<col style="width:42%">' +     // Product
          '<col style="width:10%">' +     // Existing Cabling
          '<col style="width:10%">' +     // New Cabling
          '<col style="width:8%">' +      // Exterior
          '<col style="width:8%">' +      // Interior
          '<col style="width:6%">' +      // Plenum
          '<col style="width:6%">' +      // Qty
          (hideSubbid ? '' : '<col style="width:10%">') +  // Total Sub Bid
        '</colgroup>' +
        '<thead><tr>' +
          '<th class="scw-mdf-product-h">Product</th>' +
          '<th colspan="5"></th>' +
          '<th class="scw-mdf-num-h">Qty</th>' +
          (hideSubbid ? '' : '<th class="scw-mdf-num-h">Total Sub Bid</th>') +
        '</tr></thead>' +
        '<tbody>' + rows + totalRow + '</tbody>' +
      '</table>';
  }

  function buildAttrsLookup(viewId) {
    var idx = {};
    try {
      var v = window.Knack && Knack.views && Knack.views[viewId];
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
  function transform(viewId) {
    // Hard gate: only run on views we've explicitly mapped. See
    // isSupportedView() comment for the why.
    if (!isSupportedView(viewId)) return;
    var view = document.getElementById(viewId);
    if (!view) return;
    // No-op if this view isn't a worksheet view (no scw-ws-row marker).
    // Cheap guard — keeps this safe to call from any-view event handlers.
    if (!view.querySelector('tr.scw-ws-row')) return;
    var tbody = view.querySelector('table.kn-table tbody');
    if (!tbody) return;

    // Drop previous summaries — recompute is idempotent.
    var prev = tbody.querySelectorAll('tr.' + ROW_CLASS);
    for (var p = 0; p < prev.length; p++) prev[p].remove();

    var attrsById = buildAttrsLookup(viewId);
    if (!Object.keys(attrsById).length) return;

    // Resolve the field map for this view once. Each worksheet object
    // (SOW Line Items, Survey Line Items, etc.) has its own field keys
    // for the same logical role — see FIELD_MAPS at the top of the
    // file. aggregate() reads them via this object.
    var fields = fieldsFor(viewId);

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
      var data = aggregate(_list, fields);
      var html = buildPanelHtml(data, fields);
      if (!html) return;
      // Derive a stable panelKey from the L1 group's label so collapse
      // state survives re-renders. Strip surplus whitespace + the
      // trailing colons Knack appends ("HEADEND: :" → "HEADEND").
      var l1Label = (_l1.textContent || '').replace(/\s+/g, ' ').trim()
                                              .replace(/[:\s]+$/, '');
      var carded = wrapInCard(html, {
        viewId:   viewId,
        panelKey: 'l1:' + (l1Label || 'unknown'),
        title:    'Summary — ' + (l1Label || 'Group')
      });
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
      td.innerHTML = carded;
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

    renderGrand(view, grandList, fields);
  }

  function renderGrand(view, list, fields) {
    var prev = view.querySelector('.' + GRAND_CLASS);
    if (prev) prev.remove();
    if (!list.length) return;

    var viewId = view.id || '';
    var html = buildPanelHtml(aggregate(list, fields), fields);
    if (!html) return;

    var wrap = document.createElement('div');
    wrap.className = GRAND_CLASS;
    wrap.innerHTML = wrapInCard(html, {
      viewId:   viewId,
      panelKey: 'grand',
      title:    'Summary — All Groups'
    });

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
  // ── Per-view registry ───────────────────────────────────
  // Each device-worksheet view we\'ve seen gets its own debounce timer
  // here; without a registry, schedule() collisions across views would
  // drop transforms (the second schedule clears the first view\'s timer
  // before it fires). Keys are added lazily on first schedule().
  var _attached = {};

  function schedule(viewId) {
    if (!viewId) return;
    if (!isSupportedView(viewId)) return;
    var state = _attached[viewId] || (_attached[viewId] = { timer: null });
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(function () {
      state.timer = null;
      transform(viewId);
    }, 120);
  }

  // ── Bindings (multi-view) ───────────────────────────────
  // We can\'t use SCW.onViewRender(viewId, ...) because the set of
  // worksheet views isn\'t known ahead of time — it\'s discovered from
  // DOM markers. Bind to .any and dispatch by viewId. transform()
  // self-guards on tr.scw-ws-row presence, so non-worksheet views that
  // sneak through the event filters cost a single querySelector.
  $(document)
    .off('knack-view-render.any' + NS)
    .on('knack-view-render.any' + NS, function (e, view) {
      if (view && view.key) schedule(view.key);
    });

  // device-worksheet emits this after its row transform completes.
  document.addEventListener('scw-worksheet-ready', function (e) {
    if (e && e.detail && e.detail.viewId) schedule(e.detail.viewId);
  });

  // After inline edits the cell is patched and a record-saved event
  // fires. The event doesn\'t carry a viewId, so refresh every attached
  // view — each schedule() is debounced 120ms so we coalesce.
  $(document).on('scw-record-saved' + NS, function () {
    Object.keys(_attached).forEach(schedule);
  });

  // Primary refresh trigger after a SOW filter pill click — sow-filter-
  // pills.js dispatches this CustomEvent from applyFilter(). Direct
  // event > tbody MutationObserver because Knack frequently rebuilds
  // the tbody, leaving observers attached to detached elements.
  document.addEventListener('scw-conn-filter-changed', function (e) {
    if (e && e.detail && e.detail.viewId) schedule(e.detail.viewId);
  });

  // Fallback: MutationObserver on tbody for filter-class changes that
  // didn't go through the event path (DevTools, future callers, etc.).
  // Re-bound on every view render since Knack may have replaced tbody.
  function bindFilterObserver(viewId) {
    var view = document.getElementById(viewId);
    if (!view) return;
    var tbody = view.querySelector('table.kn-table tbody');
    if (!tbody || tbody.__scwMdfFilterObs) return;
    var mo = new MutationObserver(function () { schedule(viewId); });
    mo.observe(tbody, {
      subtree:    true,
      attributes: true,
      attributeFilter: ['class']
    });
    tbody.__scwMdfFilterObs = mo;
  }
  $(document).on('knack-view-render.any' + NS + 'Obs', function (e, view) {
    var viewId = view && view.key;
    if (viewId) setTimeout(function () { bindFilterObserver(viewId); }, 200);
  });

  // Initial scan — script can load after the first scene render fired.
  // Discover every worksheet view in the current DOM and kick off both
  // the transform and the tbody filter observer for each.
  function initialScan() {
    var views = document.querySelectorAll('.kn-view[id^="view_"]');
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (!v.querySelector('tr.scw-ws-row')) continue;
      var vid = v.id;
      if (!isSupportedView(vid)) continue;
      schedule(vid);
      // IIFE captures vid in the timer closure — without it, the loop
      // variable would be the last view\'s id by the time the timer fires.
      setTimeout((function (id) {
        return function () { bindFilterObserver(id); };
      })(vid), 500);
    }
  }
  initialScan();
})();
