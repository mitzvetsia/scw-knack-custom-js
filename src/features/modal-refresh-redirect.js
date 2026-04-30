/*** MODAL REFRESH REDIRECT ***/
/**
 * When a Knack modal scene is the FIRST scene rendered after page load
 * (i.e. the user hit refresh while a modal was open), Knack draws it
 * full-screen because there's no parent scene rendered behind it. The
 * URL hash points at `#parent/parent-id/modal-slug/modal-id`, but only
 * the modal half got rendered.
 *
 * Strip the last two hash segments and let Knack re-render the parent.
 * Subsequent scene renders (any in-app navigation) are left alone — we
 * only act on the very first scene-render event in the session, so
 * normal modal opens via parent → modal still work as expected.
 *
 * Bonus: also fixes "deep-linked modal URL" cases (e.g. a user pastes
 * a modal hash from a teammate / bookmark). Same end state — the user
 * lands on the parent, no full-screen modal.
 */
(function () {
  'use strict';

  var firstRender = true;

  $(document).on('knack-scene-render.any', function (event, scene) {
    if (!firstRender) return;
    firstRender = false;

    if (!scene || !scene.attributes) return;
    if (scene.attributes.modal !== true) return;

    // Strip the trailing two hash segments (modal slug + modal record id),
    // preserving the query string. Pattern mirrors redirectToParent() in
    // proposal-pdf-export.js.
    var raw       = window.location.hash || '';
    var qIdx      = raw.indexOf('?');
    var pathPart  = qIdx >= 0 ? raw.substring(0, qIdx) : raw;
    var queryPart = qIdx >= 0 ? raw.substring(qIdx)    : '';
    pathPart = pathPart.replace(/\/+$/, '');
    var parts = pathPart.replace(/^#\/?/, '').split('/').filter(Boolean);

    var newHash;
    if (parts.length >= 2) {
      parts.splice(-2, 2);
      newHash = '#' + parts.join('/') + queryPart;
    } else {
      newHash = '#';
    }

    // location.replace so the broken full-screen-modal URL doesn't sit
    // in the back button.
    try {
      window.location.replace(window.location.pathname + window.location.search + newHash);
    } catch (e) {
      window.location.hash = newHash;
    }
  });
})();
