/*** WORKSHEET V2 — EDIT ******************************************************
 *
 * Single delegated input handler for every editable field in every v2
 * worksheet card. Saves go directly to Knack's REST endpoint via
 * SCW.knackAjax + SCW.knackRecordUrl (the same helpers v1 uses).
 *
 * Trigger model — fires on Enter (single-line inputs) or blur (any
 * input that's actually changed). Skipped on focusout if the value
 * matches the input's stored "previous" snapshot, so navigating
 * through a card with tab doesn't save unchanged fields.
 *
 * Visual feedback model — copies v1's "optimistic UI" pattern:
 *   1. On commit, immediately update the input's data-scw-prev so a
 *      Knack re-render's stale value can't overwrite.
 *   2. Flash .scw-ws-v2-input--saving for 200ms (brief green).
 *   3. PUT in background. On success, silently clear flash state. On
 *      error, paint .scw-ws-v2-input--error and revert the value.
 *
 * Per-keystroke flow is intentionally not throttled — Knack's server
 * does the heavy work on every PUT, so we let the user finish typing
 * before firing one PUT per committed value.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  var FLASH_MS = 200;
  var ERR_CLS  = 'scw-ws-v2-input--error';
  var SAV_CLS  = 'scw-ws-v2-input--saving';

  /** Visible toast for a failed save. The silent console.warn + revert made a
   *  genuinely failing PUT indistinguishable from a stale-render revert — the
   *  user just saw their edit "disappear". Errors get red (repo convention). */
  var ERR_TOAST_ID = 'scw-ws-v2-save-error-toast';
  function showSaveErrorToast(xhr, msgOverride, holdMs) {
    try {
      var status = xhr && xhr.status;
      var msg = msgOverride || ((status === 403)
        ? 'Save failed (403 — field not editable on this view?). Change reverted.'
        : 'Save failed' + (status ? ' (HTTP ' + status + ')' : '') + '. Change reverted.');
      var old = document.getElementById(ERR_TOAST_ID);
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var el = document.createElement('div');
      el.id = ERR_TOAST_ID;
      el.textContent = msg;
      el.style.cssText =
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
        'background:#b91c1c;color:#fff;padding:10px 18px;border-radius:8px;' +
        'font:600 13px/1.3 system-ui,sans-serif;z-index:100001;' +
        'box-shadow:0 4px 12px rgba(0,0,0,.25);max-width:min(640px,92vw);';
      document.body.appendChild(el);
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, holdMs || 6000);
    } catch (e) { /* ignore */ }
  }

  // ── Dropped-write detection ─────────────────────────────────────────────
  // A view-scoped PUT can come back 200 with the record UNCHANGED: the column
  // isn't inline-editable on that view (Knack ignores the field instead of
  // 403ing in some configurations), or a Knack rule on the object re-stamps
  // the field the moment it's saved (e.g. a "PRODUCT STORED_" price copied
  // back from the product). Before this check the success path adopted the
  // server's (old) value silently — the card flashed green, then the edit
  // "went away" on the next rebuild with no error anywhere. Now the success
  // handler compares what came back with what was sent; when the server
  // still holds the PREVIOUS value the write was dropped and the user gets a
  // red toast naming the likely Builder cause.

  /** Sign-preserving numeric parse of a Knack raw/display/input value.
   *  NaN for blank / non-numeric. */
  function numOf(v) {
    if (typeof v === 'number') return v;
    if (v == null) return NaN;
    var s = String(v).trim();
    if (!s) return NaN;
    var neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^\s*-/.test(s) || /^\$\s*-/.test(s);
    s = s.replace(/[^0-9.]/g, '');
    if (!s) return NaN;
    var n = parseFloat(s);
    if (isNaN(n)) return NaN;
    return neg ? -Math.abs(n) : n;
  }

  /** Two values are "the same number" when both are blank/non-numeric or
   *  differ by less than half a cent. */
  function sameNum(a, b) {
    var x = numOf(a), y = numOf(b);
    if (isNaN(x) && isNaN(y)) return true;
    if (isNaN(x) || isNaN(y)) return false;
    return Math.abs(x - y) < 0.005;
  }

  /** True when the server's returned raw value for the edited field still
   *  equals the PREVIOUS value and not the value we sent — i.e. the PUT was
   *  acknowledged but the field never changed. Numeric inputs compare as
   *  numbers (Knack may reformat "150" as 150 / "150.00"); text inputs
   *  compare trimmed strings; textareas are skipped (Knack normalizes their
   *  HTML, so a strict compare would false-positive). Deliberately requires
   *  raw === prev: a server that returns a THIRD value (rounding, a formula
   *  normalizing the input) is a normalization, not a drop. */
  function wasWriteDropped(input, serverRaw, newValue, prevValue) {
    if (!input || input.tagName === 'TEXTAREA') return false;
    if (serverRaw && typeof serverRaw === 'object') return false;   // connections etc.
    if (input.type === 'number') {
      return sameNum(serverRaw, prevValue) && !sameNum(serverRaw, newValue);
    }
    var s = String(serverRaw == null ? '' : serverRaw).trim();
    var p = String(prevValue == null ? '' : prevValue).trim();
    var n = String(newValue == null ? '' : newValue).trim();
    return s === p && s !== n;
  }

  /** Live view-schema introspection of the view-scoped PUT preconditions
   *  (same read as mdf-edit-core.js diagnoseError): is fieldKey an
   *  inline-editable column on viewKey AS THIS PAGE LOADED IT? Returns
   *  { ok, problem } or null when the schema isn't inspectable. Used for
   *  MESSAGING only — never to block a save (the read is best-effort). */
  function inspectEditability(viewKey, fieldKey) {
    try {
      var kv = window.Knack && Knack.views && Knack.views[viewKey];
      var vv = kv && kv.model && kv.model.view;
      if (!vv) return null;
      if (vv.type && vv.type !== 'table') {
        return { ok: false, problem: viewKey + ' is a "' + vv.type + '" view — ' +
          'record PUTs need an inline-editable grid (table).' };
      }
      if (!(vv.options && vv.options.cell_editor)) {
        return { ok: false, problem: 'inline editing (cell editor) is OFF on ' + viewKey +
          ' as this page loaded it — enable it in Builder, then hard-refresh.' };
      }
      var cols = vv.columns || [];
      for (var ci = 0; ci < cols.length; ci++) {
        var col = cols[ci] || {};
        var cf = (col.field && col.field.key) || col.id;
        if (cf !== fieldKey) continue;
        if (col.ignore_edit) {
          return { ok: false, problem: fieldKey + '’s column on ' + viewKey +
            ' has inline editing disabled (column setting in Builder).' };
        }
        return { ok: true, problem: '' };
      }
      return { ok: false, problem: fieldKey + ' is not a column on ' + viewKey +
        ' — add it to the grid in Builder (inline-editable).' };
    } catch (e) { return null; }
  }
  ns.inspectEditability = inspectEditability;

  /** Human-readable explanation for a dropped write, from the schema read. */
  function droppedWriteReason(viewKey, fieldKey) {
    var info = inspectEditability(viewKey, fieldKey);
    if (info && !info.ok) return info.problem;
    if (info && info.ok) {
      return 'The column IS inline-editable on ' + viewKey + ', so a Knack rule on ' +
        'the object is most likely re-stamping ' + fieldKey + ' on every save ' +
        '(e.g. a conditional rule copying the product price back). Change the ' +
        'rule in Builder, or price the line through its discount fields instead.';
    }
    return 'Check in Builder that ' + fieldKey + ' is an inline-editable column on ' +
      viewKey + ' and that no rule on the object overwrites it on save.';
  }

  /** Warn once per view+field about a Builder precondition the schema read
   *  says will make the PUT a no-op. Message-only. */
  var _auditWarned = Object.create(null);
  function auditBeforeSave(viewKey, fieldKey) {
    var k = viewKey + '|' + fieldKey;
    if (_auditWarned[k]) return;
    var info = inspectEditability(viewKey, fieldKey);
    if (!info || info.ok) return;
    _auditWarned[k] = true;
    console.warn('[scw-ws-v2] ' + fieldKey + ' on ' + viewKey + ' does not look ' +
      'inline-editable — the save is likely to be ignored by Knack. ' + info.problem);
  }

  /** Send the PUT. Returns a thenable. */
  function savePut(viewKey, recordId, fieldKey, value) {
    var data = {};
    data[fieldKey] = value;
    var d = $.Deferred();
    try {
      SCW.knackAjax({
        url:  SCW.knackRecordUrl(viewKey, recordId),
        type: 'PUT',
        data: JSON.stringify(data),
        success: function (resp) { d.resolve(resp); },
        error:   function (xhr)  { d.reject(xhr); }
      });
    } catch (e) {
      d.reject(e);
    }
    return d.promise();
  }

  /** True when a value is $0 or blank (for the confirmZero rule). */
  function isZeroBlank(v) {
    var s = (v == null ? '' : String(v)).replace(/[^0-9.\-]/g, '').trim();
    if (s === '') return true;            // blank
    var n = parseFloat(s);
    return !isNaN(n) && n === 0;          // $0
  }
  ns.isZeroBlank = isZeroBlank;

  /** Shared yes/no confirm modal → Promise<bool>. Reuses bulk.js's modal
   *  CSS (loaded via styles.js). opts: { title, body(html), okLabel, cancelLabel }. */
  function confirmModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
        });
      }
      var ov = document.createElement('div');
      ov.className = 'scw-ws-v2-bulk-overlay';
      ov.innerHTML =
        '<div class="scw-ws-v2-bulk-modal scw-ws-v2-bulk-modal--confirm">' +
          '<div class="scw-ws-v2-bulk-modal-head">' +
            '<div class="scw-ws-v2-bulk-modal-title">' + esc(opts.title || 'Confirm') + '</div>' +
            '<div class="scw-ws-v2-bulk-modal-sub">' + (opts.body || '') + '</div>' +
          '</div>' +
          '<div class="scw-ws-v2-bulk-modal-actions">' +
            '<button type="button" class="scw-ws-v2-bulk-modal-cancel">' + esc(opts.cancelLabel || 'Cancel') + '</button>' +
            '<button type="button" class="scw-ws-v2-bulk-modal-confirm-delete">' + esc(opts.okLabel || 'Confirm') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      function done(v) { if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(v); }
      ov.querySelector('.scw-ws-v2-bulk-modal-cancel').addEventListener('click', function () { done(false); });
      ov.querySelector('.scw-ws-v2-bulk-modal-confirm-delete').addEventListener('click', function () { done(true); });
      ov.addEventListener('click', function (e) { if (e.target === ov) done(false); });
    });
  }
  ns.confirmModal = confirmModal;

  /** Shared one-shot note prompt (textarea) → Promise<string|null> (null on
   *  cancel). Reuses bulk.js's modal CSS.
   *  opts: { title, body(html), placeholder, okLabel, cancelLabel,
   *          optional } — optional:true keeps the OK button live with an
   *  empty box and resolves '' (the modal then doubles as a confirm with
   *  an optional note, e.g. the CO Send-to-Sub gesture). */
  function promptNote(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
          return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
        });
      }
      var ov = document.createElement('div');
      ov.className = 'scw-ws-v2-bulk-overlay';
      ov.innerHTML =
        '<div class="scw-ws-v2-bulk-modal scw-ws-v2-bulk-modal--confirm">' +
          '<div class="scw-ws-v2-bulk-modal-head">' +
            '<div class="scw-ws-v2-bulk-modal-title">' + esc(opts.title || 'Survey note required') + '</div>' +
            '<div class="scw-ws-v2-bulk-modal-sub">' + (opts.body || '') + '</div>' +
          '</div>' +
          '<div style="padding:0 18px 6px;">' +
            '<textarea class="scw-ws-v2-bulk-note" rows="3" placeholder="' + esc(opts.placeholder || '') + '" ' +
              'style="width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #cbd5e1;border-radius:6px;resize:vertical;"></textarea>' +
          '</div>' +
          '<div class="scw-ws-v2-bulk-modal-actions">' +
            '<button type="button" class="scw-ws-v2-bulk-modal-cancel">' +
              esc(opts.cancelLabel || 'Cancel') + '</button>' +
            '<button type="button" class="scw-ws-v2-bulk-modal-confirm-delete"' +
              (opts.optional ? '' : ' disabled') + '>' +
              esc(opts.okLabel || 'Save with note') + '</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      var ta  = ov.querySelector('.scw-ws-v2-bulk-note');
      var okB = ov.querySelector('.scw-ws-v2-bulk-modal-confirm-delete');
      var caB = ov.querySelector('.scw-ws-v2-bulk-modal-cancel');
      function done(v) { if (ov.parentNode) ov.parentNode.removeChild(ov); resolve(v); }
      if (!opts.optional) {
        ta.addEventListener('input', function () { okB.disabled = !ta.value.trim(); });
      }
      caB.addEventListener('click', function () { done(null); });
      okB.addEventListener('click', function () {
        var v = ta.value.trim();
        if (v || opts.optional) done(v);
      });
      ov.addEventListener('click', function (e) { if (e.target === ov) done(null); });
      setTimeout(function () { ta.focus(); }, 30);
    });
  }
  ns.promptNote = promptNote;

  /** confirmZero config rule for a view, if any. */
  function confirmZeroSpec(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      return (vc && vc.confirmZero) || null;
    } catch (e) { return null; }
  }

  /** Commit an input: optimistic flash, fire PUT, handle error path. */
  function commit(input) {
    var fieldKey  = input.getAttribute('data-scw-ws-v2-field');
    var recordId  = input.getAttribute('data-scw-ws-v2-record');
    var viewKey   = input.getAttribute('data-scw-ws-v2-view');
    if (!fieldKey || !recordId || !viewKey) return;

    var newValue  = input.value;
    var prevValue = input._scwWsV2Prev != null ? input._scwWsV2Prev : (input.defaultValue || '');
    if (newValue === prevValue) return; // no-op — value didn't actually change

    // Textareas edit HTML-carrying fields with <br>s presented as real
    // line breaks (card.js readMultiline). Serialize the newlines back to
    // <br> for the save so breaks persist in the stored markup — a bare \n
    // collapses to a space when Knack renders the field's HTML. The no-op
    // compare above runs on the EDITOR form; _scwWsV2Prev is stamped from
    // input.value in performSave for the same reason.
    if (input.tagName === 'TEXTAREA') {
      newValue = newValue.replace(/\r?\n/g, '<br>');
    }

    // Config-driven $0/blank confirm (e.g. survey sub-bid Labor). Gate BEFORE
    // saving: on cancel revert the input; on confirm fall through to save.
    var zSpec = confirmZeroSpec(viewKey);
    if (zSpec) {
      var zCfg = (ns.cfg && ns.cfg.fields(viewKey)) || {};
      var zKey = zCfg[zSpec.field] || zSpec.field;
      if (fieldKey === zKey && isZeroBlank(newValue)) {
        confirmModal({
          title: zSpec.title, body: zSpec.body,
          okLabel: 'Yes, continue', cancelLabel: 'Cancel'
        }).then(function (ok) {
          if (!ok) {
            // Revert the cell to its prior value.
            input.value = prevValue;
            input._scwWsV2Prev = prevValue;
            return;
          }
          performSave(input, fieldKey, recordId, viewKey, newValue, prevValue);
        });
        return;
      }
    }
    performSave(input, fieldKey, recordId, viewKey, newValue, prevValue);
  }

  /** The actual optimistic-UI + PUT for a committed input. */
  function performSave(input, fieldKey, recordId, viewKey, newValue, prevValue) {

    // Stamp the new value as the new "previous" right away — protects
    // against a Knack re-render coming in with a stale model value and
    // overwriting the cell while the PUT is still in flight. Use the
    // EDITOR-form value (input.value — textareas show \n where the saved
    // markup has <br>) so the next commit's no-op compare matches what
    // the user actually sees in the control.
    input._scwWsV2Prev = input.value;

    input.classList.remove(ERR_CLS);
    input.classList.add(SAV_CLS);
    setTimeout(function () {
      if (input.classList.contains(SAV_CLS)) input.classList.remove(SAV_CLS);
    }, FLASH_MS);

    // Optimistically patch the local model NOW, before the PUT resolves, so a
    // re-render in the meantime (e.g. closing a bid-review expand panel that
    // hosts this card, or a sibling edit) reflects the typed value instead of
    // reverting to the stale model. Success re-patches with the server resp;
    // error reverts (below).
    try {
      if (typeof SCW.syncKnackModel === 'function') {
        SCW.syncKnackModel(viewKey, recordId, {}, fieldKey, newValue);
      }
    } catch (e) { /* ignore */ }

    // Register this write in the pending-overlay so a refetch fired by THIS
    // (or any concurrent) edit can't revert it before the server commits.
    // See data.js applyPendingOverlay. Cleared on error (revert is intended).
    try {
      if (ns.data && typeof ns.data.registerPendingWrite === 'function') {
        ns.data.registerPendingWrite(viewKey, recordId, fieldKey, newValue);
      }
    } catch (e) { /* ignore */ }

    // Fields that feed a server-side formula — after saving any of them we
    // refetch the record so the dependent read-only cells refresh:
    //   - Fee / install fee (field_2028/2151) recompute from sub bid, +Hrs,
    //     +Mat, qty.
    //   - The drop LABEL (field_1950, e.g. "E-001") recomputes from the drop
    //     prefix + drop number.
    //   - Sales: the Custom Disc % (field_2261) / Disc $ (field_2262) feed the
    //     Applied Discount (field_2303) and line Total (field_2269) CALCs, so
    //     editing the discount has to refetch for those to update on the card.
    // Resolved per-view from config.
    var EF = (ns.cfg && ns.cfg.fields(viewKey)) || {};
    var RECALC_DEPS = {};
    RECALC_DEPS[EF.subBid     || 'field_2150'] = 1;
    RECALC_DEPS[EF.addHrs     || 'field_1973'] = 1;
    RECALC_DEPS[EF.addMat     || 'field_1974'] = 1;
    RECALC_DEPS[EF.qty        || 'field_1964'] = 1;
    RECALC_DEPS[EF.dropPrefix || 'field_2240'] = 1;
    RECALC_DEPS[EF.dropNumber || 'field_1951'] = 1;
    // Sales-only discount inputs (absent on the build view → no fallback).
    if (EF.lineDiscPct) RECALC_DEPS[EF.lineDiscPct] = 1;
    if (EF.lineDiscAmt) RECALC_DEPS[EF.lineDiscAmt] = 1;
    // Survey (view_3505): editing Labor (field_2400) recomputes the CALC
    // Ext (field_2401); refetch so the Ext total under the Labor input
    // refreshes. No `labor` logical key on the SOW object → no-op there.
    if (EF.labor) RECALC_DEPS[EF.labor] = 1;
    // Ops CO worksheet (config equipmentField, view_4079): the unit equipment
    // price feeds the extended equipment (field_2201) and net total
    // (field_2269) CALCs shown on the same row.
    try {
      var _eqVc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
      if (_eqVc && _eqVc.equipmentField) RECALC_DEPS[_eqVc.equipmentField] = 1;
    } catch (e) { /* ignore */ }

    // Console heads-up when the view schema says this field can't take a
    // view-scoped PUT (once per view+field). The save still runs — the
    // schema read is best-effort and the dropped-write check below is the
    // authoritative signal.
    auditBeforeSave(viewKey, fieldKey);

    // Two-arg .then(onOk, onErr) — NOT .then().catch(). $.Deferred promises
    // (and any fetch polyfill in the wrapper chain) may not expose .catch,
    // which threw "Uncaught TypeError: ...catch is not a function" and broke
    // the save's error handling in some users' environments.
    savePut(viewKey, recordId, fieldKey, newValue)
      .then(function (resp) {
        // Dropped-write check: a 200 whose record still carries the PREVIOUS
        // value means Knack acknowledged the PUT but never applied the field
        // (column not inline-editable on this view, or a rule re-stamped it).
        // Treat it exactly like a failed save — visible toast, revert — instead
        // of silently adopting the old value (which is what made CO equipment
        // price edits "save then go away").
        try {
          var _r = (resp && resp.record && typeof resp.record === 'object' && resp.record.id)
            ? resp.record : resp;
          if (_r && typeof _r === 'object' &&
              Object.prototype.hasOwnProperty.call(_r, fieldKey + '_raw') &&
              wasWriteDropped(input, _r[fieldKey + '_raw'], newValue, prevValue)) {
            onDroppedWrite(input, fieldKey, recordId, viewKey, newValue, prevValue, resp);
            return;
          }
        } catch (e) { /* fall through to the normal success path */ }
        // SCW.knackAjax doesn\'t auto-fire knack-cell-update like
        // Knack\'s native inline edit does. Patch the local model
        // with whatever the server returned and notify subscribers
        // so re-rendered cards reflect formula recomputes (Fee, etc).
        try {
          if (typeof SCW.syncKnackModel === 'function') {
            SCW.syncKnackModel(viewKey, recordId, resp, fieldKey, newValue);
          }
        } catch (e) { /* ignore */ }
        // Refresh the pending-overlay entry with the server's authoritative
        // raw value so a later refetch re-applies the normalized form (and
        // the TTL window restarts from the confirmed write).
        try {
          if (ns.data && typeof ns.data.registerPendingWrite === 'function') {
            var confirmed = (resp && resp[fieldKey + '_raw'] != null)
              ? resp[fieldKey + '_raw'] : newValue;
            ns.data.registerPendingWrite(viewKey, recordId, fieldKey, confirmed);
          }
        } catch (e) { /* ignore */ }
        // Let external grids that embed this card (e.g. the bid-review-v2
        // comparison grid's expand-panel editor) know a record was saved so
        // they can refetch + rebuild. SCW.knackAjax fires no knack-cell-update,
        // and our internal notify only reaches worksheet-v2 subscribers.
        try {
          $(document).trigger('scw-ws-v2-record-saved',
            [{ viewKey: viewKey, recordId: recordId, fieldKey: fieldKey }]);
        } catch (e) { /* ignore */ }
        // Append to the record's edit-history blob (auditField views only).
        try {
          if (ns.audit && typeof ns.audit.logPut === 'function') {
            var _aPrev = {}; _aPrev[fieldKey] = prevValue;
            var _aBody = {}; _aBody[fieldKey] = newValue;
            ns.audit.logPut(viewKey, recordId, _aBody, { prevValues: _aPrev, resp: resp });
          }
        } catch (e) { /* ignore */ }
        // Fee (and the other RECALC CALCs) depend on a server-side formula
        // recompute. Read back ONLY the edited record via the view-scoped
        // session-token endpoint and patch its CALC fields — instead of the
        // old full-model refetch, which pulled every row over the wire AND
        // re-rendered Knack's entire native grid (a multi-second storm on a
        // 300+ row SOW just to refresh one card). refetchRecordAndNotify reads
        // the single record, syncs it into the model, and notifies so only
        // that card rebuilds. The pending-writes overlay still protects any
        // concurrent in-flight edits.
        if (RECALC_DEPS[fieldKey]) {
          if (ns.data && typeof ns.data.refetchRecordAndNotify === 'function') {
            ns.data.refetchRecordAndNotify(viewKey, recordId, fieldKey, newValue);
            return;
          }
          if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
            ns.data.refetchAndNotify(viewKey);
            return;
          }
        }
        if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
      },
      function (xhr) {
        console.warn('[scw-ws-v2] save failed', { recordId: recordId, fieldKey: fieldKey, xhr: xhr });
        showSaveErrorToast(xhr);
        // Drop the pending-overlay entry — the write didn't land, so the
        // revert to prevValue must be allowed to stick.
        try {
          if (ns.data && typeof ns.data.clearPendingWrite === 'function') {
            ns.data.clearPendingWrite(viewKey, recordId, fieldKey);
          }
        } catch (e) { /* ignore */ }
        // Revert the optimistic model patch + the input.
        try {
          if (typeof SCW.syncKnackModel === 'function') {
            SCW.syncKnackModel(viewKey, recordId, {}, fieldKey, prevValue);
          }
        } catch (e) { /* ignore */ }
        input.classList.add(ERR_CLS);
        input.value = prevValue;
        input._scwWsV2Prev = prevValue;
        if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
      });
  }

  /** A PUT that came back 200 with the field unchanged. Same UI outcome as
   *  a rejected save (toast + revert), but the copy names the real cause so
   *  the fix lands in Builder instead of being chased in the bundle. */
  function onDroppedWrite(input, fieldKey, recordId, viewKey, newValue, prevValue, resp) {
    var label  = input.getAttribute('aria-label') || fieldKey;
    var reason = droppedWriteReason(viewKey, fieldKey);
    console.warn('[scw-ws-v2] save IGNORED by Knack (200, field unchanged)', {
      viewKey: viewKey, recordId: recordId, fieldKey: fieldKey,
      sent: newValue, serverStillHas: prevValue, why: reason,
      schema: inspectEditability(viewKey, fieldKey), resp: resp
    });
    showSaveErrorToast(null,
      'Knack didn’t keep your change to ' + label + ' — the value reverted' +
      (prevValue !== '' && prevValue != null ? ' to ' + prevValue : '') + '. ' + reason,
      11000);
    // The write didn't land: drop the optimistic overlay + model patch so
    // the server's value is what renders.
    try {
      if (ns.data && typeof ns.data.clearPendingWrite === 'function') {
        ns.data.clearPendingWrite(viewKey, recordId, fieldKey);
      }
    } catch (e) { /* ignore */ }
    try {
      if (typeof SCW.syncKnackModel === 'function') {
        // resp carries the server's real (old) raw — syncKnackModel prefers it
        // over the sent value, so the model ends up truthful either way.
        SCW.syncKnackModel(viewKey, recordId, resp || {}, fieldKey, prevValue);
      }
    } catch (e) { /* ignore */ }
    input.classList.remove(SAV_CLS);
    input.classList.add(ERR_CLS);
    input.value = prevValue;
    input._scwWsV2Prev = prevValue;
    if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
  }

  /**
   * Wire the delegated handlers. Idempotent — guarded so reloads
   * don't stack listeners.
   */
  function wire() {
    if (document.documentElement.hasAttribute('data-scw-ws-v2-edit-bound')) return;
    document.documentElement.setAttribute('data-scw-ws-v2-edit-bound', '1');

    // Snapshot the initial value on focus so blur can short-circuit
    // unchanged fields.
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (!t || !t.hasAttribute || !t.hasAttribute('data-scw-ws-v2-field')) return;
      if (t._scwWsV2Prev == null) t._scwWsV2Prev = t.value;
    }, true);

    // Enter commits single-line inputs (numbers, text). Shift+Enter in
    // a textarea inserts a newline; plain Enter commits.
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.hasAttribute || !t.hasAttribute('data-scw-ws-v2-field')) return;
      if (e.key !== 'Enter') return;
      if (t.tagName === 'TEXTAREA' && e.shiftKey) return;
      e.preventDefault();
      t._scwWsV2JustSaved = true;
      commit(t);
      t.blur();
    }, true);

    // Blur commits anything else. Skipped right after an Enter commit
    // so we don't double-fire.
    document.addEventListener('focusout', function (e) {
      var t = e.target;
      if (!t || !t.hasAttribute || !t.hasAttribute('data-scw-ws-v2-field')) return;
      if (t._scwWsV2JustSaved) { t._scwWsV2JustSaved = false; return; }
      commit(t);
    }, true);
  }

  ns.edit = {
    wire: wire,
    // Exposed for diagnostics / tests: schema read + the dropped-write rule.
    inspectEditability: inspectEditability,
    wasWriteDropped: wasWriteDropped
  };
})();
/*** END WORKSHEET V2 — EDIT **************************************************/
