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
 ******************************************************************************/
(function () {
  'use strict';

  var TARGET_VIEW = 'view_3341';
  var OVERLAY_ID  = 'scw-view-3341-loading';
  var STYLE_ID    = 'scw-view-3341-loading-css';
  var EVENT_NS    = '.scwView3341Loading';
  var HIDE_DELAY  = 250; // ms after view-render before we drop the overlay

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

  function show() {
    injectStyles();
    var view = document.getElementById(TARGET_VIEW);
    if (!view) return;
    // Ensure overlay anchors to the view.
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
  }

  function hide() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // Show on every scene render — if view_3341 is on this scene the
  // shell is in the DOM by the time scene-render fires, even though
  // the rows haven't loaded yet. (If the view isn't on this scene
  // the show() call is a silent no-op.)
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

  // First-paint attempt for the case where the scene is already
  // rendered when this IIFE runs (e.g. hot reload during development).
  setTimeout(show, 0);
})();
