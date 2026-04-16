/*** SALES CHANGE REQUEST — RENDER ***/
/**
 * Injects per-row action menus (in the delete-button slot), pending-CR
 * cards into detail panels, and a sticky action bar pinned to the bottom
 * of the view_3586 accordion.
 *
 * The action bar lives INSIDE the accordion body so it:
 *   - Matches the view width (no wider)
 *   - Sticks to viewport bottom while scrolling through the view
 *   - Stops at the bottom of the accordion when you scroll past
 *
 * Clicking the pending count expands a change summary panel.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, ._h, .pendingCount,
 *         .openNote, .openRowNote, .openAddNote, .openRemove, .submitToWebhook
 * Writes: SCW.salesCR.renderUI, .renderActionBar
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;
  var H   = ns._h;
  var P   = CFG.prefix;
  var TF  = CFG.trackedFields;

  var _openPopover = null;
  var _popoverAnchor = null;
  var _panelOpen = false;

  $(document).on('click' + CFG.eventNs + 'Pop', function (e) {
    if (!_openPopover) return;
    if (_openPopover.contains(e.target)) return;
    if (_popoverAnchor && _popoverAnchor.contains(e.target)) return;
    closePopover();
  });
  $(window).on('scroll' + CFG.eventNs + 'Pop', function () {
    if (_openPopover) closePopover();
  });

  // ═══════════════════════════════════════════════════════════
  //  PENDING-CR CARD (detail panel + changes panel)
  // ═══════════════════════════════════════════════════════════

  function buildCard(pendingKey, item, opts) {
    opts = opts || {};
    var action = item.action || 'revise';
    var card = H.el('div', P + '-card ' + P + '-card--' + action);

    var headerText = action === 'add'    ? 'ADD'
                   : action === 'remove' ? 'REMOVAL'
                   : action === 'note'   ? 'NOTE'
                   :                       'CHANGE';
    var headerEl = H.el('div', P + '-card-header');
    headerEl.textContent = headerText;
    if (item.displayLabel || item.productName) {
      headerEl.textContent += ' \u2014 ' + (item.displayLabel || item.productName);
    }
    card.appendChild(headerEl);

    // Dismiss X
    var dismiss = H.el('button', P + '-card-dismiss', '\u00d7');
    dismiss.title = 'Remove this change';
    dismiss.addEventListener('click', function (e) {
      e.stopPropagation();
      var pending = S.pending();
      delete pending[pendingKey];
      ns.persist();
      if (ns.refresh) ns.refresh();
    });
    card.appendChild(dismiss);

    if (action === 'remove') {
      card.appendChild(H.el('div', P + '-card-notes', item.changeNotes || 'Requesting removal'));
      return card;
    }
    if (action === 'note' || action === 'add') {
      if (item.changeNotes) {
        card.appendChild(H.el('div', P + '-card-notes', '\u201c' + item.changeNotes + '\u201d'));
      }
      // Show field diffs if present (add items from auto-detection)
      var r = item.requested || {};
      for (var f = 0; f < TF.length; f++) {
        var def = TF[f];
        if (r[def.key] == null) continue;
        var row = H.el('div', P + '-card-field');
        row.appendChild(H.el('span', P + '-card-label', def.label + ':'));
        row.appendChild(H.el('span', P + '-card-to', H.formatFieldValue(def, r[def.key])));
        card.appendChild(row);
      }
      return card;
    }

    // Revise — field diffs
    var r = item.requested || {};
    var c = item.current || {};
    for (var f = 0; f < TF.length; f++) {
      var def = TF[f];
      if (r[def.key] == null) continue;
      var row = H.el('div', P + '-card-field');
      row.appendChild(H.el('span', P + '-card-label', def.label + ':'));
      if (c[def.key] != null) {
        row.appendChild(H.el('span', P + '-card-from', H.formatFieldValue(def, c[def.key])));
        row.appendChild(H.el('span', P + '-card-arrow', '\u2192'));
      }
      row.appendChild(H.el('span', P + '-card-to', H.formatFieldValue(def, r[def.key])));
      card.appendChild(row);
    }

    if (item.changeNotes) {
      card.appendChild(H.el('div', P + '-card-notes', '\u201c' + item.changeNotes + '\u201d'));
    }
    return card;
  }

  // ═══════════════════════════════════════════════════════════
  //  POPOVER (portal on document.body)
  // ═══════════════════════════════════════════════════════════

  function buildPopover(recordId, addOnly) {
    var pop = H.el('div', P + '-popover');
    var pending = S.pending();
    var hasCR    = !!pending[recordId];
    var hasNote  = !!pending['note_' + recordId];

    if (addOnly) {
      var addItem = H.el('div', P + '-popover-item');
      addItem.appendChild(H.el('span', P + '-popover-icon', '+'));
      addItem.appendChild(document.createTextNode(hasNote ? 'Edit Add Request' : 'Add'));
      addItem.addEventListener('click', function (e) {
        e.stopPropagation();
        closePopover();
        ns.openAddNote(recordId);
      });
      pop.appendChild(addItem);
    } else {
      var noteItem = H.el('div', P + '-popover-item');
      noteItem.appendChild(H.el('span', P + '-popover-icon', '\u270D'));
      noteItem.appendChild(document.createTextNode(hasNote ? 'Edit Note' : 'Add Note'));
      noteItem.addEventListener('click', function (e) {
        e.stopPropagation();
        closePopover();
        ns.openRowNote(recordId);
      });
      pop.appendChild(noteItem);

      if (!hasCR || pending[recordId].action !== 'remove') {
        var removeItem = H.el('div', P + '-popover-item ' + P + '-popover-item--remove');
        removeItem.appendChild(H.el('span', P + '-popover-icon', '\u2212'));
        removeItem.appendChild(document.createTextNode('Request Removal'));
        removeItem.addEventListener('click', function (e) {
          e.stopPropagation();
          closePopover();
          ns.openRemove(recordId);
        });
        pop.appendChild(removeItem);
      }
    }

    if (hasCR || hasNote) {
      pop.appendChild(H.el('div', P + '-popover-sep'));
      var clearItem = H.el('div', P + '-popover-item ' + P + '-popover-item--clear');
      clearItem.appendChild(H.el('span', P + '-popover-icon', '\u00d7'));
      clearItem.appendChild(document.createTextNode('Clear'));
      clearItem.addEventListener('click', function (e) {
        e.stopPropagation();
        closePopover();
        if (hasCR)   delete pending[recordId];
        if (hasNote) delete pending['note_' + recordId];
        ns.persist();
        if (ns.refresh) ns.refresh();
      });
      pop.appendChild(clearItem);
    }

    return pop;
  }

  function positionPopover(pop, anchorEl) {
    var rect = anchorEl.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.top  = (rect.bottom + 4) + 'px';
    pop.style.right = (window.innerWidth - rect.right) + 'px';
    pop.style.left = 'auto';
  }

  function closePopover() {
    if (_openPopover) {
      _openPopover.remove();
      _openPopover = null;
      _popoverAnchor = null;
    }
  }

  function rowActionState(recordId) {
    var pending = S.pending();
    var cr   = pending[recordId];
    var note = pending['note_' + recordId];
    if (cr) return { action: cr.action, hasNote: !!note };
    if (note) return { action: note.action || 'note', hasNote: true };
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  //  INJECT ACTION MENUS + CARDS
  // ═══════════════════════════════════════════════════════════

  function injectActionMenusAndCards() {
    var $view = $('#' + CFG.worksheetView);
    if (!$view.length) return;

    $view.find('.' + P + '-action-wrap').remove();
    $view.find('.' + P + '-card').remove();

    var pending = S.pending();

    $view.find('tr[id]').each(function () {
      var $tr = $(this);
      var recordId = $tr.attr('id');
      if (!recordId || recordId.indexOf('kn-') === 0) return;

      var $card = $tr.find('.scw-ws-card');
      if (!$card.length) return;

      var $deleteWrap = $card.find('.scw-ws-sum-delete');
      if (!$deleteWrap.length) return;

      var deleteVisible = $deleteWrap[0].style.visibility !== 'hidden';
      var addOnly = deleteVisible;

      var state = rowActionState(recordId);
      var wrap = H.el('span', P + '-action-wrap');
      var btn  = H.el('button', P + '-action-btn');

      if (state) {
        var iconCls = state.action === 'add'    ? 'fa-plus'
                    : state.action === 'remove' ? 'fa-minus-circle'
                    : state.action === 'note'   ? 'fa-comment'
                    :                             'fa-pencil';
        btn.innerHTML = '<i class="fa ' + iconCls + '" style="font-size:14px;"></i>';
        btn.classList.add(P + '-action-btn--' + state.action);
        if (state.hasNote && state.action !== 'note') {
          btn.classList.add(P + '-action-btn--has-note');
        }
      } else {
        btn.innerHTML = '<i class="fa fa-ellipsis-v" style="font-size:14px;"></i>';
      }

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        closePopover();

        var pop = buildPopover(recordId, addOnly);
        positionPopover(pop, btn);
        document.body.appendChild(pop);
        _openPopover = pop;
        _popoverAnchor = btn;
      });

      wrap.appendChild(btn);
      $deleteWrap.after(wrap);

      // Cards in detail panel
      var $detail = $card.find('.scw-ws-detail');
      if (!$detail.length) return;

      if (pending[recordId]) {
        $detail[0].appendChild(buildCard(recordId, pending[recordId]));
      }
      var noteKey = 'note_' + recordId;
      if (pending[noteKey]) {
        $detail[0].appendChild(buildCard(noteKey, pending[noteKey]));
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  STICKY ACTION BAR (inside view_3586 accordion)
  // ═══════════════════════════════════════════════════════════

  function renderActionBar() {
    var bar = document.getElementById(CFG.barId);

    if (!S.onPage()) {
      if (bar) bar.remove();
      return;
    }

    // Find the accordion body that contains view_3586
    var $view = $('#' + CFG.worksheetView);
    if (!$view.length) {
      if (bar) bar.remove();
      return;
    }
    var $accBody = $view.closest('.scw-ktl-accordion__body');
    var container = $accBody.length ? $accBody[0] : $view[0].parentNode;

    if (!bar) {
      bar = H.el('div');
      bar.id = CFG.barId;
    }

    // Move bar into the accordion body if not already there
    if (bar.parentNode !== container) {
      container.appendChild(bar);
    }

    var count = ns.pendingCount();
    bar.innerHTML = '';

    // ── Top row: count + buttons ──
    var topRow = H.el('div', P + '-bar-top');

    // Clickable count (toggles panel)
    var countEl = H.el('div', P + '-bar-count');
    countEl.style.cursor = count > 0 ? 'pointer' : 'default';
    var chevron = H.el('span', P + '-bar-chevron' + (_panelOpen ? ' is-open' : ''));
    chevron.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 2 8 6 4 10"></polyline></svg>';
    if (count > 0) countEl.appendChild(chevron);
    countEl.appendChild(H.el('span', P + '-bar-num', String(count)));
    countEl.appendChild(document.createTextNode(' pending change' + (count === 1 ? '' : 's')));
    if (count > 0) {
      countEl.addEventListener('click', function () {
        _panelOpen = !_panelOpen;
        renderActionBar();
      });
    }
    topRow.appendChild(countEl);

    topRow.appendChild(H.el('div', P + '-bar-spacer'));

    var noteBtn = H.el('button', P + '-bar-btn ' + P + '-bar-btn--note', 'Add Note');
    noteBtn.addEventListener('click', function () { ns.openNote(); });
    topRow.appendChild(noteBtn);

    if (count > 0) {
      var clearBtn = H.el('button', P + '-bar-btn--clear', 'Clear all');
      clearBtn.addEventListener('click', function () {
        if (window.confirm('Clear all ' + count + ' pending change(s)?')) {
          ns.clear();
          _panelOpen = false;
          ns.showToast('All changes cleared', 'info');
        }
      });
      topRow.appendChild(clearBtn);
    }

    var draftBtn = H.el('button', P + '-bar-btn ' + P + '-bar-btn--draft', 'Save Draft');
    draftBtn.disabled = count === 0;
    draftBtn.addEventListener('click', function () { ns.submitToWebhook(true); });
    topRow.appendChild(draftBtn);

    var submitBtn = H.el('button', P + '-bar-btn ' + P + '-bar-btn--submit', 'Submit Changes');
    submitBtn.disabled = count === 0;
    submitBtn.addEventListener('click', function () { ns.submitToWebhook(false); });
    topRow.appendChild(submitBtn);

    bar.appendChild(topRow);

    // ── Expandable changes panel ──
    if (_panelOpen && count > 0) {
      var panel = H.el('div', P + '-bar-panel');
      var pending = S.pending();
      var keys = Object.keys(pending);
      for (var i = 0; i < keys.length; i++) {
        panel.appendChild(buildCard(keys[i], pending[keys[i]]));
      }
      bar.appendChild(panel);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  LOCK FIELDS ON field_2586 = 0 ROWS
  // ═══════════════════════════════════════════════════════════
  // New items (field_2586 = 0) should be read-only on everything
  // EXCEPT field_1949 (product). Uses device-worksheet's existing
  // lock classes so the visual treatment is consistent.

  var WS_P = 'scw-ws'; // device-worksheet CSS prefix
  var LOCK_ATTR = 'data-scw-cr-locked';

  function lockNewItemFields() {
    var $view = $('#' + CFG.worksheetView);
    if (!$view.length) return;

    var locked = 0;

    $view.find('tr.scw-ws-row').each(function () {
      var $tr = $(this);
      var recordId = $tr.attr('id');
      if (!recordId) return;

      var $card = $tr.find('.scw-ws-card');
      if (!$card.length) return;

      // Delete wrapper visibility maps to field_2586:
      // visible (no inline style) = field_2586 = 0 (new item, fully editable)
      // visibility:hidden = field_2586 > 0 (existing item, lock all except product)
      var $deleteWrap = $card.find('.' + WS_P + '-sum-delete');
      if (!$deleteWrap.length) return;
      var isExisting = $deleteWrap[0].style.visibility === 'hidden';
      if (!isExisting) return;

      // Already locked this render cycle
      if ($card[0].hasAttribute(LOCK_ATTR)) return;
      $card[0].setAttribute(LOCK_ATTR, '1');

      locked++;

      // Lock ALL directEdit inputs/textareas (except product + discount %)
      var editableFields = {};
      editableFields[CFG.productField] = true;  // field_1949
      editableFields['field_2261'] = true;       // Custom Discount %
      $card.find('input[data-field], textarea[data-field]').each(function () {
        var field = this.getAttribute('data-field') || '';
        if (editableFields[field]) return;
        this.readOnly = true;
        this.tabIndex = -1;
        this.style.cursor = 'default';
        this.style.pointerEvents = 'none';
        this.style.background = '#fff';
      });

      // Lock toggleChit (Existing Cabling, Exterior)
      $card.find('.' + WS_P + '-cabling-chit').each(function () {
        this.style.pointerEvents = 'none';
        this.style.cursor = 'default';
      });

      // Lock nativeEdit tds (except product field)
      $card.find('td.cell-edit').each(function () {
        var field = this.getAttribute('data-field-key') || '';
        if (field === CFG.productField) return;
        this.style.pointerEvents = 'none';
      });
    });

    if (CFG.debug && locked) console.log('[SalesCR] Locked fields on', locked, 'new-item rows');
  }

  // ═══════════════════════════════════════════════════════════
  //  COMBINED REFRESH
  // ═══════════════════════════════════════════════════════════

  function renderUI() {
    injectActionMenusAndCards();
    lockNewItemFields();
    renderActionBar();
  }

  ns.renderUI        = renderUI;
  ns.renderActionBar = renderActionBar;

})();
