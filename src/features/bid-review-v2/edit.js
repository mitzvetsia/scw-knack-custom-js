/*** BID REVIEW V2 — EDIT *****************************************************
 *
 * Single delegated input handler for every v2 bid-cell input. Saves
 * direct to Knack via SCW.knackAjax PUT — never touches Knack's inline
 * edit form lifecycle.
 *
 * Identical contract to worksheet-v2/edit.js:
 *   - Snapshot input value on focusin → input._scwBrV2Prev.
 *   - Enter or blur with a real change → commit().
 *   - commit() flashes --saving for 200ms, fires PUT, on error paints
 *     --error and reverts.
 *   - Successful PUT → SCW.syncKnackModel patches the source model,
 *     then notifyDebounced() re-renders surrounding cells (e.g. extended
 *     labor recomputes when qty or rate changes).
 *
 * Input contract — each editable element carries:
 *   data-scw-br-v2-field   the field key to write
 *   data-scw-br-v2-record  the Knack record id (bid record in view_3680)
 *   data-scw-br-v2-view    the view key (always view_3680 for bid cells)
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns) return;

  var FLASH_MS = 200;
  var SAV_CLS  = 'scw-bid-review-v2-input--saving';
  var ERR_CLS  = 'scw-bid-review-v2-input--error';

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
    } catch (e) { d.reject(e); }
    return d.promise();
  }

  function commit(input) {
    var fieldKey = input.getAttribute('data-scw-br-v2-field');
    var recordId = input.getAttribute('data-scw-br-v2-record');
    var viewKey  = input.getAttribute('data-scw-br-v2-view');
    if (!fieldKey || !recordId || !viewKey) return;

    var newValue  = input.value;
    var prevValue = input._scwBrV2Prev != null ? input._scwBrV2Prev : (input.defaultValue || '');
    if (newValue === prevValue) return;

    input._scwBrV2Prev = newValue;
    input.classList.remove(ERR_CLS);
    input.classList.add(SAV_CLS);
    setTimeout(function () { input.classList.remove(SAV_CLS); }, FLASH_MS);

    savePut(viewKey, recordId, fieldKey, newValue)
      .then(function (resp) {
        try {
          if (typeof SCW.syncKnackModel === 'function') {
            SCW.syncKnackModel(viewKey, recordId, resp, fieldKey, newValue);
          }
        } catch (e) { /* ignore */ }
        if (ns.data && typeof ns.data.notifyDebounced === 'function') {
          ns.data.notifyDebounced();
        }
      })
      .catch(function (xhr) {
        console.warn('[scw-br-v2] save failed', { recordId: recordId, fieldKey: fieldKey, xhr: xhr });
        input.classList.add(ERR_CLS);
        input.value = prevValue;
        input._scwBrV2Prev = prevValue;
      });
  }

  function isOurs(t) {
    return t && t.hasAttribute && t.hasAttribute('data-scw-br-v2-field');
  }

  function wire() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-edit-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-edit-bound', '1');

    document.addEventListener('focusin', function (e) {
      if (!isOurs(e.target)) return;
      if (e.target._scwBrV2Prev == null) e.target._scwBrV2Prev = e.target.value;
    }, true);

    document.addEventListener('keydown', function (e) {
      if (!isOurs(e.target)) return;
      if (e.key !== 'Enter') return;
      if (e.target.tagName === 'TEXTAREA' && e.shiftKey) return;
      e.preventDefault();
      e.target._scwBrV2JustSaved = true;
      commit(e.target);
      e.target.blur();
    }, true);

    document.addEventListener('focusout', function (e) {
      if (!isOurs(e.target)) return;
      if (e.target._scwBrV2JustSaved) { e.target._scwBrV2JustSaved = false; return; }
      commit(e.target);
    }, true);
  }

  ns.edit = { wire: wire };
})();
/*** END BID REVIEW V2 — EDIT *************************************************/
