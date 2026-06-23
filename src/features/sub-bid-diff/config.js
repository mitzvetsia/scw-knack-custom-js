/*** SUB-BID DIFF — CONFIG ****************************************************
 *
 * Compares a subcontractor's bid (the line items on a bid PACKAGE) against
 * the SOW source-of-truth line items, and surfaces a tiered diff that
 * becomes the publish-time snapshot.
 *
 * WHY THIS LIVES ON scene_1155 (bid review), NOT the publish page:
 *   The "orphan" bid items — line items the sub priced that are NOT
 *   connected to a SOW line item — are unreachable from the SOW side by
 *   construction (no connection to chain, and the bundle can't run ad-hoc
 *   connection-filtered REST fetches). They ARE rendered in view_3680
 *   here, because that view is anchored on the bid PACKAGE. So the diff is
 *   computed where the full data already lives, then stamped onto the SOW.
 *   The Publish-as-Final modal later reads the stamp (Phase 2).
 *
 * Phase 1 (this deliverable): live diff engine + read-only review panel on
 * scene_1155. No stamping, no modal, no comments persistence yet.
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};
  var ns = (window.SCW.subBidDiff = window.SCW.subBidDiff || {});

  // Reuse bid-review v1's CONFIG verbatim — same scene, same view keys,
  // same field keys. If v1 hasn't loaded, we're not on scene_1155.
  var v1 = window.SCW.bidReview && window.SCW.bidReview.CONFIG;

  ns.CONFIG = {
    enabled: true,

    sceneKey: v1 && v1.sceneKey,                 // scene_1155

    // Source views (read straight off the Backbone models, no fetch).
    bidViewKey:      v1 && v1.viewKey,            // view_3680 — bid line items (has orphans)
    sowItemsViewKey: v1 && v1.sowItemsViewKey,    // view_3921 — SOW line items (source of truth)
    bidPkgViewKey:   v1 && v1.bidPackagesViewKey, // view_3573 — bid packages (status / name)

    // ── Field keys (from the bid record / SOW item / package) ──────────
    f: {
      // Bid line item (view_3680)
      bidToSowLine:  'field_2404',  // REL_sow Line Item — THE JOIN KEY (empty = orphan)
      bidToPackage:  'field_2415',  // REL_bid — which bid package this line belongs to
      bidLabor:      'field_2401',  // CALC_sub bid extended ($) — sub's labor on this line
      bidQty:        'field_2399',  // INPUT_bid quantity
      bidLabel:      'field_2365',  // LABEL_set line item label (E-003, etc.)
      bidProduct:    'field_2379',  // STORED_product name
      bidLaborDesc:  'field_2409',  // labor description

      // SOW line item (view_3921)
      sowLabor:      'field_2151',  // sub bid total / install fee — SOW's labor
      sowQty:        'field_1964',  // quantity
      sowLabel:      'field_1950',  // display label
      sowProduct:    'field_1949',  // product connection (display)
      sowMdfIdf:     'field_1946',  // MDF/IDF location (grouping)
      sowSortOrder:  'field_2218',  // canonical sort order

      // Bid package (view_3573)
      pkgName:       'field_2636',  // friendly name (BD-1, BD-2…)
      pkgStatus:     'field_2550',  // Bid status (free text — no enum)
      pkgToSow:      'field_2387',  // REL_SOW
      pkgPdf:        'field_2626'   // Current Bid PDF (file)
    },

    // ── Explicit "basis bid" designation ──────────────────────────────
    // The diff is ALWAYS against the bid the user explicitly designates as
    // the basis for this SOW → Proposal — never an auto-pick. Persisted as
    // a single-connection field on the SOW (SOW → bid package). Until the
    // Knack field exists, leave basisBidField '' and the panel uses an
    // interim in-session selector (still explicit — the user must choose).
    basisBidField: 'field_2942', // REL_proposal basis — SOW→bid package (single connection)
    basisBidView:  'view_3918',  // SOW records write view on scene_1155 (must expose field_2942)

    // A package whose status text reads complete/submitted — surfaced as a
    // hint next to each option, NOT used to auto-select.
    completeStatusRe: /complete|submit|final|received|done/i,

    // ── Diff tiers ─────────────────────────────────────────────────────
    // Severity ladder. Nothing is ever hidden — noise is demoted, not
    // deleted. Colors follow the repo warning convention (amber = material,
    // rose = coverage gap, slate = informational).
    TIERS: {
      covered: { rank: 0, label: 'Covered',       color: '#475569' }, // matched, no labor delta
      spec:    { rank: 1, label: 'Spec change',   color: '#4f46e5' }, // matched, non-labor attr differs
      material:{ rank: 2, label: 'Labor change',  color: '#b45309' }, // matched, labor delta ≠ 0
      added:   { rank: 3, label: 'Not bid',       color: '#be123c' }, // SOW line w/ no bid item (coverage gap)
      orphan:  { rank: 3, label: 'Bid only',      color: '#be123c' }  // bid item w/ no live SOW line
    },

    // Money equality tolerance (cents) — avoids float-noise "labor change".
    moneyEps: 0.005,

    debug:   false,
    eventNs: '.scwSubBidDiff',
    cssId:   'scw-sub-bid-diff-css',
    mountId: 'scw-sub-bid-diff'
  };
})();
/*** END SUB-BID DIFF — CONFIG ************************************************/
