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
      '  display: block; margin-top: 4px; padding: 4px 8px;',
      '  background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px;',
      '  font-size: 11px; font-weight: 600; color: #92400e;',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function validate() {
    var viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return;

    // Collect all record IDs on this bid
    var bidRecordIds = {};
    var model = Knack.views[VIEW_ID] && Knack.views[VIEW_ID].model;
    if (model && model.data) {
      var models = model.data.models || [];
      for (var i = 0; i < models.length; i++) {
        if (models[i].id) bidRecordIds[models[i].id] = true;
      }
    }
    if (!Object.keys(bidRecordIds).length) return;

    injectStyles();

    // Remove previous warnings
    var old = viewEl.querySelectorAll('.' + WARN_CLS);
    for (var oi = 0; oi < old.length; oi++) old[oi].remove();
    var oldIcons = viewEl.querySelectorAll('.scw-conn-bid-warn-icon');
    for (var oii = 0; oii < oldIcons.length; oii++) oldIcons[oii].remove();

    // Check each record's Connected To field
    var records = (model && model.data && model.data.models) || [];
    var warnCount = 0;

    for (var ri = 0; ri < records.length; ri++) {
      var rec = records[ri];
      var attrs = rec.attributes || rec;
      var raw = attrs[CONN_TO_FIELD + '_raw'];
      if (!raw || !Array.isArray(raw) || !raw.length) continue;

      for (var ci = 0; ci < raw.length; ci++) {
        var connId = raw[ci].id;
        if (!connId || bidRecordIds[connId]) continue;

        // Connected record is NOT on this bid
        warnCount++;
        var connLabel = raw[ci].identifier || connId;

        // Find the card for this record
        var wsRow = viewEl.querySelector('tr.scw-ws-row[id="' + rec.id + '"]');
        if (!wsRow) continue;

        // Add warning to the Connected Device field area
        var connField = wsRow.querySelector('[data-scw-field="field_2197"], [data-scw-field="field_2381"]');
        if (!connField) {
          var connTd = wsRow.querySelector('td.' + CONN_TO_FIELD);
          if (connTd) connField = connTd.closest('.scw-ws-field') || connTd;
        }
        if (connField) {
          var warnMsg = document.createElement('div');
          warnMsg.className = WARN_CLS;
          warnMsg.textContent = '\u26A0 "' + connLabel + '" is not on this bid';
          connField.appendChild(warnMsg);
        }

        // Add warning icon to card header warn-slot
        var warnSlot = wsRow.querySelector('.scw-ws-warn-slot');
        if (warnSlot && !warnSlot.querySelector('.scw-conn-bid-warn-icon')) {
          var icon = document.createElement('span');
          icon.className = 'scw-cr-hdr-warning scw-conn-bid-warn-icon';
          icon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
          icon.title = 'Connected device is not on this bid';
          warnSlot.appendChild(icon);
        }

        break; // one warning per record is enough
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
