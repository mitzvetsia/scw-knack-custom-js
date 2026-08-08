/*** FEATURE: GOOGLE PLACES PAC WATCHDOG **************************************
 *
 * Google Places Autocomplete (the legacy google.maps.places.Autocomplete
 * used by the Builder address snippets, e.g. the installationservices
 * "Add Site" page) renders its suggestion dropdown as a BODY-LEVEL
 * .pac-container absolutely positioned beneath the bound input (which
 * Google tags with .pac-target-input). The dropdown only hides on the
 * bound input's blur — so when a Knack re-render replaces the input, the
 * container's owner is a detached node, blur can never fire, and the
 * dropdown sits stuck on screen covering the fields beneath it.
 *
 * Watchdog: any mousedown / focus landing OUTSIDE a pac-container and NOT
 * on a pac-bound input hides every pac dropdown; Escape hides them too.
 * Hiding is always safe — Google re-shows a live container by resetting
 * its display whenever new predictions arrive, so worst case the user
 * types another character and it pops right back.
 ****************************************************************************/
(function () {
  'use strict';

  function hideAll() {
    var pacs = document.querySelectorAll('.pac-container');
    for (var i = 0; i < pacs.length; i++) {
      if (pacs[i].style.display !== 'none') pacs[i].style.display = 'none';
    }
  }

  function isPacTerritory(t) {
    return !!(t && t.closest &&
      (t.closest('.pac-container') || t.closest('.pac-target-input')));
  }

  if (document.documentElement.hasAttribute('data-scw-pac-watchdog')) return;
  document.documentElement.setAttribute('data-scw-pac-watchdog', '1');

  // Mouse path — click anywhere that isn't the dropdown or its input.
  document.addEventListener('mousedown', function (e) {
    if (isPacTerritory(e.target)) return;
    hideAll();
  }, true);

  // Keyboard path — tabbing to another field, or Escape.
  document.addEventListener('focusin', function (e) {
    if (isPacTerritory(e.target)) return;
    hideAll();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideAll();
  }, true);
})();
/*** END GOOGLE PLACES PAC WATCHDOG ******************************************/
