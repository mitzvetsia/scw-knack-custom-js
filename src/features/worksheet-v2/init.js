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

  // External users explicitly admitted to internalOnly v2 previews on top of
  // the @getscw.com domain (e.g. subcontractors who need the v2 bid worksheet,
  // view_3505). Passed to SCW.isInternalUser() by the gate below. Lowercase.
  // NOTE: this is the UI gate only — these users ALSO need Knack view/object
  // read permission on the gated view for the data to load.
  var PREVIEW_ALLOWLIST = [
    'aaron.marheine@securevisionsolutions.com',
    'preston.bauer@securevisionsolutions.com'
  ];
  if (!ns.CONFIG.enabled) return;

  function buildPanel(vcfg) {
    var panel = document.createElement('div');
    panel.id = 'scw-ws-v2-' + vcfg.sourceViewKey;
    panel.className = 'scw-ws-v2';
    // Read-only deployments (e.g. the CO adoption panel view_4088): the
    // class drives styles.js's edit-affordance lockdown; co-adopt.js adds
    // the keyboard belt (hard-disables inputs after each render).
    if (vcfg.readOnly) panel.className += ' scw-ws-v2--readonly';

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
    return !(window.SCW && typeof SCW.isInternalUser === 'function' &&
      SCW.isInternalUser(PREVIEW_ALLOWLIST));
  }

  function tryMount(vcfg) {
    if (!vcfg || vcfg.enabled === false) return;   // per-view kill switch
    if (gatedOut(vcfg)) return;                     // internal-only preview gate
    if (document.getElementById('scw-ws-v2-' + vcfg.sourceViewKey)) {
      // Already mounted — still ensure the panel stays outside the source
      // view's KTL accordion (the accordion may have wrapped after mount).
      if (vcfg.hideSourceAccordion) relocatePanelOutsideAccordion(vcfg.sourceViewKey);
      return;
    }
    var anchor = document.querySelector(vcfg.mountAfterSelector);
    // Fallback anchor so deleting the primary mount view from the Knack scene
    // (e.g. retiring the hidden v1 grid view_3610) can't orphan the panel —
    // it then mounts after a stable surviving element (e.g. the v2 source view).
    if (!anchor && vcfg.mountAfterFallback) {
      anchor = document.querySelector(vcfg.mountAfterFallback);
    }
    if (!anchor) return; // source view not on this scene
    var panel = buildPanel(vcfg);
    anchor.insertAdjacentElement('afterend', panel);
    if (vcfg.hideSourceAccordion) relocatePanelOutsideAccordion(vcfg.sourceViewKey);
    // Initial paint — v1 may have already loaded the records by now.
    if (ns.data) {
      ns.render.renderView(vcfg.sourceViewKey, ns.data.readRecords(vcfg.sourceViewKey));
      if (typeof ns.data.notifyRendered === 'function') {
        ns.data.notifyRendered(vcfg.sourceViewKey);
      }
    }
  }

  // Full cutover views hide their native source view AND its KTL accordion
  // shell entirely — leaving JUST the v2 grid. The catch: the accordion
  // moves only the .kn-view into its body (see ktl-accordion.js), so
  // depending on render order the v2 panel can land INSIDE the accordion
  // body — and a collapsed accordion hides its body's contents. So we pull
  // the panel back OUT to be the accordion wrapper's next sibling; styles.js
  // then hides the (now panel-free) accordion wholesale. Idempotent.
  function relocatePanelOutsideAccordion(viewKey) {
    var panel = document.getElementById('scw-ws-v2-' + viewKey);
    if (!panel || !panel.closest) return;
    var wrapper = panel.closest('.scw-ktl-accordion');
    if (!wrapper || !wrapper.parentNode) return;   // not inside an accordion
    if (wrapper.nextSibling !== panel) {
      wrapper.parentNode.insertBefore(panel, wrapper.nextSibling);
    }
  }

  function tryMountAll() {
    var views = ns.CONFIG.views || [];
    views.forEach(tryMount);
  }

  // ── Defer full-grid rebuilds while the user is mid-edit ──────────────
  // ns.render.renderView replaces the grid's DOM wholesale. If that runs
  // while the user is focused in one of the grid's own inputs (typing a
  // note, a discount, a labor value…) it DESTROYS that input: the field
  // goes unresponsive / loses its in-progress value, and a rebuild kicked
  // off by a PRIOR edit's background refetch looks like it "interrupted"
  // the edit the user just started. So when a rebuild is requested while a
  // grid input is focused, stash it and flush once focus leaves the grid
  // (or via a re-arming safety tick). PUTs are NOT queued/blocked — every
  // edit still saves immediately; we only delay the disruptive rebuild.
  var _pendingRender = Object.create(null);   // viewKey -> vcfg (presence = pending)
  var _flushTimer    = null;
  var _lastSearchQ   = Object.create(null);   // viewKey -> query the body was last painted with

  function gridInputFocused(viewKey) {
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    var editable = tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    if (!editable) return false;
    var grid = document.getElementById('scw-ws-v2-' + viewKey);
    if (!grid || !grid.contains(el)) return false;
    // Only inputs inside the BODY are destroyed by a rebuild — renderView
    // swaps .scw-ws-v2-body wholesale and leaves the panel chrome (search
    // box, pill strips, banner) untouched. Deferring on chrome focus is not
    // just unnecessary, it's harmful: typing in the SEARCH box held this
    // very deferral, so the search's own notify-driven re-render never ran
    // and the list never filtered until focus left the panel.
    var body = grid.querySelector('.scw-ws-v2-body');
    return !!(body && body.contains(el));
  }

  function applyRender(key, records, vcfg) {
    // Skip redundant notify-driven rebuilds. Knack fires knack-view-render
    // several times on initial load (progressive paint, KTL re-wrap, per-page
    // param echo) and again on unrelated cross-view refreshes — each one drives
    // a notify → full DOM tree rebuild here, even when not one record changed
    // (the "rebuilding while idle" churn). If the grid is already painted and
    // nothing is dirty (no Backbone change/add/remove/reset, no optimistic
    // markDirty since the last render), there is nothing to repaint — bail.
    // Direct renders (sort / filter / mode / toolbar) call ns.render.renderView
    // straight, bypassing applyRender, so a real user action always renders.
    var _skipRender = false;
    try {
      var _grid = document.getElementById('scw-ws-v2-' + key);
      var _painted = _grid && _grid.querySelector('.scw-ws-v2-card');
      if (_painted && ns.data && typeof ns.data.peekDirty === 'function') {
        var _pk = ns.data.peekDirty(key);
        if (!_pk.all && _pk.count === 0) _skipRender = true;
      }
    } catch (e) { /* fall through and render */ }

    // A SEARCH-QUERY change dirties no record but absolutely needs a repaint
    // — the search box routes its re-render through notify (to coalesce with
    // edit renders), which lands exactly here. Compare against the query the
    // body was last painted with; a mismatch overrides the idle-churn skip.
    var _q = (ns.search && typeof ns.search.queryOf === 'function')
      ? (ns.search.queryOf(key) || '') : '';
    if (_skipRender && _q !== (_lastSearchQ[key] || '')) _skipRender = false;

    // Skip ONLY the expensive DOM rebuild when nothing changed — the toolbar /
    // sort / filter / bulk mounts below are idempotent (early-return when
    // already mounted) and must still run so the first notify after mount wires
    // them up.
    //
    // NOTE: scroll-anchoring now lives INSIDE renderView's full-rebuild path
    // (the only path that empties + refills the body and can jump the page).
    // An in-place edit replaces single card nodes without touching scroll, so
    // wrapping every render in the anchor's 600ms settle loop was pure waste
    // (and a heavy forced-reflow / rAF source) on the common edit case.
    if (!_skipRender) {
      ns.render.renderView(key, records);
      _lastSearchQ[key] = _q;
    }
    if (vcfg.hideSourceAccordion) relocatePanelOutsideAccordion(key);
    // Mode/photos toolbar — mount idempotently above the L1 list.
    // readOnly panels (CO adoption view_4088) skip the toolbar (its CTAs
    // are all write actions), sort (persists prefs), native filters, and
    // — critically — bulk below: bulk is a singleton keyed to ONE view, and
    // a second panel on the same scene would clobber _sourceViewKey so the
    // bulk modal served the wrong view's fields.
    if (!vcfg.readOnly && ns.toolbar && typeof ns.toolbar.mount === 'function') {
      ns.toolbar.mount(key);
    }
    if (!vcfg.readOnly && ns.sort && typeof ns.sort.mount === 'function') {
      ns.sort.mount(key);
    }
    if (!vcfg.readOnly && ns.nativeFilter && typeof ns.nativeFilter.mount === 'function') {
      ns.nativeFilter.mount(key);
    }
    var _vcSow = (ns.cfg && typeof ns.cfg.viewCfg === 'function')
      ? ns.cfg.viewCfg(key) : null;
    // Mount the pill strip when SOW isn't hidden, OR when the view
    // configures its own filterPills (e.g. survey filters by Bid even
    // though hideSow:true suppresses the SOW column).
    if (ns.sowFilter && typeof ns.sowFilter.mount === 'function' &&
        (!(_vcSow && _vcSow.hideSow) || (_vcSow && _vcSow.filterPills))) {
      ns.sowFilter.mount(key);
    }
    // Free-text search box (above the pills) — narrows records by product /
    // label / MDF-IDF / notes. Mounts idempotently on every render.
    if (ns.search && typeof ns.search.mount === 'function') {
      ns.search.mount(key);
    }
    // After every re-render, sync the bulk-select checkboxes to
    // current selection state + refresh the floating toolbar. GUARD on the
    // panel actually being mounted on THIS scene: bulk is a singleton, and
    // the background poll fires notify() for EVERY configured view on every
    // scene — without this guard the sales view's poll (view_3586) calls
    // bulk.mount('view_3586') on the bid-review scene, clobbering
    // _sourceViewKey to a SALES view so the bulk modal serves SALES fields
    // (Custom Disc %, Label #) on the bid comparison grid.
    if (!vcfg.readOnly &&
        ns.bulk && typeof ns.bulk.mount === 'function' &&
        document.getElementById('scw-ws-v2-' + key)) {
      ns.bulk.mount(key);
    }
    // The panel DOM for this view is final for this pass — let the
    // decorator modules (co-remove checkcells/actions, swap chips,
    // review-diff flags) re-apply onto the REAL cards. This fires even on
    // the _skipRender path: decorators are idempotent, and a skipped
    // rebuild may still follow an earlier DEFERRED rebuild that wiped
    // them (requestRender holds rebuilds while a grid input is focused).
    if (ns.data && typeof ns.data.notifyRendered === 'function') {
      ns.data.notifyRendered(key);
    }
  }

  function flushPending() {
    var keys = Object.keys(_pendingRender);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (gridInputFocused(key)) continue;     // still editing this grid — keep waiting
      var vcfg = _pendingRender[key];
      delete _pendingRender[key];
      // Re-read the freshest records (a later refetch — e.g. the recalc
      // sweep — may have landed in the model while we were deferred).
      var recs = (ns.data && typeof ns.data.readRecords === 'function')
        ? ns.data.readRecords(key) : [];
      applyRender(key, recs, vcfg);
    }
    if (Object.keys(_pendingRender).length === 0 && _flushTimer) {
      clearInterval(_flushTimer); _flushTimer = null;
    }
  }

  function requestRender(key, records, vcfg) {
    if (gridInputFocused(key)) {
      _pendingRender[key] = vcfg;              // defer — flush on blur
      if (!_flushTimer) {
        // Re-arming safety tick in case a focusout is ever missed. It only
        // flushes views the user is NOT currently focused in, so it can
        // never rebuild mid-edit.
        _flushTimer = setInterval(flushPending, 1500);
      }
      return;
    }
    applyRender(key, records, vcfg);
  }

  // Flush deferred rebuilds once the user leaves a grid input. focusout
  // bubbles (blur doesn't); defer a tick so document.activeElement settles
  // (focusout fires before the next focus target is assigned), so moving
  // directly between two grid inputs keeps deferring instead of rebuilding
  // in the gap.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-flush-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-flush-bound', '1');
    document.addEventListener('focusout', function () {
      setTimeout(flushPending, 0);
    }, true);
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
        // Defer the wholesale DOM rebuild while the user is mid-edit in this
        // grid (see requestRender) — otherwise a background refetch destroys
        // the focused input. Flushes on blur with the freshest records.
        requestRender(key, records, vcfg);
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
      // Persist so the choice survives the next rebuild (e.g. the Bid
      // filter) instead of snapping back to closed.
      if (ns.summary && typeof ns.summary.persistOpen === 'function') {
        ns.summary.persistOpen(panel, nowOpen);
      }
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
      var _newState = ns.state.toggleL1(sourceKey, l1Id);
      var _open = _newState && _newState[l1Id] === 'open';

      // Collapsing/expanding a group is a pure visibility flip — the cards,
      // order, summaries and warnings are all unchanged. So toggle the open
      // classes on the EXISTING L1 block instead of rebuilding the whole grid
      // (a full renderView was ~60-90ms / 168 cards just to hide one section —
      // the felt lag when collapsing MDF groups). The card chevron already
      // works this way. v2's accordion is non-exclusive (toggleL1 flips only
      // this L1), so no other block changes.
      var _container = document.getElementById('scw-ws-v2-' + sourceKey);
      var _block = null;
      if (_container) {
        var _blocks = _container.querySelectorAll('.scw-ws-v2-l1');
        for (var _bi = 0; _bi < _blocks.length; _bi++) {
          if (_blocks[_bi].getAttribute('data-scw-ws-v2-l1') === l1Id) {
            _block = _blocks[_bi]; break;
          }
        }
      }
      if (_block) {
        _block.classList.toggle('scw-ws-v2-l1--open', _open);
        var _head = _block.querySelector('[data-scw-ws-v2-l1-toggle]');
        if (_head) {
          _head.classList.toggle('scw-ws-v2-l1-head--open', _open);
          _head.setAttribute('aria-expanded', _open ? 'true' : 'false');
        }
      } else if (ns.data && ns.render) {
        // Block not in the DOM (shouldn't happen) — fall back to a full render.
        ns.render.renderView(sourceKey, ns.data.readRecords(sourceKey));
        if (typeof ns.data.notifyRendered === 'function') {
          ns.data.notifyRendered(sourceKey);
        }
      }
    });
  }

  // Chevron click — toggle the card's detail panel open/closed. Persisted
  // per record only on the views state.js flags (CARD_PERSIST_VIEWS,
  // e.g. view_4093/view_4056) — setCardOpen no-ops elsewhere, so this is
  // safe to call unconditionally.
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
      var _cont0 = card.closest('.scw-ws-v2');
      var _vk0 = _cont0 && _cont0.id ? _cont0.id.replace('scw-ws-v2-', '') : '';
      var _rid0 = card.getAttribute('data-scw-ws-v2-record');
      if (_vk0 && _rid0 && ns.state && typeof ns.state.setCardOpen === 'function') {
        ns.state.setCardOpen(_vk0, _rid0, card.classList.contains('scw-ws-v2-card--open'));
      }
      // The per-row "missing photos" chit must actually surface the
      // missing-photo placeholders: force the card open (never toggle
      // closed) and flip the view's photo strips on — the toolbar
      // "Show photos" toggle is the master photo switch.
      if (btn.classList.contains('scw-ws-v2-warn-chit') &&
          btn.getAttribute('data-issue-type') === 'photos') {
        card.classList.add('scw-ws-v2-card--open');
        var _cont = card.closest('.scw-ws-v2');
        var _vk = _cont && _cont.id ? _cont.id.replace('scw-ws-v2-', '') : '';
        if (_vk && ns.toolbar && typeof ns.toolbar.showPhotos === 'function') {
          ns.toolbar.showPhotos(_vk);
        }
        if (_vk && _rid0 && ns.state && typeof ns.state.setCardOpen === 'function') {
          ns.state.setCardOpen(_vk, _rid0, true);
        }
      }
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
      var v2Container = link.closest('[id^="scw-ws-v2-view_"]');
      var v2ViewKey = v2Container ? v2Container.id.replace(/^scw-ws-v2-/, '') : '';

      // Unify the per-item "+ Add" with the bulk "Add accessories" flow:
      // open the SAME modal, and in the background CHECK this row's box (and
      // clear any other selection) so adding one accessory feels identical to
      // adding many — same modal, the row simply pre-selected. The modal posts
      // the same Make webhook the bulk add uses. We fall through to the native
      // Knack add-accessory page ONLY when that modal isn't available.
      if (ns.toolbar && typeof ns.toolbar.openAddAccessories === 'function') {
        // Reflect the target as a checked row, matching what the bulk
        // selection would look like. Clear every other box so the checkbox
        // state matches what the modal acts on, and fire `change` (only on
        // boxes that actually flip) so bulk.js updates its selection + the
        // toolbar count.
        var boxes = document.querySelectorAll('[data-scw-ws-v2-select]');
        for (var bi = 0; bi < boxes.length; bi++) {
          var box  = boxes[bi];
          var want = box.getAttribute('data-scw-ws-v2-select') === parentId;
          if (box.checked !== want) {
            box.checked = want;
            box.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        // Friendly label for the modal's affected-rows list.
        var addCard = link.closest('.scw-ws-v2-card');
        var addLabelEl = addCard && addCard.querySelector('.scw-ws-v2-cell--label');
        var addLabel = addLabelEl ? (addLabelEl.textContent || '').trim() : '';
        if (!addLabel) {
          var addProdEl = addCard && addCard.querySelector('.scw-ws-v2-product-name');
          addLabel = addProdEl ? (addProdEl.textContent || '').trim() : '';
        }
        // On the bid-review-v2 comparison grid the review-bids hash carries the
        // PROJECT id, not the SOW id, so the modal's getSowIdFromHash() would
        // tag the new accessory with the wrong SOW. Pass the SOW id from the
        // section wrapping the clicked row (data-sow-id). On the worksheet
        // there's no such wrapper, so the modal falls back to the hash.
        var sowSection = link.closest('[data-sow-id]');
        var explicitSowId = sowSection ? (sowSection.getAttribute('data-sow-id') || '') : '';
        // presetSel keeps the modal scoped to this row even if the checkbox
        // sync above found no box (e.g. a surface without row selects).
        ns.toolbar.openAddAccessories(v2ViewKey, {
          ids:    [parentId],
          labels: [addLabel || parentId],
          sowId:  explicitSowId || undefined
        });
        return;
      }

      // Fallback (modal unavailable): native Knack add-accessory page. Build
      // the URL deterministically from the same base path the chip edit links
      // use. resolveAddAccessoryBase() matches against the current hash; if it
      // returns nothing we surface an alert rather than silently bouncing home.
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
      if (!viewKey) {
        // Embedded card (bid-review-v2 expand panel) — the card mounts
        // OUTSIDE any #scw-ws-v2-<view> container, so fall back to the
        // source view stamped on the card's own editable elements. Without
        // this the stepper silently no-oped on the bid review page.
        var stepCard = step.closest('.scw-ws-v2-card');
        var stepViewNode = stepCard && stepCard.querySelector('[data-scw-ws-v2-view]');
        viewKey = (stepViewNode && stepViewNode.getAttribute('data-scw-ws-v2-view')) || '';
      }
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
              : parseFloat((rec && rec.field_1964 || '').toString().replace(/[^0-9.\-]/g, ''));
      var qtyEl = step.parentNode && step.parentNode.querySelector('.scw-ws-v2-mh-qty');
      // Fall back to the RENDERED qty when the record isn't in this view's
      // loaded set. Previously `cur` defaulted to 1 in that case, which made
      // every "down" click a silent no-op (next === cur → early return) while
      // "up" still appeared to work — the "can't decrease at all" symptom. The
      // rendered number came from the card's own record read, so it's the
      // better source when the handler's lookup comes up empty.
      if (!isFinite(cur) && qtyEl) {
        cur = parseFloat((qtyEl.textContent || '').replace(/[^0-9.\-]/g, ''));
      }
      if (!isFinite(cur) || cur < 1) cur = 1;

      // Stepping below 1 removes the accessory. Confirm, then hand off to the
      // trash button's own click handler rather than reimplementing deletion —
      // that path owns the pending-delete registry, Knack's native FE delete,
      // the Make webhook fallback and the poll-until-gone refetch. If no trash
      // button is rendered (no parent, or a read-only panel) there's nothing to
      // delegate to, so the step is simply refused.
      if (dir === 'down' && cur <= 1) {
        var chipWrap = step.closest('.scw-ws-v2-mh-chip-wrap');
        var delBtn   = chipWrap && chipWrap.querySelector('[data-scw-ws-v2-mh-del]');
        if (!delBtn) return;
        var chipEl = chipWrap.querySelector('.scw-ws-v2-mh-chip');
        var chipLabel = (chipEl && (chipEl.textContent || '').trim()) || 'this accessory';
        if (!window.confirm(
              'Remove "' + chipLabel + '" from this device?\n\n' +
              'This deletes the accessory line item.')) return;
        delBtn.click();
        return;
      }

      var next = dir === 'up' ? cur + 1 : cur - 1;
      if (next === cur) return;
      // Optimistic UI — update the visible qty immediately.
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
      var viewKey = container ? container.id.replace(/^scw-ws-v2-/, '') : '';
      if (!viewKey) {
        // Same embedded-card fallback as the qty stepper: on the bid-review
        // page the card mounts outside any #scw-ws-v2-<view> container, and
        // the old blind 'view_3962' default isn't on that scene (PUT 403s).
        var unlCard = btn.closest('.scw-ws-v2-card');
        var unlViewNode = unlCard && unlCard.querySelector('[data-scw-ws-v2-view]');
        viewKey = (unlViewNode && unlViewNode.getAttribute('data-scw-ws-v2-view')) || 'view_3962';
      }

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
  // CO worksheet "Unlink from change order" — adopted (shared) rows detach
  // from the CO by removing the CO's SOW id from field_2154 (a direct
  // view-scoped PUT; single field, no cascade). The record itself and its
  // other SOW connections are untouched.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-unlink-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-unlink-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-unlink]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var rowId  = btn.getAttribute('data-scw-ws-v2-unlink');
      var viewId = btn.getAttribute('data-scw-ws-v2-view');
      var coId   = btn.getAttribute('data-scw-ws-v2-co');
      if (!rowId || !viewId || !coId) return;
      if (!(window.SCW && typeof SCW.knackAjax === 'function' && typeof SCW.knackRecordUrl === 'function')) return;

      // Current field_2154 ids minus the CO — what stays after unlink.
      var recs = (ns.data && typeof ns.data.readRecords === 'function') ? ns.data.readRecords(viewId) : [];
      var rec = null;
      for (var i = 0; i < recs.length; i++) { if (recs[i] && recs[i].id === rowId) { rec = recs[i]; break; } }
      function minusCo(r) {
        var raw = r && r['field_2154_raw'];
        var out = [];
        if (Array.isArray(raw)) {
          for (var j = 0; j < raw.length; j++) {
            if (raw[j] && raw[j].id && raw[j].id !== coId) out.push(raw[j].id);
          }
        }
        return out;
      }
      var remaining = minusCo(rec);
      // Accessory invariant: an accessory's SOW mirrors its parent's set, so
      // unlinking a parent detaches its accessories from the CO too —
      // otherwise they'd strand on the CO with no parent (and the build-page
      // reconcile sweep would fight whichever way they were left). Accessory
      // = a loaded CO row whose field_2464 back-pointer names this record.
      var accJobs = [];
      for (var a = 0; a < recs.length; a++) {
        var ar = recs[a];
        if (!ar || !ar.id || ar.id === rowId) continue;
        var aRaw = ar['field_2464_raw'];
        if (Array.isArray(aRaw) && aRaw[0] && aRaw[0].id === rowId) {
          accJobs.push({ id: ar.id, remaining: minusCo(ar) });
        }
      }

      function doUnlink() {
        var pending = 1 + accJobs.length;
        function settle() {
          if (--pending > 0) return;
          if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
            ns.data.refetchAndNotify(viewId);
            setTimeout(function () { ns.data.refetchAndNotify(viewId); }, 1500);
          }
        }
        // field_2965: '' — clear the CO Action stamp co-adopt.js writes on
        // adoption. The record returns to being a plain base-scope line; a
        // stale 'Add' would tint it as a CO add on other surfaces.
        SCW.knackAjax({
          url:  SCW.knackRecordUrl(viewId, rowId),
          type: 'PUT',
          data: JSON.stringify({ field_2154: remaining, field_2965: '' }),
          success: settle,
          error: function (xhr) {
            console.warn('[scw-ws-v2] CO unlink PUT failed for ' + rowId, xhr && xhr.status);
            alert('Could not remove the item from the change order. Try again.');
            settle();
          }
        });
        accJobs.forEach(function (job) {
          SCW.knackAjax({
            url:  SCW.knackRecordUrl(viewId, job.id),
            type: 'PUT',
            data: JSON.stringify({ field_2154: job.remaining, field_2965: '' }),
            success: settle,
            error: function (xhr) {
              console.warn('[scw-ws-v2] CO unlink PUT failed for accessory ' +
                job.id, xhr && xhr.status);
              settle();
            }
          });
        });
      }

      var body = 'Remove this item from the change order? It was adopted from ' +
        'survey/bid, so it stays on its original scope — only its link to this ' +
        'CO is removed.' +
        (accJobs.length
          ? ' Its ' + (accJobs.length === 1 ? 'attached accessory comes' :
              accJobs.length + ' attached accessories come') + ' off the CO with it.'
          : '');
      if (ns.confirmModal && typeof ns.confirmModal === 'function') {
        ns.confirmModal({ title: 'Remove from change order?', body: body,
          okLabel: 'Remove from CO', cancelLabel: 'Cancel' })
          .then(function (ok) { if (ok) doUnlink(); });
      } else if (window.confirm(body)) {
        doUnlink();
      }
    }, true);
  }

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

          // v1-parity safety net: honor the per-view delete-block rule
          // (card.js isDeleteBlocked) even if a stale render left a clickable
          // trash button behind — survey-derived SOW items (view_3586/3921,
          // field_2586 > 0) and survey items adopted into a SOW (view_3505,
          // field_2404 set). The card normally hides the trash for these.
          var selfRec = null;
          for (var qi = 0; qi < allRecs.length; qi++) {
            if (allRecs[qi] && allRecs[qi].id === rowId) { selfRec = allRecs[qi]; break; }
          }
          if (selfRec && ns.card && typeof ns.card.isDeleteBlocked === 'function' &&
              ns.card.isDeleteBlocked(selfRec, viewId)) {
            console.warn('[scw-ws-v2] delete blocked — ' + rowId + ' on ' + viewId);
            return;
          }

          // Accessory back-pointer resolved per view (CLAUDE.md #15):
          // SOW objects → field_2464, install (view_4093/4056) → field_2853.
          // Deleting an install parent must cascade over the INSTALL
          // relationship — the SOW literal doesn't exist on that object and
          // would silently orphan the accessory records.
          var accParentKey = 'field_2464';
          try {
            var _dfF = ns.cfg && typeof ns.cfg.fields === 'function' && viewId
              ? ns.cfg.fields(viewId) : null;
            if (_dfF && _dfF.parent) accParentKey = _dfF.parent;
          } catch (e) { /* SOW fallback */ }
          var accIds = [];
          for (var ri = 0; ri < allRecs.length; ri++) {
            var r = allRecs[ri];
            var raw = r && r[accParentKey + '_raw'];
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

  // Optimistically patch the CHILDREN's back-pointer connection in the
  // local Backbone model after a Connected Devices save, so the card UI
  // (which derives its display from the children's back-pointers) shows
  // the full cascade result IMMEDIATELY on the post-save notify() —
  // instead of waiting seconds for the scw-cascade-idle refetch. The
  // refetch still runs and reconciles with server truth; this only
  // bridges the gap. Silent set() — the caller's notify() re-renders.
  function patchLocalBackPointers(viewKey, parentId, chosenIds, backField, parentLabel) {
    try {
      var view = (typeof Knack !== 'undefined' && Knack.views && Knack.views[viewKey]) || null;
      var models = view && view.model && view.model.data && view.model.data.models;
      if (!models || !models.length) return;
      var chosen = Object.create(null);
      for (var i = 0; i < chosenIds.length; i++) chosen[chosenIds[i]] = true;
      var ident = parentLabel || parentId;
      for (var m = 0; m < models.length; m++) {
        var mod = models[m];
        var attrs = mod && mod.attributes;
        var id = attrs && attrs.id;
        if (!id || id === parentId || typeof mod.set !== 'function') continue;
        var raw = attrs[backField + '_raw'];
        var points = Array.isArray(raw) && raw.length > 0 && raw[0] && raw[0].id === parentId;
        var patch = null;
        if (chosen[id] && !points) {
          patch = {};
          patch[backField + '_raw'] = [{ id: parentId, identifier: ident }];
          patch[backField] = '<span class="' + parentId + '">' + ident + '</span>';
        } else if (!chosen[id] && points) {
          patch = {};
          patch[backField + '_raw'] = [];
          patch[backField] = '';
        }
        if (patch) mod.set(patch, { silent: true });
      }
    } catch (e) {
      console.warn('[scw-ws-v2] optimistic back-pointer patch failed', e);
    }
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
        var surveyCandidates = function (viewKeys, labelField, connF, nameField) {
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
            // Append a friendly name (e.g. the Bid's field_2636) so the option
            // reads "141 — White Storage Shelf…", not just the bare number.
            if (nameField) {
              var fn = (a[nameField] != null) ? String(a[nameField]).replace(/<[^>]*>/g, '').trim() : '';
              if (fn && String(lbl).indexOf(fn) === -1) lbl = String(lbl) + ' — ' + fn;
            }
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
            candidates: surveyCandidates(['view_3507'], 'field_2414', fieldKey, 'field_2636'), groupBy: false,
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
          // ── Connected Devices pre-selection hardening ──
          // The forward field_2380 list (what `sel` is read from above) can
          // read STALE — the field_2380↔field_2381 pair is kept aligned only
          // by the cascade, so the parent's forward list lags while children
          // ARE connected (their Connected To / field_2381 already points
          // here). The CARD DISPLAY already works around this by deriving the
          // set from the reciprocal back-pointers (card.js detailConnected-
          // Devices); the picker must match, or it opens with the real
          // children unchecked. Union into `sel` every cam/reader whose
          // field_2381 points back at THIS device.
          if (_isCD) {
            for (var _hi = 0; _hi < records.length; _hi++) {
              var _hrec = records[_hi];
              if (!_hrec || !_hrec.id || _hrec.id === recordId) continue;
              var _hraw = _hrec[_CT + '_raw'];
              if (Array.isArray(_hraw) && _hraw[0] && _hraw[0].id === recordId &&
                  sel.indexOf(_hrec.id) === -1) {
                sel.push(_hrec.id);
              }
            }
          }
          var _lblF  = SF.displayLabel || 'field_2365';
          var _prodF = SF.productName  || 'field_2379';
          var _mdfF  = SF.mdfIdf       || 'field_2375';
          // Worksheet-style label ("E-005 · NVR 16ch") for an owning device,
          // used in the "Connected to …" lock note. Falls back to the raw
          // connection identifier, then the id.
          var _ownerLabel = function (ownerId, ident) {
            for (var oi = 0; oi < records.length; oi++) {
              var orec = records[oi];
              if (!orec || orec.id !== ownerId) continue;
              var l = (orec[_lblF]  || '').toString().replace(/<[^>]*>/g, '').trim();
              var p = (orec[_prodF] || '').toString().replace(/<[^>]*>/g, '').trim();
              if (l && p) return l + ' · ' + p;
              return l || p || ownerId;
            }
            var id2 = (ident != null) ? String(ident).replace(/<[^>]*>/g, '').trim() : '';
            return id2 || ownerId;
          };
          // Cam/readers already connected to THIS device — keep them offered
          // (so they stay checked) even though their Connected To is populated.
          var _selSet = {};
          for (var si = 0; si < sel.length; si++) _selSet[sel[si]] = true;
          var connCands = [];
          var _lockedBy = {};   // camId → owning-device label (for the lock note)
          for (var ci = 0; ci < records.length; ci++) {
            var crec = records[ci];
            if (!crec || !crec.id || crec.id === recordId) continue;
            var cbid = (ns.card && typeof ns.card.bucketIdOf === 'function')
              ? ns.card.bucketIdOf(crec, viewKey) : '';
            if (_isCD) {
              if (cbid !== _camBucket) continue;            // devices → connect cam/readers
              // Cam/readers already connected to ANOTHER device: don't hide
              // them. Offer them LOCKED (grayed + "Take over") so the user
              // sees why they aren't free and can deliberately steal them.
              if (!_selSet[crec.id]) {
                var _ctRaw = crec[_CT + '_raw'];
                var _ownerId = (Array.isArray(_ctRaw) && _ctRaw[0] && _ctRaw[0].id)
                  ? _ctRaw[0].id : null;
                if (!_ownerId && typeof crec[_CT] === 'string') {
                  var _m = crec[_CT].match(/[0-9a-f]{24}/i);
                  if (_m) _ownerId = _m[0];
                }
                if (_ownerId) {
                  var _ident = (Array.isArray(_ctRaw) && _ctRaw[0]) ? _ctRaw[0].identifier : '';
                  _lockedBy[crec.id] = _ownerLabel(_ownerId, _ident);
                }
              }
            } else {
              if (cbid === _camBucket) continue;            // cam → connect to non-cam network gear
              var ccat = (ns.card && typeof ns.card.bucketCategoryOf === 'function')
                ? ns.card.bucketCategoryOf(crec, viewKey) : 'default';
              if (ccat === 'assumptions' || ccat === 'services') continue;
            }
            connCands.push(crec);
          }
          // ── Bid parity with the SOW Connected Devices picker ──────────
          // The SOW picker's sort/filter-by-SOW set (filter pills, per-item
          // membership line, cross-membership amber flag, filtered "N
          // selected" tally, composite group headers) keyed on the survey
          // page's own segmentation: the Bid connection (field_2415).
          var _bidF = SF.bid || 'field_2415';
          // Friendly bid labels ("141 — White Storage …") resolved the same
          // way as the Bid picker's candidates (BIDs grid view_3507 +
          // name field_2636). Falls back to raw identifiers when the grid
          // isn't loaded.
          var _bidNameById = Object.create(null);
          (function () {
            var bl = surveyCandidates(['view_3507'], 'field_2414', _bidF, 'field_2636');
            for (var bi = 0; bi < bl.length; bi++) _bidNameById[bl[bi].id] = bl[bi].name;
          })();
          var _bidTag = function (r) {
            var raw = r && r[_bidF + '_raw'];
            var ids = [], labels = [];
            if (Array.isArray(raw)) {
              for (var i = 0; i < raw.length; i++) {
                if (raw[i] && raw[i].id) {
                  ids.push(raw[i].id);
                  var l = _bidNameById[raw[i].id] ||
                    String(raw[i].identifier || '').replace(/<[^>]*>/g, '').trim();
                  if (l) labels.push(l);
                }
              }
            }
            return { id: ids.join('+'), label: labels.join(' + ') };
          };
          // Anchor = the record being edited — candidates sharing none of
          // its bids get the amber cross-membership flag, and the header
          // shows the baseline ("This device: 141 — …").
          var _anchorBidIds = [], _anchorBidLabels = '';
          (function () {
            var araw = current && current[_bidF + '_raw'];
            if (!Array.isArray(araw)) return;
            for (var ai = 0; ai < araw.length; ai++) {
              if (!araw[ai] || !araw[ai].id) continue;
              _anchorBidIds.push(araw[ai].id);
              var albl = _bidNameById[araw[ai].id] ||
                String(araw[ai].identifier || '').replace(/<[^>]*>/g, '').trim();
              if (albl) _anchorBidLabels += (_anchorBidLabels ? ', ' : '') + albl;
            }
          })();
          var _mdfGroup = function (r) {
            var raw = r[_mdfF + '_raw'];
            if (Array.isArray(raw) && raw[0] && raw[0].id) {
              return { id: raw[0].id, label: String(raw[0].identifier || '').replace(/<[^>]*>/g, '').trim() || 'MDF / IDF' };
            }
            return { id: '__unknown', label: 'No MDF / IDF' };
          };
          // Candidates spanning 2+ bids: compose "Bid · MDF" headers and
          // rank bid-carrying items ahead of no-bid items within each MDF
          // section — mirrors the SOW picker's multi-SOW grouping.
          var _bidGroupBy = null, _bidRank = null;
          (function () {
            var seen = Object.create(null), distinct = 0;
            for (var i = 0; i < connCands.length; i++) {
              var k = _bidTag(connCands[i]).id;
              if (!seen[k]) { seen[k] = 1; distinct++; }
            }
            if (distinct < 2) return;   // single bid → plain MDF grouping
            // Header bid label per MDF: borrowed from the first bid-carrying
            // item in that MDF (no-bid items inherit their section's tag).
            var mdfBidLbl = Object.create(null);
            for (var mi = 0; mi < connCands.length; mi++) {
              var mg = _mdfGroup(connCands[mi]), ms = _bidTag(connCands[mi]);
              if (ms.label && mg.id !== '__unknown' && !mdfBidLbl[mg.id]) {
                mdfBidLbl[mg.id] = ms.label;
              }
            }
            _bidGroupBy = function (r) {
              var m = _mdfGroup(r);
              var s = _bidTag(r);
              if (m.id === '__unknown') {
                if (!s.id) return m;
                return { id: '__nomdf::' + s.id, label: s.label + ' · No MDF / IDF', rank: 1 };
              }
              var sl = mdfBidLbl[m.id];
              return { id: m.id, label: (sl ? sl + ' · ' : '') + m.label };
            };
            _bidRank = function (r) { return _bidTag(r).id ? 0 : 1; };
          })();
          ns.picker.open({
            sourceViewKey: viewKey, putViewKey: viewKey, recordId: recordId,
            fieldKey: fieldKey, label: label, selectedIds: sel,
            candidates: connCands,
            itemState: function (r) {
              var owner = _lockedBy[r.id];
              return owner ? { locked: true, note: 'Already assigned to ' + owner } : null;
            },
            groupBy: _bidGroupBy || _mdfGroup,
            itemRank: _bidRank,
            anchorSowIds: _anchorBidIds,
            anchorSowLabels: _anchorBidLabels,
            // Route the picker's membership machinery (pills / item line /
            // tally) at the Bid connection instead of the SOW default.
            sowFilter: { fieldKey: _bidF, label: 'Bid', nameById: _bidNameById },
            itemLabel: function (r) {
              var lbl  = (r[_lblF]  || '').toString().replace(/<[^>]*>/g, '').trim();
              var prod = (r[_prodF] || '').toString().replace(/<[^>]*>/g, '').trim();
              if (lbl && prod) return lbl + ' · ' + prod;
              return lbl || prod || r.id;
            },
            multi: _isCD,
            onSaved: function (ids) {
              // Optimistic: flip the children's Connected To (field_2381)
              // locally so the cascade result renders on THIS notify, not
              // after the multi-second refetch.
              if (_isCD) {
                patchLocalBackPointers(viewKey, recordId, ids || [], _CT,
                  _ownerLabel(recordId, ''));
              }
              surveyRefetch();
            },
            // Keep the modal open + locked until the field_2380↔field_2381
            // reciprocal cascade settles (mirror-connection-sync view_3505).
            awaitCascade: true
          });
          return;
        }
      }

      // ── Install object pickers (view_4093) ──────────────────────────
      // Connected Devices (field_2820, multi, NVR/switch side) + Connected To
      // (field_2821, single, cam/reader side). Candidates come from the loaded
      // install records; PUT through view_4093 so mirror-connection-sync's
      // field_2820↔field_2821 cascade fires (createMirror VIEW_ID view_4093).
      var _vcfgInstall = (ns.cfg && typeof ns.cfg.viewCfg === 'function')
        ? ns.cfg.viewCfg(viewKey) : null;
      if (_vcfgInstall && _vcfgInstall.moneyMode === 'install') {
        var IF = (ns.cfg && ns.cfg.fields(viewKey)) || {};
        var _ICD = IF.connectedDevices || 'field_2820';
        var _ICT = IF.connectedDevice  || 'field_2821';
        if (fieldKey === _ICD || fieldKey === _ICT) {
          var _icam = ns.card && ns.card.CAM_READER_BUCKET;
          var _iIsCD = (fieldKey === _ICD);
          // CD pre-select hardening (same as field_1957): union in any cam/reader
          // whose Connected To (field_2821) already points back at THIS device,
          // so the picker opens with the true set even if the parent's forward
          // list is stale.
          var _iSel = {}; for (var ix = 0; ix < sel.length; ix++) _iSel[sel[ix]] = true;
          if (_iIsCD) {
            for (var rb = 0; rb < records.length; rb++) {
              var rbr = records[rb]; if (!rbr || !rbr.id) continue;
              var bRaw = rbr[_ICT + '_raw'];
              var bId = (Array.isArray(bRaw) && bRaw[0] && bRaw[0].id) ? bRaw[0].id : null;
              if (bId === recordId && !_iSel[rbr.id]) { sel.push(rbr.id); _iSel[rbr.id] = true; }
            }
          }
          var iCands = [];
          var _iLocked = {};   // camId → owner record id (claimed by another device)
          for (var ci3 = 0; ci3 < records.length; ci3++) {
            var icr = records[ci3];
            if (!icr || !icr.id || icr.id === recordId) continue;
            var icb = (ns.card && typeof ns.card.bucketIdOf === 'function')
              ? ns.card.bucketIdOf(icr, viewKey) : '';
            if (_iIsCD) {
              if (icb !== _icam) continue;                  // devices → connect cam/readers
              // Cams already claimed by ANOTHER device stay VISIBLE but
              // locked ("Already assigned to …" + Take over) — reassignment
              // is deliberate, not hidden. Same UX as the SOW/survey pickers.
              if (!_iSel[icr.id]) {
                var ictRaw = icr[_ICT + '_raw'];
                if (Array.isArray(ictRaw) && ictRaw.length && ictRaw[0] && ictRaw[0].id) {
                  _iLocked[icr.id] = ictRaw[0].id;
                }
              }
            } else {
              if (icb === _icam) continue;                   // cam → connect to network gear
              var iccat = (ns.card && typeof ns.card.bucketCategoryOf === 'function')
                ? ns.card.bucketCategoryOf(icr, viewKey) : 'default';
              if (iccat === 'assumptions' || iccat === 'services') continue;
            }
            iCands.push(icr);
          }
          var _ilbl  = IF.displayLabel || 'field_2802';
          var _ialt  = IF.labelAlt     || 'field_2801';
          var _iprod = IF.productName  || 'field_2790';
          var _imdf  = IF.mdfIdf       || 'field_2818';
          var _iLabel = function (r) {
            var lbl = (r[_ilbl] || '').toString().replace(/<[^>]*>/g, '').trim() ||
                      (r[_ialt] || '').toString().replace(/<[^>]*>/g, '').trim();
            var prod = (r[_iprod] || '').toString().replace(/<[^>]*>/g, '').trim();
            if (lbl && prod) return lbl + ' · ' + prod;
            return lbl || prod || r.id;
          };
          // Resolve a record id to its worksheet-style label from the
          // loaded records (owner in a lock note, or the edited record
          // itself for the optimistic back-pointer identifier).
          var _iLabelById = function (id) {
            for (var li = 0; li < records.length; li++) {
              if (records[li] && records[li].id === id) return _iLabel(records[li]);
            }
            return '';
          };
          var installRefetch = function () {
            if (ns.data && typeof ns.data.refetchAndNotify === 'function') ns.data.refetchAndNotify(viewKey);
            else if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
          };
          ns.picker.open({
            sourceViewKey: viewKey, putViewKey: viewKey, recordId: recordId,
            fieldKey: fieldKey, label: label, selectedIds: sel,
            candidates: iCands,
            itemState: function (r) {
              var ownId = _iLocked[r.id];
              if (!ownId) return null;
              var ownLbl = _iLabelById(ownId);
              return { locked: true, note: 'Already assigned to ' + (ownLbl || 'another device') };
            },
            groupBy: function (r) {
              var raw = r[_imdf + '_raw'];
              if (Array.isArray(raw) && raw[0] && raw[0].id) {
                return { id: raw[0].id, label: String(raw[0].identifier || '').replace(/<[^>]*>/g, '').trim() || 'MDF / IDF' };
              }
              return { id: '__unknown', label: 'No MDF / IDF' };
            },
            itemLabel: _iLabel,
            multi: _iIsCD,
            onSaved: function (ids) {
              // Optimistic: flip the children's Connected To (field_2821)
              // locally so the cascade result renders without waiting on
              // the full refetch round-trip.
              if (_iIsCD) {
                patchLocalBackPointers(viewKey, recordId, ids || [], _ICT,
                  _iLabelById(recordId));
              }
              installRefetch();
            },
            // Keep the modal open + locked until the field_2820↔field_2821
            // reciprocal cascade settles (mirror-connection-sync view_4093/4056).
            awaitCascade: true
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
      if (fieldKey === 'field_1949' || fieldKey === 'field_2627') {
        var openProductPicker = function () {
          var pmap = (window.SCW && SCW.productMap) || {};
          // Bucket membership source. Prefer SCW.productBucketMap
          // (id → [bucketId,…]) — the SAME validated map the inline-edit
          // filter (filter-products-by-bucket.js) uses against the line
          // item's bucket, so its ids are known to line up. productMap's
          // own .buckets is the fallback for when that global isn't loaded.
          var bmap = (window.SCW && SCW.productBucketMap) || null;
          // Resolve THIS row's bucket through the per-view bucket field
          // (field_2219 on SOW, field_2366 on survey). The local bucketIdOf
          // defined higher in this handler hardcodes field_2219, so go via
          // ns.card which honours the view's configured bucket field —
          // otherwise the survey product picker (field_2627) never filters.
          var myBucketId = '';
          if (current) {
            myBucketId = (ns.card && typeof ns.card.bucketIdOf === 'function')
              ? ns.card.bucketIdOf(current, viewKey)
              : bucketIdOf(current);
          }
          // A product with no bucket entry in the chosen source is treated
          // as universal (offered in every bucket) — matching the inline-edit
          // filter's "no entry → allow" rule.
          var allowedInBucket = function (pid, p) {
            if (!myBucketId) return true;
            // A product belongs to this bucket if EITHER source places it
            // there — productMap's own .buckets OR SCW.productBucketMap.
            // Using just one as the sole authority over-filters when that map
            // is sparse (the "only 3 products show" bug): a product the other
            // map correctly tags for this bucket gets hidden. Only exclude a
            // product that IS known to some map but NOT for this bucket; a
            // product with no bucket data anywhere stays (universal).
            var known = false, hit = false;
            if (p && Array.isArray(p.buckets) && p.buckets.length) {
              known = true;
              if (p.buckets.indexOf(myBucketId) !== -1) hit = true;
            }
            if (!hit && bmap) {
              var bl = bmap[pid];
              if (bl && bl.length) {
                known = true;
                if (bl.indexOf(myBucketId) !== -1) hit = true;
              }
            }
            return known ? hit : true;
          };
          // Fallback catalog for scenes where the SCW.productMap Builder
          // snippet isn't deployed (e.g. the bid comparison grid, scene_1155
          // — Known Issue #17). Without it the picker used to silently never
          // open. Scrape the distinct products actually in use on this view's
          // loaded records (field_1949 / field_2627 connection values →
          // id + identifier) so the picker still opens with a usable list.
          // Degraded (in-use only, not the full catalog) but far better than
          // a dead click; a no-op wherever productMap is present.
          var fallbackFromRecords = function () {
            var connFields = ['field_1949', 'field_2627'];
            // Derive product → { name, set-of-buckets } from the loaded rows
            // themselves: every row pairs a product with its OWN bucket, so
            // we get a product→bucket map straight from the grid — no external
            // Builder map needed and the ids are guaranteed to line up. This
            // is what lets the fallback actually FILTER by category on scenes
            // where neither productMap nor productBucketMap is deployed.
            var prodBuckets = Object.create(null);
            for (var ri = 0; ri < records.length; ri++) {
              var rec = records[ri];
              if (!rec) continue;
              var rb = (ns.card && typeof ns.card.bucketIdOf === 'function')
                ? ns.card.bucketIdOf(rec, viewKey) : '';
              for (var cf = 0; cf < connFields.length; cf++) {
                var fraw = rec[connFields[cf] + '_raw'];
                if (!Array.isArray(fraw)) continue;
                for (var j = 0; j < fraw.length; j++) {
                  var v = fraw[j];
                  if (!v || !v.id) continue;
                  var pb = prodBuckets[v.id] ||
                    (prodBuckets[v.id] = { name: '', buckets: Object.create(null) });
                  if (rb) pb.buckets[rb] = true;
                  if (!pb.name && v.identifier != null) {
                    pb.name = String(v.identifier).replace(/<[^>]*>/g, '').trim();
                  }
                }
              }
            }
            var out = [];
            for (var pk in prodBuckets) {
              if (!Object.prototype.hasOwnProperty.call(prodBuckets, pk)) continue;
              var e = prodBuckets[pk];
              // Bucket gate: when this row's bucket is known, keep only
              // products seen in that bucket on the grid. A product whose
              // bucket we never observed stays (universal / fail-open).
              if (myBucketId) {
                var hasAny = false, inBucket = false;
                for (var bkk in e.buckets) {
                  hasAny = true;
                  if (bkk === myBucketId) { inBucket = true; break; }
                }
                if (hasAny && !inBucket) continue;
              }
              out.push({ id: pk, name: e.name || pk });
            }
            return out;
          };

          var prodCandidates = [];
          var pmapEmpty = true;
          var _dbgTotal = 0, _dbgRejBucket = 0;   // diagnostics
          for (var pid in pmap) {
            if (!Object.prototype.hasOwnProperty.call(pmap, pid)) continue;
            pmapEmpty = false;
            _dbgTotal++;
            var p = pmap[pid];
            if (!p) continue;
            if (!allowedInBucket(pid, p)) { _dbgRejBucket++; continue; }
            prodCandidates.push({
              id: pid,
              name: p.name || '(unnamed)',
              // SKU (Builder snippet's productMap `sku`, field_56) — the
              // picker renders it as a muted second line and the search
              // filter matches it, so typing a SKU finds the product.
              sub: p.sku || ''
            });
          }
          // `degraded` labels the picker "(in-use only)" and drives the
          // console warning below — set whenever the full catalog wasn't
          // the source of the candidate list.
          var degraded = false;
          if (pmapEmpty) {
            prodCandidates = fallbackFromRecords();
            degraded = true;
            console.warn('[scw-ws-v2] SCW.productMap absent on this scene — ' +
              'product picker opened with in-use products only ' +
              '(' + prodCandidates.length + '). Deploy the catalog on this ' +
              'scene for the full list (Known Issue #17).');
          } else if (!prodCandidates.length) {
            // Catalog present but the bucket filter removed everything —
            // degrade to in-use products rather than a dead empty list.
            prodCandidates = fallbackFromRecords();
            degraded = true;
          }
          // One-line diagnostic so we can see WHY the list is short: is
          // productMap itself sparse on this scene, or is the bucket filter
          // rejecting most of it? Read this in DevTools when the picker opens.
          try {
            var _pSample = null, _sk = null;
            for (_sk in pmap) { if (Object.prototype.hasOwnProperty.call(pmap, _sk)) { _pSample = pmap[_sk]; break; } }
            console.log('[scw-ws-v2 product-picker]', {
              viewKey: viewKey,
              fieldKey: fieldKey,
              myBucketId: myBucketId,
              productMapSize: _dbgTotal,
              productBucketMapSize: bmap ? Object.keys(bmap).length : 0,
              rejectedByBucket: _dbgRejBucket,
              shown: prodCandidates.length,
              sampleEntry: _pSample && { name: _pSample.name, buckets: _pSample.buckets }
            });
          } catch (e) { /* ignore */ }
          prodCandidates.sort(function (a, b) {
            return String(a.name).localeCompare(String(b.name), undefined,
              { numeric: true, sensitivity: 'base' });
          });

          if (!prodCandidates.length) {
            alert('The product catalog hasn’t loaded yet, so there are no ' +
              'products to choose from. Refresh the page and try again — if it ' +
              'keeps happening, the product Builder snippet needs attention.');
            return;
          }
          if (degraded) {
            console.warn('[scw-ws-v2] SCW.productMap unavailable — product picker ' +
              'is showing only in-use products (' + prodCandidates.length + '). The ' +
              'Builder product snippet likely failed to load (see Known Issue #17).');
          }

          // Current selection — field_1949 is a single-select
          // connection; read the existing connected id (if any).
          var prodSel = [];
          if (current) {
            var rawSel = current[fieldKey + '_raw'];
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
            fieldKey:      fieldKey,
            label:         degraded ? 'Product (in-use only)' : 'Product',
            selectedIds:   prodSel,
            candidates:    prodCandidates,
            itemLabel:     function (rec) { return rec.name || rec.id; },
            multi:         false,
            onSaved:       function () {
              if (ns.data && typeof ns.data.notify === 'function') ns.data.notify(viewKey);
            }
          });
        };

        // Always open the picker. When the full catalog (SCW.productMap) is
        // present, open immediately. When it's still loading, wait briefly
        // for it but open with the in-use fallback if it doesn't arrive fast
        // (a never-resolving productMapReady on a scene without the snippet
        // used to hang the click forever — and a REJECTED promise from a
        // failed REST fetch must open the fallback too, not hang). When it's
        // absent entirely, open straight away — openProductPicker() falls
        // back to in-use products.
        if (window.SCW && SCW.productMap && Object.keys(SCW.productMap).length) {
          openProductPicker();
        } else if (window.SCW && SCW.productMapReady
                   && typeof SCW.productMapReady.then === 'function') {
          var _prodOpened = false;
          var _openOnce = function () {
            if (_prodOpened) return;
            _prodOpened = true;
            openProductPicker();
          };
          var _prodTimer = setTimeout(_openOnce, 1500);
          var _readyOpen = function () { clearTimeout(_prodTimer); _openOnce(); };
          SCW.productMapReady.then(_readyOpen, _readyOpen);
        } else {
          openProductPicker();
        }
        return;
      }

      // Parent picker — the accessory→parent single connection, resolved
      // per view (SOW field_2464; install field_2853 via the `parent`
      // mapping). Candidates are every other line item on the source view.
      // Single-select. Used by promoted/orphaned accessories to
      // (re-)parent themselves. ONLY this child-side field is ever edited
      // directly — the parent's forward children array (SOW field_2207,
      // install field_2852) is DERIVED from the back-pointers below.
      var _pF = (ns.cfg && typeof ns.cfg.fields === 'function' &&
                 ns.cfg.fields(viewKey)) || {};
      if (fieldKey === (_pF.parent || 'field_2464')) {
        var _pk           = fieldKey;
        var _isSowPair    = (_pk === 'field_2464');
        // Forward children-array key(s): the one we PUT, and the set we
        // scan to find old parents. SOW carries TWO denormalized forward
        // fields (field_2207 + field_1958); install has just field_2852.
        var _childPutKey  = _isSowPair
          ? 'field_2207'
          : (_pF.children || _pF.accessories || 'field_2852');
        var _childScanKeys = _isSowPair
          ? ['field_2207', 'field_1958']
          : [_childPutKey];
        var _mdfKey = _pF.mdfIdf || 'field_1946';
        // Accessories inherit the parent's SOW membership on the SOW
        // object only — install line items carry no SOW connection.
        var _sowKey = _isSowPair ? 'field_2154' : null;
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
          var ownParentRaw = r[_pk + '_raw'];
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
          fieldKey:      _pk,
          label:         'Parent',
          selectedIds:   sel,
          candidates:    parentCands,
          multi:         false,
          // Grouped by MDF/IDF + canonically sorted by the picker default
          // (see CLAUDE.md "Picker conventions").
          itemLabel: function (r) {
            // SOW: share the same product/drop resolver the card display
            // uses — it strips Knack\'s "<recordId> (<mdfLabel>)"
            // auto-identifier for buckets with no real drop label.
            if (_isSowPair && ns.card && typeof ns.card.labelLineItem === 'function') {
              return ns.card.labelLineItem(r);
            }
            // Non-SOW objects (install): labelLineItem reads SOW literals
            // (field_1949/field_1950), so compose "label · product" from
            // the per-view field map instead.
            var a = r.attributes || r;
            function _cl(v) { return (v || '').toString().replace(/<[^>]*>/g, '').trim(); }
            var _lbl  = (_pF.labelAlt && _cl(a[_pF.labelAlt])) ||
                        (_pF.displayLabel && _cl(a[_pF.displayLabel])) || '';
            var _prod = (_pF.productName && _cl(a[_pF.productName])) || '';
            if (/^[a-f0-9]{24}(\s|\b|$)/i.test(_lbl)) _lbl = '';
            if (_lbl && _prod) return _lbl + ' · ' + _prod;
            return _prod || _lbl || r.id;
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
                var _setP = {};
                _setP[_pk + '_raw'] = newRaw;
                _setP[_pk] = chosenIds && chosenIds[0] ? chosenIds[0] : '';
                srcRec.set(_setP, { silent: true });
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
                var raws = [];
                for (var rk = 0; rk < _childScanKeys.length; rk++) {
                  raws.push(r[_childScanKeys[rk] + '_raw']);
                }
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

            // Inherit the new parent's SOW + MDF/IDF (per-view keys — the
            // install object has no SOW connection, so only its MDF/IDF
            // field_2818 follows). An accessory rides with its parent, so
            // a re-parent mirrors the parent's SOW array and MDF/IDF onto
            // the accessory — exactly, including blanks. Skipped on clear
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
                  var pSowRaw = (_sowKey && Array.isArray(pAttrs[_sowKey + '_raw']))
                    ? pAttrs[_sowKey + '_raw'] : [];
                  var pMdfRaw = Array.isArray(pAttrs[_mdfKey + '_raw'])
                    ? pAttrs[_mdfKey + '_raw'] : [];
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
                      var _inhSet = {};
                      if (_sowKey) _inhSet[_sowKey + '_raw'] = pSowRaw.slice();
                      _inhSet[_mdfKey + '_raw'] = pMdfRaw.slice();
                      srcRec.set(_inhSet, { silent: true });
                    } catch (eSet) { /* best-effort */ }
                  }
                  var _inhBody = {};
                  if (_sowKey) _inhBody[_sowKey] = sowIds;
                  _inhBody[_mdfKey] = mdfIds;
                  pending++;
                  SCW.knackAjax({
                    url:  SCW.knackRecordUrl(viewKey, recordId),
                    type: 'PUT',
                    data: JSON.stringify(_inhBody),
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
                  var raw = r[_pk + '_raw'];
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
              var _putBody = {};
              _putBody[_childPutKey] = ids;
              var body = JSON.stringify(_putBody);
              if (window.SCW && window.SCW.DEBUG) console.log('[scw-ws-v2] cascade ' + mode + ' PUT', {
                url:  url,
                body: body,
                source: 'derived from ' + _pk + '_raw back-pointers'
              });
              SCW.knackAjax({
                url:  url,
                type: 'PUT',
                data: body,
                success: function (putResp) {
                  var rp = putResp && putResp.record ? putResp.record : putResp;
                  if (window.SCW && window.SCW.DEBUG) console.log('[scw-ws-v2] cascade ' + mode + ' PUT OK', {
                    parent: parentId,
                    sent:              ids,
                    got_children:      rp && rp[_childPutKey],
                    got_children_raw:  rp && rp[_childPutKey + '_raw']
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

      // MDF/IDF picker — candidates come from this view's configured
      // MDF/IDF locations grid. Single-select. The GROUPING_FIELD cascade
      // in mirror-connection-sync handles accessory re-grouping when this
      // changes. field_1946 = SOW line items; field_2818 = install line
      // items (deploy scene, added 2026-07-23 so ops can relocate
      // installed items — its mdfSourceViewKey is view_3932).
      if (fieldKey === 'field_1946' || fieldKey === 'field_2818') {
        // Source the candidates from the view's own mdfSourceViewKey
        // (view_3577 on build-SOW, view_3602 on sales view_3586, …) so the
        // picker opens on every deployment — NOT just the build/bid grids.
        // Fall back to the known grids if config is absent. Same MDF/IDF
        // object (field_1642 label) across all of them.
        var _mdfCfg = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(viewKey);
        var _mdfViews = [];
        if (_mdfCfg && _mdfCfg.mdfSourceViewKey) _mdfViews.push(_mdfCfg.mdfSourceViewKey);
        _mdfViews.push('view_3577', 'view_3822');
        var mdfRecords = firstViewRecords(_mdfViews);
        if (!mdfRecords || !mdfRecords.length) {
          // Not a code failure — the project has no MDF/IDF location records
          // yet (or the locations grid is missing from the scene / still
          // loading). The old silent return here read as "clicking does
          // nothing" on freshly-deployed projects quoted without locations —
          // surface the state, and when the toolbar carries the
          // "+ Add MDF/IDF" CTA route straight into creating the first one
          // (its click handler runs the full menu-view → link-scan chain).
          console.warn('[scw-ws-v2] MDF locations grid (' + _mdfViews.join('/') +
            ') empty/missing — no locations to pick');
          var _mdfMount = document.getElementById('scw-ws-v2-' + viewKey);
          var _mdfAddBtn = _mdfMount && _mdfMount.querySelector(
            '.scw-ws-v2-toolbar-btn--cta[data-scw-ws-v2-action="add-mdf"]');
          if (_mdfAddBtn) {
            if (window.confirm('This project has no MDF/IDF locations yet.\n\n' +
                'Create the first one now?')) {
              _mdfAddBtn.click();
            }
          } else {
            alert('This project has no MDF/IDF locations yet, and this page ' +
              'has no "Add MDF/IDF" action to create one.\n\n' +
              'Add an "Add MDF/IDF" menu link to this scene in Knack Builder — ' +
              'the worksheet toolbar picks it up automatically and this ' +
              'picker will then offer to create the first location.');
          }
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
          fieldKey:      fieldKey,
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

      // Drop Prefix picker — single-select from the Drop Prefix catalog loaded
      // by the Builder snippet (window.SCW.dropPrefixOptions; see CLAUDE.md
      // "Out-of-bundle Knack Builder snippets"). Each entry is
      // { id: <24-hex>, identifier: '<label>' }. SOW line items use field_2240;
      // Survey line items (view_3505) use field_2361 — SAME catalog, so the
      // picker is shared. Changing the prefix recomputes the drop LABEL
      // (field_1950 on SOW / field_2365 on survey) server-side, so refetch on save.
      if (fieldKey === 'field_2240' || fieldKey === 'field_2361') {
        var dpRaw = (window.SCW && window.SCW.dropPrefixOptions) || [];
        var dpCandidates = [];
        // Survey/bid page (field_2361): only offer prefixes flagged
        // Available for Subcontractors (field_2439 → subVisible on the
        // catalog entries; see knack-snippets/drop-prefix-options.snippet.js).
        // Entries WITHOUT the flag (older snippet shape) stay visible —
        // fail open, never an empty picker because the snippet is stale.
        var dpSubOnly = fieldKey === 'field_2361';
        if (dpRaw.length) {
          for (var dpi = 0; dpi < dpRaw.length; dpi++) {
            var dpr = dpRaw[dpi];
            if (dpr && dpr.id && dpr.identifier) {
              if (dpSubOnly && dpr.subVisible === false) continue;
              dpCandidates.push({ id: dpr.id, identifier: dpr.identifier });
            }
          }
        } else {
          // No SCW.dropPrefixOptions Builder snippet on this scene (e.g. the
          // bid comparison grid — Known Issue #11). Rather than hard-bail and
          // leave a dead click, scrape the prefixes in use on the loaded rows
          // (field_2240 / field_2361 connection values) so the picker still
          // opens with a usable (in-use only) list. No-op wherever the catalog
          // global is present.
          var dpSeen = Object.create(null);
          var dpConn = ['field_2240', 'field_2361'];
          for (var dr = 0; dr < records.length; dr++) {
            var drec = records[dr];
            if (!drec) continue;
            for (var dc = 0; dc < dpConn.length; dc++) {
              var draw = drec[dpConn[dc] + '_raw'];
              if (!Array.isArray(draw)) continue;
              for (var dj = 0; dj < draw.length; dj++) {
                var dv = draw[dj];
                if (!dv || !dv.id || dpSeen[dv.id]) continue;
                dpSeen[dv.id] = true;
                dpCandidates.push({
                  id: dv.id,
                  identifier: (dv.identifier != null
                    ? String(dv.identifier).replace(/<[^>]*>/g, '').trim()
                    : dv.id)
                });
              }
            }
          }
          // Distinguish the two failure modes for debugging:
          //   undefined → the Builder snippet never ran or its objects-API
          //     fetch failed (check Network for /v1/objects/<obj>/records —
          //     404 = object/field TODOs unfilled, 401/403 = key).
          //   []        → the snippet ran but produced ZERO usable entries
          //     (LABEL_FIELD wrong → every record skipped for blank label).
          var dpGlobal = window.SCW && window.SCW.dropPrefixOptions;
          console.warn('[scw-ws-v2] Drop Prefix catalog unusable — ' +
            'SCW.dropPrefixOptions is ' +
            (dpGlobal === undefined ? 'UNDEFINED (snippet never ran or its ' +
              'fetch failed — check the Network tab for the objects-API call)'
              : 'an EMPTY array (snippet ran but every record was skipped — ' +
                'LABEL_FIELD is probably wrong)') +
            '. Picker opened with in-use prefixes only (' +
            dpCandidates.length + '). See knack-snippets/' +
            'drop-prefix-options.snippet.js (Known Issue #11).');
        }
        dpCandidates.sort(function (a, b) {
          return String(a.identifier).localeCompare(String(b.identifier), undefined,
            { numeric: true, sensitivity: 'base' });
        });

        ns.picker.open({
          sourceViewKey: viewKey,
          putViewKey:    viewKey,
          recordId:      recordId,
          fieldKey:      fieldKey,
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
          onSaved:       function (newIds) {
            // Cascade the SOW change to this record's accessory children
            // (mounting hardware etc. — rows whose accessory back-pointer
            // names this record). An accessory rides with its parent: the
            // re-parent flow, CO unlink, and bulk edit all mirror the
            // parent's field_2154 onto accessories, but this per-row picker
            // didn't — leaving accessories on a stale/blank SOW, which
            // silently drops them from every SOW-filtered surface (proposal
            // grid, PDFs) so they never nest under their parent product.
            var sowIds = Array.isArray(newIds) ? newIds : (newIds ? [newIds] : []);
            var accParentKey = 'field_2464';
            try {
              var _sF = ns.cfg && typeof ns.cfg.fields === 'function'
                ? ns.cfg.fields(viewKey) : null;
              if (_sF && _sF.parent) accParentKey = _sF.parent;
            } catch (e) { /* SOW fallback */ }
            var accIds = [];
            try {
              var allRecs = (ns.data && typeof ns.data.readRecords === 'function')
                ? ns.data.readRecords(viewKey) : [];
              for (var ai = 0; ai < allRecs.length; ai++) {
                var ar = allRecs[ai];
                var apRaw = ar && ar[accParentKey + '_raw'];
                if (Array.isArray(apRaw)) {
                  for (var aj = 0; aj < apRaw.length; aj++) {
                    if (apRaw[aj] && apRaw[aj].id === recordId) {
                      if (accIds.indexOf(ar.id) === -1) accIds.push(ar.id);
                      break;
                    }
                  }
                }
              }
            } catch (e) { /* no cascade — refetch still runs */ }

            var pendingAcc = accIds.length;
            function refetch() {
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
            if (!pendingAcc) { refetch(); return; }
            accIds.forEach(function (accId) {
              SCW.knackAjax({
                url:  SCW.knackRecordUrl(viewKey, accId),
                type: 'PUT',
                data: JSON.stringify({ field_2154: sowIds }),
                success: function () { if (--pendingAcc === 0) refetch(); },
                error: function (xhr) {
                  console.warn('[scw-ws-v2] SOW cascade PUT failed for accessory ' +
                    accId, xhr && xhr.status);
                  if (--pendingAcc === 0) refetch();
                }
              });
            });
          }
        });
        return;
      }

      var candidates = [];
      // cams already assigned to ANOTHER device: camId → owner record id.
      // Offered LOCKED ("Already assigned to …" + Take over) instead of
      // hidden, so reassignment is visible and deliberate — same UX the
      // survey worksheet's picker has had.
      var lockedOwner = Object.create(null);
      for (var c = 0; c < records.length; c++) {
        var r = records[c];
        if (!r || !r.id || r.id === recordId) continue;
        if (fieldKey === 'field_1957') {
          // Connected Devices (NVR side): every cam/reader row. Blank or
          // points-at-me → freely selectable; claimed by another device →
          // locked with a Take over affordance.
          if (bucketIdOf(r) !== CAM_READER) continue;
          var recip = reciprocalIds(r);
          var blank = recip.length === 0;
          var pointsToMe = recip.indexOf(recordId) !== -1;
          var alreadySel = selSet[r.id];
          if (!blank && !pointsToMe && !alreadySel) {
            var _loRaw = r['field_2197_raw'];
            lockedOwner[r.id] = {
              id:    recip[0],
              ident: (Array.isArray(_loRaw) && _loRaw[0] && _loRaw[0].identifier != null)
                       ? String(_loRaw[0].identifier) : ''
            };
          }
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
        // The drop label (field_1950) degenerates SERVER-SIDE to
        // "<recordId> (<mdfLabel>)" for rows with no real drop label
        // (networking/headend) — same quirk card.js readConnRef handles.
        // Never show a record id in the picker: keep only the "(mdf)" part
        // as a location hint, prefer the product name as the label.
        var hexWrap = lbl.match(/^[a-f0-9]{24}\s*\(([^)]+)\)\s*$/i);
        if (hexWrap) lbl = '';
        else if (/^[a-f0-9]{24}(\s|\b|$)/i.test(lbl)) lbl = '';
        if (/^[a-f0-9]{24}(\s|\b|$)/i.test(prod)) prod = '';
        var loc = hexWrap ? ' (' + hexWrap[1].trim() + ')' : '';
        if (lbl && prod) return lbl + ' · ' + prod;
        if (prod) return prod + loc;
        if (lbl)  return lbl;
        return hexWrap ? '(unnamed device)' + loc : rec.id;
      }

      // Worksheet-style label for a record id from the loaded records —
      // owner in a lock note, or the edited record itself (optimistic
      // back-pointer identifier).
      function labelById(id) {
        for (var li = 0; li < records.length; li++) {
          if (records[li] && records[li].id === id) return itemLabel(records[li]);
        }
        return '';
      }

      // Lock state for cams claimed by another device — the picker renders
      // the lock note + a "Take over" button so the user can deliberately
      // steal them.
      var itemState = null;
      if (fieldKey === 'field_1957') {
        itemState = function (rec) {
          var own = lockedOwner[rec.id];
          if (!own) return null;
          var ownLbl = labelById(own.id) ||
            String(own.ident || '').replace(/<[^>]*>/g, '').trim();
          return { locked: true, note: 'Already assigned to ' + (ownLbl || 'another device') };
        };
      }

      // mirror-connection-sync has a createMirror() instance bound to
      // view_3962 (the v2 source view), so v2 PUTs route through the
      // source view directly — the cascade still fires.
      var putViewKey = viewKey;

      // field_1957 is multi-connection (one NVR → many cams).
      // field_2197 is single-connection (one cam → one NVR).
      var isMulti = (fieldKey !== 'field_2197');

      // ── Cross-SOW organization (bid comparison grid) ────────────────
      // view_3921 pools SOW line items from EVERY SOW on the project, and
      // each SOW can carry same-named MDF/IDF locations — the canonical
      // MDF-only grouping then yields several identical "MDF" headers with
      // no hint which SOW each belongs to (and lookalike "E-001 · <product>"
      // items, since drop numbering restarts per SOW). When the candidate
      // set spans more than one SOW tag, group by the MDF RECORD ID (unique
      // per SOW, since each SOW carries its own MDF/IDF locations) and fold
      // the SOW into the header label ("SW-1001 · IDF: 06"). Keying on the
      // MDF id alone keeps no-SOW items INSIDE their IDF section — ranked
      // after the SOW-carrying items via itemRank — instead of banished to
      // a separate "No SOW · …" section at the bottom. Single-SOW surfaces
      // (build-SOW view_3962, sales view_3586) keep the canonical grouping.
      var groupBy;    // undefined → picker's canonical MDF/IDF default
      var itemRank;   // undefined → canonical sort only
      (function () {
        function sowTag(rec) {
          var raw = rec && rec['field_2154_raw'];
          var ids = [], labels = [];
          if (Array.isArray(raw)) {
            for (var i = 0; i < raw.length; i++) {
              if (raw[i] && raw[i].id) {
                ids.push(raw[i].id);
                var l = String(raw[i].identifier || '').replace(/<[^>]*>/g, '').trim();
                if (l) labels.push(l);
              }
            }
          }
          return { id: ids.join('+'), label: labels.join(' + ') };
        }
        var seen = Object.create(null), distinct = 0;
        for (var i = 0; i < candidates.length; i++) {
          var k = sowTag(candidates[i]).id;
          if (!seen[k]) { seen[k] = 1; distinct++; }
        }
        if (distinct < 2) return;   // single SOW → canonical grouping
        var mdfGroup = ns.picker.groupByMdfIdf;
        // Header SOW label per MDF: borrowed from the first SOW-carrying
        // item in that MDF (no-SOW items inherit their section's SOW tag).
        var mdfSowLbl = Object.create(null);
        for (var mi = 0; mi < candidates.length; mi++) {
          var mRec = candidates[mi];
          var mg = mdfGroup(mRec), ms = sowTag(mRec);
          if (ms.label && mg.id !== '__unknown' && !mdfSowLbl[mg.id]) {
            mdfSowLbl[mg.id] = ms.label;
          }
        }
        groupBy = function (rec) {
          var m = mdfGroup(rec);
          var s = sowTag(rec);
          if (m.id === '__unknown') {
            // No MDF at all: no-SOW too → canonical '__unknown' sink;
            // SOW-carrying → per-SOW "No MDF" groups after the real MDFs.
            if (!s.id) return m;
            return { id: '__nomdf::' + s.id, label: s.label + ' · No MDF / IDF', rank: 1 };
          }
          var sl = mdfSowLbl[m.id];
          return { id: m.id, label: (sl ? sl + ' · ' : '') + m.label };
        };
        // Within each MDF section: SOW-carrying items first, no-SOW after.
        itemRank = function (rec) { return sowTag(rec).id ? 0 : 1; };
      })();

      // The edited record's own SOW membership (field_2154) — the picker
      // flags candidates that share NONE of these SOWs (amber ⚠ on the
      // item's SOW line) and shows the baseline in the header, so e.g. a
      // camera on a different SOW than the switch is visible at a glance.
      var anchorSowIds = [], anchorSowLabels = '';
      for (var arI = 0; arI < records.length; arI++) {
        var arRec = records[arI];
        if (!arRec || arRec.id !== recordId) continue;
        var asRaw = arRec.field_2154_raw;
        if (Array.isArray(asRaw)) {
          for (var asI = 0; asI < asRaw.length; asI++) {
            if (asRaw[asI] && asRaw[asI].id) {
              anchorSowIds.push(asRaw[asI].id);
              var asLbl = String(asRaw[asI].identifier || '')
                .replace(/<[^>]*>/g, '').trim();
              if (asLbl) anchorSowLabels += (anchorSowLabels ? ', ' : '') + asLbl;
            }
          }
        }
        break;
      }

      ns.picker.open({
        sourceViewKey: viewKey,
        putViewKey:    putViewKey,
        recordId:      recordId,
        fieldKey:      fieldKey,
        label:         label,
        selectedIds:   sel,
        candidates:    candidates,
        // Canonical MDF/IDF grouping + sort — except when candidates span
        // multiple SOWs (bid review), where headers compose "SOW · MDF" and
        // no-SOW items rank after SOW items within their MDF section.
        groupBy:       groupBy,
        itemRank:      itemRank,
        itemLabel:     itemLabel,
        itemState:     itemState,
        multi:         isMulti,
        anchorSowIds:   anchorSowIds,
        anchorSowLabels: anchorSowLabels,
        // Keep the modal open + locked until the field_1957↔field_2197
        // reciprocal cascade settles (mirror-connection-sync view_3962 et al.),
        // so the user can't navigate or start another edit mid-sync.
        awaitCascade:  true,
        onSaved:       function (ids) {
          // Optimistic: flip the children's Connected To (field_2197)
          // locally so the field AND the cascade's reciprocal writes
          // render on THIS notify — the scw-cascade-idle refetch
          // reconciles with server truth afterward. The card display
          // derives Connected Devices from the children's back-pointers,
          // so without this the UI lags the save by the full refetch.
          if (fieldKey === 'field_1957') {
            patchLocalBackPointers(viewKey, recordId, ids || [], 'field_2197',
              labelById(recordId));
          }
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
    .on('knack-scene-render.any.scwWsV2', function () {
      tryMountAll();
      // The KTL accordion wraps the source view ~80ms after scene render,
      // which can re-capture the v2 panel into its body. Re-assert the
      // panel's position outside the accordion once that has settled.
      setTimeout(function () {
        (ns.CONFIG.views || []).forEach(function (vcfg) {
          if (vcfg && vcfg.hideSourceAccordion) {
            relocatePanelOutsideAccordion(vcfg.sourceViewKey);
          }
        });
      }, 200);
    });

  // Also mount on view-render in case the source view appears on a
  // scene that already rendered. Cheap.
  $(document)
    .off('knack-view-render.any.scwWsV2Mount')
    .on('knack-view-render.any.scwWsV2Mount', function () { tryMountAll(); });

  // ── scw-ws-v2-on html/body class ─────────────────────────────────
  // Replaces the old `html:has(.scw-ws-v2-body)` / `body:has(...)`
  // scroll-anchor-kill selectors in styles.js — :has() anchored on
  // html/body made every style recalc consider the whole document
  // (perf trace 2026-07-30). Kept in sync on every scene render; the
  // class stays cheap because it's a plain toggle.
  function syncWsV2OnClass() {
    var on = !!document.querySelector('.scw-ws-v2-body');
    document.documentElement.classList.toggle('scw-ws-v2-on', on);
    document.body.classList.toggle('scw-ws-v2-on', on);
  }
  $(document)
    .off('knack-scene-render.any.scwWsV2OnClass knack-view-render.any.scwWsV2OnClass')
    .on('knack-scene-render.any.scwWsV2OnClass knack-view-render.any.scwWsV2OnClass',
      function () { setTimeout(syncWsV2OnClass, 0); });

  // ── Knack-modal-open body class ──────────────────────────────────
  // Replaces `body:has([id^="kn-modal-bg"])` (same :has() cost story).
  // Knack appends/removes its modal bg as a DIRECT child of <body>, so
  // a childList-only observer (no subtree) is essentially free.
  function syncModalOpenClass() {
    var open = !!(document.getElementById('kn-modal-bg') ||
                  document.querySelector('body > [id^="kn-modal-bg"], ' +
                                         'body > [id^="kn-page-modal"], ' +
                                         'body > .kn-modal-bg'));
    document.body.classList.toggle('scw-kn-modal-open', open);
  }
  function armModalObserver() {
    if (!document.body || document.body.hasAttribute('data-scw-modal-obs')) return;
    document.body.setAttribute('data-scw-modal-obs', '1');
    new MutationObserver(syncModalOpenClass)
      .observe(document.body, { childList: true });
    syncModalOpenClass();
  }
  if (document.body) armModalObserver();
  else document.addEventListener('DOMContentLoaded', armModalObserver);

  // First-paint attempt for hot reload / late bundle load.
  setTimeout(tryMountAll, 0);
})();
/*** END WORKSHEET V2 — INIT **************************************************/
