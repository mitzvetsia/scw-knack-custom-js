/*** SCROLL SPY (DIAGNOSTIC) **************************************************
 *
 * TEMPORARY instrumentation to pinpoint "the page/grid jumps around" bugs. It
 * does NOT change any behavior — it only LOGS:
 *
 *   1. Every PROGRAMMATIC scroll (window.scrollTo/scroll/scrollBy,
 *      Element.scrollIntoView, and direct scrollTop assignment) with a
 *      console.trace stack — so you see exactly which line scrolled the page.
 *   2. A watchdog that logs any window scrollY change > 40px that wasn't
 *      preceded by a real user gesture (wheel / touch / arrow keys) in the last
 *      250ms — catches NON-JS scrolls (focus-into-view, CSS, browser anchoring)
 *      too, with the active element at fault.
 *
 * ARMED BY DEFAULT on this build (so it works on whatever grid you're on —
 * just open the console and reproduce the jump). To silence it without a
 * rebuild:  localStorage.scwScrollSpy = '0'   (then reload). Re-enable:
 * localStorage.removeItem('scwScrollSpy').
 *
 * This is a debugging tool — REMOVE this file (+ its build.sh line) once the
 * jump is found; the perpetual rAF watchdog + global scroll monkey-patches add
 * a little overhead on every page.
 ****************************************************************************/
(function () {
  'use strict';
  var P = '[scw-scroll-spy]';

  // Armed everywhere by default; explicit '0' turns it off.
  function active() {
    try { return !(window.localStorage && localStorage.scwScrollSpy === '0'); }
    catch (e) { return true; }
  }

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
        console.warn(P + ' window.scrollTo(', arguments[0], arguments[1], ') from', y(),
          'docHeight=' + document.documentElement.scrollHeight);
        console.trace(P + ' scrollTo stack');
      }
      return _scrollTo.apply(window, arguments);
    };
  } catch (e) { /* ignore */ }

  try {
    var _scrollBy = window.scrollBy;
    window.scrollBy = function () {
      if (active()) {
        console.warn(P + ' window.scrollBy(', arguments[0], arguments[1], ') from', y());
        console.trace(P + ' scrollBy stack');
      }
      return _scrollBy.apply(window, arguments);
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

  // Direct scrollTop assignment (e.g. jQuery $(window).scrollTop(pos) on some
  // versions, or el.scrollTop = n) — window.scrollTo patching misses these.
  // Wrap the shared prototype accessor and only log for the scroll roots.
  try {
    var desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    if (desc && desc.set && desc.get) {
      Object.defineProperty(Element.prototype, 'scrollTop', {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set: function (v) {
          if (active() &&
              (this === document.scrollingElement ||
               this === document.documentElement ||
               this === document.body)) {
            console.warn(P + ' set ' + describe(this) + '.scrollTop=' + v + ' from', y());
            console.trace(P + ' scrollTop stack');
          }
          return desc.set.call(this, v);
        }
      });
    }
  } catch (e) { /* ignore */ }

  // ── Knack render-event tracker ───────────────────────────────────────
  // The watchdog sees docHeight collapse but can't say WHICH view rebuilt.
  // Log every view/records render with the view key + docHeight before/after
  // the render settles, so height collapses are attributable: the render
  // line whose docHeight matches the jump names the culprit.
  try {
    if (window.$ && window.$.fn) {
      var _renderLog = function (kind) {
        return function (e, view) {
          if (!active()) return;
          var key = (view && view.key) || '?';
          var h0 = document.documentElement.scrollHeight;
          console.warn(P + ' ' + kind + ' ' + key +
            ' docHeight=' + h0 + ' y=' + Math.round(y()));
          setTimeout(function () {
            var h1 = document.documentElement.scrollHeight;
            if (Math.abs(h1 - h0) > 150) {
              console.warn(P + ' ' + kind + ' ' + key +
                ' → docHeight ' + h0 + ' → ' + h1 + ' (Δ' + (h1 - h0) + ')');
            }
          }, 60);
        };
      };
      window.$(document).on('knack-view-render.any.scwScrollSpy', _renderLog('view-render'));
      window.$(document).on('knack-scene-render.any.scwScrollSpy', _renderLog('scene-render'));
    }
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
          var scene = '';
          try {
            scene = (window.Knack && Knack.router && Knack.router.current_scene_key) || '';
          } catch (eScene) { /* ignore */ }
          console.warn(P + ' scrollY ' + (d > 0 ? 'JUMP DOWN ' : 'JUMP UP ') + Math.round(d) +
            'px → ' + Math.round(cur) + ' (no user gesture). activeElement=' +
            describe(document.activeElement) +
            ' docHeight=' + document.documentElement.scrollHeight +
            (scene ? ' scene=' + scene : '') +
            ' hash=' + String(location.hash || '').slice(0, 80));
        }
      }
      _lastY = cur;
    } else {
      _lastY = y();
    }
    raf(tick);
  }
  raf(tick);

  if (active()) console.warn(P + ' armed — reproduce the jump and watch the log. Silence: localStorage.scwScrollSpy="0"');
})();
/*** END SCROLL SPY (DIAGNOSTIC) *********************************************/
