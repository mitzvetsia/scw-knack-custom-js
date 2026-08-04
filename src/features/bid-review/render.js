/*** BID REVIEW — RENDERING ***/
/**
 * Pure rendering: state object → DOM nodes.
 * Renders one grid (table) per SOW, each with bid-package columns.
 *
 * Reads : SCW.bidReview.CONFIG (mountSelector)
 * Writes: SCW.bidReview.renderMatrix(state), .renderToast(msg, type),
 *         .showLoading(), .clearMount()
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  var TOAST_ID = 'scw-bid-review-toast';

  // ── html helpers ────────────────────────────────────────────

  var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  var ESC_RE  = /[&<>"']/g;

  function esc(str) {
    return String(str == null ? '' : str).replace(ESC_RE, function (c) { return ESC_MAP[c]; });
  }

  function formatCurrency(val) {
    if (val == null || val === 0) return '$0.00';
    return '$' + Number(val).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // ── element factories ───────────────────────────────────────

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function btn(label, cssModifier, attrs) {
    var b = el('button', 'scw-bid-review__btn scw-bid-review__btn--' + cssModifier, label);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        b.setAttribute(keys[i], attrs[keys[i]]);
      }
    }
    return b;
  }

  // ── cell-corner action button(s) ──────────────────────────────

  /**
   * Builds a small, absolutely positioned action button stack used in
   * the top-right corner of the SOW + bid cells. `actions` is a list
   * of { label, mod, attrs } where attrs become data-* on the button.
   */
  function buildCellActions(actions) {
    var wrap = el('div', 'scw-bid-review__cell-actions');
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i];
      var b = el('button',
        'scw-bid-review__cell-action scw-bid-review__cell-action--' + a.mod,
        a.label);
      b.type = 'button';
      var keys = Object.keys(a.attrs);
      for (var k = 0; k < keys.length; k++) b.setAttribute(keys[k], a.attrs[keys[k]]);
      wrap.appendChild(b);
    }
    return wrap;
  }

  // ── overflow menu factory ─────────────────────────────────────

  /**
   * Builds a compact "⋮ Label" trigger + dropdown listing package choices.
   * triggerLabel: display text ("Revise", "Remove", "Add")
   * triggerMod:   CSS modifier for trigger color ("revise", "remove", "add")
   * choices:      [{ label, attrs: { 'data-action': ..., ... } }]
   */
  function buildOverflowMenu(triggerLabel, triggerMod, choices) {
    var container = el('div', 'scw-bid-review__overflow');

    var trigger = el('button', 'scw-bid-review__overflow-trigger scw-bid-review__overflow-trigger--' + triggerMod);
    trigger.innerHTML = '<span class="scw-bid-review__overflow-dots">\u22EE</span> ' + esc(triggerLabel);
    trigger.type = 'button';
    container.appendChild(trigger);

    // Always build dropdown — even with one choice, show which bid it targets
    var menu = el('div', 'scw-bid-review__overflow-menu');
    for (var i = 0; i < choices.length; i++) {
      var ch = choices[i];
      var itemEl = el('button', 'scw-bid-review__overflow-item');
      itemEl.type = 'button';
      itemEl.textContent = ch.label;
      var keys = Object.keys(ch.attrs);
      for (var k = 0; k < keys.length; k++) itemEl.setAttribute(keys[k], ch.attrs[keys[k]]);
      menu.appendChild(itemEl);
    }
    container.appendChild(menu);

    // Toggle
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var allOpen = document.querySelectorAll('.scw-bid-review__overflow--open');
      for (var j = 0; j < allOpen.length; j++) {
        if (allOpen[j] !== container) allOpen[j].classList.remove('scw-bid-review__overflow--open');
      }
      container.classList.toggle('scw-bid-review__overflow--open');
    });

    return container;
  }

  // ── chevron SVG ──────────────────────────────────────────────

  var CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="6 9 12 15 18 9"></polyline></svg>';

  // ── collapsible bid (subcontractor) columns ─────────────────
  // A reviewer can collapse a bid column down to a thin strip to get it
  // out of the way (e.g. after creating a new SOW for that bid). State is
  // per sowId::pkgId, in-memory so it survives grid re-renders within the
  // session. Every cell in a column carries class scw-bid-review__pkg-col
  // + data-package-id so a toggle can hit the whole column at once.
  var _collapsedPkgCols = {};
  // Columns the user has explicitly expanded/collapsed this session — their
  // choice wins over the auto-collapse default for zero-on-SOW bids.
  var _pkgColUserToggled = {};

  function pkgColKey(sowId, pkgId) { return (sowId || '') + '::' + (pkgId || ''); }
  function isPkgColCollapsed(sowId, pkgId) { return !!_collapsedPkgCols[pkgColKey(sowId, pkgId)]; }

  // A bid whose items are ALL "other" (none on this SOW) renders collapsed
  // by default — but only until the user toggles it.
  function applyDefaultPkgCollapse(sowId, pkgId, shouldCollapse) {
    var key = pkgColKey(sowId, pkgId);
    if (_pkgColUserToggled[key]) return;
    if (shouldCollapse) _collapsedPkgCols[key] = true;
  }

  // Tag a column cell so the collapse toggle can find it, and apply the
  // collapsed class up front if this column is already collapsed.
  function tagPkgCol(cell, sowId, pkgId) {
    if (!cell) return cell;
    cell.classList.add('scw-bid-review__pkg-col');
    cell.setAttribute('data-package-id', pkgId);
    if (isPkgColCollapsed(sowId, pkgId)) {
      cell.classList.add('scw-bid-review__pkg-col--collapsed');
    }
    return cell;
  }

  function setPkgColCollapsed(sowId, pkgId, collapsed) {
    var key = pkgColKey(sowId, pkgId);
    _pkgColUserToggled[key] = true;
    if (collapsed) _collapsedPkgCols[key] = true; else delete _collapsedPkgCols[key];
    var scope = document.querySelector('.scw-bid-review__sow-section[data-sow-id="' + sowId + '"]');
    if (!scope) return;
    var cells = scope.querySelectorAll('.scw-bid-review__pkg-col[data-package-id="' + pkgId + '"]');
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.toggle('scw-bid-review__pkg-col--collapsed', collapsed);
    }
    // Collapsed (ignored) bids drop out of the SOW gap check — re-evaluate
    // the SOW total's warning now that the active-bid set changed.
    recomputeSowGap(scope);
  }

  // Build the per-bid "delta vs SOW" line (green match / amber gap), or
  // null when the bid has no total to compare. Shared by the full render
  // and the partial header refresh so both stay in sync.
  function buildDeltaEl(hasBid, matches, amount) {
    if (!hasBid) return null;
    var dEl = el('div', 'scw-bid-review__col-title-delta ' +
      (matches ? 'scw-bid-review__col-title-delta--match'
               : 'scw-bid-review__col-title-delta--gap'));
    if (matches) {
      dEl.textContent = '✓ matches SOW';
    } else {
      var sign = amount > 0 ? '+' : '−';
      dEl.textContent = sign + formatCurrency(Math.abs(amount)) + ' vs SOW';
    }
    return dEl;
  }

  // Partial refresh of a SOW section's header totals/flags after an
  // in-place row patch (init.js's patchRows). Recomputes the SOW Sub Bid
  // / Install totals (excluding offSow rows, matching the full render),
  // each bid's total + delta line, the stashed data-subbid-total attrs,
  // and the SOW gap warning — so the header never goes stale or shows the
  // wrong value after an inline edit.
  ns.refreshHeaderTotals = function refreshHeaderTotals(grid) {
    if (!grid) return;
    var section = document.querySelector('.scw-bid-review__sow-section[data-sow-id="' + grid.sowId + '"]');
    if (!section) return;

    var rows = grid.rows || [];
    var sowSub = 0, sowInstall = 0, pkgTotals = {};
    (grid.packages || []).forEach(function (p) { pkgTotals[p.id] = 0; });
    rows.forEach(function (r) {
      if (!r.offSow) {
        if (r.sowFee) sowSub += Number(r.sowFee) || 0;
        if (r.sowInstallFee) sowInstall += Number(r.sowInstallFee) || 0;
      }
      if (r.cellsByPackage) {
        Object.keys(pkgTotals).forEach(function (pid) {
          var c = r.cellsByPackage[pid];
          if (c && c.labor) pkgTotals[pid] += Number(c.labor) || 0;
        });
      }
    });

    // SOW header cell — write each total to its OWN slot by label.
    var sowCell = section.querySelector('.scw-bid-review__sow-detail-header');
    if (sowCell) {
      sowCell.setAttribute('data-subbid-total', String(sowSub));
      var totDivs = sowCell.querySelectorAll('.scw-bid-review__col-title-total');
      for (var d = 0; d < totDivs.length; d++) {
        var lbl = (totDivs[d].querySelector('.scw-bid-review__col-title-total-label') || {}).textContent || '';
        var valEl = totDivs[d].querySelector('.scw-bid-review__col-title-total-value');
        if (!valEl) continue;
        if (/sub bid/i.test(lbl)) valEl.textContent = formatCurrency(sowSub);
        else if (/install/i.test(lbl)) valEl.textContent = formatCurrency(sowInstall);
      }
    }

    // Bid header cells — value, delta line, stashed total.
    var bidThs = section.querySelectorAll('th.scw-bid-review__pkg-header');
    for (var i = 0; i < grid.packages.length && i < bidThs.length; i++) {
      var pkgId = grid.packages[i].id;
      var bt = pkgTotals[pkgId] || 0;
      var th = bidThs[i];
      th.setAttribute('data-subbid-total', String(bt));
      var vEl = th.querySelector('.scw-bid-review__col-title-total-value');
      if (vEl) vEl.textContent = formatCurrency(bt);
      var matches = bt > 0 && Math.abs(bt - sowSub) <= 0.01;
      var newDelta = buildDeltaEl(bt > 0, matches, bt - sowSub);
      var oldDelta = th.querySelector('.scw-bid-review__col-title-delta');
      if (oldDelta && newDelta) oldDelta.parentNode.replaceChild(newDelta, oldDelta);
      else if (oldDelta && !newDelta) oldDelta.parentNode.removeChild(oldDelta);
      else if (newDelta) th.appendChild(newDelta);
    }

    recomputeSowGap(section);
  };

  // Live re-evaluation of the SOW Sub Bid Total warning: it flags only
  // when the SOW matches NONE of the active (non-collapsed) bids. Reads
  // the totals stashed as data-subbid-total on the header cells.
  function recomputeSowGap(section) {
    if (!section) return;
    var sowCell = section.querySelector('.scw-bid-review__sow-detail-header');
    if (!sowCell) return;
    var sowTotal = parseFloat(sowCell.getAttribute('data-subbid-total')) || 0;
    var bidThs = section.querySelectorAll('th.scw-bid-review__pkg-header');
    var activeCount = 0, matchesAny = false;
    for (var i = 0; i < bidThs.length; i++) {
      if (bidThs[i].classList.contains('scw-bid-review__pkg-col--collapsed')) continue;
      var bt = parseFloat(bidThs[i].getAttribute('data-subbid-total')) || 0;
      if (bt <= 0) continue;
      activeCount++;
      if (Math.abs(bt - sowTotal) <= 0.01) matchesAny = true;
    }
    var warn = activeCount > 0 && !matchesAny;
    var sowSub = sowCell.querySelector('.scw-bid-review__sow-subbid');
    if (sowSub) {
      sowSub.classList.toggle('scw-bid-review__col-title-total--warn', warn);
      if (warn) sowSub.title = 'SOW sub bid total matches none of the active bids';
      else sowSub.removeAttribute('title');
    }
  }

  // Collapse handle (in the column title cell) + expand handle (shown only
  // while collapsed). Both attach their own listeners and stop propagation
  // so they don't trip the delegated row/button handler in init.js.
  function buildPkgCollapseControls(th, sowId, pkgId, pkgName) {
    var collapseBtn = el('button', 'scw-bid-review__pkg-collapse-btn');
    collapseBtn.type = 'button';
    collapseBtn.title = 'Collapse this bid column';
    collapseBtn.innerHTML = '&raquo;';
    collapseBtn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setPkgColCollapsed(sowId, pkgId, true);
    });
    th.appendChild(collapseBtn);

    var expand = el('button', 'scw-bid-review__pkg-expand');
    expand.type = 'button';
    expand.title = 'Expand ' + (pkgName || 'bid');
    expand.innerHTML = '<span class="scw-bid-review__pkg-expand-icon">&laquo;</span>' +
      '<span class="scw-bid-review__pkg-expand-label"></span>';
    expand.querySelector('.scw-bid-review__pkg-expand-label').textContent = pkgName || 'Bid';
    expand.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setPkgColCollapsed(sowId, pkgId, false);
    });
    th.appendChild(expand);
  }

  // ── mount point ─────────────────────────────────────────────

  function getOrCreateMount() {
    // Final defense — refuse to create the mount on any scene other
    // than the bid comparisons page. runPipeline / refreshSilently
    // already gate at entry, but anything that calls renderMatrix
    // directly (or a stray hook somewhere down the line) lands here.
    var sceneKey = (window.Knack && Knack.router && Knack.router.current_scene_key) || '';
    if (sceneKey && sceneKey !== CFG.sceneKey) {
      // Tear down any stray mount that survived a scene swap.
      var stray = document.querySelector(CFG.mountSelector);
      if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
      document.body.classList.remove('scw-bid-review-active');
      document.documentElement.classList.remove('scw-bid-review-active');
      return null;
    }
    // Flag the body so view_3921's accordion hides via CSS while the
    // bid review grid is on screen.
    document.body.classList.add('scw-bid-review-active');
    document.documentElement.classList.add('scw-bid-review-active');
    var mount = document.querySelector(CFG.mountSelector);
    if (!mount) {
      mount = el('div');
      mount.id = CFG.mountSelector.replace(/^#/, '');
      // Insert immediately after the configured anchor view (default
      // view_3970), falling back to the nav (view_44), then the scene.
      var anchor = (CFG.gridAnchorView && document.getElementById(CFG.gridAnchorView))
        || document.getElementById('view_44');
      if (anchor && anchor.nextSibling) {
        anchor.parentNode.insertBefore(mount, anchor.nextSibling);
      } else if (anchor) {
        anchor.parentNode.appendChild(mount);
      } else {
        var scene = document.getElementById(CFG.sceneKey);
        if (scene) {
          scene.insertBefore(mount, scene.firstChild);
        } else {
          document.body.appendChild(mount);
        }
      }
    }
    return mount;
  }

  // ── table header for a SOW grid ─────────────────────────────

  function buildHeaderRows(sowGrid) {
    var rows = [];
    // line item + photos + sow + packages + CR
    var colCount = 3 + sowGrid.packages.length + 1;

    // ═══ ROW 1: Column titles ═══
    // Each SOW + Bid column shows a totals summary below its title:
    //   SOW · Sub Bid Total = Σ row.sowFee   (field_2151 on SOW line item)
    //   SOW · Install Total = Σ row.sowInstallFee
    //   Bid · Sub Bid Total = Σ cell.labor for that package
    //
    // If the SOW Sub Bid Total doesn't agree with a bid column's Sub
    // Bid Total, both numbers get the --warn modifier — that's the
    // visual cue that the SOW line items are out of sync with what was
    // actually bid.
    var sowInstallTotal = 0;
    var sowSubBidTotal = 0;
    var pkgSubBidTotals = {};
    for (var ti = 0; ti < sowGrid.packages.length; ti++) {
      pkgSubBidTotals[sowGrid.packages[ti].id] = 0;
    }
    for (var ri = 0; ri < sowGrid.rows.length; ri++) {
      var tRow = sowGrid.rows[ri];
      // Rows flagged offSow are no longer on this SOW (they only show
      // here because the bid still references the SOW). Their SOW-side
      // fees must NOT count toward the SOW totals — but they DO still
      // count toward the bid column totals below, since the item is
      // genuinely still on the bid.
      if (!tRow.offSow) {
        if (tRow.sowInstallFee) sowInstallTotal += Number(tRow.sowInstallFee) || 0;
        if (tRow.sowFee) sowSubBidTotal += Number(tRow.sowFee) || 0;
      }
      if (tRow.cellsByPackage) {
        for (var pid in pkgSubBidTotals) {
          var tCell = tRow.cellsByPackage[pid];
          if (tCell && tCell.labor) {
            pkgSubBidTotals[pid] += Number(tCell.labor) || 0;
          }
        }
      }
    }

    // ── multi-bid gap logic ─────────────────────────────────────
    // Penny-level tolerance. A bid "matches" the SOW when its sub-bid
    // total equals the SOW sub-bid total. With multiple bids the SOW can
    // only match one, so:
    //   • Each BID column shows its own delta vs the SOW (green "matches"
    //     or amber "±$X vs SOW") — unambiguous, per column.
    //   • The SOW total flags red ONLY when it matches NONE of the
    //     *active* bids (collapsed/ignored bids are excluded). So matching
    //     at least one active bid clears the SOW flag.
    var MISMATCH_EPSILON = 0.01;
    function bidMatchesSow(pkgId) {
      var bidTotal = pkgSubBidTotals[pkgId];
      return bidTotal > 0 && Math.abs(bidTotal - sowSubBidTotal) <= MISMATCH_EPSILON;
    }
    var activeBidCount = 0, sowMatchesAny = false;
    for (var pidChk in pkgSubBidTotals) {
      if (isPkgColCollapsed(sowGrid.sowId, pidChk)) continue; // ignored bid
      if (pkgSubBidTotals[pidChk] > 0) {
        activeBidCount++;
        if (bidMatchesSow(pidChk)) sowMatchesAny = true;
      }
    }
    var sowWarn = activeBidCount > 0 && !sowMatchesAny;

    function buildTitleCell(cls, title, totals, pkgOpts) {
      var th = el('th', cls);
      th.appendChild(el('div', 'scw-bid-review__col-title-text', title));
      for (var i = 0; totals && i < totals.length; i++) {
        var t = totals[i];
        if (!t) continue;

        // Delta-vs-SOW line for a bid column.
        if (t.delta) {
          var dEl = buildDeltaEl(t.hasBid, t.matches, t.amount);
          if (dEl) th.appendChild(dEl);
          continue;
        }

        var subCls = 'scw-bid-review__col-title-total';
        if (t.extraCls) subCls += ' ' + t.extraCls;
        if (t.warn) subCls += ' scw-bid-review__col-title-total--warn';
        var sub = el('div', subCls);
        if (t.warn) sub.title = t.warnTitle || 'SOW sub bid total matches none of the active bids';
        sub.appendChild(el('span', 'scw-bid-review__col-title-total-label', t.label));
        sub.appendChild(document.createTextNode(' '));
        sub.appendChild(el('span', 'scw-bid-review__col-title-total-value', formatCurrency(t.value || 0)));
        th.appendChild(sub);
      }
      if (pkgOpts) {
        tagPkgCol(th, pkgOpts.sowId, pkgOpts.pkgId);
        buildPkgCollapseControls(th, pkgOpts.sowId, pkgOpts.pkgId, pkgOpts.pkgName);
        th.setAttribute('data-subbid-total', String(pkgOpts.subBidTotal || 0));
      }
      return th;
    }

    var r1 = el('tr', 'scw-bid-review__header-row scw-bid-review__header-titles');
    r1.appendChild(el('th', 'scw-bid-review__sow-header', 'Line Item'));
    r1.appendChild(el('th', 'scw-bid-review__photos-header', 'Photos'));
    // Sales Revisions column injected externally — leave gap
    var sowTitleTh = buildTitleCell(
      'scw-bid-review__sow-detail-header', 'SCW SOW', [
        { label: 'Sub Bid Total:', value: sowSubBidTotal, warn: sowWarn, extraCls: 'scw-bid-review__sow-subbid' },
        { label: 'Install Total:', value: sowInstallTotal }
      ]
    );
    // Stash the SOW total so collapse toggles can recompute the gap live.
    sowTitleTh.setAttribute('data-subbid-total', String(sowSubBidTotal));
    r1.appendChild(sowTitleTh);
    for (var i = 0; i < sowGrid.packages.length; i++) {
      var pkgId = sowGrid.packages[i].id;
      var bidTotal = pkgSubBidTotals[pkgId];
      r1.appendChild(buildTitleCell(
        'scw-bid-review__pkg-header', 'Subcontractor Bid', [
          { label: 'Sub Bid Total:', value: bidTotal },
          { delta: true, hasBid: bidTotal > 0, matches: bidMatchesSow(pkgId), amount: bidTotal - sowSubBidTotal }
        ],
        { sowId: sowGrid.sowId, pkgId: pkgId, pkgName: sowGrid.packages[i].name, subBidTotal: bidTotal }
      ));
    }
    r1.appendChild(el('th', 'scw-bid-review__actions-header scw-bid-review__cr-col', 'Sub Bid Revisions'));
    rows.push(r1);

    // ═══ ROW 2: Details (status, name, links) ═══
    var r2 = el('tr', 'scw-bid-review__header-row scw-bid-review__header-details');
    r2.appendChild(el('td', '')); // line item
    r2.appendChild(el('td', '')); // photos column placeholder

    // SOW header detail cell — mirrors what view_3325 surfaces in its
    // "Next Step" column. Split into two rows now: r2 carries the
    // descriptive content (proposal block + Survey Costs/Margin
    // metrics), r3 carries the action buttons (margin-low warning
    // stack + Preview Proposal pill). This matches the bid columns'
    // shape — badge/name in r2, action stack in r3 — so all action
    // buttons across SOW + bid columns line up vertically.
    var sowParts = buildSowStatusBar(sowGrid);
    var sowHeaderTd = el('td', 'scw-bid-review__header-detail-cell scw-bid-review__sow-header-cell');
    if (sowParts && sowParts.details) sowHeaderTd.appendChild(sowParts.details);
    r2.appendChild(sowHeaderTd);

    for (var j = 0; j < sowGrid.packages.length; j++) {
      var pkg = sowGrid.packages[j];
      var td = el('td', 'scw-bid-review__header-detail-cell');
      tagPkgCol(td, sowGrid.sowId, pkg.id);

      var statusVal = pkg.bidStatus || '';
      if (statusVal) {
        var badge = el('span', 'scw-bid-review__status-badge');
        badge.textContent = statusVal;
        badge.setAttribute('data-status', statusVal.toLowerCase().replace(/\s+/g, '-'));
        td.appendChild(badge);
      }

      var subtitle = el('div', 'scw-bid-review__col-subtitle');
      subtitle.appendChild(document.createTextNode(pkg.name));
      if (pkg.pdfUrl) {
        var pdfLink = document.createElement('a');
        pdfLink.href = pkg.pdfUrl;
        pdfLink.target = '_blank';
        pdfLink.title = pkg.pdfFilename || 'View PDF';
        pdfLink.className = 'scw-bid-review__pdf-link';
        pdfLink.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';
        subtitle.appendChild(pdfLink);
      }
      td.appendChild(subtitle);

      // Bid friendly name (field_2636) — mirrors the SOW friendly name
      // shown under the SOW grid title.
      if (pkg.bidName) {
        td.appendChild(el('div', 'scw-bid-review__col-friendly-name', pkg.bidName));
      }

      if (pkg.crPendingCount > 0 && pkg.crLinkUrl) {
        var crLink = document.createElement('a');
        crLink.href = pkg.crLinkUrl;
        // Open in a new tab so the bid comparisons page stays intact.
        // The Knack link is a child-page hash route — clicking it in
        // the same tab navigates the whole scene to bid-revision-details
        // and forces the user to close the modal + hit Back to return
        // to the comparison grid. New tab keeps state.
        crLink.target = '_blank';
        crLink.rel = 'noopener';
        crLink.className = 'scw-bid-review__cr-link';
        crLink.textContent = pkg.crPendingCount + ' pending CR' + (pkg.crPendingCount !== 1 ? 's' : '');
        td.appendChild(crLink);
      }

      // Attached documents (DOC_files records connected to this bid
      // package via field_2421).
      var pkgDocsIdx = buildDocsIndex();
      var pkgDocs = pkgDocsIdx.byBid[pkg.id];
      var pkgDocsBlock = buildDocsBlock(pkgDocs, 'Documents');
      if (pkgDocsBlock) td.appendChild(pkgDocsBlock);

      r2.appendChild(td);
    }

    r2.appendChild(el('td', 'scw-bid-review__cr-col')); // CR column
    rows.push(r2);

    // ═══ ROW 3: Action buttons ═══
    var r3 = el('tr', 'scw-bid-review__header-row scw-bid-review__header-actions');
    r3.appendChild(el('td', '')); // line item
    r3.appendChild(el('td', '')); // photos column placeholder

    // SOW action cell — sits in the same column as the SOW detail cell
    // in r2, holds the margin-low warning button stack + Preview
    // Proposal pill. Mirrors the bid-column header-action-cell.
    var sowActionTd = el('td', 'scw-bid-review__header-action-cell scw-bid-review__sow-action-cell');
    if (sowParts && sowParts.actions) sowActionTd.appendChild(sowParts.actions);
    r3.appendChild(sowActionTd);

    for (var k = 0; k < sowGrid.packages.length; k++) {
      var pkg2 = sowGrid.packages[k];
      var statusVal2 = pkg2.bidStatus || '';
      var isSubmitted = /^submitted$/i.test(String(statusVal2).trim());
      var actionTd = el('td', 'scw-bid-review__header-action-cell');
      tagPkgCol(actionTd, sowGrid.sowId, pkg2.id);

      if (isSubmitted) {
        actionTd.appendChild(btn(
          '\u2190 Update SOW to match Bid', 'adopt',
          { 'data-action': 'package_copy_to_sow', 'data-package-id': pkg2.id, 'data-sow-id': sowGrid.sowId }
        ));
        actionTd.appendChild(btn(
          '+ Create new SOW', 'create',
          { 'data-action': 'package_create_sow', 'data-package-id': pkg2.id, 'data-sow-id': sowGrid.sowId }
        ));
        actionTd.appendChild(btn(
          'Reopen Bid', 'reopen',
          { 'data-action': 'package_reopen_bid', 'data-package-id': pkg2.id, 'data-sow-id': sowGrid.sowId }
        ));
      }

      r3.appendChild(actionTd);
    }

    // CR column buttons
    var crTd = el('td', 'scw-bid-review__header-action-cell scw-bid-review__cr-col');
    var pending = (ns.changeRequests && ns.changeRequests.getPending) ? ns.changeRequests.getPending() : {};
    var pkgIds = Object.keys(pending);
    for (var si = 0; si < pkgIds.length; si++) {
      var sPkg = pending[pkgIds[si]];
      if (!sPkg || !sPkg.items || !sPkg.items.length) continue;
      crTd.appendChild(btn(
        'Submit Change Request (' + sPkg.items.length + ')', 'cr-submit sm',
        { 'data-action': 'cr_submit', 'data-pkg-id': pkgIds[si] }
      ));
    }
    if (pkgIds.length) {
      crTd.appendChild(btn('Clear All', 'cr-clear sm', { 'data-action': 'cr_clear_all' }));
    }
    r3.appendChild(crTd);
    rows.push(r3);

    return rows;
  }

  // ── cabling visibility helper ─────────────────────────────────

  /** Cabling fields only apply to Camera / Reader buckets. */
  var CABLING_BUCKET_ID = '6481e5ba38f283002898113c';

  function showCabling(row) {
    if (row.proposalBucketId === CABLING_BUCKET_ID) return true;
    if (!row.proposalBucket) return false;
    var b = row.proposalBucket.toLowerCase().trim();
    return b === 'camera' || b === 'cameras' ||
           b === 'reader' || b === 'readers';
  }

  // ── existing cabling chip ────────────────────────────────────

  function isYes(val) {
    return val && /^yes$/i.test(String(val).trim());
  }

  // ── connected-device visibility helper ───────────────────────

  /**
   * Show Connected Devices when field_2374 is Yes on any bid cell
   * in the row, OR when field_2231 is Yes on the SOW item
   * (especially when no bid item is present).
   */
  function showConnectedDevices(row) {
    // SOW side: field_2231
    if (isYes(row.sowMapConn)) return true;
    // Bid side (row-level from meta record)
    if (isYes(row.bidMapConn)) return true;
    // Bid side: check every package cell for field_2374
    var pkgs = Object.keys(row.cellsByPackage || {});
    for (var i = 0; i < pkgs.length; i++) {
      if (isYes(row.cellsByPackage[pkgs[i]].bidMapConn)) return true;
    }
    return false;
  }

  // ── qty visibility helper ─────────────────────────────────────

  /** Show Qty when EITHER SOW qty or any bid cell qty is > 1. */
  function showQty(row) {
    if (row.sowQty > 1) return true;
    var pkgs = Object.keys(row.cellsByPackage || {});
    for (var i = 0; i < pkgs.length; i++) {
      if (row.cellsByPackage[pkgs[i]].qty > 1) return true;
    }
    return false;
  }

  function buildCablingChip(val) {
    return buildBoolChip('Existing', val);
  }

  /** Generic Yes/No chip with a label prefix. */
  function buildBoolChip(label, val) {
    var yes = isYes(val);
    var chip = el('span', 'scw-bid-review__cabling-chip ' +
      (yes ? 'scw-bid-review__cabling-chip--on' : 'scw-bid-review__cabling-chip--off'),
      label + ': ' + (yes ? 'Yes' : 'No'));
    return chip;
  }

  // ── SOW detail cell ─────────────────────────────────────────

  /** diff class helper — appends --field-diff modifier when flagged */
  var DIFF_CLS = 'scw-bid-review__field-diff';

  function buildSowDetailCell(row, cablingVisible, connDevVisible, qtyVisible, diffs, sowId, packages, diffsByPkg) {
    var td = el('td', 'scw-bid-review__sow-detail');
    // Removed-from-SOW: the line item is no longer on this SOW but still
    // shows here because the bid record references the SOW. Give the SOW
    // cell a blue dashed "cut-out" border so it reads as detached — the
    // bid columns stay normal (the item really is still on the bid).
    if (row.offSow) td.className += ' scw-bid-review__sow-detail--off-sow';

    // Lazy-built top-right action stack. "Disconnect from SOW" (and
    // the "Not Included in SOW" tag) sits here. The old "Revise bid
    // to match" entry was removed — that action now lives on each
    // bid-column cell's Revise chooser (see buildDataCell).
    var topRightStack = null;
    function getTopRightStack() {
      if (!topRightStack) {
        topRightStack = el('div', 'scw-bid-review__cell-actions');
        td.appendChild(topRightStack);
      }
      return topRightStack;
    }

    if (!row.sowItem) {
      // NEW row \u2014 no matching SOW item yet. Replace the "\u2014" placeholder
      // with an "+ Add to SOW" button so the user can spawn a SOW record
      // directly from this row (Make webhook, see CFG.addToSowWebhook).
      td.className += ' scw-bid-review__cell--missing';
      td.appendChild(btn('+ Add to SOW', 'create', {
        'data-action': 'row_add_to_sow',
        'data-row-id': row.id,
        'data-sow-id': sowId || '',
      }));
      return td;
    }

    // Bottom entry of the top-right stack. DISCONNECT FROM SOW is
    // temporarily disabled — kept here in case we want it back. The
    // "Not Included in SOW" tag for already-disconnected rows is also
    // hidden by the same toggle.
    //
    // To restore: flip SHOW_DISCONNECT to true.
    var SHOW_DISCONNECT = false;
    if (SHOW_DISCONNECT && row.sowItem && sowId) {
      var dStack = getTopRightStack();
      if (row.offSow) {
        dStack.appendChild(el('span', 'scw-bid-review__off-sow-tag', 'Not Included in SOW'));
      } else {
        var dBtn = el('button',
          'scw-bid-review__cell-action scw-bid-review__cell-action--remove',
          'Disconnect from SOW');
        dBtn.type = 'button';
        dBtn.setAttribute('data-action',  'cell_disconnect_from_sow');
        dBtn.setAttribute('data-row-id',  row.id);
        dBtn.setAttribute('data-sow-id',  sowId);
        dBtn.setAttribute('data-sow-item-id', row.sowItem);
        dStack.appendChild(dBtn);
      }
    }

    if (row.sowProduct) {
      var prodEl = el('div', 'scw-bid-review__cell-label', row.sowProduct);
      if (diffs && diffs.product) prodEl.classList.add(DIFF_CLS);
      td.appendChild(prodEl);
    }

    var sowMdf = row.sowMdfIdf || '';
    if (sowMdf) {
      var mdfEl = el('div', 'scw-bid-review__cell-qty');
      mdfEl.appendChild(el('span', 'scw-bid-review__field-label', 'MDF/IDF: '));
      mdfEl.appendChild(document.createTextNode(sowMdf));
      if (diffs && diffs.mdfIdf) mdfEl.classList.add(DIFF_CLS);
      td.appendChild(mdfEl);
    }

    if (qtyVisible && row.sowQty) {
      var qtyEl = el('div', 'scw-bid-review__cell-qty');
      qtyEl.appendChild(el('span', 'scw-bid-review__field-label', 'Qty: '));
      qtyEl.appendChild(document.createTextNode(row.sowQty));
      td.appendChild(qtyEl);
    }

    if (row.sowLaborDesc) {
      var ldEl = el('div', 'scw-bid-review__cell-labor-desc');
      ldEl.appendChild(el('span', 'scw-bid-review__field-label', 'Labor Desc: '));
      var ldVal = document.createElement('span');
      ldVal.className = 'scw-bid-review__cell-labor-desc-value';
      ldVal.innerHTML = row.sowLaborDesc;
      ldEl.appendChild(ldVal);
      if (diffs && diffs.laborDesc) ldEl.classList.add(DIFF_CLS);
      td.appendChild(ldEl);
    }

    if (connDevVisible && row.sowConnDevice) {
      var cdEl = el('div', 'scw-bid-review__cell-conn-device', row.sowConnDevice);
      if (diffs && diffs.connDevice) cdEl.classList.add(DIFF_CLS);
      td.appendChild(cdEl);
    }

    if (cablingVisible) {
      var cabEl = buildCablingChip(row.sowExistCabling);
      if (diffs && diffs.cabling) cabEl.classList.add(DIFF_CLS);
      td.appendChild(cabEl);

      var plnEl = buildBoolChip('Plenum', row.sowPlenum);
      if (diffs && diffs.plenum) plnEl.classList.add(DIFF_CLS);
      td.appendChild(plnEl);

      var extEl = buildBoolChip('Exterior', row.sowExterior);
      if (diffs && diffs.exterior) extEl.classList.add(DIFF_CLS);
      td.appendChild(extEl);

      if (row.sowDropLength) {
        var dlEl = el('div', 'scw-bid-review__cell-qty');
        dlEl.appendChild(el('span', 'scw-bid-review__field-label', 'Length: '));
        dlEl.appendChild(document.createTextNode(row.sowDropLength));
        if (diffs && diffs.dropLength) dlEl.classList.add(DIFF_CLS);
        td.appendChild(dlEl);
      }

      if (row.sowConduit) {
        var cnEl = el('div', 'scw-bid-review__cell-qty');
        cnEl.appendChild(el('span', 'scw-bid-review__field-label', 'Conduit: '));
        cnEl.appendChild(document.createTextNode(row.sowConduit));
        if (diffs && diffs.conduit) cnEl.classList.add(DIFF_CLS);
        td.appendChild(cnEl);
      }
    }

    if (row.sowFee) {
      var values = el('div', 'scw-bid-review__cell-values');
      var feeEl = el('span', 'scw-bid-review__cell-value', formatCurrency(row.sowFee));
      if (diffs && diffs.fee) feeEl.classList.add(DIFF_CLS);
      values.appendChild(feeEl);
      td.appendChild(values);
    }

    return td;
  }

  // ── data cell for a bid package column ──────────────────────

  function buildDataCell(cell, cablingVisible, connDevVisible, qtyVisible, diffs, opts) {
    var td = el('td');

    if (!cell) {
      td.className = 'scw-bid-review__cell--missing';
      td.textContent = '\u2014';
      return td;
    }

    // Top-right Revise + Remove buttons. `requireSubBid: No` rows
    // (informational items) skip these so we don\'t prompt for changes
    // on rows the bidder isn\'t actually pricing.
    if (opts && opts.rowId && opts.pkgId && opts.sowId) {
      var noSubBid = cell.requireSubBid && /^no$/i.test(String(cell.requireSubBid).trim());
      if (!noSubBid) {
        var baseAttrs = {
          'data-row-id':      opts.rowId,
          'data-package-id':  opts.pkgId,
          'data-sow-id':      opts.sowId,
          'data-vis-qty':     qtyVisible ? '1' : '0',
          'data-vis-cabling': cablingVisible ? '1' : '0',
          'data-vis-conn':    connDevVisible ? '1' : '0',
        };
        function withAction(act) {
          var copy = {};
          var bk = Object.keys(baseAttrs);
          for (var bki = 0; bki < bk.length; bki++) copy[bk[bki]] = baseAttrs[bk[bki]];
          copy['data-action'] = act;
          return copy;
        }

        // Build the action stack manually so we can inject a "CRs"
        // header above the buttons and swap the Revise button for a
        // chooser when there's a SOW mismatch.
        var wrap = el('div', 'scw-bid-review__cell-actions');

        // Small label so the user knows these buttons open a Change
        // Request flow (not a direct edit of the bid record).
        var hdr = el('div', 'scw-bid-review__cell-actions-header', 'CRs');
        wrap.appendChild(hdr);

        // Revise: when this bid mismatches the SOW for this row, offer
        // BOTH "Edit bid values" (free-form CR on the bid item) and
        // "Match SOW values" (the old "Revise bid to match" flow,
        // prefilled from SOW values). When there's nothing to match,
        // collapse to the simple Revise button.
        var bidMismatch = !!(diffs && diffs.any);
        if (bidMismatch) {
          var reviseChoices = [
            { label: 'Edit bid values',  attrs: withAction('cell_request_change') },
            { label: 'Match SOW values', attrs: withAction('cell_request_change_from_sow') },
          ];
          wrap.appendChild(buildOverflowMenu('Revise', 'revise', reviseChoices));
        } else {
          var reviseBtn = el('button',
            'scw-bid-review__cell-action scw-bid-review__cell-action--revise',
            'Revise');
          reviseBtn.type = 'button';
          var rAttrs = withAction('cell_request_change');
          var rKeys  = Object.keys(rAttrs);
          for (var rk = 0; rk < rKeys.length; rk++) reviseBtn.setAttribute(rKeys[rk], rAttrs[rKeys[rk]]);
          wrap.appendChild(reviseBtn);
        }

        var removeBtn = el('button',
          'scw-bid-review__cell-action scw-bid-review__cell-action--remove',
          'Remove');
        removeBtn.type = 'button';
        var rmAttrs = withAction('cell_remove_from_bid');
        var rmKeys  = Object.keys(rmAttrs);
        for (var rmk = 0; rmk < rmKeys.length; rmk++) removeBtn.setAttribute(rmKeys[rmk], rmAttrs[rmKeys[rmk]]);
        wrap.appendChild(removeBtn);

        td.appendChild(wrap);
      }
    }

    if (cell.productName) {
      var prodEl = el('div', 'scw-bid-review__cell-label', cell.productName);
      if (diffs && diffs.product) prodEl.classList.add(DIFF_CLS);
      td.appendChild(prodEl);
    }

    if (cell.bidMdfIdf) {
      var mdfEl = el('div', 'scw-bid-review__cell-qty');
      mdfEl.appendChild(el('span', 'scw-bid-review__field-label', 'MDF/IDF: '));
      mdfEl.appendChild(document.createTextNode(cell.bidMdfIdf));
      if (diffs && diffs.mdfIdf) mdfEl.classList.add(DIFF_CLS);
      td.appendChild(mdfEl);
    }

    if (qtyVisible && cell.qty) {
      var qtyEl = el('div', 'scw-bid-review__cell-qty');
      qtyEl.appendChild(el('span', 'scw-bid-review__field-label', 'Qty: '));
      qtyEl.appendChild(document.createTextNode(cell.qty));
      td.appendChild(qtyEl);
    }

    if (cell.laborDesc) {
      var ldEl = el('div', 'scw-bid-review__cell-labor-desc');
      ldEl.appendChild(el('span', 'scw-bid-review__field-label', 'Labor Desc: '));
      var ldVal = document.createElement('span');
      ldVal.className = 'scw-bid-review__cell-labor-desc-value';
      ldVal.innerHTML = cell.laborDesc;
      ldEl.appendChild(ldVal);
      if (diffs && diffs.laborDesc) ldEl.classList.add(DIFF_CLS);
      td.appendChild(ldEl);
    }

    if (connDevVisible && cell.bidConnDevice) {
      var cdEl = el('div', 'scw-bid-review__cell-conn-device', cell.bidConnDevice);
      if (diffs && diffs.connDevice) cdEl.classList.add(DIFF_CLS);
      td.appendChild(cdEl);
    }

    if (cablingVisible) {
      var cabEl = buildCablingChip(cell.bidExistCabling);
      if (diffs && diffs.cabling) cabEl.classList.add(DIFF_CLS);
      td.appendChild(cabEl);

      var plnEl = buildBoolChip('Plenum', cell.bidPlenum);
      if (diffs && diffs.plenum) plnEl.classList.add(DIFF_CLS);
      td.appendChild(plnEl);

      var extEl = buildBoolChip('Exterior', cell.bidExterior);
      if (diffs && diffs.exterior) extEl.classList.add(DIFF_CLS);
      td.appendChild(extEl);

      if (cell.bidDropLength) {
        var dlEl = el('div', 'scw-bid-review__cell-qty');
        dlEl.appendChild(el('span', 'scw-bid-review__field-label', 'Length: '));
        dlEl.appendChild(document.createTextNode(cell.bidDropLength));
        if (diffs && diffs.dropLength) dlEl.classList.add(DIFF_CLS);
        td.appendChild(dlEl);
      }

      if (cell.bidConduit) {
        var cnEl = el('div', 'scw-bid-review__cell-qty');
        cnEl.appendChild(el('span', 'scw-bid-review__field-label', 'Conduit: '));
        cnEl.appendChild(document.createTextNode(cell.bidConduit));
        if (diffs && diffs.conduit) cnEl.classList.add(DIFF_CLS);
        td.appendChild(cnEl);
      }
    }

    if (cell.labor) {
      var values = el('div', 'scw-bid-review__cell-values');
      var feeEl = el('span', 'scw-bid-review__cell-value', formatCurrency(cell.labor));
      if (diffs && diffs.fee) feeEl.classList.add(DIFF_CLS);
      values.appendChild(feeEl);
      td.appendChild(values);
    }

    if (cell.notes) {
      td.appendChild(el('hr', 'scw-bid-review__cell-notes-divider'));
      var notesEl = el('div', 'scw-bid-review__cell-notes');
      notesEl.appendChild(el('span', 'scw-bid-review__field-label', 'Survey Note: '));
      notesEl.appendChild(document.createTextNode(cell.notes));
      td.appendChild(notesEl);
    }

    return td;
  }

  // Look at every cell tagged with .scw-bid-review__cr-col and decide
  // whether any of them carries renderable content. The column only
  // stays when there's a pending CR card (or a header submit/clear
  // button) — Add-to-bid menus alone are NOT enough to keep the
  // column visible, because that interaction has moved into the
  // data cells (see buildDataCell → inline + Add to bid pill).
  function tableHasCrContent(table) {
    var pendingCards = table.querySelectorAll(
      '.scw-bid-review__cr-col .scw-bid-cr-card'
    );
    if (pendingCards.length) return true;
    var headerCells = table.querySelectorAll('th.scw-bid-review__cr-col, td.scw-bid-review__header-action-cell.scw-bid-review__cr-col');
    for (var j = 0; j < headerCells.length; j++) {
      // The r1 title cell carries text; ignore it. We only count
      // header cells with element children (i.e. submit buttons).
      if (headerCells[j].children.length > 0) return true;
    }
    return false;
  }

  // ── row actions cell ────────────────────────────────────────

  function buildRowActionsCell(row, packages, sowId, visibility) {
    var td = el('td', 'scw-bid-review__cr-col');
    var wrap = el('div', 'scw-bid-review__row-actions');

    var pending = (ns.changeRequests && ns.changeRequests.getPending) ? ns.changeRequests.getPending() : {};

    // Collect pending CR cards to surface in this column. Revise,
    // Remove, and Add-to-bid now all live in the data cells, so
    // this column carries pending-CR cards only.
    var pendingCards  = [];

    for (var ci = 0; ci < packages.length; ci++) {
      var cpkg  = packages[ci];
      var ccell = row.cellsByPackage[cpkg.id];

      // Shared data attributes for this package
      var attrs = {
        'data-row-id':      row.id,
        'data-package-id':  cpkg.id,
        'data-sow-id':      sowId,
        'data-vis-qty':     visibility.qty ? '1' : '0',
        'data-vis-cabling': visibility.cabling ? '1' : '0',
        'data-vis-conn':    visibility.connDevice ? '1' : '0',
      };

      // NEW rows (no SOW match) get an "+ Add to SOW" button in the SOW
      // column itself (see buildSowDetailCell) — the per-package "Create"
      // option in this Sub Bid Revisions column was redundant and is gone.

      // Find pending item for this row+package (even without a bid cell,
      // for auto-created add-to-bid items from connection field selections)
      var pendingItem = null;
      if (pending[cpkg.id] && pending[cpkg.id].items) {
        // Match by row id (add/revise/normal rows) OR the bid cell's own
        // record id — a removal CR is keyed by the exact bid record, which on
        // an off-SOW row shared across bids differs from the row's meta id.
        for (var pi = 0; pi < pending[cpkg.id].items.length; pi++) {
          var _pit = pending[cpkg.id].items[pi];
          if (_pit.rowId === row.id || (ccell && ccell.id && _pit.rowId === ccell.id)) {
            pendingItem = _pit; break;
          }
        }
      }

      // Show pending card (works for both bid items and noBid add-to-bid items)
      if (pendingItem && ns.changeRequests && ns.changeRequests.buildSummaryCard) {
        var card = ns.changeRequests.buildSummaryCard(pendingItem, cpkg.id, cpkg.name);
        card.setAttribute('data-action', 'cell_request_change');
        var aKeys = Object.keys(attrs);
        for (var ai = 0; ai < aKeys.length; ai++) card.setAttribute(aKeys[ai], attrs[aKeys[ai]]);
        pendingCards.push(card);
      }

      // Revise + Remove now live in the data cells (top-right action
      // stack) — see buildDataCell + buildSowDetailCell. The right-
      // side Sub Bid Revisions cell only carries pending CR cards and
      // Add buttons (for noBid rows).
    }

    // "+ Add to bid" for noBid rows now lives inline in the data
    // cell (see buildDataRow → cell_add_to_bid button next to the
    // NOT ON BID / NOT SURVEYED badge). Surfacing it there lets
    // the Sub Bid Revisions column collapse entirely when there
    // are no pending CRs to submit.

    for (var pc = 0; pc < pendingCards.length; pc++) {
      wrap.appendChild(pendingCards[pc]);
    }

    td.appendChild(wrap);
    return td;
  }

  // ── mismatch comparison ──────────────────────────────────────

  /**
   * Compare SOW detail vs a bid cell on paired fields.
   * Returns null if nothing to compare (no SOW item or no cell),
   * otherwise an object with boolean flags for each differing field:
   *   { any, product, laborDesc, fee, cabling, connDevice }
   */
  function getMismatches(row, cell, cablingVisible, connDevVisible) {
    // No SOW item or no bid cell — nothing to compare
    if (!row.sowItem || !cell) return null;

    // Normalize for comparison: strip HTML, collapse whitespace,
    // lowercase, trim. Labor desc fields can carry rich-text markup
    // (bold, line breaks) that\'s visually meaningful but shouldn\'t
    // flip the mismatch flag if the spoken text matches.
    function norm(v) {
      if (v == null) return '';
      return String(v)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .trim();
    }

    var m = {
      any:        false,
      product:    norm(row.sowProduct)   !== norm(cell.productName),
      laborDesc:  norm(row.sowLaborDesc) !== norm(cell.laborDesc),
      fee:        row.sowFee !== cell.labor,
      cabling:    cablingVisible  ? norm(row.sowExistCabling) !== norm(cell.bidExistCabling) : false,
      connDevice: connDevVisible  ? norm(row.sowConnDevice)   !== norm(cell.bidConnDevice)   : false,
      plenum:     cablingVisible  ? norm(row.sowPlenum)       !== norm(cell.bidPlenum)        : false,
      exterior:   cablingVisible  ? norm(row.sowExterior)     !== norm(cell.bidExterior)      : false,
      dropLength: cablingVisible  ? norm(row.sowDropLength)   !== norm(cell.bidDropLength)    : false,
      conduit:    cablingVisible  ? norm(row.sowConduit)      !== norm(cell.bidConduit)       : false,
      mdfIdf:     norm(row.sowMdfIdf) !== norm(cell.bidMdfIdf),
    };

    if (CFG.debug && (m.mdfIdf || row.sowMdfIdf || cell.bidMdfIdf)) {
      SCW.debug('[BidReview] MDF/IDF compare:', row.displayLabel,
        '| sowMdfIdf:', JSON.stringify(row.sowMdfIdf),
        '| row.mdfIdf:', JSON.stringify(row.mdfIdf),
        '| cell.bidMdfIdf:', JSON.stringify(cell.bidMdfIdf),
        '| diff?', m.mdfIdf);
    }

    m.any = m.product || m.laborDesc || m.fee || m.cabling || m.connDevice ||
            m.plenum || m.exterior || m.dropLength || m.conduit || m.mdfIdf;
    return m;
  }

  // ── per-row photos (dedicated column) ───────────────────────
  // Surfaces line-item photo evidence in a column of its own so
  // reviewers can skim "did the surveyor get evidence?" without
  // expanding rows. Source: view_3921 (sowItemsViewKey) — same
  // backing view as the click-to-expand worksheet, so what shows
  // here matches what shows on expand.
  //
  // Cache: view_3921 re-renders frequently (after inline edits, on
  // silent refresh) and during the rebuild its tbody is briefly
  // empty. Without a cache, the comparison grid rebuilds at the
  // same moment, finds zero photos, and the column flashes empty.
  // We cache by sowItemId so a re-render with no source row falls
  // back to the last-known set of URLs.
  // Single large thumb per row — clicking it opens the row's expand
  // panel WITH a side-by-side photo viewer (see init.js openWithPhoto)
  // so the reviewer can see the full photo and edit the line item at
  // the same time. Surplus shown as a "+N more" pill that opens the
  // viewer on the first extra photo.
  var ROW_PHOTO_VISIBLE = 1;
  var _photoCache = Object.create(null);

  // ── Per-pass DOM row index ────────────────────────────────────
  // scrapeRowPhotoUrls used to run up to three whole-document
  // querySelector('tr[id=…]') calls PER ROW; on the ~15k-node compare
  // scene that was ~1.7s of a single grid build (perf trace
  // 2026-07-30). Index the candidate rows ONCE per synchronous pass;
  // the index self-clears on the next macrotask so later re-renders
  // (and Knack refetches) get a fresh scan.
  // Buckets build LAZILY — a single-row open (one scrape call) that
  // resolves in the first bucket must not pay for scanning the other
  // two. A full-grid render fills whichever buckets its rows actually
  // need, still once per macrotask. Do NOT shortcut the ws lookup with
  // getElementById: the native view_3921 <tr> shares the same record-id
  // id as the wsTr, so the class-scoped scan is load-bearing.
  var _rowIdx = null;
  function rowIdxRoot() {
    if (!_rowIdx) {
      _rowIdx = { ws: null, sow: null, bid: null };
      setTimeout(function () { _rowIdx = null; }, 0);
    }
    return _rowIdx;
  }
  function fillBucket(els) {
    var map = Object.create(null);
    for (var i = 0; i < els.length; i++) {
      if (!map[els[i].id]) map[els[i].id] = els[i];
    }
    return map;
  }
  function wsRowIdx() {
    var r = rowIdxRoot();
    if (!r.ws) r.ws = fillBucket(document.querySelectorAll('tr.scw-ws-row[id]'));
    return r.ws;
  }
  function sowRowIdx() {
    var r = rowIdxRoot();
    if (!r.sow) {
      var root = document.getElementById(CFG.sowItemsViewKey || 'view_3921');
      r.sow = root ? fillBucket(root.querySelectorAll('tr[id]')) : Object.create(null);
    }
    return r.sow;
  }
  function bidRowIdx() {
    var r = rowIdxRoot();
    if (!r.bid) {
      var root = document.getElementById('view_3680');
      r.bid = root ? fillBucket(root.querySelectorAll('tr[id]')) : Object.create(null);
    }
    return r.bid;
  }

  function scrapeRowPhotoUrls(rowId, bidRowId) {
    if (!rowId && !bidRowId) return null;
    // Primary path — photos live inside the wsTr (.scw-ws-row) that
    // device-worksheet builds from view_3921 (SOW item) rows. Each
    // photo is a .scw-inline-photo-card injected by inline-photo-row.js.
    // The wsTr may be in view_3921's tbody or moved into our expand
    // panel when the row is open.
    var wsTr = rowId ? wsRowIdx()[rowId] : null;
    var urls = [];
    if (wsTr) {
      var cards = wsTr.querySelectorAll(
        '.scw-inline-photo-card[data-photo-has-image="true"]'
      );
      for (var i = 0; i < cards.length; i++) {
        var img = cards[i].querySelector('img');
        if (!img) continue;
        var url = img.getAttribute('src') || img.getAttribute('data-kn-img-gallery') || '';
        if (url) urls.push(url);
      }
    }

    // SOW-items source view (view_3921) native <tr> — the wsTr +
    // .scw-inline-photo-card path above is INACTIVE when bid-review-v2 owns the
    // hidden view_3921: device-worksheet bails on the transform and
    // inline-photo-row skips off-screen views, so the card path yields nothing.
    // The native field_771 image cells are still in the (display:none) DOM, so
    // scrape them directly — same selector inline-photo-row / worksheet-v2 use,
    // keyed by the SOW item id (rowId). This is what restores SOW-side photos in
    // the v2 comparison grid's Photos column.
    if (!urls.length && rowId) {
      var sowTr = sowRowIdx()[rowId];
      if (sowTr) {
        var sowImgCells = sowTr.querySelectorAll('td[data-field-key="field_771"]');
        for (var sc = 0; sc < sowImgCells.length; sc++) {
          var sowSpans = sowImgCells[sc].querySelectorAll(
            'span[id][data-kn="connection-value"]'
          );
          for (var ss = 0; ss < sowSpans.length; ss++) {
            var sowImg = sowSpans[ss].querySelector('img[data-kn-img-gallery]') ||
                         sowSpans[ss].querySelector('img');
            if (!sowImg) continue;
            var sowU = sowImg.getAttribute('data-kn-img-gallery') ||
                       sowImg.getAttribute('src') || '';
            if (sowU) urls.push(sowU);
          }
        }
      }
    }

    // Fallback — bid records that have no matching SOW item (the
    // "+ Add to SOW" rows) have no wsTr because view_3921 never
    // produced one. The bid grid (view_3680) now carries its own
    // photo column (field_771 mirroring the SOW-side field).
    //
    // Two read paths, in order:
    //  a. view_3680's Knack model (works even when the view's
    //     accordion is collapsed and no <tr> is rendered).
    //  b. view_3680's native <tr> DOM (works when the accordion is
    //     open) — same selector inline-photo-row.js uses.
    var lookupId = bidRowId || rowId;
    if (!urls.length && lookupId) {
      try {
        var v3680 = window.Knack && Knack.views && Knack.views.view_3680;
        var rec   = v3680 && v3680.model && v3680.model.data &&
                    typeof v3680.model.data.get === 'function' &&
                    v3680.model.data.get(lookupId);
        if (rec) {
          var attrs = rec.attributes || rec;
          var raw   = attrs.field_771_raw;
          if (Array.isArray(raw)) {
            for (var ri = 0; ri < raw.length; ri++) {
              var r = raw[ri];
              if (!r) continue;
              // Knack image-field connection records expose a few url
              // shapes depending on field config — try the common ones.
              var u = r.url || r.thumb_url || r.image ||
                      (r.original && r.original.url) || '';
              if (!u && typeof r === 'string') u = r;
              if (u) urls.push(u);
            }
          }
        }
      } catch (e) { /* ignore */ }
    }
    if (!urls.length && lookupId) {
      var bidTr = bidRowIdx()[lookupId];
      if (bidTr) {
        var imgCells = bidTr.querySelectorAll('td[data-field-key="field_771"]');
        for (var ic = 0; ic < imgCells.length; ic++) {
          var spans = imgCells[ic].querySelectorAll(
            'span[id][data-kn="connection-value"]'
          );
          for (var s = 0; s < spans.length; s++) {
            var im = spans[s].querySelector('img[data-kn-img-gallery]')
                  || spans[s].querySelector('img');
            if (!im) continue;
            var u2 = im.getAttribute('data-kn-img-gallery') ||
                     im.getAttribute('src') || '';
            if (u2) urls.push(u2);
          }
        }
      }
    }

    // Only overwrite the cache when we got a non-empty read OR we
    // have no cached value yet — covers the moment when wsTr / bidTr
    // exists but photo records haven't been hydrated yet.
    var cacheKey = rowId || bidRowId;
    if (urls.length || !_photoCache[cacheKey]) {
      _photoCache[cacheKey] = urls;
    }
    if (window.SCW && SCW.CONFIG && SCW.CONFIG.debug) {
      console.log('[BidReview] scrapeRowPhotoUrls',
        { rowId: rowId, bidRowId: bidRowId, found: urls.length, urls: urls });
    }
    return _photoCache[cacheKey];
  }

  // Builds the contents of the Photos column cell for one row.
  // Returns a <td> ready to append. Empty when no photos (so the
  // column still claims its width and the row reads consistently).
  function buildPhotosCell(rowId, bidRowId) {
    var td = el('td', 'scw-bid-review__photos-cell');
    var urls = (rowId || bidRowId) ? scrapeRowPhotoUrls(rowId, bidRowId) : null;
    if (!urls || !urls.length) {
      td.appendChild(el('div', 'scw-bid-review__photos-empty', '—'));
      return td;
    }

    var stack = el('div', 'scw-bid-review__photos-stack');
    stack.setAttribute('title', urls.length + ' photo' +
      (urls.length === 1 ? '' : 's') + ' — click to open the editor with a full-size viewer');

    function openViewer(idx, e) {
      // Suppress the row's click-to-expand: we'll drive expansion
      // ourselves so the viewer mounts together with the panel.
      if (e) { e.preventDefault(); e.stopPropagation(); }
      var rowTr = td.parentNode;   // the data row this cell belongs to
      if (!rowTr || !ns.openWithPhoto) return;
      ns.openWithPhoto(rowTr, urls, idx);
    }

    var visible = Math.min(ROW_PHOTO_VISIBLE, urls.length);
    for (var v = 0; v < visible; v++) {
      (function (idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-bid-review__photos-thumb';
        btn.addEventListener('click', function (e) { openViewer(idx, e); });
        var thumb = document.createElement('img');
        thumb.src = urls[idx];
        thumb.alt = '';
        thumb.loading = 'lazy';
        btn.appendChild(thumb);
        stack.appendChild(btn);
      })(v);
    }
    var hidden = urls.length - visible;
    if (hidden > 0) {
      (function (idx) {
        var more = el('span', 'scw-bid-review__photos-more', '+' + hidden + ' more');
        more.addEventListener('click', function (e) { openViewer(idx, e); });
        stack.appendChild(more);
      })(visible);
    }
    td.appendChild(stack);
    return td;
  }

  // ── data row ────────────────────────────────────────────────

  function buildDataRow(row, packages, sowId) {
    var rowClass = 'scw-bid-review__row';
    if (row.noBid) rowClass += ' scw-bid-review__row--no-bid';
    if (row.surveyNoBid) rowClass += ' scw-bid-review__row--survey-no-bid';
    if (row.sowItem) rowClass += ' scw-bid-review__row--expandable';
    // Bid-only rows (no SOW item) still get expand-on-click so the user
    // can see the photo viewer and bid details in a panel. The expand
    // panel skips the wsTr injection — there's no SOW worksheet card to
    // show. Detected later via missing data-sow-item-id.
    else if (!row.noBid && !row.surveyNoBid) {
      rowClass += ' scw-bid-review__row--expandable scw-bid-review__row--bid-only';
    }
    var tr = el('tr', rowClass);
    tr.setAttribute('data-row-id', row.id);
    if (row.sowItem) {
      tr.setAttribute('data-sow-item-id', row.sowItem);
      tr.setAttribute('aria-expanded', 'false');
    }

    // Line item label cell
    // Only show displayLabel (field_2365) for Camera / Reader buckets
    var isCamReader = showCabling(row);
    var labelTd = el('td');
    if (row.noBid || row.surveyNoBid) {
      // Badge moved to bid-package columns — label cell matches sowItem style
      labelTd.className = 'scw-bid-review__sow-cell';
      if (isCamReader && row.displayLabel) {
        labelTd.appendChild(el('div', 'scw-bid-review__row-label', row.displayLabel));
      }
    } else if (row.sowItem) {
      labelTd.className = 'scw-bid-review__sow-cell';
      if (isCamReader && row.displayLabel) {
        labelTd.appendChild(el('div', 'scw-bid-review__row-label', row.displayLabel));
      }
    } else {
      labelTd.className = 'scw-bid-review__sow-cell scw-bid-review__sow-cell--new';
      labelTd.appendChild(el('span', 'scw-bid-review__new-badge', 'NEW'));
      if (isCamReader && row.displayLabel) {
        labelTd.appendChild(el('div', 'scw-bid-review__row-label', row.displayLabel));
      }
    }

    // Per-row totals — Equipment Total (field_2269) above Install Fee
    // (field_2028). Render under the label so cameras get
    //   E-001
    //   Equip $375
    //   Install $750
    // and non-cam rows get the totals stacked on their own.
    if (row.sowItem || row.noBid || row.surveyNoBid) {
      if (row.sowEquipmentTotal || row.sowInstallFee) {
        var totals = el('div', 'scw-bid-review__row-totals');
        if (row.sowEquipmentTotal) {
          var equipLine = el('div', 'scw-bid-review__row-total scw-bid-review__row-total--equip');
          equipLine.appendChild(el('span', 'scw-bid-review__row-total-label', 'Equip'));
          equipLine.appendChild(el('span', 'scw-bid-review__row-total-value',
            formatCurrency(row.sowEquipmentTotal)));
          totals.appendChild(equipLine);
        }
        if (row.sowInstallFee) {
          var installLine = el('div', 'scw-bid-review__row-total scw-bid-review__row-total--install');
          installLine.appendChild(el('span', 'scw-bid-review__row-total-label', 'Install'));
          installLine.appendChild(el('span', 'scw-bid-review__row-total-value',
            formatCurrency(row.sowInstallFee)));
          totals.appendChild(installLine);
        }
        labelTd.appendChild(totals);
      }
    }
    tr.appendChild(labelTd);

    // Photos column — dedicated cell so thumbs can be tall enough
    // to read alongside the SOW/Bid cells. Empty for NEW rows that
    // don't have a SOW line item yet.
    // Always thread row.id through as the bid-side lookup id. For rows
    // that originate in view_3680 (bid+sow, surveyNoBid, or bid-only-no-
    // sow) row.id IS the view_3680 record id, so the model/DOM fallbacks
    // can find field_771 photos. For noBid rows (built from view_3921)
    // the lookup harmlessly misses and the wsTr scrape wins.
    tr.appendChild(buildPhotosCell(row.sowItem || null, row.id || null));

    // Cabling fields only shown/compared for Camera or Reader buckets
    var cablingVisible = showCabling(row);
    // Connected Devices: shown when bid has field_2374=Yes or SOW has field_2231=Yes
    var connDevVisible = showConnectedDevices(row);
    // Qty: shown when EITHER SOW or any bid cell has qty > 1
    var qtyVisible = showQty(row);

    // Per-package mismatch breakdown
    var diffsByPkg = {};
    // Aggregate: which fields differ in ANY package (for SOW detail highlight)
    var sowDiffs = { any: false, product: false, laborDesc: false, fee: false,
                     cabling: false, connDevice: false,
                     plenum: false, exterior: false, dropLength: false, conduit: false,
                     mdfIdf: false };

    for (var mi = 0; mi < packages.length; mi++) {
      var pkgId   = packages[mi].id;
      var pkgCell = row.cellsByPackage[pkgId] || null;
      var m       = getMismatches(row, pkgCell, cablingVisible, connDevVisible);
      diffsByPkg[pkgId] = m;

      if (m && m.any) {
        sowDiffs.any = true;
        if (m.product)    sowDiffs.product    = true;
        if (m.laborDesc)  sowDiffs.laborDesc  = true;
        if (m.fee)        sowDiffs.fee        = true;
        if (m.cabling)    sowDiffs.cabling    = true;
        if (m.connDevice) sowDiffs.connDevice = true;
        if (m.plenum)     sowDiffs.plenum     = true;
        if (m.exterior)   sowDiffs.exterior   = true;
        if (m.dropLength) sowDiffs.dropLength = true;
        if (m.conduit)    sowDiffs.conduit    = true;
        if (m.mdfIdf)     sowDiffs.mdfIdf     = true;
      }
    }

    // SOW detail cell — highlight cell + individual differing fields
    var sowTd = buildSowDetailCell(row, cablingVisible, connDevVisible, qtyVisible, sowDiffs.any ? sowDiffs : null, sowId, packages, diffsByPkg);
    if (sowDiffs.any) {
      sowTd.classList.add('scw-bid-review__cell--mismatch');
    }
    tr.appendChild(sowTd);

    // Package cells — highlight cell + individual differing fields
    for (var i = 0; i < packages.length; i++) {
      var pid = packages[i].id;
      var d   = diffsByPkg[pid];
      var dataTd = buildDataCell(
        row.cellsByPackage[pid] || null, cablingVisible, connDevVisible, qtyVisible, d,
        { rowId: row.id, pkgId: pid, sowId: sowId }
      );
      tagPkgCol(dataTd, sowId, pid);
      if (d && d.any) {
        dataTd.classList.add('scw-bid-review__cell--mismatch');
      }
      // Show bid-status badge in the package cell when there's no bid data
      if (!row.cellsByPackage[pid]) {
        var isMissingBid = false;
        if (row.surveyNoBid || row.noBid) {
          // Blue dashed cut-out (mirror of --off-sow on the SOW side):
          // the bid is detached from this row. The cell renders the
          // SAME data skeleton a normal bid cell would, populated from
          // the SOW item\'s values, so the reviewer sees product, qty,
          // chips, labor, notes, etc. — the only difference is the
          // dashed border + badge + CR action.
          dataTd.textContent = '';
          dataTd.classList.add('scw-bid-review__cell--no-bid-cutout');

          // CR action stack (CRs header + Reinstate/Add-to-bid button)
          var pendingAdds = (ns.changeRequests && ns.changeRequests.getPending) ? ns.changeRequests.getPending() : {};
          var alreadyPendingAdd = false;
          if (pendingAdds[pid] && pendingAdds[pid].items) {
            for (var ppi = 0; ppi < pendingAdds[pid].items.length; ppi++) {
              if (pendingAdds[pid].items[ppi].rowId === row.id &&
                  pendingAdds[pid].items[ppi].addToBid) {
                alreadyPendingAdd = true; break;
              }
            }
          }
          if (!alreadyPendingAdd) {
            var addWrap = el('div', 'scw-bid-review__cell-actions');
            addWrap.appendChild(el('div', 'scw-bid-review__cell-actions-header', 'CRs'));
            var addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'scw-bid-review__cell-action scw-bid-review__cell-action--reinstate';
            // surveyNoBid → was once surveyed, needs reinstating to the
            // bid. noBid → never surveyed, "add to bid". Color is green
            // either way (matches Revise/Remove button vocabulary).
            addBtn.textContent = row.surveyNoBid ? '+ Reinstate' : '+ Add to bid';
            addBtn.setAttribute('data-action',     'cell_add_to_bid');
            addBtn.setAttribute('data-row-id',     row.id);
            addBtn.setAttribute('data-package-id', pid);
            addBtn.setAttribute('data-sow-id',     sowId);
            addWrap.appendChild(addBtn);
            dataTd.appendChild(addWrap);
          }

          // Badge under the actions
          var badgeText = row.surveyNoBid ? 'NOT ON BID' : 'NOT SURVEYED';
          var badgeCls  = row.surveyNoBid
            ? 'scw-bid-review__survey-no-bid-badge'
            : 'scw-bid-review__no-bid-badge';
          dataTd.appendChild(el('span', badgeCls, badgeText));

          // Same field skeleton a normal bid cell renders — populated
          // from SOW values since there\'s no bid record. Lets the
          // reviewer see exactly what would be on the bid if the
          // bidder reinstated / added it.
          if (row.sowProduct) {
            dataTd.appendChild(el('div', 'scw-bid-review__cell-label', row.sowProduct));
          }
          if (qtyVisible && row.sowQty) {
            var qtyEl2 = el('div', 'scw-bid-review__cell-qty');
            qtyEl2.appendChild(el('span', 'scw-bid-review__field-label', 'Qty: '));
            qtyEl2.appendChild(document.createTextNode(row.sowQty));
            dataTd.appendChild(qtyEl2);
          }
          if (row.sowLaborDesc) {
            var ldEl2 = el('div', 'scw-bid-review__cell-labor-desc');
            ldEl2.appendChild(el('span', 'scw-bid-review__field-label', 'Labor Desc: '));
            var ldVal2 = document.createElement('span');
            ldVal2.className = 'scw-bid-review__cell-labor-desc-value';
            ldVal2.innerHTML = row.sowLaborDesc;
            ldEl2.appendChild(ldVal2);
            dataTd.appendChild(ldEl2);
          }
          if (connDevVisible && row.sowConnDevice) {
            var cdLabel = Array.isArray(row.sowConnDevice)
              ? row.sowConnDevice.join(', ')
              : row.sowConnDevice;
            if (cdLabel) {
              dataTd.appendChild(el('div', 'scw-bid-review__cell-conn-device', cdLabel));
            }
          }
          if (cablingVisible) {
            dataTd.appendChild(buildCablingChip(row.sowExistCabling));
            dataTd.appendChild(buildBoolChip('Plenum',   row.sowPlenum));
            dataTd.appendChild(buildBoolChip('Exterior', row.sowExterior));
            if (row.sowDropLength) {
              var dlEl2 = el('div', 'scw-bid-review__cell-qty');
              dlEl2.appendChild(el('span', 'scw-bid-review__field-label', 'Length: '));
              dlEl2.appendChild(document.createTextNode(row.sowDropLength));
              dataTd.appendChild(dlEl2);
            }
            if (row.sowConduit) {
              var cnEl2 = el('div', 'scw-bid-review__cell-qty');
              cnEl2.appendChild(el('span', 'scw-bid-review__field-label', 'Conduit: '));
              cnEl2.appendChild(document.createTextNode(row.sowConduit));
              dataTd.appendChild(cnEl2);
            }
          }
          var sowFee = row.sowFee || row.sowInstallFee || row.sowEquipmentTotal;
          if (sowFee) {
            var valsEl2 = el('div', 'scw-bid-review__cell-values');
            valsEl2.appendChild(el('span', 'scw-bid-review__cell-value',
              formatCurrency(sowFee)));
            dataTd.appendChild(valsEl2);
          }
          if (row.surveyNotes) {
            dataTd.appendChild(el('hr', 'scw-bid-review__cell-notes-divider'));
            var notesEl2 = el('div', 'scw-bid-review__cell-notes');
            notesEl2.appendChild(el('span', 'scw-bid-review__field-label', 'Survey Note: '));
            notesEl2.appendChild(document.createTextNode(row.surveyNotes));
            dataTd.appendChild(notesEl2);
          }
          isMissingBid = true;
        }
      }
      tr.appendChild(dataTd);
    }

    // Row actions (with visibility flags for change request filtering)
    tr.appendChild(buildRowActionsCell(row, packages, sowId, {
      qty: qtyVisible, cabling: cablingVisible, connDevice: connDevVisible
    }));

    return tr;
  }

  // ── collapsible group header row ─────────────────────────────

  function buildGroupHeader(group, colSpan, rowCount, collapsed) {
    var label   = group.label;

    var tr = el('tr', 'scw-bid-review__group-header');
    tr.setAttribute('role', 'button');
    tr.setAttribute('tabindex', '0');
    tr.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (collapsed) tr.classList.add('scw-bid-review__group-header--collapsed');

    var td = el('td');
    td.setAttribute('colspan', colSpan);

    // Inner flex wrapper (flex on <td> breaks table width)
    var inner = el('div', 'scw-bid-review__grp-inner');

    // Chevron
    var chevron = el('span', 'scw-bid-review__grp-chevron');
    chevron.innerHTML = CHEVRON_SVG;
    inner.appendChild(chevron);

    // Label
    inner.appendChild(el('span', 'scw-bid-review__grp-title', label));

    // Count pill
    if (rowCount > 0) {
      inner.appendChild(el('span', 'scw-bid-review__grp-count', String(rowCount)));
    }

    td.appendChild(inner);
    tr.appendChild(td);

    // Toggle: hide/show sibling rows until next group header. The
    // detail row (if present) collapses with the rest of the group.
    tr.addEventListener('click', function () {
      var expanded = tr.getAttribute('aria-expanded') === 'true';
      tr.setAttribute('aria-expanded', String(!expanded));
      tr.classList.toggle('scw-bid-review__group-header--collapsed', expanded);

      // Walk next siblings and toggle visibility
      var sibling = tr.nextElementSibling;
      while (sibling) {
        if (sibling.classList.contains('scw-bid-review__group-header')) break;
        sibling.style.display = expanded ? 'none' : '';
        sibling = sibling.nextElementSibling;
      }
      persistAccordionState();
    });

    tr.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tr.click();
      }
    });

    return tr;
  }

  // ── L1 survey-notes callout row ─────────────────────────────
  // Survey notes (field_2457 on view_3822) are the single most
  // actionable thing the surveyor leaves for the reviewer; burying
  // them in the same band as photos and SCW notes makes them easy to
  // miss. This row promotes them to a dedicated amber callout
  // mounted immediately under the L1 header so they are the first
  // thing read inside an expanded MDF/IDF group.
  // Returns null when the source row is missing or the notes field
  // is empty (no callout = no clutter).
  function buildL1SurveyNotesRow(mdfIdfId, colSpan) {
    var view = document.getElementById(CFG.mdfIdfViewKey);
    var sourceTr = view ? view.querySelector('tbody tr[id="' + mdfIdfId + '"]') : null;
    if (!sourceTr) return null;

    var surveyText = readRowFieldText(sourceTr, 'field_2457');
    if (!surveyText) return null;

    var tr = el('tr', 'scw-bid-review__l1-survey-notes-row');
    var td = el('td', 'scw-bid-review__l1-survey-notes-cell');
    td.setAttribute('colspan', colSpan);

    var wrap = el('div', 'scw-bid-review__l1-survey-notes-wrap');
    // SVG clipboard/notepad icon — picked over an emoji so it
    // renders consistently across browsers and inherits currentColor
    // for the amber palette.
    var icon = document.createElement('span');
    icon.className = 'scw-bid-review__l1-survey-notes-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
      '<polyline points="14 2 14 8 20 8"/>' +
      '<line x1="9" y1="13" x2="15" y2="13"/>' +
      '<line x1="9" y1="17" x2="15" y2="17"/>' +
      '</svg>';
    wrap.appendChild(icon);

    var body = el('div', 'scw-bid-review__l1-survey-notes-body');
    body.appendChild(el('div', 'scw-bid-review__l1-survey-notes-label', 'Survey Notes'));
    body.appendChild(el('div', 'scw-bid-review__l1-survey-notes-text', surveyText));
    wrap.appendChild(body);

    td.appendChild(wrap);
    tr.appendChild(td);
    return tr;
  }

  // ── L1 detail row (photos + SCW Notes) ──────────────────────
  // Source: view_3822 (mdfIdfViewKey). Auto-rendered right after the
  // survey-notes callout for each L1 group header by buildBodyRows so
  // the details are visible whenever the group is expanded — no
  // separate toggle. Reads field_771 (photos) and field_1643 (SCW
  // notes) for the MDF/IDF record matching mdfIdfId. Survey notes
  // (field_2457) are surfaced separately by buildL1SurveyNotesRow so
  // they read with more weight. Returns null when the source row
  // isn't on the page or has no surfacable content.

  function buildL1DetailRow(mdfIdfId, colSpan) {
    var view = document.getElementById(CFG.mdfIdfViewKey);
    var sourceTr = view ? view.querySelector('tbody tr[id="' + mdfIdfId + '"]') : null;
    // No source data on the page → don't add an empty row at all.
    // (Callers check for null before appending to the fragment.)
    if (!sourceTr) return null;

    var wrap = el('div', 'scw-bid-review__l1-detail-wrap');

    // Photos (field_771) — gallery thumb strip from connection-value
    // spans. Each img carries data-kn-img-gallery with the full-size
    // URL; we surface that as the link target so clicks open the full
    // image in a new tab.
    var photoCell = null;
    var cells = sourceTr.getElementsByTagName('td');
    for (var ci = 0; ci < cells.length; ci++) {
      if (cells[ci].getAttribute('data-field-key') === 'field_771') {
        photoCell = cells[ci]; break;
      }
    }
    var imgUrls = [];
    if (photoCell) {
      var imgSpans = photoCell.querySelectorAll('span[id][data-kn="connection-value"]');
      for (var si = 0; si < imgSpans.length; si++) {
        var img = imgSpans[si].querySelector('img[data-kn-img-gallery], img');
        if (!img) continue;
        var url = img.getAttribute('data-kn-img-gallery') || img.getAttribute('src') || '';
        if (url) imgUrls.push(url);
      }
    }
    if (imgUrls.length) {
      var photoSection = el('div', 'scw-bid-review__l1-detail-section');
      photoSection.appendChild(el('div', 'scw-bid-review__l1-detail-label', 'Photos'));
      var photoStrip = el('div', 'scw-bid-review__l1-detail-photos');
      for (var pi = 0; pi < imgUrls.length; pi++) {
        var a = document.createElement('a');
        a.href = imgUrls[pi];
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'scw-bid-review__l1-detail-photo';
        var thumb = document.createElement('img');
        thumb.src = imgUrls[pi];
        thumb.alt = '';
        thumb.loading = 'lazy';
        a.appendChild(thumb);
        photoStrip.appendChild(a);
      }
      photoSection.appendChild(photoStrip);
      wrap.appendChild(photoSection);
    }

    // SCW Notes (field_1643)
    var scwText = readRowFieldText(sourceTr, 'field_1643');
    if (scwText) {
      var s2 = el('div', 'scw-bid-review__l1-detail-section');
      s2.appendChild(el('div', 'scw-bid-review__l1-detail-label', 'SCW Notes'));
      s2.appendChild(el('div', 'scw-bid-review__l1-detail-text', scwText));
      wrap.appendChild(s2);
    }

    // Nothing to show for this headend — skip the row entirely so the
    // user doesn't see an empty band beneath every group with no data.
    if (!wrap.children.length) return null;

    var tr = el('tr', 'scw-bid-review__l1-detail-row');
    var td = el('td', 'scw-bid-review__l1-detail-cell');
    td.setAttribute('colspan', colSpan);
    td.appendChild(wrap);
    tr.appendChild(td);
    return tr;
  }

  // ── assemble rows from grouped state ────────────────────────

  // MDF/IDF groups start collapsed on every render. The grid leads with
  // many groups, so opening them all buries the comparison; the reviewer
  // expands the one they're working in. Hiding each group's rows up front
  // mirrors the header click-toggle's display:none walk.
  var GROUPS_START_COLLAPSED = true;

  function buildBodyRows(groups, packages, colSpan, sowId) {
    var frag = document.createDocumentFragment();

    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi];

      // Count all rows including subgroups
      var totalRows = group.rows.length;
      if (group.subgroups) {
        for (var ci = 0; ci < group.subgroups.length; ci++) {
          totalRows += group.subgroups[ci].rows.length;
        }
      }

      // Only hide child rows when there's a header to expand them again.
      var hideChildren = GROUPS_START_COLLAPSED && !!group.label;
      function appendChild(node) {
        if (!node) return;
        if (hideChildren) node.style.display = 'none';
        frag.appendChild(node);
      }

      if (group.label) {
        frag.appendChild(buildGroupHeader(group, colSpan, totalRows, GROUPS_START_COLLAPSED));
        // Auto-mount the headend detail rows immediately under the L1
        // header so they're visible whenever the group is expanded
        // (default state). The accordion toggle on the header walks
        // siblings up to the next group header — these rows are
        // siblings, so they collapse with the rest of the group.
        //
        // Order matters: survey notes first (the most actionable
        // piece of information the surveyor leaves behind), then the
        // general detail wrap (photos + SCW notes). Each helper
        // returns null when its source is missing or empty, so the
        // table stays free of blank bands.
        if (group.mdfIdfId) {
          appendChild(buildL1SurveyNotesRow(group.mdfIdfId, colSpan));
          appendChild(buildL1DetailRow(group.mdfIdfId, colSpan));
        }
      }

      // Subgroups (proposalBucket within mdfIdf)
      if (group.subgroups && group.subgroups.length) {
        for (var si = 0; si < group.subgroups.length; si++) {
          var sub = group.subgroups[si];
          if (sub.label) {
            appendChild(buildSubgroupHeader(sub.label, colSpan, sub.rows.length));
          }
          for (var ri = 0; ri < sub.rows.length; ri++) {
            appendChild(buildDataRow(sub.rows[ri], packages, sowId));
          }
        }
      }

      // Direct rows (no subgroups)
      for (var di = 0; di < group.rows.length; di++) {
        appendChild(buildDataRow(group.rows[di], packages, sowId));
      }
    }

    return frag;
  }

  // ── subgroup header (proposalBucket within mdfIdf) ──────────

  function buildSubgroupHeader(label, colSpan, rowCount) {
    var tr = el('tr', 'scw-bid-review__subgroup-header');

    var td = el('td');
    td.setAttribute('colspan', colSpan);

    var inner = el('div', 'scw-bid-review__subgrp-inner');
    inner.appendChild(el('span', 'scw-bid-review__subgrp-title', label));
    if (rowCount > 0) {
      inner.appendChild(el('span', 'scw-bid-review__subgrp-count', String(rowCount)));
    }

    td.appendChild(inner);
    tr.appendChild(td);
    return tr;
  }

  // ── render a single SOW grid ────────────────────────────────

  // ── SOW status bar (next-step pill + Survey Costs + margin) ────
  // Mirrors view_3325's "Next Step" column for one SOW. Three pieces:
  //   1. Next-step block via SCW.opsReview.buildBlockForRow (pill,
  //      margin-low warning + optional PM/Mobilization button, and the
  //      published-proposal info block).
  //   2. Survey Costs input (CFG.surveyCostsField) — editable text input
  //      that PUTs back to the SOW record on blur via Knack's records
  //      API. Reads the current value from the matching view_3325 row.
  //   3. Margin display (CFG.marginField) — read-only text pulled from
  //      the same row.
  // Returns null when the source view (view_3325) isn't on the page or
  // the row for this SOW can't be found.

  function findNextStepRow(sowId) {
    var viewKey = CFG.nextStepViewKey;
    if (!viewKey || !sowId) return null;
    var view = document.getElementById(viewKey);
    if (!view) return null;
    // Attribute selector — CSS id selectors (#abc) can't start with a
    // digit without escaping, and Knack record ids are 24-hex strings
    // that always start with a digit. tr[id="..."] sidesteps that.
    return view.querySelector('tbody tr[id="' + sowId + '"]') || null;
  }

  // ── DOC_files index (view_3926) ─────────────────────────────
  // Each doc record can attach to a SOW (field_2143) and/or a bid
  // package (field_2421). We scrape view_3926 once per render and
  // build two lookups so the SOW status bar and bid column headers
  // can surface their respective files.
  //
  // Connection cells follow Knack's standard shape:
  //   <td class="field_2143" data-field-key="field_2143">
  //     <span class="col-N">
  //       <span class="<recordId>" data-kn="connection-value">SW-1099</span>
  //     </span>
  //   </td>
  // The 24-hex `class` on the inner span is the connected record id
  // (we ignore the display label entirely).
  //
  // Cached per render via _docsIndexCache; bid-review's pipeline
  // resets this on each renderMatrix() call so post-mutation refreshes
  // pick up new docs.
  var _docsIndexCache = null;

  function resetDocsIndex() { _docsIndexCache = null; }

  function buildDocsIndex() {
    if (_docsIndexCache) return _docsIndexCache;

    // bySow / byBid index by individual record id; `all` is the flat
    // list so callers can compute "in the project but NOT linked to
    // this SOW" — view_3926 is filtered to project scope on the bid
    // review scene, so anything not already on this SOW is a candidate
    // for linking.
    var idx = { bySow: {}, byBid: {}, all: [] };
    var view = document.getElementById(CFG.docFilesViewKey);
    if (!view) { _docsIndexCache = idx; return idx; }

    // Model map — field_68_raw carries { url, filename }: the DIRECT
    // asset URL, usable as an <img> src for gallery previews. (The DOM
    // anchor's href is an in-app #kn-asset route — useless for <img>.)
    var byId = {};
    try {
      var kv = typeof Knack !== 'undefined' && Knack.views && Knack.views[CFG.docFilesViewKey];
      var models = kv && kv.model && kv.model.data && kv.model.data.models;
      if (models) {
        for (var mi = 0; mi < models.length; mi++) {
          byId[models[mi].id] = models[mi].attributes || {};
        }
      }
    } catch (e) { /* model unavailable — cards fall back to file tiles */ }

    var rows = view.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];

      // Multi-connection: a doc can attach to several SOWs / bids. The
      // inner span's class is the connected record id; iterate every
      // span so the same doc gets indexed under each SOW it belongs to
      // and we can compute the "not on this SOW" set correctly.
      var sowSpans = tr.querySelectorAll('td.field_2143 span[data-kn="connection-value"]');
      var bidSpans = tr.querySelectorAll('td.field_2421 span[data-kn="connection-value"]');
      var sowIds = [];
      for (var s = 0; s < sowSpans.length; s++) {
        var sid = (sowSpans[s].className || '').trim();
        if (/^[a-f0-9]{24}$/i.test(sid)) sowIds.push(sid);
      }
      var bidIds = [];
      for (var b = 0; b < bidSpans.length; b++) {
        var bid = (bidSpans[b].className || '').trim();
        if (/^[a-f0-9]{24}$/i.test(bid)) bidIds.push(bid);
      }

      // File link — field_68 carries an <a class="kn-view-asset"> with
      // the asset URL + filename. If there's no anchor (e.g. the
      // record holds an image in field_754 instead), skip — there's
      // nothing actionable to link to.
      var fileA = tr.querySelector('td.field_68 a.kn-view-asset, td.field_68 a');
      if (!fileA) continue;

      var attrs = byId[tr.id] || null;
      var mraw = attrs && attrs.field_68_raw;
      if (Array.isArray(mraw)) mraw = mraw[0];
      var directUrl = (mraw && typeof mraw === 'object' &&
                       (mraw.url || mraw.thumb_url)) || '';

      var doc = {
        id:        tr.id,
        docType:   readRowFieldText(tr, 'field_67'),
        notes:     readRowFieldText(tr, 'field_588'),
        fileName:  (fileA.textContent || '').trim() || 'Document',
        fileUrl:   fileA.getAttribute('href') || '',
        directUrl: directUrl,
        sowIds:    sowIds,
        bidIds:    bidIds
      };

      idx.all.push(doc);
      for (var sj = 0; sj < sowIds.length; sj++) {
        if (!idx.bySow[sowIds[sj]]) idx.bySow[sowIds[sj]] = [];
        idx.bySow[sowIds[sj]].push(doc);
      }
      for (var bj = 0; bj < bidIds.length; bj++) {
        if (!idx.byBid[bidIds[bj]]) idx.byBid[bidIds[bj]] = [];
        idx.byBid[bidIds[bj]].push(doc);
      }
    }

    _docsIndexCache = idx;
    return idx;
  }

  function buildDocsBlock(docs, label) {
    if (!docs || !docs.length) return null;
    var wrap = el('div', 'scw-bid-review__docs');
    if (label) wrap.appendChild(el('div', 'scw-bid-review__docs-label', label));
    for (var i = 0; i < docs.length; i++) {
      wrap.appendChild(buildDocsItem(docs[i]));
    }
    return wrap;
  }

  function makeFilterChip(value, label, active) {
    var c = document.createElement('button');
    c.type = 'button';
    c.className = 'scw-bid-review__docs-chip' + (active ? ' is-active' : '');
    c.setAttribute('data-action', 'doc_filter');
    c.setAttribute('data-filter', value);
    c.textContent = label;
    return c;
  }

  function docExt(name) {
    var m = /\.([a-z0-9]+)\s*$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }

  // GALLERY CARD (2026-07-16, replaces the two-line text row): thumbnail
  // preview on top — a real <img> for image files (direct asset URL from
  // the model, see buildDocsIndex), a PDF/file tile otherwise — with the
  // type chip + filename + notes beneath. The Link/Unlink pill is still
  // appended by the caller and CSS-positioned over the thumbnail's top-
  // right corner, so the linked/available grouping + actions carry over
  // unchanged.
  function buildDocsItem(d) {
    var row = el('div', 'scw-bid-review__docs-item');
    // data-doc-type drives the filter-chip show/hide. Untyped docs
    // get a sentinel so "All" still matches but specific-type filters
    // hide them.
    row.setAttribute('data-doc-type', d.docType || '__none__');

    var ext = docExt(d.fileName);
    var isImg = !!d.directUrl && /^(png|jpe?g|gif|webp|bmp|avif)$/.test(ext);

    var thumb = document.createElement('a');
    thumb.className = 'scw-bid-review__docs-thumb' +
      (isImg ? '' : ' scw-bid-review__docs-thumb--icon' +
        (ext === 'pdf' ? ' scw-bid-review__docs-thumb--pdf' : ''));
    thumb.href = d.directUrl || d.fileUrl;
    thumb.target = '_blank';
    thumb.rel = 'noopener';
    thumb.title = d.fileName + (d.notes ? ' — ' + d.notes : '');
    if (isImg) {
      var img = document.createElement('img');
      img.loading = 'lazy';
      // Thumb derivative instead of the full download-asset file (site
      // maps here measured 4+ MB each as strip thumbnails); onerror
      // falls back to the original when no derivative exists.
      if (window.SCW && SCW.knackImgThumbInto) SCW.knackImgThumbInto(img, d.directUrl);
      else img.src = d.directUrl;
      img.alt = d.fileName;
      thumb.appendChild(img);
    } else {
      thumb.innerHTML =
        '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" ' +
        'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
        '<polyline points="14 2 14 8 20 8"/></svg>' +
        '<span class="scw-bid-review__docs-ext">' +
        (ext ? ext.toUpperCase().replace(/[^A-Z0-9]/g, '') : 'FILE') + '</span>';
    }
    row.appendChild(thumb);

    var body = el('div', 'scw-bid-review__docs-body');
    var a = document.createElement('a');
    a.href = d.fileUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = d.fileName;
    a.className = 'scw-bid-review__docs-link';
    a.textContent = d.fileName;
    body.appendChild(a);
    var subBits = el('span', 'scw-bid-review__docs-sub');
    if (d.docType) subBits.appendChild(el('span', 'scw-bid-review__docs-type', d.docType));
    if (d.notes) {
      var nEl = el('span', 'scw-bid-review__docs-notes', d.notes);
      nEl.title = d.notes;
      subBits.appendChild(nEl);
    }
    if (d.docType || d.notes) body.appendChild(subBits);
    row.appendChild(body);
    return row;
  }

  // SOW header docs section — five parts:
  //   1. Header bar with label + linked/available counts
  //   2. Doc-type filter chips (when 2+ distinct types are present
  //      across linked + available — single-type panels skip them)
  //   3. Linked: docs attached to this SOW (field_2143) — each row
  //      gets an "Unlink" pill that PUTs the SOW out of field_2143
  //      WITHOUT deleting the DOC_files record itself
  //   4. Available: other project docs (in view_3926 but not on this
  //      SOW) with a "+ Link" button that PUTs the SOW id onto the
  //      doc's field_2143 connection
  //   5. Footer: "+ Upload new document" anchor to Knack's add-
  //      document child page rooted under #review-bid so the user
  //      stays in the comparison flow
  function buildSowDocsBlock(sowId, addUrl, idx) {
    if (!sowId) return null;
    var linked = (idx && idx.bySow && idx.bySow[sowId]) || [];
    var available = [];
    if (idx && idx.all && idx.all.length) {
      for (var i = 0; i < idx.all.length; i++) {
        var d = idx.all[i];
        if (d.sowIds.indexOf(sowId) === -1) available.push(d);
      }
    }
    // Empty-state: render the panel WITH the Upload button so the
    // affordance is always reachable from the same spot — even
    // before any project docs exist.
    if (!linked.length && !available.length && !addUrl) return null;

    var wrap = el('div', 'scw-bid-review__docs scw-bid-review__docs--sow');

    // Header row mirrors the SURVEY COSTS / MARGIN row shape: label
    // on the left, primary action on the right. The Upload pill
    // anchors the right edge so DOCUMENTS isn't a floating label
    // with empty whitespace to its right (which is what made it read
    // as centered relative to the left/right-aligned metric rows).
    var header = el('div', 'scw-bid-review__docs-header');
    header.appendChild(el('span', 'scw-bid-review__docs-label', 'Documents'));
    if (sowId) {
      // Upload goes through the bulk-upload modal in doc mode (the
      // 'sow_docs_upload' VIEWS entry: doc-type picker + payload tagged
      // uploadKind 'doc_file' / linkField 'sowID') — NOT Knack's native
      // add-document child page, whose modal form 400s on submit. The
      // child-page addUrl is kept only as a fallback when bulk-upload
      // isn't loaded.
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'scw-bid-review__docs-add';
      addBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      addBtn.appendChild(document.createTextNode(' Upload new'));
      addBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var bu = window.SCW && window.SCW.bulkUpload;
        var docsCfg = null;
        if (bu && bu.config && Array.isArray(bu.config.VIEWS)) {
          for (var di = 0; di < bu.config.VIEWS.length; di++) {
            if (bu.config.VIEWS[di] && bu.config.VIEWS[di].docUpload) {
              docsCfg = bu.config.VIEWS[di];
              break;
            }
          }
        }
        if (bu && typeof bu.open === 'function' && docsCfg) {
          bu.open(docsCfg, sowId);
        } else if (addUrl) {
          window.location.hash = addUrl;
        }
      });
      header.appendChild(addBtn);
    }
    wrap.appendChild(header);

    // Filter chips — collect every doc-type across linked + available,
    // render an "All" chip plus one per type. Hidden when fewer than
    // two distinct types exist (no useful filter to apply).
    var typeSet = {};
    for (var ti = 0; ti < linked.length; ti++) {
      if (linked[ti].docType) typeSet[linked[ti].docType] = true;
    }
    for (var tj = 0; tj < available.length; tj++) {
      if (available[tj].docType) typeSet[available[tj].docType] = true;
    }
    var types = Object.keys(typeSet).sort();
    if (types.length >= 2) {
      var chipRow = el('div', 'scw-bid-review__docs-filter');
      chipRow.appendChild(makeFilterChip('__all__', 'All', true));
      for (var tk = 0; tk < types.length; tk++) {
        chipRow.appendChild(makeFilterChip(types[tk], types[tk], false));
      }
      wrap.appendChild(chipRow);
      wrap.setAttribute('data-filter', '__all__');
    }

    if (linked.length) {
      var linkedList = el('div', 'scw-bid-review__docs-list');
      for (var l = 0; l < linked.length; l++) {
        var lDoc = linked[l];
        var lItem = buildDocsItem(lDoc);

        var unlinkBtn = document.createElement('button');
        unlinkBtn.type = 'button';
        unlinkBtn.className = 'scw-bid-review__docs-unlink-btn';
        unlinkBtn.setAttribute('data-action', 'doc_unlink_from_sow');
        unlinkBtn.setAttribute('data-doc-id', lDoc.id);
        unlinkBtn.setAttribute('data-sow-id', sowId);
        unlinkBtn.setAttribute('data-current-sows', lDoc.sowIds.join(','));
        unlinkBtn.title = 'Disconnect from this SOW (the document file is not deleted)';
        // Text-only — the word "Unlink" plus the slate styling
        // already communicates the action. Icon would be redundant
        // and competes with the + Link pill on available rows.
        unlinkBtn.textContent = 'Unlink';

        lItem.appendChild(unlinkBtn);
        linkedList.appendChild(lItem);
      }
      wrap.appendChild(linkedList);
    }

    // "Other docs on project" collapsible — full-width row with a
     // left-aligned toggle. Sits beneath the linked items as another
     // row in the same stack. Click expands the list of available
     // project docs (each with a + Link affordance on the right,
     // matching the linked row's Unlink-on-right pattern).
    if (available.length) {
      var availSection = el('div', 'scw-bid-review__docs-other');
      availSection.setAttribute('data-collapsed', '1');

      var availToggle = document.createElement('button');
      availToggle.type = 'button';
      availToggle.className = 'scw-bid-review__docs-other-toggle';
      availToggle.setAttribute('data-action', 'docs_toggle_other');
      availToggle.innerHTML = '<svg class="scw-bid-review__docs-chevron" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
      availToggle.appendChild(document.createTextNode(' ' + available.length + ' other project doc' + (available.length === 1 ? '' : 's')));
      availSection.appendChild(availToggle);

      var availList = el('div', 'scw-bid-review__docs-list scw-bid-review__docs-list--available');
      for (var a = 0; a < available.length; a++) {
        var ad = available[a];
        var item = buildDocsItem(ad);
        item.classList.add('scw-bid-review__docs-item--available');

        var linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'scw-bid-review__docs-link-btn';
        linkBtn.setAttribute('data-action', 'doc_link_to_sow');
        linkBtn.setAttribute('data-doc-id', ad.id);
        linkBtn.setAttribute('data-sow-id', sowId);
        // Serialize current sow ids so the click handler can PUT
        // the full connection array (existing + new) without re-
        // scraping the DOM.
        linkBtn.setAttribute('data-current-sows', ad.sowIds.join(','));
        linkBtn.title = 'Link this document to the SOW';
        linkBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        linkBtn.appendChild(document.createTextNode(' Link'));

        item.appendChild(linkBtn);
        availList.appendChild(item);
      }
      availSection.appendChild(availList);
      wrap.appendChild(availSection);
    }

    return wrap;
  }

  function readRowFieldText(tr, fieldKey) {
    if (!tr || !fieldKey) return '';
    var td = tr.querySelector('td.' + fieldKey + ', td[data-field-key="' + fieldKey + '"]');
    if (!td) return '';
    var span = td.querySelector('span.col-1, span[class^="col-"]');
    var src = span || td;
    return (src.textContent || '').replace(/ /g, ' ').trim();
  }

  // Returns { details, actions } so the caller can mount the two
  // halves into r2 + r3 of the header — mirrors the bid-column shape
  // (badges/name in r2, action buttons in r3).
  //   details: published proposal block + Survey Costs / Margin metrics
  //   actions: margin-low warning button stack + Preview Proposal pill
  // opts.separateDocs: return the documents gallery as `docs` instead of
  // embedding it in `details` — v2 mounts it as a FULL-WIDTH band between
  // the SOW header and the line items (the head's SOW column is too
  // narrow for a card gallery). Default (v1 path) keeps it inline.
  function buildSowStatusBar(sowGrid, opts) {
    var sowId = sowGrid.sowId;
    var tr = findNextStepRow(sowId);
    var ops = (window.SCW && SCW.opsReview) ? SCW.opsReview : null;

    var details = el('div', 'scw-bid-review__sow-status');
    var actions = el('div', 'scw-bid-review__sow-actions');

    // 0. SOW Name (editable). Sits at the top of the SOW column header
    //    so the name is visible and edit-in-place. Reads from view_3918
    //    (CFG.nextStepViewKey) row's field_2126 cell, writes back via
    //    Knack's records API on blur.
    if (CFG.sowNameField) {
      var nameWrap = el('div', 'scw-bid-review__sow-name');
      nameWrap.appendChild(el('span', 'scw-bid-review__sow-name-label', 'SOW Name'));
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'scw-bid-review__sow-name-input';
      nameInput.setAttribute('data-action', 'sow_name_update');
      nameInput.setAttribute('data-sow-id', sowId);
      nameInput.setAttribute('data-field', CFG.sowNameField);
      nameInput.value = readRowFieldText(tr, CFG.sowNameField) || sowGrid.sowName || '';
      nameInput.placeholder = 'SOW Name';
      nameWrap.appendChild(nameInput);
      details.appendChild(nameWrap);
    }

    // 1. Published proposal block — final/gfe chip, quote number link,
    //    expiration, PDF — same shape as the ops-list "Next Step" column
    //    and the preview-proposal page.
    if (tr && ops && ops.buildProposalBlockForRow) {
      var proposalBlock = ops.buildProposalBlockForRow(tr, {
        proposalViewKey: CFG.proposalSourceView,
        // Internal sub-bid review PDF (field_2945 on view_3920) — second
        // icon beside the proposal PDF.
        reviewPdfField: CFG.proposalReviewPdfField,
        // The proposal number clicks through to the CUSTOMER-FACING page
        // (tokenized URL, field_2908). Blank token → plain text.
        proposalLinkBuilder: function (p) { return p.tokenUrl || ''; }
      });
      if (proposalBlock) {
        // Inline both PDF links next to the quote name + swap their icons
        // for the same paper SVG the bid-column status row uses, so the
        // SOW + bid columns visually mirror each other. The internal
        // sub-bid review PDF gets a diff-style glyph + indigo tint.
        var nameDiv = proposalBlock.querySelector('.scw-pq-name');
        var pdfAs = proposalBlock.querySelectorAll('.scw-pq-pdf');
        for (var pa = 0; pa < pdfAs.length; pa++) {
          var pdfA = pdfAs[pa];
          if (!nameDiv) break;
          var isReview = pdfA.classList.contains('scw-pq-pdf--review');
          pdfA.innerHTML = isReview
            ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="15"/><line x1="10" y1="13" x2="14" y2="13"/><line x1="10" y1="17.5" x2="14" y2="17.5"/></svg>'
            : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';
          pdfA.title = isReview
            ? 'Sub-bid review PDF (diff + basis bid — internal)'
            : (pdfA.title || 'View PDF');
          pdfA.classList.add('scw-bid-review__pq-pdf-icon');
          if (isReview) pdfA.classList.add('scw-bid-review__pq-pdf-icon--review');
          nameDiv.appendChild(pdfA);
        }

        // Inline edit on the proposal expiration date — pencil-edit
        // affordance handled by pq-expiration-edit.js (scene_1155 entry),
        // NOT a live auto-saving <input type="date">. The old always-live
        // input PUT on every `change`, and the native date input fires
        // `change` for each intermediate segment while typing (year "0002",
        // "0020", …) — so it fired garbage saves mid-keystroke and the
        // follow-on refetches re-rendered the header under the open
        // calendar picker. The pencil opens an explicit Save/Cancel editor
        // (with +30/60/90-day presets) that commits exactly once.
        var expEl       = proposalBlock.querySelector('.scw-pq-exp');
        var proposalRid = proposalBlock.getAttribute('data-proposal-record-id');
        if (expEl && proposalRid) {
          // The SOW record id — pq-expiration-edit reads it off the block to
          // mirror field_2659 onto the SOW's field_2135 (a DIFFERENT record).
          proposalBlock.setAttribute('data-sow-record-id', sowId || '');
          // Build the pencil here (instead of waiting for that module's
          // knack-view-render decorate pass) so it exists the moment the v2
          // grid rebuilds this header; the attribute stops decorate() from
          // adding a duplicate.
          expEl.setAttribute('data-scw-exp-editable', '1');
          var expBtn = document.createElement('button');
          expBtn.type = 'button';
          expBtn.className = 'scw-pq-exp-edit-btn';
          expBtn.title = 'Edit expiration date';
          expBtn.setAttribute('aria-label', 'Edit proposal expiration date');
          expBtn.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 20h9"></path>' +
            '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>' +
            '</svg>';
          expEl.appendChild(expBtn);
        }

        details.appendChild(proposalBlock);
      }
    }

    // 2. Documents — render BEFORE financials so the user's natural
    //    reading order is "what is this SOW about?" before "what does
    //    it cost?". Linked = field_2143 contains this SOW. Available
    //    = project doc not yet linked (+ Link to connect). Upload new
    //    document opens Knack's add-document child page under
    //    #review-bid so the user stays in the comparison flow.
    var docsIdx = buildDocsIndex();
    // Anchor the add-document child-page URL to the LIVE hash, not a
    // hardcoded top-level slug. scene_1155 is reached via a nested nav
    // path (e.g. #team-calendar/project-dashboard/<projectId>/review-bids/
    // <projectId>) that varies by entry point; a bare "#review-bid/..."
    // doesn't resolve, so Knack bounces to the start page. Append the
    // child slug + sowId to the current path instead.
    var addDocUrl = '';
    if (sowId) {
      var base = (window.location.hash || '').split('?')[0].replace(/\/+$/, '');
      // Drop an already-open add-document segment so re-renders don't nest.
      base = base.replace(/\/add-document-review-bid\/[a-f0-9]{24}\/?$/i, '');
      addDocUrl = base + '/add-document-review-bid/' + sowId + '/';
    }
    var sowDocsBlock = buildSowDocsBlock(sowId, addDocUrl, docsIdx);
    var docsOut = null;
    if (sowDocsBlock) {
      if (opts && opts.separateDocs) docsOut = sowDocsBlock;
      else details.appendChild(sowDocsBlock);
    }

    // 3. Survey Costs (editable input) + Margin (read-only display).
    var metrics = el('div', 'scw-bid-review__sow-metrics');

    var surveyWrap = el('label', 'scw-bid-review__sow-metric');
    surveyWrap.appendChild(el('span', 'scw-bid-review__sow-metric-label', 'Survey Costs'));
    var surveyInput = document.createElement('input');
    surveyInput.type = 'text';
    surveyInput.className = 'scw-bid-review__sow-metric-input';
    surveyInput.setAttribute('data-action', 'sow_survey_costs');
    surveyInput.setAttribute('data-sow-id', sowId);
    surveyInput.setAttribute('data-field', CFG.surveyCostsField || '');
    surveyInput.placeholder = '$0.00';
    // Survey-costs gate: BLANK (never entered) is flagged red and blocks
    // the Preview pill (gated in opsReview.buildPillForRow); an explicit
    // $0 is a valid answer and clears the gate. Show a real 0 as "$0.00"
    // so it reads as answered, not blank.
    var surveyRawTxt = String(readRowFieldText(tr, CFG.surveyCostsField) || '').trim();
    var surveyBlank  = surveyRawTxt === '';
    if (surveyBlank) {
      surveyInput.value = '';
    } else {
      var surveyNum = parseFloat(surveyRawTxt.replace(/[$,]/g, ''));
      surveyInput.value = isFinite(surveyNum) ? ('$' + surveyNum.toFixed(2)) : surveyRawTxt;
    }
    surveyWrap.appendChild(surveyInput);
    if (surveyBlank) {
      surveyWrap.classList.add('scw-bid-review__sow-metric--missing');
      surveyWrap.appendChild(el('span', 'scw-bid-review__sow-metric-warn',
        'Enter survey costs (enter $0 if none) to enable Preview Proposal.'));
    }
    metrics.appendChild(surveyWrap);

    var marginWrap = el('div', 'scw-bid-review__sow-metric');
    marginWrap.appendChild(el('span', 'scw-bid-review__sow-metric-label', 'Margin'));
    var marginVal = readRowFieldText(tr, CFG.marginField);
    marginWrap.appendChild(el('span', 'scw-bid-review__sow-metric-value', marginVal || '—'));
    metrics.appendChild(marginWrap);

    details.appendChild(metrics);

    // 3. Margin-low warning + recovery actions:
    //    a) Add PM & Mobilization (extra cost line item)
    //    b) Bump project margin to a value that keeps the effective
    //       margin (after survey costs) at the 12% target.
    if (tr && ops && ops.buildMarginWarningForRow) {
      var marginButtons = [{
        label: 'Add Project Management & Mobilization line item',
        dataAttrs: {
          'data-action':  'add_pm_mobilization',
          'data-sow-id':  sowId,
          'data-sow-name': sowGrid.sowName || ''
        }
      }];

      // Knack stores field_2158 as gross margin (price-cost)/price, so:
      //   installFee     = subBidTotal / (1 - margin)
      //   effective gross = (installFee - subBidTotal - surveyCosts) / installFee
      //                   = margin - surveyCosts × (1 - margin) / subBidTotal
      // Solve for margin given a 12% effective target:
      //   margin = (0.12 × subBidTotal + surveyCosts) / (subBidTotal + surveyCosts)
      var EFFECTIVE_TARGET = 0.12;
      var subBidTotal  = parseFloat(readRowFieldText(tr, CFG.subBidTotalField).replace(/[$,]/g, '')) || 0;
      var surveyCosts  = parseFloat(readRowFieldText(tr, CFG.surveyCostsField).replace(/[$,]/g, '')) || 0;
      if (subBidTotal > 0) {
        var newMargin = (EFFECTIVE_TARGET * subBidTotal + surveyCosts) / (subBidTotal + surveyCosts);
        var newMarginPct = Math.ceil(newMargin * 1000) / 10; // round up to nearest 0.1%
        marginButtons.push({
          label: 'Increase project margin to ' + newMarginPct.toFixed(1) + '%',
          dataAttrs: {
            'data-action':       'set_project_margin',
            'data-sow-id':       sowId,
            'data-margin-value': String(newMargin),
            'data-margin-pct':   newMarginPct.toFixed(1),
            'data-margin-field': CFG.projectMarginField || ''
          }
        });
      }

      var warning = ops.buildMarginWarningForRow(tr, { marginButton: marginButtons });
      if (warning) actions.appendChild(warning);
    }

    // 4. "Preview Proposal for Next Steps" — restyled to match the
    //    Sync-to-SOW button in the bid columns (see CSS override on
    //    .scw-bid-review__sow-status .scw-ops-pill).
    if (tr && ops && ops.buildPillForRow) {
      var pill = ops.buildPillForRow(tr);
      if (pill) {
        // Strip the ops-pill arrow chevron — Sync-to-SOW doesn't have
        // one and we want pixel parity. The info-tooltip span (if any)
        // stays on the pill so auto-revert notes still surface.
        var arrowEl = pill.querySelector('.scw-ops-arrow');
        if (arrowEl) arrowEl.remove();
        actions.appendChild(pill);
      }
    }

    return { details: details, actions: actions, docs: docsOut };
  }

  function buildSowSection(sowGrid) {
    // Default-collapse any bid column whose items are all "other" (none on
    // this SOW), unless the user has toggled it. Seed before the table is
    // built so every cell in the column picks up the collapsed class.
    for (var dc = 0; dc < sowGrid.packages.length; dc++) {
      if (sowGrid.packages[dc].noOnSowItems) {
        applyDefaultPkgCollapse(sowGrid.sowId, sowGrid.packages[dc].id, true);
      }
    }

    var section = el('div', 'scw-bid-review__sow-section');
    section.setAttribute('data-sow-id', sowGrid.sowId);

    // SOW accordion header (clickable) — collapsed by default. With
    // many SOWs the page is unwieldy fully expanded on load; the user
    // can open the ones they care about. restoreAccordionState below
    // re-opens sections that were open on the previous render.
    section.classList.add('scw-bid-review__sow-section--collapsed');
    var header = el('div', 'scw-bid-review__sow-title');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'false');

    var chevron = el('span', 'scw-bid-review__sow-chevron');
    chevron.innerHTML = CHEVRON_SVG;
    header.appendChild(chevron);

    header.appendChild(el('span', 'scw-bid-review__sow-title-text', sowGrid.sowName));
    // SOW Name (field_2126) alongside the SOW # — read from the next-step
    // row, same source as the editable SOW Name input in the header.
    var sowNameVal = readRowFieldText(findNextStepRow(sowGrid.sowId), CFG.sowNameField) || '';
    if (sowNameVal && sowNameVal !== sowGrid.sowName) {
      header.appendChild(el('span', 'scw-bid-review__sow-title-name', sowNameVal));
    }
    header.appendChild(el('span', 'scw-bid-review__sow-title-count',
      sowGrid.rows.length + ' line item' + (sowGrid.rows.length !== 1 ? 's' : '') +
      ' \u00b7 ' + sowGrid.packages.length + ' bid' + (sowGrid.packages.length !== 1 ? 's' : '')));
    section.appendChild(header);

    // Status bar (next-step / Survey Costs / margin / proposal info) is
    // rendered INSIDE the SOW column header cell (buildHeaderRows row 2),
    // not above the table \u2014 keeps column symmetry with the bid packages
    // (which surface their badge/name/buttons in the same header rows).

    // Collapsible body
    var body = el('div', 'scw-bid-review__sow-body');

    if (!sowGrid.rows.length) {
      body.appendChild(el('div', 'scw-bid-review__empty-state', 'No bid items for this SOW.'));
    } else {
      var table = el('table', 'scw-bid-review__table');

      var thead = document.createElement('thead');
      var headerRows = buildHeaderRows(sowGrid);
      for (var hi = 0; hi < headerRows.length; hi++) {
        thead.appendChild(headerRows[hi]);
      }
      table.appendChild(thead);

      var tbody = document.createElement('tbody');
      tbody.appendChild(buildBodyRows(sowGrid.groups, sowGrid.packages, sowGrid.columnCount, sowGrid.sowId));
      table.appendChild(tbody);

      // Sub Bid Revisions column collapses when there's nothing to show
      // for this SOW — no pending CRs in any cell, no Add buttons (no
      // noBid / surveyNoBid rows), no header CR submit buttons.
      //
      // Physical removal (not display:none): with table-layout: fixed
      // the column's cells stay in the table grid even when hidden,
      // claiming their slice of the remaining width. Removing the
      // cells outright drops the column from the grid so the SOW +
      // Bid columns reflow into the freed space.
      if (!tableHasCrContent(table)) {
        var crCells = table.querySelectorAll('.scw-bid-review__cr-col');
        for (var k = 0; k < crCells.length; k++) {
          crCells[k].parentNode.removeChild(crCells[k]);
        }
        // Group / subgroup header rows AND the auto-mounted L1 detail
        // rows colspan over the full table width; decrement by 1 so
        // they don't overshoot.
        var groupTds = table.querySelectorAll(
          'tr.scw-bid-review__group-header > td[colspan],' +
          'tr.scw-bid-review__subgroup-header > td[colspan],' +
          'tr.scw-bid-review__l1-detail-row > td[colspan],' +
          'tr.scw-bid-review__l1-survey-notes-row > td[colspan]'
        );
        for (var g = 0; g < groupTds.length; g++) {
          var cs = parseInt(groupTds[g].getAttribute('colspan'), 10);
          if (isFinite(cs) && cs > 1) groupTds[g].setAttribute('colspan', String(cs - 1));
        }
        table.classList.add('scw-bid-review__table--no-cr');
      }

      body.appendChild(table);
    }

    section.appendChild(body);

    // Toggle handler
    header.addEventListener('click', function () {
      var expanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', String(!expanded));
      section.classList.toggle('scw-bid-review__sow-section--collapsed', expanded);
      persistAccordionState();
    });

    header.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });

    return section;
  }

  // ── accordion state save / restore ──────────────────────────

  /**
   * Snapshot which SOW sections and MDF/IDF groups are expanded
   * so we can restore them after a re-render.
   */
  function snapshotAccordionState(mount) {
    var snap = { sow: {}, group: {} };
    if (!mount) return snap;

    // SOW-level sections
    var sections = mount.querySelectorAll('.scw-bid-review__sow-section');
    for (var i = 0; i < sections.length; i++) {
      var sowId = sections[i].getAttribute('data-sow-id');
      if (sowId) {
        snap.sow[sowId] = !sections[i].classList.contains('scw-bid-review__sow-section--collapsed');
      }
    }

    // MDF/IDF group headers (inside each SOW section)
    var headers = mount.querySelectorAll('.scw-bid-review__group-header');
    for (var h = 0; h < headers.length; h++) {
      var section = headers[h].closest('.scw-bid-review__sow-section');
      var sowKey = section ? section.getAttribute('data-sow-id') : '__root__';
      var label = (headers[h].querySelector('.scw-bid-review__grp-title') || {}).textContent || '';
      if (label) {
        snap.group[sowKey + '::' + label] = headers[h].getAttribute('aria-expanded') === 'true';
      }
    }

    return snap;
  }

  function restoreAccordionState(mount, snap, defaultOpenSowId) {
    if (!mount || !snap) return;

    // Restore SOW sections. buildSowSection defaults each to collapsed.
    // Precedence per section:
    //   1. Prior user state from the snapshot (open/closed) — preserved
    //      across re-renders (e.g. after a CR submission).
    //   2. No prior state (first render / newly-added SOW) → apply the
    //      default: open `defaultOpenSowId` (the last SOW, which is also
    //      the only one when there's just one) and collapse the rest.
    var sections = mount.querySelectorAll('.scw-bid-review__sow-section');
    for (var i = 0; i < sections.length; i++) {
      var sowId = sections[i].getAttribute('data-sow-id');
      if (!sowId) continue;
      var prev = snap.sow[sowId];
      var open = (prev === true) ||
                 (prev === undefined && sowId === defaultOpenSowId);
      if (open) {
        sections[i].classList.remove('scw-bid-review__sow-section--collapsed');
        var hdr = sections[i].querySelector('.scw-bid-review__sow-title');
        if (hdr) hdr.setAttribute('aria-expanded', 'true');
      }
    }

    // Restore MDF/IDF group headers. They're built collapsed, so we only
    // need to RE-OPEN the ones that were open before the re-render —
    // mirroring the SOW-section logic above. (Previously this branch only
    // ever re-collapsed, so an open group always snapped shut on refresh.)
    var headers = mount.querySelectorAll('.scw-bid-review__group-header');
    for (var h = 0; h < headers.length; h++) {
      var section = headers[h].closest('.scw-bid-review__sow-section');
      var sowKey = section ? section.getAttribute('data-sow-id') : '__root__';
      var label = (headers[h].querySelector('.scw-bid-review__grp-title') || {}).textContent || '';
      var key = sowKey + '::' + label;

      if (label && snap.group[key] === true) {
        setGroupHeaderOpen(headers[h], true);
      }
    }
  }

  // ── persist accordion state across a full page reload ───────
  // The snapshot/restore above is in-memory and dies on a page reload
  // (e.g. the post-"Update SOW to match Bid" reload). Mirror it into
  // sessionStorage so the user's open SOWs / MDF-IDF groups come back
  // after the reload. sessionStorage (not localStorage) keeps it scoped
  // to the current tab session.
  var ACCORDION_STORE_PREFIX = 'scwBidReviewAccordion:';

  function accordionStorageKey() {
    var scene = (window.Knack && Knack.router && Knack.router.current_scene_key) || CFG.sceneKey;
    return ACCORDION_STORE_PREFIX + scene;
  }

  function persistAccordionState() {
    try {
      var mount = document.querySelector(CFG.mountSelector);
      if (!mount) return;
      var snap = snapshotAccordionState(mount);
      if (Object.keys(snap.sow).length || Object.keys(snap.group).length) {
        sessionStorage.setItem(accordionStorageKey(), JSON.stringify(snap));
      }
    } catch (e) { /* sessionStorage unavailable — ignore */ }
  }

  function loadPersistedAccordionState() {
    try {
      var raw = sessionStorage.getItem(accordionStorageKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.sow && parsed.group) return parsed;
    } catch (e) { /* corrupt / unavailable — ignore */ }
    return null;
  }

  ns.persistAccordionState = persistAccordionState;

  // Capture the latest DOM state on unload (covers manual reloads and the
  // programmatic post-sync reload alike). Registered once.
  var _unloadPersistBound = false;
  function bindUnloadPersist() {
    if (_unloadPersistBound) return;
    _unloadPersistBound = true;
    window.addEventListener('beforeunload', persistAccordionState);
  }

  // ── shared accordion open/close helpers ─────────────────────
  // Used by the per-header toggles, the snapshot/restore cycle, and the
  // Expand all / Collapse all toolbar buttons so every path opens/closes
  // a section the exact same way.

  function setSowSectionOpen(section, open) {
    if (!section) return;
    section.classList.toggle('scw-bid-review__sow-section--collapsed', !open);
    var hdr = section.querySelector('.scw-bid-review__sow-title');
    if (hdr) hdr.setAttribute('aria-expanded', String(open));
  }

  function setGroupHeaderOpen(tr, open) {
    if (!tr) return;
    tr.setAttribute('aria-expanded', String(open));
    tr.classList.toggle('scw-bid-review__group-header--collapsed', !open);
    // Walk the sibling rows up to the next L1 group header, toggling them.
    var sibling = tr.nextElementSibling;
    while (sibling) {
      if (sibling.classList.contains('scw-bid-review__group-header')) break;
      sibling.style.display = open ? '' : 'none';
      sibling = sibling.nextElementSibling;
    }
  }

  function setAllAccordions(open) {
    var mount = document.querySelector(CFG.mountSelector);
    if (!mount) return;
    var sections = mount.querySelectorAll('.scw-bid-review__sow-section');
    for (var i = 0; i < sections.length; i++) setSowSectionOpen(sections[i], open);
    var headers = mount.querySelectorAll('.scw-bid-review__group-header');
    for (var h = 0; h < headers.length; h++) setGroupHeaderOpen(headers[h], open);
    persistAccordionState();
  }

  // ── grid toolbar (top of #bid-review-matrix) ────────────────
  // Expand all / Collapse all drive every SOW section AND every MDF/IDF
  // group at once. A left-side count makes a multi-SOW page read as a
  // list of like items rather than an undifferentiated stack.
  function buildToolbar(state) {
    var bar = el('div', 'scw-bid-review__toolbar');

    var sowCount = (state && state.sowGrids) ? state.sowGrids.length : 0;
    if (sowCount > 1) {
      bar.appendChild(el('span', 'scw-bid-review__toolbar-count',
        sowCount + ' SOWs'));
    }

    var btns = el('div', 'scw-bid-review__toolbar-btns');

    var btnCollapse = el('button', 'scw-bid-review__toolbar-btn', 'Collapse all');
    btnCollapse.type = 'button';
    btnCollapse.addEventListener('click', function () { setAllAccordions(false); });
    btns.appendChild(btnCollapse);

    var btnExpand = el('button', 'scw-bid-review__toolbar-btn scw-bid-review__toolbar-btn--primary', 'Expand all');
    btnExpand.type = 'button';
    btnExpand.addEventListener('click', function () { setAllAccordions(true); });
    btns.appendChild(btnExpand);

    bar.appendChild(btns);
    return bar;
  }

  // ── public: renderMatrix ────────────────────────────────────

  // Exposed for init.js's single-row patch path (medium-tier refresh
  // optimization). Returns a fresh <tr> for one row; the caller swaps
  // it into the DOM to avoid a full grid rebuild.
  ns.buildDataRow = buildDataRow;
  ns.scrapeRowPhotoUrls = scrapeRowPhotoUrls;

  // Public so v2 can build the SOW column header (name / proposal / docs /
  // survey costs / margin / margin-low warning / preview pill) from v1's
  // exact renderer. Takes any object with { sowId, sowName }.
  ns.buildSowStatusBar = function (sowGridLike, opts) {
    return buildSowStatusBar(sowGridLike, opts);
  };

  // Public so v2 can surface the editable SOW Name (field_2126, the friendly
  // name) beside the SOW # in its reconcile-grid expand/collapse bar — same
  // source as v1's own SOW header (the next-step view row). Returns '' when no
  // friendly name is set (or it just duplicates the SOW #), so the caller can
  // skip rendering it.
  ns.sowFriendlyName = function sowFriendlyName(sowId) {
    return readRowFieldText(findNextStepRow(sowId), CFG.sowNameField) || '';
  };

  // Public so v2 can drop the cached DOC_files index before re-rendering its
  // header (v2 calls buildSowStatusBar directly, never v1's renderMatrix,
  // which is where the cache is normally reset). Without this, a link/unlink
  // PUT + view_3926 refetch wouldn't surface fresh docs in the v2 header.
  ns.resetDocsIndex = function () { resetDocsIndex(); };

  // True when bid-review-v2 owns the page — v1's grid is DEAD (never
  // rendered); v1 runs as a pure library (state pipeline, CR engine,
  // action handlers, status bar, toasts) that v2 calls into.
  function v2OwnsPage() {
    var v2cfg = window.SCW && SCW.bidReviewV2 && SCW.bidReviewV2.CONFIG;
    return !!(v2cfg && v2cfg.enabled !== false && v2cfg.replaceV1);
  }

  ns.renderMatrix = function renderMatrix(state) {
    // v2 owns the page → don't build the (hidden) v1 matrix at all. The
    // full deletion of the v1 grid DOM builders is tracked as a cleanup;
    // this gate is what makes them unreachable.
    if (v2OwnsPage()) return null;
    var mount = getOrCreateMount();
    if (!mount) return null;   // wrong scene — scene gate refused

    bindUnloadPersist();

    // Preserve accordion state across re-renders
    var snap = snapshotAccordionState(mount);

    // On a fresh page load the mount is empty, so the live snapshot has
    // nothing. Seed it from the persisted session snapshot so the user's
    // open SOWs / groups survive a full page reload (e.g. the post-sync
    // reload) instead of coming back all-collapsed.
    if (!Object.keys(snap.sow).length && !Object.keys(snap.group).length) {
      var persisted = loadPersistedAccordionState();
      if (persisted) snap = persisted;
    }

    // Drop the cached DOC_files index so the next docs lookup re-
    // scrapes view_3926 (post-mutation refreshes need fresh data).
    resetDocsIndex();

    mount.innerHTML = '';
    mount.className = 'scw-bid-review';

    if (state.isEmpty) {
      mount.appendChild(el('div', 'scw-bid-review__empty-state',
        'No comparison data available.'));
      return mount;
    }

    mount.appendChild(buildToolbar(state));

    for (var i = 0; i < state.sowGrids.length; i++) {
      mount.appendChild(buildSowSection(state.sowGrids[i]));
    }

    // Default-open SOW: ONLY when there's a single SOW (auto-open it so the
    // user isn't staring at one collapsed card). With multiple SOWs we
    // open none by default — otherwise the "last" SOW kept popping open on
    // every refresh even while the user worked in a different one. The
    // user expands what they want (or hits Expand all). restoreAccordionState
    // applies this only to sections with no prior state in the snapshot.
    var defaultOpenSowId = (state.sowGrids.length === 1)
      ? state.sowGrids[0].sowId
      : null;

    restoreAccordionState(mount, snap, defaultOpenSowId);

    // Mirror the just-restored state into sessionStorage so it's current
    // even if the page reloads before any toggle/beforeunload fires.
    persistAccordionState();

    // Notify other modules that the grid has been built
    $(document).trigger('scw-bid-review-rendered');

    return mount;
  };

  // ── public: showLoading ─────────────────────────────────────

  ns.showLoading = function showLoading() {
    if (v2OwnsPage()) return;   // v1 grid dead — v2 paints its own states
    var mount = getOrCreateMount();
    if (!mount) return;   // wrong scene
    mount.innerHTML = '';
    mount.className = 'scw-bid-review';
    mount.appendChild(el('div', 'scw-bid-review__loading', 'Loading comparison data'));
    return mount;
  };

  // ── public: clearMount ──────────────────────────────────────

  ns.clearMount = function clearMount() {
    var mount = document.querySelector(CFG.mountSelector);
    if (mount) mount.innerHTML = '';
  };

  // ── public: renderToast ─────────────────────────────────────

  ns.renderToast = function renderToast(message, type) {
    var existing = document.getElementById(TOAST_ID);
    if (existing) existing.remove();

    var toast = el('div', 'scw-bid-review__toast scw-bid-review__toast--' + (type || 'info'), message);
    toast.id = TOAST_ID;
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, CFG.toastDuration);
  };

})();
