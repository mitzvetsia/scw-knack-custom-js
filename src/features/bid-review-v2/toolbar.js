/*** BID REVIEW V2 — TOOLBAR **************************************************
 *
 * Comparison-grid toolbar — same button set as worksheet-v2's toolbar
 * (src/features/worksheet-v2/toolbar.js), EXCEPT the photos show/hide
 * toggle (photo strips aren't part of this grid's card layout). No
 * "Summary only" mode either — that view is a per-product money breakout
 * built for a single-bid worksheet card and has no analog on a grid that
 * already shows every bid side by side.
 *
 *   - Expand/Collapse MDF/IDFs : global — every SOW's groups at once.
 *                                Each SOW still keeps its own per-SOW
 *                                Expand all/Collapse all button; both stay
 *                                in sync (init.js toggleAllGroups).
 *   - Expand/Collapse line items : every row's detail panel, whole grid.
 *   - + Add to SOW  : reuse Knack's "Add to Scope" link
 *   - + Add MDF/IDF : auto-appears the moment the scene carries a Knack
 *                     "Add MDF/IDF" menu link (same auto-detect as
 *                     worksheet-v2's deploy-page button) — no config
 *                     needed, renders nothing when no such link exists.
 *   - + Add Photos  : SCW.bulkUpload modal (SOW photo context)
 *
 * Reuses worksheet-v2's .scw-ws-v2-toolbar* CSS (injected globally).
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function getContainer() {
    return document.getElementById(ns.CONFIG && ns.CONFIG.mountId);
  }

  function btn(action, label, title, cta) {
    return '<button type="button" class="scw-ws-v2-toolbar-btn' +
      (cta ? ' scw-ws-v2-toolbar-btn--cta' : '') + '" ' +
      'data-scw-br-v2-tb="' + action + '" title="' + esc(title) + '">' +
      esc(label) + '</button>';
  }

  // ── Add-MDF/IDF link discovery — same auto-detect as worksheet-v2's
  // toolbar (findAddMdfMenuLink there). No addMdfMenuView config exists
  // for scene_1155 yet, so this only ever fires off a real Knack menu
  // link literally titled "Add MDF/IDF" — fails safe to "no button" when
  // none is on the scene, same precedent as the deploy-page rollout. ──
  function findAddMdfMenuLink() {
    var menus = document.querySelectorAll('.kn-menu.kn-view');
    for (var m = 0; m < menus.length; m++) {
      var links = menus[m].querySelectorAll('a[href]');
      for (var i = 0; i < links.length; i++) {
        if (/^add\s*mdf\s*\/\s*idf$/i.test((links[i].textContent || '').trim())) {
          return { link: links[i], menu: menus[m], solo: links.length === 1 };
        }
      }
    }
    return null;
  }
  function addMdfAvailable() {
    var found = findAddMdfMenuLink();
    if (!found) return false;
    if (found.solo) found.menu.style.setProperty('display', 'none', 'important');
    return true;
  }

  function build() {
    var mdfAvailable = addMdfAvailable();
    var bar = document.createElement('div');
    bar.className = 'scw-ws-v2-toolbar scw-bid-review-v2__toolbar';
    bar.innerHTML =
      '<div class="scw-ws-v2-toolbar-group" role="group" aria-label="View">' +
        // Expand⇄collapse EVERY SOW's MDF/IDF groups at once. Label flips
        // with the live state (syncLabels below). Each SOW keeps its own
        // per-SOW Expand all/Collapse all button too — init.js keeps both
        // in sync (toggleAllGroups updates the per-SOW label as it goes).
        '<button type="button" class="scw-ws-v2-toolbar-btn" ' +
          'data-scw-br-v2-tb="groups-toggle" ' +
          'title="Open or close every SOW’s MDF/IDF groups">' +
          'Expand MDF/IDFs</button>' +
        // Expand⇄collapse every line item's detail panel across the whole
        // grid. Label flips with the live state (syncLabels below). Same
        // idiom as worksheet-v2's "Expand line items" button.
        '<button type="button" class="scw-ws-v2-toolbar-btn" ' +
          'data-scw-br-v2-tb="rows-toggle" ' +
          'title="Open or close every line item’s detail panel">' +
          'Expand line items</button>' +
      '</div>' +
      '<div class="scw-ws-v2-toolbar-spacer"></div>' +
      '<div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta">' +
        btn('add-sow',    '+ Add to SOW', 'Add a new SOW line item', true) +
        (mdfAvailable ?
          btn('add-mdf',  '+ Add MDF/IDF', 'Add a new MDF/IDF location', true) : '') +
        btn('add-photos', '+ Add Photos', 'Bulk upload photos to this SOW', true) +
      '</div>';
    return bar;
  }

  // ── + Add to SOW — reuse Knack's own "Add to Scope" link ──────
  // view_4001 is the dedicated add-to-SOW menu view on scene_1155
  // (hidden by hide-data-source-views.js); its link opens the
  // view_4002 multi-add form. Clicking the hidden anchor still
  // navigates — Knack hash links don't need the element visible.
  var ADD_SOW_MENU_VIEW = 'view_4001';

  function handleAddSow() {
    var menuLink = document.querySelector(
      '#' + ADD_SOW_MENU_VIEW + ' a.kn-link-page, ' +
      '#' + ADD_SOW_MENU_VIEW + ' a.kn-link, ' +
      '#' + ADD_SOW_MENU_VIEW + ' a[href]'
    );
    if (menuLink) {
      menuLink.click();
      return;
    }
    // Fallback: text-match any add link on the page (pre-view_4001 behavior).
    var candidates = [
      'Add to Scope', 'Add Line Item', 'Add SOW Line Item',
      'Add Scope of Work Line Item', 'Add Bid Item', 'Add Survey Item'
    ];
    var anchors = document.querySelectorAll('a.kn-link, .kn-link-page, a');
    for (var ci = 0; ci < anchors.length; ci++) {
      var txt = (anchors[ci].textContent || '').trim();
      for (var ti = 0; ti < candidates.length; ti++) {
        if (txt.toLowerCase() === candidates[ti].toLowerCase() &&
            anchors[ci].getAttribute('href')) {
          anchors[ci].click();
          return;
        }
      }
    }
    alert('Could not find the "Add to Scope" link on this page. ' +
          'Make sure the Knack details/menu link is enabled on the scene.');
  }

  // ── + Add MDF/IDF — click through to whatever "Add MDF/IDF" menu
  // link the scene carries (the same one that made the button render). ──
  function handleAddMdf() {
    var found = findAddMdfMenuLink();
    if (found) { found.link.click(); return; }
    alert('Could not find the "Add MDF/IDF" link on this page. ' +
          'Make sure the Knack menu link is enabled on the scene.');
  }

  // ── + Add Photos — SCW.bulkUpload modal (project context) ─────
  function handleAddPhotos() {
    var bu = window.SCW && window.SCW.bulkUpload;
    if (!bu || typeof bu.open !== 'function' || !bu.config) {
      alert('Bulk upload is not loaded. Refresh the page and try again.');
      return;
    }
    var views = bu.config.VIEWS || [];
    var viewCfg = null;
    for (var i = 0; i < views.length; i++) {
      if (views[i].menuViewId === 'view_3482') { viewCfg = views[i]; break; }
    }
    if (!viewCfg) { alert('Bulk upload config for SOW photos not found.'); return; }

    // The bid-review comparison grid (scene_1155) is always PROJECT-scoped:
    // canonical route #team-calendar/project-dashboard/<projectId>/review-bids/
    // <projectId>, top-level routes carry the project id as the only 24-hex
    // segment. Resolve like v1's getProjectId and always label it projectID.
    var hash = (window.location.hash || '').split('?')[0];
    var recordId = '';
    var m = hash.match(/project-dashboard\/([a-f0-9]{24})/i);
    if (m) recordId = m[1];
    else { m = hash.match(/[a-f0-9]{24}/i); if (m) recordId = m[0]; }
    if (!recordId) {
      alert('Could not determine record id from URL — open the bulk-photo modal from a SOW or project page.');
      return;
    }
    bu.open($.extend({}, viewCfg, { linkField: 'projectID' }), recordId);
  }

  /** Mount the toolbar once, between the banner and the grid body. The bar
   *  lives outside .scw-bid-review-v2-body so it survives body re-renders. */
  function mount() {
    var c = getContainer();
    if (!c) return;
    var bar = c.querySelector(':scope > .scw-bid-review-v2__toolbar');
    if (bar) return;
    bar = build();
    var body = c.querySelector('.scw-bid-review-v2-body');
    if (body) c.insertBefore(bar, body);
    else c.appendChild(bar);

    bar.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-scw-br-v2-tb]');
      if (!t || !bar.contains(t)) return;
      var action = t.getAttribute('data-scw-br-v2-tb');
      if (action === 'add-sow') handleAddSow();
      else if (action === 'add-mdf') handleAddMdf();
      else if (action === 'add-photos') handleAddPhotos();
      else if (action === 'rows-toggle') {
        if (typeof ns.toggleAllRows === 'function') ns.toggleAllRows(syncLabels);
        syncLabels();
      } else if (action === 'groups-toggle') {
        if (typeof ns.toggleAllGroups === 'function') {
          ns.toggleAllGroups(!!(ns.allGroupsOpen && ns.allGroupsOpen()));
        }
        syncLabels();
      }
    });

    // Float the whole bar (fixed to the top edge) once its natural
    // position scrolls off-screen — shared worksheet-v2 helper.
    var wsTb = window.SCW && SCW.worksheetV2 && SCW.worksheetV2.toolbar;
    if (wsTb && typeof wsTb.attachFloatingBar === 'function') {
      wsTb.attachFloatingBar(bar, c);
    }

    syncLabels();
  }

  /** Keep the "Expand/Collapse line items" label in sync with the live grid
   *  state — any row open ⇒ the next click collapses everything, else it
   *  expands. Called on mount, after every render, and after each row toggle. */
  function syncLabels() {
    var c = getContainer();
    if (!c) return;
    var bar = c.querySelector(':scope > .scw-bid-review-v2__toolbar');
    if (!bar) return;
    var rowsBtn = bar.querySelector('[data-scw-br-v2-tb="rows-toggle"]');
    if (rowsBtn) {
      var open = (typeof ns.anyRowOpen === 'function') && ns.anyRowOpen();
      rowsBtn.textContent = open ? 'Collapse line items' : 'Expand line items';
    }
    var groupsBtn = bar.querySelector('[data-scw-br-v2-tb="groups-toggle"]');
    if (groupsBtn) {
      var groupsOpen = (typeof ns.allGroupsOpen === 'function') && ns.allGroupsOpen();
      groupsBtn.textContent = groupsOpen ? 'Collapse MDF/IDFs' : 'Expand MDF/IDFs';
    }
  }

  ns.toolbar = { mount: mount, syncLabels: syncLabels };
})();
/*** END BID REVIEW V2 — TOOLBAR **********************************************/
