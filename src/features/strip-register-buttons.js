/*** FEATURE: Strip internal-only registration buttons from login views *********
 *
 * Knack's login view auto-renders a "Sign up as a <Profile>" button for
 * every public registration profile attached to the page. On the
 * published-proposal sub-portal login (view_3785) we want customers and
 * admins to be able to self-register, but the SCW-internal Sales and
 * Install Op profiles should never be exposed to external users.
 *
 * Removes the matching <a class="register kn-button"> anchors from the
 * DOM entirely (not just visually) so the buttons can't be discovered
 * via DevTools, copied as URLs, or scraped from page source.
 *
 * Targets are configured per-view by Knack profile key. Profile keys
 * are stable across re-deploys; matching by button text is brittle
 * because Knack also injects a leading "Sign up as a " prefix and any
 * whitespace tweaks would break the match.
 ******************************************************************************/
(function () {
  'use strict';

  // ── Targets ─────────────────────────────────────────────
  //   viewId    → list of profile keys to strip from that view
  // To strip an additional profile from this view, append its
  // profile_NN key here. To target another login view, add a new entry.
  var VIEWS = {
    view_3785: ['profile_37', 'profile_66'] // SCW Sale, SCW Install Op
  };

  function stripButtons(viewId, profiles) {
    var view = document.getElementById(viewId);
    if (!view) return;
    var register = view.querySelector('.register');
    if (!register) return;

    for (var i = 0; i < profiles.length; i++) {
      var profile = profiles[i];
      // Knack hrefs look like ".../knack-register/<profile_key>" — match
      // on the trailing segment so we're not coupled to the proposal-id
      // path prefix, which varies per record.
      var anchors = register.querySelectorAll(
        'a.register[href$="/knack-register/' + profile + '"]'
      );
      for (var j = 0; j < anchors.length; j++) {
        var a = anchors[j];
        if (a.parentNode) a.parentNode.removeChild(a);
      }
    }
  }

  Object.keys(VIEWS).forEach(function (viewId) {
    var profiles = VIEWS[viewId];
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(viewId, function () {
        stripButtons(viewId, profiles);
      }, 'scwStripRegisterButtons');
    }
    // First-load entry point — script can load after the initial render
    // event has already fired.
    if (document.getElementById(viewId)) {
      stripButtons(viewId, profiles);
    }
  });
})();
/*** END FEATURE: Strip internal-only registration buttons ********************/
