/*** WORKSHEET V2 — RENDER ****************************************************
 *
 * Phase 0 render: dead-simple table dump of (label, product name,
 * qty, fee) per record. Just enough to prove the data pipeline works
 * — proves that v2 can read records from the source view's model AND
 * re-render on knack-view-render + knack-cell-update without touching
 * v1's DOM.
 *
 * Subsequent phases will replace this with the real worksheet card
 * structure (summary bar + expandable detail), then add inline
 * editing, sort, groups, etc.
 *
 * Field keys used here are the ones we already lean on heavily in v1:
 *   field_2365 — display label  (E-003, C-12, etc.)
 *   field_2379 — product name (stored)
 *   field_2627 — product (connection — display fallback)
 *   field_2399 — quantity
 *   field_2400 — labor rate
 *   field_2401 — labor extended ($)
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

  /** Return the "best display value" for a field on a record. */
  function readField(rec, key) {
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw) && raw.length) {
      // Connection field — concat identifiers.
      return raw.map(function (r) { return r && (r.identifier || r.id) || ''; }).join(', ');
    }
    if (raw && typeof raw === 'object' && raw.identifier) return raw.identifier;
    var v = rec[key];
    if (v == null) return '';
    // Strip HTML for safe display.
    return String(v).replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Render or re-render the v2 panel for one source view. Idempotent
   * — replaces the body content each call; the container + banner
   * scaffold is built once and reused.
   *
   * @param {string} sourceViewKey
   * @param {Array<Object>} records  — Backbone attributes hashes
   */
  function renderView(sourceViewKey, records) {
    var container = document.getElementById('scw-ws-v2-' + sourceViewKey);
    if (!container) return;

    var body = container.querySelector('.scw-ws-v2-body');
    var count = container.querySelector('.scw-ws-v2-count');
    if (!body) return;

    if (count) {
      count.textContent = records.length + ' record' + (records.length === 1 ? '' : 's');
    }

    if (!records.length) {
      body.innerHTML = '<div class="scw-ws-v2-empty">No records loaded from ' +
        escapeHtml(sourceViewKey) + ' yet.</div>';
      return;
    }

    var rows = records.map(function (rec) {
      var label   = readField(rec, 'field_2365') || readField(rec, 'field_2364') || rec.id.slice(0, 6);
      var product = readField(rec, 'field_2379') || readField(rec, 'field_2627') || '(unnamed)';
      var qty     = readField(rec, 'field_2399');
      var rate    = readField(rec, 'field_2400');
      var ext     = readField(rec, 'field_2401');
      return '<tr>' +
        '<td class="scw-ws-v2-label">' + escapeHtml(label) + '</td>' +
        '<td>' + escapeHtml(product) + '</td>' +
        '<td class="scw-ws-v2-num">' + escapeHtml(qty) + '</td>' +
        '<td class="scw-ws-v2-num">' + escapeHtml(rate) + '</td>' +
        '<td class="scw-ws-v2-num">' + escapeHtml(ext) + '</td>' +
        '</tr>';
    }).join('');

    body.innerHTML =
      '<table class="scw-ws-v2-table">' +
        '<thead><tr>' +
          '<th>Label</th><th>Product</th>' +
          '<th class="scw-ws-v2-num">Qty</th>' +
          '<th class="scw-ws-v2-num">Rate</th>' +
          '<th class="scw-ws-v2-num">Ext</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  ns.render = {
    renderView: renderView
  };
})();
/*** END WORKSHEET V2 — RENDER ************************************************/
