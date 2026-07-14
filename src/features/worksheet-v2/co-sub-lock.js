/*** CO SUB LOCK — status-window lockdown for external users ****************
 *
 * "The CO is entirely locked to the sub UNLESS the status is Pending Sub
 * Pricing." (docs/change-orders.md edit-window table: Draft = originator,
 * Pending Sub Pricing = sub's window, Ops Review onward = sub locked.)
 *
 * On the CO scene, for EXTERNAL (non-@getscw.com) users:
 *   - ALWAYS (any status): the ops drafting surfaces are hidden — the
 *     add/adopt/remove strips (#scw-co-strips), the stage-strip action row
 *     (Send to Sub / Send back / Preview & Issue are ops verbs), and the
 *     CO header form's name/notes inputs + submit (drafting fields).
 *     The stage STEPPER itself stays visible — "where is this CO" is
 *     useful to the sub.
 *   - When CO Status (field_2953) ≠ Pending Sub Pricing: the CO worksheet
 *     (view_4079) flips to the existing readOnly machinery
 *     (.scw-ws-v2--readonly styles + cfg.readOnly so toolbar/bulk/sort
 *     never mount) plus a hard input-disable belt after every render,
 *     and the panel banner shows a lock note with the current status.
 *
 * Internal users are never affected. Fails safe to LOCKED while the
 * session email hasn't resolved yet (same direction as init.js's
 * internalOnly gate) — a staff member's surfaces restore on the next
 * render tick; an external user never gets a flash of editable UI.
 *
 * Status source: SCW.coStage.getStatus() (co-stage-strip.js — includes
 * its optimistic post-webhook flip), falling back to a direct read of the
 * hidden status view (view_4109). Blank/unknown status = locked.
 ***************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var CO_VIEW      = 'view_4079';   // CO worksheet (the lock target)
  var HDR_VIEW     = 'view_4092';   // CO header form (name/notes inputs)
  var STATUS_VIEW  = 'view_4109';   // hidden CO record (status fallback read)
  var STATUS_FIELD = 'field_2953';
  var OPEN_RE      = /pending sub pricing/i;   // the sub's edit window

  var STYLE_ID  = 'scw-co-sub-lock-css';
  var NOTE_CLS  = 'scw-co-sub-lock-note';
  var EXT_CLS   = 'scw-co-ext-user';
  var LOCK_CLS  = 'scw-co-sub-locked';
  var EVENT_NS  = '.scwCoSubLock';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // ── external user, ANY status: ops drafting surfaces are not theirs ──
      'body.' + EXT_CLS + ' #scw-co-strips{display:none !important;}',
      'body.' + EXT_CLS + ' #scw-co-stage .scw-co-stage-actions{display:none !important;}',
      // CO header form: name/notes stay readable (repo locked-field
      // convention: white bg, no graying), never editable; no submit.
      'body.' + EXT_CLS + ' #' + HDR_VIEW + ' input,',
      'body.' + EXT_CLS + ' #' + HDR_VIEW + ' textarea{',
      'pointer-events:none !important;background:#fff !important;}',
      'body.' + EXT_CLS + ' #' + HDR_VIEW + ' .kn-submit{display:none !important;}',
      // ── locked window: belt on top of the .scw-ws-v2--readonly styles ──
      'body.' + LOCK_CLS + ' #scw-ws-v2-' + CO_VIEW + ' .scw-ws-v2-toolbar,',
      'body.' + LOCK_CLS + ' #scw-ws-v2-' + CO_VIEW + ' .scw-ws-v2-bulkbar{display:none !important;}',
      // Lock note in the worksheet banner.
      '.' + NOTE_CLS + '{display:inline-flex;align-items:center;gap:6px;',
      'margin-left:10px;padding:2px 10px;border-radius:999px;',
      'background:#f1f5f9;border:1px solid #cbd5e1;color:#475569;',
      'font:600 11px/1.5 system-ui,-apple-system,sans-serif;white-space:nowrap;}'
    ].join('');
    document.head.appendChild(s);
  }

  function isExternal() {
    // Fails safe to "external" (locked) until the session email resolves.
    return !(window.SCW && typeof SCW.isInternalUser === 'function' &&
      SCW.isInternalUser());
  }

  function stripHtml(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }

  function getStatus() {
    if (window.SCW && SCW.coStage && typeof SCW.coStage.getStatus === 'function') {
      var s = SCW.coStage.getStatus();
      if (s) return s;
    }
    try {
      var v = Knack.views[STATUS_VIEW];
      if (v && v.model) {
        if (v.model.attributes && v.model.attributes.id) {
          return stripHtml(v.model.attributes[STATUS_FIELD]);
        }
        var models = v.model.data && v.model.data.models;
        if (models && models.length) return stripHtml(models[0].attributes[STATUS_FIELD]);
      }
    } catch (e) { /* fall through */ }
    return '';
  }

  // Keyboard/tab belt on top of the pointer-events CSS — same layer
  // co-adopt.js/co-remove.js use on their readOnly panels. Re-applied
  // after every v2 render (renders rebuild the inputs).
  function disableInputs(panel) {
    var els = panel.querySelectorAll(
      '.scw-ws-v2-body input, .scw-ws-v2-body select, ' +
      '.scw-ws-v2-body textarea, .scw-ws-v2-body button');
    for (var i = 0; i < els.length; i++) {
      els[i].setAttribute('disabled', 'disabled');
      els[i].setAttribute('tabindex', '-1');
    }
  }

  function apply() {
    var onScene = !!document.getElementById(CO_VIEW);
    if (!onScene) {
      document.body.classList.remove(EXT_CLS, LOCK_CLS);
      return;
    }
    injectCss();

    var ext = isExternal();
    var status = getStatus();
    var locked = ext && !OPEN_RE.test(status);   // blank status → locked

    document.body.classList.toggle(EXT_CLS, ext);
    document.body.classList.toggle(LOCK_CLS, locked);

    // Flip the worksheet's readOnly machinery. Mutating the live cfg is
    // safe — one session is one user — and gets us the full existing
    // lockdown for free (styles.js affordance kill + init.js skipping the
    // toolbar/sort/filter/bulk mounts).
    var vcfg = ns.cfg && ns.cfg.viewCfg(CO_VIEW);
    if (vcfg) {
      if (vcfg.__scwRoBase === undefined) vcfg.__scwRoBase = !!vcfg.readOnly;
      var want = vcfg.__scwRoBase || locked;
      if (!!vcfg.readOnly !== want) {
        vcfg.readOnly = want;
        // Rebuild the cards in the new mode (renderView is idempotent; our
        // subscribe below re-enters apply() but readOnly is settled so it
        // can't loop).
        try {
          if (ns.render && ns.data) {
            ns.render.renderView(CO_VIEW, ns.data.readRecords(CO_VIEW));
          }
        } catch (e) { /* next render picks it up */ }
      }
    }

    var panel = document.getElementById('scw-ws-v2-' + CO_VIEW);
    if (panel) {
      panel.classList.toggle('scw-ws-v2--readonly',
        locked || !!(vcfg && vcfg.__scwRoBase));
      var banner = panel.querySelector('.scw-ws-v2-banner');
      var note = panel.querySelector('.' + NOTE_CLS);
      if (locked) {
        if (!note && banner) {
          note = document.createElement('span');
          note.className = NOTE_CLS;
          var title = banner.querySelector('.scw-ws-v2-banner-title');
          if (title && title.nextSibling) banner.insertBefore(note, title.nextSibling);
          else banner.appendChild(note);
        }
        if (note) {
          note.textContent = '🔒 Locked — ' +
            (status ? 'status: ' + status : 'not open for pricing');
        }
        disableInputs(panel);
      } else if (note) {
        note.parentNode.removeChild(note);
      }
    }
  }

  function soon() {
    setTimeout(apply, 100);
    setTimeout(apply, 700);   // catch late model/session populates
  }

  // Re-apply after every v2 render (renders rebuild inputs → belt re-arms).
  if (ns.data && typeof ns.data.subscribe === 'function') {
    ns.data.subscribe(CO_VIEW, function () { setTimeout(apply, 0); });
  }
  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(CO_VIEW, soon, EVENT_NS);
    SCW.onViewRender(HDR_VIEW, soon, EVENT_NS);
    SCW.onViewRender(STATUS_VIEW, soon, EVENT_NS);
  }
  $(document).off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, soon);
})();
/*** END: CO sub lock *******************************************************/
