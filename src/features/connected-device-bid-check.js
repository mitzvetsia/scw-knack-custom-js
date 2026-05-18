/*** FEATURE: Connected Device Bid Validation ************************************
 *
 * On view_3505 (subcontractor bid worksheet), checks each camera/reader's
 * "Connected To" device (field_2381) against its own bid package(s):
 *
 *   Warn ONLY when the connected device IS on at least one bid AND none
 *   of its bids overlap with the camera's bids — i.e. a cross-bid
 *   connection where the camera and its uplink switch were split into
 *   different bid packages by mistake.
 *
 * A connected device with NO bid is intentionally ignored: in practice
 * that means existing / customer-owned infrastructure that the
 * subcontractor isn't being asked to bid, which is a separate concern.
 *
 *******************************************************************************/
(function () {
  'use strict';

  var VIEW_ID = 'view_3505';
  var CONN_TO_FIELD = 'field_2381';
  var WARN_CLS = 'scw-conn-bid-warn';
  var STYLE_ID = 'scw-conn-bid-check-css';
  var NS = '.scwConnBidCheck';

  // Broken-link SVG — reads as "connection problem" more directly
  // than a generic warning triangle, which the rest of the worksheet
  // already uses for unrelated issues (missing photos, etc).
  // Two chain links with a slash through them.
  var BROKEN_LINK_SVG_INLINE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M9 17H7A5 5 0 0 1 7 7h2"/>' +
    '<path d="M15 7h2a5 5 0 0 1 4.54 7.1"/>' +
    '<line x1="8" y1="12" x2="12" y2="12"/>' +
    '<line x1="2" y1="2" x2="22" y2="22"/>' +
    '</svg>';
  var BROKEN_LINK_SVG_HDR =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<path d="M9 17H7A5 5 0 0 1 7 7h2"/>' +
    '<path d="M15 7h2a5 5 0 0 1 4.54 7.1"/>' +
    '<line x1="8" y1="12" x2="12" y2="12"/>' +
    '<line x1="2" y1="2" x2="22" y2="22"/>' +
    '</svg>';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.' + WARN_CLS + ' {',
      '  display: flex; align-items: center; gap: 6px;',
      '  margin-top: 0; margin-bottom: 8px; padding: 6px 10px;',
      '  font-size: 11px; font-weight: 500; color: #b45309;',
      '  background: #fffbeb;',
      '  border: 1px solid #fde68a;',
      '  border-left: 3px solid #f59e0b;',
      '  border-radius: 3px;',
      '  line-height: 1.4;',
      '}',
      '.' + WARN_CLS + ' svg {',
      '  flex-shrink: 0; width: 14px; height: 14px;',
      '  stroke: #b45309; fill: none;',
      '}',
      '.' + WARN_CLS + ' b {',
      '  font-weight: 700; color: #92400e;',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  /** Escape user-supplied text before splicing into innerHTML. */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function validate() {
    var viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return;

    var BID_FIELD = 'field_2415';
    var model = Knack.views[VIEW_ID] && Knack.views[VIEW_ID].model;
    if (!model || !model.data) return;
    var records = model.data.models || [];
    if (!records.length) return;

    // Build map: record ID → { ids: [bidId,…], names: [bidName,…] }
    // We need both so the warning message can name BOTH sides of a
    // cross-bid mismatch (camera on Bid A, switch on Bid B) instead
    // of just saying "different bid".
    var bidByRecord = {};
    for (var i = 0; i < records.length; i++) {
      var a = records[i].attributes || records[i];
      var id = records[i].id || a.id;
      if (!id) continue;
      var bidRaw = a[BID_FIELD + '_raw'];
      var bidIds = [], bidNames = [];
      if (Array.isArray(bidRaw)) {
        for (var bi = 0; bi < bidRaw.length; bi++) {
          if (bidRaw[bi].id) bidIds.push(bidRaw[bi].id);
          if (bidRaw[bi].identifier) bidNames.push(bidRaw[bi].identifier);
        }
      }
      bidByRecord[id] = { ids: bidIds, names: bidNames };
    }

    injectStyles();

    // Remove previous warnings
    var old = viewEl.querySelectorAll('.' + WARN_CLS);
    for (var oi = 0; oi < old.length; oi++) old[oi].remove();
    var oldIcons = viewEl.querySelectorAll('.scw-conn-bid-warn-icon');
    for (var oii = 0; oii < oldIcons.length; oii++) oldIcons[oii].remove();
    var oldBadge = document.querySelector('.scw-conn-bid-warn-badge');
    if (oldBadge) oldBadge.remove();
    // Group-header (MDF/IDF) cross-bid badges from a previous run.
    var oldGrpBadges = viewEl.querySelectorAll('.scw-conn-bid-grp-badge');
    for (var ogb = 0; ogb < oldGrpBadges.length; ogb++) oldGrpBadges[ogb].remove();

    var warnCount = 0;
    // Track flagged ws-rows so we can roll the warning up to each
    // row's MDF/IDF group header (L1 kn-table-group sibling). One
    // badge per affected group, with a count.
    var flaggedRows = [];

    for (var ri = 0; ri < records.length; ri++) {
      var rec = records[ri];
      var attrs = rec.attributes || rec;
      var recId = rec.id || attrs.id;
      var raw = attrs[CONN_TO_FIELD + '_raw'];
      if (!raw || !Array.isArray(raw) || !raw.length) continue;

      var myEntry = bidByRecord[recId] || { ids: [], names: [] };
      var myBids = myEntry.ids;
      if (!myBids.length) continue; // this record isn't on a bid itself

      for (var ci = 0; ci < raw.length; ci++) {
        var connId = raw[ci].id;
        if (!connId) continue;

        var connEntry = bidByRecord[connId] || { ids: [], names: [] };
        var connBids = connEntry.ids;

        // Cross-bid only: skip if the connected device has no bid
        // at all (probably existing / customer-owned infrastructure
        // — a separate concern, not a connection mismatch).
        if (!connBids.length) continue;

        // Skip if camera and switch share at least one bid.
        var sameBid = false;
        for (var mb = 0; mb < myBids.length && !sameBid; mb++) {
          for (var cb = 0; cb < connBids.length; cb++) {
            if (myBids[mb] === connBids[cb]) { sameBid = true; break; }
          }
        }
        if (sameBid) continue;

        // True cross-bid mismatch: camera on one bid, switch on another.
        warnCount++;
        var connLabel    = raw[ci].identifier || connId;
        var myBidLabel   = myEntry.names.length   ? myEntry.names.join(', ')   : 'this bid';
        var connBidLabel = connEntry.names.length ? connEntry.names.join(', ') : 'another bid';

        var wsRow = viewEl.querySelector('tr.scw-ws-row[id="' + recId + '"]');
        if (!wsRow) continue;

        var connFieldWrap = wsRow.querySelector('[data-scw-field="field_2381"]');
        if (!connFieldWrap) {
          var connTd = wsRow.querySelector('td.' + CONN_TO_FIELD);
          if (connTd) connFieldWrap = connTd.closest('.scw-ws-field') || connTd;
        }
        if (connFieldWrap) {
          var warnMsg = document.createElement('div');
          warnMsg.className = WARN_CLS;
          warnMsg.innerHTML = BROKEN_LINK_SVG_INLINE
            + '<span><b>Cross-bid connection:</b> connected to '
            + '<b>' + escHtml(connLabel) + '</b> on <b>' + escHtml(connBidLabel) + '</b>'
            + ', but this is on <b>' + escHtml(myBidLabel) + '</b>.</span>';
          connFieldWrap.after(warnMsg);
        }

        var warnSlot = wsRow.querySelector('.scw-ws-warn-slot');
        if (warnSlot && !warnSlot.querySelector('.scw-conn-bid-warn-icon')) {
          var icon = document.createElement('span');
          icon.className = 'scw-cr-hdr-warning scw-conn-bid-warn-icon';
          icon.style.cssText = 'color:#b45309;display:inline-flex;align-items:center;';
          icon.innerHTML = BROKEN_LINK_SVG_HDR;
          icon.title = 'Cross-bid connection — connected device is on ' + connBidLabel + ', but this is on ' + myBidLabel;
          warnSlot.appendChild(icon);
        }

        flaggedRows.push(wsRow);
        break;
      }
    }

    // ── Roll warnings up to the MDF/IDF (L1) group header ─────
    // The user wanted to see flagged groups at a glance, not just
    // in expanded card headers. Walk each flagged row's previous
    // siblings up to its level-1 group header, accumulate a count
    // per group, then drop a single broken-link pill into the
    // header's badge slot. One badge per group regardless of how
    // many cameras inside it are flagged.
    if (flaggedRows.length) {
      var groupCounts = []; // [{ header, count }] in DOM order
      function indexOfHeader(h) {
        for (var k = 0; k < groupCounts.length; k++) {
          if (groupCounts[k].header === h) return k;
        }
        return -1;
      }
      for (var fr = 0; fr < flaggedRows.length; fr++) {
        var prev = flaggedRows[fr].previousElementSibling;
        var groupHeader = null;
        while (prev) {
          if (prev.classList && prev.classList.contains('kn-table-group') &&
              prev.classList.contains('kn-group-level-1')) {
            groupHeader = prev; break;
          }
          prev = prev.previousElementSibling;
        }
        if (!groupHeader) continue;
        var gi = indexOfHeader(groupHeader);
        if (gi < 0) groupCounts.push({ header: groupHeader, count: 1 });
        else groupCounts[gi].count++;
      }

      for (var gj = 0; gj < groupCounts.length; gj++) {
        var hdr   = groupCounts[gj].header;
        var hcnt  = groupCounts[gj].count;
        // Prefer dropping into the existing .scw-group-badges
        // wrapper that group-collapse builds. Fall back to the
        // group-inner wrapper, then the td itself.
        var slot = hdr.querySelector('.scw-group-badges') ||
                   hdr.querySelector('.scw-group-inner') ||
                   hdr.querySelector('td');
        if (!slot) continue;
        if (slot.querySelector('.scw-conn-bid-grp-badge')) continue;
        var gb = document.createElement('span');
        gb.className = 'scw-conn-bid-grp-badge';
        gb.style.cssText =
          'display:inline-flex;align-items:center;gap:4px;' +
          'padding:2px 8px;border-radius:10px;' +
          'background:rgba(245,158,11,0.14);color:#b45309;' +
          'border:1px solid rgba(245,158,11,0.35);' +
          'font:600 11px/1.4 system-ui,-apple-system,sans-serif;' +
          'white-space:nowrap;';
        gb.title = hcnt + ' cross-bid connection' + (hcnt === 1 ? '' : 's') +
                   ' inside this MDF/IDF group';
        gb.innerHTML = BROKEN_LINK_SVG_INLINE +
                       '<span>' + hcnt + ' cross-bid</span>';
        slot.appendChild(gb);
      }
    }

    // Badge on accordion header if any warnings
    if (warnCount > 0) {
      var accHeader = viewEl.closest('.scw-ktl-accordion__body');
      if (accHeader) accHeader = accHeader.previousElementSibling;
      if (accHeader && accHeader.classList.contains('scw-ktl-accordion__header')) {
        var existingBadge = accHeader.querySelector('.scw-conn-bid-warn-badge');
        if (existingBadge) existingBadge.remove();
        var badge = document.createElement('span');
        badge.className = 'scw-conn-bid-warn-badge';
        badge.style.cssText = 'background:#fef3c7;color:#92400e;border:1px solid #f59e0b;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;margin-left:8px;';
        badge.textContent = warnCount + ' cross-bid connection' + (warnCount > 1 ? 's' : '');
        badge.title = warnCount + ' camera(s) connected to a device on a different bid';
        var titleEl = accHeader.querySelector('.scw-acc-title');
        if (titleEl) titleEl.after(badge);
      }
    }
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(VIEW_ID, function () {
      setTimeout(validate, 1000);
    }, NS);
  }
})();
/*** END FEATURE: Connected Device Bid Validation ******************************/
