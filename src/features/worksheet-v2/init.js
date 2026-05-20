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
      ns.data.subscribe(vcfg.sourceViewKey, function (key, records) {
        ns.render.renderView(key, records);
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
