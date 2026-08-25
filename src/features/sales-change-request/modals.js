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

  /** Resolve display label + product for a record from pending, baseline, or DOM. */
  function resolveIdentity(recordId) {
    var pending = S.pending();
    var item = pending[recordId] || pending['note_' + recordId];
    var base = S.baseline()[recordId] || {};

    var label = H.readableVal((item && item.displayLabel) || base._label || '');
    var product = H.readableVal((item && item.productName) || base._product || '');

    // Sanitize any leftover [object Object] from stale sessionStorage
    if (label.indexOf('[object') !== -1) label = '';
    if (product.indexOf('[object') !== -1) product = '';

    // Fallback: read from the DOM card
    if (!label && !product) {
      var $row = $('#' + recordId);
      if ($row.length) {
        var $labelTd = $row.find('td[data-field-key="' + CFG.labelField + '"]');
        if ($labelTd.length) label = H.stripHtml($labelTd.text());
        var $prodTd = $row.find('td[data-field-key="' + CFG.productField + '"]');
        if ($prodTd.length) product = H.stripHtml($prodTd.text());
      }
    }

    return { label: label, product: product };
  }

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

    var id = resolveIdentity(recordId);
    var label = id.label;
    var product = id.product;
    var existing = S.pending()[recordId];
    var isEdit = existing && existing.action === 'remove';

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    // Header
    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title',
      isEdit ? 'Edit Removal Request' : 'Request Removal'));
    var subtitle = product || label || 'Item';
    if (label && product) subtitle = label + ' \u2014 ' + product;
    hLeft.appendChild(H.el('div', P + '-modal__subtitle', subtitle));
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
    if (isEdit && existing.changeNotes) ta.value = existing.changeNotes;
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

  // ── Bulk removal request (worksheet bulk selection) ──
  // Once the CR surface is live the per-row trash is gone and removal only
  // happens through a request — which made clearing out N items an N-modal
  // chore. This is openRemoveModal over a set: one shared reason, one entry
  // written per row into the SAME pending map, so the CR panel, the payload
  // builder and the submit path all see them as ordinary removals with no
  // special-casing anywhere downstream.

  function openBulkRemoveModal(recordIds) {
    var ids = [];
    for (var i = 0; i < (recordIds || []).length; i++) {
      if (recordIds[i]) ids.push(recordIds[i]);
    }
    if (!ids.length) return;

    ns.injectStyles();
    closeModal();

    var pending = S.pending();
    var already = 0;
    for (var a = 0; a < ids.length; a++) {
      var ex = pending[ids[a]];
      if (ex && ex.action === 'remove') already++;
    }

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title', 'Request Removal'));
    hLeft.appendChild(H.el('div', P + '-modal__subtitle',
      ids.length + ' line item' + (ids.length === 1 ? '' : 's') + ' selected'));
    header.appendChild(hLeft);
    var closeBtn = H.el('button', P + '-modal__close', '×');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = H.el('div', P + '-modal__body');
    body.appendChild(H.el('div', P + '-modal__hint',
      'Request that these line items be removed. The reason below applies to ' +
      'all of them; you can edit any one afterwards from the change-request panel.'));

    // Name every row. Blind bulk removal on a priced SOW is not something to
    // confirm from a count alone.
    var list = H.el('div', P + '-modal__bulklist');
    for (var n = 0; n < ids.length; n++) {
      var id = resolveIdentity(ids[n]);
      var text = id.label && id.product ? (id.label + ' — ' + id.product)
               : (id.label || id.product || ids[n]);
      var row = H.el('div', P + '-modal__bulkitem', text);
      var exi = pending[ids[n]];
      if (exi && exi.action === 'remove') {
        row.appendChild(H.el('span', P + '-modal__bulkflag', 'already requested'));
      }
      list.appendChild(row);
    }
    body.appendChild(list);

    if (already) {
      body.appendChild(H.el('div', P + '-modal__hint',
        already + ' of these already ' + (already === 1 ? 'has' : 'have') +
        ' a removal request — submitting will overwrite ' +
        (already === 1 ? 'its reason' : 'their reasons') + ' with the note below.'));
    }

    body.appendChild(H.el('label', P + '-modal__label', 'Reason (optional)'));
    var ta = document.createElement('textarea');
    ta.className = P + '-modal__textarea';
    ta.placeholder = 'Why should these items be removed…';
    ta.rows = 3;
    body.appendChild(ta);
    modal.appendChild(body);

    var footer = H.el('div', P + '-modal__footer');
    var cancelBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--cancel', 'Cancel');
    cancelBtn.addEventListener('click', closeModal);
    footer.appendChild(cancelBtn);

    var removeBtn = H.el('button', P + '-modal__btn ' + P + '-modal__btn--remove',
      'Request removal of ' + ids.length);
    removeBtn.addEventListener('click', function () {
      var note = ta.value.trim();
      var p = S.pending();
      for (var k = 0; k < ids.length; k++) {
        var ident = resolveIdentity(ids[k]);
        p[ids[k]] = {
          rowId:        ids[k],
          displayLabel: ident.label,
          productName:  ident.product,
          action:       'remove',
          current:      {},
          requested:    {},
          changeNotes:  note,
        };
      }
      ns.persist();
      if (ns.refresh) ns.refresh();
      closeModal();
      // Drop the worksheet selection — leaving N rows ticked after they've
      // all been marked for removal invites a second accidental pass.
      try {
        var b = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.bulk;
        if (b && typeof b.clear === 'function') b.clear();
      } catch (eSel) { /* selection is cosmetic here */ }
      ns.showToast(ids.length + ' removal' + (ids.length === 1 ? '' : 's') +
        ' added to change request', 'success');
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

    var id = resolveIdentity(recordId);
    var label = id.label;
    var product = id.product;

    var noteKey = 'note_' + recordId;
    var existing = S.pending()[noteKey];

    var overlay = H.el('div', P + '-overlay');
    overlay.id = MODAL_ID;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

    var modal = H.el('div', P + '-modal');

    var header = H.el('div', P + '-modal__header');
    var hLeft = H.el('div');
    hLeft.appendChild(H.el('div', P + '-modal__title',
      existing ? 'Edit Note' : 'Add Note'));
    var subtitle = product || label || 'Item';
    if (label && product) subtitle = label + ' \u2014 ' + product;
    hLeft.appendChild(H.el('div', P + '-modal__subtitle', subtitle));
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

    var id = resolveIdentity(recordId);
    var label = id.label;
    var product = id.product;

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
    var addSubtitle = product || label || 'Item';
    if (label && product) addSubtitle = label + ' \u2014 ' + product;
    hLeft.appendChild(H.el('div', P + '-modal__subtitle', addSubtitle));
    header.appendChild(hLeft);
    var closeBtn = H.el('button', P + '-modal__close', '\u00d7');
    closeBtn.addEventListener('click', closeModal);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    var body = H.el('div', P + '-modal__body');
    body.appendChild(H.el('div', P + '-modal__hint',
      'This item will be submitted as a new addition. Please include a note describing the add request.'));
    body.appendChild(H.el('label', P + '-modal__label', 'Note (optional)'));
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
      // Note is optional

      // Snapshot all tracked field values from baseline into requested
      var base = S.baseline()[recordId] || {};
      var req = {};
      for (var tf = 0; tf < CFG.trackedFields.length; tf++) {
        var fk = CFG.trackedFields[tf].key;
        if (base[fk] != null) req[fk] = base[fk];
        if (base[fk + '_ids']) req[fk + '_ids'] = base[fk + '_ids'];
      }

      var pending = S.pending();
      pending[noteKey] = {
        rowId: recordId,
        displayLabel: label,
        productName: product,
        bucketId: base._bucketId || '',
        bucketName: base._bucketName || '',
        laborHours: base._laborHours || 0,
        action: 'add',
        current: {},
        requested: req,
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

    var id = resolveIdentity(recordId);
    var label = id.product || id.label || item.displayLabel || item.productName || 'Item';

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
  ns.openBulkRemove     = openBulkRemoveModal;
  ns.openEditGlobalNote = openEditGlobalNoteModal;
  ns.openEditReviseNote = openEditReviseNoteModal;

})();
