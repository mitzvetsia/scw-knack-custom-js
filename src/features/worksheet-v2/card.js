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

  function textInput(rec, viewKey, fieldKey, value, label) {
    return '<input type="text" class="scw-ws-v2-input scw-ws-v2-input--text" ' +
      'aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(label) + '" ' +
      'value="' + escapeHtml(value) + '"' + attrsFor(rec, viewKey, fieldKey) + '>';
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
    return '<button type="button" ' +
      'class="scw-ws-v2-cell scw-ws-v2-cell--product scw-ws-v2-cell--editable-conn" ' +
      'data-scw-ws-v2-conn="field_1949" ' +
      'data-scw-ws-v2-record="' + escapeHtml(rec.id) + '" ' +
      'data-scw-ws-v2-view="' + escapeHtml(viewKey) + '" ' +
      'data-scw-ws-v2-conn-label="Product" ' +
      'title="' + escapeHtml(value) + ' — click to change product">' +
      escapeHtml(value) +
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

    var chips =
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--chips">' +
        chip(rec, viewKey, 'field_2461', 'Cab', 'Existing cabling') +
        chip(rec, viewKey, 'field_1984', 'Ext', 'Exterior') +
        chip(rec, viewKey, 'field_1983', 'Pln', 'Plenum') +
      '</div>';

    return '<div class="scw-ws-v2-row scw-ws-v2-row--cam">' +
      ro(label,   'scw-ws-v2-cell--label',   label) +
      productCell(rec, viewKey, product) +
      chips +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textInput(rec, viewKey, 'field_2020', laborDesc, 'Labor description') +
      '</div>' +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--num">' +
        numInput(rec, viewKey, 'field_1964', qty, 'Qty') +
      '</div>' +
      stackCell(rec, viewKey, 'field_2150', subBid,  subBidTotal, 'Sub Bid') +
      stackCell(rec, viewKey, 'field_1973', plusHrs, hrsTotal,    '+Hrs') +
      stackCell(rec, viewKey, 'field_1974', plusMat, matTotal,    '+Mat') +
      ro(installFee, 'scw-ws-v2-cell--fee', 'Install fee') +
      ro(sow,        'scw-ws-v2-cell--sow', 'SOW') +
      chevronCell(rec) +
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

    return '<div class="scw-ws-v2-row scw-ws-v2-row--default">' +
      productCell(rec, viewKey, product) +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textInput(rec, viewKey, 'field_2020', laborDesc, 'Labor description') +
      '</div>' +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--num">' +
        numInput(rec, viewKey, 'field_1964', qty, 'Qty') +
      '</div>' +
      stackCell(rec, viewKey, 'field_2150', subBid,  subBidTotal, 'Sub Bid') +
      stackCell(rec, viewKey, 'field_1973', plusHrs, hrsTotal,    '+Hrs') +
      stackCell(rec, viewKey, 'field_1974', plusMat, matTotal,    '+Mat') +
      ro(installFee, 'scw-ws-v2-cell--fee', 'Install fee') +
      ro(sow,        'scw-ws-v2-cell--sow', 'SOW') +
      chevronCell(rec) +
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

    return '<div class="scw-ws-v2-row scw-ws-v2-row--services">' +
      ro('Service', 'scw-ws-v2-cell--tag') +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textInput(rec, viewKey, 'field_2020', laborDesc, 'Service description') +
      '</div>' +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--num">' +
        numInput(rec, viewKey, 'field_1964', qty, 'Qty') +
      '</div>' +
      stackCell(rec, viewKey, 'field_2150', subBid,  subBidTotal, 'Sub Bid') +
      stackCell(rec, viewKey, 'field_1973', plusHrs, hrsTotal,    '+Hrs') +
      stackCell(rec, viewKey, 'field_1974', plusMat, matTotal,    '+Mat') +
      ro(installFee, 'scw-ws-v2-cell--fee', 'Install fee') +
      ro(sow,        'scw-ws-v2-cell--sow', 'SOW') +
      chevronCell(rec) +
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
        textInput(rec, viewKey, 'field_2020', laborDesc, 'Assumption text') +
      '</div>' +
      chevronCell(rec) +
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
   * Single source of truth: view_3610's rendered DOM. Mirrors v1's
   * connected-records.js readConnectionLinks exactly:
   *
   *   1. Find the parent row in view_3610 (still on the page during
   *      the parallel v1/v2 build — see config.js mountAfterSelector).
   *   2. view_3610 renders <td class="field_1958"> twice on each row
   *      (inline-edit ghost column + display column). Iterate all
   *      matching tds and pick the FIRST whose
   *      <span data-kn="connection-value"> children have non-empty
   *      text. That's the same "1st-or-2nd, whichever has data"
   *      pattern as v1's readConnectionLinks (line 337).
   *   3. Each span: textContent → chip label, span.id → 24-hex
   *      connected record id (used to build the edit-accessory URL).
   *
   * Fallback only when view_3610 isn't on the page (Phase 5 cleanup):
   * read rec.field_1958_raw[*].identifier.
   */
  function detailMountingHardware(rec, viewKey) {
    var parentId = rec.id;
    var base = buildSowBasePath();
    var addHref = base ? base + '/add-accessory-line-item/' + parentId + '/' : '#';

    // ── DOM source of truth (matches v1's connected-records.js) ──
    // view_3610 renders <td class="field_1958"> TWICE on each row
    // (inline-edit ghost column + display column). v1's
    // readConnectionLinks iterates the matching tds and returns the
    // first one whose spans have non-empty text. Replicate that here:
    // each <span data-kn="connection-value"> in the winning td is one
    // accessory — span.textContent is the chip label, span.id is the
    // 24-hex connected record id.
    var chips = [];
    try {
      var v3610 = document.getElementById('view_3610');
      var tr = v3610 && v3610.querySelector('tr[id="' + parentId + '"]');
      if (tr) {
        var tds = tr.querySelectorAll('td.field_1958');
        for (var t = 0; t < tds.length; t++) {
          var spans = tds[t].querySelectorAll('span[data-kn="connection-value"]');
          for (var s = 0; s < spans.length; s++) {
            var spText = (spans[s].textContent || '').replace(/\s+/g, ' ').trim();
            var spId = (spans[s].id && /^[a-f0-9]{24}$/.test(spans[s].id))
              ? spans[s].id : '';
            if (spText && spText !== ' ') {
              chips.push({ id: spId, label: spText });
            }
          }
          if (chips.length) break; // first non-empty td wins
        }
      }
    } catch (e) { /* fall through to raw fallback */ }

    // Fallback for when view_3610 isn't on the page (Phase 5 retires
    // v1). Pull identifiers from the model's field_1958_raw.
    if (chips.length === 0) {
      var raw = rec['field_1958_raw'];
      if (Array.isArray(raw)) {
        for (var ri = 0; ri < raw.length; ri++) {
          var a = raw[ri];
          if (!a) continue;
          var lbl = a.identifier
            ? String(a.identifier).replace(/<[^>]*>/g, '').trim()
            : '';
          chips.push({ id: a.id || '', label: lbl || a.id || '' });
        }
      }
    }

    var chipsHtml = '';
    if (chips.length === 0) {
      chipsHtml = '<span class="scw-ws-v2-mh-empty">&mdash;</span>';
    } else {
      for (var c = 0; c < chips.length; c++) {
        var editHref = base && chips[c].id
          ? base + '/edit-accessory-line-item2/' + chips[c].id + '/'
          : '#';
        chipsHtml += '<a class="scw-ws-v2-mh-chip" href="' + escapeHtml(editHref) + '"' +
          ' title="Edit ' + escapeHtml(chips[c].label) + '">' +
          escapeHtml(chips[c].label) +
        '</a>';
      }
    }

    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--mh">' +
      '<div class="scw-ws-v2-detail-label">Mounting Hardware</div>' +
      '<div class="scw-ws-v2-mh-list">' + chipsHtml +
        '<a class="scw-ws-v2-mh-add" href="' + escapeHtml(addHref) + '"' +
          ' title="Add mounting hardware">+ Add</a>' +
      '</div>' +
    '</div>';
  }

  function buildDetail_cam(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-grid">' +
        detailReadOnly(rec,                  'field_2240', 'Drop Prefix') +
        detailField(rec,            viewKey, 'field_1951', 'Drop Number', 'number') +
        // Mounting Hardware (field_1958) renders as a connected-records
        // widget with chip-style edit links + an "+ Add" navigation —
        // matches v1's UX on view_3610 (no inline modal, just navigation).
        detailMountingHardware(rec, viewKey) +
        // Connected Device (field_2197) — single-select picker on
        // cam/reader rows. Candidates filtered to Map-Connections-Yes
        // rows; see init.js click handler.
        detailConnection(rec,       viewKey, 'field_2197', 'Connected Device') +
        detailField(rec,            viewKey, 'field_1965', 'Drop Length', 'number') +
        detailField(rec,            viewKey, 'field_2035', 'Conduit',     'number') +
        detailField(rec,            viewKey, 'field_1953', 'SCW Notes',   'text') +
        detailReadOnly(rec,                  'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  function buildDetail_default(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-grid">' +
        // Mounting Hardware — same connected-records widget as cam/reader.
        detailMountingHardware(rec, viewKey) +
        // Connected Devices (field_1957) — multi-select picker for NVR
        // rows attaching cam/readers (existing wiring in init.js).
        detailConnection(rec,       viewKey, 'field_1957', 'Connected Devices') +
        detailField(rec,            viewKey, 'field_1953', 'SCW Notes', 'text') +
        detailReadOnly(rec,                  'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  function buildDetail_services(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-grid">' +
        detailField(rec,    viewKey, 'field_1953', 'SCW Notes', 'text') +
        detailReadOnly(rec,          'field_2412', 'Survey Notes') +
      '</div>' +
    '</div>';
  }

  function buildDetail_assumptions(rec, viewKey) {
    // Assumptions are essentially long-form text. The labor desc in
    // the summary row is the primary text; the detail panel adds
    // SCW Notes for internal annotations.
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-grid">' +
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
    return card;
  }

  ns.card = {
    buildCard:           buildCard,
    CAM_READER_BUCKET:   CAM_READER_BUCKET,
    SERVICES_BUCKET:     SERVICES_BUCKET,
    ASSUMPTIONS_BUCKET:  ASSUMPTIONS_BUCKET,
    bucketCategoryOf:    bucketCategoryOf
  };
})();
/*** END WORKSHEET V2 — CARD **************************************************/
