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
 * The blob is read back into a collapsed "Edit history (N)" section at the
 * bottom of the card's detail panel (card.js calls ns.audit.detailSection).
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
    qaNotes: 'QA notes'
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
   *  server response + pending-overlay + notify so the section re-renders. */
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
        },
        error: function (xhr) {
          var s = xhr && xhr.status;
          if (attempt < 2 && (s === 0 || s === 408 || s === 429 || (s >= 500 && s <= 599))) {
            setTimeout(fire, 800);
            return;
          }
          // A 403 here almost always means the audit field isn't an
          // inline-editable column on this view in Builder.
          console.warn('[scw-ws-v2-audit] audit write failed', viewKey, recordId, s);
        }
      });
    }
    try { fire(); } catch (e) { /* ignore */ }
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

  function detailSection(rec, viewKey) {
    var AF = auditFieldOf(viewKey);
    if (!AF) return '';
    var entries = readLog(rec, AF);
    if (!entries.length) return '';

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

    return '<div class="scw-ws-v2-sd-item scw-ws-v2-sd--wide scw-ws-v2-sd--audit">' +
      '<div class="scw-ws-v2-audit">' +
        '<button type="button" class="scw-ws-v2-audit-toggle" data-scw-ws-v2-audit-toggle="" aria-expanded="false">' +
          '<span class="scw-ws-v2-audit-chev"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" ' +
            'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="9 6 15 12 9 18"></polyline></svg></span>' +
          '<span>Edit history (' + entries.length + ')</span>' +
        '</button>' +
        '<div class="scw-ws-v2-audit-body">' + rows + '</div>' +
      '</div>' +
    '</div>';
  }

  // ── CSS + toggle wiring (once) ─────────────────────────────────────

  var STYLE_ID = 'scw-ws-v2-audit-css';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.scw-ws-v2-audit{width:100%;}' +
      '.scw-ws-v2-audit-toggle{display:inline-flex;align-items:center;gap:5px;' +
        'background:none;border:none;padding:2px 0;cursor:pointer;' +
        'font:600 11px/1.2 inherit;color:#64748b;letter-spacing:.02em;}' +
      '.scw-ws-v2-audit-toggle:hover{color:#334155;}' +
      '.scw-ws-v2-audit-chev{display:inline-flex;transition:transform .12s ease;}' +
      '.scw-ws-v2-audit--open .scw-ws-v2-audit-chev{transform:rotate(90deg);}' +
      '.scw-ws-v2-audit-body{display:none;margin-top:4px;border-top:1px solid #e2e8f0;' +
        'max-height:220px;overflow-y:auto;}' +
      '.scw-ws-v2-audit--open .scw-ws-v2-audit-body{display:block;}' +
      '.scw-ws-v2-audit-row{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline;' +
        'padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:11.5px;line-height:1.35;}' +
      '.scw-ws-v2-audit-row:last-child{border-bottom:none;}' +
      '.scw-ws-v2-audit-when{color:#94a3b8;white-space:nowrap;min-width:96px;}' +
      '.scw-ws-v2-audit-who{color:#475569;font-weight:600;white-space:nowrap;}' +
      '.scw-ws-v2-audit-what{color:#334155;flex:1 1 260px;min-width:200px;}' +
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
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-audit-toggle]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var box = btn.closest('.scw-ws-v2-audit');
      if (!box) return;
      var open = box.classList.toggle('scw-ws-v2-audit--open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  ns.audit = {
    log:            log,
    logPut:         logPut,
    snapshotValues: snapshotValues,
    detailSection:  detailSection,
    enabledFor:     function (viewKey) { return !!auditFieldOf(viewKey); }
  };
})();
/*** END WORKSHEET V2 — AUDIT LOG *********************************************/
