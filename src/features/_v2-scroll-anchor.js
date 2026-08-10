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
 * On top of the loop, a DOC-HEIGHT FLOOR (body min-height = pre-rebuild
 * scrollHeight, ~1.5s) makes the browser's scroll CLAMP impossible while the
 * rebuilt DOM is transiently short — the clamp fires between frames with no
 * JS scroll involved, so it's the one jump the loop alone can't stop (see
 * the FLOOR_MS note below).
 *
 *   SCW.v2ScrollAnchor.around(rowSelector, idAttr, runRebuildFn)
 ****************************************************************************/
(function () {
  'use strict';
  window.SCW = window.SCW || {};
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  var MAX_MS = 600;          // stop re-pinning after this — bounds the loop
  var STABLE_FRAMES = 2;     // consecutive no-op frames = settled
  // Don't CHASE a large DOWNWARD shift of the anchor row. A big positive delta
  // (row pushed down) means content grew ABOVE the viewport — a photo decoding,
  // or a NEW photo added by a file upload / Make-webhook refresh. Scrolling the
  // page to follow it is itself the visible "jump" (scroll-spy caught a lone
  // scrollBy(+243) after a webhook on view_3505). Small reflows still re-pin,
  // and UPWARD shifts (rebuild clamp / shrink → negative delta) still restore.
  var BIG_DOWN = 100;
  // Symmetric guard for the OTHER direction. A big UPWARD shift of the anchor
  // row (large NEGATIVE delta) means content above the viewport SHRANK mid-
  // settle — a group re-applying its collapsed state after the rebuild, a tall
  // photo swapping short, an image that hadn't reserved height. Chasing it with
  // scrollBy(negativeDelta) yanks the page toward the top — the "bounce back to
  // the top on edit" users hit on the survey/bid grid (scroll-spy caught a lone
  // scrollBy(-6526)). Don't chase it; hold the pre-edit scroll and let the
  // precise re-pin below take over once the layout settles (delta shrinks).
  var BIG_UP = 100;
  // How long we'll actively FIGHT a big/unresolved shift by holding the
  // pre-edit scrollY (window.scrollTo(0, prevY)). This covers the transient
  // case the hold exists for — images/photos still decoding, the doc will
  // grow back shortly. Beyond this window, a big shift that's STILL there
  // means the anchor row genuinely relocated — e.g. a Connected Devices edit
  // on the survey/bid worksheet (view_3505) moving a cam/reader to a
  // different MDF/IDF group via the mirror-connection-sync cascade. That's a
  // PERMANENT reposition, not a transient reflow, so continuing to force the
  // stale absolute scrollY back is itself the jump (scroll-spy caught a lone
  // scrollTo bringing scrollY BACK UP 853px after the page had already
  // settled shorter). Past HOLD_MS, stop holding and let the page sit
  // wherever the rebuild naturally left it.
  var HOLD_MS = 250;
  // Single-flight: a grid that fires SEVERAL renders per edit (e.g. bid-review-v2
  // refetches multiple source views, each triggering a render) would otherwise
  // spawn one settle loop per render — overlapping loops each chase a DIFFERENT
  // captured anchor and fight, drifting the page (observed: edit scrolls to the
  // bottom in several jumps). Each around() bumps this token; older loops see
  // they're superseded and abort, so only the latest render's loop runs.
  var _runToken = 0;

  // ── Doc-height floor (browser-clamp guard) ─────────────────────────────
  // The rebuilt DOM is transiently SHORTER than what it replaced while photo
  // strips re-decode and late mounts fill back in. If the document's
  // scrollable range dips below the current scrollY for even one layout
  // pass, the BROWSER clamps the scroll to the new bottom — no scrollTo/
  // scrollBy involved, so nothing for scroll-spy to trace; the page just
  // "randomly" jumps up and stays there when the content regrows (observed
  // on scene_1140: every MDF save's refetch→rebuild landed scrollY at
  // exactly docHeight − viewportHeight). The settle loop can't prevent it —
  // the clamp fires between our frames and re-clamps as long as the doc
  // stays short. So FLOOR the height across the rebuild: body min-height =
  // the pre-rebuild scrollHeight, released after FLOOR_MS (images have
  // decoded and layout has settled by then) or as soon as the user scrolls
  // (their gesture re-legitimizes wherever the page sits). Re-arming while
  // active just refreshes the window, so a render storm stays floored until
  // FLOOR_MS after its last rebuild.
  var FLOOR_MS = 1500;
  var _floorTimer = 0;
  var _floorPrev = null;   // body.style.minHeight to restore ('' typically)
  function releaseFloor() {
    if (_floorTimer) { clearTimeout(_floorTimer); _floorTimer = 0; }
    if (_floorPrev !== null) {
      try { document.body.style.minHeight = _floorPrev; } catch (e) { /* ignore */ }
      _floorPrev = null;
    }
  }
  function applyFloor(px) {
    if (!px) return;
    try {
      if (_floorPrev === null) _floorPrev = document.body.style.minHeight || '';
      document.body.style.minHeight = px + 'px';
    } catch (e) { return; }
    if (_floorTimer) clearTimeout(_floorTimer);
    _floorTimer = setTimeout(releaseFloor, FLOOR_MS);
    // One-shot user-gesture release (once: they self-remove; releaseFloor
    // is idempotent, so a stale one firing later is a no-op).
    window.addEventListener('wheel', releaseFloor, { passive: true, once: true });
    window.addEventListener('touchmove', releaseFloor, { passive: true, once: true });
  }

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
    // Pre-rebuild doc height: the clamp-guard floor (below) and the
    // displacement-vs-layout test in the settle loop both key off it.
    var capH = 0;
    try { capH = document.documentElement.scrollHeight; } catch (eF) { /* ignore */ }
    // Clamp guard — skipped at the top of the page (nothing to clamp).
    var floorPx = prevY > 0 ? capH : 0;
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
    // Floor AFTER the swap so the short rebuilt DOM never shrinks the
    // scrollable range below where the user sits (see the note on FLOOR_MS).
    applyFloor(floorPx);

    // Bounded settle loop. Re-pin the anchor (or hold prevY) every frame so
    // late layout shifts can't drift or clamp the page. Stops early once
    // stable, on a time cap, or the moment the user takes over scrolling.
    var startTs = null;
    var stable = 0;
    var userScrolled = false;
    function onUserScroll() { userScrolled = true; }
    // Keyboard scrolling counts as the user taking over too — now that the
    // loop CHASES displacement, it must never fight a PageUp/arrow scroll.
    // Keys typed into inputs don't scroll the page, so they don't abort.
    function onKeyScroll(e) {
      if (!e.key || !/^(Arrow|Page|Home|End| )/.test(e.key)) return;
      var t = e.target;
      if (t && (t.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      userScrolled = true;
    }
    // passive listeners — we only OBSERVE that the user grabbed the scroll.
    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchmove', onUserScroll, { passive: true });
    window.addEventListener('keydown', onKeyScroll, true);

    function cleanup() {
      window.removeEventListener('wheel', onUserScroll, { passive: true });
      window.removeEventListener('touchmove', onUserScroll, { passive: true });
      window.removeEventListener('keydown', onKeyScroll, true);
    }

    function tick(ts) {
      if (userScrolled || myToken !== _runToken) { cleanup(); return; }
      if (startTs == null) startTs = ts || 0;
      var elapsed = (ts || 0) - startTs;
      var withinHoldWindow = elapsed < HOLD_MS;
      var corrected = false;
      try {
        var el = anchor
          ? document.querySelector('[' + idAttr + '="' + cssEsc(anchor.key) + '"]')
          : null;
        if (el) {
          // Precise anchor: keep the captured row at its original viewport top —
          // but never CHASE a big downward shift (content added above = a jump).
          var delta = el.getBoundingClientRect().top - anchor.top;
          if (delta > BIG_DOWN || delta < -BIG_UP) {
            // Big shift — TWO causes that need OPPOSITE responses:
            //  · LAYOUT: content above grew/shrank, and the doc height moved
            //    with it. Chasing that is itself a jump (the scrollBy(+243) /
            //    scrollBy(-6526) incidents in the notes above) → old
            //    behavior: hold prevY within HOLD_MS, then let it settle.
            //  · DISPLACEMENT: the doc height is UNCHANGED and the anchor
            //    moved anyway — nothing reflowed; something scrolled the
            //    WINDOW out from under the user (Knack scrolling after a
            //    render through a pre-patch native scrollTo reference —
            //    invisible to scroll-spy, observed on scene_1140 as
            //    -600/-955px "no user gesture" jumps at a rock-stable
            //    docHeight). That one we CHASE: restoring the anchor row's
            //    viewport spot exactly undoes the external scroll.
            var hNow = 0;
            try { hNow = document.documentElement.scrollHeight; } catch (eH) { /* ignore */ }
            var heightStable = capH > 0 && hNow > 0 && Math.abs(hNow - capH) < 80;
            if (heightStable) {
              window.scrollBy(0, delta); corrected = true;
            } else if (withinHoldWindow && Math.abs(scrollY() - prevY) > 1) {
              window.scrollTo(0, prevY); corrected = true;
            }
          } else if (Math.abs(delta) > 1) {
            window.scrollBy(0, delta); corrected = true;
          }
        } else if (withinHoldWindow) {
          // Anchor row not resolvable (no anchor captured, or its row isn't in
          // the rebuilt DOM yet / at all). Don't let the browser clamp to the
          // bottom — hold the pre-rebuild scroll position as a floor until the
          // row (re)appears, at which point the branch above takes over. Only
          // within HOLD_MS — if the row never comes back, it moved for good.
          var curY = scrollY();
          if (Math.abs(curY - prevY) > 1) { window.scrollTo(0, prevY); corrected = true; }
        }
      } catch (e) { /* ignore */ }
      stable = corrected ? 0 : stable + 1;
      if (stable >= STABLE_FRAMES || elapsed > MAX_MS) { cleanup(); return; }
      raf(tick);
    }
    raf(tick);
  }

  // ── Edit-time guard — capture-early / restore-late ─────────────────────
  // The property that made the v1 pages' preserve-scroll-on-refresh
  // coordinator win this fight: it snapshots scroll at EDIT time (on
  // knack-cell-update, before any render), then restores after the storm
  // settles — so a scroll fired DURING Knack's own render can't survive.
  // around() can't cover that flow: it captures at REBUILD time, which on
  // a Knack-native render (model.fetch → view render → our rebuild) is
  // already AFTER Knack scrolled — it then faithfully preserves the wrong
  // position (observed on scene_1140: the JUMP logs BEFORE the
  // view-render event). guard(ms) is the capture-early port for
  // programmatic save paths (MDF saves etc.) that never fire a native
  // knack-cell-update: call it right before the PUT; for the next `ms` a
  // per-frame watchdog snaps back any big no-gesture displacement while
  // the doc height is stable, and re-baselines on genuine layout changes
  // so a later external scroll is still caught. User input cancels it.
  // ROW-anchored, not pixel-anchored: on this page the doc height naturally
  // jitters 100-450px per rebuild (lazy photos, group state), so "did the
  // height change?" cannot separate legit reflow from an external scroll —
  // but the row nearest the viewport top IS the user's context either way.
  // Whatever moves it (Knack's scroll OR content shrinking above), putting
  // it back at its captured viewport offset restores what the user was
  // looking at. Only BIG displacements are chased — around()'s settle loop
  // owns fine re-pinning during its own window.
  var GUARD_MS_DEFAULT = 3000;   // save + fetch + render storm + Knack's late scroll
  var GUARD_JUMP_PX = 120;       // below this, leave the page alone
  var _guardToken = 0;
  var _guardUntil = 0;           // first capture wins while a guard is active
  function nowMs() {
    return (window.performance && performance.now) ? performance.now() : 0;
  }
  function guard(ms, rowSelector, idAttr) {
    rowSelector = rowSelector || '[data-scw-ws-v2-record]';
    idAttr = idAttr || 'data-scw-ws-v2-record';
    if (!(ms > 0)) ms = GUARD_MS_DEFAULT;
    // A storm arms the guard repeatedly (save → refetch → coalesced
    // refetch…). Only the FIRST capture has a pre-storm baseline — a
    // re-capture mid-storm could anchor a just-jumped position and defend
    // the wrong spot. Keep the active guard; gestures cancel it, so a
    // fresh arm after real user scrolling still baselines fresh.
    var armT = nowMs();
    if (armT && armT < _guardUntil) return;
    _guardUntil = armT + ms;
    var token = ++_guardToken;   // a newer guard supersedes an EXPIRED one
    // Same nearest-visible-row capture as around() — but at SAVE time,
    // before any render can move the page.
    var anchor = null;
    try {
      var rows = document.querySelectorAll(rowSelector);
      var guardPx = 72;
      var vh = window.innerHeight || document.documentElement.clientHeight;
      for (var i = 0; i < rows.length; i++) {
        var key = rows[i].getAttribute(idAttr);
        if (!key) continue;
        var r = rows[i].getBoundingClientRect();
        if (r.bottom > guardPx && r.top < vh) { anchor = { key: key, top: r.top }; break; }
      }
    } catch (e) { /* no anchor → guard is a no-op */ }
    if (!anchor) return;
    var t0 = null;
    function cancel() {
      if (token === _guardToken) _guardToken++;
      cleanup();
    }
    function onKey(e) {
      if (!e.key || !/^(Arrow|Page|Home|End| )/.test(e.key)) return;
      var t = e.target;
      if (t && (t.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      cancel();
    }
    function cleanup() {
      window.removeEventListener('wheel', cancel, { passive: true });
      window.removeEventListener('touchmove', cancel, { passive: true });
      window.removeEventListener('keydown', onKey, true);
    }
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchmove', cancel, { passive: true });
    window.addEventListener('keydown', onKey, true);
    function tick(ts) {
      if (token !== _guardToken) { cleanup(); return; }
      if (t0 == null) t0 = ts || 0;
      if ((ts || 0) - t0 > ms) { cleanup(); return; }
      try {
        var el = document.querySelector(
          '[' + idAttr + '="' + cssEsc(anchor.key) + '"]');
        // A row inside a collapsed group reads rect 0,0 — never anchor math
        // against a hidden element.
        if (el && el.getClientRects().length) {
          var delta = el.getBoundingClientRect().top - anchor.top;
          if (Math.abs(delta) > GUARD_JUMP_PX) window.scrollBy(0, delta);
        }
      } catch (e2) { /* keep watching */ }
      raf(tick);
    }
    raf(tick);
  }

  window.SCW.v2ScrollAnchor = { around: around, guard: guard };
})();
/*** END V2 SCROLL ANCHOR ***************************************************/
