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
    parentReqField:  'field_2643',
    htmlField:       'field_2695',
    jsonField:       'field_2696',
    statusField:     'field_2645',

    colHeaderText:   'Sales Revisions',
    mountSelector:   '#bid-review-matrix',
    eventNs:         '.scwSalesRevCol',
    cssId:           'scw-sales-rev-col-css',
    rejectWebhook:   'https://hook.us1.make.com/0cobxwo9q6ycek787agapekg7gtahmt5',
  };

  var P = 'scw-sr-col';
  var _revisionData = [];

  // Ordered fields to display in revision cards on the comparison grid
  var CARD_DISPLAY = [
    'field_1949', 'field_1964', 'field_1953', 'field_1946',
    'field_1957', 'field_2197', 'field_2020',
    'field_2461', 'field_1984', 'field_1965', 'field_2150',
  ];
  var CARD_DISPLAY_SET = {};
  for (var cdi = 0; cdi < CARD_DISPLAY.length; cdi++) CARD_DISPLAY_SET[CARD_DISPLAY[cdi]] = true;

  // ═══════════════════════════════════════════════════════════
  //  CSS
  // ═══════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById(CFG.cssId)) return;
    var css = [
      '.' + P + '-header {',
      '  background: #f0f9ff; color: #0c4a6e;',
      '  padding: 10px 12px;',
      '  min-width: 200px; vertical-align: top;',
      '  border-bottom: 2px solid #0ea5e9;',
      '  text-align: center;',
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

      '.scw-bid-review__overflow-trigger--reject {',
      '  background: #dc2626 !important; color: #fff !important;',
      '  border: none; border-radius: 4px; padding: 4px 10px;',
      '  font: 600 11px/1 system-ui, sans-serif; cursor: pointer;',
      '  white-space: nowrap;',
      '}',
      '.scw-bid-review__overflow-trigger--reject:hover { filter: brightness(.88); }',
      '.scw-bid-review__overflow-trigger--reject:disabled { opacity: .5; cursor: not-allowed; }',

      // ── Sales Revision detail popover ──────────────────────────
      '.scw-sr-popover__backdrop {',
      '  position: fixed; inset: 0; z-index: 100000;',
      '  background: rgba(15,23,42,0.45);',
      '  display: flex; align-items: center; justify-content: center;',
      '  padding: 24px;',
      '}',
      '.scw-sr-popover {',
      '  background: #fff; border-radius: 10px;',
      '  width: 520px; max-width: 100%;',
      '  max-height: calc(100vh - 48px); overflow: hidden;',
      '  display: flex; flex-direction: column;',
      '  box-shadow: 0 24px 64px rgba(2,6,23,0.35);',
      '  font: 13px/1.45 system-ui, -apple-system, Segoe UI, sans-serif;',
      '  color: #0f172a;',
      '}',
      '.scw-sr-popover__head {',
      '  display: flex; align-items: center; gap: 10px;',
      '  padding: 12px 16px;',
      '  background: #295F91; color: #fff;',
      '}',
      '.scw-sr-popover__head--add    { background: #15803d; }',
      '.scw-sr-popover__head--remove { background: #b91c1c; }',
      '.scw-sr-popover__head-title {',
      '  flex: 1; min-width: 0;',
      '  font-weight: 700; font-size: 14px;',
      '}',
      '.scw-sr-popover__head-sub {',
      '  font-weight: 500; font-size: 12px;',
      '  opacity: 0.85; margin-top: 2px;',
      '}',
      '.scw-sr-popover__close {',
      '  flex: 0 0 auto;',
      '  background: rgba(255,255,255,0.18);',
      '  color: #fff;',
      '  border: 1px solid rgba(255,255,255,0.28);',
      '  border-radius: 6px;',
      '  width: 28px; height: 28px;',
      '  font: 700 16px/1 system-ui, sans-serif;',
      '  cursor: pointer;',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '}',
      '.scw-sr-popover__close:hover { background: rgba(255,255,255,0.32); }',
      '.scw-sr-popover__body {',
      '  padding: 14px 16px; overflow-y: auto; flex: 1 1 auto;',
      '}',
      '.scw-sr-popover__section { margin-bottom: 14px; }',
      '.scw-sr-popover__section:last-child { margin-bottom: 0; }',
      '.scw-sr-popover__label {',
      '  font-size: 10.5px; font-weight: 700;',
      '  text-transform: uppercase; letter-spacing: 0.05em;',
      '  color: #64748b; margin-bottom: 6px;',
      '}',
      '.scw-sr-popover__field {',
      '  display: grid; grid-template-columns: 110px 1fr;',
      '  gap: 6px 10px; padding: 5px 0;',
      '  border-bottom: 1px solid #f1f5f9;',
      '  font-size: 12.5px;',
      '}',
      '.scw-sr-popover__field:last-child { border-bottom: none; }',
      '.scw-sr-popover__field-key { color: #475569; font-weight: 600; }',
      '.scw-sr-popover__field-val { color: #0f172a; word-break: break-word; }',
      '.scw-sr-popover__diff {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '  flex-wrap: wrap;',
      '}',
      '.scw-sr-popover__diff-from {',
      '  color: #991b1b; background: #fef2f2;',
      '  padding: 1px 6px; border-radius: 3px;',
      '  text-decoration: line-through;',
      '}',
      '.scw-sr-popover__diff-to {',
      '  color: #15803d; background: #f0fdf4;',
      '  padding: 1px 6px; border-radius: 3px;',
      '  font-weight: 600;',
      '}',
      '.scw-sr-popover__diff-arrow { color: #94a3b8; }',
      '.scw-sr-popover__notes {',
      '  background: #fffbeb; border: 1px solid #fde68a;',
      '  border-radius: 6px; padding: 8px 10px;',
      '  font-style: italic; color: #78350f;',
      '}',
      '.scw-sr-popover__foot {',
      '  display: flex; align-items: center; gap: 8px;',
      '  padding: 12px 16px;',
      '  background: #f8fafc; border-top: 1px solid #e2e8f0;',
      '}',
      '.scw-sr-popover__foot .scw-sr-popover__spacer { flex: 1; }',
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

      var $prCell = $tr.find('td.' + CFG.parentReqField);
      var prSpan  = $prCell.length
        ? $prCell[0].querySelector('span[data-kn="connection-value"]')
        : null;
      var parentRequestId = prSpan ? prSpan.className.trim() : '';

      var status = ($tr.find('td.' + CFG.statusField).text() || '').replace(/[\u00a0\s]+/g, ' ').trim();

      // Skip rejected/accepted items
      if (/^rejected$/i.test(status) || /^accepted$/i.test(status)) return;

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
        id:              id,
        sowItemId:        sowItemId,
        parentRequestId:  parentRequestId,
        status:           status,
        html:             htmlContent,
        json:             jsonData,
      });
    });

    if (window.SCW && SCW.bidReview && SCW.bidReview.CONFIG && SCW.bidReview.CONFIG.debug) {
      SCW.debug('[SalesRevCol] Loaded', _revisionData.length, 'revision records');
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

  function removeColumn() {
    var $mount = $(CFG.mountSelector);
    if (!$mount.length) return;
    $mount.find('.' + P + '-header, .' + P + '-detail-placeholder, .' + P + '-action-header, .' + P + '-cell').remove();
    // Undo colspan bumps
    $mount.find('td[data-sr-bumped]').each(function () {
      var span = parseInt($(this).attr('colspan'), 10) || 2;
      $(this).attr('colspan', span - 1);
    });
    $mount.find('[data-sr-bumped]').removeAttr('data-sr-bumped');
  }

  function injectColumn() {
    // Always clean up previous injection before rebuilding
    removeColumn();

    if (!_revisionData.length) return;

    var $mount = $(CFG.mountSelector);
    if (!$mount.length) return;

    var bySow = revisionsBySowItem();
    if (!Object.keys(bySow).length) return;

    injectStyles();

    // Inject into header rows (3-row layout)
    // Row 1 (titles): insert TH after Line Item
    $mount.find('.scw-bid-review__header-titles').each(function () {
      if ($(this).find('.' + P + '-header').length) return;
      var th = document.createElement('th');
      th.className = P + '-header';
      th.textContent = CFG.colHeaderText;
      $(this).find('th').first().after(th);
    });

    // Row 2 (details): insert empty TD
    $mount.find('.scw-bid-review__header-details').each(function () {
      if ($(this).find('.' + P + '-detail-placeholder').length) return;
      var td = document.createElement('td');
      td.className = P + '-detail-placeholder';
      $(this).find('td').first().after(td);
    });

    // Row 3 (actions): insert TD with Convert All button
    $mount.find('.scw-bid-review__header-actions').each(function () {
      if ($(this).find('.' + P + '-action-header').length) return;
      var td = document.createElement('td');
      td.className = P + '-action-header scw-bid-review__header-action-cell';
      var convertBtn = document.createElement('button');
      convertBtn.className = 'scw-bid-review__btn scw-bid-review__btn--adopt';
      convertBtn.textContent = 'Convert All \u2192';
      convertBtn.addEventListener('click', handleConvertAll);
      td.appendChild(convertBtn);
      $(this).find('td').first().after(td);
    });

    // Inject data cells — match on data-sow-item-id (SOW line item ID)
    $mount.find('tr[data-row-id], tr.scw-bid-review__group-header, tr.scw-bid-review__subgroup-header').each(function () {
      var $tr = $(this);

      // Group/subgroup header rows — bump colspan
      if ($tr.hasClass('scw-bid-review__group-header') || $tr.hasClass('scw-bid-review__subgroup-header')) {
        var $td = $tr.find('td[colspan]');
        if ($td.length && !$td.attr('data-sr-bumped')) {
          var span = parseInt($td.attr('colspan'), 10) || 1;
          $td.attr('colspan', span + 1);
          $td.attr('data-sr-bumped', '1');
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
                      : action === 'add'    ? '--add'
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

          // For product name: prefer requested value if product changed
          var cardProduct = json.productName || '';
          var jr = json.requested || {};
          if (jr.field_1949) cardProduct = jr.field_1949;

          if (json.displayLabel || cardProduct) {
            var label = document.createElement('div');
            label.className = 'scw-bid-cr-card__item-label';
            label.textContent = json.displayLabel
              ? (json.displayLabel + (cardProduct && cardProduct !== json.displayLabel ? ' (' + cardProduct + ')' : ''))
              : cardProduct;
            card.appendChild(label);
          }

          if (json.fields && json.fields.length) {
            // Build lookup, then walk in display order
            var fByKey = {};
            for (var fbi = 0; fbi < json.fields.length; fbi++) fByKey[json.fields[fbi].field] = json.fields[fbi];
            for (var di = 0; di < CARD_DISPLAY.length; di++) {
              var f = fByKey[CARD_DISPLAY[di]];
              if (!f) continue;
              var fval = f.to != null ? String(f.to) : '';
              if (!fval || fval === '\u00a0') continue;
              if (f.field === 'field_1964' && (parseFloat(fval) <= 1 || isNaN(parseFloat(fval)))) continue;
              var row = document.createElement('div');
              row.className = 'scw-bid-cr-card__row';
              if (action === 'revise' || action === 'add') {
                row.textContent = f.label + ': ' + (f.from != null ? f.from : '\u2014') + ' \u2192 ' + f.to;
              } else {
                row.textContent = f.label + ': ' + f.to;
              }
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

          // Card body click opens the detail popover. Stop bubbling so
          // the bid-review row-expand doesn't also fire underneath.
          card.style.cursor = 'pointer';
          card.title = 'Click for full revision detail';
          (function (capturedRev) {
            card.addEventListener('click', function (ev) {
              if (ev.target.closest('button, a, input, select, textarea')) return;
              ev.preventDefault();
              ev.stopPropagation();
              openRevisionPopover(capturedRev, card);
            });
          })(rev);

          item.appendChild(card);

          // Build overflow menus matching the CR column style
          var actions = document.createElement('div');
          actions.className = 'scw-bid-review__action-menus';

          // Gather package choices from the grid
          var packages = getGridPackages();
          var revJsonStr = JSON.stringify(rev.json || {});

          // Check if item is on the bid (has a non-missing bid cell)
          var gridRow = $tr.closest('tr[data-row-id]');
          var isOnBid = gridRow.length && !gridRow.find('.scw-bid-review__cell--missing').length
                     && !gridRow.find('.scw-bid-review__no-bid-badge, .scw-bid-review__survey-no-bid-badge').length;

          // Reject button — only for add/remove actions (not revise)
          if (action !== 'revise') {
            var rejectBtn = document.createElement('button');
            rejectBtn.className = 'scw-bid-review__overflow-trigger scw-bid-review__overflow-trigger--reject';
            rejectBtn.textContent = 'Reject';
            rejectBtn.setAttribute('data-rev-id', rev.id);
            rejectBtn.setAttribute('data-rev-request-id', rev.parentRequestId || '');
            rejectBtn.setAttribute('data-rev-json', revJsonStr);
            rejectBtn.addEventListener('click', handleRejectClick);
            actions.appendChild(rejectBtn);
          }

          // Revise items: show Clear button (on-bid and not-on-bid)
          if (action === 'revise') {
            var ackBtn = document.createElement('button');
            ackBtn.className = 'scw-bid-review__overflow-trigger scw-bid-review__overflow-trigger--adopt';
            ackBtn.textContent = 'Clear';
            ackBtn.setAttribute('data-rev-id', rev.id);
            ackBtn.addEventListener('click', function () {
              var aid = this.getAttribute('data-rev-id');
              this.disabled = true;
              this.textContent = 'Updating\u2026';
              var self = this;
              var statusData = {};
              statusData[CFG.statusField] = 'Accepted';
              SCW.knackAjax({
                url: SCW.knackRecordUrl(CFG.revisionView, aid),
                type: 'PUT',
                data: JSON.stringify(statusData),
                success: function () {
                  self.textContent = 'Cleared \u2713';
                  self.style.opacity = '0.6';
                  setTimeout(function () {
                    if (Knack.views[CFG.revisionView] && Knack.views[CFG.revisionView].model) {
                      Knack.views[CFG.revisionView].model.fetch();
                    }
                  }, 1500);
                },
                error: function () {
                  self.textContent = 'Failed';
                  self.disabled = false;
                },
              });
            });
            actions.appendChild(ackBtn);
          }

          // CR button — Revise only if on bid; Add/Remove always shown
          if (action !== 'revise' || isOnBid) {
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
                  'data-rev-request-id': rev.parentRequestId || '',
                  'data-sow-item-id': rev.sowItemId,
                  'data-rev-json': revJsonStr,
                }
              });
            }
            actions.appendChild(buildSROverflow(crLabel, crMod, crChoices));
          }

          // Not on bid + revise: also offer Add to bid
          if (!isOnBid && action === 'revise') {
            var addChoices = [];
            for (var addp = 0; addp < packages.length; addp++) {
              addChoices.push({
                label: packages[addp].name,
                attrs: {
                  'data-sr-action': 'create-bid-cr',
                  'data-rev-id': rev.id,
                  'data-rev-request-id': rev.parentRequestId || '',
                  'data-sow-item-id': rev.sowItemId,
                  'data-rev-json': JSON.stringify($.extend({}, rev.json || {}, { action: 'add' })),
                }
              });
            }
            actions.appendChild(buildSROverflow('Add \u2192', 'create', addChoices));
          }

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

  function elDiv(cls, text) {
    var d = document.createElement('div');
    if (cls) d.className = cls;
    if (text != null) d.textContent = text;
    return d;
  }

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
      // Read package name from subtitle (BD-#) or old pkg-name element
      var $subtitle = $(this).find('.scw-bid-review__col-subtitle');
      var $nameOld = $(this).find('.scw-bid-review__pkg-name');
      var name = '';
      if ($subtitle.length) {
        name = $subtitle.contents().filter(function () { return this.nodeType === 3; }).first().text().trim();
      }
      if (!name && $nameOld.length) {
        name = $nameOld.contents().first().text().trim();
      }
      // Get package ID from any action button in the header
      var $actionBtn = $(this).find('button[data-package-id]');
      var id = $actionBtn.length ? $actionBtn.attr('data-package-id') : '';
      if (name && id) pkgs.push({ id: id, name: name });
    });
    // Fallback: read from data rows in the CR column
    if (!pkgs.length) {
      var seen = {};
      $mount.find('.scw-bid-review__overflow-item[data-package-id]').each(function () {
        var id = this.getAttribute('data-package-id');
        var name = this.textContent.trim();
        if (id && !seen[id]) {
          seen[id] = true;
          pkgs.push({ id: id, name: name || id });
        }
      });
    }
    return pkgs;
  }

  // ═══════════════════════════════════════════════════════════
  //  ACTION HANDLERS
  // ═══════════════════════════════════════════════════════════

  /** Convert all sales revisions to pending bid CRs — pick package first. */
  function handleConvertAll(e) {
    e.stopPropagation();
    if (!window.SCW || !SCW.bidReview || !SCW.bidReview.batchConvertRevisions) {
      console.warn('[SalesRevCol] batchConvertRevisions not available');
      return;
    }

    var packages = getGridPackages();
    if (!packages.length) {
      if (SCW.bidReview.renderToast) SCW.bidReview.renderToast('No bid packages available', 'error');
      return;
    }

    // Build revision data for batch
    var revItems = [];
    for (var i = 0; i < _revisionData.length; i++) {
      var rev = _revisionData[i];
      if (!rev.sowItemId) continue;
      revItems.push({
        sowItemId:            rev.sowItemId,
        action:               (rev.json && rev.json.action) || 'revise',
        changeNotes:          (rev.json && rev.json.changeNotes) || '',
        revJson:              rev.json || {},
        revisionRecordId:     rev.id,
        revisionRequestId:    rev.parentRequestId || '',
      });
    }

    if (!revItems.length) {
      if (SCW.bidReview.renderToast) SCW.bidReview.renderToast('No revisions to convert', 'info');
      return;
    }

    function doConvert(pkgId) {
      var count = SCW.bidReview.batchConvertRevisions(revItems, pkgId);
      if (SCW.bidReview.renderToast) {
        SCW.bidReview.renderToast('Converted ' + count + ' revision(s) to pending bid CRs', 'success');
      }
    }

    if (packages.length === 1) {
      doConvert(packages[0].id);
    } else {
      // Show package picker
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
      overlay.addEventListener('click', function (ev) { if (ev.target === overlay) overlay.remove(); });

      var modal = document.createElement('div');
      modal.style.cssText = 'background:#fff;border-radius:10px;padding:20px;min-width:240px;font:13px/1.45 system-ui,sans-serif;';
      modal.innerHTML = '<div style="font-size:16px;font-weight:700;margin-bottom:12px;">Convert ' + revItems.length + ' revision(s) to which bid?</div>';

      for (var p = 0; p < packages.length; p++) {
        var btn = document.createElement('button');
        btn.style.cssText = 'display:block;width:100%;padding:8px 14px;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:5px;background:#f8fafc;color:#1e293b;font:600 13px/1 system-ui,sans-serif;cursor:pointer;text-align:left;';
        btn.textContent = packages[p].name;
        btn.setAttribute('data-pkg-id', packages[p].id);
        btn.addEventListener('click', function () {
          var pkgId = this.getAttribute('data-pkg-id');
          overlay.remove();
          doConvert(pkgId);
        });
        modal.appendChild(btn);
      }

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    }
  }

  function handleRejectClick(e) {
    e.stopPropagation();
    var btn = this;
    var revId = btn.getAttribute('data-rev-id');
    var revReqId = btn.getAttribute('data-rev-request-id');
    var revJson = {};
    try { revJson = JSON.parse(btn.getAttribute('data-rev-json') || '{}'); } catch (ex) {}

    var label = revJson.displayLabel || revJson.productName || 'this item';
    if (!window.confirm('Reject revision for ' + label + '?')) return;

    btn.disabled = true;
    btn.textContent = 'Rejecting\u2026';

    // Build updated JSON with rejection stamp
    var updatedJson = JSON.parse(JSON.stringify(revJson));
    updatedJson.status = 'Rejected';
    updatedJson.rejectedAt = new Date().toISOString();
    try {
      var u = Knack.getUserAttributes();
      if (u) updatedJson.rejectedBy = { id: u.id || '', name: u.name || '', email: u.email || '' };
    } catch (ex) {}

    // Build rejection HTML stamp to prepend to existing card
    var stampHtml = '<div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;'
      + 'background:#fef2f2;border:1px solid #fecaca;border-radius:4px;padding:6px 10px;margin-bottom:6px;'
      + 'color:#991b1b;font-weight:600;">'
      + '\u274c Rejected &mdash; ' + new Date().toLocaleString()
      + '</div>';

    // Find the existing HTML from the card in the DOM
    var cardEl = btn.closest('.' + P + '-item');
    var existingHtml = '';
    if (cardEl) {
      var cardDiv = cardEl.querySelector('.' + P + '-card');
      if (cardDiv) existingHtml = cardDiv.innerHTML;
    }
    var newHtml = stampHtml + existingHtml;

    // 1. Update Knack record: field_2645 (status), field_2695 (HTML), field_2696 (JSON)
    var knackData = {};
    knackData[CFG.statusField] = 'Rejected';
    knackData[CFG.htmlField] = newHtml;
    knackData[CFG.jsonField] = JSON.stringify(updatedJson);

    SCW.knackAjax({
      url: SCW.knackRecordUrl(CFG.revisionView, revId),
      type: 'PUT',
      data: JSON.stringify(knackData),
      success: function () {
        SCW.debug('[SalesRevCol] Updated record', revId, 'to Rejected');
        afterReject(btn);
      },
      error: function () {
        console.warn('[SalesRevCol] Failed to update record', revId);
        btn.textContent = 'Failed';
        btn.disabled = false;
        setTimeout(function () { btn.textContent = 'Reject'; }, 3000);
      },
    });

    // 2. Send webhook with full item data (fire-and-forget)
    var item = JSON.parse(JSON.stringify(updatedJson));
    item.lineItemId = revId;
    if (!item.action) item.action = 'revise';

    var payload = {
      action: 'reject',
      timestamp: new Date().toISOString(),
      totalItems: 1,
      revisionRequests: [{
        revisionRequestId: revReqId || '',
        items: [item],
      }],
    };

    $.ajax({
      url: CFG.rejectWebhook,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify(payload),
      timeout: 30000,
    });
  }

  function afterReject(btn) {
    btn.textContent = 'Rejected \u2713';
    btn.style.opacity = '0.6';
    // Refresh revision data view — its view-render event triggers
    // loadRevisions() + injectColumn(), and scw-bid-review-rendered
    // re-injects the column after any grid rebuild.
    setTimeout(function () {
      if (Knack.views[CFG.revisionView] && Knack.views[CFG.revisionView].model) {
        Knack.views[CFG.revisionView].model.fetch();
      }
    }, 1500);
  }

  // ═══════════════════════════════════════════════════════════
  //  APPLY REVISION — write changes to SOW + survey records
  // ═══════════════════════════════════════════════════════════

  // SOW field key → survey field key mapping
  var SOW_TO_SURVEY = {
    field_1949: 'field_2627',  // product (connection)
    field_1964: 'field_2399',  // qty
    field_2020: 'field_2409',  // labor description
    field_2461: 'field_2370',  // existing cabling
    field_1984: 'field_2372',  // exterior
    field_1983: 'field_2371',  // plenum
    field_1965: 'field_2367',  // drop length
    field_2035: 'field_2368',  // conduit
    field_2150: 'field_2400',  // sub bid / rate
    field_1946: 'field_2375',  // MDF/IDF (connection — different field!)
    field_1957: 'field_2380',  // connected devices (connection)
    field_2197: 'field_2381',  // connected to (connection)
  };

  var SOW_VIEW = 'view_3921';
  var SURVEY_VIEW = 'view_3680';

  function applyRevisionToRecords(sowItemId, revJson, revLineItemId, btn) {
    if (!sowItemId || !revJson) return;
    var jr = revJson.requested || {};
    var fields = revJson.fields || [];
    if (!Object.keys(jr).length && !fields.length) {
      if (SCW.bidReview && SCW.bidReview.renderToast) {
        SCW.bidReview.renderToast('No field changes to apply', 'info');
      }
      return;
    }

    // Find the survey item ID from the grid row
    var $gridRow = $('[data-sow-item-id="' + sowItemId + '"]');
    var surveyItemId = $gridRow.attr('data-row-id') || '';

    // Build SOW update data (use field keys directly from requested)
    var sowData = {};
    for (var sk in jr) {
      if (sk.indexOf('_ids') !== -1) continue; // skip ID arrays
      var sv = jr[sk];
      if (sv == null || sv === '' || sv === '\u00a0') continue;
      // For connection fields, use the _ids array as the value
      if (jr[sk + '_ids'] && jr[sk + '_ids'].length) {
        sowData[sk] = jr[sk + '_ids'];
      } else {
        sowData[sk] = sv;
      }
    }

    // Build survey update data (map SOW keys → survey keys)
    var surveyData = {};
    for (var sowKey in SOW_TO_SURVEY) {
      var sowVal = jr[sowKey];
      if (sowVal == null || sowVal === '' || sowVal === '\u00a0') continue;
      var surveyKey = SOW_TO_SURVEY[sowKey];
      if (jr[sowKey + '_ids'] && jr[sowKey + '_ids'].length) {
        surveyData[surveyKey] = jr[sowKey + '_ids'];
      } else {
        surveyData[surveyKey] = sowVal;
      }
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Applying\u2026'; }

    var done = 0;
    var errors = 0;
    var total = (Object.keys(sowData).length ? 1 : 0)
              + (surveyItemId && Object.keys(surveyData).length ? 1 : 0)
              + (revLineItemId ? 1 : 0);

    function checkDone() {
      done++;
      if (done < total) return;
      if (btn) btn.textContent = errors ? 'Partial \u2713' : 'Applied \u2713';
      if (SCW.bidReview && SCW.bidReview.renderToast) {
        SCW.bidReview.renderToast(
          errors ? 'Applied with errors — check console' : 'Revision applied to records',
          errors ? 'error' : 'success'
        );
      }
      setTimeout(function () {
        if (Knack.views[SOW_VIEW] && Knack.views[SOW_VIEW].model) Knack.views[SOW_VIEW].model.fetch();
        if (Knack.views[SURVEY_VIEW] && Knack.views[SURVEY_VIEW].model) Knack.views[SURVEY_VIEW].model.fetch();
        if (Knack.views[CFG.revisionView] && Knack.views[CFG.revisionView].model) Knack.views[CFG.revisionView].model.fetch();
      }, 1500);
    }

    // Update SOW record
    if (Object.keys(sowData).length) {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(SOW_VIEW, sowItemId),
        type: 'PUT',
        data: JSON.stringify(sowData),
        success: function () { SCW.debug('[SalesRevCol] SOW updated:', sowItemId); checkDone(); },
        error: function () { console.warn('[SalesRevCol] SOW update failed:', sowItemId); errors++; checkDone(); },
      });
    }

    // Update survey record
    if (surveyItemId && Object.keys(surveyData).length) {
      SCW.knackAjax({
        url: SCW.knackRecordUrl(SURVEY_VIEW, surveyItemId),
        type: 'PUT',
        data: JSON.stringify(surveyData),
        success: function () { SCW.debug('[SalesRevCol] Survey updated:', surveyItemId); checkDone(); },
        error: function () { console.warn('[SalesRevCol] Survey update failed:', surveyItemId); errors++; checkDone(); },
      });
    }

    // Update revision line item status to Accepted
    if (revLineItemId) {
      var statusData = {};
      statusData[CFG.statusField] = 'Accepted';
      SCW.knackAjax({
        url: SCW.knackRecordUrl(CFG.revisionView, revLineItemId),
        type: 'PUT',
        data: JSON.stringify(statusData),
        success: function () { SCW.debug('[SalesRevCol] Revision status updated:', revLineItemId); checkDone(); },
        error: function () { console.warn('[SalesRevCol] Revision status update failed:', revLineItemId); errors++; checkDone(); },
      });
    }

    if (!total) {
      if (btn) btn.textContent = 'Nothing to apply';
    }
  }

  function handleSRAction(e) {
    e.stopPropagation();
    // Close overflow
    var overflow = this.closest('.scw-bid-review__overflow');
    if (overflow) overflow.classList.remove('scw-bid-review__overflow--open');

    var action = this.getAttribute('data-sr-action');
    var revId  = this.getAttribute('data-rev-id');
    var sowItemId = this.getAttribute('data-sow-item-id');

    if (action === 'apply') {
      var revJson = {};
      try { revJson = JSON.parse(this.getAttribute('data-rev-json') || '{}'); } catch (ex) {}
      var applyRevId = this.getAttribute('data-rev-id');
      applyRevisionToRecords(sowItemId, revJson, applyRevId, this);
      return;
    }

    if (action === 'create-bid-cr') {
      var revJson = {};
      try { revJson = JSON.parse(this.getAttribute('data-rev-json') || '{}'); } catch (ex) {}
      var revId = this.getAttribute('data-rev-id');
      var revReqId = this.getAttribute('data-rev-request-id');

      if (window.SCW && SCW.bidReview && SCW.bidReview.createBidCRFromRevision) {
        SCW.bidReview.createBidCRFromRevision({
          sowItemId:            sowItemId,
          action:               revJson.action || 'revise',
          changeNotes:          revJson.changeNotes || '',
          revJson:              revJson,
          revisionRecordId:     revId || '',
          revisionRequestId:    revReqId || '',
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  POPOVER — full revision detail
  // ═══════════════════════════════════════════════════════════

  // Map field key → readable label. The JSON payload carries f.label,
  // but it's not always populated, so this is a fallback.
  var FIELD_LABELS = {
    field_1949: 'Product',
    field_1964: 'Quantity',
    field_2020: 'Labor Description',
    field_1953: 'SCW Notes',
    field_2461: 'Existing Cabling',
    field_1984: 'Exterior',
    field_1983: 'Plenum',
    field_1965: 'Drop Length',
    field_1951: 'Drop Number',
    field_2150: 'Sub Bid',
    field_1957: 'Connected Devices',
    field_2197: 'Connected To',
    field_1946: 'MDF/IDF',
    field_2035: 'Conduit',
    field_2261: 'Custom Discount %',
    field_2262: 'Custom Discount $',
    field_2240: 'Drop Prefix',
    field_2219: 'Proposal Bucket',
  };

  var _openPopover = null;
  var _activeClose = null;

  function popoverKeyHandler(e) {
    if (e.key === 'Escape' && _activeClose) _activeClose();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildDiffValue(f, action) {
    var fromVal = f.from != null && f.from !== '' ? String(f.from) : '—';
    var toVal   = f.to   != null && f.to   !== '' ? String(f.to)   : '—';
    if (action === 'revise' || action === 'add') {
      var wrap = el('div', 'scw-sr-popover__diff');
      wrap.appendChild(el('span', 'scw-sr-popover__diff-from', fromVal));
      wrap.appendChild(el('span', 'scw-sr-popover__diff-arrow', '→'));
      wrap.appendChild(el('span', 'scw-sr-popover__diff-to', toVal));
      return wrap;
    }
    return el('span', 'scw-sr-popover__field-val', toVal);
  }

  function openRevisionPopover(rev, anchorCard) {
    if (_activeClose) _activeClose();

    var json   = rev.json || {};
    var action = json.action || 'revise';

    // Slot for the moved action buttons — set when we move them in,
    // checked by doClose to restore them before tearing down the popover.
    var actionMarker = null;
    var movedActions = null;

    function doClose() {
      if (movedActions && actionMarker && actionMarker.parentNode) {
        actionMarker.parentNode.insertBefore(movedActions, actionMarker);
        actionMarker.parentNode.removeChild(actionMarker);
      }
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      _openPopover = null;
      _activeClose = null;
      document.removeEventListener('keydown', popoverKeyHandler);
    }

    var backdrop = el('div', 'scw-sr-popover__backdrop');
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) doClose();
    });

    var pop = el('div', 'scw-sr-popover');
    backdrop.appendChild(pop);

    // Header
    var headMod = action === 'add'    ? ' scw-sr-popover__head--add'
                : action === 'remove' ? ' scw-sr-popover__head--remove'
                :                       '';
    var head = el('div', 'scw-sr-popover__head' + headMod);
    var headTitleWrap = el('div', 'scw-sr-popover__head-title');
    var headLabel = action === 'add'    ? 'Sales: Add line item'
                  : action === 'remove' ? 'Sales: Remove line item'
                  :                       'Sales: Revise line item';
    headTitleWrap.appendChild(document.createTextNode(headLabel));
    var product = json.productName || '';
    var jr = json.requested || {};
    if (jr.field_1949) product = jr.field_1949;
    var subText = json.displayLabel
      ? (json.displayLabel + (product && product !== json.displayLabel ? '  ·  ' + product : ''))
      : product;
    if (subText) headTitleWrap.appendChild(el('div', 'scw-sr-popover__head-sub', subText));
    head.appendChild(headTitleWrap);

    var closeBtn = el('button', 'scw-sr-popover__close', '×');
    closeBtn.type = 'button';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', doClose);
    head.appendChild(closeBtn);
    pop.appendChild(head);

    // Body
    var body = el('div', 'scw-sr-popover__body');

    if (json.fields && json.fields.length) {
      var section = el('div', 'scw-sr-popover__section');
      section.appendChild(el('div', 'scw-sr-popover__label',
        action === 'add' ? 'New record values' : 'Field changes'));
      for (var i = 0; i < json.fields.length; i++) {
        var f = json.fields[i];
        var fval = f.to != null ? String(f.to) : '';
        // Skip non-informative cells (matches the card filter)
        if (!fval || fval === ' ') continue;
        if (f.field === 'field_1964' && (parseFloat(fval) <= 1 || isNaN(parseFloat(fval)))) continue;
        var row = el('div', 'scw-sr-popover__field');
        row.appendChild(el('div', 'scw-sr-popover__field-key',
          f.label || FIELD_LABELS[f.field] || f.field));
        row.appendChild(buildDiffValue(f, action));
        section.appendChild(row);
      }
      body.appendChild(section);
    } else if (action === 'remove') {
      var rmSection = el('div', 'scw-sr-popover__section');
      rmSection.appendChild(el('div', 'scw-sr-popover__label', 'Action'));
      rmSection.appendChild(el('div', 'scw-sr-popover__field-val', 'Requesting removal of this line item.'));
      body.appendChild(rmSection);
    }

    if (json.changeNotes) {
      var notesSection = el('div', 'scw-sr-popover__section');
      notesSection.appendChild(el('div', 'scw-sr-popover__label', 'Change notes'));
      notesSection.appendChild(el('div', 'scw-sr-popover__notes', json.changeNotes));
      body.appendChild(notesSection);
    }

    if (rev.status) {
      var statusSection = el('div', 'scw-sr-popover__section');
      statusSection.appendChild(el('div', 'scw-sr-popover__label', 'Status'));
      statusSection.appendChild(el('div', 'scw-sr-popover__field-val', rev.status));
      body.appendChild(statusSection);
    }

    pop.appendChild(body);

    // Footer — re-use the existing action buttons from the card. We
    // clone the live action buttons so their already-attached handlers
    // keep working when invoked from the popover.
    var foot = el('div', 'scw-sr-popover__foot');
    foot.appendChild(el('div', 'scw-sr-popover__spacer'));
    if (anchorCard) {
      var liveActions = anchorCard.parentNode && anchorCard.parentNode.querySelector('.scw-bid-review__action-menus');
      if (liveActions) {
        // Move (don't clone) into the popover footer so existing listeners
        // remain wired. doClose will move it back into the card.
        movedActions = liveActions;
        actionMarker = document.createComment('scw-sr-actions-slot');
        liveActions.parentNode.insertBefore(actionMarker, liveActions);
        foot.appendChild(liveActions);
      }
    }
    pop.appendChild(foot);

    document.body.appendChild(backdrop);
    _openPopover = backdrop;
    _activeClose = doClose;
    document.addEventListener('keydown', popoverKeyHandler);
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
