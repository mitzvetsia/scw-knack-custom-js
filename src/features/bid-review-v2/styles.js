/*** BID REVIEW V2 — STYLES ***************************************************
 *
 * Self-scoped CSS for the v2 panel. All rules nest under
 * .scw-bid-review-v2 so they cannot leak into v1 or the rest of the
 * scene.
 *
 * Banner mirrors worksheet-v2's WIP pill so the parallel build reads
 * consistently across the codebase.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns || !ns.CONFIG) return;

  if (document.getElementById(ns.CONFIG.cssId)) return;

  var css = [
    '.scw-bid-review-v2 {',
    '  margin: 24px 0 32px;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  color: #0f172a;',
    '}',
    '.scw-bid-review-v2-banner {',
    '  display: flex; align-items: center; gap: 8px;',
    '  padding: 10px 14px;',
    '  background: #f8fafc; border: 1px solid #e2e8f0;',
    '  border-radius: 8px 8px 0 0;',
    '  font-size: 13px; color: #334155;',
    '}',
    '.scw-bid-review-v2-pill {',
    '  display: inline-flex; align-items: center; gap: 4px;',
    '  padding: 2px 8px;',
    '  background: #6b21a8; color: #fff;',
    '  border-radius: 999px;',
    '  font-size: 11px; font-weight: 600; letter-spacing: 0.04em;',
    '  text-transform: uppercase;',
    '}',
    '.scw-bid-review-v2-count {',
    '  margin-left: auto;',
    '  color: #64748b; font-size: 12px;',
    '}',
    '.scw-bid-review-v2-body {',
    '  padding: 16px;',
    '  background: #fff;',
    '  border: 1px solid #e2e8f0; border-top: none;',
    '  border-radius: 0 0 8px 8px;',
    '  min-height: 80px;',
    '}',
    '.scw-bid-review-v2-empty {',
    '  color: #94a3b8; font-style: italic; font-size: 13px;',
    '  text-align: center; padding: 16px 0;',
    '}',
    '/* Cutover: when CONFIG.replaceV1 is true, init.js stamps this',
    '   attribute on <html> and v1’s grid mount is hidden. */',
    'html[data-scw-bid-review-v2-replace="1"] #bid-review-matrix {',
    '  display: none !important;',
    '}'
  ].join('\n');

  var style = document.createElement('style');
  style.id = ns.CONFIG.cssId;
  style.textContent = css;
  document.head.appendChild(style);
})();
/*** END BID REVIEW V2 — STYLES ***********************************************/
