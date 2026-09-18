/*** WORKSHEET V2 — AUDIT LOG *************************************************
 *
 * Per-record edit history, stored as a JSON blob in a paragraph field on the
 * line item (config: `auditField` on the view entry — the install object's
 * field_2995 on the deploy pages). Every edit that lands through the v2
 * worksheet (single-field saves, connection pickers, bulk edits, the
 * deliverables/config panel) appends an entry:
 *
 *   [{ "t": "2026-08-08T19:13:37.221Z",   // ISO timestamp
 *      "u": "Micah Shearer",              // logged-in user (Knack attributes)
 *      "f": "field_2808",                 // field key
 *      "l": "SCW Notes",                  // human label
 *      "from": "old value",               // display form, tag-stripped
 *      "to":   "new value" }, ...]        // capped at MAX_ENTRIES (oldest drop)
 *
 * The blob is read back through a compact history-icon button at the bottom
 * of the card's detail panel (card.js calls ns.audit.detailSection); clicking
 * it opens a scrollable MODAL with the full log, read fresh at open time.
 *
 * Views without `auditField` in their config no-op entirely — this module is
 * inert everywhere except the deploy/install surfaces.
 *
 * Known tradeoff: the append is client-side read-modify-write on the blob —
 * two people editing the SAME record at the same moment can drop one entry.
 * Field values themselves are never at risk (they're separate PUTs); accepted
 * for a log that is overwhelmingly single-editor-per-record.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  var MAX_ENTRIES = 250;   // oldest entries drop past this
  var MAX_VAL_LEN = 240;   // stored per-value cap (audit shows what changed,
                           // not a full diff of long rich text)

  // Human labels for logical field names (reverse-resolved via cfg.fields).
  var LOGICAL_LABELS = {
    scwNotes: 'SCW Notes',           surveyNotes: 'Survey notes',
    mdfIdf: 'MDF / IDF',             connectedDevices: 'Connected Devices',
    connectedDevice: 'Connected To', laborDesc: 'Labor description',
    qty: 'Qty',                      product: 'Product',
    dropLength: 'Drop Length',       conduit: 'Conduit',
    existCabling: 'Existing cabling', exterior: 'Exterior', plenum: 'Plenum',
    dropPrefix: 'Prefix',            dropNumber: 'Drop number',
    labor: 'Labor',                  subBid: 'Sub Bid',
    installStatus: 'Install status', qaStatus: 'QA status',
    qaNotes: 'QA notes',             accessories: 'Accessories',
    children: 'Accessories',         parent: 'Attached to'
  };

  function auditFieldOf(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return (vc && vc.auditField) || '';
    } catch (e) { return ''; }
  }

  function stripTags(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function truncate(s) {
    s = String(s == null ? '' : s);
    return s.length > MAX_VAL_LEN ? s.slice(0, MAX_VAL_LEN - 1) + '…' : s;
  }

  function userName() {
    try {
      var u = (typeof Knack !== 'undefined' && typeof Knack.getUserAttributes === 'function')
        ? Knack.getUserAttributes() : null;
      if (u && typeof u === 'object') return u.name || u.email || '';
    } catch (e) { /* ignore */ }
    return '';
  }

  function findRecord(viewKey, recordId) {
    try {
      var records = (ns.data && ns.data.readRecords(viewKey)) || [];
      for (var i = 0; i < records.length; i++) {
        if (records[i] && records[i].id === recordId) return records[i];
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /** Display form of a field's CURRENT value on a record: connection arrays
   *  join their identifiers, booleans read Yes/No, everything else is the
   *  tag-stripped display string. Untruncated — entries truncate at store
   *  time so JSON-blob values can still be diffed whole. */
  function displayVal(rec, fieldKey) {
    if (!rec) return '';
    var raw = rec[fieldKey + '_raw'];
    if (Array.isArray(raw)) {
      var labels = [];
      for (var i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].identifier != null) labels.push(stripTags(raw[i].identifier));
        else if (raw[i] && raw[i].id) labels.push(raw[i].id);
      }
      return labels.join(', ');
    }
    if (raw === true)  return 'Yes';
    if (raw === false) return 'No';
    if (raw != null && typeof raw !== 'object') return stripTags(raw);
    return stripTags(rec[fieldKey]);
  }

  /** Pre-PUT snapshot of a record's display values for every field in `body`.
   *  Call BEFORE firing the PUT — success handlers patch the local model, so
   *  a lookup after the fact reads the NEW values as "from". */
  function snapshotValues(viewKey, recordId, body) {
    var rec = findRecord(viewKey, recordId);
    var out = {};
    for (var fieldKey in body) {
      if (Object.prototype.hasOwnProperty.call(body, fieldKey)) {
        out[fieldKey] = displayVal(rec, fieldKey);
      }
    }
    return out;
  }

  /** Pre-PUT snapshot of a record's RAW connection values for every field in
   *  `body` — {fieldKey: [{id, identifier}]}. The reciprocal (losing-owner)
   *  logic needs the old owner's record ID, which display strings lose. */
  function snapshotRaw(viewKey, recordId, body) {
    var rec = findRecord(viewKey, recordId);
    var out = {};
    if (!rec) return out;
    for (var fieldKey in body) {
      if (!Object.prototype.hasOwnProperty.call(body, fieldKey)) continue;
      var raw = rec[fieldKey + '_raw'];
      if (!Array.isArray(raw)) continue;
      var copy = [];
      for (var i = 0; i < raw.length; i++) {
        if (raw[i]) copy.push({ id: raw[i].id, identifier: raw[i].identifier });
      }
      out[fieldKey] = copy;
    }
    return out;
  }

  /** Worksheet-style label for a record ("AC-01 · Keypad Reader"). */
  function recLabel(rec, viewKey) {
    if (!rec) return '';
    try {
      var F = (ns.cfg && ns.cfg.fields(viewKey)) || {};
      var lbl  = stripTags(rec[F.displayLabel] != null ? rec[F.displayLabel] : rec[F.labelAlt]);
      var prod = stripTags(rec[F.productName] != null ? rec[F.productName] : rec[F.product]);
      if (lbl && prod) return lbl + ' · ' + prod;
      return lbl || prod || rec.id;
    } catch (e) { return rec.id || ''; }
  }

  /** Resolve a "to" display for a body value when no server response is
   *  available: connection id arrays resolve identifiers by scanning the
   *  loaded records; scalars are stripped/truncated. */
  function bodyVal(viewKey, fieldKey, value) {
    if (Array.isArray(value)) {
      var byId = Object.create(null);
      try {
        var records = (ns.data && ns.data.readRecords(viewKey)) || [];
        for (var i = 0; i < records.length; i++) {
          var raw = records[i] && records[i][fieldKey + '_raw'];
          if (!Array.isArray(raw)) continue;
          for (var j = 0; j < raw.length; j++) {
            if (raw[j] && raw[j].id) byId[raw[j].id] = stripTags(raw[j].identifier || raw[j].id);
          }
          // Connection candidates are usually rows of this same view
          // (Connected Devices) — the record's own id/label resolves too.
          if (records[i] && records[i].id && !byId[records[i].id]) byId[records[i].id] = '';
        }
      } catch (e) { /* ignore */ }
      var labels = [];
      for (var k = 0; k < value.length; k++) {
        var id = (value[k] && value[k].id) ? value[k].id : value[k];
        labels.push(byId[id] || String(id));
      }
      return labels.join(', ');
    }
    if (value === true)  return 'Yes';
    if (value === false) return 'No';
    return stripTags(value);
  }

  /** When both sides of a change are JSON objects (the deliverables /
   *  questionnaire blobs), reduce the entry to the keys that changed —
   *  "REX: Yes · Entry Name: AC-01" beats two 2KB JSON strings. Returns
   *  null when either side isn't parseable as an object. */
  function jsonDiff(fromStr, toStr) {
    function parse(s) {
      s = String(s == null ? '' : s).trim();
      if (!s) return {};
      if (s.charAt(0) !== '{') return null;
      try { var o = JSON.parse(s); return (o && typeof o === 'object') ? o : null; }
      catch (e) { return null; }
    }
    var a = parse(fromStr), b = parse(toStr);
    if (!a || !b) return null;
    function fmt(v) {
      if (v == null || v === '') return '—';
      if (Array.isArray(v)) return v.join(', ');
      return String(v);
    }
    var keys = {}, k;
    for (k in a) keys[k] = 1;
    for (k in b) keys[k] = 1;
    var fromParts = [], toParts = [];
    for (k in keys) {
      var av = fmt(a[k]), bv = fmt(b[k]);
      if (av === bv) continue;
      fromParts.push(k + ': ' + av);
      toParts.push(k + ': ' + bv);
    }
    if (!toParts.length) return null;   // blobs differ only in formatting
    return { from: fromParts.join(' · '), to: toParts.join(' · ') };
  }

  /** Parse the stored blob off a record. Malformed/legacy content starts a
   *  fresh log (warned, never thrown). */
  function readLog(rec, auditField) {
    if (!rec) return [];
    var v = rec[auditField + '_raw'];
    if (v == null || v === '') v = rec[auditField];
    if (v == null || v === '') return [];
    try {
      var s = String(v).replace(/<br\s*\/?>/gi, '').replace(/<\/?p[^>]*>/gi, '').trim();
      var arr = JSON.parse(s);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn('[scw-ws-v2-audit] unparseable audit blob on', rec.id, '— starting fresh');
      return [];
    }
  }

  /** Field key → human label for a view (config labels win, then the
   *  questionnaire blob, then the logical-name map, then the raw key). */
  function labelFor(viewKey, fieldKey, labels) {
    if (labels && labels[fieldKey]) return labels[fieldKey];
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      if (vc && vc.questionnaire && vc.questionnaire.valueField === fieldKey) {
        return 'Configuration';
      }
      var F = (ns.cfg && ns.cfg.fields(viewKey)) || {};
      for (var name in F) {
        if (F[name] === fieldKey && LOGICAL_LABELS[name]) return LOGICAL_LABELS[name];
      }
    } catch (e) { /* ignore */ }
    return fieldKey;
  }

  /** PUT the updated blob (2 attempts on transient errors). The local model
   *  is patched BEFORE the PUT fires — so a rapid follow-up edit's readLog
   *  sees this append even while the PUT is still in flight (serializes the
   *  read-modify-write through the local copy) — then re-patched with the
   *  server response + pending-overlay + notify so the trigger re-renders.
   *
   *  Network writes drain through a small concurrency-capped queue: a
   *  Connected Devices cascade fans out one audit write per touched child on
   *  top of the cascade's own PUTs, and Knack silently 429s past ~10 req/s. */
  var _writeQueue = [], _writesRunning = 0;
  var MAX_AUDIT_WRITES = 2;

  function drainWrites() {
    while (_writesRunning < MAX_AUDIT_WRITES && _writeQueue.length) {
      var job = _writeQueue.shift();
      _writesRunning++;
      try {
        job(function () { _writesRunning--; drainWrites(); });
      } catch (e) { _writesRunning--; }
    }
  }

  function writeLog(viewKey, recordId, auditField, entries) {
    var json = JSON.stringify(entries);
    var body = {}; body[auditField] = json;
    try {
      if (typeof SCW.syncKnackModel === 'function') {
        SCW.syncKnackModel(viewKey, recordId, {}, auditField, json);
      }
      if (ns.data && typeof ns.data.registerPendingWrite === 'function') {
        ns.data.registerPendingWrite(viewKey, recordId, auditField, json);
      }
    } catch (e) { /* ignore */ }
    _writeQueue.push(function (done) {
      var attempt = 0;
      function fire() {
        attempt++;
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(viewKey, recordId),
          type: 'PUT',
          data: JSON.stringify(body),
          success: function (resp) {
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(viewKey, recordId, resp, auditField, json);
              }
              if (ns.data && typeof ns.data.registerPendingWrite === 'function') {
                ns.data.registerPendingWrite(viewKey, recordId, auditField, json);
              }
              if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
            } catch (e) { /* ignore */ }
            done();
          },
          error: function (xhr) {
            var s = xhr && xhr.status;
            if (attempt < 3 && (s === 0 || s === 408 || s === 429 || (s >= 500 && s <= 599))) {
              setTimeout(fire, 800 * attempt);
              return;
            }
            // A 403 here almost always means the audit field isn't an
            // inline-editable column on this view in Builder.
            console.warn('[scw-ws-v2-audit] audit write failed', viewKey, recordId, s);
            done();
          }
        });
      }
      try { fire(); } catch (e) { done(); }
    });
    drainWrites();
  }

  /**
   * Append raw entries ({f, l, from, to} — t/u stamped here) to a record's
   * log. No-ops unless the view configures `auditField`.
   */
  function log(viewKey, recordId, changes) {
    var AF = auditFieldOf(viewKey);
    if (!AF || !recordId || !changes || !changes.length) return;
    var rec = findRecord(viewKey, recordId);
    var entries = readLog(rec, AF);
    var t = new Date().toISOString();
    var u = userName();
    var added = 0;
    for (var i = 0; i < changes.length; i++) {
      var c = changes[i];
      if (!c || !c.f) continue;
      var from = truncate(String(c.from == null ? '' : c.from));
      var to   = truncate(String(c.to   == null ? '' : c.to));
      if (from === to) continue;   // nothing actually changed
      // Dedupe: cascade repair/verify passes re-PUT identical values moments
      // after the original write — skip when the LATEST entry for this field
      // already records the same from→to within the last 10 minutes.
      var dup = false;
      for (var j = entries.length - 1; j >= 0; j--) {
        if (!entries[j] || entries[j].f !== c.f) continue;
        dup = entries[j].from === from && entries[j].to === to &&
              (Date.parse(t) - (Date.parse(entries[j].t) || 0)) < 600000;
        break;
      }
      if (dup) continue;
      entries.push({ t: t, u: u, f: c.f, l: c.l || labelFor(viewKey, c.f, null), from: from, to: to });
      added++;
    }
    if (!added) return;
    if (entries.length > MAX_ENTRIES) entries = entries.slice(entries.length - MAX_ENTRIES);
    writeLog(viewKey, recordId, AF, entries);
  }

  /**
   * Log a field PUT from its body. Call from a save path's SUCCESS handler.
   *   o.prevValues — {fieldKey: display} explicit before-values (edit.js)
   *   o.prevRecord — record snapshot captured BEFORE the PUT (picker/bulk)
   *   o.resp       — the PUT response (authoritative "to" values)
   *   o.labels     — {fieldKey: label} overrides (e.g. the picker's label)
   */
  function logPut(viewKey, recordId, body, o) {
    var AF = auditFieldOf(viewKey);
    if (!AF || !body) return;
    o = o || {};
    var prevRec = o.prevRecord || findRecord(viewKey, recordId);
    var changes = [];
    for (var fieldKey in body) {
      if (!Object.prototype.hasOwnProperty.call(body, fieldKey)) continue;
      if (fieldKey === AF) continue;                 // never audit the audit
      var from = (o.prevValues && fieldKey in o.prevValues)
        ? stripTags(o.prevValues[fieldKey])
        : displayVal(prevRec, fieldKey);
      var to = (o.resp && (o.resp[fieldKey + '_raw'] != null || o.resp[fieldKey] != null))
        ? displayVal(o.resp, fieldKey)
        : bodyVal(viewKey, fieldKey, body[fieldKey]);
      // JSON-blob fields (questionnaire / config values) → changed keys only.
      var jd = jsonDiff(from, to);
      if (jd) { from = jd.from; to = jd.to; }
      changes.push({ f: fieldKey, l: labelFor(viewKey, fieldKey, o.labels), from: from, to: to });
    }
    log(viewKey, recordId, changes);

    // ── Reciprocal: the LOSING owner on a Connected To re-point ────────
    // A takeover (hub A steals a cam from hub B) or a cross-MDF clear only
    // WRITES hub A and the cam — hub B's Connected Devices display just
    // re-derives from back-pointers with no PUT of its own, so no write
    // hook ever fires for it. Synthesize its entry here from the cam's
    // pre-PUT raw value (o.prevRaw carries the old owner's record id).
    try {
      var F2 = (ns.cfg && ns.cfg.fields(viewKey)) || {};
      var CT = F2.connectedDevice, CD = F2.connectedDevices;
      if (CT && CD && Object.prototype.hasOwnProperty.call(body, CT) && o.prevRaw) {
        var pArr = o.prevRaw[CT];
        var prevOwner = (Array.isArray(pArr) && pArr[0] && pArr[0].id) ? pArr[0].id : '';
        var nv = body[CT];
        var newOwner = Array.isArray(nv)
          ? ((nv[0] && nv[0].id) || nv[0] || '') : (nv || '');
        if (prevOwner && prevOwner !== newOwner && prevOwner !== recordId) {
          logOwnerLoss(viewKey, prevOwner, recordId, CD, CT);
        }
      }
    } catch (e) { /* ignore */ }
  }

  /** Append a "Connected Devices" entry to the parent that LOST a child.
   *  before/after lists derive from the back-pointer scan (the same source
   *  the card display uses), with the departing child forced into "before"
   *  and out of "after" so the entry is right regardless of whether the
   *  local model has been patched yet. */
  function logOwnerLoss(viewKey, ownerId, childId, CD, CT) {
    var owner = findRecord(viewKey, ownerId);
    if (!owner) return;

    // Skip when the owner ITSELF was just edited (its picker logged the
    // change seconds ago — e.g. un-checking a cam fires the same cascade
    // clear). A stolen-from / cross-MDF-cleared owner has no fresh entry.
    var AF = auditFieldOf(viewKey);
    var existing = readLog(owner, AF);
    for (var x = existing.length - 1; x >= 0; x--) {
      if (!existing[x] || existing[x].f !== CD) continue;
      if (Date.now() - (Date.parse(existing[x].t) || 0) < 15000) return;
      break;
    }

    var child = findRecord(viewKey, childId);
    var childLabel = child ? recLabel(child, viewKey) : childId;

    var after = [], seen = {};
    try {
      var records = (ns.data && ns.data.readRecords(viewKey)) || [];
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (!r || !r.id || r.id === childId || seen[r.id]) continue;
        var ct = r[CT + '_raw'];
        if (Array.isArray(ct) && ct[0] && ct[0].id === ownerId) {
          seen[r.id] = true;
          after.push(recLabel(r, viewKey));
        }
      }
    } catch (e) { /* ignore */ }
    after.sort(function (a, b) {
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });
    var before = after.concat([childLabel]);
    before.sort(function (a, b) {
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });

    log(viewKey, ownerId, [{
      f: CD, l: 'Connected Devices',
      from: before.join(', '),
      to:   after.length ? after.join(', ') : '—'
    }]);
  }

  // ── History section (rendered by card.js inside the detail panel) ──

  function fmtWhen(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      var yr  = (d.getFullYear() !== new Date().getFullYear()) ? ' ' + d.getFullYear() : '';
      var tm  = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return day + yr + ' · ' + tm;
    } catch (e) { return ''; }
  }

  // Clock-with-counterclockwise-arrow — the standard "history" glyph.
  var HISTORY_ICON =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 3v5h5"></path>' +
      '<path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"></path>' +
      '<polyline points="12 7 12 12 15 15"></polyline></svg>';

  function entryRowsHtml(entries) {
    var rows = '';
    for (var i = entries.length - 1; i >= 0; i--) {   // newest first
      var e = entries[i] || {};
      var from = (e.from == null || e.from === '') ? '—' : e.from;
      var to   = (e.to   == null || e.to   === '') ? '—' : e.to;
      rows +=
        '<div class="scw-ws-v2-audit-row">' +
          '<span class="scw-ws-v2-audit-when">' + esc(fmtWhen(e.t)) + '</span>' +
          '<span class="scw-ws-v2-audit-who">' + esc(e.u || '') + '</span>' +
          '<span class="scw-ws-v2-audit-what">' +
            '<span class="scw-ws-v2-audit-fld">' + esc(e.l || e.f || '') + '</span> ' +
            '<span class="scw-ws-v2-audit-from" title="' + esc(from) + '">' + esc(from) + '</span>' +
            '<span class="scw-ws-v2-audit-arrow">→</span>' +
            '<span class="scw-ws-v2-audit-to" title="' + esc(to) + '">' + esc(to) + '</span>' +
          '</span>' +
        '</div>';
    }
    return rows;
  }

  /** Compact trigger for the card's detail panel — the log itself opens in a
   *  modal (an inline list can't scale past a handful of entries). Returned
   *  as a SLOT that card.js places as a sibling of the detail grid; CSS pins
   *  it to the panel's far right, aligned under the row's warning-icon
   *  column. */
  function detailSection(rec, viewKey) {
    var AF = auditFieldOf(viewKey);
    if (!AF) return '';
    var entries = readLog(rec, AF);
    if (!entries.length) return '';
    return '<div class="scw-ws-v2-audit-slot">' +
      '<button type="button" class="scw-ws-v2-audit-btn" ' +
        'data-scw-ws-v2-audit-open="' + esc(rec.id) + '" ' +
        'data-scw-ws-v2-audit-view="' + esc(viewKey) + '" ' +
        'title="View this line item’s edit history">' +
        HISTORY_ICON +
        '<span>Edit history (' + entries.length + ')</span>' +
      '</button>' +
    '</div>';
  }

  /** Full history modal — reads the record FRESH at open time (the trigger's
   *  count can be a render behind; the modal never is). Reuses the bulk-modal
   *  shell (styles.js) for the backdrop/card; the entry list scrolls. */
  function openModal(viewKey, recordId) {
    var AF = auditFieldOf(viewKey);
    if (!AF || !recordId) return;
    var rec = findRecord(viewKey, recordId);
    var entries = readLog(rec, AF);

    var title = '';
    try {
      var F = (ns.cfg && ns.cfg.fields(viewKey)) || {};
      var lbl  = stripTags(rec && (rec[F.displayLabel] != null ? rec[F.displayLabel] : rec[F.labelAlt]));
      var prod = stripTags(rec && (rec[F.productName] != null ? rec[F.productName] : rec[F.product]));
      title = (lbl && prod) ? lbl + ' · ' + prod : (lbl || prod || '');
    } catch (e) { /* ignore */ }

    var old = document.querySelector('.scw-ws-v2-audit-overlay');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var ov = document.createElement('div');
    ov.className = 'scw-ws-v2-bulk-overlay scw-ws-v2-audit-overlay';
    ov.innerHTML =
      '<div class="scw-ws-v2-bulk-modal scw-ws-v2-audit-modal">' +
        '<div class="scw-ws-v2-bulk-modal-head">' +
          '<div class="scw-ws-v2-bulk-modal-title scw-ws-v2-audit-modal-title">' +
            HISTORY_ICON + '<span>Edit history' + (title ? ' — ' + esc(title) : '') + '</span></div>' +
          '<div class="scw-ws-v2-bulk-modal-sub">' + entries.length +
            ' change' + (entries.length === 1 ? '' : 's') +
            (entries.length >= MAX_ENTRIES ? ' · only the most recent ' + MAX_ENTRIES + ' are kept' : '') +
          '</div>' +
        '</div>' +
        '<div class="scw-ws-v2-audit-modal-body">' +
          (entries.length ? entryRowsHtml(entries)
                          : '<div class="scw-ws-v2-audit-empty">No edits recorded yet.</div>') +
        '</div>' +
        '<div class="scw-ws-v2-bulk-modal-actions">' +
          '<button type="button" class="scw-ws-v2-bulk-modal-cancel">Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    function close() {
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }
    ov.querySelector('.scw-ws-v2-bulk-modal-cancel').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', onKey, true);
  }

  // ── CSS + toggle wiring (once) ─────────────────────────────────────

  var STYLE_ID = 'scw-ws-v2-audit-css';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      // Trigger button — pinned to the detail panel's top-right, flush with
      // the row's warning-icon column above (the --audit modifier on the
      // panel reserves the right edge so wide detail text can't run under it)
      '.scw-ws-v2-detail--audit{position:relative;}' +
      '.scw-ws-v2-detail--audit .scw-ws-v2-install-detail{padding-right:150px;}' +
      '.scw-ws-v2-audit-slot{position:absolute;top:8px;right:12px;}' +
      '.scw-ws-v2-audit-btn{display:inline-flex;align-items:center;gap:6px;' +
        'background:#fff;border:1px solid #e2e8f0;border-radius:6px;' +
        'padding:3px 10px;cursor:pointer;white-space:nowrap;' +
        'font:600 11px/1.2 inherit;color:#64748b;letter-spacing:.02em;}' +
      '.scw-ws-v2-audit-btn:hover{color:#334155;border-color:#cbd5e1;background:#f8fafc;}' +
      '.scw-ws-v2-audit-btn svg{flex:0 0 auto;}' +
      // Modal
      '.scw-ws-v2-audit-overlay{z-index:100000;}' +
      '.scw-ws-v2-audit-modal{width:min(680px,94vw);}' +
      '.scw-ws-v2-audit-modal-title{display:flex;align-items:center;gap:8px;}' +
      '.scw-ws-v2-audit-modal-title svg{width:15px;height:15px;flex:0 0 auto;}' +
      '.scw-ws-v2-audit-modal-body{max-height:min(58vh,520px);overflow-y:auto;' +
        'padding:4px 18px 10px;border-top:1px solid #f1f5f9;}' +
      '.scw-ws-v2-audit-empty{color:#94a3b8;font-size:12px;padding:14px 0;}' +
      // Entry rows (modal list)
      '.scw-ws-v2-audit-row{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;' +
        'padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:12px;line-height:1.4;}' +
      '.scw-ws-v2-audit-row:last-child{border-bottom:none;}' +
      '.scw-ws-v2-audit-when{color:#94a3b8;white-space:nowrap;min-width:104px;}' +
      '.scw-ws-v2-audit-who{color:#475569;font-weight:600;white-space:nowrap;}' +
      '.scw-ws-v2-audit-what{color:#334155;flex:1 1 280px;min-width:220px;}' +
      '.scw-ws-v2-audit-fld{font-weight:600;color:#0f4c75;margin-right:4px;}' +
      '.scw-ws-v2-audit-from{color:#94a3b8;text-decoration:line-through;' +
        'text-decoration-color:#cbd5e1;word-break:break-word;}' +
      '.scw-ws-v2-audit-arrow{color:#94a3b8;margin:0 4px;}' +
      '.scw-ws-v2-audit-to{color:#0f172a;word-break:break-word;}';
    document.head.appendChild(style);
  }

  if (!document.documentElement.hasAttribute('data-scw-ws-v2-audit-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-audit-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-audit-open]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openModal(btn.getAttribute('data-scw-ws-v2-audit-view') || '',
                btn.getAttribute('data-scw-ws-v2-audit-open') || '');
    });
  }

  ns.audit = {
    log:            log,
    logPut:         logPut,
    snapshotValues: snapshotValues,
    snapshotRaw:    snapshotRaw,
    detailSection:  detailSection,
    openModal:      openModal,
    enabledFor:     function (viewKey) { return !!auditFieldOf(viewKey); }
  };
})();
/*** END WORKSHEET V2 — AUDIT LOG *********************************************/
