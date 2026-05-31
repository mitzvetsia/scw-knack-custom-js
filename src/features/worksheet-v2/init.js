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
      '<span class="scw-ws-v2-pill">v2 preview</span>' +
      '<span>' + vcfg.label + '</span>' +
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
  function tryMount(vcfg) {
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
        if (ns.sowFilter && typeof ns.sowFilter.mount === 'function') {
          ns.sowFilter.mount(key);
        }
        // After every re-render, sync the bulk-select checkboxes to
        // current selection state + refresh the floating toolbar.
        if (ns.bulk && typeof ns.bulk.mount === 'function') {
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
        e.stopPropagation();
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
      // Build the URL deterministically from the same base path the
      // chip edit links use. buildSowBasePath() matches against the
      // current hash; if it returns nothing we surface an alert
      // rather than silently bouncing to home.
      var hash = window.location.hash || '';
      var patterns = [
        /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/build-(?:sow|quote)\/[a-f0-9]{24})/,
        /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/review-bids\/[a-f0-9]{24})/,
        /(team-calendar\/project-dashboard\/[a-f0-9]{24}\/deploy\/[a-f0-9]{24})/,
        /(sales-portal\/company-details\/[a-f0-9]{24}\/scope-of-work-details\/[a-f0-9]{24})/,
        /(proposals\/scope-of-work\/[a-f0-9]{24})/
      ];
      var base = '';
      for (var p = 0; p < patterns.length; p++) {
        var m = hash.match(patterns[p]);
        if (m) { base = m[1]; break; }
      }
      if (!base) {
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

  if (!document.documentElement.hasAttribute('data-scw-ws-v2-mhdel-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-mhdel-bound', '1');
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-mh-del]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var chipId = btn.getAttribute('data-scw-ws-v2-mh-del');
      if (!chipId) return;

      // Same selector idiom as the kebab handler — attribute form so
      // 24-hex IDs starting with a digit don't blow up the selector.
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
      if (!link) {
        console.warn('[scw-ws-v2] kn-link-delete not found for chip ' + chipId);
        return;
      }

      // Optimistic hide so the row updates instantly. v2 picks up the
      // actual removal once Knack re-renders after the delete settles.
      var wrap = btn.closest('.scw-ws-v2-mh-chip-wrap');
      if (wrap) wrap.style.display = 'none';

      autoConfirmKnackDelete();
      link.click();

      // Knack's delete sometimes doesn't fire knack-view-render on
      // view_3962, so the model stays populated with the deleted
      // bracket until a manual refresh. Explicitly refetch view_3962
      // a beat after the delete confirms — by then Knack's PUT/DELETE
      // has settled server-side and the fresh fetch returns the new
      // state without the bracket.
      var v3962Container = btn.closest('[id^="scw-ws-v2-"]');
      var v3962ViewKey = v3962Container
        ? v3962Container.id.replace(/^scw-ws-v2-/, '')
        : 'view_3962';
      setTimeout(function () {
        if (ns.data && typeof ns.data.refetchAndNotify === 'function') {
          ns.data.refetchAndNotify(v3962ViewKey);
        }
      }, 1500);
    });
  }

  // Watch the DOM for Knack's confirm-delete modal and auto-click its
  // confirm button. Called immediately before triggering a
  // .kn-link-delete click. Disconnects after firing (or after 1.5s
  // if nothing appears) so we don't intercept unrelated modals.
  function autoConfirmKnackDelete() {
    var done = false;
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
          return;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Safety: drop the observer after 1.5s no matter what.
    setTimeout(function () {
      if (!done) { done = true; obs.disconnect(); }
    }, 1500);
  }

  // Kebab menu — two-click delete with no confirm prompt.
  //   1. Click kebab → menu opens positioned under the button
  //   2. Click "Delete line item" → POST to MAKE_DELETE_RECORD_WEBHOOK
  //      with { recordId } (mirrors connected-records.js deleteRecord).
  //      Make does the actual delete server-side, no keys in the bundle.
  // Single popover element reused across cards. Outside click closes.
  if (!document.documentElement.hasAttribute('data-scw-ws-v2-kebab-bound')) {
    document.documentElement.setAttribute('data-scw-ws-v2-kebab-bound', '1');

    document.addEventListener('click', function (e) {
      var kebab = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-kebab]');
      if (kebab) {
        e.preventDefault();
        e.stopPropagation();
        var rowId  = kebab.getAttribute('data-scw-ws-v2-kebab');
        var container = kebab.closest('[id^="scw-ws-v2-"]');
        var viewId = container
          ? container.id.replace(/^scw-ws-v2-/, '')
          : null;
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
          var webhookUrl = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_DELETE_RECORD_WEBHOOK) || '';
          if (accIds.length && webhookUrl) {
            for (var ai = 0; ai < accIds.length; ai++) {
              (function (accId) {
                fetch(webhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ recordId: accId })
                }).catch(function (err) {
                  console.warn('[scw-ws-v2] accessory delete webhook failed for ' +
                    accId, err);
                });
              })(accIds[ai]);
            }
          } else if (accIds.length && !webhookUrl) {
            console.warn('[scw-ws-v2] ' + accIds.length +
              ' accessories not deleted — MAKE_DELETE_RECORD_WEBHOOK missing');
          }

          // 2. Delete the parent through Knack's native delete link.
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
            console.warn('[scw-ws-v2] kn-link-delete not found for ' + rowId);
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
        return;
      }
    });
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
        // Parent candidates are constrained to Cam/Reader and
        // Networking/Headend records — those are the only buckets that
        // make sense as "primary" line items something else attaches
        // to. We also drop records that are themselves accessories
        // (they can\'t be parents) and the record being edited itself.
        var CAM        = (ns.card && ns.card.CAM_READER_BUCKET) || '6481e5ba38f283002898113c';
        var NETWORKING = (ns.card && ns.card.NETWORKING_BUCKET) || '647953bb54b4e1002931ed97';
        function _bucketIdOf(r) {
          var raw = r && r.field_2219_raw;
          if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
          return '';
        }
        var parentCands = [];
        for (var pc = 0; pc < records.length; pc++) {
          var r = records[pc];
          if (!r || !r.id || r.id === recordId) continue;
          var ownParentRaw = r.field_2464_raw;
          if (Array.isArray(ownParentRaw) && ownParentRaw.length) continue;
          var b = _bucketIdOf(r);
          if (b !== CAM && b !== NETWORKING) continue;
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

            // Read the parent\'s CURRENT field_2207 from the server,
            // mutate (add or remove this accessory), then PUT.
            function rewriteParent(parentId, mode /* 'add' | 'remove' */) {
              pending++;
              SCW.knackAjax({
                url:  SCW.knackRecordUrl(viewKey, parentId),
                type: 'GET',
                success: function (resp) {
                  var rec = resp && resp.record ? resp.record : resp;
                  var rawArr = (rec && rec.field_2207_raw) || [];
                  var ids = [];
                  for (var i = 0; i < rawArr.length; i++) {
                    if (rawArr[i] && rawArr[i].id) ids.push(rawArr[i].id);
                  }
                  var has = ids.indexOf(recordId) !== -1;
                  if (mode === 'add' && !has) ids.push(recordId);
                  if (mode === 'remove' && has) {
                    ids = ids.filter(function (x) { return x !== recordId; });
                  }
                  if ((mode === 'add' && has) || (mode === 'remove' && !has)) {
                    // No-op — already in the right state server-side.
                    pending--; done();
                    return;
                  }
                  console.log('[scw-ws-v2] cascade ' + mode, {
                    parent: parentId, ids: ids
                  });
                  SCW.knackAjax({
                    url:  SCW.knackRecordUrl(viewKey, parentId),
                    type: 'PUT',
                    data: JSON.stringify({ field_2207: ids }),
                    success: function () { pending--; done(); },
                    error:   function (xhr) {
                      console.warn('[scw-ws-v2] cascade ' + mode + ' PUT failed', {
                        parent: parentId, status: xhr && xhr.status
                      });
                      pending--; done();
                    }
                  });
                },
                error: function (xhr) {
                  console.warn('[scw-ws-v2] cascade ' + mode + ' GET failed', {
                    parent: parentId, status: xhr && xhr.status
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
        var MDF_SOURCE_VIEW = 'view_3577';
        var mdfView = (typeof Knack !== 'undefined' && Knack.views &&
                       Knack.views[MDF_SOURCE_VIEW]) || null;
        // Knack exposes models inconsistently across view types:
        // some at view.model.data.models (Backbone collection), some
        // at view.model.models, some only after fetch. Probe both
        // shapes before bailing.
        var mdfRecords = null;
        if (mdfView && mdfView.model) {
          mdfRecords = (mdfView.model.data && mdfView.model.data.models) ||
                       mdfView.model.models || null;
        }
        if (!mdfRecords || !mdfRecords.length) {
          console.warn('[scw-ws-v2] view_3577 model empty/missing — MDF picker can\'t open');
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

      // SOW picker (field_2154) — candidates come from the Scopes of
      // Work grid (view_3325) on the same scene. v1 left this field
      // read-only; v2 adds an editable picker. Multi-connection: a
      // single line item can belong to multiple SOWs.
      if (fieldKey === 'field_2154') {
        var SOW_SOURCE_VIEW = 'view_3325';
        var sowView = (typeof Knack !== 'undefined' && Knack.views &&
                       Knack.views[SOW_SOURCE_VIEW]) || null;
        if (!sowView || !sowView.model || !sowView.model.data ||
            !sowView.model.data.models) {
          console.warn('[scw-ws-v2] view_3325 model missing — SOW picker can\'t open');
          return;
        }
        var sowCandidates = [];
        var sowRecords = sowView.model.data.models;
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

      // Group by MDF/IDF (matches v1 connection-picker)
      function groupBy(rec) {
        var raw = rec['field_1946_raw'];
        if (Array.isArray(raw) && raw.length && raw[0]) {
          return { id: raw[0].id, label: raw[0].identifier || '' };
        }
        return { id: '__unknown', label: 'Unassigned' };
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
        groupBy:       groupBy,
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
