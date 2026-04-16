/*** SALES CHANGE REQUEST — RENDER ***/
/**
 * Injects per-row action menus (in the delete-button slot), pending-CR
 * cards into detail panels, and the floating action bar.
 *
 * The action menu sits next to the Knack delete icon. When delete is
 * hidden (field_2586 > 0) it offers: Add Note, Request Removal, Clear.
 * When delete is visible (field_2586 = 0, new item) it only offers Add Note
 * since the item itself is the "add" change request.
 *
 * The popover renders as a portal on document.body to avoid stacking-
 * context / overflow issues with accordion containers.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, ._h, .pendingCount,
 *         .openNote, .openRowNote, .openRemove, .submitToWebhook
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

  // Currently-open popover (rendered on document.body)
  var _openPopover = null;
  var _popoverAnchor = null;

  // Close popover on outside click or scroll
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
  //  PENDING-CR CARD (detail panel)
  // ═══════════════════════════════════════════════════════════

  function buildCard(pendingKey, item) {
    var action = item.action || 'revise';
    var card = H.el('div', P + '-card ' + P + '-card--' + action);

    var headerText = action === 'add'    ? 'PENDING ADD'
                   : action === 'remove' ? 'PENDING REMOVAL'
                   : action === 'note'   ? 'NOTE'
                   :                       'PENDING CHANGE';
    card.appendChild(H.el('div', P + '-card-header', headerText));

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
    if (action === 'note') {
      card.appendChild(H.el('div', P + '-card-notes', item.changeNotes || ''));
      return card;
    }

    // Revise / Add — field diffs
    var r = item.requested || {};
    var c = item.current || {};
    for (var f = 0; f < TF.length; f++) {
      var def = TF[f];
      if (r[def.key] == null) continue;
      var row = H.el('div', P + '-card-field');
      row.appendChild(H.el('span', P + '-card-label', def.label + ':'));
      if (action === 'revise' && c[def.key] != null) {
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

  /**
   * @param {string} recordId
   * @param {boolean} addOnly - true for field_2586=0 rows (only note allowed)
   */
  function buildPopover(recordId, addOnly) {
    var pop = H.el('div', P + '-popover');
    var pending = S.pending();
    var hasCR    = !!pending[recordId];
    var hasNote  = !!pending['note_' + recordId];

    if (addOnly) {
      // ADD-only rows: single "Add" action (opens note modal, creates add CR)
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
      // Add Note (per-row)
      var noteItem = H.el('div', P + '-popover-item');
      noteItem.appendChild(H.el('span', P + '-popover-icon', '\u270D'));
      noteItem.appendChild(document.createTextNode(hasNote ? 'Edit Note' : 'Add Note'));
      noteItem.addEventListener('click', function (e) {
        e.stopPropagation();
        closePopover();
        ns.openRowNote(recordId);
      });
      pop.appendChild(noteItem);

      // Request Removal
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

    // Clear (if any pending CR or note on this row)
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

  /** Determine the dominant action state for a row (CR + note combined). */
  function rowActionState(recordId) {
    var pending = S.pending();
    var cr   = pending[recordId];
    var note = pending['note_' + recordId];
    if (cr) return { action: cr.action, hasNote: !!note };
    if (note) return { action: 'note', hasNote: true };
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  //  INJECT ACTION MENUS + CARDS
  // ═══════════════════════════════════════════════════════════

  function injectActionMenusAndCards() {
    var $view = $('#' + CFG.worksheetView);
    if (!$view.length) return;

    // Clean previous
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

      // field_2586 = 0 → delete is visible → ADD-only mode (just notes)
      // field_2586 > 0 → delete is hidden → full CR menu
      var deleteVisible = $deleteWrap[0].style.visibility !== 'hidden';
      var addOnly = deleteVisible;

      // Build action button
      var state = rowActionState(recordId);
      var wrap = H.el('span', P + '-action-wrap');
      var btn  = H.el('button', P + '-action-btn');

      // Icon varies by state
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

      // Inject cards into detail panel
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
  //  FLOATING ACTION BAR
  // ═══════════════════════════════════════════════════════════

  function renderActionBar() {
    var bar = document.getElementById(CFG.barId);

    if (!S.onPage()) {
      if (bar) bar.classList.add('is-hidden');
      return;
    }

    if (!bar) {
      bar = H.el('div');
      bar.id = CFG.barId;
      document.body.appendChild(bar);
    }

    var count = ns.pendingCount();
    bar.innerHTML = '';
    bar.classList.remove('is-hidden');

    // Count
    var countEl = H.el('div', P + '-bar-count');
    countEl.appendChild(H.el('span', P + '-bar-num', String(count)));
    countEl.appendChild(document.createTextNode(' pending change' + (count === 1 ? '' : 's')));
    bar.appendChild(countEl);

    bar.appendChild(H.el('div', P + '-bar-spacer'));

    // Add Note (global)
    var noteBtn = H.el('button', P + '-bar-btn ' + P + '-bar-btn--note', 'Add Note');
    noteBtn.addEventListener('click', function () { ns.openNote(); });
    bar.appendChild(noteBtn);

    // Clear
    if (count > 0) {
      var clearBtn = H.el('button', P + '-bar-btn--clear', 'Clear all');
      clearBtn.addEventListener('click', function () {
        if (window.confirm('Clear all ' + count + ' pending change(s)?')) {
          ns.clear();
          ns.showToast('All changes cleared', 'info');
        }
      });
      bar.appendChild(clearBtn);
    }

    // Save Draft
    var draftBtn = H.el('button', P + '-bar-btn ' + P + '-bar-btn--draft', 'Save Draft');
    draftBtn.disabled = count === 0;
    draftBtn.addEventListener('click', function () { ns.submitToWebhook(true); });
    bar.appendChild(draftBtn);

    // Submit
    var submitBtn = H.el('button', P + '-bar-btn ' + P + '-bar-btn--submit', 'Submit Changes');
    submitBtn.disabled = count === 0;
    submitBtn.addEventListener('click', function () { ns.submitToWebhook(false); });
    bar.appendChild(submitBtn);
  }

  // ═══════════════════════════════════════════════════════════
  //  COMBINED REFRESH
  // ═══════════════════════════════════════════════════════════

  function renderUI() {
    injectActionMenusAndCards();
    renderActionBar();
  }

  // ── Public API ──
  ns.renderUI        = renderUI;
  ns.renderActionBar = renderActionBar;

})();
