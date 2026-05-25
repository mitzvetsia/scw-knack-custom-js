/*** FEATURE: Site Maps + Additional Photos on the proposal preview page ***/
/**
 * The proposal preview page (scene_1096) is meant to show staff exactly
 * what the PUBLISHED proposal will look like. But the Site Maps
 * (view_3928) and Additional Photos (view_3929) views are hidden in the
 * Knack Builder — they're scraped only to append to the published
 * PDF/HTML, so they never appeared on the preview.
 *
 * This module asks proposal-pdf-export for the SAME append-image markup it
 * emits into the published output (SCW.pdfExport.appendImagesHtml) and
 * injects it at the bottom of the preview scene, with a scoped subset of
 * the published image CSS. The result is a faithful, on-screen version of
 * the appended pages — no separate scrape, no chance of drifting from what
 * actually publishes.
 *
 * Idempotent: the container is rebuilt on each relevant render; if there
 * are no images (yet), any existing container is removed.
 */
(function () {
  'use strict';

  var SCENE_ID     = 'scene_1096';
  var SOURCE_VIEWS = ['view_3928', 'view_3929']; // Site Maps, Additional Photos
  var GRID_VIEW    = 'view_3341';                // main line-items grid (render anchor)
  var CONTAINER_ID = 'scw-preview-append-images';
  var STYLE_ID     = 'scw-preview-append-images-css';
  var NS           = '.scwPreviewImages';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    // Mirror the published .append-image* rules (proposal-pdf-export
    // getPdfCss), scoped under the container so nothing bleeds into the
    // live Knack page. The print-only page-break properties are dropped —
    // on screen the images simply flow, separated by margin.
    s.textContent = [
      '#' + CONTAINER_ID + ' {',
      '  max-width: 8.5in; margin: 36px auto 0; padding: 0 16px 24px;',
      '  box-sizing: border-box;',
      '}',
      '#' + CONTAINER_ID + ' .append-image-page { margin-top: 28px; text-align: center; }',
      '#' + CONTAINER_ID + ' .append-image-grid-section { margin-top: 28px; }',
      '#' + CONTAINER_ID + ' .append-image-title {',
      '  font-size: 18px; font-weight: 800; color: #07467c;',
      '  margin: 0 0 12px 0; padding-bottom: 6px;',
      '  border-bottom: 3px solid #07467c; text-align: left;',
      '}',
      '#' + CONTAINER_ID + ' .append-image {',
      '  display: block; width: 100%; max-width: 100%;',
      '  max-height: 80vh; height: auto; margin: 0 auto;',
      '  object-fit: contain; border: 1px solid #eee;',
      '}',
      '#' + CONTAINER_ID + ' .append-image-grid {',
      '  display: flex; flex-wrap: wrap; gap: 10px;',
      '}',
      '#' + CONTAINER_ID + ' .append-image-thumb {',
      '  width: 250px; height: 250px; object-fit: contain;',
      '  border: 1px solid #ddd; background: #fafafa;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function render() {
    if (!window.SCW || !SCW.pdfExport || !SCW.pdfExport.appendImagesHtml) return;
    var sceneEl = document.getElementById('kn-' + SCENE_ID);
    if (!sceneEl) return;

    // rawSiteMaps: the preview is internal — show raw full-size images
    // instead of routing through the images.weserv.nl resize proxy.
    var html = SCW.pdfExport.appendImagesHtml(SCENE_ID, { rawSiteMaps: true });
    var existing = document.getElementById(CONTAINER_ID);

    if (!html) {
      // No images scraped (yet) — drop any stale container and bail.
      if (existing) existing.parentNode.removeChild(existing);
      return;
    }

    injectStyles();
    var container = existing || document.createElement('div');
    container.id = CONTAINER_ID;
    container.innerHTML = html;
    // Always re-anchor at the very bottom of the scene so it lands beneath
    // the line-items grid + totals regardless of view-render order.
    if (container.parentNode !== sceneEl ||
        sceneEl.lastElementChild !== container) {
      sceneEl.appendChild(container);
    }
  }

  var _t = 0;
  function scheduleRender() {
    if (_t) clearTimeout(_t);
    _t = setTimeout(function () { _t = 0; render(); }, 200);
  }

  function bind(viewId) {
    if (window.SCW && SCW.onViewRender) {
      SCW.onViewRender(viewId, scheduleRender, NS);
    } else {
      $(document)
        .off('knack-view-render.' + viewId + NS)
        .on('knack-view-render.' + viewId + NS, scheduleRender);
    }
  }

  // Re-render whenever the grid or either image source view renders — the
  // image views populate the model/DOM the scrape reads from, and the grid
  // anchors the bottom-of-page position.
  bind(GRID_VIEW);
  for (var i = 0; i < SOURCE_VIEWS.length; i++) bind(SOURCE_VIEWS[i]);

  // First-paint attempt for hot-reload / late-bundle cases where the
  // scene already rendered before this IIFE ran.
  if (document.getElementById('kn-' + SCENE_ID)) scheduleRender();
})();
