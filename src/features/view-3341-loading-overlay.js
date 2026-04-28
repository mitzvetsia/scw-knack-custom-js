/*** FEATURE: Loading overlay on view_3341 ***********************************
 *
 * view_3341 is the SOW Line Items grid on the proposal page. Knack's own
 * "Loading…" spinner clears as soon as the records arrive, but on a large
 * SOW (1000+ rows) there's a noticeable post-data window where:
 *
 *   - Knack is still inserting <tr>s into the DOM
 *   - proposal-grid.js is restructuring groups, injecting headers,
 *     and running label rewrites
 *   - dynamic-cell-colors / group-collapse are kicking in
 *
 * The user sees a half-rendered grid during all of that — partial groups,
 * unstyled rows, missing camera labels — which reads as a broken view.
 *
 * Cover view_3341 with a full overlay (spinner + "Loading line items…")
 * from the moment the scene renders until ~250ms after knack-view-render
 * fires for view_3341. The delay gives proposal-grid + the other
 * view-render-bound modules time to finish their synchronous work before
 * we expose the grid.
 *
 * Defenses against "spinner stuck forever":
 *   1. SAFETY_TIMEOUT_MS — every show() schedules a guaranteed hide at
 *      this cap regardless of whether view-render ever fires. Catches
 *      hot-reload / late-bind / cross-tab-reload races where the
 *      view-render event fired before our listener attached.
 *   2. show() bails immediately if the view's tbody already contains
 *      rendered rows — same race, faster path.
 *   3. Hide also bound to knack-records-load (some Knack render flows
 *      fire this earlier than knack-view-render).
 ******************************************************************************/
(function () {
  'use strict';

  var TARGET_VIEW       = 'view_3341';
  var OVERLAY_ID        = 'scw-view-3341-loading';
  var STYLE_ID          = 'scw-view-3341-loading-css';
  var EVENT_NS          = '.scwView3341Loading';
  var HIDE_DELAY        = 250;          // ms after view-render before drop overlay
  var SAFETY_TIMEOUT_MS = 15 * 1000;    // hard cap — overlay disappears no matter what

  var _safetyTimer = 0;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + OVERLAY_ID + ' {',
      '  position: absolute; inset: 0;',
      '  z-index: 50;',
      '  background: rgba(255,255,255,0.92);',
      '  display: flex; flex-direction: column;',
      '  align-items: center; justify-content: center;',
      '  gap: 14px;',
      '  font: 500 14px/1.3 system-ui, -apple-system, sans-serif;',
      '  color: #4b5563;',
      '  border-radius: 8px;',
      '  pointer-events: auto;',
      '}',
      '#' + OVERLAY_ID + ' .scw-v3341-spin {',
      '  width: 28px; height: 28px;',
      '  border: 3px solid #e5e7eb;',
      '  border-top-color: #163C6E;',
      '  border-radius: 50%;',
      '  animation: scwV3341Spin 0.9s linear infinite;',
      '}',
      '#' + OVERLAY_ID + ' .scw-v3341-msg {',
      '  letter-spacing: 0.02em;',
      '}',
      '@keyframes scwV3341Spin { to { transform: rotate(360deg); } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // True when the view's tbody already has rendered data rows. If
  // we're called after Knack finished rendering (race), we shouldn't
  // re-show the overlay over an already-good grid.
  function hasRenderedRows(view) {
    if (!view) return false;
    var tbody = view.querySelector('table tbody');
    if (!tbody) return false;
    // Real data rows have an id (24-hex). Group headers, "no data"
    // placeholders, etc. either lack id or have a non-hex value.
    var rows = tbody.querySelectorAll('tr[id]');
    for (var i = 0; i < rows.length; i++) {
      if (/^[a-f0-9]{24}$/i.test(rows[i].id)) return true;
    }
    return false;
  }

  function show() {
    injectStyles();
    var view = document.getElementById(TARGET_VIEW);
    if (!view) return;
    // Already rendered → don't show overlay over a working grid.
    // Catches the case where this script loads after view-render
    // already fired (hot reload, slow first paint, cross-tab reload).
    if (hasRenderedRows(view)) return;

    if (getComputedStyle(view).position === 'static') {
      view.style.position = 'relative';
    }
    if (document.getElementById(OVERLAY_ID)) return;

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML =
      '<div class="scw-v3341-spin"></div>' +
      '<div class="scw-v3341-msg">Loading line items…</div>';
    view.appendChild(overlay);

    // Safety cap — hide unconditionally after SAFETY_TIMEOUT_MS even
    // if view-render / records-load never fire. Prevents the "spinner
    // stuck forever" state when the listener binds after the event.
    if (_safetyTimer) clearTimeout(_safetyTimer);
    _safetyTimer = setTimeout(function () {
      _safetyTimer = 0;
      console.warn('[scw-view-3341-loading] overlay hit ' +
        (SAFETY_TIMEOUT_MS / 1000) + 's safety cap — forcing hide. ' +
        'Either view_3341 took too long to render or the view-render ' +
        'event fired before our listener attached.');
      hide();
    }, SAFETY_TIMEOUT_MS);
  }

  function hide() {
    if (_safetyTimer) {
      clearTimeout(_safetyTimer);
      _safetyTimer = 0;
    }
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // Show on every scene render — if view_3341 is on this scene the
  // shell is in the DOM by the time scene-render fires, even though
  // the rows haven't loaded yet. show() is a no-op when view_3341
  // isn't on the scene OR when its rows are already rendered.
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { show(); });

  // Hide ~250ms after the view finishes rendering so proposal-grid's
  // bound handler (also on knack-view-render.view_3341) has time to
  // complete its synchronous restructure before we expose the grid.
  $(document)
    .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
    .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () {
      setTimeout(hide, HIDE_DELAY);
    });

  // Some Knack render flows fire knack-records-load earlier than
  // knack-view-render (data arrived, rows about to inject). Belt-and-
  // suspenders hide here too, with the same delay so proposal-grid's
  // synchronous post-render work still gets a chance to run.
  $(document)
    .off('knack-records-load.' + TARGET_VIEW + EVENT_NS)
    .on('knack-records-load.' + TARGET_VIEW + EVENT_NS, function () {
      setTimeout(hide, HIDE_DELAY);
    });

  // First-paint attempt for the case where the scene is already
  // rendered when this IIFE runs (e.g. hot reload during development).
  // hasRenderedRows() guards against showing over a finished grid.
  setTimeout(show, 0);
})();
