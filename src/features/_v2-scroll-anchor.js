/*** V2 SCROLL ANCHOR ********************************************************
 *
 * Keeps the row/section nearest the top of the viewport visually STATIONARY
 * across an in-place v2 grid rebuild, so the page stops jumping to the top
 * after an inline edit. Both worksheet-v2 and bid-review-v2 rebuild their DOM
 * wholesale on every data notify (knack-cell-update → refetch → rebuild),
 * which resets window scroll. This anchors on a stable id-bearing element:
 * measure its viewport offset before the rebuild, re-find it after, and
 * scrollBy the delta — robust even when content above changes height.
 *
 *   SCW.v2ScrollAnchor.around(rowSelector, idAttr, runRebuildFn)
 ****************************************************************************/
(function () {
  'use strict';
  window.SCW = window.SCW || {};
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };

  function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\\]\[]/g, '\\$&');
  }

  function around(rowSelector, idAttr, run) {
    var anchor = null;
    try {
      var rows = document.querySelectorAll(rowSelector);
      var guard = 72;                       // clear sticky toolbars / headers
      var vh = window.innerHeight || document.documentElement.clientHeight;
      for (var i = 0; i < rows.length; i++) {
        var key = rows[i].getAttribute(idAttr);
        if (!key) continue;
        var r = rows[i].getBoundingClientRect();
        // First row still visible below the sticky-header guard.
        if (r.bottom > guard && r.top < vh) { anchor = { key: key, top: r.top }; break; }
      }
    } catch (e) { /* ignore — fall through to a plain rebuild */ }

    run();

    if (!anchor) return;
    raf(function () {
      try {
        var el = document.querySelector('[' + idAttr + '="' + cssEsc(anchor.key) + '"]');
        if (!el) return;
        var delta = el.getBoundingClientRect().top - anchor.top;
        if (Math.abs(delta) > 1) window.scrollBy(0, delta);
      } catch (e) { /* ignore */ }
    });
  }

  window.SCW.v2ScrollAnchor = { around: around };
})();
/*** END V2 SCROLL ANCHOR ***************************************************/
