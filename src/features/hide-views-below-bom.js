/*** HIDE VIEWS BELOW BOM — preview proposal page (scene_1096) ***/
/**
 * On the customer-facing Preview Proposal page (#proposals/proposal/<sowId>/,
 * scene_1096) the BOM table (view_3343) is the last thing the customer should
 * see. Anything rendered below it — debug grids, internal data sources, ops-
 * only widgets — is hidden so the page ends cleanly at the BOM.
 *
 * Implementation: on scene render, walk every .kn-view in document order,
 * flip a flag once we pass view_3343, and hide every subsequent view.
 */
(function () {
  'use strict';

  var SCENE_ID = 'scene_1096';
  var BOM_VIEW = 'view_3343';
  var STYLE_ID = 'scw-hide-views-below-bom-css';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.scw-hidden-below-bom { display: none !important; }';
    document.head.appendChild(style);
  }

  function applyHide() {
    var bom = document.getElementById(BOM_VIEW);
    if (!bom) return;
    var views = document.querySelectorAll('.kn-view');
    var passed = false;
    for (var i = 0; i < views.length; i++) {
      if (passed) {
        views[i].classList.add('scw-hidden-below-bom');
        // If the view is wrapped in a KTL accordion, hide the whole
        // accordion shell — otherwise the accordion's "Title N" header
        // remains visible even when the inner view is hidden.
        var acc = views[i].closest('.scw-ktl-accordion');
        if (acc) acc.classList.add('scw-hidden-below-bom');
      } else if (views[i].id === BOM_VIEW) {
        passed = true;
      }
    }
  }

  injectStyles();
  SCW.onSceneRender(SCENE_ID, applyHide, 'scwHideViewsBelowBom');
  // Each view render can add new nodes (especially the BOM itself —
  // its position in the DOM is stable but later views may render
  // after). Re-apply on the BOM render and on any view render under
  // the scene so newly-mounted views below the BOM are caught too.
  SCW.onViewRender(BOM_VIEW, applyHide, 'scwHideViewsBelowBom');
})();
