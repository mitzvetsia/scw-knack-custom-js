/*** SALES CHANGE REQUEST — SUBMIT ***/
/**
 * Webhook submission for both draft saves and final submissions.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, .pendingCount, .persist,
 *         .buildPayload, .buildHtml, .showToast, .refresh
 * Writes: SCW.salesCR.submitToWebhook, .clear
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;

  function submitToWebhook(isDraft) {
    var count = ns.pendingCount();
    if (!count) { ns.showToast('No pending changes to submit', 'info'); return; }

    var verb = isDraft ? 'save draft' : 'submit';
    if (!isDraft) {
      if (!window.confirm('Submit ' + count + ' change(s)?\n\nThis will send the change request for review.')) return;
    }

    var payload = ns.buildPayload(isDraft);
    var html    = ns.buildHtml();
    payload.html = html;

    var url = isDraft ? CFG.draftWebhook : CFG.submitWebhook;

    if (CFG.debug) {
      console.log('[SalesCR] ' + verb + ':', payload);
      console.log('[SalesCR] HTML preview:', html.substring(0, 500) + '...');
    }

    SCW.knackAjax({
      url:  url,
      type: 'POST',
      data: JSON.stringify(payload),
      success: function (resp) {
        if (CFG.debug) console.log('[SalesCR] ' + verb + ' success:', resp);
        if (!isDraft) {
          clearPending();
        }
        ns.showToast(isDraft ? 'Draft saved' : 'Change request submitted', 'success');
      },
      error: function (xhr) {
        // CORS may block the response even though Make received the data
        if (xhr && xhr.status === 0) {
          if (CFG.debug) console.log('[SalesCR] CORS-blocked (status 0) \u2014 treating as success');
          if (!isDraft) {
            clearPending();
          }
          ns.showToast(isDraft ? 'Draft saved' : 'Change request submitted', 'success');
        } else {
          console.error('[SalesCR] ' + verb + ' failed:', xhr.status, xhr.responseText);
          ns.showToast('Failed to ' + verb + ' \u2014 please try again', 'error');
        }
      },
    });
  }

  function clearPending() {
    var pending = S.pending();
    var keys = Object.keys(pending);
    for (var i = 0; i < keys.length; i++) delete pending[keys[i]];
    ns.persist();
    if (ns.refresh) ns.refresh();
  }

  // ── Public API ──
  ns.submitToWebhook = submitToWebhook;
  ns.clear           = clearPending;

})();
