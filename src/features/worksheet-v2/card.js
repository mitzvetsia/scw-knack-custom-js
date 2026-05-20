/*** WORKSHEET V2 — CARD ******************************************************
 *
 * Renders one record as a horizontal row matching v1's view_3610
 * summary-bar field set.
 *
 * Field mapping (SOW Line Items — view_3610 / view_3962):
 *   field_1950 — label (cam/reader display label, e.g. E-001)
 *   field_1949 — product name
 *   field_2020 — labor description (editable, multiline; truncated
 *                in the row view)
 *   field_1964 — quantity (editable)
 *   field_2150 — sub bid rate (editable, stacks with subBidTotal)
 *   field_2151 — sub bid total (read-only, server-computed)
 *   field_1973 — +Hrs (editable)
 *   field_1997 — hours total (read-only)
 *   field_1974 — +Mat (editable)
 *   field_2146 — material total (read-only)
 *   field_2028 — install fee (read-only)
 *   field_2154 — SOW connection (read-only display)
 *   field_1953 — SCW Notes (detail panel; not in row yet)
 *
 * Previously this was using view_3505 (Survey Line Items) field
 * codes — field_2365, field_2379, field_2399, etc. — which don't
 * exist on the SOW Line Items object, so every record fell back
 * to a record-id stub. Bug fixed by porting the v1 view_3610
 * field map verbatim.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  /** Read field value as a plain display string (HTML stripped). */
  function readField(rec, key) {
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw) && raw.length) {
      return raw.map(function (r) {
        return r && (r.identifier || r.id) || '';
      }).filter(Boolean).join(', ');
    }
    if (raw && typeof raw === 'object' && raw.identifier) return raw.identifier;
    var v = rec[key];
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, '').trim();
  }

  function readNum(rec, key) {
    var raw = rec[key + '_raw'];
    if (typeof raw === 'number') return String(raw);
    var s = readField(rec, key);
    return s.replace(/[^0-9.\-]/g, '');
  }

  // Chevron — placeholder for the expand-detail panel landing later.
  var CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  function buildCard(rec, sourceViewKey) {
    var card = document.createElement('div');
    card.className = 'scw-ws-v2-card';
    card.setAttribute('data-scw-ws-v2-record', rec.id);

    // Header fields
    var label   = readField(rec, 'field_1950');  // cam/reader label; blank for other buckets
    var product = readField(rec, 'field_1949') || '(unnamed)';

    // Summary fields
    var laborDesc   = readField(rec, 'field_2020');
    var qty         = readNum(rec,   'field_1964');
    var subBid      = readNum(rec,   'field_2150');
    var subBidTotal = readField(rec, 'field_2151');
    var plusHrs     = readNum(rec,   'field_1973');
    var hrsTotal    = readField(rec, 'field_1997');
    var plusMat     = readNum(rec,   'field_1974');
    var matTotal    = readField(rec, 'field_2146');
    var installFee  = readField(rec, 'field_2028');
    var sow         = readField(rec, 'field_2154');

    var inputAttrs = function (fieldKey) {
      return ' data-scw-ws-v2-field="' + fieldKey + '"' +
             ' data-scw-ws-v2-record="' + escapeHtml(rec.id) + '"' +
             ' data-scw-ws-v2-view="' + escapeHtml(sourceViewKey) + '"';
    };

    // Stack helper: editable number above its read-only total.
    // Matches v1's stackWith: subBid/subBidTotal, plusHrs/hrsTtl,
    // plusMat/matTtl pattern.
    var stackCell = function (cellCls, inputCls, fieldKey, val, totalDisplay, label) {
      return '<div class="scw-ws-v2-cell ' + cellCls + '">' +
        '<input type="number" step="any" class="scw-ws-v2-input ' + inputCls + '" ' +
          'aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(label) + '" ' +
          'value="' + escapeHtml(val) + '"' + inputAttrs(fieldKey) + '>' +
        (totalDisplay
          ? '<div class="scw-ws-v2-stack-total" title="Total">' + escapeHtml(totalDisplay) + '</div>'
          : '') +
        '</div>';
    };

    card.innerHTML =
      '<div class="scw-ws-v2-row">' +

        // Label (cam/reader — e.g. E-001). Blank for non-cam rows.
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--label" title="' + escapeHtml(label) + '">' +
          escapeHtml(label) +
        '</div>' +

        // Product
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--product" title="' + escapeHtml(product) + '">' +
          escapeHtml(product) +
        '</div>' +

        // Labor description — flex, ellipsis until expanded
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
          '<input type="text" class="scw-ws-v2-input scw-ws-v2-input--text" ' +
            'aria-label="Labor description" placeholder="Labor description" ' +
            'value="' + escapeHtml(laborDesc) + '"' + inputAttrs('field_2020') + '>' +
        '</div>' +

        // Qty
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--num">' +
          '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
            'aria-label="Qty" placeholder="Qty" ' +
            'value="' + escapeHtml(qty) + '"' + inputAttrs('field_1964') + '>' +
        '</div>' +

        // Sub Bid (editable) + Sub Bid Total (read-only)
        stackCell('scw-ws-v2-cell--stack', 'scw-ws-v2-input--num',
          'field_2150', subBid, subBidTotal, 'Sub Bid') +

        // +Hrs (editable) + hours total (read-only)
        stackCell('scw-ws-v2-cell--stack', 'scw-ws-v2-input--num',
          'field_1973', plusHrs, hrsTotal, '+Hrs') +

        // +Mat (editable) + material total (read-only)
        stackCell('scw-ws-v2-cell--stack', 'scw-ws-v2-input--num',
          'field_1974', plusMat, matTotal, '+Mat') +

        // Install Fee (read-only)
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--fee" title="Install fee">' +
          escapeHtml(installFee) +
        '</div>' +

        // SOW (read-only connection display)
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--sow" title="SOW">' +
          escapeHtml(sow) +
        '</div>' +

        // Chevron — placeholder for detail-panel expansion
        '<button type="button" class="scw-ws-v2-cell scw-ws-v2-chevron" ' +
          'data-scw-ws-v2-expand="' + escapeHtml(rec.id) + '" ' +
          'aria-label="Expand details" title="Expand details (coming soon)">' +
          CHEVRON_SVG +
        '</button>' +

      '</div>';

    return card;
  }

  ns.card = {
    buildCard: buildCard
  };
})();
/*** END WORKSHEET V2 — CARD **************************************************/
