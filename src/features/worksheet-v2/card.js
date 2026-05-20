/*** WORKSHEET V2 — CARD ******************************************************
 *
 * Builds a single worksheet card from a record's attributes hash.
 * Mirrors v1's visual idiom (summary header with label + product name,
 * editable field row beneath) but at much smaller surface area than
 * v1's bucket-aware card. Phase 1 scope: just enough card to host
 * editable qty / rate / notes for view_3610.
 *
 * Cards are pure DOM — no jQuery dependency, no IIFE-bound closures.
 * Identification of the record + field for save is via data-* attrs
 * read by the single delegated edit handler in edit.js.
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

  /** Read field value as a plain display string (HTML stripped). */
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

  /** Read a number field as a string suitable for a number input. */
  function readNum(rec, key) {
    var raw = rec[key + '_raw'];
    if (typeof raw === 'number') return String(raw);
    var s = readField(rec, key);
    // Strip currency symbols/commas the display layer may have added.
    var m = s.replace(/[^0-9.\-]/g, '');
    return m;
  }

  /**
   * Build the card DOM for one record. Pure function — no insertion.
   *
   * @param {Object} rec  — Backbone attributes hash
   * @param {string} sourceViewKey  — for stamping inputs so edit.js
   *   knows which view's PUT endpoint to use
   * @returns {HTMLDivElement}
   */
  function buildCard(rec, sourceViewKey) {
    var card = document.createElement('div');
    card.className = 'scw-ws-v2-card';
    card.setAttribute('data-scw-ws-v2-record', rec.id);

    var label   = readField(rec, 'field_2365') || readField(rec, 'field_2364') || rec.id.slice(0, 6);
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

    card.innerHTML =
      '<div class="scw-ws-v2-card-header">' +
        '<span class="scw-ws-v2-card-label">' + escapeHtml(label) + '</span>' +
        '<span class="scw-ws-v2-card-product">' + escapeHtml(product) + '</span>' +
      '</div>' +
      '<div class="scw-ws-v2-card-fields">' +
        '<label class="scw-ws-v2-field">' +
          '<span class="scw-ws-v2-field-label">Qty</span>' +
          '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
            'value="' + escapeHtml(qty) + '"' + attrs('field_2399') + '>' +
        '</label>' +
        '<label class="scw-ws-v2-field">' +
          '<span class="scw-ws-v2-field-label">Rate</span>' +
          '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
            'value="' + escapeHtml(rate) + '"' + attrs('field_2400') + '>' +
        '</label>' +
        '<div class="scw-ws-v2-field scw-ws-v2-field--readonly">' +
          '<span class="scw-ws-v2-field-label">Ext</span>' +
          '<span class="scw-ws-v2-display">' + escapeHtml(ext) + '</span>' +
        '</div>' +
        '<label class="scw-ws-v2-field scw-ws-v2-field--notes">' +
          '<span class="scw-ws-v2-field-label">Notes</span>' +
          '<textarea class="scw-ws-v2-input scw-ws-v2-input--notes" rows="1"' +
            attrs('field_2412') + '>' + escapeHtml(notes) + '</textarea>' +
        '</label>' +
      '</div>';

    return card;
  }

  ns.card = {
    buildCard: buildCard
  };
})();
/*** END WORKSHEET V2 — CARD **************************************************/
