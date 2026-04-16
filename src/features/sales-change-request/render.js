/*** SALES CHANGE REQUEST — RENDER ***/
/**
 * Injects pending-CR badges and cards onto worksheet rows, per-row
 * action buttons into detail panels, and the floating action bar.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, ._h, .pendingCount,
 *         .openNote, .openRemove, .submit, .saveDraft
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

  // ═══════════════════════════════════════════════════════════
  //  BUILD PENDING-CR CARD (for detail panel)
  // ═══════════════════════════════════════════════════════════

  function buildCard(pendingKey, item) {
    var action = item.action || 'revise';
    var card = H.el('div', P + '-card ' + P + '-card--' + action);

    var headerText = action === 'add'    ? 'PENDING ADD'
                   : action === 'remove' ? 'PENDING REMOVAL'
                   : action === 'note'   ? 'NOTE'
                   :                       'PENDING CHANGE';
    card.appendChild(H.el('div', P + '-card-header', headerText));

    // Dismiss
    var dismiss = H.el('button', P + '-card-dismiss', '\u00d7');
    dismiss.title = 'Remove';
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

    // Revise / Add — show field diffs
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
  //  INJECT BADGES + CARDS ONTO WORKSHEET ROWS
  // ═══════════════════════════════════════════════════════════

  function injectBadgesAndCards() {
    var $view = $('#' + CFG.worksheetView);
    if (!$view.length) return;

    // Clean previous injections
    $view.find('.' + P + '-badge').remove();
    $view.find('.' + P + '-card').remove();
    $view.find('.' + P + '-row-actions').remove();

    var pending = S.pending();
    var ids = Object.keys(pending);

    for (var i = 0; i < ids.length; i++) {
      var key  = ids[i];
      var item = pending[key];
      if (!item.rowId) continue; // skip freeform notes

      var $row = $view.find('tr#' + item.rowId);
      if (!$row.length) continue;

      var $card = $row.find('.scw-ws-card');
      if (!$card.length) $card = $row;

      // Badge on summary row
      var $summary = $card.find('.scw-ws-summary-row');
      if (!$summary.length) $summary = $card.find('.scw-ws-summary');
      if ($summary.length) {
        var badgeText = item.action === 'add'    ? 'ADD'
                      : item.action === 'remove' ? 'REMOVE'
                      :                            'CHANGE';
        $summary[0].appendChild(
          H.el('span', P + '-badge ' + P + '-badge--' + item.action, badgeText)
        );
      }

      // Card in detail panel
      var $detail = $card.find('.scw-ws-detail');
      if ($detail.length) {
        $detail[0].appendChild(buildCard(key, item));
      }
    }

    // Per-row action buttons
    injectRowActions($view);
  }

  function injectRowActions($view) {
    $view.find('tr[id]').each(function () {
      var $tr = $(this);
      var recordId = $tr.attr('id');
      if (!recordId || recordId.indexOf('kn-') === 0) return;

      var $card   = $tr.find('.scw-ws-card');
      if (!$card.length) return;
      var $detail = $card.find('.scw-ws-detail');
      if (!$detail.length) return;
      if ($detail.find('.' + P + '-row-actions').length) return;

      var actions = H.el('div', P + '-row-actions');

      var removeBtn = H.el('button', P + '-row-btn ' + P + '-row-btn--remove', 'Request Removal');
      removeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        ns.openRemove(recordId);
      });
      actions.appendChild(removeBtn);

      $detail[0].appendChild(actions);
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

    // Add Note
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
    injectBadgesAndCards();
    renderActionBar();
  }

  // ── Public API ──
  ns.renderUI       = renderUI;
  ns.renderActionBar = renderActionBar;

})();
