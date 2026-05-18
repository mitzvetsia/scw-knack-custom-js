/*** FEATURE: Hide data-source views ***/
/**
 * Several views are present on a page only because other custom-JS
 * features scrape their rendered DOM / Knack model for data — the
 * user has no business seeing or interacting with them. Knack's
 * builder doesn't expose a "render but hide" toggle, so we hide them
 * here via CSS.
 *
 * Isolated test: only view_3573 right now. Diagnostic build —
 * console-logs whether the IIFE runs, whether the CSS rule lands,
 * and what the element looks like at each view-render.
 */
(function () {
  'use strict';

  var STYLE_ID = 'scw-hide-data-source-views-css';
  var HIDDEN_VIEWS = ['view_3573'];
  var LOG = '[SCW hide-data-source]';

  console.log(LOG, 'IIFE loaded, targeting:', HIDDEN_VIEWS);

  if (!document.getElementById(STYLE_ID)) {
    var selectors = [];
    for (var i = 0; i < HIDDEN_VIEWS.length; i++) {
      selectors.push('#' + HIDDEN_VIEWS[i]);
      selectors.push('.view-column:has(> #' + HIDDEN_VIEWS[i] + ')');
      selectors.push('.view-column:has(> .kn-view#' + HIDDEN_VIEWS[i] + ')');
    }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = selectors.join(',\n') +
      ' {\n  display: none !important;\n}\n';
    document.head.appendChild(style);
    console.log(LOG, 'CSS rule injected. Selectors:', selectors);
  }

  function hideOnRender(viewId) {
    SCW.onViewRender(viewId, function () {
      var el = document.getElementById(viewId);
      if (!el) {
        console.log(LOG, viewId, 'view-render fired but element NOT in DOM');
        return;
      }
      var computed = window.getComputedStyle(el).display;
      console.log(LOG, viewId, 'view-render — element found, computed display=' + computed +
        ', tagName=' + el.tagName + ', class="' + el.className + '"');
      el.style.display = 'none';
      var col = el.closest('.view-column');
      if (col && col.children.length === 1) col.style.display = 'none';
    }, 'scwHideDataSource');
  }
  for (var h = 0; h < HIDDEN_VIEWS.length; h++) hideOnRender(HIDDEN_VIEWS[h]);
})();
/*** END FEATURE: Hide data-source views ***/
