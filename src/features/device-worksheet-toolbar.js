/*** FEATURE: device-worksheet unified toolbar ********************************
 *
 * Coordinator that gathers the four independently-mounted control strips
 * above any device-worksheet view into a single horizontal command bar.
 * Each underlying feature still owns its own DOM and bindings — this
 * file only restructures and re-skins:
 *
 *   • device-worksheet-expand-all.js  → mode segmented control
 *   • sow-filter-pills.js              → SOW filter pills (when mounted)
 *   • bulk-delete-confirm.js / KTL    → Delete / Copy / Paste
 *   • accordion-menu-inject.js         → "Add to Scope" / similar primary CTAs
 *   • Knack native                    → "Showing N of N" + Add filters
 *
 * Layout (single row, wraps on narrow screens):
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ [Expand|Summary|Collapse]  pills  | filters/count | bulk-ops | CTA │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * Auto-targets every device-worksheet view: detection is presence of
 * `tr.scw-ws-row` in the view, the same canonical marker used by
 * device-worksheet-expand-all.js. New worksheet views get the toolbar
 * automatically — no per-view configuration here.
 *
 * The MutationObserver is necessary because the contributing features
 * mount their DOM at staggered times. Every time `.kn-records-nav`'s
 * children change we re-flatten + re-order so the bar looks coherent
 * regardless of which feature painted last. The observer is disconnected
 * during each consolidate pass to break the self-mutation loop that
 * appendChild reorder generates.
 ******************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-ws-toolbar-css';
  var OBS_KEY  = '__scwWsToolbarObs';
  var BAR_ATTR = 'data-scw-toolbar';

  // Canonical marker for device-worksheet views. Identical to the
  // detection in device-worksheet-expand-all.js so the toolbar attaches
  // to exactly the same set of views as the mode buttons.
  var WS_ROW_SEL = 'tr.scw-ws-row';

  // ── Styles ──────────────────────────────────────────────
  // Every selector below is scoped to .kn-records-nav[data-scw-toolbar]
  // (the attribute we set on each consolidated nav). Without that scope
  // the rules would leak to non-worksheet views — the previous version
  // was scoped to #view_3610 to prevent that, but moving the scope to
  // the attribute lets us generalise without redefining 12 selectors per
  // new view.
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // ── Unified toolbar shell ──
      // Transparent — the toolbar already lives inside the parent KTL
      // accordion card. Adding another bordered/filled rectangle here
      // stacks a third "card within a card" against the summary panel
      // and the data grid below. The toolbar is signaled by its own
      // controls (pills, segmented buttons) — no chrome needed.
      '.kn-records-nav[' + BAR_ATTR + '] {',
      '  display: flex !important;',
      '  flex-wrap: wrap;',
      '  align-items: center;',
      '  gap: 10px 12px;',
      '  padding: 6px 2px 10px;',
      '  margin: 0 0 10px;',
      '  background: transparent;',
      '  border: 0;',
      '  border-radius: 0;',
      '  font: 12px/1.3 system-ui, -apple-system, sans-serif;',
      '}',

      // ── Visual order via flex `order` ──
      // DOM-level reorder loses races against features that re-mount
      // their controls at nav.firstChild (sort dropdown, expand-all
      // toggle). Using flex `order` enforces the visual order purely
      // declaratively — whatever the DOM order is, the user sees this
      // layout left-to-right. Anything not listed sits at order:0 and
      // appears before order:1+ children, so keep this list complete.
      '.kn-records-nav[' + BAR_ATTR + '] .scw-ws-sort           { order: 1; }',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-ws-bulk-toggle    { order: 2; }',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-conn-filter-strip { order: 3; }',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-tb-spring         { order: 4; }',
      '.kn-records-nav[' + BAR_ATTR + '] .kn-filters-nav        { order: 5; }',
      '.kn-records-nav[' + BAR_ATTR + '] .kn-entries-summary    { order: 6; }',
      '.kn-records-nav[' + BAR_ATTR + '] .kn-pagination         { order: 7; }',
      '.kn-records-nav[' + BAR_ATTR + '] [id^="bulkOpsControlsDiv-"] { order: 8; }',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-acc-actions       { order: 9; }',
      // Anything that slips into the nav without being on this list
      // (e.g. ktlAddonsDiv) should fall outside the visible cluster.
      '.kn-records-nav[' + BAR_ATTR + '] .ktlAddonsDiv          { order: 10; }',
      // Stray <br>s and standalone whitespace nodes Knack/KTL inject
      // between strips — collapse them so flex gap controls spacing.
      '.kn-records-nav[' + BAR_ATTR + '] > br {',
      '  display: none;',
      '}',

      // Push everything after .scw-tb-spring to the right edge of the bar.
      '.scw-tb-spring {',
      '  flex: 1 1 auto;',
      '  min-width: 0;',
      '}',

      // ── Mode segmented control ──
      // .scw-ws-bulk-toggle is the host built by device-worksheet-expand-all.js.
      // Reskin its three .kn-button children as a single segmented control —
      // but only when the host lives inside our consolidated toolbar.
      '.kn-records-nav[' + BAR_ATTR + '] .scw-ws-bulk-toggle {',
      '  display: inline-flex !important;',
      '  gap: 0 !important;',
      '  margin: 0 !important;',
      '  border: 1px solid var(--scw-border-default);',
      '  border-radius: 6px;',
      '  overflow: hidden;',
      '  background: var(--scw-surface-base);',
      '}',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-ws-bulk-toggle button.kn-button {',
      '  margin: 0 !important;',
      '  border: 0 !important;',
      '  border-right: 1px solid var(--scw-border-subtle) !important;',
      '  border-radius: 0 !important;',
      '  background: transparent !important;',
      '  color: var(--scw-text-default) !important;',
      '  padding: 5px 11px !important;',
      '  font: 600 12px/1.2 system-ui, -apple-system, sans-serif !important;',
      '  letter-spacing: 0 !important;',
      '  text-transform: none !important;',
      '  box-shadow: none !important;',
      '  text-shadow: none !important;',
      '  min-height: 0 !important;',
      '  height: auto !important;',
      '  transition: background 100ms ease, color 100ms ease;',
      '}',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-ws-bulk-toggle button.kn-button:last-child {',
      '  border-right: 0 !important;',
      '}',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-ws-bulk-toggle button.kn-button:hover {',
      '  background: var(--scw-surface-muted) !important;',
      '  color: var(--scw-text-default) !important;',
      '}',

      // ── SOW filter pills (inline, no card) ──
      // sow-filter-pills.js paints its own surface-subtle card; suppress
      // that within the toolbar since the shell already provides the
      // surface. The pill strip retains its card style on any view that
      // doesn\'t have a consolidated toolbar.
      '.kn-records-nav[' + BAR_ATTR + '] .scw-conn-filter-strip {',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  background: transparent !important;',
      '  border: 0 !important;',
      '  gap: 4px !important;',
      '}',

      // ── Knack native filter / pagination block ──
      '.kn-records-nav[' + BAR_ATTR + '] .kn-pagination,',
      '.kn-records-nav[' + BAR_ATTR + '] .kn-records-nav-summary,',
      '.kn-records-nav[' + BAR_ATTR + '] .kn-entries-summary,',
      '.kn-records-nav[' + BAR_ATTR + '] .kn-filters-nav {',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  gap: 8px;',
      '}',
      '.kn-records-nav[' + BAR_ATTR + '] .kn-records-nav-summary,',
      '.kn-records-nav[' + BAR_ATTR + '] .kn-entries-summary {',
      '  color: var(--scw-text-muted);',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  letter-spacing: 0.02em;',
      '  text-transform: uppercase;',
      '}',
      // .kn-entries-summary uses two inline <span class="light"> children
      // ("Showing" and "of") that Knack styles via a separate stylesheet.
      // Strip the inline opacity so the count reads as one cohesive label.
      '.kn-records-nav[' + BAR_ATTR + '] .kn-entries-summary .light {',
      '  color: inherit !important;',
      '  opacity: 1 !important;',
      '}',

      // ── Bulk-ops cluster ──
      // Generic id-prefix selector so this rule covers every view\'s KTL
      // bulk-ops div (`bulkOpsControlsDiv-view_XXXX`) without enumeration.
      '.kn-records-nav[' + BAR_ATTR + '] [id^="bulkOpsControlsDiv-"] {',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  display: inline-flex !important;',
      '  justify-content: flex-start !important;',
      '  align-items: center;',
      '  gap: 6px;',
      '}',
      // Hide the bulk-ops cluster outright when nothing is selected — the
      // KTL buttons are all :disabled in that state, so the row reads as
      // dead space.
      '.kn-records-nav[' + BAR_ATTR + '] [id^="bulkOpsControlsDiv-"].scw-tb-bulk-empty {',
      '  display: none !important;',
      '}',

      // ── Primary CTA ("Add to Scope" and similar accordion actions) ──
      // The .scw-acc-actions container normally lives in the parent KTL
      // accordion body. We re-parent the whole container into the toolbar
      // so the primary action sits in its conventional top-right slot.
      // Filled-accent CTA using the brand accent triplet.
      '.kn-records-nav[' + BAR_ATTR + '] .scw-acc-actions {',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  gap: 6px;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '}',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-acc-action-btn {',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  gap: 6px;',
      '  margin: 0 !important;',
      '  min-width: 0 !important;',
      '  padding: 7px 14px !important;',
      '  background: var(--scw-accent) !important;',
      '  color: var(--scw-surface-base) !important;',
      '  border: 1px solid var(--scw-accent-strong) !important;',
      '  border-radius: 6px !important;',
      '  font: 600 12px/1.2 system-ui, -apple-system, sans-serif !important;',
      '  letter-spacing: 0 !important;',
      '  text-transform: none !important;',
      '  cursor: pointer;',
      '  box-shadow: none !important;',
      '  transition: background 100ms ease, border-color 100ms ease;',
      '}',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-acc-action-btn:hover {',
      '  background: var(--scw-accent-strong) !important;',
      '  border-color: var(--scw-accent-deep) !important;',
      '  color: var(--scw-surface-base) !important;',
      '}',
      '.kn-records-nav[' + BAR_ATTR + '] .scw-acc-action-btn svg {',
      '  width: 12px; height: 12px;',
      '  stroke: currentColor;',
      '}',
      // Hide the now-empty accordion actions row when its children have
      // been hoisted to the toolbar — leaves no visual residue above the
      // table.
      '.scw-ktl-accordion__body > .scw-acc-actions.scw-tb-hoisted {',
      '  display: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Detection ───────────────────────────────────────────
  function isWorksheetView(viewEl) {
    return !!(viewEl && viewEl.querySelector && viewEl.querySelector(WS_ROW_SEL));
  }

  // ── DOM consolidation pass ──────────────────────────────
  // Idempotent: safe to run on every mutation tick. Only rearranges,
  // never creates new controls.
  //
  // IMPORTANT: disconnects this view\'s MutationObserver for the duration
  // of the pass and reconnects at the end. Without this guard, the
  // insertBefore calls below generate childList mutations that re-fire
  // the observer ~80ms later, producing a continuous mutation loop at
  // ~10Hz. That churn breaks click-event delivery on the controls we
  // re-parent (Expand/Summary/Collapse, Add to Scope) because their host
  // elements are constantly being detached-and-reattached.
  function consolidate(viewEl) {
    if (!viewEl) return;
    var nav = viewEl.querySelector('.kn-records-nav');
    if (!nav) return;

    var ourObs = viewEl[OBS_KEY];
    if (ourObs) ourObs.disconnect();
    try {
      consolidateInner(viewEl, nav);
    } finally {
      if (ourObs) ourObs.observe(viewEl, { childList: true, subtree: true });
    }
  }

  function consolidateInner(viewEl, nav) {
    var viewId = viewEl.id;

    // Mark the nav as managed so our scoped CSS engages.
    if (!nav.hasAttribute(BAR_ATTR)) nav.setAttribute(BAR_ATTR, '1');

    // Pull the KTL bulk-ops cluster into the toolbar (it normally lives
    // as a sibling of .kn-records-nav).
    var bulk = document.getElementById('bulkOpsControlsDiv-' + viewId);
    if (bulk && bulk.parentNode !== nav) {
      nav.appendChild(bulk);
    }

    // Pull the parent KTL accordion\'s .scw-acc-actions (which hosts
    // "Add to Scope" / similar primary CTAs) into the toolbar. It lives
    // in .scw-ktl-accordion__body, as a sibling of this view.
    var accordion  = viewEl.closest('.scw-ktl-accordion');
    var accActions = accordion && accordion.querySelector(
      '.scw-ktl-accordion__body > .scw-acc-actions'
    );
    if (accActions && accActions.parentNode !== nav) {
      accActions.classList.add('scw-tb-hoisted');
      nav.appendChild(accActions);
    }

    // Pull the Knack-native record-count summary ("Showing 1-88 of 88")
    // into the toolbar. It lives in a sibling .level block below
    // .kn-records-nav and would otherwise wrap to a new line beneath
    // the action buttons. Flex `order` puts it between filters and
    // action buttons once it's in the nav.
    var entriesSummary = viewEl.querySelector('.kn-entries-summary');
    if (entriesSummary && entriesSummary.parentNode !== nav) {
      nav.appendChild(entriesSummary);
    }

    // Hide the bulk cluster when no rows are selected. KTL toggles
    // :disabled on its three buttons (Delete / Copy / Paste) based on
    // selection state — when all three are disabled, hide the cluster.
    if (bulk) {
      var btns = bulk.querySelectorAll('button');
      var anyEnabled = false;
      for (var b = 0; b < btns.length; b++) {
        if (!btns[b].disabled) { anyEnabled = true; break; }
      }
      bulk.classList.toggle('scw-tb-bulk-empty', !anyEnabled && btns.length > 0);
    }

    // Desired left-to-right order (matches the Build SOWs page, which
    // the user pointed to as the canonical layout):
    //   1. Sort preset dropdown        (.scw-ws-sort)
    //   2. Mode segmented control      (.scw-ws-bulk-toggle  =  Collapse|Summary)
    //   3. SOW filter pills            (.scw-conn-filter-strip)
    //   4. spring (push remainder right)
    //   5. Knack filter controls       (.kn-filters-nav)
    //   6. Knack pagination/summary    (.kn-records-nav-summary, .kn-pagination)
    //   7. Bulk-ops cluster            ([id^="bulkOpsControlsDiv-"])
    //   8. Primary CTA cluster         (.scw-acc-actions  =  Add to Scope,
    //                                                         Bulk Add Photos,
    //                                                         Add Survey/Bid Item)
    var orderSelectors = [
      '.scw-ws-sort',
      '.scw-ws-bulk-toggle',
      '.scw-conn-filter-strip',
      '.scw-tb-spring',
      '.kn-filters-nav',
      '.kn-records-nav-summary',
      '.kn-pagination',
      '#bulkOpsControlsDiv-' + viewId,
      '.scw-acc-actions'
    ];

    // Inject the spring once.
    if (!nav.querySelector('.scw-tb-spring')) {
      var spring = document.createElement('span');
      spring.className = 'scw-tb-spring';
      nav.appendChild(spring);
    }

    // Position-aware reorder: only call insertBefore when an element is
    // not already in its target slot. Unconditional appendChild (even on
    // a node that\'s already last child) generates a childList mutation
    // record — wasted work even with the disconnect guard.
    var prev = null;
    for (var i = 0; i < orderSelectors.length; i++) {
      var el = nav.querySelector(orderSelectors[i]);
      if (!el) continue;
      var expectedAfter = prev ? prev.nextElementSibling : nav.firstElementChild;
      if (el !== expectedAfter) {
        nav.insertBefore(el, expectedAfter);
      }
      prev = el;
    }
  }

  // ── Per-view observer ───────────────────────────────────
  function attachToView(viewEl) {
    if (!viewEl || viewEl[OBS_KEY]) return;
    if (!isWorksheetView(viewEl)) return;

    consolidate(viewEl);

    var debounce = null;
    var obs = new MutationObserver(function () {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(function () { consolidate(viewEl); }, 80);
    });
    obs.observe(viewEl, { childList: true, subtree: true });
    viewEl[OBS_KEY] = obs;
  }

  // ── Discovery ───────────────────────────────────────────
  // Scan every Knack view on the page; attach to any that qualifies as
  // a device-worksheet view. Cheap to call repeatedly because
  // attachToView early-returns on already-attached views.
  function scan() {
    var views = document.querySelectorAll('.kn-view[id^="view_"]');
    for (var i = 0; i < views.length; i++) {
      attachToView(views[i]);
    }
  }

  // ── Bindings ────────────────────────────────────────────
  injectStyles();

  // device-worksheet.js builds tr.scw-ws-row inside a setTimeout(~150ms)
  // after knack-view-render fires, so a synchronous scan on view-render
  // sees no wsRows and isWorksheetView returns false. Re-scan at 250ms
  // and 600ms to catch the row insertion regardless of which feature
  // wins the render race.
  function scanWithRetries() {
    scan();
    setTimeout(scan, 250);
    setTimeout(scan, 600);
  }

  $(document).on('knack-view-render.any', scanWithRetries);
  $(document).on('knack-scene-render.any', scanWithRetries);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanWithRetries);
  } else {
    scanWithRetries();
  }
})();
/*** END FEATURE: device-worksheet unified toolbar ****************************/
