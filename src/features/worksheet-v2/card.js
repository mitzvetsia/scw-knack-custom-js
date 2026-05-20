/*** WORKSHEET V2 — CARD ******************************************************
 *
 * Builds a single worksheet card from a record's attributes hash.
 *
 * Field wrappers are <div> (not <label>) — Knack's scene-level CSS
 * heavily styles <label> in form views (display, padding, color,
 * width), which was collapsing v2 cards to ~0 height. Using a plain
 * <div> with a click-into-input handler (added in edit.js) sidesteps
 * the cascade entirely.
 *
 * Inputs are stamped with:
 *   data-scw-ws-v2-field=<fieldKey>    — which Knack field to PUT
 *   data-scw-ws-v2-record=<recordId>   — which record the value belongs to
 *   data-scw-ws-v2-view=<sourceViewKey> — which view's REST endpoint to PUT to
 *
 * That triplet is everything edit.js needs to issue the save.
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

    var attrs = function (fieldKey) {
      return ' data-scw-ws-v2-field="' + fieldKey + '"' +
             ' data-scw-ws-v2-record="' + escapeHtml(rec.id) + '"' +
             ' data-scw-ws-v2-view="' + escapeHtml(sourceViewKey) + '"';
    };

    // Plain <div> wrappers (not <label>) — Knack's scene-level CSS
    // for label elements was collapsing the cards. Click-to-focus is
    // handled by the delegated handler in edit.js.
    card.innerHTML =
      '<div class="scw-ws-v2-card-header">' +
        '<span class="scw-ws-v2-card-label">' + escapeHtml(label) + '</span>' +
        '<span class="scw-ws-v2-card-product">' + escapeHtml(product) + '</span>' +
      '</div>' +
      '<div class="scw-ws-v2-card-fields">' +
        '<div class="scw-ws-v2-field">' +
          '<div class="scw-ws-v2-field-label">Qty</div>' +
          '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
            'value="' + escapeHtml(qty) + '"' + attrs('field_2399') + '>' +
        '</div>' +
        '<div class="scw-ws-v2-field">' +
          '<div class="scw-ws-v2-field-label">Rate</div>' +
          '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
            'value="' + escapeHtml(rate) + '"' + attrs('field_2400') + '>' +
        '</div>' +
        '<div class="scw-ws-v2-field scw-ws-v2-field--readonly">' +
          '<div class="scw-ws-v2-field-label">Ext</div>' +
          '<div class="scw-ws-v2-display">' + escapeHtml(ext) + '</div>' +
        '</div>' +
        '<div class="scw-ws-v2-field scw-ws-v2-field--notes">' +
          '<div class="scw-ws-v2-field-label">Notes</div>' +
          '<textarea class="scw-ws-v2-input scw-ws-v2-input--notes" rows="1"' +
            attrs('field_2412') + '>' + escapeHtml(notes) + '</textarea>' +
        '</div>' +
      '</div>';

    return card;
  }

  ns.card = {
    buildCard: buildCard
  };
})();
/*** END WORKSHEET V2 — CARD **************************************************/
