/*** CO OPS LOCK — internal "Build Change Order" page (scene_1362) **********
 *
 * The other half of the mirror lock (co-sub-lock.js is the sub side):
 * while the CO sits in Pending Sub Pricing the ball is in the SUB'S court,
 * so the internal drafting page locks — exactly one party holds the pen at
 * a time (docs/change-orders.md edit-window table). Ops' escape hatch is
 * the stage strip's [Recall from Sub] button, which stays live inside the
 * otherwise-locked header form: Make flips status → Draft, the sub's
 * window closes, and this lock releases.
 *
 * Locked (status matches /pending sub pricing/i):
 *   - a lock banner renders at the top of the scene
 *   - the v2 CO worksheet flips read-only (.scw-ws-v2--readonly) and its
 *     toolbar hides; the add/adopt/remove strips block hides entirely
 *   - native inline cell editing dies, delete / link columns hide
 *   - the header form's inputs go white-bg read-only (repo locked-field
 *     convention) and its Submit hides — but the stage strip's action
 *     buttons ([Recall from Sub]) keep working
 *   - MDF/IDF card inputs lock, their delete / add-photo affordances hide
 *
 * Unlike the sub side, blank/unknown status FAILS OPEN here — this is ops'
 * own drafting page, and a slow status-view load must not brick Draft
 * editing. (The sub page fails safe LOCKED; at worst both pages are briefly
 * editable during a status read, and Make remains the only status writer.)
 *
 * Status read prefers SCW.coStage.getStatus() so the stage strip's
 * OPTIMISTIC flips (send → Pending, recall → Draft) lock/unlock this page
 * instantly, before the status view refetch lands. The strip calls
 * SCW.coOpsLock.refresh() right after each flip.
 ***************************************************************************/
(function () {
  'use strict';

  var CFG = {
    SCENE:        'scene_1362',
    HDR_FORM:     'view_4092',
    STATUS_VIEW:  'view_4109',   // hidden details view carrying CO Status
    STATUS_FIELD: 'field_2953',
    GRIDS:        ['view_4079', 'view_4084', 'view_4086', 'view_4088'],
    // worksheet-v2 surfaces on this scene:
    V2_CO_VIEW:   'view_4079',   // the v2 CO worksheet panel → read-only
    V2_HIDE:      ['view_4088', 'view_4086'],   // adopt + remove panels → hidden
    STRIPS_WRAP:  'scw-co-strips-view_4079',    // co-scene-header strips block
    LOCKED_RE:    /pending sub pricing/i   // locked WHILE the sub prices
  };

  var STYLE_ID  = 'scw-co-ops-lock-css';
  var BANNER_ID = 'scw-co-ops-lock-banner';
  var LOCK_CLS  = 'scw-co-ops-locked';
  var EVENT_NS  = '.scwCoOpsLock';

  function sceneRoot() { return document.getElementById('kn-' + CFG.SCENE); }

  function stripHtml(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  function getStatus() {
    // The stage strip's read honors its optimistic post-webhook flips —
    // prefer it so send/recall lock/unlock this page without waiting for
    // the status view refetch.
    try {
      if (window.SCW && SCW.coStage && typeof SCW.coStage.getStatus === 'function') {
        var s0 = stripHtml(SCW.coStage.getStatus());
        if (s0) return s0;
      }
    } catch (e) { /* fall through */ }
    try {
      var v = Knack.views[CFG.STATUS_VIEW];
      if (v && v.model && v.model.attributes) {
        var s = stripHtml(v.model.attributes[CFG.STATUS_FIELD]);
        if (s) return s;
      }
    } catch (e) { /* fall through */ }
    var el = document.querySelector(
      '#' + CFG.STATUS_VIEW + ' .kn-detail.' + CFG.STATUS_FIELD + ' .kn-detail-body');
    if (el && stripHtml(el.textContent)) return stripHtml(el.textContent);
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
      // ── CO header form: readable, not editable (repo locked-field rule).
      // The stage strip's buttons live in this form too — they are
      // <button>s, not inputs, so they stay live (Recall from Sub).
      S + ' #' + CFG.HDR_FORM + ' input,',
      S + ' #' + CFG.HDR_FORM + ' textarea{',
      'pointer-events:none !important;background:#fff !important;}',
      S + ' #' + CFG.HDR_FORM + ' .kn-submit{display:none !important;}',
      // ── MDF/IDF cards (mdf-idf-cards.js inputs + affordances) ──
      S + ' .scw-mdf-input{pointer-events:none !important;background:#fff !important;',
      'appearance:none;-webkit-appearance:none;}',
      S + ' .scw-mdf-del,',
      S + ' .scw-mdf-photos,',
      S + ' .scw-inline-photo-add{display:none !important;}',
      S + ' .scw-inline-photo-strip{pointer-events:none !important;}',
      // ── worksheet-v2 surfaces ──
      // No drafting verbs while the sub holds the pen: strips block hides
      // whole, adopt/remove panels hide, the CO worksheet's toolbar goes.
      // The worksheet stays READABLE — apply() stamps .scw-ws-v2--readonly.
      'body.' + LOCK_CLS + ' #' + CFG.STRIPS_WRAP + '{display:none !important;}',
      'body.' + LOCK_CLS + ' #scw-ws-v2-' + CFG.V2_HIDE[0] + ',',
      'body.' + LOCK_CLS + ' #scw-ws-v2-' + CFG.V2_HIDE[1] + '{display:none !important;}',
      'body.' + LOCK_CLS + ' #scw-ws-v2-' + CFG.V2_CO_VIEW + ' .scw-ws-v2-toolbar{display:none !important;}',
      // ── lock banner (amber — "with the sub", not an error) ──
      '#' + BANNER_ID + '{display:flex;align-items:center;gap:10px;',
      'margin:0 0 14px;padding:11px 16px;border-radius:8px;',
      'background:#fffbeb;border:1px solid #fde68a;box-shadow:inset 4px 0 0 #f59e0b;',
      'font:600 13px/1.45 system-ui,-apple-system,sans-serif;color:#78350f;}',
      '#' + BANNER_ID + ' b{color:#451a03;}'
    ].join('');
    document.head.appendChild(s);
  }

  function renderBanner(locked) {
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
    banner.innerHTML = '✉️ <span>With the <b>subcontractor for pricing</b> — ' +
      'editing is locked while they work. Use <b>Recall from Sub</b> below ' +
      'to close their window and take it back.</span>';
  }

  // Keyboard/tab belt on top of the pointer-events CSS — inputs are rebuilt
  // by every Knack render, so re-applied each pass.
  function lockInputs(locked) {
    var root = sceneRoot();
    if (!root) return;
    var sel = '#' + CFG.HDR_FORM + ' input, #' + CFG.HDR_FORM + ' textarea, ' +
      '.scw-mdf-input, ' +
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

  // Class-stamp ONLY — never flip the config entry's readOnly (that skips
  // the toolbar/sort/bulk mounts permanently if the panel builds while
  // locked; see the co-sub-lock.js note on the missing-toolbar race).
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
    _locked = CFG.LOCKED_RE.test(status);   // blank/unknown → UNLOCKED (ops' page)
    document.body.classList.toggle(LOCK_CLS, _locked);
    renderBanner(_locked);
    lockV2Worksheet(_locked);
    lockInputs(_locked);
  }

  // Capture-phase belt: block anything the CSS might miss (Enter-key form
  // submits, programmatic focus clicks). Bound once, document-level. The
  // stage strip's [data-scw-co-act] buttons are deliberately NOT in the
  // hit list — Recall must work while locked.
  if (!document.__scwCoOpsLockBound) {
    document.__scwCoOpsLockBound = true;
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

  // The stage strip calls this right after an optimistic status flip
  // (send → lock now; recall → unlock now) instead of waiting for the
  // status-view refetch.
  window.SCW = window.SCW || {};
  SCW.coOpsLock = { refresh: apply };
})();
/*** END: CO ops lock *******************************************************/
