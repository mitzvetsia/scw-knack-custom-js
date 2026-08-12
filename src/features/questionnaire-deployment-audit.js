/*** FEATURE: Deployment-side questionnaire audit trail *********************
 *
 * When the System Setup Questionnaire is in "Pending Project Manager Signoff"
 * (field_1772), any inline edit a PM makes on a DEPLOYMENT-side questionnaire
 * grid (view_4015 ops / view_4053 sub) to a field that also lives on the
 * questionnaire is appended to the audit trail (field_2937) — same
 * tamper-audit purpose as the customer scene, but for changes made after the
 * customer has signed off.
 *
 * Mechanism: snapshot the row's field values on render; on knack-cell-update
 * diff against the snapshot to find what changed, and (only while status is
 * Pending PM Signoff) append a stamped line to field_2937 via the grid's
 * record endpoint (field_2937 must be inline-editable there).
 *
 * Prereq: field_2937 present + writable on view_4015 (done) and on
 * view_4053 (Builder — until then the append PUT warns in console).
 ****************************************************************************/
(function () {
  'use strict';

  var VIEWS        = ['view_4015', 'view_4053'];  // deployment-side questionnaire grids
  var STATUS_FIELD = 'field_1772';  // STATUS — gate: only audit while Pending PM Signoff
  var AUDIT_FIELD  = 'field_2937';  // audit-trail paragraph
  var EVENT_NS     = '.scwQDeployAudit';

  // Only one deployment scene renders at a time — resolve the live grid.
  function activeView() {
    for (var i = 0; i < VIEWS.length; i++) {
      if (document.getElementById(VIEWS[i])) return VIEWS[i];
    }
    return VIEWS[0];
  }

  // Fields NEVER audited (the audit field itself + the status field + Knack
  // system columns). Everything else editable on view_4015 is a questionnaire
  // field, so a change to it gets logged.
  var SKIP = {};
  SKIP[AUDIT_FIELD] = 1;
  SKIP[STATUS_FIELD] = 1;

  var _snap = {};        // recordId -> { fieldKey: stringVal }
  var _auditBase = {};   // recordId -> current field_2937 text (maintained across appends)
  var _busy = false;

  function getRecords() {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[activeView()] : null;
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return [];
    return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); });
  }
  // Normalize a field value to a comparable/printable string.
  function valStr(attrs, fk) {
    var raw = attrs[fk + '_raw'];
    if (raw != null && typeof raw !== 'object') return String(raw);
    if (Array.isArray(raw)) return raw.map(function (r) { return (r && (r.identifier || r.id)) || ''; }).join(', ');
    if (raw && typeof raw === 'object') {
      if (raw.identifier) return String(raw.identifier);
      if (raw.first != null || raw.last != null) return ((raw.first || '') + ' ' + (raw.last || '')).trim();
      return JSON.stringify(raw);
    }
    var v = attrs[fk];
    return v == null ? '' : String(v).replace(/<[^>]*>/g, '').replace(/ /g, ' ').trim();
  }
  function snapshot(attrs) {
    var s = {};
    for (var k in attrs) {
      if (!/^field_\d+$/.test(k)) continue;
      if (SKIP[k]) continue;
      s[k] = valStr(attrs, k);
    }
    return s;
  }
  // Status read from anywhere on the page (field_1772 may not be a column here).
  function readStatus() {
    try {
      var views = (typeof Knack !== 'undefined' && Knack.views) || {};
      for (var vid in views) {
        var v = views[vid];
        if (!v || !v.model) continue;
        var a = v.model.attributes || (v.model.data && v.model.data.attributes);
        if (a && a[STATUS_FIELD] != null) return valStr(a, STATUS_FIELD);
        var models = v.model.data && v.model.data.models;
        if (models) for (var i = 0; i < models.length; i++) {
          var at = models[i] && models[i].attributes;
          if (at && at[STATUS_FIELD] != null) return valStr(at, STATUS_FIELD);
        }
      }
    } catch (e) { /* ignore */ }
    return '';
  }
  function isPmSignoff() {
    var s = readStatus().toLowerCase();
    return /project\s*manager/.test(s) && /sign\s*off|signoff/.test(s);
  }
  function fieldLabel(fk) {
    var th = document.querySelector('#' + activeView() + ' thead th.' + fk);
    var t = th ? th.textContent.replace(/\s+/g, ' ').trim() : '';
    return t || fk;
  }
  function getEditor() {
    try {
      var u = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes() : null;
      if (!u || typeof u !== 'object') return 'staff';
      var name = u.name;
      if (name && typeof name === 'object') name = ((name.first || '') + ' ' + (name.last || '')).trim();
      return u.email || name || 'staff';
    } catch (e) { return 'staff'; }
  }

  // Take an initial snapshot of every row (only if not already snapshotted, so
  // a re-render after an edit doesn't wipe the pre-edit baseline).
  function seedSnapshots() {
    var recs = getRecords();
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id) continue;
      if (!_snap[r.id]) _snap[r.id] = snapshot(r);
      if (_auditBase[r.id] == null) _auditBase[r.id] = valStr(r, AUDIT_FIELD);
    }
  }

  function appendAudit(recId, lines, done) {
    var combined = (_auditBase[recId] ? _auditBase[recId] + '\n' : '') + lines.join('\n');
    var data = {}; data[AUDIT_FIELD] = combined;
    SCW.knackAjax({
      url: SCW.knackRecordUrl(activeView(), recId), type: 'PUT', data: JSON.stringify(data),
      success: function () { _auditBase[recId] = combined; if (done) done(true); },
      error: function (xhr) {
        console.warn('[scw-qd-audit] append failed', xhr && xhr.status);
        if (done) done(false);
      }
    });
  }

  // On any inline edit, diff each row against its snapshot and log questionnaire
  // field changes while the questionnaire is Pending PM Signoff.
  function onCellUpdate() {
    if (_busy) return;
    if (typeof SCW === 'undefined' || typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') return;
    var pmSignoff = isPmSignoff();
    var recs = getRecords();
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id) continue;
      var prev = _snap[r.id] || {};
      var cur = snapshot(r);
      var changes = [];
      for (var fk in cur) {
        var was = (prev[fk] != null) ? prev[fk] : '';
        if (cur[fk] !== was) changes.push({ fk: fk, old: was, now: cur[fk] });
      }
      _snap[r.id] = cur;                 // advance baseline regardless
      if (!changes.length || !pmSignoff) continue;
      var who = getEditor();
      var stamp = new Date().toISOString();
      var lines = changes.map(function (c) {
        return '[' + stamp + '] ' + who + ' (deployment) set "' + fieldLabel(c.fk) +
          '" (' + c.fk + ') to "' + c.now + '" (was "' + c.old + '")';
      });
      _busy = true;
      (function (id) {
        appendAudit(id, lines, function () { _busy = false; });
      })(r.id);
    }
  }

  VIEWS.forEach(function (VIEW) {
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(VIEW, function () { setTimeout(seedSnapshots, 0); }, EVENT_NS);
    }
    $(document)
      .off('knack-cell-update.' + VIEW + EVENT_NS)
      .on('knack-cell-update.' + VIEW + EVENT_NS, function () { setTimeout(onCellUpdate, 0); });
  });
})();
/*** END FEATURE: Deployment-side questionnaire audit trail *****************/
