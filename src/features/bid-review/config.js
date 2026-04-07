/*** BID REVIEW — CONFIGURATION ***/
/**
 * Centralized config for the Bid Review Matrix feature.
 * All view IDs, field keys, webhook URLs, and tuning knobs live here.
 *
 * Writes: SCW.bidReview.CONFIG
 */
(function () {
  'use strict';

  var ns = (window.SCW.bidReview = window.SCW.bidReview || {});

  ns.CONFIG = {
    // ── Knack scene / views ───────────────────────────────────
    sceneKey:          'scene_1155',
    rowViewKey:        'view_3560',
    cellViewKey:       'view_3561',

    // ── Make webhook for all review actions ────────────────────
    actionWebhook:     'https://hook.us1.make.com/PLACEHOLDER_BID_REVIEW',

    // ── DOM mount point (created if absent) ────────────────────
    mountSelector:     '#bid-review-matrix',

    // ── Knack field keys ──────────────────────────────────────
    fieldKeys: {
      // Row fields
      reviewRowId:     'field_2552',
      displayLabel:    'field_2365',
      relatedSowItem:  'field_2404',
      rowType:         'field_2366',
      groupL1:         'field_2228',
      groupL2:         'field_2218',
      sortOrder:       'field_2553',

      // Cell fields
      cellId:          'field_2554',
      cellReviewRow:   'field_2555',
      bidPackage:      'field_2415',
      bidPackageName:  'field_2556',
      qty:             'field_2399',
      labor:           'field_2401',
      laborDescription:'field_2409',
      notes:           'field_2557',
      status:          'field_2558',
    },

    // ── Status value constants ────────────────────────────────
    statusValues: {
      matched:  'Matched',
      missing:  'Missing',
      newItem:  'New',
      conflict: 'Conflict',
    },

    // ── Timing ────────────────────────────────────────────────
    renderDelay:       200,     // ms to wait after scene render
    toastDuration:     4000,    // ms before toast auto-dismiss

    // ── Debug ─────────────────────────────────────────────────
    debug:   false,
    eventNs: '.scwBidReview',
    cssId:   'scw-bid-review-css',
  };

})();
