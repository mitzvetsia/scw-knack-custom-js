/*** FEATURE: Per-L1-group summary panel on view_3610 ***/
/**
 * For each MDF/IDF L1 group on the SOW Line Items grid (view_3610),
 * inject a small "details panel" row right after the group header.
 * The row aggregates the products under that group so a reviewer can
 * eyeball the makeup of an MDF/IDF without expanding individual rows.
 *
 * Aggregations:
 *   - Total row count
 *   - Product breakdown (count by product label)
 *   - Cabling — Existing vs New        (field_2461)
 *   - Location — Exterior vs Interior  (field_1984)
 *   - Plenum count                     (field_1983)
 *   - Average sub bid                  (field_2150)
 *
 * The summary row is a normal <tr> inside the kn-table tbody, so
 * group-collapse's rowsUntilNextRelevantGroup() picks it up and
 * shows/hides it alongside the data rows.
 */
(function () {
  'use strict';

  var TARGET_VIEW = 'view_3610';
  var STYLE_ID    = 'scw-mdf-summary-css';
  var NS          = '.scwMdfSummary';
  var ROW_CLASS   = 'scw-mdf-summary-row';
  var ID_ATTR     = 'data-scw-summary-for';

  // Field keys used in the summary. These match the cam/reader bucket-
  // override on view_3610 (see device-worksheet.js); for products that
  // don't carry these fields the values just don't contribute to the
  // counts, so the summary degrades gracefully.
  var FIELD_PRODUCT  = 'field_1949';   // product label
  var FIELD_CABLING  = 'field_2461';   // Existing cabling Y/N
  var FIELD_EXTERIOR = 'field_1984';   // Exterior Y/N
  var FIELD_PLENUM   = 'field_1983';   // Plenum Y/N
  var FIELD_SUBBID   = 'field_2150';   // Sub bid amount

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
      '.scw-mdf-summary-panel {' +
      '  display: flex; gap: 22px; flex-wrap: wrap;' +
      '  font: 400 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;' +
      '  color: #1e293b;' +
      '}' +
      '.scw-mdf-summary-section {' +
      '  flex: 0 0 auto; min-width: 110px;' +
      '}' +
      '.scw-mdf-summary-section h4 {' +
      '  font-size: 10px; font-weight: 700;' +
      '  color: #64748b; margin: 0 0 4px;' +
      '  text-transform: uppercase; letter-spacing: 0.05em;' +
      '}' +
      '.scw-mdf-summary-section ul {' +
      '  margin: 0; padding: 0; list-style: none;' +
      '}' +
      '.scw-mdf-summary-section li,' +
      '.scw-mdf-summary-section .scw-mdf-summary-line {' +
      '  font-size: 12px; padding: 1px 0;' +
      '  display: flex; gap: 6px; align-items: center;' +
      '}' +
      '.scw-mdf-summary-section .scw-mdf-summary-label {' +
      '  color: #475569;' +
      '}' +
      '.scw-mdf-summary-section strong {' +
      '  color: #07467c; font-weight: 700;' +
      '}' +
      '.scw-mdf-summary-pill {' +
      '  display: inline-block; padding: 0 8px; border-radius: 999px;' +
      '  background: #dbeafe; color: #1e3a8a;' +
      '  font-weight: 700; font-size: 11px;' +
      '  margin-left: auto;' +
      '}';
    document.head.appendChild(s);
  }

  function readVal(attrs, fieldKey) {
    if (!attrs) return '';
    var raw = attrs[fieldKey + '_raw'];
    if (raw != null && typeof raw !== 'object') return String(raw);
    var v = attrs[fieldKey];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').trim();
  }
  function isYes(v) {
    if (v === true) return true;
    if (typeof v === 'string') return /^yes$/i.test(v.trim());
    return false;
  }
  function toMoney(v) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function fmtMoney(n) {
    if (!isFinite(n)) return '$0';
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function aggregateStats(attrsList) {
    var stats = {
      total:         attrsList.length,
      products:      {},
      existCabling:  0,
      newCabling:    0,
      exterior:      0,
      interior:      0,
      plenum:        0,
      subBidSum:     0,
      subBidCount:   0
    };
    for (var i = 0; i < attrsList.length; i++) {
      var a = attrsList[i];
      var product = readVal(a, FIELD_PRODUCT);
      if (product) stats.products[product] = (stats.products[product] || 0) + 1;

      var cab = readVal(a, FIELD_CABLING);
      if (cab !== '') {
        if (isYes(cab)) stats.existCabling++;
        else            stats.newCabling++;
      }

      var ext = readVal(a, FIELD_EXTERIOR);
      if (ext !== '') {
        if (isYes(ext)) stats.exterior++;
        else            stats.interior++;
      }

      if (isYes(readVal(a, FIELD_PLENUM))) stats.plenum++;

      var bid = toMoney(readVal(a, FIELD_SUBBID));
      if (bid > 0) {
        stats.subBidSum   += bid;
        stats.subBidCount += 1;
      }
    }
    return stats;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildPanelHtml(stats) {
    if (!stats || stats.total === 0) return '';

    var productLabels = Object.keys(stats.products).sort();
    var productHtml = productLabels.map(function (label) {
      return '<li><span class="scw-mdf-summary-label">' + escapeHtml(label) +
        '</span><span class="scw-mdf-summary-pill">' + stats.products[label] +
        '</span></li>';
    }).join('');
    var productSection =
      '<div class="scw-mdf-summary-section" style="flex: 1 1 220px;">' +
        '<h4>Products (' + stats.total + ')</h4>' +
        (productHtml ? '<ul>' + productHtml + '</ul>' : '<div>—</div>') +
      '</div>';

    var cablingSection = '';
    if (stats.existCabling || stats.newCabling) {
      cablingSection =
        '<div class="scw-mdf-summary-section">' +
          '<h4>Cabling</h4>' +
          '<div class="scw-mdf-summary-line"><span class="scw-mdf-summary-label">Existing</span><strong>' + stats.existCabling + '</strong></div>' +
          '<div class="scw-mdf-summary-line"><span class="scw-mdf-summary-label">New</span><strong>' + stats.newCabling + '</strong></div>' +
        '</div>';
    }

    var locationSection = '';
    if (stats.exterior || stats.interior || stats.plenum) {
      locationSection =
        '<div class="scw-mdf-summary-section">' +
          '<h4>Location</h4>' +
          (stats.exterior + stats.interior > 0
            ? '<div class="scw-mdf-summary-line"><span class="scw-mdf-summary-label">Exterior</span><strong>' + stats.exterior + '</strong></div>' +
              '<div class="scw-mdf-summary-line"><span class="scw-mdf-summary-label">Interior</span><strong>' + stats.interior + '</strong></div>'
            : '') +
          (stats.plenum
            ? '<div class="scw-mdf-summary-line"><span class="scw-mdf-summary-label">Plenum</span><strong>' + stats.plenum + '</strong></div>'
            : '') +
        '</div>';
    }

    var subBidSection = '';
    if (stats.subBidCount > 0) {
      var avg = stats.subBidSum / stats.subBidCount;
      subBidSection =
        '<div class="scw-mdf-summary-section">' +
          '<h4>Avg Sub Bid</h4>' +
          '<div class="scw-mdf-summary-line"><strong>' + fmtMoney(avg) + '</strong>' +
          '<span class="scw-mdf-summary-label">(' + stats.subBidCount + ')</span></div>' +
        '</div>';
    }

    return '<div class="scw-mdf-summary-panel">' +
      productSection + cablingSection + locationSection + subBidSection +
    '</div>';
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

  function transform() {
    var view = document.getElementById(TARGET_VIEW);
    if (!view) return;
    var tbody = view.querySelector('table.kn-table tbody');
    if (!tbody) return;

    // Drop any previous summaries so the recomputation is idempotent.
    var prev = tbody.querySelectorAll('tr.' + ROW_CLASS);
    for (var p = 0; p < prev.length; p++) prev[p].remove();

    var attrsById = buildAttrsLookup();
    if (!Object.keys(attrsById).length) return;

    // Determine column count from the first non-summary tr we can find.
    var sampleRow = tbody.querySelector('tr:not(.' + ROW_CLASS + ')');
    var colCount = sampleRow ? sampleRow.children.length : 99;

    var rows = Array.prototype.slice.call(tbody.children);
    var currentL1 = null;
    var currentList = [];
    var groupKey = 0;

    function flush() {
      if (!currentL1) return;
      if (!currentList.length) {
        currentL1 = null; currentList = []; return;
      }
      var stats = aggregateStats(currentList);
      var html  = buildPanelHtml(stats);
      if (!html) {
        currentL1 = null; currentList = []; return;
      }
      var summaryRow = document.createElement('tr');
      summaryRow.className = ROW_CLASS;
      summaryRow.setAttribute(ID_ATTR, String(groupKey));
      var td = document.createElement('td');
      td.colSpan = colCount;
      td.innerHTML = html;
      summaryRow.appendChild(td);
      currentL1.parentNode.insertBefore(summaryRow, currentL1.nextSibling);
      currentL1 = null; currentList = [];
    }

    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      if (tr.classList.contains('kn-group-level-1')) {
        flush();
        currentL1 = tr;
        groupKey++;
      } else if (tr.classList.contains('kn-table-group')) {
        // L2 / L3 group rows — skip, included in the parent L1 totals.
      } else if (
        !tr.classList.contains('kn-table-totals') &&
        !tr.classList.contains(ROW_CLASS) &&
        tr.id && attrsById[tr.id]
      ) {
        currentList.push(attrsById[tr.id]);
      }
    }
    flush();
  }

  injectStyles();

  // Recompute on every relevant render. Debounce so multiple events
  // (knack-view-render + scw-worksheet-ready) fired in quick succession
  // collapse into one DOM update.
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

  // Re-run after device-worksheet finishes its transform — covers the
  // case where models populate after the initial view-render but the
  // worksheet rows aren't fully laid out until scw-worksheet-ready.
  document.addEventListener('scw-worksheet-ready', function (e) {
    if (e && e.detail && e.detail.viewId === TARGET_VIEW) schedule();
  });

  // After inline edits the cell is patched and a record-saved event
  // fires — recompute so the summary reflects the new value.
  $(document).on('scw-record-saved' + NS, schedule);

  // First-paint attempt in case the view is already rendered when this
  // IIFE runs.
  if (document.getElementById(TARGET_VIEW)) schedule();
})();
