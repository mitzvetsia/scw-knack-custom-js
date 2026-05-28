/*** FEATURE: Loading overlay on view_3610 ***********************************
 *
 * view_3610 is the SOW Line Items grid on the build-sow / project-dashboard
 * scenes. Two visual problems we paper over here:
 *
 *   1. Initial load flash — between scene-render and the point at which
 *      device-worksheet has finished transformView, the user sees raw
 *      Knack rows, unstyled group headers, an empty tbody mid-reflow,
 *      etc. Even with our raw-row hide CSS in place, the table
 *      borders / thead / group rows can still strobe through the
 *      window.
 *
 *   2. Reload flash — every cell update triggers a model.fetch on the
 *      view (Knack's default), which tears down the whole tbody and
 *      rebuilds. refresh-on-inline-edit.js cascades that to OTHER views
 *      on the scene too, so even unrelated edits cause a reflow on
 *      view_3610. Users perceive a full-grid blink instead of "row N
 *      updated".
 *
 * Cover the entire grid with an opaque overlay from the moment a
 * load/reload is detected until ~250ms after view_3610's next
 * knack-view-render fires — that gives device-worksheet's transformView
 * and the group-collapse / KTL-accordion settling enough time to bring
 * the grid back to a stable visual state before exposure.
 *
 * Triggers:
 *   - knack-scene-render.any  → initial load
 *   - knack-cell-update.any   → any inline-edit cascade (including ones
 *                               that refresh view_3610 via the scene-
 *                               wide rule in refresh-on-inline-edit.js)
 *   - knack-records-load on view_3610 → Knack's own refetch event
 *
 * Dismiss:
 *   - 250ms after knack-view-render.view_3610
 *   - SAFETY_TIMEOUT_MS cap so the overlay never sticks forever
 *
 * Defenses (matches view-3341-loading-overlay.js):
 *   - show() bails if tbody already contains scw-ws-row rows (i.e.
 *     the grid is in a finished state — don't blanket a working view)
 *   - SAFETY_TIMEOUT_MS hard cap unconditional hide
 ******************************************************************************/
(function () {
  'use strict';

  var TARGET_VIEW       = 'view_3610';
  var OVERLAY_ID        = 'scw-view-3610-loading';
  var STYLE_ID          = 'scw-view-3610-loading-css';
  var EVENT_NS          = '.scwView3610Loading';
  var HIDE_DELAY        = 250;
  var SAFETY_TIMEOUT_MS = 15 * 1000;

  var _safetyTimer = 0;

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
      '#' + OVERLAY_ID + ' .scw-v3610-spin {',
      '  width: 28px; height: 28px;',
      '  border: 3px solid #e5e7eb;',
      '  border-top-color: #163C6E;',
      '  border-radius: 50%;',
      '  animation: scwV3610Spin 0.9s linear infinite;',
      '}',
      '#' + OVERLAY_ID + ' .scw-v3610-msg {',
      '  letter-spacing: 0.02em;',
      '}',
      '@keyframes scwV3610Spin { to { transform: rotate(360deg); } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // Treat the grid as "ready" when at least one scw-ws-row card row
  // is present in the tbody. That's the canonical marker that
  // device-worksheet has finished its transform — the same signal the
  // toolbar-registry uses to decide a view is worksheet-shaped.
  function isGridReady(view) {
    if (!view) return false;
    return !!view.querySelector('tbody tr.scw-ws-row');
  }

  function show() {
    injectStyles();
    var view = document.getElementById(TARGET_VIEW);
    if (!view) return;

    if (getComputedStyle(view).position === 'static') {
      view.style.position = 'relative';
    }
    if (document.getElementById(OVERLAY_ID)) return;   // already up

    var overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML =
      '<div class="scw-v3610-spin"></div>' +
      '<div class="scw-v3610-msg">Updating line items…</div>';
    view.appendChild(overlay);

    if (_safetyTimer) clearTimeout(_safetyTimer);
    _safetyTimer = setTimeout(function () {
      _safetyTimer = 0;
      console.warn('[scw-view-3610-loading] overlay hit ' +
        (SAFETY_TIMEOUT_MS / 1000) + 's safety cap — forcing hide.');
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

  function scheduleHide() {
    setTimeout(function () {
      var view = document.getElementById(TARGET_VIEW);
      if (view && !isGridReady(view)) {
        // device-worksheet hasn't finished its transform yet — wait
        // one more tick before exposing. Without this we'd briefly
        // uncover an in-progress grid on a slow page.
        setTimeout(scheduleHide, 150);
        return;
      }
      hide();
    }, HIDE_DELAY);
  }

  // Initial-load coverage. Skip MODAL scene renders — view_3610 is the
  // parent, isn't re-rendering, and the overlay would just cover a
  // static grid behind the modal until either the modal closes with a
  // view_3610 re-render (sometimes happens) or the 15s safety timer
  // fires (always happens). Clicking "+ Add" on the mounting-hardware
  // widget is the canonical trigger for this — it opened a modal
  // scene and made view_3610 look like it was refreshing in the
  // background. (scene.attributes.modal is the same flag
  // modal-refresh-redirect.js uses.)
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function (event, scene) {
      if (scene && scene.attributes && scene.attributes.modal === true) return;
      show();
    });

  // Reload coverage. Scope to view_3610's own cell-update events —
  // unrelated cell edits elsewhere on the scene (totals view, sibling
  // grids) used to mask view_3610 too, leaving the overlay up until
  // the safety timer fired. The records-load handler below also catches
  // model-refetch-driven reloads from sibling cascades.
  $(document)
    .off('knack-cell-update.' + TARGET_VIEW + EVENT_NS)
    .on('knack-cell-update.' + TARGET_VIEW + EVENT_NS, function () { show(); });

  // knack-records-load is fired by Knack when the AJAX for a view's
  // records returns. Some flows fire records-load EARLIER than
  // view-render — covers the "filter changed, model refetched, but
  // cell-update never fired" path.
  $(document)
    .off('knack-records-load.' + TARGET_VIEW + EVENT_NS)
    .on('knack-records-load.' + TARGET_VIEW + EVENT_NS, function () { show(); });

  // Dismissal: wait HIDE_DELAY past view-render so transformView has
  // a chance to fully process before we expose the grid.
  $(document)
    .off('knack-view-render.' + TARGET_VIEW + EVENT_NS)
    .on('knack-view-render.' + TARGET_VIEW + EVENT_NS, function () {
      scheduleHide();
    });

  // Authoritative dismissal: device-worksheet fires scw-worksheet-ready
  // the instant its transform finishes (the same event mdf-summary uses).
  // The view-render+isGridReady poll above can miss its window when
  // transform runs late (idle work, event storms), leaving the overlay to
  // sit until the 15s safety cap — which users experience as a 15s "load".
  // Hiding directly on the ready signal removes that stall.
  document.addEventListener('scw-worksheet-ready', function (e) {
    if (e && e.detail && e.detail.viewId === TARGET_VIEW) hide();
  });

  // First-paint attempt for the case where the scene already rendered
  // before this IIFE ran (hot reload, late bundle).
  setTimeout(function () {
    var view = document.getElementById(TARGET_VIEW);
    if (view && !isGridReady(view)) show();
  }, 0);
})();
