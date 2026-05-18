/*** FEATURE: Hide data-source views ***/
/**
 * Several views are present on a page only because other custom-JS
 * features scrape their rendered DOM / Knack model for data — the
 * user has no business seeing or interacting with them. Knack's
 * builder doesn't expose a "render but hide" toggle, so we hide them
 * here via CSS.
 *
 * `display: none` keeps the elements in the DOM and lets Knack
 * populate the Backbone model normally — features that read from
 * `Knack.views[viewId].model` or `tr#<recordId>` selectors continue
 * to work because the markup is still rendered, just not painted.
 *
 * Isolated test: only view_3573 right now. Aggressive hide:
 *   - CSS rule with multiple selector forms
 *   - inline display:none on view-render + scene-render
 *   - MutationObserver as last resort
 *   - console logs so the user can confirm in DevTools that the
 *     hide code is actually running
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-hide-data-source-views-css';
  var HIDDEN_VIEWS = ['view_3573'];
  var LOG = '[SCW hide-data-source]';

  console.log(LOG, 'IIFE loaded, targeting:', HIDDEN_VIEWS);

  // ── 1. CSS rule (multiple selector forms) ────────────────────
  if (!document.getElementById(STYLE_ID)) {
    var selectors = [];
    for (var i = 0; i < HIDDEN_VIEWS.length; i++) {
      var v = HIDDEN_VIEWS[i];
      selectors.push('#' + v);
      selectors.push('div#' + v);
      selectors.push('[id="' + v + '"]');
      selectors.push('.kn-view#' + v);
      selectors.push('.view-column:has(#' + v + ')');
      selectors.push('.view-column:has([id="' + v + '"])');
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = selectors.join(',\n') +
      ' {\n  display: none !important;\n  visibility: hidden !important;\n}\n';
    document.head.appendChild(style);
    console.log(LOG, 'CSS rule injected:', selectors.length, 'selectors');
  }

  // ── 2. Hide function — finds + nukes display ─────────────────
  function nuke(viewId, reason) {
    var el = document.getElementById(viewId);
    if (!el) {
      console.log(LOG, viewId, 'not in DOM (' + reason + ')');
      return false;
    }
    var was = el.style.display;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    var col = el.closest('.view-column');
    if (col) {
      col.style.setProperty('display', 'none', 'important');
    }
    console.log(LOG, viewId, 'hidden (' + reason + '), was display=' + was);
    return true;
  }

  function nukeAll(reason) {
    for (var i = 0; i < HIDDEN_VIEWS.length; i++) nuke(HIDDEN_VIEWS[i], reason);
  }

  // ── 3. Run on every viewRender for each hidden view ──────────
  for (var h = 0; h < HIDDEN_VIEWS.length; h++) {
    (function (viewId) {
      SCW.onViewRender(viewId, function () {
        nuke(viewId, 'view-render');
      }, 'scwHideDataSource');
    })(HIDDEN_VIEWS[h]);
  }

  // ── 4. Also run on every scene render (catches first paint
  //      before view-render handlers wire up) ──────────────────
  $(document).on('knack-scene-render.any.scwHideDataSource', function () {
    nukeAll('scene-render');
  });

  // ── 5. Run immediately + after DOMContentLoaded ──────────────
  nukeAll('script-load');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      nukeAll('DOMContentLoaded');
    });
  }

  // ── 6. MutationObserver — if Knack re-creates the element or
  //      another feature re-shows it, re-hide on next tick ────
  var observer = new MutationObserver(function () {
    nukeAll('mutation');
  });
  // Wait for body to exist
  function startObserving() {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
      console.log(LOG, 'MutationObserver started on document.body');
    } else {
      setTimeout(startObserving, 50);
    }
  }
  startObserving();
})();
/*** END FEATURE: Hide data-source views ***/
