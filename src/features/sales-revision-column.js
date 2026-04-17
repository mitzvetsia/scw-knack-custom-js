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
      '  min-width: 200px; overflow: visible;',
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
          var json = rev.json || {};
          var action = json.action || '';
          var item = document.createElement('div');

          // Build card matching scw-bid-cr-card structure
          var cardMod = action === 'remove' ? '--removal'
                      : action === 'add'    ? ''
                      :                       '';
          var card = document.createElement('div');
          card.className = 'scw-bid-cr-card' + (cardMod ? ' scw-bid-cr-card' + cardMod : '');

          var headerText = action === 'remove' ? 'Sales: Remove'
                         : action === 'add'    ? 'Sales: Add'
                         :                       'Sales: Revise';
          var header = document.createElement('div');
          header.className = 'scw-bid-cr-card__header';
          header.textContent = headerText;
          card.appendChild(header);

          if (json.displayLabel || json.productName) {
            var label = document.createElement('div');
            label.className = 'scw-bid-cr-card__item-label';
            label.textContent = json.displayLabel || json.productName;
            card.appendChild(label);
          }

          if (json.fields && json.fields.length) {
            for (var fi = 0; fi < json.fields.length; fi++) {
              var f = json.fields[fi];
              var row = document.createElement('div');
              row.className = 'scw-bid-cr-card__row';
              row.textContent = f.label + ': ' + (f.from || '\u2014') + ' \u2192 ' + f.to;
              card.appendChild(row);
            }
          } else if (action === 'remove') {
            var removeRow = document.createElement('div');
            removeRow.className = 'scw-bid-cr-card__row';
            removeRow.textContent = 'Requesting removal';
            card.appendChild(removeRow);
          }

          if (json.changeNotes) {
            var notes = document.createElement('div');
            notes.className = 'scw-bid-cr-card__notes';
            notes.textContent = '\u201c' + json.changeNotes + '\u201d';
            card.appendChild(notes);
          }

          item.appendChild(card);

          // Build overflow menus matching the CR column style
          var actions = document.createElement('div');
          actions.className = 'scw-bid-review__action-menus';

          // Gather package choices from the grid
          var packages = getGridPackages();
          var revJsonStr = JSON.stringify(rev.json || {});

          // Only REVISE gets an "Apply" overflow
          if (action === 'revise') {
            var applyChoices = [];
            for (var ap = 0; ap < packages.length; ap++) {
              applyChoices.push({
                label: packages[ap].name,
                attrs: {
                  'data-sr-action': 'apply',
                  'data-rev-id': rev.id,
                  'data-sow-item-id': rev.sowItemId,
                }
              });
            }
            actions.appendChild(buildSROverflow('Apply', 'adopt', applyChoices));
          }

          // CR button — green (create) for all types, label varies
          var crLabel = action === 'add'    ? 'Add \u2192'
                      : action === 'remove' ? 'Remove \u2192'
                      :                       'Revise \u2192';
          var crMod   = action === 'add'    ? 'create'
                      : action === 'remove' ? 'remove'
                      :                       'revise';
          var crChoices = [];
          for (var cp = 0; cp < packages.length; cp++) {
            crChoices.push({
              label: packages[cp].name,
              attrs: {
                'data-sr-action': 'create-bid-cr',
                'data-rev-id': rev.id,
                'data-sow-item-id': rev.sowItemId,
                'data-rev-json': revJsonStr,
              }
            });
          }
          actions.appendChild(buildSROverflow(crLabel, crMod, crChoices));

          item.appendChild(actions);
          td.appendChild(item);
        }
      }

      var $firstTd = $tr.find('td').first();
      $firstTd.after(td);
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  OVERFLOW MENU (mirrors bid-review buildOverflowMenu)
  // ═══════════════════════════════════════════════════════════

  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function buildSROverflow(triggerLabel, triggerMod, choices) {
    var container = document.createElement('div');
    container.className = 'scw-bid-review__overflow';

    var trigger = document.createElement('button');
    trigger.className = 'scw-bid-review__overflow-trigger scw-bid-review__overflow-trigger--' + triggerMod;
    trigger.type = 'button';
    trigger.innerHTML = '<span class="scw-bid-review__overflow-dots">\u22EE</span> ' + esc(triggerLabel);
    container.appendChild(trigger);

    var menu = document.createElement('div');
    menu.className = 'scw-bid-review__overflow-menu';
    for (var i = 0; i < choices.length; i++) {
      var ch = choices[i];
      var itemEl = document.createElement('button');
      itemEl.className = 'scw-bid-review__overflow-item';
      itemEl.type = 'button';
      itemEl.textContent = ch.label;
      var keys = Object.keys(ch.attrs);
      for (var k = 0; k < keys.length; k++) itemEl.setAttribute(keys[k], ch.attrs[keys[k]]);
      itemEl.addEventListener('click', handleSRAction);
      menu.appendChild(itemEl);
    }
    container.appendChild(menu);

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

  /** Read all bid packages from the grid's header row. */
  function getGridPackages() {
    var pkgs = [];
    var $mount = $(CFG.mountSelector);
    $mount.find('.scw-bid-review__pkg-header').each(function () {
      var $name = $(this).find('.scw-bid-review__pkg-name');
      var name = $name.length ? $name.contents().first().text().trim() : '';
      // Get package ID from any action button in the header
      var $actionBtn = $(this).find('button[data-package-id]');
      var id = $actionBtn.length ? $actionBtn.attr('data-package-id') : '';
      if (name && id) pkgs.push({ id: id, name: name });
    });
    // Fallback: read from data rows
    if (!pkgs.length) {
      var seen = {};
      $mount.find('button[data-package-id]').each(function () {
        var id = this.getAttribute('data-package-id');
        if (id && !seen[id]) {
          seen[id] = true;
          pkgs.push({ id: id, name: id });
        }
      });
    }
    return pkgs;
  }

  // ═══════════════════════════════════════════════════════════
  //  ACTION HANDLERS
  // ═══════════════════════════════════════════════════════════

  function handleSRAction(e) {
    e.stopPropagation();
    // Close overflow
    var overflow = this.closest('.scw-bid-review__overflow');
    if (overflow) overflow.classList.remove('scw-bid-review__overflow--open');

    var action = this.getAttribute('data-sr-action');
    var revId  = this.getAttribute('data-rev-id');
    var sowItemId = this.getAttribute('data-sow-item-id');

    if (action === 'apply') {
      console.log('[SalesRevCol] Apply revision', revId, 'to SOW item', sowItemId);
      if (window.SCW && SCW.bidReview && SCW.bidReview.renderToast) {
        SCW.bidReview.renderToast('Apply — not yet implemented', 'info');
      }
      return;
    }

    if (action === 'create-bid-cr') {
      var revJson = {};
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
