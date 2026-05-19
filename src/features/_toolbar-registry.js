/*** FEATURE: SCW.toolbar registry *********************************************
 *
 * A small slot-based coordinator for the unified worksheet/grid toolbar.
 *
 * Why this exists
 * ───────────────
 * Multiple independent features (sort dropdown, expand/summary buttons,
 * filter pills, bulk-upload injection, KTL bulk ops, Knack-native
 * count/pagination) all want to live above the same grid view.
 * Historically each one mounted itself with `nav.insertBefore(x,
 * nav.firstChild)`, which raced against the others and left placement
 * non-deterministic across re-renders. The coordinator (this file +
 * device-worksheet-toolbar.js) absorbs three concerns those features
 * used to handle individually:
 *
 *   1. WHERE  the control appears in the toolbar  → CSS flex `order`
 *   2. WHEN   the control is (re)mounted          → one observer/view
 *   3. WHAT   to do when Knack wipes the DOM      → idempotent mount fn
 *
 * Features still own their own markup, state, and event bindings —
 * they just register `mount(viewEl, nav)` with a slot id and a
 * predicate that says which views the entry applies to.
 *
 * Public API
 * ──────────
 *   SCW.toolbar.register({
 *     id:        'unique-id',          // for logs / dedup
 *     slot:      SCW.toolbar.SLOTS.X,  // visual order in the bar
 *     viewMatch: fn(viewEl) → bool,    // which views does this apply to
 *     mount:     fn(viewEl, nav)       // idempotent: build & insert if
 *                                      //   missing; refresh if present
 *   });
 *
 *   SCW.toolbar.SLOTS — canonical order map (sort, mode, filter, …)
 *   SCW.toolbar.matchers.deviceWorksheet — predicate, true when the
 *     view has `tr.scw-ws-row` rows present (the device-worksheet
 *     canonical marker).
 *   SCW.toolbar.matchers.viewIds(['view_3505', …]) — predicate factory.
 *
 * Mount contract
 * ──────────────
 * `mount(viewEl, nav)` is called on:
 *   • initial scan after knack-view-render / knack-scene-render
 *   • mutations in the surrounding accordion subtree (debounced 80ms)
 *
 * It MUST be cheap and idempotent. The conventional shape is:
 *
 *   mount: function (viewEl, nav) {
 *     if (nav.querySelector('.my-host')) return;   // already mounted
 *     var host = buildMyHost(viewEl);
 *     nav.appendChild(host);                       // order is CSS-controlled
 *   }
 *
 * For hoists (moving an existing element into the nav from elsewhere):
 *
 *   mount: function (viewEl, nav) {
 *     var el = viewEl.querySelector('.target');
 *     if (el && el.parentNode !== nav) nav.appendChild(el);
 *   }
 *
 * For injections into another feature's container:
 *
 *   mount: function (viewEl, nav) {
 *     var container = nav.querySelector('.host-container');
 *     if (!container) return;             // try again next tick
 *     if (container.querySelector('.my-btn')) return;
 *     container.insertBefore(myBtn, anchor);
 *   }
 ******************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  // ── Canonical visual order ─────────────────────────────────
  // CSS flex `order` values applied by device-worksheet-toolbar.js's
  // stylesheet. Anything not listed defaults to 0 (renders first).
  var SLOTS = {
    sort:           1,
    mode:           2,
    filter:         3,
    spring:         4,
    knFilters:      5,
    entriesSummary: 6,
    pagination:     7,
    bulkOps:        8,
    actions:        9,
    addonsDiv:     10
  };

  // Set on the OUTER .kn-view element (NOT the inner nav). Knack
  // preserves the view element across re-renders (Backbone replaces
  // innerHTML, not the wrapper) so an attribute set here survives a
  // model.fetch() reload — whereas an attribute set on the nav is
  // wiped together with the rest of the inner DOM. All toolbar CSS
  // uses `.kn-view[data-scw-toolbar] .kn-records-nav …` as the scope.
  var BAR_ATTR = 'data-scw-toolbar';

  var entries = [];

  function register(entry) {
    if (!entry || typeof entry.mount !== 'function') {
      console.warn('[scw-toolbar] register() needs { mount }');
      return;
    }
    if (!entry.id) entry.id = '__anon_' + entries.length;
    entries.push(entry);
    // New registration may apply to views already on the page.
    runAll();
  }

  function defaultViewMatch(viewEl) {
    return !!(viewEl && viewEl.querySelector('tr.scw-ws-row'));
  }

  function viewMatchesAnyEntry(viewEl) {
    for (var i = 0; i < entries.length; i++) {
      var m = entries[i].viewMatch || defaultViewMatch;
      try { if (m(viewEl)) return true; }
      catch (err) { /* keep scanning */ }
    }
    return false;
  }

  function ensureSpring(nav) {
    if (!nav.querySelector('.scw-tb-spring')) {
      var spring = document.createElement('span');
      spring.className = 'scw-tb-spring';
      nav.appendChild(spring);
    }
  }

  // Look up the live view element by id. Knack's model.fetch() can
  // replace a view's container outright (e.g. sort changes), which
  // would orphan any captured viewEl reference. Always resolve fresh
  // from the DOM before doing any work.
  function liveView(viewId) {
    return document.getElementById(viewId);
  }

  function mountAll(viewId) {
    var viewEl = liveView(viewId);
    if (!viewEl) return;
    // Mark the viewEl, not the nav — nav gets wiped on model.fetch().
    if (!viewEl.hasAttribute(BAR_ATTR)) viewEl.setAttribute(BAR_ATTR, '1');
    var nav = viewEl.querySelector('.kn-records-nav');
    if (!nav) return;
    ensureSpring(nav);

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var match = entry.viewMatch || defaultViewMatch;
      var applies;
      try { applies = !!match(viewEl); } catch (err) { applies = false; }
      if (!applies) continue;

      try {
        entry.mount(viewEl, nav);
      } catch (err) {
        console.error('[scw-toolbar] mount failed for', entry.id, err);
      }
    }
  }

  // Observers are keyed off the accordion container (or the view's
  // current parent), which Knack preserves even when it replaces the
  // inner view element. Keyed by viewId in a module-level map so we
  // don't lose the binding when viewEl gets swapped.
  var observers = {};   // viewId -> { obs, scope }

  function attach(viewId) {
    var viewEl = liveView(viewId);
    if (!viewEl) return;
    if (!viewMatchesAnyEntry(viewEl)) return;

    // Tag viewEl up front so the toolbar CSS engages even before the
    // first observer tick — Knack preserves viewEl across re-renders,
    // so this attribute survives model.fetch() / view rebuilds.
    if (!viewEl.hasAttribute(BAR_ATTR)) viewEl.setAttribute(BAR_ATTR, '1');

    mountAll(viewId);

    // Observer scope: prefer .kn-scene over .scw-ktl-accordion.
    //
    // .scw-ktl-accordion is built and OWNED by accordion-menu-inject;
    // that module has its own scene-level observer that DESTROYS and
    // REBUILDS the wrapper whenever KTL rebuilds the accordion (e.g.
    // after filter changes, model refetches, or KTL's own internal
    // re-renders). Binding our observer to a node owned by another
    // module means our observer gets orphaned the moment that module
    // swaps the wrapper — at which point button injections silently
    // stop happening until the next knack-view-render fires, which
    // may be never on a quiet page.
    //
    // .kn-scene is Knack's own container. Knack only swaps it on a
    // full scene-render (which fires knack-scene-render — already
    // handled by runWithRetries below), so binding here is durable.
    var scope = viewEl.closest('.kn-scene') ||
                viewEl.closest('.scw-ktl-accordion') ||
                viewEl.parentElement || viewEl;

    // Already observing this exact scope? Done.
    if (observers[viewId] && observers[viewId].scope === scope) return;

    // Scope changed (e.g. accordion was rebuilt around the view) —
    // tear down the old observer first.
    if (observers[viewId] && observers[viewId].obs) {
      observers[viewId].obs.disconnect();
    }

    var debounce = null;
    var obs = new MutationObserver(function () {
      if (debounce) clearTimeout(debounce);
      // Resolve viewEl freshly each tick — see liveView() docstring.
      debounce = setTimeout(function () { mountAll(viewId); }, 80);
    });
    obs.observe(scope, { childList: true, subtree: true });
    observers[viewId] = { obs: obs, scope: scope };
  }

  function runAll() {
    var views = document.querySelectorAll('.kn-view[id^="view_"]');
    for (var i = 0; i < views.length; i++) {
      var viewId = views[i].id;
      attach(viewId);
      // Always run mountAll, not just when the observer attached. The
      // observer attach can short-circuit on viewMatchesAnyEntry — a
      // view that only acquires its toolbar-eligible state later (e.g.
      // after transformView inserts tr.scw-ws-row) would otherwise
      // never see a mount call until the next mutation tick. mountAll's
      // own per-entry viewMatch keeps wasted work tiny.
      mountAll(viewId);
    }
  }

  // device-worksheet's transformView fires at ~150ms after view-render,
  // and many other features re-paint the nav at staggered times. Three
  // scans (0/250/600ms) catch the worksheet-rows insertion regardless
  // of which feature wins the render race. Subsequent re-renders go
  // through the per-view MutationObserver.
  function runWithRetries() {
    runAll();
    setTimeout(runAll, 250);
    setTimeout(runAll, 600);
  }

  $(document).on('knack-view-render.any',  runWithRetries);
  $(document).on('knack-scene-render.any', runWithRetries);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runWithRetries);
  } else {
    runWithRetries();
  }

  // Heartbeat watchdog — belt-and-suspenders against ANY scenario
  // where the MutationObserver fails to re-mount a missing button:
  // orphaned scopes, mutations that fire outside the observed subtree,
  // browser-specific batching quirks, KTL hijacking that bypasses the
  // observed events, etc.
  //
  // mount() functions are required to be cheap and idempotent (per
  // the contract at the top of this file), so unconditionally calling
  // runAll() on a steady interval costs roughly:
  //   visible views × registered entries × 1 querySelector each
  // which on the heaviest scenes is a few dozen selector lookups per
  // tick. Effectively free, and it makes button injection genuinely
  // self-healing instead of relying on a chain of fragile observers.
  setInterval(runAll, 2000);

  SCW.toolbar = {
    SLOTS:    SLOTS,
    register: register,
    matchers: {
      deviceWorksheet: defaultViewMatch,
      viewIds: function (ids) {
        return function (viewEl) {
          return !!viewEl && ids.indexOf(viewEl.id) !== -1;
        };
      }
    },
    // Exposed for the toolbar coordinator's CSS rules — keep this in
    // lock-step with the BAR_ATTR string above.
    _BAR_ATTR: BAR_ATTR
  };
})();
/*** END FEATURE: SCW.toolbar registry ****************************************/
