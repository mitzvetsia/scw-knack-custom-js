/*** FEATURE: Published-quote info on the proposal page (view_3883) ***/
/**
 * Mounts the shared SCW.publishedQuoteInfo widget into view_3883 on
 * the single-SOW proposal page. Reads view_3886 (filtered to status =
 * Published) and renders the same block ops-review-pill.js renders
 * per row in the SOW grid — just sized up via the 'regular' variant.
 *
 * All data extraction, CSS, and DOM construction live in
 * published-quote-info.js. This file's only job is to wire the
 * source/target views and re-bind on Knack re-renders.
 */
(function () {
  'use strict';

  // view_3883 is a kn-details view of the published-proposal record on
  // this scene — same record we want to surface, so it serves as both
  // the data SOURCE and the INJECT target. publishedQuoteInfo.read
  // handles both list-view (model.data.models[]) and details-view
  // (model.attributes) shapes.
  var SOURCE_VIEW = 'view_3883';
  var TARGET_VIEW = 'view_3883';
  var NS          = '.scwPublishedQuote';

  function transform() {
    if (!window.SCW || !SCW.publishedQuoteInfo) return;
    var host = document.getElementById(TARGET_VIEW);
    if (!host) return;
    var proposal = SCW.publishedQuoteInfo.read({ sourceView: SOURCE_VIEW });
    SCW.publishedQuoteInfo.renderInto(host, proposal, {
      variant:   'regular',
      header:    'Published Proposal',
      emptyText: 'No published quotes',
      // No linkBuilder — proposal name is plain text. The customer
      // link is the only navigation users need.
      //
      // Customer Link uses the tokenized public URL (field_2908) when
      // the proposal is live. When expired, fall back to the internal
      // details page so there's always an actionable button — matching
      // the totals panel on view_3418.
      customerLink: {
        url:                  (proposal && proposal.tokenUrl)  || '',
        label:                'Open Customer Link',
        expiredFallbackUrl:   (proposal && proposal.viewLink)  || '',
        expiredFallbackLabel: 'View Published Details'
      }
    });
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(SOURCE_VIEW, function () { setTimeout(transform, 150); }, NS);
    SCW.onViewRender(TARGET_VIEW, function () { setTimeout(transform, 150); }, NS);
  } else {
    $(document)
      .off('knack-view-render.' + SOURCE_VIEW + NS)
      .on('knack-view-render.' + SOURCE_VIEW + NS, function () { setTimeout(transform, 150); })
      .off('knack-view-render.' + TARGET_VIEW + NS)
      .on('knack-view-render.' + TARGET_VIEW + NS, function () { setTimeout(transform, 150); });
  }

  // First-paint attempt in case both views are already in the DOM by
  // the time this IIFE runs.
  if (document.getElementById(TARGET_VIEW) && document.getElementById(SOURCE_VIEW)) {
    setTimeout(transform, 150);
  }
})();
