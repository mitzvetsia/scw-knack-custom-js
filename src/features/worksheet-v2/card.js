/*** WORKSHEET V2 — CARD ******************************************************
 *
 * Renders one record as a horizontal summary row + a hidden detail
 * panel below it. Layout varies by proposal bucket: camera/reader
 * rows get inline Cabling / Exterior / Plenum chips and a richer
 * detail panel (drop length, conduit, connected device, mounting
 * hardware); all other buckets get the default layout (notes only
 * in detail).
 *
 * Bucket detection: reads field_2219_raw[0].id. The cam/reader
 * bucket id is hardcoded here (matches v1's bucketOverride config
 * in device-worksheet.js view_3610 entry).
 *
 * Detail panel toggles via .scw-ws-v2-card--open class — flipped by
 * init.js's chevron click handler. The detail DOM is always built
 * (cheap) but display:none until the class lands; toggle is a pure
 * CSS swap.
 *
 * Chips are stamped with data-scw-ws-v2-chip + field key + record id
 * + view key; init.js wires a delegated click handler that flips
 * Yes ↔ No, fires the PUT, and applies the same 200ms saving flash
 * as direct-input edits.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  // Cam/reader bucket id — matches v1 (device-worksheet.js, view_3610
  // bucketOverride.overrideBuckets). When this changes in Knack the
  // override here needs to change too; consider lifting to config.js
  // if more bucket-specific layouts get added.
  var CAM_READER_BUCKET = '6481e5ba38f283002898113c';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

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

  /** Read a Yes/No field's current value as the string 'Yes' or 'No' (default 'No'). */
  function readBool(rec, key) {
    var raw = rec[key + '_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return 'Yes';
    if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return 'No';
    var s = readField(rec, key).toLowerCase();
    if (s === 'yes' || s === 'true' || s === '1') return 'Yes';
    return 'No';
  }

  function bucketIdOf(rec) {
    var raw = rec['field_2219_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }

  // Chevron used in the row's right-most slot.
  var CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  // ── Helpers that emit cell markup ──────────────────────────

  function attrsFor(rec, viewKey, fieldKey) {
    return ' data-scw-ws-v2-field="' + fieldKey + '"' +
           ' data-scw-ws-v2-record="' + escapeHtml(rec.id) + '"' +
           ' data-scw-ws-v2-view="' + escapeHtml(viewKey) + '"';
  }

  function inputCell(rec, viewKey, fieldKey, value, label, opts) {
    opts = opts || {};
    return '<div class="scw-ws-v2-cell ' + (opts.cellCls || '') + '">' +
      '<input type="' + (opts.type || 'number') + '"' +
        (opts.type === 'number' ? ' step="any"' : '') +
        ' class="scw-ws-v2-input ' + (opts.inputCls || 'scw-ws-v2-input--num') + '" ' +
        'aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(label) + '" ' +
        'value="' + escapeHtml(value) + '"' + attrsFor(rec, viewKey, fieldKey) + '>' +
      '</div>';
  }

  function stackCell(rec, viewKey, fieldKey, value, totalDisplay, label) {
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--stack">' +
      '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
        'aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(label) + '" ' +
        'value="' + escapeHtml(value) + '"' + attrsFor(rec, viewKey, fieldKey) + '>' +
      (totalDisplay
        ? '<div class="scw-ws-v2-stack-total" title="Total">' + escapeHtml(totalDisplay) + '</div>'
        : '<div class="scw-ws-v2-stack-total"></div>') +
      '</div>';
  }

  function readonlyCell(text, cellCls, title) {
    return '<div class="scw-ws-v2-cell ' + (cellCls || '') + '"' +
      (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' +
      escapeHtml(text) +
      '</div>';
  }

  function chip(rec, viewKey, fieldKey, shortLabel, fullLabel) {
    var val = readBool(rec, fieldKey);
    var cls = 'scw-ws-v2-chip ' +
      (val === 'Yes' ? 'scw-ws-v2-chip--yes' : 'scw-ws-v2-chip--no');
    return '<button type="button" class="' + cls + '" ' +
      'data-scw-ws-v2-chip="' + fieldKey + '" ' +
      'data-scw-ws-v2-record="' + escapeHtml(rec.id) + '" ' +
      'data-scw-ws-v2-view="' + escapeHtml(viewKey) + '" ' +
      'data-scw-ws-v2-bool="' + val + '" ' +
      'title="' + escapeHtml(fullLabel) + ': ' + val + '">' +
      escapeHtml(shortLabel) +
      '</button>';
  }

  // ── Row builders ───────────────────────────────────────────

  function buildRow_default(rec, viewKey) {
    var label       = readField(rec, 'field_1950');
    var product     = readField(rec, 'field_1949') || '(unnamed)';
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

    return '<div class="scw-ws-v2-row scw-ws-v2-row--default">' +
      readonlyCell(label,   'scw-ws-v2-cell--label',   label) +
      readonlyCell(product, 'scw-ws-v2-cell--product', product) +
      // No chip slot in default layout — keep grid columns simple
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        '<input type="text" class="scw-ws-v2-input scw-ws-v2-input--text" ' +
          'aria-label="Labor description" placeholder="Labor description" ' +
          'value="' + escapeHtml(laborDesc) + '"' + attrsFor(rec, viewKey, 'field_2020') + '>' +
      '</div>' +
      inputCell(rec, viewKey, 'field_1964', qty, 'Qty', { cellCls: 'scw-ws-v2-cell--num' }) +
      stackCell(rec, viewKey, 'field_2150', subBid,  subBidTotal, 'Sub Bid') +
      stackCell(rec, viewKey, 'field_1973', plusHrs, hrsTotal,    '+Hrs') +
      stackCell(rec, viewKey, 'field_1974', plusMat, matTotal,    '+Mat') +
      readonlyCell(installFee, 'scw-ws-v2-cell--fee', 'Install fee') +
      readonlyCell(sow,        'scw-ws-v2-cell--sow', 'SOW') +
      '<button type="button" class="scw-ws-v2-cell scw-ws-v2-chevron" ' +
        'data-scw-ws-v2-expand="' + escapeHtml(rec.id) + '" ' +
        'aria-label="Expand details" title="Expand details">' +
        CHEVRON_SVG +
      '</button>' +
    '</div>';
  }

  function buildRow_camReader(rec, viewKey) {
    // Same field set as default PLUS inline chips for the three
    // toggle fields v1 puts in the cam/reader summary.
    var label       = readField(rec, 'field_1950');
    var product     = readField(rec, 'field_1949') || '(unnamed)';
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

    var chipStack =
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--chips">' +
        chip(rec, viewKey, 'field_2461', 'Cab', 'Existing cabling') +
        chip(rec, viewKey, 'field_1984', 'Ext', 'Exterior') +
        chip(rec, viewKey, 'field_1983', 'Pln', 'Plenum') +
      '</div>';

    return '<div class="scw-ws-v2-row scw-ws-v2-row--cam">' +
      readonlyCell(label,   'scw-ws-v2-cell--label',   label) +
      readonlyCell(product, 'scw-ws-v2-cell--product', product) +
      chipStack +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        '<input type="text" class="scw-ws-v2-input scw-ws-v2-input--text" ' +
          'aria-label="Labor description" placeholder="Labor description" ' +
          'value="' + escapeHtml(laborDesc) + '"' + attrsFor(rec, viewKey, 'field_2020') + '>' +
      '</div>' +
      inputCell(rec, viewKey, 'field_1964', qty, 'Qty', { cellCls: 'scw-ws-v2-cell--num' }) +
      stackCell(rec, viewKey, 'field_2150', subBid,  subBidTotal, 'Sub Bid') +
      stackCell(rec, viewKey, 'field_1973', plusHrs, hrsTotal,    '+Hrs') +
      stackCell(rec, viewKey, 'field_1974', plusMat, matTotal,    '+Mat') +
      readonlyCell(installFee, 'scw-ws-v2-cell--fee', 'Install fee') +
      readonlyCell(sow,        'scw-ws-v2-cell--sow', 'SOW') +
      '<button type="button" class="scw-ws-v2-cell scw-ws-v2-chevron" ' +
        'data-scw-ws-v2-expand="' + escapeHtml(rec.id) + '" ' +
        'aria-label="Expand details" title="Expand details">' +
        CHEVRON_SVG +
      '</button>' +
    '</div>';
  }

  // ── Detail panel builders ──────────────────────────────────

  function detailField(rec, viewKey, fieldKey, label, kind) {
    var val = (kind === 'number') ? readNum(rec, fieldKey) : readField(rec, fieldKey);
    var inputType = kind === 'number' ? 'number' : 'text';
    var inputCls  = kind === 'number'
      ? 'scw-ws-v2-input scw-ws-v2-input--num'
      : 'scw-ws-v2-input scw-ws-v2-input--text';
    var step = kind === 'number' ? ' step="any"' : '';
    return '<div class="scw-ws-v2-detail-field">' +
      '<div class="scw-ws-v2-detail-label">' + escapeHtml(label) + '</div>' +
      '<input type="' + inputType + '"' + step + ' class="' + inputCls + '" ' +
        'aria-label="' + escapeHtml(label) + '" ' +
        'value="' + escapeHtml(val) + '"' + attrsFor(rec, viewKey, fieldKey) + '>' +
    '</div>';
  }

  function detailReadOnly(rec, fieldKey, label) {
    var val = readField(rec, fieldKey);
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--ro">' +
      '<div class="scw-ws-v2-detail-label">' + escapeHtml(label) + '</div>' +
      '<div class="scw-ws-v2-display">' + escapeHtml(val) + '</div>' +
    '</div>';
  }

  function buildDetail_default(rec, viewKey) {
    // Non-cam/reader rows mostly just need the notes pair.
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-grid">' +
        detailField(rec,   viewKey, 'field_1953', 'SCW Notes', 'text') +
        detailReadOnly(rec,         'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  function buildDetail_camReader(rec, viewKey) {
    // Mirrors v1 view_3610 bucketOverride.detailLayout:
    //   left:  ['dropPrefix', 'dropNumber', 'mountingHardware']
    //   right: ['connectedDevice', 'dropLength', 'conduit', 'scwNotes']
    // mountingHardware (field_1958) and connectedDevice (field_2197)
    // render as read-only strings here; full connection-picker UX
    // lands in a later phase.
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-grid">' +
        detailReadOnly(rec,          'field_2240', 'Drop Prefix') +
        detailField(rec,    viewKey, 'field_1951', 'Drop Number',    'number') +
        detailReadOnly(rec,          'field_1958', 'Mounting Hardware') +
        detailReadOnly(rec,          'field_2197', 'Connected Device') +
        detailField(rec,    viewKey, 'field_1965', 'Drop Length',    'number') +
        detailField(rec,    viewKey, 'field_2035', 'Conduit',        'number') +
        detailField(rec,    viewKey, 'field_1953', 'SCW Notes',      'text') +
        detailReadOnly(rec,          'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  // ── Public ─────────────────────────────────────────────────

  function buildCard(rec, sourceViewKey) {
    var card = document.createElement('div');
    card.className = 'scw-ws-v2-card';
    card.setAttribute('data-scw-ws-v2-record', rec.id);

    var cam = bucketIdOf(rec) === CAM_READER_BUCKET;
    if (cam) card.classList.add('scw-ws-v2-card--cam');

    card.innerHTML =
      (cam ? buildRow_camReader(rec, sourceViewKey)
           : buildRow_default(rec, sourceViewKey)) +
      (cam ? buildDetail_camReader(rec, sourceViewKey)
           : buildDetail_default(rec, sourceViewKey));

    return card;
  }

  ns.card = {
    buildCard:        buildCard,
    CAM_READER_BUCKET: CAM_READER_BUCKET
  };
})();
/*** END WORKSHEET V2 — CARD **************************************************/
