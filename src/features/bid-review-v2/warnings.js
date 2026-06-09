/*** BID REVIEW V2 — WARNINGS ************************************************
 *
 * Surfaces the SAME issue warnings the worksheet-v2 Build-SOW grid shows
 * (missing required photos, disconnected cam/reader, wrong accessory) on
 * the comparison grid's SOW column.
 *
 * Design: don't re-implement the detection — delegate to worksheet-v2's
 * analyzer (window.SCW.worksheetV2.warnings). Those issue checks read
 * object-level fields (field_2219 bucket, field_2197 connected device,
 * field_2244 accessory-match, field_2464 parent) + scrape the source
 * view's photo cells (field_771 / field_2446 / field_2447). All of those
 * live on the SOW line-item object, and view_3921 (the SOW items view on
 * scene_1155) mirrors view_3610's columns — so pointing the analyzer at
 * view_3921 yields the same results as on the Build-SOW page.
 *
 * IMPORTANT: warnings are computed from SOW ITEMS ONLY (view_3921). Bid
 * records are never analyzed — a bid cell never carries a warning chip.
 *
 * Public API:
 *   ns.warnings.analyze(sowItems)      — run once per render
 *   ns.warnings.issuesFor(sowItemId)   — [] or [issueType, ...]
 *   ns.warnings.chipsHtml(sowItemId)   — chip markup for the SOW cell
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  // The SOW items view on scene_1155 — the analyzer reads its model +
  // native row DOM (photos) for the per-record checks.
  var SOW_VIEW = (ns.CONFIG && ns.CONFIG.sourceViewKeys && ns.CONFIG.sourceViewKeys[1]) ||
                 'view_3921';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // The worksheet-v2 analyzer (loaded from the same bundle, registered on
  // app boot regardless of scene). Returns null if unavailable so we fail
  // soft rather than throw.
  function wv2() {
    var w = window.SCW && window.SCW.worksheetV2 && window.SCW.worksheetV2.warnings;
    return (w && typeof w.analyze === 'function') ? w : null;
  }

  function analyze(sowItems) {
    var w = wv2();
    if (!w) return;
    try { w.analyze(sowItems || [], SOW_VIEW); }
    catch (e) {
      if (ns.CONFIG && ns.CONFIG.debug) console.warn('[scw-br-v2] warnings analyze failed', e);
    }
  }

  function issuesFor(sowItemId) {
    var w = wv2();
    if (!w || !sowItemId || typeof w.getIssuesFor !== 'function') return [];
    try { return w.getIssuesFor(SOW_VIEW, sowItemId) || []; }
    catch (e) { return []; }
  }

  /** Chip markup for one SOW item. One icon chip per issue type the item
   *  has (icon-only, label in the tooltip). Reuses worksheet-v2's ICONS +
   *  LABELS + data-issue-type so the colour coding matches the Build-SOW
   *  grid. Empty string when the item is clean. */
  function chipsHtml(sowItemId) {
    var w = wv2();
    if (!w) return '';
    var issues = issuesFor(sowItemId);
    if (!issues.length) return '';
    var ICONS  = w.ICONS  || {};
    var LABELS = w.LABELS || {};
    var parts = [];
    for (var i = 0; i < issues.length; i++) {
      var k = issues[i];
      parts.push('<span class="scw-bid-review-v2__warn-chip" ' +
        'data-issue-type="' + k + '" title="' + esc(LABELS[k] || k) + '">' +
        (ICONS[k] || '') + '</span>');
    }
    return '<div class="scw-bid-review-v2__warn-chips">' + parts.join('') + '</div>';
  }

  ns.warnings = {
    analyze:    analyze,
    issuesFor:  issuesFor,
    chipsHtml:  chipsHtml
  };
})();
/*** END BID REVIEW V2 — WARNINGS ********************************************/
