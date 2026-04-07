/*** BID REVIEW — ACTIONS ***/
/**
 * Payload construction and webhook submission.
 * No DOM manipulation, no rendering — only data out.
 * Calls renderToast for user feedback (the only render dependency).
 *
 * Reads : SCW.bidReview.CONFIG, SCW.bidReview.renderToast
 * Writes: SCW.bidReview.submitAction(payload)
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  /**
   * Submit a bid review action to the Make webhook.
   *
   * @param {object} payload
   * @param {string} payload.actionType — one of:
   *   'row_adopt', 'row_create', 'row_skip',
   *   'package_adopt_all', 'package_create_missing', 'package_adopt_create'
   * @param {string} [payload.reviewRowId]  — for row-level actions
   * @param {string} [payload.packageId]    — target package
   * @param {string[]} [payload.rowIds]     — for package-level batch actions
   * @returns {jQuery.Deferred}
   */
  ns.submitAction = function submitAction(payload) {
    var deferred = $.Deferred();

    if (!payload || !payload.actionType) {
      if (CFG.debug) console.warn('[BidReview] submitAction called without actionType');
      deferred.reject('Missing actionType');
      return deferred.promise();
    }

    var body = {
      actionType:  payload.actionType,
      timestamp:   new Date().toISOString(),
    };

    if (payload.reviewRowId) body.reviewRowId = payload.reviewRowId;
    if (payload.packageId)   body.packageId   = payload.packageId;
    if (payload.rowIds)      body.rowIds      = payload.rowIds;

    if (CFG.debug) {
      console.log('[BidReview] Submitting action:', body);
    }

    SCW.knackAjax({
      url:  CFG.actionWebhook,
      type: 'POST',
      data: JSON.stringify(body),
      success: function (resp) {
        if (CFG.debug) console.log('[BidReview] Action success:', resp);

        var label = describeAction(payload);
        ns.renderToast(label + ' — sent successfully', 'success');
        deferred.resolve(resp);
      },
      error: function (xhr) {
        console.error('[BidReview] Action failed:', xhr.status, xhr.responseText);
        ns.renderToast('Action failed — please try again', 'error');
        deferred.reject(xhr);
      },
    });

    return deferred.promise();
  };

  /**
   * Build a human-readable label for a toast message.
   */
  function describeAction(payload) {
    switch (payload.actionType) {
      case 'row_adopt':             return 'Row adopted';
      case 'row_create':            return 'SOW item creation requested';
      case 'row_skip':              return 'Row skipped';
      case 'package_adopt_all':     return 'Adopt All (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      case 'package_create_missing':return 'Create Missing (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      case 'package_adopt_create':  return 'Adopt + Create (' + (payload.rowIds ? payload.rowIds.length : 0) + ' rows)';
      default:                      return 'Action submitted';
    }
  }

})();
