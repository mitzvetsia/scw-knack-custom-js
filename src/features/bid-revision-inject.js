/*** BID REVISION INJECTION — view_3823 → view_3505 ***/
/**
 * Reads bid-revision line items from view_3823 and injects a compact
 * "revision badge + detail strip" onto matching survey-item rows in
 * view_3505 (the device worksheet).
 *
 * view_3823 is on the same scene as view_3505; we hide it visually and
 * treat it purely as a data source.
 *
 * Join key: field_2644 (connection from revision record → survey item).
 */
(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────

  var CFG = {
    revisionView: 'view_3823',
    targetViews:  ['view_3505'],
    /** field_2644 — connection to the survey line item (blank = ADD) */
    surveyItemField: 'field_2644',
    /** Fields to display in the revision detail strip */
    fields: {
      status:     { key: 'field_2645', label: 'Status' },
      connDev:    { key: 'field_2646', label: 'Connected Devices' },
      connTo:     { key: 'field_2647', label: 'Connected To' },
      subBid:     { key: 'field_2648', label: 'Sub Bid' },
      laborDesc:  { key: 'field_2649', label: 'Labor Desc' },
      existing:   { key: 'field_2650', label: 'Existing' },
      exterior:   { key: 'field_2651', label: 'Exterior' },
      plenum:     { key: 'field_2652', label: 'Plenum' },
      other:      { key: 'field_2653', label: 'Other' },
    },
    /** Rich-text field holding pre-built HTML card from change request */
    changeHtmlField: 'field_2695',
    /** JSON field holding the item data for editing */
    changeJsonField: 'field_2696',
  };

  /** Editable fields in the revision edit modal (mirrors change-requests.js FIELD_DEFS) */
  var EDIT_FIELDS = [
    { key: 'productName',     label: 'Product',            type: 'text' },
    { key: 'qty',             label: 'Qty',                type: 'number',  visKey: 'qty' },
    { key: 'rate',            label: 'Rate ($)',           type: 'number' },
    { key: 'laborDesc',       label: 'Labor Description',  type: 'text', multiline: true },
    { key: 'bidExistCabling', label: 'Existing Cabling',   type: 'select', options: ['', 'Yes', 'No'], visKey: 'cabling' },
    { key: 'bidPlenum',       label: 'Plenum',             type: 'select', options: ['', 'Yes', 'No'], visKey: 'cabling' },
    { key: 'bidExterior',     label: 'Exterior',           type: 'select', options: ['', 'Yes', 'No'], visKey: 'cabling' },
    { key: 'bidDropLength',   label: 'Drop Length',        type: 'text',   visKey: 'cabling' },
    { key: 'bidConduit',      label: 'Conduit',            type: 'text',   visKey: 'cabling' },
    { key: 'bidConnDevice',   label: 'Connected Devices',  type: 'connection', connField: 'field_2380', idsKey: 'bidConnDeviceIds', visKey: 'connDevice' },
    { key: 'bidConnTo',       label: 'Connected To',       type: 'connection', connField: 'field_2381', idsKey: 'bidConnToIds', single: true, visKey: 'cabling' },
    { key: 'bidMdfIdf',       label: 'MDF/IDF',            type: 'connection', connField: 'field_2375', idsKey: 'bidMdfIdfIds', single: true },
  ];

  var CAM_READER_BUCKET_ID = '6481e5ba38f283002898113c';
  /** MDF/IDF location records view (on the same scene as view_3505) */
  var MDF_IDF_VIEW = 'view_3617';

  var STYLE_ID   = 'scw-bid-revision-inject-css';
  var BADGE_CLS  = 'scw-revision-badge';
  var STRIP_CLS  = 'scw-revision-strip';
  var INJECTED   = 'data-scw-rev-injected';
  var EVENT_NS   = '.scwBidRevInject';
  var P          = 'scw-rev';

  // ── CSS ─────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      /* Hide the source view entirely */
      '#' + CFG.revisionView + ' { display: none !important; }',

      /* Badge on the summary row */
      '.' + BADGE_CLS + ' {',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  padding: 2px 8px; border-radius: 10px;',
      '  background: #fef3c7; color: #92400e;',
      '  font-size: 11px; font-weight: 600;',
      '  cursor: default; white-space: nowrap;',
      '  margin-left: 6px; vertical-align: middle;',
      '}',
      '.' + BADGE_CLS + '::before {',
      '  content: "\\f0e2"; font-family: FontAwesome;',
      '  font-size: 10px; font-weight: 400;',
      '}',

      /* Revision detail strip — lives INSIDE .scw-ws-detail */
      '.' + STRIP_CLS + ' {',
      '  margin: 8px 12px 4px; padding: 10px 14px;',
      '  background: #fffbeb; border-radius: 6px;',
      '  font-size: 12px; color: #78350f;',
      '}',
      '.' + P + '-strip-header {',
      '  font-weight: 700; font-size: 11px; text-transform: uppercase;',
      '  letter-spacing: .04em; color: #92400e; margin-bottom: 6px;',
      '}',
      '.' + P + '-item {',
      '  padding: 6px 0; border-bottom: 1px dashed #fde68a;',
      '}',
      '.' + P + '-item:last-child { border-bottom: none; }',
      /* HTML card — stretch full width */
      '.' + P + '-html-card { width: 100%; }',
      '.' + P + '-html-card > div { max-width: 100% !important; }',
      '.' + P + '-row {',
      '  display: flex; flex-wrap: wrap; gap: 4px 12px;',
      '}',
      '.' + P + '-tag {',
      '  display: inline-block; padding: 1px 6px; border-radius: 3px;',
      '  background: #fef9c3; font-size: 11px; white-space: nowrap;',
      '}',
      '.' + P + '-tag-label {',
      '  font-weight: 600; margin-right: 3px;',
      '}',
      '.' + P + '-edit-link {',
      '  font-size: 11px; color: #b45309; text-decoration: underline;',
      '  cursor: pointer; margin-left: 6px;',
      '}',
      '.' + P + '-edit-link:hover { color: #92400e; }',

      /* ── Action buttons (Approve / Reject) ── */
      '.' + P + '-actions {',
      '  display: flex; gap: 8px; margin-top: 8px;',
      '}',
      '.' + P + '-btn {',
      '  padding: 4px 14px; border-radius: 4px; border: none;',
      '  font-size: 12px; font-weight: 600; cursor: pointer;',
      '}',
      '.' + P + '-btn--approve {',
      '  background: #16a34a; color: #fff;',
      '}',
      '.' + P + '-btn--approve:hover { background: #15803d; }',
      '.' + P + '-btn--reject {',
      '  background: #dc2626; color: #fff;',
      '}',
      '.' + P + '-btn--reject:hover { background: #b91c1c; }',
      '.' + P + '-btn:disabled {',
      '  opacity: 0.5; cursor: not-allowed;',
      '}',

      /* ── Reject notes input ── */
      '.' + P + '-reject-wrap {',
      '  display: none; margin-top: 6px;',
      '}',
      '.' + P + '-reject-wrap.is-open { display: block; }',
      '.' + P + '-reject-input {',
      '  width: 100%; padding: 6px 8px; font-size: 12px;',
      '  border: 1px solid #fca5a5; border-radius: 4px;',
      '  box-sizing: border-box;',
      '}',
      '.' + P + '-reject-input:focus { outline: none; border-color: #dc2626; }',
      '.' + P + '-reject-confirm {',
      '  margin-top: 4px; padding: 3px 12px; border-radius: 4px;',
      '  border: none; background: #dc2626; color: #fff;',
      '  font-size: 11px; font-weight: 600; cursor: pointer;',
      '}',
      '.' + P + '-reject-confirm:hover { background: #b91c1c; }',
      '.' + P + '-reject-error {',
      '  color: #dc2626; font-size: 11px; margin-top: 2px;',
      '}',

      /* ── Group header revision/add count badges ── */
      '.' + P + '-grp-badge {',
      '  display: inline-flex; align-items: center; gap: 3px;',
      '  padding: 1px 8px; font-size: 11px; font-weight: 600;',
      '  line-height: 1.5; border-radius: 10px; white-space: nowrap;',
      '}',
      '.' + P + '-grp-badge--changes {',
      '  background: rgba(180,83,9,.12); color: #b45309;',
      '  border: 1px solid rgba(180,83,9,.22);',
      '}',
      '.' + P + '-grp-badge--adds {',
      '  background: rgba(22,163,74,.12); color: #16a34a;',
      '  border: 1px solid rgba(22,163,74,.22);',
      '}',

      /* ── Orphan rows inserted into table groups ── */
      '.' + P + '-orphan-row {',
      '  background: #fff !important;',
      '}',
      '.' + P + '-orphan-row > td {',
      '  padding: 4px 8px !important; border: none !important;',
      '}',
      '.' + P + '-orphan-card {',
      '  padding: 10px 14px; margin: 4px 0;',
      '}',

      /* ── Fallback ungrouped orphan section at top of view ── */
      '.' + P + '-orphan-section {',
      '  margin: 0 0 16px; padding: 4px 0;',
      '}',
      '.' + P + '-orphan-header {',
      '  font-weight: 700; font-size: 13px; text-transform: uppercase;',
      '  letter-spacing: .04em; color: #166534; margin-bottom: 12px;',
      '  display: flex; align-items: center; gap: 8px;',
      '  padding-bottom: 10px;',
      '}',
      '.' + P + '-orphan-header::before {',
      '  content: "\\f067"; font-family: FontAwesome;',
      '  font-size: 11px; font-weight: 400;',
      '}',

      /* ── Connection field lists in edit modal ── */
      '.' + P + '-conn-list {',
      '  max-height: 180px; overflow-y: auto; border: 1px solid #d1d5db;',
      '  border-radius: 4px; padding: 6px 8px;',
      '}',
      '.' + P + '-conn-item {',
      '  display: flex; align-items: center; gap: 6px;',
      '  padding: 3px 0; font-size: 13px; cursor: pointer;',
      '}',
      '.' + P + '-conn-item label { cursor: pointer; }',
      '.' + P + '-conn-empty {',
      '  color: #9ca3af; font-size: 12px; font-style: italic;',
      '}',

      /* ── Edit modal overlay + dialog ── */
      '.' + P + '-modal-overlay {',
      '  position: fixed; inset: 0; z-index: 10000;',
      '  background: rgba(0,0,0,.45);',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '.' + P + '-modal {',
      '  background: #fff; border-radius: 8px; width: 500px; max-width: 92vw;',
      '  max-height: 85vh; display: flex; flex-direction: column;',
      '  box-shadow: 0 8px 30px rgba(0,0,0,.25);',
      '}',
      '.' + P + '-modal-header {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 12px 16px; border-bottom: 1px solid #e5e7eb;',
      '}',
      '.' + P + '-modal-title {',
      '  font-size: 14px; font-weight: 700; color: #1f2937;',
      '}',
      '.' + P + '-modal-close {',
      '  background: none; border: none; font-size: 20px; cursor: pointer;',
      '  color: #6b7280; line-height: 1; padding: 0 4px;',
      '}',
      '.' + P + '-modal-close:hover { color: #111827; }',
      '.' + P + '-modal-body {',
      '  padding: 14px 16px; overflow-y: auto; flex: 1;',
      '}',
      '.' + P + '-modal-field {',
      '  margin-bottom: 10px;',
      '}',
      '.' + P + '-modal-label {',
      '  display: block; font-size: 11px; font-weight: 600;',
      '  color: #374151; margin-bottom: 3px;',
      '}',
      '.' + P + '-modal-input, .' + P + '-modal-select {',
      '  width: 100%; padding: 6px 8px; font-size: 13px;',
      '  border: 1px solid #d1d5db; border-radius: 4px;',
      '  box-sizing: border-box;',
      '}',
      '.' + P + '-modal-input:focus, .' + P + '-modal-select:focus {',
      '  outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,.15);',
      '}',
      '.' + P + '-modal-footer {',
      '  display: flex; justify-content: flex-end; gap: 8px;',
      '  padding: 10px 16px; border-top: 1px solid #e5e7eb;',
      '}',

      /* ── Edit + Cancel button styles ── */
      '.' + P + '-btn--edit {',
      '  background: #2563eb; color: #fff;',
      '}',
      '.' + P + '-btn--edit:hover { background: #1d4ed8; }',
      '.' + P + '-btn--cancel {',
      '  background: #e5e7eb; color: #374151;',
      '}',
      '.' + P + '-btn--cancel:hover { background: #d1d5db; }',
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── HTML POST-PROCESSING ─────────────────────────────────

  /** Connection field labels whose values should use line breaks not commas */
  var CONN_LABELS = ['Connected Devices', 'Connected To', 'MDF/IDF'];

  /**
   * Post-process an injected HTML card element:
   * - Replace comma-delimited connection field values with <br> line breaks
   * - Remove max-width from the outer wrapper
   */
  function postProcessHtmlCard(el) {
    // Fix max-width on any wrapper divs
    var divs = el.querySelectorAll('div[style*="max-width"]');
    for (var di = 0; di < divs.length; di++) divs[di].style.maxWidth = '100%';

    // Find all table rows and check if the label cell matches a connection field
    var tds = el.querySelectorAll('td');
    for (var i = 0; i < tds.length; i++) {
      var td = tds[i];
      var text = (td.textContent || '').trim();
      // Check if this is a label cell for a connection field
      for (var ci = 0; ci < CONN_LABELS.length; ci++) {
        if (text === CONN_LABELS[ci]) {
          // Found a connection label — fix the sibling value cells in this row
          var tr = td.parentElement;
          if (!tr) break;
          var cells = tr.querySelectorAll('td');
          for (var j = 0; j < cells.length; j++) {
            if (cells[j] === td) continue; // skip the label cell
            cells[j].innerHTML = cells[j].innerHTML.replace(/,\s*/g, '<br>');
          }
          break;
        }
      }
    }
  }

  // ── DATA EXTRACTION ─────────────────────────────────────

  /**
   * Try to find the Knack model for a view.
   */
  function findModel(viewKey) {
    if (typeof Knack === 'undefined' || !Knack.models) return null;
    var keys = Object.keys(Knack.models);
    for (var i = 0; i < keys.length; i++) {
      var m = Knack.models[keys[i]];
      if (m && m.view && m.view.key === viewKey) return m;
    }
    return null;
  }

  /**
   * Extract records from a Knack model.
   */
  function extractRecords(model) {
    if (!model) return [];
    if (model.data) {
      if (Array.isArray(model.data)) return model.data;
      if (typeof model.data.toJSON === 'function') return model.data.toJSON();
      if (model.data.models && Array.isArray(model.data.models)) {
        return model.data.models.map(function (m) {
          return typeof m.toJSON === 'function' ? m.toJSON() : m.attributes || m;
        });
      }
    }
    return [];
  }

  /**
   * Build connection options from view_3505 Knack model records.
   * Returns { bidMdfIdf: [{id, identifier}], bidConnDevice: [...], bidConnTo: [...] }
   */
  function buildConnOptions(viewId) {
    var model = findModel(viewId || CFG.targetViews[0]);
    var records = extractRecords(model);
    var devMap = {}, toMap = {};

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var label = stripHtml(rec.field_2365 || rec.field_2379 || '') || rec.id;

      // Connected Device targets: only camera/reader items (proposalBucket = CAM_READER_BUCKET_ID)
      var bucketRaw = rec['field_2366_raw'];
      var isCamReaderItem = false;
      if (Array.isArray(bucketRaw)) {
        for (var bi = 0; bi < bucketRaw.length; bi++) {
          if (bucketRaw[bi] && bucketRaw[bi].id === CAM_READER_BUCKET_ID) { isCamReaderItem = true; break; }
        }
      }
      if (isCamReaderItem && !devMap[rec.id]) devMap[rec.id] = { id: rec.id, identifier: label };

      // Connected To: only items where field_2374 (bidMapConn) = Yes
      var mapConn = stripHtml(rec.field_2374 || '');
      if (/^yes$/i.test(mapConn) && !toMap[rec.id]) {
        toMap[rec.id] = { id: rec.id, identifier: label };
      }

      // Also include existing connection targets as options
      var devRaw = rec['field_2380_raw'];
      if (Array.isArray(devRaw)) {
        for (var d = 0; d < devRaw.length; d++) {
          var dr = devRaw[d];
          if (dr && dr.id && !devMap[dr.id]) {
            devMap[dr.id] = { id: dr.id, identifier: stripHtml(dr.identifier || dr.id) };
          }
        }
      }
      var toRaw = rec['field_2381_raw'];
      if (Array.isArray(toRaw)) {
        for (var t = 0; t < toRaw.length; t++) {
          var tr = toRaw[t];
          if (tr && tr.id && !toMap[tr.id]) {
            toMap[tr.id] = { id: tr.id, identifier: stripHtml(tr.identifier || tr.id) };
          }
        }
      }
    }

    // Also include pending add requests (camera/reader items from revision records)
    var revModel = findModel(CFG.revisionView);
    var revRecords = extractRecords(revModel);
    for (var rri = 0; rri < revRecords.length; rri++) {
      var rr = revRecords[rri];
      var jsonStr = stripHtml(rr[CFG.changeJsonField] || '');
      if (!jsonStr) continue;
      try {
        var rj = JSON.parse(jsonStr);
        if (rj.addToBid && rj.proposalBucketId === CAM_READER_BUCKET_ID) {
          var rlabel = rj.displayLabel || rj.productName || rr.id;
          if (!devMap[rr.id]) devMap[rr.id] = { id: rr.id, identifier: rlabel };
        }
      } catch (e) { /* skip unparseable */ }
    }

    // MDF/IDF options — pull from view_3617 (MDF/IDF location records)
    var mdfMap = {};
    var mdfModel = findModel(MDF_IDF_VIEW);
    var mdfRecords = extractRecords(mdfModel);
    for (var mi = 0; mi < mdfRecords.length; mi++) {
      var mr = mdfRecords[mi];
      if (!mr.id || mdfMap[mr.id]) continue;
      var mdfLabel = stripHtml(mr.field_1642 || '') || mr.id;
      mdfMap[mr.id] = { id: mr.id, identifier: mdfLabel };
    }

    // Convert maps to sorted arrays
    function vals(map) {
      var arr = [];
      var keys = Object.keys(map);
      for (var k = 0; k < keys.length; k++) arr.push(map[keys[k]]);
      arr.sort(function (a, b) { return a.identifier.localeCompare(b.identifier); });
      return arr;
    }

    return { bidMdfIdf: vals(mdfMap), bidConnDevice: vals(devMap), bidConnTo: vals(toMap) };
  }

  /**
   * Extract the survey-item record ID from a revision record's field_2644.
   * Tries _raw first (array of {id, identifier}), then parses the HTML string.
   */
  function getSurveyItemId(record) {
    var raw = record[CFG.surveyItemField + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0].id) return raw[0].id;
    // Fallback: parse connection HTML — look for 24-char hex in class attr
    var html = record[CFG.surveyItemField];
    if (typeof html === 'string') {
      var m = html.match(/class="([0-9a-f]{24})"/i);
      if (m) return m[1];
    }
    return null;
  }

  /**
   * Strip HTML tags from a value.
   */
  function stripHtml(v) {
    if (typeof v !== 'string') return String(v == null ? '' : v);
    return v.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Escape HTML special characters for safe injection.
   */
  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Format a number as currency ($1,234.56). */
  function fmtCurrencyHtml(v) {
    if (v == null || v === 0) return '$0.00';
    return '$' + Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Build self-contained HTML card from a revision JSON object.
   * Mirrors change-requests.js buildItemHtml() so the stored card
   * renders identically whether it was created from the bid grid
   * or from the revision edit modal.
   */
  function buildRevisionHtml(data) {
    // Determine action type
    var action = data.removeFromBid ? 'remove' : data.addToBid ? 'add' : 'revise';
    var palette = action === 'add'    ? { color: '#16a34a', bg: '#f0fdf4', border: '#16a34a33', badge: '#dcfce7', badgeText: '#166534', label: 'ADD' }
                : action === 'remove' ? { color: '#dc2626', bg: '#fef2f2', border: '#dc262633', badge: '#fee2e2', badgeText: '#991b1b', label: 'REMOVE' }
                :                       { color: '#3b82f6', bg: '#eff6ff', border: '#3b82f633', badge: '#dbeafe', badgeText: '#1e40af', label: 'REVISE' };

    var r = data.requested || {};
    var c = data.current   || {};

    var h = [];
    h.push('<div style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1e293b;max-width:600px;">');
    h.push('<div style="background:' + palette.bg + ';border:1px solid ' + palette.border + ';border-radius:6px;padding:10px 14px;">');

    // Badge + item header
    h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">');
    h.push('<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:' + palette.badge + ';color:' + palette.badgeText + ';font-size:10px;font-weight:700;letter-spacing:0.5px;">' + palette.label + '</span>');
    h.push('<span style="font-weight:600;font-size:13px;">' + escHtml(data.displayLabel || data.productName || 'Item') + '</span>');
    if (data.productName && data.displayLabel && data.productName !== data.displayLabel) {
      h.push('<span style="color:#64748b;font-size:12px;">&mdash; ' + escHtml(data.productName) + '</span>');
    }
    h.push('</div>');

    if (action === 'remove') {
      if (data.changeNotes) {
        h.push('<div style="font-size:12px;color:#64748b;font-style:italic;">&ldquo;' + escHtml(data.changeNotes) + '&rdquo;</div>');
      }
    } else {
      // Build field changes from EDIT_FIELDS (only show actual changes)
      var fieldRows = [];
      for (var fi = 0; fi < EDIT_FIELDS.length; fi++) {
        var d = EDIT_FIELDS[fi];
        var toVal = r[d.key];
        if (toVal == null || toVal === '') continue;
        var fromVal = c[d.key];
        // Skip fields where requested equals current (no actual change)
        if (fromVal != null && String(toVal).trim() === String(fromVal).trim()) continue;
        var isCurrency = d.key === 'rate';
        var isConn = d.type === 'connection';
        var fromStr = fromVal != null && fromVal !== '' ? escHtml(isCurrency ? fmtCurrencyHtml(fromVal) : String(fromVal)) : '&mdash;';
        var toStr = escHtml(isCurrency ? fmtCurrencyHtml(toVal) : String(toVal));
        if (isConn) {
          fromStr = fromStr.replace(/,\s*/g, '<br>');
          toStr = toStr.replace(/,\s*/g, '<br>');
        }
        fieldRows.push({ label: d.label, fromStr: fromStr, toStr: toStr });
      }

      if (fieldRows.length) {
        h.push('<table style="width:100%;border-collapse:collapse;font-size:12px;">');
        for (var ri = 0; ri < fieldRows.length; ri++) {
          var fr = fieldRows[ri];
          h.push('<tr>');
          h.push('<td style="padding:3px 8px 3px 0;color:#475569;white-space:nowrap;font-weight:500;">' + escHtml(fr.label) + '</td>');
          if (action === 'revise') {
            h.push('<td style="padding:3px 8px;color:#94a3b8;text-decoration:line-through;">' + fr.fromStr + '</td>');
            h.push('<td style="padding:3px 0;color:#94a3b8;">&rarr;</td>');
          }
          h.push('<td style="padding:3px 8px;font-weight:600;color:' + palette.color + ';">' + fr.toStr + '</td>');
          h.push('</tr>');
        }
        h.push('</table>');
      }

      if (data.changeNotes) {
        h.push('<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:6px;border-top:1px solid ' + palette.border + ';padding-top:4px;">&ldquo;' + escHtml(data.changeNotes) + '&rdquo;</div>');
      }
    }

    h.push('</div>');
    h.push('</div>');
    return h.join('');
  }

  /**
   * Build a revision entry from a raw record.
   */
  function buildRevEntry(rec) {
    var changeHtml = rec[CFG.changeHtmlField] || '';
    if (typeof changeHtml === 'string') changeHtml = changeHtml.trim();

    var changes = [];
    if (!changeHtml) {
      var fKeys = Object.keys(CFG.fields);
      for (var fi = 0; fi < fKeys.length; fi++) {
        var fd = CFG.fields[fKeys[fi]];
        var val = stripHtml(rec[fd.key] || '');
        if (!val || val === '&nbsp;' || val === '\u00a0') continue;
        if (fKeys[fi] === 'existing' || fKeys[fi] === 'exterior' || fKeys[fi] === 'plenum') {
          if (/^no$/i.test(val)) continue;
        }
        changes.push({ label: fd.label, value: val });
      }
    }

    var editHref = '';
    var domRow = document.getElementById(rec.id);
    if (domRow) {
      var link = domRow.querySelector('a.kn-link-page');
      if (link) editHref = link.getAttribute('href') || '';
    }

    // Parse JSON item data for editing
    var changeJson = null;
    var jsonRaw = rec[CFG.changeJsonField] || '';
    if (typeof jsonRaw === 'string') jsonRaw = stripHtml(jsonRaw).trim();
    if (jsonRaw) {
      try { changeJson = JSON.parse(jsonRaw); } catch (e) {
        console.warn('[BidRevInject] Failed to parse JSON for', rec.id, e);
      }
    }

    return { id: rec.id, editHref: editHref, changeHtml: changeHtml, changeJson: changeJson, changes: changes };
  }

  /**
   * Read revision records from view_3823's Knack model AND DOM table.
   * DOM scraping is the primary source (most reliable for field_2695/2696 data);
   * model data supplements any records not found in the DOM.
   * Returns { map: surveyItemId → [entry], orphaned: [entry] }
   * Orphaned = records with no survey item connection (e.g. Add requests).
   */
  function buildRevisionMap() {
    // Always try DOM first — most reliable for rich-text / JSON fields
    var domRecords = scrapeFromDom();
    console.log('[BidRevInject] DOM-scraped records:', domRecords.length);

    // Supplement with model data for records not found in the DOM
    var seen = {};
    for (var di = 0; di < domRecords.length; di++) {
      if (domRecords[di].id) seen[domRecords[di].id] = true;
    }

    var model = findModel(CFG.revisionView);
    var modelRecords = extractRecords(model);
    console.log('[BidRevInject] Model records:', modelRecords.length);

    var records = domRecords.slice();
    for (var mi = 0; mi < modelRecords.length; mi++) {
      var mr = modelRecords[mi];
      if (mr.id && !seen[mr.id]) {
        records.push(mr);
        seen[mr.id] = true;
      }
    }
    console.log('[BidRevInject] Total records (merged):', records.length);

    var map = {};
    var orphaned = [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var siId = getSurveyItemId(rec);
      var entry = buildRevEntry(rec);

      console.log('[BidRevInject] Record', rec.id,
                  '| surveyItemId:', siId,
                  '| hasHtml:', !!entry.changeHtml,
                  '| hasJson:', !!entry.changeJson,
                  '| changes:', entry.changes.length);

      if (!siId) {
        // No survey item connection — orphaned add request
        orphaned.push(entry);
        continue;
      }

      if (!map[siId]) map[siId] = [];
      map[siId].push(entry);
    }
    console.log('[BidRevInject] Revision map:', Object.keys(map).length,
                'matched,', orphaned.length, 'orphaned');
    return { map: map, orphaned: orphaned };
  }

  /**
   * Scrape records from the view_3823 DOM table.
   * Works even when view_3823 is display:none — elements still exist in DOM.
   */
  function scrapeFromDom() {
    var viewEl = document.getElementById(CFG.revisionView);
    if (!viewEl) { console.log('[BidRevInject] View element not found for', CFG.revisionView); return []; }
    var table = viewEl.querySelector('table.kn-table-table') || viewEl.querySelector('table.kn-table');
    if (!table) { console.log('[BidRevInject] No DOM table for', CFG.revisionView); return []; }
    var rows = table.querySelectorAll('tbody > tr');
    if (!rows.length) rows = table.querySelectorAll('tr');
    console.log('[BidRevInject] DOM table rows found:', rows.length);
    var records = [];
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var trId = tr.id || tr.getAttribute('data-record-id') || '';
      if (!trId) continue;
      var rec = { id: trId };
      // Extract field_2644 (survey item connection — blank = ADD)
      var siCell = tr.querySelector('td.' + CFG.surveyItemField);
      if (siCell) {
        var span = siCell.querySelector('span[data-kn="connection-value"]');
        if (!span) span = siCell.querySelector('span.kn-detail-body__value');
        if (!span) span = siCell.querySelector('span[class]');
        if (span) {
          // Knack puts the record ID as the span's class name
          var spanClass = (span.className || '').trim();
          var connId = '';
          if (/^[0-9a-f]{24}$/i.test(spanClass)) {
            connId = spanClass;
          } else {
            // Try to find a 24-char hex ID in any attribute
            var m2 = (siCell.innerHTML || '').match(/[0-9a-f]{24}/i);
            if (m2) connId = m2[0];
          }
          if (connId) {
            rec[CFG.surveyItemField + '_raw'] = [{ id: connId, identifier: span.textContent.trim() }];
          }
        }
      }
      // Extract each data field
      var fKeys = Object.keys(CFG.fields);
      for (var fi = 0; fi < fKeys.length; fi++) {
        var fd = CFG.fields[fKeys[fi]];
        var cell = tr.querySelector('td.' + fd.key);
        if (cell) rec[fd.key] = cell.textContent.trim();
      }
      // Extract pre-built HTML field (rich text — keep innerHTML)
      var htmlCell = tr.querySelector('td.' + CFG.changeHtmlField);
      if (htmlCell) rec[CFG.changeHtmlField] = htmlCell.innerHTML.trim();
      // Extract JSON data field
      var jsonCell = tr.querySelector('td.' + CFG.changeJsonField);
      if (jsonCell) rec[CFG.changeJsonField] = jsonCell.textContent.trim();
      records.push(rec);
    }
    return records;
  }

  // ── DOM INJECTION ───────────────────────────────────────

  /**
   * Find the worksheet card wrapper for a given record ID in the target view.
   * The device-worksheet transform puts the record ID on the scw-ws-row <tr>
   * itself (not the original data <tr>).  The card lives inside that row.
   * Uses attribute selector because Knack IDs start with digits (invalid for #).
   */
  function findCardForRecord(viewEl, recordId) {
    var wsTr = viewEl.querySelector('tr.scw-ws-row[id="' + recordId + '"]');
    if (!wsTr) return null;
    return wsTr.querySelector('.scw-ws-card') || null;
  }

  /**
   * Build the badge element: "N revision(s)"
   */
  function makeBadge(count) {
    var badge = document.createElement('span');
    badge.className = BADGE_CLS;
    badge.textContent = count + ' revision' + (count !== 1 ? 's' : '');
    return badge;
  }

  // ── EDIT MODAL ──────────────────────────────────────────

  var MODAL_ID = 'scw-rev-edit-overlay';

  function closeEditModal() {
    var el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  /**
   * Open an edit modal pre-filled from the revision JSON.
   * Connection fields render as radio/checkbox lists matching the
   * comparison bid grid behavior.  On save the modified payload includes
   * both identifiers and IDs for every connection field.
   */
  function openEditModal(revisionId, jsonData, wrapEl, jsonRef) {
    closeEditModal();
    var data = jsonData || {};

    // Build connection options from view_3505 + view_3617
    var connOpts = buildConnOptions();

    // Derive field visibility from proposal bucket (mirrors init.js logic)
    var bucketId = data.proposalBucketId || '';
    var isCamReader = bucketId === CAM_READER_BUCKET_ID;
    // Check if the item has connection data (mapConnections equivalent)
    var hasConnData = !!(data.bidConnDevice || data.bidConnTo
      || (data.requested && (data.requested.bidConnDevice || data.requested.bidConnTo))
      || (data.current   && (data.current.bidConnDevice   || data.current.bidConnTo)));
    var vis = {
      qty:        true,
      cabling:    isCamReader,
      connDevice: hasConnData && !isCamReader,
    };

    var overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = P + '-modal-overlay';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeEditModal(); });

    var modal = document.createElement('div');
    modal.className = P + '-modal';

    // Header
    var header = document.createElement('div');
    header.className = P + '-modal-header';
    var title = document.createElement('div');
    title.className = P + '-modal-title';
    title.textContent = 'Edit Revision \u2014 ' + (data.displayLabel || data.productName || 'Item');
    header.appendChild(title);
    var closeBtn = document.createElement('button');
    closeBtn.className = P + '-modal-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', closeEditModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body — build inputs from EDIT_FIELDS
    var body = document.createElement('div');
    body.className = P + '-modal-body';

    // Merge current + requested for pre-fill (requested wins)
    var current   = data.current   || {};
    var requested = data.requested || {};
    var prefill = {};
    var prefillIds = {};
    for (var pi = 0; pi < EDIT_FIELDS.length; pi++) {
      var pk = EDIT_FIELDS[pi].key;
      if (requested[pk] != null) prefill[pk] = requested[pk];
      else if (current[pk] != null) prefill[pk] = current[pk];
      else if (data[pk] != null) prefill[pk] = data[pk];
      // Pre-fill IDs for connection fields
      if (EDIT_FIELDS[pi].idsKey) {
        var ik = EDIT_FIELDS[pi].idsKey;
        if (requested[ik] && requested[ik].length) prefillIds[pk] = requested[ik];
        else if (current[ik] && current[ik].length) prefillIds[pk] = current[ik];
        else if (data[ik] && data[ik].length) prefillIds[pk] = data[ik];
      }
    }

    var inputs = {};
    for (var fi = 0; fi < EDIT_FIELDS.length; fi++) {
      var fd = EDIT_FIELDS[fi];

      // Skip fields hidden by proposal bucket visibility rules
      if (fd.visKey && !vis[fd.visKey]) continue;

      var val = prefill[fd.key] != null ? String(prefill[fd.key]) : '';

      // Skip empty non-essential fields to keep modal compact
      if (fd.type !== 'connection') {
        if (!val && fd.type === 'select') continue;
        if (!val && fd.key !== 'productName' && fd.key !== 'qty' && fd.key !== 'rate') continue;
      }

      var fRow = document.createElement('div');
      fRow.className = P + '-modal-field';
      var label = document.createElement('label');
      label.className = P + '-modal-label';
      label.textContent = fd.label;
      fRow.appendChild(label);

      var inp;
      if (fd.type === 'connection') {
        // ── Connection field: radio (single) or checkbox (multi) list ──
        var recs = connOpts[fd.key] || [];
        var curIds = prefillIds[fd.key] || [];
        inp = document.createElement('div');
        inp.className = P + '-conn-list';

        if (!recs.length) {
          var emptyMsg = document.createElement('span');
          emptyMsg.className = P + '-conn-empty';
          emptyMsg.textContent = 'No available records';
          inp.appendChild(emptyMsg);
        }

        for (var ri = 0; ri < recs.length; ri++) {
          var rec = recs[ri];
          var item = document.createElement('div');
          item.className = P + '-conn-item';

          var ctrl = document.createElement('input');
          if (fd.single) {
            ctrl.type = 'radio';
            ctrl.name = P + '-radio-' + fd.key;
          } else {
            ctrl.type = 'checkbox';
          }
          ctrl.value = rec.id;
          ctrl.id = P + '-conn-' + fd.key + '-' + ri;
          // Check if this option is currently selected
          for (var ci = 0; ci < curIds.length; ci++) {
            if (curIds[ci] === rec.id) { ctrl.checked = true; break; }
          }
          item.appendChild(ctrl);

          var ctrlLabel = document.createElement('label');
          ctrlLabel.setAttribute('for', ctrl.id);
          ctrlLabel.textContent = rec.identifier || rec.id;
          item.appendChild(ctrlLabel);
          inp.appendChild(item);
        }

        inputs[fd.key] = inp;
        fRow.appendChild(inp);
        body.appendChild(fRow);
      } else if (fd.type === 'select') {
        inp = document.createElement('select');
        inp.className = P + '-modal-select';
        for (var oi = 0; oi < fd.options.length; oi++) {
          var opt = document.createElement('option');
          opt.value = fd.options[oi];
          opt.textContent = fd.options[oi] || '\u2014';
          inp.appendChild(opt);
        }
        inp.value = val;
        inputs[fd.key] = inp;
        fRow.appendChild(inp);
        body.appendChild(fRow);
      } else if (fd.multiline) {
        inp = document.createElement('textarea');
        inp.className = P + '-modal-input';
        inp.rows = 3;
        inp.value = val;
        inputs[fd.key] = inp;
        fRow.appendChild(inp);
        body.appendChild(fRow);
      } else {
        inp = document.createElement('input');
        inp.type = fd.type === 'number' ? 'number' : 'text';
        inp.className = P + '-modal-input';
        if (fd.type === 'number') inp.setAttribute('step', 'any');
        inp.value = val;
        inputs[fd.key] = inp;
        fRow.appendChild(inp);
        body.appendChild(fRow);
      }
    }

    // Notes
    var notesRow = document.createElement('div');
    notesRow.className = P + '-modal-field';
    var notesLabel = document.createElement('label');
    notesLabel.className = P + '-modal-label';
    notesLabel.textContent = 'Notes';
    notesRow.appendChild(notesLabel);
    var notesInput = document.createElement('textarea');
    notesInput.className = P + '-modal-input';
    notesInput.rows = 2;
    notesInput.placeholder = 'Optional notes about changes\u2026';
    notesRow.appendChild(notesInput);
    body.appendChild(notesRow);
    modal.appendChild(body);

    // ── Collect ONLY modified values from the form (skip unchanged) ──
    function collectModified() {
      var modified = {};
      for (var k = 0; k < EDIT_FIELDS.length; k++) {
        var d = EDIT_FIELDS[k];
        if (!inputs[d.key]) continue;

        if (d.type === 'connection') {
          var container = inputs[d.key];
          var selIds = [], selLabels = [];

          if (d.single) {
            var checked = container.querySelector('input[type="radio"]:checked');
            if (checked) {
              selIds.push(checked.value);
              var lbl = container.querySelector('label[for="' + checked.id + '"]');
              selLabels.push(lbl ? lbl.textContent : checked.value);
            }
          } else {
            var cbs = container.querySelectorAll('input[type="checkbox"]:checked');
            for (var si = 0; si < cbs.length; si++) {
              selIds.push(cbs[si].value);
              var lbl = container.querySelector('label[for="' + cbs[si].id + '"]');
              selLabels.push(lbl ? lbl.textContent : cbs[si].value);
            }
          }

          // Compare against prefill IDs — only include if changed
          var origIds = (prefillIds[d.key] || []).slice().sort();
          var newIds  = selIds.slice().sort();
          var changed = origIds.length !== newIds.length;
          if (!changed) {
            for (var ci = 0; ci < origIds.length; ci++) {
              if (origIds[ci] !== newIds[ci]) { changed = true; break; }
            }
          }
          if (changed) {
            modified[d.key] = selLabels.join(', ');
            modified[d.idsKey] = selIds;
          }
        } else {
          var v = (inputs[d.key].value || '').trim();
          var orig = prefill[d.key] != null ? String(prefill[d.key]).trim() : '';
          if (d.type === 'number') {
            var numV    = v    ? parseFloat(v)    : 0;
            var numOrig = orig ? parseFloat(orig) : 0;
            if (numV !== numOrig) modified[d.key] = numV;
          } else {
            if (v !== orig) modified[d.key] = v;
          }
        }
      }
      return modified;
    }

    // Footer
    var footer = document.createElement('div');
    footer.className = P + '-modal-footer';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = P + '-btn ' + P + '-btn--cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeEditModal);
    footer.appendChild(cancelBtn);

    // Save (update JSON on the revision record — no webhook)
    var saveOnlyBtn = document.createElement('button');
    saveOnlyBtn.className = P + '-btn ' + P + '-btn--edit';
    saveOnlyBtn.textContent = 'Save';
    saveOnlyBtn.addEventListener('click', function () {
      var modified = collectModified();
      var notes = notesInput.value.trim();

      // Merge modified values into the JSON and write back to field_2696
      var updated = JSON.parse(JSON.stringify(data)); // deep clone
      if (!updated.requested) updated.requested = {};
      var mKeys = Object.keys(modified);
      for (var mi = 0; mi < mKeys.length; mi++) {
        updated.requested[mKeys[mi]] = modified[mKeys[mi]];
      }
      if (notes) updated.changeNotes = notes;

      // Build both JSON and HTML for the revision record
      var updatedJson = JSON.stringify(updated);
      var updatedHtml = buildRevisionHtml(updated);

      var putBody = {};
      putBody[CFG.changeJsonField] = updatedJson;
      putBody[CFG.changeHtmlField] = updatedHtml;

      saveOnlyBtn.disabled = true;
      saveOnlyBtn.textContent = 'Saving\u2026';

      console.log('[BidRevInject] Save PUT for', revisionId, '| JSON length:', updatedJson.length, '| HTML length:', updatedHtml.length);

      SCW.knackAjax({
        url:  SCW.knackRecordUrl(CFG.revisionView, revisionId),
        type: 'PUT',
        data: JSON.stringify(putBody),
        success: function () {
          console.log('[BidRevInject] Saved JSON + HTML for', revisionId);
          // Update the in-memory reference so the next Edit click sees latest data
          if (jsonRef) jsonRef.data = updated;
          // Re-inject the updated HTML card into the DOM
          // wrapEl is the action-buttons wrapper; the HTML card is a sibling
          // inside the parent .scw-rev-item div
          if (wrapEl) {
            var itemDiv = wrapEl.parentElement;
            var htmlCard = itemDiv ? itemDiv.querySelector('.' + P + '-html-card') : null;
            if (htmlCard) {
              htmlCard.innerHTML = updatedHtml;
              postProcessHtmlCard(htmlCard);
            }
          }
          closeEditModal();
        },
        error: function (xhr) {
          console.error('[BidRevInject] Save failed for', revisionId, xhr.status, xhr.responseText);
          saveOnlyBtn.disabled = false;
          saveOnlyBtn.textContent = 'Save';
        },
      });
    });
    footer.appendChild(saveOnlyBtn);

    // Approve with Changes
    var approveBtn = document.createElement('button');
    approveBtn.className = P + '-btn ' + P + '-btn--approve';
    approveBtn.textContent = 'Approve with Changes';
    approveBtn.addEventListener('click', function () {
      var modified = collectModified();
      var notes = notesInput.value.trim();
      closeEditModal();
      submitRevisionAction(revisionId, 'approve_with_changes', '', wrapEl, {
        outcome: 'accepted with changes',
        modified: modified,
        notes: notes,
      });
    });
    footer.appendChild(approveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ── ACTION BUTTONS ──────────────────────────────────────

  /**
   * Build Approve / Edit / Reject action buttons for a single revision.
   */
  function buildActionButtons(revisionId, changeJson) {
    // Mutable holder so the Edit button always sees the latest data
    // (updated after Save without needing to rebuild the DOM)
    var jsonRef = { data: changeJson };
    var wrap = document.createElement('div');

    var actions = document.createElement('div');
    actions.className = P + '-actions';

    var approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = P + '-btn ' + P + '-btn--approve';
    approveBtn.textContent = 'Approve';

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = P + '-btn ' + P + '-btn--edit';
    editBtn.textContent = 'Edit';

    var rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = P + '-btn ' + P + '-btn--reject';
    rejectBtn.textContent = 'Reject';

    actions.appendChild(approveBtn);
    actions.appendChild(editBtn);
    actions.appendChild(rejectBtn);
    wrap.appendChild(actions);

    // Reject notes — hidden until Reject is clicked
    var rejectWrap = document.createElement('div');
    rejectWrap.className = P + '-reject-wrap';

    var input = document.createElement('textarea');
    input.className = P + '-reject-input';
    input.placeholder = 'Reason for rejection (required)\u2026';
    input.rows = 2;
    rejectWrap.appendChild(input);

    var errorMsg = document.createElement('div');
    errorMsg.className = P + '-reject-error';
    rejectWrap.appendChild(errorMsg);

    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = P + '-reject-confirm';
    confirmBtn.textContent = 'Confirm Rejection';
    rejectWrap.appendChild(confirmBtn);

    wrap.appendChild(rejectWrap);

    // ── Approve handler ──
    approveBtn.addEventListener('click', function () {
      approveBtn.disabled = true;
      editBtn.disabled = true;
      rejectBtn.disabled = true;
      submitRevisionAction(revisionId, 'approve', '', wrap, { outcome: 'accepted' });
    });

    // ── Edit handler — open modal with latest data ──
    editBtn.addEventListener('click', function () {
      openEditModal(revisionId, jsonRef.data, wrap, jsonRef);
    });

    // ── Reject handler — toggle notes input ──
    rejectBtn.addEventListener('click', function () {
      rejectWrap.classList.toggle('is-open');
      if (rejectWrap.classList.contains('is-open')) {
        input.focus();
      }
    });

    // ── Confirm rejection ──
    confirmBtn.addEventListener('click', function () {
      var reason = input.value.trim();
      if (!reason) {
        errorMsg.textContent = 'A reason is required to reject.';
        input.focus();
        return;
      }
      errorMsg.textContent = '';
      approveBtn.disabled = true;
      editBtn.disabled = true;
      rejectBtn.disabled = true;
      confirmBtn.disabled = true;
      submitRevisionAction(revisionId, 'reject', reason, wrap, { outcome: 'rejected' });
    });

    return wrap;
  }

  /**
   * Submit an action for a revision record.
   * extra: { outcome, modified?, notes? }
   */
  function submitRevisionAction(revisionId, action, reason, wrapEl, extra) {
    extra = extra || {};
    var payload = {
      actionType:  'revision_response',
      revisionId:  revisionId,
      outcome:     extra.outcome || action,
      timestamp:   new Date().toISOString(),
    };
    if (reason)         payload.reason   = reason;
    if (extra.modified) payload.modified = extra.modified;
    if (extra.notes)    payload.notes    = extra.notes;

    console.log('[BidRevInject] Submitting', action, 'for', revisionId, payload);

    var webhookUrl = (window.SCW && window.SCW.bidReview && window.SCW.bidReview.CONFIG)
                   ? window.SCW.bidReview.CONFIG.changeRequestWebhook
                   : '';
    if (!webhookUrl) {
      console.error('[BidRevInject] No webhook URL configured');
      return;
    }

    SCW.knackAjax({
      url:  webhookUrl,
      type: 'POST',
      data: JSON.stringify(payload),
      success: function () {
        console.log('[BidRevInject]', action, 'success for', revisionId);
        var badge = document.createElement('div');
        badge.style.cssText = 'padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;display:inline-block;margin-top:6px;';
        if (extra.outcome === 'rejected') {
          badge.style.background = '#fee2e2';
          badge.style.color = '#991b1b';
          badge.textContent = '\u2717 Rejected' + (reason ? ': ' + reason : '');
        } else if (extra.outcome === 'accepted with changes') {
          badge.style.background = '#dbeafe';
          badge.style.color = '#1e40af';
          badge.textContent = '\u2713 Accepted with changes';
        } else {
          badge.style.background = '#dcfce7';
          badge.style.color = '#166534';
          badge.textContent = '\u2713 Accepted';
        }
        wrapEl.innerHTML = '';
        wrapEl.appendChild(badge);
      },
      error: function (xhr) {
        console.error('[BidRevInject]', action, 'failed for', revisionId, xhr.status);
        var btns = wrapEl.querySelectorAll('button');
        for (var bi = 0; bi < btns.length; bi++) btns[bi].disabled = false;
        var err = wrapEl.querySelector('.' + P + '-reject-error');
        if (err) err.textContent = 'Failed to submit \u2014 please try again.';
      },
    });
  }

  /**
   * Build the revision detail strip for one survey item's revisions.
   */
  function makeStrip(revisions) {
    var strip = document.createElement('div');
    strip.className = STRIP_CLS;

    var header = document.createElement('div');
    header.className = P + '-strip-header';
    header.textContent = 'Revisions (' + revisions.length + ')';
    strip.appendChild(header);

    for (var i = 0; i < revisions.length; i++) {
      var rev = revisions[i];
      var item = document.createElement('div');
      item.className = P + '-item';

      if (rev.changeHtml) {
        // Pre-built HTML card from change request payload
        var htmlWrap = document.createElement('div');
        htmlWrap.className = P + '-html-card';
        htmlWrap.innerHTML = rev.changeHtml;
        postProcessHtmlCard(htmlWrap);
        item.appendChild(htmlWrap);
      } else {
        // Fallback: tag-based rendering for older records
        var row = document.createElement('div');
        row.className = P + '-row';

        for (var ci = 0; ci < rev.changes.length; ci++) {
          var ch = rev.changes[ci];
          var tag = document.createElement('span');
          tag.className = P + '-tag';
          var lbl = document.createElement('span');
          lbl.className = P + '-tag-label';
          lbl.textContent = ch.label + ':';
          tag.appendChild(lbl);
          tag.appendChild(document.createTextNode(' ' + ch.value));
          row.appendChild(tag);
        }

        if (!rev.changes.length) {
          var empty = document.createElement('span');
          empty.className = P + '-tag';
          empty.textContent = '(no field changes)';
          row.appendChild(empty);
        }

        item.appendChild(row);
      }

      // ── Approve / Edit / Reject buttons ──
      item.appendChild(buildActionButtons(rev.id, rev.changeJson));

      strip.appendChild(item);
    }
    return strip;
  }

  /**
   * Main injection: for each target view, match revision records to rows
   * and inject badge + detail strip.
   */
  /**
   * Build a standalone orphan card for an add request with no matching
   * survey item in view_3505.
   */
  function makeOrphanCard(rev) {
    var card = document.createElement('div');
    card.className = P + '-orphan-card';

    if (rev.changeHtml) {
      var htmlWrap = document.createElement('div');
      htmlWrap.className = P + '-html-card';
      htmlWrap.innerHTML = rev.changeHtml;
      postProcessHtmlCard(htmlWrap);
      // Remove redundant "ADD" badge — already in the Add Requests section
      var badges = htmlWrap.querySelectorAll('span');
      for (var bi = 0; bi < badges.length; bi++) {
        if (/^\s*ADD\s*$/i.test(badges[bi].textContent) && /background/.test(badges[bi].getAttribute('style') || '')) {
          badges[bi].remove();
          break;
        }
      }
      card.appendChild(htmlWrap);
    } else {
      // Fallback: tag-based
      var row = document.createElement('div');
      row.className = P + '-row';
      for (var ci = 0; ci < rev.changes.length; ci++) {
        var ch = rev.changes[ci];
        var tag = document.createElement('span');
        tag.className = P + '-tag';
        var lbl = document.createElement('span');
        lbl.className = P + '-tag-label';
        lbl.textContent = ch.label + ':';
        tag.appendChild(lbl);
        tag.appendChild(document.createTextNode(' ' + ch.value));
        row.appendChild(tag);
      }
      if (!rev.changes.length) {
        var empty = document.createElement('span');
        empty.className = P + '-tag';
        empty.textContent = '(no details)';
        row.appendChild(empty);
      }
      card.appendChild(row);
    }

    card.appendChild(buildActionButtons(rev.id, rev.changeJson));
    return card;
  }

  /**
   * Extract the MDF/IDF label from an orphan revision entry's JSON data.
   */
  function getOrphanMdfIdf(rev) {
    if (rev.changeJson && rev.changeJson.bidMdfIdf) return rev.changeJson.bidMdfIdf;
    if (rev.changeJson && rev.changeJson.requested && rev.changeJson.requested.bidMdfIdf) return rev.changeJson.requested.bidMdfIdf;
    if (rev.changeJson && rev.changeJson.current && rev.changeJson.current.bidMdfIdf) return rev.changeJson.current.bidMdfIdf;
    return '';
  }

  /**
   * Find the group header <tr> whose text matches the given MDF/IDF label.
   * Returns the header row or null.
   */
  function findGroupHeader(viewEl, mdfIdf) {
    if (!mdfIdf) return null;
    var headers = viewEl.querySelectorAll('tr.kn-table-group');
    var target = mdfIdf.trim().toLowerCase();
    for (var i = 0; i < headers.length; i++) {
      var inner = headers[i].querySelector('.scw-group-inner');
      if (!inner) continue;
      // The group label is a text node between the collapse icon and the badges span.
      // Walk child nodes to extract just the text, ignoring badges/counts.
      var label = '';
      for (var ci = 0; ci < inner.childNodes.length; ci++) {
        var n = inner.childNodes[ci];
        if (n.nodeType === 3) label += n.textContent; // text nodes only
      }
      if (label.trim().toLowerCase() === target) return headers[i];
    }
    return null;
  }

  /**
   * Find the last row belonging to a group (all sibling <tr>s after the
   * header until the next kn-table-group or kn-group-level-1).
   */
  function findLastRowInGroup(headerTr) {
    var last = headerTr;
    var next = headerTr.nextElementSibling;
    while (next) {
      if (next.classList.contains('kn-group-level-1')) break;
      last = next;
      next = next.nextElementSibling;
    }
    return last;
  }

  var ORPHAN_ROW_CLS = P + '-orphan-row';

  /**
   * Render orphaned add requests within their matching MDF/IDF group.
   * Falls back to a section at the top of the view for any unmatched orphans.
   */
  function renderOrphanSection(viewEl, orphans) {
    // Remove any previously injected orphan rows and fallback section
    var oldRows = viewEl.querySelectorAll('.' + ORPHAN_ROW_CLS);
    for (var ri = 0; ri < oldRows.length; ri++) oldRows[ri].remove();
    var existing = viewEl.querySelector('.' + P + '-orphan-section');
    if (existing) existing.remove();

    if (!orphans.length) return;

    // Sort orphans by proposalBucket name, then sortOrder
    orphans.sort(function (a, b) {
      var aBucket = (a.changeJson && a.changeJson.proposalBucket) || '';
      var bBucket = (b.changeJson && b.changeJson.proposalBucket) || '';
      if (aBucket !== bBucket) return aBucket.localeCompare(bBucket);
      var aSort = (a.changeJson && a.changeJson.sortOrder) || 0;
      var bSort = (b.changeJson && b.changeJson.sortOrder) || 0;
      return aSort - bSort;
    });

    // Determine table colspan from the first group header or thead
    var firstGroupTd = viewEl.querySelector('tr.kn-table-group > td[colspan]');
    var colspan = firstGroupTd ? firstGroupTd.getAttribute('colspan') : '1';

    // Group orphans by MDF/IDF
    var byMdf = {};
    var ungrouped = [];
    for (var i = 0; i < orphans.length; i++) {
      var mdf = getOrphanMdfIdf(orphans[i]);
      if (mdf) {
        if (!byMdf[mdf]) byMdf[mdf] = [];
        byMdf[mdf].push(orphans[i]);
      } else {
        ungrouped.push(orphans[i]);
      }
    }

    // Insert grouped orphans into their matching table groups
    var mdfKeys = Object.keys(byMdf);
    for (var mi = 0; mi < mdfKeys.length; mi++) {
      var mdfKey = mdfKeys[mi];
      var groupHeader = findGroupHeader(viewEl, mdfKey);
      if (!groupHeader) {
        // No matching group — fall back to ungrouped
        for (var fi = 0; fi < byMdf[mdfKey].length; fi++) ungrouped.push(byMdf[mdfKey][fi]);
        continue;
      }
      var lastRow = findLastRowInGroup(groupHeader);
      var items = byMdf[mdfKey];
      for (var oi = 0; oi < items.length; oi++) {
        var tr = document.createElement('tr');
        tr.className = ORPHAN_ROW_CLS;
        var td = document.createElement('td');
        td.setAttribute('colspan', colspan);
        td.appendChild(makeOrphanCard(items[oi]));
        tr.appendChild(td);
        // Insert after the last row in this group
        if (lastRow.nextSibling) {
          lastRow.parentNode.insertBefore(tr, lastRow.nextSibling);
        } else {
          lastRow.parentNode.appendChild(tr);
        }
        lastRow = tr; // subsequent orphans go after this one
      }
    }

    // Fallback: render ungrouped orphans at the top of the view
    if (ungrouped.length) {
      var section = document.createElement('div');
      section.className = P + '-orphan-section';
      var header = document.createElement('div');
      header.className = P + '-orphan-header';
      header.textContent = 'Add Requests (' + ungrouped.length + ')';
      section.appendChild(header);
      for (var ui = 0; ui < ungrouped.length; ui++) {
        section.appendChild(makeOrphanCard(ungrouped[ui]));
      }
      if (viewEl.firstChild) {
        viewEl.insertBefore(section, viewEl.firstChild);
      } else {
        viewEl.appendChild(section);
      }
    }

    console.log('[BidRevInject] Rendered', orphans.length, 'orphaned adds (' +
                (orphans.length - ungrouped.length) + ' grouped, ' +
                ungrouped.length + ' ungrouped)');
  }

  var _injectRetries = 0;

  function inject(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) { console.log('[BidRevInject] View element not found:', viewId); return; }

    var result = buildRevisionMap();
    var revMap = result.map;
    var orphaned = result.orphaned;
    var siIds = Object.keys(revMap);
    if (!siIds.length && !orphaned.length) {
      console.log('[BidRevInject] No revisions to inject');
      return;
    }

    // For matched revisions, verify the device-worksheet transform has run
    var wsRows = viewEl.querySelectorAll('tr.scw-ws-row');
    if (!wsRows.length && siIds.length) {
      _injectRetries++;
      if (_injectRetries < 10) {
        console.log('[BidRevInject] No scw-ws-row found in', viewId, '— retrying in 500ms (attempt', _injectRetries + ')');
        setTimeout(function () { inject(viewId); }, 500);
      } else {
        console.warn('[BidRevInject] Gave up waiting for scw-ws-row after', _injectRetries, 'attempts');
      }
      // Render orphans even while waiting for worksheet rows
      renderOrphanSection(viewEl, orphaned);
      return;
    }
    _injectRetries = 0;

    var injected = 0;
    for (var i = 0; i < siIds.length; i++) {
      var siId = siIds[i];
      var card = findCardForRecord(viewEl, siId);
      if (!card) {
        // No matching row in view_3505 — treat as orphaned add
        var unmatched = revMap[siId];
        for (var ui = 0; ui < unmatched.length; ui++) orphaned.push(unmatched[ui]);
        continue;
      }
      if (card.getAttribute(INJECTED)) continue;
      card.setAttribute(INJECTED, '1');

      var revisions = revMap[siId];

      // Badge → append to the identity / product area in the summary
      var identity = card.querySelector('.scw-ws-identity');
      if (identity) {
        identity.appendChild(makeBadge(revisions.length));
      }

      // Revision strip → inside the detail panel (visible when expanded)
      var detail = card.querySelector('.scw-ws-detail');
      if (detail) {
        detail.appendChild(makeStrip(revisions));
      } else {
        var photoWrap = card.querySelector('.scw-ws-photo-wrap');
        if (photoWrap) {
          card.insertBefore(makeStrip(revisions), photoWrap);
        } else {
          card.appendChild(makeStrip(revisions));
        }
      }
      injected++;
    }
    console.log('[BidRevInject] Injected revisions onto', injected, 'cards,',
                orphaned.length, 'orphaned adds');

    // Render orphaned add requests (includes any unmatched map entries)
    renderOrphanSection(viewEl, orphaned);

    // Inject change/add count badges into group headers
    injectGroupBadges(viewEl, siIds, revMap, orphaned);
  }

  var GRP_BADGE_CLS = P + '-grp-badge';

  /**
   * Add "N changes  N adds" badges to each group header that has revisions.
   */
  function injectGroupBadges(viewEl, siIds, revMap, orphaned) {
    // Remove any previously injected badges
    var old = viewEl.querySelectorAll('.' + GRP_BADGE_CLS);
    for (var oi = 0; oi < old.length; oi++) old[oi].remove();

    var groupHeaders = viewEl.querySelectorAll('tr.kn-table-group');
    if (!groupHeaders.length) return;

    for (var gi = 0; gi < groupHeaders.length; gi++) {
      var header = groupHeaders[gi];
      var changes = 0;
      var adds = 0;

      // Count matched revisions (REVISE/REMOVE) in this group:
      // walk sibling rows until next group header
      var row = header.nextElementSibling;
      while (row) {
        if (row.classList.contains('kn-group-level-1')) break;
        if (row.classList.contains('scw-ws-row') && row.querySelector('[' + INJECTED + ']')) {
          changes++;
        }
        if (row.classList.contains(ORPHAN_ROW_CLS)) {
          adds++;
        }
        row = row.nextElementSibling;
      }

      if (!changes && !adds) continue;

      // Find the badges container in the header
      var badgesWrap = header.querySelector('.scw-group-badges');
      if (!badgesWrap) continue;

      if (changes) {
        var changeBadge = document.createElement('span');
        changeBadge.className = GRP_BADGE_CLS + ' ' + GRP_BADGE_CLS + '--changes';
        changeBadge.textContent = changes + ' change' + (changes !== 1 ? 's' : '');
        badgesWrap.insertBefore(changeBadge, badgesWrap.firstChild);
      }
      if (adds) {
        var addBadge = document.createElement('span');
        addBadge.className = GRP_BADGE_CLS + ' ' + GRP_BADGE_CLS + '--adds';
        addBadge.textContent = adds + ' add' + (adds !== 1 ? 's' : '');
        badgesWrap.insertBefore(addBadge, badgesWrap.firstChild);
      }
    }
  }

  // ── EVENT BINDING ───────────────────────────────────────

  console.log('[BidRevInject] IIFE executing — binding events for', CFG.revisionView, '→', CFG.targetViews.join(','));
  injectStyles();

  // We need both view_3823 and view_3505 to have rendered.
  // Track readiness and inject when both are available.
  var _ready = {};

  function tryInject(targetViewId) {
    // Delay to let device-worksheet finish its 150ms transform
    setTimeout(function () { inject(targetViewId); }, 350);
  }

  function onViewReady(viewId) {
    _ready[viewId] = true;
    console.log('[BidRevInject] View ready:', viewId, '| all ready:', JSON.stringify(_ready));
    // Only inject once the revision view AND at least one target have rendered
    if (!_ready[CFG.revisionView]) return;
    for (var i = 0; i < CFG.targetViews.length; i++) {
      if (_ready[CFG.targetViews[i]]) {
        tryInject(CFG.targetViews[i]);
      }
    }
  }

  // Bind revision view render
  $(document).off('knack-view-render.' + CFG.revisionView + EVENT_NS)
             .on('knack-view-render.' + CFG.revisionView + EVENT_NS, function () {
    onViewReady(CFG.revisionView);
  });

  // Bind each target view render
  for (var ti = 0; ti < CFG.targetViews.length; ti++) {
    (function (tv) {
      $(document).off('knack-view-render.' + tv + EVENT_NS)
                 .on('knack-view-render.' + tv + EVENT_NS, function () {
        onViewReady(tv);
      });
    })(CFG.targetViews[ti]);
  }

  // Also re-inject after inline edits / re-renders on target views
  for (var ti2 = 0; ti2 < CFG.targetViews.length; ti2++) {
    (function (tv) {
      $(document).off('knack-cell-update.' + tv + EVENT_NS)
                 .on('knack-cell-update.' + tv + EVENT_NS, function () {
        // Clear injected flags so we re-inject
        var cards = document.querySelectorAll('#' + tv + ' [' + INJECTED + ']');
        for (var ci = 0; ci < cards.length; ci++) cards[ci].removeAttribute(INJECTED);
        setTimeout(function () { inject(tv); }, 400);
      });
    })(CFG.targetViews[ti2]);
  }

  // Reset on scene change + fallback polling
  $(document).off('knack-scene-render.any' + EVENT_NS)
             .on('knack-scene-render.any' + EVENT_NS, function () {
    _ready = {};
    _injectRetries = 0;

    // Fallback: poll for both views in case view-render events were missed
    // (e.g. view rendered before event handler was bound, or hidden views
    // that don't fire render events reliably).
    var pollCount = 0;
    var pollId = setInterval(function () {
      pollCount++;
      if (pollCount > 20) { clearInterval(pollId); return; }  // give up after 10s
      var revView = document.getElementById(CFG.revisionView);
      if (!revView) return;
      // Check each target view
      for (var pi = 0; pi < CFG.targetViews.length; pi++) {
        var tv = CFG.targetViews[pi];
        if (_ready[CFG.revisionView] && _ready[tv]) continue; // already handled
        var targetView = document.getElementById(tv);
        if (!targetView) continue;
        // Both views exist in the DOM — mark ready and inject
        console.log('[BidRevInject] Fallback poll found both views:', CFG.revisionView, tv);
        _ready[CFG.revisionView] = true;
        _ready[tv] = true;
        clearInterval(pollId);
        tryInject(tv);
        return;
      }
    }, 500);
  });

})();
