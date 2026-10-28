/*** ROLE READ-ONLY — "SCW Sales" sees the ops workflow pages read-only ********
 *
 * 2026-10-28: "if a user role is SCW Sales they should be able to see and
 * fully interact with the deploy page and its elements — but get read only
 * for Build SOWs and Reconcile. If the roles contain SCW Install Ops or SCW
 * Sales Manager or Admin they should get FULL access."
 *
 * Roles come from the Knack session (util.js SCW.userRoleNames: the role
 * NAMES the user carries, in any of the three shapes Knack exposes). The
 * decision, in order:
 *   1. any FULL_ACCESS role → full (this wins — a Sales Manager who also
 *      carries SCW Sales is not read-only);
 *   2. else any READ_ONLY role → read-only on the SCENES below;
 *   3. else, or when no role can be read at all → full (fails OPEN: a slow
 *      session read must never brick ops' own pages; nothing here is a
 *      security boundary — Builder permissions are).
 * The Manage Deployment page (scene_1311) is not listed, so it stays fully
 * interactive for everyone — nothing to do there.
 *
 * What read-only means on a listed scene (the same mechanics as the CO-page
 * locks, co-ops-lock.js / co-sub-lock.js, applied page-wide):
 *   - a sky banner at the top of the scene names the role and the page;
 *   - body.scw-role-ro + CSS: Knack inline editing dies (td.cell-edit),
 *     delete / edit / add-child links hide, record forms flatten to plain
 *     text with no Submit; the worksheet-v2 panels on the scene wear
 *     .scw-ws-v2--readonly (styles.js kills every card edit affordance) and
 *     lose their toolbar; the reconcile grid loses its cell actions, ⋮ menus,
 *     basis radios, rename pencils, row checkboxes + bulk bar, tray adds and
 *     every [data-action] button;
 *   - a BELT marks every other edit control (data-scw-ro-denied): buttons
 *     are hidden, inputs / selects / textareas read-only + flattened. Deny by
 *     default — a control is live only when it is a VIEWING control: inside
 *     an allow-listed container (Knack filters / search / pagination / per-
 *     page / modals of those, the SOW / bid context bar, worksheet search +
 *     sort, the scope strip, the SOW tabs, the lightbox, the project header),
 *     or itself a toggle / tab / caret / close / expand / collapse / chooser
 *     control by class, aria or text (Close, Cancel, Show all, Expand all…).
 *     Ordinary links stay live (navigation) except Knack's add- / edit-
 *     child-page links; [data-scw-ro-allow] on any element opts it in.
 *   - capture-phase click / submit / change / keydown blockers on the
 *     document stop whatever the CSS misses, modals mounted on <body>
 *     included (the add-item / bulk / photo modals cannot open — their
 *     buttons are denied — and their inputs are read-only if one does).
 *   The belt re-runs on every DOM change (debounced MutationObserver) because
 *   Knack and the v2 modules rebuild their controls on every render.
 *
 * Testing as another role: localStorage['scw:role-sim'] = 'SCW Sales'
 * (util.js: replaces the live roles for that browser); remove it to go back.
 * SCW.roleReadonly.decide() says what the gate thinks of the current user.
 ***************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    // Role NAMES as Builder shows them (Users → Roles). Case-insensitive.
    READ_ONLY_ROLES:   ['SCW Sales'],
    // Any one of these wins over READ_ONLY_ROLES. Matched on the whole name
    // or as a whole word inside it ("Admin" also matches "SCW Admin").
    FULL_ACCESS_ROLES: ['SCW Install Ops', 'SCW Sales Manager', 'Admin'],
    // Scenes a READ_ONLY role sees read-only. v2Panels = worksheet-v2 panels
    // on the scene (stamped .scw-ws-v2--readonly, toolbar hidden).
    SCENES: {
      scene_1085: { label: 'Build SOWs',     v2Panels: ['view_3962'] },
      scene_1155: { label: 'Reconcile Bids', v2Panels: [] }
    },
    debug: false
  };

  var STYLE_ID  = 'scw-role-ro-css';
  var BANNER_ID = 'scw-role-ro-banner';
  var LOCK_CLS  = 'scw-role-ro';
  var EVENT_NS  = '.scwRoleRo';
  var DENIED    = 'data-scw-ro-denied';

  // Controls the gate never touches, by CONTAINER (an ancestor match is
  // enough): pure viewing surfaces.
  var ALLOW_CONTAINERS = [
    '[data-scw-ro-allow]',
    // Knack's own browsing chrome (filters, keyword search, pagination,
    // per-page) and the modal the filter builder opens in.
    '.kn-filters', '.kn-filters-nav', '.kn-records-nav', '.kn-search', '.kn-keyword-search',
    '.kn-pagination', '.kn-per-page', '.kn-table-filters', '.kn-filters-modal',
    // worksheet-v2 viewing surfaces: SOW / bid context bar (tabs + chooser),
    // search, sort, the scope strip + summary, the lightbox.
    '.scw-ws-v2-sowctx', '.scw-ws-v2-search', '.scw-ws-v2-sort', '.scw-ws-v2-scope',
    '.scw-ws-v2-grand-summary', '.scw-ws-v2-summary', '.scw-ws-v2-lightbox',
    // reconcile page: SOW tabs, basis filter's "Show all bids" pill.
    '.scw-bid-review-v2__sowtabs', '.scw-basis-filter', '.scw-bf',
    // project header + pinned bar, accordion heads.
    '#scw-pid-hero', '#scw-phn-bar', '.scw-phn-bar', '.scw-acc-head'
  ].join(', ');

  // Controls that are live when the CONTROL ITSELF matches: toggles, tabs,
  // carets, chooser options, close buttons, lightbox navigation.
  var ALLOW_SELF = [
    '[data-scw-ro-allow]', '[aria-expanded]', '[aria-label="Close"]', '[data-close]',
    '[class*="toggle"]', '[class*="caret"]', '[class*="collapse"]', '[class*="expand"]',
    '[class*="-head"]', '[class*="-tab"]', '[class*="choose"]', '[class*="chooser"]',
    '[class*="close"]', '[class*="zoom"]', '[class*="lightbox"]', '[class*="viewer"]',
    '[class*="-nav"]', '[class*="disclos"]', '[class*="show-all"]', '[class*="showall"]',
    '[data-scw-sbd-collapse]', '[data-scw-tray-toggle]', '[data-scw-tray-gtoggle]',
    '.scw-bid-review-v2__row-caret', '.scw-ws-v2-group-head', '.scw-ws-v2-scope-prodtoggle',
    // opening a photo (lightbox / viewer) is viewing; the viewer's own
    // replace / remove / upload controls are denied by the belt.
    '.scw-ws-v2-photo-view', '.scw-ws-v2-photo-card', '.scw-ws-v2-lightbox-thumb', '[data-scw-ws-v2-photo-view]'
  ].join(', ');
  var ALLOW_TEXT_RE = /^(close|cancel|done|ok|×|✕|✖|back|show all( bids)?|show (more|less|fewer)|hide|expand( all)?|collapse( all)?|prev(ious)?|next|‹|›|←|→|«|»|re-?check|refresh|download.*|print|view|zoom.*)$/i;

  // Explicit denies — checked BEFORE any allow, so a container or a class
  // that reads as "viewing" can never let an edit control through (the rename
  // pencil lives inside the SOW tabs and is named like a tab).
  var DENY_ALWAYS = '[data-action], [data-scw-br-v2-rename], [data-scw-br-v2-basis-radio], ' +
    '[data-scw-sbd-basis], [data-scw-sbd-savedef], [data-scw-sbd-k1-open], [data-scw-sbd-note], ' +
    '[data-scw-tray-add], .scw-br-v2-rowselect, [data-scw-ws-v2-conn], [data-scw-ws-v2-edit], ' +
    '[data-scw-ws-v2-add], [data-scw-ws-v2-select], .scw-ws-v2-select, .scw-mdf-del, .scw-mdf-photos, ' +
    '.scw-mdf-photo-del, .scw-inline-photo-add, .scw-ws-v2-photo-del, .scw-ws-v2-photo-unlink, ' +
    'td.cell-edit, input[type="file"], [contenteditable]';
  // What the gate DENIES (deny by default for interactive controls).
  var CLICKABLE = 'button, [role="button"], input, select, textarea, [contenteditable], a, ' +
    '[data-action], td.cell-edit, [data-scw-ws-v2-conn], [data-scw-ws-v2-edit], ' +
    '[data-scw-ws-v2-add], [data-scw-ws-v2-select], .scw-mdf-del, .scw-mdf-photos, ' +
    '.scw-mdf-photo-del, .scw-inline-photo-add, [data-scw-br-v2-basis-radio], ' +
    '[data-scw-br-v2-rename], [data-scw-sbd-basis], [data-scw-sbd-savedef], ' +
    '[data-scw-sbd-k1-open], [data-scw-sbd-note], [data-scw-tray-add], .scw-br-v2-rowselect';
  // Links are navigation (allowed) unless they lead to Knack add / edit child
  // pages or are Knack's delete / table-link affordances.
  var DENY_LINK = 'a.kn-link-delete, td.kn-table-link a, a[href*="/add-"], a[href*="/edit-"], ' +
    'a.kn-add-link, a.scw-ws-v2-photo-url';

  function sceneKeys() { return Object.keys(CONFIG.SCENES); }
  function sceneRoot(key) { return document.getElementById('kn-' + key); }
  function currentLockedScene() {
    var keys = sceneKeys();
    var cur = '';
    try { cur = (window.Knack && Knack.router && Knack.router.current_scene_key) || ''; } catch (e) {}
    if (cur && CONFIG.SCENES[cur] && sceneRoot(cur)) return cur;
    for (var i = 0; i < keys.length; i++) if (sceneRoot(keys[i])) return keys[i];
    return '';
  }

  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** { mode: 'full' | 'readonly' | 'unknown', roles: [...], why: '' } */
  function decide() {
    var roles = [];
    try {
      roles = (window.SCW && typeof SCW.userRoleNames === 'function') ? SCW.userRoleNames() : [];
    } catch (e) { roles = []; }
    if (!roles || !roles.length) return { mode: 'unknown', roles: [], why: 'no roles readable — fails open' };
    var i, j;
    for (i = 0; i < CONFIG.FULL_ACCESS_ROLES.length; i++) {
      var full = CONFIG.FULL_ACCESS_ROLES[i];
      var re = new RegExp('(^|\\b)' + escapeRe(norm(full)) + '(\\b|$)', 'i');
      for (j = 0; j < roles.length; j++) {
        if (norm(roles[j]) === norm(full) || re.test(norm(roles[j]))) {
          return { mode: 'full', roles: roles, why: 'full-access role: ' + roles[j] };
        }
      }
    }
    for (i = 0; i < CONFIG.READ_ONLY_ROLES.length; i++) {
      for (j = 0; j < roles.length; j++) {
        if (norm(roles[j]) === norm(CONFIG.READ_ONLY_ROLES[i])) {
          return { mode: 'readonly', roles: roles, why: 'read-only role: ' + roles[j] };
        }
      }
    }
    return { mode: 'full', roles: roles, why: 'no read-only role' };
  }

  // ── allow / deny ────────────────────────────────────────────────────
  function isAllowed(el) {
    if (!el || !el.closest) return true;
    if (el.matches && el.matches(DENY_ALWAYS)) return false;
    if (el.closest(ALLOW_CONTAINERS)) return true;
    if (el.matches && el.matches(ALLOW_SELF)) return true;
    var tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A' || (el.getAttribute && el.getAttribute('role') === 'button')) {
      var txt = norm(el.textContent);
      if (txt && ALLOW_TEXT_RE.test(txt)) return true;
    }
    if (tag === 'INPUT') {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'search') return true;
    }
    return false;
  }
  // The interactive element a click lands on (an icon inside a button → the
  // button). null = nothing interactive.
  function clickable(target) {
    if (!target || !target.closest) return null;
    return target.closest(CLICKABLE);
  }
  function isDenied(el) {
    if (!el) return false;
    if (isAllowed(el)) return false;
    if (el.tagName === 'A') return !!(el.matches && el.matches(DENY_LINK));
    return true;
  }

  // ── CSS ─────────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var B = 'body.' + LOCK_CLS + ' ';
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Knack native: no inline editing, no delete / edit / add-child links,
      // record forms read as plain text with no Submit.
      B + 'td.cell-edit{pointer-events:none !important;}',
      B + 'a.kn-link-delete, ' + B + 'a.kn-add-link, ' + B + 'a[href*="/add-"], ' + B + 'a[href*="/edit-"]{display:none !important;}',
      B + 'td.kn-table-link{visibility:hidden !important;}',
      B + '.kn-form .kn-submit, ' + B + '.kn-form button[type="submit"]{display:none !important;}',
      // Belt marks: buttons hide, inputs flatten to text (repo locked-field
      // convention: readable, no box, no chrome).
      B + 'button[' + DENIED + '], ' + B + '[role="button"][' + DENIED + ']{display:none !important;}',
      B + 'input[' + DENIED + '], ' + B + 'select[' + DENIED + '], ' + B + 'textarea[' + DENIED + ']{',
      'pointer-events:none !important;background:transparent !important;border-color:transparent !important;',
      'box-shadow:none !important;appearance:none;-webkit-appearance:none;color:inherit !important;resize:none;}',
      B + 'input[type="checkbox"][' + DENIED + '], ' + B + 'input[type="radio"][' + DENIED + '], ' +
        B + 'input[type="file"][' + DENIED + ']{display:none !important;}',
      B + '[data-scw-ws-v2-conn], ' + B + '[data-scw-ws-v2-edit], ' + B + '[data-scw-ws-v2-add],',
      B + '.scw-mdf-del, ' + B + '.scw-mdf-photos, ' + B + '.scw-mdf-photo-del, ' + B + '.scw-inline-photo-add{',
      'pointer-events:none !important;}',
      B + '[data-scw-ws-v2-add], ' + B + '.scw-mdf-del, ' + B + '.scw-mdf-photos, ' + B + '.scw-mdf-photo-del, ' +
        B + '.scw-inline-photo-add{display:none !important;}',
      // worksheet-v2 panels on the scene: no toolbar (the panel itself wears
      // .scw-ws-v2--readonly, applied in JS).
      B + '.scw-ws-v2--readonly > .scw-ws-v2-toolbar, ' + B + '.scw-ws-v2--readonly .scw-ws-v2-toolbar{display:none !important;}',
      B + '.scw-ws-v2-bulk, ' + B + '.scw-ws-v2-select{display:none !important;}',
      // reconcile grid: no cell actions, ⋮ menus, basis radios, rename
      // pencils, row checkboxes, tray adds, header action buttons.
      B + '.scw-bid-review-v2__cell-actions, ' + B + '.scw-bid-review-v2__overflow, ' +
        B + '.scw-bid-review-v2__basis-radio, ' + B + '.scw-bid-review-v2__sowtab-rename, ' +
        B + '.scw-br-v2-rowselect, ' + B + '[data-scw-tray-add], ' + B + '.scw-sbd-savedef, ' +
        B + '.scw-sbd-k1-upload, ' + B + '.scw-bid-review-v2 button[data-action]{display:none !important;}',
      B + '[data-scw-sbd-note]{pointer-events:none !important;background:transparent !important;',
      'border-color:transparent !important;box-shadow:none !important;resize:none;}',
      // Banner — sky: an informational state, not an error.
      '#' + BANNER_ID + '{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:11px 16px;',
      'border-radius:8px;background:#f0f9ff;border:1px solid #bae6fd;box-shadow:inset 4px 0 0 #0369a1;',
      'font:600 13px/1.45 system-ui,-apple-system,sans-serif;color:#0c4a6e;}',
      '#' + BANNER_ID + ' b{color:#082f49;}',
      '#' + BANNER_ID + ' small{font-weight:500;color:#075985;}'
    ].join('');
    document.head.appendChild(s);
  }

  function renderBanner(sceneKey, decision) {
    var banner = document.getElementById(BANNER_ID);
    if (!sceneKey) {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      return;
    }
    var root = sceneRoot(sceneKey);
    if (!root) return;
    if (!banner) {
      banner = document.createElement('div');
      banner.id = BANNER_ID;
      root.insertBefore(banner, root.firstChild);
    } else if (banner.parentNode !== root) {
      root.insertBefore(banner, root.firstChild);
    }
    var label = CONFIG.SCENES[sceneKey].label || 'this page';
    var role = decision && decision.why ? decision.why.replace(/^read-only role:\s*/i, '') : '';
    banner.innerHTML = '👁 <span><b>Read-only</b> — you are viewing <b>' + escapeHtml(label) +
      '</b> as <b>' + escapeHtml(role || 'a read-only role') + '</b>. Browse, search, filter and open ' +
      'anything here; changes are made by Install Ops. <small>Manage Deployment stays fully editable.</small></span>';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── belt: mark + neutralise every denied control on the page ────────
  function applyBelt() {
    var els = document.body ? document.body.querySelectorAll(CLICKABLE) : [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.tagName === 'A' || el.tagName === 'TD') continue;   // links: CSS + click blocker only
      if (!isDenied(el)) {
        if (el.hasAttribute(DENIED)) unmark(el);
        continue;
      }
      if (el.hasAttribute(DENIED)) continue;
      el.setAttribute(DENIED, '1');
      var tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        var type = tag === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
        if (tag === 'SELECT' || type === 'checkbox' || type === 'radio' || type === 'file') {
          if (!el.disabled) { el.setAttribute('data-scw-ro-dis', '1'); el.disabled = true; }
        } else if (!el.readOnly) {
          el.setAttribute('data-scw-ro-rdo', '1'); el.readOnly = true;
        }
        el.setAttribute('tabindex', '-1');
      }
    }
  }
  function unmark(el) {
    el.removeAttribute(DENIED);
    if (el.getAttribute('data-scw-ro-dis')) { el.disabled = false; el.removeAttribute('data-scw-ro-dis'); }
    if (el.getAttribute('data-scw-ro-rdo')) { el.readOnly = false; el.removeAttribute('data-scw-ro-rdo'); }
    el.removeAttribute('tabindex');
  }
  function releaseBelt() {
    var els = document.body ? document.body.querySelectorAll('[' + DENIED + ']') : [];
    for (var i = 0; i < els.length; i++) unmark(els[i]);
  }

  function stampV2Panels(sceneKey, locked) {
    var panels = (sceneKey && CONFIG.SCENES[sceneKey].v2Panels) || [];
    for (var i = 0; i < panels.length; i++) {
      var p = document.getElementById('scw-ws-v2-' + panels[i]);
      if (p) p.classList.toggle('scw-ws-v2--readonly', !!locked);
    }
  }

  // ── apply / release ─────────────────────────────────────────────────
  var _locked = false, _scene = '', _decision = null;

  function apply() {
    var scene = currentLockedScene();
    var d = decide();
    _decision = d;
    var lock = !!scene && d.mode === 'readonly';
    if (CONFIG.debug && window.SCW && SCW.debug) {
      SCW.debug('[role-ro] scene=' + (scene || '-') + ' mode=' + d.mode + ' (' + d.why + ')');
    }
    if (!lock) {
      if (_locked) {
        document.body.classList.remove(LOCK_CLS);
        document.body.removeAttribute('data-scw-role-ro-scene');
        stampV2Panels(_scene, false);
        releaseBelt();
      }
      renderBanner('', null);
      _locked = false; _scene = '';
      return;
    }
    injectCss();
    _locked = true; _scene = scene;
    document.body.classList.add(LOCK_CLS);
    document.body.setAttribute('data-scw-role-ro-scene', scene);
    renderBanner(scene, d);
    stampV2Panels(scene, true);
    applyBelt();
  }

  var _soonT = [];
  function soon() {
    while (_soonT.length) clearTimeout(_soonT.pop());
    _soonT.push(setTimeout(apply, 100));
    _soonT.push(setTimeout(apply, 700));
  }

  // ── capture-phase blockers (bound once) ─────────────────────────────
  var _toastAt = 0;
  function nudge() {
    var now = Date.now();
    if (now - _toastAt < 4000) return;
    _toastAt = now;
    try {
      var br = window.SCW && SCW.bidReview;
      if (br && typeof br.renderToast === 'function') {
        br.renderToast('Read-only — this page cannot be changed with your role', 'info');
      }
    } catch (e) { /* no toast available */ }
  }
  if (!document.__scwRoleRoBound) {
    document.__scwRoleRoBound = true;
    document.addEventListener('click', function (e) {
      if (!_locked) return;
      var el = clickable(e.target);
      if (el && isDenied(el)) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        nudge();
      }
    }, true);
    document.addEventListener('submit', function (e) {
      if (!_locked) return;
      var f = e.target;
      if (!f || !f.closest) return;
      if (f.closest(ALLOW_CONTAINERS)) return;   // keyword search / filter forms
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      nudge();
    }, true);
    function blockInput(e) {
      if (!_locked) return;
      var el = e.target;
      if (!el || !el.matches || !el.matches('input, select, textarea, [contenteditable]')) return;
      if (isDenied(el)) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
    }
    document.addEventListener('change', blockInput, true);
    document.addEventListener('input', blockInput, true);
    document.addEventListener('keydown', function (e) {
      if (!_locked) return;
      var el = e.target;
      if (!el || !el.matches) return;
      if (el.matches('input, select, textarea, [contenteditable]')) { blockInput(e); return; }
      if ((e.key === 'Enter' || e.key === ' ') && isDenied(clickable(el))) {
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      }
    }, true);
  }

  // Re-run the belt after every DOM change while locked — Knack and the v2
  // modules rebuild their controls on every render. Debounced.
  var _obsT = null;
  function observe() {
    if (document.__scwRoleRoObs || typeof MutationObserver !== 'function' || !document.body) return;
    document.__scwRoleRoObs = new MutationObserver(function () {
      if (!_locked) return;
      if (_obsT) return;
      _obsT = setTimeout(function () {
        _obsT = null;
        if (!_locked) return;
        if (!sceneRoot(_scene)) { apply(); return; }   // scene left → release
        stampV2Panels(_scene, true);
        applyBelt();
        renderBanner(_scene, _decision);
      }, 150);
    });
    document.__scwRoleRoObs.observe(document.body, { childList: true, subtree: true });
  }

  // ── bindings ────────────────────────────────────────────────────────
  if (window.SCW && typeof SCW.onSceneRender === 'function') {
    sceneKeys().forEach(function (k) { SCW.onSceneRender(k, soon, EVENT_NS); });
  }
  if (typeof $ === 'function') {
    $(document).off('knack-scene-render.any' + EVENT_NS).on('knack-scene-render.any' + EVENT_NS, soon);
  }
  (function () {
    var ws = window.SCW && SCW.worksheetV2;
    if (ws && ws.data && typeof ws.data.subscribe === 'function') {
      sceneKeys().forEach(function (k) {
        (CONFIG.SCENES[k].v2Panels || []).forEach(function (vk) { ws.data.subscribe(vk, soon); });
      });
    }
  })();
  observe();
  soon();

  window.SCW = window.SCW || {};
  SCW.roleReadonly = {
    CONFIG:    CONFIG,
    decide:    decide,
    refresh:   apply,
    isLocked:  function () { return _locked; },
    scene:     function () { return _scene; },
    isDenied:  isDenied,
    isAllowed: isAllowed,
    _observe:  observe
  };
})();
/*** END: role read-only ****************************************************/
