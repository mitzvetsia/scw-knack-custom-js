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
 *
 * ZIP GATE (2026-11-04, "block the acceptance of a proposal if there is no
 * zip code in the project address"): while the project's address (CORE_project
 * field_22, read by SCW.projectZip off any view on the page that shows it) has
 * no zip, the form is replaced by an amber notice and a submit is refused at
 * capture. The page shows the address only once Builder adds a details view of
 * the project to it (connected through the proposal's SOW, the view_3874 path
 * on scene_1279); that view is hidden here. With no such view the gate fails
 * open and says so once in the console. "Already accepted" wins over it.
 ****************************************************************************/
(function () {
  'use strict';

  var ACCEPT_RE = /\/accept-proposal3\/([a-f0-9]{24})\b/i;
  var STYLE_ID  = 'scw-accept-guard-css';
  var NOTICE_ID = 'scw-accept-guard-notice';
  var EVENT_NS  = '.scwAcceptGuard';
  var LOCK_MS   = 6000;   // a second click inside this window is the double
  var ZIP_NOTICE_ID = 'scw-accept-zip-notice';
  var ZIP_HIDE_CLS  = 'scw-accept-zip-hidden';
  var ZIP_SRC_CLS   = 'scw-accept-zip-src';
  var WARN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
    '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var _warnedNoAddress = false;

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
      '.scw-accept-guard-hidden { display: none !important; }',
      '#' + ZIP_NOTICE_ID + ' { display: flex; gap: 12px; margin: 16px 0 24px; padding: 16px 20px;',
      '  border-radius: 10px; background: #fffbeb; border: 1px solid #fcd34d; color: #78350f;',
      '  font: 500 14px/1.5 system-ui, -apple-system, sans-serif; }',
      '#' + ZIP_NOTICE_ID + ' > svg { flex: 0 0 auto; margin-top: 2px; color: #b45309; }',
      '#' + ZIP_NOTICE_ID + ' b { display: block; font-size: 16px; font-weight: 800; margin-bottom: 4px; color: #92400e; }',
      '#' + ZIP_NOTICE_ID + ' .scw-accept-zip-addr { margin-top: 6px; color: #92400e; }',
      '#' + ZIP_NOTICE_ID + ' .scw-accept-zip-staff { margin-top: 8px; font-size: 13px; color: #78350f; }',
      '#' + ZIP_NOTICE_ID + ' a { display: inline-block; margin-top: 10px; font-weight: 700; color: #163c6e; }',
      '.' + ZIP_HIDE_CLS + ', .' + ZIP_SRC_CLS + ' { display: none !important; }'
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

  // ── Zip gate ────────────────────────────────────────────────

  function isStaff() {
    try {
      var u = window.Knack && typeof Knack.getUserAttributes === 'function' && Knack.getUserAttributes();
      var email = u && typeof u === 'object' ? String(u.email || '') : '';
      return /@getscw\.com$/i.test(email.trim());
    } catch (e) { return false; }
  }

  /** The project address, as SCW.projectZip reads it off this page. */
  function readZip() {
    var z = window.SCW && SCW.projectZip;
    return z && typeof z.read === 'function' ? z.read() : { state: 'unknown' };
  }

  function unblockZip(scene) {
    var n = document.getElementById(ZIP_NOTICE_ID);
    if (n && n.parentNode) n.parentNode.removeChild(n);
    var hidden = (scene || document).querySelectorAll('.' + ZIP_HIDE_CLS);
    for (var i = 0; i < hidden.length; i++) hidden[i].classList.remove(ZIP_HIDE_CLS);
  }

  function blockZip(scene, r) {
    injectStyles();
    var forms = scene.querySelectorAll('.kn-form');
    for (var i = 0; i < forms.length; i++) forms[i].classList.add(ZIP_HIDE_CLS);
    var html =
      WARN_SVG + '<div>' +
      '<b>This proposal can’t be accepted yet.</b>' +
      (r.blank
        ? 'There is no project address on file, and we need the address with its zip code '
        : 'The project address on file is missing its zip code, which we need ') +
      'to prepare your agreement and invoice. Please contact your SCW representative — ' +
      'once it is added, you can accept the proposal here.' +
      (r.address ? '<div class="scw-accept-zip-addr">Address on file: ' + esc(r.address) + '</div>' : '') +
      (isStaff() ? '<div class="scw-accept-zip-staff">SCW staff: add the zip code to the project’s ' +
        'Address, then reload this page.</div>' : '') +
      '<a href="' + esc(parentHash()) + '">← Back to the proposal</a>' +
      '</div>';
    var n = document.getElementById(ZIP_NOTICE_ID);
    if (!n) {
      n = document.createElement('div');
      n.id = ZIP_NOTICE_ID;
      n.setAttribute('role', 'alert');
      scene.insertBefore(n, scene.firstChild);
    }
    if (n.innerHTML !== html) n.innerHTML = html;
  }

  /** Apply the zip gate; returns the read. The accepted notice wins. */
  function zipGate(scene) {
    var r = readZip();
    if (r.viewKey) {
      var src = document.getElementById(r.viewKey);
      if (src) src.classList.add(ZIP_SRC_CLS);
    }
    if (document.getElementById(NOTICE_ID)) { unblockZip(scene); return r; }
    if (r.state === 'missing') blockZip(scene, r);
    else {
      unblockZip(scene);
      if (r.state === 'unknown' && !_warnedNoAddress) {
        _warnedNoAddress = true;
        try {
          console.warn('[SCW accept guard] The accept page shows no project address (field_22), so the ' +
            'zip check is off. Builder: add a details view of the project to this page (connected ' +
            'through the proposal’s Scope of Work), with the Address field.');
        } catch (e) { /* ignore */ }
      }
    }
    return r;
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
    if (here) { block(scene, here); zipGate(scene); return; }
    zipGate(scene);
    fetchAccepted(id, function (accepted) {
      if (accepted !== true) return;
      var sc = sceneEl();
      if (sc && proposalIdFromHash() === id) { block(sc, ''); zipGate(sc); }
    });
  }

  // A submit while the zip is missing is refused, whatever the form's state
  // (the address view can render a moment after the form).
  function refuseWithoutZip(e) {
    if (!proposalIdFromHash()) return;
    var t = e.target;
    var isSubmit = e.type === 'submit'
      ? !!(t && t.closest && t.closest('.kn-form'))
      : !!(t && t.closest && t.closest('.kn-form .kn-submit button, .kn-form .kn-submit input[type="submit"], ' +
                                       '.kn-form button[type="submit"]'));
    if (!isSubmit) return;
    var scene = sceneEl();
    if (!scene) return;
    var r = zipGate(scene);
    if (r.state !== 'missing') return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  document.addEventListener('click', refuseWithoutZip, true);
  document.addEventListener('submit', refuseWithoutZip, true);

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
