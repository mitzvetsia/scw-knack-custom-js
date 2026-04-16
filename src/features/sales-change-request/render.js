/*** SALES CHANGE REQUEST — RENDER ***/
/**
 * Injects per-row action menus (in the delete-button slot), pending-CR
 * cards into detail panels, and the floating action bar.
 *
 * The action menu replaces the Knack delete icon with a "..." button
 * that opens a popover with: Add Note, Request Removal, Clear.
 * When a pending CR exists the icon shows the action-type color.
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

  // Track the currently-open popover so we can close it
  var _openPopover = null;

  // Close any open popover on outside click
  $(document).on('click' + CFG.eventNs + 'Pop', function (e) {
    if (_openPopover && !_openPopover.contains(e.target)) {
      _openPopover.remove();
      _openPopover = null;
    }
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
  //  ACTION MENU (popover in delete-button slot)
  // ═══════════════════════════════════════════════════════════

  function buildPopover(recordId) {
    var pop = H.el('div', P + '-popover');
    var pending = S.pending();
    var hasCR    = !!pending[recordId];
    var hasNote  = !!pending['note_' + recordId];

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

  function closePopover() {
    if (_openPopover) {
      // Remove z-index boost from ancestor card
      var boosted = _openPopover.closest('.' + P + '-action-wrap');
      if (boosted) {
        var parentCard = boosted.closest('.scw-ws-card');
        if (parentCard) parentCard.style.zIndex = '';
        var parentTr = boosted.closest('tr');
        if (parentTr) parentTr.style.zIndex = '';
      }
      _openPopover.remove();
      _openPopover = null;
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

      // Find the delete wrapper in the summary row
      var $deleteWrap = $card.find('.scw-ws-sum-delete');
      if (!$deleteWrap.length) return;

      // Skip rows where the delete button is visible (field_2586 = 0)
      if ($deleteWrap[0].style.visibility !== 'hidden') return;

      // Build action button
      var state = rowActionState(recordId);
      var wrap = H.el('span', P + '-action-wrap');
      var btn  = H.el('button', P + '-action-btn', '\u22EE'); // vertical ellipsis

      if (state) {
        btn.classList.add(P + '-action-btn--' + state.action);
        if (state.hasNote && state.action !== 'note') {
          btn.classList.add(P + '-action-btn--has-note');
        }
      }

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        closePopover();

        // Boost z-index on ancestor elements so popover escapes overflow
        var parentCard = wrap.closest('.scw-ws-card');
        if (parentCard) parentCard.style.zIndex = '10002';
        var parentTr = wrap.closest('tr');
        if (parentTr) parentTr.style.zIndex = '10002';

        var pop = buildPopover(recordId);
        wrap.appendChild(pop);
        _openPopover = pop;
      });

      wrap.appendChild(btn);

      // Insert after the delete wrapper
      $deleteWrap.after(wrap);

      // Inject cards into detail panel
      var $detail = $card.find('.scw-ws-detail');
      if (!$detail.length) return;

      // CR card (revise/add/remove)
      if (pending[recordId]) {
        $detail[0].appendChild(buildCard(recordId, pending[recordId]));
      }
      // Note card (per-row)
      var noteKey = 'note_' + recordId;
      if (pending[noteKey]) {
        $detail[0].appendChild(buildCard(noteKey, pending[noteKey]));
      }
    });

    // Also show global (non-row) note cards somewhere — in the action bar area
    // (handled by renderActionBar)
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
