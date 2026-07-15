/*** CO SUB LOCK — sub portal "Manage Change Order" page (scene_1374) *******
 *
 * "Everything on this page is locked UNLESS the CO status is Sub Pricing."
 * (docs/change-orders.md edit-window table: Pending Sub Pricing = the sub's
 * window; every other status the sub is read-only.)
 *
 * The page mirrors the internal CO drafting scene (scene_1362) 1:1 —
 * worksheet-v2 + the CO modules are deployed on its analogous views:
 *   view_4121 — CO header form (co-header-card + co-value strip)
 *   view_4112 — CO worksheet (v2 cards — the write surface)
 *   view_4114 — Manage MDFs/IDFs (mdf-idf-cards inputs, delete, photos)
 *   view_4116 — project install items (v2 remove panel, co-remove.js)
 *   view_4118 — project SOW/proposal items (v2 adopt panel, co-adopt.js)
 *   view_4122 — SOW header details (CO Status field_2953 — the status READ)
 *
 * When CO Status (field_2953) does NOT match /sub pricing/i (blank/unknown
 * fails safe to LOCKED):
 *   - a lock banner renders at the top of the scene with the current status
 *   - the v2 CO worksheet flips to read-only (the same .scw-ws-v2--readonly
 *     treatment the adopt panel uses) and its toolbar hides
 *   - the add/adopt/remove strips block hides entirely (no drafting verbs)
 *   - all native inline cell editing is dead (pointer-events + capture-phase
 *     click belt), delete / edit / add-accessory / add-photo links hidden
 *   - the header form's inputs go white-bg read-only (repo locked-field
 *     convention) and its Submit hides
 *   - MDF/IDF card inputs lock, their delete / add-photo affordances hide
 *
 * Applies to EVERYONE on this scene — it's the sub's page; ops manage the
 * CO from the internal drafting scene. Re-applied on scene + view renders
 * (Knack re-renders rebuild the DOM).
 ***************************************************************************/
(function () {
  'use strict';

  var CFG = {
    SCENE:        'scene_1374',
    HDR_FORM:     'view_4121',
    STATUS_VIEW:  'view_4122',   // details view carrying CO Status
    STATUS_FIELD: 'field_2953',
    GRIDS:        ['view_4112', 'view_4114', 'view_4116', 'view_4118'],
    // worksheet-v2 surfaces on this scene (mirror of the internal CO scene):
    V2_CO_VIEW:   'view_4112',   // the v2 CO worksheet panel → read-only
    V2_HIDE:      ['view_4118', 'view_4116'],   // adopt + remove panels → hidden
    STRIPS_WRAP:  'scw-co-strips-view_4112',    // co-scene-header strips block
    OPEN_RE:      /sub pricing/i   // matches "Pending Sub Pricing"
  };

  var STYLE_ID  = 'scw-co-sub-lock-css';
  var BANNER_ID = 'scw-co-sub-lock-banner';
  var LOCK_CLS  = 'scw-co-sub-locked';
  var EVENT_NS  = '.scwCoSubLock';

  function sceneRoot() { return document.getElementById('kn-' + CFG.SCENE); }

  function stripHtml(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  function getStatus() {
    // Model first (details view → model.attributes).
    try {
      var v = Knack.views[CFG.STATUS_VIEW];
      if (v && v.model && v.model.attributes) {
        var s = stripHtml(v.model.attributes[CFG.STATUS_FIELD]);
        if (s) return s;
      }
    } catch (e) { /* fall through */ }
    // DOM: the details view's status row.
    var el = document.querySelector(
      '#' + CFG.STATUS_VIEW + ' .kn-detail.' + CFG.STATUS_FIELD + ' .kn-detail-body');
    if (el && stripHtml(el.textContent)) return stripHtml(el.textContent);
    // Last resort: the header form's read-only status input block.
    var wrap = document.querySelector(
      '#' + CFG.HDR_FORM + ' #kn-input-' + CFG.STATUS_FIELD);
    if (wrap) {
      // Editable dropdown variant: read the selected value — the wrapper's
      // textContent would concatenate every option.
      var sel = wrap.querySelector('select');
      if (sel && sel.value) return stripHtml(sel.value);
      var clone = wrap.cloneNode(true);
      var junk = clone.querySelectorAll('label, p.kn-instructions');
      for (var i = 0; i < junk.length; i++) {
        if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]);
      }
      return stripHtml(clone.textContent);
    }
    return '';
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var S = 'body.' + LOCK_CLS + ' #kn-' + CFG.SCENE;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // ── grids: no inline editing, no row actions ──
      S + ' td.cell-edit{pointer-events:none !important;}',
      S + ' a.kn-link-delete{display:none !important;}',
      // edit / add-accessory / add-photo link columns (their headers stay —
      // hiding <th> would shift the column grid under Knack's fixed labels)
      S + ' td.kn-table-link{visibility:hidden !important;}',
      // ── CO header form: readable, not editable. Locked inputs FLATTEN to
      // plain text (no box, no border) so nothing reads as editable.
      S + ' #' + CFG.HDR_FORM + ' input,',
      S + ' #' + CFG.HDR_FORM + ' textarea{',
      'pointer-events:none !important;background:transparent !important;',
      'border-color:transparent !important;box-shadow:none !important;}',
      S + ' #' + CFG.HDR_FORM + ' .kn-submit{display:none !important;}',
      // ── MDF/IDF cards (mdf-idf-cards.js inputs + affordances) ──
      S + ' .scw-mdf-input{pointer-events:none !important;background:transparent !important;',
      'border-color:transparent !important;box-shadow:none !important;',
      'appearance:none;-webkit-appearance:none;}',
      S + ' .scw-mdf-del,',
      S + ' .scw-mdf-photos,',
      S + ' .scw-inline-photo-add{display:none !important;}',
      S + ' .scw-inline-photo-strip{pointer-events:none !important;}',
      // ── worksheet-v2 surfaces (mirror of the internal drafting scene) ──
      // No drafting verbs while locked: the add/adopt/remove strips block
      // hides whole, and the CO worksheet's toolbar (bulk CTAs, add) goes.
      // The worksheet itself stays READABLE — apply() stamps it with the
      // same .scw-ws-v2--readonly class styles.js already knows.
      'body.' + LOCK_CLS + ' #' + CFG.STRIPS_WRAP + '{display:none !important;}',
      'body.' + LOCK_CLS + ' #scw-ws-v2-' + CFG.V2_HIDE[0] + ',',
      'body.' + LOCK_CLS + ' #scw-ws-v2-' + CFG.V2_HIDE[1] + '{display:none !important;}',
      'body.' + LOCK_CLS + ' #scw-ws-v2-' + CFG.V2_CO_VIEW + ' .scw-ws-v2-toolbar{display:none !important;}',
      // ── lock banner ──
      '#' + BANNER_ID + '{display:flex;align-items:center;gap:10px;',
      'margin:0 0 14px;padding:11px 16px;border-radius:8px;',
      'background:#f1f5f9;border:1px solid #cbd5e1;box-shadow:inset 4px 0 0 #64748b;',
      'font:600 13px/1.45 system-ui,-apple-system,sans-serif;color:#334155;}',
      '#' + BANNER_ID + ' b{color:#0f172a;}'
    ].join('');
    document.head.appendChild(s);
  }

  function renderBanner(locked, status) {
    var banner = document.getElementById(BANNER_ID);
    if (!locked) {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      return;
    }
    var root = sceneRoot();
    if (!root) return;
    if (!banner) {
      banner = document.createElement('div');
      banner.id = BANNER_ID;
      root.insertBefore(banner, root.firstChild);
    }
    banner.innerHTML = '🔒 <span>This change order is <b>locked</b>' +
      (status ? ' — status: <b>' + stripHtml(status) + '</b>' : '') +
      '. Editing opens when it returns to <b>Sub Pricing</b>.</span>';
  }

  // Keyboard/tab belt on top of the pointer-events CSS — inputs are rebuilt
  // by every Knack render, so re-applied each pass.
  function lockInputs(locked) {
    var root = sceneRoot();
    if (!root) return;
    var sel = '#' + CFG.HDR_FORM + ' input, #' + CFG.HDR_FORM + ' textarea, ' +
      '.scw-mdf-input, ' +
      // v2 CO worksheet card inputs — pointer path dies via the readonly
      // class; this is the keyboard tab-and-type belt (same as co-adopt.js
      // does for the adopt panel).
      '#scw-ws-v2-' + CFG.V2_CO_VIEW + ' input, ' +
      '#scw-ws-v2-' + CFG.V2_CO_VIEW + ' textarea, ' +
      '#scw-ws-v2-' + CFG.V2_CO_VIEW + ' select';
    var els = root.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) {
      if (locked) {
        if (els[i].tagName === 'SELECT') els[i].setAttribute('disabled', 'disabled');
        else els[i].setAttribute('readonly', 'readonly');
        els[i].setAttribute('tabindex', '-1');
      } else {
        els[i].removeAttribute('disabled');
        els[i].removeAttribute('readonly');
        els[i].removeAttribute('tabindex');
      }
    }
  }

  var _locked = false;

  // Flip the v2 CO worksheet between live and read-only by stamping the
  // mounted panel with the .scw-ws-v2--readonly class styles.js already
  // handles. Re-stamped on every apply() pass + v2 data notify, so rebuilds
  // can't lose it. Deliberately does NOT flip the config entry's readOnly:
  // apply() fails safe to LOCKED while the status view is still loading, and
  // if the v2 panel happens to BUILD in that window a readOnly config would
  // make init.js skip the toolbar/sort/bulk mounts permanently — the panel
  // then unlocks with no toolbar (the missing-add/toolbar race). CSS covers
  // everything the locked state needs; the config stays untouched.
  function lockV2Worksheet(locked) {
    var panel = document.getElementById('scw-ws-v2-' + CFG.V2_CO_VIEW);
    if (panel) panel.classList.toggle('scw-ws-v2--readonly', locked);
  }

  function apply() {
    if (!sceneRoot()) {
      _locked = false;
      document.body.classList.remove(LOCK_CLS);
      return;
    }
    injectCss();
    var status = getStatus();
    _locked = !CFG.OPEN_RE.test(status);   // blank/unknown → locked
    document.body.classList.toggle(LOCK_CLS, _locked);
    renderBanner(_locked, status);
    lockV2Worksheet(_locked);
    lockInputs(_locked);
  }

  // Capture-phase belt: block anything the CSS might miss (Enter-key form
  // submits, programmatic focus clicks). Bound once, document-level.
  if (!document.__scwCoSubLockBound) {
    document.__scwCoSubLockBound = true;
    document.addEventListener('click', function (e) {
      if (!_locked) return;
      var t = e.target;
      if (!t || !t.closest || !t.closest('#kn-' + CFG.SCENE)) return;
      var hit = t.closest(
        'td.cell-edit, a.kn-link-delete, td.kn-table-link a, ' +
        '.scw-mdf-del, .scw-mdf-photos, .scw-inline-photo-card, ' +
        '.scw-inline-photo-add, #' + CFG.HDR_FORM + ' .kn-submit');
      if (hit) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    document.addEventListener('submit', function (e) {
      if (!_locked) return;
      var f = e.target;
      if (f && f.closest && f.closest('#' + CFG.HDR_FORM)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
  }

  function soon() {
    setTimeout(apply, 100);
    setTimeout(apply, 700);   // catch late model populates / re-enhancers
  }

  if (window.SCW && typeof SCW.onSceneRender === 'function') {
    SCW.onSceneRender(CFG.SCENE, soon, EVENT_NS);
  }
  // v2 rebuilds recreate the worksheet's card inputs on data notifies that
  // never fire knack-view-render — re-apply the lock after each one.
  (function () {
    var ws = window.SCW && SCW.worksheetV2;
    if (ws && ws.data && typeof ws.data.subscribe === 'function') {
      ws.data.subscribe(CFG.V2_CO_VIEW, soon);
    }
  })();
  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(CFG.STATUS_VIEW, soon, EVENT_NS);
    SCW.onViewRender(CFG.HDR_FORM, soon, EVENT_NS);
    for (var i = 0; i < CFG.GRIDS.length; i++) {
      SCW.onViewRender(CFG.GRIDS[i], soon, EVENT_NS);
    }
  }
  $(document).off('knack-scene-render.' + CFG.SCENE + EVENT_NS)
    .on('knack-scene-render.' + CFG.SCENE + EVENT_NS, soon);
})();
/*** END: CO sub lock *******************************************************/
