/*** FEATURE: Internal-only views (@getscw.com gate) **************************
 *
 * Hides the configured views from anyone NOT logged in with an internal
 * (@getscw.com) email — see SCW.isInternalUser(). Add view ids to VIEWS.
 *
 * Mechanism: a body-class CSS gate. The views are hidden by DEFAULT
 *   body:not(.scw-internal-user) #view_XXXX { display:none }
 * so a non-internal (or not-yet-resolved) session never sees a flash of
 * the content. On each scene render we resolve the current user and add
 * `scw-internal-user` to <body> when they're internal — which lifts the
 * hide and lets Knack render the view normally (no display-value guessing).
 *
 * ⚠️ This is a UI gate, NOT a security boundary — it runs in the browser
 * and a technical user can flip the body class. For sensitive DATA, also
 * lock the view down with Knack object/view role permissions. This just
 * keeps the view out of the UI for non-staff.
 ****************************************************************************/
(function () {
  'use strict';

  // Views to gate to @getscw.com staff only. Add ids here.
  var VIEWS = ['view_4045'];

  // Extra non-@getscw.com emails to admit (lowercase). Empty by default.
  var ALLOWLIST = [];

  var STYLE_ID = 'scw-internal-only-views-css';
  var BODY_CLASS = 'scw-internal-user';
  var EVENT_NS = '.scwInternalOnlyViews';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = VIEWS.map(function (id) {
      return 'body:not(.' + BODY_CLASS + ') #' + id + ' { display: none !important; }';
    }).join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function syncBodyClass() {
    var internal = !!(window.SCW && typeof SCW.isInternalUser === 'function' &&
      SCW.isInternalUser(ALLOWLIST));
    document.body.classList.toggle(BODY_CLASS, internal);
  }

  // Hide immediately so non-internal users never see a flash.
  injectStyles();

  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      injectStyles();
      syncBodyClass();
      // Session email can populate a beat after first render — re-check.
      setTimeout(syncBodyClass, 300);
    });

  // First-paint attempt (hot reload / late bundle load).
  syncBodyClass();
  setTimeout(syncBodyClass, 300);
})();
/*** END FEATURE: Internal-only views ****************************************/
