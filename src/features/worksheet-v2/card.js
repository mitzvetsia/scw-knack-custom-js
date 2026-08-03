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

  // SOW connection identifiers can be BLANK on freshly created SOW
  // headers — Knack denormalizes the identifier onto the line item at
  // write time, before the SOW's display name has computed, so the
  // native field_2154 cells render blank and readField would fall back
  // to the raw 24-hex record id. Resolve the friendly name from the SOW
  // header grids on the scene before ever showing an id.
  var SOW_NAME_VIEWS  = ['view_3325', 'view_3918', 'view_3884'];
  var SOW_NAME_FIELDS = ['field_2126', 'field_2127', 'field_2122'];
  function sowNameById(id) {
    if (!id) return '';
    for (var vi = 0; vi < SOW_NAME_VIEWS.length; vi++) {
      try {
        var v = window.Knack && Knack.views && Knack.views[SOW_NAME_VIEWS[vi]];
        var models = v && v.model && v.model.data && v.model.data.models;
        if (!models) continue;
        for (var i = 0; i < models.length; i++) {
          var a = models[i] && models[i].attributes;
          if (!a || a.id !== id) continue;
          for (var f = 0; f < SOW_NAME_FIELDS.length; f++) {
            var n = String(a[SOW_NAME_FIELDS[f]] || '').replace(/<[^>]*>/g, '').trim();
            if (n) return n;
          }
        }
      } catch (e) { /* next view */ }
    }
    return '';
  }
  function readSowField(rec) {
    var raw = rec && rec['field_2154_raw'];
    if (!Array.isArray(raw) || !raw.length) return '';
    return raw.map(function (r) {
      if (!r) return '';
      var ident = String(r.identifier || '').replace(/<[^>]*>/g, '').trim();
      return ident || sowNameById(r.id) || r.id || '';
    }).filter(Boolean).join(', ');
  }
  ns.sowNameById = sowNameById;

  /** Normalize a money/number string to a plain numeric string, PRESERVING
   *  the sign across every negative format Knack emits: "-$2,500.00",
   *  "$-2,500.00", accounting parens "($2,500.00)", and trailing-minus
   *  "2,500.00-". The old blind strip could leave the minus mid-string
   *  (e.g. "$-2,500.00" → "-2500.00" was fine, but "2,500.00-" →
   *  "2500.00-" is INVALID and a type="number" input silently renders an
   *  invalid value attribute as BLANK — the "Sub Bid appears empty on CO
   *  Remove lines" bug). Returns '' when nothing numeric is present. */
  function parseNumStr(s) {
    s = String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim();
    if (!s) return '';
    var neg = /^\(.*\)$/.test(s) || s.indexOf('-') !== -1;
    var digits = s.replace(/[^0-9.]/g, '');
    if (!digits) return '';
    var n = parseFloat(digits);
    if (!isFinite(n)) return '';
    return String(neg ? -n : n);
  }

  function readNum(rec, key) {
    var raw = rec[key + '_raw'];
    if (typeof raw === 'number') return String(raw);
    // Knack sometimes ships currency raws as STRINGS — parse those with
    // the same sign-preserving normalizer instead of falling through to
    // the (differently-formatted) display value.
    if (typeof raw === 'string' && raw.trim() !== '') {
      var p = parseNumStr(raw);
      if (p !== '') return p;
    }
    return parseNumStr(readField(rec, key));
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

  // Resolve the proposal-bucket field key for a view. Default field_2219
  // (SOW); the survey object (view_3505) overrides bucket→field_2366. Callers
  // that pass no viewKey keep the SOW default — behavior-preserving for the
  // existing deployments (and for the cross-module callers in warnings/bulk/
  // summary that classify SOW records).
  function bucketFieldOf(viewKey) {
    try {
      var f = viewKey && ns.cfg && typeof ns.cfg.fields === 'function'
        ? ns.cfg.fields(viewKey) : null;
      if (f && f.bucket) return f.bucket;
    } catch (e) { /* fall through */ }
    return 'field_2219';
  }

  function bucketIdOf(rec, viewKey) {
    var raw = rec[bucketFieldOf(viewKey) + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }

  function bucketCategoryOf(rec, viewKey) {
    var id = bucketIdOf(rec, viewKey);
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

  /** Editable multi-line read: the stored value VERBATIM — tags, entities
   *  and all — with only <br> converted to \n so line breaks edit as real
   *  line breaks. These fields deliberately carry hand-written HTML
   *  (<b>, lists, …) that the proposal renders, so the editor must expose
   *  the markup for editing rather than a stripped rendering of it; the
   *  earlier tag-stripping prefill meant the next blur-save destroyed the
   *  record's formatting. edit.js converts \n back to <br> on save
   *  (textareas only), so the round trip is lossless. */
  function readMultiline(rec, key) {
    var v = rec[key];
    if (v == null || v === '') {
      var raw = rec[key + '_raw'];
      v = (raw == null || typeof raw === 'object') ? '' : raw;
    }
    return String(v).replace(/<br\s*\/?>/gi, '\n').trim();
  }

  /** Multi-line wrapping text field — used for labor description so
   *  the full text is visible without horizontal scroll. Auto-grows
   *  with content via CSS field-sizing / rows attribute fallback.
   *  NOTE: the value is re-derived via readMultiline (markup verbatim,
   *  <br> as line breaks); the caller-passed flattened value is only a
   *  fallback when the record/field aren't resolvable. */
  function textArea(rec, viewKey, fieldKey, value, label) {
    var v = (rec && fieldKey) ? readMultiline(rec, fieldKey) : (value || '');
    return '<textarea class="scw-ws-v2-input scw-ws-v2-input--textarea" ' +
      'rows="2" ' +
      'aria-label="' + escapeHtml(label) + '" placeholder="' + escapeHtml(label) + '"' +
      attrsFor(rec, viewKey, fieldKey) + '>' +
      escapeHtml(v) +
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

  /** True when the deployment uses the sales money model (moneyMode:'sales'
   *  in config) — summary shows a single read-only Total instead of the
   *  build-SOW Sub Bid / +Hrs / +Mat / Fee stacks. */
  function isSalesMoney(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return !!(vc && vc.moneyMode === 'sales');
    } catch (e) { return false; }
  }

  /** True when the deployment uses the survey money model (moneyMode:'survey',
   *  view_3505). Survey has no Sub Bid/+Hrs/+Mat — the money region is a
   *  single Labor (editable) cell with the CALC Ext below it; Qty lives in
   *  the qty/chips slot. Drives the survey card path (buildCard dispatch). */
  function isSurveyMoney(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return !!(vc && vc.moneyMode === 'survey');
    } catch (e) { return false; }
  }

  /** True when the deployment uses the install money model (moneyMode:'install',
   *  view_4093 — Deploy / Install Line Items). The install object is a DIFFERENT
   *  Knack object from the SOW line item and has NO money columns at all (no Sub
   *  Bid / +Hrs / +Mat / Fee / Labor / Ext / Bid). The summary row is just
   *  chevron · label (cam) · product (read-only) · labor-desc fill · warn ·
   *  kebab; the money region is fully suppressed. Drives the install card path
   *  (buildCard dispatch). The install-status chip + QA chits are NOT built here
   *  — install-config-subpanel.js / config-qa-popover.js inject them post-render. */
  function isInstallMoney(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return !!(vc && vc.moneyMode === 'install');
    } catch (e) { return false; }
  }

  // ── v1 dynamic-cell-colors parity (survey worksheet) ──────────────
  // v1 colors the survey worksheet table cells (dynamic-cell-colors.js,
  // view_3505 rules): Labor (field_2400) empty→danger / zero→warning, Bid
  // (field_2415) empty→warning, Qty (field_2399) zero→warning, Labor
  // Description (field_2409) empty→danger. The v2 worksheet renders cards
  // (not table cells), so we recompute the same empty/zero state per field
  // and add a warn class to the card cell. Mirrors v1's normalize/isZero.
  function _normCellText(s) {
    return String(s == null ? '' : s)
      .replace(/<[^>]*>/g, ' ')
      .replace(/[ ​‌‍﻿]/g, ' ')
      .trim();
  }
  function _cellIsEmpty(t) { return t === '' || t === '-' || t === '—'; }
  function _cellIsZero(t)  { return /^\$?0+(\.0+)?$/.test(t); }
  /** v1 empty/zero → warn class. emptyColor/zeroColor are 'danger'|'warning'
   *  |null. Returns '' (no class) when neither condition matches. */
  function surveyWarnClass(rec, fieldKey, emptyColor, zeroColor) {
    var t = _normCellText(readField(rec, fieldKey));
    if (_cellIsEmpty(t)) return emptyColor ? ('scw-ws-v2-cell--' + emptyColor) : '';
    if (_cellIsZero(t))  return zeroColor  ? ('scw-ws-v2-cell--' + zeroColor)  : '';
    return '';
  }

  /** Resolved field map for a view (logical name → field key). Survey reads
   *  go through this so the survey builders carry no hardcoded survey keys. */
  function fieldsFor(viewKey) {
    try {
      return (ns.cfg && typeof ns.cfg.fields === 'function' && ns.cfg.fields(viewKey)) || {};
    } catch (e) { return {}; }
  }

  // ── Per-render record indexes ─────────────────────────────────────────
  // Connection rendering (Connected Devices, accessory chips) needs to find
  // "every record whose back-pointer field points at THIS card's record".
  // Done naively that's an all-records scan PER card → O(n²) on a big
  // worksheet (the dominant cold-render cost). Instead build the lookup ONCE
  // per render and reuse it for every card. data.js now hands back a stable
  // records-array reference until the model structurally changes, so we key
  // the cache on that reference — it auto-rebuilds exactly when the data does.
  var _idx = { arr: null, gen: -1, byId: null, back: null };
  function recordsArr(viewKey) {
    return (ns.data && typeof ns.data.readRecords === 'function')
      ? ns.data.readRecords(viewKey) : [];
  }
  function ensureIdx(viewKey) {
    var arr = recordsArr(viewKey);
    // Rebuild when the model array changes (structural) OR a new render starts
    // (ns.idxGen, bumped by render.js). The latter matters because in-place
    // edits mutate attributes WITHOUT swapping the array ref, so a changed
    // back-pointer (field_2197 / field_2464) must invalidate the derived index.
    var gen = ns.idxGen || 0;
    if (_idx.arr !== arr || _idx.gen !== gen) {
      _idx.arr = arr; _idx.gen = gen; _idx.byId = null; _idx.back = Object.create(null);
    }
    return arr;
  }
  /** id → record map for the current view's loaded records (cached/render). */
  function recById(viewKey) {
    ensureIdx(viewKey);
    if (!_idx.byId) {
      var m = Object.create(null), arr = _idx.arr;
      for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id) m[arr[i].id] = arr[i]; }
      _idx.byId = m;
    }
    return _idx.byId;
  }
  /** parentId → [childRecord] for records whose `recipKey`_raw points at it. */
  function backIndex(viewKey, recipKey) {
    ensureIdx(viewKey);
    var m = _idx.back[recipKey];
    if (m) return m;
    m = Object.create(null);
    var arr = _idx.arr;
    for (var i = 0; i < arr.length; i++) {
      var crec = arr[i];
      if (!crec || !crec.id) continue;
      var back = crec[recipKey + '_raw'];
      if (!Array.isArray(back)) continue;
      for (var b = 0; b < back.length; b++) {
        var pid = back[b] && back[b].id;
        if (pid) { (m[pid] || (m[pid] = [])).push(crec); }
      }
    }
    _idx.back[recipKey] = m;
    return m;
  }

  /** Connected-Devices reciprocal fingerprint for a record — the sorted ids
   *  of every child whose Connected To (recipKey) points back at it. Folded
   *  into the card's render signature (render.js) so a parent card REBUILDS
   *  when a child connects/disconnects. Without it the parent's signature
   *  (its own JSON) is unchanged by a child edit, so the keyed-reuse path
   *  serves the stale Connected Devices display until a full page reload.
   *  Returns '' for views with no reciprocal field or records with no
   *  children (no signature impact → reuse path unaffected). */
  function connDevicesSig(rec, viewKey) {
    try {
      if (!rec || !rec.id) return '';
      var recipKey = fieldsFor(viewKey).connectedDevice;
      if (!recipKey) return '';
      var kids = backIndex(viewKey, recipKey)[rec.id];
      if (!kids || !kids.length) return '';
      var ids = [];
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] && kids[i].id) ids.push(kids[i].id);
      }
      ids.sort();
      return ids.join(',');
    } catch (e) { return ''; }
  }

  /** Count on field_2586 ("associated survey line items"). >0 means a survey
   *  line-item record has been created for this SOW line item (i.e. it's an
   *  existing/committed item), vs a brand-new sales addition (0). */
  function surveyAssocCount(rec) {
    var raw = rec && rec['field_2586_raw'];
    if (typeof raw === 'number') return raw;
    var v = parseFloat(String((rec && rec['field_2586']) || '')
      .replace(/[^0-9.\-]/g, ''));
    return isNaN(v) ? 0 : v;
  }

  /** Sales lock rule (mirrors v1 sales-change-request/lockNewItemFields):
   *  items that have a survey line-item record created for them
   *  (field_2586 >= 1) are read-only on
   *  everything EXCEPT Product (field_1949), Custom Disc % (field_2261), and
   *  SCW Notes (field_1953). Brand-new sales items (field_2586 = 0) stay
   *  fully editable. Only applies on the sales deployment. */
  function isCrLocked(rec, viewKey) {
    if (isSalesMoney(viewKey) && surveyAssocCount(rec) >= 1) return true;
    // Survey worksheet (view_3505): a finalized row (FLAG_locked field_2551 =
    // Yes) is fully read-only — v1 "lock all fields if field_2551 = Yes". The
    // `locked` logical field is mapped only on the survey view, so this is a
    // no-op everywhere else.
    var f = (ns.cfg && ns.cfg.fields(viewKey)) || {};
    if (f.locked && readBool(rec, f.locked) === 'Yes') return true;
    return false;
  }

  // Fields that stay editable even on a locked (existing) sales row.
  var LOCK_WHITELIST = { field_1949: 1, field_2261: 1, field_1953: 1 };

  /** Post-build pass: neutralize every editable control in a locked card
   *  except the whitelisted three. Read-only inputs (keep readable, white
   *  bg, no pointer/keyboard), non-interactive chips / connection pickers /
   *  accessory buttons, and hide the per-row delete. */
  function lockCardFields(card) {
    var i, el, f;
    var inputs = card.querySelectorAll(
      'input[data-scw-ws-v2-field], textarea[data-scw-ws-v2-field]'
    );
    for (i = 0; i < inputs.length; i++) {
      el = inputs[i];
      f = el.getAttribute('data-scw-ws-v2-field');
      if (LOCK_WHITELIST[f]) continue;
      el.readOnly = true;
      el.tabIndex = -1;
      el.style.pointerEvents = 'none';
      // Appearance handled by CSS ([readonly] in a locked card → plain
      // text, no box) so locked fields visibly read as non-editable.
      setLockTooltip(el);
    }
    // Editable connection cells/buttons (product field_1949 is whitelisted).
    var conns = card.querySelectorAll('[data-scw-ws-v2-conn]');
    for (i = 0; i < conns.length; i++) {
      el = conns[i];
      f = el.getAttribute('data-scw-ws-v2-conn');
      if (LOCK_WHITELIST[f]) continue;
      el.style.pointerEvents = 'none';
      el.classList.add('scw-ws-v2-locked-ctl');
      setLockTooltip(el);
    }
    // Boolean chips (cabling), accessory add/remove/qty, and the per-row
    // trash button.
    var ctls = card.querySelectorAll(
      '[data-scw-ws-v2-chip], .scw-ws-v2-mh-add, .scw-ws-v2-mh-del, ' +
      '.scw-ws-v2-mh-unlink, .scw-ws-v2-mh-step, .scw-ws-v2-mh-chip'
    );
    for (i = 0; i < ctls.length; i++) {
      ctls[i].style.pointerEvents = 'none';
      ctls[i].classList.add('scw-ws-v2-locked-ctl');
      setLockTooltip(ctls[i]);
    }
    var trash = card.querySelectorAll('.scw-ws-v2-trash');
    for (i = 0; i < trash.length; i++) {
      // Reuse the trash slot (same width as an unlocked row's delete
      // button, so locked rows keep identical column alignment) for a
      // lock indicator instead of hiding it and collapsing the slot.
      el = trash[i];
      el.innerHTML = LOCK_SVG_SM;
      el.className = 'scw-ws-v2-cell scw-ws-v2-trash scw-ws-v2-lock-cell';
      el.setAttribute('aria-hidden', 'false');
      el.setAttribute('aria-label', 'Locked — submitted for survey');
      el.title = LOCKED_MSG;
      el.style.display = '';
      el.style.pointerEvents = '';
    }
  }

  // Shared copy + glyph for the lock messaging.
  var LOCKED_MSG = 'This item is locked because it has already been ' +
    'submitted for survey. Product, Custom Disc % and SCW Notes remain editable.';
  var LOCK_HOVER_MSG = 'Fields are locked because this item has been part of a survey.';
  // Reason-aware copy — set per card right before the lock pass runs (sales
  // survey-assoc vs survey finalized). setLockTooltip + addLockedNote read it.
  var _lockCopy = { msg: LOCKED_MSG, hover: LOCK_HOVER_MSG };

  /** Hover tooltip for a locked control. The control itself has
   *  pointer-events:none (it can't receive hover, so a title on it never
   *  shows) — the title must go on the nearest still-hoverable wrapper. */
  function setLockTooltip(el) {
    try {
      var wrap = el.closest(
        '.scw-ws-v2-detail-field, .scw-ws-v2-cell, .scw-ws-v2-mh-chip-wrap, ' +
        '.scw-ws-v2-mh-addrow'
      ) || el.parentElement;
      if (wrap) wrap.title = _lockCopy.hover;
    } catch (e) { /* tooltip is best-effort */ }
  }
  var LOCK_SVG_SM =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
      '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>' +
    '</svg>';

  /** Prepend a full-width informational banner to the locked card's detail
   *  panel — the row-level lock icon is icon-only (tooltip), so the readable
   *  sentence lives here where there's horizontal room. */
  function addLockedNote(card) {
    var detail = card.querySelector('.scw-ws-v2-detail');
    if (!detail || detail.querySelector('.scw-ws-v2-locked-note')) return;
    var note = document.createElement('div');
    note.className = 'scw-ws-v2-locked-note';
    note.innerHTML = LOCK_SVG_SM + '<span>' + escapeHtml(_lockCopy.msg) + '</span>';
    detail.insertBefore(note, detail.firstChild);
  }

  /** Money region of the summary row. Build-SOW: three editable stacks +
   *  read-only install fee. Sales: a single read-only Total (field_2269)
   *  that spans the four money tracks via CSS (.scw-ws-v2-cell--sales-total).
   *  Retail / Discount % / Applied Discount move to the detail panel. */
  function moneyCells(rec, viewKey) {
    if (isSalesMoney(viewKey)) {
      var total = readField(rec, 'field_2269') || '$0.00';
      return '<div class="scw-ws-v2-cell scw-ws-v2-cell--sales-total" title="Line total">' +
        escapeHtml(total) +
      '</div>';
    }
    if (isLaborOnly(viewKey)) {
      // Sub CO page: Sub Bid is the sub's ONLY money. +Hrs/+Mat (SCW-side
      // adders) and Fee (client install price) don't render at all — the
      // labor grid (.scw-ws-v2-card--labor, styles.js) drops those tracks
      // entirely so the row closes up instead of holding blank space.
      return stackCell(rec, viewKey, 'field_2150', readNum(rec, 'field_2150'), readField(rec, 'field_2151'), 'Sub Bid');
    }
    // Ops CO worksheet (config equipmentField): Equipment $ stack first —
    // unit price editable, extended equipment (field_2201) shown beneath —
    // and a trailing read-only extended-NET total (field_2269) so the
    // all-in line value is visible while pricing.
    var eqF = equipmentFieldOf(viewKey);
    var eq = eqF
      ? stackCell(rec, viewKey, eqF, readNum(rec, eqF), readField(rec, 'field_2201'), 'Equip $')
      : '';
    var net = eqF
      ? ro(readField(rec, 'field_2269'), 'scw-ws-v2-cell--fee scw-ws-v2-cell--net', 'Extended net total')
      : '';
    return eq +
           stackCell(rec, viewKey, 'field_2150', readNum(rec, 'field_2150'), readField(rec, 'field_2151'), 'Sub Bid') +
           stackCell(rec, viewKey, 'field_1973', readNum(rec, 'field_1973'), readField(rec, 'field_1997'), '+Hrs') +
           stackCell(rec, viewKey, 'field_1974', readNum(rec, 'field_1974'), readField(rec, 'field_2146'), '+Mat') +
           ro(readField(rec, 'field_2028'), 'scw-ws-v2-cell--fee', 'Install fee') +
           net;
  }

  /** Sales-only detail zone — Retail Price (ro), Discount % (editable),
   *  Applied Discount (ro), Total (ro). Empty string for non-sales views. */
  function salesPricingDetail(rec, viewKey) {
    if (!isSalesMoney(viewKey)) return '';
    return '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--pricing">' +
      detailReadOnly(rec,          'field_1960', 'Retail Price') +
      detailField(rec,    viewKey, 'field_2261', 'Custom Disc %', 'number') +
      detailReadOnly(rec,          'field_2303', 'Applied Discount') +
      detailReadOnly(rec,          'field_2269', 'Total') +
    '</div>';
  }

  /** True when the view shows LABOR money only (config laborOnly — the sub
   *  CO page): Fee/+Hrs/+Mat are SCW-side or client-facing numbers, so
   *  their cells render blank (grid alignment kept) and never carry data. */
  function isLaborOnly(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return !!(vc && vc.laborOnly);
    } catch (e) { return false; }
  }

  /** Equipment money field (config equipmentField — the ops CO worksheet,
   *  view_4079): an editable unit-equipment-price stack rendered ahead of
   *  Sub Bid so ops price CO adds in full (equipment + labor). Inert on
   *  sales/survey/install/laborOnly views — those money models never reach
   *  the build-SOW stack branch. */
  function equipmentFieldOf(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return (vc && vc.equipmentField) || null;
    } catch (e) { return null; }
  }

  /** True when the view hides the SOW column entirely (config hideSow). */
  function hideSow(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return !!(vc && vc.hideSow);
    } catch (e) { return false; }
  }

  /** SOW summary cell — omitted entirely when the view hides SOW. */
  function sowSlot(rec, viewKey) {
    if (hideSow(viewKey)) return '';
    return sowCell(rec, viewKey, readSowField(rec));
  }

  /** Blank money cells for no-money rows (assumptions). Matches the active
   *  money model's track count so the grid stays aligned: one blank Total
   *  in sales mode, three blank stacks + fee otherwise. */
  function moneyCellsBlank(viewKey) {
    if (isSalesMoney(viewKey)) return empty('scw-ws-v2-cell--sales-total');
    if (isLaborOnly(viewKey))  return empty('scw-ws-v2-cell--stack');
    var hasEq = !!equipmentFieldOf(viewKey);
    return (hasEq ? empty('scw-ws-v2-cell--stack') : '') +
           empty('scw-ws-v2-cell--stack') +
           empty('scw-ws-v2-cell--stack') +
           empty('scw-ws-v2-cell--stack') +
           empty('scw-ws-v2-cell--fee') +
           (hasEq ? empty('scw-ws-v2-cell--fee') : '');   /* net track */
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

  // Clean display for a connection to ANOTHER LINE ITEM (accessory→parent
  // field_2464, cam→device field_2197). The line-item object's auto-built
  // Knack identifier degenerates to "<recordId> (<mdfLabel>)" for records
  // with no real drop label (networking/headend, accessory-created rows) —
  // that string comes FROM THE SERVER, so no refetch ever fixes it. Resolve
  // the target record in the model and print its real drop/product label;
  // fall back to stripping the "<24-hex> (label)" wrapper off the identifier.
  function readConnRef(rec, fieldKey) {
    var raw = rec && rec[fieldKey + '_raw'];
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
      // Bare 24-hex identifier (no wrapper) — never print a record id.
      if (/^[a-f0-9]{24}$/i.test(s)) return '';
      return s;
    }
    return '';
  }

  function readParentRef(rec) { return readConnRef(rec, 'field_2464'); }

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

  // Broken-chain "unlink" glyph (Lucide unlink) — accessory chip action that
  // detaches the accessory from its parent (clears field_2464) WITHOUT
  // deleting the record.
  var UNLINK_SVG =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" ' +
    'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71"/>' +
    '<path d="m5.17 11.75-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71"/>' +
    '<line x1="8" y1="2" x2="8" y2="5"/>' +
    '<line x1="2" y1="8" x2="5" y2="8"/>' +
    '<line x1="16" y1="19" x2="16" y2="22"/>' +
    '<line x1="19" y1="16" x2="22" y2="16"/></svg>';

  /** v1 parity (device-worksheet `hideDeleteWhenCountGtZero` on view_3586):
   *  a SOW line item that has associated SURVEY line items (field_2586 > 0)
   *  is survey-derived and must NOT be deletable from the worksheet — it has
   *  to be removed from the survey instead. Returns true when delete is
   *  blocked for this record. */
  // Surfaces where the survey-link delete block applies. v1 configures
  // hideDeleteWhenCountGtZero ONLY on the sales view (view_3586); we extend it
  // to the bid-review comparison grid (view_3921), which shows the same
  // survey-derived items. The internal build-SOW grid (view_3962) is left
  // alone, matching v1 (view_3610 has no block).
  var DELETE_BLOCK_VIEWS = { view_3586: 1, view_3921: 1 };
  // Survey worksheet (view_3505): v1 hid delete via hideDeleteWhenFieldNotBlank
  // = field_2404 — once a survey line item is adopted into a SOW (REL_sow line
  // item populated) it must be removed from the SOW, not deleted here. Map the
  // logical field per view so it resolves correctly.
  var DELETE_BLOCK_WHEN_SET = { view_3505: 'sowLineItem' };

  function isDeleteBlocked(rec, viewKey) {
    var f = (ns.cfg && ns.cfg.fields(viewKey)) || {};
    // (a) "field not blank" rule (survey item adopted into a SOW).
    if (DELETE_BLOCK_WHEN_SET[viewKey]) {
      var fk = f[DELETE_BLOCK_WHEN_SET[viewKey]] || 'field_2404';
      var v = rec[fk + '_raw'];
      var blank = (v == null) || v === '' || (Array.isArray(v) && !v.length);
      if (!blank) return true;
    }
    // Finalized rows (FLAG_locked = Yes) can't be deleted either.
    if (f.locked && readBool(rec, f.locked) === 'Yes') return true;
    // (b) "count > 0" rule (survey-derived SOW items on sales / bid-review).
    if (DELETE_BLOCK_VIEWS[viewKey]) {
      var key = f.surveyItemCount || 'field_2586';
      var raw = rec[key + '_raw'];
      var n = (typeof raw === 'number') ? raw : parseFloat(readNum(rec, key));
      if (!isNaN(n) && n > 0) return true;
    }
    return false;
  }

  /** Direct-action delete button — was a kebab menu, now a single
   *  trash icon. Click → auto-confirmed native delete + accessory
   *  cascade (handled in init.js). data-scw-ws-v2-kebab kept as the
   *  attribute name so the existing handler binds without rename.
   *  Survey-derived rows render a hidden, non-interactive placeholder
   *  (no data-scw-ws-v2-kebab → the delete handler never matches it),
   *  mirroring v1's hide-delete behavior. */
  // CO's own SOW id = last 24-hex of the hash (view_4079 is a drill-in child
  // page whose record IS the CO's SOW; same rule co-adopt.js uses).
  function coSowIdFromHash() {
    var segs = (window.location.hash || '').replace(/^#/, '').split('?')[0].split('/');
    for (var i = segs.length - 1; i >= 0; i--) {
      if (/^[a-f0-9]{24}$/i.test(segs[i])) return segs[i];
    }
    return '';
  }

  /** Sub CO page authorship (field_2978 SYS_origin, stamped by Make from
   *  the add-item payload's `origin`): rows the SUB created are theirs to
   *  delete; everything else — SCW-created, or blank (pre-stamp records /
   *  column not on the grid yet) — fails safe to NOT deletable.
   *  Returns true (sub owns it) / false (SCW's) / null (no gate on view). */
  function subOwnsRecord(rec, viewKey) {
    var vc = (ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey)) || {};
    if (!vc.subOrigin || !vc.subOrigin.field) return null;
    var f = vc.subOrigin.field;
    var raw = rec[f + '_raw'];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) raw = raw.identifier || '';
    var val = String(raw != null && raw !== '' ? raw : (rec[f] || ''))
      .replace(/<[^>]*>/g, '').trim();
    return new RegExp(vc.subOrigin.own || 'sub', 'i').test(val);
  }

  function kebabCell(rec, viewKey) {
    // CO worksheet delete guard: an ADOPTED item (field_2154 lists a SOW
    // other than this CO) is a SHARED record — never delete it, only unlink
    // it from the CO. A net-new item (CO's SOW only) falls through to the
    // real trash below.
    var _vc = (ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey)) || {};
    // Install worksheets (config noDelete): NOTHING is deletable — install
    // scope only changes through the change-order process. Inert grayed
    // trash keeps the grid track aligned and tells the user why.
    if (_vc.noDelete) {
      return '<span class="scw-ws-v2-cell scw-ws-v2-trash scw-ws-v2-trash--blocked" ' +
        'aria-hidden="true" ' +
        'title="Install items can’t be deleted here — all changes go through the change-order process.">' +
        TRASH_SVG +
      '</span>';
    }
    if (_vc.coDeleteGuard && !isDeleteBlocked(rec, viewKey)) {
      var coId = coSowIdFromHash();
      var sowRaw = rec['field_2154_raw'];
      var shared = false;
      if (coId && Array.isArray(sowRaw)) {
        for (var si = 0; si < sowRaw.length; si++) {
          if (sowRaw[si] && sowRaw[si].id && sowRaw[si].id !== coId) { shared = true; break; }
        }
      }
      // Sub page: an SCW-created CO-only item is ALSO unlink-only — the sub
      // may take it off the CO but never delete SCW's record.
      var scwOwned = subOwnsRecord(rec, viewKey) === false;
      if (shared || scwOwned) {
        return '<button type="button" class="scw-ws-v2-cell scw-ws-v2-trash scw-ws-v2-unlink" ' +
          'data-scw-ws-v2-unlink="' + escapeHtml(rec.id) + '" ' +
          'data-scw-ws-v2-view="' + escapeHtml(viewKey || '') + '" ' +
          'data-scw-ws-v2-co="' + escapeHtml(coId) + '" ' +
          'aria-label="Remove from this change order" ' +
          'title="' + (shared
            ? 'Remove from this change order (adopted item — stays on its original scope)'
            : 'Remove from this change order (SCW added this item — it can’t be deleted here)') + '">' +
          UNLINK_SVG +
        '</button>';
      }
    }
    if (isDeleteBlocked(rec, viewKey)) {
      var msg = DELETE_BLOCK_WHEN_SET[viewKey]
        ? 'Adopted into a SOW — remove it from the SOW, not here.'
        : 'Linked to survey line items — remove it from the survey, not here.';
      return '<span class="scw-ws-v2-cell scw-ws-v2-trash scw-ws-v2-trash--blocked" ' +
        'aria-hidden="true" ' +
        'title="' + escapeHtml(msg) + '">' +
        TRASH_SVG +
      '</span>';
    }
    var trashTitle = subOwnsRecord(rec, viewKey) === true
      ? 'Delete line item (you added this item)'
      : 'Delete line item';
    return '<button type="button" class="scw-ws-v2-cell scw-ws-v2-trash" ' +
      'data-scw-ws-v2-kebab="' + escapeHtml(rec.id) + '" ' +
      'data-scw-ws-v2-view="' + escapeHtml(viewKey || '') + '" ' +
      'aria-label="Delete line item" title="' + trashTitle + '">' +
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

  /** The wide "fill" cell in the summary row. Build-SOW shows the editable
   *  Labor Description here; the sales view mirrors v1 by showing SCW Notes
   *  (field_1953) instead — Labor Desc moves down into the detail panel. */
  function rowFillCell(rec, viewKey, descLabel) {
    var sales = isSalesMoney(viewKey);
    var field = sales ? 'field_1953' : 'field_2020';
    var label = sales ? 'SCW Notes' : (descLabel || 'Labor description');
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
      textArea(rec, viewKey, field, readField(rec, field), label) +
    '</div>';
  }

  /** Multi-line editable detail field (e.g. Labor Desc in the sales detail). */
  function detailTextArea(rec, viewKey, fieldKey, label) {
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--notes">' +
      '<div class="scw-ws-v2-detail-label">' + escapeHtml(label) + '</div>' +
      '<textarea class="scw-ws-v2-input scw-ws-v2-input--textarea" rows="2" ' +
        'aria-label="' + escapeHtml(label) + '"' + attrsFor(rec, viewKey, fieldKey) + '>' +
        escapeHtml(readField(rec, fieldKey)) +
      '</textarea>' +
    '</div>';
  }

  /** Notes row beneath the detail zones. Sales (v1 parity): editable Labor
   *  Desc only — SCW Notes is in the summary row, Survey Notes isn't shown.
   *  Build-SOW: editable SCW Notes + read-only Survey Notes. */
  function detailNotesSection(rec, viewKey) {
    if (isSalesMoney(viewKey)) {
      return '<div class="scw-ws-v2-detail-notes">' +
        detailReadOnly(rec, 'field_2020', 'Labor Desc') +
      '</div>';
    }
    return '<div class="scw-ws-v2-detail-notes">' +
      detailField(rec, viewKey, 'field_1953', 'SCW Notes', 'text') +
      detailReadOnly(rec, 'field_2412', 'Survey Notes') +
    '</div>';
  }

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
    var sow         = readSowField(rec);

    // Cameras/readers don't carry a quantity — the qty slot is reused
    // for the Existing/Exterior/Plenum chip stack so the rest of the
    // row (labor desc and money columns) aligns with default rows.
    var chips =
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--chips">' +
        chip(rec, viewKey, 'field_2461', 'Existing', 'Existing cabling') +
        chip(rec, viewKey, 'field_1984', 'Exterior', 'Exterior') +
        (isSalesMoney(viewKey) ? '' :
          chip(rec, viewKey, 'field_1983', 'Plenum',   'Plenum')) +
      '</div>';

    return '<div class="scw-ws-v2-row scw-ws-v2-row--cam">' +
      chevronCell(rec) +
      ro(label,   'scw-ws-v2-cell--label',   label) +
      productCell(rec, viewKey, product) +
      rowFillCell(rec, viewKey, 'Labor description') +
      chips +
      moneyCells(rec, viewKey) +
      sowSlot(rec, viewKey) +
      warnCell(rec) +
      kebabCell(rec, viewKey) +
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
    var sow         = readSowField(rec);

    // Sales mirrors v1 by putting Qty in the detail panel, so the row's
    // qty slot stays blank there.
    var qtyInput = isSalesMoney(viewKey) ? null : qtyCell(rec, viewKey, qty);
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
      rowFillCell(rec, viewKey, 'Labor description') +
      qtySlot +
      moneyCells(rec, viewKey) +
      sowSlot(rec, viewKey) +
      warnCell(rec) +
      kebabCell(rec, viewKey) +
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
    var sow         = readSowField(rec);

    var qtyInput = isSalesMoney(viewKey) ? null : qtyCell(rec, viewKey, qty);
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
      rowFillCell(rec, viewKey, 'Service description') +
      qtySlot +
      moneyCells(rec, viewKey) +
      sowSlot(rec, viewKey) +
      warnCell(rec) +
      kebabCell(rec, viewKey) +
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
    var sow       = readSowField(rec);

    return '<div class="scw-ws-v2-row scw-ws-v2-row--assumptions">' +
      chevronCell(rec) +
      labelCellOrBlank(rec) +
      empty('scw-ws-v2-cell--product') +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc">' +
        textArea(rec, viewKey, 'field_2020', laborDesc, 'Assumption text') +
      '</div>' +
      empty('scw-ws-v2-cell--num') +
      moneyCellsBlank(viewKey) +
      sowSlot(rec, viewKey) +
      warnCell(rec) +
      kebabCell(rec, viewKey) +
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
    // data-scw-df carries the field key so per-field CSS (e.g. co-adopt's
    // readonly hides) can target [data-scw-df="field_X"] instead of :has().
    return '<div class="scw-ws-v2-detail-field" data-scw-df="' + escapeHtml(fieldKey) + '">' +
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

  /** Read-only multi-line notes display — same paragraph shape as
   *  detailTextArea but non-editable (no edit hook, wrapping display, and a
   *  "· Read-only" label tag). Used for SCW Notes on the bid worksheet, where
   *  it's owned upstream and must not be edited. */
  function detailNotesReadOnly(rec, fieldKey, label) {
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--notes scw-ws-v2-detail-field--ro">' +
      '<div class="scw-ws-v2-detail-label">' + escapeHtml(label) +
        ' <span class="scw-ws-v2-ro-tag">· Read-only</span></div>' +
      '<div class="scw-ws-v2-display scw-ws-v2-display--paragraph">' +
        escapeHtml(readField(rec, fieldKey)) +
      '</div>' +
    '</div>';
  }

  /**
   * Editable connection field — renders the current value as a button-
   * styled cell. Click handler in init.js reads the data-* attrs and
   * opens the picker modal.
   */
  function detailConnection(rec, viewKey, fieldKey, label, warn, readOnly) {
    // Special-case connections that point at ANOTHER LINE ITEM (Parent
    // field_2464, Connected Device field_2197): the line-item object\'s auto
    // identifier degenerates to "<recordId> (<mdfLabel>)" server-side for
    // records with no drop label, which reads like garbage. readConnRef does
    // a proper product/drop model lookup (and strips the wrapper as a last
    // resort). A connection that exists but resolves no printable label shows
    // '(unnamed device)' — never a raw record id.
    var val;
    if (fieldKey === 'field_2464' || fieldKey === 'field_2197') {
      var _refRaw = rec && rec[fieldKey + '_raw'];
      var _hasRef = Array.isArray(_refRaw) && _refRaw.length && _refRaw[0] && _refRaw[0].id;
      val = readConnRef(rec, fieldKey) || (_hasRef ? '(unnamed device)' : '(none)');
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
    // readOnly: derived/locked connection — plain readable text per the repo
    // locked-field convention (no button, no edit affordance, no picker
    // hook). Same value resolution + warn icon as the editable variant.
    if (readOnly) {
      return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--conn scw-ws-v2-detail-field--ro' +
          (warn ? ' scw-ws-v2-detail-field--warn' : '') + '">' +
        '<div class="scw-ws-v2-detail-label">' + labelHtml + '</div>' +
        '<div class="scw-ws-v2-display">' + escapeHtml(val) + '</div>' +
      '</div>';
    }
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--conn' +
        (warn ? ' scw-ws-v2-detail-field--warn' : '') + '" ' +
        'data-scw-df="' + escapeHtml(fieldKey) + '">' +
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
   * Connected Devices display, derived from the AUTHORITATIVE set rather than
   * just the parent's forward connection. field_1957 (parent → children) and
   * field_2197 (child → parent) are SEPARATE Knack fields kept aligned only by
   * the cascade, so the forward list reads STALE/empty even while children ARE
   * connected (their reciprocal still points here) — that's why the card showed
   * "(none)" while the picker (which hardens the same way, init.js) showed the
   * real selection. Union the forward list with every child whose reciprocal
   * (F.connectedDevice) points back at this record. Renders the same editable
   * button as detailConnection so the click handler opens the picker unchanged.
   */
  function detailConnectedDevices(rec, viewKey, fieldKey, label, warn) {
    var F = fieldsFor(viewKey);
    var recipKey = F.connectedDevice || 'field_2197';
    var seen = Object.create(null);
    var labels = [];

    // Forward list (whatever the denormalized parent field carries).
    var fwd = rec[fieldKey + '_raw'];
    if (Array.isArray(fwd)) {
      for (var i = 0; i < fwd.length; i++) {
        var f = fwd[i];
        if (f && f.id && !seen[f.id]) {
          seen[f.id] = true;
          labels.push(String(f.identifier || f.id));
        }
      }
    }

    // Authoritative: every child whose reciprocal points back at this record.
    // O(1) lookup via the per-render back-pointer index (was an all-records
    // scan per card → O(n²)).
    var kids = backIndex(viewKey, recipKey)[rec.id] || [];
    for (var r = 0; r < kids.length; r++) {
      var crec = kids[r];
      if (!crec || !crec.id || crec.id === rec.id || seen[crec.id]) continue;
      seen[crec.id] = true;
      labels.push(readField(crec, F.displayLabel || 'field_1950') || crec.id);
    }

    var val = labels.length ? labels.join(', ') : '(none)';
    // Live count in the label ("Connected Devices (5)") — the set is the
    // authoritative union above, so the number matches what the picker
    // will pre-check.
    var labelHtml = escapeHtml(label + ' (' + labels.length + ')');
    if (warn) {
      var warnIc = (ns.warnings && ns.warnings.ICONS && ns.warnings.ICONS.disconnected) || '';
      labelHtml = '<span class="scw-ws-v2-detail-warn-ic">' + warnIc + '</span>' + labelHtml;
    }
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--conn' +
        (warn ? ' scw-ws-v2-detail-field--warn' : '') + '" ' +
        'data-scw-df="' + escapeHtml(fieldKey) + '">' +
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
    // Unrecognized route (e.g. top-level #build-sow/<projectId>): if the
    // hash is record-scoped, accept it as the base rather than bailing.
    var live = hash.replace(/^#/, '').split('?')[0].replace(/\/+$/, '');
    if (/(^|\/)[a-f0-9]{24}$/.test(live)) return '#' + live;
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

    // SINGLE authoritative source for the accessory chips: each accessory's
    // OWN field_2464 ("my parent"). An accessory asserts exactly one parent;
    // the parent's forward connection (field_2207 / field_1958) is just a
    // denormalized aggregate of that, and the two drift. Reading ONLY the
    // child side means a stale forward list can neither HIDE an accessory
    // (a missing reciprocal — the "two UPS, one shown" bug) nor surface a
    // GHOST one (a leftover entry for an accessory that has since
    // re-parented). The accessory records are SOW line items already loaded
    // in this view, so it's an in-memory scan — no extra fetch, no DOM scrape.
    var chips   = [];
    var addHref = '';
    var HEX_24  = /^[a-f0-9]{24}(\s|\b|$)/i;

    // accAttrsById doubles as the per-chip attrs lookup the render below
    // uses for the qty stepper.
    // id → attrs lookup (qty stepper) + this parent's accessory children both
    // come from the per-render index — no per-card all-records rebuild/scan.
    var accAttrsById = recById(viewKey);
    var accKids = backIndex(viewKey, 'field_2464')[parentId] || [];

    for (var ai = 0; ai < accKids.length; ai++) {
      var arec = accKids[ai];
      if (!arec || !arec.id) continue;
      // Label = the accessory's connection identifier (its field_1950 display
      // label, e.g. "… (MDF)"), matching how Knack lists it under a parent;
      // fall back to labelLineItem's "drop · product" composite only when
      // that identifier is missing/unresolved (freshly-created records).
      var aA   = arec.attributes || arec;
      var albl = (aA.field_1950 || '').toString().replace(/<[^>]*>/g, '').trim();
      if (!albl && Array.isArray(aA.field_1950_raw) && aA.field_1950_raw[0]) {
        albl = (aA.field_1950_raw[0].identifier || aA.field_1950_raw[0].name || '')
          .toString().replace(/<[^>]*>/g, '').trim();
      }
      if (!albl || HEX_24.test(albl)) albl = labelLineItem(arec);
      chips.push({ id: arec.id, label: (albl && !HEX_24.test(albl)) ? albl : arec.id, href: '' });
    }

    // addHref fallback: the `add-accessory-line-item` slug differs between
    // Knack scenes, so resolve the live route lazily AT CLICK TIME (see
    // init.js 'data-scw-ws-v2-add-accessory'). A placeholder here means we
    // never put a home-bouncing URL into the "+ Add" pill.
    addHref = addHref || '__resolve-on-click__';

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
        // Unlink — clears the accessory's field_2464 so it detaches from
        // this parent but keeps the line item (it becomes a standalone row).
        var unlinkX = (chip.id && parentId)
          ? '<button type="button" class="scw-ws-v2-mh-unlink" ' +
              'data-scw-ws-v2-mh-unlink="' + escapeHtml(chip.id) + '" ' +
              'data-scw-ws-v2-mh-uparent="' + escapeHtml(parentId) + '" ' +
              'title="Unlink ' + escapeHtml(chip.label) +
              ' from this parent (keeps the line item)">' +
              UNLINK_SVG + '</button>'
          : '';
        var delX = (chip.id && parentId)
          ? '<button type="button" class="scw-ws-v2-mh-del" ' +
              'data-scw-ws-v2-mh-del="' + escapeHtml(chip.id) + '" ' +
              'data-scw-ws-v2-mh-parent="' + escapeHtml(parentId) + '" ' +
              'title="Delete ' + escapeHtml(chip.label) + '">' +
              TRASH_SVG + '</button>'
          : '';
        // No href → render as non-link span so we never silently bounce
        // the user back to the home page on click.
        // Mid-delete state survives the source-view re-renders that fire
        // on every poll fetch (init.js polls until the record is gone) by
        // reading a shared pending-delete registry. When set, dim the chip
        // and swap the × + qty stepper for a spinner so the user sees
        // "deleting…" the whole time the delete is settling.
        var pendingDel = !!(ns.pendingDeletes && ns.pendingDeletes[chip.id]);
        var tail = pendingDel
          ? '<span class="scw-ws-v2-mh-spin" title="Deleting…"></span>'
          : (stepperHtml + unlinkX + delX);
        var wrapCls = 'scw-ws-v2-mh-chip-wrap' +
          (accWrong ? ' scw-ws-v2-mh-chip-wrap--warn' : '') +
          (pendingDel ? ' scw-ws-v2-mh-chip-wrap--deleting' : '');
        var wrapTitle = pendingDel ? ' title="Deleting…"' : '';
        if (editHref) {
          chipsHtml += '<span class="' + wrapCls + '"' + wrapTitle + '>' +
            '<a class="scw-ws-v2-mh-chip" href="' + escapeHtml(editHref) + '"' +
              ' title="Edit ' + escapeHtml(chip.label) + '">' +
              escapeHtml(chip.label) +
            '</a>' + warnMark + tail +
          '</span>';
        } else {
          chipsHtml += '<span class="' + wrapCls + '"' + wrapTitle + '>' +
            '<span class="scw-ws-v2-mh-chip scw-ws-v2-mh-chip--inert"' +
              ' title="' + escapeHtml(chip.label) + '">' +
              escapeHtml(chip.label) +
            '</span>' + warnMark + tail +
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
      '<div class="scw-ws-v2-detail-label">Mounting Hardware</div>' +
      '<div class="scw-ws-v2-mh-list">' + chipsHtml + '</div>' +
      (addHtml ? '<div class="scw-ws-v2-mh-addrow">' + addHtml + '</div>' : '') +
    '</div>';
  }

  function buildDetail_cam(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-zones">' +
        salesPricingDetail(rec, viewKey) +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--identity">' +
          detailConnection(rec,        viewKey, 'field_2240', 'Prefix') +
          detailField(rec,    viewKey, 'field_1951', 'Drop #',  'number') +
          detailField(rec,    viewKey, 'field_1965', 'Length',  'number') +
          detailField(rec,    viewKey, 'field_2035', 'Conduit', 'number') +
        '</div>' +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          detailMountingHardware(rec, viewKey) +
          // Connected To is DERIVED + READ-ONLY (Known Issue #12 step 1,
          // locked 2026-08-03): every edit flows through the parent's
          // Connected Devices picker; the cascade writes field_2197.
          detailConnection(rec,       viewKey, 'field_2197', 'Connected Device',
                           hasIssue(rec, 'disconnected'), true) +
          detailConnection(rec,       viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      detailNotesSection(rec, viewKey) +
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
      '<div class="scw-ws-v2-detail-zones scw-ws-v2-detail-zones--no-identity">' +
        salesPricingDetail(rec, viewKey) +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          (showParent ? detailConnection(rec, viewKey, 'field_2464', 'Parent') : '') +
          detailMountingHardware(rec, viewKey) +
          (showConnDevices ? detailConnectedDevices(rec, viewKey, 'field_1957', 'Connected Devices') : '') +
          detailConnection(rec,       viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      detailNotesSection(rec, viewKey) +
    '</div>';
  }

  function buildDetail_services(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-zones scw-ws-v2-detail-zones--no-identity">' +
        salesPricingDetail(rec, viewKey) +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          detailConnection(rec, viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      detailNotesSection(rec, viewKey) +
    '</div>';
  }

  function buildDetail_assumptions(rec, viewKey) {
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-detail-zones scw-ws-v2-detail-zones--no-identity">' +
        '<div class="scw-ws-v2-detail-zone scw-ws-v2-detail-zone--connections">' +
          detailConnection(rec, viewKey, 'field_1946', 'MDF / IDF') +
        '</div>' +
      '</div>' +
      '<div class="scw-ws-v2-detail-notes">' +
        detailField(rec,    viewKey, 'field_1953', 'SCW Notes', 'text') +
      '</div>' +
    '</div>';
  }

  /**
   * Sales detail — mirrors the v1 worksheet card: a LEFT column with the
   * pricing/identity fields stacked vertically (Retail Price, Qty / Drop
   * fields, Custom Disc %, Applied Discount, Total) and a RIGHT column with
   * Mounting Hardware, the relevant connection, MDF/IDF and Labor Desc.
   * Read-only fields render as plain text; only real inputs get the box.
   */
  function buildDetail_sales(rec, viewKey, cat) {
    var isCam = (cat === 'cam');

    var left = '';
    if (isCam) {
      left += detailConnection(rec,    viewKey, 'field_2240', 'Drop Prefix');
      left += detailField(rec,    viewKey, 'field_1951', 'Label #', 'number');
      // Visual break between the drop/identity fields and the money fields.
      left += '<div class="scw-ws-v2-sales-detail-divider"></div>';
    }
    left += detailReadOnly(rec,            'field_1960', 'Retail Price');
    if (!isCam) {
      left += isQtyLocked(rec)
        ? detailReadOnly(rec,              'field_1964', 'Qty')
        : detailField(rec,        viewKey, 'field_1964', 'Qty', 'number');
    }
    left += detailField(rec,      viewKey, 'field_2261', 'Custom Disc %', 'number');
    left += detailReadOnly(rec,            'field_2303', 'Applied Discount');
    left += detailReadOnly(rec,            'field_2269', 'Total');

    var right = detailMountingHardware(rec, viewKey);
    if (isCam) {
      // Connected To is DERIVED + READ-ONLY (Known Issue #12 step 1) —
      // edit via the parent's Connected Devices picker instead.
      right += detailConnection(rec, viewKey, 'field_2197', 'Connected Device',
                                hasIssue(rec, 'disconnected'), true);
    } else if (cat === 'default') {
      if (isMapConnectionsRow(rec)) {
        right += detailConnectedDevices(rec, viewKey, 'field_1957', 'Connected Devices');
      } else if (readParentRef(rec) || bucketIdOf(rec) !== NETWORKING_BUCKET) {
        right += detailConnection(rec, viewKey, 'field_2464', 'Parent');
      }
    }
    right += detailConnection(rec, viewKey, 'field_1946', 'MDF / IDF');
    right += detailReadOnly(rec, 'field_2020', 'Labor Desc');

    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-sales-detail">' +
        '<div class="scw-ws-v2-sales-detail-col scw-ws-v2-sales-detail-col--left">' +
          left +
        '</div>' +
        '<div class="scw-ws-v2-sales-detail-col scw-ws-v2-sales-detail-col--right">' +
          right +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Survey card path (moneyMode:'survey', view_3505) ───────────
  // Mirrors the v1 device-worksheet (view_3505) summary order:
  //   cam:     [Survey Notes][Labor Desc][Existing/Exterior/Plenum][Labor][Ext][Bid]
  //   default: [Survey Notes][Labor Desc][Qty][Labor][Ext][Bid]
  // Survey Notes sits LEFT of Labor Description in the header. Money is
  // Labor (editable) · Ext (read-only) · Bid (read-only, connection). NO
  // accessory/parent UI — Survey Line Items have no accessory relationship
  // yet (CLAUDE.md #16). Product + connections render read-only this pass
  // (SOW-specific picker — fast-follow). Cabling chips, Mounting-Height
  // single-chips, and the inline inputs all save through the generic
  // chip / radiochip / edit handlers (init.js / edit.js are view-generic).

  function surveyProductCell(rec, viewKey, F) {
    // Editable product picker — writes the survey product connection
    // (field_2627). Display prefers the STORED name (field_2379), falling back
    // to the connection's identifier (so it updates after a change even before
    // the stored name recomputes). Same picker as the SOW product cell.
    var prodField = F.product || 'field_2627';
    var name = readField(rec, F.productName || 'field_2379') ||
               readField(rec, prodField) || '(unnamed)';
    return '<button type="button" ' +
      'class="scw-ws-v2-cell scw-ws-v2-cell--product scw-ws-v2-cell--editable-conn" ' +
      'data-scw-ws-v2-conn="' + escapeHtml(prodField) + '" ' +
      'data-scw-ws-v2-record="' + escapeHtml(rec.id) + '" ' +
      'data-scw-ws-v2-view="' + escapeHtml(viewKey) + '" ' +
      'data-scw-ws-v2-conn-label="Product" ' +
      'title="' + escapeHtml(name) + ' — click to change product">' +
      '<span class="scw-ws-v2-product-name">' + escapeHtml(name) + '</span>' +
    '</button>';
  }

  function surveyChips(rec, viewKey, F) {
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--chips">' +
      chip(rec, viewKey, F.existCabling || 'field_2370', 'Existing', 'Existing cabling') +
      chip(rec, viewKey, F.exterior     || 'field_2372', 'Exterior', 'Exterior') +
      chip(rec, viewKey, F.plenum       || 'field_2371', 'Plenum',   'Plenum') +
    '</div>';
  }

  /** Bid cell — a line item can belong to multiple bids (field_2415). Render
   *  each bid label on its OWN line (v1 stacks them, not comma-joined). Now an
   *  editable picker button (data-scw-ws-v2-conn) — click opens the bid picker. */
  function surveyBidCell(rec, viewKey, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    var parts = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) {
        var r = raw[i];
        if (!r) continue;
        var v = (r.identifier != null && r.identifier !== '') ? r.identifier : r.id;
        if (v != null && v !== '') parts.push(String(v));
      }
    } else {
      var s = readField(rec, fieldKey);
      if (s) parts = s.split(/\s*,\s*/);
    }
    var title = parts.length ? ('Bid ' + parts.join(', ') + ' — click to change') : 'Set bid';
    // Reuse the SOW cell look (boxed/editable, one value per line) so it
    // reads as clearly editable — same as the SOW cell on the ops/sales
    // worksheets.
    var inner = parts.length
      ? parts.map(function (p) {
          return '<span class="scw-ws-v2-sow-value">' + escapeHtml(p) + '</span>';
        }).join('')
      : '<span class="scw-ws-v2-sow-value">&mdash;</span>';
    // v1 parity: empty bid → warning (yellow).
    var bidWarn = parts.length ? '' : ' scw-ws-v2-cell--warning';
    return '<button type="button" ' +
      'class="scw-ws-v2-cell scw-ws-v2-cell--sow scw-ws-v2-cell--editable-conn scw-ws-v2-cell--survey-bid' + bidWarn + '" ' +
      'data-scw-ws-v2-conn="' + escapeHtml(fieldKey) + '" ' +
      'data-scw-ws-v2-record="' + escapeHtml(rec.id) + '" ' +
      'data-scw-ws-v2-view="' + escapeHtml(viewKey) + '" ' +
      'data-scw-ws-v2-conn-label="Bid" ' +
      'title="' + escapeHtml(title) + '">' + inner +
    '</button>';
  }

  /** A survey detail-panel item wrapper carrying a width-hint class so the
   *  flex layout sizes each field to its expected value width. */
  function sdItem(html, widthCls) {
    return '<div class="scw-ws-v2-sd-item ' + (widthCls || '') + '">' + html + '</div>';
  }
  /** A cluster of related detail fields — clusters are separated by extra
   *  whitespace so the panel reads as logical groups, and fields WITHIN a
   *  cluster stay together (and wrap together) instead of every field wrapping
   *  independently. Empty clusters render nothing. */
  function sdGroup(itemsHtml, extraCls) {
    if (!itemsHtml) return '';
    return '<div class="scw-ws-v2-sd-group ' + (extraCls || '') + '">' + itemsHtml + '</div>';
  }

  /** A fill (textarea) summary cell — survey notes / labor description. */
  function surveyFill(rec, viewKey, fieldKey, label, cls) {
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc ' + (cls || '') + '">' +
      textArea(rec, viewKey, fieldKey, readField(rec, fieldKey), label) +
    '</div>';
  }

  /** Single-select chip group (Mounting Height) — editable; saves via the
   *  radiochip handler in init.js. Mirrors v1's singleChip radio chips. */
  function singleChipField(rec, viewKey, fieldKey, label, options) {
    var cur = readField(rec, fieldKey);
    var chips = '';
    for (var i = 0; i < options.length; i++) {
      var opt = options[i];
      var sel = (cur === opt);
      chips += '<button type="button" class="scw-ws-v2-radiochip ' +
        (sel ? 'is-selected' : 'is-unselected') + '" ' +
        'data-scw-ws-v2-radiochip="' + escapeHtml(fieldKey) + '" ' +
        'data-scw-ws-v2-record="' + escapeHtml(rec.id) + '" ' +
        'data-scw-ws-v2-view="' + escapeHtml(viewKey) + '" ' +
        'data-scw-ws-v2-option="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</button>';
    }
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--chips">' +
      '<div class="scw-ws-v2-detail-label">' + escapeHtml(label) + '</div>' +
      '<div class="scw-ws-v2-radiochips" data-scw-ws-v2-radio-field="' + escapeHtml(fieldKey) + '">' +
        chips +
      '</div>' +
    '</div>';
  }

  function buildRow_survey(rec, viewKey, cat) {
    var F     = fieldsFor(viewKey);
    var isCam = (cat === 'cam');
    var label = readField(rec, F.displayLabel || 'field_2365');
    // FLAG_require sub bid (field_2478) = No → this line item needs no sub bid,
    // so NONE of the sub-bid inputs are required: Labor is locked read-only and
    // the empty=danger flag is dropped from BOTH Labor and the work Description.
    var subBidNo = readBool(rec, F.requireSubBid || 'field_2478') === 'No';

    var labelSlot = isCam
      ? ro(label, 'scw-ws-v2-cell--label', label)
      : empty('scw-ws-v2-cell--label');

    var productSlot;
    if (cat === 'services')          productSlot = ro('Service', 'scw-ws-v2-cell--tag');
    else if (cat === 'assumptions')  productSlot = empty('scw-ws-v2-cell--product');
    else                             productSlot = surveyProductCell(rec, viewKey, F);

    // Two fill cells: Survey Notes (LEFT) then Labor Description. SCW Notes
    // lives in the detail panel (first/leftmost field).
    var surveyNotesCell = surveyFill(rec, viewKey, F.surveyNotes || 'field_2412',
      'Survey notes', 'scw-ws-v2-cell--survey-notes');
    // Description of Work (field_2409): when no sub bid is required here, the
    // field is HIDDEN entirely (an empty grid cell keeps the columns aligned).
    // Otherwise v1 parity — empty Description → danger (red).
    var laborDescCell;
    if (subBidNo) {
      laborDescCell = empty('scw-ws-v2-cell--labor-desc');
    } else {
      var laborDescWarn = surveyWarnClass(rec, F.laborDesc || 'field_2409', 'danger', null);
      laborDescCell = surveyFill(rec, viewKey, F.laborDesc || 'field_2409',
        isCam ? 'Labor description' : 'Description of Work', laborDescWarn);
    }

    // Slot 5 (qty/chips): cam → cabling chips; assumptions → blank;
    // qty-locked (FLAG_limit to quantity one = Yes) → blank (qty implicit 1,
    // v1 parity); else → editable Qty.
    var slot5;
    if (isCam) {
      slot5 = surveyChips(rec, viewKey, F);
    } else if (cat === 'assumptions') {
      slot5 = empty('scw-ws-v2-cell--num');
    } else if (readBool(rec, F.qtyOne || 'field_2373') === 'Yes') {
      slot5 = empty('scw-ws-v2-cell--num');
    } else {
      // v1 parity: qty zero → warning (yellow).
      var qtyWarn = surveyWarnClass(rec, F.qty || 'field_2399', null, 'warning');
      slot5 = '<div class="scw-ws-v2-cell scw-ws-v2-cell--num ' + qtyWarn + '">' +
        numInput(rec, viewKey, F.qty || 'field_2399', readNum(rec, F.qty || 'field_2399'), 'Qty') +
      '</div>';
    }

    // Money: Labor (editable; blank for assumptions) · Ext (read-only;
    // blank for cam + assumptions, matching v1) · Bid (read-only conn).
    // v1 parity: Labor ("sub bid") empty → danger (red), zero → warning.
    // BUT when FLAG_require sub bid (field_2478) is No, this line item needs no
    // sub bid at all — so Labor is NOT required: render it read-only (white,
    // non-interactive) and drop the empty=danger flag entirely. (subBidNo
    // computed at the top of this builder.)
    var laborCell;
    if (cat === 'assumptions') {
      laborCell = empty('scw-ws-v2-cell--num scw-ws-v2-cell--survey-labor');
    } else if (subBidNo) {
      var laborVal = readNum(rec, F.labor || 'field_2400');
      laborCell = '<div class="scw-ws-v2-cell scw-ws-v2-cell--num scw-ws-v2-cell--survey-labor scw-ws-v2-cell--currency scw-ws-v2-cell--labor-na" ' +
          'title="Require Sub Bid is No — no sub bid needed for this item">' +
          '<span class="scw-ws-v2-currency-glyph">$</span>' +
          '<input type="number" step="any" class="scw-ws-v2-input scw-ws-v2-input--num" ' +
            'readonly tabindex="-1" aria-label="Labor (no sub bid required)" ' +
            'value="' + escapeHtml(laborVal) + '">' +
        '</div>';
    } else {
      var laborWarn = surveyWarnClass(rec, F.labor || 'field_2400', 'danger', 'warning');
      laborCell = '<div class="scw-ws-v2-cell scw-ws-v2-cell--num scw-ws-v2-cell--survey-labor scw-ws-v2-cell--currency ' + laborWarn + '">' +
          '<span class="scw-ws-v2-currency-glyph">$</span>' +
          numInput(rec, viewKey, F.labor || 'field_2400', readNum(rec, F.labor || 'field_2400'), 'Labor') +
        '</div>';
    }
    var extCell = (isCam || cat === 'assumptions')
      ? empty('scw-ws-v2-cell--survey-ext')
      : ro(readField(rec, F.extended || 'field_2401'), 'scw-ws-v2-cell--survey-ext', 'Extended');
    var bidCell = surveyBidCell(rec, viewKey, F.bid || 'field_2415');

    return '<div class="scw-ws-v2-row scw-ws-v2-row--' + cat + '">' +
      chevronCell(rec) +
      labelSlot +
      productSlot +
      surveyNotesCell +
      laborDescCell +
      slot5 +
      laborCell +
      extCell +
      bidCell +
      warnCell(rec) +
      kebabCell(rec, viewKey) +
    '</div>';
  }

  function buildDetail_survey(rec, viewKey, cat) {
    var F = fieldsFor(viewKey);

    // Survey detail = a row of VERTICAL COLUMNS, each a logical group whose
    // fields stack (label-over-value). Columns (cam): Label (Prefix / Cam·Reader
    // #) · Notes (SCW Notes over Mounting Hardware) · Connection (MDF·IDF over
    // Connected To) · Mounting & cabling (Height / Drop Length / Conduit). The
    // Connection column comes BEFORE Mounting & cabling because MDF/IDF is on
    // EVERY card, and MDF/IDF sits ON TOP of Connected To / Connected Devices.
    // Fixed per-column widths (styles.js .scw-ws-v2-sd-group--*) keep fields
    // aligned column-to-column instead of every field wrapping independently.
    // SCW Notes (field_2418) + Mounting Hardware (field_2463) are READ-ONLY —
    // owned upstream, not editable while bidding. Connections render via the
    // editable detailConnection button (picker wired in init.js).
    var groups = '';

    // SCW Notes (field_2418) over Mounting Hardware (field_2463) — both
    // read-only, owned upstream. They share column 2 (after the Label column).
    var notesCol = sdGroup(
      sdItem(detailNotesReadOnly(rec, F.scwNotes || 'field_2418', 'SCW Notes'), 'scw-ws-v2-sd--paragraph') +
      sdItem(detailReadOnly(rec, F.mounting || 'field_2463', 'Mounting Hardware'), 'scw-ws-v2-sd--paragraph'),
      'scw-ws-v2-sd-group--notes');

    // MDF/IDF (field_2375) — present on EVERY card; rendered FIRST in the
    // Connection column so it sits on top of Connected To / Connected Devices.
    var mdfItem = sdItem(detailConnection(rec, viewKey, F.mdfIdf || 'field_2375', 'MDF / IDF'), 'scw-ws-v2-sd--conn');

    if (cat === 'cam') {
      // Col 1 — Label parts: Prefix (field_2361) over Cam/Reader # (field_2362),
      // matched width (they CONSTRUCT the read-only label in the row header).
      // Prefix reuses SCW.dropPrefixOptions; changing either recomputes the
      // drop label (field_2365) server-side (the picker's onSaved refetches).
      groups += sdGroup(
        sdItem(detailConnection(rec, viewKey, F.dropPrefix || 'field_2361', 'Prefix'), 'scw-ws-v2-sd--conn') +
        sdItem(detailField(rec, viewKey, F.dropNumber || 'field_2362', 'Cam/Reader #', 'number'), 'scw-ws-v2-sd--num'),
        'scw-ws-v2-sd-group--label');

      // Col 2 — SCW Notes over Mounting Hardware.
      groups += notesCol;

      // Col 3 — Connection & location: MDF/IDF (top) over Connected To.
      // Connected To (field_2381, single) — READ-ONLY display. The canonical
      // editable side is the NVR/switch's Connected Devices (field_2380);
      // the mirror cascade derives field_2381 from it, so editing the child
      // side here would just re-create the two-writer drift (same direction
      // as CLAUDE.md #12 for the SOW pair).
      groups += sdGroup(
        mdfItem +
        sdItem(detailConnection(rec, viewKey, F.connectedDevice || 'field_2381',
          'Connected To', hasIssue(rec, 'disconnected'), true), 'scw-ws-v2-sd--conn'),
        'scw-ws-v2-sd-group--conn');

      // Col 4 — Mounting & cabling: Mounting Height + Drop Length + Conduit.
      groups += sdGroup(
        sdItem(singleChipField(rec, viewKey, F.mountingHeight || 'field_2455',
          'Mounting Height', ["Under 16'", "16' - 24'", "Over 24'"]), 'scw-ws-v2-sd--chips') +
        sdItem(detailField(rec, viewKey, F.dropLength || 'field_2367', 'Drop Length', 'number'), 'scw-ws-v2-sd--num') +
        sdItem(detailField(rec, viewKey, F.conduit || 'field_2368', 'Conduit', 'number'), 'scw-ws-v2-sd--num'),
        'scw-ws-v2-sd-group--mount');
    } else {
      // default / hardware: Notes column (SCW Notes + Mounting Hardware), then a
      // connection column — MDF/IDF (top) over Connected Devices (only when
      // mapConn Yes).
      groups += notesCol;

      var devItem = (cat === 'default' && readBool(rec, F.mapConn || 'field_2374') === 'Yes')
        ? sdItem(detailConnectedDevices(rec, viewKey, F.connectedDevices || 'field_2380', 'Connected Devices'), 'scw-ws-v2-sd--conn')
        : '';
      groups += sdGroup(
        mdfItem +
        devItem,
        'scw-ws-v2-sd-group--conn');
    }

    // Non-cam rows have NO Label column (Prefix/Cam#), and the summary header
    // collapses the blank label cell so the PRODUCT spans into it (grid-col 2).
    // Tag the groups so CSS shifts the Notes column left to start under the
    // product box too (otherwise Notes sits one column right of the product).
    var groupsCls = 'scw-ws-v2-sd-groups' + (cat === 'cam' ? '' : ' scw-ws-v2-sd-groups--no-label');
    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-survey-detail">' +
        '<div class="' + groupsCls + '">' + groups + '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Install card path (moneyMode:'install', view_4093) ─────────
  // Mirrors the v1 device-worksheet (view_4093) config. The install object
  // (Deploy / Install Line Items) has NO money columns — no Sub Bid/+Hrs/
  // +Mat/Fee/Labor/Ext/Bid — so the money region is fully suppressed. The
  // summary row is just:
  //   chevron · label (cam only) · product (read-only) · labor-desc fill ·
  //   warn · kebab
  // The install-status segmented chip (field_2825) and the per-photo QA
  // chits are NOT rendered here — install-config-subpanel.js /
  // config-qa-popover.js inject those into the card post-render. We only
  // produce a normal .scw-ws-v2-detail panel they can hook into.
  //
  // Detail panel per bucket category (mirrors v1 view_4093 detailLayout):
  //   cam:         Connected To (field_2821) + Existing/Exterior/Plenum
  //                chips (field_2807/2805/2806) + Drop Length (field_2804) +
  //                Conduit (field_2803) + Labor Desc (field_2809) +
  //                SCW Notes (field_2808).
  //   default/hw:  Connected Devices (field_2820, only when mapConn
  //                field_2795 is Yes) + SCW Notes.
  //   services:    SCW Notes (install object has no Other Services bucket
  //                in v1, but keep the branch for parity / safety).
  //   assumptions: Labor/Assumption text + SCW Notes.
  // All fields read via fieldsFor(viewKey) + logical names, with the install
  // field key as the fallback (same idiom as the survey path).

  function installProductCell(rec, F) {
    // Read-only — config sets productEditable:false. Prefer the STORED
    // product name (field_2790); fall back to the connection (field_2846).
    var name = readField(rec, F.productName || 'field_2790') ||
               readField(rec, F.product || 'field_2846') || '(unnamed)';
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--product scw-ws-v2-cell--ro" ' +
      'title="' + escapeHtml(name) + '">' +
      '<span class="scw-ws-v2-product-name">' + escapeHtml(name) + '</span>' +
    '</div>';
  }

  // Read-only flag chit — rendered ONLY when the boolean is Yes (hidden when
  // No; v1 view_4093 shows Existing/Exterior/Plenum as show-when-true READ-ONLY
  // chits, never editable). Not interactive (no data-scw-ws-v2-chip hook).
  function installFlagChit(rec, fieldKey, label) {
    if (readBool(rec, fieldKey) !== 'Yes') return '';
    return '<span class="scw-ws-v2-chip scw-ws-v2-chip--yes scw-ws-v2-chip--ro" ' +
      'title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</span>';
  }

  // "Removed by CO" — the install record's removedByCo connection
  // (field_2967) is populated by Make at CO signature (docs/change-orders.md:
  // removes flip this connection, never delete). Populated = this item is no
  // longer in install scope. Returns the CO identifier string, or null when
  // the item is still active.
  function installRemovedBy(rec, viewKey) {
    var key = 'field_2967';
    try {
      var F = ns.cfg.fields(viewKey);
      if (F && F.removedByCo) key = F.removedByCo;
    } catch (e) {}
    var raw = rec[key + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) {
      return String(raw[0].identifier || '') || 'change order';
    }
    return null;
  }

  // Short "CO ####" label from the removedByCo connection identifier —
  // handles the shapes the CO numbering produces: "1410", "CO-1410",
  // "SW1418CO", "60524852230-SW1418CO". Falls back to the (truncated)
  // identifier text when no number is recognizable.
  function shortCoLabel(ident) {
    var s = String(ident || '').replace(/<[^>]*>/g, '').trim();
    if (!s) return 'CO';
    var m = s.match(/CO[-\s]?(\d+)/i) ||     // "CO-1410" / "CO 1410"
            s.match(/(\d{2,})\s*CO\b/i) ||   // "SW1418CO"
            s.match(/^(\d+)$/) ||            // bare "1410"
            s.match(/SW\s?(\d+)/i);          // "SW1418" (no CO suffix)
    if (m) return 'CO ' + m[1];
    return 'CO ' + (s.length > 14 ? s.slice(0, 14) + '…' : s);
  }

  // Red "Removed by CO ####" chip for the Flags cell — names the specific
  // change order. Red is correct here per the repo color convention — this
  // is a destructive/removed STATE, not a warning (warnings stay amber).
  function installRemovedChip(rec, viewKey) {
    var by = installRemovedBy(rec, viewKey);
    if (by === null) return '';
    return '<span class="scw-ws-v2-chip scw-ws-v2-chip--ro scw-ws-v2-chip--removed" ' +
      'title="' + escapeHtml('Removed from install scope by signed change order (' + by + ')') +
      '">Removed by ' + escapeHtml(shortCoLabel(by)) + '</span>';
  }

  // Flag-chits cell — always emitted (holds its grid track); empty when no
  // flag is true. Cam rows carry cabling/exterior/plenum. The Removed-by-CO
  // chip (when present) leads the cell on every category.
  function installFlags(rec, viewKey, F, extraChips) {
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--install-flags">' +
      (extraChips || '') +
      installFlagChit(rec, F.existCabling || 'field_2807', 'Existing') +
      installFlagChit(rec, F.exterior     || 'field_2805', 'Exterior') +
      installFlagChit(rec, F.plenum       || 'field_2806', 'Plenum') +
    '</div>';
  }

  // Read-only labor/assumption description for the header — services &
  // assumptions rows surface their text inline (read-only). HTML is stripped
  // by readField.
  function installDescRO(rec, viewKey, F) {
    var txt = readField(rec, F.laborDesc || 'field_2809');
    return '<div class="scw-ws-v2-cell scw-ws-v2-cell--labor-desc scw-ws-v2-cell--install-descro" ' +
      'title="' + escapeHtml(txt) + '">' + escapeHtml(txt) + '</div>';
  }

  function buildRow_install(rec, viewKey, cat) {
    var F     = fieldsFor(viewKey);
    var isCam = (cat === 'cam');
    // displayLabel (field_2802 LABEL_DISPLAY) is often blank on install rows —
    // fall back to labelAlt (field_2801 "set label by bucket", e.g. AC-01).
    var label = readField(rec, F.displayLabel || 'field_2802') ||
                readField(rec, F.labelAlt || 'field_2801');

    var labelSlot = isCam
      ? ro(label, 'scw-ws-v2-cell--label', label)
      : empty('scw-ws-v2-cell--label');

    // services & assumptions show their labor/assumption text (read-only) in
    // the header; cam/default show the product (read-only).
    var productSlot;
    if (cat === 'services' || cat === 'assumptions')
      productSlot = installDescRO(rec, viewKey, F);
    else
      productSlot = installProductCell(rec, F);

    // Read-only flag chits (Existing/Exterior/Plenum) — cam rows only, shown
    // only when true. Non-cam keeps an empty track for grid alignment, EXCEPT
    // when the item is removed by a CO — that chip shows on every category.
    var removedChip = installRemovedChip(rec, viewKey);
    var flagsSlot;
    if (isCam) {
      flagsSlot = installFlags(rec, viewKey, F, removedChip);
    } else if (removedChip) {
      flagsSlot = '<div class="scw-ws-v2-cell scw-ws-v2-cell--install-flags">' +
        removedChip + '</div>';
    } else {
      flagsSlot = empty('scw-ws-v2-cell--install-flags');
    }

    // SCW Notes — the ONE editable field in the install header (v1 field_2808
    // directEdit). Everything else on the card is read-only.
    var scwNotesCell = surveyFill(rec, viewKey, F.scwNotes || 'field_2808',
      'SCW Notes', 'scw-ws-v2-cell--install-scwnotes');

    return '<div class="scw-ws-v2-row scw-ws-v2-row--' + cat + ' scw-ws-v2-row--install">' +
      chevronCell(rec) +
      labelSlot +
      productSlot +
      flagsSlot +
      scwNotesCell +
      warnCell(rec) +
      kebabCell(rec, viewKey) +
    '</div>';
  }

  /** Read-only Mounting Hardware chips for the install worksheet. Same
   *  authoritative child-side read as detailMountingHardware — each
   *  accessory's OWN back-pointer names its parent — but resolved through
   *  the per-view field map (install: field_2853) and stripped of every
   *  drafting affordance (no stepper, no unlink/delete, no + Add): install
   *  accessories are signed scope, not drafting. Returns '' when the view
   *  maps no parent field or nothing points at this record, so the SOW
   *  paths and accessory-less installs are untouched. */
  function detailMountingHardwareRO(rec, viewKey) {
    var F = fieldsFor(viewKey);
    var parentKey = F.parent;
    if (!parentKey || !rec || !rec.id) return '';
    var kids;
    try { kids = backIndex(viewKey, parentKey)[rec.id] || []; }
    catch (e) { return ''; }
    if (!kids.length) return '';
    var HEX_24 = /^[a-f0-9]{24}(\s|\b|$)/i;
    var chipsHtml = '';
    for (var i = 0; i < kids.length; i++) {
      var aA = kids[i] && (kids[i].attributes || kids[i]);
      if (!aA || !aA.id) continue;
      var lbl = '';
      var cand = [F.productName, F.displayLabel];
      for (var c = 0; c < cand.length && !lbl; c++) {
        if (!cand[c]) continue;
        lbl = (aA[cand[c]] || '').toString().replace(/<[^>]*>/g, '').trim();
        if (HEX_24.test(lbl)) lbl = '';
      }
      if (!lbl) lbl = '(accessory)';
      var q = parseFloat(readNum(aA, F.qty || 'field_1964'));
      var qtySuffix = (isFinite(q) && q > 1) ? ' ×' + q : '';
      chipsHtml += '<span class="scw-ws-v2-mh-chip-wrap">' +
        '<span class="scw-ws-v2-mh-chip scw-ws-v2-mh-chip--inert" ' +
          'title="' + escapeHtml(lbl) + '">' +
          escapeHtml(lbl + qtySuffix) +
        '</span></span>';
    }
    if (!chipsHtml) return '';
    return '<div class="scw-ws-v2-detail-field scw-ws-v2-detail-field--ro">' +
      '<div class="scw-ws-v2-detail-label">Mounting Hardware</div>' +
      '<div class="scw-ws-v2-mh-chips">' + chipsHtml + '</div>' +
    '</div>';
  }

  function buildDetail_install(rec, viewKey, cat) {
    var F = fieldsFor(viewKey);

    // Install detail = READ-ONLY info (per v1 view_4093). The editable
    // items are SCW Notes (header), Connected Devices (network devices),
    // and MDF / IDF (added 2026-07-23 — ops must be able to relocate an
    // installed item; the field_2818 GROUPING_FIELD cascade in
    // mirror-connection-sync regroups the worksheet after the move).
    // Connected To (field_2821) is read-only display (v1: connectedTo readOnly).
    var items = '';
    items += sdItem(detailConnection(rec, viewKey, F.mdfIdf || 'field_2818',
      'MDF / IDF'), 'scw-ws-v2-sd--conn');

    if (cat === 'cam') {
      // Connected To (field_2821) is DERIVED + READ-ONLY (Known Issue #12
      // step 1, same regime as SOW field_2197) — edits flow through the
      // parent's Connected Devices picker (field_2820) + cascade.
      items += sdItem(detailConnection(rec, viewKey, F.connectedDevice || 'field_2821',
        'Connected To', hasIssue(rec, 'disconnected'), true), 'scw-ws-v2-sd--conn');
      items += sdItem(detailReadOnly(rec, F.dropLength || 'field_2804', 'Drop Length'),
        'scw-ws-v2-sd--num');
      items += sdItem(detailReadOnly(rec, F.conduit || 'field_2803', 'Conduit'),
        'scw-ws-v2-sd--num');
      var mhCam = detailMountingHardwareRO(rec, viewKey);
      if (mhCam) items += sdItem(mhCam, 'scw-ws-v2-sd--wide');
      items += sdItem(detailReadOnly(rec, F.laborDesc || 'field_2809', 'Labor description'),
        'scw-ws-v2-sd--wide');
    } else if (cat === 'default') {
      // Connected Devices (field_2820, multi) — EDITABLE, network devices only
      // (v1: showWhenFieldIsYes field_2795 / mapConn).
      if (readBool(rec, F.mapConn || 'field_2795') === 'Yes') {
        items += sdItem(detailConnectedDevices(rec, viewKey, F.connectedDevices || 'field_2820', 'Connected Devices'), 'scw-ws-v2-sd--conn');
      }
      var mhDef = detailMountingHardwareRO(rec, viewKey);
      if (mhDef) items += sdItem(mhDef, 'scw-ws-v2-sd--wide');
      items += sdItem(detailReadOnly(rec, F.laborDesc || 'field_2809', 'Labor description'),
        'scw-ws-v2-sd--wide');
    }
    // services / assumptions: their labor/assumption text is in the header
    // (read-only) — nothing extra in the detail panel.

    return '<div class="scw-ws-v2-detail">' +
      '<div class="scw-ws-v2-survey-detail scw-ws-v2-install-detail">' + items + '</div>' +
    '</div>';
  }

  // ── Public entry point ─────────────────────────────────────

  function buildCard(rec, sourceViewKey) {
    var card = document.createElement('div');
    card.className = 'scw-ws-v2-card';
    card.setAttribute('data-scw-ws-v2-record', rec.id);

    var cat = bucketCategoryOf(rec, sourceViewKey);
    card.classList.add('scw-ws-v2-card--' + cat);
    if (isSalesMoney(sourceViewKey))   card.classList.add('scw-ws-v2-card--sales');
    if (isSurveyMoney(sourceViewKey))  card.classList.add('scw-ws-v2-card--survey');
    if (isInstallMoney(sourceViewKey)) {
      card.classList.add('scw-ws-v2-card--install');
      // Removed-by-CO ghost treatment — the item stays visible (never delete,
      // per the CO design) but reads as dead scope: struck-through identity,
      // rose accent. The chip itself renders in the Flags cell.
      if (installRemovedBy(rec, sourceViewKey) !== null) {
        card.classList.add('scw-ws-v2-card--removed');
      }
    }
    // laborOnly (sub CO page): the build-SOW card shape with a single money
    // column — the labor grid drops the +Hrs/+Mat/Fee tracks. The install
    // removal panel (view_4116) is laborOnly too but already has its own
    // money-free --install grid, so it doesn't take the labor class.
    if (isLaborOnly(sourceViewKey) && !isInstallMoney(sourceViewKey)) {
      card.classList.add('scw-ws-v2-card--labor');
    }
    // Ops CO worksheet (config equipmentField): the extra Equipment $ money
    // stack needs its own grid variant. Only meaningful on the build-SOW
    // money model — the other models never render the equipment stack.
    if (equipmentFieldOf(sourceViewKey) &&
        !isSalesMoney(sourceViewKey) && !isSurveyMoney(sourceViewKey) &&
        !isInstallMoney(sourceViewKey) && !isLaborOnly(sourceViewKey)) {
      card.classList.add('scw-ws-v2-card--equip');
    }
    var bid = bucketIdOf(rec, sourceViewKey);
    if (bid) card.setAttribute('data-scw-ws-v2-bucket', bid);
    // Promoted-bracket marker: the bracket has a parent (field_2464
    // resolves) but is showing as its own row because Require Sub
    // Bid (field_2479) isn\'t No/false. Used by CSS for the amber
    // left accent + the inline attached-to chip.
    if (readParentRef(rec)) {
      card.classList.add('scw-ws-v2-card--promoted-bracket');
    }

    // CO worksheet: visually separate ADD rows from REMOVAL rows by the CO
    // Action field (field_2965). Removal rows (co-remove.js creates them with
    // CO Action = Remove) get a rose accent + "REMOVE" badge; everything else
    // reads as an add. Only on the CO worksheet (coDeleteGuard).
    var _coVc = (ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(sourceViewKey)) || {};
    var _coRemove = false;
    if (_coVc.coDeleteGuard) {
      var coAct = String(readField(rec, 'field_2965') || '').replace(/<[^>]*>/g, '').trim();
      _coRemove = /remove/i.test(coAct);
      card.classList.add(_coRemove ? 'scw-ws-v2-card--co-remove' : 'scw-ws-v2-card--co-add');
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
    var sales   = isSalesMoney(sourceViewKey);
    var survey  = isSurveyMoney(sourceViewKey);
    var install = isInstallMoney(sourceViewKey);
    // Survey object (view_3505) and install object (view_4093) each take a
    // dedicated row/detail path for every bucket category — their keys +
    // money model differ from the SOW object (install has NO money columns).
    if (survey) {
      row = buildRow_survey(rec, sourceViewKey, cat);
      det = buildDetail_survey(rec, sourceViewKey, cat);
    } else if (install) {
      row = buildRow_install(rec, sourceViewKey, cat);
      det = buildDetail_install(rec, sourceViewKey, cat);
    } else if (cat === 'cam') {
      row = buildRow_cam(rec, sourceViewKey);
      det = sales ? buildDetail_sales(rec, sourceViewKey, cat) : buildDetail_cam(rec, sourceViewKey);
    } else if (cat === 'services') {
      row = buildRow_services(rec, sourceViewKey);
      det = sales ? buildDetail_sales(rec, sourceViewKey, cat) : buildDetail_services(rec, sourceViewKey);
    } else if (cat === 'assumptions') {
      row = buildRow_assumptions(rec, sourceViewKey);
      det = buildDetail_assumptions(rec, sourceViewKey);
    } else {
      row = buildRow_default(rec, sourceViewKey);
      det = sales ? buildDetail_sales(rec, sourceViewKey, cat) : buildDetail_default(rec, sourceViewKey);
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
          '<span class="scw-ws-v2-attached-tick" aria-hidden="true">↳</span>' +
          '<span class="scw-ws-v2-attached-name">' +
            escapeHtml(parentRefLabel) +
          '</span>' +
        '</div>';
    }

    card.innerHTML = attachedCaption + row + det;
    // CO removal rows: a leading "REMOVE" chip in the DROP/label cell reads as
    // the row's type flag (in-flow, next to its identity) instead of a badge
    // floating over the action icons. The rose accent + tint still mark the row.
    if (_coRemove) {
      var _labelCell = card.querySelector('.scw-ws-v2-row .scw-ws-v2-cell--label');
      if (_labelCell) {
        _labelCell.insertAdjacentHTML('afterbegin',
          '<span class="scw-ws-v2-co-flag scw-ws-v2-co-flag--remove">REMOVE</span>');
      }
    }
    // Sub CO page: badge the rows the sub created — theirs to delete. SCW
    // rows carry no badge; their trash is already swapped for unlink.
    if (subOwnsRecord(rec, sourceViewKey) === true) {
      var _ownCell = card.querySelector('.scw-ws-v2-row .scw-ws-v2-cell--label');
      if (_ownCell) {
        _ownCell.insertAdjacentHTML('afterbegin',
          '<span class="scw-ws-v2-co-flag scw-ws-v2-co-flag--sub" ' +
          'title="You added this item — you can edit or delete it.">ADDED BY YOU</span>');
      }
    }
    // Sales lock: existing survey-derived items (field_2586 >= 1) are
    // read-only except Product / Custom Disc % / SCW Notes (v1 parity).
    if (isCrLocked(rec, sourceViewKey)) {
      card.classList.add('scw-ws-v2-card--locked');
      // Reason-aware copy: sales survey-assoc keeps Product/Disc/SCW Notes
      // editable; survey finalized is a full lock.
      _lockCopy = isSalesMoney(sourceViewKey)
        ? { msg: LOCKED_MSG, hover: LOCK_HOVER_MSG }
        : { msg: 'This item is locked because it has been finalized.',
            hover: 'Locked — this item is finalized.' };
      lockCardFields(card);
      addLockedNote(card);
    }
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
    labelLineItem:       labelLineItem,
    // Lock rule (sales survey-associated rows) + the fields that stay
    // editable on a locked row — consumed by the bulk-edit modal so it
    // offers the same whitelist (Product / SCW Notes / Custom Disc %).
    isCrLocked:          isCrLocked,
    LOCK_WHITELIST:      LOCK_WHITELIST,
    // Survey-link delete block — consumed by bulk delete to drop records
    // that aren't deletable.
    isDeleteBlocked:     isDeleteBlocked,
    subOwnsRecord:       subOwnsRecord,
    isLaborOnly:         isLaborOnly,
    // Reciprocal Connected-Devices fingerprint — folded into the render
    // signature so a parent rebuilds when a child's Connected To changes.
    connDevicesSig:      connDevicesSig
  };
})();
/*** END WORKSHEET V2 — CARD **************************************************/
