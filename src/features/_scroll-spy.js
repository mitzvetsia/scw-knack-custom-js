/*** SCROLL SPY (DIAGNOSTIC) **************************************************
 *
 * TEMPORARY instrumentation to pinpoint the "page jumps to the bottom on
 * edit" bug on the bid comparison page (scene_1155). It does NOT change any
 * behavior — it only LOGS:
 *
 *   1. Every PROGRAMMATIC scroll (window.scrollTo/scroll, Element.scrollIntoView,
 *      and direct scrollTop assignment) with a console.trace stack — so we see
 *      exactly which line scrolled the page.
 *   2. A watchdog that logs any window scrollY change > 40px that wasn't
 *      preceded by a real user gesture (wheel / touch / arrow keys) in the last
 *      250ms — catches NON-JS scrolls (focus-into-view, CSS, browser anchoring)
 *      too, with the active element at fault.
 *
 * Enable: it auto-activates on scene_1155, OR anywhere if you run
 *   localStorage.scwScrollSpy = '1'   (then reload).
 * Disable: localStorage.removeItem('scwScrollSpy').
 *
 * Remove this file (+ its build.sh line) once the jump is found.
 ****************************************************************************/
(function () {
  'use strict';
  var P = '[scw-scroll-spy]';

  function onComparisonScene() {
    try {
      return !!(window.Knack && Knack.router &&
        Knack.router.current_scene_key === 'scene_1155');
    } catch (e) { return false; }
  }
  function forced() {
    try { return window.localStorage && localStorage.scwScrollSpy === '1'; }
    catch (e) { return false; }
  }
  function active() { return forced() || onComparisonScene(); }

  function y() { return window.pageYOffset || document.documentElement.scrollTop || 0; }

  function describe(el) {
    if (!el) return '(none)';
    var s = el.tagName ? el.tagName.toLowerCase() : '?';
    if (el.id) s += '#' + el.id;
    if (el.className && el.className.toString) {
      var c = el.className.toString().trim().split(/\s+/).slice(0, 3).join('.');
      if (c) s += '.' + c;
    }
    var f = el.getAttribute && (el.getAttribute('data-scw-br-v2-field') ||
      el.getAttribute('data-scw-ws-v2-field'));
    if (f) s += '[field=' + f + ']';
    return s;
  }

  // ── Patch programmatic scroll APIs (call through; just log) ──────────
  try {
    var _scrollTo = window.scrollTo;
    window.scrollTo = function () {
      if (active()) {
        console.warn(P + ' window.scrollTo(', arguments[0], arguments[1], ') from', y());
        console.trace(P + ' scrollTo stack');
      }
      return _scrollTo.apply(window, arguments);
    };
  } catch (e) { /* ignore */ }

  try {
    var _scroll = window.scroll;
    window.scroll = function () {
      if (active()) {
        console.warn(P + ' window.scroll(', arguments[0], arguments[1], ') from', y());
        console.trace(P + ' scroll stack');
      }
      return _scroll.apply(window, arguments);
    };
  } catch (e) { /* ignore */ }

  try {
    var _sIV = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function () {
      if (active()) {
        console.warn(P + ' Element.scrollIntoView on', describe(this), 'from', y());
        console.trace(P + ' scrollIntoView stack');
      }
      return _sIV.apply(this, arguments);
    };
  } catch (e) { /* ignore */ }

  // Direct scrollTop assignment on the scrolling element / body.
  try {
    [document.scrollingElement, document.documentElement, document.body].forEach(function (node) {
      if (!node) return;
      var proto = node === document.body ? HTMLBodyElement.prototype : Element.prototype;
      // Can't cleanly intercept per-instance scrollTop without clobbering the
      // shared prototype accessor; the watchdog below covers this path.
    });
  } catch (e) { /* ignore */ }

  // ── User-gesture tracker ────────────────────────────────────────────
  var _lastGesture = 0;
  function gesture() { _lastGesture = (window.performance && performance.now) ? performance.now() : 0; }
  window.addEventListener('wheel', gesture, { passive: true });
  window.addEventListener('touchmove', gesture, { passive: true });
  window.addEventListener('keydown', function (e) {
    if (e.key && /^(Arrow|Page|Home|End| )/.test(e.key)) gesture();
  }, true);

  // ── Watchdog — catch ANY scrollY change, JS or not ──────────────────
  var _lastY = y();
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  function tick() {
    if (active()) {
      var cur = y();
      var d = cur - _lastY;
      if (Math.abs(d) > 40) {
        var now = (window.performance && performance.now) ? performance.now() : 0;
        var userDriven = (now - _lastGesture) < 250;
        if (!userDriven) {
          console.warn(P + ' scrollY ' + (d > 0 ? 'JUMP DOWN ' : 'JUMP UP ') + Math.round(d) +
            'px → ' + Math.round(cur) + ' (no user gesture). activeElement=' +
            describe(document.activeElement) +
            ' docHeight=' + document.documentElement.scrollHeight);
        }
      }
      _lastY = cur;
    } else {
      _lastY = y();
    }
    raf(tick);
  }
  raf(tick);

  if (active()) console.warn(P + ' armed on this page — edit a field and watch the log.');
})();
/*** END SCROLL SPY (DIAGNOSTIC) *********************************************/
