/*** SALES CHANGE REQUEST — REVISION INJECTION ***/
/**
 * Reads submitted revision line items from view_3837 and injects
 * badges + detail strips onto matching SOW rows in view_3586,
 * mirroring how bid-revision-inject.js handles view_3823 → view_3505.
 *
 * view_3837 is hidden via CSS (see styles.js) and treated purely
 * as a data source.
 *
 * Reads : SCW.salesCR.CONFIG, ._state, ._h
 * Writes: SCW.salesCR.loadRevisions, .injectRevisions
 */
(function () {
  'use strict';

  var ns  = window.SCW.salesCR;
  var CFG = ns.CONFIG;
  var S   = ns._state;
  var H   = ns._h;
  var P   = CFG.prefix;

  // ═══════════════════════════════════════════════════════════
  //  LOAD REVISION DATA FROM view_3837 DOM
  // ═══════════════════════════════════════════════════════════

  function loadRevisions() {
    var $revView = $('#' + CFG.revisionView);
    if (!$revView.length) { S.setRevisionData([]); return; }

    var data = [];

    $revView.find('tbody tr[id]').each(function () {
      var $tr = $(this);
      var id  = $tr.attr('id');
      if (!id) return;

      // Connection field → SOW line item record ID
      var $sowCell = $tr.find('td.' + CFG.revSowItemField);
      var sowSpan  = $sowCell.length
        ? $sowCell[0].querySelector('span[data-kn="connection-value"]')
        : null;
      var sowItemId = sowSpan ? sowSpan.className.trim() : '';

      // Status
      var status = H.stripHtml($tr.find('td.' + CFG.revStatusField).text());

      // Rich-text HTML card
      var $htmlCell = $tr.find('td.' + CFG.revHtmlField);
      var htmlContent = '';
      if ($htmlCell.length) {
        // Navigate into the col-N wrapper to get the actual HTML
        var $inner = $htmlCell.find('span[class^="col-"]');
        htmlContent = ($inner.length ? $inner : $htmlCell).html() || '';
      }

      // JSON data
      var jsonText = H.stripHtml($tr.find('td.' + CFG.revJsonField).text());
      var jsonData = null;
      try { jsonData = JSON.parse(jsonText); } catch (e) { /* not valid JSON */ }

      data.push({
        id:        id,
        sowItemId: sowItemId,
        status:    status,
        html:      htmlContent,
        json:      jsonData,
      });
    });

    S.setRevisionData(data);
    if (CFG.debug) SCW.debug('[SalesCR] Loaded', data.length, 'revision records from', CFG.revisionView);
  }

  // ═══════════════════════════════════════════════════════════
  //  INJECT REVISION BADGES + STRIPS INTO view_3586
  // ═══════════════════════════════════════════════════════════

  function injectRevisions() {
    var revData = S.revisionData();
    if (!revData || !revData.length) return;

    var $view = $('#' + CFG.worksheetView);
    if (!$view.length) return;

    // Clean previous
    $view.find('.' + P + '-rev-badge').remove();
    $view.find('.' + P + '-rev-strip').remove();

    // Group by SOW item ID
    var bySow = {};
    for (var i = 0; i < revData.length; i++) {
      var rev = revData[i];
      if (!rev.sowItemId) continue;
      if (!bySow[rev.sowItemId]) bySow[rev.sowItemId] = [];
      bySow[rev.sowItemId].push(rev);
    }

    var sowIds = Object.keys(bySow);
    for (var s = 0; s < sowIds.length; s++) {
      var sowId = sowIds[s];
      var revs  = bySow[sowId];

      var $row = $view.find('tr#' + sowId);
      if (!$row.length) continue;

      var $card = $row.find('.scw-ws-card');
      if (!$card.length) continue;

      // Badge on summary
      var $summary = $card.find('.scw-ws-summary-row');
      if (!$summary.length) $summary = $card.find('.scw-ws-summary');
      if ($summary.length) {
        var badge = H.el('span', P + '-rev-badge', 'REVISION (' + revs.length + ')');
        $summary[0].appendChild(badge);
      }

      // Detail strips
      var $detail = $card.find('.scw-ws-detail');
      if (!$detail.length) continue;

      for (var r = 0; r < revs.length; r++) {
        var rev = revs[r];
        var strip = H.el('div', P + '-rev-strip');

        strip.appendChild(H.el('div', P + '-rev-strip-header',
          'Submitted Revision' + (rev.status ? ' \u2014 ' + rev.status : '')));

        if (rev.html) {
          var htmlWrap = H.el('div', P + '-rev-html-card');
          htmlWrap.innerHTML = rev.html;
          strip.appendChild(htmlWrap);
        } else if (rev.json) {
          // Fallback: render JSON fields as simple key-value pairs
          var jsonWrap = H.el('div');
          var fields = rev.json.fields || [];
          for (var fi = 0; fi < fields.length; fi++) {
            var fld = fields[fi];
            var row = H.el('div', P + '-card-field');
            row.appendChild(H.el('span', P + '-card-label', (fld.label || fld.field) + ':'));
            if (fld.from != null) {
              row.appendChild(H.el('span', P + '-card-from', String(fld.from)));
              row.appendChild(H.el('span', P + '-card-arrow', '\u2192'));
            }
            row.appendChild(H.el('span', P + '-card-to', String(fld.to)));
            jsonWrap.appendChild(row);
          }
          if (rev.json.changeNotes) {
            jsonWrap.appendChild(H.el('div', P + '-card-notes',
              '\u201c' + rev.json.changeNotes + '\u201d'));
          }
          strip.appendChild(jsonWrap);
        }

        $detail[0].appendChild(strip);
      }
    }
  }

  // ── Public API ──
  ns.loadRevisions   = loadRevisions;
  ns.injectRevisions = injectRevisions;

})();
