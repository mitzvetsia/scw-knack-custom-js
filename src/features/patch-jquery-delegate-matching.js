/*** PATCH — jQuery delegated-event matching (Knack vendored 1.8.1) ***/
/*
 * Knack's vendored jQuery 1.8.1 ships the PRE-1.8.2 delegated-event
 * matcher: $.event.dispatch tests every delegated selector against every
 * bubble ancestor with `$(sel, root).index(cur) >= 0` — a full jQuery
 * construction + document-wide querySelectorAll PER SELECTOR PER
 * ANCESTOR on EVERY event. On big scenes (bid compare, ~15k nodes)
 * that is 330–750ms of pure selector matching per click (perf traces
 * 2026-07-30) — before any handler even runs — and it grows with DOM
 * size. Programmatic .focus()/.blur() pays the same bill through the
 * delegated-focus "simulate" path, which resolves dispatch dynamically.
 *
 * jQuery 1.8.2 fixed this upstream (jQuery bug #12359) with SEED-BASED
 * Sizzle matching — $.find(sel, root, null, [cur]) tests one element in
 * ~microseconds — falling back to the legacy path only for selectors
 * that genuinely need the root context (leading combinators `> .x` and
 * positional :first/:eq/…, detected by Sizzle's own needsContext regex,
 * which this vendored build already carries in $.expr.match.needsContext;
 * .closest() uses it).
 *
 * This feature backports EXACTLY that fix: $.event.dispatch is replaced
 * with a faithful port of the vendored build's own dispatch body
 * (de-minified from the live k_e0fc….js and diff-verified 2026-07-30)
 * where ONLY the selector-match expression is upgraded to the 1.8.2
 * form. Preserved verbatim, in order:
 *   - $.event.fix(e || window.event) + args = [].slice.call(arguments)
 *     pass-through — the knack-cell-update 5th-arg (triggerIds) contract
 *     that the field_1957↔field_2197 mirror cascade depends on rides on
 *     these extra trigger args;
 *   - special-event preDispatch early-return and postDispatch hooks,
 *     and the per-origType special handle lookup (focus/blur simulate);
 *   - the disabled-element click ancestor guard;
 *   - exclusive/namespace filtering incl. namespace_re (every namespaced
 *     .scwXxx binding depends on it);
 *   - delegateTarget/currentTarget assignment, isPropagationStopped /
 *     isImmediatePropagationStopped checks, and false-return →
 *     preventDefault() + stopPropagation().
 *
 * FAIL-SAFE: installs only when every precondition verifies — vendored
 * jQuery reports 1.8.1, the legacy `.index(` matcher is present, no
 * needsContext branch exists yet (a future Knack jQuery upgrade makes
 * this a no-op), and the Sizzle surface ($.find + needsContext regex)
 * is available. Any mismatch → silent no-op: Knack's original dispatch
 * keeps running, slow but correct. The install itself is wrapped in
 * try/catch that restores the original on any throw. $.event.handle
 * (aliased by value at jQuery load) is re-pointed alongside dispatch.
 */
(function () {
  'use strict';

  var $ = window.jQuery;
  if (!$ || !$.event || typeof $.event.dispatch !== 'function' || !$.fn) return;

  var orig = $.event.dispatch;

  try {
    if ($.fn.jquery !== '1.8.1') return;
    var src = String(orig);
    if (src.indexOf('needsContext') !== -1) return;   // already fast
    if (src.indexOf('.index(') === -1) return;        // not the matcher we verified
    if (typeof $.find !== 'function') return;
    var NEEDS_CONTEXT = $.expr && $.expr.match && $.expr.match.needsContext;
    if (!(NEEDS_CONTEXT instanceof RegExp)) return;

    function dispatch(event) {
      event = $.event.fix(event || window.event);

      var i, j, cur, ret, selMatch, matched, matches, handleObj, sel,
          handlers = ($._data(this, 'events') || {})[event.type] || [],
          delegateCount = handlers.delegateCount,
          args = [].slice.call(arguments),
          runAll = !event.exclusive && !event.namespace,
          special = $.event.special[event.type] || {},
          handlerQueue = [];

      args[0] = event;
      event.delegateTarget = this;

      // preDispatch returning false skips everything (incl. postDispatch)
      // — same shape as the original's guarded body.
      if (special.preDispatch && special.preDispatch.call(this, event) === false) {
        return;
      }

      if (delegateCount && !(event.button && event.type === 'click')) {
        for (cur = event.target; cur != this; cur = cur.parentNode || this) {

          // Original guard: skip disabled elements for click events.
          if (cur.disabled !== true || event.type !== 'click') {
            selMatch = {};
            matches = [];
            for (i = 0; i < delegateCount; i++) {
              handleObj = handlers[i];
              sel = handleObj.selector;

              if (selMatch[sel] === undefined) {
                // ── The 1.8.2 backport (the ONLY changed expression) ──
                // Seed-based Sizzle match for normal selectors; exact
                // legacy full-construction fallback for context-dependent
                // / positional selectors (`> .x`, :first, :eq, …).
                if (handleObj.needsContext === undefined) {
                  handleObj.needsContext = NEEDS_CONTEXT.test(sel);
                }
                selMatch[sel] = handleObj.needsContext
                  ? $(sel, this).index(cur) >= 0
                  : $.find(sel, this, null, [cur]).length > 0;
              }
              if (selMatch[sel]) {
                matches.push(handleObj);
              }
            }
            if (matches.length) {
              handlerQueue.push({ elem: cur, matches: matches });
            }
          }
        }
      }

      if (handlers.length > delegateCount) {
        handlerQueue.push({ elem: this, matches: handlers.slice(delegateCount) });
      }

      for (i = 0; i < handlerQueue.length && !event.isPropagationStopped(); i++) {
        matched = handlerQueue[i];
        event.currentTarget = matched.elem;

        for (j = 0; j < matched.matches.length && !event.isImmediatePropagationStopped(); j++) {
          handleObj = matched.matches[j];

          if (runAll || (!event.namespace && !handleObj.namespace) ||
              (event.namespace_re && event.namespace_re.test(handleObj.namespace))) {

            event.data = handleObj.data;
            event.handleObj = handleObj;

            ret = (($.event.special[handleObj.origType] || {}).handle || handleObj.handler)
              .apply(matched.elem, args);

            if (ret !== undefined) {
              event.result = ret;
              if (ret === false) {
                event.preventDefault();
                event.stopPropagation();
              }
            }
          }
        }
      }

      if (special.postDispatch) {
        special.postDispatch.call(this, event);
      }

      return event.result;
    }

    $.event.dispatch = dispatch;
    // The runtime aliases handle by value at jQuery load — re-point it
    // too so both entries agree.
    if ($.event.handle === orig) {
      $.event.handle = dispatch;
    }
  } catch (e) {
    // Restore the original wholesale — slow but correct beats broken.
    try {
      $.event.dispatch = orig;
      if ($.event.handle && $.event.handle !== orig) $.event.handle = orig;
    } catch (e2) { /* nothing left to do */ }
    try { console.warn('[SCW] jQuery delegate-matching patch failed — reverted', e); } catch (e3) {}
  }
})();
/*** END PATCH — jQuery delegated-event matching ***/
