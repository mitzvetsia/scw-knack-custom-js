/*** FEATURE: Missing Connected To Warning ***************************************
 *
 * On view_3505 (subcontractor bid worksheet) flag any camera/reader row whose
 * field_2381 (Connected To) is blank. A camera with no upstream switch is a
 * data hole — the bid renders but the install would have nowhere to plug in.
 *
 * UX is consistent with connected-device-bid-check.js (same amber palette,
 * same warn-slot icon + inline message format) so the two warnings stack
 * cleanly when a row trips both.
 *
 * Only checks rows whose bucket is "Cameras or Readers" — NVRs, switches,
 * other equipment, services, and assumptions are intentionally not flagged
 * (they're not expected to have a Connected To value).
 *
 *******************************************************************************/
(function () {
  'use strict';

  var VIEW_ID                = 'view_3505';
  var CONN_TO_FIELD          = 'field_2381';
  var BUCKET_FIELD           = 'field_2366';
  var CAMERAS_READERS_BUCKET = '6481e5ba38f283002898113c';

  var WARN_CLS  = 'scw-missing-conn-warn';
  var ICON_CLS  = 'scw-missing-conn-warn-icon';
  var BADGE_CLS = 'scw-missing-conn-warn-badge';
  var STYLE_ID  = 'scw-missing-conn-warn-css';
  var NS        = '.scwMissingConnWarn';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.' + WARN_CLS + ' {',
      '  display: flex; align-items: center; gap: 5px;',
      '  margin-top: 0; margin-bottom: 8px; padding: 4px 8px;',
      '  font-size: 11px; font-weight: 500; color: #b45309;',
      '}',
      '.' + WARN_CLS + ' svg {',
      '  flex-shrink: 0; width: 14px; height: 14px;',
      '  stroke: #b45309; fill: none;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // Broken-chain (feather `unlink`): two link halves + small scatter
  // strokes denoting the break. Reads "this connection is severed" at
  // a glance, which is what the warning actually means.
  var UNLINK_PATHS =
    '<path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.71 1.71"/>' +
    '<path d="M5.16 11.75l-1.72 1.71a5 5 0 1 0 7.07 7.07l1.71-1.71"/>' +
    '<line x1="8" y1="2" x2="8" y2="5"/>' +
    '<line x1="2" y1="8" x2="5" y2="8"/>' +
    '<line x1="16" y1="19" x2="16" y2="22"/>' +
    '<line x1="19" y1="16" x2="22" y2="16"/>';

  var INLINE_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round">' +
    UNLINK_PATHS + '</svg>';

  var HEADER_ICON_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    UNLINK_PATHS + '</svg>';

  function isCameraReader(attrs) {
    if (!attrs) return false;
    var raw = attrs[BUCKET_FIELD + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id === CAMERAS_READERS_BUCKET) return true;
    if (raw && raw.id === CAMERAS_READERS_BUCKET) return true;
    // Fallback: identifier text match (very rare path — most rows have _raw)
    var disp = attrs[BUCKET_FIELD];
    if (typeof disp === 'string' && /camera|reader/i.test(disp)) return true;
    return false;
  }

  function hasConnectedTo(attrs) {
    var raw = attrs[CONN_TO_FIELD + '_raw'];
    if (Array.isArray(raw) && raw.length) {
      // Treat array as populated only if at least one entry has an id
      for (var i = 0; i < raw.length; i++) {
        if (raw[i] && raw[i].id) return true;
      }
    }
    return false;
  }

  function validate() {
    var viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return;

    var view = Knack.views && Knack.views[VIEW_ID];
    var model = view && view.model;
    if (!model || !model.data) return;
    var records = model.data.models || [];
    if (!records.length) return;

    injectStyles();

    // Wipe prior pass — re-validate from scratch every render so values
    // updated via inline-edit / connection-picker / MDF move don't leave
    // stale warnings hanging.
    var prevMsgs = viewEl.querySelectorAll('.' + WARN_CLS);
    for (var pm = 0; pm < prevMsgs.length; pm++) prevMsgs[pm].remove();
    var prevIcons = viewEl.querySelectorAll('.' + ICON_CLS);
    for (var pi = 0; pi < prevIcons.length; pi++) prevIcons[pi].remove();
    var prevBadge = document.querySelector('.' + BADGE_CLS);
    if (prevBadge) prevBadge.remove();

    var warnCount = 0;
    // Track flagged ws-rows so we can roll the warning up to each
    // row's MDF/IDF L1 group header (mirrors connected-device-bid-check).
    var flaggedRows = [];

    for (var ri = 0; ri < records.length; ri++) {
      var rec = records[ri];
      var attrs = rec.attributes || rec;
      var recId = rec.id || attrs.id;
      if (!recId) continue;

      if (!isCameraReader(attrs)) continue;
      if (hasConnectedTo(attrs)) continue;

      var wsRow = viewEl.querySelector('tr.scw-ws-row[id="' + recId + '"]');
      if (!wsRow) continue;

      warnCount++;
      flaggedRows.push(wsRow);

      // Inline message under the Connected Device field (when present).
      var connFieldWrap = wsRow.querySelector('[data-scw-field="' + CONN_TO_FIELD + '"]');
      if (!connFieldWrap) {
        var connTd = wsRow.querySelector('td.' + CONN_TO_FIELD);
        if (connTd) connFieldWrap = connTd.closest('.scw-ws-field') || connTd;
      }
      if (connFieldWrap) {
        var warnMsg = document.createElement('div');
        warnMsg.className = WARN_CLS;
        warnMsg.innerHTML = INLINE_ICON_SVG +
          '<span>No Connected To device — this camera/reader is not wired to a switch.</span>';
        connFieldWrap.after(warnMsg);
      }

      // Header chit in the existing warn slot so it visually stacks with
      // the other validators (bid-mismatch etc.) that use the same slot.
      var warnSlot = wsRow.querySelector('.scw-ws-warn-slot');
      if (warnSlot && !warnSlot.querySelector('.' + ICON_CLS)) {
        var icon = document.createElement('span');
        icon.className = 'scw-cr-hdr-warning ' + ICON_CLS;
        icon.style.cssText = 'color:#b45309;display:inline-flex;align-items:center;';
        icon.innerHTML = HEADER_ICON_SVG;
        icon.title = 'No Connected To device set on this camera/reader.';
        warnSlot.appendChild(icon);
      }
    }

    // ── Roll warnings up to the MDF/IDF (L1) group header ─────
    // Mirrors connected-device-bid-check.js. Walk each flagged row's
    // previous siblings up to its L1 kn-table-group header, accumulate
    // a count per group, then drop a single pill into the header's
    // badge slot. One badge per group regardless of how many cameras
    // inside it are missing a Connected To.
    // Wipe stale group-header badges from a previous run.
    var oldGrpBadges = viewEl.querySelectorAll('.scw-missing-conn-grp-badge');
    for (var ogb = 0; ogb < oldGrpBadges.length; ogb++) oldGrpBadges[ogb].remove();

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
        var slot = hdr.querySelector('.scw-group-badges') ||
                   hdr.querySelector('.scw-group-inner') ||
                   hdr.querySelector('td');
        if (!slot) continue;
        if (slot.querySelector('.scw-missing-conn-grp-badge')) continue;
        var gb = document.createElement('span');
        gb.className = 'scw-missing-conn-grp-badge';
        gb.style.cssText =
          'display:inline-flex;align-items:center;gap:4px;' +
          'padding:2px 8px;border-radius:10px;' +
          'background:rgba(245,158,11,0.14);color:#b45309;' +
          'border:1px solid rgba(245,158,11,0.35);' +
          'font:600 11px/1.4 system-ui,-apple-system,sans-serif;' +
          'white-space:nowrap;';
        gb.title = hcnt + ' camera/reader row(s) missing Connected To inside this MDF/IDF group';
        gb.innerHTML = INLINE_ICON_SVG +
                       '<span>' + hcnt + ' missing</span>';
        slot.appendChild(gb);
      }
    }

    // Accordion-header badge (e.g. "3 missing connections") so the
    // warning is visible while the L1 group is collapsed.
    if (warnCount > 0) {
      var accBody = viewEl.closest('.scw-ktl-accordion__body');
      var accHeader = accBody && accBody.previousElementSibling;
      if (accHeader && accHeader.classList.contains('scw-ktl-accordion__header')) {
        var badge = document.createElement('span');
        badge.className = BADGE_CLS;
        badge.style.cssText =
          'background:#fef3c7;color:#92400e;border:1px solid #f59e0b;' +
          'border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;' +
          'margin-left:8px;';
        badge.textContent = warnCount + ' missing connection' + (warnCount > 1 ? 's' : '');
        badge.title = warnCount + ' camera/reader row(s) without a Connected To device';
        var titleEl = accHeader.querySelector('.scw-acc-title');
        if (titleEl) titleEl.after(badge);
      }
    }
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(VIEW_ID, function () {
      // Delay matches connected-device-bid-check.js so worksheet rows,
      // bucket-rule classes, and warn-slot containers are all in place.
      setTimeout(validate, 1000);
    }, NS);
  }
})();
/*** END FEATURE: Missing Connected To Warning ********************************/
