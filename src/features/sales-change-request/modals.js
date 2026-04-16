/*** SALES CHANGE REQUEST — MODALS ***/
/**
 * Freeform-note modal and remove-from-proposal modal.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, ._h, .injectStyles, .persist,
 *         .showToast, .refresh
 * Writes: SCW.salesCR.openNote, .openRemove
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;
  var H   = ns._h;
  var P   = CFG.prefix;

  var MODAL_ID = P + '-overlay';

  function closeModal() {
    var o = document.getElementById(MODAL_ID);
    if (o) o.remove();
  }

  // ── Freeform note (not tied to a specific row) ─────────

  function openNoteModal() {
    ns.injectStyles();
    closeModal();

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    // Header
    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title', 'Add Change Request Note'));
    hLeft.appendChild(H.el('div', P + '-modal__subtitle',
      'Freeform note \u2014 not tied to a specific line item'));
    header.appendChild(hLeft);
    var closeBtn = H.el('button', P + '-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    var body = H.el('div', P + '-modal__body');
    body.appendChild(H.el('div', P + '-modal__hint',
      'Describe the change you need. This note will be included in the change request submission.'));
    var ta = document.createElement('textarea');
    ta.className = P + '-modal__textarea';
    ta.placeholder = 'Describe the changes needed\u2026';
    ta.rows = 4;
    body.appendChild(ta);
    modal.appendChild(body);

    // Footer
    var footer = H.el('div', P + '-modal__footer');
    var cancelBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);

    var saveBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--save', 'Add Note');
    saveBtn.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) { ns.showToast('Please enter a note', 'error'); return; }

      var noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      var pending = S.pending();
      pending[noteId] = {
        rowId: null,
        displayLabel: null,
        productName: null,
        action: 'note',
        current: {},
        requested: {},
        changeNotes: text,
      };
      ns.persist();
      if (ns.refresh) ns.refresh();
      closeModal();
      ns.showToast('Note added to change request', 'success');
    });
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 50);
  }

  // ── Remove from proposal (per-row) ────────────────────

  function openRemoveModal(recordId) {
    ns.injectStyles();
    closeModal();

    var base = S.baseline()[recordId] || {};
    var label = base._label || recordId;
    var product = base._product || '';

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    // Header
    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title', 'Request Removal'));
    hLeft.appendChild(H.el('div', P + '-modal__subtitle',
      (label ? label + ' \u2014 ' : '') + (product || 'Item')));
    header.appendChild(hLeft);
    var closeBtn = H.el('button', P + '-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    var body = H.el('div', P + '-modal__body');
    body.appendChild(H.el('div', P + '-modal__hint',
      'Request that this line item be removed. A note is optional.'));
    body.appendChild(H.el('label', P + '-modal__label', 'Reason (optional)'));
    var ta = document.createElement('textarea');
    ta.className = P + '-modal__textarea';
    ta.placeholder = 'Why should this item be removed\u2026';
    ta.rows = 3;
    body.appendChild(ta);
    modal.appendChild(body);

    // Footer
    var footer = H.el('div', P + '-modal__footer');
    var cancelBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);

    var removeBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--remove', 'Request Removal');
    removeBtn.addEventListener('click', function () {
      var pending = S.pending();
      pending[recordId] = {
        rowId: recordId,
        displayLabel: label,
        productName: product,
        action: 'remove',
        current: {},
        requested: {},
        changeNotes: ta.value.trim(),
      };
      ns.persist();
      if (ns.refresh) ns.refresh();
      closeModal();
      ns.showToast('Removal added to change request', 'success');
    });
    footer.appendChild(removeBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 50);
  }

  // ── Per-row note (tied to a specific line item) ─────

  function openRowNoteModal(recordId) {
    ns.injectStyles();
    closeModal();

    var base = S.baseline()[recordId] || {};
    var label = base._label || recordId;
    var product = base._product || '';

    // Check for existing note on this row
    var noteKey = 'note_' + recordId;
    var existing = S.pending()[noteKey];

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    // Header
    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title',
      existing ? 'Edit Note' : 'Add Note'));
    hLeft.appendChild(H.el('div', P + '-modal__subtitle',
      (label ? label + ' \u2014 ' : '') + (product || 'Item')));
    header.appendChild(hLeft);
    var closeBtn = H.el('button', P + '-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Body
    var body = H.el('div', P + '-modal__body');
    body.appendChild(H.el('div', P + '-modal__hint',
      'Add a note about this line item. It will be included in the change request.'));
    var ta = document.createElement('textarea');
    ta.className = P + '-modal__textarea';
    ta.placeholder = 'Note about this item\u2026';
    ta.rows = 3;
    if (existing && existing.changeNotes) ta.value = existing.changeNotes;
    body.appendChild(ta);
    modal.appendChild(body);

    // Footer
    var footer = H.el('div', P + '-modal__footer');
    var cancelBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);

    var saveBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--save',
      existing ? 'Update Note' : 'Add Note');
    saveBtn.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) { ns.showToast('Please enter a note', 'error'); return; }

      var pending = S.pending();
      pending[noteKey] = {
        rowId: recordId,
        displayLabel: label,
        productName: product,
        action: 'note',
        current: {},
        requested: {},
        changeNotes: text,
      };
      ns.persist();
      if (ns.refresh) ns.refresh();
      closeModal();
      ns.showToast(existing ? 'Note updated' : 'Note added', 'success');
    });
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 50);
  }

  // ── Add request (field_2586=0 rows — note required) ─────

  function openAddNoteModal(recordId) {
    ns.injectStyles();
    closeModal();

    var base = S.baseline()[recordId] || {};
    var label = base._label || recordId;
    var product = base._product || '';

    var noteKey = 'note_' + recordId;
    var existing = S.pending()[noteKey];

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title',
      existing ? 'Edit Add Request' : 'Add to Change Request'));
    hLeft.appendChild(H.el('div', P + '-modal__subtitle',
      (label ? label + ' \u2014 ' : '') + (product || 'Item')));
    header.appendChild(hLeft);
    var closeBtn = H.el('button', P + '-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = H.el('div', P + '-modal__body');
    body.appendChild(H.el('div', P + '-modal__hint',
      'This item will be submitted as a new addition. Please include a note describing the add request.'));
    body.appendChild(H.el('label', P + '-modal__label', 'Note (required)'));
    var ta = document.createElement('textarea');
    ta.className = P + '-modal__textarea';
    ta.placeholder = 'Describe why this item is being added\u2026';
    ta.rows = 3;
    if (existing && existing.changeNotes) ta.value = existing.changeNotes;
    body.appendChild(ta);
    modal.appendChild(body);

    var footer = H.el('div', P + '-modal__footer');
    var cancelBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);

    var saveBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--save',
      existing ? 'Update' : 'Add');
    saveBtn.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) { ns.showToast('A note is required for add requests', 'error'); return; }

      var pending = S.pending();
      pending[noteKey] = {
        rowId: recordId,
        displayLabel: label,
        productName: product,
        action: 'add',
        current: {},
        requested: {},
        changeNotes: text,
      };
      ns.persist();
      if (ns.refresh) ns.refresh();
      closeModal();
      ns.showToast(existing ? 'Add request updated' : 'Add request created', 'success');
    });
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 50);
  }

  // ── Edit global (non-row) note by pending key ──────

  function openEditGlobalNoteModal(pendingKey) {
    ns.injectStyles();
    closeModal();

    var pending = S.pending();
    var existing = pending[pendingKey];
    if (!existing) return;

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title', 'Edit Note'));
    header.appendChild(hLeft);
    var closeBtn = H.el('button', P + '-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = H.el('div', P + '-modal__body');
    var ta = document.createElement('textarea');
    ta.className = P + '-modal__textarea';
    ta.rows = 4;
    ta.value = existing.changeNotes || '';
    body.appendChild(ta);
    modal.appendChild(body);

    var footer = H.el('div', P + '-modal__footer');
    var cancelBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);
    var saveBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--save', 'Update Note');
    saveBtn.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) { ns.showToast('Please enter a note', 'error'); return; }
      existing.changeNotes = text;
      ns.persist();
      if (ns.refresh) ns.refresh();
      closeModal();
      ns.showToast('Note updated', 'success');
    });
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 50);
  }

  // ── Edit note on a revise CR ──────────────────────

  function openEditReviseNoteModal(recordId) {
    ns.injectStyles();
    closeModal();

    var pending = S.pending();
    var item = pending[recordId];
    if (!item) return;

    var label = item.displayLabel || item.productName || recordId;

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title', 'Edit Change Note'));
    hLeft.appendChild(H.el('div', P + '-modal__subtitle', label));
    header.appendChild(hLeft);
    var closeBtn = H.el('button', P + '-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = H.el('div', P + '-modal__body');
    body.appendChild(H.el('div', P + '-modal__hint',
      'Add or edit a note for this change request.'));
    var ta = document.createElement('textarea');
    ta.className = P + '-modal__textarea';
    ta.placeholder = 'Additional notes about this change\u2026';
    ta.rows = 3;
    ta.value = item.changeNotes || '';
    body.appendChild(ta);
    modal.appendChild(body);

    var footer = H.el('div', P + '-modal__footer');
    var cancelBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);
    var saveBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--save', 'Save Note');
    saveBtn.addEventListener('click', function () {
      item.changeNotes = ta.value.trim();
      ns.persist();
      if (ns.refresh) ns.refresh();
      closeModal();
      ns.showToast('Note saved', 'success');
    });
    footer.appendChild(saveBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(function () { ta.focus(); }, 50);
  }

  // ── Public API ──
  ns.openNote           = openNoteModal;
  ns.openRowNote        = openRowNoteModal;
  ns.openAddNote        = openAddNoteModal;
  ns.openRemove         = openRemoveModal;
  ns.openEditGlobalNote = openEditGlobalNoteModal;
  ns.openEditReviseNote = openEditReviseNoteModal;

})();
