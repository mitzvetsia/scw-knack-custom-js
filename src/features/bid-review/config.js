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
    sowItemsViewKey:   'view_3728',   // SOW items with no associated bid
    bidPackagesViewKey: 'view_3573',  // Bid package records (has PDF field)

    // ── Make webhook for all review actions ────────────────────
    actionWebhook:     'https://hook.us1.make.com/68ctc26m41uqijftkd66ny6m53r1l9sv',

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
      rate:            'field_2400',   // INPUT_sub bid rate (unit price)
      qty:             'field_2399',   // INPUT_bid quantity
      notes:           'field_2412',   // INPUT_survey notes
      laborDesc:       'field_2409',   // labor description (shown under price)
      bidExistCabling: 'field_2370',   // BOOL_existing cabling (bid side)
      bidConnDevice:   'field_2380',   // Connected Devices (bid side)
      bidConnTo:       'field_2381',   // Connected To (bid side — camera/reader only)
      bidMapConn:      'field_2374',   // FLAG_map camera or reader connections (bid side)

      // Payload-only fields (not displayed in grid)
      field2627:       'field_2627',
      dropLength:      'field_2367',
      conduit:         'field_2368',
      plenum:          'field_2371',
      sku:             'field_2328',
      price:           'field_2382',
      productDesc:     'field_2629',
      dropPrefix:      'field_2361',
      dropNumber:      'field_2362',
      exterior:        'field_2372',
      limitQtyOne:     'field_2373',
      bidPdf:          'field_2626',   // Current Bid PDF (file field on bid package)

      // SOW detail fields (shown in SOW detail column)
      sowQty:          'field_1964',   // quantity on SOW line item
      sowFee:          'field_2151',   // install fee on SOW line item
      sowProduct:      'field_1958',   // product connection on SOW line item
      sowLaborDesc:    'field_2019',   // labor description on SOW line item
      sowExistCabling: 'field_2461',   // BOOL_existing cabling (SOW side)
      sowConnDevice:   'field_1957',   // Connected Devices (SOW side)
      sowMapConn:      'field_2231',   // FLAG_map camera or reader connections (SOW side)

      // SOW connection (can have 1–2 connected records per line item)
      sow:             'field_2154',   // REL_SOW (connection — columns)

      // Grouping within each SOW grid
      proposalBucket:  'field_2366',   // REL_proposal bucket (sub-group within mdfIdf)
      mdfIdf:          'field_2375',   // REL_mdf-idf (location/IDF — primary group)
      sortOrder:       'field_2218',   // sort order for proposal bucket groups

      // Change request draft persistence (paragraph field on SOW record)
      changeRequestDraft: 'field_2684',
    },

    // ── SOW item fields (view_3728 — different keys than bid records) ──
    sowItemFieldKeys: {
      sow:             'field_2154',   // REL_SOW (same key as bid records)
      product:         'field_1949',   // product connection (display label)
      productName:     'field_1958',   // stored product name
      laborDesc:       'field_2020',   // labor description
      qty:             'field_1964',   // quantity
      fee:             'field_2151',   // sub bid total / install fee
      mdfIdf:          'field_1946',   // MDF/IDF location (NOTE: differs from bid field_2375)
      proposalBucket:  'field_2219',   // proposal bucket (NOTE: differs from bid field_2366)
      sortOrder:       'field_2218',   // sort order (same key)
      displayLabel:    'field_1950',   // display label
      existCabling:    'field_2461',   // existing cabling (same as SOW side)
      connDevice:      'field_1957',   // Connected Devices (SOW side)
      mapConn:         'field_2231',   // FLAG_map camera or reader connections (SOW side)
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
