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

  var SOURCE_VIEW = 'view_3886';   // Published proposals (data source)
  var TARGET_VIEW = 'view_3883';   // Where to inject the block
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
      // the proposal is live. We deliberately DON'T supply an
      // expiredFallbackUrl: staff viewing this widget are already on
      // the published-proposal details page, so a "View Published
      // Details" button would just link to the page they're on. The
      // expired-warning blurb still renders.
      customerLink: {
        url:   (proposal && proposal.tokenUrl) || '',
        label: 'Open Customer Link'
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
