/*** FEATURE: view_3610 unified toolbar (Phase 1 — consolidation) **************
 *
 * Coordinator that gathers the four independently-mounted control strips
 * above view_3610 ("Scope of Work Line Items") into a single horizontal
 * command bar. Each underlying feature still owns its own DOM and
 * bindings — this file only restructures and re-skins:
 *
 *   • device-worksheet-expand-all.js  → mode segmented control
 *   • sow-filter-pills.js              → SOW filter pills
 *   • bulk-delete-confirm.js / KTL    → Delete / Copy / Paste
 *   • Knack native                    → "Showing N of N" + Add filters
 *
 * Layout (single row, wraps on narrow screens):
 *
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │ [Expand|Summary|Collapse]  SOW pills  | filters/count | bulk-ops │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * The MutationObserver is necessary because the contributing features
 * mount their DOM at staggered times (some on knack-view-render + 200ms,
 * some on knack-cell-update, KTL on its own cadence). Every time
 * .kn-records-nav's children change we re-flatten + re-order so the bar
 * looks coherent regardless of which feature painted last.
 *
 * Visual language matches the design tokens we'll formalize in Phase 2
 * (Known Issue #9): slate-on-white surfaces, single primary accent.
 ******************************************************************************/
(function () {
  'use strict';

  var VIEW_ID  = 'view_3610';
  var STYLE_ID = 'scw-view-3610-toolbar-css';
  var OBS_KEY  = '__scwView3610ToolbarObs';
  var BAR_ATTR = 'data-scw-toolbar';

  // ── Styles ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // ── Unified toolbar shell ──
      // Override Knack's default block layout for .kn-records-nav so all
      // child strips collapse onto one wrapping row.
      '#' + VIEW_ID + ' .kn-records-nav[' + BAR_ATTR + '] {',
      '  display: flex !important;',
      '  flex-wrap: wrap;',
      '  align-items: center;',
      '  gap: 10px 12px;',
      '  padding: 8px 10px;',
      '  margin: 0 0 12px;',
      '  background: #f8fafc;',
      '  border: 1px solid #e2e8f0;',
      '  border-radius: 8px;',
      '  font: 12px/1.3 system-ui, -apple-system, sans-serif;',
      '}',

      // Stray <br>s and standalone whitespace nodes Knack/KTL inject
      // between strips — collapse them so flex gap controls spacing.
      '#' + VIEW_ID + ' .kn-records-nav[' + BAR_ATTR + '] > br {',
      '  display: none;',
      '}',

      // ── Slot dividers ──
      // Vertical hairlines between logical groups, painted via the
      // .scw-tb-sep separator element we inject between slots.
      '.scw-tb-sep {',
      '  flex: 0 0 1px;',
      '  align-self: stretch;',
      '  background: #e2e8f0;',
      '  margin: 2px 2px;',
      '}',

      // Push everything after .scw-tb-spring to the right edge of the bar.
      '.scw-tb-spring {',
      '  flex: 1 1 auto;',
      '  min-width: 0;',
      '}',

      // ── Mode segmented control ──
      // .scw-ws-bulk-toggle is the host built by device-worksheet-expand-all.js.
      // Reskin its three .kn-button children as a single segmented control.
      '#' + VIEW_ID + ' .scw-ws-bulk-toggle {',
      '  display: inline-flex !important;',
      '  gap: 0 !important;',
      '  margin: 0 !important;',
      '  border: 1px solid #cbd5e1;',
      '  border-radius: 6px;',
      '  overflow: hidden;',
      '  background: #fff;',
      '}',
      '#' + VIEW_ID + ' .scw-ws-bulk-toggle button.kn-button {',
      '  margin: 0 !important;',
      '  border: 0 !important;',
      '  border-right: 1px solid #e2e8f0 !important;',
      '  border-radius: 0 !important;',
      '  background: transparent !important;',
      '  color: #1f2937 !important;',
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
      '#' + VIEW_ID + ' .scw-ws-bulk-toggle button.kn-button:last-child {',
      '  border-right: 0 !important;',
      '}',
      '#' + VIEW_ID + ' .scw-ws-bulk-toggle button.kn-button:hover {',
      '  background: #f1f5f9 !important;',
      '  color: #0f172a !important;',
      '}',

      // ── SOW filter pills (inline, no card) ──
      // sow-filter-pills.js paints its own f8fafc card; suppress that
      // since the toolbar shell already provides the surface.
      '#' + VIEW_ID + ' .scw-conn-filter-strip {',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  background: transparent !important;',
      '  border: 0 !important;',
      '  gap: 4px !important;',
      '}',

      // ── Knack native filter / pagination block ──
      // The .kn-records-nav by default also contains "Showing 1-92 of 92"
      // + the "Add filters" anchor + sort/save icons. Tighten margins so
      // they sit cleanly on the row.
      '#' + VIEW_ID + ' .kn-records-nav[' + BAR_ATTR + '] .kn-pagination,',
      '#' + VIEW_ID + ' .kn-records-nav[' + BAR_ATTR + '] .kn-records-nav-summary,',
      '#' + VIEW_ID + ' .kn-records-nav[' + BAR_ATTR + '] .kn-filters-nav {',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  gap: 8px;',
      '}',
      '#' + VIEW_ID + ' .kn-records-nav[' + BAR_ATTR + '] .kn-records-nav-summary {',
      '  color: #64748b;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  letter-spacing: 0.02em;',
      '  text-transform: uppercase;',
      '}',

      // ── Bulk-ops cluster ──
      // bulk-delete-confirm.js's CSS already justify-end's the cluster
      // when it's its own row. Once we reparent it into the toolbar we
      // want it to sit naturally — no forced flex-end.
      '#' + VIEW_ID + ' .kn-records-nav[' + BAR_ATTR + '] #bulkOpsControlsDiv-' + VIEW_ID + ' {',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  display: inline-flex !important;',
      '  justify-content: flex-start !important;',
      '  align-items: center;',
      '  gap: 6px;',
      '}',

      // Hide the bulk-ops cluster outright when nothing is selected — the
      // KTL buttons are all :disabled in that state, so the row reads as
      // dead space. Showing them only when actionable removes a major
      // source of visual noise on the default-empty state.
      '#' + VIEW_ID + ' .kn-records-nav[' + BAR_ATTR + '] #bulkOpsControlsDiv-' + VIEW_ID + '.scw-tb-bulk-empty {',
      '  display: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── DOM consolidation pass ──────────────────────────────
  // Idempotent: safe to run on every mutation tick. Only rearranges, never
  // creates new controls.
  function consolidate() {
    var view = document.getElementById(VIEW_ID);
    if (!view) return;
    var nav = view.querySelector('.kn-records-nav');
    if (!nav) return;

    // Mark the nav as managed so our scoped CSS engages.
    if (!nav.hasAttribute(BAR_ATTR)) nav.setAttribute(BAR_ATTR, '1');

    // Pull the KTL bulk-ops cluster into the toolbar (it normally lives
    // as a sibling of .kn-records-nav).
    var bulk = document.getElementById('bulkOpsControlsDiv-' + VIEW_ID);
    if (bulk && bulk.parentNode !== nav) {
      nav.appendChild(bulk);
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

    // Desired left-to-right order:
    //   1. Mode segmented control     (.scw-ws-bulk-toggle)
    //   2. SOW filter pills            (.scw-conn-filter-strip)
    //   3. spring (push remainder right)
    //   4. Knack pagination/summary    (.kn-records-nav-summary, .kn-pagination)
    //   5. Knack filter controls       (.kn-filters-nav)
    //   6. Bulk-ops cluster            (#bulkOpsControlsDiv-view_3610)
    //
    // Strategy: append children in order. appendChild moves an existing
    // node (no clone), so this re-orders without destroying state or
    // listeners on the contributing features' DOM.
    var orderSelectors = [
      '.scw-ws-bulk-toggle',
      '.scw-conn-filter-strip',
      '.scw-tb-spring',
      '.kn-records-nav-summary',
      '.kn-pagination',
      '.kn-filters-nav',
      '#bulkOpsControlsDiv-' + VIEW_ID
    ];

    // Inject the spring once — a flex-grow filler that pushes everything
    // after it to the right of the bar.
    if (!nav.querySelector('.scw-tb-spring')) {
      var spring = document.createElement('span');
      spring.className = 'scw-tb-spring';
      nav.appendChild(spring);
    }

    for (var i = 0; i < orderSelectors.length; i++) {
      var el = nav.querySelector(orderSelectors[i]);
      if (el) nav.appendChild(el);
    }
  }

  // ── Observer ────────────────────────────────────────────
  // Each contributing feature mounts its DOM at slightly different
  // times. A single observer on the view container runs consolidate()
  // whenever .kn-records-nav's subtree changes.
  function attachObserver() {
    var view = document.getElementById(VIEW_ID);
    if (!view) return;
    if (view[OBS_KEY]) return;

    consolidate();

    var debounce = null;
    var obs = new MutationObserver(function () {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(consolidate, 80);
    });
    obs.observe(view, { childList: true, subtree: true });
    view[OBS_KEY] = obs;
  }

  // ── Bindings ────────────────────────────────────────────
  injectStyles();

  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(VIEW_ID, function () {
      // 300ms — sit just behind sow-filter-pills (200ms) and
      // device-worksheet-expand-all (immediate) so both have mounted
      // before our first consolidation pass.
      setTimeout(attachObserver, 300);
    }, 'scwView3610Toolbar');
  }

  // First-load entry point — script can load after the initial scene
  // render fired, so try once on load too.
  if (document.getElementById(VIEW_ID)) {
    setTimeout(attachObserver, 300);
  }
})();
/*** END FEATURE: view_3610 unified toolbar ***/
