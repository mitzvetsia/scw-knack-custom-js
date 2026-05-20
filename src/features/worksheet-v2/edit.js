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

  /** Commit an input: optimistic flash, fire PUT, handle error path. */
  function commit(input) {
    var fieldKey  = input.getAttribute('data-scw-ws-v2-field');
    var recordId  = input.getAttribute('data-scw-ws-v2-record');
    var viewKey   = input.getAttribute('data-scw-ws-v2-view');
    if (!fieldKey || !recordId || !viewKey) return;

    var newValue  = input.value;
    var prevValue = input._scwWsV2Prev != null ? input._scwWsV2Prev : (input.defaultValue || '');
    if (newValue === prevValue) return; // no-op — value didn't actually change

    // Stamp the new value as the new "previous" right away — protects
    // against a Knack re-render coming in with a stale model value and
    // overwriting the cell while the PUT is still in flight.
    input._scwWsV2Prev = newValue;

    input.classList.remove(ERR_CLS);
    input.classList.add(SAV_CLS);
    setTimeout(function () {
      if (input.classList.contains(SAV_CLS)) input.classList.remove(SAV_CLS);
    }, FLASH_MS);

    savePut(viewKey, recordId, fieldKey, newValue)
      .then(function () {
        // Success path — nothing to do visually; the flash already
        // signaled the save was acknowledged. The next data subscriber
        // notify (from knack-cell-update) will re-render the card with
        // Knack's authoritative response (formula recompute, etc.).
      })
      .catch(function (xhr) {
        console.warn('[scw-ws-v2] save failed', { recordId: recordId, fieldKey: fieldKey, xhr: xhr });
        input.classList.add(ERR_CLS);
        input.value = prevValue;
        input._scwWsV2Prev = prevValue;
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
