/*** BID REVIEW V2 — CONFIG ***************************************************
 *
 * Mirrors worksheet-v2's config pattern. v2 lives in parallel with v1
 * (src/features/bid-review/*) and mounts BELOW v1's grid on scene_1155
 * so reviewers can compare side-by-side during the parallel build.
 *
 * The big architectural shift vs. v1:
 *   - v2 NEVER uses Knack's inline-edit UI (no Chosen pickers, no
 *     native cell-edit, no view-form lifecycle). Every editable field
 *     is our own input + custom picker. Saves go through direct PUTs
 *     via SCW.knackAjax — same path worksheet-v2/edit.js uses.
 *   - Data sources stay the same (view_3680 bids, view_3921 SOW items,
 *     etc). We read records straight off Knack.views[k].model.data.
 *
 * Kill switch: flip `enabled` to false to hide v2 entirely without
 * touching build.sh. Flip `replaceV1` to true once v2 reaches parity
 * and you're ready to hide v1.
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};
  window.SCW.bidReviewV2 = window.SCW.bidReviewV2 || {};

  // Reuse v1's CONFIG verbatim — view keys, field keys, webhooks are
  // identical between v1 and v2. We only override the namespace + mount
  // anchor. If v1 hasn't loaded yet, v2 bails on init.
  var v1 = window.SCW.bidReview && window.SCW.bidReview.CONFIG;

  SCW.bidReviewV2.CONFIG = {
    enabled:    true,
    // When true, v1's grid is hidden via CSS so v2 takes its slot.
    // Non-destructive: v1 still mounts + loads data (v2 reads nothing
    // from v1's DOM, but the source views it scrapes stay live); only
    // #bid-review-matrix is display:none'd. Flip back to false to
    // restore the v1 grid.
    replaceV1:  true,

    // Anchor for the v2 mount point. Insert v2 AFTER v1's grid root
    // (#bid-review-matrix lives inside v1's mount). Falls back to the
    // gridAnchorView if v1 hasn't mounted yet — v2 will re-try on the
    // next scene render.
    mountAfterSelector:  '#bid-review-matrix',
    mountFallbackSelector: v1 ? ('#' + v1.gridAnchorView) : '#view_3970',

    // Source views v2 subscribes to. Identical to v1's set; we just
    // listen to the same knack-view-render events.
    sourceViewKeys: v1 ? [
      v1.viewKey,             // view_3680 — bid records
      v1.sowItemsViewKey,     // view_3921 — SOW line items
      v1.bidPackagesViewKey,  // view_3573 — bid packages
      v1.mdfIdfViewKey,       // view_3822 — MDF/IDF locations
      v1.changeRequestViewKey, // view_3818 — change requests
      v1.docFilesViewKey      // view_3926 — DOC_files (link/unlink repaints
                              // the docs block v1 injects into v2's header)
    ].filter(Boolean) : [],

    // Field keys + webhooks come from v1 verbatim. Centralizing here
    // means v1 → v2 cutover is a single namespace flip, no key copy.
    fieldKeys:           v1 && v1.fieldKeys,
    sowItemFieldKeys:    v1 && v1.sowItemFieldKeys,
    actionWebhook:       v1 && v1.actionWebhook,
    changeRequestWebhook: v1 && v1.changeRequestWebhook,
    addToSowWebhook:     v1 && v1.addToSowWebhook,

    sceneKey:    v1 && v1.sceneKey,
    debug:       false,
    eventNs:     '.scwBidReviewV2',
    cssId:       'scw-bid-review-v2-css',
    mountId:     'scw-bid-review-v2',
    bannerLabel: 'Bid Review (v2 preview)'
  };
})();
/*** END BID REVIEW V2 — CONFIG ***********************************************/
