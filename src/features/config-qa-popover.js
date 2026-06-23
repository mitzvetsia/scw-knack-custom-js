/*** CONFIG QA POPOVER ***
 *
 * Click handler + inline editor for the QA chit on each camera-config
 * record in the install-config-subpanel.  Simpler shape than the photo
 * QA popover: 2-state (Pending / Verified), no client-signoff gate.
 *
 * Triggered by: a click on .scw-install-config-qa-chit (handled inline
 * by install-config-subpanel.js, which calls SCW.configQaPopover.open).
 *
 * Host-structure agnostic (V1 + V2 worksheet): this popover operates
 * ENTIRELY off the anchor chit element handed to open() — it positions
 * relative to the chit's bounding rect and rewrites the chit in place via
 * refreshChit(). It never queries the surrounding worksheet card DOM, so
 * it works identically whether install-config-subpanel.js injected the
 * chit into the V1 card's photo strip (.scw-ws-req-photos) or the V2
 * card's detail section header (.scw-ws-v2-detail). Keep it that way —
 * do NOT reintroduce V1/V2-specific card-DOM lookups here.
 *
 * Data contract — fields on the camera-config object:
 *   field_2896 — QA_status         (Multiple Choice: Pending / Verified)
 *   field_2897 — QA_completed_by   (Connection → user)
 *   field_2898 — QA_completed_date (Date/Time)
 *   field_2899 — QA_notes          (Paragraph)
 *   field_2900 — QA_history        (Paragraph — append-only audit)
 *
 * Saves go through view_3916 (the camera-config grid hidden on the
 * deploy scene) using Knack's view-based PUT, so we get the user-
 * session-token + same-origin path.
 */
(function () {
  'use strict';

  var SAVE_VIEW = 'view_3916';
  var POPOVER_ID = 'scw-config-qa-popover';

  var F = {
    status:        'field_2896',
    completedBy:   'field_2897',
    completedDate: 'field_2898',
    notes:         'field_2899',
    history:       'field_2900'
  };

  var OPTIONS = ['Pending', 'Verified'];

  var _popover = null;
  var _configId = null;
  var _initial = null;          // snapshot at open
  var _anchor = null;           // the chit
  var _isSaving = false;

  // ── CSS ──────────────────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById('scw-config-qa-popover-css')) return;
    var s = document.createElement('style');
    s.id = 'scw-config-qa-popover-css';
    s.textContent = [
      '.scw-cqa-popover {',
      '  position: absolute; z-index: 10000;',
      '  background: #fff; border: 1px solid #d1d5db; border-radius: 10px;',
      '  box-shadow: 0 12px 32px rgba(0,0,0,0.18);',
      '  width: 320px; max-width: calc(100vw - 24px);',
      '  font: 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;',
      '  color: #1f2937;',
      '  padding: 14px 16px;',
      '}',
      '.scw-cqa-popover__title {',
      '  font-size: 12px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: 0.04em; color: #374151; margin-bottom: 10px;',
      '}',
      '.scw-cqa-popover__signoff {',
      '  font-size: 11px; color: #15803d; margin-bottom: 10px;',
      '  padding: 6px 10px; background: #f0fdf4; border-radius: 6px;',
      '  border: 1px solid #bbf7d0;',
      '}',
      '.scw-cqa-popover__section { margin-bottom: 12px; }',
      '.scw-cqa-popover__label {',
      '  font-size: 11px; font-weight: 700; text-transform: uppercase;',
      '  color: #6b7280; letter-spacing: 0.04em; margin-bottom: 4px;',
      '}',
      '.scw-cqa-popover__chips { display: flex; gap: 6px; }',
      '.scw-cqa-popover__chip {',
      '  flex: 1 1 0; padding: 6px 10px; border-radius: 6px;',
      '  border: 1px solid #d1d5db; background: #fff; cursor: pointer;',
      '  font-size: 12px; font-weight: 600; text-align: center;',
      '  white-space: nowrap; user-select: none; transition: all 0.12s;',
      '}',
      '.scw-cqa-popover__chip:hover { background: #f9fafb; }',
      '.scw-cqa-popover__chip.is-selected[data-value="Verified"] {',
      '  background: #dcfce7; color: #15803d; border-color: #86efac;',
      '}',
      '.scw-cqa-popover__chip.is-selected[data-value="Pending"] {',
      '  background: #eef2ff; color: #4338ca; border-color: #a5b4fc;',
      '}',
      '.scw-cqa-popover__notes {',
      '  width: 100%; min-height: 60px; box-sizing: border-box;',
      '  padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px;',
      '  font: inherit; resize: vertical; outline: none;',
      '}',
      '.scw-cqa-popover__notes:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }',
      '.scw-cqa-popover__actions { display: flex; gap: 8px; margin-top: 12px; }',
      '.scw-cqa-popover__btn {',
      '  flex: 1; padding: 8px 12px; border-radius: 6px;',
      '  font-size: 12px; font-weight: 700; cursor: pointer;',
      '  border: 1px solid transparent; transition: all 0.12s;',
      '  text-transform: uppercase; letter-spacing: 0.04em;',
      '}',
      '.scw-cqa-popover__btn--primary { background: #059669; color: #fff; border-color: #047857; }',
      '.scw-cqa-popover__btn--primary:hover { background: #047857; }',
      '.scw-cqa-popover__btn--primary:disabled { background: #e5e7eb; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; }',
      '.scw-cqa-popover__btn--revert { background: #fff; color: #b91c1c; border-color: #fca5a5; }',
      '.scw-cqa-popover__btn--revert:hover { background: #fef2f2; }',
      '.scw-cqa-popover__btn--cancel { background: #fff; color: #374151; border-color: #d1d5db; }',
      '.scw-cqa-popover__btn--cancel:hover { background: #f9fafb; }',
      '.scw-cqa-popover__error {',
      '  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;',
      '  padding: 6px 10px; border-radius: 6px; font-size: 11px; margin-top: 8px;',
      '}',
      '.scw-cqa-popover.is-saving { opacity: 0.7; pointer-events: none; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Helpers ──────────────────────────────────────────────────────

  function nowStamp() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function todayForKnack() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getMonth() + 1) + '/' + p(d.getDate()) + '/' + d.getFullYear();
  }

  function currentUserName() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && u.name) return u.name;
      if (u && u.values && u.values.name) return u.values.name;
    } catch (e) {}
    return 'Unknown user';
  }

  function currentUserId() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && u.id) return u.id;
    } catch (e) {}
    return '';
  }

  function prependHistory(existing, event, detail) {
    var line = nowStamp() + ' — ' + currentUserName() + ' — ' + event;
    if (detail) line += ': ' + detail;
    var safe = line.replace(/[<>]/g, function (c) {
      return c === '<' ? '&lt;' : '&gt;';
    });
    if (!existing) return safe;
    return safe + '<br>' + existing;
  }

  function saveFields(fields, onDone) {
    if (typeof SCW === 'undefined' ||
        typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      onDone && onDone(new Error('SCW.knackAjax/knackRecordUrl unavailable'));
      return;
    }
    SCW.knackAjax({
      url: SCW.knackRecordUrl(SAVE_VIEW, _configId),
      type: 'PUT',
      data: JSON.stringify(fields),
      success: function () { onDone && onDone(null); },
      error: function (xhr) {
        onDone && onDone(new Error('PUT ' + xhr.status));
      }
    });
  }

  // ── Popover render + lifecycle ───────────────────────────────────

  function buildPopover(initial) {
    var pop = document.createElement('div');
    pop.className = 'scw-cqa-popover';
    pop.id = POPOVER_ID;

    var title = document.createElement('div');
    title.className = 'scw-cqa-popover__title';
    title.textContent = 'Camera Config QA';
    pop.appendChild(title);

    if (initial.status === 'Verified') {
      var sig = document.createElement('div');
      sig.className = 'scw-cqa-popover__signoff';
      var who  = (initial.completedBy   || '').trim();
      var when = (initial.completedDate || '').trim();
      if (who && when)      sig.textContent = 'Verified by ' + who + ' on ' + when + '.';
      else if (who)         sig.textContent = 'Verified by ' + who + '.';
      else if (when)        sig.textContent = 'Verified on ' + when + '.';
      else                  sig.textContent = 'Verified.';
      pop.appendChild(sig);
    }

    // Status chips
    var section = document.createElement('div');
    section.className = 'scw-cqa-popover__section';
    var lbl = document.createElement('div');
    lbl.className = 'scw-cqa-popover__label';
    lbl.textContent = 'Status';
    section.appendChild(lbl);
    var row = document.createElement('div');
    row.className = 'scw-cqa-popover__chips';
    var working = { status: initial.status, notes: initial.notes };
    OPTIONS.forEach(function (opt) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'scw-cqa-popover__chip';
      chip.setAttribute('data-value', opt);
      chip.textContent = opt;
      if (opt === working.status) chip.classList.add('is-selected');
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        var siblings = row.querySelectorAll('.scw-cqa-popover__chip');
        for (var i = 0; i < siblings.length; i++) siblings[i].classList.remove('is-selected');
        chip.classList.add('is-selected');
        working.status = opt;
        updateActions();
      });
      row.appendChild(chip);
    });
    section.appendChild(row);
    pop.appendChild(section);

    // Notes
    var notesSec = document.createElement('div');
    notesSec.className = 'scw-cqa-popover__section';
    var notesLbl = document.createElement('div');
    notesLbl.className = 'scw-cqa-popover__label';
    notesLbl.textContent = 'Notes';
    notesSec.appendChild(notesLbl);
    var notes = document.createElement('textarea');
    notes.className = 'scw-cqa-popover__notes';
    notes.value = working.notes || '';
    notes.addEventListener('input', function () { working.notes = notes.value; });
    notesSec.appendChild(notes);
    pop.appendChild(notesSec);

    // Actions
    var actions = document.createElement('div');
    actions.className = 'scw-cqa-popover__actions';
    pop.appendChild(actions);

    pop._working = working;

    function updateActions() {
      actions.innerHTML = '';
      var alreadyVerified = (_initial.status === 'Verified');

      if (alreadyVerified) {
        var revert = document.createElement('button');
        revert.type = 'button';
        revert.className = 'scw-cqa-popover__btn scw-cqa-popover__btn--revert';
        revert.textContent = 'Revert';
        revert.addEventListener('click', function () { onRevert(working); });
        actions.appendChild(revert);

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'scw-cqa-popover__btn scw-cqa-popover__btn--cancel';
        close.textContent = 'Close';
        close.addEventListener('click', function () { closePopover(true); });
        actions.appendChild(close);
      } else {
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'scw-cqa-popover__btn scw-cqa-popover__btn--cancel';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', function () { closePopover(true); });
        actions.appendChild(cancel);

        var verify = document.createElement('button');
        verify.type = 'button';
        verify.className = 'scw-cqa-popover__btn scw-cqa-popover__btn--primary';
        verify.textContent = 'Verify';
        verify.disabled = (working.status !== 'Verified');
        verify.addEventListener('click', function () { onVerify(working); });
        actions.appendChild(verify);
      }
    }

    updateActions();
    return pop;
  }

  function onVerify(working) {
    if (_isSaving) return;
    var fields = {};
    fields[F.status]        = 'Verified';
    fields[F.notes]         = working.notes || '';
    fields[F.completedBy]   = currentUserId();
    fields[F.completedDate] = todayForKnack();
    fields[F.history] = prependHistory(
      _initial.history,
      'VERIFIED',
      working.notes ? ('notes=' + working.notes) : ''
    );
    sendSave(fields, { status: 'Verified', notes: working.notes });
  }

  function onRevert(working) {
    if (_isSaving) return;
    var fields = {};
    fields[F.status]        = 'Pending';
    fields[F.notes]         = working.notes || '';
    fields[F.completedBy]   = '';
    fields[F.completedDate] = '';
    fields[F.history] = prependHistory(
      _initial.history,
      'VERIFICATION REVERTED',
      working.notes ? ('notes=' + working.notes) : ''
    );
    sendSave(fields, { status: 'Pending', notes: working.notes });
  }

  function sendSave(fields, newState) {
    if (_isSaving) return;
    _isSaving = true;
    if (_popover) _popover.classList.add('is-saving');
    var anchor = _anchor;
    saveFields(fields, function (err) {
      _isSaving = false;
      if (err) {
        if (_popover) _popover.classList.remove('is-saving');
        showError(err.message || 'Save failed');
        return;
      }
      if (anchor) refreshChit(anchor, newState);
      closePopover(true);
    });
  }

  function refreshChit(chit, newState) {
    var state = newState.status === 'Verified' ? 'verified' : 'pending';
    var stateText = state === 'verified' ? 'Verified' : 'Pending';
    // Preserve the existing name label (Config 1 / Camera config) that
    // was set when the chit was first rendered.
    var nameEl = chit.querySelector('.scw-install-config-qa-chit-name');
    var nameText = nameEl ? nameEl.textContent : 'Camera config';

    chit.classList.remove('is-verified', 'is-pending');
    chit.classList.add('is-' + state);
    chit.setAttribute('data-qa-state', state);
    chit.title = state === 'verified'
      ? 'Config verified — click to revert'
      : 'Click to verify this config';
    var iconCheck = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var iconClock = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    chit.innerHTML = (state === 'verified' ? iconCheck : iconClock) +
      '<span class="scw-install-config-qa-chit-name">' + nameText + '</span>' +
      '<span class="scw-install-config-qa-chit-state">' + stateText + '</span>';
  }

  function showError(msg) {
    if (!_popover) return;
    var existing = _popover.querySelector('.scw-cqa-popover__error');
    if (existing) existing.remove();
    var err = document.createElement('div');
    err.className = 'scw-cqa-popover__error';
    err.textContent = msg;
    _popover.appendChild(err);
  }

  function open(anchorEl, configId, qaSnapshot) {
    closePopover(true);
    if (!configId) return;
    injectCSS();

    _configId = configId;
    _anchor = anchorEl;
    _initial = {
      status:        (qaSnapshot && qaSnapshot.status)        || 'Pending',
      notes:         (qaSnapshot && qaSnapshot.notes)         || '',
      history:       (qaSnapshot && qaSnapshot.history)       || '',
      completedBy:   (qaSnapshot && qaSnapshot.completedBy)   || '',
      completedDate: (qaSnapshot && qaSnapshot.completedDate) || ''
    };
    _isSaving = false;

    _popover = buildPopover(_initial);
    document.body.appendChild(_popover);
    positionPopover(_popover, anchorEl);
  }

  function positionPopover(pop, anchor) {
    var rect = anchor.getBoundingClientRect();
    var popW = pop.offsetWidth;
    var popH = pop.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var GAP = 6;
    var top = rect.bottom + GAP + window.pageYOffset;
    if (rect.bottom + GAP + popH > vh && rect.top - GAP - popH > 0) {
      top = rect.top - GAP - popH + window.pageYOffset;
    }
    var left = rect.left + window.pageXOffset;
    if (left + popW > vw - 8) {
      left = Math.max(8, vw - popW - 8) + window.pageXOffset;
    }
    pop.style.top  = top  + 'px';
    pop.style.left = left + 'px';
  }

  function closePopover() {
    if (!_popover) return;
    _popover.remove();
    _popover = null;
    _configId = null;
    _initial = null;
    _anchor = null;
  }

  // Click outside / Escape close
  document.addEventListener('mousedown', function (e) {
    if (!_popover) return;
    if (_popover.contains(e.target)) return;
    if (e.target.closest('.scw-install-config-qa-chit')) return;
    closePopover();
  }, true);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _popover) closePopover();
  });

  // Expose
  window.SCW = window.SCW || {};
  SCW.configQaPopover = {
    open:  open,
    close: closePopover
  };
})();
