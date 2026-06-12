/*** WORKSHEET V2 — TOOLBAR ***************************************************
 *
 * Mode toolbar above the v2 mount. Three view modes + a photos toggle:
 *
 *   - mode-default  : per-L1 accordion state (the existing behavior)
 *   - mode-expand   : every L1 open + every card row visible
 *   - mode-collapse : every L1 closed (only L1 headers visible)
 *   - mode-summary  : every L1 open + cards hidden + per-L1 summary panel
 *                     visible. The summary panel is built by summary.js
 *                     and rendered at the top of each L1 body.
 *
 *   - photos-hidden : independent boolean — hide every photo strip
 *                     regardless of expand state. Persists separately.
 *
 * Mode + photos state persists to localStorage keyed by sceneId +
 * sourceViewKey so a user\'s preferred view sticks across reloads.
 *
 * Implementation note: modes are pure CSS overrides applied via classes
 * on the v2 container. They don\'t mutate the per-L1 state.js state, so
 * the user can flip from "expand all" back to "default" and the previous
 * accordion state resumes.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var MODE_KEY_PREFIX   = 'scw:ws-v2:mode:';
  var PHOTOS_KEY_PREFIX = 'scw:ws-v2:photos:';

  function getSceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }

  function modeKey(viewKey)   { return MODE_KEY_PREFIX   + getSceneId() + ':' + viewKey; }
  function photosKey(viewKey) { return PHOTOS_KEY_PREFIX + getSceneId() + ':' + viewKey; }

  function loadMode(viewKey) {
    try { return localStorage.getItem(modeKey(viewKey)) || 'default'; }
    catch (e) { return 'default'; }
  }
  function saveMode(viewKey, mode) {
    try { localStorage.setItem(modeKey(viewKey), mode); }
    catch (e) {}
  }
  function loadPhotosShown(viewKey) {
    try { return localStorage.getItem(photosKey(viewKey)) === '1'; }
    catch (e) { return false; }
  }
  function savePhotosShown(viewKey, shown) {
    try { localStorage.setItem(photosKey(viewKey), shown ? '1' : '0'); }
    catch (e) {}
  }

  function applyState(container, viewKey) {
    var mode  = loadMode(viewKey);
    var shown = loadPhotosShown(viewKey);
    container.classList.remove(
      'scw-ws-v2-mode-default',
      'scw-ws-v2-mode-summary'
    );
    if (mode === 'summary') container.classList.add('scw-ws-v2-mode-summary');
    else container.classList.add('scw-ws-v2-mode-default');
    // Mirror v1\'s view_3610 behavior — "Show photos" REVEALS strips on
    // collapsed cards too (default is: strips show only when expanded).
    container.classList.toggle('scw-ws-v2-photos-shown', shown);

    var bar = container.querySelector('.scw-ws-v2-toolbar');
    if (!bar) return;

    // Expand/Collapse toggle button label reflects the LIVE L1 state:
    // if every L1 in the view is currently open, the button collapses
    // them; otherwise it expands. This way the button is always honest
    // about what the next click will do.
    var l1Sections = container.querySelectorAll('.scw-ws-v2-l1');
    var openCount = 0;
    for (var li = 0; li < l1Sections.length; li++) {
      if (l1Sections[li].classList.contains('scw-ws-v2-l1--open')) openCount++;
    }
    var allOpen = l1Sections.length > 0 && openCount === l1Sections.length;
    var toggleBtn = bar.querySelector('[data-scw-ws-v2-mode="expand"], ' +
                                     '[data-scw-ws-v2-mode="collapse"]');
    if (toggleBtn) {
      toggleBtn.setAttribute('data-scw-ws-v2-mode', allOpen ? 'collapse' : 'expand');
      toggleBtn.textContent = allOpen ? 'Collapse MDF/IDFs' : 'Expand MDF/IDFs';
    }

    // Line-items toggle label reflects the LIVE card state — same honesty
    // rule as the MDF/IDF toggle: if every card's detail panel is open, the
    // next click closes them all, else it opens them all.
    var rowsBtn = bar.querySelector('[data-scw-ws-v2-rows-toggle]');
    if (rowsBtn) {
      var cards = container.querySelectorAll('.scw-ws-v2-card');
      var openCards = container.querySelectorAll('.scw-ws-v2-card--open');
      var allCardsOpen = cards.length > 0 && openCards.length === cards.length;
      rowsBtn.textContent = allCardsOpen ? 'Collapse line items' : 'Expand line items';
    }

    var summaryBtn = bar.querySelector('[data-scw-ws-v2-mode="summary"]');
    if (summaryBtn) {
      summaryBtn.classList.toggle('scw-ws-v2-toolbar-btn--active', mode === 'summary');
    }

    var photosBtn = bar.querySelector('[data-scw-ws-v2-photos-toggle]');
    if (photosBtn) {
      photosBtn.classList.toggle('scw-ws-v2-toolbar-btn--active', shown);
      photosBtn.setAttribute('aria-pressed', shown ? 'true' : 'false');
      var label = photosBtn.querySelector('.scw-ws-v2-photos-btn-label');
      if (label) label.textContent = shown ? 'Hide photos' : 'Show photos';
    }
  }

  function build(viewKey) {
    var bar = document.createElement('div');
    bar.className = 'scw-ws-v2-toolbar';
    bar.innerHTML =
      '<div class="scw-ws-v2-toolbar-group" role="group" aria-label="View mode">' +
        // Single Expand⇄Collapse toggle for the MDF/IDF groups. Label flips
        // depending on the current state (handled in applyState below).
        btn('expand',   'Expand MDF/IDFs',  'Open or close every MDF/IDF group') +
        // Expand⇄Collapse every line item's detail panel. Pure card-class
        // toggle — deliberately does NOT touch the MDF/IDF group state.
        '<button type="button" class="scw-ws-v2-toolbar-btn" ' +
          'data-scw-ws-v2-rows-toggle ' +
          'title="Open or close every line item’s detail panel (leaves MDF/IDF groups alone)">' +
          'Expand line items</button>' +
        btn('summary',  'Summary only',     'Open every group + show only the L1 summary') +
      '</div>' +
      '<div class="scw-ws-v2-toolbar-group">' +
        '<button type="button" class="scw-ws-v2-toolbar-btn"' +
          ' data-scw-ws-v2-photos-toggle aria-pressed="true"' +
          ' title="Show or hide attached photos on expanded rows">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
            'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
            'stroke-linejoin="round">' +
            '<rect x="3" y="3" width="18" height="18" rx="2"></rect>' +
            '<circle cx="9" cy="9" r="1.8"></circle>' +
            '<path d="M21 16l-5-5-9 9"></path>' +
          '</svg>' +
          '<span class="scw-ws-v2-photos-btn-label">Hide photos</span>' +
        '</button>' +
      '</div>' +
      '<div class="scw-ws-v2-toolbar-spacer"></div>' +
      '<div class="scw-ws-v2-toolbar-group scw-ws-v2-toolbar-group--cta">' +
        actionBtn('add-sow',      '+ Add to SOW',         'Add a new SOW line item') +
        actionBtn('add-photos',   '+ Add Photos',         'Bulk upload photos to this SOW') +
        // "+ Add Accessories" lives in the floating bulk panel (bulk.js)
        // now — it only applies to a row selection, same as Remove.
      '</div>';
    return bar;
  }

  function actionBtn(action, label, title) {
    return '<button type="button" class="scw-ws-v2-toolbar-btn scw-ws-v2-toolbar-btn--cta" ' +
      'data-scw-ws-v2-action="' + action + '" ' +
      'title="' + esc(title) + '">' + esc(label) + '</button>';
  }

  // ── URL helpers (same pattern as photos.js / inline-photo-row.js) ──
  function buildSowBasePath() {
    var hash = window.location.hash || '';
    var patterns = [
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/review-bids\/[a-f0-9]{24})/,
      /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/deploy\/[a-f0-9]{24})/,
      /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/,
      /(proposals\/scope-of-work\/[a-f0-9]{24})/
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = hash.match(patterns[i]);
      if (m) return m[1];
    }
    return '';
  }
  function getSowIdFromHash() {
    var base = buildSowBasePath();
    if (!base) return '';
    var m = base.match(/\/([a-f0-9]{24})\/?$/);
    return m ? m[1] : '';
  }
  function getTriggeredBy() {
    var u = (window.Knack && Knack.getUserAttributes && Knack.getUserAttributes()) || {};
    return u.id || u.email || '';
  }

  // ── Mode handler — mutates persistent state for expand/collapse,
  //    keeps Summary as a CSS mode that ALSO opens summary panels. ──
  function collectL1Ids(container) {
    var nodes = container.querySelectorAll('[data-scw-ws-v2-l1]');
    var ids = [];
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-scw-ws-v2-l1');
      if (id) ids.push(id);
    }
    return ids;
  }

  function rerender(viewKey) {
    if (!ns.data || !ns.render) return;
    var records = ns.data.readRecords(viewKey);
    ns.render.renderView(viewKey, records);
  }

  function openAllSummaryPanels(container) {
    var heads = container.querySelectorAll('[data-scw-ws-v2-summary-toggle]');
    for (var i = 0; i < heads.length; i++) {
      var panel = heads[i].parentNode;
      if (!panel) continue;
      panel.classList.add('scw-ws-v2-summary--open');
      heads[i].setAttribute('aria-expanded', 'true');
    }
  }

  function handleModeClick(requested, viewKey, container) {
    var ids = collectL1Ids(container);
    var currentMode = loadMode(viewKey);

    if (requested === 'expand' || requested === 'collapse') {
      // Mutate persistent state directly — no CSS override fighting
      // the per-L1 click handler. Clear summary mode if it was active.
      if (currentMode === 'summary') saveMode(viewKey, 'default');
      if (ns.state) {
        if (requested === 'expand') ns.state.setAllOpen(viewKey, ids);
        else                          ns.state.setAllClosed(viewKey, ids);
      }
      rerender(viewKey);
      applyState(container, viewKey);
      return;
    }

    if (requested === 'summary') {
      // Toggle: leaving summary mode collapses everything; entering
      // opens every L1 (so summary panels are visible) AND opens
      // every summary panel head.
      if (currentMode === 'summary') {
        saveMode(viewKey, 'default');
        if (ns.state) ns.state.setAllClosed(viewKey, ids);
        rerender(viewKey);
        applyState(container, viewKey);
      } else {
        saveMode(viewKey, 'summary');
        if (ns.state) ns.state.setAllOpen(viewKey, ids);
        rerender(viewKey);
        openAllSummaryPanels(container);
        applyState(container, viewKey);
      }
      return;
    }
  }

  // ── Action handlers ──
  function handleAction(action, viewKey) {
    if (action === 'add-sow') {
      // Scene-specific add path. Preferred: viewCfg.addSowMenuView — a
      // Knack menu view whose first link IS the add-to-SOW action
      // (e.g. view_3450 on the sales page, the same link v1 used).
      // Clicking a CSS-hidden anchor still navigates.
      try {
        var _addVc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
        var _menuId = _addVc && _addVc.addSowMenuView;
        if (_menuId) {
          var _menuLink = document.querySelector(
            '#' + _menuId + ' a.kn-link-page, #' + _menuId + ' a.kn-link, #' + _menuId + ' a[href]'
          );
          if (_menuLink) { _menuLink.click(); return; }
          if (window.console) {
            console.warn('[scw-ws-v2] add-sow: no link found inside #' + _menuId +
              ' — falling back to page-wide link-text scan');
          }
        }
      } catch (e) { /* fall through to text scan */ }
      // Fallback: v1 surfaces this as a Knack menu/link (e.g. "Add to
      // Scope") whose href is generated by Knack from the page\'s
      // Builder config — the exact slug differs by scene and route, so
      // find a live link by text and reuse it. If none are found we
      // tell the user instead of bouncing them home.
      var candidates = [
        'Add to Scope',
        'Add to Scope of Work',
        'Add Line Item',
        'Add SOW Line Item',
        'Add Scope of Work Line Item',
        'Add Bid Item',
        'Add Survey Item'
      ];
      var anchors = document.querySelectorAll('a.kn-link, .scw-acc-action-btn, .kn-link-page, a');
      var match = null;
      for (var ci = 0; ci < anchors.length && !match; ci++) {
        var txt = (anchors[ci].textContent || '').trim();
        for (var ti = 0; ti < candidates.length; ti++) {
          if (txt === candidates[ti] || txt.toLowerCase() === candidates[ti].toLowerCase()) {
            if (anchors[ci].getAttribute('href')) { match = anchors[ci]; break; }
          }
        }
      }
      if (match) {
        // Defer to Knack\'s own navigation — click() preserves any
        // single-page-app behavior the link binds to. Setting hash
        // directly also works for plain hash links.
        match.click();
        return;
      }
      alert('Could not find the "Add to Scope" link on this page. ' +
            'Make sure the Knack details/menu link is enabled on the scene.');
      return;
    }
    if (action === 'add-photos') {
      openBulkPhotoUpload();
      return;
    }
    if (action === 'add-mounting') {
      openMountingBoxModal(viewKey);
      return;
    }
  }

  function selectedIdsAndLabels(viewKey) {
    // Pull selection from bulk.js — if bulk isn\'t loaded, fall back to
    // scanning the DOM for checked select boxes.
    var ids = [];
    var labels = [];
    var boxes = document.querySelectorAll('[data-scw-ws-v2-select]:checked');
    for (var i = 0; i < boxes.length; i++) {
      var rid = boxes[i].getAttribute('data-scw-ws-v2-select');
      var card = boxes[i].closest('.scw-ws-v2-card');
      // Prefer the drop label (E-001 etc.), then fall back to the
      // product name — non-cam rows don\'t have a label cell, so the
      // raw record id was leaking through for NVRs / switches.
      var labelEl = card && card.querySelector('.scw-ws-v2-cell--label');
      var labelText = labelEl ? (labelEl.textContent || '').trim() : '';
      if (!labelText) {
        var prodEl = card && card.querySelector('.scw-ws-v2-product-name');
        labelText = prodEl ? (prodEl.textContent || '').trim() : '';
      }
      ids.push(rid);
      labels.push(labelText || rid);
    }
    return { ids: ids, labels: labels };
  }

  // ── Bulk photo upload ─────────────────────────────────────
  // Mirrors v1\'s view_3610 inject target — picks the right linkField
  // (projectID on project-dashboard route, sowID otherwise) and opens
  // the existing SCW.bulkUpload modal. We borrow v1\'s registered view
  // config so refresh hooks (re-fetch view_3610 / view_3962) stay
  // consistent without us duplicating the list.
  function openBulkPhotoUpload() {
    var bu = window.SCW && window.SCW.bulkUpload;
    if (!bu || typeof bu.open !== 'function' || !bu.config) {
      alert('Bulk upload is not loaded. Refresh the page and try again.');
      return;
    }
    // Find the SOW-context entry (menuViewId view_3482 has the SOW /
    // build-sow / project-dashboard contexts wired). Fall back to a
    // generic build-sow hash pattern if the entry isn\'t available.
    var views = bu.config.VIEWS || [];
    var viewCfg = null;
    for (var i = 0; i < views.length; i++) {
      if (views[i].menuViewId === 'view_3482') { viewCfg = views[i]; break; }
    }
    if (!viewCfg) {
      alert('Bulk upload config for SOW photos not found.');
      return;
    }

    // resolveContext-equivalent: project-dashboard takes precedence
    // (its 24-hex id is the project), then the SOW page route.
    var hash = window.location.hash || '';
    var contexts = [
      { linkField: 'projectID', hashPattern: /project-dashboard\/([a-f0-9]{24})/ },
      { linkField: 'sowID',     hashPattern: /(?:scope-of-work-details|build-sow)\/([a-f0-9]{24})/ }
    ];
    var recordId = '', linkField = '';
    for (var c = 0; c < contexts.length; c++) {
      var m = hash.match(contexts[c].hashPattern);
      if (m && m[1]) {
        recordId  = m[1];
        linkField = contexts[c].linkField;
        break;
      }
    }
    if (!recordId) {
      var fallbackBase = buildSowBasePath();
      if (fallbackBase) {
        var fbMatch = fallbackBase.match(/\/([a-f0-9]{24})\/?$/);
        if (fbMatch) {
          recordId  = fbMatch[1];
          linkField = viewCfg.linkField || 'sowID';
        }
      }
    }
    if (!recordId) {
      alert('Could not determine record id from URL — open the bulk-photo modal from a SOW or project page.');
      return;
    }
    var cfgForUpload = $.extend({}, viewCfg, { linkField: linkField });
    bu.open(cfgForUpload, recordId);
  }

  /** Add-accessory modal. `presetSel` ({ids, labels}) lets a per-item
   *  "+ Add" open the modal scoped to one row without checkbox
   *  selection — used on sales scenes that have no Knack add-accessory
   *  child page. Without it, selection comes from the checked boxes. */
  function openMountingBoxModal(viewKey, presetSel) {
    var sel = (presetSel && presetSel.ids && presetSel.ids.length)
      ? presetSel
      : selectedIdsAndLabels(viewKey);
    if (!sel.ids.length) {
      alert('Select one or more rows first — an accessory will be added to each selected row.');
      return;
    }
    // Compatibility filter — only show accessory products whose
    // compatibility lists (field_2236 OR field_2205 on the product
    // object) contain the line item\'s product. Walks each selected
    // record and collects the set of "selectionProductIds" from
    // the source view\'s model; an accessory must list EVERY one of
    // those ids to be eligible (intersection — safer than union for
    // bulk). Mirrors the Knack-side query on the native form.
    // id → attributes index across the v2 source views. Feeds both the
    // compatibility filter and the row labels below.
    var byId = (function () {
      var idx = Object.create(null);
      function absorb(vk) {
        try {
          var v = vk && window.Knack && Knack.views && Knack.views[vk];
          var models = (v && v.model && v.model.data && v.model.data.models) || [];
          for (var i = 0; i < models.length; i++) {
            var a = models[i] && models[i].attributes;
            if (a && a.id && !idx[a.id]) idx[a.id] = a;
          }
        } catch (e) { /* view not on scene */ }
      }
      absorb(viewKey);
      // If any selected id isn\'t in viewKey\'s model (e.g. a stale view
      // key after SPA navigation), sweep every configured v2 source
      // view so the lookup still resolves.
      var missing = false;
      for (var m = 0; m < sel.ids.length; m++) {
        if (!idx[sel.ids[m]]) { missing = true; break; }
      }
      if (missing && ns.CONFIG && Array.isArray(ns.CONFIG.views)) {
        for (var vi = 0; vi < ns.CONFIG.views.length; vi++) {
          absorb(ns.CONFIG.views[vi].sourceViewKey);
        }
      }
      return idx;
    })();

    // Display labels from the model, not the DOM — on the bid-review
    // comparison grid the checkboxes don\'t sit inside .scw-ws-v2-card,
    // so the DOM scrape falls back to raw record ids. labelLineItem
    // gives cam/reader rows "DROP-LABEL · PRODUCT" and everything else
    // the product name (same format as the parent picker + chips).
    var labels = sel.labels.slice();
    if (ns.card && typeof ns.card.labelLineItem === 'function') {
      for (var li = 0; li < sel.ids.length; li++) {
        var lAttrs = byId[sel.ids[li]];
        if (!lAttrs) continue;
        var nice = ns.card.labelLineItem(lAttrs);
        if (nice) labels[li] = nice;
      }
    }

    var selectionProductIds = (function () {
      var seen = Object.create(null);
      for (var k = 0; k < sel.ids.length; k++) {
        var attrs = byId[sel.ids[k]];
        if (!attrs) continue;
        var raw = attrs.field_1949_raw;
        if (Array.isArray(raw)) {
          for (var ri = 0; ri < raw.length; ri++) {
            if (raw[ri] && raw[ri].id) seen[raw[ri].id] = true;
          }
        } else if (raw && raw.id) {
          seen[raw.id] = true;
        }
      }
      var out = [];
      for (var pid in seen) out.push(pid);
      return out;
    })();

    var rawProducts = (window.SCW && SCW.mountingBoxProducts) || [];
    var products = rawProducts;
    var noCompatible = false;
    var unresolvedSelection = false;
    if (rawProducts.length && !selectionProductIds.length) {
      // Couldn\'t read a product off ANY selected row. NEVER fall back
      // to the unfiltered catalog (it\'s every enabled product) — drop
      // to free text and say why.
      products = [];
      unresolvedSelection = true;
      if (window.console) {
        console.warn('[scw-ws-v2] add-accessory: could not resolve products for selection',
          sel.ids, 'viewKey=', viewKey);
      }
    }
    if (selectionProductIds.length && rawProducts.length) {
      products = rawProducts.filter(function (p) {
        if (!p) return false;
        // The catalog spans EVERY enabled product (the Builder snippet
        // doesn\'t bucket-filter), so "no compat list" means "not an
        // accessory" — exclude it. Only products whose field_2236 OR
        // field_2205 list names the selected product(s) are accessories
        // for this selection. This is the same rule the Knack-side
        // query applies to the native add-accessory form.
        var a = (Array.isArray(p.compatibleProducts)    && p.compatibleProducts.length)    ? p.compatibleProducts    : null;
        var b = (Array.isArray(p.compatibleProductsAlt) && p.compatibleProductsAlt.length) ? p.compatibleProductsAlt : null;
        if (!a && !b) return false;
        for (var i = 0; i < selectionProductIds.length; i++) {
          var pid = selectionProductIds[i];
          var hit = (a && a.indexOf(pid) !== -1) || (b && b.indexOf(pid) !== -1);
          if (!hit) return false;
        }
        return true;
      });
      noCompatible = rawProducts.length > 0 && products.length === 0;
    }
    var hasList  = products && products.length > 0;

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-mb-overlay';
    overlay.innerHTML =
      '<div class="scw-ws-v2-mb-modal">' +
        '<div class="scw-ws-v2-mb-title">Add accessory to ' +
          sel.ids.length + ' row' + (sel.ids.length === 1 ? '' : 's') + '</div>' +
        '<div class="scw-ws-v2-mb-sub">One accessory line item will be created per ' +
          'selected row, connected back to the parent.</div>' +
        '<div class="scw-ws-v2-mb-rowlist">' +
          labels.map(function (l) {
            return '<div>' + esc(l) + '</div>';
          }).join('') +
        '</div>' +
        // No free-text path — accessories must come from the catalog.
        // When there\'s nothing to pick, say why and keep submit disabled.
        (hasList
          ? '<label class="scw-ws-v2-mb-label">Accessory product</label>' +
            '<select class="scw-ws-v2-mb-input"></select>'
          : '<div class="scw-ws-v2-mb-note">' + (noCompatible
              ? 'No compatible accessory products found for the selected ' +
                'product(s). Yell at Install Ops if this isn\'t expected.'
              : (unresolvedSelection
                ? 'Couldn\'t read the selected rows\' products — refresh the ' +
                  'page and try again.'
                : 'Accessory catalog hasn\'t loaded yet — refresh the page ' +
                  'and try again.')) + '</div>') +
        '<div class="scw-ws-v2-mb-status"></div>' +
        '<div class="scw-ws-v2-mb-actions">' +
          '<button type="button" class="scw-ws-v2-mb-cancel">Cancel</button>' +
          '<button type="button" class="scw-ws-v2-mb-submit">' +
            'Add to ' + sel.ids.length + ' row' + (sel.ids.length === 1 ? '' : 's') +
          '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    if (hasList) {
      var selEl = overlay.querySelector('select.scw-ws-v2-mb-input');
      var blank = document.createElement('option');
      blank.value = ''; blank.textContent = '— Choose an accessory —';
      selEl.appendChild(blank);

      // Group products by their proposal bucket. Entries that don\'t
      // carry a bucket (e.g. catalog rows pre-dating the snippet\'s
      // bucket field) land in a single "Other" group at the bottom so
      // they\'re still pickable. Each group sorts its products by
      // name alphabetically. If NO entry carries bucket metadata (the
      // snippet doesn\'t emit it), skip optgroups entirely and render
      // a flat alphabetical list — no pointless "Other" heading.
      var anyBucket = false;
      for (var bi = 0; bi < products.length; bi++) {
        if (products[bi] && products[bi].bucketId) { anyBucket = true; break; }
      }
      if (!anyBucket) {
        var flat = products.slice().sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name), undefined,
            { numeric: true, sensitivity: 'base' });
        });
        flat.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          opt.dataset.name = p.name;
          selEl.appendChild(opt);
        });
      } else {
      var grouped = Object.create(null);
      for (var pi = 0; pi < products.length; pi++) {
        var p = products[pi];
        var key   = p.bucketId   || '__other';
        var label = p.bucketName || 'Other';
        if (!grouped[key]) grouped[key] = { label: label, items: [] };
        grouped[key].items.push(p);
      }
      var groupList = Object.keys(grouped).map(function (k) { return grouped[k]; });
      groupList.sort(function (a, b) {
        // "Other" sinks to the bottom; everything else alphabetical.
        if (a.label === 'Other' && b.label !== 'Other') return 1;
        if (b.label === 'Other' && a.label !== 'Other') return -1;
        return a.label.localeCompare(b.label, undefined,
          { numeric: true, sensitivity: 'base' });
      });
      groupList.forEach(function (g) {
        g.items.sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name), undefined,
            { numeric: true, sensitivity: 'base' });
        });
        var og = document.createElement('optgroup');
        og.label = g.label;
        g.items.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          opt.dataset.name = p.name;
          og.appendChild(opt);
        });
        selEl.appendChild(og);
      });
      }
    }

    var picker  = overlay.querySelector('.scw-ws-v2-mb-input');
    var status  = overlay.querySelector('.scw-ws-v2-mb-status');
    var cancel  = overlay.querySelector('.scw-ws-v2-mb-cancel');
    var submit  = overlay.querySelector('.scw-ws-v2-mb-submit');

    // Nothing pickable → the modal is informational only.
    if (!hasList) submit.disabled = true;

    function close() { overlay.parentNode && overlay.parentNode.removeChild(overlay); }
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    submit.addEventListener('click', function () {
      if (!hasList) return;
      var productId = picker.value;
      var opt2 = picker.options[picker.selectedIndex];
      var productName = opt2 ? (opt2.dataset.name || opt2.textContent) : '';
      if (!productId) { status.textContent = 'Pick an accessory product first.'; return; }

      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_BULK_ADD_MOUNTING_BOX_WEBHOOK) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        status.textContent = 'Webhook URL not configured (MAKE_BULK_ADD_MOUNTING_BOX_WEBHOOK).';
        return;
      }

      submit.disabled = true;
      cancel.disabled = true;
      submit.textContent = 'Submitting…';

      var payload = {
        sowId:           getSowIdFromHash(),
        productId:       productId || '',
        productName:     productName,
        parentRecordIds: sel.ids,
        parentLabels:    labels,
        sourceViewId:    viewKey,
        triggeredBy:     getTriggeredBy()
      };

      $.ajax({
        url: url, type: 'POST', contentType: 'application/json',
        data: JSON.stringify(payload), crossDomain: true, timeout: 60000,
        success: function () {
          close();
          status.textContent = '';
          if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
            setTimeout(function () { ns.data.refetchAndNotify(viewKey); if (ns.poll && ns.poll.triggerBurst) ns.poll.triggerBurst(viewKey); }, 1500);
          }
        },
        error: function (xhr, st) {
          // Make webhooks often blocked by CORS but the scenario fires.
          if (xhr && xhr.status === 0) {
            close();
            if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
              setTimeout(function () { ns.data.refetchAndNotify(viewKey); if (ns.poll && ns.poll.triggerBurst) ns.poll.triggerBurst(viewKey); }, 1500);
            }
            return;
          }
          submit.disabled = false;
          cancel.disabled = false;
          submit.textContent = 'Add to ' + sel.ids.length + ' row' +
                               (sel.ids.length === 1 ? '' : 's');
          status.textContent = 'Webhook failed (' + st + '). Try again.';
        }
      });
    });
  }

  function btn(mode, label, title) {
    return '<button type="button" class="scw-ws-v2-toolbar-btn" ' +
      'data-scw-ws-v2-mode="' + mode + '" ' +
      'title="' + esc(title) + '">' + esc(label) + '</button>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  /** Mount the toolbar inside the v2 container for a given source view.
   *  Idempotent — re-runs on every re-render but only inserts once. */
  function mount(viewKey) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;

    var bar = container.querySelector(':scope > .scw-ws-v2-toolbar');
    if (!bar) {
      bar = build(viewKey);
      // Insert at the top, but AFTER any preview banner the user might
      // have injected. We just put it as the first child of container.
      container.insertBefore(bar, container.firstChild);

      bar.addEventListener('click', function (e) {
        var t = e.target && e.target.closest && e.target.closest('button');
        if (!t || !bar.contains(t)) return;
        if (t.hasAttribute('data-scw-ws-v2-mode')) {
          var requested = t.getAttribute('data-scw-ws-v2-mode');
          handleModeClick(requested, viewKey, container);
        } else if (t.hasAttribute('data-scw-ws-v2-rows-toggle')) {
          // Expand/collapse every line item's detail panel. Same pure
          // class toggle as the per-card chevron (init.js expand handler)
          // — deliberately does NOT touch ns.state / the MDF/IDF groups,
          // and no rerender so the group accordion stays exactly as-is.
          // Cards inside closed groups get the class too: they'll show
          // expanded when their group is opened later.
          var allCards = container.querySelectorAll('.scw-ws-v2-card');
          var openNow  = container.querySelectorAll('.scw-ws-v2-card--open');
          var openAll  = !(allCards.length > 0 && openNow.length === allCards.length);
          for (var ci = 0; ci < allCards.length; ci++) {
            allCards[ci].classList.toggle('scw-ws-v2-card--open', openAll);
          }
          applyState(container, viewKey);
        } else if (t.hasAttribute('data-scw-ws-v2-photos-toggle')) {
          var nextShown = !loadPhotosShown(viewKey);
          savePhotosShown(viewKey, nextShown);
          // Mirror v1: when revealing photos, also expand every L1 so
          // the user sees them right away. Hiding leaves L1 state alone.
          if (nextShown && ns.state) {
            ns.state.setAllOpen(viewKey, collectL1Ids(container));
            rerender(viewKey);
          }
          applyState(container, viewKey);
        } else if (t.hasAttribute('data-scw-ws-v2-action')) {
          handleAction(t.getAttribute('data-scw-ws-v2-action'), viewKey);
        }
      });
    }
    applyState(container, viewKey);
  }

  ns.toolbar = {
    mount:           mount,
    loadMode:        loadMode,
    loadPhotosShown: loadPhotosShown,
    // Exposed so the floating bulk panel (bulk.js) can open the
    // add-accessory modal — it applies to a row selection, same as the
    // bulk Remove-accessories action, so both live together there.
    openAddAccessories: openMountingBoxModal
  };
})();
/*** END WORKSHEET V2 — TOOLBAR ***********************************************/
