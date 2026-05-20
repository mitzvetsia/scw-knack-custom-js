/*** FEATURE: Loading overlay on view_3341 ***********************************
 *
 * view_3341 is the SOW Line Items grid on the proposal page. Knack's own
 * "Loading…" spinner clears as soon as the records arrive, but on a large
 * SOW (1000+ rows) there's a noticeable post-data window where:
 *
 *   - Knack is still inserting <tr>s into the DOM
 *   - proposal-grid.js is restructuring groups, injecting headers,
 *     and running the totals pipeline
 *   - dynamic-cell-colors / group-collapse are kicking in
 *
 * The user sees a half-rendered grid during all of that — partial groups,
 * unstyled rows, missing totals — which reads as "broken" and triggers
 * the paint-then-repaint flash when proposal-grid's safety-net timers
 * re-run the totals pipeline.
 *
 * Cover view_3341 with a full overlay (spinner + "Loading line items…")
 * from scene render until the proposal-grid pipeline has injected the
 * totals rows. We watch for tr.scw-level-total-row appearing in the
 * tbody — that's the canonical "pipeline finished" marker — instead
 * of relying on a fixed delay that races the pipeline on big SOWs.
 *
 * Defenses against "spinner stuck forever":
 *   1. SAFETY_TIMEOUT_MS — every show() schedules a guaranteed hide at
 *      this cap regardless of whether the totals marker appears.
 *      Catches edge cases (proposal-grid disabled, pipeline crash,
 *      empty SOW with no rows = no totals).
 *   2. show() bails immediately if the totals marker already exists.
 *   3. POLL_MS keeps the totals check responsive without observer
 *      overhead. Once the marker exists, drop the overlay.
 ******************************************************************************/
(function () {
  'use strict';

  var TARGET_VIEW       = 'view_3341';
  var OVERLAY_ID        = 'scw-view-3341-loading';
  var STYLE_ID          = 'scw-view-3341-loading-css';
  var EVENT_NS          = '.scwView3341Loading';
  var POLL_MS           = 80;            // poll cadence for the totals marker
  var SAFETY_TIMEOUT_MS = 20 * 1000;     // hard cap

  var _safetyTimer = 0;
  var _pollTimer   = 0;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + OVERLAY_ID + ' {',
      '  position: absolute; inset: 0;',
      '  z-index: 50;',
      '  background: rgba(255,255,255,0.96);',
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

  /** True once proposal-grid's totals pipeline has injected at least
   *  one tr.scw-level-total-row. That's the deterministic "we're done"
   *  signal — Knack rows alone can be present while the pipeline is
   *  still building totals + repainting, so we don't trust those. */
  function totalsReady(view) {
    if (!view) return false;
    return !!view.querySelector('table tbody tr.scw-level-total-row');
  }

  /** Fallback "rows are present" check for cases where proposal-grid
   *  is disabled on this scene or the SOW is empty. If totals never
   *  arrive, at least don't sit on a working grid. */
  function hasDataRows(view) {
    if (!view) return false;
    var rows = view.querySelectorAll('table tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      if (/^[a-f0-9]{24}$/i.test(rows[i].id)) return true;
    }
    return false;
  }

  function show() {
    injectStyles();
    var view = document.getElementById(TARGET_VIEW);
    if (!view) return;
    if (totalsReady(view)) return; // already done — no overlay needed

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

    // Safety cap.
    if (_safetyTimer) clearTimeout(_safetyTimer);
    _safetyTimer = setTimeout(function () {
      _safetyTimer = 0;
      console.warn('[scw-view-3341-loading] overlay hit ' +
        (SAFETY_TIMEOUT_MS / 1000) + 's safety cap — forcing hide. ' +
        'Either view_3341 took too long to render OR proposal-grid never ' +
        'injected the totals row.');
      hide();
    }, SAFETY_TIMEOUT_MS);

    // Poll for the totals marker. Once it lands, the pipeline is done
    // (including the safety-net re-runs and the mutation observer's
    // settle period) and we can drop the overlay in one go.
    if (_pollTimer) clearTimeout(_pollTimer);
    function poll() {
      _pollTimer = 0;
      var v = document.getElementById(TARGET_VIEW);
      if (!v) return; // scene navigated away
      if (totalsReady(v)) { hide(); return; }
      _pollTimer = setTimeout(poll, POLL_MS);
    }
    _pollTimer = setTimeout(poll, POLL_MS);
  }

  function hide() {
    if (_safetyTimer) { clearTimeout(_safetyTimer); _safetyTimer = 0; }
    if (_pollTimer)   { clearTimeout(_pollTimer);   _pollTimer   = 0; }
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // Show on every scene render — if view_3341 is on this scene the
  // shell is in the DOM by the time scene-render fires. show() bails
  // if the view isn't here OR if totals are already injected.
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () { show(); });

  // Re-show whenever view_3341 re-renders (filter change, inline-edit
  // refetch, etc.) — proposal-grid's pipeline reruns on every records-
  // render, and during that re-render the totals are briefly absent.
  // The overlay covers that gap so the user doesn't see the paint-
  // then-repaint flash.
  $(document)
    .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
    .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () { show(); });

  $(document)
    .off('knack-records-render.' + TARGET_VIEW + EVENT_NS)
    .on('knack-records-render.' + TARGET_VIEW + EVENT_NS, function () { show(); });

  // First-paint attempt for the case where the scene is already
  // rendered when this IIFE runs (hot reload / late bundle load).
  setTimeout(show, 0);
})();
