/*** FEATURE: device-worksheet unified toolbar ********************************
 *
 * Coordinator that gathers the control strips above any device-worksheet
 * view into a single horizontal command bar. Per-feature DOM and event
 * bindings still live in the contributing files; this file owns:
 *
 *   1. Stylesheet for the bar (`.kn-records-nav[data-scw-toolbar]`)
 *   2. Visual order via CSS flex `order`
 *   3. Hoists for elements that originate outside .kn-records-nav:
 *        • .scw-acc-actions       (built by accordion-menu-inject, lives
 *                                  in .scw-ktl-accordion__body — moved
 *                                  into the nav for layout)
 *        • .kn-entries-summary    (Knack-native, lives in a sibling
 *                                  .level block below the nav)
 *        • bulkOpsControlsDiv-*   (KTL bulk-ops, lives next to the nav
 *                                  as a sibling)
 *
 * All actual mount + observer logic is handled by SCW.toolbar (see
 * _toolbar-registry.js). Contributing features register a mount
 * function with a slot id; this file registers the framework hoists.
 *
 * Layout (single row, wraps on narrow screens):
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ [sort] [mode] [filter pills] | filters/count | bulk-ops | CTAs     │
 *   └────────────────────────────────────────────────────────────────────┘
 ******************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-ws-toolbar-css';
  var BAR_ATTR = SCW.toolbar._BAR_ATTR;
  var SLOTS    = SCW.toolbar.SLOTS;
  var WS_MATCH = SCW.toolbar.matchers.deviceWorksheet;

  // ── Styles ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // ── Unified toolbar shell ──
      // Transparent — the toolbar already lives inside the parent KTL
      // accordion card. Adding another bordered/filled rectangle here
      // would stack a "card within a card" against the summary panel
      // and the data grid below.
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav {',
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
      // Strip stray <br>s and whitespace-only text nodes Knack/KTL
      // inject between strips — flex gap controls spacing now.
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav > br { display: none; }',

      // ── Visual order via flex `order` ──
      // DOM-level reorder loses races against features that re-mount
      // their controls at nav.firstChild. CSS `order` enforces the
      // visual layout purely declaratively, so DOM insertion order
      // doesn't matter. !important keeps Bulma/Knack inline styles
      // from sneaking float or order:0 overrides through.
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-ws-sort               { order: ' + SLOTS.sort           + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-ws-bulk-toggle        { order: ' + SLOTS.mode           + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-conn-filter-strip     { order: ' + SLOTS.filter         + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-tb-spring             { order: ' + SLOTS.spring         + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-filters-nav            { order: ' + SLOTS.knFilters      + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-entries-summary        { order: ' + SLOTS.entriesSummary + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-pagination             { order: ' + SLOTS.pagination     + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav [id^="bulkOpsControlsDiv-"] { order: ' + SLOTS.bulkOps        + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-acc-actions           { order: ' + SLOTS.actions        + ' !important; }',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .ktlAddonsDiv              { order: ' + SLOTS.addonsDiv      + ' !important; }',

      // Spring takes remaining width — push trailing items right.
      '.scw-tb-spring { flex: 1 1 auto; min-width: 0; }',

      // ── Mode segmented control (Collapse/Summary) ──
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-ws-bulk-toggle {',
      '  display: inline-flex !important;',
      '  gap: 0 !important;',
      '  margin: 0 !important;',
      '  border: 1px solid var(--scw-border-default);',
      '  border-radius: 6px;',
      '  overflow: hidden;',
      '  background: var(--scw-surface-base);',
      '}',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-ws-bulk-toggle button.kn-button {',
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
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-ws-bulk-toggle button.kn-button:last-child {',
      '  border-right: 0 !important;',
      '}',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-ws-bulk-toggle button.kn-button:hover {',
      '  background: var(--scw-surface-muted) !important;',
      '  color: var(--scw-text-default) !important;',
      '}',

      // ── SOW filter pills (inline, no card) ──
      // sow-filter-pills.js paints its own surface-subtle card; suppress
      // that within the toolbar since the shell already provides surface.
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-conn-filter-strip {',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  background: transparent !important;',
      '  border: 0 !important;',
      '  gap: 4px !important;',
      '}',

      // ── Knack native filter / pagination / count ──
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-pagination,',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-records-nav-summary,',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-entries-summary,',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-filters-nav {',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  gap: 8px;',
      '}',
      // Restyle the Knack-native "Add filters" button to match the
      // toolbar's segmented-control visual language — same border,
      // surface, hover, and typography as .scw-ws-sort__button so it
      // doesn't read as a stray Knack-blue gradient pill.
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-filters-nav .kn-add-filter,',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-filters-nav .kn-button {',
      '  margin: 0 !important;',
      '  padding: 5px 11px !important;',
      '  background: var(--scw-surface-base) !important;',
      '  color: var(--scw-text-default) !important;',
      '  border: 1px solid var(--scw-border-default) !important;',
      '  border-radius: 6px !important;',
      '  font: 600 12px/1.2 system-ui, -apple-system, sans-serif !important;',
      '  letter-spacing: 0 !important;',
      '  text-transform: none !important;',
      '  text-shadow: none !important;',
      '  box-shadow: none !important;',
      '  height: auto !important;',
      '  min-height: 0 !important;',
      '  transition: background 100ms ease, border-color 100ms ease;',
      '}',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-filters-nav .kn-add-filter:hover,',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-filters-nav .kn-button:hover {',
      '  background: var(--scw-surface-muted) !important;',
      '  border-color: var(--scw-border-strong) !important;',
      '  color: var(--scw-text-default) !important;',
      '}',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-filters-nav .icon {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  font-size: 11px;',
      '  margin-right: 4px;',
      '  color: var(--scw-text-caption);',
      '}',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-records-nav-summary,',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-entries-summary {',
      '  color: var(--scw-text-muted);',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  letter-spacing: 0.02em;',
      '  text-transform: uppercase;',
      '}',
      // .kn-entries-summary contains two inline <span class="light">
      // children ("Showing" / "of") Knack styles via a separate stylesheet.
      // Strip the inline opacity so the count reads as one cohesive label.
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .kn-entries-summary .light {',
      '  color: inherit !important;',
      '  opacity: 1 !important;',
      '}',

      // ── Bulk-ops cluster ──
      // Generic id-prefix selector — covers every view's KTL bulk-ops
      // div without explicit enumeration.
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav [id^="bulkOpsControlsDiv-"] {',
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
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav [id^="bulkOpsControlsDiv-"].scw-tb-bulk-empty {',
      '  display: none !important;',
      '}',

      // ── Primary CTA cluster (Add Survey/Bid Item, Add Photos, …) ──
      // .scw-acc-actions normally lives in the parent KTL accordion
      // body; this coordinator hoists it into the toolbar so the
      // primary action sits in its conventional top-right slot.
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-acc-actions {',
      '  display: inline-flex !important;',
      '  align-items: center;',
      '  gap: 6px;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '}',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-acc-action-btn {',
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
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-acc-action-btn:hover {',
      '  background: var(--scw-accent-strong) !important;',
      '  border-color: var(--scw-accent-deep) !important;',
      '  color: var(--scw-surface-base) !important;',
      '}',
      '.kn-view[' + BAR_ATTR + '] .kn-records-nav .scw-acc-action-btn svg {',
      '  width: 12px; height: 12px;',
      '  stroke: currentColor;',
      '}',
      // Per-view: suppress the record count on view_3610. The page
      // already shows the SOW-line-item count in the accordion header
      // pill, so the "Showing 1-N of N" duplicate is noise.
      '#view_3610 .kn-entries-summary { display: none !important; }',

      // Hide the now-empty accordion actions row when its children have
      // been hoisted to the toolbar — leaves no visual residue above the
      // table.
      '.scw-ktl-accordion__body > .scw-acc-actions.scw-tb-hoisted {',
      '  display: none !important;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  injectStyles();

  // ── Framework hoists ────────────────────────────────────
  // None of these contribute new markup — they relocate existing
  // elements from elsewhere on the page into the nav, so flex `order`
  // can place them in the right slot.

  // 1) KTL bulk-ops cluster (lives next to .kn-records-nav)
  SCW.toolbar.register({
    id:        'tb-hoist-bulk-ops',
    viewMatch: WS_MATCH,
    mount: function (viewEl, nav) {
      var bulk = document.getElementById('bulkOpsControlsDiv-' + viewEl.id);
      if (bulk && bulk.parentNode !== nav) {
        nav.appendChild(bulk);
      }
      // Hide cluster when all bulk buttons are :disabled (nothing selected).
      if (bulk) {
        var btns = bulk.querySelectorAll('button');
        var anyEnabled = false;
        for (var b = 0; b < btns.length; b++) {
          if (!btns[b].disabled) { anyEnabled = true; break; }
        }
        bulk.classList.toggle('scw-tb-bulk-empty', !anyEnabled && btns.length > 0);
      }
    }
  });

  // 2) Primary CTA cluster (lives in .scw-ktl-accordion__body)
  SCW.toolbar.register({
    id:        'tb-hoist-acc-actions',
    viewMatch: WS_MATCH,
    mount: function (viewEl, nav) {
      var accordion = viewEl.closest('.scw-ktl-accordion');
      if (!accordion) return;
      var accActions = accordion.querySelector(
        '.scw-ktl-accordion__body > .scw-acc-actions'
      );
      if (accActions && accActions.parentNode !== nav) {
        accActions.classList.add('scw-tb-hoisted');
        nav.appendChild(accActions);
      }
    }
  });

  // 3) Knack-native record count ("Showing 1-88 of 88")
  // Sibling of .kn-records-nav in a <div class="level"> below — would
  // otherwise wrap to a second line beneath the action buttons.
  SCW.toolbar.register({
    id:        'tb-hoist-entries-summary',
    viewMatch: WS_MATCH,
    mount: function (viewEl, nav) {
      var entries = viewEl.querySelector('.kn-entries-summary');
      if (entries && entries.parentNode !== nav) {
        nav.appendChild(entries);
      }
    }
  });

  // 4) Knack-native "Add filters" button (.kn-filters-nav)
  // Some Knack view templates render this inside a <div class="level"
  // class="level-left"> sibling of the nav rather than inside the nav
  // itself — flex `order` can't reach it then, so the visible toolbar
  // order falls back to DOM source order. Hoist into the nav so order
  // engages.
  SCW.toolbar.register({
    id:        'tb-hoist-filters-nav',
    viewMatch: WS_MATCH,
    mount: function (viewEl, nav) {
      var fn = viewEl.querySelector('.kn-filters-nav');
      if (fn && fn.parentNode !== nav) {
        nav.appendChild(fn);
      }
    }
  });

  // 5) Knack-native pagination select (.kn-pagination)
  // Same shape as the filters-nav hoist: rendered in a sibling level
  // block on some templates, needs to be inside the nav for ordering.
  SCW.toolbar.register({
    id:        'tb-hoist-pagination',
    viewMatch: WS_MATCH,
    mount: function (viewEl, nav) {
      var pag = viewEl.querySelector('.kn-pagination');
      if (pag && pag.parentNode !== nav) {
        nav.appendChild(pag);
      }
    }
  });
})();
/*** END FEATURE: device-worksheet unified toolbar ****************************/
