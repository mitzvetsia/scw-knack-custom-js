/*** WORKSHEET V2 — CARD ******************************************************
 *
 * Phase 3.A — row layout. Each record renders as a compact horizontal
 * row (~40-50px tall) instead of a 4-column form grid. Closer to v1's
 * "data row with inline-edit affordances" visual idiom than a form
 * editor.
 *
 * Layout (CSS grid, see styles.js):
 *   [label] [product name] [qty] [rate] [ext] [notes (truncated)] [chevron]
 *
 * Notes truncates to a single line in row mode. The chevron at the
 * right is a placeholder for the expand/collapse detail panel that
 * lands in a later phase — clicking it currently does nothing.
 *
 * Field wrappers are <div> (not <label>) — Knack's scene-level CSS
 * heavily styles <label> in form views, which would override v2's
 * intent.
 *
 * Inputs are stamped with:
 *   data-scw-ws-v2-field=<fieldKey>    — which Knack field to PUT
 *   data-scw-ws-v2-record=<recordId>   — which record the value belongs to
 *   data-scw-ws-v2-view=<sourceViewKey> — which view's REST endpoint to PUT to
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

  function readField(rec, key) {
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw) && raw.length) {
      return raw.map(function (r) { return r && (r.identifier || r.id) || ''; }).join(', ');
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

  // Chevron SVG — same style as v1's worksheet card chevron so the
  // visual cue is familiar. Rotates 90° when the expand panel opens
  // (driven by .scw-ws-v2-card--open class on the parent card).
  var CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  function buildCard(rec, sourceViewKey) {
    var card = document.createElement('div');
    card.className = 'scw-ws-v2-card';
    card.setAttribute('data-scw-ws-v2-record', rec.id);

    var label   = readField(rec, 'field_2365') || readField(rec, 'field_2364') || (rec.id || '').slice(0, 6);
    var product = readField(rec, 'field_2379') || readField(rec, 'field_2627') || '(unnamed)';
    var qty     = readNum(rec,   'field_2399');
    var rate    = readNum(rec,   'field_2400');
    var ext     = readField(rec, 'field_2401');
    var notes   = readField(rec, 'field_2412');

    var inputAttrs = function (fieldKey) {
      return ' data-scw-ws-v2-field="' + fieldKey + '"' +
             ' data-scw-ws-v2-record="' + escapeHtml(rec.id) + '"' +
             ' data-scw-ws-v2-view="' + escapeHtml(sourceViewKey) + '"';
    };

    card.innerHTML =
      '<div class="scw-ws-v2-row">' +

        // Label (E-001, etc.) — fixed-width, monospaced, prominent
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--label" title="' + escapeHtml(label) + '">' +
          escapeHtml(label) +
        '</div>' +

        // Product name — flexes to fill, ellipsis when too wide
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--product" title="' + escapeHtml(product) + '">' +
          escapeHtml(product) +
        '</div>' +

        // Qty — editable, narrow, right-aligned numeric
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--num">' +
          '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
            'aria-label="Qty" placeholder="Qty" ' +
            'value="' + escapeHtml(qty) + '"' + inputAttrs('field_2399') + '>' +
        '</div>' +

        // Rate — editable, narrow, right-aligned numeric
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--num">' +
          '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
            'aria-label="Rate" placeholder="Rate" ' +
            'value="' + escapeHtml(rate) + '"' + inputAttrs('field_2400') + '>' +
        '</div>' +

        // Ext — server-computed, read-only display
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--ext" title="Extended (server-computed)">' +
          escapeHtml(ext) +
        '</div>' +

        // Notes — editable, single-line in row mode (truncated),
        // expands to multi-line when the expand panel opens
        '<div class="scw-ws-v2-cell scw-ws-v2-cell--notes">' +
          '<input type="text" class="scw-ws-v2-input scw-ws-v2-input--notes" ' +
            'aria-label="Notes" placeholder="Notes" ' +
            'value="' + escapeHtml(notes) + '"' + inputAttrs('field_2412') + '>' +
        '</div>' +

        // Chevron — placeholder for the expand panel landing in a
        // later phase. data-scw-ws-v2-expand attribute is the hook
        // the future toggle handler will look for.
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
