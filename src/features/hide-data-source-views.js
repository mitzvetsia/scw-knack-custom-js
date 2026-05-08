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
  ];

  if (document.getElementById(STYLE_ID)) return;

  var selectors = [];
  for (var i = 0; i < HIDDEN_VIEWS.length; i++) {
    selectors.push('#' + HIDDEN_VIEWS[i]);
  }

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = selectors.join(',\n') +
    ' {\n  display: none !important;\n}\n';
  document.head.appendChild(style);
})();
/*** END FEATURE: Hide data-source views ***/
