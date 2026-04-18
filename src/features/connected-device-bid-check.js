/*** FEATURE: Connected Device Bid Validation ************************************
 *
 * On view_3505 (subcontractor bid worksheet), checks if each camera/reader's
 * "Connected To" device (field_2381) is also on the same bid. If not, shows
 * a warning icon in the card header and a message on the Connected Device field.
 *
 *******************************************************************************/
(function () {
  'use strict';

  var VIEW_ID = 'view_3505';
  var CONN_TO_FIELD = 'field_2381';
  var WARN_CLS = 'scw-conn-bid-warn';
  var STYLE_ID = 'scw-conn-bid-check-css';
  var NS = '.scwConnBidCheck';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.' + WARN_CLS + ' {',
      '  display: flex; align-items: center; gap: 5px;',
      '  margin-top: 4px; padding: 4px 8px;',
      '  background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px;',
      '  font-size: 11px; font-weight: 500; color: #991b1b;',
      '}',
      '.' + WARN_CLS + ' svg {',
      '  flex-shrink: 0; width: 14px; height: 14px;',
      '  stroke: #dc2626; fill: none;',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function validate() {
    var viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return;

    var BID_FIELD = 'field_2415';
    var model = Knack.views[VIEW_ID] && Knack.views[VIEW_ID].model;
    if (!model || !model.data) return;
    var records = model.data.models || [];
    if (!records.length) return;

    // Build map: record ID → bid package ID(s)
    var bidByRecord = {};
    for (var i = 0; i < records.length; i++) {
      var a = records[i].attributes || records[i];
      var id = records[i].id || a.id;
      if (!id) continue;
      var bidRaw = a[BID_FIELD + '_raw'];
      var bidIds = [];
      if (Array.isArray(bidRaw)) {
        for (var bi = 0; bi < bidRaw.length; bi++) {
          if (bidRaw[bi].id) bidIds.push(bidRaw[bi].id);
        }
      }
      bidByRecord[id] = bidIds;
    }

    injectStyles();

    // Remove previous warnings
    var old = viewEl.querySelectorAll('.' + WARN_CLS);
    for (var oi = 0; oi < old.length; oi++) old[oi].remove();
    var oldIcons = viewEl.querySelectorAll('.scw-conn-bid-warn-icon');
    for (var oii = 0; oii < oldIcons.length; oii++) oldIcons[oii].remove();
    var oldBadge = document.querySelector('.scw-conn-bid-warn-badge');
    if (oldBadge) oldBadge.remove();

    var warnCount = 0;

    for (var ri = 0; ri < records.length; ri++) {
      var rec = records[ri];
      var attrs = rec.attributes || rec;
      var recId = rec.id || attrs.id;
      var raw = attrs[CONN_TO_FIELD + '_raw'];
      if (!raw || !Array.isArray(raw) || !raw.length) continue;

      var myBids = bidByRecord[recId] || [];
      if (!myBids.length) continue; // this record isn't on a bid itself

      for (var ci = 0; ci < raw.length; ci++) {
        var connId = raw[ci].id;
        if (!connId) continue;

        var connBids = bidByRecord[connId] || [];
        // Check if connected device shares at least one bid with this record
        var sameBid = false;
        for (var mb = 0; mb < myBids.length && !sameBid; mb++) {
          for (var cb = 0; cb < connBids.length; cb++) {
            if (myBids[mb] === connBids[cb]) { sameBid = true; break; }
          }
        }
        if (sameBid) continue;

        // Connected device is not on the same bid (or has no bid)
        warnCount++;
        var connLabel = raw[ci].identifier || connId;
        var reason = connBids.length ? 'on a different bid' : 'not assigned to any bid';

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
          warnMsg.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            + '<span>\u201c' + connLabel + '\u201d is ' + reason + '</span>';
          connFieldWrap.after(warnMsg);
        }

        var warnSlot = wsRow.querySelector('.scw-ws-warn-slot');
        if (warnSlot && !warnSlot.querySelector('.scw-conn-bid-warn-icon')) {
          var icon = document.createElement('span');
          icon.className = 'scw-cr-hdr-warning scw-conn-bid-warn-icon';
          icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
          icon.title = 'Connected device ' + reason;
          warnSlot.appendChild(icon);
        }

        break;
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
        badge.textContent = warnCount + ' connection warning' + (warnCount > 1 ? 's' : '');
        badge.title = warnCount + ' camera(s) connected to devices not on this bid';
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
