/*** DISABLE NATIVE SCROLL RESTORATION ***************************************
 *
 * Knack is an SPA: navigating between pages is pushState/hash navigation, and
 * the browser's default `history.scrollRestoration = 'auto'` tries to restore
 * the previous scroll position for a history entry AFTER the new page starts
 * rendering. On pages this bundle re-renders heavily (e.g. the bid comparison
 * grid on scene_1155, docHeight ~36k), that restore lands as a sudden jump
 * DOWN on navigation-in — there is no JS scrollTo/scrollBy involved, so it
 * can't be fixed inside any feature; it's the browser.
 *
 * Set restoration to MANUAL so the browser never auto-scrolls on navigation.
 * Forward navigation (the common case) lands at the top, which is what users
 * expect here. This is app-wide and reversible (delete this file + its
 * build.sh line, or set it back to 'auto').
 ****************************************************************************/
(function () {
  'use strict';
  try {
    if (window.history && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  } catch (e) { /* ignore — feature-detect failed */ }
})();
/*** END DISABLE NATIVE SCROLL RESTORATION ***********************************/
