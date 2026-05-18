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

  // ── mount point ─────────────────────────────────────────────

  function getOrCreateMount() {
    // Flag the body so view_3921's accordion hides via CSS while the
    // bid review grid is on screen.
    document.body.classList.add('scw-bid-review-active');
    var mount = document.querySelector(CFG.mountSelector);
    if (!mount) {
      mount = el('div');
      mount.id = CFG.mountSelector.replace(/^#/, '');
      // Insert after the nav menu (view_44)
      var nav = document.getElementById('view_44');
      if (nav && nav.nextSibling) {
        nav.parentNode.insertBefore(mount, nav.nextSibling);
      } else if (nav) {
        nav.parentNode.appendChild(mount);
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
    var colCount = 2 + sowGrid.packages.length + 1; // line item + sow + packages + CR

    // ═══ ROW 1: Column titles ═══
    // Each SOW + Bid column shows a totals summary below its title:
    //   SOW · Install Total = Σ row.sowInstallFee
    //   Bid · Sub Bid Total = Σ cell.labor for that package
    var sowInstallTotal = 0;
    var pkgSubBidTotals = {};
    for (var ti = 0; ti < sowGrid.packages.length; ti++) {
      pkgSubBidTotals[sowGrid.packages[ti].id] = 0;
    }
    for (var ri = 0; ri < sowGrid.rows.length; ri++) {
      var tRow = sowGrid.rows[ri];
      if (tRow.sowInstallFee) sowInstallTotal += Number(tRow.sowInstallFee) || 0;
      if (tRow.cellsByPackage) {
        for (var pid in pkgSubBidTotals) {
          var tCell = tRow.cellsByPackage[pid];
          if (tCell && tCell.labor) {
            pkgSubBidTotals[pid] += Number(tCell.labor) || 0;
          }
        }
      }
    }

    function buildTitleCell(cls, title, totalLabel, totalVal) {
      var th = el('th', cls);
      th.appendChild(el('div', 'scw-bid-review__col-title-text', title));
      if (totalLabel) {
        var sub = el('div', 'scw-bid-review__col-title-total');
        sub.appendChild(el('span', 'scw-bid-review__col-title-total-label', totalLabel));
        sub.appendChild(document.createTextNode(' '));
        sub.appendChild(el('span', 'scw-bid-review__col-title-total-value', formatCurrency(totalVal || 0)));
        th.appendChild(sub);
      }
      return th;
    }

    var r1 = el('tr', 'scw-bid-review__header-row scw-bid-review__header-titles');
    r1.appendChild(el('th', 'scw-bid-review__sow-header', 'Line Item'));
    // Sales Revisions column injected externally — leave gap
    r1.appendChild(buildTitleCell(
      'scw-bid-review__sow-detail-header', 'SOW', 'Install Total:', sowInstallTotal
    ));
    for (var i = 0; i < sowGrid.packages.length; i++) {
      r1.appendChild(buildTitleCell(
        'scw-bid-review__pkg-header', 'Bid', 'Sub Bid Total:',
        pkgSubBidTotals[sowGrid.packages[i].id]
      ));
    }
    r1.appendChild(el('th', 'scw-bid-review__actions-header scw-bid-review__cr-col', 'Sub Bid Revisions'));
    rows.push(r1);

    // ═══ ROW 2: Details (status, name, links) ═══
    var r2 = el('tr', 'scw-bid-review__header-row scw-bid-review__header-details');
    r2.appendChild(el('td', '')); // line item

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

      if (pkg.crPendingCount > 0 && pkg.crLinkUrl) {
        var crLink = document.createElement('a');
        crLink.href = pkg.crLinkUrl;
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

      if (isSubmitted) {
        actionTd.appendChild(btn(
          '\u2190 Sync SOW to Bid', 'adopt',
          { 'data-action': 'package_copy_to_sow', 'data-package-id': pkg2.id, 'data-sow-id': sowGrid.sowId }
        ));
        actionTd.appendChild(btn(
          '+ Create new SOW', 'create',
          { 'data-action': 'package_create_sow', 'data-package-id': pkg2.id, 'data-sow-id': sowGrid.sowId }
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
        'Submit ' + sPkg.pkgName + ' (' + sPkg.items.length + ')', 'cr-submit sm',
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

    // Lazy-built top-right action stack. "Revise bid to match" goes on
    // top (only when there are mismatches), "Disconnect from SOW" sits
    // below. One stack so the two buttons line up cleanly in the same
    // corner instead of fighting over different anchor points.
    var topRightStack = null;
    function getTopRightStack() {
      if (!topRightStack) {
        topRightStack = el('div', 'scw-bid-review__cell-actions');
        td.appendChild(topRightStack);
      }
      return topRightStack;
    }

    // Top entry: Revise bid to match — only for the packages whose
    // bid actually differs from the SOW. If every bid matches, the
    // button has nothing to ask for so we hide it entirely.
    if (row.sowItem && !row.noBid && !row.surveyNoBid && packages && packages.length) {
      var mismatched = [];
      for (var mpi = 0; mpi < packages.length; mpi++) {
        var pInfo = diffsByPkg && diffsByPkg[packages[mpi].id];
        if (pInfo && pInfo.any) mismatched.push(packages[mpi]);
      }

      if (mismatched.length) {
        var attrsBase = function (pkgId) {
          return {
            'data-action':     'cell_request_change_from_sow',
            'data-row-id':     row.id,
            'data-package-id': pkgId,
            'data-sow-id':     sowId || '',
            'data-vis-qty':     qtyVisible ? '1' : '0',
            'data-vis-cabling': cablingVisible ? '1' : '0',
            'data-vis-conn':    connDevVisible ? '1' : '0',
          };
        };
        var matchLabel = 'Revise bid to match →';
        var rStack = getTopRightStack();
        if (mismatched.length === 1) {
          var attrsR = attrsBase(mismatched[0].id);
          var rBtn = el('button',
            'scw-bid-review__cell-action scw-bid-review__cell-action--revise',
            matchLabel);
          rBtn.type = 'button';
          var rKeys = Object.keys(attrsR);
          for (var rk = 0; rk < rKeys.length; rk++) rBtn.setAttribute(rKeys[rk], attrsR[rKeys[rk]]);
          rStack.appendChild(rBtn);
        } else {
          var choices = [];
          for (var sci = 0; sci < mismatched.length; sci++) {
            choices.push({ label: mismatched[sci].name, attrs: attrsBase(mismatched[sci].id) });
          }
          rStack.appendChild(buildOverflowMenu(matchLabel, 'revise', choices));
        }
      }
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

    // Bottom entry of the top-right stack: Disconnect from SOW. Removes
    // this SOW's id from the SOW item record's field_2154 connection
    // (leaving any other connected SOWs intact). The line item itself
    // is NOT deleted.
    if (row.sowItem && sowId) {
      var dStack = getTopRightStack();
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
        td.appendChild(buildCellActions([
          { label: 'Revise', mod: 'revise', attrs: withAction('cell_request_change') },
          { label: 'Remove', mod: 'remove', attrs: withAction('cell_remove_from_bid') },
        ]));
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
  // whether any of them carries renderable content. Header r1 always
  // has the title text (the th has its own children), so check for
  // body-row action cells with non-empty .scw-bid-review__row-actions
  // wraps OR a header-action-cell with submit buttons.
  function tableHasCrContent(table) {
    var actionWraps = table.querySelectorAll('.scw-bid-review__cr-col .scw-bid-review__row-actions');
    for (var i = 0; i < actionWraps.length; i++) {
      if (actionWraps[i].children.length > 0) return true;
    }
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

    // Collect eligible packages per action type. Revise + Remove
    // moved into the cells; this pass only collects Add candidates
    // (noBid rows) and any pending CR cards to surface here.
    var addChoices    = [];
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
        for (var pi = 0; pi < pending[cpkg.id].items.length; pi++) {
          if (pending[cpkg.id].items[pi].rowId === row.id) { pendingItem = pending[cpkg.id].items[pi]; break; }
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

    // No Bid / Survey No Bid rows — Add button (skip packages that already have a pending add)
    if (row.noBid || row.surveyNoBid) {
      for (var bi = 0; bi < packages.length; bi++) {
        // Check if there's already an addToBid pending for this row+package
        var alreadyAdding = false;
        if (pending[packages[bi].id] && pending[packages[bi].id].items) {
          for (var api = 0; api < pending[packages[bi].id].items.length; api++) {
            if (pending[packages[bi].id].items[api].rowId === row.id &&
                pending[packages[bi].id].items[api].addToBid) {
              alreadyAdding = true; break;
            }
          }
        }
        if (alreadyAdding) continue;

        var addAttrs = {
          'data-action':      'cell_add_to_bid',
          'data-row-id':      row.id,
          'data-package-id':  packages[bi].id,
          'data-sow-id':      sowId,
        };
        addChoices.push({ label: packages[bi].name, attrs: addAttrs });
      }
    }

    // Render: pending cards first, action menus below
    for (var pc = 0; pc < pendingCards.length; pc++) {
      wrap.appendChild(pendingCards[pc]);
    }

    var menuRow = el('div', 'scw-bid-review__action-menus');

    if (addChoices.length) {
      menuRow.appendChild(buildOverflowMenu('Add', 'add', addChoices));
    }

    if (menuRow.childNodes.length) wrap.appendChild(menuRow);

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

  // ── per-row photo strip ─────────────────────────────────────
  // Surfaces a compact thumbnail strip in the label cell for line
  // items that have photos attached, so reviewers can skim "did the
  // surveyor get evidence for this device?" without expanding the
  // row. Source: view_3921 (sowItemsViewKey) — the same view that
  // backs the row-expand worksheet, so the photos here match what
  // the user sees on click-to-open.
  //
  // Cap visible thumbs at 2; surplus shown as a "+N" pill that
  // doesn't intercept clicks (so the row's click-to-expand still
  // fires and the user sees the full strip inside the worksheet
  // card). Individual thumb clicks open the full-size image in a
  // new tab and stopPropagation so they don't also expand the row.
  var ROW_PHOTO_VISIBLE = 2;
  function buildRowPhotoStrip(rowId) {
    if (!rowId) return null;
    var view = document.getElementById(CFG.sowItemsViewKey);
    if (!view) return null;
    var sourceTr = view.querySelector('tbody tr[id="' + rowId + '"]');
    if (!sourceTr) return null;

    // field_771 may render as either a class-named td or via
    // data-field-key (Knack varies by table configuration).
    var photoCell = sourceTr.querySelector(
      'td[data-field-key="field_771"], td.field_771'
    );
    if (!photoCell) return null;

    var imgSpans = photoCell.querySelectorAll('span[id][data-kn="connection-value"]');
    var imgUrls = [];
    for (var i = 0; i < imgSpans.length; i++) {
      var img = imgSpans[i].querySelector('img[data-kn-img-gallery], img');
      if (!img) continue;
      var url = img.getAttribute('data-kn-img-gallery') || img.getAttribute('src') || '';
      if (url) imgUrls.push(url);
    }
    if (!imgUrls.length) return null;

    var strip = el('div', 'scw-bid-review__row-photos');
    strip.setAttribute('title', imgUrls.length + ' photo' +
      (imgUrls.length === 1 ? '' : 's') + ' — click a thumb to enlarge');

    var visible = Math.min(ROW_PHOTO_VISIBLE, imgUrls.length);
    for (var v = 0; v < visible; v++) {
      var a = document.createElement('a');
      a.href = imgUrls[v];
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'scw-bid-review__row-photo';
      // Don't let the thumb click bubble up — the row is also
      // click-to-expand, and we don't want opening a photo to fire
      // the row's accordion as a side effect.
      a.addEventListener('click', function (e) { e.stopPropagation(); });
      var thumb = document.createElement('img');
      thumb.src = imgUrls[v];
      thumb.alt = '';
      thumb.loading = 'lazy';
      a.appendChild(thumb);
      strip.appendChild(a);
    }
    var hidden = imgUrls.length - visible;
    if (hidden > 0) {
      var more = el('span', 'scw-bid-review__row-photo-more', '+' + hidden);
      // Let this click bubble so it expands the row → full strip
      // shows up inside the worksheet card automatically.
      strip.appendChild(more);
    }
    return strip;
  }

  // ── data row ────────────────────────────────────────────────

  function buildDataRow(row, packages, sowId) {
    var rowClass = 'scw-bid-review__row';
    if (row.noBid) rowClass += ' scw-bid-review__row--no-bid';
    if (row.surveyNoBid) rowClass += ' scw-bid-review__row--survey-no-bid';
    if (row.sowItem) rowClass += ' scw-bid-review__row--expandable';
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
      // Per-row photo evidence strip — sits below totals so the
      // left column reads as a single "row identity" cluster:
      // label, money, evidence. Skipped for NEW rows that don't
      // have a SOW line item yet (no source view_3921 row to scrape).
      if (row.sowItem) {
        var photoStrip = buildRowPhotoStrip(row.sowItem);
        if (photoStrip) labelTd.appendChild(photoStrip);
      }
    }
    tr.appendChild(labelTd);

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
      if (d && d.any) {
        dataTd.classList.add('scw-bid-review__cell--mismatch');
      }
      // Show bid-status badge in the package cell when there's no bid data
      if (!row.cellsByPackage[pid]) {
        if (row.surveyNoBid) {
          dataTd.textContent = '';
          dataTd.appendChild(el('span', 'scw-bid-review__survey-no-bid-badge', 'NOT ON BID'));
        } else if (row.noBid) {
          dataTd.textContent = '';
          dataTd.appendChild(el('span', 'scw-bid-review__no-bid-badge', 'NOT SURVEYED'));
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

  function buildGroupHeader(group, colSpan, rowCount) {
    var label   = group.label;

    var tr = el('tr', 'scw-bid-review__group-header');
    tr.setAttribute('role', 'button');
    tr.setAttribute('tabindex', '0');
    tr.setAttribute('aria-expanded', 'true');

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

      if (group.label) {
        frag.appendChild(buildGroupHeader(group, colSpan, totalRows));
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
          var surveyNotes = buildL1SurveyNotesRow(group.mdfIdfId, colSpan);
          if (surveyNotes) frag.appendChild(surveyNotes);
          var detail = buildL1DetailRow(group.mdfIdfId, colSpan);
          if (detail) frag.appendChild(detail);
        }
      }

      // Subgroups (proposalBucket within mdfIdf)
      if (group.subgroups && group.subgroups.length) {
        for (var si = 0; si < group.subgroups.length; si++) {
          var sub = group.subgroups[si];
          if (sub.label) {
            frag.appendChild(buildSubgroupHeader(sub.label, colSpan, sub.rows.length));
          }
          for (var ri = 0; ri < sub.rows.length; ri++) {
            frag.appendChild(buildDataRow(sub.rows[ri], packages, sowId));
          }
        }
      }

      // Direct rows (no subgroups)
      for (var di = 0; di < group.rows.length; di++) {
        frag.appendChild(buildDataRow(group.rows[di], packages, sowId));
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

    var idx = { bySow: {}, byBid: {} };
    var view = document.getElementById(CFG.docFilesViewKey);
    if (!view) { _docsIndexCache = idx; return idx; }

    var rows = view.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];

      // Connected record ids: the inner span's class is the id.
      var sowSpan = tr.querySelector('td.field_2143 span[data-kn="connection-value"]');
      var bidSpan = tr.querySelector('td.field_2421 span[data-kn="connection-value"]');
      var sowId = sowSpan ? (sowSpan.className || '').trim() : '';
      var bidId = bidSpan ? (bidSpan.className || '').trim() : '';
      if (!sowId && !bidId) continue;

      // File link — field_68 carries an <a class="kn-view-asset"> with
      // the asset URL + filename. If there's no anchor (e.g. the
      // record holds an image in field_754 instead), skip — there's
      // nothing actionable to link to.
      var fileA = tr.querySelector('td.field_68 a.kn-view-asset, td.field_68 a');
      if (!fileA) continue;

      var doc = {
        id:       tr.id,
        docType:  readRowFieldText(tr, 'field_67'),
        notes:    readRowFieldText(tr, 'field_588'),
        fileName: (fileA.textContent || '').trim() || 'Document',
        fileUrl:  fileA.getAttribute('href') || '',
      };

      if (sowId) {
        if (!idx.bySow[sowId]) idx.bySow[sowId] = [];
        idx.bySow[sowId].push(doc);
      }
      if (bidId) {
        if (!idx.byBid[bidId]) idx.byBid[bidId] = [];
        idx.byBid[bidId].push(doc);
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
      var d = docs[i];
      var row = el('div', 'scw-bid-review__docs-item');
      // Doc type chip — only render when present so plain "uncategorised"
      // uploads don't get an empty pill.
      if (d.docType) row.appendChild(el('span', 'scw-bid-review__docs-type', d.docType));
      var a = document.createElement('a');
      a.href = d.fileUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = d.fileName;
      a.className = 'scw-bid-review__docs-link';
      a.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      a.appendChild(document.createTextNode(' ' + d.fileName));
      row.appendChild(a);
      if (d.notes) {
        var nEl = el('span', 'scw-bid-review__docs-notes', d.notes);
        nEl.title = d.notes;
        row.appendChild(nEl);
      }
      wrap.appendChild(row);
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
  function buildSowStatusBar(sowGrid) {
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
        proposalViewKey: CFG.proposalSourceView
      });
      if (proposalBlock) {
        // Inline the PDF link next to the quote name + swap its icon
        // for the same paper SVG the bid-column status row uses, so the
        // SOW + bid columns visually mirror each other.
        var pdfA = proposalBlock.querySelector('.scw-pq-pdf');
        var nameDiv = proposalBlock.querySelector('.scw-pq-name');
        if (pdfA && nameDiv) {
          pdfA.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';
          pdfA.title = pdfA.title || 'View PDF';
          pdfA.classList.add('scw-bid-review__pq-pdf-icon');
          nameDiv.appendChild(pdfA);
        }
        details.appendChild(proposalBlock);
      }
    }

    // 2. Survey Costs (editable input) + Margin (read-only display).
    var metrics = el('div', 'scw-bid-review__sow-metrics');

    var surveyWrap = el('label', 'scw-bid-review__sow-metric');
    surveyWrap.appendChild(el('span', 'scw-bid-review__sow-metric-label', 'Survey Costs'));
    var surveyInput = document.createElement('input');
    surveyInput.type = 'text';
    surveyInput.className = 'scw-bid-review__sow-metric-input';
    surveyInput.setAttribute('data-action', 'sow_survey_costs');
    surveyInput.setAttribute('data-sow-id', sowId);
    surveyInput.setAttribute('data-field', CFG.surveyCostsField || '');
    surveyInput.value = readRowFieldText(tr, CFG.surveyCostsField);
    surveyInput.placeholder = '$0.00';
    surveyWrap.appendChild(surveyInput);
    metrics.appendChild(surveyWrap);

    var marginWrap = el('div', 'scw-bid-review__sow-metric');
    marginWrap.appendChild(el('span', 'scw-bid-review__sow-metric-label', 'Margin'));
    var marginVal = readRowFieldText(tr, CFG.marginField);
    marginWrap.appendChild(el('span', 'scw-bid-review__sow-metric-value', marginVal || '—'));
    metrics.appendChild(marginWrap);

    details.appendChild(metrics);

    // 2b. Attached documents (DOC_files records connected to this SOW
    //     via field_2143). Filenames link to the Knack-hosted asset.
    var docsIdx = buildDocsIndex();
    var sowDocs = docsIdx.bySow[sowId];
    var sowDocsBlock = buildDocsBlock(sowDocs, 'Documents');
    if (sowDocsBlock) details.appendChild(sowDocsBlock);

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

    return { details: details, actions: actions };
  }

  function buildSowSection(sowGrid) {
    var section = el('div', 'scw-bid-review__sow-section');
    section.setAttribute('data-sow-id', sowGrid.sowId);

    // SOW accordion header (clickable) — open by default
    var header = el('div', 'scw-bid-review__sow-title');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'true');

    var chevron = el('span', 'scw-bid-review__sow-chevron');
    chevron.innerHTML = CHEVRON_SVG;
    header.appendChild(chevron);

    header.appendChild(el('span', 'scw-bid-review__sow-title-text', sowGrid.sowName));
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
          'tr.scw-bid-review__l1-detail-row > td[colspan]'
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

  function restoreAccordionState(mount, snap) {
    if (!mount || !snap) return;

    // Restore SOW sections (default is now open, so restore collapsed ones)
    var sections = mount.querySelectorAll('.scw-bid-review__sow-section');
    for (var i = 0; i < sections.length; i++) {
      var sowId = sections[i].getAttribute('data-sow-id');
      if (sowId && snap.sow[sowId] === false) {
        // Was collapsed — collapse it
        sections[i].classList.add('scw-bid-review__sow-section--collapsed');
        var hdr = sections[i].querySelector('.scw-bid-review__sow-title');
        if (hdr) hdr.setAttribute('aria-expanded', 'false');
      }
    }

    // Restore MDF/IDF group headers
    var headers = mount.querySelectorAll('.scw-bid-review__group-header');
    for (var h = 0; h < headers.length; h++) {
      var section = headers[h].closest('.scw-bid-review__sow-section');
      var sowKey = section ? section.getAttribute('data-sow-id') : '__root__';
      var label = (headers[h].querySelector('.scw-bid-review__grp-title') || {}).textContent || '';
      var key = sowKey + '::' + label;

      if (label && snap.group[key] === false) {
        // Was collapsed — collapse it
        headers[h].setAttribute('aria-expanded', 'false');
        headers[h].classList.add('scw-bid-review__group-header--collapsed');
        var sibling = headers[h].nextElementSibling;
        while (sibling) {
          if (sibling.classList.contains('scw-bid-review__group-header')) break;
          sibling.style.display = 'none';
          sibling = sibling.nextElementSibling;
        }
      }
    }
  }

  // ── grid toolbar (top of #bid-review-matrix) ────────────────

  function buildToolbar() {
    var bar = el('div', 'scw-bid-review__toolbar');
    var createBtn = btn('+ Create New SOW', 'create-sow', {
      'data-action': 'create_new_sow',
      'title':       'Create a new SOW from matched SOW items + orphan bid records',
    });
    bar.appendChild(createBtn);
    return bar;
  }

  // ── public: renderMatrix ────────────────────────────────────

  ns.renderMatrix = function renderMatrix(state) {
    var mount = getOrCreateMount();

    // Preserve accordion state across re-renders
    var snap = snapshotAccordionState(mount);

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

    mount.appendChild(buildToolbar());

    for (var i = 0; i < state.sowGrids.length; i++) {
      mount.appendChild(buildSowSection(state.sowGrids[i]));
    }

    restoreAccordionState(mount, snap);

    // Notify other modules that the grid has been built
    $(document).trigger('scw-bid-review-rendered');

    return mount;
  };

  // ── public: showLoading ─────────────────────────────────────

  ns.showLoading = function showLoading() {
    var mount = getOrCreateMount();
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
