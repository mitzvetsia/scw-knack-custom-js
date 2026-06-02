/*** BID REVIEW V2 — RENDER ***************************************************
 *
 * Phase 0: prove the data pipeline. Renders a banner + a count of
 * records pulled from each source view. Once Phase 1 lands (custom
 * bid-cell row with our own pickers/inputs), this file grows the real
 * grid renderer modeled on worksheet-v2/render.js.
 *
 * The renderer is intentionally cheap on Phase 0 — every notify fires
 * a full DOM rewrite into .scw-bid-review-v2-body. No diffing yet;
 * pivot-grid keyed updates can come once perf demands it.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function renderSnapshot(snapshot) {
    if (!ns.CONFIG) return;
    var container = document.getElementById(ns.CONFIG.mountId);
    if (!container) return;
    var body = container.querySelector('.scw-bid-review-v2-body');
    var count = container.querySelector('.scw-bid-review-v2-count');
    if (!body) return;

    var keys = Object.keys(snapshot);
    var totals = keys.map(function (k) {
      return { viewKey: k, n: (snapshot[k] || []).length };
    });
    var grand = totals.reduce(function (a, t) { return a + t.n; }, 0);

    if (count) {
      count.textContent = grand + ' record' + (grand === 1 ? '' : 's') +
        ' across ' + keys.length + ' view' + (keys.length === 1 ? '' : 's');
    }

    if (!grand) {
      body.innerHTML = '<div class="scw-bid-review-v2-empty">' +
        'Waiting for source views to load…</div>';
      return;
    }

    var rows = totals.map(function (t) {
      return '<tr><td style="padding:4px 12px 4px 0;color:#475569;">' +
        escapeHtml(t.viewKey) + '</td>' +
        '<td style="padding:4px 0;font-variant-numeric:tabular-nums;">' +
        t.n + '</td></tr>';
    }).join('');
    body.innerHTML =
      '<div style="font-size:12px;color:#64748b;margin-bottom:8px;">' +
      'Phase 0 — data pipeline check. Counts read from <code>Knack.views[k].model.data</code>:' +
      '</div>' +
      '<table style="font-size:13px;">' + rows + '</table>';
  }

  ns.render = { renderSnapshot: renderSnapshot };
})();
/*** END BID REVIEW V2 — RENDER ***********************************************/
