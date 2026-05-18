/*** FEATURE: Hide data-source views ***/
/**
 * Several views are present on a page only because other custom-JS
 * features scrape their rendered DOM / Knack model for data — the
 * user has no business seeing or interacting with them. Knack's
 * builder doesn't expose a "render but hide" toggle, so we hide them
 * here via CSS.
 *
 * `display: none` keeps the elements in the DOM and lets Knack
 * populate the Backbone model normally — features that read from
 * `Knack.views[viewId].model` or `tr#<recordId>` selectors continue
 * to work because the markup is still rendered, just not painted.
 *
 * Three selector forms per view, because Knack/KTL nest views
 * differently in different contexts:
 *   1. `#view_XXXX`                                         — the view element itself
 *   2. `.view-column:has(> #view_XXXX)`                     — the column wrapper (so empty columns don't claim layout)
 *   3. `.scw-ktl-accordion:has(... data-view-key=view_XXXX)` — the KTL accordion shell, header + body
 *      (otherwise the accordion's "Title N" header stays visible even though the body is empty)
 *
 * Add views here as needed; keep the comment next to each one
 * explaining what consumes it so a future cleanup pass knows where
 * to look before deleting.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-hide-data-source-views-css';

  // viewId → consumer note. Comment is the documentation, not used
  // by the CSS — but keep it close to the id for grep-discovery.
  var HIDDEN_VIEWS = [
    // 'view_3827' — SOW kn-details: workflow-stepper SOURCE_VIEW,
    // create-sow-option-btn / preview-proposal-btn / import-unique-
    // items-btn read field_1199 / record id from this view's model.
    'view_3827',
    // 'view_3841' — SOW edit form used as a write target by ops-
    // review-pill (field_2725 + field_2736 PUTs) and by sales-change-
    // request as draftView for SOW record API calls.
    'view_3841',
    // 'view_3876' — workflow-stepper reads field_2329 here to build
    // the action link href.
    'view_3876',
    // 'view_3913' — hidden grid of all SOW line items on the project,
    // scraped by import-unique-items-btn for the sowId → lineItemIds
    // index (and itemId → label map). change-record-limit pumps it
    // to 1000 rows/page so the index covers the whole project.
    'view_3913',
    // 'view_3926' — DOC_files records connected to SOWs (field_2143)
    // and bid packages (field_2421). Bid-review render scrapes this
    // view to surface attached files in the SOW status bar and bid
    // column headers.
    'view_3926',
    // ── Bid Review comparison page (scene_1155) ───────────────
    // The bid-review feature replaces these source grids with its
    // own composite #bid-review-matrix mount. Keep them rendered
    // (Backbone models still need to populate) but visually hidden.
    // 'view_3680' — bid records (the bids being compared).
    'view_3680',
    // 'view_3921' — SOW line items (unbid noBid rows + worksheet
    // wsTrs that get moved into the expand panel).
    'view_3921',
    // 'view_3573' — bid package records (PDF link in the bid column
    // header).
    'view_3573',
    // 'view_3822' — MDF/IDF location records (group labels + L1
    // SCW notes / survey notes callouts).
    'view_3822',
    // 'view_3818' — pending Change Request records, scraped for the
    // CR badges and the "+ Add to bid" pending state.
    'view_3818',
    // 'view_3842' — BID_revision line items, read by sales-revision-
    // column.js and bid-review/init.js (revision card prefill) via
    // DOM scrape of the rendered grid.
    'view_3842',
    // 'view_3918' — Scopes of Work grid; bid-review's "next step"
    // surface reads/writes through this view (config.nextStepViewKey
    // + surveyCostsWriteView). Kept rendered for model access.
    'view_3918',
    // 'view_3920' — SOW_published proposals, sourced by bid-review
    // (config.proposalSourceView) to show published-proposal state.
    'view_3920',
    // 'view_3923' — Update Installation Project form view used by
    // bid-review's margin edit flow (field_2158 PUT target).
    'view_3923',
    // 'view_3927' — mounting-hardware accessory view; mirror-connection-
    // sync.js (ACCESSORIES_VIEW_ID) reads from it.
    'view_3927',
  ];

  if (!document.getElementById(STYLE_ID)) {
    var selectors = [];
    for (var i = 0; i < HIDDEN_VIEWS.length; i++) {
      var v = HIDDEN_VIEWS[i];
      selectors.push('#' + v);
      selectors.push('.view-column:has(> #' + v + ')');
      selectors.push('.view-column:has(> .kn-view#' + v + ')');
      // KTL accordion shell — hides both the header (e.g. "BID_packages")
      // AND the body in one shot. Without this rule, hiding only the
      // inner view leaves the accordion header visible with a "1" count
      // pill next to it.
      selectors.push('.scw-ktl-accordion:has(.scw-ktl-accordion__header[data-view-key="' + v + '"])');
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = selectors.join(',\n') +
      ' {\n  display: none !important;\n}\n';
    document.head.appendChild(style);
  }

  // Belt-and-suspenders: on each render of a hidden view, also set
  // inline display:none directly on the view element AND its KTL
  // accordion wrapper. Inline beats any external stylesheet, so even
  // if Knack or another feature re-shows the view at runtime, this
  // re-hides it. SCW.onViewRender is idempotent — registering once
  // per view is fine.
  function hideOnRender(viewId) {
    SCW.onViewRender(viewId, function () {
      var el = document.getElementById(viewId);
      if (!el) return;
      el.style.display = 'none';
      // Also try the parent column wrapper — Knack sometimes nests
      // grids inside a sized container that the CSS rule above misses.
      var col = el.closest('.view-column');
      if (col && col.children.length === 1) col.style.display = 'none';
      // Hide the KTL accordion shell if this view is wrapped in one.
      var acc = el.closest('.scw-ktl-accordion');
      if (acc) acc.style.display = 'none';
    }, 'scwHideDataSource');
  }
  for (var h = 0; h < HIDDEN_VIEWS.length; h++) hideOnRender(HIDDEN_VIEWS[h]);
})();
/*** END FEATURE: Hide data-source views ***/
