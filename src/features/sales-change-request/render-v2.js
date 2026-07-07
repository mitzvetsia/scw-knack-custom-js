/*** SALES CHANGE REQUEST — WORKSHEET-V2 ADAPTER ***/
/**
 * Projects the sales change-request feature onto the worksheet-v2 cards
 * on view_3586. The v1 module's state, change detection (ajaxComplete
 * PUT intercept — v2 saves PUT to view_3586 URLs through $.ajax, so
 * detection already fires), modals, payload, and submit are reused
 * verbatim; only the surface differs:
 *
 *   - per-card CR action chip in the warn-slot (popover: Add Note /
 *     Request Removal / Clear — same options as v1's row button)
 *   - pending-CR cards + submitted-revision strips appended to the v2
 *     card's expanded detail panel (reuses ns._buildPendingCard so the
 *     cards are pixel-identical to v1's)
 *   - the sticky action bar (#scw-sales-cr-bar) is relocated into the
 *     v2 container so it sits under the v2 cards instead of the hidden
 *     v1 accordion
 *
 * Load order: AFTER worksheet-v2/* in build.sh — we subscribe to v2's
 * data layer, and our subscriber must run after v2's own renderView
 * subscriber so the cards exist when we inject.
 *
 * Reads : SCW.salesCR.* (v1 module), SCW.worksheetV2.data/card
 * Writes: nothing new on the namespace — wraps SCW.salesCR.refresh
 */
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.salesCR;
  if (!ns || !ns.CONFIG) return;

  var CFG = ns.CONFIG;
  var S   = ns._state;
  var H   = ns._h;
  var P   = CFG.prefix;

  var STYLE_ID = 'scw-sales-cr-v2-css';

  function v2Container() {
    return document.getElementById('scw-ws-v2-' + CFG.worksheetView);
  }

  function injectV2Styles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      /* CR action chip — lives in the warn-slot next to warning chips,
         so it adds no new flex item to the row (no layout shift). */
      '.' + P + '-v2-act {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  width: 22px; height: 22px; padding: 0;' +
      '  border-radius: 6px; border: 1.5px solid #cbd5e1;' +
      '  background: #f8fafc; color: #475569; cursor: pointer;' +
      '  flex: 0 0 auto;' +
      '}' +
      '.' + P + '-v2-act:hover { background: #e2e8f0; }' +
      '.' + P + '-v2-act--revise { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }' +
      '.' + P + '-v2-act--add    { border-color: #86efac; background: #f0fdf4; color: #15803d; }' +
      '.' + P + '-v2-act--remove { border-color: #fca5a5; background: #fef2f2; color: #b91c1c; }' +
      '.' + P + '-v2-act--note   { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }' +
      /* CR hamburger menu occupying the lock cell (kebab "CR" column)
         on locked rows. Replaces the lock icon; reads as interactive. */
      '.' + P + '-v2-lockmenu {' +
      '  cursor: pointer !important; color: #64748b !important;' +
      '  border-radius: 6px; transition: background .12s, color .12s;' +
      '}' +
      '.' + P + '-v2-lockmenu:hover { background: #e2e8f0 !important; color: #1e293b !important; }' +
      '.' + P + '-v2-lockmenu i.fa { font-size: 13px; line-height: 1; }' +
      '.' + P + '-v2-lockmenu--revise,' +
      '.' + P + '-v2-lockmenu--note   { color: #1d4ed8 !important; }' +
      '.' + P + '-v2-lockmenu--add    { color: #15803d !important; }' +
      '.' + P + '-v2-lockmenu--remove { color: #b91c1c !important; }' +
      /* Revision badge chip — same slot. */
      '.' + P + '-v2-rev {' +
      '  display: inline-flex; align-items: center; justify-content: center;' +
      '  min-width: 22px; height: 22px; padding: 0 4px;' +
      '  border-radius: 6px; border: 1.5px solid #c4b5fd;' +
      '  background: #f5f3ff; color: #6d28d9; cursor: help;' +
      '  font: 700 10px/1 system-ui, -apple-system, sans-serif;' +
      '  flex: 0 0 auto;' +
      '}' +
      /* Warn-slot needs to allow a small chip cluster. */
      '#scw-ws-v2-' + CFG.worksheetView + ' .scw-ws-v2-cell--warn {' +
      '  display: inline-flex; gap: 3px; align-items: center;' +
      '}';
    document.head.appendChild(s);
  }

  // ── Per-record helpers ────────────────────────────────────

  function rowActionState(recordId) {
    var pending = S.pending();
    var cr   = pending[recordId];
    var note = pending['note_' + recordId];
    if (cr) return { action: cr.action, hasNote: !!note };
    if (note) return { action: note.action || 'note', hasNote: true };
    return null;
  }

  /** "Add-only" rows are revision-phase items with no survey link —
   *  field_2586 == 0 — mirroring v1's deleteVisible heuristic. */
  function isAddOnly(recordId) {
    var base = S.baseline()[recordId];
    if (!base) return false;
    var n = parseFloat(base._addCount);
    return !isNaN(n) && n === 0;
  }

  // ── Popover (body portal, reuses v1's CSS classes) ─────────

  var _openPopover = null;
  var _popoverAnchor = null;

  function closePopover() {
    if (_openPopover) {
      _openPopover.remove();
      _openPopover = null;
      _popoverAnchor = null;
    }
  }

  $(document).on('click' + CFG.eventNs + 'V2Pop', function (e) {
    if (!_openPopover) return;
    if (_openPopover.contains(e.target)) return;
    if (_popoverAnchor && _popoverAnchor.contains(e.target)) return;
    closePopover();
  });
  $(window).on('scroll' + CFG.eventNs + 'V2Pop', function () {
    if (_openPopover) closePopover();
  });

  function buildPopover(recordId, addOnly) {
    var pop = H.el('div', P + '-popover');
    var pending = S.pending();
    var hasCR   = !!pending[recordId];
    var hasNote = !!pending['note_' + recordId];

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
      noteItem.appendChild(H.el('span', P + '-popover-icon', '✍'));
      noteItem.appendChild(document.createTextNode(hasNote ? 'Edit Note' : 'Add Note'));
      noteItem.addEventListener('click', function (e) {
        e.stopPropagation();
        closePopover();
        ns.openRowNote(recordId);
      });
      pop.appendChild(noteItem);

      if (!hasCR || pending[recordId].action !== 'remove') {
        var removeItem = H.el('div', P + '-popover-item ' + P + '-popover-item--remove');
        removeItem.appendChild(H.el('span', P + '-popover-icon', '−'));
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
      clearItem.appendChild(H.el('span', P + '-popover-icon', '×'));
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

  // ── Inject per-card chips + detail cards + revision strips ──

  function injectIntoCards(container) {
    var pending = S.pending();

    // Group submitted revisions by SOW line-item id once per pass.
    var revBySow = {};
    var revData = S.revisionData() || [];
    for (var r = 0; r < revData.length; r++) {
      if (!revData[r].sowItemId) continue;
      if (!revBySow[revData[r].sowItemId]) revBySow[revData[r].sowItemId] = [];
      revBySow[revData[r].sowItemId].push(revData[r]);
    }

    var cards = container.querySelectorAll('.scw-ws-v2-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var recordId = card.getAttribute('data-scw-ws-v2-record');
      if (!recordId) continue;

      // Idempotent: clear this card's previous injections.
      var olds = card.querySelectorAll(
        '.' + P + '-v2-act, .' + P + '-v2-rev, .' + P + '-card, .' + P + '-rev-strip'
      );
      for (var o = 0; o < olds.length; o++) olds[o].remove();

      var warnSlot = card.querySelector('.scw-ws-v2-cell--warn');
      var state = rowActionState(recordId);
      var addOnly = isAddOnly(recordId);

      // Icon + tooltip for a CR trigger given its pending state.
      function crIconHtml(st) {
        if (st) {
          var ic = st.action === 'add'    ? 'fa-plus'
                 : st.action === 'remove' ? 'fa-minus-circle'
                 : st.action === 'note'   ? 'fa-comment'
                 :                          'fa-pencil';
          return '<i class="fa ' + ic + '"></i>';
        }
        return '<i class="fa fa-bars"></i>';   // hamburger = open CR menu
      }
      function crTitle(st, locked) {
        if (st) {
          return st.action === 'remove' ? 'Removal requested — click to edit'
               : st.action === 'add'    ? 'Add request pending — click to edit'
               : st.action === 'note'   ? 'Note pending — click to edit'
               :                          'Change pending — click to edit';
        }
        return locked
          ? 'Locked (submitted for survey) — open change-request menu'
          : 'Change request actions';
      }
      // Bind a CR trigger element to open the popover (or jump straight
      // to the revise-note editor when a revise CR already exists).
      // onclick (not addEventListener) so re-injection on a salesCR-only
      // refresh — where the lock cell persists — never stacks handlers.
      function bindCrTrigger(anchor, rid, st, ao) {
        anchor.onclick = function (e) {
          e.stopPropagation();
          e.preventDefault();
          closePopover();
          if (st && st.action === 'revise') { ns.openEditReviseNote(rid); return; }
          var pop = buildPopover(rid, ao);
          positionPopover(pop, anchor);
          document.body.appendChild(pop);
          _openPopover = pop;
          _popoverAnchor = anchor;
        };
      }

      // 1. CR trigger. On locked rows the CR hamburger REPLACES the lock
      //    icon in the kebab ("CR") column — the lock state still reads
      //    from the greyed fields + detail banner. On non-locked
      //    (directly editable) rows the kebab holds the real delete
      //    button, so we only surface a CR chip in the warn slot when
      //    there's something pending or it's an add-mode row.
      var lockCell = card.querySelector('.scw-ws-v2-lock-cell');
      if (lockCell) {
        lockCell.classList.remove(
          P + '-v2-lockmenu--revise', P + '-v2-lockmenu--add',
          P + '-v2-lockmenu--remove', P + '-v2-lockmenu--note'
        );
        lockCell.classList.add(P + '-v2-lockmenu');
        if (state) lockCell.classList.add(P + '-v2-lockmenu--' + state.action);
        lockCell.innerHTML = crIconHtml(state);
        lockCell.title = crTitle(state, true);
        lockCell.setAttribute('role', 'button');
        lockCell.setAttribute('aria-label', 'Change request menu');
        bindCrTrigger(lockCell, recordId, state, addOnly);
      } else if (warnSlot && (state || addOnly)) {
        var btn = H.el('button', P + '-v2-act');
        btn.type = 'button';
        btn.innerHTML = crIconHtml(state);
        if (state) btn.classList.add(P + '-v2-act--' + state.action);
        btn.title = crTitle(state, false);
        bindCrTrigger(btn, recordId, state, addOnly);
        warnSlot.appendChild(btn);
        warnSlot.classList.remove('scw-ws-v2-cell--blank');
      }

      // 2. Revision badge chip + detail strips.
      var revs = revBySow[recordId];
      if (revs && revs.length && warnSlot) {
        var revBadge = H.el('span', P + '-v2-rev', 'R' + (revs.length > 1 ? revs.length : ''));
        revBadge.title = revs.length + ' submitted revision' +
          (revs.length === 1 ? '' : 's') + ' — expand the row to view';
        warnSlot.appendChild(revBadge);
      }

      var detail = card.querySelector('.scw-ws-v2-detail');
      if (!detail) continue;

      // 3. Pending-CR cards in the detail panel (identical builder to v1).
      if (typeof ns._buildPendingCard === 'function') {
        if (pending[recordId]) {
          detail.appendChild(ns._buildPendingCard(recordId, pending[recordId]));
        }
        if (pending['note_' + recordId]) {
          detail.appendChild(ns._buildPendingCard('note_' + recordId, pending['note_' + recordId]));
        }
      }

      // 4. Submitted-revision strips (same markup as v1's injectRevisions).
      if (revs && revs.length) {
        for (var v = 0; v < revs.length; v++) {
          var rev = revs[v];
          var strip = H.el('div', P + '-rev-strip');
          strip.appendChild(H.el('div', P + '-rev-strip-header',
            'Submitted Revision' + (rev.status ? ' — ' + rev.status : '')));
          if (rev.html) {
            var htmlWrap = H.el('div', P + '-rev-html-card');
            htmlWrap.innerHTML = rev.html;
            strip.appendChild(htmlWrap);
          } else if (rev.json) {
            var jsonWrap = H.el('div');
            var fields = rev.json.fields || [];
            for (var fi = 0; fi < fields.length; fi++) {
              var fld = fields[fi];
              var row = H.el('div', P + '-card-field');
              row.appendChild(H.el('span', P + '-card-label', (fld.label || fld.field) + ':'));
              if (fld.from != null) {
                row.appendChild(H.el('span', P + '-card-from', String(fld.from)));
                row.appendChild(H.el('span', P + '-card-arrow', '→'));
              }
              row.appendChild(H.el('span', P + '-card-to', String(fld.to)));
              jsonWrap.appendChild(row);
            }
            if (rev.json.changeNotes) {
              jsonWrap.appendChild(H.el('div', P + '-card-notes',
                '“' + rev.json.changeNotes + '”'));
            }
            strip.appendChild(jsonWrap);
          }
          detail.appendChild(strip);
        }
      }
    }
  }

  // ── Action bar relocation ────────────────────────────────
  // v1's renderActionBar (called inside ns.refresh, which runs before
  // us) creates/updates #scw-sales-cr-bar inside the v1 accordion. We
  // just move the finished node under the v2 container — listeners and
  // the expandable changes panel come with it. Mounted at the TOP of the
  // worksheet builder (before .scw-ws-v2-body, so the v2 toolbar stays
  // first) — matching renderActionBar's own v2 placement so the two
  // mount paths can't fight over position.

  function relocateBar(container) {
    var bar = document.getElementById(CFG.barId);
    if (!bar) {
      // Bar not built yet (first pass before any refresh) — build it.
      if (typeof ns.renderActionBar === 'function') ns.renderActionBar();
      bar = document.getElementById(CFG.barId);
    }
    if (!bar) return;
    var v2body = container.querySelector('.scw-ws-v2-body');
    var anchor = (v2body && v2body.parentNode === container)
      ? v2body : container.firstChild;
    if (bar.parentNode !== container || bar.nextSibling !== anchor) {
      container.insertBefore(bar, anchor);
    }
  }

  // ── Main render pass ─────────────────────────────────────

  var _renderTimer = null;

  function renderV2() {
    if (!S.onPage()) return;
    var container = v2Container();
    if (!container) return;
    injectV2Styles();
    injectIntoCards(container);
    relocateBar(container);
  }

  function scheduleRenderV2() {
    if (_renderTimer) clearTimeout(_renderTimer);
    // v2's own renderView subscriber rebuilds the cards on the same
    // notify tick (it subscribed first — module load order). The
    // timeout pushes our injection after any same-tick DOM churn.
    _renderTimer = setTimeout(function () {
      _renderTimer = null;
      renderV2();
    }, 120);
  }

  // ── Wiring ───────────────────────────────────────────────

  // 1. Every salesCR refresh (pending-state mutations, modal saves,
  //    submits, rehydration) also re-projects onto v2.
  if (typeof ns.refresh === 'function') {
    var origRefresh = ns.refresh;
    ns.refresh = function () {
      origRefresh();
      scheduleRenderV2();
    };
  }

  // 2. Every v2 re-render (cell edits, model refetches, mode flips)
  //    re-injects — v2 rebuilds card DOM from scratch each time.
  if (window.SCW.worksheetV2 && SCW.worksheetV2.data &&
      typeof SCW.worksheetV2.data.subscribe === 'function') {
    SCW.worksheetV2.data.subscribe(CFG.worksheetView, scheduleRenderV2);
  }

  // 3. Belt-and-braces: view render of the source view (covers the
  //    initial paint where init.js's refresh may fire before the v2
  //    mount exists).
  if (window.SCW && typeof SCW.onViewRender === 'function') {
    SCW.onViewRender(CFG.worksheetView, function () {
      setTimeout(scheduleRenderV2, CFG.uiDelay + 200);
    }, CFG.eventNs + 'V2');

    // 4. Late activation: when the module turns on via an addMode view
    //    rendering AFTER the worksheet (init.js's onAddModeViewRender
    //    re-check, which calls its LOCAL refresh — not the wrapped
    //    ns.refresh), nothing v2-side repaints. Listen to those views
    //    too, delayed past init's own 300ms re-check.
    (CFG.addModeViews || [CFG.proposalView]).forEach(function (vid) {
      SCW.onViewRender(vid, function () {
        setTimeout(scheduleRenderV2, 600);
      }, CFG.eventNs + 'V2');
    });
  }

  if (CFG.debug) SCW.debug('[SalesCR] worksheet-v2 adapter loaded');
})();
/*** END SALES CHANGE REQUEST — WORKSHEET-V2 ADAPTER ***/
