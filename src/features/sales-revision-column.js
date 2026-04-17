/*** SALES REVISION COLUMN — BID COMPARISON GRID ***/
/**
 * Injects a "Sales Revisions" column into the bid comparison grid
 * (scene_1155) between the Line Item and SOW Detail columns.
 *
 * Reads revision line items from view_3842 (hidden), joins to grid
 * rows via field_2708 (connection to SOW line item), and displays
 * field_2695 (HTML card) in each matching row.
 *
 * Each item gets "Apply" and "Create Bid CR" action buttons.
 *
 * Reads:  SCW.bidReview (grid state), Knack DOM (view_3842)
 * Writes: nothing — purely additive DOM injection
 */
(function () {
  'use strict';

  var CFG = {
    revisionView:    'view_3842',   // sales revision line items (hidden data source)
    sowItemField:    'field_2708',   // connection: revision → SOW line item
    htmlField:       'field_2695',   // rich-text HTML card
    jsonField:       'field_2696',   // JSON data
    statusField:     'field_2645',   // revision status

    colHeaderText:   'Sales Revisions',
    mountSelector:   '#bid-review-matrix',
    eventNs:         '.scwSalesRevCol',
    cssId:           'scw-sales-rev-col-css',
  };

  var P = 'scw-sr-col';
  var _revisionData = [];

  // ═══════════════════════════════════════════════════════════
  //  CSS
  // ═══════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById(CFG.cssId)) return;
    var css = [
      /* Hide source view */
      '#' + CFG.revisionView + ' { display: none !important; }',

      /* Column header */
      '.' + P + '-header {',
      '  background: #f0f9ff; color: #0c4a6e;',
      '  font-size: 12px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: .04em; padding: 10px 12px;',
      '  min-width: 220px; vertical-align: top;',
      '  border-bottom: 2px solid #0ea5e9;',
      '}',

      /* Data cell */
      '.' + P + '-cell {',
      '  vertical-align: top; padding: 8px 10px;',
      '  min-width: 220px; max-width: 300px;',
      '}',

      /* HTML card wrapper */
      '.' + P + '-card {',
      '  margin-bottom: 8px; border-radius: 6px; overflow: hidden;',
      '}',
      '.' + P + '-card > div { max-width: 100% !important; }',

      /* Status badge */
      '.' + P + '-status {',
      '  display: inline-block; padding: 1px 6px; border-radius: 3px;',
      '  font-size: 10px; font-weight: 700; letter-spacing: .04em;',
      '  margin-bottom: 4px;',
      '}',
      '.' + P + '-status--pending  { background: #fef3c7; color: #92400e; }',
      '.' + P + '-status--approved { background: #dcfce7; color: #166534; }',
      '.' + P + '-status--rejected { background: #fee2e2; color: #991b1b; }',

      /* Action buttons */
      '.' + P + '-actions {',
      '  display: flex; gap: 6px; margin-top: 6px;',
      '}',
      '.' + P + '-btn {',
      '  padding: 4px 10px; border-radius: 4px; border: none;',
      '  font-size: 11px; font-weight: 600; cursor: pointer;',
      '  transition: filter .15s;',
      '}',
      '.' + P + '-btn:hover { filter: brightness(.92); }',
      '.' + P + '-btn--apply {',
      '  background: #16a34a; color: #fff;',
      '}',
      '.' + P + '-btn--bid-cr {',
      '  background: #3b82f6; color: #fff;',
      '}',
    ].join('\n');

    var s = document.createElement('style');
    s.id = CFG.cssId;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════
  //  LOAD REVISION DATA FROM view_3842
  // ═══════════════════════════════════════════════════════════

  function loadRevisions() {
    var $view = $('#' + CFG.revisionView);
    if (!$view.length) return;

    _revisionData = [];

    $view.find('tbody tr[id]').each(function () {
      var $tr = $(this);
      var id  = $tr.attr('id');
      if (!id) return;

      // Connection → SOW line item
      var $sowCell = $tr.find('td.' + CFG.sowItemField);
      var sowSpan  = $sowCell.length
        ? $sowCell[0].querySelector('span[data-kn="connection-value"]')
        : null;
      var sowItemId = sowSpan ? sowSpan.className.trim() : '';

      // Status
      var status = ($tr.find('td.' + CFG.statusField).text() || '').replace(/[\u00a0\s]+/g, ' ').trim();

      // HTML card
      var $htmlCell = $tr.find('td.' + CFG.htmlField);
      var htmlContent = '';
      if ($htmlCell.length) {
        var $inner = $htmlCell.find('span[class^="col-"]');
        htmlContent = ($inner.length ? $inner : $htmlCell).html() || '';
      }

      // JSON data
      var jsonText = ($tr.find('td.' + CFG.jsonField).text() || '').replace(/<[^>]*>/g, '').trim();
      var jsonData = null;
      try { jsonData = JSON.parse(jsonText); } catch (e) {}

      _revisionData.push({
        id:        id,
        sowItemId: sowItemId,
        status:    status,
        html:      htmlContent,
        json:      jsonData,
      });
    });

    if (window.SCW && SCW.bidReview && SCW.bidReview.CONFIG && SCW.bidReview.CONFIG.debug) {
      console.log('[SalesRevCol] Loaded', _revisionData.length, 'revision records');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  GROUP REVISIONS BY SOW ITEM
  // ═══════════════════════════════════════════════════════════

  function revisionsBySowItem() {
    var map = {};
    for (var i = 0; i < _revisionData.length; i++) {
      var r = _revisionData[i];
      if (!r.sowItemId) continue;
      if (!map[r.sowItemId]) map[r.sowItemId] = [];
      map[r.sowItemId].push(r);
    }
    return map;
  }

  // ═══════════════════════════════════════════════════════════
  //  INJECT COLUMN INTO BID COMPARISON GRID
  // ═══════════════════════════════════════════════════════════

  function injectColumn() {
    if (!_revisionData.length) return;

    var $mount = $(CFG.mountSelector);
    if (!$mount.length) return;

    var bySow = revisionsBySowItem();
    if (!Object.keys(bySow).length) return;

    injectStyles();

    // Inject header cell after Line Item (position 1, before SOW Detail)
    $mount.find('.scw-bid-review__header-row').each(function () {
      var $headerRow = $(this);
      if ($headerRow.find('.' + P + '-header').length) return; // already injected

      var th = document.createElement('th');
      th.className = P + '-header';
      th.textContent = CFG.colHeaderText;

      // Insert after the first th (Line Item), before SOW Detail
      var $firstTh = $headerRow.find('th').first();
      $firstTh.after(th);
    });

    // Inject data cells into each body row
    $mount.find('tr[data-row-id], tr.scw-bid-review__group-header').each(function () {
      var $tr = $(this);

      // Group header rows — add an extra td to maintain colspan
      if ($tr.hasClass('scw-bid-review__group-header')) {
        var $td = $tr.find('td[colspan]');
        if ($td.length) {
          var span = parseInt($td.attr('colspan'), 10) || 1;
          $td.attr('colspan', span + 1);
        }
        return;
      }

      // Already injected
      if ($tr.find('.' + P + '-cell').length) return;

      var rowId = $tr.attr('data-row-id');
      var revs  = bySow[rowId] || [];

      var td = document.createElement('td');
      td.className = P + '-cell';

      if (revs.length) {
        for (var r = 0; r < revs.length; r++) {
          var rev = revs[r];
          var item = document.createElement('div');
          item.className = P + '-card';

          // Status badge
          if (rev.status) {
            var badge = document.createElement('div');
            badge.className = P + '-status';
            var sl = rev.status.toLowerCase();
            if (sl.indexOf('approv') !== -1) badge.classList.add(P + '-status--approved');
            else if (sl.indexOf('reject') !== -1) badge.classList.add(P + '-status--rejected');
            else badge.classList.add(P + '-status--pending');
            badge.textContent = rev.status;
            item.appendChild(badge);
          }

          // HTML card
          if (rev.html) {
            var cardWrap = document.createElement('div');
            cardWrap.innerHTML = rev.html;
            item.appendChild(cardWrap);
          }

          // Action buttons
          var actions = document.createElement('div');
          actions.className = P + '-actions';

          var applyBtn = document.createElement('button');
          applyBtn.className = P + '-btn ' + P + '-btn--apply';
          applyBtn.textContent = 'Apply';
          applyBtn.setAttribute('data-rev-id', rev.id);
          applyBtn.setAttribute('data-sow-item-id', rev.sowItemId);
          applyBtn.addEventListener('click', handleApply);
          actions.appendChild(applyBtn);

          var bidCrBtn = document.createElement('button');
          bidCrBtn.className = P + '-btn ' + P + '-btn--bid-cr';
          bidCrBtn.textContent = 'Create Bid CR';
          bidCrBtn.setAttribute('data-rev-id', rev.id);
          bidCrBtn.setAttribute('data-sow-item-id', rev.sowItemId);
          bidCrBtn.setAttribute('data-rev-json', JSON.stringify(rev.json || {}));
          bidCrBtn.addEventListener('click', handleCreateBidCR);
          actions.appendChild(bidCrBtn);

          item.appendChild(actions);
          td.appendChild(item);
        }
      }

      // Insert after the first td (Line Item label), before SOW Detail
      var $firstTd = $tr.find('td').first();
      $firstTd.after(td);
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  ACTION HANDLERS
  // ═══════════════════════════════════════════════════════════

  function handleApply(e) {
    var revId     = this.getAttribute('data-rev-id');
    var sowItemId = this.getAttribute('data-sow-item-id');
    // TODO: Apply the revision — update SOW line item fields from the revision data
    // This will need a webhook or direct Knack API call
    console.log('[SalesRevCol] Apply revision', revId, 'to SOW item', sowItemId);
    if (window.SCW && SCW.bidReview && SCW.bidReview.renderToast) {
      SCW.bidReview.renderToast('Apply — not yet implemented', 'info');
    }
  }

  function handleCreateBidCR(e) {
    var revId     = this.getAttribute('data-rev-id');
    var sowItemId = this.getAttribute('data-sow-item-id');
    var revJson   = {};
    try { revJson = JSON.parse(this.getAttribute('data-rev-json') || '{}'); } catch (ex) {}
    // TODO: Open the bid-review change request modal pre-filled with revision data
    console.log('[SalesRevCol] Create Bid CR from revision', revId, revJson);
    if (window.SCW && SCW.bidReview && SCW.bidReview.renderToast) {
      SCW.bidReview.renderToast('Create Bid CR — not yet implemented', 'info');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  EVENT BINDINGS
  // ═══════════════════════════════════════════════════════════

  // Load revision data when view_3842 renders
  SCW.onViewRender(CFG.revisionView, function () {
    setTimeout(function () {
      loadRevisions();
      injectColumn();
    }, 300);
  }, CFG.eventNs);

  // Re-inject after bid-review grid rebuilds
  $(document).on('scw-bid-review-rendered' + CFG.eventNs, function () {
    setTimeout(injectColumn, 100);
  });

  // Also try injection on any scene render (grid may rebuild)
  $(document).on('knack-scene-render.scene_1155' + CFG.eventNs, function () {
    setTimeout(function () {
      if (_revisionData.length) injectColumn();
    }, 1000);
  });

})();
