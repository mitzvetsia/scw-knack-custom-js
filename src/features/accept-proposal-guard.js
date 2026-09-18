/*** ACCEPT PROPOSAL GUARD — the accept form page (#…/accept-proposal3/<id>) *
 *
 * A rep could accept a proposal twice: the Accept CTA on the proposal page
 * hides off field_2990 (a Knack count that catches up seconds after the
 * acceptance record lands), and the accept form is a child page a rep can
 * reach again with Back, a second tab or a bookmark. Each extra acceptance
 * is a second agreement + invoice for ops to unpick.
 *
 * Three layers, none depending on the other:
 *   1. Submit once — the form's submit button locks on first click.
 *   2. Tripwire — knack-form-submit on this page records the proposal id
 *      (SCW.proposalAccept.markAcceptedHere): from then on THIS browser
 *      treats it as accepted, on the proposal page (CTA gone, accepted
 *      banner) and here (form replaced), before field_2990 moves.
 *   3. Record check — on render, GET the proposal through the proposal
 *      page's detail view (scene_1279 / view_3813, the session token
 *      works from any page) and read field_2990 with the same rule the
 *      CTA uses; accepted → the form is replaced by a notice with a link
 *      back to the proposal. Fails open (network / field missing) — the
 *      other two layers still hold.
 * Keyed on the URL slug, not a scene id: the child page's ids are Builder
 * facts this repo never needed before.
 ****************************************************************************/
(function () {
  'use strict';

  var ACCEPT_RE = /\/accept-proposal3\/([a-f0-9]{24})\b/i;
  var STYLE_ID  = 'scw-accept-guard-css';
  var NOTICE_ID = 'scw-accept-guard-notice';
  var EVENT_NS  = '.scwAcceptGuard';
  var LOCK_MS   = 6000;   // a second click inside this window is the double

  function api() { return window.SCW && SCW.proposalAccept; }
  function proposalIdFromHash() {
    var m = String(window.location.hash || '').match(ACCEPT_RE);
    return m ? m[1] : '';
  }
  function parentHash() {
    return String(window.location.hash || '').replace(/\/accept-proposal3\/[a-f0-9]{24}\/?.*$/i, '/');
  }
  function sceneEl() {
    return document.querySelector('.kn-scene[id*="scene_"], [id^="kn-scene_"]');
  }
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '#' + NOTICE_ID + ' { margin: 16px 0 24px; padding: 16px 20px; border-radius: 10px;',
      '  background: #f0fdf4; border: 1px solid #86efac; color: #166534;',
      '  font: 500 14px/1.5 system-ui, -apple-system, sans-serif; }',
      '#' + NOTICE_ID + ' b { display: block; font-size: 16px; font-weight: 800; margin-bottom: 4px; }',
      '#' + NOTICE_ID + ' a { display: inline-block; margin-top: 10px; font-weight: 700; color: #163c6e; }',
      '.scw-accept-guard-hidden { display: none !important; }'
    ].join('\n');
    document.head.appendChild(st);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /** Replace the accept form(s) with the notice. */
  function block(scene, when) {
    injectStyles();
    var forms = scene.querySelectorAll('.kn-form');
    for (var i = 0; i < forms.length; i++) forms[i].classList.add('scw-accept-guard-hidden');
    if (document.getElementById(NOTICE_ID)) return;
    var n = document.createElement('div');
    n.id = NOTICE_ID;
    var whenTxt = '';
    if (when) {
      try { whenTxt = ' on ' + new Date(when).toLocaleString(); } catch (e) { whenTxt = ''; }
    }
    n.innerHTML =
      '<b>✓ This proposal has already been accepted' + esc(whenTxt) + '.</b>' +
      'Accepting it again would create a second agreement and a second invoice. ' +
      'Nothing more is needed here.' +
      '<a href="' + esc(parentHash()) + '">← Back to the proposal</a>';
    scene.insertBefore(n, scene.firstChild);
  }

  /** GET the proposal through the proposal page's detail view and read the
   *  acceptance count. done(true | false | null when unknown). */
  function fetchAccepted(id, done) {
    var a = api();
    if (!a || typeof Knack === 'undefined' || !Knack.api_url ||
        !window.SCW || typeof SCW.knackAjax !== 'function') { done(null); return; }
    SCW.knackAjax({
      url:  Knack.api_url + '/v1/pages/' + a.sceneId + '/views/' + a.viewId + '/records/' + id,
      type: 'GET',
      success: function (rec) {
        var n = a.readAcceptCount(rec || null);
        done(isNaN(n) ? null : a.isAcceptedCount(n));
      },
      error: function () { done(null); }
    });
  }

  /** Submit once: the first click locks the button for LOCK_MS. */
  function lockSubmit(scene) {
    var btns = scene.querySelectorAll('.kn-form button[type="submit"], .kn-form input[type="submit"], .kn-form .kn-submit .kn-button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].__scwAcceptLock) continue;
      btns[i].__scwAcceptLock = true;
      btns[i].addEventListener('click', function (e) {
        var b = this;
        if (b.__scwLockedUntil && Date.now() < b.__scwLockedUntil) {
          e.preventDefault(); e.stopImmediatePropagation();
          return;
        }
        b.__scwLockedUntil = Date.now() + LOCK_MS;
      }, true);
    }
  }

  function guard() {
    var id = proposalIdFromHash();
    if (!id) return;
    var scene = sceneEl();
    if (!scene) return;
    var a = api();
    lockSubmit(scene);
    var here = a ? a.acceptedHereAt(id) : '';
    if (here) { block(scene, here); return; }
    fetchAccepted(id, function (accepted) {
      if (accepted !== true) return;
      var sc = sceneEl();
      if (sc && proposalIdFromHash() === id) block(sc, '');
    });
  }

  $(document).on('knack-scene-render.any' + EVENT_NS, function () { setTimeout(guard, 60); });
  $(document).on('knack-view-render.any' + EVENT_NS, function () { if (proposalIdFromHash()) setTimeout(guard, 60); });
  // The acceptance just went in: trip the wire so Back / a second tab / the
  // proposal page all read it as accepted before field_2990 moves.
  $(document).on('knack-form-submit.any' + EVENT_NS, function () {
    var id = proposalIdFromHash();
    var a = api();
    if (id && a) a.markAcceptedHere(id);
  });
  if (proposalIdFromHash()) setTimeout(guard, 0);
})();
/*** END ACCEPT PROPOSAL GUARD **********************************************/
