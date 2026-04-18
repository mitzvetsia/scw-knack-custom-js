/*** SALES CHANGE REQUEST — CONFIGURATION ***/
/**
 * Centralized config for the Sales Change Request feature.
 * All view IDs, field keys, webhook URLs, and tuning knobs live here.
 *
 * Writes: SCW.salesCR.CONFIG
 */
(function () {
  'use strict';

  var ns = (window.SCW.salesCR = window.SCW.salesCR || {});

  ns.CONFIG = {
    // ── Knack scene / views ────────────────────────────────
    worksheetView:    'view_3586',   // SOW line-item device worksheet (primary grid)
    proposalView:     'view_3491',   // Proposal details — has field_2706 (add-mode flag)
    revisionView:     'view_3837',   // Submitted revision line items (data source, hidden)

    // ── Add-mode detection ─────────────────────────────────
    // When field_2706 = "Yes" on the proposal view, records in the
    // worksheet where field_2586 != 0 are treated as "add" change requests.
    addModeField:     'field_2706',  // on proposalView — "Yes" = revisions active
    addCountField:    'field_2586',  // on worksheetView — != 0 → treat as "add" CR

    // ── Display / identity fields (worksheetView) ──────────
    labelField:       'field_1950',  // display label (e.g. "E-003")
    productField:     'field_1949',  // product name
    bucketField:      'field_2219',  // proposal bucket (grouping)
    laborHoursField:  'field_1981',  // product-specific default labor hours

    // ── Make webhooks ──────────────────────────────────────
    submitWebhook:    'https://hook.us1.make.com/jlbup3quzdjcsfzyyr38vxjo51et050a',
    draftWebhook:     'https://hook.us1.make.com/PLACEHOLDER_SALES_CR_DRAFT',

    // ── Revision injection (view_3837 → view_3586) ─────────
    // These are the same revision-request-line-item fields used
    // by bid-revision-inject.js (view_3823 → view_3505).
    revSowItemField:  'field_2644',  // connection: revision → SOW line item
    revStatusField:   'field_2645',  // revision status text
    revHtmlField:     'field_2695',  // rich-text HTML card
    revJsonField:     'field_2696',  // JSON data

    // ── Fields tracked for automatic change detection ──────
    // Any inline edit on these fields in the worksheet creates
    // or updates a pending "revise" (or "add") change request.
    trackedFields: [
      { key: 'field_1949', label: 'Product',           type: 'connection' },
      { key: 'field_1964', label: 'Quantity',          type: 'number' },
      { key: 'field_2261', label: 'Custom Discount %', type: 'number', pct: true },
      { key: 'field_2262', label: 'Custom Discount $', type: 'number', currency: true },
      { key: 'field_2020', label: 'Labor Description', type: 'text' },
      { key: 'field_1953', label: 'SCW Notes',         type: 'text' },
      { key: 'field_2461', label: 'Existing Cabling',  type: 'boolean' },
      { key: 'field_1984', label: 'Exterior',          type: 'boolean' },
      { key: 'field_1965', label: 'Drop Length',       type: 'text' },
      { key: 'field_1951', label: 'Drop Number',       type: 'number' },
      { key: 'field_2240', label: 'Drop Prefix',       type: 'connection' },
      { key: 'field_2150', label: 'Sub Bid',           type: 'number' },
      { key: 'field_1957', label: 'Connected Devices', type: 'connection' },
      { key: 'field_2197', label: 'Connected To',      type: 'connection' },
      { key: 'field_2219', label: 'Proposal Bucket',   type: 'connection' },
    ],

    // ── Timing ─────────────────────────────────────────────
    uiDelay:          500,     // ms after view render before injecting UI
    toastDuration:    3000,    // ms before toast auto-dismiss

    // ── Persistence ────────────────────────────────────────
    storageKey:       'scw-sales-cr-pending',
    draftField:       'field_2707',  // paragraph field on SOW record for cross-session draft
    draftView:        'view_3841',  // editable view on the same page for SOW record API calls

    // ── Debug / styling ────────────────────────────────────
    debug:            true,
    eventNs:          '.scwSalesCR',
    cssId:            'scw-sales-cr-css',
    barId:            'scw-sales-cr-bar',
    prefix:           'scw-scr',   // CSS class prefix
  };

})();
