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
    // overwriting the cell while the PUT is still in flight.
    input._scwWsV2Prev = newValue;

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

    savePut(viewKey, recordId, fieldKey, newValue)
      .then(function (resp) {
        // SCW.knackAjax doesn\'t auto-fire knack-cell-update like
        // Knack\'s native inline edit does. Patch the local model
        // with whatever the server returned and notify subscribers
        // so re-rendered cards reflect formula recomputes (Fee, etc).
        try {
          if (typeof SCW.syncKnackModel === 'function') {
            SCW.syncKnackModel(viewKey, recordId, resp, fieldKey, newValue);
          }
        } catch (e) { /* ignore */ }
        // Fee depends on a server-side formula recompute. The per-
        // record fetch is unreliable on this view, so refetch the
        // whole view\'s model — heavier but the only path that
        // surfaces Knack\'s recomputed Fee + extended totals
        // consistently. refetchAndNotify handles the fetch+notify
        // pair atomically.
        if (RECALC_DEPS[fieldKey]) {
          if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
            ns.data.refetchAndNotify(viewKey);
            return;
          }
        }
        if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
      })
      .catch(function (xhr) {
        console.warn('[scw-ws-v2] save failed', { recordId: recordId, fieldKey: fieldKey, xhr: xhr });
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

  ns.edit = { wire: wire };
})();
/*** END WORKSHEET V2 — EDIT **************************************************/
