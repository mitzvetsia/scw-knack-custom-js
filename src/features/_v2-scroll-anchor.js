/*** V2 SCROLL ANCHOR ********************************************************
 *
 * Keeps the row/section nearest the top of the viewport visually STATIONARY
 * across an in-place v2 grid rebuild, so the page stops jumping to the top
 * (or bottom) after an inline edit. Both worksheet-v2 and bid-review-v2
 * rebuild their DOM wholesale on every data notify (knack-cell-update →
 * refetch → rebuild), which resets window scroll. This anchors on a stable
 * id-bearing element: measure its viewport offset before the rebuild, re-find
 * it after, and scrollBy the delta — robust even when content above changes
 * height.
 *
 * A single requestAnimationFrame ISN'T enough: after the synchronous rebuild,
 * layout keeps shifting for a few hundred ms (photo thumbnails decoding,
 * idempotent toolbar/pill/sort mounts, group-collapse re-applying), each of
 * which moves the anchor row AFTER a one-shot correction would have run —
 * causing intermittent drift. And when the anchor row can't be re-found that
 * frame (rebuild not settled yet, or the row scrolled out of view), a one-shot
 * helper just bails and leaves the browser clamped to the BOTTOM (the rebuilt
 * DOM is momentarily shorter while images load). So instead we run a bounded
 * SETTLE LOOP: re-pin the anchor every frame until it's stable for two frames
 * (or a time cap), abort if the user scrolls, and fall back to holding the
 * pre-rebuild scroll position whenever the anchor row isn't resolvable.
 *
 *   SCW.v2ScrollAnchor.around(rowSelector, idAttr, runRebuildFn)
 ****************************************************************************/
(function () {
  'use strict';
  window.SCW = window.SCW || {};
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  var MAX_MS = 600;          // stop re-pinning after this — bounds the loop
  var STABLE_FRAMES = 2;     // consecutive no-op frames = settled
  // Single-flight: a grid that fires SEVERAL renders per edit (e.g. bid-review-v2
  // refetches multiple source views, each triggering a render) would otherwise
  // spawn one settle loop per render — overlapping loops each chase a DIFFERENT
  // captured anchor and fight, drifting the page (observed: edit scrolls to the
  // bottom in several jumps). Each around() bumps this token; older loops see
  // they're superseded and abort, so only the latest render's loop runs.
  var _runToken = 0;

  function cssEsc(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\\]\[]/g, '\\$&');
  }

  function scrollY() {
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function around(rowSelector, idAttr, run) {
    var myToken = ++_runToken;   // supersede any in-flight settle loop
    var anchor = null;
    var prevY = scrollY();
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

    // Bounded settle loop. Re-pin the anchor (or hold prevY) every frame so
    // late layout shifts can't drift or clamp the page. Stops early once
    // stable, on a time cap, or the moment the user takes over scrolling.
    var startTs = null;
    var stable = 0;
    var userScrolled = false;
    function onUserScroll() { userScrolled = true; }
    // passive listeners — we only OBSERVE that the user grabbed the scroll.
    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchmove', onUserScroll, { passive: true });

    function cleanup() {
      window.removeEventListener('wheel', onUserScroll, { passive: true });
      window.removeEventListener('touchmove', onUserScroll, { passive: true });
    }

    function tick(ts) {
      if (userScrolled || myToken !== _runToken) { cleanup(); return; }
      if (startTs == null) startTs = ts || 0;
      var corrected = false;
      try {
        var el = anchor
          ? document.querySelector('[' + idAttr + '="' + cssEsc(anchor.key) + '"]')
          : null;
        if (el) {
          // Precise anchor: keep the captured row at its original viewport top.
          var delta = el.getBoundingClientRect().top - anchor.top;
          if (Math.abs(delta) > 1) { window.scrollBy(0, delta); corrected = true; }
        } else {
          // Anchor row not resolvable (no anchor captured, or its row isn't in
          // the rebuilt DOM yet / at all). Don't let the browser clamp to the
          // bottom — hold the pre-rebuild scroll position as a floor until the
          // row (re)appears, at which point the branch above takes over.
          var curY = scrollY();
          if (Math.abs(curY - prevY) > 1) { window.scrollTo(0, prevY); corrected = true; }
        }
      } catch (e) { /* ignore */ }
      stable = corrected ? 0 : stable + 1;
      var elapsed = (ts || 0) - startTs;
      if (stable >= STABLE_FRAMES || elapsed > MAX_MS) { cleanup(); return; }
      raf(tick);
    }
    raf(tick);
  }

  window.SCW.v2ScrollAnchor = { around: around };
})();
/*** END V2 SCROLL ANCHOR ***************************************************/
