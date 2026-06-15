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

  // ── Card reconciliation (keyed reuse) ──────────────────────────────────
  // The dominant cost of a re-render is rebuilding EVERY card's DOM. But a
  // single-field edit only changes ONE record, so we keep the existing DOM
  // node for any record whose data is byte-identical and rebuild only the
  // ones that actually changed. The group tree, summaries, warnings and chips
  // still recompute every render (cheap, data-only / small DOM) — so grouping,
  // totals and order stay correct; we just skip N-1 buildCard() DOM builds.
  //
  // Signature = a cheap hash of the record's attributes. Identical record →
  // identical card, so a matching signature means the cached node is reusable.
  function hashStr(s) {
    var h = 5381, i = s.length;
    while (i) { h = (h * 33) ^ s.charCodeAt(--i); }
    return (h >>> 0).toString(36);
  }
  function cardSig(rec) {
    try { var s = JSON.stringify(rec); return s.length.toString(36) + '.' + hashStr(s); }
    catch (e) { return 'x' + Math.random().toString(36).slice(2); }
  }
  // Index the cards currently in `body` by record id, so the rebuild can pluck
  // and reuse unchanged ones. (Reusing a node detaches it from the old DOM;
  // body.innerHTML = '' then clears whatever wasn't reused.)
  function indexExistingCards(body) {
    var map = Object.create(null);
    var nodes = body.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-scw-ws-v2-record');
      if (id) map[id] = nodes[i];
    }
    return map;
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

  // Read-only cells whose value is computed server-side. When focus is
  // still inside the panel a full re-render is deferred (it would yank
  // focus from the field the user just tabbed into) — but the user still
  // expects committing a value (Enter / Tab) to surface the recomputed
  // LABEL (field_1950) + Install Fee (field_2028) + extended stack totals.
  // patchDerivedCells updates ONLY those read-only cells in place from the
  // freshly-fetched records, leaving every editable input (and focus /
  // caret) untouched. The full deferred render still runs once focus
  // leaves the panel.
  //
  // STACK_TOTALS maps an editable input's field key → the field key of the
  // read-only "extended total" rendered beside it (see card.js stackCell).
  var STACK_TOTALS = {
    'field_2150': 'field_2151', // Sub Bid → Sub Bid total
    'field_1973': 'field_1997', // +Hrs   → Hrs total
    'field_1974': 'field_2146'  // +Mat   → Mat total
  };

  function readDerived(rec, key) {
    var v = rec[key];
    if (v == null) {
      var raw = rec[key + '_raw'];
      if (raw && typeof raw === 'object' && raw.identifier) return raw.identifier;
      return '';
    }
    return String(v).replace(/<[^>]*>/g, '').trim();
  }

  function setCellText(card, selector, text) {
    var el = card.querySelector(selector);
    if (el && el.textContent !== text) el.textContent = text;
  }

  function patchDerivedCells(container, records) {
    if (!records || !records.length) return;
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (!rec || !rec.id) continue;
      var card = container.querySelector(
        '.scw-ws-v2-card[data-scw-ws-v2-record="' +
        String(rec.id).replace(/"/g, '\\"') + '"]'
      );
      if (!card) continue;

      setCellText(card, '.scw-ws-v2-cell--label', readDerived(rec, 'field_1950'));
      setCellText(card, '.scw-ws-v2-cell--fee',   readDerived(rec, 'field_2028'));

      for (var inField in STACK_TOTALS) {
        var input = card.querySelector('[data-scw-ws-v2-field="' + inField + '"]');
        if (!input) continue;
        var cell = input.closest ? input.closest('.scw-ws-v2-cell--stack') : null;
        var total = cell ? cell.querySelector('.scw-ws-v2-stack-total') : null;
        if (total) {
          var t = readDerived(rec, STACK_TOTALS[inField]);
          if (total.textContent !== t) total.textContent = t;
        }
      }
    }
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

    // Aggregate issue chips for this MDF/IDF group, rendered inline in the
    // header bar. Read from the warnings cache analyzed earlier this render.
    var issueChips = (ns.summary && typeof ns.summary.issueChipsForL1 === 'function')
      ? (ns.summary.issueChipsForL1(l1) || '') : '';

    head.innerHTML =
      '<span class="scw-ws-v2-l1-chevron">' + L1_CHEVRON_SVG + '</span>' +
      '<span class="scw-ws-v2-l1-label">' + escapeHtml(l1.label) + '</span>' +
      issueChips +
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

  function buildL1Block(l1, sourceViewKey, cardFn) {
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

    // Sales money model? (moneyMode:'sales') — drives the summary money
    // column (Total vs Sub Bid) and the column-header labels below.
    var salesMoney = false;
    try {
      var _vcSales = ns.cfg && typeof ns.cfg.viewCfg === 'function' &&
                     ns.cfg.viewCfg(sourceViewKey);
      salesMoney = !!(_vcSales && _vcSales.moneyMode === 'sales');
    } catch (e) { /* default to build-SOW */ }
    var summaryMoneyOpts = salesMoney
      ? { moneyField: 'field_2269', moneyLabel: 'Total' }
      : null;

    // Per-L1 summary block — sits at the top of the body, always
    // rendered; CSS controls its visibility per toolbar mode.
    if (ns.summary && typeof ns.summary.buildL1Summary === 'function') {
      try {
        var sumEl = ns.summary.buildL1Summary(l1, summaryMoneyOpts);
        if (sumEl) body.appendChild(sumEl);
      } catch (sumErr) {
        console.warn('[scw-ws-v2] summary build failed for L1', l1 && l1.id, sumErr);
      }
    }

    if (ns.card && typeof ns.card.buildCard === 'function') {
      // Column-header strip — one per L1 body, sits at the top so
      // the field names are visible at a glance without bloating
      // every card row. Uses the same grid template as the row so
      // headers line up with their columns. Cam-row-shaped (with
      // "Drop" slot) since the cam template is the superset.
      var hdr = document.createElement('div');
      hdr.className = 'scw-ws-v2-col-header' + (salesMoney ? ' scw-ws-v2-col-header--sales' : '');
      hdr.innerHTML =
        '<span></span>' + /* chevron slot */
        '<span>Drop</span>' +
        '<span>Product</span>' +
        // Sales rows put SCW Notes (field_1953) in this fill column, not
        // a labor description — so label it accordingly there.
        (salesMoney ? '<span>SCW Notes</span>' : '<span>Description</span>') +
        '<span>Qty</span>' +
        (salesMoney
          ? '<span class="scw-ws-v2-col-header-total">Total</span>'
          : '<span>Sub Bid</span><span>+Hrs</span><span>+Mat</span><span>Fee</span><span>SOW</span>') +
        '<span></span>' + /* warning slot */
        (salesMoney ? '<span>CR</span>' : '<span></span>');   /* trash / CR slot */
      body.appendChild(hdr);

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
            body.appendChild(
              cardFn ? cardFn(l2.records[j], sourceViewKey)
                     : ns.card.buildCard(l2.records[j], sourceViewKey));
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
    var bannerChips = container.querySelector('.scw-ws-v2-banner-chips');
    if (!body) return;

    if (count) {
      count.textContent = records.length + ' record' + (records.length === 1 ? '' : 's');
    }
    if (bannerChips) bannerChips.innerHTML = '';

    if (hasFocusInPanel(container)) {
      // Defer the full rebuild (it would steal focus from the field the
      // user just tabbed into), but patch the read-only derived cells in
      // place so the committed value's recomputed label / fee / totals
      // show immediately.
      pending[sourceViewKey] = records;
      patchDerivedCells(container, records);
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
    //
    // Guard on hideSow: when SOW is suppressed on this view (e.g. the
    // sales view_3586), the pill strip never mounts — so its stale-id
    // pruning never runs. A leftover localStorage filter from before
    // hideSow was set would then silently drop EVERY record (none match
    // the stale SOW ids), leaving all groups empty. Skip the filter
    // entirely when SOW is hidden.
    var _vcHideSow = false;
    try {
      var _vcS = ns.cfg && typeof ns.cfg.viewCfg === 'function' &&
                 ns.cfg.viewCfg(sourceViewKey);
      _vcHideSow = !!(_vcS && _vcS.hideSow);
    } catch (e) { /* default: filter applies */ }
    var effectiveRecords = (!_vcHideSow && ns.sowFilter &&
        typeof ns.sowFilter.filterRecords === 'function')
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

    // Keyed card factory: reuse an unchanged record's existing DOM node
    // (matched by id + signature), else build a fresh card. This is what
    // turns a one-field edit from "rebuild every card" into "rebuild one".
    var existingCards = indexExistingCards(body);
    function makeCard(record, viewKey) {
      var id  = record && record.id;
      var sig = cardSig(record);
      var ex  = id && existingCards[id];
      if (ex && ex.getAttribute('data-scw-sig') === sig) {
        // A DOM node lives in one place only — drop it from the index so if the
        // same record somehow appears twice in the tree the second gets a fresh
        // build instead of stealing (and thus removing) the first.
        delete existingCards[id];
        return ex; // unchanged — reuse node verbatim (keeps open state, focus-safe)
      }
      var card = ns.card.buildCard(record, viewKey);
      if (card && card.setAttribute) card.setAttribute('data-scw-sig', sig);
      return card;
    }

    var frag = document.createDocumentFragment();
    // Whole-grid summary at the top — aggregates every L1\'s records
    // into one table. Visible in default mode AND summary-only mode.
    var _grandSales = false;
    try {
      var _vcGrand = ns.cfg && typeof ns.cfg.viewCfg === 'function' &&
                     ns.cfg.viewCfg(sourceViewKey);
      _grandSales = !!(_vcGrand && _vcGrand.moneyMode === 'sales');
    } catch (e) { /* default */ }
    var grandMoneyOpts = _grandSales
      ? { moneyField: 'field_2269', moneyLabel: 'Total' }
      : null;
    if (ns.summary && typeof ns.summary.buildGrandSummary === 'function') {
      try {
        var grand = ns.summary.buildGrandSummary(tree, grandMoneyOpts);
        if (grand) frag.appendChild(grand);
      } catch (gErr) {
        console.warn('[scw-ws-v2] grand summary failed', gErr);
      }
    }
    for (var i = 0; i < tree.length; i++) {
      frag.appendChild(buildL1Block(tree[i], sourceViewKey, makeCard));
    }

    body.innerHTML = '';
    body.appendChild(frag);

    // Whole-grid aggregate issue chips now live in the banner (always
    // visible, independent of the collapsible summary panel).
    if (bannerChips) {
      bannerChips.innerHTML =
        (ns.summary && typeof ns.summary.grandIssueChips === 'function')
          ? (ns.summary.grandIssueChips(tree) || '') : '';
    }

    // Reapply card-level open state ONLY — do NOT force the containing L1
    // open. Section open/closed is governed purely by the accordion state,
    // independent of whether a line item inside is expanded, so closing an
    // MDF/IDF section always closes it (and the exclusive accordion isn't
    // overridden by a lingering open card). The card keeps its expanded
    // class, so it reappears expanded whenever its section is reopened.
    Object.keys(openIds).forEach(function (rid) {
      var card = body.querySelector(
        '.scw-ws-v2-card[data-scw-ws-v2-record="' + rid.replace(/"/g, '\\"') + '"]'
      );
      if (card) card.classList.add('scw-ws-v2-card--open');
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
