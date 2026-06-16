/*** WORKSHEET V2 — CHANGE REQUESTS (bid revisions) ***************************
 *
 * V2 equivalent of bid-revision-inject.js. Reads bid-revision line items from
 * view_3823 (hidden data-source on the same scene as view_3505) and injects a
 * revision badge + detail strip onto the matching V2 survey-worksheet cards
 * (the .scw-ws-v2-card list rendered by worksheet-v2/render.js).
 *
 * Standalone: it duplicates v1's data contract (same field keys, same JSON
 * payload shape, same webhook) but targets V2 card DOM instead of v1 table
 * rows, and re-injects after V2 rebuilds via a MutationObserver. It coexists
 * with v1's bid-revision-inject.js — that one targets #view_3505's table, this
 * one targets #scw-ws-v2-view_3505's cards, so they never collide.
 *
 * Join key: field_2644 (revision → survey line item; blank = ADD / orphan).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  // ── CONFIG ──────────────────────────────────────────────
  var CFG = {
    revisionView: 'view_3823',
    targetView:   'view_3505',
    containerId:  'scw-ws-v2-view_3505',
    surveyItemField:   'field_2644',   // connection → survey line item (blank = ADD)
    fields: {
      status:    { key: 'field_2645', label: 'Status' },
      connDev:   { key: 'field_2646', label: 'Connected Devices' },
      connTo:    { key: 'field_2647', label: 'Connected To' },
      subBid:    { key: 'field_2648', label: 'Sub Bid' },
      laborDesc: { key: 'field_2649', label: 'Labor Desc' },
      existing:  { key: 'field_2650', label: 'Existing' },
      exterior:  { key: 'field_2651', label: 'Exterior' },
      plenum:    { key: 'field_2652', label: 'Plenum' },
      other:     { key: 'field_2653', label: 'Other' }
    },
    changeHtmlField:   'field_2695',   // pre-built HTML card
    changeJsonField:   'field_2696',   // JSON payload (current/requested/action)
    revisionHtmlField: 'field_2687',   // alt HTML storage (kept in sync)
    revisionJsonField: 'field_2688'    // alt JSON storage (kept in sync)
  };

  // Editable fields in the revision edit modal (mirrors v1 EDIT_FIELDS).
  var EDIT_FIELDS = [
    { key: 'productName',     label: 'Product',           type: 'text' },
    { key: 'qty',             label: 'Qty',               type: 'number',  visKey: 'qty' },
    { key: 'rate',            label: 'Rate ($)',          type: 'number' },
    { key: 'laborDesc',       label: 'Labor Description', type: 'text', multiline: true },
    { key: 'bidExistCabling', label: 'Existing Cabling',  type: 'select', options: ['', 'Yes', 'No'], visKey: 'cabling' },
    { key: 'bidPlenum',       label: 'Plenum',            type: 'select', options: ['', 'Yes', 'No'], visKey: 'cabling' },
    { key: 'bidExterior',     label: 'Exterior',          type: 'select', options: ['', 'Yes', 'No'], visKey: 'cabling' },
    { key: 'bidDropLength',   label: 'Drop Length',       type: 'text',   visKey: 'cabling' },
    { key: 'bidConduit',      label: 'Conduit',           type: 'text',   visKey: 'cabling' },
    { key: 'bidConnDevice',   label: 'Connected Devices', type: 'connection', connField: 'field_2380', idsKey: 'bidConnDeviceIds', visKey: 'connDevice' },
    { key: 'bidConnTo',       label: 'Connected To',      type: 'connection', connField: 'field_2381', idsKey: 'bidConnToIds', single: true, visKey: 'cabling' },
    { key: 'bidMdfIdf',       label: 'MDF/IDF',           type: 'connection', connField: 'field_2375', idsKey: 'bidMdfIdfIds', single: true }
  ];

  var CAM_READER_BUCKET_ID = '6481e5ba38f283002898113c';
  var MDF_IDF_VIEW = 'view_3617';

  var P          = 'scw-ws-v2-rev';
  var STYLE_ID   = 'scw-ws-v2-rev-css';
  var STRIP_CLS  = P + '-strip';
  var BADGE_CLS  = P + '-badge';
  var ORPHAN_SEC = P + '-orphan-section';
  var INJECTED   = 'data-scw-ws-v2-rev-injected';
  var MODAL_ID   = P + '-edit-overlay';

  function debug() {
    if (window.SCW && typeof SCW.debug === 'function') SCW.debug.apply(SCW, arguments);
  }

  // ── HELPERS (ported from bid-revision-inject.js) ─────────
  function stripHtml(v) {
    if (typeof v !== 'string') return String(v == null ? '' : v);
    return v.replace(/<[^>]*>/g, '').trim();
  }
  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtCurrencyHtml(v) {
    if (v == null || v === 0) return '$0.00';
    return '$' + Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function findModel(viewKey) {
    if (typeof Knack === 'undefined' || !Knack.models) return null;
    var keys = Object.keys(Knack.models);
    for (var i = 0; i < keys.length; i++) {
      var m = Knack.models[keys[i]];
      if (m && m.view && m.view.key === viewKey) return m;
    }
    return null;
  }
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
  function readModelRecord(viewKey, recordId) {
    if (!recordId) return null;
    var recs = extractRecords(findModel(viewKey));
    for (var i = 0; i < recs.length; i++) {
      if (recs[i] && recs[i].id === recordId) return recs[i];
    }
    return null;
  }
  function getSurveyItemId(record) {
    var raw = record[CFG.surveyItemField + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0].id) return raw[0].id;
    var html = record[CFG.surveyItemField];
    if (typeof html === 'string') {
      var m = html.match(/class="([0-9a-f]{24})"/i);
      if (m) return m[1];
    }
    return null;
  }

  // Connection field labels whose values render with <br> not commas.
  var CONN_LABELS = ['Connected Devices', 'Connected To', 'MDF/IDF'];
  function postProcessHtmlCard(el) {
    var divs = el.querySelectorAll('div[style*="max-width"]');
    for (var di = 0; di < divs.length; di++) divs[di].style.maxWidth = '100%';
    var tds = el.querySelectorAll('td');
    for (var i = 0; i < tds.length; i++) {
      var td = tds[i];
      var text = (td.textContent || '').trim();
      for (var ci = 0; ci < CONN_LABELS.length; ci++) {
        if (text === CONN_LABELS[ci]) {
          var tr = td.parentElement;
          if (!tr) break;
          var cells = tr.querySelectorAll('td');
          for (var j = 0; j < cells.length; j++) {
            if (cells[j] === td) continue;
            cells[j].innerHTML = cells[j].innerHTML.replace(/,\s*/g, '<br>');
          }
          break;
        }
      }
    }
  }

  // ── CONNECTION OPTIONS (for the edit modal) ──────────────
  function buildPendingClaimedSet(selfId) {
    var claimed = {};
    var crApi = window.SCW && window.SCW.bidReview && window.SCW.bidReview.changeRequests;
    if (!crApi || typeof crApi.getPending !== 'function') return claimed;
    var pending = crApi.getPending();
    var pkeys = Object.keys(pending);
    for (var pk = 0; pk < pkeys.length; pk++) {
      var items = pending[pkeys[pk]].items || [];
      for (var ii = 0; ii < items.length; ii++) {
        var it = items[ii];
        if (selfId && (it.bidRecordId === selfId || it.rowId === selfId)) continue;
        var reqIds = (it.requested && it.requested.bidConnDeviceIds) || [];
        for (var qi = 0; qi < reqIds.length; qi++) claimed[reqIds[qi]] = true;
      }
    }
    return claimed;
  }

  function buildConnOptions(opts) {
    var isAdd = opts && opts.isAdd;
    var selfId = opts && opts.selfId;
    var records = extractRecords(findModel(CFG.targetView));
    var devMap = {}, toMap = {};
    var pendingClaimed = buildPendingClaimedSet(selfId);

    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var label = stripHtml(rec.field_2365 || rec.field_2379 || '') || rec.id;

      var isCamReaderItem = false;
      var bucketRaw = rec['field_2366_raw'];
      if (Array.isArray(bucketRaw)) {
        for (var bi = 0; bi < bucketRaw.length; bi++) {
          if (bucketRaw[bi] && bucketRaw[bi].id === CAM_READER_BUCKET_ID) { isCamReaderItem = true; break; }
        }
      }
      if (!isCamReaderItem) {
        var bucketHtml = rec.field_2366 || '';
        if (typeof bucketHtml === 'string' && bucketHtml.indexOf(CAM_READER_BUCKET_ID) !== -1) isCamReaderItem = true;
      }
      if (isCamReaderItem) {
        var connToPopulated = false;
        if (isAdd) {
          var ct = rec['field_2381_raw'];
          if (Array.isArray(ct) && ct.length && ct[0].id) connToPopulated = true;
          else if (stripHtml(rec.field_2381 || '')) connToPopulated = true;
        }
        if (!(isAdd && connToPopulated) && !pendingClaimed[rec.id] && !devMap[rec.id]) {
          devMap[rec.id] = { id: rec.id, identifier: label };
        }
      }

      var mapConn = stripHtml(rec.field_2374 || '');
      if (/^yes$/i.test(mapConn) && !toMap[rec.id]) toMap[rec.id] = { id: rec.id, identifier: label };

      var devRaw = rec['field_2380_raw'];
      if (Array.isArray(devRaw)) {
        for (var d = 0; d < devRaw.length; d++) {
          var dr = devRaw[d];
          if (dr && dr.id && !devMap[dr.id]) devMap[dr.id] = { id: dr.id, identifier: stripHtml(dr.identifier || dr.id) };
        }
      }
      var toRaw = rec['field_2381_raw'];
      if (Array.isArray(toRaw)) {
        for (var t = 0; t < toRaw.length; t++) {
          var tr = toRaw[t];
          if (tr && tr.id && !toMap[tr.id]) toMap[tr.id] = { id: tr.id, identifier: stripHtml(tr.identifier || tr.id) };
        }
      }
    }

    var mdfMap = {};
    var mdfRecords = extractRecords(findModel(MDF_IDF_VIEW));
    for (var mi = 0; mi < mdfRecords.length; mi++) {
      var mr = mdfRecords[mi];
      if (!mr.id || mdfMap[mr.id]) continue;
      mdfMap[mr.id] = { id: mr.id, identifier: stripHtml(mr.field_1642 || '') || mr.id };
    }

    function vals(map) {
      var arr = [], keys = Object.keys(map);
      for (var k = 0; k < keys.length; k++) arr.push(map[keys[k]]);
      arr.sort(function (a, b) { return a.identifier.localeCompare(b.identifier); });
      return arr;
    }
    return { bidMdfIdf: vals(mdfMap), bidConnDevice: vals(devMap), bidConnTo: vals(toMap) };
  }

  // ── REVISION HTML CARD (mirrors v1 buildRevisionHtml) ────
  function buildRevisionHtml(data) {
    var action = data.removeFromBid ? 'remove' : data.addToBid ? 'add' : (data.action || 'revise');
    var palette = action === 'add'    ? { color: '#16a34a', bg: '#f0fdf4', border: '#16a34a33', badge: '#dcfce7', badgeText: '#166534', label: 'ADD' }
                : action === 'remove' ? { color: '#dc2626', bg: '#fef2f2', border: '#dc262633', badge: '#fee2e2', badgeText: '#991b1b', label: 'REMOVE' }
                :                       { color: '#3b82f6', bg: '#eff6ff', border: '#3b82f633', badge: '#dbeafe', badgeText: '#1e40af', label: 'REVISE' };
    var r = data.requested || {};
    var c = data.current   || {};

    var hasProductChange = (r.productName != null && c.productName != null
        && String(r.productName).trim() !== ''
        && String(c.productName).trim() !== String(r.productName).trim());

    var h = [];
    h.push('<div style="font-family:system-ui,-apple-system,sans-serif;font-size:13px;color:#1e293b;max-width:100%;">');
    h.push('<div style="background:' + palette.bg + ';border:1px solid ' + palette.border + ';border-radius:6px;padding:10px 14px;">');
    h.push('<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">');
    h.push('<span style="display:inline-block;padding:1px 6px;border-radius:3px;background:' + palette.badge + ';color:' + palette.badgeText + ';font-size:10px;font-weight:700;letter-spacing:0.5px;">' + palette.label + '</span>');
    h.push('<span style="font-weight:600;font-size:13px;">' + escHtml(data.displayLabel || data.productName || 'Item') + '</span>');
    if (!hasProductChange && data.productName && data.displayLabel && data.productName !== data.displayLabel) {
      h.push('<span style="color:#64748b;font-size:12px;">&mdash; ' + escHtml(data.productName) + '</span>');
    }
    h.push('</div>');

    if (action === 'remove') {
      if (data.changeNotes) h.push('<div style="font-size:12px;color:#64748b;font-style:italic;">&ldquo;' + escHtml(data.changeNotes) + '&rdquo;</div>');
    } else {
      var fieldRows = [];
      for (var fi = 0; fi < EDIT_FIELDS.length; fi++) {
        var d = EDIT_FIELDS[fi];
        var toVal = r[d.key];
        if (toVal == null || toVal === '') continue;
        var fromVal = c[d.key];
        if (fromVal != null && String(toVal).trim() === String(fromVal).trim()) continue;
        var isCurrency = d.key === 'rate';
        var isConn = d.type === 'connection';
        var fromStr = (fromVal != null && fromVal !== '') ? escHtml(isCurrency ? fmtCurrencyHtml(fromVal) : String(fromVal)) : '&mdash;';
        var toStr = escHtml(isCurrency ? fmtCurrencyHtml(toVal) : String(toVal));
        if (isConn) { fromStr = fromStr.replace(/,\s*/g, '<br>'); toStr = toStr.replace(/,\s*/g, '<br>'); }
        fieldRows.push({ key: d.key, label: d.label, fromStr: fromStr, toStr: toStr });
      }
      fieldRows.sort(function (a, b) {
        if (a.key === 'productName' && b.key !== 'productName') return -1;
        if (b.key === 'productName' && a.key !== 'productName') return 1;
        return 0;
      });
      if (fieldRows.length) {
        h.push('<table style="width:100%;border-collapse:collapse;font-size:12px;">');
        for (var ri = 0; ri < fieldRows.length; ri++) {
          var fr = fieldRows[ri];
          var isProductRow = (fr.key === 'productName');
          var rowSize = isProductRow ? '13px' : '12px';
          var labelWeight = isProductRow ? '700' : '500';
          var toWeight = isProductRow ? '700' : '600';
          h.push('<tr>');
          h.push('<td style="padding:3px 8px 3px 0;color:#475569;white-space:nowrap;font-weight:' + labelWeight + ';font-size:' + rowSize + ';">' + escHtml(fr.label) + '</td>');
          if (action === 'revise') {
            h.push('<td style="padding:3px 8px;color:#94a3b8;text-decoration:line-through;font-size:' + rowSize + ';">' + fr.fromStr + '</td>');
            h.push('<td style="padding:3px 0;color:#94a3b8;font-size:' + rowSize + ';">&rarr;</td>');
          }
          h.push('<td style="padding:3px 8px;font-weight:' + toWeight + ';color:' + palette.color + ';font-size:' + rowSize + ';">' + fr.toStr + '</td>');
          h.push('</tr>');
        }
        h.push('</table>');
      }
      if (data.changeNotes) h.push('<div style="font-size:12px;color:#64748b;font-style:italic;margin-top:6px;border-top:1px solid ' + palette.border + ';padding-top:4px;">&ldquo;' + escHtml(data.changeNotes) + '&rdquo;</div>');
    }
    h.push('</div></div>');
    return h.join('');
  }

  // ── REVISION READ FLOW ───────────────────────────────────
  function buildRevEntry(rec) {
    var changeHtml = rec[CFG.changeHtmlField] || '';
    if (typeof changeHtml === 'string') changeHtml = changeHtml.trim();

    var changes = [];
    if (!changeHtml) {
      var fKeys = Object.keys(CFG.fields);
      for (var fi = 0; fi < fKeys.length; fi++) {
        var fd = CFG.fields[fKeys[fi]];
        var val = stripHtml(rec[fd.key] || '');
        if (!val || val === '&nbsp;' || val === ' ') continue;
        if (fKeys[fi] === 'existing' || fKeys[fi] === 'exterior' || fKeys[fi] === 'plenum') {
          if (/^no$/i.test(val)) continue;
        }
        changes.push({ label: fd.label, value: val });
      }
    }

    var changeJson = null;
    var jsonRaw = rec[CFG.changeJsonField] || '';
    if (typeof jsonRaw === 'string') jsonRaw = stripHtml(jsonRaw).trim();
    if (jsonRaw) {
      try { changeJson = JSON.parse(jsonRaw); }
      catch (e) { console.warn('[ws-v2-rev] bad JSON for', rec.id, e); }
    }

    return {
      id: rec.id,
      parentRequestId: rec._parentRequestId || '',
      changeHtml: changeHtml,
      changeJson: changeJson,
      changes: changes
    };
  }

  function scrapeFromDom() {
    var viewEl = document.getElementById(CFG.revisionView);
    if (!viewEl) return [];
    var table = viewEl.querySelector('table.kn-table-table') || viewEl.querySelector('table.kn-table');
    if (!table) return [];
    var rows = table.querySelectorAll('tbody > tr');
    if (!rows.length) rows = table.querySelectorAll('tr');
    var records = [];
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var trId = tr.id || tr.getAttribute('data-record-id') || '';
      if (!trId) continue;
      var rec = { id: trId };
      var siCell = tr.querySelector('td.' + CFG.surveyItemField);
      if (siCell) {
        var span = siCell.querySelector('span[data-kn="connection-value"]') ||
                   siCell.querySelector('span.kn-detail-body__value') ||
                   siCell.querySelector('span[class]');
        if (span) {
          var spanClass = (span.className || '').trim();
          var connId = '';
          if (/^[0-9a-f]{24}$/i.test(spanClass)) connId = spanClass;
          else { var m2 = (siCell.innerHTML || '').match(/[0-9a-f]{24}/i); if (m2) connId = m2[0]; }
          if (connId) rec[CFG.surveyItemField + '_raw'] = [{ id: connId, identifier: span.textContent.trim() }];
        }
      }
      var prCell = tr.querySelector('td.field_2643');
      if (prCell) {
        var prSpan = prCell.querySelector('span[data-kn="connection-value"]');
        if (prSpan) {
          var prClass = (prSpan.className || '').trim();
          if (/^[0-9a-f]{24}$/i.test(prClass)) {
            rec._parentRequestId = prClass;
            rec._parentRequestLabel = (prSpan.textContent || '').trim();
          }
        }
      }
      var fKeys = Object.keys(CFG.fields);
      for (var fi = 0; fi < fKeys.length; fi++) {
        var fd = CFG.fields[fKeys[fi]];
        var cell = tr.querySelector('td.' + fd.key);
        if (cell) rec[fd.key] = cell.textContent.trim();
      }
      var htmlCell = tr.querySelector('td.' + CFG.changeHtmlField);
      if (htmlCell) rec[CFG.changeHtmlField] = htmlCell.innerHTML.trim();
      var jsonCell = tr.querySelector('td.' + CFG.changeJsonField);
      if (jsonCell) rec[CFG.changeJsonField] = jsonCell.textContent.trim();
      records.push(rec);
    }
    return records;
  }

  function buildRevisionMap() {
    var domRecords = scrapeFromDom();
    var seen = {};
    for (var di = 0; di < domRecords.length; di++) if (domRecords[di].id) seen[domRecords[di].id] = true;
    var modelRecords = extractRecords(findModel(CFG.revisionView));
    var records = domRecords.slice();
    for (var mi = 0; mi < modelRecords.length; mi++) {
      var mr = modelRecords[mi];
      if (mr.id && !seen[mr.id]) { records.push(mr); seen[mr.id] = true; }
    }
    var map = {}, orphaned = [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var siId = getSurveyItemId(rec);
      var entry = buildRevEntry(rec);
      // Skip already-resolved revisions (Accepted/Rejected) — only PENDING ones show.
      var status = '';
      if (rec[CFG.fields.status.key] != null) status = stripHtml(rec[CFG.fields.status.key]).toLowerCase();
      if (status === 'accepted' || status === 'rejected') continue;
      if (!siId) { entry.surveyItemId = ''; orphaned.push(entry); continue; }
      entry.surveyItemId = siId;
      if (!map[siId]) map[siId] = [];
      map[siId].push(entry);
    }
    return { map: map, orphaned: orphaned };
  }

  // ── EDIT MODAL ───────────────────────────────────────────
  function closeEditModal() {
    var el = document.getElementById(MODAL_ID);
    if (el) el.remove();
  }

  function openEditModal(revisionId, jsonData, wrapEl, jsonRef) {
    closeEditModal();
    var data = jsonData || {};
    var isAddItem = !!(data.addToBid || data.action === 'add');
    var selfRowId = data.rowId || data.sowItemId || '';
    var connOpts = buildConnOptions({ isAdd: isAddItem, selfId: selfRowId });

    var bucketId = data.proposalBucketId || '';
    var isCamReader = bucketId === CAM_READER_BUCKET_ID;
    var hasConnData = !!(data.bidConnDevice || data.bidConnTo
      || (data.requested && (data.requested.bidConnDevice || data.requested.bidConnTo))
      || (data.current   && (data.current.bidConnDevice   || data.current.bidConnTo)));
    var vis = { qty: true, cabling: isCamReader, connDevice: hasConnData && !isCamReader };

    var overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = P + '-modal-overlay';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeEditModal(); });

    var modal = document.createElement('div');
    modal.className = P + '-modal';

    var header = document.createElement('div');
    header.className = P + '-modal-header';
    var title = document.createElement('div');
    title.className = P + '-modal-title';
    title.textContent = 'Edit Revision — ' + (data.displayLabel || data.productName || 'Item');
    header.appendChild(title);
    var closeBtn = document.createElement('button');
    closeBtn.className = P + '-modal-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeEditModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = document.createElement('div');
    body.className = P + '-modal-body';

    var current = data.current || {}, requested = data.requested || {};
    var fieldsLookup = {};
    if (data.fields) {
      if (Array.isArray(data.fields)) {
        for (var fli = 0; fli < data.fields.length; fli++) {
          var fl = data.fields[fli];
          if (fl && fl.key && fl.value != null) fieldsLookup[fl.key] = fl.value;
        }
      } else if (typeof data.fields === 'object') fieldsLookup = data.fields;
    }
    var prefill = {}, prefillIds = {};
    for (var pi = 0; pi < EDIT_FIELDS.length; pi++) {
      var pk = EDIT_FIELDS[pi].key;
      if (requested[pk] != null) prefill[pk] = requested[pk];
      else if (fieldsLookup[pk] != null) prefill[pk] = fieldsLookup[pk];
      else if (data[pk] != null) prefill[pk] = data[pk];
      else if (current[pk] != null) prefill[pk] = current[pk];
      if (EDIT_FIELDS[pi].idsKey) {
        var ik = EDIT_FIELDS[pi].idsKey;
        if (requested[ik] && requested[ik].length) prefillIds[pk] = requested[ik];
        else if (fieldsLookup[ik] && fieldsLookup[ik].length) prefillIds[pk] = fieldsLookup[ik];
        else if (data[ik] && data[ik].length) prefillIds[pk] = data[ik];
        else if (current[ik] && current[ik].length) prefillIds[pk] = current[ik];
      }
    }

    var inputs = {};
    for (var fi = 0; fi < EDIT_FIELDS.length; fi++) {
      var fd = EDIT_FIELDS[fi];
      if (fd.visKey && !vis[fd.visKey]) continue;
      var val = prefill[fd.key] != null ? String(prefill[fd.key]) : '';
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
        var recs = (connOpts[fd.key] || []).slice();
        var curIds = prefillIds[fd.key] || [];
        if (!curIds.length && prefill[fd.key]) {
          var labels = String(prefill[fd.key]).split(',');
          var resolved = [];
          for (var li = 0; li < labels.length; li++) {
            var needle = labels[li].trim();
            if (!needle) continue;
            for (var ri2 = 0; ri2 < recs.length; ri2++) {
              if (recs[ri2].identifier === needle) { resolved.push(recs[ri2].id); break; }
            }
          }
          if (resolved.length) { curIds = resolved; prefillIds[fd.key] = resolved; }
        }
        if (curIds.length) {
          var curLabels = (prefill[fd.key] || '').split(',');
          var recsById = {};
          for (var rx = 0; rx < recs.length; rx++) recsById[recs[rx].id] = true;
          for (var cx = 0; cx < curIds.length; cx++) {
            if (!recsById[curIds[cx]]) recs.push({ id: curIds[cx], identifier: (curLabels[cx] || '').trim() || curIds[cx] });
          }
        }
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
          if (fd.single) { ctrl.type = 'radio'; ctrl.name = P + '-radio-' + fd.key; }
          else ctrl.type = 'checkbox';
          ctrl.value = rec.id;
          ctrl.id = P + '-conn-' + fd.key + '-' + ri;
          for (var ci = 0; ci < curIds.length; ci++) { if (curIds[ci] === rec.id) { ctrl.checked = true; break; } }
          item.appendChild(ctrl);
          var ctrlLabel = document.createElement('label');
          ctrlLabel.setAttribute('for', ctrl.id);
          ctrlLabel.textContent = rec.identifier || rec.id;
          item.appendChild(ctrlLabel);
          inp.appendChild(item);
        }
      } else if (fd.type === 'select') {
        inp = document.createElement('select');
        inp.className = P + '-modal-select';
        for (var oi = 0; oi < fd.options.length; oi++) {
          var opt = document.createElement('option');
          opt.value = fd.options[oi];
          opt.textContent = fd.options[oi] || '—';
          inp.appendChild(opt);
        }
        inp.value = val;
      } else if (fd.multiline) {
        inp = document.createElement('textarea');
        inp.className = P + '-modal-input';
        inp.rows = 3;
        inp.value = val;
      } else {
        inp = document.createElement('input');
        inp.type = fd.type === 'number' ? 'number' : 'text';
        inp.className = P + '-modal-input';
        if (fd.type === 'number') inp.setAttribute('step', 'any');
        inp.value = val;
      }
      inputs[fd.key] = inp;
      fRow.appendChild(inp);
      body.appendChild(fRow);
    }

    var notesRow = document.createElement('div');
    notesRow.className = P + '-modal-field';
    var notesLabel = document.createElement('label');
    notesLabel.className = P + '-modal-label';
    notesLabel.textContent = 'Notes';
    notesRow.appendChild(notesLabel);
    var notesInput = document.createElement('textarea');
    notesInput.className = P + '-modal-input';
    notesInput.rows = 2;
    notesInput.placeholder = 'Optional notes about changes…';
    notesRow.appendChild(notesInput);
    body.appendChild(notesRow);
    modal.appendChild(body);

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
              var lbl2 = container.querySelector('label[for="' + cbs[si].id + '"]');
              selLabels.push(lbl2 ? lbl2.textContent : cbs[si].value);
            }
          }
          var origIds = (prefillIds[d.key] || []).slice().sort();
          var newIds = selIds.slice().sort();
          var changed = origIds.length !== newIds.length;
          if (!changed) for (var ci = 0; ci < origIds.length; ci++) { if (origIds[ci] !== newIds[ci]) { changed = true; break; } }
          if (changed) { modified[d.key] = selLabels.join(', '); modified[d.idsKey] = selIds; }
        } else {
          var v = (inputs[d.key].value || '').trim();
          var orig = prefill[d.key] != null ? String(prefill[d.key]).trim() : '';
          if (d.type === 'number') {
            var numV = v ? parseFloat(v) : 0, numOrig = orig ? parseFloat(orig) : 0;
            if (numV !== numOrig) modified[d.key] = numV;
          } else if (v !== orig) modified[d.key] = v;
        }
      }
      return modified;
    }

    var footer = document.createElement('div');
    footer.className = P + '-modal-footer';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = P + '-btn ' + P + '-btn--cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeEditModal);
    footer.appendChild(cancelBtn);

    var saveOnlyBtn = document.createElement('button');
    saveOnlyBtn.className = P + '-btn ' + P + '-btn--edit';
    saveOnlyBtn.textContent = 'Save';
    saveOnlyBtn.addEventListener('click', function () {
      var modified = collectModified();
      var notes = notesInput.value.trim();
      var updated = JSON.parse(JSON.stringify(data));
      if (!updated.requested) updated.requested = {};
      var mKeys = Object.keys(modified);
      for (var mi = 0; mi < mKeys.length; mi++) updated.requested[mKeys[mi]] = modified[mKeys[mi]];
      if (notes) updated.changeNotes = notes;

      var updatedJson = JSON.stringify(updated);
      var updatedHtml = buildRevisionHtml(updated);
      var putBody = {};
      putBody[CFG.changeJsonField] = updatedJson;
      putBody[CFG.changeHtmlField] = updatedHtml;
      if (CFG.revisionJsonField) putBody[CFG.revisionJsonField] = updatedJson;
      if (CFG.revisionHtmlField) putBody[CFG.revisionHtmlField] = updatedHtml;

      saveOnlyBtn.disabled = true;
      saveOnlyBtn.textContent = 'Saving…';
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(CFG.revisionView, revisionId),
        type: 'PUT',
        data: JSON.stringify(putBody),
        success: function () {
          if (jsonRef) jsonRef.data = updated;
          if (wrapEl) {
            var itemDiv = wrapEl.parentElement;
            var htmlCard = itemDiv ? itemDiv.querySelector('.' + P + '-html-card') : null;
            if (htmlCard) { htmlCard.innerHTML = updatedHtml; postProcessHtmlCard(htmlCard); }
          }
          closeEditModal();
        },
        error: function (xhr) {
          console.error('[ws-v2-rev] save failed', revisionId, xhr.status);
          saveOnlyBtn.disabled = false;
          saveOnlyBtn.textContent = 'Save';
        }
      });
    });
    footer.appendChild(saveOnlyBtn);

    var approveBtn = document.createElement('button');
    approveBtn.className = P + '-btn ' + P + '-btn--approve';
    approveBtn.textContent = 'Approve with Changes';
    approveBtn.addEventListener('click', function () {
      var modified = collectModified();
      var notes = notesInput.value.trim();
      closeEditModal();
      submitRevisionAction(revisionId, 'approve_with_changes', '', wrapEl,
        { outcome: 'accepted with changes', modified: modified, notes: notes });
    });
    footer.appendChild(approveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ── ACTION BUTTONS ───────────────────────────────────────
  function buildActionButtons(revisionId, changeJson) {
    var jsonRef = { data: changeJson };
    var wrap = document.createElement('div');
    var actions = document.createElement('div');
    actions.className = P + '-actions';

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = P + '-btn ' + P + '-btn--edit';
    editBtn.textContent = 'Edit';

    var rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = P + '-btn ' + P + '-btn--reject';
    rejectBtn.textContent = 'Reject';

    var approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = P + '-btn ' + P + '-btn--approve';
    approveBtn.textContent = 'Approve';

    // Button order: destructive/negative first, primary last (Edit | Reject | Approve)
    actions.appendChild(editBtn);
    actions.appendChild(rejectBtn);
    actions.appendChild(approveBtn);
    wrap.appendChild(actions);

    var rejectWrap = document.createElement('div');
    rejectWrap.className = P + '-reject-wrap';
    var input = document.createElement('textarea');
    input.className = P + '-reject-input';
    input.placeholder = 'Reason for rejection (required)…';
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

    approveBtn.addEventListener('click', function () {
      approveBtn.disabled = editBtn.disabled = rejectBtn.disabled = true;
      submitRevisionAction(revisionId, 'approve', '', wrap, { outcome: 'accepted' });
    });
    editBtn.addEventListener('click', function () {
      openEditModal(revisionId, jsonRef.data, wrap, jsonRef);
    });
    rejectBtn.addEventListener('click', function () {
      rejectWrap.classList.toggle('is-open');
      if (rejectWrap.classList.contains('is-open')) input.focus();
    });
    confirmBtn.addEventListener('click', function () {
      var reason = input.value.trim();
      if (!reason) { errorMsg.textContent = 'A reason is required to reject.'; input.focus(); return; }
      errorMsg.textContent = '';
      approveBtn.disabled = editBtn.disabled = rejectBtn.disabled = confirmBtn.disabled = true;
      submitRevisionAction(revisionId, 'reject', reason, wrap, { outcome: 'rejected' });
    });

    return wrap;
  }

  function buildRevisionItem(rev) {
    var json = rev.changeJson;
    if (json && typeof json === 'string') { try { json = JSON.parse(json); } catch (e) { json = null; } }
    var cr = json ? JSON.parse(JSON.stringify(json)) : {};
    var surveyId = rev.surveyItemId || cr.bidRecordId || cr.rowId || '';
    var item = {
      action:             cr.action || 'revise',
      revisionLineItemId: rev.id,
      parentRequestId:    rev.parentRequestId || '',
      surveyItemId:       surveyId,
      rowId:              cr.rowId || surveyId,
      bidRecordId:        cr.bidRecordId || surveyId,
      sowItemId:          cr.sowItemId || '',
      displayLabel:       cr.displayLabel || '',
      productName:        cr.productName || '',
      changeNotes:        cr.changeNotes || '',
      proposalBucketId:   cr.proposalBucketId || ''
    };
    if (cr.current)   item.current   = cr.current;
    if (cr.requested) item.requested = cr.requested;
    if (cr.fields)    item.fields    = cr.fields;
    if (rev.changeHtml) item.html = rev.changeHtml;
    return item;
  }

  function submitRevisionAction(revisionId, action, reason, wrapEl, extra) {
    extra = extra || {};
    var result = buildRevisionMap();
    var revEntry = null, all = [];
    Object.keys(result.map).forEach(function (k) { result.map[k].forEach(function (e) { all.push(e); }); });
    result.orphaned.forEach(function (e) { all.push(e); });
    for (var ei = 0; ei < all.length; ei++) { if (all[ei].id === revisionId) { revEntry = all[ei]; break; } }
    var item = revEntry ? buildRevisionItem(revEntry) : { revisionLineItemId: revisionId };

    var payload = {
      actionType: 'revision_response',
      action: action,
      outcome: extra.outcome || action,
      timestamp: new Date().toISOString(),
      totalItems: 1,
      revisionRequests: [{ revisionRequestId: (revEntry && revEntry.parentRequestId) || '', items: [item] }]
    };
    if (reason) payload.reason = reason;
    if (extra.modified) payload.modified = extra.modified;
    if (extra.notes) payload.notes = extra.notes;
    try { var u = Knack.getUserAttributes(); if (u) payload.user = { id: u.id || '', name: u.name || '', email: u.email || '' }; } catch (e) {}

    var webhookUrl = (window.SCW && window.SCW.bidReview && window.SCW.bidReview.CONFIG)
      ? window.SCW.bidReview.CONFIG.revisionResponseWebhook : '';
    if (!webhookUrl) { console.error('[ws-v2-rev] no webhook URL configured'); return; }

    wrapEl.innerHTML = '';
    var spinner = document.createElement('div');
    spinner.className = P + '-status';
    spinner.textContent = '⏳ Processing…';
    wrapEl.appendChild(spinner);

    var directStatus = {};
    directStatus[CFG.fields.status.key] = extra.outcome === 'rejected' ? 'Rejected' : 'Accepted';
    SCW.knackAjax({ url: SCW.knackRecordUrl(CFG.revisionView, revisionId), type: 'PUT',
      data: JSON.stringify(directStatus), success: function () {}, error: function () {} });

    SCW.knackAjax({
      url: webhookUrl, type: 'POST', data: JSON.stringify(payload), timeout: 90000,
      success: function (resp) {
        var badge = document.createElement('div');
        badge.className = P + '-status';
        if (extra.outcome === 'rejected') {
          badge.style.background = '#fee2e2'; badge.style.color = '#991b1b';
          badge.textContent = '✗ Rejected' + (reason ? ': ' + reason : '');
        } else if (extra.outcome === 'accepted with changes') {
          badge.style.background = '#dbeafe'; badge.style.color = '#1e40af';
          badge.textContent = '✓ Accepted with changes';
        } else {
          badge.style.background = '#dcfce7'; badge.style.color = '#166534';
          badge.textContent = '✓ Accepted';
        }
        wrapEl.innerHTML = '';
        wrapEl.appendChild(badge);

        if (typeof resp === 'string') { try { resp = JSON.parse(resp); } catch (e) {} }
        if (resp && resp.success) {
          setTimeout(function () {
            var fired = false;
            var onceNs = '.scwWsV2RevRefresh';
            function refreshAll() {
              if (Knack.views[CFG.targetView] && Knack.views[CFG.targetView].model) Knack.views[CFG.targetView].model.fetch();
              setTimeout(function () { inject(); }, 1500);
            }
            $(document).off('knack-view-render.' + CFG.revisionView + onceNs)
              .on('knack-view-render.' + CFG.revisionView + onceNs, function () {
                if (fired) return; fired = true;
                $(document).off('knack-view-render.' + CFG.revisionView + onceNs);
                setTimeout(refreshAll, 300);
              });
            setTimeout(function () {
              if (!fired) { fired = true; $(document).off('knack-view-render.' + CFG.revisionView + onceNs); refreshAll(); }
            }, 5000);
            if (Knack.views[CFG.revisionView] && Knack.views[CFG.revisionView].model) Knack.views[CFG.revisionView].model.fetch();
          }, 3000);
        }
      },
      error: function (xhr) {
        console.error('[ws-v2-rev]', action, 'failed', revisionId, xhr.status);
        wrapEl.innerHTML = '';
        var errBadge = document.createElement('div');
        errBadge.className = P + '-status';
        errBadge.style.background = '#fee2e2'; errBadge.style.color = '#991b1b';
        errBadge.textContent = 'Failed to submit — please reload and try again.';
        wrapEl.appendChild(errBadge);
      }
    });
  }

  // ── STRIP + ORPHAN + BADGE ───────────────────────────────
  var WARN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  function actionOf(revisions) {
    if (revisions.length) {
      var json = revisions[0].changeJson;
      if (json && typeof json === 'string') { try { json = JSON.parse(json); } catch (e) { json = null; } }
      if (json && json.action) return json.action;
    }
    return 'revise';
  }

  function makeBadge(revisions) {
    var action = actionOf(revisions);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = BADGE_CLS + ' ' + BADGE_CLS + '--' + action;
    btn.innerHTML = WARN_SVG + '<span>' + revisions.length + '</span>';
    btn.title = revisions.length + ' pending revision' + (revisions.length !== 1 ? 's' : '') + ' — click to expand';
    return btn;
  }

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
        var htmlWrap = document.createElement('div');
        htmlWrap.className = P + '-html-card';
        htmlWrap.innerHTML = rev.changeHtml;
        postProcessHtmlCard(htmlWrap);
        item.appendChild(htmlWrap);
      } else {
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
      item.appendChild(buildActionButtons(rev.id, rev.changeJson));
      strip.appendChild(item);
    }
    return strip;
  }

  function makeOrphanCard(rev) {
    var card = document.createElement('div');
    card.className = P + '-orphan-card';
    if (rev.id) card.setAttribute('data-rev-id', rev.id);
    if (rev.changeHtml) {
      var htmlWrap = document.createElement('div');
      htmlWrap.className = P + '-html-card';
      htmlWrap.innerHTML = rev.changeHtml;
      postProcessHtmlCard(htmlWrap);
      card.appendChild(htmlWrap);
    } else {
      var json = rev.changeJson || {};
      var head = document.createElement('div');
      head.className = P + '-orphan-title';
      head.textContent = json.displayLabel || json.productName || 'Add request';
      card.appendChild(head);
    }
    card.appendChild(buildActionButtons(rev.id, rev.changeJson));
    return card;
  }

  function renderOrphanSection(container, orphans) {
    if (!orphans.length) return;
    var section = document.createElement('div');
    section.className = ORPHAN_SEC;
    var header = document.createElement('div');
    header.className = P + '-orphan-header';
    header.textContent = 'Add Requests (' + orphans.length + ')';
    section.appendChild(header);
    for (var i = 0; i < orphans.length; i++) section.appendChild(makeOrphanCard(orphans[i]));
    var body = container.querySelector('.scw-ws-v2-body') || container;
    if (body.firstChild) body.insertBefore(section, body.firstChild);
    else body.appendChild(section);
  }

  // ── INJECTION ────────────────────────────────────────────
  function findCard(container, recordId) {
    return container.querySelector('.scw-ws-v2-card[data-scw-ws-v2-record="' + recordId + '"]');
  }

  function cleanup(container) {
    var sel = '.' + STRIP_CLS + ', .' + BADGE_CLS + ', .' + ORPHAN_SEC;
    var nodes = container.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
    var flagged = container.querySelectorAll('[' + INJECTED + ']');
    for (var f = 0; f < flagged.length; f++) {
      flagged[f].removeAttribute(INJECTED);
      flagged[f].classList.remove('scw-ws-v2-card--has-rev');
    }
  }

  var _retries = 0;
  var _observer = null;
  var _debTimer = null;

  function inject() {
    var container = document.getElementById(CFG.containerId);
    if (!container) return;   // gate: V2 survey worksheet not mounted (non-internal user)

    // Disconnect while we mutate so our own DOM writes don't re-trigger the
    // observer (its callbacks fire async, so a flag reset synchronously here
    // would already be cleared by the time they run → infinite loop).
    stopObserving();
    cleanup(container);

    var result = buildRevisionMap();
    var revMap = result.map;
    var orphaned = result.orphaned.slice();
    var siIds = Object.keys(revMap);
    if (!siIds.length && !orphaned.length) { startObserving(); return; }

    var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    if (!cards.length && siIds.length) {
      // V2 hasn't rendered its cards yet — retry briefly.
      _retries++;
      if (_retries < 12) setTimeout(inject, 500);
      renderOrphanSection(container, orphaned);
      startObserving();
      return;
    }
    _retries = 0;

    for (var i = 0; i < siIds.length; i++) {
      var siId = siIds[i];
      var card = findCard(container, siId);
      if (!card) { revMap[siId].forEach(function (e) { orphaned.push(e); }); continue; }
      card.setAttribute(INJECTED, '1');
      card.classList.add('scw-ws-v2-card--has-rev');
      var revisions = revMap[siId];

      // Badge → into the row's warn slot (append; keep any existing warning chips).
      var warnSlot = card.querySelector('.scw-ws-v2-cell--warn');
      if (warnSlot && !warnSlot.querySelector('.' + BADGE_CLS)) {
        var badge = makeBadge(revisions);
        badge.addEventListener('click', (function (cardEl) {
          return function (e) {
            e.stopPropagation();
            var chevron = cardEl.querySelector('[data-scw-ws-v2-expand]');
            if (chevron) chevron.click();
          };
        })(card));
        warnSlot.appendChild(badge);
      }

      // Strip → into the detail panel (visible when the card is expanded).
      var detail = card.querySelector('.scw-ws-v2-detail');
      if (detail) detail.appendChild(makeStrip(revisions));
    }

    renderOrphanSection(container, orphaned);
    startObserving();
  }

  function scheduleInject() {
    if (_debTimer) clearTimeout(_debTimer);
    _debTimer = setTimeout(function () { _debTimer = null; inject(); }, 250);
  }

  function startObserving() {
    if (!_observer) return;
    var container = document.getElementById(CFG.containerId);
    if (!container) return;
    var body = container.querySelector('.scw-ws-v2-body') || container;
    _observer.observe(body, { childList: true, subtree: true });
  }
  function stopObserving() { if (_observer) _observer.disconnect(); }

  function ensureObserver() {
    if (_observer) { startObserving(); return; }
    if (!document.getElementById(CFG.containerId)) return;
    _observer = new MutationObserver(function () { scheduleInject(); });
    startObserving();
  }

  // ── CSS ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '#' + CFG.revisionView + ' { display: none !important; }',
      '.scw-ws-v2-card--has-rev { box-shadow: inset 3px 0 0 #f59e0b !important; }',
      '.' + BADGE_CLS + ' {',
      '  display: inline-flex; align-items: center; gap: 3px;',
      '  padding: 1px 7px; border-radius: 10px; border: 0; cursor: pointer;',
      '  background: #fef3c7; color: #92400e; font: 600 11px system-ui, sans-serif;',
      '}',
      '.' + BADGE_CLS + '--add    { background: #dcfce7; color: #166534; }',
      '.' + BADGE_CLS + '--remove { background: #fee2e2; color: #991b1b; }',
      '.' + BADGE_CLS + ':hover { filter: brightness(0.96); }',
      '.' + STRIP_CLS + ' {',
      '  margin: 8px 0 4px; padding: 10px 12px;',
      '  background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px;',
      '  font-size: 12px; color: #78350f;',
      '}',
      '.' + P + '-strip-header {',
      '  font: 700 11px system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: 0.04em; color: #92400e; margin-bottom: 6px;',
      '}',
      '.' + P + '-item { padding: 6px 0; border-top: 1px solid #fde68a; }',
      '.' + P + '-item:first-of-type { border-top: 0; }',
      '.' + P + '-html-card { margin-bottom: 6px; }',
      '.' + P + '-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }',
      '.' + P + '-tag { background: #fff; border: 1px solid #fde68a; border-radius: 4px; padding: 2px 6px; }',
      '.' + P + '-tag-label { font-weight: 700; color: #92400e; }',
      '.' + P + '-actions { display: flex; gap: 6px; justify-content: flex-end; }',
      '.' + P + '-btn {',
      '  appearance: none; cursor: pointer; border: 1px solid transparent;',
      '  padding: 5px 12px; border-radius: 5px; font: 600 12px system-ui, sans-serif;',
      '}',
      '.' + P + '-btn[disabled] { opacity: 0.6; cursor: not-allowed; }',
      '.' + P + '-btn--approve { background: #16a34a; color: #fff; }',
      '.' + P + '-btn--approve:hover:not([disabled]) { background: #15803d; }',
      '.' + P + '-btn--edit { background: #fff; color: #1e40af; border-color: #bfdbfe; }',
      '.' + P + '-btn--edit:hover:not([disabled]) { background: #eff6ff; }',
      '.' + P + '-btn--reject { background: #fff; color: #b91c1c; border-color: #fecaca; }',
      '.' + P + '-btn--reject:hover:not([disabled]) { background: #fef2f2; }',
      '.' + P + '-btn--cancel { background: #fff; color: #1f2937; border-color: #d1d5db; }',
      '.' + P + '-reject-wrap { display: none; margin-top: 6px; }',
      '.' + P + '-reject-wrap.is-open { display: block; }',
      '.' + P + '-reject-input {',
      '  width: 100%; box-sizing: border-box; border: 1px solid #fca5a5; border-radius: 5px;',
      '  padding: 6px 8px; font: 13px system-ui, sans-serif; resize: vertical;',
      '}',
      '.' + P + '-reject-error { color: #b91c1c; font-size: 11px; margin: 2px 0; }',
      '.' + P + '-reject-confirm {',
      '  margin-top: 4px; background: #dc2626; color: #fff; border: 0; cursor: pointer;',
      '  padding: 5px 12px; border-radius: 5px; font: 600 12px system-ui, sans-serif;',
      '}',
      '.' + P + '-status {',
      '  padding: 4px 10px; border-radius: 4px; font: 600 12px system-ui, sans-serif;',
      '  display: inline-block; margin-top: 6px; background: #f1f5f9; color: #475569;',
      '}',
      /* Orphan ADD section */
      '.' + ORPHAN_SEC + ' {',
      '  margin: 0 0 12px; padding: 10px 12px; background: #f0fdf4;',
      '  border: 1px solid #bbf7d0; border-radius: 8px;',
      '}',
      '.' + P + '-orphan-header { font: 700 12px system-ui, sans-serif; color: #166534; margin-bottom: 8px; }',
      '.' + P + '-orphan-card { background: #fff; border: 1px solid #d1fae5; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }',
      '.' + P + '-orphan-card:last-child { margin-bottom: 0; }',
      '.' + P + '-orphan-title { font-weight: 600; margin-bottom: 6px; color: #166534; }',
      /* Edit modal */
      '.' + P + '-modal-overlay {',
      '  position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 100000;',
      '  display: flex; align-items: center; justify-content: center;',
      '}',
      '.' + P + '-modal {',
      '  background: #fff; border-radius: 10px; width: 92%; max-width: 520px;',
      '  max-height: 86vh; display: flex; flex-direction: column; overflow: hidden;',
      '  box-shadow: 0 18px 50px rgba(0,0,0,0.35);',
      '}',
      '.' + P + '-modal-header {',
      '  display: flex; align-items: center; gap: 12px; padding: 14px 18px;',
      '  border-bottom: 1px solid #e5e7eb;',
      '}',
      '.' + P + '-modal-title { font: 700 15px system-ui, sans-serif; color: #07467c; flex: 1 1 auto; }',
      '.' + P + '-modal-close { border: 0; background: transparent; font: 700 22px/1 system-ui; color: #64748b; cursor: pointer; }',
      '.' + P + '-modal-body { padding: 14px 18px; overflow: auto; flex: 1 1 auto; }',
      '.' + P + '-modal-field { margin-bottom: 12px; }',
      '.' + P + '-modal-label { display: block; font: 600 12px system-ui, sans-serif; color: #475569; margin-bottom: 4px; }',
      '.' + P + '-modal-input, .' + P + '-modal-select {',
      '  width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 5px;',
      '  padding: 7px 9px; font: 13px system-ui, sans-serif;',
      '}',
      '.' + P + '-conn-list { border: 1px solid #e2e8f0; border-radius: 6px; max-height: 180px; overflow: auto; padding: 4px 0; }',
      '.' + P + '-conn-item { display: flex; align-items: center; gap: 8px; padding: 4px 10px; }',
      '.' + P + '-conn-item label { font-size: 13px; cursor: pointer; }',
      '.' + P + '-conn-empty { display: block; padding: 8px 10px; color: #94a3b8; font-style: italic; }',
      '.' + P + '-modal-footer { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid #e5e7eb; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── BOOT ─────────────────────────────────────────────────
  function boot() {
    injectStyles();
    ensureObserver();
    scheduleInject();
  }

  $(document).off('knack-view-render.' + CFG.revisionView + '.scwWsV2Rev')
    .on('knack-view-render.' + CFG.revisionView + '.scwWsV2Rev', boot);
  $(document).off('knack-view-render.' + CFG.targetView + '.scwWsV2Rev')
    .on('knack-view-render.' + CFG.targetView + '.scwWsV2Rev', boot);
  $(document).off('knack-cell-update.' + CFG.targetView + '.scwWsV2Rev')
    .on('knack-cell-update.' + CFG.targetView + '.scwWsV2Rev', function () { setTimeout(boot, 400); });
  $(document).off('knack-scene-render.any.scwWsV2Rev')
    .on('knack-scene-render.any.scwWsV2Rev', function () {
      _observer = null; _retries = 0;
      setTimeout(boot, 300);
    });

  ns.changeRequests = { inject: inject, boot: boot };
})();
/*** END WORKSHEET V2 — CHANGE REQUESTS **************************************/
