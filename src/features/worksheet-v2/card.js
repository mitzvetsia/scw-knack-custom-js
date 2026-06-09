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
  var NETWORKING_BUCKET   = '647953bb54b4e1002931ed97';

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

  /** Wrong-accessory flag for an accessory id. field_2244 ("accessory match
   *  check") is only reliable as the per-accessory connection-value spans on
   *  the parent's row — warnings.js scrapes those (explicit No / false) into
   *  a map. We just look the accessory up there. */
  function isBracketWrong(accessoryId) {
    return !!(ns.warnings && typeof ns.warnings.isAccessoryMismatch === 'function'
      && ns.warnings.isAccessoryMismatch(accessoryId));
  }

  /** True when this record carries the given issue type, per the warnings
   *  cache analyzed earlier this render (e.g. 'disconnected'). */
  function hasIssue(rec, type) {
    if (!rec || !rec.id || !ns.warnings ||
        typeof ns.warnings.getIssuesFor !== 'function') return false;
    try {
      var issues = ns.warnings.getIssuesFor(rec.id) || [];
      return issues.indexOf(type) !== -1;
    } catch (e) { return false; }
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
    // Currency fields (sub bid, +Mat, fee subtotals) get a $ glyph
    // prefix so users see the unit without having to type it.
    var isCurrency = (fieldKey === 'field_2150' || fieldKey === 'field_1974');
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--stack' +
      (isCurrency ? ' scw-ws-v2-cell--currency' : '') + '">' +
      (isCurrency ? '<span class="scw-ws-v2-currency-glyph">$</span>' : '') +
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
  /** Read the parent line item\'s label from the back-mirror
   *  (field_2464_raw[0].identifier). Returns '' when the bracket
   *  doesn\'t have a resolved parent. */
  // Locate a parent line-item record by id across every SOW-item view
  // that might be loaded. The Build-SOW page loads view_3962; the bid
  // review comparison grid (scene_1155) loads view_3921. Hardcoding
  // view_3962 broke the lookup on scene_1155 — fall back through all
  // candidates so the parent's real product label resolves either place.
  function findParentRecord(parentId) {
    if (!parentId) return null;
    var candidates = ['view_3962', 'view_3921'];
    try {
      var views = (ns.CONFIG && ns.CONFIG.views) || [];
      for (var i = 0; i < views.length; i++) {
        if (views[i] && views[i].sourceViewKey &&
            candidates.indexOf(views[i].sourceViewKey) === -1) {
          candidates.push(views[i].sourceViewKey);
        }
      }
    } catch (e) { /* ignore */ }
    for (var c = 0; c < candidates.length; c++) {
      try {
        var v = window.Knack && Knack.views && Knack.views[candidates[c]];
        var prec = v && v.model && v.model.data &&
                   typeof v.model.data.get === 'function' &&
                   v.model.data.get(parentId);
        if (prec) return prec.attributes || prec;
      } catch (e2) { /* try next */ }
    }
    return null;
  }

  function readParentRef(rec) {
    var raw = rec && rec['field_2464_raw'];
    if (!Array.isArray(raw) || !raw.length || !raw[0]) return '';
    var parentId = raw[0].id || '';

    // Prefer a real product/drop label looked up from the SOW-item view
    // model — Knack\'s auto-built identifier on the line-item object
    // is "<recordId> (<mdfLabel>)" because the object has no proper
    // identifier field, which reads like garbage in the UI.
    if (parentId) {
      try {
        var pa = findParentRecord(parentId);
        if (pa) {
          var drop = (pa.field_1950 || '').toString().replace(/<[^>]*>/g, '').trim();
          var prod = (pa.field_1949 || '').toString().replace(/<[^>]*>/g, '').trim();
          // Knack synthesizes a "<24-hex> (<mdf>)" string for line-item
          // records that have no real drop label (networking/headend
          // bucket). Reject it — that\'s the garbage we\'re trying to
          // avoid printing in the first place.
          if (/^[a-f0-9]{24}(\s|\b|$)/i.test(drop)) drop = '';
          if (/^[a-f0-9]{24}(\s|\b|$)/i.test(prod)) prod = '';
          if (drop && prod) return drop + ' · ' + prod;
          if (prod)         return prod;
          if (drop)         return drop;
        }
      } catch (e) { /* fall through to identifier */ }
    }

    var ident = raw[0].identifier;
    if (ident) {
      var s = String(ident).replace(/<[^>]*>/g, '').trim();
      // Strip Knack\'s default "<recordId> (<label>)" wrapper if the
      // model lookup above didn\'t find anything cleaner.
      var m = s.match(/^[a-f0-9]{24}\s*\(([^)]+)\)\s*$/);
      if (m) return m[1].trim();
      return s;
    }
    return '';
  }

  /** Label slot — for non-cam rows (default/services) the slot is
   *  normally blank. We keep it blank here regardless of parent-ref,
   *  because the attached-to indicator now lives in a thin caption
   *  row ABOVE the main row (rendered post-build, not in the grid). */
  function labelCellOrBlank(rec) {
    return empty('scw-ws-v2-cell--label');
  }

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

  var TRASH_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<polyline points="3 6 5 6 21 6"></polyline>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
    '<path d="M10 11v6"></path><path d="M14 11v6"></path>' +
    '<path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>';

  /** Direct-action delete button — was a kebab menu, now a single
   *  trash icon. Click → auto-confirmed native delete + accessory
   *  cascade (handled in init.js). data-scw-ws-v2-kebab kept as the
   *  attribute name so the existing handler binds without rename. */
  function kebabCell(rec) {
    return '<button type="button" class="scw-ws-v2-cell scw-ws-v2-trash" ' +
      'data-scw-ws-v2-kebab="' + escapeHtml(rec.id) + '" ' +
      'aria-label="Delete line item" title="Delete line item">' +
      TRASH_SVG +
    '</button>';
  }

  /** Warning column cell — separate icon chips (one per issue type), not a
   *  single stacked badge. Icon-only to fit the narrow column; the label is
   *  the tooltip. Each chip opens the record panel on click. */
  function warnCell(rec) {
    var issues = (ns.warnings && typeof ns.warnings.getIssuesFor === 'function')
      ? ns.warnings.getIssuesFor(rec.id) : [];
    if (!issues || !issues.length) {
      return '<span class="scw-ws-v2-cell scw-ws-v2-cell--warn scw-ws-v2-cell--blank"></span>';
    }
    var labels = (ns.warnings && ns.warnings.LABELS) || {};
    var icons  = (ns.warnings && ns.warnings.ICONS)  || {};
    var chips = issues.map(function (k) {
      return '<button type="button" class="scw-ws-v2-warn-chit" ' +
        'data-issue-type="' + k + '" ' +
        'data-scw-ws-v2-expand="' + escapeHtml(rec.id) + '" ' +
        'title="' + escapeHtml(labels[k] || k) + '">' +
        (icons[k] || '') +
      '</button>';
    }).join('');
    return '<span class="scw-ws-v2-cell scw-ws-v2-cell--warn">' + chips + '</span>';
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
      chevronCell(rec) +
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
      warnCell(rec) +
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
      chevronCell(rec) +
      // Empty label slot keeps product / labor desc aligned with cam rows.
      labelCellOrBlank(rec) +
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
      warnCell(rec) +
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
      chevronCell(rec) +
      // Share the cam/default column template so labor desc lines up.
      // Tag occupies the product slot; label slot is empty.
      labelCellOrBlank(rec) +
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
      warnCell(rec) +
      kebabCell(rec) +
    '</div>';
  }

  function buildRow_assumptions(rec, viewKey) {
    // Assumptions: text + SOW + chevron/warn/kebab. No qty, no money.
    // Mirrors v1's bucketRules['697b7a023a31502ec68b3303'] which hides
    // field_1949 (product), field_1964 (qty), and all the money fields,
    // but keeps SOW so the user can target the assumption at a specific
    // SOW (vs leaving it project-wide).
    //
    // We render the full 12-column template (with blank cells for the
    // hidden slots) so SOW lands at the same horizontal position as it
    // does on default / cam / services rows — see CSS where assumption
    // rows now share the default grid template AND the labor-desc cell
    // spans the empty middle columns for readability.
    var laborDesc = readField(rec, 'field_2020');
    var sow       = readField(rec, 'field_2154');

    return '<div class="scw-ws-v2-row scw-ws-v2-row--assumptions">' +
      chevronCell(rec) +
      labelCellOrBlank(rec) +
      empty('scw-ws-v2-cell--product') +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textArea(rec, viewKey, 'field_2020', laborDesc, 'Assumption text') +
      '</div>' +
      empty('scw-ws-v2-cell--num') +
      empty('scw-ws-v2-cell--stack') +
      empty('scw-ws-v2-cell--stack') +
      empty('scw-ws-v2-cell--stack') +
      empty('scw-ws-v2-cell--fee') +
      sowCell(rec, viewKey, sow) +
      warnCell(rec) +
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
  function detailConnection(rec, viewKey, fieldKey, label, warn) {
    // Special-case the Parent connection: the line-item object\'s auto
    // identifier is "<recordId> (<mdfLabel>)", which reads like garbage.
    // readParentRef does a proper product/drop lookup — reuse it.
    var val;
    if (fieldKey === 'field_2464') {
      val = readParentRef(rec) || '(none)';
    } else {
      val = readField(rec, fieldKey) || '(none)';
    }
    // When warn is set (e.g. a disconnected cam/reader's Connected Device
    // field), prepend the issue icon to the label and flag the wrapper so
    // CSS can call out the offending field.
    var labelHtml = escapeHtml(label);
    if (warn) {
      var warnIc = (ns.warnings && ns.warnings.ICONS && ns.warnings.ICONS.disconnected) || '';
      labelHtml = '<span class="scw-ws-v2-detail-warn-ic" ' +
        'title="No connected device — this cam/reader is disconnected">' +
        warnIc + '</span>' + labelHtml;
    }
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--conn' +
        (warn ? ' scw-ws-v2-detail-field--warn' : '') + '">' +
      '<div class="scw-ws-v2-detail-label">' + labelHtml + '</div>' +
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
   * Accessories (field_1958) — connectedRecords pattern.
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

    // Prefer the Backbone model over the DOM scrape. The parent\'s
    // td.field_1958 cell in view_3962 doesn\'t re-render on its own
    // when we optimistically patch the parent\'s field_2207/_1958 from
    // a re-parent action — so a DOM-first scrape returns stale chips
    // and the user sees the old child list until the next refetch.
    // The model is patched synchronously in init.js\'s parent-picker
    // onSaved (and refetched after the server PUT settles), so it\'s
    // always at least as fresh as the DOM and usually fresher.
    //
    // Source priority: field_2207_raw (the real "my children" array)
    // first, falling back to field_1958_raw for records the back-end
    // surfaces only under the legacy key.
    var modelRaw = rec['field_2207_raw'];
    if (!Array.isArray(modelRaw) || modelRaw.length === 0) {
      modelRaw = rec['field_1958_raw'];
    }
    if (Array.isArray(modelRaw) && modelRaw.length) {
      for (var mri = 0; mri < modelRaw.length; mri++) {
        var ma = modelRaw[mri];
        if (!ma || !ma.id) continue;
        var mlbl = ma.identifier
          ? String(ma.identifier).replace(/<[^>]*>/g, '').trim()
          : '';
        chips.push({ id: ma.id, label: mlbl || ma.id, href: '' });
      }
    }

    // Final fallback: DOM scrape from the source view, for the case
    // where the model has nothing (e.g. first paint before subscribers
    // re-emit) — Knack\'s native td.field_1958 markup gives us labels
    // AND clickable hrefs.
    if (chips.length === 0) {
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
            var bareSpans = td.querySelectorAll('span[data-kn="connection-value"][id]');
            for (var bi = 0; bi < bareSpans.length; bi++) {
              var bid    = (bareSpans[bi].getAttribute('id') || '').trim();
              var blabel = (bareSpans[bi].textContent || '').trim();
              if (bid) chips.push({ id: bid, label: blabel || bid, href: '' });
            }
          }
        }
      } catch (e) { /* swallow */ }
    }
    // addHref fallback: the `add-accessory-line-item` slug differs
    // between Knack scenes — and with v1 disabled, v1\'s scw-cr-add
    // anchors aren\'t in the DOM anymore. So we resolve the live
    // route lazily AT CLICK TIME (see init.js \'data-scw-ws-v2-add-
    // accessory\' handler) by searching the whole page for any Knack
    // menu/details link whose text matches a known add-accessory
    // label. Rendering a placeholder href here means we never put a
    // home-bouncing URL into the chip.
    addHref = addHref || '__resolve-on-click__';

    // Build a quick lookup of source-view records so we can read each
    // bracket\'s own attrs (qty + multi-allowed flag) inline, AND so
    // we can enrich chip labels when the parent\'s field_2207_raw
    // entry came back without an identifier (freshly-created
    // accessory records where the back-end hasn\'t resolved the
    // synthetic identifier yet — without enrichment we\'d render the
    // 24-char record id as the chip label).
    var accAttrsById = Object.create(null);
    try {
      var allRecs = (ns.data && typeof ns.data.readRecords === 'function')
        ? ns.data.readRecords(viewKey) : [];
      for (var ai = 0; ai < allRecs.length; ai++) {
        if (allRecs[ai] && allRecs[ai].id) accAttrsById[allRecs[ai].id] = allRecs[ai];
      }
    } catch (e) { /* model not ready — chips render without stepper */ }

    // Label enrichment pass — replace any chip whose label is a bare
    // 24-hex record id with the resolved product / drop label from the
    // accessory\'s own record. Mirrors readParentRef\'s rejection of
    // Knack\'s "<recordId> (<mdfLabel>)" synthetic identifier pattern.
    var HEX_24 = /^[a-f0-9]{24}(\s|\b|$)/i;
    for (var ci = 0; ci < chips.length; ci++) {
      var ch = chips[ci];
      if (ch.label && !HEX_24.test(ch.label)) continue;
      var src = accAttrsById[ch.id];
      if (!src) continue;
      var resolved = labelLineItem(src);
      if (resolved && !HEX_24.test(resolved)) ch.label = resolved;
    }

    // ── Render ──
    var chipsHtml = '';
    if (chips.length === 0) {
      chipsHtml = '<span class="scw-ws-v2-mh-empty">&mdash;</span>';
    } else {
      for (var c = 0; c < chips.length; c++) {
        var chip = chips[c];
        var editHref = chip.href;
        if (!editHref) {
          var fbBase = buildSowBasePath();
          editHref = (fbBase && chip.id)
            ? fbBase + '/edit-accessory-line-item2/' + chip.id + '/'
            : '';
        }
        // Multi-qty stepper — only rendered when the bracket\'s
        // field_2230 ("allows multiple quantity") is FALSE/empty.
        // Locked (field_2230 = Yes) means single-qty only and we omit
        // the stepper entirely (qty is implicit = 1).
        var accRec  = accAttrsById[chip.id] || null;
        // Wrong-accessory flag — sourced from the parent's field_2244
        // per-accessory spans (see warnings.js). Surface it on the specific
        // accessory chip; the parent card's warning chip rolls these up.
        var accWrong = isBracketWrong(chip.id);
        var warnMark = accWrong
          ? '<span class="scw-ws-v2-mh-warn scw-ws-v2-mh-warn--icon" ' +
              'title="Wrong accessory — does not match this product">' +
              ((ns.warnings && ns.warnings.ICONS && ns.warnings.ICONS.bracket) || '') +
            '</span>'
          : '';
        var canMulti = accRec ? !isQtyLocked(accRec) : false;
        var curQty  = accRec ? (parseFloat(readNum(accRec, 'field_1964')) || 1) : 1;
        var stepperHtml = canMulti
          ? '<span class="scw-ws-v2-mh-stepper" data-scw-ws-v2-acc-id="' + escapeHtml(chip.id) + '">' +
              '<button type="button" class="scw-ws-v2-mh-step" ' +
                'data-scw-ws-v2-acc-step="down" data-scw-ws-v2-acc-id="' + escapeHtml(chip.id) + '" ' +
                'title="Decrease quantity"' + (curQty <= 1 ? ' disabled' : '') + '>&minus;</button>' +
              '<span class="scw-ws-v2-mh-qty">' + curQty + '</span>' +
              '<button type="button" class="scw-ws-v2-mh-step" ' +
                'data-scw-ws-v2-acc-step="up" data-scw-ws-v2-acc-id="' + escapeHtml(chip.id) + '" ' +
                'title="Increase quantity">+</button>' +
            '</span>'
          : '';
        // Delete X — only when we have the chip's record id AND a
        // parentId, since the click handler reaches into v1's widget
        // to drive its existing delete flow (confirm modal + Make
        // webhook).
        var delX = (chip.id && parentId)
          ? '<button type="button" class="scw-ws-v2-mh-del" ' +
              'data-scw-ws-v2-mh-del="' + escapeHtml(chip.id) + '" ' +
              'data-scw-ws-v2-mh-parent="' + escapeHtml(parentId) + '" ' +
              'title="Delete ' + escapeHtml(chip.label) + '">' +
              '&times;</button>'
          : '';
        // No href → render as non-link span so we never silently bounce
        // the user back to the home page on click.
        var wrapCls = 'scw-ws-v2-mh-chip-wrap' +
          (accWrong ? ' scw-ws-v2-mh-chip-wrap--warn' : '');
        if (editHref) {
          chipsHtml += '<span class="' + wrapCls + '">' +
            '<a class="scw-ws-v2-mh-chip" href="' + escapeHtml(editHref) + '"' +
              ' title="Edit ' + escapeHtml(chip.label) + '">' +
              escapeHtml(chip.label) +
            '</a>' + warnMark + stepperHtml + delX +
          '</span>';
        } else {
          chipsHtml += '<span class="' + wrapCls + '">' +
            '<span class="scw-ws-v2-mh-chip scw-ws-v2-mh-chip--inert"' +
              ' title="' + escapeHtml(chip.label) + '">' +
              escapeHtml(chip.label) +
            '</span>' + warnMark + stepperHtml + delX +
          '</span>';
        }
      }
    }

    // The href stays a placeholder; init.js intercepts the click
    // and resolves the right Knack-rendered link by text on the page.
    var addHtml =
      '<a class="scw-ws-v2-mh-add" href="#" ' +
        'data-scw-ws-v2-add-accessory="' + escapeHtml(parentId) + '" ' +
        'title="Add accessory">+ Add</a>';

    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--mh">' +
      '<div class="scw-ws-v2-detail-label">Accessories</div>' +
      '<div class="scw-ws-v2-mh-list">' + chipsHtml + '</div>' +
      (addHtml ? '<div class="scw-ws-v2-mh-addrow">' + addHtml + '</div>' : '') +
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
          detailConnection(rec,       viewKey, 'field_2197', 'Connected Device',
                           hasIssue(rec, 'disconnected')) +
          detailConnection(rec,       viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      '<div class="scw-ws-v2-detail-notes">' +
        detailField(rec,    viewKey, 'field_1953', 'SCW Notes',   'text') +
        detailReadOnly(rec,          'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  function isMapConnectionsRow(rec) {
    var raw = rec && rec['field_2231_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = (rec && rec['field_2231'] || '').toString().trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }

  function buildDetail_default(rec, viewKey) {
    var hasParent       = !!readParentRef(rec);
    var showConnDevices = isMapConnectionsRow(rec);
    // Parent field shows for any default-category record that is NOT
    // Networking/Headend — those are themselves primary line items
    // and aren\'t meant to become accessories. Once a record HAS a
    // parent we always show the field (even on Networking rows, in
    // case someone needs to clear it). Cam/services/assumptions have
    // their own detail builders and never show Parent.
    var bid = bucketIdOf(rec);
    var showParent = hasParent || (bid !== NETWORKING_BUCKET);
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-zones">' +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          (showParent ? detailConnection(rec, viewKey, 'field_2464', 'Parent') : '') +
          detailMountingHardware(rec, viewKey) +
          (showConnDevices ? detailConnection(rec, viewKey, 'field_1957', 'Connected Devices') : '') +
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
    // Promoted-bracket marker: the bracket has a parent (field_2464
    // resolves) but is showing as its own row because Require Sub
    // Bid (field_2479) isn\'t No/false. Used by CSS for the amber
    // left accent + the inline attached-to chip.
    if (readParentRef(rec)) {
      card.classList.add('scw-ws-v2-card--promoted-bracket');
    }

    // SOW connection ids — space-separated for the SOW filter pills.
    var sowRaw = rec['field_2154_raw'];
    if (Array.isArray(sowRaw) && sowRaw.length) {
      var sowIds = [];
      for (var si = 0; si < sowRaw.length; si++) {
        if (sowRaw[si] && sowRaw[si].id) sowIds.push(sowRaw[si].id);
      }
      if (sowIds.length) card.setAttribute('data-scw-ws-v2-sow', sowIds.join(' '));
    }

    // Warning issue types (from ns.warnings cache) — space-separated
    // attribute so CSS can show the per-card amber dot when any
    // issue is present.
    var issues = (ns.warnings && typeof ns.warnings.getIssuesFor === 'function')
      ? ns.warnings.getIssuesFor(rec.id) : [];
    if (issues && issues.length) {
      card.setAttribute('data-scw-ws-v2-warnings', issues.join(' '));
    }

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

    // Attached-to caption — small slate-gray line above the main row
    // for any record that resolves a parent via field_2464. Replaces
    // the previous amber label-slot chip (which truncated and read
    // like an error). Lives inside the card so background tinting on
    // open / selected propagates naturally.
    var attachedCaption = '';
    var parentRefLabel  = readParentRef(rec);
    if (parentRefLabel) {
      attachedCaption =
        '<div class="scw-ws-v2-attached-caption" ' +
          'title="Attached to ' + escapeHtml(parentRefLabel) + '">' +
          '↳ attached to <span class="scw-ws-v2-attached-name">' +
            escapeHtml(parentRefLabel) +
          '</span>' +
        '</div>';
    }

    card.innerHTML = attachedCaption + row + det;
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

  /** Public label resolver for a line-item record — same product/drop
   *  lookup readParentRef uses, but starts from the record itself
   *  instead of the parent connection. Strips Knack\'s synthesized
   *  "<recordId> (<mdfLabel>)" identifier the same way. Used by
   *  init.js\'s parent-picker itemLabel so candidates render cleanly
   *  regardless of bucket. */
  function labelLineItem(rec) {
    if (!rec) return '';
    var a = rec.attributes || rec;
    function clean(v) { return (v || '').toString().replace(/<[^>]*>/g, '').trim(); }
    function connIdent(raw) {
      if (Array.isArray(raw) && raw.length && raw[0]) {
        return clean(raw[0].identifier || raw[0].name || '');
      }
      return '';
    }
    var drop = clean(a.field_1950) || connIdent(a.field_1950_raw);
    var prod = clean(a.field_1949) || connIdent(a.field_1949_raw);
    if (/^[a-f0-9]{24}(\s|\b|$)/i.test(drop)) drop = '';
    if (/^[a-f0-9]{24}(\s|\b|$)/i.test(prod)) prod = '';
    if (drop && prod) return drop + ' · ' + prod;
    return prod || drop || rec.id || '';
  }

  ns.card = {
    buildCard:           buildCard,
    bucketIdOf:          bucketIdOf,
    CAM_READER_BUCKET:   CAM_READER_BUCKET,
    SERVICES_BUCKET:     SERVICES_BUCKET,
    ASSUMPTIONS_BUCKET:  ASSUMPTIONS_BUCKET,
    NETWORKING_BUCKET:   NETWORKING_BUCKET,
    bucketCategoryOf:    bucketCategoryOf,
    labelLineItem:       labelLineItem
  };
})();
/*** END WORKSHEET V2 — CARD **************************************************/
