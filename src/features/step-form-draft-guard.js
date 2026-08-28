/*** STEP FORM DRAFT GUARD — scene_1116 Playbook + survey request forms ****
 *
 * Complaint (2026-08-28, install-ops): sales users typing an address /
 * notes / POC info into the Project Playbook (view_2924) or the site
 * survey request (view_3853) lose everything when the section "auto
 * closes" on them — they click away or pause for a minute, something
 * re-renders (KTL idle watchdog / auto-refresh keyword / a background
 * page reload — the trigger lives outside this bundle), the Knack form
 * DOM rebuilds empty, and ktl-accordion's ALWAYS_COLLAPSED_ON_LOAD rule
 * slams the section shut.
 *
 * Rather than chase every possible refresher, this guard makes the two
 * step forms survive ALL of them:
 *   - every keystroke/change in either form is snapshotted (debounced)
 *     into sessionStorage, keyed by view + the SOW in the hash;
 *   - after any re-render of the view — including a full page reload in
 *     the same tab — the draft is restored into the fresh form (values
 *     re-applied + `change` fired so Knack's internal model syncs; see
 *     CLAUDE.md "Setting Form Fields Programmatically") and the
 *     accordion is re-expanded so the user resumes where they were;
 *   - the draft clears on successful submit (Knack's record events),
 *     goes dormant on a submit-button click (so a confirmation
 *     re-render doesn't resurrect it), and expires after 12h;
 *   - if the user deliberately collapses the section while a draft
 *     exists, we stop re-expanding it (the draft itself is kept).
 *
 * sessionStorage (not localStorage) on purpose: per-tab, survives
 * reloads in the tab where the typing happened, and can't leak a draft
 * across users or into unrelated tabs.
 ****************************************************************************/
(function () {
  'use strict';

  var NS       = '.scwStepDraft';
  var VIEWS    = ['view_2924', 'view_3853'];
  var KEY_PRE  = 'scw-step-draft:';
  var MAX_AGE  = 12 * 60 * 60 * 1000;   // 12h — stale drafts self-expire
  var SAVE_MS  = 300;                   // input debounce
  // Restore attempts after a render: the first lands fast, the later
  // ones out-wait ktl-accordion's applySavedState guard (300ms) and the
  // stepper's delayed applySteps passes so nothing re-collapses us.
  var RESTORE_DELAYS = [80, 700, 1500];

  var _saveTimers  = {};   // viewKey -> debounce timer
  var _dirty       = {};   // viewKey -> user actually typed this session
  var _userClosed  = {};   // viewKey -> user collapsed while draft exists
  var _lastFocus   = {};   // viewKey -> id of last focused field
  var _restoring   = {};   // viewKey -> reentrancy guard

  // SOW record id = second 24-hex segment in the hash (same read the
  // stepper and survey-request-cards use). Scopes drafts to the SOW so
  // navigating to a sibling SOW never restores the wrong draft.
  function sowId() {
    var m = (window.location.hash || '').match(/[a-f0-9]{24}/gi);
    return (m && m[1]) || (m && m[0]) || '';
  }
  function draftKey(viewKey) { return KEY_PRE + viewKey + ':' + sowId(); }

  function formEl(viewKey) {
    return document.querySelector('#' + viewKey + ' form');
  }

  function readDraft(viewKey) {
    try {
      var raw = sessionStorage.getItem(draftKey(viewKey));
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.ts || (Date.now() - d.ts) > MAX_AGE) {
        clearDraft(viewKey);
        return null;
      }
      return d;
    } catch (e) { return null; }
  }
  function writeDraft(viewKey, d) {
    try { sessionStorage.setItem(draftKey(viewKey), JSON.stringify(d)); }
    catch (e) { /* quota — guard degrades to nothing */ }
  }
  function clearDraft(viewKey) {
    try { sessionStorage.removeItem(draftKey(viewKey)); } catch (e) {}
  }

  // ── Snapshot ─────────────────────────────────────────────────────
  function fieldEntries(form) {
    var out = [];
    var els = form.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var type = (el.type || '').toLowerCase();
      if (type === 'file' || type === 'submit' || type === 'button' ||
          type === 'reset' || type === 'search') continue;
      if (!el.id && !el.name) continue;
      var entry = {
        id:   el.id || '',
        name: el.name || '',
        tag:  el.tagName.toLowerCase(),
        type: type
      };
      if (type === 'checkbox' || type === 'radio') {
        entry.checked = !!el.checked;
        entry.value   = el.value;
      } else {
        entry.value = el.value;
      }
      out.push(entry);
    }
    return out;
  }

  function saveDraft(viewKey) {
    if (!_dirty[viewKey]) return;
    var form = formEl(viewKey);
    if (!form) return;
    writeDraft(viewKey, {
      ts:     Date.now(),
      focus:  _lastFocus[viewKey] || '',
      fields: fieldEntries(form)
    });
  }
  function scheduleSave(viewKey) {
    if (_saveTimers[viewKey]) clearTimeout(_saveTimers[viewKey]);
    _saveTimers[viewKey] = setTimeout(function () {
      _saveTimers[viewKey] = null;
      saveDraft(viewKey);
    }, SAVE_MS);
  }

  // ── Restore ──────────────────────────────────────────────────────
  function fireNative(el, evtName) {
    try { el.dispatchEvent(new Event(evtName, { bubbles: true })); }
    catch (e) {
      try {
        var evt = document.createEvent('HTMLEvents');
        evt.initEvent(evtName, true, false);
        el.dispatchEvent(evt);
      } catch (e2) { /* ignore */ }
    }
  }

  function findTarget(form, entry) {
    var el = entry.id ? document.getElementById(entry.id) : null;
    if (el && form.contains(el)) return el;
    if (!entry.name) return null;
    var sel = entry.tag + '[name="' + entry.name.replace(/"/g, '\\"') + '"]';
    if (entry.type === 'radio') {
      sel += '[value="' + String(entry.value).replace(/"/g, '\\"') + '"]';
    }
    return form.querySelector(sel);
  }

  /** Re-apply a draft into the (freshly rendered) form. Idempotent —
   *  fields already matching are left untouched, so repeat passes don't
   *  spam change events. Returns true when a draft existed. */
  function restoreDraft(viewKey) {
    var d = readDraft(viewKey);
    if (!d || d.dormant) return false;
    var form = formEl(viewKey);
    if (!form || _restoring[viewKey]) return !!d;
    _restoring[viewKey] = true;
    try {
      for (var i = 0; i < d.fields.length; i++) {
        var entry = d.fields[i];
        var el = findTarget(form, entry);
        if (!el) continue;
        if (entry.type === 'checkbox' || entry.type === 'radio') {
          if (el.checked !== entry.checked) {
            el.checked = entry.checked;
            fireNative(el, 'change');
          }
        } else if (el.value !== entry.value) {
          el.value = entry.value;
          fireNative(el, 'input');
          fireNative(el, 'change');
          // Connection dropdowns render through Chosen — refresh its UI
          // so the restored selection is visible (CLAUDE.md pattern).
          if (entry.tag === 'select' && window.jQuery) {
            try {
              jQuery(el).trigger('chosen:updated').trigger('liszt:updated');
            } catch (e) { /* chosen absent — plain select is fine */ }
          }
        }
      }
      // Put the caret back where they were typing (best-effort).
      if (d.focus) {
        var f = document.getElementById(d.focus);
        if (f && form.contains(f) && document.activeElement !== f &&
            typeof f.focus === 'function') {
          try {
            f.focus({ preventScroll: true });
            if (typeof f.setSelectionRange === 'function' &&
                /^(text|textarea|search|tel|url|email|password)?$/i
                  .test(f.type || (f.tagName === 'TEXTAREA' ? 'textarea' : ''))) {
              var end = (f.value || '').length;
              f.setSelectionRange(end, end);
            }
          } catch (e) { /* focus is a nicety, never a failure */ }
        }
      }
    } finally {
      _restoring[viewKey] = false;
    }
    return true;
  }

  // ── Accordion re-expand (inverse of the stepper's collapse ops) ──
  function expandStepAccordion(viewKey) {
    var hdr = document.querySelector(
      '.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]');
    var wrap = hdr && hdr.closest('.scw-ktl-accordion');
    if (!wrap || wrap.classList.contains('is-expanded')) return;
    wrap.classList.add('is-expanded');
    hdr.setAttribute('aria-expanded', 'true');
    var body = wrap.querySelector('.scw-ktl-accordion__body');
    if (body) body.style.display = '';
    var section = document.querySelector('.hideShow_' + viewKey + '.ktlHideShowSection');
    if (section) section.style.display = 'block';
    var arrow = document.getElementById('hideShow_' + viewKey + '_arrow');
    if (arrow) { arrow.classList.remove('ktlUp'); arrow.classList.add('ktlDown'); }
  }

  function restorePass(viewKey) {
    var had = restoreDraft(viewKey);
    if (had && !_userClosed[viewKey]) expandStepAccordion(viewKey);
  }
  function scheduleRestore(viewKey) {
    RESTORE_DELAYS.forEach(function (ms) {
      setTimeout(function () { restorePass(viewKey); }, ms);
    });
  }

  // ── Draft lifecycle ──────────────────────────────────────────────
  // Successful submit → the draft's job is done. Knack fires these only
  // on success (validation failures keep the form, and don't re-render).
  function bindSubmitClear(viewKey) {
    ['knack-form-submit', 'knack-record-update', 'knack-record-create']
      .forEach(function (evt) {
        $(document)
          .off(evt + '.' + viewKey + NS)
          .on(evt + '.' + viewKey + NS, function () {
            _dirty[viewKey] = false;
            _userClosed[viewKey] = false;
            clearDraft(viewKey);
          });
      });
    // Submit click → mark the draft dormant (don't restore over the
    // confirmation re-render). If the submit was blocked by validation
    // the form keeps its values anyway, and the next keystroke re-arms.
    $(document)
      .off('click' + NS, '#' + viewKey + ' .kn-submit button')
      .on('click' + NS, '#' + viewKey + ' .kn-submit button', function () {
        var d = readDraft(viewKey);
        if (d) { d.dormant = true; writeDraft(viewKey, d); }
        _dirty[viewKey] = false;
      });
  }

  VIEWS.forEach(function (viewKey) {
    // Typing/toggling anywhere in the form → dirty + debounced save.
    $(document)
      .off('input' + NS + ' change' + NS, '#' + viewKey + ' form :input')
      .on('input' + NS + ' change' + NS, '#' + viewKey + ' form :input',
        function () {
          if (_restoring[viewKey]) return;   // our own restore events
          _dirty[viewKey] = true;
          var d = readDraft(viewKey);
          if (d && d.dormant) { /* user typed again — re-arm */ }
          scheduleSave(viewKey);
        });
    $(document)
      .off('focusin' + NS, '#' + viewKey + ' form :input')
      .on('focusin' + NS, '#' + viewKey + ' form :input', function () {
        if (this.id) _lastFocus[viewKey] = this.id;
      });

    // User collapsing the section by hand while a draft exists → respect
    // it (stop auto-expanding); reopening by hand re-arms auto-expand.
    $(document)
      .off('click' + NS,
        '.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]')
      .on('click' + NS,
        '.scw-ktl-accordion__header[data-view-key="' + viewKey + '"]',
        function () {
          var wrap = this.closest('.scw-ktl-accordion');
          // Click toggles: expanded now = it's about to close.
          _userClosed[viewKey] = !!(wrap &&
            wrap.classList.contains('is-expanded'));
        });

    bindSubmitClear(viewKey);

    // The moment the view re-renders (background refresh, KTL pass,
    // post-reload first render) — put the draft back.
    if (window.SCW && SCW.onViewRender) {
      SCW.onViewRender(viewKey, function () { scheduleRestore(viewKey); }, NS);
    }
  });

  // Page-load / scene-navigation catch-all (covers renders that fired
  // before this module's bindings landed).
  $(document)
    .off('knack-scene-render.any' + NS)
    .on('knack-scene-render.any' + NS, function () {
      VIEWS.forEach(function (viewKey) {
        if (document.getElementById(viewKey)) scheduleRestore(viewKey);
      });
    });
})();
/*** END STEP FORM DRAFT GUARD *********************************************/
