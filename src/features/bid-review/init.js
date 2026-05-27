/*** BID REVIEW — INITIALIZATION ***/
/**
 * Orchestrates the Bid Review Matrix feature:
 *   1. Binds to Knack view render
 *   2. Loads data → transforms → renders
 *   3. Installs a single delegated click handler for all actions
 *
 * Reads : SCW.bidReview.CONFIG, .injectStyles, .loadRawData,
 *         .buildState, .collectEligible, .renderMatrix,
 *         .showLoading, .submitAction, .renderToast
 * Writes: SCW.bidReview.refresh()
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  var INIT_FLAG = 'data-scw-bid-review-init';
  var CAM_READER_BUCKET_ID = '6481e5ba38f283002898113c';

  // Current state — kept in closure for the click handler
  var _state = null;
  var _mdfIdfRecords = [];  // MDF/IDF location records from view_3822

  // ── load → transform → render pipeline ──────────────────────

  function runPipeline() {
    // Hard scene gate — the matrix mount lives outside any scene
    // container (inserted as a sibling of view_44, the nav menu) so
    // Knack's scene swap doesn't clean it up. If a view-render event
    // for one of our watched views fires while the user is on a
    // sibling scene (e.g. Build SOWs on scene_1140 happens to share a
    // view key, or a stale render event drains late), bail before
    // creating the mount. The cleanup handler still runs on real
    // scene transitions to tear down any matrix that did sneak in.
    var sceneKey = (window.Knack && Knack.router && Knack.router.current_scene_key) || '';
    if (sceneKey && sceneKey !== CFG.sceneKey) {
      if (CFG.debug) {
        SCW.debug('[BidReview] runPipeline skipped — current scene', sceneKey,
          'is not', CFG.sceneKey);
      }
      return;
    }

    ns.showLoading();

    ns.loadRawData().then(function (raw) {
      _state = ns.buildState(raw.records, raw.sowItems || [], raw.bidPackages || []);
      ns._state = _state;
      _mdfIdfRecords = raw.mdfIdfRecords || [];

      if (CFG.debug) {
        SCW.debug('[BidReview] State built:',
          _state.sowGrids.length, 'SOW grids,',
          _state.allPackages.length, 'packages,',
          _mdfIdfRecords.length, 'MDF/IDF records');
      }

      var mount = ns.renderMatrix(_state);
      if (!mount) return;   // wrong scene — renderMatrix refused
      attachClickHandler(mount);

      // Rehydrate change request drafts from Knack field
      if (ns.changeRequests && ns.changeRequests.rehydrate) {
        ns.changeRequests.rehydrate(_state.sowGrids);
      }
    }).fail(function (err) {
      console.error('[BidReview] Pipeline failed:', err);
      ns.renderToast('Failed to load comparison data', 'error');
    });
  }

  /** Silent refresh — re-fetches data and re-renders without the loading spinner. */
  var _silentRefreshRunning = false;

  // Off-DOM cache of moved wsTrs — populated by refreshSilently right
  // before it rebuilds the bid-review mount, drained by injectWorksheetCard
  // when reopenExpandedRows fires. This is what makes panel state survive a
  // refresh: direct-edit PUTs don\'t re-render view_3921 (so a fresh wsTr
  // never gets built there), but the wsTr already in the expand cell has
  // the user\'s changes — we just need to keep it alive across the rebuild.
  var _preservedCards = {};

  // Set when refreshSilently() is called while another run is in
  // flight. After the in-flight run finishes, we fire one more pass
  // so the latest server state — the whole reason the caller asked
  // for a refresh — actually lands in the UI. Without this, the
  // common race during Copy-to-SOW (polling refresh in flight when
  // the webhook success handler also calls refreshSilently()) drops
  // the success-driven refresh entirely and the grid stays showing
  // pre-Make state.
  var _silentRefreshQueued = false;

  function refreshSilently() {
    // Same scene gate as runPipeline — late silent-refresh callbacks
    // arriving after the user has navigated away should be a no-op.
    var sceneKey = (window.Knack && Knack.router && Knack.router.current_scene_key) || '';
    if (sceneKey && sceneKey !== CFG.sceneKey) {
      return $.Deferred().resolve().promise();
    }

    if (_silentRefreshRunning) {
      _silentRefreshQueued = true;
      return $.Deferred().resolve().promise();
    }
    _silentRefreshRunning = true;

    // Pluck every injected wsTr off the DOM and into the preserve cache
    // BEFORE renderMatrix wipes the mount. Detaching is enough — the
    // node stays in memory as long as we hold a reference.
    var ids = Object.keys(_expandedSowItems);
    for (var p = 0; p < ids.length; p++) {
      var pid = ids[p];
      var existing = document.querySelector(
        '.scw-bid-review__expand-row[data-expand-for="' + pid + '"] tr.scw-ws-row[id="' + pid + '"]'
      );
      if (existing) {
        existing.parentNode.removeChild(existing);
        _preservedCards[pid] = existing;
      }
    }

    return ns.loadRawData().then(function (raw) {
      _state = ns.buildState(raw.records, raw.sowItems || [], raw.bidPackages || []);
      ns._state = _state;
      _mdfIdfRecords = raw.mdfIdfRecords || [];
      var mount = ns.renderMatrix(_state);
      if (!mount) return;   // wrong scene — renderMatrix refused
      attachClickHandler(mount);
      reopenExpandedRows();
    }).fail(function (err) {
      if (CFG.debug) console.warn('[BidReview] Silent refresh failed:', err);
    }).always(function () {
      _silentRefreshRunning = false;
      // Drain a queued follow-up. Done after clearing the running
      // flag so the queued call actually proceeds. Only one queued
      // pass is kept (re-queuing during the follow-up resets the
      // flag again, so callers piling on still converge).
      if (_silentRefreshQueued) {
        _silentRefreshQueued = false;
        refreshSilently();
      }
    });
  }

  function reopenExpandedRows() {
    var ids = Object.keys(_expandedSowItems);
    for (var i = 0; i < ids.length; i++) {
      var sowItemId = ids[i];
      var tr = document.querySelector(
        '.scw-bid-review__row[data-sow-item-id="' + sowItemId + '"]'
      );
      if (tr && tr.getAttribute('aria-expanded') !== 'true') {
        toggleRowExpand(tr);
      }
    }
    // Anything left in the cache had no destination row — drop it so
    // we don\'t leak DOM across rebuilds.
    _preservedCards = {};
  }

  // ── find a SOW grid from the current state ──────────────────

  function findSowGrid(sowId) {
    if (!_state) return null;
    for (var i = 0; i < _state.sowGrids.length; i++) {
      if (_state.sowGrids[i].sowId === sowId) return _state.sowGrids[i];
    }
    return null;
  }

  // Project record id — scene_1155 is reached via a nested nav path
  // (#team-calendar/project-dashboard/<projectId>/review-bids/<projectId>).
  // Pull the id that follows project-dashboard, falling back to the first
  // 24-hex id in the hash.
  function getProjectId() {
    var hash = (window.location.hash || '');
    var m = hash.match(/project-dashboard\/([a-f0-9]{24})/i);
    if (m) return m[1];
    m = hash.match(/[a-f0-9]{24}/i);
    return m ? m[0] : '';
  }

  // ── delegated click handler ─────────────────────────────────

  function attachClickHandler(mount) {
    if (!mount || mount.getAttribute(INIT_FLAG)) return;
    mount.setAttribute(INIT_FLAG, '1');

    // Close overflow menus on any click outside
    document.addEventListener('click', function () {
      var open = document.querySelectorAll('.scw-bid-review__overflow--open');
      for (var i = 0; i < open.length; i++) open[i].classList.remove('scw-bid-review__overflow--open');
    });

    mount.addEventListener('click', function (e) {
      // Panel close — × button or any click on the header bar. Look up
      // the live row through the DOM (the expand-row's previous sibling)
      // rather than a captured closure, so close still works after a
      // silent refresh has replaced the original rowTr.
      if (e.target.closest('.scw-bid-review__panel-close')
          || e.target.closest('.scw-bid-review__panel-header')) {
        var openExpand = e.target.closest('.scw-bid-review__expand-row');
        var liveRow = openExpand && openExpand.previousElementSibling;
        if (liveRow && liveRow.classList.contains('scw-bid-review__row')) {
          e.preventDefault();
          e.stopPropagation();
          toggleRowExpand(liveRow);
        }
        return;
      }

      // Expandable row toggle (must run before button-action match so the
      // row click only fires when nothing more specific intercepted it).
      var rowTrigger = e.target.closest('.scw-bid-review__row--expandable');
      if (rowTrigger
        && !e.target.closest('[data-action]')
        && !e.target.closest('.scw-bid-review__btn')
        && !e.target.closest('.scw-bid-review__overflow')
        && !e.target.closest('.scw-bid-review__overflow-item')
        && !e.target.closest('.scw-bid-review__cell-action')
        && !e.target.closest('.scw-bid-review__inline-add-btn')
        && !e.target.closest('a')
        && !e.target.closest('input')) {
        toggleRowExpand(rowTrigger);
        return;
      }

      // Match buttons, clickable cards, or overflow menu items
      var button = e.target.closest('.scw-bid-review__btn')
        || e.target.closest('.scw-bid-cr-card[data-action]')
        || e.target.closest('.scw-bid-review__overflow-item[data-action]')
        || e.target.closest('.scw-bid-review__cell-action[data-action]')
        || e.target.closest('.scw-bid-review__inline-add-btn[data-action]')
        || e.target.closest('.scw-ops-margin-warning__btn[data-action]')
        || e.target.closest('.scw-bid-review__docs-link-btn[data-action]')
        || e.target.closest('.scw-bid-review__docs-unlink-btn[data-action]')
        || e.target.closest('.scw-bid-review__docs-chip[data-action]')
        || e.target.closest('.scw-bid-review__docs-other-toggle[data-action]');
      if (!button) return;

      // Close overflow menu after picking an item
      var overflow = button.closest('.scw-bid-review__overflow');
      if (overflow) overflow.classList.remove('scw-bid-review__overflow--open');

      var action = button.getAttribute('data-action');
      if (!action) return;

      if (button.classList.contains('scw-bid-review__btn--busy')) return;

      if (action === 'cell_request_change') {
        handleChangeRequest(button);
      } else if (action === 'cell_request_change_from_sow') {
        handleChangeRequest(button, { sourceFromSow: true });
      } else if (action === 'cell_remove_from_bid') {
        handleRemoveFromBid(button);
      } else if (action === 'cell_disconnect_from_sow') {
        handleDisconnectFromSow(button);
      } else if (action === 'cell_add_to_bid') {
        handleAddToBid(button);
      } else if (action === 'cr_submit') {
        var pkgId = button.getAttribute('data-pkg-id');
        if (ns.changeRequests && ns.changeRequests.submitForPackage) {
          ns.changeRequests.submitForPackage(pkgId);
        }
      } else if (action === 'cr_clear_all') {
        if (ns.changeRequests && ns.changeRequests.clear) {
          if (window.confirm('Clear all pending change requests?')) {
            ns.changeRequests.clear();
          }
        }
      } else if (action === 'create_new_sow') {
        handleCreateNewSow(button);
      } else if (action === 'add_pm_mobilization') {
        handleAddPmMobilization(button);
      } else if (action === 'doc_link_to_sow') {
        handleDocLinkToSow(button);
      } else if (action === 'doc_unlink_from_sow') {
        handleDocUnlinkFromSow(button);
      } else if (action === 'doc_filter') {
        handleDocFilter(button);
      } else if (action === 'docs_toggle_other') {
        var section = button.closest('.scw-bid-review__docs-other');
        if (section) {
          var c = section.getAttribute('data-collapsed') === '1';
          section.setAttribute('data-collapsed', c ? '0' : '1');
        }
      } else if (action === 'set_project_margin') {
        handleSetProjectMargin(button);
      } else if (action === 'package_reopen_bid') {
        handleReopenBid(button);
      } else if (action === 'package_create_sow') {
        handleCreateNewSowForPackage(button);
      } else if (action.indexOf('package_') === 0) {
        handlePackageAction(button, action);
      } else if (action.indexOf('row_') === 0) {
        handleRowAction(button, action);
      }
    });

    // Survey Costs input — save on blur. Lives on the SOW status bar
    // (one input per SOW), writes back to the SOW record via Knack's
    // records API. data-sow-id and data-field carry the target.
    mount.addEventListener('change', function (e) {
      var costsInput = e.target.closest('.scw-bid-review__sow-metric-input[data-action="sow_survey_costs"]');
      if (costsInput) { handleSurveyCostsSave(costsInput); return; }
      // SOW Name input — sibling save path that PUTs raw text instead
      // of stripping to a number, then echoes the new name into the
      // section header so the visible title stays in sync.
      var nameInput = e.target.closest('.scw-bid-review__sow-name-input[data-action="sow_name_update"]');
      if (nameInput) handleSowNameSave(nameInput);
    }, true);
  }

  // ── Expandable row → inject view_3921 worksheet card ─────────
  // When a user clicks a sowItem row, find the matching wsTr that
  // device-worksheet rendered in view_3921's tbody (id === sowItemId)
  // and move it into a child tr under the bid review row.
  //
  // We move (not clone) so Knack's inline-edit handlers keep their
  // model + record-id wiring. On view_3921 re-renders, device-worksheet
  // rebuilds the wsTr fresh — the listener at the bottom of this
  // section re-injects it for any rows still in the expanded set.

  var _expandedSowItems = Object.create(null);

  // Expand layout
  // -------------
  // When a row is opened, the original <tr> is hidden (via CSS rule
  // keyed on aria-expanded="true") and replaced visually by a panel
  // that takes its place. The panel has three columns:
  //
  //   [photo viewer slot] [worksheet card] [bid details]
  //
  // The photo-viewer column is present but empty/hidden until
  // openWithPhoto() populates it. Bid details is built from clones of
  // the data row's bid-package cells + actions cell, so all the data
  // and action attrs come over and the delegated click handler keeps
  // working on the clones.
  function toggleRowExpand(tr) {
    var sowItemId = tr.getAttribute('data-sow-item-id');
    if (!sowItemId) return;

    var expandTr = tr.nextElementSibling;
    var alreadyHasExpand = expandTr && expandTr.classList.contains('scw-bid-review__expand-row')
      && expandTr.getAttribute('data-expand-for') === sowItemId;

    if (alreadyHasExpand && expandTr.classList.contains('scw-bid-review__expand-row--open')) {
      // Commit any in-flight inline edit before collapsing — clicking
      // close doesn't blur the focused input on its own, so without
      // this the user's typing never reaches the save path.
      var focused = expandTr.querySelector(':focus');
      if (focused && typeof focused.blur === 'function') focused.blur();
      // Park the wsTr back in view_3921's tbody so the next reopen can
      // find it. Otherwise it lives inside the closed expand-row, gets
      // wiped on the next silent refresh, and reopening shows
      // "Loading editor…" forever (view_3921 never re-renders to
      // recreate the wsTr because direct-edit PUTs bypass it).
      var wsTr = expandTr.querySelector('tr.scw-ws-row[id="' + sowItemId + '"]');
      if (wsTr) {
        var sowView = document.getElementById(CFG.sowItemsViewKey);
        var sowTbody = sowView ? sowView.querySelector('table.kn-table-table tbody') : null;
        if (sowTbody) sowTbody.appendChild(wsTr);
      }
      expandTr.classList.remove('scw-bid-review__expand-row--open');
      tr.setAttribute('aria-expanded', 'false');
      delete _expandedSowItems[sowItemId];
      return;
    }

    if (!alreadyHasExpand) {
      expandTr = document.createElement('tr');
      expandTr.className = 'scw-bid-review__expand-row';
      expandTr.setAttribute('data-expand-for', sowItemId);
      var td = document.createElement('td');
      td.className = 'scw-bid-review__expand-cell';
      td.setAttribute('colspan', String(tr.children.length));
      expandTr.appendChild(td);
      tr.parentNode.insertBefore(expandTr, tr.nextSibling);
    }

    expandTr.classList.add('scw-bid-review__expand-row--open');
    tr.setAttribute('aria-expanded', 'true');
    _expandedSowItems[sowItemId] = true;
    buildExpandPanel(tr, expandTr.firstElementChild, sowItemId);

    // If the row has photos, mount the side-by-side viewer too so the
    // reviewer doesn't have to click the thumb separately.
    if (ns.scrapeRowPhotoUrls) {
      // scrapeRowPhotoUrls keys on the wsTr's id attribute, which is
      // the SOW item id (the original Knack record id from view_3921)
      // — NOT the bid record id we put in data-row-id. Use
      // data-sow-item-id for the lookup, matching how
      // buildPhotosCell(row.sowItem) feeds the same function at
      // cell-build time. Falls back to data-row-id for any synthetic
      // rows that happen to share the same id space (no-bid /
      // surveyed-no-bid rows where row.id === row.sowItem).
      var rowId = tr.getAttribute('data-sow-item-id') || tr.getAttribute('data-row-id');
      var urls = rowId ? ns.scrapeRowPhotoUrls(rowId) : null;
      if (urls && urls.length) openWithPhoto(tr, urls, 0);
    }
  }

  // Build the 3-column panel inside the expand cell. Idempotent —
  // safe to call again after silent refresh.
  function buildExpandPanel(rowTr, hostTd, sowItemId) {
    if (!hostTd) return;

    hostTd.innerHTML = '';

    var panel = document.createElement('div');
    panel.className = 'scw-bid-review__panel';

    panel.appendChild(buildPanelHeader(rowTr));

    var layout = document.createElement('div');
    layout.className = 'scw-bid-review__panel-cols';

    // Photo viewer column — left. Empty/hidden until openWithPhoto fills it.
    var photoCol = document.createElement('div');
    photoCol.className = 'scw-bid-review__panel-col scw-bid-review__panel-col--photo';
    layout.appendChild(photoCol);

    // Worksheet card column — middle. Hosts the wsTr from view_3921.
    var wsCol = document.createElement('div');
    wsCol.className = 'scw-bid-review__panel-col scw-bid-review__panel-col--worksheet';
    layout.appendChild(wsCol);

    // Bid details column — right. Cloned per-package cells + actions cell.
    var bidCol = buildBidDetailsColumn(rowTr);
    layout.appendChild(bidCol);

    panel.appendChild(layout);
    hostTd.appendChild(panel);

    injectWorksheetCard(sowItemId, wsCol);

    // The worksheet card carries Knack's native row delete link, but
    // scene_1155 has no delete route wired for view_3921 — so clicking it
    // just routed the user to the home page and deleted nothing. Replace
    // it with a real, API-backed delete of the SOW line item record.
    rewirePanelDeleteLink(wsCol, rowTr, sowItemId);

    // Force the worksheet detail panel open so users see the full editor,
    // not just the summary header.
    var toggleZone = wsCol.querySelector('.scw-ws-toggle-zone');
    var detail = wsCol.querySelector('.scw-ws-detail');
    if (toggleZone && detail && !detail.classList.contains('scw-ws-open')) {
      toggleZone.click();
    }
  }

  function rewirePanelDeleteLink(wsCol, rowTr, sowItemId) {
    if (!wsCol || !rowTr) return;
    var delLink = wsCol.querySelector('.scw-ws-sum-delete a, a.kn-link-delete');
    if (!delLink) return;

    // Replace the node to drop Knack's own navigation handlers.
    var newLink = delLink.cloneNode(true);
    newLink.removeAttribute('href');
    newLink.setAttribute('title', 'Delete this line item');
    delLink.parentNode.replaceChild(newLink, delLink);

    newLink.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!sowItemId || newLink.getAttribute('data-busy')) return;

      var lblEl = rowTr.querySelector('.scw-bid-review__row-label');
      var itemName = (lblEl && (lblEl.textContent || '').trim()) || 'this line item';

      if (!window.confirm(
        'Delete ' + itemName + '?\n\n' +
        'This permanently deletes the line item record. If it is connected ' +
        'to more than one SOW it will be removed from all of them.'
      )) return;

      newLink.setAttribute('data-busy', '1');
      newLink.style.pointerEvents = 'none';

      SCW.knackAjax({
        url:  SCW.knackRecordUrl(CFG.sowItemsViewKey, sowItemId),
        type: 'DELETE',
        success: function () {
          ns.renderToast('Line item deleted', 'success');
          var v = Knack && Knack.views && Knack.views[CFG.sowItemsViewKey];
          if (v && v.model && typeof v.model.fetch === 'function') {
            v.model.fetch().always(function () { if (ns.refresh) ns.refresh(); });
          } else if (ns.refresh) {
            ns.refresh();
          }
        },
        error: function (xhr) {
          newLink.removeAttribute('data-busy');
          newLink.style.pointerEvents = '';
          if (CFG.debug) console.warn('[BidReview] Delete line item failed:', xhr && xhr.status, xhr && xhr.responseText);
          ns.renderToast('Delete failed — please try again', 'error');
        }
      });
    });
  }

  function buildPanelHeader(rowTr) {
    var header = document.createElement('div');
    header.className = 'scw-bid-review__panel-header';

    var title = document.createElement('div');
    title.className = 'scw-bid-review__panel-title';

    // [LABEL] [PRODUCT NAME] [Equip $X] [Install $Y]
    // Read each piece from the (now hidden) data row.
    var labelCell = rowTr.children[0];
    var sowCell   = rowTr.children[2];

    function readText(scope, sel) {
      if (!scope) return '';
      var el = scope.querySelector(sel);
      return el ? (el.textContent || '').trim() : '';
    }

    var label   = readText(labelCell, '.scw-bid-review__row-label');
    var product = readText(sowCell,   '.scw-bid-review__cell-label');
    var equip   = readText(labelCell, '.scw-bid-review__row-total--equip .scw-bid-review__row-total-value');
    var install = readText(labelCell, '.scw-bid-review__row-total--install .scw-bid-review__row-total-value');

    function chip(cls, text) {
      var s = document.createElement('span');
      s.className = 'scw-bid-review__panel-title-' + cls;
      s.textContent = text;
      return s;
    }

    if (label)   title.appendChild(chip('label',   label));
    if (product) title.appendChild(chip('product', product));
    if (equip)   title.appendChild(chip('equip',   'Equip: ' + equip));
    if (install) title.appendChild(chip('install', 'Install: ' + install));
    header.appendChild(title);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'scw-bid-review__panel-close';
    close.setAttribute('title', 'Close');
    close.textContent = '×';
    header.appendChild(close);

    // Clicks on the header bar / × are wired via the delegated mount
    // handler in attachClickHandler so they survive silent refreshes
    // that detach the original rowTr reference.
    header.style.cursor = 'pointer';
    header.setAttribute('title', 'Click to close');

    return header;
  }

  // Right-side column. Each bid-package cell + the row-actions cell
  // are cloned out of the (now-hidden) data row and stacked vertically.
  // Delegated click handlers on the table mount keep working on the
  // clones because they're selector-based (clones carry the same
  // classes + data-* attrs).
  function buildBidDetailsColumn(rowTr) {
    var col = document.createElement('div');
    col.className = 'scw-bid-review__panel-col scw-bid-review__panel-col--bid';

    // Read column labels from thead, mapped by column index.
    var labels = [];
    var table = rowTr.closest('table');
    if (table) {
      var ths = table.querySelectorAll('thead th');
      for (var t = 0; t < ths.length; t++) {
        labels.push((ths[t].textContent || '').replace(/\s+/g, ' ').trim());
      }
    }

    // Skip cell index 0 (label — shown in header), 1 (photos — own
    // column), 2 (SOW detail — shown in worksheet card). Everything
    // from index 3 onward is bid packages + actions.
    var cells = rowTr.children;
    for (var i = 3; i < cells.length; i++) {
      var card = document.createElement('div');
      card.className = 'scw-bid-review__bid-card';
      if (labels[i]) {
        var lbl = document.createElement('div');
        lbl.className = 'scw-bid-review__bid-card-label';
        lbl.textContent = labels[i];
        card.appendChild(lbl);
      }
      var body = document.createElement('div');
      body.className = 'scw-bid-review__bid-card-body';
      // Move the cell's children into a div. We can't transplant the
      // <td> itself (it'd lose its meaning) and we want the original
      // <td> to remain on the hidden row so subsequent re-renders
      // (silent refresh, change-request updates) still write to it.
      // Clone preserves attrs + handlers attached by delegation.
      var clone = cells[i].cloneNode(true);
      // Move clone's children into body; throw away the wrapping <td>
      while (clone.firstChild) body.appendChild(clone.firstChild);
      card.appendChild(body);
      col.appendChild(card);
    }
    return col;
  }

  // Open the row's expand panel AND mount a side-by-side photo
  // viewer in the panel's left column. Thumbnail strip lets the
  // reviewer flip between photos without leaving the editor.
  function openWithPhoto(rowTr, urls, activeIdx) {
    if (!rowTr || !urls || !urls.length) return;
    if (activeIdx == null || activeIdx < 0 || activeIdx >= urls.length) activeIdx = 0;

    if (rowTr.getAttribute('aria-expanded') !== 'true') {
      toggleRowExpand(rowTr);
    }

    var expandTr = rowTr.nextElementSibling;
    if (!expandTr || !expandTr.classList.contains('scw-bid-review__expand-row')) return;
    var photoCol = expandTr.querySelector('.scw-bid-review__panel-col--photo');
    if (!photoCol) return;

    var existing = photoCol.querySelector('.scw-bid-review__photo-viewer');
    if (existing) {
      updatePhotoViewer(existing, urls, activeIdx);
      return;
    }

    photoCol.classList.add('scw-bid-review__panel-col--photo-active');
    photoCol.appendChild(buildPhotoViewer(urls, activeIdx));
  }

  function buildPhotoViewer(urls, activeIdx) {
    var wrap = document.createElement('div');
    wrap.className = 'scw-bid-review__photo-viewer';

    var stage = document.createElement('div');
    stage.className = 'scw-bid-review__photo-viewer-stage';
    stage.setAttribute('title', 'Click photo to zoom');

    var openLink = document.createElement('a');
    openLink.className = 'scw-bid-review__photo-viewer-open';
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    openLink.title = 'Open full size in a new tab';
    openLink.textContent = 'Open ↗';
    // Don't trigger zoom when the user means "open in new tab".
    openLink.addEventListener('click', function (e) { e.stopPropagation(); });
    stage.appendChild(openLink);

    var img = document.createElement('img');
    img.alt = '';
    stage.appendChild(img);

    // Click the image to enlarge it in a fullscreen lightbox. Doesn't
    // close anything in the panel — just shows the picture big.
    stage.addEventListener('click', function (e) {
      if (e.target.closest('.scw-bid-review__photo-viewer-open')) return;
      openLightbox(img.src);
    });
    wrap.appendChild(stage);

    var strip = document.createElement('div');
    strip.className = 'scw-bid-review__photo-viewer-strip';
    wrap.appendChild(strip);

    updatePhotoViewer(wrap, urls, activeIdx);
    return wrap;
  }

  // Fullscreen image overlay for "zoom in on the photo". Click
  // anywhere on the dimmed backdrop or press Escape to dismiss.
  function openLightbox(url) {
    if (!url) return;
    var overlay = document.createElement('div');
    overlay.className = 'scw-bid-review__lightbox';
    var img = document.createElement('img');
    img.src = url;
    img.alt = '';
    overlay.appendChild(img);

    function dismiss() {
      overlay.parentNode && overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') dismiss(); }

    overlay.addEventListener('click', dismiss);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  }

  function updatePhotoViewer(viewer, urls, activeIdx) {
    var stageImg  = viewer.querySelector('.scw-bid-review__photo-viewer-stage img');
    var openLink  = viewer.querySelector('.scw-bid-review__photo-viewer-open');
    var strip     = viewer.querySelector('.scw-bid-review__photo-viewer-strip');
    if (stageImg) stageImg.src = urls[activeIdx];
    if (openLink) openLink.href = urls[activeIdx];

    if (!strip) return;
    strip.innerHTML = '';
    // Strip only matters when there are multiple photos to flip between
    if (urls.length < 2) { strip.style.display = 'none'; return; }
    strip.style.display = '';
    for (var i = 0; i < urls.length; i++) {
      (function (idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'scw-bid-review__photo-viewer-thumb' +
          (idx === activeIdx ? ' scw-bid-review__photo-viewer-thumb--active' : '');
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          updatePhotoViewer(viewer, urls, idx);
        });
        var img = document.createElement('img');
        img.src = urls[idx];
        img.alt = '';
        img.loading = 'lazy';
        btn.appendChild(img);
        strip.appendChild(btn);
      })(i);
    }
  }

  function injectWorksheetCard(sowItemId, hostTd) {
    if (!hostTd) return;
    // Already has a card from a previous expand — leave it. The view_3921
    // re-render listener handles refresh after edits.
    if (hostTd.querySelector('tr.scw-ws-row[id="' + sowItemId + '"]')) return;
    // Prefer a wsTr we detached just before the silent refresh — that
    // preserves the user\'s in-flight edits across the rebuild even when
    // view_3921 didn\'t re-render (direct-edit PUTs bypass it).
    var wsTr = _preservedCards[sowItemId];
    if (wsTr) {
      delete _preservedCards[sowItemId];
    } else {
      // device-worksheet renders wsTr inside view_3921's tbody with id=recordId
      wsTr = document.querySelector(
        '#' + CFG.sowItemsViewKey + ' tr.scw-ws-row[id="' + sowItemId + '"]'
      );
    }
    if (!wsTr) {
      // wsTr was missing from both preserve cache and view_3921 — likely a
      // race between Knack tearing down the view\'s tbody and device-
      // worksheet rebuilding the wsTrs. Retry by polling for up to ~3s.
      hostTd.innerHTML = '<div class="scw-bid-review__expand-loading">Loading editor…</div>';
      var attempts = 0;
      var poll = setInterval(function () {
        attempts++;
        var found = document.querySelector(
          '#' + CFG.sowItemsViewKey + ' tr.scw-ws-row[id="' + sowItemId + '"]'
        );
        if (found) {
          clearInterval(poll);
          // Re-run inject so the move + display:none strip happens too.
          injectWorksheetCard(sowItemId, hostTd);
        } else if (attempts >= 30) {
          clearInterval(poll);
          // Last-ditch: kick view_3921 to re-fetch + re-render so
          // device-worksheet rebuilds the wsTr.
          var v = Knack.views && Knack.views[CFG.sowItemsViewKey];
          if (v && v.model && typeof v.model.fetch === 'function') {
            v.model.fetch();
          }
        }
      }, 100);
      return;
    }
    // Move the entire wsTr into our cell. Wrap in a mini-table so the row
    // renders correctly outside its original tbody.
    // group-collapse hides rows in collapsed L1 groups via inline display:none;
    // strip that so the moved card is always visible.
    wsTr.style.display = '';
    hostTd.innerHTML = '';
    var miniTable = document.createElement('table');
    miniTable.className = 'scw-bid-review__expand-table';
    var miniTbody = document.createElement('tbody');
    miniTbody.appendChild(wsTr);
    miniTable.appendChild(miniTbody);
    hostTd.appendChild(miniTable);
  }

  // After ANY edit on the SOW item (direct-edit save, Knack inline-edit,
  // chip toggle, etc.), run a silent refresh of the bid-review grid so
  // cached totals like field_2028 / field_2269 in the SOW column reflect
  // the new values. refreshSilently() rebuilds the grid then reopens
  // whichever rows were expanded, re-pulling their (now-rebuilt) wsTr
  // in the process.
  //   - scw-record-saved             → fired by device-worksheet after
  //                                    every direct-edit AJAX PUT (bypasses
  //                                    knack-view-render entirely).
  //   - knack-view-render.view_3921  → fires on full view re-render
  //   - knack-cell-update.view_3921  → fires per-cell after Knack inline-edit
  // Single-row patch state.
  //
  // _pendingPatchIds collects recordIds known to have changed during
  // the current debounce window. _needsFullRefresh is set when we
  // receive an event with no recordId (knack-view-render etc.) —
  // those are "something changed but I don't know what", so we fall
  // back to a full pipeline.
  //
  // When the debounce fires:
  //   - If _needsFullRefresh OR any pending id isn't in current state,
  //     run the full pipeline (refreshSilently).
  //   - Otherwise, patch each row's <tr> in place.
  var _refreshDebounce      = null;
  var _pendingPatchIds      = Object.create(null);
  var _needsFullRefresh     = false;

  function scheduleSilentRefresh(opts) {
    var rid = opts && opts.recordId;
    if (rid) {
      _pendingPatchIds[rid] = true;
    } else {
      _needsFullRefresh = true;
    }
    if (_refreshDebounce) clearTimeout(_refreshDebounce);
    // 700ms gives every event in a single user action (scw-record-saved
    // + knack-cell-update + knack-view-render — typically all fire
    // within ~150ms of each other after a chip toggle / inline edit)
    // a chance to coalesce into one refresh.
    _refreshDebounce = setTimeout(applyPendingRefresh, 700);
  }

  function applyPendingRefresh() {
    var ids = Object.keys(_pendingPatchIds);
    _pendingPatchIds = Object.create(null);
    var fullRefresh = _needsFullRefresh;
    _needsFullRefresh = false;

    if (fullRefresh || !ids.length || !_state) {
      refreshSilently();
      return;
    }
    var ok = patchRows(ids);
    if (!ok) {
      // patch path bailed (unknown row, missing data, etc.) — fall
      // back to the full pipeline so the grid still ends up correct.
      refreshSilently();
    }
  }

  // Patch one or more rows in place. Returns false if any row isn't
  // representable as a single-row update (new record, deletion, MDF/IDF
  // group change, etc.); caller falls back to a full refresh.
  //
  // Strategy:
  //   1. Refetch all 4 source views from the Knack model in-memory
  //      (fast, no API). buildState gives us the fresh row data.
  //   2. For each pending id, locate the row in new state AND the
  //      old <tr> in the DOM. Bail if anything is missing.
  //   3. Build a fresh <tr> with ns.buildDataRow and swap it in.
  //   4. Update SOW header totals (Install / Sub Bid) — they depend
  //      on the whole grid, so we recompute and re-write just those
  //      cells without rebuilding the rest of the table.
  function patchRows(recordIds) {
    var oldExpanded = Object.assign({}, _expandedSowItems);
    var raw;
    try {
      // ns.loadRawData() is async — but the data already lives in the
      // Knack model on the page. We still need the promise interface;
      // just run it synchronously enough to keep the patch fast.
    } catch (e) { return false; }

    // loadRawData is a $.Deferred; resolve, then patch synchronously.
    var loadPromise = ns.loadRawData();
    if (!loadPromise || typeof loadPromise.then !== 'function') return false;

    loadPromise.then(function (rawData) {
      var newState = ns.buildState(rawData.records, rawData.sowItems || [], rawData.bidPackages || []);
      var allOk = true;

      for (var i = 0; i < recordIds.length; i++) {
        var rid = recordIds[i];
        var oldLoc = locateRowInState(_state, rid);
        var newLoc = locateRowInState(newState, rid);

        // Row was added or removed — structural change, full refresh.
        if (!oldLoc || !newLoc) { allOk = false; break; }
        // MDF/IDF group changed — row moved between groups. Full refresh.
        if (oldLoc.grid.sowId !== newLoc.grid.sowId
          || oldLoc.row.mdfIdfLabel !== newLoc.row.mdfIdfLabel) {
          allOk = false; break;
        }

        var oldTr = findRowTr(rid);
        if (!oldTr) { allOk = false; break; }

        var newTr = ns.buildDataRow(newLoc.row, newLoc.grid.packages, newLoc.grid.sowId);
        // Preserve the aria-expanded state so an open panel stays open
        // visually while we swap.
        if (oldTr.getAttribute('aria-expanded') === 'true') {
          newTr.setAttribute('aria-expanded', 'true');
        }
        oldTr.parentNode.replaceChild(newTr, oldTr);
      }

      if (!allOk) {
        refreshSilently();
        return;
      }

      // Patches landed — commit the new state and refresh header totals.
      _state = newState;
      ns._state = _state;
      updateSowHeaderTotals(newState);

      // Keep expanded panels in sync — buildDataRow built a collapsed
      // <tr>, so if a row was open we need to reopen the panel beneath
      // it. _expandedSowItems is unchanged across the patch.
      Object.keys(oldExpanded).forEach(function (sid) {
        var tr = document.querySelector(
          '.scw-bid-review__row--expandable[data-sow-item-id="' + sid + '"]'
        );
        if (tr && tr.getAttribute('aria-expanded') !== 'true') {
          // Trigger expand by clicking through toggleRowExpand
          toggleRowExpand(tr);
        }
      });
    }).fail(function () {
      refreshSilently();
    });

    return true;
  }

  function locateRowInState(state, recordId) {
    if (!state || !state.sowGrids) return null;
    for (var gi = 0; gi < state.sowGrids.length; gi++) {
      var grid = state.sowGrids[gi];
      for (var ri = 0; ri < grid.rows.length; ri++) {
        var r = grid.rows[ri];
        if (r.id === recordId || r.sowItem === recordId) {
          return { grid: grid, row: r, gridIdx: gi, rowIdx: ri };
        }
      }
    }
    return null;
  }

  function findRowTr(recordId) {
    return document.querySelector(
      '.scw-bid-review__row[data-row-id="' + recordId + '"], ' +
      '.scw-bid-review__row[data-sow-item-id="' + recordId + '"]'
    );
  }

  // Recompute and re-write just the SOW header totals (Install Total
  // / Sub Bid Total) without rebuilding the rest of the table. Reads
  // the same projections renderMatrix uses.
  function updateSowHeaderTotals(state) {
    if (!state || !state.sowGrids || !ns.refreshHeaderTotals) return;
    // Delegate to render.js so the partial refresh recomputes values,
    // per-bid deltas, and the SOW gap flag with the exact same logic as
    // the full render (and writes each total to its correct slot).
    state.sowGrids.forEach(function (grid) {
      ns.refreshHeaderTotals(grid);
    });
  }

  // Wrap the handlers so jQuery event-arg-2 (the payload) reaches scheduleSilentRefresh.
  function onSavedEvent(_ev, payload) { scheduleSilentRefresh(payload); }

  $(document).on('scw-record-saved' + CFG.eventNs + 'Expand', onSavedEvent);
  $(document).on('knack-view-render.' + CFG.sowItemsViewKey + CFG.eventNs + 'Expand',
    function () { scheduleSilentRefresh(); });
  $(document).on('knack-cell-update.' + CFG.sowItemsViewKey + CFG.eventNs + 'Expand',
    function (_ev, _viewModel, record) {
      scheduleSilentRefresh(record && record.id ? { recordId: record.id } : null);
    });

  // ── Survey Costs save (per-SOW, on blur) ────────────────────

  function handleSowNameSave(input) {
    var sowId    = input.getAttribute('data-sow-id');
    var fieldKey = input.getAttribute('data-field');
    if (!sowId || !fieldKey) return;

    var newName = (input.value || '').trim();

    var writeView = CFG.surveyCostsWriteView || CFG.nextStepViewKey;
    if (!writeView || !SCW.knackRecordUrl) {
      console.warn('[BidReview] SOW Name save skipped — no write view configured');
      return;
    }

    input.classList.remove('scw-bid-review__sow-name-input--saved');
    input.classList.add('scw-bid-review__sow-name-input--saving');

    var payload = {};
    payload[fieldKey] = newName;

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(writeView, sowId),
      type: 'PUT',
      data: JSON.stringify(payload),
      success: function (resp) {
        input.classList.remove('scw-bid-review__sow-name-input--saving');
        input.classList.add('scw-bid-review__sow-name-input--saved');
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(writeView, sowId, resp, fieldKey, newName);
        }
        // Echo the new name into the matching SOW section's collapsible
        // title so the header stays in sync without a full re-render.
        var section = input.closest('.scw-bid-review__sow-section');
        var titleText = section && section.querySelector('.scw-bid-review__sow-title-text');
        if (titleText) titleText.textContent = newName;
        // Refresh view_3325 / view_3918 so any other readers update.
        try {
          var v = Knack && Knack.views && Knack.views[CFG.nextStepViewKey];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
        } catch (e2) { /* ignore */ }
      },
      error: function (xhr) {
        input.classList.remove('scw-bid-review__sow-name-input--saving');
        if (CFG.debug) console.warn('[BidReview] SOW Name save failed:', xhr && xhr.status, xhr && xhr.responseText);
        ns.renderToast('SOW Name save failed', 'error');
      }
    });
  }

  function handleSurveyCostsSave(input) {
    var sowId    = input.getAttribute('data-sow-id');
    var fieldKey = input.getAttribute('data-field');
    if (!sowId || !fieldKey) return;

    var raw    = (input.value || '').trim();
    var numStr = raw.replace(/[^0-9.\-]/g, '');
    var num    = numStr === '' ? null : parseFloat(numStr);
    if (num !== null && !isFinite(num)) return;

    var writeView = CFG.surveyCostsWriteView || CFG.nextStepViewKey;
    if (!writeView || !SCW.knackRecordUrl) {
      console.warn('[BidReview] Survey Costs save skipped — no write view configured');
      return;
    }

    input.classList.remove('scw-bid-review__sow-metric-input--saved');
    input.classList.add('scw-bid-review__sow-metric-input--saving');

    var payload = {};
    payload[fieldKey] = (num === null ? '' : num);

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(writeView, sowId),
      type: 'PUT',
      data: JSON.stringify(payload),
      success: function (resp) {
        input.classList.remove('scw-bid-review__sow-metric-input--saving');
        input.classList.add('scw-bid-review__sow-metric-input--saved');
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(writeView, sowId, resp, fieldKey, payload[fieldKey]);
        }
        // Refresh view_3325 so the next-step block + margin update.
        try {
          var v = Knack && Knack.views && Knack.views[CFG.nextStepViewKey];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
        } catch (e2) { /* ignore */ }
      },
      error: function (xhr) {
        input.classList.remove('scw-bid-review__sow-metric-input--saving');
        if (CFG.debug) console.warn('[BidReview] Survey Costs save failed:', xhr && xhr.status, xhr && xhr.responseText);
        ns.renderToast('Survey Costs save failed', 'error');
      }
    });
  }

  // ── Link an existing project DOC_file to this SOW ──
  //
  // The "+ Link" button on the SOW header's "Available from project"
  // section PUTs the DOC_files record's field_2143 (SOW connection)
  // with the existing connection ids + this SOW id. After save, the
  // doc disappears from "Available" and shows up under "linked" on
  // the next pipeline pass (init.js's refresh-on-edit listener
  // rebuilds the matrix after view_3926 re-renders).
  function handleDocLinkToSow(button) {
    var docId   = button.getAttribute('data-doc-id');
    var sowId   = button.getAttribute('data-sow-id');
    var current = (button.getAttribute('data-current-sows') || '')
                    .split(',').filter(Boolean);
    if (!docId || !sowId) return;
    if (current.indexOf(sowId) !== -1) return; // already linked

    var writeView = CFG.docFilesViewKey;
    if (!writeView || !SCW.knackRecordUrl) {
      ns.renderToast('Link skipped — doc files view not configured', 'error');
      return;
    }

    setBusy(button, true);

    var nextSows = current.concat([sowId]);
    var payload  = {};
    payload['field_2143'] = nextSows;

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(writeView, docId),
      type: 'PUT',
      data: JSON.stringify(payload),
      success: function () {
        ns.renderToast('Document linked to SOW', 'success');
        // Refresh view_3926 so the docs index rebuilds on the next
        // pipeline pass (event-binding in init re-runs renderMatrix
        // after a knack-view-render).
        try {
          var v = Knack && Knack.views && Knack.views[writeView];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
        } catch (e) { /* ignore */ }
      },
      error: function (xhr) {
        setBusy(button, false);
        if (CFG.debug) console.warn('[BidReview] Link doc → SOW failed:', xhr && xhr.status, xhr && xhr.responseText);
        var msg = 'Link failed';
        if (xhr && xhr.status === 403) {
          msg = 'Link failed — view_3926 must allow inline-edit on field_2143';
        }
        ns.renderToast(msg, 'error');
      }
    });
  }

  // ── Disconnect (NOT delete) a DOC_file from this SOW ──
  //
  // Removes this SOW id from the doc's field_2143 connection. The
  // DOC_files record itself stays — only the connection to this SOW
  // is severed. After save, the doc moves from "Linked" to
  // "Available from project" on the next pipeline pass.
  function handleDocUnlinkFromSow(button) {
    var docId   = button.getAttribute('data-doc-id');
    var sowId   = button.getAttribute('data-sow-id');
    var current = (button.getAttribute('data-current-sows') || '')
                    .split(',').filter(Boolean);
    if (!docId || !sowId) return;

    var nextSows = [];
    for (var i = 0; i < current.length; i++) {
      if (current[i] !== sowId) nextSows.push(current[i]);
    }
    if (nextSows.length === current.length) return; // wasn't linked

    var writeView = CFG.docFilesViewKey;
    if (!writeView || !SCW.knackRecordUrl) {
      ns.renderToast('Unlink skipped — doc files view not configured', 'error');
      return;
    }

    setBusy(button, true);

    var payload = {};
    payload['field_2143'] = nextSows;

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(writeView, docId),
      type: 'PUT',
      data: JSON.stringify(payload),
      success: function () {
        ns.renderToast('Document disconnected from SOW', 'success');
        try {
          var v = Knack && Knack.views && Knack.views[writeView];
          if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
        } catch (e) { /* ignore */ }
      },
      error: function (xhr) {
        setBusy(button, false);
        if (CFG.debug) console.warn('[BidReview] Unlink doc from SOW failed:', xhr && xhr.status, xhr && xhr.responseText);
        var msg = 'Unlink failed';
        if (xhr && xhr.status === 403) {
          msg = 'Unlink failed — view_3926 must allow inline-edit on field_2143';
        }
        ns.renderToast(msg, 'error');
      }
    });
  }

  // ── Doc-type filter chip click ──
  //
  // Sets data-filter on the panel and toggles the active chip class.
  // The actual show/hide of items is JS-driven (CSS attribute
  // selectors can't dynamically match arbitrary values).
  function handleDocFilter(button) {
    var panel = button.closest('.scw-bid-review__docs');
    if (!panel) return;
    var value = button.getAttribute('data-filter') || '__all__';

    var chips = panel.querySelectorAll('.scw-bid-review__docs-chip');
    for (var i = 0; i < chips.length; i++) {
      chips[i].classList.toggle('is-active', chips[i] === button);
    }
    panel.setAttribute('data-filter', value);

    var items = panel.querySelectorAll('.scw-bid-review__docs-item');
    for (var j = 0; j < items.length; j++) {
      var t = items[j].getAttribute('data-doc-type') || '__none__';
      var show = value === '__all__' || t === value;
      items[j].style.display = show ? '' : 'none';
    }
  }

  // ── Bump project margin (margin-low warning button) ──
  //
  // view_3923 is a FORM rendering field_2158 as an editable input.
  // Click flow: set the input via .val + change (so Knack\'s internal
  // model syncs), submit the form, reload the page once Knack fires
  // its update-record event (or after a 3s timeout fallback).
  var MARGIN_FORM_VIEW = 'view_3923';

  function handleSetProjectMargin(button) {
    var marginVal = parseFloat(button.getAttribute('data-margin-value'));
    var marginPct = button.getAttribute('data-margin-pct') || '';
    if (!isFinite(marginVal)) return;

    if (!window.confirm(
      'Bump project margin to ' + marginPct + '% on this SOW?'
    )) return;

    setBusy(button, true);

    // Knack inconsistently prefixes form-input ids with the view key.
    // For field_2158 on view_3923 the actual rendered id is plain
    // `field_2158` (no view prefix), while sibling selects DO get the
    // `view_3923-field_2159` form. Scope the lookup to the view
    // container and try every shape Knack might produce.
    var marginFieldKey = CFG.projectMarginField || 'field_2158';
    var $view = $('#' + MARGIN_FORM_VIEW);
    var $input = $view.find(
      '#' + MARGIN_FORM_VIEW + '-' + marginFieldKey + ',' +
      '#' + marginFieldKey + ',' +
      'input[name="' + marginFieldKey + '"]'
    ).first();
    if (!$view.length || !$input.length) {
      console.warn('[BidReview] ' + MARGIN_FORM_VIEW + ' margin input not found');
      ns.renderToast('Margin form not on page — cannot update', 'error');
      setBusy(button, false);
      return;
    }

    // field_2158 is a percent field that expects the decimal form
    // (0.1710, not 17.10). data-margin-value is already the decimal;
    // fall back to dividing the percent by 100 if it\'s missing.
    var decNum = isFinite(marginVal) ? marginVal : (parseFloat(marginPct) / 100);
    if (!isFinite(decNum)) {
      console.warn('[BidReview] invalid margin value', marginVal, marginPct);
      setBusy(button, false);
      return;
    }
    $input.val(decNum.toFixed(4)).trigger('change');

    // Block-the-world overlay. The earlier version only changed the
    // button text — the rest of the page stayed interactive, so a
    // colleague clicking elsewhere or hitting refresh while the PUT
    // was in flight could abort the save and the safety-net reload
    // would still fire, leaving the SOW with the old margin. The
    // overlay covers the page during save, blocks pointer + keyboard
    // events, and shows what's happening.
    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:100002;' +
      'background:rgba(15,23,42,.55);' +
      'display:flex;align-items:center;justify-content:center;' +
      'font:600 15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'color:#1e293b;';
    var modal = document.createElement('div');
    modal.style.cssText =
      'background:#fff;padding:20px 28px;border-radius:6px;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.25);min-width:280px;text-align:center;';
    modal.innerHTML =
      '<div style="font-size:13px;color:#64748b;text-transform:uppercase;' +
      'letter-spacing:.05em;margin-bottom:8px;">Updating SOW</div>' +
      '<div>Setting project margin to ' + escapeHtmlInline(marginPct) + '%…</div>' +
      '<div style="margin-top:10px;font:400 12px/1.4 system-ui;color:#64748b;">' +
      'Please don’t refresh or navigate away.</div>';
    overlay.appendChild(modal);
    // Swallow clicks and keyboard so a stray click can't dismiss the
    // form or trigger another action mid-save.
    overlay.addEventListener('click',    function (e) { e.stopPropagation(); e.preventDefault(); });
    overlay.addEventListener('keydown',  function (e) { e.stopPropagation(); e.preventDefault(); });
    document.body.appendChild(overlay);

    // Discourage navigation during the save. Modern browsers ignore
    // the custom message but still show their generic confirm prompt.
    function beforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    window.addEventListener('beforeunload', beforeUnload);

    var done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      window.removeEventListener('beforeunload', beforeUnload);
      $(document).off('knack-record-update.' + MARGIN_FORM_VIEW + 'BumpMargin');
      $(document).off('knack-form-submit.'   + MARGIN_FORM_VIEW + 'BumpMargin');
      $(document).off('knack-form-submit-error.' + MARGIN_FORM_VIEW + 'BumpMargin');
      if (ok) {
        // Knack's record-update fires AFTER the PUT response, so by
        // here the margin is persisted. Reload to show the new value.
        window.location.reload();
      } else {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        setBusy(button, false);
        ns.renderToast('Margin update failed — please try again', 'error');
      }
    }

    // record-update is the only event that proves the PUT succeeded.
    // form-submit fires before the AJAX, so don't treat it as a
    // success signal — only use it to extend the watchdog if needed.
    $(document).on(
      'knack-record-update.' + MARGIN_FORM_VIEW + 'BumpMargin',
      function () { finish(true); }
    );
    $(document).on(
      'knack-form-submit-error.' + MARGIN_FORM_VIEW + 'BumpMargin',
      function () { finish(false); }
    );

    // Safety net — bumped from 6s to 25s. The previous 6s timeout was
    // tight enough that on a slow connection the reload could fire
    // mid-PUT, leaving the form save aborted. 25s is generous enough
    // to cover slow networks while still rescuing the user if Knack
    // never fires record-update for some reason.
    setTimeout(function () {
      if (!done) {
        console.warn('[BidReview] margin update watchdog fired — reloading');
        finish(true);
      }
    }, 25000);

    // Submit the form. Knack's submit binding lives on the form\'s
    // own submit button; clicking it triggers validation + Knack\'s
    // internal save flow.
    var $form = $view.find('form').first();
    if ($form.length) {
      var $submit = $form.find('button[type="submit"], input[type="submit"]').first();
      if ($submit.length) {
        $submit.trigger('click');
      } else {
        $form.trigger('submit');
      }
    } else {
      console.warn('[BidReview] ' + MARGIN_FORM_VIEW + ' form not found');
      finish(false);
    }
  }

  function escapeHtmlInline(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Add PM & Mobilization line item (margin-low warning button) ──

  function handleAddPmMobilization(button) {
    var sowId   = button.getAttribute('data-sow-id');
    var sowName = button.getAttribute('data-sow-name') || sowId;
    if (!sowId) return;

    if (!window.confirm(
      'Add a Project Management & Mobilization line item to ' + sowName + '?'
    )) return;

    // Pull the current Survey Costs value from the input on the same
    // SOW status bar — Make's scenario uses it to compute the new
    // line-item amount. Numeric pass-through (no $ formatting).
    var surveyCostsRaw = '';
    var surveyCostsNum = null;
    var input = document.querySelector(
      '.scw-bid-review__sow-metric-input[data-action="sow_survey_costs"]' +
      '[data-sow-id="' + sowId + '"]'
    );
    if (input) {
      surveyCostsRaw = (input.value || '').trim();
      var stripped = surveyCostsRaw.replace(/[^0-9.\-]/g, '');
      if (stripped !== '') {
        var n = parseFloat(stripped);
        if (isFinite(n)) surveyCostsNum = n;
      }
    }

    setBusy(button, true);
    ns.submitAction({
      actionType:       'add_pm_mobilization',
      sowId:            sowId,
      surveyCosts:      surveyCostsNum,
      surveyCostsRaw:   surveyCostsRaw,
      surveyCostsField: CFG.surveyCostsField || '',
    }).done(function (resp) {
      // Only refresh when Make confirmed it actually created the
      // record. Make signals via {success: true} once the SOW Line
      // Item write has committed.
      if (!resp || resp.success !== true) {
        if (CFG.debug) {
          SCW.debug('[BidReview] add_pm_mobilization: webhook returned non-success', resp);
        }
        return;
      }
      // Force view_3921 (unbid SOW items) to refetch so the just-
      // created PM line item lands in its model BEFORE refreshSilently
      // rebuilds the comparison state. refreshSilently → loadRawData
      // reads from the Knack model, so a stale model = missing row.
      var sowItemsView = Knack && Knack.views && Knack.views[CFG.sowItemsViewKey];
      if (sowItemsView && sowItemsView.model && typeof sowItemsView.model.fetch === 'function') {
        sowItemsView.model.fetch().always(function () {
          refreshSilently();
        });
      } else {
        refreshSilently();
      }
    }).always(function () {
      setBusy(button, false);
    });
  }

  // ── package-level action ────────────────────────────────────

  function findPackageName(grid, pkgId) {
    for (var i = 0; i < grid.packages.length; i++) {
      if (grid.packages[i].id === pkgId) return grid.packages[i].name;
    }
    return pkgId;
  }

  /**
   * Build MDF/IDF dropdown options from view_3822 records.
   * Each record becomes { id, identifier }.
   */
  function buildMdfIdfOptions() {
    var opts = [];
    var seen = {};
    for (var i = 0; i < _mdfIdfRecords.length; i++) {
      var rec = _mdfIdfRecords[i];
      if (!rec.id || seen[rec.id]) continue;
      seen[rec.id] = true;
      // Use field_1642 for the display label
      var name = rec.field_1642 || '';
      if (typeof name === 'string') name = name.replace(/<[^>]*>/g, '').trim();
      opts.push({ id: rec.id, identifier: name || rec.id });
    }
    opts.sort(function (a, b) { return a.identifier.localeCompare(b.identifier); });
    return opts;
  }

  /**
   * Build Connected Devices + Connected To dropdown options from grid rows.
   * Used by the Add to Bid modal for camera/reader items.
   * Returns { bidConnDevice: [...], bidConnTo: [...] }
   */
  /**
   * Build a set of camera/reader IDs that are already claimed as Connected
   * Devices on ANY record (existing bid cells + pending change requests).
   * Excludes the given selfId so the current item's own selections don't
   * block themselves from appearing.
   */
  function buildClaimedDeviceSet(grid, selfId) {
    var TAG = '[ClaimedDevices]';
    var claimed = {};
    SCW.debug(TAG, 'Building claimed set, selfId:', selfId);
    // 1. Existing bid records — scan all cells across all packages
    for (var ri = 0; ri < grid.rows.length; ri++) {
      var row = grid.rows[ri];
      var pkgs = Object.keys(row.cellsByPackage);
      for (var pi = 0; pi < pkgs.length; pi++) {
        var c = row.cellsByPackage[pkgs[pi]];
        if (c.id === selfId) continue; // skip self
        var ids = c.bidConnDeviceIds || [];
        if (ids.length) SCW.debug(TAG, '  bid cell', c.id, 'bidConnDeviceIds:', ids);
        for (var di = 0; di < ids.length; di++) claimed[ids[di]] = true;
      }
    }
    // 2. Pending change requests — check requested bidConnDeviceIds
    var crApi = ns.changeRequests;
    if (crApi && typeof crApi.getPending === 'function') {
      var pending = crApi.getPending();
      var pkeys = Object.keys(pending);
      SCW.debug(TAG, '  pending packages:', pkeys.length);
      for (var pk = 0; pk < pkeys.length; pk++) {
        var items = pending[pkeys[pk]].items || [];
        for (var ii = 0; ii < items.length; ii++) {
          var it = items[ii];
          SCW.debug(TAG, '  pending item:', it.rowId, 'bidRecordId:', it.bidRecordId,
            'displayLabel:', it.displayLabel,
            'req.bidConnDevice:', it.requested && it.requested.bidConnDevice,
            'req.bidConnDeviceIds:', it.requested && it.requested.bidConnDeviceIds);
          // Skip self
          if (it.bidRecordId === selfId || it.rowId === selfId) {
            SCW.debug(TAG, '    → SKIPPED (self)');
            continue;
          }
          var reqIds = (it.requested && it.requested.bidConnDeviceIds) || [];
          for (var qi = 0; qi < reqIds.length; qi++) claimed[reqIds[qi]] = true;
        }
      }
    } else {
      console.warn(TAG, '  ns.changeRequests or getPending not available!');
    }
    var claimedKeys = Object.keys(claimed);
    SCW.debug(TAG, 'Final claimed set (' + claimedKeys.length + '):', claimedKeys);
    return claimed;
  }

  function buildAddConnOptions(grid, selfId) {
    var claimed = buildClaimedDeviceSet(grid, selfId);
    var connDevOpts = [], connToOpts = [];
    var seenDev = {}, seenTo = {};

    for (var ci = 0; ci < grid.rows.length; ci++) {
      var cr = grid.rows[ci];
      var cpkgs = Object.keys(cr.cellsByPackage);

      // noBid / surveyNoBid rows
      if ((cr.noBid || cr.surveyNoBid) && cpkgs.length === 0) {
        var nbLbl = cr.displayLabel || cr.sowProduct || cr.productName || cr.id;
        if (cr.sowProduct && cr.displayLabel && cr.displayLabel !== cr.sowProduct
            && nbLbl.indexOf(cr.sowProduct) === -1) {
          nbLbl = cr.displayLabel + ' \u2014 ' + cr.sowProduct;
        }
        var nbIsCR = cr.proposalBucketId === CAM_READER_BUCKET_ID;
        if (nbIsCR && !seenDev[cr.id] && !claimed[cr.id]) {
          seenDev[cr.id] = true;
          connDevOpts.push({ id: cr.id, identifier: nbLbl, noBid: true, rowId: cr.id });
        }
        var nbMapConn = /^yes$/i.test(String(cr.sowMapConn || '').trim());
        if (nbMapConn && !seenTo[cr.id]) {
          seenTo[cr.id] = true;
          connToOpts.push({ id: cr.id, identifier: nbLbl, noBid: true, rowId: cr.id });
        }
        continue;
      }

      for (var cp = 0; cp < cpkgs.length; cp++) {
        var cc = cr.cellsByPackage[cpkgs[cp]];
        if (!cc.id) continue;

        var lbl = cr.displayLabel || cr.productName || cc.productName || cc.id;
        if (cr.productName && cr.displayLabel && cr.displayLabel !== cr.productName
            && lbl.indexOf(cr.productName) === -1) {
          lbl = cr.displayLabel + ' \u2014 ' + cr.productName;
        }

        var isCR = cr.proposalBucketId === CAM_READER_BUCKET_ID;
        var connToBlank = !cc.bidConnTo || String(cc.bidConnTo).trim() === '';

        if (!seenDev[cc.id] && isCR && connToBlank && !claimed[cc.id]) {
          seenDev[cc.id] = true;
          connDevOpts.push({ id: cc.id, identifier: lbl });
        }
        if (!seenTo[cc.id] && cc.mapConnections) {
          seenTo[cc.id] = true;
          connToOpts.push({ id: cc.id, identifier: lbl });
        }
      }
    }

    return { bidConnDevice: connDevOpts, bidConnTo: connToOpts };
  }

  function findPackageSurveyId(grid, pkgId) {
    for (var i = 0; i < grid.packages.length; i++) {
      if (grid.packages[i].id === pkgId) return grid.packages[i].surveyId || '';
    }
    return '';
  }

  // ── create-new-sow handler (toolbar button) ─────────────────

  function handleCreateNewSow(button) {
    if (!_state) {
      ns.renderToast('Comparison data not loaded yet', 'error');
      return;
    }

    var payload = ns.buildCreateNewSowPayload(_state);
    payload.projectId = getProjectId();
    var matched = (payload.matchedSowItems || []).length;
    var orphans = (payload.orphanBidRecords || []).length;

    if (!matched && !orphans) {
      ns.renderToast('No matched SOW items or orphan bid records to send', 'info');
      return;
    }

    if (!window.confirm(
      'Create a new SOW from ' + matched + ' matched SOW item' +
      (matched === 1 ? '' : 's') + ' and ' + orphans + ' orphan bid record' +
      (orphans === 1 ? '' : 's') + '?'
    )) {
      return;
    }

    button.classList.add('scw-bid-review__btn--busy');
    button.disabled = true;

    ns.submitAction(payload).always(function () {
      button.classList.remove('scw-bid-review__btn--busy');
      button.disabled = false;
    });
  }

  // Per-bid "+ Create new SOW" — fires the create-new-SOW webhook scoped
  // to just this subcontractor's bid (Make builds a whole new SOW from
  // it). Distinct from handleCreateNewSow, which spans the whole state.
  function handleCreateNewSowForPackage(button) {
    if (!_state) {
      ns.renderToast('Comparison data not loaded yet', 'error');
      return;
    }
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');
    var grid  = findSowGrid(sowId);
    if (!grid) { ns.renderToast('SOW grid not found', 'error'); return; }

    var payload = ns.buildCreateNewSowForPackagePayload(grid, pkgId);
    payload.projectId = getProjectId();
    var count = (payload.matchedSowItems || []).length + (payload.orphanBidRecords || []).length;
    if (!count) {
      ns.renderToast('This bid has no line items to build a SOW from', 'info');
      return;
    }

    var pkgName = findPackageName(grid, pkgId) || 'this bid';

    function labelOf(it) {
      return it.displayLabel || it.productName || it.label || '';
    }

    confirmItemSelection({
      title:    'Create new SOW from bid',
      subtitle: pkgName + ' → new SOW',
      confirmLabel: 'Create SOW',
      emptyText: 'This bid has no line items to build a SOW from.',
      groups: [
        { title: 'Existing SOW items', kind: 'matched', items: payload.matchedSowItems || [], labelOf: labelOf },
        { title: 'Bid-only items (no SOW match yet)', kind: 'orphan', items: payload.orphanBidRecords || [], labelOf: labelOf }
      ],
      onConfirm: function (selected) {
        payload.matchedSowItems  = selected.matched || [];
        payload.orphanBidRecords = selected.orphan  || [];

        if (!payload.matchedSowItems.length && !payload.orphanBidRecords.length) {
          ns.renderToast('No items selected — nothing to create', 'info');
          return;
        }

        setBusy(button, true);
        showCopyToast('Creating a new SOW from ' + pkgName + '…');

        ns.submitAction(payload)
          .done(function () {
            if (CFG.debug) SCW.debug('[BidReview] Create new SOW webhook completed — reloading page');
            if (ns.persistAccordionState) ns.persistAccordionState();
            window.location.reload();
          })
          .fail(function (xhr) {
            if (CFG.debug) SCW.debug('[BidReview] Create new SOW webhook timeout/error (status ' + (xhr && xhr.status) + ')');
          })
          .always(function () {
            hideCopyToast();
            setBusy(button, false);
          });
      }
    });
  }

  function handlePackageAction(button, actionType) {
    if (!_state) return;

    var pkgId  = button.getAttribute('data-package-id');
    var sowId  = button.getAttribute('data-sow-id');
    var grid   = findSowGrid(sowId);

    if (!grid) {
      ns.renderToast('SOW grid not found', 'error');
      return;
    }

    // Copy to SOW uses the structured payload builder
    if (actionType === 'package_copy_to_sow') {
      handleCopyToSow(button, pkgId, grid);
      return;
    }

    var rowIds = ns.collectEligible(pkgId, actionType, grid);

    if (!rowIds.length) {
      ns.renderToast('No eligible rows for this action', 'info');
      return;
    }

    var pkgName = findPackageName(grid, pkgId);

    var verb = actionType === 'package_adopt_all'      ? 'Adopt'
             : actionType === 'package_create_missing'  ? 'Create'
             : 'Adopt + Create';

    var confirmed = window.confirm(
      verb + ' ' + rowIds.length + ' row(s) from ' + pkgName +
      ' into ' + grid.sowName + '?'
    );
    if (!confirmed) return;

    setBusy(button, true);

    ns.submitAction({
      actionType: actionType,
      packageId:  pkgId,
      sowId:      sowId,
      rowIds:     rowIds,
    }).done(function () {
      refreshSilently();
    }).always(function () {
      setBusy(button, false);
    });
  }

  // ── Reopen Bid — status → Draft + unlock line items ─────────
  //
  // Puts a submitted bid back into an editable state:
  //   1. bid package status (field_2550) → "Draft"  (write via view_3573)
  //   2. every line item on that bid: lock flag (field_2551) → "No"
  //      (write via the bid-review source view, CFG.viewKey)
  // All client-side view PUTs — no webhook. Refreshes the matrix after.
  function handleReopenBid(button) {
    if (!_state) return;

    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');
    var grid  = findSowGrid(sowId);
    if (!grid) { ns.renderToast('SOW grid not found', 'error'); return; }

    if (!SCW.knackRecordUrl || !SCW.knackAjax) {
      ns.renderToast('Cannot reopen — Knack helpers unavailable', 'error');
      return;
    }

    var statusField = CFG.fieldKeys.bidStatus;          // field_2550
    var lockField   = 'field_2551';                      // line-item finalize/lock
    var pkgView     = CFG.bidPackagesViewKey;            // view_3573 (bid package)
    var itemView    = CFG.viewKey;                       // view_3680 (bid line items)

    // Collect every line item record id for this package across the grid.
    var itemIds = [];
    var seen = {};
    for (var i = 0; i < grid.rows.length; i++) {
      var cell = grid.rows[i].cellsByPackage && grid.rows[i].cellsByPackage[pkgId];
      if (cell && cell.id && !seen[cell.id]) { seen[cell.id] = true; itemIds.push(cell.id); }
    }

    var pkgName = findPackageName(grid, pkgId) || 'this bid';
    if (!window.confirm(
      'Reopen ' + pkgName + '?\n\nThis sets the bid status back to Draft and ' +
      'unlocks ' + itemIds.length + ' line item' + (itemIds.length === 1 ? '' : 's') +
      ' so they can be edited again.'
    )) return;

    setBusy(button, true);

    // ── Reliability layer (mirrors mirror-connection-sync.js) ──────
    // Knack rate-limits at ~10 req/s; a wide bid (30+ items) bursts past
    // that and loses PUTs to 429s. So: cap concurrency, and retry
    // transient failures (429 / 5xx / 408 / network) with exponential
    // backoff + jitter. Permanent 4xx (403/404/400) don't retry.
    var MAX_CONCURRENT = 4;
    var MAX_ATTEMPTS   = 4;
    var BASE_BACKOFF   = 350;

    function isTransient(status) {
      return status === 0 || status === 408 || status === 429 ||
             (status >= 500 && status <= 599);
    }

    // Resolves to { ok, recordId, status } either way — a single failed
    // PUT never rejects the batch (which would show a false "failed"
    // toast while the rest landed). Caller tallies the results.
    function putWithRetry(viewId, recordId, fieldKey, value) {
      return new Promise(function (resolve) {
        var attempt = 0;
        var data = {};
        data[fieldKey] = value;
        function go() {
          attempt++;
          SCW.knackAjax({
            url:  SCW.knackRecordUrl(viewId, recordId),
            type: 'PUT',
            data: JSON.stringify(data),
            success: function (resp) {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(viewId, recordId, resp, fieldKey, value);
              }
              resolve({ ok: true, recordId: recordId });
            },
            error: function (xhr) {
              var status = xhr && xhr.status;
              if (isTransient(status) && attempt < MAX_ATTEMPTS) {
                var delay = BASE_BACKOFF * Math.pow(2, attempt - 1) +
                            Math.floor(Math.random() * 250);
                if (CFG.debug) {
                  console.warn('[BidReview] transient PUT ' + status + ' on ' + recordId +
                    ' — retry ' + attempt + '/' + (MAX_ATTEMPTS - 1) + ' in ' + delay + 'ms');
                }
                setTimeout(go, delay);
                return;
              }
              if (CFG.debug) {
                console.warn('[BidReview] Reopen PUT failed for', viewId, recordId, fieldKey,
                  '→', status, xhr && xhr.responseText);
              }
              resolve({ ok: false, recordId: recordId, status: status });
            }
          });
        }
        go();
      });
    }

    // Concurrency-limited runner — keeps at most maxConcurrent PUTs in
    // flight, starting the next as each settles. Results preserve order.
    function runBatched(taskFns, maxConcurrent) {
      return new Promise(function (resolve) {
        var results = [];
        var next = 0, running = 0, settled = 0;
        if (!taskFns.length) { resolve(results); return; }
        function pump() {
          while (running < maxConcurrent && next < taskFns.length) {
            var idx = next++;
            running++;
            taskFns[idx]().then(function (res) {
              results[this.idx] = res;
              running--; settled++;
              if (settled === taskFns.length) resolve(results);
              else pump();
            }.bind({ idx: idx }));
          }
        }
        pump();
      });
    }

    // Status flip first (so we always know its outcome), then the
    // line-item unlocks batched through the concurrency-limited queue.
    putWithRetry(pkgView, pkgId, statusField, 'Draft').then(function (statusRes) {
      var itemTasks = itemIds.map(function (id) {
        return function () { return putWithRetry(itemView, id, lockField, 'No'); };
      });
      return runBatched(itemTasks, MAX_CONCURRENT).then(function (itemResults) {
        var failedItems = 0;
        for (var r = 0; r < itemResults.length; r++) if (!itemResults[r].ok) failedItems++;
        var unlocked = itemIds.length - failedItems;

        if (!statusRes.ok && failedItems === itemIds.length) {
          ns.renderToast('Reopen failed — please retry', 'error');
        } else if (statusRes.ok && failedItems === 0) {
          ns.renderToast('Bid reopened — status set to Draft and ' +
            unlocked + ' item' + (unlocked === 1 ? '' : 's') + ' unlocked', 'success');
        } else {
          var parts = [];
          parts.push(statusRes.ok ? 'status set to Draft' : 'status NOT updated');
          parts.push(unlocked + '/' + itemIds.length + ' items unlocked');
          ns.renderToast('Bid partially reopened — ' + parts.join('; ') +
            '. Check the console for details.', 'info');
        }
        refreshSilently();
      });
    }).then(function () { setBusy(button, false); });
  }

  // ── Copy to SOW — processing toast + poll refresh ────────────

  var COPY_TOAST_ID  = 'scw-bid-review-copy-toast';
  var COPY_CSS_ID    = 'scw-bid-review-copy-css';
  var COPY_POLL_MS    = 5000;     // poll every 5s
  var COPY_TIMEOUT_MS = 120000;  // stop after 2 minutes
  var _copyPollTimer  = null;

  function injectCopyToastStyle() {
    if (document.getElementById(COPY_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = COPY_CSS_ID;
    s.textContent = [
      '#' + COPY_TOAST_ID + ' {',
      '  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);',
      '  background: #1e3a5f; color: #fff; padding: 12px 20px;',
      '  border-radius: 8px; font-size: 13px; font-weight: 500;',
      '  box-shadow: 0 4px 12px rgba(0,0,0,.18); z-index: 10000;',
      '  display: flex; align-items: center; gap: 10px;',
      '  transition: opacity 300ms ease;',
      '}',
      '#' + COPY_TOAST_ID + ' .scw-copy-spinner {',
      '  width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3);',
      '  border-top-color: #fff; border-radius: 50%;',
      '  animation: scwCopySpin .8s linear infinite; flex-shrink: 0;',
      '}',
      '#' + COPY_TOAST_ID + ' .scw-copy-close {',
      '  background: none; border: none; color: rgba(255,255,255,.7);',
      '  font-size: 18px; cursor: pointer; padding: 0 0 0 6px;',
      '  line-height: 1; font-weight: 700; flex-shrink: 0;',
      '}',
      '#' + COPY_TOAST_ID + ' .scw-copy-close:hover { color: #fff; }',
      '@keyframes scwCopySpin { to { transform: rotate(360deg); } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function showCopyToast(message) {
    injectCopyToastStyle();
    hideCopyToast(true); // remove any existing toast instantly

    var toast = document.createElement('div');
    toast.id = COPY_TOAST_ID;

    var spinner = document.createElement('span');
    spinner.className = 'scw-copy-spinner';
    toast.appendChild(spinner);

    toast.appendChild(document.createTextNode(message));

    var closeBtn = document.createElement('button');
    closeBtn.className = 'scw-copy-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.title = 'Dismiss and stop refreshing';
    closeBtn.addEventListener('click', function () {
      stopCopyPoll();
      hideCopyToast();
    });
    toast.appendChild(closeBtn);

    document.body.appendChild(toast);
  }

  function hideCopyToast(instant) {
    var toast = document.getElementById(COPY_TOAST_ID);
    if (!toast) return;
    if (instant) { toast.remove(); return; }
    toast.style.opacity = '0';
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 350);
  }

  function startCopyPoll() {
    stopCopyPoll();
    var elapsed = 0;

    _copyPollTimer = setInterval(function () {
      elapsed += COPY_POLL_MS;
      refreshSilently();

      if (elapsed >= COPY_TIMEOUT_MS) {
        stopCopyPoll();
        hideCopyToast();
        ns.renderToast('Sync may still be processing \u2014 refresh to check', 'info');
      }
    }, COPY_POLL_MS);
  }

  function stopCopyPoll() {
    if (_copyPollTimer) {
      clearInterval(_copyPollTimer);
      _copyPollTimer = null;
    }
  }

  var COPYSYNC_CSS_ID     = 'scw-bid-review-copysync-css';
  var COPYSYNC_OVERLAY_ID = 'scw-bid-review-copysync-overlay';

  function injectCopySyncStyle() {
    if (document.getElementById(COPYSYNC_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = COPYSYNC_CSS_ID;
    s.textContent = [
      '#' + COPYSYNC_OVERLAY_ID + ' {',
      '  position: fixed; inset: 0; background: rgba(15,23,42,.45);',
      '  z-index: 10001; display: flex; align-items: center; justify-content: center;',
      '}',
      '#' + COPYSYNC_OVERLAY_ID + ' .scw-copysync-modal {',
      '  background: #fff; border-radius: 10px; width: 460px; max-width: calc(100vw - 32px);',
      '  max-height: calc(100vh - 64px); display: flex; flex-direction: column;',
      '  box-shadow: 0 12px 40px rgba(0,0,0,.25); overflow: hidden;',
      '}',
      '.scw-copysync-modal__header { padding: 16px 18px 12px; border-bottom: 1px solid #e2e8f0; }',
      '.scw-copysync-modal__title { font-size: 16px; font-weight: 700; color: #07467c; }',
      '.scw-copysync-modal__subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }',
      '.scw-copysync-modal__body { padding: 14px 18px; overflow-y: auto; font-size: 13px; color: #334155; }',
      '.scw-copysync-modal__summary { margin-bottom: 12px; }',
      '.scw-copysync-modal__group { margin-bottom: 14px; }',
      '.scw-copysync-modal__group-head {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  font-weight: 700; color: #334155; margin-bottom: 6px;',
      '}',
      '.scw-copysync-modal__group-toggle {',
      '  background: none; border: none; padding: 0; cursor: pointer;',
      '  font-size: 12px; font-weight: 600; color: #2563eb;',
      '}',
      '.scw-copysync-modal__group-toggle:hover { text-decoration: underline; }',
      '.scw-copysync-modal__items { max-height: 200px; overflow-y: auto;',
      '  border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 0; }',
      '.scw-copysync-modal__item {',
      '  display: flex; align-items: center; gap: 8px; padding: 5px 12px;',
      '  line-height: 1.35; cursor: pointer;',
      '}',
      '.scw-copysync-modal__item:hover { background: #f8fafc; }',
      '.scw-copysync-modal__item input { flex-shrink: 0; }',
      '.scw-copysync-modal__toggle {',
      '  display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px;',
      '  background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px;',
      '}',
      '.scw-copysync-modal__toggle input { margin-top: 2px; flex-shrink: 0; }',
      '.scw-copysync-modal__toggle-label { font-weight: 600; color: #9a3412; }',
      '.scw-copysync-modal__toggle-hint { font-weight: 400; color: #9a3412; opacity: .85; display: block; margin-top: 2px; }',
      '.scw-copysync-modal__footer { padding: 12px 18px; border-top: 1px solid #e2e8f0;',
      '  display: flex; justify-content: flex-end; gap: 10px; }',
      '.scw-copysync-modal__btn { padding: 8px 16px; border-radius: 6px; font-size: 13px;',
      '  font-weight: 600; cursor: pointer; border: 1px solid transparent; }',
      '.scw-copysync-modal__btn--cancel { background: #fff; color: #475569; border-color: #cbd5e1; }',
      '.scw-copysync-modal__btn--cancel:hover { background: #f1f5f9; }',
      '.scw-copysync-modal__btn--go { background: #07467c; color: #fff; }',
      '.scw-copysync-modal__btn--go:hover { background: #063a66; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function closeCopySyncModal() {
    var o = document.getElementById(COPYSYNC_OVERLAY_ID);
    if (o && o.parentNode) o.parentNode.removeChild(o);
  }

  // Confirm modal for Update SOW to match Bid. Lists every item the sync
  // will touch — grouped into Updates, New items, and Disconnections —
  // each as a checkbox the user can deselect to leave that item alone.
  // Calls onConfirm({ updates, creates, removals }) with only the
  // still-checked items.
  function confirmCopyToSow(opts) {
    injectCopySyncStyle();
    closeCopySyncModal();

    var overlay = document.createElement('div');
    overlay.id = COPYSYNC_OVERLAY_ID;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeCopySyncModal();
    });

    var modal = document.createElement('div');
    modal.className = 'scw-copysync-modal';

    var header = document.createElement('div');
    header.className = 'scw-copysync-modal__header';
    var title = document.createElement('div');
    title.className = 'scw-copysync-modal__title';
    title.textContent = 'Update SOW to match Bid';
    var subtitle = document.createElement('div');
    subtitle.className = 'scw-copysync-modal__subtitle';
    subtitle.textContent = opts.pkgName + ' → ' + opts.sowName;
    header.appendChild(title);
    header.appendChild(subtitle);
    modal.appendChild(header);

    var body = document.createElement('div');
    body.className = 'scw-copysync-modal__body';

    // Track every rendered checkbox alongside the payload item it controls.
    var rows = [];   // { cb, kind: 'updates'|'creates'|'removals', item }

    // Render one titled group of item checkboxes. Includes a select-all /
    // none toggle in the group header for long lists.
    function renderGroup(titleText, kind, items) {
      if (!items || !items.length) return;

      var section = document.createElement('div');
      section.className = 'scw-copysync-modal__group';

      var head = document.createElement('div');
      head.className = 'scw-copysync-modal__group-head';
      var headLabel = document.createElement('span');
      headLabel.textContent = titleText + ' (' + items.length + ')';
      head.appendChild(headLabel);
      var toggleAll = document.createElement('button');
      toggleAll.type = 'button';
      toggleAll.className = 'scw-copysync-modal__group-toggle';
      toggleAll.textContent = 'Deselect all';
      head.appendChild(toggleAll);
      section.appendChild(head);

      var groupCbs = [];
      var list = document.createElement('div');
      list.className = 'scw-copysync-modal__items';
      for (var i = 0; i < items.length; i++) {
        var rowLabel = document.createElement('label');
        rowLabel.className = 'scw-copysync-modal__item';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        var span = document.createElement('span');
        span.textContent = items[i].label || items[i].sowItemId || items[i].bidRecordId || 'Item';
        rowLabel.appendChild(cb);
        rowLabel.appendChild(span);
        list.appendChild(rowLabel);
        rows.push({ cb: cb, kind: kind, item: items[i] });
        groupCbs.push(cb);
      }
      section.appendChild(list);

      toggleAll.addEventListener('click', function () {
        var anyChecked = false;
        for (var c = 0; c < groupCbs.length; c++) { if (groupCbs[c].checked) { anyChecked = true; break; } }
        var next = !anyChecked;
        for (var c2 = 0; c2 < groupCbs.length; c2++) groupCbs[c2].checked = next;
        toggleAll.textContent = next ? 'Deselect all' : 'Select all';
      });

      body.appendChild(section);
    }

    renderGroup('Update existing SOW items', 'updates', opts.payload.updates);
    renderGroup('Create new SOW items',      'creates', opts.payload.creates);
    renderGroup('Disconnect from SOW (on the SOW, not in this bid)', 'removals', opts.payload.removals);

    if (!rows.length) {
      var empty = document.createElement('div');
      empty.className = 'scw-copysync-modal__summary';
      empty.textContent = 'No items will be updated or created.';
      body.appendChild(empty);
    }

    modal.appendChild(body);

    var footer = document.createElement('div');
    footer.className = 'scw-copysync-modal__footer';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'scw-copysync-modal__btn scw-copysync-modal__btn--cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeCopySyncModal);
    var goBtn = document.createElement('button');
    goBtn.className = 'scw-copysync-modal__btn scw-copysync-modal__btn--go';
    goBtn.textContent = 'Update SOW';
    goBtn.addEventListener('click', function () {
      var selected = { updates: [], creates: [], removals: [] };
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].cb.checked) selected[rows[r].kind].push(rows[r].item);
      }
      closeCopySyncModal();
      opts.onConfirm(selected);
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(goBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // Generic per-item selection modal (same look as Update SOW to match
  // Bid). opts: { title, subtitle, confirmLabel, emptyText,
  // groups: [{ title, kind, items, labelOf }], onConfirm(selected) }
  // where selected[kind] is the array of still-checked items.
  function confirmItemSelection(opts) {
    injectCopySyncStyle();
    closeCopySyncModal();

    var overlay = document.createElement('div');
    overlay.id = COPYSYNC_OVERLAY_ID;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeCopySyncModal();
    });

    var modal = document.createElement('div');
    modal.className = 'scw-copysync-modal';

    var header = document.createElement('div');
    header.className = 'scw-copysync-modal__header';
    var title = document.createElement('div');
    title.className = 'scw-copysync-modal__title';
    title.textContent = opts.title || 'Confirm';
    header.appendChild(title);
    if (opts.subtitle) {
      var subtitle = document.createElement('div');
      subtitle.className = 'scw-copysync-modal__subtitle';
      subtitle.textContent = opts.subtitle;
      header.appendChild(subtitle);
    }
    modal.appendChild(header);

    var body = document.createElement('div');
    body.className = 'scw-copysync-modal__body';

    var rows = [];   // { cb, kind, item }

    function renderGroup(group) {
      if (!group || !group.items || !group.items.length) return;
      var section = document.createElement('div');
      section.className = 'scw-copysync-modal__group';

      var head = document.createElement('div');
      head.className = 'scw-copysync-modal__group-head';
      var headLabel = document.createElement('span');
      headLabel.textContent = group.title + ' (' + group.items.length + ')';
      head.appendChild(headLabel);
      var toggleAll = document.createElement('button');
      toggleAll.type = 'button';
      toggleAll.className = 'scw-copysync-modal__group-toggle';
      toggleAll.textContent = 'Deselect all';
      head.appendChild(toggleAll);
      section.appendChild(head);

      var groupCbs = [];
      var list = document.createElement('div');
      list.className = 'scw-copysync-modal__items';
      for (var i = 0; i < group.items.length; i++) {
        var item = group.items[i];
        var rowLabel = document.createElement('label');
        rowLabel.className = 'scw-copysync-modal__item';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        var span = document.createElement('span');
        span.textContent = (group.labelOf ? group.labelOf(item) : '') ||
          item.label || item.displayLabel || item.productName ||
          item.sowItemId || item.bidRecordId || 'Item';
        rowLabel.appendChild(cb);
        rowLabel.appendChild(span);
        list.appendChild(rowLabel);
        rows.push({ cb: cb, kind: group.kind, item: item });
        groupCbs.push(cb);
      }
      section.appendChild(list);

      toggleAll.addEventListener('click', function () {
        var anyChecked = false;
        for (var c = 0; c < groupCbs.length; c++) { if (groupCbs[c].checked) { anyChecked = true; break; } }
        var next = !anyChecked;
        for (var c2 = 0; c2 < groupCbs.length; c2++) groupCbs[c2].checked = next;
        toggleAll.textContent = next ? 'Deselect all' : 'Select all';
      });

      body.appendChild(section);
    }

    for (var g = 0; g < (opts.groups || []).length; g++) renderGroup(opts.groups[g]);

    if (!rows.length) {
      var empty = document.createElement('div');
      empty.className = 'scw-copysync-modal__summary';
      empty.textContent = opts.emptyText || 'Nothing to include.';
      body.appendChild(empty);
    }
    modal.appendChild(body);

    var footer = document.createElement('div');
    footer.className = 'scw-copysync-modal__footer';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'scw-copysync-modal__btn scw-copysync-modal__btn--cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeCopySyncModal);
    var goBtn = document.createElement('button');
    goBtn.className = 'scw-copysync-modal__btn scw-copysync-modal__btn--go';
    goBtn.textContent = opts.confirmLabel || 'Confirm';
    goBtn.addEventListener('click', function () {
      var selected = {};
      for (var g2 = 0; g2 < (opts.groups || []).length; g2++) {
        selected[opts.groups[g2].kind] = [];
      }
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].cb.checked) {
          if (!selected[rows[r].kind]) selected[rows[r].kind] = [];
          selected[rows[r].kind].push(rows[r].item);
        }
      }
      closeCopySyncModal();
      opts.onConfirm(selected);
    });
    footer.appendChild(cancelBtn);
    footer.appendChild(goBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function handleCopyToSow(button, pkgId, grid) {
    var payload = ns.buildCopyToSowPayload(pkgId, grid);

    var total = payload.updates.length + payload.creates.length + payload.removals.length;
    if (total === 0) {
      ns.renderToast('Nothing to update \u2014 SOW already matches this bid', 'info');
      return;
    }

    var pkgName = findPackageName(grid, pkgId);

    confirmCopyToSow({
      pkgName: pkgName,
      sowName: grid.sowName,
      payload: payload,
      onConfirm: function (selected) {
        // Honor per-item deselection: only sync the items the user left
        // checked in the confirm modal.
        payload.updates  = selected.updates  || [];
        payload.creates  = selected.creates  || [];
        payload.removals = selected.removals || [];

        var total2 = payload.updates.length + payload.creates.length + payload.removals.length;
        if (total2 === 0) {
          ns.renderToast('Nothing to update \u2014 SOW already matches this bid', 'info');
          return;
        }

        var summary = [];
        if (payload.updates.length)  summary.push(payload.updates.length  + ' update(s)');
        if (payload.creates.length)  summary.push(payload.creates.length  + ' new item(s)');
        if (payload.removals.length) summary.push(payload.removals.length + ' disconnected from SOW');

        showCopyToast('Updating ' + grid.sowName + ' to match ' + pkgName + ': ' + summary.join(', ') + '\u2026');
        startCopyPoll();

        setBusy(button, true);

        ns.submitAction(payload)
          .done(function () {
        // Webhook responded 200 — Make scenario is complete. Reload the
        // whole page so every view (grid, totals, SOW tables) re-fetches
        // from scratch rather than relying on a silent partial refresh.
        if (CFG.debug) SCW.debug('[BidReview] Copy to SOW webhook completed — reloading page');
        stopCopyPoll();
        // Persist the open/closed accordion state so it survives the
        // reload instead of coming back all-collapsed.
        if (ns.persistAccordionState) ns.persistAccordionState();
        window.location.reload();
      })
      .fail(function (xhr) {
        // Timeout or error — keep polling; Make may still be processing
        if (CFG.debug) {
          SCW.debug('[BidReview] Webhook timeout/error (status ' +
            (xhr && xhr.status) + ') — continuing to poll');
        }
      })
          .always(function () {
            setBusy(button, false);
          });
      }
    });
  }

  // ── change request (per-cell) ────────────────────────────────

  function handleChangeRequest(button, opts) {
    if (!_state || !ns.changeRequests) return;
    opts = opts || {};

    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');

    var grid = findSowGrid(sowId);
    if (!grid) return;

    // Find the row
    var row = null;
    for (var i = 0; i < grid.rows.length; i++) {
      if (grid.rows[i].id === rowId) { row = grid.rows[i]; break; }
    }
    if (!row) return;

    var cell = row.cellsByPackage[pkgId];
    if (!cell) {
      // noBid or surveyNoBid row — re-open add modal for editing the pending add-to-bid item
      if ((row.noBid || row.surveyNoBid) && ns.changeRequests && ns.changeRequests.openAddItem) {
        var pendingData = ns.changeRequests.getPending();
        var pendItem = null;
        if (pendingData[pkgId]) {
          var pitems = pendingData[pkgId].items;
          for (var pi2 = 0; pi2 < pitems.length; pi2++) {
            if (pitems[pi2].rowId === rowId) { pendItem = pitems[pi2]; break; }
          }
        }
        var isCR2 = row.proposalBucketId === CAM_READER_BUCKET_ID;
        var hasMapConn2 = /^yes$/i.test(String(row.sowMapConn || '').trim())
                       || /^yes$/i.test(String(row.bidMapConn || '').trim());
        var showConn2 = hasMapConn2 && !isCR2;
        var addConnOpts2 = { bidMdfIdf: buildMdfIdfOptions() };
        if (showConn2 || isCR2) {
          var ac2 = buildAddConnOptions(grid, rowId);
          addConnOpts2.bidConnDevice = ac2.bidConnDevice;
          addConnOpts2.bidConnTo     = ac2.bidConnTo;
        }
        ns.changeRequests.openAddItem({
          rowId:        rowId,
          pkgId:        pkgId,
          pkgName:      findPackageName(grid, pkgId),
          surveyId:     findPackageSurveyId(grid, pkgId),
          sowId:        sowId,
          sowName:      grid.sowName,
          sowItemId:    row.sowItem || '',
          displayLabel: row.displayLabel,
          productName:  row.productName,
          sowProduct:       row.sowProduct,
          sowQty:           row.sowQty,
          sowFee:           row.sowFee,
          sowLaborDesc:     row.sowLaborDesc,
          sowExistCabling:  row.sowExistCabling,
          sowPlenum:        row.sowPlenum,
          sowExterior:      row.sowExterior,
          sowDropLength:    row.sowDropLength,
          sowConduit:       row.sowConduit,
          sowMdfIdf:        row.mdfIdf || '',
          sowMdfIdfIds:     row.mdfIdfIds || [],
          proposalBucket:   row.proposalBucket || '',
          proposalBucketId: row.proposalBucketId || '',
          sortOrder:        row.sortOrder || 0,
          sowMapConn:       row.sowMapConn || '',
          connOptions:      addConnOpts2,
          gridRows:         grid.rows,
          visibility:       { qty: row.sowQty > 1, cabling: isCR2, connDevice: showConn2 },
          existing:         pendItem,
        });
      }
      return;
    }

    // Build per-field connection dropdown options from the grid rows.
    // field_2380 (Connected Devices): cameras/readers not yet wired
    // field_2381 (Connected To): networking / headend items
    var claimed = buildClaimedDeviceSet(grid, cell.id);
    var connDevOpts = [], connToOpts = [];
    var seenDev = {}, seenTo = {};

    // Always include currently-connected records so they show pre-selected
    var curDevIds = cell.bidConnDeviceIds || [];
    var curToIds  = cell.bidConnToIds || [];
    var curDevSet = {}, curToSet = {};
    for (var di = 0; di < curDevIds.length; di++) curDevSet[curDevIds[di]] = true;
    for (var ti = 0; ti < curToIds.length; ti++)  curToSet[curToIds[ti]] = true;

    for (var ci = 0; ci < grid.rows.length; ci++) {
      var cr = grid.rows[ci];
      var cpkgs = Object.keys(cr.cellsByPackage);

      // noBid / surveyNoBid rows: no bid cells, but include as connection options
      if ((cr.noBid || cr.surveyNoBid) && cpkgs.length === 0) {
        var nbLbl = cr.displayLabel || cr.sowProduct || cr.productName || cr.id;
        if (cr.sowProduct && cr.displayLabel && cr.displayLabel !== cr.sowProduct
            && nbLbl.indexOf(cr.sowProduct) === -1) {
          nbLbl = cr.displayLabel + ' \u2014 ' + cr.sowProduct;
        }
        var nbIsCamReader = cr.proposalBucketId === CAM_READER_BUCKET_ID;
        // Connected Devices: camera/reader noBid items — skip if claimed elsewhere
        if (nbIsCamReader && !seenDev[cr.id]) {
          seenDev[cr.id] = true;
          connDevOpts.push({ id: cr.id, identifier: nbLbl, noBid: true, rowId: cr.id, currentConnTo: null });
        }
        // Connected To: noBid items with mapConnections flag (field_2231)
        var nbMapConn = /^yes$/i.test(String(cr.sowMapConn || '').trim());
        if (nbMapConn && !seenTo[cr.id]) {
          seenTo[cr.id] = true;
          connToOpts.push({ id: cr.id, identifier: nbLbl, noBid: true, rowId: cr.id });
        }
        continue;
      }

      for (var cp = 0; cp < cpkgs.length; cp++) {
        var cc = cr.cellsByPackage[cpkgs[cp]];
        if (!cc.id || cc.id === cell.id) continue; // skip self

        var lbl = cr.displayLabel || cr.productName || cc.productName || cc.id;
        if (cr.productName && cr.displayLabel && cr.displayLabel !== cr.productName
            && lbl.indexOf(cr.productName) === -1) {
          lbl = cr.displayLabel + ' \u2014 ' + cr.productName;
        }

        var isCamReader = cr.proposalBucketId === CAM_READER_BUCKET_ID;

        // Connected Devices: show ALL Camera/Reader items with current connection info
        if (isCamReader && !seenDev[cc.id]) {
          seenDev[cc.id] = true;
          var connTo = cc.bidConnTo ? String(cc.bidConnTo).trim() : '';
          connDevOpts.push({
            id: cc.id,
            identifier: lbl,
            currentConnTo: connTo || null,
          });
        }

        // Connected To: items where field_2374 (mapConnections) is Yes, or currently selected
        if (!seenTo[cc.id] && (cc.mapConnections || curToSet[cc.id])) {
          seenTo[cc.id] = true;
          connToOpts.push({ id: cc.id, identifier: lbl });
        }
      }
    }

    if (CFG.debug) {
      SCW.debug('[BidReview] connDevOpts:', connDevOpts.length,
                  'connToOpts:', connToOpts.length);
    }

    // SOW-source revisions reshape row.sow* into a cell-shape so the
    // existing CR modal\'s prefill logic (cell[fd.key]) reads from the
    // SOW item record. The CR still targets the bid cell — we\'re just
    // asking the bidder to match SOW values.
    var modalCell = cell;
    if (opts.sourceFromSow) {
      var rate = (row.sowQty > 0 && row.sowFee > 0) ? (row.sowFee / row.sowQty) : 0;
      modalCell = {
        id:               cell.id,
        productName:      row.sowProduct || row.productName,
        qty:              row.sowQty,
        rate:             rate,
        laborDesc:        row.sowLaborDesc,
        bidExistCabling:  row.sowExistCabling,
        bidPlenum:        row.sowPlenum,
        bidExterior:      row.sowExterior,
        bidDropLength:    row.sowDropLength,
        bidConduit:       row.sowConduit,
        bidConnDevice:    row.sowConnDevice || '',
        bidConnDeviceIds: row.sowConnDeviceIds || [],
        bidConnTo:        '',
        bidConnToIds:     [],
        bidMdfIdf:        row.sowMdfIdf || '',
        bidMdfIdfIds:     [],
        requireSubBid:    cell.requireSubBid,
      };
    }

    ns.changeRequests.open({
      rowId:        rowId,
      pkgId:        pkgId,
      pkgName:      findPackageName(grid, pkgId),
      surveyId:     findPackageSurveyId(grid, pkgId),
      sowId:        sowId,
      sowName:      grid.sowName,
      sowItemId:    row.sowItem || '',
      displayLabel: row.displayLabel,
      productName:  row.productName,
      cell:         modalCell,
      // Always pass the real bid record as bidCell — the modal\'s
      // change-detection logic compares form values against it. When
      // sourceFromSow, modalCell holds SOW values and bidCell keeps
      // the bid values so the diff reads correctly.
      bidCell:      cell,
      sourceFromSow: !!opts.sourceFromSow,
      connOptions:  { bidConnDevice: connDevOpts, bidConnTo: connToOpts, bidMdfIdf: buildMdfIdfOptions() },
      gridRows:     grid.rows,
      visibility: {
        qty:        button.getAttribute('data-vis-qty') === '1',
        cabling:    button.getAttribute('data-vis-cabling') === '1',
        connDevice: button.getAttribute('data-vis-conn') === '1',
      },
    });
  }

  // ── remove from bid (per-cell) ────────────────────────────────

  function handleRemoveFromBid(button) {
    if (!_state || !ns.changeRequests) return;

    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');

    var grid = findSowGrid(sowId);
    if (!grid) return;

    var row = null;
    for (var i = 0; i < grid.rows.length; i++) {
      if (grid.rows[i].id === rowId) { row = grid.rows[i]; break; }
    }
    if (!row) return;

    var cell = row.cellsByPackage[pkgId];
    if (!cell) return;

    ns.changeRequests.openRemove({
      rowId:        rowId,
      pkgId:        pkgId,
      pkgName:      findPackageName(grid, pkgId),
      surveyId:     findPackageSurveyId(grid, pkgId),
      sowId:        sowId,
      sowName:      grid.sowName,
      sowItemId:    row.sowItem || '',
      displayLabel: row.displayLabel,
      productName:  row.productName,
      cell:         cell,
    });
  }

  // ── disconnect from SOW (per-row, on SOW detail cell) ──────
  //
  // Removes this SOW's id from the SOW Line Item's field_2154
  // connection (the SOW connection is multi-value — a single line
  // item can be on 1+ SOWs). The line item itself is NOT deleted; if
  // it's connected to other SOWs, it stays on those.
  //
  // Read path: Knack.views[view_3921].model lookup by record id →
  // field_2154_raw (array of {id, identifier}). Filter out the
  // current sowId. PUT the remaining ids to view_3921 via
  // SCW.knackAjax / SCW.knackRecordUrl. SCW.syncKnackModel keeps the
  // local model in sync so the silent refresh sees the new value.

  function handleDisconnectFromSow(button) {
    var rowId      = button.getAttribute('data-row-id');
    var sowId      = button.getAttribute('data-sow-id');
    var sowItemId  = button.getAttribute('data-sow-item-id');
    if (!sowId || !sowItemId) return;

    var grid = findSowGrid(sowId);
    var row  = null;
    if (grid) {
      for (var i = 0; i < grid.rows.length; i++) {
        if (grid.rows[i].id === rowId) { row = grid.rows[i]; break; }
      }
    }
    var sowName  = (grid && grid.sowName)        || 'this SOW';
    var itemName = (row && (row.displayLabel || row.productName)) || 'this line item';

    // ── Find accessories (mounting brackets, etc.) whose parent
    // line item (field_2464) points at this SOW item AND that are
    // connected to this SOW via field_2154. They have to be
    // disconnected too — otherwise they end up as orphan rows in
    // the Mounting Hardware section after the parent is removed.
    var accessoryField = 'field_2464';
    function findAccessoryRecords() {
      var v = Knack && Knack.views && Knack.views[CFG.sowItemsViewKey];
      var ms = v && v.model && v.model.data && v.model.data.models;
      var out = [];
      if (!ms) return out;
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        var a = m.attributes || {};
        var parentRaw = a[accessoryField + '_raw'];
        if (!Array.isArray(parentRaw) || !parentRaw.length) continue;
        var parentId = parentRaw[0] && parentRaw[0].id;
        if (parentId !== sowItemId) continue;
        var sowRaw = a[CFG.fieldKeys.sow + '_raw'];
        var connected = false;
        var remaining = [];
        if (Array.isArray(sowRaw)) {
          for (var j = 0; j < sowRaw.length; j++) {
            var s = sowRaw[j];
            if (!s || !s.id) continue;
            if (s.id === sowId) connected = true;
            else remaining.push(s.id);
          }
        }
        if (!connected) continue;
        out.push({ id: m.id, remainingSowIds: remaining });
      }
      return out;
    }
    var accessoryRecords = findAccessoryRecords();
    var accessoryCount   = accessoryRecords.length;
    var accessoryNote    = accessoryCount
      ? '\n\nThis will also disconnect ' + accessoryCount +
        ' linked accessory ' + (accessoryCount === 1 ? 'row' : 'rows') +
        ' (e.g. mounting brackets) from ' + sowName + '.'
      : '';

    if (!window.confirm(
      'Disconnect ' + itemName + ' from ' + sowName + '?\n\n' +
      'The line item itself will NOT be deleted. It will stay on any other ' +
      'SOWs it is connected to. Only the link between this line item and ' +
      sowName + ' is being removed.' + accessoryNote
    )) return;

    var view = Knack && Knack.views && Knack.views[CFG.sowItemsViewKey];
    var model = view && view.model && view.model.data && view.model.data.models;
    var record = null;
    if (model) {
      for (var mi = 0; mi < model.length; mi++) {
        if (model[mi].id === sowItemId) { record = model[mi]; break; }
      }
    }
    if (!record) {
      ns.renderToast('Could not locate SOW line item record on the page', 'error');
      return;
    }

    var attrs = record.attributes || {};
    var raw = attrs[CFG.fieldKeys.sow + '_raw'];
    var currentIds = [];
    if (Array.isArray(raw)) {
      for (var ri = 0; ri < raw.length; ri++) {
        if (raw[ri] && raw[ri].id) currentIds.push(raw[ri].id);
      }
    }
    if (!currentIds.length) {
      ns.renderToast('No SOW connection found on this line item', 'error');
      return;
    }

    var remainingIds = [];
    for (var ci = 0; ci < currentIds.length; ci++) {
      if (currentIds[ci] !== sowId) remainingIds.push(currentIds[ci]);
    }
    if (remainingIds.length === currentIds.length) {
      // SOW id wasn't on the record — UI is out of sync but the
      // user's intent is already satisfied. Refresh and bail.
      ns.renderToast('Line item was already disconnected from this SOW', 'info');
      ns.refresh && ns.refresh();
      return;
    }

    setBusy(button, true);

    var fieldKey = CFG.fieldKeys.sow; // field_2154
    var payload = {};
    payload[fieldKey] = remainingIds; // empty array clears the connection

    // The grid groups rows by field_2154 on TWO sources: SOW item
    // records (view_3921) AND bid records (view_3680). Both reference
    // the same SOW via the same field key. To make the comparison grid
    // actually drop the row from this SOW's section, we have to clear
    // the connection on both — clearing just the SOW item leaves the
    // bid record still pointing at this SOW, so the row keeps showing
    // up under this SOW even though the disconnect succeeded.
    function readBidRecordSowIds() {
      var bidView = Knack && Knack.views && Knack.views[CFG.viewKey];
      var bidModel = bidView && bidView.model && bidView.model.data
                     && bidView.model.data.models;
      if (!bidModel) return null;
      for (var mi = 0; mi < bidModel.length; mi++) {
        if (bidModel[mi].id === rowId) {
          var bAttrs = bidModel[mi].attributes || {};
          var bRaw = bAttrs[fieldKey + '_raw'];
          var ids = [];
          if (Array.isArray(bRaw)) {
            for (var bi = 0; bi < bRaw.length; bi++) {
              if (bRaw[bi] && bRaw[bi].id && bRaw[bi].id !== sowId) ids.push(bRaw[bi].id);
            }
          }
          return ids;
        }
      }
      return null;
    }

    function fetchBoth(done) {
      var pending = 0;
      function tick() { pending--; if (pending <= 0) done(); }

      var sowItemsView = Knack && Knack.views && Knack.views[CFG.sowItemsViewKey];
      if (sowItemsView && sowItemsView.model && typeof sowItemsView.model.fetch === 'function') {
        pending++;
        sowItemsView.model.fetch().always(tick);
      }
      var bidView = Knack && Knack.views && Knack.views[CFG.viewKey];
      if (bidView && bidView.model && typeof bidView.model.fetch === 'function') {
        pending++;
        bidView.model.fetch().always(tick);
      }
      if (pending === 0) done();
    }

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(CFG.sowItemsViewKey, sowItemId),
      type: 'PUT',
      data: JSON.stringify(payload),
      success: function (resp) {
        if (typeof SCW.syncKnackModel === 'function') {
          SCW.syncKnackModel(CFG.sowItemsViewKey, sowItemId, resp, fieldKey, remainingIds);
        }

        // Second stage: clear this SOW from the bid record's
        // field_2154 (so the comparison grid stops grouping the bid
        // under this SOW) AND from any accessory SOW items whose
        // field_2464 parent is the row we just disconnected (so
        // mounting brackets etc. don't strand in the Mounting
        // Hardware section). Fire in parallel; finish when all done.
        var bidIds = readBidRecordSowIds();
        var pending = 0;
        var accessoryFailures = 0;
        var bidFailed = false;

        function maybeFinish() {
          if (pending > 0) return;
          setBusy(button, false);
          var msg = 'Line item disconnected from ' + sowName;
          if (accessoryCount) {
            var cleared = accessoryCount - accessoryFailures;
            if (cleared > 0) {
              msg += ' (' + cleared + ' accessory ' +
                     (cleared === 1 ? 'row' : 'rows') + ' also cleared)';
            }
            if (accessoryFailures) {
              msg += ' — ' + accessoryFailures + ' accessory ' +
                     (accessoryFailures === 1 ? 'row' : 'rows') +
                     ' failed to update';
            }
          }
          if (bidFailed) {
            ns.renderToast('SOW item disconnected, but the bid record still references this SOW. Try again to clear it fully.', 'info');
          } else {
            ns.renderToast(msg, accessoryFailures ? 'info' : 'success');
          }
          fetchBoth(function () { if (ns.refresh) ns.refresh(); });
        }

        // Bid record PUT
        if (bidIds !== null) {
          pending++;
          var bidPayload = {};
          bidPayload[fieldKey] = bidIds;
          SCW.knackAjax({
            url:  SCW.knackRecordUrl(CFG.viewKey, rowId),
            type: 'PUT',
            data: JSON.stringify(bidPayload),
            success: function (bResp) {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(CFG.viewKey, rowId, bResp, fieldKey, bidIds);
              }
              pending--; maybeFinish();
            },
            error: function (bxhr) {
              if (CFG.debug) console.warn('[BidReview] Disconnect bid-record PUT failed:', bxhr && bxhr.status, bxhr && bxhr.responseText);
              bidFailed = true;
              pending--; maybeFinish();
            }
          });
        }

        // Accessory PUTs (one per child SOW item, parallel)
        for (var ai = 0; ai < accessoryRecords.length; ai++) {
          (function (rec) {
            pending++;
            var accPayload = {};
            accPayload[fieldKey] = rec.remainingSowIds;
            SCW.knackAjax({
              url:  SCW.knackRecordUrl(CFG.sowItemsViewKey, rec.id),
              type: 'PUT',
              data: JSON.stringify(accPayload),
              success: function (aResp) {
                if (typeof SCW.syncKnackModel === 'function') {
                  SCW.syncKnackModel(CFG.sowItemsViewKey, rec.id, aResp, fieldKey, rec.remainingSowIds);
                }
                pending--; maybeFinish();
              },
              error: function (axhr) {
                if (CFG.debug) console.warn('[BidReview] Accessory disconnect PUT failed for', rec.id, ':', axhr && axhr.status, axhr && axhr.responseText);
                accessoryFailures++;
                pending--; maybeFinish();
              }
            });
          })(accessoryRecords[ai]);
        }

        // Nothing to do in the second stage — finish immediately.
        if (pending === 0) maybeFinish();
      },
      error: function (xhr) {
        setBusy(button, false);
        if (CFG.debug) console.warn('[BidReview] Disconnect from SOW failed:', xhr && xhr.status, xhr && xhr.responseText);
        ns.renderToast('Disconnect failed — please try again', 'error');
      }
    });
  }

  // ── add to bid (per-cell, for No Bid rows) ─────────────────

  function handleAddToBid(button) {
    if (!_state || !ns.changeRequests) return;

    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');

    var grid = findSowGrid(sowId);
    if (!grid) return;

    var row = null;
    for (var i = 0; i < grid.rows.length; i++) {
      if (grid.rows[i].id === rowId) { row = grid.rows[i]; break; }
    }
    if (!row) return;

    // Derive visibility from proposal bucket (same logic as render.js)
    var isCamReader = row.proposalBucketId === CAM_READER_BUCKET_ID;
    var hasMapConn = /^yes$/i.test(String(row.sowMapConn || '').trim())
                   || /^yes$/i.test(String(row.bidMapConn || '').trim());
    var showConn = hasMapConn && !isCamReader;
    var vis = {
      qty:        row.sowQty > 1,
      cabling:    isCamReader,
      connDevice: showConn,
    };

    // Build connection options when Connected Devices or Connected To is visible
    var connOpts = { bidMdfIdf: buildMdfIdfOptions() };
    if (showConn || isCamReader) {
      var addConn = buildAddConnOptions(grid);
      connOpts.bidConnDevice = addConn.bidConnDevice;
      connOpts.bidConnTo     = addConn.bidConnTo;
    }

    if (ns.changeRequests.openAddItem) {
      ns.changeRequests.openAddItem({
        rowId:        rowId,
        pkgId:        pkgId,
        pkgName:      findPackageName(grid, pkgId),
        surveyId:     findPackageSurveyId(grid, pkgId),
        sowId:        sowId,
        sowName:      grid.sowName,
        sowItemId:    row.sowItem || '',
        displayLabel: row.displayLabel,
        productName:  row.productName,
        // SOW data for pre-fill
        sowProduct:       row.sowProduct,
        sowQty:           row.sowQty,
        sowFee:           row.sowFee,
        sowLaborDesc:     row.sowLaborDesc,
        sowExistCabling:  row.sowExistCabling,
        sowPlenum:        row.sowPlenum,
        sowExterior:      row.sowExterior,
        sowDropLength:    row.sowDropLength,
        sowConduit:       row.sowConduit,
        sowMdfIdf:        row.mdfIdf || '',
        sowMdfIdfIds:     row.mdfIdfIds || [],
        proposalBucket:   row.proposalBucket || '',
        proposalBucketId: row.proposalBucketId || '',
        sortOrder:        row.sortOrder || 0,
        sowMapConn:       row.sowMapConn || '',
        connOptions:      connOpts,
        gridRows:         grid.rows,
        visibility:       vis,
      });
    } else {
      ns.renderToast('Add to Bid not yet implemented', 'info');
    }
  }

  // ── row-level action ────────────────────────────────────────

  function handleRowAction(button, actionType) {
    var rowId = button.getAttribute('data-row-id');
    var pkgId = button.getAttribute('data-package-id');
    var sowId = button.getAttribute('data-sow-id');

    setBusy(button, true);

    var payload = {
      actionType:  actionType,
      reviewRowId: rowId,
    };

    if (pkgId) payload.packageId = pkgId;
    if (sowId) payload.sowId     = sowId;

    // row_add_to_sow needs the FULL source line-item record so Make can
    // build the SOW item. Find the row in state (by sowId, then any grid)
    // and ship its raw record (every field_NNNN + field_NNNN_raw).
    if (actionType === 'row_add_to_sow') {
      var srcRow = null;
      var grid = findSowGrid(sowId);
      if (grid) {
        for (var i = 0; i < grid.rows.length; i++) {
          if (grid.rows[i].id === rowId) { srcRow = grid.rows[i]; break; }
        }
      }
      if (!srcRow && _state) {
        for (var g = 0; g < _state.sowGrids.length && !srcRow; g++) {
          var rws = _state.sowGrids[g].rows;
          for (var r = 0; r < rws.length; r++) {
            if (rws[r].id === rowId) { srcRow = rws[r]; break; }
          }
        }
      }
      if (srcRow && srcRow._rawRecord) payload.sourceRecord = srcRow._rawRecord;
    }

    ns.submitAction(payload).done(function () {
      refreshSilently();
    }).always(function () {
      setBusy(button, false);
    });
  }

  // ── busy state helper ───────────────────────────────────────

  function setBusy(button, busy) {
    if (busy) {
      button.classList.add('scw-bid-review__btn--busy');
      button.setAttribute('data-original-text', button.textContent);
      button.textContent = 'Sending\u2026';
    } else {
      button.classList.remove('scw-bid-review__btn--busy');
      var orig = button.getAttribute('data-original-text');
      if (orig) button.textContent = orig;
    }
  }

  // ── public: refresh ─────────────────────────────────────────

  ns.refresh = function refresh() {
    runPipeline();
  };

  // Photo thumb click handler in render.js calls this to open the
  // editor with a side-by-side photo viewer pane.
  ns.openWithPhoto = openWithPhoto;

  /** Lightweight re-render from existing state (no data refetch). */
  ns.rerender = function rerender() {
    if (!_state) return;
    var mount = ns.renderMatrix(_state);
    attachClickHandler(mount);
    if (ns.changeRequests && ns.changeRequests.rehydrate) {
      ns.changeRequests.rehydrate(_state.sowGrids);
    }
  };

  ns.lookupCell = function (rowId, pkgId) {
    if (!_state) return null;
    for (var g = 0; g < _state.sowGrids.length; g++) {
      var rows = _state.sowGrids[g].rows;
      for (var r = 0; r < rows.length; r++) {
        if (rows[r].id === rowId) return rows[r].cellsByPackage[pkgId] || null;
      }
    }
    return null;
  };

  /**
   * Create a bid CR from a sales revision record.
   * Called by the sales-revision-column when user clicks "Create Bid CR".
   *
   * @param {Object} opts
   * @param {string} opts.sowItemId  — SOW line item record ID (field_2708)
   * @param {string} opts.action     — 'remove' | 'revise' | 'add'
   * @param {string} opts.changeNotes — pre-filled notes from the revision
   * @param {Object} opts.revJson    — full revision JSON data
   */
  ns.createBidCRFromRevision = function (opts) {
    if (!_state || !ns.changeRequests) return;

    var sowItemId  = opts.sowItemId || '';

    // Find the grid row that matches this SOW item
    var grid = null, row = null;
    for (var g = 0; g < _state.sowGrids.length; g++) {
      var sg = _state.sowGrids[g];
      for (var r = 0; r < sg.rows.length; r++) {
        if (sg.rows[r].sowItem === sowItemId || sg.rows[r].id === sowItemId) {
          grid = sg;
          row = sg.rows[r];
          break;
        }
      }
      if (row) break;
    }

    if (!grid || !row) {
      if (ns.renderToast) ns.renderToast('Could not find matching grid row', 'error');
      return;
    }

    var pkgIds = Object.keys(row.cellsByPackage);
    if (!pkgIds.length && grid.packages) {
      for (var pi = 0; pi < grid.packages.length; pi++) {
        pkgIds.push(grid.packages[pi].id);
      }
    }
    if (!pkgIds.length) {
      if (ns.renderToast) ns.renderToast('No bid packages available', 'error');
      return;
    }

    // Read values from the revision line item record in view_3842 DOM
    var REV_FIELD_MAP = {
      rate:            'field_2648',
      laborDesc:       'field_2649',
      bidExistCabling: 'field_2650',
      bidExterior:     'field_2651',
      bidPlenum:       'field_2652',
      bidConduit:      'field_2718',
      bidDropLength:   'field_2719',
    };

    function readRevisionRecord(revRecordId) {
      var requested = {};
      if (!revRecordId) return requested;
      var tr = document.getElementById(revRecordId);
      if (!tr) {
        var viewEl = document.getElementById('view_3842');
        if (viewEl) tr = viewEl.querySelector('tr[id="' + revRecordId + '"]');
      }
      if (!tr) return requested;

      for (var logicalKey in REV_FIELD_MAP) {
        var fk = REV_FIELD_MAP[logicalKey];
        var td = tr.querySelector('td.' + fk);
        if (!td) continue;
        var val = (td.textContent || '').replace(/[\u00a0\s]+/g, ' ').trim();
        if (val && val !== '&nbsp;') requested[logicalKey] = val;
      }

      // Connection fields: bidConnDevice (field_2646), bidConnTo (field_2647), bidMdfIdf (field_2720)
      var connFields = [
        { key: 'bidConnDevice', field: 'field_2646', idsKey: 'bidConnDeviceIds' },
        { key: 'bidConnTo',     field: 'field_2647', idsKey: 'bidConnToIds' },
        { key: 'bidMdfIdf',     field: 'field_2720', idsKey: 'bidMdfIdfIds' },
      ];
      for (var ci = 0; ci < connFields.length; ci++) {
        var cf = connFields[ci];
        var ctd = tr.querySelector('td.' + cf.field);
        if (!ctd) continue;
        var spans = ctd.querySelectorAll('span[data-kn="connection-value"]');
        if (!spans.length) continue;
        var labels = [], ids = [];
        for (var si = 0; si < spans.length; si++) {
          var cid = (spans[si].className || '').trim();
          var lbl = (spans[si].textContent || '').trim();
          if (/^[0-9a-f]{24}$/i.test(cid)) { ids.push(cid); labels.push(lbl); }
        }
        if (labels.length) requested[cf.key] = labels.join(', ');
        if (ids.length) requested[cf.idsKey] = ids;
      }

      return requested;
    }

    function doOpen(pkgId) {
      var action = opts.action || 'revise';
      var revJson = opts.revJson || {};
      var notes = revJson.changeNotes || opts.changeNotes || '';

      // Map JSON requested fields (sales CR field keys → bid modal keys)
      var jr = revJson.requested || {};
      var SALES_MAP = {
        field_1949: 'sowProduct',      field_1964: 'sowQty',
        field_2150: 'sowFee',          field_2020: 'sowLaborDesc',
        field_2461: 'sowExistCabling', field_1984: 'sowExterior',
        field_1983: 'sowPlenum',       field_1965: 'sowDropLength',
        field_2035: 'sowConduit',      field_1946: 'sowMdfIdf',
        field_1957: 'sowConnDevice',   field_2197: 'sowConnTo',
      };
      var mapped = {};
      for (var sk in SALES_MAP) {
        if (jr[sk] != null && jr[sk] !== '') mapped[SALES_MAP[sk]] = jr[sk];
        if (jr[sk + '_ids']) mapped[SALES_MAP[sk] + 'Ids'] = jr[sk + '_ids'];
      }
      // Top-level JSON fields as fallback
      if (!mapped.sowProduct && revJson.productName) mapped.sowProduct = revJson.productName;
      // Normalize boolean "true"/"false" → "Yes"/"No"
      var boolKeys = ['sowExistCabling', 'sowExterior', 'sowPlenum'];
      for (var bi = 0; bi < boolKeys.length; bi++) {
        var bv = mapped[boolKeys[bi]];
        if (bv === 'true') mapped[boolKeys[bi]] = 'Yes';
        else if (bv === 'false') mapped[boolKeys[bi]] = 'No';
      }

      if (action === 'add') {
        row._revOverlay = {
          sowProduct:      mapped.sowProduct || row.sowProduct || '',
          sowQty:          mapped.sowQty || row.sowQty || '',
          sowFee:          mapped.sowFee || row.sowFee || '',
          sowLaborDesc:    mapped.sowLaborDesc || row.sowLaborDesc || '',
          sowExistCabling: mapped.sowExistCabling || row.sowExistCabling || '',
          sowPlenum:       mapped.sowPlenum || row.sowPlenum || '',
          sowExterior:     mapped.sowExterior || row.sowExterior || '',
          sowDropLength:   mapped.sowDropLength || row.sowDropLength || '',
          sowConduit:      mapped.sowConduit || row.sowConduit || '',
          sowMdfIdf:       mapped.sowMdfIdf || row.sowMdfIdf || '',
          sowMdfIdfIds:    mapped.sowMdfIdfIds || row.sowMdfIdfIds || [],
          sowConnDevice:   mapped.sowConnDevice || '',
          sowConnDeviceIds: mapped.sowConnDeviceIds || [],
          sowConnTo:       mapped.sowConnTo || '',
          sowConnToIds:    mapped.sowConnToIds || [],
        };
      } else if (action !== 'remove') {
        // For REVISE: merge JSON values into the cell using bid logical keys
        var BID_MAP = {
          field_1949: 'productName', field_1964: 'qty', field_2150: 'rate',
          field_2020: 'laborDesc', field_2461: 'bidExistCabling',
          field_1984: 'bidExterior', field_1983: 'bidPlenum',
          field_1965: 'bidDropLength', field_2035: 'bidConduit',
          field_1946: 'bidMdfIdf',
        };
        var cell = row.cellsByPackage[pkgId];
        if (cell) {
          for (var bk in BID_MAP) {
            if (jr[bk] != null && jr[bk] !== '') cell[BID_MAP[bk]] = jr[bk];
            if (jr[bk + '_ids']) cell[BID_MAP[bk] + 'Ids'] = jr[bk + '_ids'];
          }
        }
      }

      executeBidCR(grid, row, pkgId, action, notes, {
        salesRevisionId: opts.revisionRecordId || '',
        salesRevisionRequestId: opts.revisionRequestId || '',
      });
      delete row._revOverlay;
    }

    var choices = [];
    for (var p = 0; p < pkgIds.length; p++) {
      choices.push({ id: pkgIds[p], name: findPackageName(grid, pkgIds[p]) });
    }
    if (choices.length === 1) {
      doOpen(choices[0].id);
    } else {
      showPackagePicker(choices, doOpen);
    }
  };

  function executeBidCR(grid, row, pkgId, action, notes, revMeta) {
    var cell = row.cellsByPackage[pkgId];

    var params = {
      rowId:        row.id,
      pkgId:        pkgId,
      pkgName:      findPackageName(grid, pkgId),
      surveyId:     findPackageSurveyId(grid, pkgId),
      sowId:        grid.sowId,
      sowName:      grid.sowName,
      sowItemId:    row.sowItem || '',
      displayLabel: row.displayLabel,
      productName:  row.productName,
      cell:         cell || {},
      revMeta:      revMeta || null,
      proposalBucket:   row.proposalBucket || '',
      proposalBucketId: row.proposalBucketId || '',
    };

    if (action === 'remove') {
      if (!cell) return;
      params.prefillNotes = notes;
      ns.changeRequests.openRemove(params);
    } else if (action === 'add') {
      // Add to bid — use the add-item flow
      // If _revOverlay exists (from sales revision), use revision data as prefill
      var ov = row._revOverlay || {};
      params.sowProduct    = ov.sowProduct || row.sowProduct || row.productName || '';
      params.sowQty        = ov.sowQty || row.sowQty || '';
      params.sowLaborDesc  = ov.sowLaborDesc || row.sowLaborDesc || '';
      params.sowFee        = ov.sowFee || row.sowFee || '';
      params.sowExistCabling = ov.sowExistCabling || row.sowExistCabling || '';
      params.sowPlenum     = ov.sowPlenum || row.sowPlenum || '';
      params.sowExterior   = ov.sowExterior || row.sowExterior || '';
      params.sowDropLength = ov.sowDropLength || row.sowDropLength || '';
      params.sowConduit    = ov.sowConduit || row.sowConduit || '';
      params.sowMdfIdf     = ov.sowMdfIdf || row.sowMdfIdf || '';
      params.sowMdfIdfIds  = ov.sowMdfIdfIds || row.sowMdfIdfIds || [];
      params.sowConnDevice    = ov.sowConnDevice || '';
      params.sowConnDeviceIds = ov.sowConnDeviceIds || [];
      params.sowConnTo        = ov.sowConnTo || '';
      params.sowConnToIds     = ov.sowConnToIds || [];
      params.sowMapConn    = row.sowMapConn || '';
      // Build connection options from grid rows
      var addConnDev = [], addConnTo = [];
      var addSeenDev = {}, addSeenTo = {};
      var ADD_CAM = '6481e5ba38f283002898113c';
      for (var aci = 0; aci < grid.rows.length; aci++) {
        var acr = grid.rows[aci];
        var acpkgs = Object.keys(acr.cellsByPackage);
        for (var acpi = 0; acpi < acpkgs.length; acpi++) {
          var acc = acr.cellsByPackage[acpkgs[acpi]];
          if (!acc.id) continue;
          var acLbl = acr.displayLabel || acr.productName || acc.productName || acc.id;
          if (acr.proposalBucketId === ADD_CAM && !addSeenDev[acc.id]) {
            addSeenDev[acc.id] = true;
            var acConnTo = acc.bidConnTo ? String(acc.bidConnTo).trim() : '';
            addConnDev.push({ id: acc.id, identifier: acLbl, currentConnTo: acConnTo || null });
          }
          if (acc.mapConnections && !addSeenTo[acc.id]) {
            addSeenTo[acc.id] = true;
            addConnTo.push({ id: acc.id, identifier: acLbl });
          }
        }
      }
      params.connOptions = { bidConnDevice: addConnDev, bidConnTo: addConnTo, bidMdfIdf: buildMdfIdfOptions() };
      // Visibility: connDevice only if field_2231=Yes on SOW row;
      // cabling (includes Connected To) only if bucket is Camera or Reader
      var showConn = (row.sowMapConn === 'Yes' || row.sowMapConn === 'true');
      var isCamReader = (row.proposalBucketId === '6481e5ba38f283002898113c');
      params.visibility    = { qty: true, cabling: isCamReader, connDevice: showConn };
      params.gridRows      = grid.rows;
      ns.changeRequests.openAddItem(params);
    } else {
      if (!cell) return;
      // Build connection options from grid rows (same as normal revise flow)
      var connDevOpts2 = [], connToOpts2 = [];
      var seenDev2 = {}, seenTo2 = {};
      var CAM_READER = '6481e5ba38f283002898113c';
      for (var cri = 0; cri < grid.rows.length; cri++) {
        var cr = grid.rows[cri];
        var cpkgs = Object.keys(cr.cellsByPackage);
        for (var cpi = 0; cpi < cpkgs.length; cpi++) {
          var cc = cr.cellsByPackage[cpkgs[cpi]];
          if (!cc.id || cc.id === cell.id) continue;
          var lbl = cr.displayLabel || cr.productName || cc.productName || cc.id;
          if (cr.proposalBucketId === CAM_READER && !seenDev2[cc.id]) {
            seenDev2[cc.id] = true;
            var connTo2 = cc.bidConnTo ? String(cc.bidConnTo).trim() : '';
            connDevOpts2.push({ id: cc.id, identifier: lbl, currentConnTo: connTo2 || null });
          }
          if (cc.mapConnections && !seenTo2[cc.id]) {
            seenTo2[cc.id] = true;
            connToOpts2.push({ id: cc.id, identifier: lbl });
          }
        }
      }
      var showConn2 = cell.mapConnections || row.sowMapConn === 'Yes' || row.sowMapConn === 'true';
      var isCamReader2 = (row.proposalBucketId === CAM_READER);
      params.connOptions = { bidConnDevice: connDevOpts2, bidConnTo: connToOpts2, bidMdfIdf: buildMdfIdfOptions() };
      params.visibility = { qty: true, cabling: isCamReader2, connDevice: showConn2 };
      params.gridRows = grid.rows;
      ns.changeRequests.open(params);
    }
  }

  /**
   * Batch-convert an array of sales revision data into pending bid CRs
   * for a specific package. No modals — items are created silently.
   *
   * @param {Array} revisions — [{sowItemId, action, changeNotes, revJson, revisionRecordId}]
   * @param {string} pkgId    — target bid package
   */
  ns.batchConvertRevisions = function (revisions, pkgId) {
    if (!_state || !ns.changeRequests) return 0;

    var count = 0;
    for (var i = 0; i < revisions.length; i++) {
      var rev = revisions[i];
      var action = rev.action || 'revise';
      var sowItemId = rev.sowItemId || '';

      // Find matching grid row
      var grid = null, row = null;
      for (var g = 0; g < _state.sowGrids.length; g++) {
        var sg = _state.sowGrids[g];
        for (var r = 0; r < sg.rows.length; r++) {
          if (sg.rows[r].sowItem === sowItemId || sg.rows[r].id === sowItemId) {
            grid = sg; row = sg.rows[r]; break;
          }
        }
        if (row) break;
      }
      if (!grid || !row) continue;

      var cell = row.cellsByPackage[pkgId] || {};
      var pkgName = findPackageName(grid, pkgId);
      var surveyId = findPackageSurveyId(grid, pkgId);

      var item;
      if (action === 'remove') {
        item = {
          rowId:         row.id,
          bidRecordId:   cell.id || null,
          sowItemId:     row.sowItem || '',
          displayLabel:  row.displayLabel,
          productName:   row.productName || cell.productName || '',
          removeFromBid: true,
          current:       {},
          requested:     {},
          changeNotes:   rev.changeNotes || '',
          salesRevisionId: rev.revisionRecordId || '',
          salesRevisionRequestId: rev.revisionRequestId || '',
        };
      } else if (action === 'add') {
        var req = {};
        if (rev.revJson) {
          req.productName = rev.revJson.productName || row.sowProduct || '';
          if (row.sowQty) req.qty = row.sowQty;
        }
        item = {
          rowId:        row.id,
          bidRecordId:  null,
          sowItemId:    row.sowItem || row.id,
          displayLabel: row.displayLabel || row.sowProduct || '',
          productName:  req.productName || row.sowProduct || row.productName || '',
          addToBid:     true,
          current:      {},
          requested:    req,
          changeNotes:  rev.changeNotes || '',
          salesRevisionId: rev.revisionRecordId || '',
          salesRevisionRequestId: rev.revisionRequestId || '',
        };
      } else {
        // Revise — snapshot current from cell, apply revision fields
        var current = {};
        var requested = {};
        if (rev.revJson && rev.revJson.fields) {
          for (var fi = 0; fi < rev.revJson.fields.length; fi++) {
            var f = rev.revJson.fields[fi];
            if (f.from != null) current[f.field] = f.from;
            requested[f.field] = f.to;
            if (f.fromIds) current[f.field + 'Ids'] = f.fromIds;
            if (f.toIds) requested[f.field + 'Ids'] = f.toIds;
          }
        }
        item = {
          rowId:        row.id,
          bidRecordId:  cell.id || null,
          sowItemId:    row.sowItem || '',
          displayLabel: row.displayLabel,
          productName:  row.productName || cell.productName || '',
          current:      current,
          requested:    requested,
          changeNotes:  rev.changeNotes || '',
          salesRevisionId: rev.revisionRecordId || '',
          salesRevisionRequestId: rev.revisionRequestId || '',
          revisionFields: (rev.revJson && rev.revJson.fields) || [],
        };
      }

      ns.changeRequests.addSilent(pkgId, pkgName, grid.sowId, grid.sowName, item, surveyId);
      count++;
    }

    if (ns.rerender) ns.rerender();
    return count;
  };

  function showPackagePicker(choices, onSelect) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:10px;padding:20px;min-width:240px;font:13px/1.45 system-ui,sans-serif;';
    modal.innerHTML = '<div style="font-size:16px;font-weight:700;margin-bottom:12px;">Select Bid Package</div>';

    for (var i = 0; i < choices.length; i++) {
      var btn = document.createElement('button');
      btn.style.cssText = 'display:block;width:100%;padding:8px 14px;margin-bottom:6px;border:1px solid #e2e8f0;border-radius:5px;background:#f8fafc;color:#1e293b;font:600 13px/1 system-ui,sans-serif;cursor:pointer;text-align:left;';
      btn.textContent = choices[i].name;
      btn.setAttribute('data-pkg-id', choices[i].id);
      btn.addEventListener('click', function () {
        var pkgId = this.getAttribute('data-pkg-id');
        overlay.remove();
        onSelect(pkgId);
      });
      modal.appendChild(btn);
    }

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  // ── force views to load 1000 records per page ───────────────

  /**
   * Set a view's "per page" dropdown to 1000 so Knack natively loads
   * all records into its model cache. Returns true if the view already
   * had 1000 selected (ready to proceed); false if we just changed it
   * (Knack will re-render the view with full data).
   */
  function ensureFullPage(viewKey) {
    var $select = $('#' + viewKey + ' select[name="limit"]');
    if ($select.length && $select.val() !== '1000') {
      $select.val('1000').trigger('change');
      return false; // Knack will re-render — not ready yet
    }
    return true; // already at 1000 (or no dropdown found)
  }

  // ── multi-view readiness tracking ────────────────────────────
  //
  // The matrix depends on three Knack views:
  //   view_3680  — bid records (primary)
  //   view_3921  — unbid SOW items (noBid rows)
  //   view_3573  — bid packages (PDF links)
  //
  // On first page load the secondary views may not have rendered
  // when the primary fires.  We track all three and only run the
  // pipeline once all are ready — or after a fallback timeout so
  // the grid still appears (the API adapter retries for missing data).

  var _viewsReady      = {};
  var _pipelineQueued  = false;
  var _fallbackTimer   = null;

  function allViewsReady() {
    if (!_viewsReady[CFG.viewKey]) return false;
    if (!_viewsReady[CFG.sowItemsViewKey]) return false;
    if (CFG.bidPackagesViewKey && !_viewsReady[CFG.bidPackagesViewKey]) return false;
    return true;
  }

  function schedulePipeline() {
    if (_pipelineQueued) return;
    _pipelineQueued = true;
    if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
    setTimeout(function () {
      _pipelineQueued = false;
      runPipeline();
    }, CFG.renderDelay);
  }

  function checkViewsAndRun() {
    if (!_viewsReady[CFG.viewKey]) return;   // primary must be ready
    if (allViewsReady()) {
      schedulePipeline();
    }
  }

  // ── init on view render ─────────────────────────────────────

  function init() {
    ns.injectStyles();

    // Primary view — bid records
    SCW.onViewRender(CFG.viewKey, function () {
      var ready = ensureFullPage(CFG.viewKey);
      if (!ready) return;    // Knack will re-render with full data

      // Kick SOW items pagination if already visible (belt-and-suspenders)
      ensureFullPage(CFG.sowItemsViewKey);

      _viewsReady[CFG.viewKey] = true;
      checkViewsAndRun();

      // Fallback: if secondary views haven't rendered within 3 s,
      // run anyway — loadRawData will use the API adapter for missing data.
      if (!_fallbackTimer && !allViewsReady()) {
        _fallbackTimer = setTimeout(function () {
          _fallbackTimer = null;
          if (!allViewsReady()) {
            if (CFG.debug) {
              SCW.debug('[BidReview] Timeout waiting for:',
                !_viewsReady[CFG.sowItemsViewKey] ? CFG.sowItemsViewKey : '',
                CFG.bidPackagesViewKey && !_viewsReady[CFG.bidPackagesViewKey] ? CFG.bidPackagesViewKey : '');
            }
            schedulePipeline();
          }
        }, 3000);
      }
    }, CFG.eventNs);

    // SOW items view — unbid rows (noBid)
    SCW.onViewRender(CFG.sowItemsViewKey, function () {
      var ready = ensureFullPage(CFG.sowItemsViewKey);
      if (!ready) return;
      _viewsReady[CFG.sowItemsViewKey] = true;
      checkViewsAndRun();
    }, CFG.eventNs + 'Sow');

    // Bid packages view — PDF links
    if (CFG.bidPackagesViewKey) {
      SCW.onViewRender(CFG.bidPackagesViewKey, function () {
        _viewsReady[CFG.bidPackagesViewKey] = true;
        checkViewsAndRun();
      }, CFG.eventNs + 'Pkg');
    }

    // Change request view — pending CR counts + links (DOM-scraped)
    if (CFG.changeRequestViewKey) {
      SCW.onViewRender(CFG.changeRequestViewKey, function () {
        // Route through the debounced scheduler so a CR-view render
        // bursting alongside knack-cell-update + scw-record-saved
        // collapses into one refresh instead of three.
        if (_state) scheduleSilentRefresh();
      }, CFG.eventNs + 'Cr');
    }

    // Next-step source view — when view_3325 re-renders (e.g. after a
    // Survey Costs save or an ops-stepper action elsewhere), re-render
    // the SOW status bars so margin / next-step / proposal info refresh.
    // Lightweight rerender — no data refetch on bid-review side.
    if (CFG.nextStepViewKey) {
      SCW.onViewRender(CFG.nextStepViewKey, function () {
        if (_state && ns.rerender) ns.rerender();
      }, CFG.eventNs + 'NextStep');
    }
    // ── Scene cleanup ───────────────────────────────────────────
    // The matrix mount (#bid-review-matrix) is inserted as a sibling of
    // view_44 (the global nav menu) — see render.js getOrCreateMount.
    // Because view_44 is outside any scene container, Knack's scene
    // swap doesn't remove our matrix div. Without explicit cleanup the
    // matrix stays in the DOM and renders on top of every subsequent
    // page until the user reloads. Watch every scene render and tear
    // it down whenever the active scene isn't this feature's scene.
    $(document)
      .off('knack-scene-render.any' + CFG.eventNs + 'Cleanup')
      .on('knack-scene-render.any' + CFG.eventNs + 'Cleanup', function (event, scene) {
        if (!scene || scene.key === CFG.sceneKey) return;
        var matrix = document.querySelector(CFG.mountSelector);
        if (matrix && matrix.parentNode) matrix.parentNode.removeChild(matrix);
        document.body.classList.remove('scw-bid-review-active');
        // Reset readiness flags so the next visit to scene_1155 does
        // a fresh load instead of believing it's still primed.
        _viewsReady = {};
        if (_fallbackTimer) { clearTimeout(_fallbackTimer); _fallbackTimer = null; }
      });
  }

  init();

})();
