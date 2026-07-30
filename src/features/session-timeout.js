/*** SESSION TIMEOUT — hard 72h re-login cap ********************************
 *
 * Business rule (2026-07-09): force every user to log out and back in at
 * least every 72 hours, regardless of how alive their Knack session/token
 * still is. Knack keeps sessions alive well past this (esp. with a long
 * server-side session length), so we enforce the cap client-side.
 *
 * HOW IT WORKS
 *   - On first sight of a logged-in user we drop an ANCHOR in localStorage:
 *       { userId, ts }  (ts = the moment the 72h clock started).
 *   - Every load + every scene navigation (+ a slow backstop interval) we
 *     re-check: if now - anchor.ts exceeds MAX_SESSION_MS, force logout.
 *   - The anchor RESETS on a genuine re-login: it's cleared whenever we see
 *     NO logged-in user (the login screen), and it's re-stamped when the
 *     logged-in user id changes. So log-out → log-in starts a fresh 72h.
 *
 * SAFETY
 *   - The backstop interval will NOT log a user out while they're focused in
 *     an editable field (mid-form) — it defers to the next navigation/load so
 *     we never yank someone out of an in-progress edit. Load + scene-render
 *     enforcement covers the common case; the interval only catches a tab
 *     left idle open past the cap.
 *
 * This is independent of the expired-token toast in util.js — that reacts to
 * a token Knack has ALREADY invalidated; this proactively rotates a still-
 * valid one on a schedule.
 ****************************************************************************/
(function () {
  'use strict';

  var MAX_SESSION_MS    = 72 * 60 * 60 * 1000;   // 72 hours
  var CHECK_INTERVAL_MS = 10 * 60 * 1000;        // backstop re-check (idle tabs)
  var ANCHOR_KEY        = 'scw-auth-anchor';
  var NS                = '.scwSessionTimeout';

  function now() { return Date.now(); }

  function currentUserId() {
    try {
      if (typeof Knack === 'undefined') return null;
      var a = Knack.getUserAttributes && Knack.getUserAttributes();
      if (a && a.id) return a.id;
      if (Knack.session && Knack.session.user && Knack.session.user.id) {
        return Knack.session.user.id;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function isLoggedIn() {
    try {
      if (typeof Knack === 'undefined') return false;
      // getUserToken() returns '' / null when logged out; a truthy token +
      // a resolvable user id means we're in an authenticated session.
      var tok = Knack.getUserToken && Knack.getUserToken();
      return !!tok && !!currentUserId();
    } catch (e) { return false; }
  }

  function readAnchor() {
    try { return JSON.parse(localStorage.getItem(ANCHOR_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeAnchor(o) {
    try { localStorage.setItem(ANCHOR_KEY, JSON.stringify(o)); } catch (e) {}
  }
  function clearAnchor() {
    try { localStorage.removeItem(ANCHOR_KEY); } catch (e) {}
  }

  // Don't interrupt an in-progress edit from the backstop interval.
  function isEditingNow() {
    var a = document.activeElement;
    if (!a || !a.tagName) return false;
    var tag = a.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      var t = (a.getAttribute('type') || 'text').toLowerCase();
      // Buttons/checkboxes/radios aren't "mid-typing" — only text-ish inputs.
      return t !== 'button' && t !== 'submit' && t !== 'checkbox' &&
             t !== 'radio' && t !== 'reset' && t !== 'file';
    }
    return !!a.isContentEditable;
  }

  function forceLogout() {
    clearAnchor();
    try {
      if (typeof Knack !== 'undefined' && typeof Knack.handleLogout === 'function') {
        Knack.handleLogout();
        return;
      }
    } catch (e) { /* fall through */ }
    var link = document.querySelector(
      'a.kn-log-out, a[href*="logout" i], a[href$="#logout"]');
    if (link) { link.click(); return; }
    window.location.reload();
  }

  // `fromInterval` = called by the backstop timer (respect the edit guard).
  function enforce(fromInterval) {
    // Not authenticated (login screen / logged out) → clear the anchor so the
    // next login starts a fresh 72h window.
    if (!isLoggedIn()) { clearAnchor(); return; }

    var uid = currentUserId();
    var anchor = readAnchor();

    // No anchor yet, or a different user is now logged in → (re)start clock.
    if (!anchor || !anchor.ts || (uid && anchor.userId && anchor.userId !== uid)) {
      writeAnchor({ userId: uid, ts: now() });
      return;
    }

    if (now() - anchor.ts > MAX_SESSION_MS) {
      if (fromInterval && isEditingNow()) return;   // defer — don't yank a live edit
      console.warn('[SCW] Session timeout: 72h reached → forcing re-login');
      forceLogout();
    }
  }

  // Run on load, on every scene navigation, and on a slow backstop interval.
  enforce(false);
  if (window.SCW && SCW.onSceneRender) {
    SCW.onSceneRender('any', function () { enforce(false); }, NS);
  }
  $(document).off('knack-scene-render.any' + NS)
    .on('knack-scene-render.any' + NS, function () { enforce(false); });
  setInterval(function () { enforce(true); }, CHECK_INTERVAL_MS);

  // Expose for manual/testing use.
  window.SCW = window.SCW || {};
  window.SCW.sessionTimeout = {
    MAX_SESSION_MS: MAX_SESSION_MS,
    enforce: enforce,
    reset: function () { clearAnchor(); enforce(false); }
  };
})();
/*** END SESSION TIMEOUT ***************************************************/
