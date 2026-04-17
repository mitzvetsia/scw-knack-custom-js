/*** SALES REVISION COLUMN — BID COMPARISON GRID ***/
/**
 * Injects a "Sales Revisions" column into the bid comparison grid
 * (scene_1155) between the Line Item and SOW Detail columns.
 *
 * Reads revision line items from view_3842 (hidden), joins to grid
 * rows via field_2708 (connection to SOW line item) matched to
 * data-sow-item-id on grid rows.
 *
 * Each item gets action buttons matching the CR column style.
 *
 * Reads:  SCW.bidReview (grid state), Knack DOM (view_3842)
 * Writes: nothing — purely additive DOM injection
 */
(function () {
  'use strict';

  var CFG = {
    revisionView:    'view_3842',
    sowItemField:    'field_2708',
    htmlField:       'field_2695',
    jsonField:       'field_2696',
    statusField:     'field_2645',

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
      '#' + CFG.revisionView + ' { display: none !important; }',

      '.' + P + '-header {',
      '  background: #f0f9ff; color: #0c4a6e;',
      '  font-size: 12px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: .04em; padding: 10px 12px;',
      '  min-width: 200px; vertical-align: top;',
      '  border-bottom: 2px solid #0ea5e9;',
      '}',

      '.' + P + '-cell {',
      '  vertical-align: top; padding: 8px 10px;',
      '  min-width: 200px;',
      '}',

      '.' + P + '-card {',
      '  margin-bottom: 8px; border-radius: 6px; overflow: hidden;',
      '}',
      '.' + P + '-card > div { max-width: 100% !important; }',
      '.' + P + '-card > div > div { max-width: 100% !important; }',

      '.' + P + '-actions {',
      '  display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;',
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

      var $sowCell = $tr.find('td.' + CFG.sowItemField);
      var sowSpan  = $sowCell.length
        ? $sowCell[0].querySelector('span[data-kn="connection-value"]')
        : null;
      var sowItemId = sowSpan ? sowSpan.className.trim() : '';

      var status = ($tr.find('td.' + CFG.statusField).text() || '').replace(/[\u00a0\s]+/g, ' ').trim();

      var $htmlCell = $tr.find('td.' + CFG.htmlField);
      var htmlContent = '';
      if ($htmlCell.length) {
        var $inner = $htmlCell.find('span[class^="col-"]');
        htmlContent = ($inner.length ? $inner : $htmlCell).html() || '';
      }

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

    // Inject header cell
    $mount.find('.scw-bid-review__header-row').each(function () {
      var $headerRow = $(this);
      if ($headerRow.find('.' + P + '-header').length) return;

      var th = document.createElement('th');
      th.className = P + '-header';
      th.textContent = CFG.colHeaderText;

      var $firstTh = $headerRow.find('th').first();
      $firstTh.after(th);
    });

    // Inject data cells — match on data-sow-item-id (SOW line item ID)
    $mount.find('tr[data-row-id], tr.scw-bid-review__group-header, tr.scw-bid-review__subgroup-header').each(function () {
      var $tr = $(this);

      // Group/subgroup header rows — bump colspan
      if ($tr.hasClass('scw-bid-review__group-header') || $tr.hasClass('scw-bid-review__subgroup-header')) {
        var $td = $tr.find('td[colspan]');
        if ($td.length && !$td.data('sr-bumped')) {
          var span = parseInt($td.attr('colspan'), 10) || 1;
          $td.attr('colspan', span + 1);
          $td.data('sr-bumped', true);
        }
        return;
      }

      if ($tr.find('.' + P + '-cell').length) return;

      // Match using data-sow-item-id (set by bid-review render.js)
      var sowItemId = $tr.attr('data-sow-item-id') || '';
      // Fallback: for noBid rows, data-row-id might BE the SOW item ID
      if (!sowItemId) sowItemId = $tr.attr('data-row-id') || '';

      var revs = bySow[sowItemId] || [];

      var td = document.createElement('td');
      td.className = P + '-cell';

      if (revs.length) {
        for (var r = 0; r < revs.length; r++) {
          var rev = revs[r];
          var item = document.createElement('div');
          item.className = P + '-card';

          // HTML card
          if (rev.html) {
            var cardWrap = document.createElement('div');
            cardWrap.innerHTML = rev.html;
            item.appendChild(cardWrap);
          }

          var action = (rev.json && rev.json.action) || '';

          var actions = document.createElement('div');
          actions.className = P + '-actions';

          // Only REVISE gets an "Apply" button
          if (action === 'revise') {
            var applyBtn = document.createElement('button');
            applyBtn.className = 'scw-bid-review__overflow-trigger scw-bid-review__overflow-trigger--adopt';
            applyBtn.type = 'button';
            applyBtn.textContent = 'Apply';
            applyBtn.setAttribute('data-rev-id', rev.id);
            applyBtn.setAttribute('data-sow-item-id', rev.sowItemId);
            applyBtn.addEventListener('click', handleApply);
            actions.appendChild(applyBtn);
          }

          // All types get "Create Bid CR"
          var crVariant = action === 'remove' ? '--remove'
                        : action === 'add'    ? '--create'
                        :                       '--revise';
          var bidCrBtn = document.createElement('button');
          bidCrBtn.className = 'scw-bid-review__overflow-trigger scw-bid-review__overflow-trigger' + crVariant;
          bidCrBtn.type = 'button';
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
    console.log('[SalesRevCol] Apply revision', revId, 'to SOW item', sowItemId);
    if (window.SCW && SCW.bidReview && SCW.bidReview.renderToast) {
      SCW.bidReview.renderToast('Apply — not yet implemented', 'info');
    }
  }

  function handleCreateBidCR(e) {
    var sowItemId = this.getAttribute('data-sow-item-id');
    var revJson   = {};
    try { revJson = JSON.parse(this.getAttribute('data-rev-json') || '{}'); } catch (ex) {}

    if (window.SCW && SCW.bidReview && SCW.bidReview.createBidCRFromRevision) {
      SCW.bidReview.createBidCRFromRevision({
        sowItemId:   sowItemId,
        action:      revJson.action || 'revise',
        changeNotes: revJson.changeNotes || '',
        revJson:     revJson,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  EVENT BINDINGS
  // ═══════════════════════════════════════════════════════════

  SCW.onViewRender(CFG.revisionView, function () {
    setTimeout(function () {
      loadRevisions();
      injectColumn();
    }, 300);
  }, CFG.eventNs);

  $(document).on('scw-bid-review-rendered' + CFG.eventNs, function () {
    setTimeout(injectColumn, 100);
  });

  $(document).on('knack-scene-render.scene_1155' + CFG.eventNs, function () {
    setTimeout(function () {
      if (_revisionData.length) injectColumn();
    }, 1000);
  });

})();
