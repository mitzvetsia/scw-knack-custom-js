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
  var REJECT_MODAL_ID = P + '-reject-overlay';

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

    // stopPropagation on every action click: these buttons live inside the
    // revision strip nested in a worksheet card, and a bubbling click can be
    // re-handled by the card/banner toggle.
    approveBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      approveBtn.disabled = editBtn.disabled = rejectBtn.disabled = true;
      submitRevisionAction(revisionId, 'approve', '', wrap, { outcome: 'accepted' });
    });
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openEditModal(revisionId, jsonRef.data, wrap, jsonRef);
    });
    // Reject reason is captured in a body-level modal, NOT an inline panel:
    // inject()/cleanup() rebuild the revision strip on every observer tick /
    // view re-render, which wiped an inline panel mid-interaction ("flash then
    // nothing"). A body-level modal survives container rebuilds.
    rejectBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openRejectModal(revisionId, wrap);
    });

    return wrap;
  }

  function closeRejectModal() {
    var el = document.getElementById(REJECT_MODAL_ID);
    if (el) el.remove();
  }

  function openRejectModal(revisionId, wrapEl) {
    closeRejectModal();

    var overlay = document.createElement('div');
    overlay.id = REJECT_MODAL_ID;
    overlay.className = P + '-modal-overlay';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeRejectModal(); });

    var modal = document.createElement('div');
    modal.className = P + '-modal';
    modal.style.maxWidth = '440px';

    var header = document.createElement('div');
    header.className = P + '-modal-header';
    var title = document.createElement('div');
    title.className = P + '-modal-title';
    title.textContent = 'Reject Change Request';
    header.appendChild(title);
    var closeBtn = document.createElement('button');
    closeBtn.className = P + '-modal-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closeRejectModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = document.createElement('div');
    body.className = P + '-modal-body';
    var ta = document.createElement('textarea');
    ta.className = P + '-reject-input';
    ta.placeholder = 'Reason for rejection (required)…';
    ta.rows = 4;
    body.appendChild(ta);
    var errorMsg = document.createElement('div');
    errorMsg.className = P + '-reject-error';
    body.appendChild(errorMsg);
    modal.appendChild(body);

    var footer = document.createElement('div');
    footer.className = P + '-modal-footer';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = P + '-btn ' + P + '-btn--cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeRejectModal);
    var confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = P + '-btn ' + P + '-btn--reject';
    confirmBtn.textContent = 'Confirm Rejection';
    confirmBtn.addEventListener('click', function () {
      var reason = ta.value.trim();
      if (!reason) { errorMsg.textContent = 'A reason is required to reject.'; ta.focus(); return; }
      confirmBtn.disabled = cancelBtn.disabled = true;
      closeRejectModal();
      submitRevisionAction(revisionId, 'reject', reason, wrapEl, { outcome: 'rejected' });
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 50);
  }

  function buildRevisionItem(rev) {
    var json = rev.changeJson;
    if (json && typeof json === 'string') { try { json = JSON.parse(json); } catch (e) { json = null; } }
    var cr = json ? JSON.parse(JSON.stringify(json)) : {};
    var action = cr.action || 'revise';
    var surveyId = rev.surveyItemId || cr.bidRecordId || cr.rowId || '';
    // The bid record id is the view_3680 record Make re-links on a reinstate.
    // For reinstate it must come STRICTLY from cr.bidRecordId — never fall back
    // to surveyId (a SOW line-item id), or Make receives a SOW id where it
    // expects a bid id and the reinstate can't resolve the record. For other
    // actions the surveyId fallback is harmless (revise/remove key off it).
    var bidRecordId = (action === 'reinstate')
      ? (cr.bidRecordId || '')
      : (cr.bidRecordId || surveyId);
    var item = {
      action:             action,
      revisionLineItemId: rev.id,
      parentRequestId:    rev.parentRequestId || '',
      surveyItemId:       surveyId,
      rowId:              cr.rowId || surveyId,
      bidRecordId:        bidRecordId,
      sowItemId:          cr.sowItemId || '',
      // Bid package the CR targeted — Make re-links the reinstated bid record
      // onto it. Stored per-item in the change JSON at submit time.
      packageId:          cr.packageId || '',
      packageName:        cr.packageName || '',
      displayLabel:       cr.displayLabel || '',
      productName:        cr.productName || '',
      changeNotes:        cr.changeNotes || '',
      proposalBucketId:   cr.proposalBucketId || ''
    };
    if (cr.reinstate) item.reinstate = true;
    if (cr.current)   item.current   = cr.current;
    if (cr.requested) item.requested = cr.requested;
    if (cr.fields)    item.fields    = cr.fields;
    if (rev.changeHtml) item.html = rev.changeHtml;
    return item;
  }

  // ── Global feedback toast + in-flight guard ──────────────
  // Accept/Reject fire a webhook + several PUTs; without prominent feedback
  // the small in-card spinner is easy to miss, so users mash the buttons and
  // it feels like the page froze. A fixed toast + a one-at-a-time guard fix it.
  var _busy = false;
  function showToast(msg, kind) {
    var t = document.getElementById(P + '-toast');
    if (!t) { t = document.createElement('div'); t.id = P + '-toast'; document.body.appendChild(t); }
    t.className = P + '-toast is-show' + (kind ? ' ' + P + '-toast--' + kind : '');
    t.innerHTML = (kind === 'work' ? '<span class="' + P + '-toast-spin"></span>' : '') +
      '<span>' + escHtml(msg) + '</span>';
    return t;
  }
  function hideToast(delay) {
    var t = document.getElementById(P + '-toast');
    if (!t) return;
    setTimeout(function () { if (t) t.classList.remove('is-show'); }, delay || 0);
  }

  function submitRevisionAction(revisionId, action, reason, wrapEl, extra) {
    extra = extra || {};
    // Guard against button-mashing / overlapping submits — one webhook at a
    // time (the success path refetches + re-injects, which would clobber a
    // second in-flight submit anyway).
    if (_busy) { showToast('A change request is already being submitted…', 'work'); return; }
    _busy = true;
    var outcomeLabel = extra.outcome === 'rejected' ? 'Rejecting' :
      extra.outcome === 'accepted with changes' ? 'Approving (with changes)' : 'Approving';
    showToast(outcomeLabel + ' change request…', 'work');
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
    if (!webhookUrl) { console.error('[ws-v2-rev] no webhook URL configured'); _busy = false; hideToast(); showToast('Cannot submit — no webhook configured.', 'err'); hideToast(4000); return; }

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

        _busy = false;
        var okMsg = extra.outcome === 'rejected' ? 'Change request rejected ✓'
          : extra.outcome === 'accepted with changes' ? 'Approved with changes ✓'
          : 'Change request approved ✓';
        showToast(okMsg, 'ok');
        hideToast(3000);

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
        _busy = false;
        showToast('Submit failed — please reload and try again.', 'err');
        hideToast(5000);
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

  /** Prominent "change request pending" banner across the top of a card. */
  function makeBanner(revisions, actionOverride, textOverride) {
    var action = actionOverride || actionOf(revisions || []);
    var n = revisions ? revisions.length : 0;
    var banner = document.createElement('div');
    banner.className = P + '-banner ' + P + '-banner--' + action;
    var text = textOverride ||
      ('Change request pending' + (n > 1 ? ' (' + n + ')' : ''));
    banner.innerHTML = '<span class="' + P + '-banner-ic">' + WARN_SVG + '</span>' +
      '<span class="' + P + '-banner-text">' + escHtml(text) + '</span>';
    return banner;
  }

  function roCell(text, colCls) {
    return '<div class="scw-ws-v2-cell ' + colCls + ' scw-ws-v2-cell--ro"><span>' +
      escHtml(text == null ? '' : text) + '</span></div>';
  }

  // An ADD/orphan change request rendered as a real line-item card: same
  // survey card chrome + 11-column row so it aligns with the device rows,
  // a "change request" banner, the extra cabling/connection fields as chips,
  // and the Edit / Reject / Approve buttons.
  function makeOrphanCard(rev) {
    var json = rev.changeJson || {};
    var r = json.requested || json;
    function get(k) { return (r[k] != null && r[k] !== '') ? r[k] : (json[k] != null ? json[k] : ''); }
    var action = json.action || 'add';
    var actionLabel = action === 'remove' ? 'REMOVE' : action === 'revise' ? 'REVISE' : 'ADD';

    var card = document.createElement('div');
    card.className = 'scw-ws-v2-card scw-ws-v2-card--survey ' +
      P + '-orphan-card ' + P + '-orphan-card--' + action;
    if (rev.id) card.setAttribute('data-rev-id', rev.id);

    card.appendChild(makeBanner(null, action,
      actionLabel + ' — change request' +
      (json.displayLabel ? ' · ' + json.displayLabel : '')));

    // Line-item row (matches the survey grid columns so it lines up with the
    // real device rows above/below).
    var rate = get('rate');
    var rateStr = (rate !== '' && rate != null) ? fmtCurrencyHtml(rate) : '';
    var row = document.createElement('div');
    row.className = 'scw-ws-v2-row scw-ws-v2-row--default';
    row.innerHTML =
      '<div class="scw-ws-v2-cell scw-ws-v2-chevron" style="visibility:hidden"></div>' +
      roCell(json.displayLabel || '', 'scw-ws-v2-cell--label') +
      roCell(get('productName'), 'scw-ws-v2-cell--product') +
      roCell(json.changeNotes || '', 'scw-ws-v2-cell--survey-notes') +
      roCell(get('laborDesc'), 'scw-ws-v2-cell--labor-desc') +
      roCell(get('qty'), 'scw-ws-v2-cell--num') +
      roCell(rateStr, 'scw-ws-v2-cell--num scw-ws-v2-cell--survey-labor') +
      roCell('', 'scw-ws-v2-cell--survey-ext') +
      roCell('', 'scw-ws-v2-cell--survey-bid') +
      '<div class="scw-ws-v2-cell scw-ws-v2-cell--warn"></div>' +
      '<div class="scw-ws-v2-cell"></div>';
    card.appendChild(row);

    // Extra cabling / connection fields as compact chips (skip empty / "No").
    var extras = [];
    function pushX(lbl, k) {
      var v = get(k);
      if (v !== '' && v != null && !/^no$/i.test(String(v))) extras.push(lbl + ': ' + v);
    }
    pushX('Existing Cabling', 'bidExistCabling');
    pushX('Plenum', 'bidPlenum');
    pushX('Exterior', 'bidExterior');
    pushX('Drop Length', 'bidDropLength');
    pushX('Conduit', 'bidConduit');
    pushX('Connected Devices', 'bidConnDevice');
    pushX('Connected To', 'bidConnTo');
    pushX('MDF/IDF', 'bidMdfIdf');
    if (extras.length) {
      var ex = document.createElement('div');
      ex.className = P + '-orphan-extras';
      ex.innerHTML = extras.map(function (e) {
        return '<span class="' + P + '-orphan-chip">' + escHtml(e) + '</span>';
      }).join('');
      card.appendChild(ex);
    }

    card.appendChild(buildActionButtons(rev.id, rev.changeJson));
    return card;
  }


  // ── ORPHAN (ADD) PLACEMENT ───────────────────────────────
  // Read the orphan's MDF/IDF id + label + sort order from its JSON, so it
  // can drop into the matching L1 (MDF/IDF) group like a real device row.
  function revMdfId(rev) {
    var j = rev.changeJson;
    if (!j) return '';
    var ids = j.bidMdfIdfIds || (j.requested && j.requested.bidMdfIdfIds) || (j.current && j.current.bidMdfIdfIds);
    if (Array.isArray(ids) && ids.length && ids[0]) return ids[0];
    return '';
  }
  function revMdfLabel(rev) {
    var j = rev.changeJson;
    if (!j) return '';
    if (j.bidMdfIdf) return String(j.bidMdfIdf);
    if (j.requested && j.requested.bidMdfIdf) return String(j.requested.bidMdfIdf);
    if (j.current && j.current.bidMdfIdf) return String(j.current.bidMdfIdf);
    return '';
  }
  function revSortOrder(rev) {
    var j = rev.changeJson;
    if (j && j.sortOrder != null) return Number(j.sortOrder) || 0;
    return 0;
  }
  function normLabel(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  /** Find the L1 (MDF/IDF) group block for an orphan: by record id first
   *  (data-scw-ws-v2-l1), then by normalized label match. */
  function findL1Block(container, mdfId, mdfLabel) {
    if (mdfId) {
      var byId = container.querySelector('.scw-ws-v2-l1[data-scw-ws-v2-l1="' + mdfId + '"]');
      if (byId) return byId;
    }
    var target = normLabel(mdfLabel);
    if (!target) return null;
    var blocks = container.querySelectorAll('.scw-ws-v2-l1');
    for (var i = 0; i < blocks.length; i++) {
      var lblEl = blocks[i].querySelector('.scw-ws-v2-l1-label');
      var lbl = normLabel(lblEl ? lblEl.textContent : '');
      if (lbl && (lbl === target || lbl.indexOf(target) !== -1 || target.indexOf(lbl) !== -1)) return blocks[i];
    }
    return null;
  }

  /** Place ADD requests: each orphan that maps to an existing MDF/IDF group
   *  drops into that L1's body (sorted by sortOrder); the rest fall back to a
   *  top "Add Requests" section. Mirrors v1 renderOrphanSection. */
  function renderOrphans(container, orphans) {
    if (!orphans.length) return;
    orphans.sort(function (a, b) { return revSortOrder(a) - revSortOrder(b); });

    var ungrouped = [];
    for (var i = 0; i < orphans.length; i++) {
      var rev = orphans[i];
      var block = findL1Block(container, revMdfId(rev), revMdfLabel(rev));
      if (!block) { ungrouped.push(rev); continue; }
      var l1body = block.querySelector('.scw-ws-v2-l1-body');
      if (!l1body) { ungrouped.push(rev); continue; }
      var oCard = makeOrphanCard(rev);
      oCard.classList.add(P + '-orphan-card--grouped');
      // Insert before the first device card whose sort order exceeds ours;
      // else append. v2 cards don't expose field_2218, so we sort orphans
      // among themselves and place them at the top of the group body.
      var firstCard = l1body.querySelector('.scw-ws-v2-card, .' + P + '-orphan-card--grouped');
      // Keep already-placed grouped orphans before device cards, in order.
      var anchor = null;
      var existingOrphans = l1body.querySelectorAll('.' + P + '-orphan-card--grouped');
      if (existingOrphans.length) anchor = existingOrphans[existingOrphans.length - 1].nextSibling;
      else anchor = firstCard;
      if (anchor) l1body.insertBefore(oCard, anchor);
      else l1body.appendChild(oCard);
    }

    if (!ungrouped.length) return;
    var section = document.createElement('div');
    section.className = ORPHAN_SEC;
    var header = document.createElement('div');
    header.className = P + '-orphan-header';
    header.textContent = 'Add Requests (' + ungrouped.length + ')';
    section.appendChild(header);
    for (var u = 0; u < ungrouped.length; u++) section.appendChild(makeOrphanCard(ungrouped[u]));
    var body = container.querySelector('.scw-ws-v2-body') || container;
    if (body.firstChild) body.insertBefore(section, body.firstChild);
    else body.appendChild(section);
  }

  // ── SUMMARY PANEL (collapsible, top) — v1 revision-bar equivalent ────
  var BAR_CLS = P + '-bar';
  var _barOpen = false;

  /** Jump to a revision's card (matched survey item or orphan), expanding any
   *  collapsed L1 group + the card itself, then scroll it into view. Tries
   *  every record id the revision carries (surveyItemId, then the change
   *  JSON's rowId / bidRecordId / sowItemId — on this page bid records ARE
   *  survey line items, so any of them can be the card's record id). If the
   *  row is filtered OUT by the Bid pill strip (filtered rows aren't rendered
   *  at all), resets the filter to Show All and retries. */
  function navigateToRev(container, siId, revId, rev) {
    var ids = [];
    if (siId) ids.push(siId);
    var cr = (rev && rev.changeJson) || {};
    ['rowId', 'bidRecordId', 'sowItemId'].forEach(function (k) {
      if (cr[k] && ids.indexOf(cr[k]) === -1) ids.push(cr[k]);
    });
    function locate() {
      for (var i = 0; i < ids.length; i++) {
        var c = findCard(container, ids[i]);
        if (c) return c;
      }
      return revId ? container.querySelector('[data-rev-id="' + revId + '"]') : null;
    }
    var target = locate();
    if (!target && container.hasAttribute('data-scw-ws-v2-sow-filter')) {
      var allPill = container.querySelector('[data-scw-ws-v2-sow-pill="__all"]');
      if (allPill) { allPill.click(); target = locate(); }
    }
    if (!target) return;
    var l1 = target.closest ? target.closest('.scw-ws-v2-l1') : null;
    if (l1 && !l1.classList.contains('scw-ws-v2-l1--open')) {
      var l1Toggle = l1.querySelector('[data-scw-ws-v2-l1-toggle]');
      if (l1Toggle) l1Toggle.click();
    }
    if (target.classList.contains('scw-ws-v2-card') && !target.classList.contains('scw-ws-v2-card--open')) {
      var chev = target.querySelector('[data-scw-ws-v2-expand]');
      if (chev) chev.click();
    }
    setTimeout(function () {
      try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { target.scrollIntoView(); }
      target.classList.add(P + '-nav-flash');
      setTimeout(function () { target.classList.remove(P + '-nav-flash'); }, 1800);
    }, 80);
  }

  function buildRevisionItemFlat(rev) { return buildRevisionItem(rev); }

  /** Accept/Reject ALL — one webhook POST with every item grouped by parent
   *  request, plus a direct status PUT per record (mirrors v1 fireRevisionAction). */
  function fireBulkAction(action, revs, btn) {
    if (!revs.length) return;
    if (_busy) { showToast('A change request is already being submitted…', 'work'); return; }
    _busy = true;
    btn.disabled = true;
    btn.textContent = action === 'accept' ? 'Accepting…' : 'Rejecting…';
    showToast((action === 'accept' ? 'Approving' : 'Rejecting') + ' ' + revs.length +
      ' change request' + (revs.length === 1 ? '' : 's') + '…', 'work');

    var byParent = {};
    for (var i = 0; i < revs.length; i++) {
      var pid = revs[i].parentRequestId || '_unknown';
      if (!byParent[pid]) byParent[pid] = { revisionRequestId: revs[i].parentRequestId || '', items: [] };
      byParent[pid].items.push(buildRevisionItemFlat(revs[i]));
    }
    var revisionRequests = [];
    Object.keys(byParent).forEach(function (k) { revisionRequests.push(byParent[k]); });

    var payload = {
      actionType: 'revision_response', action: action,
      timestamp: new Date().toISOString(), totalItems: revs.length,
      revisionRequests: revisionRequests
    };
    try { var u = Knack.getUserAttributes(); if (u) payload.user = { id: u.id || '', name: u.name || '', email: u.email || '' }; } catch (e) {}

    var webhookUrl = (window.SCW && window.SCW.bidReview && window.SCW.bidReview.CONFIG)
      ? window.SCW.bidReview.CONFIG.revisionResponseWebhook : '';
    if (!webhookUrl) { console.error('[ws-v2-rev] no webhook URL configured'); btn.disabled = false; _busy = false; showToast('Cannot submit — no webhook configured.', 'err'); hideToast(4000); return; }

    var statusVal = action === 'accept' ? 'Accepted' : 'Rejected';
    var statusData = {}; statusData[CFG.fields.status.key] = statusVal;
    var done = 0, total = revs.length;

    function refreshAll() {
      _busy = false;
      btn.textContent = action === 'accept' ? 'Accepted ✓' : 'Rejected ✓';
      showToast(revs.length + ' change request' + (revs.length === 1 ? '' : 's') +
        ' ' + (action === 'accept' ? 'approved' : 'rejected') + ' ✓', 'ok');
      hideToast(3000);
      setTimeout(function () {
        if (Knack.views[CFG.revisionView] && Knack.views[CFG.revisionView].model) Knack.views[CFG.revisionView].model.fetch();
        if (Knack.views[CFG.targetView] && Knack.views[CFG.targetView].model) Knack.views[CFG.targetView].model.fetch();
        setTimeout(inject, 1500);
      }, 800);
    }
    function fireWebhook() {
      SCW.knackAjax({
        url: webhookUrl, type: 'POST', data: JSON.stringify(payload), timeout: 90000,
        success: function () { refreshAll(); },
        error:   function () { refreshAll(); }
      });
    }
    for (var si = 0; si < revs.length; si++) {
      (function (revId) {
        SCW.knackAjax({
          url: SCW.knackRecordUrl(CFG.revisionView, revId), type: 'PUT', data: JSON.stringify(statusData),
          success: function () { done++; if (done >= total) fireWebhook(); },
          error:   function () { done++; if (done >= total) fireWebhook(); }
        });
      })(revs[si].id);
    }
    if (!total) fireWebhook();
  }

  var _barSig = '';

  // Per-type section open/closed state — survives panel rebuilds while the
  // page is up (module-scoped, not persisted). All open by default.
  var _secOpen = { add: true, remove: true, revise: true };

  // The three change-request types the summary panel groups by. Anything
  // that isn't an explicit add/remove (revise, reinstate, …) buckets under
  // Revisions.
  var REV_TYPE_GROUPS = [
    { key: 'add',    label: 'Additions', noun: 'addition' },
    { key: 'remove', label: 'Removals',  noun: 'removal'  },
    { key: 'revise', label: 'Revisions', noun: 'revision' }
  ];
  function revTypeOf(rev) {
    var a = actionOf([rev]);
    return (a === 'add' || a === 'remove') ? a : 'revise';
  }

  function buildSummaryPanel(container, revMap, orphaned) {
    var all = [];
    Object.keys(revMap).forEach(function (k) { revMap[k].forEach(function (e) { all.push(e); }); });
    orphaned.forEach(function (e) { all.push(e); });

    var existing = container.querySelector('.' + BAR_CLS);
    if (!all.length) { if (existing) existing.remove(); _barSig = ''; return; }

    // Bucket by type once — drives the head chips, the grouped panel
    // sections, and the per-type Accept/Reject All buttons.
    var byType = { add: [], remove: [], revise: [] };
    for (var bi = 0; bi < all.length; bi++) byType[revTypeOf(all[bi])].push(all[bi]);

    // Rebuild only when the revision set changes — otherwise keep the live bar
    // (and its click handler) so frequent re-injects don't swallow clicks.
    var sig = all.map(function (r) { return r.id + ':' + actionOf([r]); }).sort().join('|');
    if (existing && sig === _barSig) return;
    if (existing) existing.remove();
    _barSig = sig;

    var bar = document.createElement('div');
    bar.className = BAR_CLS;

    var head = document.createElement('div');
    head.className = P + '-bar-head';
    var chev = document.createElement('span');
    chev.className = P + '-bar-chev' + (_barOpen ? ' is-open' : '');
    chev.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 2 8 6 4 10"></polyline></svg>';
    head.appendChild(chev);
    var count = document.createElement('span');
    count.className = P + '-bar-count';
    count.textContent = all.length;
    head.appendChild(count);
    var lbl = document.createElement('span');
    lbl.className = P + '-bar-title';
    lbl.textContent = ' pending change request' + (all.length === 1 ? '' : 's');
    head.appendChild(lbl);
    // Per-type count chips so the add/remove/revise mix is visible without
    // opening the panel.
    for (var chi = 0; chi < REV_TYPE_GROUPS.length; chi++) {
      var cg = REV_TYPE_GROUPS[chi];
      var cn = byType[cg.key].length;
      if (!cn) continue;
      var chip = document.createElement('span');
      chip.className = P + '-bar-chip ' + P + '-bar-chip--' + cg.key;
      chip.textContent = cn + ' ' + cg.noun + (cn === 1 ? '' : 's');
      head.appendChild(chip);
    }
    var spacer = document.createElement('span');
    spacer.style.flex = '1';
    head.appendChild(spacer);

    var rejectAll = document.createElement('button');
    rejectAll.type = 'button';
    rejectAll.className = P + '-bar-btn ' + P + '-bar-btn--reject';
    rejectAll.textContent = 'Reject All';
    rejectAll.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!window.confirm('Reject all ' + all.length + ' change request(s)?')) return;
      fireBulkAction('reject', all, rejectAll);
    });
    var acceptAll = document.createElement('button');
    acceptAll.type = 'button';
    acceptAll.className = P + '-bar-btn ' + P + '-bar-btn--accept';
    acceptAll.textContent = 'Accept All';
    acceptAll.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!window.confirm('Accept all ' + all.length + ' change request(s)?')) return;
      fireBulkAction('accept', all, acceptAll);
    });
    head.appendChild(rejectAll);
    head.appendChild(acceptAll);

    var panel = document.createElement('div');
    panel.className = P + '-bar-panel';
    panel.style.display = _barOpen ? 'block' : 'none';

    head.addEventListener('click', function () {
      _barOpen = !_barOpen;
      panel.style.display = _barOpen ? 'block' : 'none';
      chev.className = P + '-bar-chev' + (_barOpen ? ' is-open' : '');
    });

    function makeBarCard(rev) {
      var card = document.createElement('div');
      card.className = P + '-bar-card';
      card.title = 'Click to jump to this item in the worksheet';
      if (rev.changeHtml) {
        card.innerHTML = rev.changeHtml;
        postProcessHtmlCard(card);
      } else {
        var j = rev.changeJson || {};
        card.textContent = j.displayLabel || j.productName || 'Revision';
      }
      (function (siId, revId, revRef) {
        card.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('a,button,input,textarea,select')) return;
          navigateToRev(container, siId, revId, revRef);
        });
      })(rev.surveyItemId, rev.id, rev);
      return card;
    }

    // Per-type Accept/Reject All — same bulk path as the global buttons,
    // scoped to one type's revisions.
    function makeTypeBtn(action, grp, revs) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = P + '-bar-btn ' + P + '-bar-btn--' + action + ' ' + P + '-bar-btn--sm';
      b.textContent = (action === 'accept' ? 'Accept' : 'Reject') + ' All ' + grp.label;
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!window.confirm((action === 'accept' ? 'Accept' : 'Reject') + ' all ' +
            revs.length + ' ' + grp.noun + (revs.length === 1 ? '' : 's') + '?')) return;
        fireBulkAction(action, revs, b);
      });
      return b;
    }

    // Grouped sections: Additions / Removals / Revisions, each with its own
    // Accept All / Reject All pair (destructive first, primary last).
    for (var gi = 0; gi < REV_TYPE_GROUPS.length; gi++) {
      var grp = REV_TYPE_GROUPS[gi];
      var revsOfType = byType[grp.key];
      if (!revsOfType.length) continue;

      var sec = document.createElement('div');
      sec.className = P + '-bar-sec ' + P + '-bar-sec--' + grp.key;

      var secOpen = _secOpen[grp.key] !== false;

      var secHead = document.createElement('div');
      secHead.className = P + '-bar-sec-head';
      var secChev = document.createElement('span');
      secChev.className = P + '-bar-chev' + (secOpen ? ' is-open' : '');
      secChev.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 2 8 6 4 10"></polyline></svg>';
      secHead.appendChild(secChev);
      var secTitle = document.createElement('span');
      secTitle.className = P + '-bar-sec-title';
      secTitle.textContent = grp.label + ' (' + revsOfType.length + ')';
      secHead.appendChild(secTitle);
      var secSpacer = document.createElement('span');
      secSpacer.style.flex = '1';
      secHead.appendChild(secSpacer);
      secHead.appendChild(makeTypeBtn('reject', grp, revsOfType));
      secHead.appendChild(makeTypeBtn('accept', grp, revsOfType));
      sec.appendChild(secHead);

      var secBody = document.createElement('div');
      secBody.className = P + '-bar-sec-body';
      secBody.style.display = secOpen ? '' : 'none';
      for (var ri3 = 0; ri3 < revsOfType.length; ri3++) secBody.appendChild(makeBarCard(revsOfType[ri3]));
      sec.appendChild(secBody);

      // Collapsible per section — the Accept/Reject buttons stopPropagation,
      // so a head click anywhere else toggles.
      (function (key, bodyEl, chevEl) {
        secHead.addEventListener('click', function () {
          var open = _secOpen[key] === false;   // toggling: closed → open
          _secOpen[key] = open;
          bodyEl.style.display = open ? '' : 'none';
          chevEl.className = P + '-bar-chev' + (open ? ' is-open' : '');
        });
      })(grp.key, secBody, secChev);

      panel.appendChild(sec);
    }

    bar.appendChild(head);
    bar.appendChild(panel);
    var body = container.querySelector('.scw-ws-v2-body');
    if (body && body.parentNode) body.parentNode.insertBefore(bar, body);
    else container.insertBefore(bar, container.firstChild);
  }

  // ── INJECTION ────────────────────────────────────────────
  function findCard(container, recordId) {
    return container.querySelector('.scw-ws-v2-card[data-scw-ws-v2-record="' + recordId + '"]');
  }

  function cleanup(container) {
    // NOTE: the summary bar (.BAR_CLS) is intentionally NOT torn down here.
    // It lives outside .scw-ws-v2-body (so v2 rebuilds don't wipe it) and is
    // only rebuilt by buildSummaryPanel when the revision set actually changes
    // — tearing it down on every re-inject made it intermittently swallow the
    // open/close click while it was mid-rebuild.
    var sel = '.' + STRIP_CLS + ', .' + BADGE_CLS + ', .' + ORPHAN_SEC +
              ', .' + P + '-banner, .' + P + '-orphan-card--grouped';
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
    if (!siIds.length && !orphaned.length) { buildSummaryPanel(container, {}, []); startObserving(); return; }

    var cards = container.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    if (!cards.length && siIds.length) {
      // V2 hasn't rendered its cards yet — retry briefly.
      _retries++;
      if (_retries < 12) setTimeout(inject, 500);
      renderOrphans(container, orphaned);
      buildSummaryPanel(container, revMap, result.orphaned);
      startObserving();
      return;
    }
    _retries = 0;

    for (var i = 0; i < siIds.length; i++) {
      var siId = siIds[i];
      var card = findCard(container, siId);
      if (!card) {
        // No matching device card — treat as an ADD/orphan instead, and drop
        // it from revMap so the summary panel doesn't list it twice.
        revMap[siId].forEach(function (e) { orphaned.push(e); });
        delete revMap[siId];
        continue;
      }
      card.setAttribute(INJECTED, '1');
      card.classList.add('scw-ws-v2-card--has-rev');
      var revisions = revMap[siId];

      // Prominent banner across the TOP of the card so a line item with a
      // pending change request is unmistakable. Click → expand the card.
      // The toggle is wired via a DELEGATED document handler (wireBannerToggle)
      // rather than a per-banner listener: cleanup() removes + re-adds banners
      // on every inject, so a directly-bound listener intermittently lands on a
      // banner mid-rebuild and the click is swallowed ("only sometimes toggles").
      if (!card.querySelector('.' + P + '-banner')) {
        var banner = makeBanner(revisions);
        banner.style.cursor = 'pointer';
        card.insertBefore(banner, card.firstChild);
      }

      // Strip → into the detail panel (visible when the card is expanded).
      var detail = card.querySelector('.scw-ws-v2-detail');
      if (detail) detail.appendChild(makeStrip(revisions));
    }

    renderOrphans(container, orphaned);
    buildSummaryPanel(container, revMap, orphaned);
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
      // Orphan ADD/REVISE/REMOVE card — full line-item card chrome + action
      // stripe (it carries .scw-ws-v2-card too, so it lines up with real rows).
      '.' + P + '-orphan-card {',
      '  border-left: 4px solid #16a34a !important;',
      '  margin: 6px 0 !important; overflow: hidden !important;',
      '}',
      '.' + P + '-orphan-card--remove { border-left-color: #dc2626 !important; }',
      '.' + P + '-orphan-card--revise { border-left-color: #3b82f6 !important; }',
      '.' + P + '-orphan-card .' + P + '-actions { margin: 6px 10px 8px; }',
      // Extra cabling / connection fields as compact chips beneath the row.
      '.' + P + '-orphan-extras {',
      '  display: flex; flex-wrap: wrap; gap: 5px; padding: 2px 10px 6px 44px;',
      '}',
      '.' + P + '-orphan-chip {',
      '  background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 4px;',
      '  padding: 1px 7px; font: 500 11px system-ui, sans-serif; color: #475569;',
      '}',
      // "Change request pending" banner across the top of a line-item card.
      '.' + P + '-banner {',
      '  display: flex; align-items: center; gap: 6px;',
      '  padding: 5px 12px; font: 700 11.5px system-ui, sans-serif;',
      '  text-transform: uppercase; letter-spacing: 0.04em;',
      '  background: #fef3c7; color: #92400e; border-bottom: 1px solid #fde68a;',
      '}',
      '.' + P + '-banner-ic { display: inline-flex; }',
      '.' + P + '-banner--add    { background: #dcfce7; color: #166534; border-bottom-color: #bbf7d0; }',
      '.' + P + '-banner--remove { background: #fee2e2; color: #991b1b; border-bottom-color: #fecaca; }',
      '.' + P + '-banner--revise { background: #dbeafe; color: #1e40af; border-bottom-color: #bfdbfe; }',
      /* Global feedback toast (bottom-right) for accept/reject submits. */
      '.' + P + '-toast {',
      '  position: fixed; right: 18px; bottom: 18px; z-index: 100001;',
      '  display: none; align-items: center; gap: 8px;',
      '  max-width: 340px; padding: 11px 16px; border-radius: 8px;',
      '  background: #0f172a; color: #fff; font: 600 13px system-ui, sans-serif;',
      '  box-shadow: 0 10px 30px rgba(0,0,0,0.28);',
      '}',
      '.' + P + '-toast.is-show { display: flex; }',
      '.' + P + '-toast--ok  { background: #166534; }',
      '.' + P + '-toast--err { background: #b91c1c; }',
      '.' + P + '-toast--work { background: #1e40af; }',
      '.' + P + '-toast-spin {',
      '  width: 14px; height: 14px; flex: 0 0 auto; border-radius: 50%;',
      '  border: 2px solid rgba(255,255,255,0.4); border-top-color: #fff;',
      '  animation: scwWsV2RevSpin 0.7s linear infinite;',
      '}',
      '@keyframes scwWsV2RevSpin { to { transform: rotate(360deg); } }',
      /* Collapsible summary panel (top) */
      '.' + BAR_CLS + ' {',
      '  margin: 0 0 10px; border: 1px solid #93c5fd; border-radius: 8px;',
      '  background: #fff; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06);',
      '}',
      '.' + P + '-bar-head {',
      '  display: flex; align-items: center; gap: 8px; padding: 9px 14px;',
      '  background: #eff6ff; cursor: pointer; font: 13px system-ui, sans-serif;',
      '}',
      '.' + P + '-bar-chev { display: inline-flex; transition: transform 120ms ease; color: #1e40af; }',
      '.' + P + '-bar-chev.is-open { transform: rotate(90deg); }',
      '.' + P + '-bar-count {',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '  min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px;',
      '  background: #3b82f6; color: #fff; font: 700 12px system-ui, sans-serif;',
      '}',
      '.' + P + '-bar-title { font-weight: 700; color: #0f172a; }',
      '.' + P + '-bar-btn {',
      '  appearance: none; border: 0; cursor: pointer; color: #fff;',
      '  padding: 6px 14px; border-radius: 5px; font: 600 12px system-ui, sans-serif;',
      '}',
      '.' + P + '-bar-btn[disabled] { opacity: 0.6; cursor: not-allowed; }',
      '.' + P + '-bar-btn--accept { background: #16a34a; }',
      '.' + P + '-bar-btn--reject { background: #dc2626; }',
      '.' + P + '-bar-btn--sm { padding: 4px 10px; font-size: 11px; }',
      /* Per-type count chips in the bar head */
      '.' + P + '-bar-chip {',
      '  display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 10px;',
      '  font: 700 10.5px system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.03em;',
      '}',
      '.' + P + '-bar-chip--add    { background: #dcfce7; color: #166534; }',
      '.' + P + '-bar-chip--remove { background: #fee2e2; color: #991b1b; }',
      '.' + P + '-bar-chip--revise { background: #dbeafe; color: #1e40af; }',
      '.' + P + '-bar-panel {',
      '  border-top: 1px solid #e2e8f0; padding: 8px 14px 12px;',
      '  max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;',
      '}',
      /* Type sections inside the panel (Additions / Removals / Revisions) */
      '.' + P + '-bar-sec { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }',
      '.' + P + '-bar-sec-head {',
      '  display: flex; align-items: center; gap: 8px; padding: 7px 10px;',
      '  border-bottom: 1px solid #e2e8f0; cursor: pointer; user-select: none;',
      '}',
      '.' + P + '-bar-sec--add    .' + P + '-bar-chev { color: #166534; }',
      '.' + P + '-bar-sec--remove .' + P + '-bar-chev { color: #991b1b; }',
      '.' + P + '-bar-sec--revise .' + P + '-bar-chev { color: #1e40af; }',
      '.' + P + '-bar-sec--add    .' + P + '-bar-sec-head { background: #f0fdf4; border-bottom-color: #bbf7d0; }',
      '.' + P + '-bar-sec--remove .' + P + '-bar-sec-head { background: #fef2f2; border-bottom-color: #fecaca; }',
      '.' + P + '-bar-sec--revise .' + P + '-bar-sec-head { background: #eff6ff; border-bottom-color: #bfdbfe; }',
      '.' + P + '-bar-sec-title {',
      '  font: 700 11.5px system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.04em;',
      '}',
      '.' + P + '-bar-sec--add    .' + P + '-bar-sec-title { color: #166534; }',
      '.' + P + '-bar-sec--remove .' + P + '-bar-sec-title { color: #991b1b; }',
      '.' + P + '-bar-sec--revise .' + P + '-bar-sec-title { color: #1e40af; }',
      '.' + P + '-bar-sec-body { display: flex; flex-direction: column; gap: 6px; padding: 8px; }',
      '.' + P + '-bar-card {',
      '  border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; cursor: pointer;',
      '  background: #fff;',
      '}',
      '.' + P + '-bar-card:hover { background: #f8fafc; border-color: #bfdbfe; }',
      /* Flash highlight on the worksheet card a summary click lands on */
      '.' + P + '-nav-flash {',
      '  outline: 3px solid #2563eb; outline-offset: 2px; border-radius: 6px;',
      '  animation: scwWsV2NavFlash 1.8s ease forwards;',
      '}',
      '@keyframes scwWsV2NavFlash {',
      '  0%, 55% { outline-color: #2563eb; }',
      '  100% { outline-color: transparent; }',
      '}',
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

  // Delegated banner-toggle: clicking a "change request pending" banner expands
  // its card. Bound once at the document level so it survives every inject()
  // rebuild of the banners (a per-banner listener missed clicks mid-rebuild).
  // Orphan/ADD cards have a banner but no expand chevron → no-op for them.
  function wireBannerToggle() {
    if (document.documentElement.hasAttribute('data-scw-ws-v2-rev-banner-bound')) return;
    document.documentElement.setAttribute('data-scw-ws-v2-rev-banner-bound', '1');
    document.addEventListener('click', function (e) {
      var banner = e.target && e.target.closest && e.target.closest('.' + P + '-banner');
      if (!banner) return;
      var card = banner.closest('.scw-ws-v2-card');
      if (!card) return;
      var chevron = card.querySelector('[data-scw-ws-v2-expand]');
      if (!chevron) return;   // orphan card — not expandable
      e.stopPropagation();
      chevron.click();
    });
  }

  // ── BOOT ─────────────────────────────────────────────────
  function boot() {
    injectStyles();
    wireBannerToggle();
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
