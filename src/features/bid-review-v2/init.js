/*** BID REVIEW V2 — INIT *****************************************************
 *
 * Mounts the v2 panel beneath v1's bid-review grid on scene_1155.
 * Subscribes to Knack render events for every source view so the panel
 * re-renders whenever any underlying data changes.
 *
 * Mount sequence:
 *   1. On scene render, look for v1's #bid-review-matrix. If present,
 *      insert v2's panel as its next sibling.
 *   2. If v1 hasn't mounted yet (race), fall back to the gridAnchorView
 *      (#view_3970) so v2 still appears on the page. The next render
 *      will move it next to v1 once v1 mounts.
 *   3. Idempotent — re-running tryMount on subsequent renders is a no-op
 *      thanks to the container-id guard.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns || !ns.CONFIG || !ns.CONFIG.enabled) return;
  if (!ns.CONFIG.fieldKeys) {
    // v1 config never loaded — bid-review/config.js not on this scene.
    // Bail silently. v2 is scoped to scene_1155 where v1 lives.
    return;
  }

  function buildPanel() {
    var panel = document.createElement('div');
    panel.id = ns.CONFIG.mountId;
    panel.className = 'scw-bid-review-v2';

    var banner = document.createElement('div');
    banner.className = 'scw-bid-review-v2-banner';
    banner.innerHTML =
      '<span class="scw-bid-review-v2-pill">v2 preview</span>' +
      '<span>' + ns.CONFIG.bannerLabel + '</span>' +
      '<span class="scw-bid-review-v2-count">0 records</span>';
    panel.appendChild(banner);

    var body = document.createElement('div');
    body.className = 'scw-bid-review-v2-body';
    body.innerHTML = '<div class="scw-bid-review-v2-empty">' +
      'Waiting for source views to load…</div>';
    panel.appendChild(body);

    return panel;
  }

  function tryMount() {
    if (document.getElementById(ns.CONFIG.mountId)) return;
    var anchor = document.querySelector(ns.CONFIG.mountAfterSelector);
    if (!anchor) {
      anchor = document.querySelector(ns.CONFIG.mountFallbackSelector);
    }
    if (!anchor) return;
    var panel = buildPanel();
    anchor.insertAdjacentElement('afterend', panel);

    if (ns.CONFIG.replaceV1) {
      document.documentElement.setAttribute('data-scw-bid-review-v2-replace', '1');
    }

    // Initial paint — v1 may have already loaded the records.
    if (ns.data && ns.render) {
      ns.render.renderSnapshot(ns.data.readAll());
      mountBulk();
    }
    if (ns.toolbar && typeof ns.toolbar.mount === 'function') ns.toolbar.mount();
  }

  // Wire the shared worksheet-v2 bulk module to the comparison grid. The
  // grid rows carry data-scw-ws-v2-select checkboxes keyed on the SOW
  // line-item id; bulk reads/writes those records via the SOW source
  // view (view_3921). Idempotent — mount re-syncs checkbox state after
  // each grid re-render.
  function mountBulk() {
    var bulk = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.bulk;
    var sowView = (ns.CONFIG.sourceViewKeys || [])[1];
    if (bulk && typeof bulk.mount === 'function' && sowView) {
      bulk.mount(sowView);
    }
  }

  // Delegated click handler for L1 group header rows — toggles the
  // --collapsed modifier on the <tr> and hides all sibling rows that
  // belong to the same group until the next group header.

  // ── Group/subgroup collapse state — persisted + re-applied ─────────
  // The grid rebuilds body.innerHTML on every data tick (refetches fire
  // after deletes, add-to-SOW, cascades…), so DOM-only collapse state
  // evaporated on each rebuild and closed groups kept reopening. Persist
  // per scene → { '<sowId>::<l1Id>': 'closed'|'open',
  //               '<sowId>::sub::<subKey>': 'closed'|'open' } and re-apply
  // after every render (render.js calls ns.applyGroupCollapse).
  function grpStateKey() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return 'scw:br-v2:grp-collapse:' + (m ? m[0] : 'default');
  }
  function loadGrpState() {
    try { return JSON.parse(localStorage.getItem(grpStateKey()) || '{}'); }
    catch (e) { return {}; }
  }
  function saveGrpState(s) {
    try { localStorage.setItem(grpStateKey(), JSON.stringify(s)); }
    catch (e) { /* quota / private mode — silent */ }
  }
  function rememberL1(sowId, l1Id, collapsed) {
    if (!sowId || !l1Id) return;
    var s = loadGrpState();
    s[sowId + '::' + l1Id] = collapsed ? 'closed' : 'open';
    saveGrpState(s);
  }
  function rememberSub(sowId, subKey, collapsed) {
    if (!sowId || !subKey) return;
    var s = loadGrpState();
    s[sowId + '::sub::' + subKey] = collapsed ? 'closed' : 'open';
    saveGrpState(s);
  }
  function sowIdOf(el) {
    var sec = el && el.closest && el.closest('.scw-bid-review-v2__sow');
    return (sec && sec.getAttribute('data-sow-id')) || '';
  }

  // The collapse walkers — single source of truth, used by the click
  // handlers AND the post-render re-apply.
  function setL1Collapsed(head, collapsed) {
    head.classList.toggle('scw-bid-review-v2__group-header--collapsed', collapsed);
    head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    var n = head.nextElementSibling;
    // Track whether the rows we're walking sit inside a collapsed
    // subgroup — expanding the L1 must NOT reveal rows the user has
    // folded at the subgroup level.
    var subCollapsed = false;
    while (n && !n.classList.contains('scw-bid-review-v2__group-header')) {
      if (n.classList.contains('scw-bid-review-v2__subgroup-header')) {
        n.classList.toggle('scw-bid-review-v2__row--hidden', collapsed);
        n.classList.toggle('scw-bid-review-v2__subgroup-header--hidden', collapsed);
        subCollapsed = n.classList.contains('scw-bid-review-v2__subgroup-header--collapsed');
      } else if (n.classList.contains('scw-bid-review-v2__row') ||
                 n.classList.contains('scw-bid-review-v2__expand-row')) {
        var inSub = n.classList.contains('scw-bid-review-v2__row--in-subgroup');
        n.classList.toggle('scw-bid-review-v2__row--hidden',
          collapsed || (inSub && subCollapsed));
      }
      n = n.nextElementSibling;
    }
  }
  function setSubCollapsed(sub, collapsed) {
    sub.classList.toggle('scw-bid-review-v2__subgroup-header--collapsed', collapsed);
    sub.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    var n = sub.nextElementSibling;
    while (n &&
           !n.classList.contains('scw-bid-review-v2__subgroup-header') &&
           !n.classList.contains('scw-bid-review-v2__group-header')) {
      if (n.classList.contains('scw-bid-review-v2__row') ||
          n.classList.contains('scw-bid-review-v2__expand-row')) {
        n.classList.toggle('scw-bid-review-v2__row--hidden', collapsed);
      }
      n = n.nextElementSibling;
    }
  }

  /** Re-apply persisted group/subgroup collapse state to a freshly built
   *  grid. Subgroups first, then L1s — the L1 walker reads each subgroup's
   *  own --collapsed flag so an open L1 keeps user-folded subgroups folded. */
  function applyGroupCollapse(root) {
    var s = loadGrpState();
    if (!Object.keys(s).length) return;
    var sections = (root || document).querySelectorAll('.scw-bid-review-v2__sow');
    for (var i = 0; i < sections.length; i++) {
      var sowId = sections[i].getAttribute('data-sow-id') || '';
      var subs = sections[i].querySelectorAll('.scw-bid-review-v2__subgroup-header');
      for (var b = 0; b < subs.length; b++) {
        var sk = s[sowId + '::sub::' + (subs[b].getAttribute('data-subgroup-key') || '')];
        if (sk) setSubCollapsed(subs[b], sk === 'closed');
      }
      var heads = sections[i].querySelectorAll('.scw-bid-review-v2__group-header');
      for (var h = 0; h < heads.length; h++) {
        var gk = s[sowId + '::' + (heads[h].getAttribute('data-l1-id') || '')];
        if (gk) setL1Collapsed(heads[h], gk === 'closed');
      }
    }
  }
  ns.applyGroupCollapse = applyGroupCollapse;

  /** Are every SOW's MDF/IDF groups currently open? Mirrors worksheet-v2's
   *  "honest label" rule — the toolbar button always says what the NEXT
   *  click will do. No groups on the page ⇒ treated as "not all open" so
   *  the button defaults to "Expand". */
  function allGroupsOpen() {
    var heads = document.querySelectorAll('.scw-bid-review-v2__group-header');
    if (!heads.length) return false;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].classList.contains('scw-bid-review-v2__group-header--collapsed')) return false;
    }
    return true;
  }
  ns.allGroupsOpen = allGroupsOpen;

  /** Global "Expand/Collapse MDF/IDFs" — same walk as the per-SOW toggle
   *  (data-scw-br-v2-sow-groups) but applied to EVERY SOW section, and it
   *  keeps each SOW's own toggle button label in sync so the two controls
   *  never disagree. Used by the top toolbar's groups-toggle button. */
  function toggleAllGroups(collapse) {
    var sections = document.querySelectorAll('.scw-bid-review-v2__sow');
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var sowId = section.getAttribute('data-sow-id') || '';
      var subs = section.querySelectorAll('.scw-bid-review-v2__subgroup-header');
      for (var sb = 0; sb < subs.length; sb++) {
        subs[sb].classList.toggle('scw-bid-review-v2__subgroup-header--collapsed', collapse);
        subs[sb].setAttribute('aria-expanded', collapse ? 'false' : 'true');
        rememberSub(sowId, subs[sb].getAttribute('data-subgroup-key') || '', collapse);
      }
      var heads = section.querySelectorAll('.scw-bid-review-v2__group-header');
      for (var h = 0; h < heads.length; h++) {
        setL1Collapsed(heads[h], collapse);
        rememberL1(sowId, heads[h].getAttribute('data-l1-id') || '', collapse);
      }
      var sowToggle = section.querySelector('[data-scw-br-v2-sow-groups]');
      if (sowToggle) sowToggle.textContent = collapse ? 'Expand all' : 'Collapse all';
    }
  }
  ns.toggleAllGroups = toggleAllGroups;

  function wireGroupCollapse() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-collapse-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-collapse-bound', '1');

    // SOW-section collapse: clicking the SOW header folds the whole
    // section (header stays, table hides). State persists per SOW.
    function sowCollapseKey(sowId) {
      var m = (document.body.id || '').match(/scene_\d+/);
      return 'scw:br-v2:sow-collapse:' + (m ? m[0] : 'default') + ':' + sowId;
    }
    document.addEventListener('click', function (e) {
      var sowHead = e.target.closest && e.target.closest('.scw-bid-review-v2__sow-header');
      if (!sowHead) return;
      if (e.target.closest('input, button, select, textarea, a')) return;
      var section = sowHead.closest('.scw-bid-review-v2__sow');
      if (!section) return;
      var collapsed = section.classList.toggle('scw-bid-review-v2__sow--collapsed');
      sowHead.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      try {
        if (collapsed) localStorage.setItem(sowCollapseKey(section.getAttribute('data-sow-id')), '1');
        else localStorage.removeItem(sowCollapseKey(section.getAttribute('data-sow-id')));
      } catch (err) { /* ignore */ }
    });
    // Keyboard toggle for the SOW header (Enter / Space).
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var sowHead = e.target.closest && e.target.closest('.scw-bid-review-v2__sow-header');
      if (!sowHead || e.target !== sowHead) return;
      e.preventDefault();
      sowHead.click();
    });

    // Per-SOW "Expand all / Collapse all" — folds/unfolds every MDF/IDF
    // group within ONE SOW. The button's own label is the state so it always
    // says what the next click will do.
    document.addEventListener('click', function (e) {
      var tgl = e.target.closest && e.target.closest('[data-scw-br-v2-sow-groups]');
      if (!tgl) return;
      e.preventDefault();
      e.stopPropagation();
      var section = tgl.closest('.scw-bid-review-v2__sow');
      if (!section) return;
      var collapse = (tgl.textContent || '').trim().toLowerCase().indexOf('collapse') === 0;
      var sowId = section.getAttribute('data-sow-id') || '';
      // Expand-all opens subgroups too; collapse-all folds them. Set the
      // subgroups' own --collapsed flags FIRST so the L1 walker (which reads
      // them when expanding) reveals the right rows — then persist both
      // levels so the choice survives rebuilds.
      var subs = section.querySelectorAll('.scw-bid-review-v2__subgroup-header');
      for (var sb = 0; sb < subs.length; sb++) {
        subs[sb].classList.toggle('scw-bid-review-v2__subgroup-header--collapsed', collapse);
        subs[sb].setAttribute('aria-expanded', collapse ? 'false' : 'true');
        rememberSub(sowId, subs[sb].getAttribute('data-subgroup-key') || '', collapse);
      }
      var heads = section.querySelectorAll('.scw-bid-review-v2__group-header');
      for (var h = 0; h < heads.length; h++) {
        setL1Collapsed(heads[h], collapse);
        rememberL1(sowId, heads[h].getAttribute('data-l1-id') || '', collapse);
      }
      tgl.textContent = collapse ? 'Expand all' : 'Collapse all';
    });

    // Per-subgroup toggle (e.g. the "Removed" subgroup inside an L1).
    // Folds only its own rows, independent of the parent L1.
    document.addEventListener('click', function (e) {
      var sub = e.target.closest && e.target.closest('.scw-bid-review-v2__subgroup-header');
      if (!sub) return;
      if (e.target.closest('input, button, select, textarea, a')) return;
      var collapsed = !sub.classList.contains('scw-bid-review-v2__subgroup-header--collapsed');
      setSubCollapsed(sub, collapsed);
      rememberSub(sowIdOf(sub), sub.getAttribute('data-subgroup-key') || '', collapsed);
    });

    document.addEventListener('click', function (e) {
      var head = e.target.closest && e.target.closest('.scw-bid-review-v2__group-header');
      if (!head) return;
      // Don't intercept clicks on inputs / buttons inside the header.
      if (e.target.closest('input, button, select, textarea, a')) return;
      var collapsed = !head.classList.contains('scw-bid-review-v2__group-header--collapsed');
      setL1Collapsed(head, collapsed);
      rememberL1(sowIdOf(head), head.getAttribute('data-l1-id') || '', collapsed);
    });

    // Diff hover-link: hovering a differing field in a bid cell
    // temporarily highlights the matching field in this row's SOW cell.
    function hoverField(e, on) {
      var f = e.target.closest && e.target.closest('[data-scw-diff-field]');
      if (!f) return;
      var tr = f.closest('tr');
      if (!tr) return;
      var type = f.getAttribute('data-scw-diff-field');
      var target = tr.querySelector(
        '.scw-bid-review-v2__sow-cell [data-scw-sow-field="' + type + '"]');
      if (target) target.classList.toggle('scw-bid-review-v2__sow-field-hl', on);
    }
    document.addEventListener('mouseover', function (e) { hoverField(e, true); });
    document.addEventListener('mouseout',  function (e) { hoverField(e, false); });
  }

  // ── Revise dropdown (v1 parity) ──────────────────────────────────
  // The menu is positioned FIXED at the trigger's coordinates so the SOW
  // card's overflow:hidden can't clip it (v1's grid has no such clip).
  function closeReviseMenus() {
    var open = document.querySelectorAll('.scw-bid-review-v2__overflow--open');
    for (var i = 0; i < open.length; i++) {
      open[i].classList.remove('scw-bid-review-v2__overflow--open');
      var m = open[i].querySelector('.scw-bid-review-v2__overflow-menu');
      if (m) { m.style.cssText = ''; }
    }
  }
  function openReviseMenu(ov, trigger) {
    var menu = ov.querySelector('.scw-bid-review-v2__overflow-menu');
    if (!menu) return;
    ov.classList.add('scw-bid-review-v2__overflow--open');
    var r = trigger.getBoundingClientRect();
    var width = 160;
    var left = Math.min(r.left, window.innerWidth - width - 8);
    menu.style.cssText =
      'display:block;position:fixed;z-index:99999;' +
      'top:' + (r.bottom + 2) + 'px;left:' + Math.max(8, left) + 'px;' +
      'width:' + width + 'px;';
  }

  // Unique SOW line-item ids of the currently-checked grid rows. Selection
  // is the worksheet-v2 row checkboxes the comparison grid reuses.
  function getSelectedSowItemIds() {
    var nodes = document.querySelectorAll('.scw-br-v2-rowselect:checked');
    var seen = Object.create(null), out = [];
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-scw-ws-v2-select');
      if (id && !seen[id]) { seen[id] = true; out.push(id); }
    }
    return out;
  }

  // Open the bulk-CR modal for one bid column against the selected rows.
  // Requires a selection (per design) — nudge the user if none.
  function openBulkCr(button) {
    var v1 = window.SCW.bidReview;
    var ids = getSelectedSowItemIds();
    if (!ids.length) {
      if (v1 && v1.renderToast) v1.renderToast('Select one or more line items first', 'info');
      else alert('Select one or more line items first.');
      return;
    }
    if (!ns.bulkCr || typeof ns.bulkCr.open !== 'function') return;
    ns.bulkCr.open({
      pkgId:      button.getAttribute('data-pkg-id') || button.getAttribute('data-package-id'),
      pkgName:    button.getAttribute('data-pkg-name') || '',
      sowItemIds: ids
    });
  }

  // Delegated clicks for everything that routes into v1's handlers:
  //   • header action buttons (Update SOW / Create SOW / Reopen Bid)
  //   • header CR controls (Submit Change Request / Clear All)
  //   • cell CR buttons (Revise / Remove / + Add to bid)
  //   • pending CR summary cards (click to edit)
  // v1 renders on the same scene so its _state + CR pending are live.
  function wireHeaderActions() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-actions-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-actions-bound', '1');

    document.addEventListener('click', function (e) {
      var v1 = window.SCW.bidReview;
      if (!v1 || !e.target.closest) return;

      // Revise dropdown trigger — toggle its menu open/closed (v1 parity).
      // The trigger carries no data-action so it never dispatches a CR. The
      // menu is positioned FIXED at the trigger so the SOW card's
      // overflow:hidden can't clip it.
      var ovTrigger = e.target.closest('.scw-bid-review-v2__overflow-trigger');
      if (ovTrigger) {
        e.preventDefault(); e.stopPropagation();
        var ov = ovTrigger.closest('.scw-bid-review-v2__overflow');
        var wasOpen = ov && ov.classList.contains('scw-bid-review-v2__overflow--open');
        closeReviseMenus();
        if (ov && !wasOpen) openReviseMenu(ov, ovTrigger);
        return;
      }
      // Any other click closes open Revise menus before proceeding. A menu
      // item is still in the DOM, so its dispatch below still resolves.
      closeReviseMenus();

      // Bulk Change Request on the selected line items (one bid column).
      var bulkCrBtn = e.target.closest('[data-action="cr_bulk_selected"]');
      if (bulkCrBtn) {
        e.preventDefault(); e.stopPropagation();
        openBulkCr(bulkCrBtn);
        return;
      }

      // Project-docs controls (link / unlink / filter chip / "other docs"
      // expand toggle). v1 renders these inside the SOW status bar v2 injects
      // into its header, but v1's listener is bound to v1's grid mount so it
      // never sees them on the v2 page. Route to v1's docs dispatcher.
      var docsBtn = e.target.closest('.scw-bid-review__docs-other-toggle[data-action]')
        || e.target.closest('.scw-bid-review__docs-link-btn[data-action]')
        || e.target.closest('.scw-bid-review__docs-unlink-btn[data-action]')
        || e.target.closest('.scw-bid-review__docs-chip[data-action]');
      if (docsBtn) {
        e.preventDefault(); e.stopPropagation();
        if (v1.dispatchDocsAction) v1.dispatchDocsAction(docsBtn);
        return;
      }

      // Margin-recovery buttons (Add PM & Mobilization / Increase project
      // margin) — same story as the docs controls: v1 renders them inside the
      // SOW status bar v2 injects into its header, so v1's mount-bound
      // listener never sees the click here. Route to v1's margin dispatcher.
      var marginBtn = e.target.closest('.scw-ops-margin-warning__btn[data-action]');
      if (marginBtn) {
        e.preventDefault(); e.stopPropagation();
        if (v1.dispatchMarginAction) v1.dispatchMarginAction(marginBtn);
        return;
      }

      // Header buttons — package_* go to dispatchHeaderAction, cr_* fall
      // through to dispatchCRAction.
      var headBtn = e.target.closest('.scw-bid-review-v2__head-btn[data-action]');
      if (headBtn) {
        e.preventDefault(); e.stopPropagation();
        var handled = v1.dispatchHeaderAction && v1.dispatchHeaderAction(headBtn);
        if (!handled && v1.dispatchCRAction) v1.dispatchCRAction(headBtn);
        return;
      }

      // Cell CR buttons (Revise / Remove / + Add to bid).
      var cellBtn = e.target.closest('.scw-bid-review-v2__cell-action[data-action]');
      if (cellBtn) {
        e.preventDefault(); e.stopPropagation();
        if (v1.dispatchCRAction) v1.dispatchCRAction(cellBtn);
        return;
      }

      // Pending CR card — click re-opens the edit modal.
      var crCard = e.target.closest('.scw-bid-cr-card[data-action]');
      if (crCard) {
        e.preventDefault(); e.stopPropagation();
        // The "×" dismiss lives INSIDE the card; the card carries data-action
        // so a click anywhere on it would re-open the editor. Intercept the
        // dismiss and REMOVE the pending item instead of opening it.
        if (e.target.closest('.scw-bid-cr-card__dismiss')) {
          var dPkg = crCard.getAttribute('data-package-id');
          var dRow = crCard.getAttribute('data-row-id');
          var crApi = v1.changeRequests;
          if (crApi && typeof crApi.dismissPendingItem === 'function' && dPkg && dRow) {
            crApi.dismissPendingItem(dPkg, dRow);
          }
          return;
        }
        if (v1.dispatchCRAction) v1.dispatchCRAction(crCard);
        return;
      }
    });

    // SOW metric inputs (survey costs / SOW name / proposal expiration)
    // live inside the v1 status bar v2 injects into the SOW header cell —
    // route their change events to v1's save handlers. Capture phase to
    // match v1's own listener.
    document.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || !input.matches) return;
      if (!input.closest('.scw-bid-review-v2__head--sow')) return;
      var v1 = window.SCW.bidReview;
      if (v1 && typeof v1.dispatchMetricChange === 'function') {
        v1.dispatchMetricChange(input);
      }
    }, true);

    // A fixed-positioned Revise menu doesn't follow scroll/resize — close it.
    window.addEventListener('scroll', closeReviseMenus, true);
    window.addEventListener('resize', closeReviseMenus);
  }

  // Delegated click on an expandable data row — toggle an expand <tr>
  // beneath it that mounts worksheet-v2's card for the matching SOW
  // item record. Reuses the same edit pipeline used on the build-SOW
  // page so the experience is identical (chips, picker, photos,
  // accessories, direct PUTs).
  function wireRowExpand() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-rowexpand-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-rowexpand-bound', '1');

    document.addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('.scw-bid-review-v2__row--expandable');
      if (!row) return;
      // Don't intercept clicks on interactive elements inside the row.
      if (e.target.closest('input, button, select, textarea, a')) return;
      // Don't intercept clicks on the L1 group header (handled separately).
      if (e.target.closest('.scw-bid-review-v2__group-header')) return;
      toggleRowExpand(row);
    });
  }

  // The data row is hidden while expanded, so collapse is driven from
  // the panel header / × button instead of a click on the row.
  function wirePanelClose() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-panelclose-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-panelclose-bound', '1');
    document.addEventListener('click', function (e) {
      var hdr = e.target.closest && e.target.closest('.scw-bid-review-v2__panel-header');
      if (!hdr) return;
      // Don't collapse when the click is the bulk-select checkbox.
      if (e.target.closest('input, .scw-br-v2-rowselect')) return;
      var expandRow = hdr.closest('.scw-bid-review-v2__expand-row');
      if (!expandRow) return;
      var dataRow = expandRow.previousElementSibling;
      if (dataRow && dataRow.classList.contains('scw-bid-review-v2__row')) {
        toggleRowExpand(dataRow);
      }
    });
  }

  function toggleRowExpand(row) {
    var next = row.nextElementSibling;
    var isOpen = next && next.classList &&
      next.classList.contains('scw-bid-review-v2__expand-row');
    if (isOpen) {
      // Commit any in-progress edit inside the panel BEFORE removing it —
      // otherwise tearing down the inputs drops a typed-but-uncommitted value
      // (edit.js commits on blur, so force the blur first).
      var active = document.activeElement;
      if (active && next.contains(active) && typeof active.blur === 'function') {
        active.blur();
      }
      next.parentNode.removeChild(next);
      row.setAttribute('aria-expanded', 'false');
      row.classList.remove('scw-bid-review-v2__row--open');
      var closedId = row.getAttribute('data-sow-item-id') ||
                     row.getAttribute('data-row-id');
      if (closedId && ns.state) ns.state.setRowExpanded(closedId, false);
      syncToolbarRowLabel();
      return;
    }
    // Rows whose bid item points at NO SOW item still open (that's where
    // the Re-link button lives) — the panel just skips the SOW editor.
    var sowItemId = row.getAttribute('data-sow-item-id');
    var stateKey  = sowItemId || row.getAttribute('data-row-id');
    if (!stateKey) return;
    var sowRec = sowItemId ? lookupSowRecord(sowItemId) : null;
    if (sowItemId && !sowRec) {
      console.warn('[scw-br-v2] SOW item not found in model:', sowItemId);
    }

    var expand = document.createElement('tr');
    expand.className = 'scw-bid-review-v2__expand-row';
    expand.setAttribute('data-expand-for', stateKey);
    var td = document.createElement('td');
    td.colSpan = row.children.length;
    td.className = 'scw-bid-review-v2__expand-cell';

    // Panel layout. The data row is hidden while open (CSS keyed on
    // aria-expanded) so the SOW/bid data isn't shown twice — a compact
    // header built from the leftmost column stands in for it (v1 parity).
    //   header
    //   [photo viewer | worksheet-v2 SOW editor]   ← top flex
    //   bid details strip                          ← full-width, below
    // Bids live on their own full-width row so they never compete with
    // the (wide) worksheet editor for horizontal space.
    var panel = document.createElement('div');
    panel.className = 'scw-bid-review-v2__panel';
    panel.appendChild(buildExpandHeader(row));

    var flex = document.createElement('div');
    flex.className = 'scw-bid-review-v2__expand-flex';
    var photoCol = document.createElement('div');
    photoCol.className = 'scw-bid-review-v2__panel-col--photo';
    var cardCol = document.createElement('div');
    cardCol.className = 'scw-bid-review-v2__panel-col--card';
    flex.appendChild(photoCol);
    flex.appendChild(cardCol);
    flex.appendChild(buildBidDetailsColumn(row));
    panel.appendChild(flex);
    td.appendChild(panel);

    expand.appendChild(td);
    row.parentNode.insertBefore(expand, row.nextSibling);
    row.classList.add('scw-bid-review-v2__row--open');
    row.setAttribute('aria-expanded', 'true');
    // Remember this row is open so a post-edit/-delete grid rebuild can
    // re-open it (render.js → reopenExpandedRows) instead of collapsing it.
    if (ns.state) ns.state.setRowExpanded(stateKey, true);

    if (sowRec) {
      mountWorksheetV2Card(cardCol, sowRec);
    }
    // No SOW record → leave the editor column empty. The old "use Re-link"
    // instruction read as a to-do in contexts where re-linking is NOT the
    // right move (e.g. the Removed — no longer on any SOW or bid section,
    // where the disconnect is intentional).

    // Auto-mount the photo viewer when the row has photos, so expanding
    // (by clicking the SOW cell, the row, or a thumb) always surfaces
    // them — matching v1. aria-expanded is already 'true' above, so
    // openWithPhoto won't recurse back into toggleRowExpand.
    var scrape = window.SCW && SCW.bidReview && SCW.bidReview.scrapeRowPhotoUrls;
    if (typeof scrape === 'function') {
      var rowId = row.getAttribute('data-row-id');
      var urls = scrape(sowItemId || null, rowId || null);
      if (urls && urls.length) openWithPhoto(row, urls, 0);
    }
    syncToolbarRowLabel();
  }

  // Keep the toolbar "Expand/Collapse line items" label honest after any
  // single-row toggle (clicking a row, closing a panel via its × button).
  function syncToolbarRowLabel() {
    if (ns.toolbar && typeof ns.toolbar.syncLabels === 'function') {
      try { ns.toolbar.syncLabels(); } catch (e) { /* fail soft */ }
    }
  }

  // Compact header for the expand panel, built from the (now-hidden)
  // data row's leftmost columns — the line label + SOW product name —
  // plus a close affordance. Replaces re-showing the full SOW/bid data.
  function buildExpandHeader(rowTr) {
    var header = document.createElement('div');
    header.className = 'scw-bid-review-v2__panel-header';
    header.setAttribute('title', 'Click to close');

    // Bulk-select checkbox FIRST (far left) — the grid-row checkbox is
    // hidden while the row is expanded, so surface one here keyed on the
    // same SOW item id. Selection-then-disclosure order matches the grid
    // rows (checkbox leftmost, caret second).
    var sowItemId = rowTr.getAttribute('data-sow-item-id');
    if (sowItemId) {
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'scw-br-v2-rowselect scw-br-v2-rowselect--header';
      cb.setAttribute('data-scw-ws-v2-select', sowItemId);
      cb.setAttribute('aria-label', 'Select line item');
      header.appendChild(cb);
    }

    // Open caret — second from left, mirroring the closed grid-row layout
    // so neither control jumps position when a row expands. Points down
    // (open); the whole header bar is the click target to close.
    var caret = document.createElement('span');
    caret.className = 'scw-bid-review-v2__panel-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
      'stroke="currentColor" stroke-width="3" stroke-linecap="round" ' +
      'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    header.appendChild(caret);

    var title = document.createElement('div');
    title.className = 'scw-bid-review-v2__panel-title';
    function readText(sel) {
      var el = rowTr.querySelector(sel);
      return el ? (el.textContent || '').trim() : '';
    }
    function chip(cls, text) {
      var s = document.createElement('span');
      s.className = 'scw-bid-review-v2__panel-title-' + cls;
      s.textContent = text;
      return s;
    }
    var label   = readText('.scw-bid-review-v2__row-label');
    var product = readText('.scw-bid-review-v2__sow-product');
    if (label)   title.appendChild(chip('label', label));
    if (product) title.appendChild(chip('product', product));
    header.appendChild(title);
    return header;
  }

  // Right-side column of the expand panel. Rebuilds each bid-package
  // cell from the (still-visible) data row as a labelled compact card,
  // so the SOW editor and the bids read side-by-side for comparison.
  // Cells: 0 = line label, 1 = photos, 2 = SOW, 3+ = bid packages.
  function buildBidDetailsColumn(rowTr) {
    var col = document.createElement('div');
    col.className = 'scw-bid-review-v2__panel-col--bid';

    var labels = [];
    var table = rowTr.closest('table');
    if (table) {
      var ths = table.querySelectorAll('thead th');
      for (var t = 0; t < ths.length; t++) {
        labels.push((ths[t].textContent || '').replace(/\s+/g, ' ').trim());
      }
    }

    var cells = rowTr.children;
    for (var i = 3; i < cells.length; i++) {
      var card = document.createElement('div');
      card.className = 'scw-bid-review-v2__bid-card';
      var lbl = document.createElement('div');
      lbl.className = 'scw-bid-review-v2__bid-card-label';
      lbl.textContent = labels[i] || ('Bid ' + (i - 2));
      card.appendChild(lbl);
      var body = document.createElement('div');
      body.className = 'scw-bid-review-v2__bid-card-body';
      // Clone the cell's children (not the <td> itself) so the original
      // row keeps its cells intact for re-renders.
      var clone = cells[i].cloneNode(true);
      while (clone.firstChild) body.appendChild(clone.firstChild);
      // Re-link lives in the OPEN panel only (CSS hides it in the grid
      // row): relocate the primary cell's pill from the cloned action
      // stack up into the card's label strip, top-right. Dupe blocks
      // keep theirs in place (nested inside the dupe, so the :scope
      // direct-child selector skips them).
      var relinkBtn = body.querySelector(
        ':scope > .scw-bid-review-v2__cell-actions .scw-bid-review__cell-action--relink');
      if (relinkBtn) lbl.appendChild(relinkBtn);
      card.appendChild(body);
      col.appendChild(card);
    }
    return col;
  }

  // ── Photo viewer (ported from v1's init.js, v2-scoped classes) ──
  // Open the row's expand panel AND mount a side-by-side photo viewer
  // in the panel's left column. Thumbnail strip lets the reviewer flip
  // between photos without leaving the editor.
  function openWithPhoto(rowTr, urls, activeIdx) {
    if (!rowTr || !urls || !urls.length) return;
    if (activeIdx == null || activeIdx < 0 || activeIdx >= urls.length) activeIdx = 0;

    if (rowTr.getAttribute('aria-expanded') !== 'true') {
      toggleRowExpand(rowTr);
    }
    var expandTr = rowTr.nextElementSibling;
    if (!expandTr || !expandTr.classList.contains('scw-bid-review-v2__expand-row')) return;
    var photoCol = expandTr.querySelector('.scw-bid-review-v2__panel-col--photo');
    if (!photoCol) return;

    var existing = photoCol.querySelector('.scw-bid-review-v2__photo-viewer');
    if (existing) { updatePhotoViewer(existing, urls, activeIdx); return; }

    photoCol.classList.add('scw-bid-review-v2__panel-col--photo-active');
    photoCol.appendChild(buildPhotoViewer(urls, activeIdx));
  }

  function buildPhotoViewer(urls, activeIdx) {
    var wrap = document.createElement('div');
    wrap.className = 'scw-bid-review-v2__photo-viewer';

    var stage = document.createElement('div');
    stage.className = 'scw-bid-review-v2__photo-viewer-stage';
    stage.setAttribute('title', 'Click photo to zoom');

    var openLink = document.createElement('a');
    openLink.className = 'scw-bid-review-v2__photo-viewer-open';
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    openLink.title = 'Open full size in a new tab';
    openLink.textContent = 'Open ↗';
    openLink.addEventListener('click', function (e) { e.stopPropagation(); });
    stage.appendChild(openLink);

    var img = document.createElement('img');
    img.alt = '';
    stage.appendChild(img);

    stage.addEventListener('click', function (e) {
      if (e.target.closest('.scw-bid-review-v2__photo-viewer-open')) return;
      openLightbox(img.src);
    });
    wrap.appendChild(stage);

    var strip = document.createElement('div');
    strip.className = 'scw-bid-review-v2__photo-viewer-strip';
    wrap.appendChild(strip);

    updatePhotoViewer(wrap, urls, activeIdx);
    return wrap;
  }

  function openLightbox(url) {
    if (!url) return;
    var overlay = document.createElement('div');
    overlay.className = 'scw-bid-review-v2__lightbox';
    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    overlay.appendChild(img);

    function dismiss() {
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') dismiss(); }

    overlay.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  function updatePhotoViewer(viewer, urls, activeIdx) {
    var stageImg = viewer.querySelector('.scw-bid-review-v2__photo-viewer-stage img');
    var openLink = viewer.querySelector('.scw-bid-review-v2__photo-viewer-open');
    var strip    = viewer.querySelector('.scw-bid-review-v2__photo-viewer-strip');
    if (stageImg) stageImg.src = urls[activeIdx];
    if (openLink) openLink.href = urls[activeIdx];

    if (!strip) return;
    strip.innerHTML = '';
    if (urls.length < 2) { strip.style.display = 'none'; return; }
    strip.style.display = '';
    for (var i = 0; i < urls.length; i++) {
      (function (idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-bid-review-v2__photo-viewer-thumb' +
          (idx === activeIdx ? ' scw-bid-review-v2__photo-viewer-thumb--active' : '');
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          updatePhotoViewer(viewer, urls, idx);
        });
        var img = document.createElement('img');
        img.src = urls[idx]; img.alt = ''; img.loading = 'lazy';
        btn.appendChild(img);
        strip.appendChild(btn);
      })(i);
    }
  }

  ns.openWithPhoto = openWithPhoto;

  // After a grid rebuild (render.js), re-open the row panels the user had
  // expanded so an edit/delete-driven refetch doesn't collapse them. The
  // rebuilt rows come back collapsed; re-running toggleRowExpand on each
  // tracked-open row rebuilds its panel from the FRESH model (so e.g. a just-
  // deleted accessory is already gone from the re-mounted worksheet card).
  function reopenExpandedRows(scope) {
    if (!ns.state || typeof ns.state.isRowExpanded !== 'function') return;
    var root = scope || (ns.CONFIG && document.getElementById(ns.CONFIG.mountId));
    if (!root) return;
    var rows = root.querySelectorAll('.scw-bid-review-v2__row--expandable');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var rid = row.getAttribute('data-sow-item-id') ||
                row.getAttribute('data-row-id');
      if (!rid || !ns.state.isRowExpanded(rid)) continue;
      // Skip rows hidden by a collapsed MDF/IDF group — don't surface a
      // detached panel; the state stays set so it re-opens if the group opens.
      if (row.offsetParent === null) continue;
      // Already open (panel survived) — leave it.
      var nx = row.nextElementSibling;
      if (nx && nx.classList &&
          nx.classList.contains('scw-bid-review-v2__expand-row')) continue;
      toggleRowExpand(row);
    }
  }
  ns.reopenExpandedRows = reopenExpandedRows;

  // ── Expand / collapse EVERY line-item row (toolbar "Expand line items") ──
  // Unlike the worksheet-v2 card toggle (a cheap CSS class flip on cards that
  // are already in the DOM), each bid-review row lazily MOUNTS a full
  // worksheet-v2 editor + photo viewer the first time it opens. Expanding the
  // whole grid at once could therefore mount dozens of heavy panels on one
  // frame and freeze the tab — so expand is chunked across animation frames.
  // Collapse just tears down existing panels, so it runs synchronously.
  function expandableRows() {
    var root = ns.CONFIG && document.getElementById(ns.CONFIG.mountId);
    if (!root) return [];
    return Array.prototype.slice.call(
      root.querySelectorAll('.scw-bid-review-v2__row--expandable')
    );
  }

  function rowIsOpen(row) {
    if (!row) return false;
    if (row.getAttribute('aria-expanded') === 'true') return true;
    var nx = row.nextElementSibling;
    return !!(nx && nx.classList &&
      nx.classList.contains('scw-bid-review-v2__expand-row'));
  }

  function anyRowOpen() {
    var rows = expandableRows();
    for (var i = 0; i < rows.length; i++) {
      if (rowIsOpen(rows[i])) return true;
    }
    return false;
  }
  ns.anyRowOpen = anyRowOpen;

  var _toggleAllBusy = false;
  function toggleAllRows(done) {
    if (_toggleAllBusy) return;
    var rows = expandableRows();
    var wantOpen = !anyRowOpen();

    if (!wantOpen) {
      // Collapse every open panel — cheap, synchronous.
      for (var i = 0; i < rows.length; i++) {
        if (rowIsOpen(rows[i])) toggleRowExpand(rows[i]);
      }
      if (typeof done === 'function') done();
      return;
    }

    // Expand only rows visible right now — skip those hidden inside a
    // collapsed MDF/IDF group (their expanded state stays default and they
    // open when the group is opened). Chunk the heavy panel mounts across
    // frames so the main thread stays responsive on big comparisons.
    var pending = [];
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].offsetParent === null) continue;
      if (rowIsOpen(rows[j])) continue;
      pending.push(rows[j]);
    }
    if (!pending.length) { if (typeof done === 'function') done(); return; }

    _toggleAllBusy = true;
    var CHUNK = 4, idx = 0;
    var raf = window.requestAnimationFrame ||
      function (fn) { return window.setTimeout(fn, 16); };
    function step() {
      var end = Math.min(idx + CHUNK, pending.length);
      for (; idx < end; idx++) {
        // A concurrent event may have opened/removed the row — re-check.
        if (pending[idx].isConnected !== false && !rowIsOpen(pending[idx])) {
          toggleRowExpand(pending[idx]);
        }
      }
      if (typeof done === 'function') { try { done(); } catch (e) {} }
      if (idx < pending.length) raf(step);
      else _toggleAllBusy = false;
    }
    step();
  }
  ns.toggleAllRows = toggleAllRows;

  // Find the full Backbone-style attributes hash for a SOW item id.
  // Prefer the live model so we always see the freshest values; fall
  // back to the snapshot the v2 grid was rendered against.
  function lookupSowRecord(sowItemId) {
    try {
      var sowViewKey = (ns.CONFIG.sourceViewKeys || [])[1];
      var v = sowViewKey && Knack.views && Knack.views[sowViewKey];
      if (v && v.model && v.model.data && typeof v.model.data.get === 'function') {
        var m = v.model.data.get(sowItemId);
        if (m && m.attributes) return m.attributes;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  function mountWorksheetV2Card(hostTd, sowRec) {
    var wsv2 = window.SCW && SCW.worksheetV2;
    if (!wsv2 || !wsv2.card || typeof wsv2.card.buildCard !== 'function') {
      hostTd.innerHTML =
        '<div class="scw-bid-review-v2__expand-loading">' +
          'worksheet-v2 not available — open the SOW Line Items page ' +
          'and reload to use the inline editor.' +
        '</div>';
      return;
    }
    // Force the card open so the user lands directly in the editor,
    // not on the summary header.
    var card;
    try {
      card = wsv2.card.buildCard(sowRec, (ns.CONFIG.sourceViewKeys || [])[1]);
    } catch (err) {
      console.warn('[scw-br-v2] worksheet-v2 buildCard threw', err);
      hostTd.innerHTML =
        '<div class="scw-bid-review-v2__expand-loading">' +
          'Failed to render the worksheet-v2 card — see console.' +
        '</div>';
      return;
    }
    card.classList.add('scw-ws-v2-card--open');
    hostTd.appendChild(card);
    decorateNarrowEditor(card);
  }

  // The narrow reflow hides the grid-aligned column-header strip, so the
  // summary-row inputs lose their labels. Re-attach a small label above
  // each labelled cell from the input's aria-label / placeholder (or the
  // cell title for read-only cells). Scoped to the summary row — the
  // detail panel carries its own labels.
  function decorateNarrowEditor(card) {
    var rows = card.querySelectorAll('.scw-ws-v2-row');
    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].querySelectorAll(
        '.scw-ws-v2-cell--num, .scw-ws-v2-cell--stack, ' +
        '.scw-ws-v2-cell--fee, .scw-ws-v2-cell--labor-desc');
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        if (cell.getAttribute('data-scw-flabel')) continue;
        var input = cell.querySelector('input, textarea');
        var text = '';
        if (input) {
          text = input.getAttribute('aria-label') ||
                 input.getAttribute('placeholder') || '';
        }
        if (!text) text = cell.getAttribute('title') || '';
        if (!text) continue;
        cell.setAttribute('data-scw-flabel', '1');
        var lab = document.createElement('span');
        lab.className = 'scw-br-v2-flabel';
        lab.textContent = text;
        cell.insertBefore(lab, cell.firstChild);
      }
    }
    relocateSowField(card);
    removeSurveyNotes(card);
    removeNotesWarnChip(card);
    lineBreakConnectedDevices(card);
    makeScwNotesTextarea(card);
  }

  // The "has SCW notes" chip is a callout for the collapsed grid row, where
  // the note text isn't visible anywhere else. Once expanded, the SCW Notes
  // field is directly visible (and editable) in the detail zone below — the
  // chip is redundant there. The other issue types (photos / disconnected /
  // wrong accessory) stay, since their underlying data still isn't all
  // visible at a glance in the expanded card.
  function removeNotesWarnChip(card) {
    var chits = card.querySelectorAll('.scw-ws-v2-warn-chit[data-issue-type="notes"]');
    for (var i = 0; i < chits.length; i++) {
      chits[i].parentNode.removeChild(chits[i]);
    }
  }

  // Connected Devices (field_1957) is multi-value; show each on its own
  // line instead of comma-joined.
  function lineBreakConnectedDevices(card) {
    var vals = card.querySelectorAll(
      '[data-scw-ws-v2-conn="field_1957"] .scw-ws-v2-conn-btn-val');
    for (var i = 0; i < vals.length; i++) {
      var elv = vals[i];
      var txt = (elv.textContent || '').trim();
      if (!txt || txt === '(none)') continue;
      var parts = txt.split(/\s*,\s*/);
      if (parts.length < 2) continue;
      elv.textContent = '';
      for (var p = 0; p < parts.length; p++) {
        if (p) elv.appendChild(document.createElement('br'));
        elv.appendChild(document.createTextNode(parts[p]));
      }
    }
  }

  // SCW Notes (field_1953) — EDITABLE on the bid comparison page (was locked
  // as "owned upstream" until 2026-07; view_3921 should be fully editable).
  // Swap the single-line input for a full-width, wrapping textarea for
  // readability. The data-scw-ws-v2-field/-record/-view attrs carry over in
  // the attribute copy, so worksheet-v2's delegated edit.js commits it
  // through view_3921 like any other field (Enter saves, Shift+Enter
  // inserts a newline).
  function makeScwNotesTextarea(card) {
    var el = card.querySelector('[data-scw-ws-v2-field="field_1953"]');
    if (!el || el.tagName === 'TEXTAREA') return;
    var ta = document.createElement('textarea');
    ta.value = el.value;
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name === 'type' || a.name === 'class' || a.name === 'value') continue;
      ta.setAttribute(a.name, a.value);
    }
    ta.className = 'scw-ws-v2-input scw-ws-v2-input--textarea scw-br-v2-scwnotes';
    el.parentNode.replaceChild(ta, el);
  }

  function findDetailFieldByLabel(card, labelText) {
    var fields = card.querySelectorAll('.scw-ws-v2-detail-field');
    for (var i = 0; i < fields.length; i++) {
      var l = fields[i].querySelector('.scw-ws-v2-detail-label');
      if (l && (l.textContent || '').trim().toLowerCase() === labelText.toLowerCase()) {
        return fields[i];
      }
    }
    return null;
  }

  // Move the SOW connection out of the inline summary row into the detail
  // panel, above MDF / IDF. Inline it looked cramped — and broke down with
  // multiple connected SOWs. Labelled simply "SOW".
  function relocateSowField(card) {
    var sowCell = card.querySelector('.scw-ws-v2-cell--sow');
    if (!sowCell || sowCell.closest('.scw-br-v2-sow-field')) return;
    var mdf  = findDetailFieldByLabel(card, 'MDF / IDF');
    var zone = mdf ? mdf.parentNode
                   : card.querySelector('.scw-ws-v2-detail-zone--connections');
    if (!zone) return;
    var field = document.createElement('div');
    field.className =
      'scw-ws-v2-detail-field scw-ws-v2-detail-field--conn scw-br-v2-sow-field';
    var lab = document.createElement('div');
    lab.className = 'scw-ws-v2-detail-label';
    lab.textContent = 'SOW';
    field.appendChild(lab);
    field.appendChild(sowCell);
    if (mdf) zone.insertBefore(field, mdf);
    else zone.appendChild(field);
  }

  // Survey Notes belong on the bid, not in this SOW editor — drop them.
  function removeSurveyNotes(card) {
    var sn = findDetailFieldByLabel(card, 'Survey Notes');
    if (sn && sn.parentNode) sn.parentNode.removeChild(sn);
  }

  // v1's change-request module re-renders the grid via SCW.bidReview.rerender
  // after any pending-CR mutation (add / edit / remove / submit / clear).
  // Wrap it so v2 re-renders too — v2 reads the same _pending state, so a
  // fresh notify() repaints cell cards + header Submit counts. Idempotent.
  function hookV1Rerender() {
    var v1 = window.SCW.bidReview;
    if (!v1 || v1._scwV2RerenderHooked) return;
    var orig = v1.rerender;
    v1.rerender = function () {
      if (typeof orig === 'function') {
        try { orig.apply(v1, arguments); } catch (e) { /* ignore */ }
      }
      if (ns.data && typeof ns.data.notify === 'function') {
        try { ns.data.notify(); } catch (e) { /* ignore */ }
      }
    };
    v1._scwV2RerenderHooked = true;
  }

  function init() {
    // Inject CSS (styles.js self-injects if not present)
    if (ns.data) ns.data.attachListeners();
    if (ns.edit && typeof ns.edit.wire === 'function') ns.edit.wire();
    wireGroupCollapse();
    wireRowExpand();
    wirePanelClose();
    wireHeaderActions();
    if (ns.columnCollapse && typeof ns.columnCollapse.wire === 'function') ns.columnCollapse.wire();
    hookV1Rerender();
    if (ns.data && ns.render) {
      ns.data.subscribe(function (snapshot) {
        function doRender() {
          ns.render.renderSnapshot(snapshot);
          mountBulk();
        }
        // NOTE: do NOT wrap ORDINARY field-edit renders in
        // SCW.v2ScrollAnchor.around. On this grid the anchor's
        // window.scrollBy correction runs away: editing field_2150 in an
        // expanded row's embedded worksheet-v2 card rebuilds the panel,
        // the SOW section below it shifts, and the anchor scrollBy's DOWN
        // by the delta — repeatedly — scrolling the page to the bottom in
        // several jumps (confirmed via scroll-spy: scrollBy with no
        // scrollTo trace). bid-review-v2's renderSnapshot already
        // keyed-reuses unchanged sections + defers while focused, so a
        // plain rebuild stays put for those.
        //
        // EXCEPTION: a cascade settling (data.js's scw-cascade-idle
        // listener, e.g. Connected Devices) sets _pendingCascadeAnchor.
        // That kind of edit can genuinely move a child's row into a
        // different MDF/IDF group or change the parent's device-list
        // line count — a real height change the keyed rebuild has no way
        // to hold scroll position through — so THAT render (and only
        // that one, thanks to notifyDebounced already coalescing the
        // cascade's refetch burst into a single call) gets the anchor.
        var useAnchor = !!ns._pendingCascadeAnchor;
        ns._pendingCascadeAnchor = false;
        if (useAnchor && window.SCW && SCW.v2ScrollAnchor &&
            typeof SCW.v2ScrollAnchor.around === 'function') {
          SCW.v2ScrollAnchor.around(
            '.scw-bid-review-v2__row[data-row-id]', 'data-row-id', doRender);
        } else {
          doRender();
        }
      });
    }

    // Mount on scene render so the anchor element exists.
    var sceneKey = ns.CONFIG.sceneKey;
    if (sceneKey && window.SCW && typeof SCW.onSceneRender === 'function') {
      SCW.onSceneRender(sceneKey, function () {
        // Defer one tick — v1's init.js also mounts on scene render and
        // we want v2 to land beneath it, not above it.
        setTimeout(tryMount, 0);
      }, 'scwBidReviewV2');
    } else {
      // Fallback: try once now, and again on document ready.
      tryMount();
      $(document).ready(tryMount);
    }
  }

  if (window.SCW && SCW.CONFIG && SCW.CONFIG.debug) {
    console.log('[scw-br-v2] init', { config: ns.CONFIG });
  }
  init();
})();
/*** END BID REVIEW V2 — INIT *************************************************/
