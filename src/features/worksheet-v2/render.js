/*** WORKSHEET V2 — RENDER ****************************************************
 *
 * Phase 3.B render: group tree (L1 MDF/IDF accordion → L2 proposal
 * bucket sub-headers → record cards). Replaces Phase 3.A's flat
 * card list.
 *
 * Composition: render.js owns the OUTER structure (group container,
 * L1 header bar, L2 sub-header, card list slot). card.js owns the
 * per-record card. groups.js handles the data transform. state.js
 * handles open/closed persistence.
 *
 * Mid-edit guard preserved from prior phases — if the user is
 * focused on a v2 input when a re-notify fires, defer the rebuild
 * until focus leaves. The whole tree gets rebuilt on every notify
 * for simplicity; keyed updates can come later if perf demands it.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW.worksheetV2;
  if (!ns) return;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // Defer renders while the user is mid-edit so typing isn't blown
  // away by a sibling-triggered re-notify.
  var pending = Object.create(null);

  /**
   * Read every MDF/IDF location off the configured mdfSourceViewKey
   * (e.g. view_3358) so v2 can show an L1 group for each one even
   * when no SOW line items are assigned. Returns [{id, label}] keyed
   * to match the identifiers that field_1946_raw[0] would produce on
   * a real line item.
   */
  function readMdfSeedGroups(sourceViewKey) {
    if (!ns.CONFIG || !ns.CONFIG.views) return [];
    var vcfg = null;
    var views = ns.CONFIG.views;
    for (var i = 0; i < views.length; i++) {
      if (views[i].sourceViewKey === sourceViewKey) { vcfg = views[i]; break; }
    }
    if (!vcfg || !vcfg.mdfSourceViewKey) return [];
    try {
      var v = Knack.views[vcfg.mdfSourceViewKey];
      if (!v || !v.model || !v.model.data) return [];
      var models = v.model.data.models || [];
      var labelField = vcfg.mdfLabelField || 'field_1642';
      var out = [];
      for (var j = 0; j < models.length; j++) {
        var attrs = models[j] && models[j].attributes;
        if (!attrs || !attrs.id) continue;
        var label = String(attrs[labelField] || attrs.identifier || '')
          .replace(/<[^>]*>/g, '').trim();
        if (!label) continue;
        out.push({ id: attrs.id, label: label });
      }
      return out;
    } catch (e) {
      console.warn('[scw-ws-v2] readMdfSeedGroups threw for ' + sourceViewKey, e);
      return [];
    }
  }

  function hasFocusInPanel(container) {
    var a = document.activeElement;
    if (!a || !container) return false;
    if (!a.hasAttribute || !a.hasAttribute('data-scw-ws-v2-field')) return false;
    return container.contains(a);
  }

  // ── Chevron used in L1 headers ──
  var L1_CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';

  function buildL1Header(l1, sourceViewKey) {
    var head = document.createElement('button');
    head.type = 'button';
    head.className = 'scw-ws-v2-l1-head' +
      (l1.isOpen ? ' scw-ws-v2-l1-head--open' : '') +
      (l1.isSynthetic ? ' scw-ws-v2-l1-head--synthetic' : '');
    head.setAttribute('data-scw-ws-v2-l1-toggle', l1.id);
    head.setAttribute('data-scw-ws-v2-view', sourceViewKey);
    head.setAttribute('aria-expanded', l1.isOpen ? 'true' : 'false');

    head.innerHTML =
      '<span class="scw-ws-v2-l1-chevron">' + L1_CHEVRON_SVG + '</span>' +
      '<span class="scw-ws-v2-l1-label">' + escapeHtml(l1.label) + '</span>' +
      '<span class="scw-ws-v2-l1-count">' + l1.recordCount + '</span>';

    return head;
  }

  function buildL2Header(l2) {
    var sub = document.createElement('div');
    sub.className = 'scw-ws-v2-l2-head';
    sub.innerHTML =
      '<span class="scw-ws-v2-l2-label">' + escapeHtml(l2.label) + '</span>' +
      '<span class="scw-ws-v2-l2-count">' + l2.records.length + '</span>';
    return sub;
  }

  function buildL1Block(l1, sourceViewKey) {
    var block = document.createElement('section');
    block.className = 'scw-ws-v2-l1' +
      (l1.isOpen ? ' scw-ws-v2-l1--open' : '') +
      (l1.isSynthetic ? ' scw-ws-v2-l1--synthetic' : '');
    block.setAttribute('data-scw-ws-v2-l1', l1.id);

    // L1-level select-all checkbox lives in a flex wrapper alongside
    // the head <button>, so clicking the checkbox doesn\'t toggle the
    // accordion. bulk.js wires the change handler via delegation.
    var headWrap = document.createElement('div');
    headWrap.className = 'scw-ws-v2-l1-head-wrap';
    var sel = document.createElement('input');
    sel.type = 'checkbox';
    sel.className = 'scw-ws-v2-l1-select';
    sel.setAttribute('data-scw-ws-v2-l1-select', l1.id);
    sel.setAttribute('aria-label', 'Select all in group');
    headWrap.appendChild(sel);
    headWrap.appendChild(buildL1Header(l1, sourceViewKey));
    block.appendChild(headWrap);

    var body = document.createElement('div');
    body.className = 'scw-ws-v2-l1-body';

    // Per-L1 summary block — sits at the top of the body, always
    // rendered; CSS controls its visibility per toolbar mode.
    if (ns.summary && typeof ns.summary.buildL1Summary === 'function') {
      try {
        var sumEl = ns.summary.buildL1Summary(l1);
        if (sumEl) body.appendChild(sumEl);
      } catch (sumErr) {
        console.warn('[scw-ws-v2] summary build failed for L1', l1 && l1.id, sumErr);
      }
    }

    if (ns.card && typeof ns.card.buildCard === 'function') {
      for (var i = 0; i < l1.l2.length; i++) {
        var l2 = l1.l2[i];
        // Empty seed L1 — skip the L2 header so we just show the
        // group label with an empty body rather than a blank "0"
        // sub-header that looks broken.
        if (l2.id === '__empty_l2') continue;
        // Skip the sub-header for the flat (single-bucket) L2 — MDF/IDF
        // is the only grouping; bucket-level sub-heads were noise.
        if (l2.id !== '__flat') body.appendChild(buildL2Header(l2));
        for (var j = 0; j < l2.records.length; j++) {
          // Per-card try/catch — one malformed record shouldn't take
          // down the entire panel. Failed cards render an inline
          // placeholder + log to console so the issue is debuggable
          // without killing the rest of the data.
          try {
            body.appendChild(ns.card.buildCard(l2.records[j], sourceViewKey));
          } catch (cardErr) {
            console.warn('[scw-ws-v2] buildCard threw for record', {
              recordId: l2.records[j] && l2.records[j].id,
              viewKey:  sourceViewKey,
              error:    cardErr
            });
            var stub = document.createElement('div');
            stub.className = 'scw-ws-v2-card scw-ws-v2-card--error';
            stub.textContent = 'Render error for record ' +
              ((l2.records[j] && l2.records[j].id) || '?');
            body.appendChild(stub);
          }
        }
      }
    }

    block.appendChild(body);
    return block;
  }

  function renderView(sourceViewKey, records) {
    var container = document.getElementById('scw-ws-v2-' + sourceViewKey);
    if (!container) return;

    var body  = container.querySelector('.scw-ws-v2-body');
    var count = container.querySelector('.scw-ws-v2-count');
    if (!body) return;

    if (count) {
      count.textContent = records.length + ' record' + (records.length === 1 ? '' : 's');
    }

    if (hasFocusInPanel(container)) {
      pending[sourceViewKey] = records;
      return;
    }
    delete pending[sourceViewKey];

    if (!records.length) {
      body.innerHTML = '<div class="scw-ws-v2-empty">No records loaded from ' +
        escapeHtml(sourceViewKey) + ' yet.</div>';
      return;
    }

    if (!ns.groups || typeof ns.groups.buildGroupTree !== 'function') {
      body.innerHTML = '<div class="scw-ws-v2-empty">groups.js not loaded.</div>';
      return;
    }

    var seedGroups = readMdfSeedGroups(sourceViewKey);
    // Apply SOW filter at the data layer so the grand + per-L1
    // summaries reflect only the visible (filtered) subset. The
    // pill strip itself still mounts off the unfiltered model so
    // every SOW remains selectable.
    var effectiveRecords = (ns.sowFilter && typeof ns.sowFilter.filterRecords === 'function')
      ? ns.sowFilter.filterRecords(sourceViewKey, records)
      : records;
    // Detect issues once per render — cards + summary chips read from
    // the cached analysis. Runs against the filtered records so the
    // counts reflect what\'s actually visible.
    if (ns.warnings && typeof ns.warnings.analyze === 'function') {
      try { ns.warnings.analyze(effectiveRecords, sourceViewKey); }
      catch (e) { console.warn('[scw-ws-v2] warnings analyze failed', e); }
    }
    var sortPreset = (ns.sort && typeof ns.sort.getActivePreset === 'function')
      ? ns.sort.getActivePreset(sourceViewKey)
      : null;
    var tree = ns.groups.buildGroupTree(effectiveRecords, seedGroups, { sortPreset: sortPreset });
    if (ns.state && typeof ns.state.applyOpenState === 'function') {
      ns.state.applyOpenState(sourceViewKey, tree);
    } else {
      tree.forEach(function (l1) { l1.isOpen = true; });
    }

    // Snapshot which cards are currently expanded so we can reapply
    // the open state after the full-tree rebuild. Card expansion state
    // lives only in the DOM (no persistence), so without this an edit
    // submitted from inside an open card would collapse the card on the
    // post-save re-render.
    var openIds = Object.create(null);
    var openNodes = body.querySelectorAll('.scw-ws-v2-card.scw-ws-v2-card--open');
    for (var oi = 0; oi < openNodes.length; oi++) {
      var rid = openNodes[oi].getAttribute('data-scw-ws-v2-record');
      if (rid) openIds[rid] = true;
    }

    var frag = document.createDocumentFragment();
    // Whole-grid summary at the top — aggregates every L1\'s records
    // into one table. Visible in default mode AND summary-only mode.
    if (ns.summary && typeof ns.summary.buildGrandSummary === 'function') {
      try {
        var grand = ns.summary.buildGrandSummary(tree);
        if (grand) frag.appendChild(grand);
      } catch (gErr) {
        console.warn('[scw-ws-v2] grand summary failed', gErr);
      }
    }
    for (var i = 0; i < tree.length; i++) {
      frag.appendChild(buildL1Block(tree[i], sourceViewKey));
    }

    body.innerHTML = '';
    body.appendChild(frag);

    // Reapply card-level open state. If the cascade moved a record to
    // a different MDF/IDF, the card lives in a new L1 — open that L1
    // too so the card is actually visible after the rebuild.
    Object.keys(openIds).forEach(function (rid) {
      var card = body.querySelector(
        '.scw-ws-v2-card[data-scw-ws-v2-record="' + rid.replace(/"/g, '\\"') + '"]'
      );
      if (!card) return;
      card.classList.add('scw-ws-v2-card--open');
      var l1Block = card.closest('.scw-ws-v2-l1');
      if (l1Block && !l1Block.classList.contains('scw-ws-v2-l1--open')) {
        l1Block.classList.add('scw-ws-v2-l1--open');
        var l1Head = l1Block.querySelector('.scw-ws-v2-l1-head');
        if (l1Head) {
          l1Head.classList.add('scw-ws-v2-l1-head--open');
          l1Head.setAttribute('aria-expanded', 'true');
        }
        // Persist the change so a follow-up re-render doesn't snap it
        // back closed via the saved collapse state.
        var l1Id = l1Block.getAttribute('data-scw-ws-v2-l1');
        if (l1Id && ns.state && typeof ns.state.setOpenExclusive === 'function') {
          ns.state.setOpenExclusive(sourceViewKey, l1Id);
        }
      }
    });
  }

  // Resume deferred renders when focus leaves the panel.
  document.addEventListener('focusout', function () {
    setTimeout(function () {
      Object.keys(pending).forEach(function (key) {
        var container = document.getElementById('scw-ws-v2-' + key);
        if (!container || hasFocusInPanel(container)) return;
        var records = pending[key];
        delete pending[key];
        renderView(key, records);
      });
    }, 0);
  }, true);

  ns.render = {
    renderView: renderView
  };
})();
/*** END WORKSHEET V2 — RENDER ************************************************/
