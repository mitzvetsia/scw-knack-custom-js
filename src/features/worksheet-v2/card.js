/*** WORKSHEET V2 — CARD ******************************************************
 *
 * Builds a single worksheet card from a record's attributes. Layout
 * branches on the record's proposal-bucket (field_2219_raw[0].id):
 *
 *   cam         — cameras/readers. Full layout: label · product ·
 *                 chips · labor desc · qty · money stacks · fee ·
 *                 sow. Detail panel: drop prefix/number/length,
 *                 conduit, mounting hardware, connected device,
 *                 SCW notes, survey notes.
 *   services    — Other Services. Hides product. Keeps labor desc,
 *                 qty, money fields, fee, sow.
 *   assumptions — Project Wide Assumptions. Hides product, qty,
 *                 and money entirely. Just labor desc + notes.
 *   default     — Networking, Other Equipment, Mounting Hardware,
 *                 etc. Hides the label slot (cam/reader-only).
 *                 Keeps product, labor desc, qty, money, fee, sow.
 *
 * Bucket IDs are hardcoded here, matching v1's device-worksheet.js
 * bucketOverride.overrideBuckets + bucketRules keys. When those
 * change in Knack the constants below need to change too.
 *
 * Connection fields (field_1957 / field_2197 / field_1958) render
 * as read-only displays in this phase — a clickable picker UI
 * lands in Phase 4.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  // Bucket IDs — copied verbatim from device-worksheet.js view_3610
  // config. If a fifth bucket ever needs special handling, add a new
  // constant + branch in bucketCategoryOf().
  var CAM_READER_BUCKET   = '6481e5ba38f283002898113c';
  var SERVICES_BUCKET     = '6977caa7f246edf67b52cbcd';
  var ASSUMPTIONS_BUCKET  = '697b7a023a31502ec68b3303';

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

  function readBool(rec, key) {
    var raw = rec[key + '_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return 'Yes';
    if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return 'No';
    var s = readField(rec, key).toLowerCase();
    if (s === 'yes' || s === 'true' || s === '1') return 'Yes';
    return 'No';
  }

  /**
   * Discontinued-product flag. field_2912 is a yes/no on the line item
   * (sourced from the connected product) — Yes = product still active,
   * No/false = product discontinued. We only flag when the value is
   * EXPLICITLY false/No; a missing/empty value is treated as unknown
   * (not flagged) so unpopulated rows don't show false positives.
   *
   * Requires field_2912 to be a column on the source view (view_3962)
   * so it lands in the Backbone model attributes.
   */
  function isDiscontinued(rec) {
    var raw = rec['field_2912_raw'];
    if (raw === false || raw === 'No' || raw === 'no' || raw === 0) return true;
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return false;
    if (raw === undefined || raw === null || raw === '') {
      // Fall back to the plain attribute when no _raw companion exists.
      var v = rec['field_2912'];
      if (v == null || v === '') return false;
      var s = String(v).replace(/<[^>]*>/g, '').trim().toLowerCase();
      return s === 'no' || s === 'false';
    }
    return false;
  }

  var DISCONTINUED_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle>' +
    '<line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';

  function discontinuedBadge() {
    return '<span class="scw-ws-v2-discontinued" ' +
      'title="Product discontinued — no longer available. Replace before submitting.">' +
      DISCONTINUED_SVG +
    '</span>';
  }

  function bucketIdOf(rec) {
    var raw = rec['field_2219_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }

  function bucketCategoryOf(rec) {
    var id = bucketIdOf(rec);
    if (id === CAM_READER_BUCKET)  return 'cam';
    if (id === SERVICES_BUCKET)    return 'services';
    if (id === ASSUMPTIONS_BUCKET) return 'assumptions';
    return 'default';
  }

  var CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  // ── Cell builders ──────────────────────────────────────────

  function attrsFor(rec, viewKey, fieldKey) {
    return ' data-scw-ws-v2-field="' + fieldKey + '"' +
           ' data-scw-ws-v2-record="' + escapeHtml(rec.id) + '"' +
           ' data-scw-ws-v2-view="' + escapeHtml(viewKey) + '"';
  }

  function numInput(rec, viewKey, fieldKey, value, label) {
    return '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
      'aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(label) + '" ' +
      'value="' + escapeHtml(value) + '"' + attrsFor(rec, viewKey, fieldKey) + '>';
  }

  /** True when field_2230 (qty flag) is yes/true on the record. */
  function isQtyLocked(rec) {
    var raw = rec && rec['field_2230_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = (rec && rec['field_2230'] || '').toString().trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }

  /** Quantity (field_1964) input — non-editable when field_2230 is yes.
   *  Locked rendering keeps the value visible on a white background per
   *  CLAUDE.md's "locked fields" rule (no opacity dimming). */
  /** When field_2634 indicates the row doesn't carry a quantity, return
   *  null so the row builder can render a blank slot (and also hide the
   *  extended totals via a row-level class). */
  function qtyCell(rec, viewKey, value) {
    if (isQtyLocked(rec)) return null;
    return numInput(rec, viewKey, 'field_1964', value, 'Qty');
  }

  function textInput(rec, viewKey, fieldKey, value, label) {
    return '<input type="text" class="scw-ws-v2-input scw-ws-v2-input--text" ' +
      'aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(label) + '" ' +
      'value="' + escapeHtml(value) + '"' + attrsFor(rec, viewKey, fieldKey) + '>';
  }

  /** Multi-line wrapping text field — used for labor description so
   *  the full text is visible without horizontal scroll. Auto-grows
   *  with content via CSS field-sizing / rows attribute fallback. */
  function textArea(rec, viewKey, fieldKey, value, label) {
    return '<textarea class="scw-ws-v2-input scw-ws-v2-input--textarea" ' +
      'rows="2" ' +
      'aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(label) + '"' +
      attrsFor(rec, viewKey, fieldKey) + '>' +
      escapeHtml(value) +
    '</textarea>';
  }

  function stackCell(rec, viewKey, fieldKey, value, totalDisplay, label) {
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--stack">' +
      numInput(rec, viewKey, fieldKey, value, label) +
      '<div class="scw-ws-v2-stack-total"' +
        (totalDisplay ? ' title="Total"' : '') + '>' +
        escapeHtml(totalDisplay || '') +
      '</div>' +
    '</div>';
  }

  function ro(text, cls, title) {
    return '<div class="scw-ws-v2-cell ' + (cls || '') + '"' +
      (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' +
      escapeHtml(text) +
    '</div>';
  }

  /**
   * Editable product cell — renders the product name in the row's
   * product slot but as a clickable button. Reuses the connection-
   * picker infrastructure (data-scw-ws-v2-conn=field_1949) so the
   * init.js click handler opens the same modal. Candidates source
   * is SCW.productMap (Builder boot snippet); filter logic lives in
   * init.js next to the existing field_1957/field_2197 branches.
   */
  function productCell(rec, viewKey, value) {
    var discontinued = isDiscontinued(rec);
    var cls = 'scw-ws-v2-cell scw-ws-v2-cell--product scw-ws-v2-cell--editable-conn' +
      (discontinued ? ' scw-ws-v2-cell--discontinued' : '');
    var title = discontinued
      ? value + ' — DISCONTINUED product. Click to replace.'
      : value + ' — click to change product';
    return '<button type="button" ' +
      'class="' + cls + '" ' +
      'data-scw-ws-v2-conn="field_1949" ' +
      'data-scw-ws-v2-record="' + escapeHtml(rec.id) + '" ' +
      'data-scw-ws-v2-view="' + escapeHtml(viewKey) + '" ' +
      'data-scw-ws-v2-conn-label="Product" ' +
      'title="' + escapeHtml(title) + '">' +
      (discontinued ? discontinuedBadge() : '') +
      '<span class="scw-ws-v2-product-name">' + escapeHtml(value) + '</span>' +
    '</button>';
  }

  // SOW cell — connection field_2154 (multi-connection to Scopes of
  // Work). v1 left this read-only; v2 makes it editable via the same
  // picker pattern used for product / Connected Devices. The cell
  // renders the comma-separated SOW identifiers (SW-1177, SW-1178)
  // pulled from the record\'s detail HTML, and the click handler in
  // init.js opens the picker with view_3325 (Scopes of Work grid) as
  // the candidate source.
  function sowCell(rec, viewKey, value) {
    var title = (value || 'Set SOW') + ' — click to change SOW';
    var parts = (value || '').split(/\s*,\s*/).filter(function (s) { return s.length; });
    var inner = parts.length
      ? parts.map(function (p) {
          return '<span class="scw-ws-v2-sow-value">' + escapeHtml(p) + '</span>';
        }).join('')
      : '<span class="scw-ws-v2-sow-value">&mdash;</span>';
    return '<button type="button" ' +
      'class="scw-ws-v2-cell scw-ws-v2-cell--sow scw-ws-v2-cell--editable-conn" ' +
      'data-scw-ws-v2-conn="field_2154" ' +
      'data-scw-ws-v2-record="' + escapeHtml(rec.id) + '" ' +
      'data-scw-ws-v2-view="' + escapeHtml(viewKey) + '" ' +
      'data-scw-ws-v2-conn-label="SOW" ' +
      'title="' + escapeHtml(title) + '">' +
      inner +
    '</button>';
  }

  function empty(cls) {
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--blank ' + (cls || '') + '"></div>';
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

  function chevronCell(rec) {
    return '<button type="button" class="scw-ws-v2-cell scw-ws-v2-chevron" ' +
      'data-scw-ws-v2-expand="' + escapeHtml(rec.id) + '" ' +
      'aria-label="Expand details" title="Expand details">' +
      CHEVRON_SVG +
    '</button>';
  }

  var KEBAB_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">' +
    '<circle cx="12" cy="5" r="1.6"></circle>' +
    '<circle cx="12" cy="12" r="1.6"></circle>' +
    '<circle cx="12" cy="19" r="1.6"></circle></svg>';

  function kebabCell(rec) {
    return '<button type="button" class="scw-ws-v2-cell scw-ws-v2-kebab" ' +
      'data-scw-ws-v2-kebab="' + escapeHtml(rec.id) + '" ' +
      'aria-label="More actions" title="More actions">' +
      KEBAB_SVG +
    '</button>';
  }

  // ── Row builders (one per bucket category) ─────────────────

  function buildRow_cam(rec, viewKey) {
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

    // Cameras/readers don't carry a quantity — the qty slot is reused
    // for the Existing/Exterior/Plenum chip stack so the rest of the
    // row (labor desc and money columns) aligns with default rows.
    var chips =
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--chips">' +
        chip(rec, viewKey, 'field_2461', 'Existing', 'Existing cabling') +
        chip(rec, viewKey, 'field_1984', 'Exterior', 'Exterior') +
        chip(rec, viewKey, 'field_1983', 'Plenum',   'Plenum') +
      '</div>';

    return '<div class="scw-ws-v2-row scw-ws-v2-row--cam">' +
      ro(label,   'scw-ws-v2-cell--label',   label) +
      productCell(rec, viewKey, product) +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textArea(rec, viewKey, 'field_2020', laborDesc, 'Labor description') +
      '</div>' +
      chips +
      stackCell(rec, viewKey, 'field_2150', subBid,  subBidTotal, 'Sub Bid') +
      stackCell(rec, viewKey, 'field_1973', plusHrs, hrsTotal,    '+Hrs') +
      stackCell(rec, viewKey, 'field_1974', plusMat, matTotal,    '+Mat') +
      ro(installFee, 'scw-ws-v2-cell--fee', 'Install fee') +
      sowCell(rec, viewKey, sow) +
      chevronCell(rec) +
      kebabCell(rec) +
    '</div>';
  }

  function buildRow_default(rec, viewKey) {
    // Non-cam buckets: drop the LABEL slot entirely (it's only used
    // for cam/reader drop labels like E-001). No chips slot either.
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

    var qtyInput = qtyCell(rec, viewKey, qty);
    var noQty = (qtyInput === null);
    var rowCls = 'scw-ws-v2-row scw-ws-v2-row--default' + (noQty ? ' scw-ws-v2-row--no-qty' : '');
    var qtySlot = noQty
      ? empty('scw-ws-v2-cell--num')
      : '<div class="scw-ws-v2-cell scw-ws-v2-cell--num">' + qtyInput + '</div>';

    return '<div class="' + rowCls + '">' +
      // Empty label slot keeps product / labor desc aligned with cam rows.
      empty('scw-ws-v2-cell--label') +
      productCell(rec, viewKey, product) +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textArea(rec, viewKey, 'field_2020', laborDesc, 'Labor description') +
      '</div>' +
      qtySlot +
      stackCell(rec, viewKey, 'field_2150', subBid,  subBidTotal, 'Sub Bid') +
      stackCell(rec, viewKey, 'field_1973', plusHrs, hrsTotal,    '+Hrs') +
      stackCell(rec, viewKey, 'field_1974', plusMat, matTotal,    '+Mat') +
      ro(installFee, 'scw-ws-v2-cell--fee', 'Install fee') +
      sowCell(rec, viewKey, sow) +
      chevronCell(rec) +
      kebabCell(rec) +
    '</div>';
  }

  function buildRow_services(rec, viewKey) {
    // Services: hide product. Keep labor desc + qty + money + fee +
    // sow. Mirrors v1's bucketRules['6977caa7f246edf67b52cbcd']
    // which hideProduct + descLabel: 'Service'.
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

    var qtyInput = qtyCell(rec, viewKey, qty);
    var noQty = (qtyInput === null);
    var rowCls = 'scw-ws-v2-row scw-ws-v2-row--services' + (noQty ? ' scw-ws-v2-row--no-qty' : '');
    var qtySlot = noQty
      ? empty('scw-ws-v2-cell--num')
      : '<div class="scw-ws-v2-cell scw-ws-v2-cell--num">' + qtyInput + '</div>';

    return '<div class="' + rowCls + '">' +
      // Share the cam/default column template so labor desc lines up.
      // Tag occupies the product slot; label slot is empty.
      empty('scw-ws-v2-cell--label') +
      ro('Service', 'scw-ws-v2-cell--tag') +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textArea(rec, viewKey, 'field_2020', laborDesc, 'Service description') +
      '</div>' +
      qtySlot +
      stackCell(rec, viewKey, 'field_2150', subBid,  subBidTotal, 'Sub Bid') +
      stackCell(rec, viewKey, 'field_1973', plusHrs, hrsTotal,    '+Hrs') +
      stackCell(rec, viewKey, 'field_1974', plusMat, matTotal,    '+Mat') +
      ro(installFee, 'scw-ws-v2-cell--fee', 'Install fee') +
      sowCell(rec, viewKey, sow) +
      chevronCell(rec) +
      kebabCell(rec) +
    '</div>';
  }

  function buildRow_assumptions(rec, viewKey) {
    // Assumptions: just a tag + the description text + chevron.
    // No qty, no money. Mirrors v1's bucketRules['697b7a023a31502ec68b3303']
    // which hides field_1949 (product), field_1964 (qty), all the
    // money fields, and renames labor desc to 'ASSUMPTION'.
    var laborDesc = readField(rec, 'field_2020');

    return '<div class="scw-ws-v2-row scw-ws-v2-row--assumptions">' +
      ro('Assumption', 'scw-ws-v2-cell--tag') +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textArea(rec, viewKey, 'field_2020', laborDesc, 'Assumption text') +
      '</div>' +
      chevronCell(rec) +
      kebabCell(rec) +
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

  /**
   * Editable connection field — renders the current value as a button-
   * styled cell. Click handler in init.js reads the data-* attrs and
   * opens the picker modal.
   */
  function detailConnection(rec, viewKey, fieldKey, label) {
    var val = readField(rec, fieldKey) || '(none)';
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--conn">' +
      '<div class="scw-ws-v2-detail-label">' + escapeHtml(label) + '</div>' +
      '<button type="button" class="scw-ws-v2-conn-btn" ' +
        'data-scw-ws-v2-conn="' + escapeHtml(fieldKey) + '" ' +
        'data-scw-ws-v2-record="' + escapeHtml(rec.id) + '" ' +
        'data-scw-ws-v2-view="' + escapeHtml(viewKey) + '" ' +
        'data-scw-ws-v2-conn-label="' + escapeHtml(label) + '" ' +
        'title="Click to edit ' + escapeHtml(label) + '">' +
        '<span class="scw-ws-v2-conn-btn-val">' + escapeHtml(val) + '</span>' +
        '<span class="scw-ws-v2-conn-btn-edit">edit</span>' +
      '</button>' +
    '</div>';
  }

  /**
   * Build a base hash path for accessory edit/add URLs in the current
   * scene context. Mirrors getBuildSowBasePath() in inline-photo-row.js
   * + connected-records.js. Returns '#...path' or '' if no recognised
   * path is in the current URL.
   */
  function buildSowBasePath() {
    var hash = window.location.hash || '';
    var patterns = [
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/review-bids\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/deploy\/[a-f0-9]{24})/,
      /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = hash.match(patterns[i]);
      if (m) return '#' + m[1];
    }
    return '';
  }

  /**
   * Mounting Hardware (field_1958) — connectedRecords pattern.
   *
   * v1 renders its OWN widget inside the worksheet card — not a plain
   * `<td class="field_1958">` — so the earlier "scrape native td spans"
   * pattern was looking in the wrong place and finding nothing. v2
   * mirrors v1's rendered widget instead:
   *
   *   tr.scw-ws-row[id=recordId]
   *     └─ .scw-ws-field[data-scw-field="field_1958"]
   *           └─ .scw-cr-list
   *                 ├─ .scw-cr-item
   *                 │     ├─ a.scw-cr-link  (href = edit page, text = chip label)
   *                 │     └─ button.scw-cr-remove[data-record-id]
   *                 └─ a.scw-cr-add  (href = add page)
   *
   * Bonus: the URLs in v1's `.scw-cr-link.href` and `.scw-cr-add.href`
   * are the source of truth — already scene-aware, no need to rebuild
   * them from the current hash. That fixes the "+ Add" pill bouncing
   * to home when buildSowBasePath() failed to match the URL.
   *
   * Fallback path (when view_3610 isn't on the page — Phase 5 cleanup):
   *   - Chips come from rec.field_1958_raw[*].identifier
   *   - Add href is rebuilt from buildSowBasePath() if it matches the
   *     URL, else omitted entirely (better to hide than to dump the
   *     user on the home page).
   */
  function detailMountingHardware(rec, viewKey) {
    var parentId = rec.id;

    // Source: view_3962's native td.field_1958 cell. Knack renders it
    // as an outer span.col-N wrapping one <a data-kn="connection-link">
    // per chip, each with an inner <span data-kn="connection-value"
    // id="<recordId>">label</span>. This is the authoritative source —
    // the v2 source view itself — and it's always present, unlike
    // v1's .scw-cr-list widget which lives in view_3610 and renders
    // asynchronously.
    var chips    = [];
    var addHref  = '';
    try {
      var srcView = document.getElementById(viewKey) ||
                    document.getElementById('view_3962');
      var tr      = srcView && srcView.querySelector(
        'tr[id="' + parentId + '"]'
      );
      var td      = tr && tr.querySelector('td.field_1958');
      if (td) {
        var anchors = td.querySelectorAll('a[data-kn="connection-link"]');
        if (anchors.length) {
          for (var ai = 0; ai < anchors.length; ai++) {
            var inner = anchors[ai].querySelector('span[data-kn="connection-value"][id]');
            if (!inner) continue;
            var id    = (inner.getAttribute('id') || '').trim();
            var label = (inner.textContent || '').trim();
            var href  = anchors[ai].getAttribute('href') || '';
            if (id) chips.push({ id: id, label: label || id, href: href });
          }
        } else {
          // Sometimes Knack renders bare spans without wrapping <a>
          // (e.g. when the field is read-only for this view). Still
          // grab the ids + labels.
          var bareSpans = td.querySelectorAll('span[data-kn="connection-value"][id]');
          for (var bi = 0; bi < bareSpans.length; bi++) {
            var bid    = (bareSpans[bi].getAttribute('id') || '').trim();
            var blabel = (bareSpans[bi].textContent || '').trim();
            if (bid) chips.push({ id: bid, label: blabel || bid, href: '' });
          }
        }
      }
    } catch (e) { /* fall through to raw fallback */ }

    // Fallback: record's field_1958_raw + rebuilt URLs.
    if (chips.length === 0) {
      var raw = rec['field_1958_raw'];
      if (Array.isArray(raw)) {
        for (var ri = 0; ri < raw.length; ri++) {
          var a = raw[ri];
          if (!a) continue;
          var lbl = a.identifier
            ? String(a.identifier).replace(/<[^>]*>/g, '').trim()
            : '';
          chips.push({ id: a.id || '', label: lbl || a.id || '', href: '' });
        }
      }
    }
    if (!addHref) {
      var base = buildSowBasePath();
      if (base) addHref = base + '/add-accessory-line-item/' + parentId + '/';
    }

    // ── Render ──
    var chipsHtml = '';
    if (chips.length === 0) {
      chipsHtml = '<span class="scw-ws-v2-mh-empty">&mdash;</span>';
    } else {
      for (var c = 0; c < chips.length; c++) {
        var editHref = chips[c].href;
        if (!editHref) {
          var fbBase = buildSowBasePath();
          editHref = (fbBase && chips[c].id)
            ? fbBase + '/edit-accessory-line-item2/' + chips[c].id + '/'
            : '';
        }
        // Delete X — only when we have the chip's record id AND a
        // parentId, since the click handler reaches into v1's widget
        // to drive its existing delete flow (confirm modal + Make
        // webhook).
        var delX = (chips[c].id && parentId)
          ? '<button type="button" class="scw-ws-v2-mh-del" ' +
              'data-scw-ws-v2-mh-del="' + escapeHtml(chips[c].id) + '" ' +
              'data-scw-ws-v2-mh-parent="' + escapeHtml(parentId) + '" ' +
              'title="Delete ' + escapeHtml(chips[c].label) + '">' +
              '&times;</button>'
          : '';
        // No href → render as non-link span so we never silently bounce
        // the user back to the home page on click.
        if (editHref) {
          chipsHtml += '<span class="scw-ws-v2-mh-chip-wrap">' +
            '<a class="scw-ws-v2-mh-chip" href="' + escapeHtml(editHref) + '"' +
              ' title="Edit ' + escapeHtml(chips[c].label) + '">' +
              escapeHtml(chips[c].label) +
            '</a>' + delX +
          '</span>';
        } else {
          chipsHtml += '<span class="scw-ws-v2-mh-chip-wrap">' +
            '<span class="scw-ws-v2-mh-chip scw-ws-v2-mh-chip--inert"' +
              ' title="' + escapeHtml(chips[c].label) + '">' +
              escapeHtml(chips[c].label) +
            '</span>' + delX +
          '</span>';
        }
      }
    }

    var addHtml = addHref
      ? '<a class="scw-ws-v2-mh-add" href="' + escapeHtml(addHref) + '"' +
        ' title="Add mounting hardware">+ Add</a>'
      : '';

    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--mh">' +
      '<div class="scw-ws-v2-detail-label">Mounting Hardware</div>' +
      '<div class="scw-ws-v2-mh-list">' + chipsHtml + addHtml + '</div>' +
    '</div>';
  }

  function buildDetail_cam(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-zones">' +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--identity">' +
          detailReadOnly(rec,          'field_2240', 'Prefix') +
          detailField(rec,    viewKey, 'field_1951', 'Drop #',  'number') +
          detailField(rec,    viewKey, 'field_1965', 'Length',  'number') +
          detailField(rec,    viewKey, 'field_2035', 'Conduit', 'number') +
        '</div>' +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          detailMountingHardware(rec, viewKey) +
          detailConnection(rec,       viewKey, 'field_2197', 'Connected Device') +
          detailConnection(rec,       viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      '<div class="scw-ws-v2-detail-notes">' +
        detailField(rec,    viewKey, 'field_1953', 'SCW Notes',   'text') +
        detailReadOnly(rec,          'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  function buildDetail_default(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-zones">' +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          detailMountingHardware(rec, viewKey) +
          detailConnection(rec,       viewKey, 'field_1957', 'Connected Devices') +
          detailConnection(rec,       viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      '<div class="scw-ws-v2-detail-notes">' +
        detailField(rec,    viewKey, 'field_1953', 'SCW Notes', 'text') +
        detailReadOnly(rec,          'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  function buildDetail_services(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-zones">' +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          detailConnection(rec, viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      '<div class="scw-ws-v2-detail-notes">' +
        detailField(rec,    viewKey, 'field_1953', 'SCW Notes', 'text') +
        detailReadOnly(rec,          'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  function buildDetail_assumptions(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-zones">' +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          detailConnection(rec, viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      '<div class="scw-ws-v2-detail-notes">' +
        detailField(rec,    viewKey, 'field_1953', 'SCW Notes', 'text') +
      '</div>' +
    '</div>';
  }

  // ── Public entry point ─────────────────────────────────────

  function buildCard(rec, sourceViewKey) {
    var card = document.createElement('div');
    card.className = 'scw-ws-v2-card';
    card.setAttribute('data-scw-ws-v2-record', rec.id);

    var cat = bucketCategoryOf(rec);
    card.classList.add('scw-ws-v2-card--' + cat);
    var bid = bucketIdOf(rec);
    if (bid) card.setAttribute('data-scw-ws-v2-bucket', bid);

    var row, det;
    if (cat === 'cam') {
      row = buildRow_cam(rec, sourceViewKey);
      det = buildDetail_cam(rec, sourceViewKey);
    } else if (cat === 'services') {
      row = buildRow_services(rec, sourceViewKey);
      det = buildDetail_services(rec, sourceViewKey);
    } else if (cat === 'assumptions') {
      row = buildRow_assumptions(rec, sourceViewKey);
      det = buildDetail_assumptions(rec, sourceViewKey);
    } else {
      row = buildRow_default(rec, sourceViewKey);
      det = buildDetail_default(rec, sourceViewKey);
    }

    card.innerHTML = row + det;
    // Leading bulk-select checkbox — absolutely positioned INSIDE the
    // row so it vertically centers with the row\'s actual height
    // (multi-line labor desc rows are taller than single-line ones).
    var rowEl = card.querySelector('.scw-ws-v2-row');
    if (rowEl) {
      var sel = document.createElement('input');
      sel.type = 'checkbox';
      sel.className = 'scw-ws-v2-select';
      sel.setAttribute('data-scw-ws-v2-select', rec.id);
      sel.setAttribute('aria-label', 'Select row');
      rowEl.insertBefore(sel, rowEl.firstChild);
    }
    // Photo strip — appended AFTER the detail panel. Hidden by
    // default; only revealed when the card is expanded (matches the
    // detail panel\'s show-on-open behavior).
    if (ns.photos && typeof ns.photos.buildStrip === 'function') {
      try {
        var strip = ns.photos.buildStrip(rec, sourceViewKey);
        if (strip) card.appendChild(strip);
      } catch (photoErr) {
        console.warn('[scw-ws-v2] photo strip failed for record', rec.id, photoErr);
      }
    }
    return card;
  }

  ns.card = {
    buildCard:           buildCard,
    bucketIdOf:          bucketIdOf,
    CAM_READER_BUCKET:   CAM_READER_BUCKET,
    SERVICES_BUCKET:     SERVICES_BUCKET,
    ASSUMPTIONS_BUCKET:  ASSUMPTIONS_BUCKET,
    bucketCategoryOf:    bucketCategoryOf
  };
})();
/*** END WORKSHEET V2 — CARD **************************************************/
