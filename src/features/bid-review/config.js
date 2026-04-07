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
    // ── Knack scene / view ──────────────────────────────────
    sceneKey:          'scene_1155',
    viewKey:           'view_3680',

    // ── Make webhook for all review actions ────────────────────
    actionWebhook:     'https://hook.us1.make.com/PLACEHOLDER_BID_REVIEW',

    // ── DOM mount point (inserted after the source view) ──────
    mountSelector:     '#bid-review-matrix',

    // ── Knack field keys ──────────────────────────────────────
    fieldKeys: {
      // Record identity
      reviewRowId:     'field_2552',   // SYS_record ID

      // Row identity / pivot key
      relatedSowItem:  'field_2404',   // REL_sow Line Item (connection)
      displayLabel:    'field_2365',   // LABEL_set line item label (E-003, 00, etc.)
      productName:     'field_2379',   // STORED_product name

      // Package column (pivot axis)
      bidPackage:      'field_2415',   // REL_bid (connection — BD-1, BD-2, etc.)

      // Values displayed in bid cells
      labor:           'field_2401',   // CALC_sub bid extended ($)
      notes:           'field_2412',   // INPUT_survey notes
      laborDesc:       'field_2409',   // labor description (shown under price)
      bidExistCabling: 'field_2370',   // BOOL_existing cabling (bid side)

      // SOW detail fields (shown in SOW detail column)
      sowFee:          'field_2151',   // install fee on SOW line item
      sowProduct:      'field_1958',   // product connection on SOW line item
      sowLaborDesc:    'field_2019',   // labor description on SOW line item
      sowExistCabling: 'field_2461',   // BOOL_existing cabling (SOW side)

      // SOW connection (can have 1–2 connected records per line item)
      sow:             'field_2154',   // REL_SOW (connection — columns)

      // Grouping within each SOW grid
      proposalBucket:  'field_2366',   // REL_proposal bucket (sub-group within mdfIdf)
      mdfIdf:          'field_2375',   // REL_mdf-idf (location/IDF — primary group)
      sortOrder:       'field_2218',   // sort order for proposal bucket groups
    },

    // ── Timing ────────────────────────────────────────────────
    renderDelay:       200,     // ms to wait after view render
    toastDuration:     4000,    // ms before toast auto-dismiss

    // ── Debug ─────────────────────────────────────────────────
    debug:   true,
    eventNs: '.scwBidReview',
    cssId:   'scw-bid-review-css',
  };

})();
