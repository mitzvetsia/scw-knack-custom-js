/*** BID REVIEW V2 — CARD *****************************************************
 *
 * HTML factories for the v2 grid:
 *   buildSowSection(grid)        →  one SOW section (header + table)
 *   buildBidRow(row, packages)   →  one <tr> for one line item
 *   buildBidCell(cell, ctx)      →  one <td> for one (row × package) pair
 *
 * Every editable input is OUR input — never a Knack inline-edit field.
 * Inputs carry data-scw-br-v2-field / -record / -view; edit.js handles
 * commit + PUT.
 *
 * Phase 1: qty, rate, labor desc as plain inputs. Chips, connection
 * pickers, change-request buttons come in Phase 2.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.bidReviewV2;
  if (!ns || !ns.CONFIG) return;

  var FK  = ns.CONFIG.fieldKeys;
  var SFK = ns.CONFIG.sowItemFieldKeys || {};
  // Source views:
  //   [0] view_3680 — bid records  (READ-ONLY in this grid; changes go
  //                                 through Change Requests)
  //   [1] view_3921 — SOW items    (EDITABLE — source of truth)
  var BID_VIEW = (ns.CONFIG.sourceViewKeys || [])[0];
  var SOW_VIEW = (ns.CONFIG.sourceViewKeys || [])[1];

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // Cam/reader detection — mirrors v1's showCabling(). Only these
  // buckets get the displayLabel column (E-001, E-002, …) and the
  // cabling/plenum/exterior chips (Phase 2).
  var CAM_READER_BUCKET_ID = '6481e5ba38f283002898113c';
  function isCamReader(row) {
    if (row.proposalBucketId === CAM_READER_BUCKET_ID) return true;
    var b = (row.proposalBucket || '').toLowerCase().trim();
    return b === 'camera' || b === 'cameras' ||
           b === 'reader' || b === 'readers' ||
           /(camera|reader)/.test(b);
  }

  // Assumption rows are free-text line items (no product, no qty/rate/fee).
  function isAssumption(row) {
    var b = (row && row.proposalBucket || '').toLowerCase().trim();
    return b.indexOf('assumption') !== -1;
  }

  // PDF document icon — same shape v1's bid PDF link uses.
  var PDF_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>' +
    '<line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';

  // Chevron SVG — same shape v1's group header uses.
  var GROUP_CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '';
    return '$' + Number(n).toLocaleString(undefined, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  // ── Photos column ────────────────────────────────────────────
  // Mirrors v1's dedicated Photos column: one large thumb per row with
  // a "+N more" pill for the rest; clicking opens the row's expand
  // panel WITH a side-by-side photo viewer (init.js openWithPhoto).
  // We reuse v1's scraper verbatim — it already handles the 3-path
  // fallback (SOW-side .scw-inline-photo-card → view_3680 model
  // field_771_raw → view_3680 DOM) and caches across re-renders.
  var ROW_PHOTO_VISIBLE = 1;

  function getRowPhotoUrls(row) {
    var fn = window.SCW && SCW.bidReview && SCW.bidReview.scrapeRowPhotoUrls;
    if (typeof fn !== 'function') return null;
    // row.sowItem is the wsTr id (primary path); row.id is a bid
    // record id used by the fallback paths.
    return fn(row.sowItem || null, row.id || null);
  }

  function buildPhotosCell(row) {
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__photos-cell';
    var urls = getRowPhotoUrls(row);
    if (!urls || !urls.length) {
      td.innerHTML = '<div class="scw-bid-review-v2__photos-empty">—</div>';
      return td;
    }

    var stack = document.createElement('div');
    stack.className = 'scw-bid-review-v2__photos-stack';
    stack.setAttribute('title', urls.length + ' photo' +
      (urls.length === 1 ? '' : 's') +
      ' — click to open the editor with a full-size viewer');

    function openViewer(idx, e) {
      // Suppress the row's click-to-expand: we drive expansion ourselves
      // so the viewer mounts together with the panel.
      if (e) { e.preventDefault(); e.stopPropagation(); }
      var rowTr = td.parentNode;
      if (!rowTr || !ns.openWithPhoto) return;
      ns.openWithPhoto(rowTr, urls, idx);
    }

    var visible = Math.min(ROW_PHOTO_VISIBLE, urls.length);
    for (var v = 0; v < visible; v++) {
      (function (idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-bid-review-v2__photos-thumb';
        btn.addEventListener('click', function (e) { openViewer(idx, e); });
        var img = document.createElement('img');
        img.src = urls[idx]; img.alt = ''; img.loading = 'lazy';
        btn.appendChild(img);
        stack.appendChild(btn);
      })(v);
    }
    var hidden = urls.length - visible;
    if (hidden > 0) {
      (function (idx) {
        var more = document.createElement('span');
        more.className = 'scw-bid-review-v2__photos-more';
        more.textContent = '+' + hidden + ' more';
        more.addEventListener('click', function (e) { openViewer(idx, e); });
        stack.appendChild(more);
      })(visible);
    }
    td.appendChild(stack);
    return td;
  }

  /**
   * SOW item cell — leftmost data column. Read-only summary of the
   * underlying SOW line item that anchors this row. Edits to SOW
   * fields flow through worksheet-v2; bid-review v2 only displays.
   */
  var FIELD_DIFF = ' scw-bid-review-v2__field-diff';

  // Aggregate field-level mismatch across ALL of a row's bid cells, so we
  // can flag the differing field on the SOW side too (a field counts as
  // "different" when it doesn't match at least one displayed bid).
  function aggregateMismatch(row) {
    if (!row || !row.cellsByPackage || !ns.transform.getMismatches) return null;
    var agg = { product: false, laborDesc: false, fee: false, any: false };
    for (var pid in row.cellsByPackage) {
      if (!Object.prototype.hasOwnProperty.call(row.cellsByPackage, pid)) continue;
      var m = ns.transform.getMismatches(row, row.cellsByPackage[pid]);
      if (!m) continue;
      if (m.product)   agg.product = true;
      if (m.laborDesc) agg.laborDesc = true;
      if (m.fee)       agg.fee = true;
      if (m.any)       agg.any = true;
    }
    return agg;
  }

  // Render a "what it was" detail block (product / qty / sub-bid / desc)
  // for cut-out cells where the live record/cell is gone or unlinked.
  function detailBlockHtml(d) {
    if (!d) return '';
    var html = '';
    if (d.product) {
      html += '<div class="scw-bid-review-v2__cell-product" title="' +
        escapeHtml(d.product) + '">' + escapeHtml(d.product) + '</div>';
    }
    var qtyTxt = (d.qty != null && d.qty !== '' && d.qty !== 0) ? String(d.qty) : '';
    var feeTxt = d.fee ? fmtMoney(d.fee) : '';
    if (qtyTxt || feeTxt) {
      html += '<div class="scw-bid-review-v2__cell-numbers">';
      if (qtyTxt) html += '<span class="scw-bid-review-v2__cell-num"><label>Qty</label>' +
        escapeHtml(qtyTxt) + '</span>';
      if (feeTxt) html += '<span class="scw-bid-review-v2__cell-num"><label>Sub Bid</label>' +
        escapeHtml(feeTxt) + '</span>';
      html += '</div>';
    }
    var descTxt = ns.transform.stripHtml(d.desc || '');
    if (descTxt) html += '<div class="scw-bid-review-v2__cell-desc" title="' +
      escapeHtml(descTxt) + '">' + escapeHtml(descTxt) + '</div>';
    return html;
  }

  function buildSowCell(row, isAssumption, sowId) {
    var sowItemData = row && row.sowItemData;
    var diff = aggregateMismatch(row);
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__sow-cell';

    // No SOW item record exists for this row.
    if (!sowItemData) {
      td.classList.add('scw-bid-review-v2__sow-cell--empty');
      if (row && row.removed) {
        // Removed from everything → blue hash here too ("not on this
        // SOW"). A removed item still has a record somewhere (the bid
        // item, or the orphaned survey line item) — show what it WAS
        // inside the cut-out so reviewers see the removed item's details.
        td.classList.add('scw-bid-review-v2__sow-cell--off-sow');
        var rDetail = row.detail ? detailBlockHtml(row.detail) : '';
        td.innerHTML = rDetail ||
          '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      } else if (row && (!row.sowItem || row.needsSow)) {
        // Bid item with no SOW counterpart → offer "+ Add to SOW".
        td.innerHTML =
          '<span class="scw-bid-review-v2__cell-empty-mark">—</span>' +
          '<div class="scw-bid-review-v2__cell-actions">' +
            '<button type="button" class="scw-bid-review__cell-action ' +
              'scw-bid-review__cell-action--add scw-bid-review-v2__cell-action" ' +
              crAttrs('row_add_to_sow', row.id, '', sowId) + '>+ Add to SOW</button>' +
          '</div>';
      } else {
        // A blank cell means no corresponding SOW record exists.
        td.innerHTML = '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      }
      return td;
    }

    // The SOW item EXISTS → always show its details. If it isn't on THIS
    // SOW (offSow / belongs to another SOW / removed), wrap in the blue
    // cut-out so it reads as "exists, but not on this SOW".
    if (row && (row.offSow || row.removed)) td.classList.add('scw-bid-review-v2__sow-cell--off-sow');
    // Soft whole-cell tint when anything differs (no per-field hard
    // highlight on the SOW side — that's reserved for the bid columns).
    // The specific differing field lights up on hover of its bid-cell
    // counterpart, via the data-scw-sow-field hooks below.
    if (diff && diff.any) td.classList.add('scw-bid-review-v2__sow-cell--has-diff');
    var descTxt = ns.transform.stripHtml(sowItemData.laborDesc || '');
    // Assumptions are free-text only — no product name, no qty/fee numbers.
    if (isAssumption) {
      td.classList.add('scw-bid-review-v2__sow-cell--assumption');
      td.innerHTML = descTxt
        ? '<div class="scw-bid-review-v2__sow-desc" title="' +
            escapeHtml(descTxt) + '">' + escapeHtml(descTxt) + '</div>'
        : '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      return td;
    }
    var qtyTxt  = sowItemData.qty ? String(sowItemData.qty) : '—';
    var feeTxt  = sowItemData.fee ? fmtMoney(sowItemData.fee) : '—';
    td.innerHTML =
      (sowItemData.productName ?
        '<div class="scw-bid-review-v2__sow-product" data-scw-sow-field="product" title="' +
          escapeHtml(sowItemData.productName) + '">' +
          escapeHtml(sowItemData.productName) +
        '</div>' : '') +
      '<div class="scw-bid-review-v2__sow-numbers">' +
        '<span class="scw-bid-review-v2__sow-num"><label>Qty</label>' +
          escapeHtml(qtyTxt) + '</span>' +
        '<span class="scw-bid-review-v2__sow-num" data-scw-sow-field="fee"><label>Sub Bid</label>' +
          escapeHtml(feeTxt) + '</span>' +
      '</div>' +
      (descTxt ?
        '<div class="scw-bid-review-v2__sow-desc" data-scw-sow-field="desc" title="' +
          escapeHtml(descTxt) + '">' + escapeHtml(descTxt) +
        '</div>' : '') +
      // "belongs to another SOW" rows note which SOW(s) the item is on.
      ((row && row.otherKind === 'other-sow' && row.otherSowNames && row.otherSowNames.length) ?
        '<div class="scw-bid-review-v2__sow-elsewhere">on ' +
          escapeHtml(row.otherSowNames.join(', ')) + '</div>' : '');
    return td;
  }

  // v1's change-request API + the pending state (live on the same scene).
  function crApi() {
    return (window.SCW.bidReview && window.SCW.bidReview.changeRequests) || null;
  }
  // Find the pending CR item for a given row+package, if any.
  function findPendingItem(rowId, pkgId) {
    var api = crApi();
    if (!api || !api.getPending) return null;
    var pending = api.getPending() || {};
    var bucket = pending[pkgId];
    if (!bucket || !bucket.items) return null;
    for (var i = 0; i < bucket.items.length; i++) {
      if (bucket.items[i].rowId === rowId) return bucket.items[i];
    }
    return null;
  }
  // Shared data-* attrs string for a cell CR button.
  function crAttrs(action, rowId, pkgId, sowId) {
    return 'data-action="' + escapeHtml(action) + '" ' +
      'data-row-id="' + escapeHtml(rowId || '') + '" ' +
      'data-package-id="' + escapeHtml(pkgId || '') + '" ' +
      'data-sow-id="' + escapeHtml(sowId || '') + '"';
  }
  // Revise + Remove stack for a populated bid cell. Skipped for
  // requireSubBid:No rows (informational items the bidder isn't pricing).
  function cellActionStack(row, pkgId, sowId, diffs) {
    var noSubBid = row.requireSubBid && /^no$/i.test(String(row.requireSubBid).trim());
    if (noSubBid) return '';
    // When the bid mismatches the SOW for this row, the Revise button
    // becomes a dropdown (v1 parity): "Edit bid values" (free-form CR) +
    // "Match SOW values" (CR prefilled from SOW). dispatchCRAction handles
    // both cell_request_change and cell_request_change_from_sow. With no
    // mismatch, it's a single Revise button. Reuses v1's .scw-bid-review__
    // overflow* classes (v1 CSS is on the same scene); the menu items also
    // carry the v2 cell-action class so v2's delegated click dispatches
    // them, and the trigger toggle is wired in init.js.
    var revise;
    if (diffs && diffs.any) {
      revise =
        '<div class="scw-bid-review__overflow scw-bid-review-v2__overflow">' +
          '<button type="button" class="scw-bid-review__overflow-trigger ' +
            'scw-bid-review__overflow-trigger--revise scw-bid-review-v2__overflow-trigger">' +
            '<span class="scw-bid-review__overflow-dots">⋮</span> Revise</button>' +
          '<div class="scw-bid-review__overflow-menu">' +
            '<button type="button" class="scw-bid-review__overflow-item scw-bid-review-v2__cell-action" ' +
              crAttrs('cell_request_change', row.id, pkgId, sowId) + '>Edit bid values</button>' +
            '<button type="button" class="scw-bid-review__overflow-item scw-bid-review-v2__cell-action" ' +
              crAttrs('cell_request_change_from_sow', row.id, pkgId, sowId) + '>Match SOW values</button>' +
          '</div>' +
        '</div>';
    } else {
      revise =
        '<button type="button" class="scw-bid-review__cell-action ' +
          'scw-bid-review__cell-action--revise scw-bid-review-v2__cell-action" ' +
          crAttrs('cell_request_change', row.id, pkgId, sowId) + '>Revise</button>';
    }
    return '<div class="scw-bid-review-v2__cell-actions">' +
      revise +
      '<button type="button" class="scw-bid-review__cell-action ' +
        'scw-bid-review__cell-action--remove scw-bid-review-v2__cell-action" ' +
        crAttrs('cell_remove_from_bid', row.id, pkgId, sowId) + '>Remove</button>' +
    '</div>';
  }

  /**
   * One bid cell — the (row × package) intersection. Pure HTML factory
   * for content; CR buttons + pending card are appended after. Events
   * bind via delegation (edit.js for inputs, init.js for CR actions).
   */
  function buildBidCell(cell, row, pkg, sowId, isAssumption) {
    var td = document.createElement('td');
    td.className = 'scw-bid-review-v2__cell';
    var pkgId = pkg && pkg.id;
    var pendingItem = row ? findPendingItem(row.id, pkgId) : null;

    if (!cell) {
      td.classList.add('scw-bid-review-v2__cell--empty');
      // Assumptions aren't "on a bid" in the priced sense — leave blank.
      if (isAssumption) {
        td.innerHTML = '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
        appendPendingCard(td, pendingItem, row, pkg, sowId);
        return td;
      }
      // Any empty real-line-item cell is "not on this bid" → blue diagonal
      // hash. The LABEL depends on whether a bid item exists anywhere:
      //   • bid item exists (a populated cell elsewhere on this row, an
      //     unlinked surveyNoBid record, or a removed-from-bid snapshot)
      //     → "Removed from bid" + "Reinstate".
      //   • NO bid item points back at the SOW item at all (noBid, or an
      //     orphaned removed survey item) → "Not surveyed" + "Add to bid".
      td.classList.add('scw-bid-review-v2__cell--no-bid-cutout');
      var rowHasAnyBidCell = !!(row && row.cellsByPackage &&
        Object.keys(row.cellsByPackage).length > 0);
      var hasBidRecord = !!(row && (row.hasBidRecord || rowHasAnyBidCell ||
        (row.detail && row.detail.side === 'BID') || row.surveyNoBid));
      var badge    = hasBidRecord ? 'Removed from bid' : 'Not surveyed';
      var badgeCls = 'scw-bid-review-v2__no-bid-badge' +
        (hasBidRecord ? ' scw-bid-review-v2__no-bid-badge--removed' : '');
      // Show the bid item's details inside the hash when we have them.
      var detail   = (row && row.detail && row.detail.side === 'BID')
        ? detailBlockHtml(row.detail) : '';
      var actions  = '';
      if (row) {
        var addLabel = hasBidRecord ? '+ Reinstate' : '+ Add to bid';
        actions =
          '<div class="scw-bid-review-v2__cell-actions">' +
            '<button type="button" class="scw-bid-review__cell-action ' +
              'scw-bid-review__cell-action--add scw-bid-review-v2__cell-action" ' +
              crAttrs('cell_add_to_bid', row.id, pkgId, sowId) + '>' + addLabel + '</button>' +
          '</div>';
      }
      td.innerHTML =
        '<span class="' + badgeCls + '">' + badge + '</span>' + detail + actions;
      appendPendingCard(td, pendingItem, row, pkg, sowId);
      return td;
    }

    var descTxt = ns.transform.stripHtml(cell.laborDesc || '');

    // Assumptions are free-text only — no product name, no qty/rate/ext.
    if (isAssumption) {
      td.classList.add('scw-bid-review-v2__cell--assumption');
      td.innerHTML = descTxt
        ? '<div class="scw-bid-review-v2__cell-desc" title="' +
            escapeHtml(descTxt) + '">' + escapeHtml(descTxt) + '</div>'
        : '<span class="scw-bid-review-v2__cell-empty-mark">—</span>';
      td.innerHTML += cellActionStack(row, pkgId, sowId);
      appendPendingCard(td, pendingItem, row, pkg, sowId);
      return td;
    }

    var qtyTxt  = cell.qty  ? String(cell.qty) : '—';
    var rateTxt = cell.rate ? fmtMoney(cell.rate) : '—';
    var extTxt  = cell.labor ? fmtMoney(cell.labor) : '—';
    // Ext (qty × rate) is only meaningful when the quantity can exceed 1.
    // When qty is 1 (or unset), Ext equals Rate — redundant, so hide it.
    var showExt = (Number(cell.qty) || 0) > 1;

    // Diff against the SOW line item (v1 parity). Flag the whole cell +
    // pinpoint the differing fields. The fee diff (SOW fee vs bid extended
    // total) lands on Ext when shown, else on the Sub Bid figure (qty≤1 →
    // Ext == Sub Bid).
    var diffs = ns.transform.getMismatches(row, cell);
    var DIFF = ' scw-bid-review-v2__field-diff';
    if (diffs && diffs.any) td.classList.add('scw-bid-review-v2__cell--mismatch');
    var prodDiff = (diffs && diffs.product) ? DIFF : '';
    var descDiff = (diffs && diffs.laborDesc) ? DIFF : '';
    var feeOnExt = (diffs && diffs.fee && showExt) ? DIFF : '';
    var feeOnBid = (diffs && diffs.fee && !showExt) ? DIFF : '';
    // Hover hooks: hovering a differing field highlights its SOW-cell
    // counterpart (init.js wires the mouseover). Only the actually-
    // differing field carries the hook.
    var prodHover = (diffs && diffs.product)   ? ' data-scw-diff-field="product"' : '';
    var feeHover  = (diffs && diffs.fee)       ? ' data-scw-diff-field="fee"' : '';
    var descHover = (diffs && diffs.laborDesc) ? ' data-scw-diff-field="desc"' : '';

    td.innerHTML =
      (cell.productName ?
        '<div class="scw-bid-review-v2__cell-product' + prodDiff + '"' + prodHover + ' title="' +
          escapeHtml(cell.productName) + '">' +
          escapeHtml(cell.productName) +
        '</div>' : '') +
      '<div class="scw-bid-review-v2__cell-numbers">' +
        '<span class="scw-bid-review-v2__cell-num"><label>Qty</label>' +
          escapeHtml(qtyTxt) + '</span>' +
        '<span class="scw-bid-review-v2__cell-num' + feeOnBid + '"' + (showExt ? '' : feeHover) +
          '><label>Sub Bid</label>' + escapeHtml(rateTxt) + '</span>' +
        (showExt ?
          '<span class="scw-bid-review-v2__cell-num' + feeOnExt + '"' + feeHover +
            '><label>Ext</label>' + escapeHtml(extTxt) + '</span>' : '') +
      '</div>' +
      (descTxt ?
        '<div class="scw-bid-review-v2__cell-desc' + descDiff + '"' + descHover + ' title="' +
          escapeHtml(descTxt) + '">' + escapeHtml(descTxt) +
        '</div>' : '') +
      cellActionStack(row, pkgId, sowId, diffs);
    appendPendingCard(td, pendingItem, row, pkg, sowId);
    return td;
  }

  // Append v1's pending-CR summary card (if any) into a cell + flag the
  // cell so it reads as "has a pending change". The card carries the CR
  // dispatch attrs so clicking it re-opens the edit modal (v1 parity).
  function appendPendingCard(td, pendingItem, row, pkg, sowId) {
    if (!pendingItem) return;
    var api = crApi();
    if (!api || !api.buildSummaryCard) return;
    try {
      var card = api.buildSummaryCard(pendingItem, pkg && pkg.id, pkg && pkg.label);
      if (card) {
        card.classList.add('scw-bid-review-v2__cell-cr-card');
        card.setAttribute('data-action', 'cell_request_change');
        card.setAttribute('data-row-id', (row && row.id) || '');
        card.setAttribute('data-package-id', (pkg && pkg.id) || '');
        card.setAttribute('data-sow-id', sowId || '');
        td.classList.add('scw-bid-review-v2__cell--has-cr');
        td.appendChild(card);
      }
    } catch (e) { /* ignore */ }
  }

  function buildBidRow(row, packages, sowId) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__row';
    // Mismatch-state classes (v1 parity): on-SOW-not-on-bid and
    // on-bid-not-on-SOW. Styling lives in styles.js.
    if (row.noBid)       tr.classList.add('scw-bid-review-v2__row--no-bid');
    if (row.surveyNoBid) tr.classList.add('scw-bid-review-v2__row--survey-no-bid');
    if (row.offSow)      tr.classList.add('scw-bid-review-v2__row--off-sow');
    if (row.removed)     tr.classList.add('scw-bid-review-v2__row--removed');
    if (row.sowItem) tr.classList.add('scw-bid-review-v2__row--expandable');
    tr.setAttribute('data-row-id', row.id);
    if (row.sowItem) tr.setAttribute('data-sow-item-id', row.sowItem);
    tr.setAttribute('aria-expanded', 'false');

    // Label column — only show displayLabel (E-001, etc.) for cam/reader
    // rows. Everything else (networking, services, assumptions) is
    // identified by product name only, in the bid cell columns.
    var labelTd = document.createElement('td');
    labelTd.className = 'scw-bid-review-v2__row-label-cell';
    // Expand caret — kept as a direct child of the <td> (absolutely
    // positioned) so the cell stays a table-cell and its background spans
    // the full row height. The stacked content lives in an inner flex div.
    var caretHtml = row.sowItem
      ? '<span class="scw-bid-review-v2__row-caret" aria-hidden="true">' +
          GROUP_CHEVRON_SVG + '</span>'
      : '';
    var labelHtml = '';
    // Bulk-select checkbox — keyed on the SOW line-item id so the shared
    // worksheet-v2 bulk module (mounted on the SOW view) drives selection
    // + the floating edit/delete toolbar. Only for rows backed by a SOW
    // item (the editable record).
    if (row.sowItem) {
      labelHtml +=
        '<input type="checkbox" class="scw-br-v2-rowselect" ' +
        'data-scw-ws-v2-select="' + escapeHtml(row.sowItem) + '" ' +
        'aria-label="Select line item">';
    }
    if (isCamReader(row) && row.displayLabel) {
      labelHtml +=
        '<div class="scw-bid-review-v2__row-label">' +
          escapeHtml(row.displayLabel) + '</div>';
    }
    // Per-row SOW totals — Equipment Total above Install Fee, mirroring
    // v1's leftmost column. Read from the SOW item snapshot.
    var sd = row.sowItemData;
    if (sd && (sd.equipmentTotal || sd.installFee)) {
      labelHtml += '<div class="scw-bid-review-v2__row-totals">';
      if (sd.equipmentTotal) {
        labelHtml +=
          '<div class="scw-bid-review-v2__row-total scw-bid-review-v2__row-total--equip">' +
            '<span class="scw-bid-review-v2__row-total-label">Equip</span>' +
            '<span class="scw-bid-review-v2__row-total-value">' +
              escapeHtml(fmtMoney(sd.equipmentTotal)) + '</span>' +
          '</div>';
      }
      if (sd.installFee) {
        labelHtml +=
          '<div class="scw-bid-review-v2__row-total scw-bid-review-v2__row-total--install">' +
            '<span class="scw-bid-review-v2__row-total-label">Install</span>' +
            '<span class="scw-bid-review-v2__row-total-value">' +
              escapeHtml(fmtMoney(sd.installFee)) + '</span>' +
          '</div>';
      }
      labelHtml += '</div>';
    }
    labelTd.innerHTML = caretHtml +
      '<div class="scw-bid-review-v2__row-label-inner">' + labelHtml + '</div>';
    tr.appendChild(labelTd);

    // Photos column — one big thumb + "+N more"; click opens the
    // expand panel with a side-by-side viewer (v1 parity).
    tr.appendChild(buildPhotosCell(row));

    var assumption = isAssumption(row);

    // SOW item column — anchors the row, always second from left.
    tr.appendChild(buildSowCell(row, assumption, sowId));

    // One cell per bid package
    for (var p = 0; p < packages.length; p++) {
      var pkg = packages[p];
      var cell = row.cellsByPackage[pkg.id] || null;
      tr.appendChild(buildBidCell(cell, row, pkg, sowId, assumption));
    }
    return tr;
  }

  function buildL1HeaderRow(group, colspan) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__group-header';
    if (group.otherBidItems) tr.className += ' scw-bid-review-v2__group-header--other';
    if (group.bidOnlyItems)  tr.className += ' scw-bid-review-v2__group-header--bid-only';
    if (group.removedItems)  tr.className += ' scw-bid-review-v2__group-header--removed';
    if (group.defaultCollapsed) tr.className += ' scw-bid-review-v2__group-header--collapsed';
    tr.setAttribute('data-l1-id', group.key);
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-expanded', group.defaultCollapsed ? 'false' : 'true');
    var td = document.createElement('td');
    td.colSpan = colspan;
    var rowCount =
      (group.rows ? group.rows.length : 0) +
      (group.subgroups || []).reduce(function (a, s) { return a + s.rows.length; }, 0);
    td.innerHTML =
      '<div class="scw-bid-review-v2__grp-inner">' +
        '<span class="scw-bid-review-v2__grp-chevron">' + GROUP_CHEVRON_SVG + '</span>' +
        '<span class="scw-bid-review-v2__grp-title">' + escapeHtml(group.label) + '</span>' +
        '<span class="scw-bid-review-v2__grp-count">' + rowCount + '</span>' +
      '</div>';
    tr.appendChild(td);
    return tr;
  }

  function buildL2HeaderRow(sub, colspan) {
    var tr = document.createElement('tr');
    tr.className = 'scw-bid-review-v2__subgroup-header';
    var td = document.createElement('td');
    td.colSpan = colspan;
    td.innerHTML =
      '<div class="scw-bid-review-v2__subgrp-inner">' +
        '<span class="scw-bid-review-v2__subgrp-title">' + escapeHtml(sub.label) + '</span>' +
        '<span class="scw-bid-review-v2__subgrp-count">' + sub.rows.length + '</span>' +
      '</div>';
    tr.appendChild(td);
    return tr;
  }

  // ── L1 survey-notes callout (ported from v1) ─────────────────
  // MDF/IDF-level survey notes (field_2457 on view_3822) are the most
  // actionable thing the surveyor leaves; v1 promotes them to an amber
  // callout under each L1 group header. Scraped from the live view_3822
  // DOM, keyed by the group's mdfIdfId. Null when the source row is
  // missing or the field is empty (no callout = no clutter).
  var SURVEY_NOTES_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
    '<polyline points="14 2 14 8 20 8"/>' +
    '<line x1="9" y1="13" x2="15" y2="13"/>' +
    '<line x1="9" y1="17" x2="15" y2="17"/></svg>';

  function readSourceFieldText(sourceTr, fieldKey) {
    if (!sourceTr) return '';
    // Mirror v1's readRowFieldText: match the cell by CLASS or by
    // data-field-key (some views render the td with only the field class,
    // no data-field-key attr), and read the inner span.col-N when present.
    var td = sourceTr.querySelector('td.' + fieldKey +
      ', td[data-field-key="' + fieldKey + '"]');
    if (td) {
      var sp = td.querySelector('span.col-1, span[class^="col-"]');
      return ((sp || td).textContent || '').replace(/ /g, ' ').trim();
    }
    var cells = sourceTr.getElementsByTagName('td');
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].getAttribute('data-field-key') === fieldKey) {
        return (cells[i].textContent || '').replace(/ /g, ' ').trim();
      }
    }
    return '';
  }

  // Find the view_3822 source row for an MDF/IDF group. Prefer the record
  // id (fast, exact); fall back to matching the group's L1 label against a
  // row's text when the id is missing — connectionId() returns '' for
  // records lacking a *_raw connection array even though connectionLabel()
  // still resolves a label from the formatted value, so a group can have a
  // label but an empty mdfIdfId.
  function findMdfIdfSourceRow(view, mdfIdfId, label) {
    if (!view) return null;
    if (mdfIdfId) {
      var byId = view.querySelector('tbody tr[id="' + mdfIdfId + '"]');
      if (byId) return byId;
    }
    if (!label) return null;
    var target = String(label).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!target) return null;
    var rows = view.querySelectorAll('tbody tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].getElementsByTagName('td');
      for (var c = 0; c < cells.length; c++) {
        var t = (cells[c].textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        if (t === target) return rows[i];
      }
    }
    return null;
  }

  // Resolve survey-notes text (field_2457) for an MDF/IDF group from the
  // Knack model records of view_3822 (a v2 source view, so its Backbone
  // model is in memory with field_2457_raw + the field_1642 label — even
  // when those columns aren't rendered in the DOM). Match by record id,
  // then by label. Falls back to v1's API-loaded records. Returns ''.
  function stripTags(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function notesFromRecord(rec) {
    if (!rec) return '';
    return stripTags(rec.field_2457_raw != null ? rec.field_2457_raw : rec.field_2457);
  }
  function notesFromModel(mdfIdfId, label) {
    var recs = [];
    try {
      if (ns.data && ns.data.readRecords) {
        var viewKey = (window.SCW.bidReview && window.SCW.bidReview.CONFIG &&
          window.SCW.bidReview.CONFIG.mdfIdfViewKey) || 'view_3822';
        recs = ns.data.readRecords(viewKey) || [];
      }
    } catch (e) { recs = []; }
    // Fall back to v1's API-loaded records if the model read came up empty.
    if (!recs.length) {
      var v1 = window.SCW.bidReview;
      if (v1 && typeof v1.getMdfIdfRecords === 'function') recs = v1.getMdfIdfRecords() || [];
    }
    if (!recs.length) return '';
    var target = label ? stripTags(label).toLowerCase() : '';
    var byLabel = null;
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (mdfIdfId && rec.id === mdfIdfId) return notesFromRecord(rec);
      if (target && !byLabel) {
        var lbl = stripTags(rec.field_1642).toLowerCase();
        if (lbl && lbl === target) byLabel = rec;
      }
    }
    return byLabel ? notesFromRecord(byLabel) : '';
  }

  function buildL1SurveyNotesRow(group, colspan) {
    var dbg = !!(window.SCW.bidReview && window.SCW.bidReview.CONFIG &&
      window.SCW.bidReview.CONFIG.debug);
    var mdfIdfId = group && group.mdfIdfId;
    var label    = group && group.label;
    if (!mdfIdfId && !label) {
      if (dbg) console.log('[scw-br-v2] survey-notes: no mdfIdfId or label on group');
      return null;
    }
    // Primary source: the in-memory view_3822 model records.
    var txt = notesFromModel(mdfIdfId, label);
    // Last resort: scrape the live view_3822 DOM (only works if field_2457
    // is a rendered column).
    if (!txt) {
      var viewKey = (window.SCW.bidReview && window.SCW.bidReview.CONFIG &&
        window.SCW.bidReview.CONFIG.mdfIdfViewKey) || 'view_3822';
      var view = document.getElementById(viewKey);
      var src  = findMdfIdfSourceRow(view, mdfIdfId, label);
      if (src) txt = readSourceFieldText(src, 'field_2457');
    }
    if (dbg) console.log('[scw-br-v2] survey-notes:', {
      mdfIdfId: mdfIdfId, label: label, len: txt ? txt.length : 0, txt: txt });
    if (!txt) return null;

    var tr = document.createElement('tr');
    // Tag as a __row so the L1 collapse toggle (init.js) hides it with
    // the rest of the group.
    tr.className = 'scw-bid-review-v2__row scw-bid-review-v2__l1-survey-notes-row';
    var td = document.createElement('td');
    td.colSpan = colspan;
    td.className = 'scw-bid-review-v2__l1-survey-notes-cell';
    td.innerHTML =
      '<div class="scw-bid-review-v2__l1-survey-notes-wrap">' +
        '<span class="scw-bid-review-v2__l1-survey-notes-icon">' + SURVEY_NOTES_SVG + '</span>' +
        '<div class="scw-bid-review-v2__l1-survey-notes-body">' +
          '<div class="scw-bid-review-v2__l1-survey-notes-label">Survey Notes</div>' +
          '<div class="scw-bid-review-v2__l1-survey-notes-text">' + escapeHtml(txt) + '</div>' +
        '</div>' +
      '</div>';
    tr.appendChild(td);
    return tr;
  }

  function appendGroup(tbody, group, packages, colspan, sowId) {
    // Default-collapsed groups (e.g. "Removed items") render their rows
    // pre-hidden; the L1 collapse toggle in init.js flips them back.
    var hide = !!group.defaultCollapsed;
    function addRow(tr) {
      if (hide) {
        tr.classList.add('scw-bid-review-v2__row--hidden');
        tr.classList.add('scw-bid-review-v2__subgroup-header--hidden');
      }
      tbody.appendChild(tr);
    }
    // Level 0 means "flat" — no MDF/IDF on any row, just render rows.
    if (group.level === 1) {
      tbody.appendChild(buildL1HeaderRow(group, colspan));
      // MDF/IDF survey-notes callout immediately under the L1 header.
      var snRow = buildL1SurveyNotesRow(group, colspan);
      if (snRow) addRow(snRow);
    }
    // Direct rows (when there are no subgroups).
    for (var i = 0; i < group.rows.length; i++) {
      addRow(buildBidRow(group.rows[i], packages, sowId));
    }
    // Subgroups (L2 — proposal bucket).
    var subs = group.subgroups || [];
    for (var s = 0; s < subs.length; s++) {
      var sub = subs[s];
      addRow(buildL2HeaderRow(sub, colspan));
      for (var sr = 0; sr < sub.rows.length; sr++) {
        addRow(buildBidRow(sub.rows[sr], packages, sowId));
      }
    }
  }

  // One labelled money figure in a column header (Sub Bid / Install).
  function headTotal(label, amount) {
    return '<div class="scw-bid-review-v2__head-total">' +
      '<span class="scw-bid-review-v2__head-total-label">' + escapeHtml(label) + '</span>' +
      '<span class="scw-bid-review-v2__head-total-value">' +
        escapeHtml(fmtMoney(amount) || '$0.00') + '</span>' +
    '</div>';
  }

  // ── Per-column header cells, one per header band ──────────────────
  // The header is built as four aligned <tr> bands (title / totals /
  // details / actions) so the SOW column and every bid column line up
  // horizontally row-for-row. Each builder returns one <th> for a band.

  function pkgTh(pkg, bandCls, inner) {
    return '<th class="scw-bid-review-v2__th scw-bid-review-v2__head--pkg ' +
        bandCls + '" data-pkg-id="' + escapeHtml(pkg.id) + '">' + inner + '</th>';
  }

  function pkgTitleCell(pkg) {
    return pkgTh(pkg, 'scw-bid-review-v2__head-cell--title',
      '<div class="scw-bid-review-v2__head-title">Subcontractor Bid</div>');
  }

  function pkgTotalsCell(pkg) {
    var delta;
    if (pkg.matchesSow) {
      delta = '<div class="scw-bid-review-v2__head-delta scw-bid-review-v2__head-delta--match">' +
        '✓ matches SOW</div>';
    } else {
      var sign = pkg.deltaVsSow > 0 ? '+' : '−';
      delta = '<div class="scw-bid-review-v2__head-delta scw-bid-review-v2__head-delta--gap">' +
        sign + (fmtMoney(Math.abs(pkg.deltaVsSow)) || '$0.00') + ' vs SOW</div>';
    }
    return pkgTh(pkg, 'scw-bid-review-v2__head-cell--totals',
      '<div class="scw-bid-review-v2__head-totals">' +
        headTotal('Sub Bid', pkg.subBidTotal) +
      '</div>' + delta);
  }

  function pkgDetailsCell(pkg) {
    // Bid Name (field_2636) FIRST, with a label above it — mirrors the
    // "SOW Name" label/value at the top of the SOW details band so the two
    // columns' details line up vertically. Always rendered (placeholder
    // when empty) to keep the band height consistent across columns.
    var nameBlock =
      '<div class="scw-bid-review-v2__head-name">' +
        '<span class="scw-bid-review-v2__head-name-label">Bid Name</span>' +
        '<span class="scw-bid-review-v2__head-name-value">' +
          escapeHtml(pkg.bidName || '—') + '</span>' +
      '</div>';
    // PDF link (field_2626) — icon beside the bid label (BD-#).
    var pdfLink = pkg.pdfUrl
      ? '<a class="scw-bid-review-v2__pdf-link" href="' + escapeHtml(pkg.pdfUrl) + '" ' +
          'target="_blank" rel="noopener" title="' +
          escapeHtml(pkg.pdfFilename || 'View PDF') + '">' + PDF_SVG + '</a>'
      : '';
    // Status badge (field_2550).
    var statusBadge = pkg.bidStatus
      ? '<span class="scw-bid-review-v2__status-badge" data-status="' +
          escapeHtml(pkg.bidStatus.toLowerCase().replace(/\s+/g, '-')) + '">' +
          escapeHtml(pkg.bidStatus) + '</span>'
      : '';
    return pkgTh(pkg, 'scw-bid-review-v2__head-cell--details',
      nameBlock +
      '<div class="scw-bid-review-v2__head-subtitle">' +
        '<span class="scw-bid-review-v2__head-pkg-label">' + escapeHtml(pkg.label) + '</span>' +
        pdfLink +
      '</div>' +
      (statusBadge ? '<div class="scw-bid-review-v2__head-statusline">' + statusBadge + '</div>' : ''));
  }

  function pkgActionsCell(pkg, sowId) {
    // Action buttons (Submitted bids only) — reuse v1's handlers via
    // SCW.bidReview.dispatchHeaderAction. Buttons carry the same data-*
    // attrs + .scw-bid-review__btn class v1's setBusy/CSS expect. Order:
    // destructive/secondary first, primary (adopt) last per house style.
    var isSubmitted = /^submitted$/i.test(String(pkg.bidStatus || '').trim());
    var actions = '';
    if (isSubmitted) {
      actions =
        '<div class="scw-bid-review-v2__head-actions">' +
          headBtn('Reopen Bid', 'reopen', 'package_reopen_bid', pkg.id, sowId) +
          headBtn('+ Create new SOW', 'create', 'package_create_sow', pkg.id, sowId) +
          headBtn('← Update SOW to match Bid', 'adopt', 'package_copy_to_sow', pkg.id, sowId) +
        '</div>';
    }

    // Pending change-request controls — Submit (N) + Clear All, shown when
    // this package has pending CRs. Route through dispatchCRAction.
    var api = crApi();
    var pending = (api && api.getPending) ? (api.getPending() || {}) : {};
    var bucket = pending[pkg.id];
    var crCount = (bucket && bucket.items) ? bucket.items.length : 0;
    var crBtns = '';
    if (crCount) {
      crBtns =
        '<div class="scw-bid-review-v2__head-cr-actions">' +
          '<button type="button" class="scw-bid-review__btn scw-bid-review-v2__head-btn ' +
            'scw-bid-review-v2__head-btn--cr-clear" data-action="cr_clear_all">Clear All</button>' +
          '<button type="button" class="scw-bid-review__btn scw-bid-review-v2__head-btn ' +
            'scw-bid-review-v2__head-btn--cr-submit" data-action="cr_submit" ' +
            'data-pkg-id="' + escapeHtml(pkg.id) + '">Submit Change Request (' + crCount + ')</button>' +
        '</div>';
    }

    return pkgTh(pkg, 'scw-bid-review-v2__head-cell--actions', actions + crBtns);
  }

  // A header action button — v1-compatible classes + data attrs so
  // SCW.bidReview.dispatchHeaderAction can route it to v1's handler.
  function headBtn(label, mod, action, pkgId, sowId) {
    return '<button type="button" ' +
      'class="scw-bid-review__btn scw-bid-review__btn--' + mod +
        ' scw-bid-review-v2__head-btn" ' +
      'data-action="' + escapeHtml(action) + '" ' +
      'data-package-id="' + escapeHtml(pkgId) + '" ' +
      'data-sow-id="' + escapeHtml(sowId || '') + '">' +
      escapeHtml(label) +
    '</button>';
  }

  // ── Per-SOW collapse persistence ─────────────────────────────
  function sowCollapseScene() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  function sowCollapseKey(sowId) {
    return 'scw:br-v2:sow-collapse:' + sowCollapseScene() + ':' + sowId;
  }
  function isSowCollapsed(sowId) {
    try { return localStorage.getItem(sowCollapseKey(sowId)) === '1'; }
    catch (e) { return false; }
  }

  var SOW_CARET =
    '<svg class="scw-bid-review-v2__sow-caret" viewBox="0 0 24 24" width="14" height="14" ' +
    'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

  function buildSowSection(grid) {
    var section = document.createElement('section');
    section.className = 'scw-bid-review-v2__sow';
    section.setAttribute('data-sow-id', grid.sowId);
    var collapsed = isSowCollapsed(grid.sowId);
    if (collapsed) section.classList.add('scw-bid-review-v2__sow--collapsed');

    var header = document.createElement('header');
    header.className = 'scw-bid-review-v2__sow-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    header.innerHTML =
      SOW_CARET +
      '<span class="scw-bid-review-v2__sow-name">' + escapeHtml(grid.sowName) + '</span>' +
      '<span class="scw-bid-review-v2__sow-meta">' +
        grid.rows.length + ' line item' + (grid.rows.length === 1 ? '' : 's') +
        ' × ' + grid.packages.length + ' bid' + (grid.packages.length === 1 ? '' : 's') +
      '</span>';
    section.appendChild(header);

    var table = document.createElement('table');
    table.className = 'scw-bid-review-v2__table';

    // Column headers — four aligned bands so SOW + bid columns line up
    // row-for-row: title / totals / details / actions. Line-item + Photos
    // columns span all four bands (rowspan).
    var thead = document.createElement('thead');
    var totals = grid.sowTotals || { subBid: 0, install: 0 };
    var pkgs = grid.packages;

    function makeRow(bandMod, sowCellHtml, pkgCellFn) {
      var tr = document.createElement('tr');
      tr.className = 'scw-bid-review-v2__head-row scw-bid-review-v2__head-row--' + bandMod;
      var html = sowCellHtml;
      for (var i = 0; i < pkgs.length; i++) html += pkgCellFn(pkgs[i]);
      tr.innerHTML = html;
      return tr;
    }

    function sowTh(bandCls, inner) {
      return '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--sow ' +
        'scw-bid-review-v2__head--sow ' + bandCls + '">' + inner + '</th>';
    }

    // Band 1 — titles. Line-item + Photos columns rowspan the whole head.
    var r1 = document.createElement('tr');
    r1.className = 'scw-bid-review-v2__head-row scw-bid-review-v2__head-row--title';
    var r1Html =
      '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--label" rowspan="4"></th>' +
      '<th class="scw-bid-review-v2__th scw-bid-review-v2__th--photos" rowspan="4">Photos</th>' +
      sowTh('scw-bid-review-v2__head-cell--title',
        '<div class="scw-bid-review-v2__head-title">SCW SOW</div>');
    for (var p1 = 0; p1 < pkgs.length; p1++) r1Html += pkgTitleCell(pkgs[p1]);
    r1.innerHTML = r1Html;
    thead.appendChild(r1);

    // Band 2 — totals (Sub Bid aligned across SOW + bids).
    thead.appendChild(makeRow('totals',
      sowTh('scw-bid-review-v2__head-cell--totals',
        '<div class="scw-bid-review-v2__head-totals">' +
          headTotal('Sub Bid', totals.subBid) +
          headTotal('Install', totals.install) +
        '</div>'),
      pkgTotalsCell));

    // Band 3 — details (SOW name/proposal/docs/survey/margin ‖ bid label/PDF/status).
    var r3 = makeRow('details',
      sowTh('scw-bid-review-v2__head-cell--details scw-bid-review-v2__head--sow-details', ''),
      pkgDetailsCell);
    thead.appendChild(r3);

    // Band 4 — actions (both columns' buttons at the bottom).
    var r4 = makeRow('actions',
      sowTh('scw-bid-review-v2__head-cell--actions scw-bid-review-v2__head--sow-actions', ''),
      function (pkg) { return pkgActionsCell(pkg, grid.sowId); });
    thead.appendChild(r4);

    // SOW metrics — reuse v1's status-bar renderer (SOW name, published
    // proposal, docs, survey costs, margin, margin-low warning, preview
    // pill). v1 runs on the same scene, so its DOM scrapers + opsReview are
    // live. The renderer returns { details, actions }; place details in the
    // details band and actions in the actions band so the SOW column tracks
    // the bid columns' layout.
    var v1 = window.SCW.bidReview;
    if (v1 && typeof v1.buildSowStatusBar === 'function') {
      try {
        var bar = v1.buildSowStatusBar({ sowId: grid.sowId, sowName: grid.sowName });
        if (bar) {
          var detSlot = r3.querySelector('.scw-bid-review-v2__head--sow-details');
          var actSlot = r4.querySelector('.scw-bid-review-v2__head--sow-actions');
          if (detSlot && bar.details) detSlot.appendChild(bar.details);
          if (actSlot && bar.actions) actSlot.appendChild(bar.actions);
        }
      } catch (err) {
        if (window.console && console.warn) {
          console.warn('[BidReviewV2] buildSowStatusBar failed', err);
        }
      }
    }
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    // colspan = label + photos + sow + one per bid package
    var colspan = grid.packages.length + 3;
    var groups = grid.groups || [{ key: '__all__', level: 0, rows: grid.rows, subgroups: [] }];
    for (var g = 0; g < groups.length; g++) {
      appendGroup(tbody, groups[g], grid.packages, colspan, grid.sowId);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  ns.card = {
    buildSowSection: buildSowSection,
    buildBidRow:     buildBidRow,
    buildBidCell:    buildBidCell
  };
})();
/*** END BID REVIEW V2 — CARD *************************************************/
