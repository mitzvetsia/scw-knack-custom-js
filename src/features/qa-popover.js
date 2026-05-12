/*** QA POPOVER ***
 *
 * Click handler + inline editor for the required-photo chits in the
 * device-worksheet header.  Lets a PM walk down rows and sign off on
 * each photo's QA status without ever leaving the worksheet.
 *
 * Triggered by: click on .scw-ws-req-photo-chit[data-photo-id]
 *
 * The chit is rendered by device-worksheet.js (renderSummaryField case
 * 'requiredPhotos'); this module is decoupled — it reads the source
 * <tr> still attached above each .scw-ws-row to pull the photo's
 * current QA fields, then writes back to the PIC record via the Knack
 * object-based REST endpoint.
 *
 * Data contract (all fields on the PIC object):
 *   field_2859 — QA_status         (Multiple Choice: Pending/Pass/Fail)
 *   field_2860 — QA_client_signoff (Multiple Choice: N/A/Pending/Approved/Bypassed)
 *   field_2861 — QA_notes          (Paragraph Text)
 *   field_2862 — QA_completed_by   (Connection → user)
 *   field_2863 — QA_completed_date (Date/Time)
 *   field_2865 — QA_history        (Paragraph Text — append-only audit trail)
 *
 * Sign-off math:
 *   complete = QA_status='Pass' AND (QA_client_signoff in {N/A, Approved, Bypassed})
 *   When complete flips to true:   set _completed_by + _completed_date, log to _history.
 *   When complete flips to false:  clear _completed_by + _completed_date, log to _history.
 */
(function () {
  'use strict';

  var POPOVER_ID = 'scw-qa-popover';

  // PIC field keys
  var F = {
    img:           'field_771',
    photoType:     'field_2445',
    required:      'field_2446',
    completed:     'field_2447',
    status:        'field_2859',
    client:        'field_2860',
    notes:         'field_2861',
    completedBy:   'field_2862',
    completedDate: 'field_2863',
    history:       'field_2865'
  };

  // Multiple-choice option labels (must match the Knack option values exactly).
  var STATUS_OPTIONS = ['Pending', 'Pass', 'Fail'];
  var CLIENT_OPTIONS = ['Pending', 'Approved', 'Bypassed'];

  // Cached object key for the PIC object (looked up once per session).
  var _picObjectKey = null;

  // Currently open popover state.
  var _popover = null;          // DOM element
  var _photoId = null;          // PIC record id currently being edited
  var _initialState = null;     // snapshot at open time, used to detect changes
  var _hasUnsavedChanges = false;
  var _isSaving = false;

  // ── CSS ──────────────────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById('scw-qa-popover-css')) return;
    var css = [
      '.scw-qa-popover {',
      '  position: absolute; z-index: 10000;',
      '  background: #fff; border: 1px solid #d1d5db; border-radius: 10px;',
      '  box-shadow: 0 12px 32px rgba(0,0,0,0.18);',
      '  width: 340px; max-width: calc(100vw - 24px);',
      '  font: 13px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;',
      '  color: #1f2937;',
      '  padding: 14px 16px;',
      '}',
      '.scw-qa-popover__head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }',
      '.scw-qa-popover__thumb {',
      '  width: 96px; height: 96px; border-radius: 6px; background: #f3f4f6 center/cover no-repeat;',
      '  border: 1px solid #e5e7eb; flex-shrink: 0;',
      '  cursor: zoom-in;',
      '}',
      '.scw-qa-popover__thumb--empty {',
      '  display: flex; align-items: center; justify-content: center;',
      '  color: #9ca3af; font-size: 11px; text-align: center;',
      '  cursor: default;',
      '}',
      '.scw-qa-popover__type { font-weight: 700; font-size: 13px; line-height: 1.2; }',
      '.scw-qa-popover__sub  { font-size: 11px; color: #6b7280; margin-top: 2px; }',
      '.scw-qa-popover__section { margin-bottom: 12px; }',
      '.scw-qa-popover__label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #6b7280; letter-spacing: 0.04em; margin-bottom: 4px; }',
      '.scw-qa-popover__chips { display: flex; gap: 4px; }',
      '.scw-qa-popover__chip {',
      '  flex: 1 1 0; min-width: 0; padding: 5px 8px; border-radius: 6px;',
      '  border: 1px solid #d1d5db; background: #fff; cursor: pointer;',
      '  font-size: 11px; font-weight: 600; text-align: center;',
      '  white-space: nowrap; user-select: none; transition: all 0.12s;',
      '}',
      '.scw-qa-popover__chip:hover { background: #f9fafb; }',
      '.scw-qa-popover__chip.is-selected[data-value="Pass"],',
      '.scw-qa-popover__chip.is-selected[data-value="Approved"],',
      '.scw-qa-popover__chip.is-selected[data-value="Bypassed"] { background: #dcfce7; color: #15803d; border-color: #86efac; }',
      '.scw-qa-popover__chip.is-selected[data-value="Fail"]     { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }',
      '.scw-qa-popover__chip.is-selected[data-value="Pending"]  { background: #eef2ff; color: #4338ca; border-color: #a5b4fc; }',
      '.scw-qa-popover__notes {',
      '  width: 100%; min-height: 60px; box-sizing: border-box;',
      '  padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px;',
      '  font: inherit; resize: vertical; outline: none;',
      '}',
      '.scw-qa-popover__notes:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.15); }',
      '.scw-qa-popover__notes-hint { font-size: 11px; color: #b45309; margin-top: 4px; }',
      '.scw-qa-popover__actions { display: flex; gap: 8px; margin-top: 14px; }',
      '.scw-qa-popover__btn {',
      '  flex: 1; padding: 8px 14px; border-radius: 6px;',
      '  font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent;',
      '  transition: all 0.12s; text-transform: uppercase; letter-spacing: 0.04em;',
      '}',
      '.scw-qa-popover__btn--primary {',
      '  background: #059669; color: #fff; border-color: #047857;',
      '}',
      '.scw-qa-popover__btn--primary:hover { background: #047857; }',
      '.scw-qa-popover__btn--primary:disabled { background: #e5e7eb; color: #9ca3af; border-color: #e5e7eb; cursor: not-allowed; }',
      '.scw-qa-popover__btn--revert {',
      '  background: #fff; color: #b91c1c; border-color: #fca5a5;',
      '}',
      '.scw-qa-popover__btn--revert:hover { background: #fef2f2; }',
      '.scw-qa-popover__btn--cancel {',
      '  background: #fff; color: #374151; border-color: #d1d5db;',
      '}',
      '.scw-qa-popover__btn--cancel:hover { background: #f9fafb; }',
      '.scw-qa-popover__signoff {',
      '  font-size: 11px; color: #6b7280; margin-top: 8px;',
      '  padding-top: 8px; border-top: 1px solid #f3f4f6;',
      '}',
      '.scw-qa-popover__error {',
      '  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;',
      '  padding: 6px 10px; border-radius: 6px; font-size: 11px; margin-top: 8px;',
      '}',
      '.scw-qa-popover.is-saving { opacity: 0.7; pointer-events: none; }'
    ].join('\n');

    var style = document.createElement('style');
    style.id = 'scw-qa-popover-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Knack object key resolution ─────────────────────────────────

  function resolvePicObjectKey() {
    if (_picObjectKey) return _picObjectKey;
    try {
      var models = Knack.objects.models;
      for (var i = 0; i < models.length; i++) {
        var fields = models[i].attributes.fields;
        for (var j = 0; j < fields.length; j++) {
          if (fields[j].key === F.status) {
            _picObjectKey = models[i].attributes.key;
            return _picObjectKey;
          }
        }
      }
    } catch (e) {
      console.warn('[scw-qa] Could not resolve PIC object key:', e);
    }
    return null;
  }

  // ── Reading photo data from the worksheet DOM ───────────────────

  /**
   * Find the source <tr> that contains the photo metadata cells for
   * a given chit.  device-worksheet.js places the source row directly
   * above each .scw-ws-row in the DOM (display:none, attribute
   * PROCESSED_ATTR='1').  Walk back to find it.
   */
  function findSourceTr(chitEl) {
    var wsTr = chitEl.closest('tr.scw-ws-row');
    if (!wsTr) return null;
    var prev = wsTr.previousElementSibling;
    // Skip back over inline-photo rows or any other injected siblings.
    while (prev && (prev.classList.contains('scw-inline-photo-row') ||
                    prev.classList.contains('scw-ws-row'))) {
      prev = prev.previousElementSibling;
    }
    if (prev && prev.tagName === 'TR') return prev;
    return null;
  }

  /** Read a single photo's data from a source tr by photo record id. */
  function readPhoto(tr, photoId) {
    function readSpanText(fieldKey) {
      var cell = tr.querySelector('td.' + fieldKey);
      if (!cell) return '';
      var span = cell.querySelector(
        'span[id="' + photoId + '"][data-kn="connection-value"]'
      );
      return span ? (span.textContent || '').trim() : '';
    }
    function readSpanHtml(fieldKey) {
      var cell = tr.querySelector('td.' + fieldKey);
      if (!cell) return '';
      var span = cell.querySelector(
        'span[id="' + photoId + '"][data-kn="connection-value"]'
      );
      return span ? (span.innerHTML || '').trim() : '';
    }
    // Photo type: connection field — text lives in the INNER connection-value span.
    function readType() {
      var cell = tr.querySelector('td.' + F.photoType);
      if (!cell) return '';
      var outer = cell.querySelector(
        'span[id="' + photoId + '"][data-kn="connection-value"]'
      );
      if (!outer) return '';
      var inner = outer.querySelector('span[data-kn="connection-value"]');
      return ((inner ? inner.textContent : outer.textContent) || '').trim();
    }
    // Image URL: lives in the field_771 outer span as <img>.
    function readImgUrl() {
      var cells = tr.querySelectorAll('td.' + F.img + ', td[data-field-key="' + F.img + '"]');
      for (var i = 0; i < cells.length; i++) {
        var span = cells[i].querySelector('span[id="' + photoId + '"]');
        if (!span) continue;
        var img = span.querySelector('img[data-kn-img-gallery]') || span.querySelector('img');
        if (img) {
          var url = img.getAttribute('data-kn-img-gallery') || img.getAttribute('src') || '';
          return url;
        }
      }
      return '';
    }

    return {
      id:         photoId,
      type:       readType(),
      status:     readSpanText(F.status)  || 'Pending',
      client:     readSpanText(F.client)  || 'N/A',
      notes:      readSpanText(F.notes)   || '',
      history:    readSpanHtml(F.history) || '',
      imgUrl:     readImgUrl(),
      // The completed flag — used to decide whether QA is even possible.
      completed:  /^(yes|true)$/i.test(readSpanText(F.completed) || '')
    };
  }

  // ── Sign-off math ───────────────────────────────────────────────

  function isFullyComplete(status, client) {
    if (status !== 'Pass') return false;
    if (!client || client === 'N/A') return true;
    return (client === 'Approved' || client === 'Bypassed');
  }

  function isClientGateActive(client) {
    return client && client !== 'N/A' && client !== '';
  }

  // ── History formatting ──────────────────────────────────────────

  function nowStamp() {
    var d = new Date();
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
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

  /** Prepend a one-line audit entry to the history text. */
  function prependHistory(existing, event, detail) {
    var line = nowStamp() + ' — ' + currentUserName() + ' — ' + event;
    if (detail) line += ': ' + detail;
    // existing is innerHTML (paragraph text preserves <br> linebreaks);
    // append as plain text + <br> so it stacks above previous entries.
    var safe = (line || '').replace(/[<>]/g, function (c) {
      return c === '<' ? '&lt;' : '&gt;';
    });
    if (!existing) return safe;
    return safe + '<br>' + existing;
  }

  // ── Save ────────────────────────────────────────────────────────

  function saveFields(fields, onDone) {
    var key = resolvePicObjectKey();
    if (!key) {
      onDone && onDone(new Error('PIC object key unresolved'));
      return;
    }
    if (typeof SCW === 'undefined' || typeof SCW.knackAjax !== 'function') {
      onDone && onDone(new Error('SCW.knackAjax unavailable'));
      return;
    }
    SCW.knackAjax({
      url: Knack.api_url + '/v1/objects/' + key + '/records/' + _photoId,
      type: 'PUT',
      data: JSON.stringify(fields),
      success: function () { onDone && onDone(null); },
      error: function (xhr) {
        onDone && onDone(new Error('PUT ' + xhr.status));
      }
    });
  }

  // ── Popover rendering ───────────────────────────────────────────

  function buildPopover(photo) {
    var clientGateActive = isClientGateActive(photo.client);
    var alreadySignedOff = isFullyComplete(photo.status, photo.client);

    var pop = document.createElement('div');
    pop.className = 'scw-qa-popover';
    pop.id = POPOVER_ID;
    pop.setAttribute('data-photo-id', photo.id);

    // Head: thumbnail + photo type label
    var head = document.createElement('div');
    head.className = 'scw-qa-popover__head';
    var thumb = document.createElement('div');
    thumb.className = 'scw-qa-popover__thumb';
    if (photo.imgUrl) {
      // Use original (not thumb_14) so it's a real image; thumb_14 path is also fine.
      thumb.style.backgroundImage = "url('" + photo.imgUrl.replace(/'/g, "\\'") + "')";
      thumb.addEventListener('click', function () {
        window.open(photo.imgUrl, '_blank');
      });
    } else {
      thumb.classList.add('scw-qa-popover__thumb--empty');
      thumb.textContent = 'no photo';
    }
    head.appendChild(thumb);
    var meta = document.createElement('div');
    var typeEl = document.createElement('div');
    typeEl.className = 'scw-qa-popover__type';
    typeEl.textContent = photo.type || 'Photo';
    var subEl = document.createElement('div');
    subEl.className = 'scw-qa-popover__sub';
    subEl.textContent = alreadySignedOff ? 'Signed off' : 'QA review';
    meta.appendChild(typeEl);
    meta.appendChild(subEl);
    head.appendChild(meta);
    pop.appendChild(head);

    // Status chips
    pop.appendChild(buildChipRow(
      'Status', STATUS_OPTIONS, photo.status, 'status', pop, photo
    ));

    // Client signoff chips (only when applicable)
    if (clientGateActive) {
      pop.appendChild(buildChipRow(
        'Client signoff', CLIENT_OPTIONS, photo.client, 'client', pop, photo
      ));
    }

    // Notes
    var notesSec = document.createElement('div');
    notesSec.className = 'scw-qa-popover__section';
    var notesLbl = document.createElement('div');
    notesLbl.className = 'scw-qa-popover__label';
    notesLbl.textContent = 'Notes';
    notesSec.appendChild(notesLbl);
    var notes = document.createElement('textarea');
    notes.className = 'scw-qa-popover__notes';
    notes.value = photo.notes || '';
    notes.setAttribute('data-field', 'notes');
    notes.addEventListener('input', function () {
      photo.notes = notes.value;
      _hasUnsavedChanges = true;
      updateActions(pop, photo);
    });
    notesSec.appendChild(notes);
    var hint = document.createElement('div');
    hint.className = 'scw-qa-popover__notes-hint';
    hint.style.display = 'none';
    notesSec.appendChild(hint);
    pop.appendChild(notesSec);

    // Action buttons (placeholder — filled by updateActions)
    var actions = document.createElement('div');
    actions.className = 'scw-qa-popover__actions';
    pop.appendChild(actions);

    // Signoff metadata footer if already signed off
    if (alreadySignedOff) {
      var foot = document.createElement('div');
      foot.className = 'scw-qa-popover__signoff';
      foot.textContent = 'Signed off — click Revert to re-open for review.';
      pop.appendChild(foot);
    }

    updateActions(pop, photo);
    return pop;
  }

  function buildChipRow(label, options, currentValue, fieldName, pop, photo) {
    var sec = document.createElement('div');
    sec.className = 'scw-qa-popover__section';
    var lbl = document.createElement('div');
    lbl.className = 'scw-qa-popover__label';
    lbl.textContent = label;
    sec.appendChild(lbl);
    var row = document.createElement('div');
    row.className = 'scw-qa-popover__chips';
    options.forEach(function (opt) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'scw-qa-popover__chip';
      chip.setAttribute('data-value', opt);
      chip.textContent = opt;
      if (opt === currentValue) chip.classList.add('is-selected');
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        // Deselect siblings, select this
        var siblings = row.querySelectorAll('.scw-qa-popover__chip');
        for (var i = 0; i < siblings.length; i++) {
          siblings[i].classList.remove('is-selected');
        }
        chip.classList.add('is-selected');
        photo[fieldName] = opt;
        _hasUnsavedChanges = true;
        updateActions(pop, photo);
      });
      row.appendChild(chip);
    });
    sec.appendChild(row);
    return sec;
  }

  function updateActions(pop, photo) {
    var actions = pop.querySelector('.scw-qa-popover__actions');
    if (!actions) return;
    actions.innerHTML = '';

    var hint = pop.querySelector('.scw-qa-popover__notes-hint');
    var notes = (photo.notes || '').trim();

    var alreadySignedOff = isFullyComplete(_initialState.status, _initialState.client);
    var wouldBeComplete  = isFullyComplete(photo.status, photo.client);

    // Validation: require notes when Fail or Bypassed selected.
    var requiresNotes = (photo.status === 'Fail') || (photo.client === 'Bypassed');
    var notesMissing  = requiresNotes && !notes;
    if (hint) {
      if (notesMissing) {
        hint.textContent = (photo.status === 'Fail')
          ? 'Notes required when marking Fail.'
          : 'Bypass reason required.';
        hint.style.display = '';
      } else {
        hint.style.display = 'none';
      }
    }

    // Primary action depends on state.
    if (alreadySignedOff) {
      var revert = document.createElement('button');
      revert.type = 'button';
      revert.className = 'scw-qa-popover__btn scw-qa-popover__btn--revert';
      revert.textContent = 'Revert sign-off';
      revert.addEventListener('click', function () { onRevert(photo); });
      actions.appendChild(revert);

      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'scw-qa-popover__btn scw-qa-popover__btn--cancel';
      close.textContent = 'Close';
      close.addEventListener('click', function () { closePopover(true); });
      actions.appendChild(close);
    } else {
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'scw-qa-popover__btn scw-qa-popover__btn--cancel';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', function () { closePopover(false); });
      actions.appendChild(cancel);

      var signoff = document.createElement('button');
      signoff.type = 'button';
      signoff.className = 'scw-qa-popover__btn scw-qa-popover__btn--primary';
      signoff.textContent = 'Sign Off';
      signoff.disabled = !wouldBeComplete || notesMissing;
      signoff.addEventListener('click', function () { onSignOff(photo); });
      actions.appendChild(signoff);
    }
  }

  // ── Sign-off / revert / autosave ────────────────────────────────

  function onSignOff(photo) {
    if (_isSaving) return;
    var fields = {};
    fields[F.status] = photo.status;
    if (isClientGateActive(_initialState.client)) {
      fields[F.client] = photo.client;
    }
    fields[F.notes] = photo.notes || '';
    fields[F.completedBy]   = currentUserId();
    fields[F.completedDate] = nowStamp();
    var detail = 'status=' + photo.status +
      (isClientGateActive(_initialState.client) ? ', client=' + photo.client : '');
    fields[F.history] = prependHistory(photo.history, 'SIGNED OFF', detail);

    sendSave(fields, 'Signed off.');
  }

  function onRevert(photo) {
    if (_isSaving) return;
    var fields = {};
    // Keep current radio selections (the user may have changed them in the
    // popover before clicking revert), but clear the completion audit.
    fields[F.status] = photo.status;
    if (isClientGateActive(_initialState.client)) {
      fields[F.client] = photo.client;
    }
    fields[F.notes] = photo.notes || '';
    fields[F.completedBy]   = '';
    fields[F.completedDate] = '';
    fields[F.history] = prependHistory(
      photo.history,
      'SIGN-OFF REVERTED',
      'status=' + photo.status +
        (isClientGateActive(_initialState.client) ? ', client=' + photo.client : '')
    );
    sendSave(fields, 'Sign-off reverted.');
  }

  function autoSaveIfDirty(onDone) {
    if (!_hasUnsavedChanges || _isSaving) {
      onDone && onDone();
      return;
    }
    // Pull current values back out of the popover DOM
    var pop = _popover;
    if (!pop) { onDone && onDone(); return; }
    var status = readSelectedChip(pop, 'status') || _initialState.status;
    var client = readSelectedChip(pop, 'client') || _initialState.client;
    var notesEl = pop.querySelector('.scw-qa-popover__notes');
    var notes  = notesEl ? notesEl.value : _initialState.notes;

    // Don't autosave Fail/Bypass without notes — that violates the rule
    // (validation in updateActions already kept Sign Off disabled,
    // but autosave on click-outside could otherwise persist invalid state).
    var requiresNotes = (status === 'Fail') || (client === 'Bypassed');
    if (requiresNotes && !(notes || '').trim()) {
      // Discard the offending change and just close.
      onDone && onDone();
      return;
    }

    var fields = {};
    if (status !== _initialState.status) fields[F.status] = status;
    if (isClientGateActive(_initialState.client) && client !== _initialState.client) {
      fields[F.client] = client;
    }
    if (notes !== _initialState.notes) fields[F.notes] = notes;

    if (!Object.keys(fields).length) {
      onDone && onDone();
      return;
    }

    _isSaving = true;
    saveFields(fields, function (err) {
      _isSaving = false;
      if (err) console.warn('[scw-qa] autosave failed:', err);
      onDone && onDone();
    });
  }

  function readSelectedChip(pop, fieldName) {
    var rows = pop.querySelectorAll('.scw-qa-popover__chips');
    // Map data-field on the row's parent section.  Easier: walk by chip's data-value.
    // We stored data-field on the textarea but not on the chip rows. Reconstruct
    // by looking at the first chip in each row's options.
    // Simpler: search by known option order.
    for (var i = 0; i < rows.length; i++) {
      var firstChip = rows[i].querySelector('.scw-qa-popover__chip');
      if (!firstChip) continue;
      var firstVal = firstChip.getAttribute('data-value');
      var isStatusRow = (firstVal === 'Pending') && (rows[i].querySelectorAll('.scw-qa-popover__chip').length === 3) &&
        rows[i].querySelector('.scw-qa-popover__chip[data-value="Pass"]');
      var isClientRow = rows[i].querySelector('.scw-qa-popover__chip[data-value="Approved"]');
      if ((fieldName === 'status' && isStatusRow) ||
          (fieldName === 'client' && isClientRow)) {
        var sel = rows[i].querySelector('.scw-qa-popover__chip.is-selected');
        return sel ? sel.getAttribute('data-value') : null;
      }
    }
    return null;
  }

  function sendSave(fields, _successMsg) {
    if (_isSaving) return;
    _isSaving = true;
    if (_popover) _popover.classList.add('is-saving');
    saveFields(fields, function (err) {
      _isSaving = false;
      if (err) {
        if (_popover) _popover.classList.remove('is-saving');
        showError(err.message || 'Save failed');
        return;
      }
      closePopover(true);
      // Trigger Knack view re-render so the chits reflect the new state.
      try {
        var viewId = findCurrentViewId();
        if (viewId && Knack.views[viewId] && Knack.views[viewId].model &&
            typeof Knack.views[viewId].model.fetch === 'function') {
          Knack.views[viewId].model.fetch();
        }
      } catch (e) { /* swallow */ }
    });
  }

  function showError(msg) {
    if (!_popover) return;
    var existing = _popover.querySelector('.scw-qa-popover__error');
    if (existing) existing.remove();
    var err = document.createElement('div');
    err.className = 'scw-qa-popover__error';
    err.textContent = msg;
    _popover.appendChild(err);
  }

  function findCurrentViewId() {
    if (!_popover) return null;
    // Walk up from the chit that triggered this popover (we stored
    // the chit ref on the popover element).
    var chit = _popover._triggerChit;
    if (!chit) return null;
    var view = chit.closest('[id^="view_"]');
    return view ? view.id : null;
  }

  // ── Open / close lifecycle ──────────────────────────────────────

  function openForChit(chitEl) {
    closePopover(false);

    var photoId = chitEl.getAttribute('data-photo-id');
    if (!photoId) return;
    var sourceTr = findSourceTr(chitEl);
    if (!sourceTr) {
      console.warn('[scw-qa] Could not find source tr for chit', chitEl);
      return;
    }
    var photo = readPhoto(sourceTr, photoId);
    if (!photo.completed) {
      // Photo not yet uploaded — the chit's amber state already
      // signals that; QA isn't applicable yet. Let the existing
      // add-photo flow handle it (inline-photo-row owns that).
      return;
    }

    _photoId = photoId;
    _initialState = {
      status: photo.status,
      client: photo.client,
      notes:  photo.notes,
      history: photo.history
    };
    _hasUnsavedChanges = false;
    _isSaving = false;

    injectCSS();
    var pop = buildPopover(photo);
    pop._triggerChit = chitEl;
    document.body.appendChild(pop);
    _popover = pop;

    positionPopover(pop, chitEl);
  }

  function positionPopover(pop, anchor) {
    var rect = anchor.getBoundingClientRect();
    var popW = pop.offsetWidth;
    var popH = pop.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var GAP = 6;

    // Prefer below the anchor; flip above if overflow.
    var top = rect.bottom + GAP + window.pageYOffset;
    if (rect.bottom + GAP + popH > vh && rect.top - GAP - popH > 0) {
      top = rect.top - GAP - popH + window.pageYOffset;
    }
    // Align right edge with anchor's right when space is tight,
    // otherwise align left edge.
    var left = rect.left + window.pageXOffset;
    if (left + popW > vw - 8) {
      left = Math.max(8, vw - popW - 8) + window.pageXOffset;
    }
    pop.style.top  = top  + 'px';
    pop.style.left = left + 'px';
  }

  function closePopover(skipAutosave) {
    if (!_popover) return;
    var finish = function () {
      if (_popover) {
        _popover.remove();
        _popover = null;
      }
      _photoId = null;
      _initialState = null;
      _hasUnsavedChanges = false;
    };
    if (skipAutosave) {
      finish();
    } else {
      autoSaveIfDirty(finish);
    }
  }

  // ── Event delegation ────────────────────────────────────────────

  $(document).off('click.scwQA').on('click.scwQA', '.scw-ws-req-photo-chit[data-photo-id]', function (e) {
    var state = this.getAttribute('data-photo-state');
    // "missing" chits use the existing inline-photo-row add flow,
    // which is wired by inline-photo-row.js on a different element.
    // Don't intercept those here.
    if (state === 'missing') return;
    e.stopPropagation();
    openForChit(this);
  });

  // Click outside closes (and autosaves)
  document.addEventListener('mousedown', function (e) {
    if (!_popover) return;
    if (_popover.contains(e.target)) return;
    if (e.target.closest('.scw-ws-req-photo-chit')) return;
    closePopover(false);
  }, true);

  // Escape closes without autosave
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _popover) {
      closePopover(true);
    }
  });

  // Expose for diagnostics
  window.SCW = window.SCW || {};
  SCW.qaPopover = {
    open:  openForChit,
    close: function () { closePopover(true); }
  };
})();
