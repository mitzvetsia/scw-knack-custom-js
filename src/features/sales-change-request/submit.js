/*** SALES CHANGE REQUEST — SUBMIT ***/
/**
 * Webhook submission for final submissions, and draft save to Knack field.
 *
 * Save Draft: writes pending JSON to field_2707 immediately (no webhook).
 * Submit: posts to webhook, then clears pending + draft field.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, .pendingCount, .persist,
 *         .buildPayload, .buildHtml, .showToast, .refresh
 * Writes: SCW.salesCR.submitToWebhook, .saveDraft, .clear
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;

  function submitToWebhook() {
    var count = ns.pendingCount();
    if (!count) { ns.showToast('No pending changes to submit', 'info'); return; }

    if (!window.confirm('Submit ' + count + ' change(s)?\n\nThis will send the change request for review.')) return;

    var payload = ns.buildPayload(false);
    payload.html      = ns.buildHtml();
    payload.plainText = ns.buildPlainText();

    if (CFG.debug) {
      console.log('[SalesCR] Submit:', payload);
    }

    SCW.knackAjax({
      url:  CFG.submitWebhook,
      type: 'POST',
      data: JSON.stringify(payload),
      success: function (resp) {
        if (CFG.debug) console.log('[SalesCR] Submit success:', resp);
        clearPending();
        autoRevertValidation(count);
        ns.showToast('Change request submitted', 'success');
      },
      error: function (xhr) {
        if (xhr && xhr.status === 0) {
          autoRevertValidation(count);
          if (CFG.debug) console.log('[SalesCR] CORS-blocked (status 0) \u2014 treating as success');
          clearPending();
          ns.showToast('Change request submitted', 'success');
        } else {
          console.error('[SalesCR] Submit failed:', xhr.status, xhr.responseText);
          ns.showToast('Failed to submit \u2014 please try again', 'error');
        }
      },
    });
  }

  /** Save draft: immediate write to field_2707 (no debounce). */
  function saveDraft() {
    var count = ns.pendingCount();
    if (!count) { ns.showToast('No pending changes to save', 'info'); return; }

    ns.forceSaveDraft();
    ns.showToast('Draft saved', 'success');
  }

  function clearPending() {
    var pending = S.pending();
    var keys = Object.keys(pending);
    for (var i = 0; i < keys.length; i++) delete pending[keys[i]];
    ns.persist();  // clears sessionStorage + writes empty to field_2707
    if (ns.refresh) ns.refresh();
  }

  // Flip field_2725 (FLAG_validated bid) back to No and drop a note into
  // field_2736 so the Ops Review pill on view_3325 surfaces why the
  // validation was revoked. No-op if the ops-review feature hasn't loaded
  // or the SOW id can't be resolved.
  function autoRevertValidation(count) {
    if (!window.SCW || !SCW.opsReview ||
        typeof SCW.opsReview.autoRevertValidation !== 'function') return;
    var sowId = S.sowRecordId && S.sowRecordId();
    if (!sowId) return;
    SCW.opsReview.autoRevertValidation(sowId, { itemCount: count });
  }

  // ── Public API ──
  ns.submitToWebhook = submitToWebhook;
  ns.saveDraft       = saveDraft;
  ns.clear           = clearPending;

})();
