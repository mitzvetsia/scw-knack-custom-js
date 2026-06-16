/*** WORKSHEET V2 — INIT ******************************************************
 *
 * Mounts the v2 preview panel directly AFTER the source view's
 * element on the scene, then wires data subscribers so the panel
 * re-renders whenever the source view's records change.
 *
 * Phase 0: zero interaction with v1. v1 keeps rendering view_3610
 * as it always has; v2 sits beneath, reading the same data and
 * showing a simple table. Provable side-by-side comparison.
 *
 * Mounting strategy:
 *   1. On scene render, look for #view_3610 (or whatever the source
 *      view is). If present and v2 isn't mounted yet, build the
 *      panel scaffold and insertAdjacentElement('afterend', panel).
 *   2. The .kn-scene element preserves across view re-renders so
 *      re-mounting on subsequent renders is a no-op (idempotent
 *      guard on container id).
 *   3. If the source view isn't on the current scene at all, no-op.
 *      We don't pre-mount on body — only mount where the source
 *      view actually exists.
 *
 * Future phases: mount becomes the PRIMARY UI for that view, v1 gets
 * display:none, the source view itself can stay (data conduit) or be
 * moved off-scene entirely if we go all-API for loading.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns || !ns.CONFIG) return;
  if (!ns.CONFIG.enabled) return;

  function buildPanel(vcfg) {
    var panel = document.createElement('div');
    panel.id = 'scw-ws-v2-' + vcfg.sourceViewKey;
    panel.className = 'scw-ws-v2';

    var banner = document.createElement('div');
    banner.className = 'scw-ws-v2-banner';
    banner.innerHTML =
      '<span class="scw-ws-v2-banner-title">' + vcfg.label + '</span>' +
      '<span class="scw-ws-v2-banner-chips"></span>' +
      '<span class="scw-ws-v2-count">0 records</span>';
    panel.appendChild(banner);

    var body = document.createElement('div');
    body.className = 'scw-ws-v2-body';
    body.innerHTML = '<div class="scw-ws-v2-empty">Waiting for ' +
      vcfg.sourceViewKey + ' to load…</div>';
    panel.appendChild(body);

    return panel;
  }

  /**
   * Try to mount the v2 panel for one source view. No-op if the
   * source view isn't on this scene, or the panel is already mounted.
   */
  // Internal-staff gate: a view flagged internalOnly mounts only for
  // @getscw.com users (SCW.isInternalUser). Fails safe to "not internal"
  // when the helper/session isn't ready — onViewRender re-fires, so a
  // staff member's panel resolves on the next render once the email
  // attribute populates.
  function gatedOut(vcfg) {
    if (!vcfg || !vcfg.internalOnly) return false;
    return !(window.SCW && typeof SCW.isInternalUser === 'function' && SCW.isInternalUser());
  }

  function tryMount(vcfg) {
    if (!vcfg || vcfg.enabled === false) return;   // per-view kill switch
    if (gatedOut(vcfg)) return;                     // internal-only preview gate
    if (document.getElementById('scw-ws-v2-' + vcfg.sourceViewKey)) return;
    var anchor = document.querySelector(vcfg.mountAfterSelector);
    if (!anchor) return; // source view not on this scene
    var panel = buildPanel(vcfg);
    anchor.insertAdjacentElement('afterend', panel);
    // Initial paint — v1 may have already loaded the records by now.
    if (ns.data) ns.render.renderView(vcfg.sourceViewKey, ns.data.readRecords(vcfg.sourceViewKey));
  }

  function tryMountAll() {
    var views = ns.CONFIG.views || [];
    views.forEach(tryMount);
  }

  // Wire data subscribers ONCE — they fire forever, regardless of
  // mount state. The render call short-circuits if the container
  // doesn't exist.
  function wireSubscribers() {
    if (!ns.data) return;
    var views = ns.CONFIG.views || [];
    views.forEach(function (vcfg) {
      if (!vcfg || vcfg.enabled === false) return;   // per-view kill switch
      if (gatedOut(vcfg)) return;                     // internal-only preview gate
      // Background polling — keep v2 in sync with records added via
      // API / other tabs / Make scenarios. 2-min default, 15-sec
      // burst for 5 minutes after a known local change.
      if (ns.poll && typeof ns.poll.start === 'function') {
        ns.poll.start(vcfg.sourceViewKey);
      }
      ns.data.subscribe(vcfg.sourceViewKey, function (key, records) {
        ns.render.renderView(key, records);
        // Mode/photos toolbar — mount idempotently above the L1 list.
        if (ns.toolbar && typeof ns.toolbar.mount === 'function') {
          ns.toolbar.mount(key);
        }
        if (ns.sort && typeof ns.sort.mount === 'function') {
          ns.sort.mount(key);
        }
        if (ns.nativeFilter && typeof ns.nativeFilter.mount === 'function') {
          ns.nativeFilter.mount(key);
        }
        var _vcSow = (ns.cfg && typeof ns.cfg.viewCfg === 'function')
          ? ns.cfg.viewCfg(key) : null;
        if (ns.sowFilter && typeof ns.sowFilter.mount === 'function' &&
            !(_vcSow && _vcSow.hideSow)) {
          ns.sowFilter.mount(key);
        }
        // After every re-render, sync the bulk-select checkboxes to
        // current selection state + refresh the floating toolbar. GUARD on the
        // panel actually being mounted on THIS scene: bulk is a singleton, and
        // the background poll fires notify() for EVERY configured view on every
        // scene — without this guard the sales view's poll (view_3586) calls
        // bulk.mount('view_3586') on the bid-review scene, clobbering
        // _sourceViewKey to a SALES view so the bulk modal serves SALES fields
        // (Custom Disc %, Label #) on the bid comparison grid.
        if (ns.bulk && typeof ns.bulk.mount === 'function' &&
            document.getElementById('scw-ws-v2-' + key)) {
          ns.bulk.mount(key);
        }
      });
    });
    ns.data.attachListeners();
  }

  wireSubscribers();
  // Inline edit handler — single delegated listener for every editable
  // input across every v2 card. Idempotent; safe to call repeatedly.
  if (ns.edit && typeof ns.edit.wire === 'function') ns.edit.wire();

  // L1 accordion toggle — single document-level delegated handler.
  // Catches clicks on any [data-scw-ws-v2-l1-toggle] (the L1 header
  // button), persists the new state, then re-renders just that view.
  // Exclusive accordion is enforced by state.toggleL1 — opening L1-B
  // implicitly closes L1-A in the persisted state, so the next render
  // shows the right thing.
  // Per-panel summary toggle — click the header to expand/collapse.
  // Idempotent; binds once globally.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-summary-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-summary-bound', '1');
    document.addEventListener('click', function (e) {
      // Warning chip → highlight affected cards instead of toggling
      // the summary panel. Must intercept BEFORE the summary toggle
      // walk-up below, since chips are buttons inside the summary
      // head button.
      var chip = e.target && e.target.closest &&
                 e.target.closest('[data-scw-ws-v2-warn-chip]');
      if (chip) {
        e.preventDefault();
        // stopImmediatePropagation (not just stopPropagation) so the
        // separate document-level L1-toggle listener doesn't ALSO fire
        // for chips that live inside the L1 header button.
        e.stopImmediatePropagation();
        highlightIssueType(chip);
        return;
      }
      var head = e.target && e.target.closest &&
                 e.target.closest('[data-scw-ws-v2-summary-toggle]');
      if (!head) return;
      var panel = head.parentNode;
      if (!panel) return;
      var nowOpen = !panel.classList.contains('scw-ws-v2-summary--open');
      panel.classList.toggle('scw-ws-v2-summary--open', nowOpen);
      head.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
    });
  }

  /** When a warning chip is clicked, scope to its summary panel
   *  (grand → whole grid; per-L1 → that L1 only), find every card
   *  whose data-scw-ws-v2-warnings includes the chip\'s issue type,
   *  scroll the first one into view, and add a brief highlight
   *  animation to all of them. */
  function highlightIssueType(chip) {
    var type = chip.getAttribute('data-scw-ws-v2-warn-chip');
    if (!type) return;
    // Scope = the L1 block containing this chip, OR the whole v2
    // container if the chip is inside the grand summary head.
    var scope = chip.closest('.scw-ws-v2-l1') ||
                chip.closest('[id^="scw-ws-v2-"]') ||
                document;
    var matches = [];
    var cards = scope.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-warnings]');
    for (var i = 0; i < cards.length; i++) {
      var attr = cards[i].getAttribute('data-scw-ws-v2-warnings') || '';
      if ((' ' + attr + ' ').indexOf(' ' + type + ' ') !== -1) {
        matches.push(cards[i]);
      }
    }
    if (!matches.length) return;
    // Open the containing L1 + summary panels first if they\'re
    // collapsed, otherwise the scrollIntoView lands on an invisible row.
    var l1 = matches[0].closest('.scw-ws-v2-l1');
    if (l1 && !l1.classList.contains('scw-ws-v2-l1--open')) {
      // Honor the existing accordion handler by simulating a click on
      // the head button — that persists state + re-renders. Defer the
      // highlight until after the re-render.
      var head = l1.querySelector('[data-scw-ws-v2-l1-toggle]');
      if (head) {
        head.click();
        setTimeout(function () { highlightIssueType(chip); }, 50);
        return;
      }
    }
    matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    for (var m = 0; m < matches.length; m++) {
      (function (card) {
        card.classList.add('scw-ws-v2-card--warn-flash');
        setTimeout(function () {
          card.classList.remove('scw-ws-v2-card--warn-flash');
        }, 2200);
      })(matches[m]);
    }
  }

  if (!document.documentElement.hasAttribute('data-scw-ws-v2-l1-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-l1-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-l1-toggle]');
      if (!btn) return;
      var l1Id      = btn.getAttribute('data-scw-ws-v2-l1-toggle');
      var sourceKey = btn.getAttribute('data-scw-ws-v2-view');
      if (!l1Id || !sourceKey) return;

      if (!ns.state || typeof ns.state.toggleL1 !== 'function') return;
      ns.state.toggleL1(sourceKey, l1Id);

      // Re-render the affected view from its current data snapshot.
      if (ns.data && ns.render) {
        ns.render.renderView(sourceKey, ns.data.readRecords(sourceKey));
      }
    });
  }

  // Chevron click — toggle the card's detail panel open/closed.
  // No persistence per card; expand state lives in the DOM only and
  // resets on re-render. (If "remember which cards were open across
  // refreshes" becomes a real ask, persist a Set of ids per view.)
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-expand-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-expand-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-expand]');
      if (!btn) return;
      var card = btn.closest('.scw-ws-v2-card');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      card.classList.toggle('scw-ws-v2-card--open');
    });
  }

  // Mounting hardware chip × — same flow as the kebab "Delete line item":
  // click view_3962's native a.kn-link-delete on the chip's record row
  // and auto-confirm Knack's modal. The chip's record IS just another
  // line item in view_3962, so it has the standard delete column.
  // "+ Add" accessory link in the parent\'s detail panel — resolves
  // the live Knack route at click time so we don\'t hard-code a slug
  // that bounces to home on scenes where it doesn\'t match. Walks
  // the page for any anchor whose text matches a known add-accessory
  // label; if one matches, we click() it (Knack handles the
  // navigation, preserving SPA / parent-id wiring). If nothing
  // matches we surface an alert instead of going home.
  // Resolve the "#{base}/add-accessory-line-item/{parentId}" base path.
  //
  // The base is the FULL route prefix up to and including the SOW id —
  // and it must preserve every breadcrumb scene in the current hash,
  // because Knack hash routing needs the whole ancestor chain to resolve
  // the child scene. The earlier per-slug patterns hard-required
  // `team-calendar/project-dashboard` to be adjacent, which broke for any
  // user who drilled in through an intermediate scene (e.g.
  //   team-calendar/edit-client/{clientId}/project-dashboard/{pid}/build-sow/{sid}
  // ) — that `edit-client/{id}/` crumb is exactly what produced the
  // "Could not detect SOW context" alert for some users but not others.
  //
  // So: greedily capture from the start of the hash through the terminal
  // SOW scene slug + 24-hex id, whatever crumbs sit in between. If the
  // hash has no trailing SOW id (e.g. some comparison-grid routes), fall
  // back to recovering it from the grid section the link lives in
  // (bid-review-v2 stamps data-sow-id) and appending it to the slug base.
  var SOW_SLUG = '(?:build-(?:sow|quote)|review-bids|deploy|scope-of-work-details|scope-of-work)';
  function resolveAddAccessoryBase(link) {
    // Drop the leading '#' and any trailing ?query (Knack appends
    // per-page params after the route).
    var hash = (window.location.hash || '').replace(/^#/, '').replace(/\/?\?.*$/, '');

    var anchored = hash.match(new RegExp('^(.*\\/' + SOW_SLUG + '\\/[a-f0-9]{24})'));
    if (anchored) return anchored[1];

    var sowId = '';
    var sec = link && link.closest && link.closest('[data-sow-id]');
    if (sec) sowId = sec.getAttribute('data-sow-id') || '';
    if (sowId) {
      var slugBase = hash.match(new RegExp('^(.*\\/' + SOW_SLUG + ')(?:\\/|$)'));
      if (slugBase) return slugBase[1] + '/' + sowId;
    }
    return '';
  }

  if (!document.documentElement.hasAttribute('data-scw-ws-v2-addacc-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-addacc-bound', '1');
    document.addEventListener('click', function (e) {
      var link = e.target && e.target.closest &&
                 e.target.closest('[data-scw-ws-v2-add-accessory]');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      var parentId = link.getAttribute('data-scw-ws-v2-add-accessory') || '';
      if (!parentId) return;
      // Sales scenes have no add-accessory child page in Builder, so
      // navigating to the add-accessory-line-item slug dead-ends there.
      // Route the per-item add through the custom accessory modal
      // instead — it posts the same Make webhook the bulk add uses,
      // scoped to this one row.
      var v2Container = link.closest('[id^="scw-ws-v2-view_"]');
      var v2ViewKey = v2Container ? v2Container.id.replace(/^scw-ws-v2-/, '') : '';
      var v2Cfg = (v2ViewKey && ns.cfg && typeof ns.cfg.viewCfg === 'function')
        ? ns.cfg.viewCfg(v2ViewKey) : null;
      if (v2Cfg && v2Cfg.moneyMode === 'sales' &&
          ns.toolbar && typeof ns.toolbar.openAddAccessories === 'function') {
        var addCard = link.closest('.scw-ws-v2-card');
        var addLabelEl = addCard && addCard.querySelector('.scw-ws-v2-cell--label');
        var addLabel = addLabelEl ? (addLabelEl.textContent || '').trim() : '';
        if (!addLabel) {
          var addProdEl = addCard && addCard.querySelector('.scw-ws-v2-product-name');
          addLabel = addProdEl ? (addProdEl.textContent || '').trim() : '';
        }
        ns.toolbar.openAddAccessories(v2ViewKey, {
          ids:    [parentId],
          labels: [addLabel || parentId]
        });
        return;
      }
      // Build the URL deterministically from the same base path the
      // chip edit links use. resolveAddAccessoryBase() matches against
      // the current hash; if it returns nothing we surface an alert
      // rather than silently bouncing to home.
      var base = resolveAddAccessoryBase(link);
      if (!base) {
        if (window.console) {
          console.warn('[scw-ws-v2] add-accessory: no SOW base from hash',
            window.location.hash);
        }
        alert('Could not detect SOW context from the URL.');
        return;
      }
      window.location.hash = '#' + base + '/add-accessory-line-item/' + parentId;
    });
  }

  // Accessory qty stepper — click ± next to a chip in the parent\'s
  // Accessories detail to PUT the bracket\'s field_1964 (qty). Only
  // bound to chips whose field_2230 allows multi-qty (see card.js).
  // Idempotent global binding.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-accstep-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-accstep-bound', '1');
    document.addEventListener('click', function (e) {
      var step = e.target && e.target.closest &&
                 e.target.closest('[data-scw-ws-v2-acc-step]');
      if (!step || step.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      var accId = step.getAttribute('data-scw-ws-v2-acc-id');
      var dir   = step.getAttribute('data-scw-ws-v2-acc-step');
      if (!accId || !dir) return;
      var container = step.closest('[id^="scw-ws-v2-"]');
      var viewKey = container ? container.id.replace(/^scw-ws-v2-/, '') : '';
      if (!viewKey) return;
      // Read current qty from the model so we don\'t race the DOM.
      var records = (ns.data && typeof ns.data.readRecords === 'function')
        ? ns.data.readRecords(viewKey) : [];
      var rec = null;
      for (var i = 0; i < records.length; i++) {
        if (records[i] && records[i].id === accId) { rec = records[i]; break; }
      }
      var raw = rec ? rec.field_1964_raw : null;
      var cur = (typeof raw === 'number') ? raw
              : parseFloat((rec && rec.field_1964 || '1').toString().replace(/[^0-9.\-]/g, ''));
      if (!isFinite(cur) || cur < 1) cur = 1;
      var next = dir === 'up' ? cur + 1 : Math.max(1, cur - 1);
      if (next === cur) return;
      // Optimistic UI — update the visible qty immediately.
      var qtyEl = step.parentNode && step.parentNode.querySelector('.scw-ws-v2-mh-qty');
      if (qtyEl) qtyEl.textContent = next;
      // PUT through SCW.knackAjax + refetch via the existing data layer.
      try {
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(viewKey, accId),
          type: 'PUT',
          data: JSON.stringify({ field_1964: next }),
          success: function (resp) {
            // Patch the local model with the new qty so the next
            // re-render shows the right value — but DO NOT call
            // notify/refetch here. The detail panel\'s innerHTML
            // rebuild causes a visible flicker on every step, and
            // accessory qty doesn\'t influence any other visible
            // computed field on the parent\'s row. The optimistic UI
            // update above is the authoritative display until the
            // next user-initiated render.
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(viewKey, accId, resp,
                  'field_1964', next);
              } else {
                // Fallback: patch the attrs directly so the model
                // doesn\'t drift on the next re-render.
                var v2 = window.Knack && Knack.views && Knack.views[viewKey];
                var m  = v2 && v2.model && v2.model.data &&
                         v2.model.data.get && v2.model.data.get(accId);
                if (m && m.set) {
                  m.set({ 'field_1964': next, 'field_1964_raw': next });
                }
              }
            } catch (e) { /* ignore — DOM already shows the right qty */ }
          },
          error: function (xhr) {
            console.warn('[scw-ws-v2] accessory qty step PUT failed', xhr);
            if (qtyEl) qtyEl.textContent = cur; // revert
          }
        });
      } catch (err) {
        console.warn('[scw-ws-v2] accessory qty step threw', err);
        if (qtyEl) qtyEl.textContent = cur;
      }
    });
  }

  // Mounting-hardware chip UNLINK — clears the accessory's parent
  // (field_2464) WITHOUT deleting the record: the accessory detaches from
  // this parent and becomes a standalone line item. Also repairs the old
  // parent's forward list (field_2207, derived from the live field_2464
  // back-pointers) so the denormalized pair doesn't drift server-side.
  // SOW/MDF are deliberately left untouched on unlink.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-mhunlink-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-mhunlink-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-mh-unlink]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var accId    = btn.getAttribute('data-scw-ws-v2-mh-unlink');
      var parentId = btn.getAttribute('data-scw-ws-v2-mh-uparent') || '';
      if (!accId) return;

      var container = btn.closest('[id^="scw-ws-v2-"]');
      var viewKey = container ? container.id.replace(/^scw-ws-v2-/, '') : 'view_3962';

      // Optimistic: patch the local model's back-pointer (chips are
      // back-pointer-sourced, so the chip won't resurrect on rebuilds)
      // and drop the chip from the DOM immediately.
      try {
        var sv  = Knack.views && Knack.views[viewKey];
        var rec = sv && sv.model && sv.model.data &&
                  sv.model.data.get && sv.model.data.get(accId);
        if (rec) rec.set({ field_2464_raw: [], field_2464: '' }, { silent: true });
      } catch (ePatch) { /* best-effort */ }
      var wrap = btn.closest('.scw-ws-v2-mh-chip-wrap');
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);

      function refetchSoon() {
        setTimeout(function () {
          if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
            ns.data.refetchAndNotify(viewKey);
          }
        }, 800);
      }

      SCW.knackAjax({
        url:  SCW.knackRecordUrl(viewKey, accId),
        type: 'PUT',
        data: JSON.stringify({ field_2464: [] }),
        success: function () {
          // Repair the old parent's forward list: every record still
          // pointing at it via field_2464, minus the one just unlinked.
          if (parentId && typeof SCW.knackRecordUrl === 'function') {
            var ids = [];
            try {
              var sv2 = Knack.views && Knack.views[viewKey];
              var rs = (sv2 && sv2.model && sv2.model.data &&
                        typeof sv2.model.data.toJSON === 'function')
                          ? sv2.model.data.toJSON() : [];
              for (var i = 0; i < rs.length; i++) {
                var r = rs[i];
                if (!r || !r.id || r.id === accId) continue;
                var raw = r.field_2464_raw;
                if (Array.isArray(raw) && raw.length && raw[0] &&
                    raw[0].id === parentId) ids.push(r.id);
              }
            } catch (eScan) { /* swallow */ }
            SCW.knackAjax({
              url:  SCW.knackRecordUrl(viewKey, parentId),
              type: 'PUT',
              data: JSON.stringify({ field_2207: ids }),
              success: refetchSoon,
              error:   function () { refetchSoon(); }
            });
          } else {
            refetchSoon();
          }
        },
        error: function (xhr) {
          console.warn('[scw-ws-v2] unlink PUT failed for ' + accId,
            xhr && xhr.status, xhr && xhr.responseText);
          // Refetch restores the chip — the unlink didn't land.
          refetchSoon();
        }
      });
    });
  }

  if (!document.documentElement.hasAttribute('data-scw-ws-v2-mhdel-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-mhdel-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-mh-del]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var chipId = btn.getAttribute('data-scw-ws-v2-mh-del');
      if (!chipId) return;

      var wrap = btn.closest('.scw-ws-v2-mh-chip-wrap');
      // Resolve the view to DELETE the accessory through. The main worksheet
      // wraps cards in #scw-ws-v2-<sourceView>, so the container resolves there
      // (build-SOW unchanged). The bid-review comparison grid mounts the card
      // OUTSIDE that container, so fall back to the source view stamped on the
      // card's own editable elements (data-scw-ws-v2-view = view_3921) instead
      // of the old blind 'view_3962' default — which isn't on that scene and
      // made the REST DELETE 403.
      var v3962Container = btn.closest('[id^="scw-ws-v2-"]');
      var cardEl = btn.closest('.scw-ws-v2-card');
      var viewNode = cardEl && cardEl.querySelector('[data-scw-ws-v2-view]');
      var v3962ViewKey = v3962Container
        ? v3962Container.id.replace(/^scw-ws-v2-/, '')
        : ((viewNode && viewNode.getAttribute('data-scw-ws-v2-view')) || 'view_3962');

      // PREFERRED path: click Knack's native FE delete button on the
      // record's row (auto-confirming the modal). Same attribute-selector
      // idiom as the kebab handler so 24-hex IDs starting with a digit
      // don't blow up the selector. The Make webhook below is only a
      // FALLBACK, used when that row (and so its kn-link-delete) isn't in
      // the DOM — mainly freshly-created accessories whose <tr> lags.
      var srcView = document.getElementById('view_3962');
      var link = srcView && srcView.querySelector(
        'tr[id="' + chipId + '"] a.kn-link-delete'
      );
      if (!link) {
        var v3610 = document.getElementById('view_3610');
        link = v3610 && v3610.querySelector(
          'tr[id="' + chipId + '"] a.kn-link-delete'
        );
      }

      // Show "Deleting…" feedback. Register the id so the in-progress
      // visual survives the source-view re-renders that fire on each poll
      // fetch (card.js reads ns.pendingDeletes), and stamp the live wrap
      // now so feedback is instant.
      ns.pendingDeletes = ns.pendingDeletes || {};
      ns.pendingDeletes[chipId] = true;
      markChipDeleting(wrap);

      if (link) {
        autoConfirmKnackDelete();
        link.click();
      } else if (ns.bulk && typeof ns.bulk.deleteRecordFE === 'function') {
        // No native delete link in the DOM (freshly-created accessory whose
        // <tr> lags) → front-end view-scoped REST DELETE, no Make webhook.
        ns.bulk.deleteRecordFE(v3962ViewKey, chipId).then(function (r) {
          if (!r || !r.ok) {
            console.warn('[scw-ws-v2] accessory FE delete failed for ' +
              chipId, r && r.status);
            clearChipDeleting(chipId, v3962ViewKey, wrap);
          }
        });
      } else {
        console.warn('[scw-ws-v2] cannot delete accessory ' + chipId +
          ' — no delete link and ns.bulk.deleteRecordFE unavailable');
        clearChipDeleting(chipId, v3962ViewKey, wrap);
      }

      // Poll the source view until the record actually drops out of the
      // model, THEN re-render so the chip vanishes the moment the delete
      // really lands. Both the FE-link path and the async Make webhook
      // settle on their own schedule, so the old single fixed-delay
      // refetch raced the deletion and usually fired too early — leaving
      // the chip until a manual refresh. Times out at ~30s and restores
      // the chip if the delete never confirms.
      pollUntilRecordGone(v3962ViewKey, chipId, function onGone() {
        if (ns.pendingDeletes) delete ns.pendingDeletes[chipId];
        if (ns.data && typeof ns.data.notify === 'function') {
          ns.data.notify(v3962ViewKey);
        }
      }, function onTimeout() {
        console.warn('[scw-ws-v2] accessory delete not confirmed within ' +
          'timeout for ' + chipId + ' — restoring chip');
        if (ns.pendingDeletes) delete ns.pendingDeletes[chipId];
        if (ns.data && typeof ns.data.notify === 'function') {
          ns.data.notify(v3962ViewKey);
        }
      });
    });
  }

  // Watch the DOM for Knack's confirm-delete modal and auto-click its
  // confirm button. Called immediately before triggering a
  // .kn-link-delete click. Disconnects after firing (or after 1.5s
  // if nothing appears) so we don't intercept unrelated modals.
  function autoConfirmKnackDelete() {
    var done = false;
    // Hide Knack's confirm dialog for the auto-confirm window so it can't
    // blink on screen for a frame before we click Yes (styles.js rule on
    // [data-scw-suppress-kn-modal]). Cleared when clicked or on timeout.
    document.documentElement.setAttribute('data-scw-suppress-kn-modal', '1');
    function unsuppress() {
      document.documentElement.removeAttribute('data-scw-suppress-kn-modal');
    }
    var obs = new MutationObserver(function () {
      if (done) return;
      // Knack renders a confirm dialog inside .kn-modal-bg with a
      // primary button labelled "Yes" / "Delete" (class is-primary
      // or kn-button-primary). Click the first one we find.
      var modals = document.querySelectorAll(
        '.kn-modal-bg .kn-modal, .kn-modal-bg, .kn-modal'
      );
      for (var i = 0; i < modals.length; i++) {
        var btn = modals[i].querySelector(
          'button.is-primary, .kn-button.is-primary, ' +
          'button[type="submit"].kn-button, ' +
          'a.kn-button.is-primary'
        );
        if (!btn) {
          // Fall back to any button whose visible text is Yes/Delete.
          var candidates = modals[i].querySelectorAll('button, a.kn-button');
          for (var j = 0; j < candidates.length; j++) {
            var t = (candidates[j].textContent || '').trim().toLowerCase();
            if (t === 'yes' || t === 'delete' || t === 'confirm' || t === 'ok') {
              btn = candidates[j];
              break;
            }
          }
        }
        if (btn) {
          done = true;
          btn.click();
          obs.disconnect();
          unsuppress();
          return;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Safety: drop the observer after 1.5s no matter what.
    setTimeout(function () {
      if (!done) { done = true; obs.disconnect(); }
      unsuppress();
    }, 1500);
  }
  // Shared with photos.js (photo-card trash → native delete in the
  // photos grid needs the same auto-confirm).
  ns.autoConfirmKnackDelete = autoConfirmKnackDelete;

  // ── Accessory chip delete: in-progress feedback + poll-until-gone ──

  // Stamp the "deleting…" visual onto a chip wrap directly (instant
  // feedback before any re-render). The shared ns.pendingDeletes
  // registry — read by card.js — re-applies this on every intervening
  // source-view re-render so the state can't flicker back while the
  // delete is still settling.
  function markChipDeleting(wrap) {
    if (!wrap) return;
    wrap.classList.add('scw-ws-v2-mh-chip-wrap--deleting');
    wrap.setAttribute('title', 'Deleting…');
    var del = wrap.querySelector('.scw-ws-v2-mh-del');
    if (del) del.style.display = 'none';
    var step = wrap.querySelector('.scw-ws-v2-mh-stepper');
    if (step) step.style.display = 'none';
    if (!wrap.querySelector('.scw-ws-v2-mh-spin')) {
      var spin = document.createElement('span');
      spin.className = 'scw-ws-v2-mh-spin';
      wrap.appendChild(spin);
    }
  }

  // Undo markChipDeleting (used on dispatch failure / timeout). Clears
  // the registry entry AND restores the live wrap in case no re-render
  // is coming to rebuild it.
  function clearChipDeleting(chipId, viewKey, wrap) {
    if (chipId && ns.pendingDeletes) delete ns.pendingDeletes[chipId];
    if (wrap) {
      wrap.classList.remove('scw-ws-v2-mh-chip-wrap--deleting');
      wrap.removeAttribute('title');
      var spin = wrap.querySelector('.scw-ws-v2-mh-spin');
      if (spin && spin.parentNode) spin.parentNode.removeChild(spin);
      var del = wrap.querySelector('.scw-ws-v2-mh-del');
      if (del) del.style.display = '';
      var step = wrap.querySelector('.scw-ws-v2-mh-stepper');
      if (step) step.style.display = '';
    }
  }

  // Refetch a source view's model on an interval until `recordId` is no
  // longer present, then call onGone(). Calls v.model.fetch() directly
  // (not refetchAndNotify) so the poll itself drives the visible
  // re-render only once — when the record is confirmed gone — rather
  // than flashing stale data each cycle. Gives up after ~30s and calls
  // onTimeout().
  function pollUntilRecordGone(viewKey, recordId, onGone, onTimeout) {
    var MAX_ATTEMPTS = 20;       // 20 * 1500ms ≈ 30s ceiling
    var INTERVAL_MS  = 1500;
    var FIRST_MS     = 700;      // FE-link deletes often land sub-second
    var attempts = 0;

    function gone() {
      try {
        var recs = (ns.data && typeof ns.data.readRecords === 'function')
          ? ns.data.readRecords(viewKey) : [];
        for (var i = 0; i < recs.length; i++) {
          if (recs[i] && recs[i].id === recordId) return false;
        }
        return true;
      } catch (e) { return false; }
    }

    function settle() {
      if (gone()) { if (typeof onGone === 'function') onGone(); return; }
      if (attempts >= MAX_ATTEMPTS) {
        if (typeof onTimeout === 'function') onTimeout();
        return;
      }
      setTimeout(step, INTERVAL_MS);
    }

    function step() {
      attempts++;
      var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewKey] : null;
      if (v && v.model && typeof v.model.fetch === 'function') {
        var p = v.model.fetch();
        if (p && typeof p.always === 'function') p.always(settle);
        else if (p && typeof p.then === 'function') p.then(settle, settle);
        else setTimeout(settle, 400);
      } else {
        setTimeout(settle, INTERVAL_MS);
      }
    }

    setTimeout(step, FIRST_MS);
  }

  // Kebab menu — two-click delete with no confirm prompt.
  //   1. Click kebab → menu opens positioned under the button
  //   2. Click "Delete line item" → FRONT-END delete: cascade the accessory
  //      children through ns.bulk.queuedDeleteFE (view-scoped REST DELETE),
  //      then delete the parent via its native delete link (REST fallback).
  //      No Make webhook.
  // Single popover element reused across cards. Outside click closes.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-kebab-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-kebab-bound', '1');

    document.addEventListener('click', function (e) {
      var kebab = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-kebab]');
      if (kebab) {
        e.preventDefault();
        e.stopPropagation();
        var rowId  = kebab.getAttribute('data-scw-ws-v2-kebab');
        // Prefer the view stamped on the button. The card can be embedded
        // OUTSIDE a #scw-ws-v2-<view> container — e.g. the bid-review-v2
        // comparison grid mounts it in .scw-bid-review-v2__panel-col--card —
        // where the container-id derivation returns null and the delete
        // silently no-ops.
        var viewId = kebab.getAttribute('data-scw-ws-v2-view') || null;
        if (!viewId) {
          var container = kebab.closest('[id^="scw-ws-v2-"]');
          viewId = container ? container.id.replace(/^scw-ws-v2-/, '') : null;
        }
        // Trash icon = direct delete (two-click via Knack\'s native
        // confirm modal which we auto-accept). Same cascade logic
        // that the old kebab menu fired — moved inline here.
        if (rowId) {
          // 1. Find any accessory records connected back to this
          //    line item (mounting brackets etc, identified by
          //    field_2464_raw pointing at rowId) and fire the Make
          //    delete webhook for each. They're hidden from the v2
          //    tree but still exist in the source view's model.
          var allRecs = (viewId && ns.data && typeof ns.data.readRecords === 'function')
            ? ns.data.readRecords(viewId) : [];

          // v1-parity safety net: never delete a survey-derived SOW item
          // (field_2586 = # associated survey line items > 0) on the surfaces
          // where the block applies (sales view_3586 + bid-review view_3921;
          // see card.js DELETE_BLOCK_VIEWS). The card hides the trash for these
          // (kebabCell → isDeleteBlocked), but guard here too in case a stale
          // render left a clickable button behind.
          var selfRec = null;
          if (viewId === 'view_3586' || viewId === 'view_3921') {
            for (var qi = 0; qi < allRecs.length; qi++) {
              if (allRecs[qi] && allRecs[qi].id === rowId) { selfRec = allRecs[qi]; break; }
            }
          }
          if (selfRec) {
            var scRaw = selfRec['field_2586_raw'];
            var scN = (typeof scRaw === 'number') ? scRaw
              : parseFloat(String(selfRec['field_2586'] == null ? '' : selfRec['field_2586'])
                  .replace(/[^0-9.\-]/g, ''));
            if (!isNaN(scN) && scN > 0) {
              console.warn('[scw-ws-v2] delete blocked — ' + rowId +
                ' has ' + scN + ' associated survey item(s) (field_2586)');
              return;
            }
          }

          var accIds = [];
          for (var ri = 0; ri < allRecs.length; ri++) {
            var r = allRecs[ri];
            var raw = r && r['field_2464_raw'];
            if (Array.isArray(raw)) {
              for (var rj = 0; rj < raw.length; rj++) {
                if (raw[rj] && raw[rj].id === rowId) {
                  if (accIds.indexOf(r.id) === -1) accIds.push(r.id);
                  break;
                }
              }
            }
          }
          // Delete the parent line item itself. Defined here but invoked
          // only AFTER the accessory cascade settles (below), so a parent
          // delete that re-renders or navigates the view can't cancel the
          // in-flight child deletes — backlog #1's "navigating right after
          // the parent delete cancels in-flight child deletes" failure.
          function deleteParent() {
            // Delete the parent through Knack's native delete link.
            //    Auto-confirm the modal so it stays a two-click flow.
            // Knack record IDs are 24-char hex strings — many start with
            // a digit, which CSS doesn't allow as the first char of an
            // ID selector. Use the attribute selector form instead.
            var srcView = viewId ? document.getElementById(viewId) : null;
            var link = srcView && srcView.querySelector(
              'tr[id="' + rowId + '"] a.kn-link-delete'
            );
            if (!link) {
              var v3610 = document.getElementById('view_3610');
              link = v3610 && v3610.querySelector(
                'tr[id="' + rowId + '"] a.kn-link-delete'
              );
            }
            if (!link) {
              // No native delete route on this view (e.g. view_3921 on the
              // bid-review comparison grid has none — Knack's own link there
              // just routes home and deletes nothing). Delete the record
              // directly via the view-scoped REST endpoint — the same proven
              // path the v1 bid-review uses — then refetch so the grid (which
              // listens on knack-view-render.<view>) drops the row.
              if (viewId && window.SCW && typeof SCW.knackAjax === 'function' &&
                  typeof SCW.knackRecordUrl === 'function') {
                SCW.knackAjax({
                  url:  SCW.knackRecordUrl(viewId, rowId),
                  type: 'DELETE',
                  success: function () {
                    if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
                      ns.data.refetchAndNotify(viewId);
                    }
                  },
                  error: function (xhr) {
                    console.warn('[scw-ws-v2] direct DELETE failed for ' + rowId,
                      xhr && xhr.status, xhr && xhr.responseText);
                  }
                });
              } else {
                console.warn('[scw-ws-v2] kn-link-delete not found and no viewId/knackAjax for ' + rowId);
              }
              return;
            }
            autoConfirmKnackDelete();
            link.click();

            // Refetch the source view a beat after the delete so the
            // row stays gone even if Knack didn't fire a fresh
            // view-render. Mirrors the chip × delete handler below.
            setTimeout(function () {
              if (viewId && ns.data && typeof ns.data.refetchAndNotify === 'function') {
                ns.data.refetchAndNotify(viewId);
              }
            }, 1500);
          }

          // 2. Cascade-delete the accessories FIRST, through the bulk
          //    module's FRONT-END concurrency-capped + retry/backoff queue
          //    (ns.bulk.queuedDeleteFE — view-scoped REST DELETE, no Make).
          //    A bare fetch-per-child silently loses writes to Knack's
          //    ~10 req/s 429s and gets cancelled when the parent delete
          //    navigates (backlog #1). Delete the parent once children settle.
          if (accIds.length && ns.bulk &&
              typeof ns.bulk.queuedDeleteFE === 'function') {
            ns.bulk.queuedDeleteFE(viewId, accIds).then(function (results) {
              var failed = 0;
              for (var fr = 0; fr < results.length; fr++) {
                if (!results[fr].ok) failed++;
              }
              if (failed) {
                console.warn('[scw-ws-v2] ' + failed + ' of ' + accIds.length +
                  ' accessory delete(s) failed for parent ' + rowId);
              }
              deleteParent();
            });
          } else {
            // No accessories (or queue unavailable) — just delete the parent.
            deleteParent();
          }
        }
        return;
      }
    });
  }

  // Return the Backbone records of the first present+populated view in
  // the list. Lets a picker source from its build-SOW-scene view OR a
  // bid-review-scene equivalent, whichever is actually on the page.
  function firstViewRecords(viewKeys) {
    for (var i = 0; i < viewKeys.length; i++) {
      var v = (typeof Knack !== 'undefined' && Knack.views &&
               Knack.views[viewKeys[i]]) || null;
      if (!v || !v.model) continue;
      var recs = (v.model.data && v.model.data.models) || v.model.models || null;
      if (recs && recs.length) return recs;
    }
    return null;
  }

  // Connection-cell click — opens the picker modal scoped to the
  // record's bucket-appropriate candidate set. Currently wired for
  // field_1957 (Connected Devices) on default-bucket rows; reusable
  // for field_1958 / others in Phase 4.B.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-conn-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-conn-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-conn]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      var fieldKey = btn.getAttribute('data-scw-ws-v2-conn');
      var recordId = btn.getAttribute('data-scw-ws-v2-record');
      var viewKey  = btn.getAttribute('data-scw-ws-v2-view');
      var label    = btn.getAttribute('data-scw-ws-v2-conn-label') || fieldKey;
      if (!fieldKey || !recordId || !viewKey) return;
      if (!ns.picker || typeof ns.picker.open !== 'function') return;

      // Pull all records loaded from the source view (cheap — already
      // in memory). Find the one we're editing so we can read its
      // current selection.
      var records = (ns.data && ns.data.readRecords(viewKey)) || [];
      var current = null;
      for (var i = 0; i < records.length; i++) {
        if (records[i] && records[i].id === recordId) { current = records[i]; break; }
      }

      // Current selection on this record (multi-connection field).
      var sel = [];
      if (current) {
        var rawSel = current[fieldKey + '_raw'];
        if (Array.isArray(rawSel)) {
          for (var s = 0; s < rawSel.length; s++) {
            if (rawSel[s] && rawSel[s].id) sel.push(rawSel[s].id);
          }
        }
      }

      // ── Survey object pickers (view_3505) ───────────────────────────
      // Bid (field_2415) · MDF/IDF (field_2375) · Connected Devices
      // (field_2380) · Connected To (field_2381). Candidates are collected
      // from the loaded survey records — self-contained, no external
      // locations/bids view needed (so only values already in use on this
      // survey appear; brand-new ones aren't pickable here yet). Connected
      // Devices/To PUT through view_3505 so mirror-connection-sync's
      // field_2380↔field_2381 cascade fires (createMirror VIEW_ID view_3505).
      var _vcfgSurvey = (ns.cfg && typeof ns.cfg.viewCfg === 'function')
        ? ns.cfg.viewCfg(viewKey) : null;
      if (_vcfgSurvey && _vcfgSurvey.moneyMode === 'survey') {
        var SF = (ns.cfg && ns.cfg.fields(viewKey)) || {};

        // Unique {id, name} from a connection field across all loaded records.
        var collectConnValues = function (fieldK) {
          var seen = Object.create(null), out = [];
          for (var i = 0; i < records.length; i++) {
            var raw = records[i] && records[i][fieldK + '_raw'];
            if (!Array.isArray(raw)) continue;
            for (var j = 0; j < raw.length; j++) {
              var v = raw[j];
              if (v && v.id && !seen[v.id]) {
                seen[v.id] = true;
                out.push({ id: v.id, name: (v.identifier != null ? String(v.identifier) : v.id) });
              }
            }
          }
          out.sort(function (a, b) {
            return String(a.name).localeCompare(String(b.name), undefined,
              { numeric: true, sensitivity: 'base' });
          });
          return out;
        };

        // Full candidate list from a dedicated grid view (bids view_3507,
        // MDF/IDF view_3617) so EVERY option shows, not just in-use ones.
        // Label prefers the in-use connection identifier (matches the
        // worksheet display exactly), then the view's label field, then id.
        // Falls back to in-use-only (collectConnValues) if the grid isn't
        // loaded on the page.
        var surveyCandidates = function (viewKeys, labelField, connF) {
          var recs = firstViewRecords(viewKeys) || [];
          if (!recs.length) return collectConnValues(connF);
          var inUse = Object.create(null);
          for (var u = 0; u < records.length; u++) {
            var uraw = records[u] && records[u][connF + '_raw'];
            if (!Array.isArray(uraw)) continue;
            for (var uj = 0; uj < uraw.length; uj++) {
              var uv = uraw[uj];
              if (uv && uv.id && uv.identifier != null) inUse[uv.id] = String(uv.identifier);
            }
          }
          var out = [], seen = Object.create(null);
          for (var i = 0; i < recs.length; i++) {
            var a = recs[i].attributes || recs[i] || {};
            if (!a.id || seen[a.id]) continue;
            seen[a.id] = true;
            var lbl = inUse[a.id] ||
              (a[labelField] != null ? String(a[labelField]).replace(/<[^>]*>/g, '').trim() : '') ||
              (a.identifier != null ? String(a.identifier).replace(/<[^>]*>/g, '').trim() : '') ||
              a.id;
            out.push({ id: a.id, name: String(lbl) });
          }
          out.sort(function (x, y) {
            return String(x.name).localeCompare(String(y.name), undefined,
              { numeric: true, sensitivity: 'base' });
          });
          return out;
        };
        var surveyRefetch = function () {
          if (ns.data && typeof ns.data.refetchAndNotify === 'function') ns.data.refetchAndNotify(viewKey);
          else if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
        };

        // Bid (multi) — full list from the BIDs grid (view_3507, label
        // field_2414). Modeled on SOW field_2154. When CLEARING the bid, the
        // picker's integrated clearNote field injects the required survey note
        // into the same PUT (and suppresses survey-bid-validate's gate) so the
        // requirement is satisfied without a second modal.
        if (fieldKey === (SF.bid || 'field_2415')) {
          var _noteKey = SF.surveyNotes || 'field_2412';
          ns.picker.open({
            sourceViewKey: viewKey, putViewKey: viewKey, recordId: recordId,
            fieldKey: fieldKey, label: 'Bid', selectedIds: sel,
            candidates: surveyCandidates(['view_3507'], 'field_2414', fieldKey), groupBy: false,
            itemLabel: function (r) { return r.name || r.id; },
            multi: true, onSaved: surveyRefetch,
            // Clearing every bid requires a survey note written in the SAME
            // PUT. The note field is integrated into the picker (shown only
            // when all selections are cleared) and prefilled with the current
            // survey note so the user appends/edits it.
            clearNote: {
              fieldKey: _noteKey,
              current: current ? current[_noteKey] : '',
              title: 'Survey note required',
              help: "You're removing this item from the bid. Add to or edit " +
                    'the survey note explaining why.',
              placeholder: 'e.g. Item not needed per customer; duplicate of E-014; etc.',
              requiredMsg: 'A survey note is required to clear the bid.',
              // Suppress survey-bid-validate's knack-cell-update gate so it
              // doesn't re-prompt (and clobber) on the picker's own refresh.
              onClear: function (note) {
                if (SCW.surveyBidValidate &&
                    typeof SCW.surveyBidValidate.markOwnBidWrite === 'function') {
                  SCW.surveyBidValidate.markOwnBidWrite(recordId, note);
                }
              }
            }
          });
          return;
        }

        // MDF / IDF (single) — full list from the MDF/IDF locations grid
        // (view_3617, label field_1642).
        if (fieldKey === (SF.mdfIdf || 'field_2375')) {
          ns.picker.open({
            sourceViewKey: viewKey, putViewKey: viewKey, recordId: recordId,
            fieldKey: fieldKey, label: 'MDF / IDF', selectedIds: sel,
            candidates: surveyCandidates(['view_3617'], 'field_1642', fieldKey), groupBy: false,
            itemLabel: function (r) { return r.name || r.id; },
            multi: false, onSaved: surveyRefetch
          });
          return;
        }

        // Connected Devices (multi, NVR side) / Connected To (single, cam side).
        var _CD = SF.connectedDevices || 'field_2380';
        var _CT = SF.connectedDevice  || 'field_2381';
        if (fieldKey === _CD || fieldKey === _CT) {
          var _camBucket = ns.card && ns.card.CAM_READER_BUCKET;
          var _isCD = (fieldKey === _CD);
          // Cam/readers already connected to THIS device — keep them offered
          // (so they stay checked) even though their Connected To is populated.
          var _selSet = {};
          for (var si = 0; si < sel.length; si++) _selSet[sel[si]] = true;
          var connCands = [];
          for (var ci = 0; ci < records.length; ci++) {
            var crec = records[ci];
            if (!crec || !crec.id || crec.id === recordId) continue;
            var cbid = (ns.card && typeof ns.card.bucketIdOf === 'function')
              ? ns.card.bucketIdOf(crec, viewKey) : '';
            if (_isCD) {
              if (cbid !== _camBucket) continue;            // devices → connect cam/readers
              // Only offer cam/readers that AREN'T already connected to another
              // device — mirrors the other worksheets. Their Connected To
              // (field_2381) being populated (and not already ours) means
              // they're spoken for; skip them.
              if (!_selSet[crec.id]) {
                var _ctRaw = crec[_CT + '_raw'];
                var _ctPop = (Array.isArray(_ctRaw) && _ctRaw.length && _ctRaw[0] && _ctRaw[0].id) ||
                  (typeof crec[_CT] === 'string' && /[0-9a-f]{24}/i.test(crec[_CT]));
                if (_ctPop) continue;
              }
            } else {
              if (cbid === _camBucket) continue;            // cam → connect to non-cam network gear
              var ccat = (ns.card && typeof ns.card.bucketCategoryOf === 'function')
                ? ns.card.bucketCategoryOf(crec, viewKey) : 'default';
              if (ccat === 'assumptions' || ccat === 'services') continue;
            }
            connCands.push(crec);
          }
          var _lblF  = SF.displayLabel || 'field_2365';
          var _prodF = SF.productName  || 'field_2379';
          var _mdfF  = SF.mdfIdf       || 'field_2375';
          ns.picker.open({
            sourceViewKey: viewKey, putViewKey: viewKey, recordId: recordId,
            fieldKey: fieldKey, label: label, selectedIds: sel,
            candidates: connCands,
            groupBy: function (r) {
              var raw = r[_mdfF + '_raw'];
              if (Array.isArray(raw) && raw[0] && raw[0].id) {
                return { id: raw[0].id, label: String(raw[0].identifier || '').replace(/<[^>]*>/g, '').trim() || 'MDF / IDF' };
              }
              return { id: '__unknown', label: 'No MDF / IDF' };
            },
            itemLabel: function (r) {
              var lbl  = (r[_lblF]  || '').toString().replace(/<[^>]*>/g, '').trim();
              var prod = (r[_prodF] || '').toString().replace(/<[^>]*>/g, '').trim();
              if (lbl && prod) return lbl + ' · ' + prod;
              return lbl || prod || r.id;
            },
            multi: _isCD, onSaved: surveyRefetch
          });
          return;
        }
      }

      // Connected Devices (field_1957) hardening — pre-select the TRUE set.
      // ------------------------------------------------------------------
      // field_1957 (parent → children) and field_2197 (child → parent) are
      // SEPARATE Knack fields kept aligned only by the cascade, so the
      // parent's field_1957 on the model can read STALE — missing children
      // that ARE connected (their field_2197 still points here). If the
      // picker pre-checks only that stale forward list, a resubmit sends a
      // SUBSET and the cascade dutifully clears the omitted children's
      // field_2197 — the "1/2 downstream connections, and it alternates"
      // bug. Union in every child whose field_2197 points back at this
      // parent so the modal pre-selects the real current set and a resubmit
      // can't drop a still-connected device.
      if (fieldKey === 'field_1957') {
        var _selSet = {};
        for (var su = 0; su < sel.length; su++) _selSet[sel[su]] = true;
        for (var rr = 0; rr < records.length; rr++) {
          var rrec = records[rr];
          if (!rrec || !rrec.id || rrec.id === recordId || _selSet[rrec.id]) continue;
          var rback = rrec['field_2197_raw'];
          if (!Array.isArray(rback)) continue;
          for (var rb = 0; rb < rback.length; rb++) {
            if (rback[rb] && rback[rb].id === recordId) {
              sel.push(rrec.id);
              _selSet[rrec.id] = true;
              break;
            }
          }
        }
      }

      // ── Candidate set ──
      // field_1957: cameras/readers on this SOW whose reciprocal
      // (field_2197) is empty OR points to THIS record. Mirrors v1's
      // connection-picker collectCandidates logic.
      var CAM_READER = ns.card && ns.card.CAM_READER_BUCKET;
      var selSet = {};
      for (var k = 0; k < sel.length; k++) selSet[sel[k]] = true;

      function bucketIdOf(rec) {
        var raw = rec && rec['field_2219_raw'];
        if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
        return '';
      }
      function reciprocalIds(rec) {
        var raw = rec && rec['field_2197_raw'];
        if (!Array.isArray(raw)) return [];
        var out = [];
        for (var i = 0; i < raw.length; i++) {
          if (raw[i] && raw[i].id) out.push(raw[i].id);
        }
        return out;
      }

      /** True when a candidate row's field_2231 (Map Connections, SOW side) is Yes. */
      function isMapConnectionsRow(rec) {
        var raw = rec && rec['field_2231_raw'];
        if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
        var s = (rec && rec['field_2231'] || '').toString().trim().toLowerCase();
        return s === 'yes' || s === 'true' || s === '1';
      }

      // Product picker (field_1949) — candidates come from the
      // Builder snippet's SCW.productMap (id → {name, buckets}), NOT
      // from the SOW line items loaded in `records`. Filter by the
      // current line item's bucket so we only show products that
      // belong here. SCW.productMapReady is a Promise that resolves
      // once all paginated product pages have been fetched — await
      // it before opening the picker so we never show an empty
      // candidate list.
      if (fieldKey === 'field_1949') {
        var openProductPicker = function () {
          var pmap = (window.SCW && SCW.productMap) || {};
          var myBucketId = current ? bucketIdOf(current) : '';
          var prodCandidates = [];
          for (var pid in pmap) {
            if (!Object.prototype.hasOwnProperty.call(pmap, pid)) continue;
            var p = pmap[pid];
            if (!p) continue;
            // Bucket gate: include only products whose buckets list
            // contains the line item's bucket. Products with no
            // buckets at all are still included as a catch-all (rare
            // but happens for newly-added products).
            if (myBucketId && Array.isArray(p.buckets) && p.buckets.length > 0
                && p.buckets.indexOf(myBucketId) === -1) {
              continue;
            }
            prodCandidates.push({
              id: pid,
              name: p.name || '(unnamed)'
            });
          }
          prodCandidates.sort(function (a, b) {
            return String(a.name).localeCompare(String(b.name), undefined,
              { numeric: true, sensitivity: 'base' });
          });

          // Current selection — field_1949 is a single-select
          // connection; read the existing connected id (if any).
          var prodSel = [];
          if (current) {
            var rawSel = current['field_1949_raw'];
            if (Array.isArray(rawSel)) {
              for (var s = 0; s < rawSel.length; s++) {
                if (rawSel[s] && rawSel[s].id) prodSel.push(rawSel[s].id);
              }
            } else if (rawSel && rawSel.id) {
              prodSel.push(rawSel.id);
            }
          }

          ns.picker.open({
            sourceViewKey: viewKey,
            // Route writes through v2's source view (view_3962). v1's
            // view_3610 is no longer on this page post-cutover.
            putViewKey:    viewKey,
            recordId:      recordId,
            fieldKey:      'field_1949',
            label:         'Product',
            selectedIds:   prodSel,
            candidates:    prodCandidates,
            itemLabel:     function (rec) { return rec.name || rec.id; },
            multi:         false,
            onSaved:       function () {
              if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
            }
          });
        };

        if (window.SCW && SCW.productMap) {
          openProductPicker();
        } else if (window.SCW && SCW.productMapReady
                   && typeof SCW.productMapReady.then === 'function') {
          SCW.productMapReady.then(openProductPicker);
        } else {
          console.warn('[scw-ws-v2] SCW.productMap missing — Builder snippet not loaded?');
        }
        return;
      }

      // Parent picker (field_2464) — candidates are every other
      // line item on the source view. Single-select. Used by
      // promoted accessories to re-parent themselves.
      if (fieldKey === 'field_2464') {
        // Parent candidates are EVERY primary line item on the source view —
        // all buckets (cameras, readers, NVRs/switches, enclosures, services,
        // assumptions, …), not just Cam/Reader + Networking/Headend. They're
        // grouped by MDF/IDF in the picker (groupBy below) so the full list
        // stays scannable. We drop only (a) the record being edited and
        // (b) records that are themselves accessories (they already have a
        // parent via field_2464, so making them a parent would nest
        // accessories).
        var parentCands = [];
        for (var pc = 0; pc < records.length; pc++) {
          var r = records[pc];
          if (!r || !r.id || r.id === recordId) continue;
          var ownParentRaw = r.field_2464_raw;
          if (Array.isArray(ownParentRaw) && ownParentRaw.length) continue;
          parentCands.push(r);
        }
        // Route writes through v2's source view (view_3962). v1's
        // view_3610 is no longer on this page post-cutover, so PUTs
        // through it silently drop fields the dead view doesn't expose.
        ns.picker.open({
          sourceViewKey: viewKey,
          putViewKey:    viewKey,
          recordId:      recordId,
          fieldKey:      'field_2464',
          label:         'Parent',
          selectedIds:   sel,
          candidates:    parentCands,
          multi:         false,
          // Grouped by MDF/IDF + canonically sorted by the picker default
          // (see CLAUDE.md "Picker conventions").
          itemLabel: function (r) {
            // Share the same product/drop resolver the card display
            // uses — it strips Knack\'s "<recordId> (<mdfLabel>)"
            // auto-identifier for buckets with no real drop label.
            if (ns.card && typeof ns.card.labelLineItem === 'function') {
              return ns.card.labelLineItem(r);
            }
            return r.id;
          },
          onSaved: function (chosenIds) {
            // Data model — there is NO server-side auto-mirror; the
            // cascade has to be done by us:
            //   accessory.field_2464 = "my parent"    (single conn)
            //   parent.field_2207    = "my children"  (array conn)
            //
            // The picker already PUT field_2464 on the accessory. Now
            // we mutate field_2207 on the OLD parent (remove this
            // accessory) and NEW parent (add it).
            //
            // CRITICAL: we GET each parent from the server before we
            // PUT, so we read the authoritative current child list. An
            // earlier version read from the local Backbone model — but
            // view_3962 doesn\'t expose field_2207 fully, so the model
            // had [] and we then PUT [newAccessoryId], WIPING every
            // other child the parent already had. Read-then-write
            // against the live server avoids that wipe.

            // Patch the accessory\'s local back-pointer so the row
            // re-groups under the new parent before refetch.
            try {
              var srcView = Knack.views && Knack.views[viewKey];
              var srcRec  = srcView && srcView.model && srcView.model.data &&
                            srcView.model.data.get && srcView.model.data.get(recordId);
              if (srcRec) {
                var newRaw = [];
                if (chosenIds && chosenIds[0]) {
                  newRaw.push({ id: chosenIds[0], identifier: '' });
                }
                srcRec.set({
                  field_2464_raw: newRaw,
                  field_2464:     chosenIds && chosenIds[0] ? chosenIds[0] : ''
                }, { silent: true });
              }
            } catch (eSrc) { /* best-effort */ }

            var newParentId = (chosenIds && chosenIds[0]) || '';

            // Find candidate old parents — any record in the v2 source
            // model that lists this accessory in field_2207_raw OR
            // field_1958_raw (whichever the view happens to expose).
            // The local model can be empty/stale here; that\'s fine,
            // each candidate is re-verified via a GET below.
            var oldParentCandidates = [];
            try {
              var sv = Knack.views && Knack.views[viewKey];
              var jr = (sv && sv.model && sv.model.data &&
                        typeof sv.model.data.toJSON === 'function')
                          ? sv.model.data.toJSON() : [];
              for (var oi = 0; oi < jr.length; oi++) {
                var r = jr[oi];
                if (!r || !r.id || r.id === newParentId) continue;
                var raws = [r.field_2207_raw, r.field_1958_raw];
                for (var ri = 0; ri < raws.length; ri++) {
                  var raw = raws[ri];
                  if (!Array.isArray(raw)) continue;
                  for (var oj = 0; oj < raw.length; oj++) {
                    if (raw[oj] && raw[oj].id === recordId) {
                      oldParentCandidates.push(r.id);
                      ri = raws.length; // break outer
                      break;
                    }
                  }
                }
              }
            } catch (eScan) { /* ignore */ }

            var pending = 0;
            function done() {
              if (pending > 0) return;
              if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
                ns.data.refetchAndNotify(viewKey);
              }
            }

            // Inherit the new parent's SOW + MDF/IDF. An accessory rides
            // with its parent, so a re-parent mirrors the parent's
            // field_2154 (SOW array) and field_1946 (MDF/IDF) onto the
            // accessory — exactly, including blanks. Skipped on clear
            // (no new parent). Local raws are patched too so the card
            // regroups under the right MDF group and the SOW cell
            // updates before the refetch lands.
            if (newParentId) {
              try {
                var pv    = Knack.views && Knack.views[viewKey];
                var pRec  = pv && pv.model && pv.model.data &&
                            pv.model.data.get && pv.model.data.get(newParentId);
                var pAttrs = pRec && (pRec.attributes ||
                  (typeof pRec.toJSON === 'function' ? pRec.toJSON() : null));
                if (pAttrs) {
                  var pSowRaw = Array.isArray(pAttrs.field_2154_raw) ? pAttrs.field_2154_raw : [];
                  var pMdfRaw = Array.isArray(pAttrs.field_1946_raw) ? pAttrs.field_1946_raw : [];
                  var sowIds = [], si;
                  for (si = 0; si < pSowRaw.length; si++) {
                    if (pSowRaw[si] && pSowRaw[si].id) sowIds.push(pSowRaw[si].id);
                  }
                  var mdfIds = [];
                  for (si = 0; si < pMdfRaw.length; si++) {
                    if (pMdfRaw[si] && pMdfRaw[si].id) mdfIds.push(pMdfRaw[si].id);
                  }
                  if (srcRec) {
                    try {
                      srcRec.set({
                        field_2154_raw: pSowRaw.slice(),
                        field_1946_raw: pMdfRaw.slice()
                      }, { silent: true });
                    } catch (eSet) { /* best-effort */ }
                  }
                  pending++;
                  SCW.knackAjax({
                    url:  SCW.knackRecordUrl(viewKey, recordId),
                    type: 'PUT',
                    data: JSON.stringify({ field_2154: sowIds, field_1946: mdfIds }),
                    success: function () { pending--; done(); },
                    error: function (xhr) {
                      console.warn('[scw-ws-v2] parent SOW/MDF inherit PUT failed for ' +
                        recordId, xhr && xhr.status, xhr && xhr.responseText);
                      pending--; done();
                    }
                  });
                }
              } catch (eInh) {
                console.warn('[scw-ws-v2] parent SOW/MDF inherit threw', eInh);
              }
            }

            // Read the parent\'s CURRENT field_2207 from the server,
            // mutate (add or remove this accessory), then PUT.
            // Rebuild the children list for a parent from the LIVE
            // accessory back-pointers in view_3962\'s model. Every
            // line-item record has field_2464_raw (we just patched the
            // edited one locally), so collecting all records whose
            // field_2464_raw[0].id === parentId gives us the
            // authoritative children list — no GET needed.
            //
            // We can\'t GET field_2207 from view_3962: the view exposes
            // it for writes but not for reads, so an earlier GET-then-
            // PUT approach was reading [] and then overwriting the
            // server with just the new accessory id.
            function childrenOf(parentId) {
              var ids = [];
              try {
                var sv = Knack.views && Knack.views[viewKey];
                var rs = (sv && sv.model && sv.model.data &&
                          typeof sv.model.data.toJSON === 'function')
                            ? sv.model.data.toJSON() : [];
                for (var i = 0; i < rs.length; i++) {
                  var r = rs[i];
                  if (!r || !r.id) continue;
                  var raw = r.field_2464_raw;
                  if (!Array.isArray(raw) || !raw.length || !raw[0]) continue;
                  if (raw[0].id === parentId) ids.push(r.id);
                }
              } catch (e) { /* swallow */ }
              return ids;
            }

            function rewriteParent(parentId, mode /* 'add' | 'remove' */) {
              pending++;
              var url = SCW.knackRecordUrl(viewKey, parentId);
              var ids = childrenOf(parentId);
              // Defensive: 'add' means the just-edited accessory now
              // points at this parent — make sure it\'s in the list.
              // 'remove' means it no longer points here — make sure
              // it\'s NOT in the list. (childrenOf already reflects
              // both because we patched the local model, but make it
              // explicit so a half-applied patch doesn\'t corrupt the
              // PUT body.)
              if (mode === 'add' && ids.indexOf(recordId) === -1) {
                ids.push(recordId);
              }
              if (mode === 'remove') {
                ids = ids.filter(function (x) { return x !== recordId; });
              }
              var body = JSON.stringify({ field_2207: ids });
              console.log('[scw-ws-v2] cascade ' + mode + ' PUT', {
                url:  url,
                body: body,
                source: 'derived from field_2464_raw back-pointers'
              });
              SCW.knackAjax({
                url:  url,
                type: 'PUT',
                data: body,
                success: function (putResp) {
                  var rp = putResp && putResp.record ? putResp.record : putResp;
                  console.log('[scw-ws-v2] cascade ' + mode + ' PUT OK', {
                    parent: parentId,
                    sent:           ids,
                    got_field_2207: rp && rp.field_2207,
                    got_2207_raw:   rp && rp.field_2207_raw
                  });
                  pending--; done();
                },
                error:   function (xhr) {
                  console.warn('[scw-ws-v2] cascade ' + mode + ' PUT FAILED', {
                    parent: parentId,
                    status: xhr && xhr.status,
                    body:   xhr && xhr.responseText
                  });
                  pending--; done();
                }
              });
            }

            oldParentCandidates.forEach(function (opid) {
              if (opid !== newParentId) rewriteParent(opid, 'remove');
            });
            if (newParentId) rewriteParent(newParentId, 'add');

            // Immediate re-render so the accessory regroups under the
            // new parent based on the field_2464_raw patch above. The
            // post-PUT refetch in done() will reconcile parent chips.
            if (ns.data && typeof ns.data.notify === 'function') {
              ns.data.notify(viewKey);
            }
            if (pending === 0) done();
          }
        });
        return;
      }

      // MDF/IDF picker (field_1946) — candidates come from view_3577
      // (the Network Locations grid on the same scene). Single-select.
      // The MODEL_ONLY cascade in mirror-connection-sync handles
      // accessory re-grouping when this changes.
      if (fieldKey === 'field_1946') {
        // view_3577 on the build-SOW scene; view_3822 (MDF/IDF locations)
        // on the bid-review scene. Same MDF/IDF object (field_1642 label).
        var mdfRecords = firstViewRecords(['view_3577', 'view_3822']);
        if (!mdfRecords || !mdfRecords.length) {
          console.warn('[scw-ws-v2] view_3577/view_3822 model empty/missing — MDF picker can\'t open');
          return;
        }
        var mdfCandidates = [];
        for (var mm = 0; mm < mdfRecords.length; mm++) {
          var mm_attrs = mdfRecords[mm].attributes || mdfRecords[mm] || {};
          if (!mm_attrs.id) continue;
          // field_1642 = MDF/IDF full label (e.g. "HEADEND: : Pole #1")
          var mdfLabel = (mm_attrs.field_1642 || mm_attrs.identifier || '')
            .toString().replace(/<[^>]*>/g, '').trim();
          if (!mdfLabel) continue;
          mdfCandidates.push({ id: mm_attrs.id, name: mdfLabel });
        }
        mdfCandidates.sort(function (a, b) {
          return String(a.name).localeCompare(String(b.name), undefined,
            { numeric: true, sensitivity: 'base' });
        });

        ns.picker.open({
          sourceViewKey: viewKey,
          putViewKey:    viewKey,
          recordId:      recordId,
          fieldKey:      'field_1946',
          label:         'MDF / IDF',
          selectedIds:   sel,
          candidates:    mdfCandidates,
          itemLabel:     function (rec) { return rec.name || rec.id; },
          multi:         false,
          onSaved:       function () {
            // Mirror's MODEL_ONLY cascade handles accessory MDF
            // updates via scw-cascade-idle → refetchAndNotify. Also
            // refetch explicitly in case there are no accessories
            // to cascade (cascade only fires on records with PUTs in
            // flight).
            if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
              ns.data.refetchAndNotify(viewKey);
            } else if (ns.data && typeof ns.data.notify === 'function') {
              ns.data.notify(viewKey);
            }
          }
        });
        return;
      }

      // Drop Prefix picker (field_2240) — single-select from the Drop
      // Prefix catalog loaded by the Builder snippet
      // (window.SCW.dropPrefixOptions; see CLAUDE.md "Out-of-bundle Knack
      // Builder snippets"). Each entry is { id: <24-hex>, identifier: '<label>' }.
      // Changing the prefix recomputes the drop LABEL (field_1950, e.g.
      // "E-001") server-side, so refetch on save.
      if (fieldKey === 'field_2240') {
        var dpRaw = (window.SCW && window.SCW.dropPrefixOptions) || [];
        if (!dpRaw.length) {
          console.warn('[scw-ws-v2] SCW.dropPrefixOptions missing/empty — Builder snippet not loaded? Drop Prefix picker can\'t open');
          return;
        }
        var dpCandidates = [];
        for (var dpi = 0; dpi < dpRaw.length; dpi++) {
          var dpr = dpRaw[dpi];
          if (dpr && dpr.id && dpr.identifier) {
            dpCandidates.push({ id: dpr.id, identifier: dpr.identifier });
          }
        }
        dpCandidates.sort(function (a, b) {
          return String(a.identifier).localeCompare(String(b.identifier), undefined,
            { numeric: true, sensitivity: 'base' });
        });

        ns.picker.open({
          sourceViewKey: viewKey,
          putViewKey:    viewKey,
          recordId:      recordId,
          fieldKey:      'field_2240',
          label:         label || 'Drop Prefix',
          selectedIds:   sel,
          candidates:    dpCandidates,
          itemLabel:     function (rec) { return rec.identifier || rec.id; },
          multi:         false,
          onSaved:       function () {
            // The drop LABEL (field_1950, "E-001") recomputes from prefix +
            // drop number server-side — refetch so the card summary label
            // and this cell reflect the new prefix.
            if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
              ns.data.refetchAndNotify(viewKey);
            } else if (ns.data && typeof ns.data.notify === 'function') {
              ns.data.notify(viewKey);
            }
          }
        });
        return;
      }

      // SOW picker (field_2154) — candidates come from the Scopes of
      // Work grid (view_3325) on the same scene. v1 left this field
      // read-only; v2 adds an editable picker. Multi-connection: a
      // single line item can belong to multiple SOWs.
      if (fieldKey === 'field_2154') {
        // view_3325 on the build-SOW scene; view_3918 (Scopes of Work) on
        // the bid-review scene. Same SOW object (field_2122 SW-####,
        // field_2126 name).
        var sowRecords = firstViewRecords(['view_3325', 'view_3918']);
        if (!sowRecords || !sowRecords.length) {
          console.warn('[scw-ws-v2] view_3325/view_3918 model missing — SOW picker can\'t open');
          return;
        }
        var sowCandidates = [];
        for (var sm = 0; sm < sowRecords.length; sm++) {
          var sm_attrs = sowRecords[sm].attributes || {};
          if (!sm_attrs.id) continue;
          // field_2122 = SOW ID label (SW-####). Strip any HTML.
          var sowId = (sm_attrs.field_2122 || '').toString()
            .replace(/<[^>]*>/g, '').trim();
          // field_2126 = SOW friendly name.
          var sowName = (sm_attrs.field_2126 || '').toString()
            .replace(/<[^>]*>/g, '').trim();
          sowCandidates.push({
            id:   sm_attrs.id,
            sowId: sowId,
            name: sowName
          });
        }
        sowCandidates.sort(function (a, b) {
          return String(a.sowId).localeCompare(String(b.sowId), undefined,
            { numeric: true, sensitivity: 'base' });
        });

        ns.picker.open({
          sourceViewKey: viewKey,
          // PUT via the v2 source view (view_3962). mirror-connection-sync
          // has its own createMirror() instance bound to view_3962 so the
          // cascade still fires server-side.
          putViewKey:    viewKey,
          recordId:      recordId,
          fieldKey:      'field_2154',
          label:         'SOW',
          selectedIds:   sel,
          candidates:    sowCandidates,
          itemLabel:     function (rec) {
            if (rec.sowId && rec.name) return rec.sowId + ' · ' + rec.name;
            return rec.sowId || rec.name || rec.id;
          },
          multi:         true,
          onSaved:       function () {
            // PUT went via view_3610, but v2 reads from view_3962 —
            // whose Backbone model doesn't auto-refresh, and field_2154
            // isn't in the mirror-connection-sync cascade so the
            // scw-cascade-idle path never fires. Refetch explicitly.
            if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
              ns.data.refetchAndNotify(viewKey);
            } else if (ns.data && typeof ns.data.notify === 'function') {
              ns.data.notify(viewKey);
            }
          }
        });
        return;
      }

      var candidates = [];
      for (var c = 0; c < records.length; c++) {
        var r = records[c];
        if (!r || !r.id || r.id === recordId) continue;
        if (fieldKey === 'field_1957') {
          // Connected Devices (NVR side): pick from cam/reader rows
          // whose reciprocal field_2197 is empty or already points
          // at this NVR.
          if (bucketIdOf(r) !== CAM_READER) continue;
          var recip = reciprocalIds(r);
          var blank = recip.length === 0;
          var pointsToMe = recip.indexOf(recordId) !== -1;
          var alreadySel = selSet[r.id];
          if (!blank && !pointsToMe && !alreadySel) continue;
        } else if (fieldKey === 'field_2197') {
          // Connected Device (cam/reader side): pick the NVR/headend
          // this device connects to. Candidates = rows with the
          // Map-Connections flag (field_2231 = Yes).
          if (!isMapConnectionsRow(r)) continue;
        }
        candidates.push(r);
      }


      function itemLabel(rec) {
        var lbl  = (rec.field_1950 || '').toString().replace(/<[^>]*>/g, '').trim();
        var prod = (rec.field_1949 || '').toString().replace(/<[^>]*>/g, '').trim();
        if (lbl && prod) return lbl + ' · ' + prod;
        return lbl || prod || rec.id;
      }

      // mirror-connection-sync has a createMirror() instance bound to
      // view_3962 (the v2 source view), so v2 PUTs route through the
      // source view directly — the cascade still fires.
      var putViewKey = viewKey;

      // field_1957 is multi-connection (one NVR → many cams).
      // field_2197 is single-connection (one cam → one NVR).
      var isMulti = (fieldKey !== 'field_2197');

      ns.picker.open({
        sourceViewKey: viewKey,
        putViewKey:    putViewKey,
        recordId:      recordId,
        fieldKey:      fieldKey,
        label:         label,
        selectedIds:   sel,
        candidates:    candidates,
        // Grouped by MDF/IDF + canonically sorted by the picker default.
        itemLabel:     itemLabel,
        multi:         isMulti,
        onSaved:       function () {
          // notify() reads from the source view's Backbone model.
          // When the cascade kicks off in response to the PUT, the
          // scw-cascade-idle subscriber in data.js will refetch +
          // re-notify once everything settles. This early notify is
          // belt-and-suspenders for the no-cascade-fired case.
          if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
        }
      });
    });
  }

  // Chip click — flip Yes ↔ No, optimistic UI + 200ms flash, PUT in
  // background. Mirrors the direct-input edit flow over in edit.js,
  // but scoped to elements stamped with data-scw-ws-v2-chip.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-chip-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-chip-bound', '1');
    document.addEventListener('click', function (e) {
      var chipEl = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-chip]');
      if (!chipEl) return;
      e.preventDefault();
      e.stopPropagation();

      var fieldKey = chipEl.getAttribute('data-scw-ws-v2-chip');
      var recordId = chipEl.getAttribute('data-scw-ws-v2-record');
      var viewKey  = chipEl.getAttribute('data-scw-ws-v2-view');
      var cur      = chipEl.getAttribute('data-scw-ws-v2-bool') || 'No';
      if (!fieldKey || !recordId || !viewKey) return;

      var next = cur === 'Yes' ? 'No' : 'Yes';

      // Optimistic UI — flip class + attr + title immediately.
      chipEl.setAttribute('data-scw-ws-v2-bool', next);
      chipEl.classList.toggle('scw-ws-v2-chip--yes', next === 'Yes');
      chipEl.classList.toggle('scw-ws-v2-chip--no',  next === 'No');
      var t = chipEl.getAttribute('title') || '';
      chipEl.setAttribute('title', t.replace(/:\s*(Yes|No)$/, ': ' + next));

      // 200ms saving flash — same UX as direct-input edits.
      chipEl.classList.add('scw-ws-v2-chip--saving');
      setTimeout(function () {
        chipEl.classList.remove('scw-ws-v2-chip--saving');
      }, 200);

      // Fire-and-forget PUT. On error: revert + flag the chip red.
      var body = {}; body[fieldKey] = next;
      try {
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(viewKey, recordId),
          type: 'PUT',
          data: JSON.stringify(body),
          error: function (xhr) {
            console.warn('[scw-ws-v2] chip save failed', { recordId: recordId, fieldKey: fieldKey, xhr: xhr });
            chipEl.setAttribute('data-scw-ws-v2-bool', cur);
            chipEl.classList.toggle('scw-ws-v2-chip--yes', cur === 'Yes');
            chipEl.classList.toggle('scw-ws-v2-chip--no',  cur === 'No');
            chipEl.classList.add('scw-ws-v2-chip--error');
            setTimeout(function () {
              chipEl.classList.remove('scw-ws-v2-chip--error');
            }, 1500);
          }
        });
      } catch (e) { /* silent — error path covers it */ }
    });
  }

  // Single-select chip groups (e.g. survey Mounting Height). View-generic:
  // clicking an option sets that field to the option value and PUTs to the
  // record's view URL. Mirrors the boolean chip handler above.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-radiochip-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-radiochip-bound', '1');
    document.addEventListener('click', function (e) {
      var chipEl = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-radiochip]');
      if (!chipEl) return;
      e.preventDefault();
      e.stopPropagation();

      var fieldKey = chipEl.getAttribute('data-scw-ws-v2-radiochip');
      var recordId = chipEl.getAttribute('data-scw-ws-v2-record');
      var viewKey  = chipEl.getAttribute('data-scw-ws-v2-view');
      var option   = chipEl.getAttribute('data-scw-ws-v2-option');
      if (!fieldKey || !recordId || !viewKey) return;
      if (chipEl.classList.contains('is-selected')) return; // already set — no-op

      // Optimistic single-select within the group.
      var group = chipEl.closest('.scw-ws-v2-radiochips');
      var prevSel = group ? group.querySelector('.scw-ws-v2-radiochip.is-selected') : null;
      if (group) {
        var sibs = group.querySelectorAll('.scw-ws-v2-radiochip');
        for (var s = 0; s < sibs.length; s++) {
          sibs[s].classList.toggle('is-selected',   sibs[s] === chipEl);
          sibs[s].classList.toggle('is-unselected', sibs[s] !== chipEl);
        }
      }
      chipEl.classList.add('scw-ws-v2-radiochip--saving');
      setTimeout(function () {
        chipEl.classList.remove('scw-ws-v2-radiochip--saving');
      }, 200);

      var body = {}; body[fieldKey] = option;
      try {
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(viewKey, recordId),
          type: 'PUT',
          data: JSON.stringify(body),
          success: function () {
            try {
              if (typeof SCW.syncKnackModel === 'function') {
                SCW.syncKnackModel(viewKey, recordId, {}, fieldKey, option);
              }
            } catch (e2) { /* ignore */ }
          },
          error: function (xhr) {
            console.warn('[scw-ws-v2] radiochip save failed', { recordId: recordId, fieldKey: fieldKey, xhr: xhr });
            // Revert selection.
            if (group) {
              var sibs2 = group.querySelectorAll('.scw-ws-v2-radiochip');
              for (var r = 0; r < sibs2.length; r++) {
                var was = (sibs2[r] === prevSel);
                sibs2[r].classList.toggle('is-selected',   was);
                sibs2[r].classList.toggle('is-unselected', !was);
              }
            }
            chipEl.classList.add('scw-ws-v2-radiochip--error');
            setTimeout(function () {
              chipEl.classList.remove('scw-ws-v2-radiochip--error');
            }, 1500);
          }
        });
      } catch (e3) { /* silent — error path covers it */ }
    });
  }

  // Mount on every scene render — cheap (idempotent guard) and
  // catches SPA navigations into scenes that host the source view.
  $(document)
    .off('knack-scene-render.any.scwWsV2')
    .on('knack-scene-render.any.scwWsV2', function () { tryMountAll(); });

  // Also mount on view-render in case the source view appears on a
  // scene that already rendered. Cheap.
  $(document)
    .off('knack-view-render.any.scwWsV2Mount')
    .on('knack-view-render.any.scwWsV2Mount', function () { tryMountAll(); });

  // First-paint attempt for hot reload / late bundle load.
  setTimeout(tryMountAll, 0);
})();
/*** END WORKSHEET V2 — INIT **************************************************/
