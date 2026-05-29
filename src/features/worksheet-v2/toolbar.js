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
  function loadPhotosHidden(viewKey) {
    try { return localStorage.getItem(photosKey(viewKey)) === '1'; }
    catch (e) { return false; }
  }
  function savePhotosHidden(viewKey, hidden) {
    try { localStorage.setItem(photosKey(viewKey), hidden ? '1' : '0'); }
    catch (e) {}
  }

  function applyState(container, viewKey) {
    var mode  = loadMode(viewKey);
    var hidden = loadPhotosHidden(viewKey);
    container.classList.remove(
      'scw-ws-v2-mode-default',
      'scw-ws-v2-mode-summary'
    );
    // Only "summary" survives as a CSS-driven mode (hides cards/L2
    // heads). Expand/collapse mutate state directly so they don\'t
    // fight per-L1 clicks.
    if (mode === 'summary') container.classList.add('scw-ws-v2-mode-summary');
    else container.classList.add('scw-ws-v2-mode-default');
    container.classList.toggle('scw-ws-v2-photos-hidden', hidden);

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
      toggleBtn.textContent = allOpen ? 'Collapse all' : 'Expand all';
    }

    var summaryBtn = bar.querySelector('[data-scw-ws-v2-mode="summary"]');
    if (summaryBtn) {
      summaryBtn.classList.toggle('scw-ws-v2-toolbar-btn--active', mode === 'summary');
    }

    var photosBtn = bar.querySelector('[data-scw-ws-v2-photos-toggle]');
    if (photosBtn) {
      photosBtn.classList.toggle('scw-ws-v2-toolbar-btn--active', !hidden);
      photosBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
      var label = photosBtn.querySelector('.scw-ws-v2-photos-btn-label');
      if (label) label.textContent = hidden ? 'Show photos' : 'Hide photos';
    }
  }

  function build(viewKey) {
    var bar = document.createElement('div');
    bar.className = 'scw-ws-v2-toolbar';
    bar.innerHTML =
      '<div class="scw-ws-v2-toolbar-group" role="group" aria-label="View mode">' +
        // Single Expand⇄Collapse toggle. Label flips depending on the
        // current state (handled in applyState below).
        btn('expand',   'Expand all',       'Open every group + show all rows') +
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
        actionBtn('add-mounting', '+ Add Mounting Boxes', 'Add a mounting box to each selected row') +
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
      var base = buildSowBasePath();
      if (!base) { alert('Could not detect SOW context from the URL.'); return; }
      // Slug matches the v1 KTL accordion config — adjust the slug if
      // the deployed Knack route differs.
      window.location.hash = '#' + base + '/add-sow-line-item/';
      return;
    }
    if (action === 'add-photos') {
      var base2 = buildSowBasePath();
      if (!base2) { alert('Could not detect SOW context from the URL.'); return; }
      window.location.hash = '#' + base2 + '/add-photos-to-sow/';
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
      var label = card
        ? ((card.querySelector('.scw-ws-v2-cell--label') ||
            card.querySelector('.scw-ws-v2-product-name') || {}).textContent || '').trim()
        : '';
      ids.push(rid);
      labels.push(label || rid);
    }
    return { ids: ids, labels: labels };
  }

  function openMountingBoxModal(viewKey) {
    var sel = selectedIdsAndLabels(viewKey);
    if (!sel.ids.length) {
      alert('Select one or more rows first — the mounting box gets attached to each selected row.');
      return;
    }
    var products = (window.SCW && SCW.mountingBoxProducts) || [];
    var hasList  = products && products.length > 0;

    var overlay = document.createElement('div');
    overlay.className = 'scw-ws-v2-mb-overlay';
    overlay.innerHTML =
      '<div class="scw-ws-v2-mb-modal">' +
        '<div class="scw-ws-v2-mb-title">Add mounting box to ' +
          sel.ids.length + ' row' + (sel.ids.length === 1 ? '' : 's') + '</div>' +
        '<div class="scw-ws-v2-mb-sub">One mounting-box line item will be created per ' +
          'selected row, connected back to the parent.</div>' +
        '<div class="scw-ws-v2-mb-rowlist">' +
          sel.labels.map(function (l) {
            return '<div>' + esc(l) + '</div>';
          }).join('') +
        '</div>' +
        '<label class="scw-ws-v2-mb-label">Mounting box product</label>' +
        (hasList
          ? '<select class="scw-ws-v2-mb-input"></select>'
          : '<input class="scw-ws-v2-mb-input" type="text" placeholder="Type the mounting box product name">') +
        (!hasList
          ? '<div class="scw-ws-v2-mb-note">window.SCW.mountingBoxProducts not loaded — ' +
            'using free text. Wire the Builder snippet for the dropdown.</div>'
          : '') +
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
      blank.value = ''; blank.textContent = '— Choose a mounting box —';
      selEl.appendChild(blank);
      for (var pi = 0; pi < products.length; pi++) {
        var p = products[pi];
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        opt.dataset.name = p.name;
        selEl.appendChild(opt);
      }
    }

    var picker  = overlay.querySelector('.scw-ws-v2-mb-input');
    var status  = overlay.querySelector('.scw-ws-v2-mb-status');
    var cancel  = overlay.querySelector('.scw-ws-v2-mb-cancel');
    var submit  = overlay.querySelector('.scw-ws-v2-mb-submit');

    function close() { overlay.parentNode && overlay.parentNode.removeChild(overlay); }
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    submit.addEventListener('click', function () {
      var productId, productName;
      if (hasList) {
        productId = picker.value;
        var opt2 = picker.options[picker.selectedIndex];
        productName = opt2 ? (opt2.dataset.name || opt2.textContent) : '';
        if (!productId) { status.textContent = 'Pick a mounting box product first.'; return; }
      } else {
        productName = (picker.value || '').trim();
        if (!productName) { status.textContent = 'Type a product name first.'; return; }
      }

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
        parentLabels:    sel.labels,
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
            setTimeout(function () { ns.data.refetchAndNotify(viewKey); }, 1500);
          }
        },
        error: function (xhr, st) {
          // Make webhooks often blocked by CORS but the scenario fires.
          if (xhr && xhr.status === 0) {
            close();
            if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
              setTimeout(function () { ns.data.refetchAndNotify(viewKey); }, 1500);
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
        } else if (t.hasAttribute('data-scw-ws-v2-photos-toggle')) {
          savePhotosHidden(viewKey, !loadPhotosHidden(viewKey));
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
    loadPhotosHidden: loadPhotosHidden
  };
})();
/*** END WORKSHEET V2 — TOOLBAR ***********************************************/
