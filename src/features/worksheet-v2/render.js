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

  // Money-model flags + summary opts for a view. Used by both the full
  // rebuild (grand + per-L1 summaries) and the in-place fast path, so the
  // numbers stay identical across the two code paths.
  function viewMoneyFlags(sourceViewKey) {
    var f = { sales: false, survey: false, install: false };
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(sourceViewKey);
      f.sales   = !!(vc && vc.moneyMode === 'sales');
      f.survey  = !!(vc && vc.moneyMode === 'survey');
      f.install = !!(vc && vc.moneyMode === 'install');
    } catch (e) { /* default build-SOW */ }
    return f;
  }
  function buildMoneyOpts(sourceViewKey, flags) {
    flags = flags || viewMoneyFlags(sourceViewKey);
    var o = flags.sales
      ? { moneyField: 'field_2269', moneyLabel: 'Total' }
      : (flags.survey ? { moneyField: 'field_2401', moneyLabel: 'Sub Bid' } : {});
    if (flags.install) o.hideMoney = true;
    if (flags.survey)  o.includeServices = true;
    try {
      o.fields = (ns.cfg && typeof ns.cfg.fields === 'function')
        ? ns.cfg.fields(sourceViewKey) : null;
    } catch (e) { o.fields = null; }
    o.viewKey = sourceViewKey;
    return o;
  }

  // Flat, in-order list of record ids the tree would render — used to detect
  // whether an edit changed the visible STRUCTURE (group membership / sort /
  // filter) vs. just a record's own fields. Same order the cards appear in.
  function flatTreeIds(tree) {
    var out = [];
    for (var i = 0; i < tree.length; i++) {
      var l1 = tree[i];
      for (var j = 0; j < l1.l2.length; j++) {
        var l2 = l1.l2[j];
        if (l2.id === '__empty_l2') continue;
        for (var k = 0; k < l2.records.length; k++) {
          var r = l2.records[k];
          if (r && r.id) out.push(r.id);
        }
      }
    }
    return out;
  }

  /**
   * Fast in-place update. When an edit marks only specific records dirty AND
   * the visible card order is unchanged (no group/sort/filter shift), replace
   * just those card nodes and refresh the summaries in place — skipping the
   * full tree teardown + re-append of every card (the per-edit lag). Returns
   * true on success; false means "structure changed, do a full rebuild".
   */
  function tryInPlaceUpdate(body, tree, dirtyIds, sourceViewKey, openIds) {
    var domCards = body.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]');
    var treeIds  = flatTreeIds(tree);
    if (domCards.length !== treeIds.length) return false;

    var byId = Object.create(null);
    for (var d = 0; d < domCards.length; d++) {
      var did = domCards[d].getAttribute('data-scw-ws-v2-record');
      if (did !== treeIds[d]) return false;   // order differs → structural change
      byId[did] = domCards[d];
    }

    // Record lookup from the tree.
    var recById = Object.create(null);
    for (var t = 0; t < tree.length; t++) {
      var l1 = tree[t];
      for (var j = 0; j < l1.l2.length; j++) {
        var l2 = l1.l2[j];
        for (var k = 0; k < l2.records.length; k++) {
          var r = l2.records[k];
          if (r && r.id) recById[r.id] = r;
        }
      }
    }

    // Validate every dirty record is present BEFORE mutating, so a fallthrough
    // to the full rebuild never has to clean up a half-applied in-place pass.
    var ids = Object.keys(dirtyIds);
    for (var v = 0; v < ids.length; v++) {
      if (!byId[ids[v]] || !recById[ids[v]]) return false;
    }
    for (var x = 0; x < ids.length; x++) {
      var id  = ids[x];
      var old = byId[id];
      var fresh = ns.card.buildCard(recById[id], sourceViewKey);
      if (!fresh) return false;   // (validated present; a build failure is rare)
      try { fresh.setAttribute('data-scw-sig', cardSig(recById[id])); } catch (e) { /* ignore */ }
      if (openIds[id] && fresh.classList) fresh.classList.add('scw-ws-v2-card--open');
      if (old.parentNode) old.parentNode.replaceChild(fresh, old);
    }
    return true;
  }

  // Defer renders while the user is mid-edit so typing isn't blown
  // away by a sibling-triggered re-notify.
  var pending = Object.create(null);

  // Self-heal: besides the dirty records, each render re-verifies a small
  // ROTATING window of records (recompute sig, rebuild on mismatch) so a change
  // the dirty tracker ever missed self-corrects within a few renders instead of
  // persisting stale. Cheap insurance — ~16 sigs/render vs 168.
  var HEAL_PER_RENDER = 16;
  var _healOffset = Object.create(null);   // viewKey -> next window start index

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

    // Sub-bid total for this MDF/IDF — shown in the header so the per-MDF
    // money is visible at a glance (skipped for install — no money model).
    var moneyStr = '';
    try {
      var _vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' && ns.cfg.viewCfg(sourceViewKey);
      var _mm = _vc && _vc.moneyMode;
      if (_mm !== 'install' && ns.summary && typeof ns.summary.l1MoneyTotal === 'function') {
        var _opts = {
          viewKey:         sourceViewKey,
          fields:          (ns.cfg && typeof ns.cfg.fields === 'function') ? ns.cfg.fields(sourceViewKey) : null,
          moneyField:      (_mm === 'sales') ? 'field_2269' : (_mm === 'survey' ? 'field_2401' : null),
          includeServices: (_mm === 'survey')
        };
        var _t = ns.summary.l1MoneyTotal(l1, _opts);
        if (_t) moneyStr = ns.summary.fmtMoney(_t);
      }
    } catch (e) { /* no money in header */ }

    head.innerHTML =
      '<span class="scw-ws-v2-l1-chevron">' + L1_CHEVRON_SVG + '</span>' +
      '<span class="scw-ws-v2-l1-label">' + escapeHtml(l1.label) + '</span>' +
      issueChips +
      (moneyStr ? '<span class="scw-ws-v2-l1-money">' + moneyStr + '</span>' : '') +
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
    var surveyMoney = false;
    var installMoney = false;
    try {
      var _vcSales = ns.cfg && typeof ns.cfg.viewCfg === 'function' &&
                     ns.cfg.viewCfg(sourceViewKey);
      salesMoney  = !!(_vcSales && _vcSales.moneyMode === 'sales');
      surveyMoney = !!(_vcSales && _vcSales.moneyMode === 'survey');
      installMoney = !!(_vcSales && _vcSales.moneyMode === 'install');
    } catch (e) { /* default to build-SOW */ }
    var summaryMoneyOpts = salesMoney
      ? { moneyField: 'field_2269', moneyLabel: 'Total' }
      : (surveyMoney ? { moneyField: 'field_2401', moneyLabel: 'Sub Bid' } : {});
    // Install has no money columns — show the summary minus the Sub Bid column.
    if (installMoney) summaryMoneyOpts.hideMoney = true;
    // Bid (survey): roll service items into the summary so the per-MDF sub-bid
    // total is complete.
    if (surveyMoney) summaryMoneyOpts.includeServices = true;
    // Hand the summary a per-view field map (cfg.fields) + the view key so
    // aggregate() resolves product/qty/cabling/money per-object instead of
    // the SOW literals it used to hardcode (CLAUDE.md #15). SOW path is
    // unchanged (map resolves to the same literals).
    try {
      summaryMoneyOpts.fields = (ns.cfg && typeof ns.cfg.fields === 'function')
        ? ns.cfg.fields(sourceViewKey) : null;
    } catch (eF) { summaryMoneyOpts.fields = null; }
    summaryMoneyOpts.viewKey = sourceViewKey;

    // Per-L1 summary block — sits at the top of the body, always rendered;
    // CSS controls its visibility per toolbar mode. Rendered for every money
    // model now (install gets the no-money variant).
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
      hdr.className = 'scw-ws-v2-col-header' +
        (salesMoney  ? ' scw-ws-v2-col-header--sales'  : '') +
        (surveyMoney ? ' scw-ws-v2-col-header--survey' : '') +
        (installMoney ? ' scw-ws-v2-col-header--install' : '');
      if (installMoney) {
        // Install 7-track header (matches the install row grid): chevron ·
        // Label · Product · Flags · SCW Notes · warn · trash. No money columns.
        hdr.innerHTML =
          '<span></span>' +
          '<span>Label</span>' +
          '<span>Product</span>' +
          '<span>Flags</span>' +
          '<span>SCW Notes</span>' +
          '<span></span>' +
          '<span></span>';
      } else if (surveyMoney) {
        // Survey 11-track header: chevron · Drop · Product · Survey Notes ·
        // Description · Qty/Chips · Labor · Ext · Bid · warn · trash.
        // (SCW Notes lives in the detail panel.)
        hdr.innerHTML =
          '<span></span>' +
          '<span>Drop</span>' +
          '<span>Product</span>' +
          '<span>Survey Notes</span>' +
          '<span title="Detail the work that will be completed under this line item">' +
            'Description of Work</span>' +
          '<span>Qty</span>' +
          '<span class="scw-ws-v2-col-header-total">Labor</span>' +
          '<span class="scw-ws-v2-col-header-total">Ext</span>' +
          '<span class="scw-ws-v2-col-header-total">Bid</span>' +
          '<span></span>' +
          '<span></span>';
      } else {
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
      }
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

    // New render cycle → invalidate card.js's per-render record indexes so a
    // changed back-pointer (connection edit) can't be served stale from cache.
    ns.idxGen = (ns.idxGen || 0) + 1;

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

    // ── Perf timing (gated on SCW.perfLog) ──────────────────────────────
    // Phase breakdown of the worksheet rebuild — the dominant per-edit /
    // per-load cost on a worksheet page. Logs a line per render AND feeds
    // SCW.perfReport() (labels under "view_XXXX worksheetV2.renderView") so
    // it shows alongside the per-feature handler costs. Free when perfLog off.
    var _PF  = !!(window.SCW && SCW.perfLog && SCW._now);
    var _pf0 = _PF ? SCW._now() : 0;
    var _pfW = 0, _pfG = 0, _pfS = 0, _pfC = 0;
    var _built = 0, _reused = 0;   // keyed-card reuse tally (perf diagnostic)
    var _pfSig = 0;                // time spent in cardSig (JSON.stringify) — split from DOM
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
      // hideSow suppresses the filter ONLY when the view has no filterPills
      // override. A filterPills view (survey → Bid) keeps the filter active.
      _vcHideSow = !!(_vcS && _vcS.hideSow && !_vcS.filterPills);
    } catch (e) { /* default: filter applies */ }
    var effectiveRecords = (!_vcHideSow && ns.sowFilter &&
        typeof ns.sowFilter.filterRecords === 'function')
      ? ns.sowFilter.filterRecords(sourceViewKey, records)
      : records;
    // Detect issues once per render — cards + summary chips read from
    // the cached analysis. Runs against the filtered records so the
    // counts reflect what\'s actually visible.
    if (ns.warnings && typeof ns.warnings.analyze === 'function') {
      var _aw = _PF ? SCW._now() : 0;
      try { ns.warnings.analyze(effectiveRecords, sourceViewKey); }
      catch (e) { console.warn('[scw-ws-v2] warnings analyze failed', e); }
      if (_PF) _pfW = SCW._now() - _aw;
    }
    var sortPreset = (ns.sort && typeof ns.sort.getActivePreset === 'function')
      ? ns.sort.getActivePreset(sourceViewKey)
      : null;
    var _ag = _PF ? SCW._now() : 0;
    var tree = ns.groups.buildGroupTree(effectiveRecords, seedGroups, {
      sortPreset: sortPreset,
      // Per-view field map so L1 (MDF/IDF) / L2 (bucket) / sort resolve for
      // non-SOW objects (survey view_3505 groups by field_2375 / field_2366).
      fields: (ns.cfg && typeof ns.cfg.fields === 'function')
        ? ns.cfg.fields(sourceViewKey) : null
    });
    if (_PF) _pfG = SCW._now() - _ag;
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

    // What actually changed since the last render (Backbone change + add/remove
    // + optimistic-edit markDirty). all:true → first render / structural change
    // → verify everything via the signature path. Plus a rotating self-heal
    // window so a missed change can't persist stale.
    var dirty = (ns.data && typeof ns.data.takeDirty === 'function')
      ? ns.data.takeDirty(sourceViewKey) : { all: true, ids: Object.create(null) };
    var healSet = Object.create(null);
    if (!dirty.all && records.length) {
      var _ho = _healOffset[sourceViewKey] || 0;
      for (var _hi = 0; _hi < HEAL_PER_RENDER && _hi < records.length; _hi++) {
        var _hr = records[(_ho + _hi) % records.length];
        if (_hr && _hr.id) healSet[_hr.id] = true;
      }
      _healOffset[sourceViewKey] = (_ho + HEAL_PER_RENDER) % records.length;
    }

    // ── Fast in-place update ────────────────────────────────────────────
    // The common case is an edit that changes a handful of records without
    // touching grouping / sort / filter. When that holds, swap just those
    // card nodes and refresh the summaries in place — skipping the full tree
    // teardown + re-append of all N cards (the per-edit lag: ~45-90ms even
    // when only one card changed). Falls through to the full rebuild below if
    // the structure shifted or a dirty record isn't currently visible.
    if (!dirty.all && body.querySelector('.scw-ws-v2-card')) {
      var _dids = Object.keys(dirty.ids);
      if (_dids.length &&
          tryInPlaceUpdate(body, tree, dirty.ids, sourceViewKey, openIds)) {
        var _mOpts = buildMoneyOpts(sourceViewKey);
        // Grand summary (totals may have shifted) — swap the node in place.
        var _grandOld = body.querySelector('.scw-ws-v2-grand-summary');
        if (_grandOld && ns.summary && ns.summary.buildGrandSummary) {
          try {
            var _grandNew = ns.summary.buildGrandSummary(tree, _mOpts);
            if (_grandNew && _grandOld.parentNode) {
              _grandOld.parentNode.replaceChild(_grandNew, _grandOld);
            }
          } catch (e) { /* keep old summary */ }
        }
        // Per-L1 summary + header (money/issue chips/count) in place — but
        // ONLY for the L1(s) that actually contain an edited record. Rebuilding
        // every group's summary aggregate was the bulk of the in-place cost.
        var _blocks = body.querySelectorAll('.scw-ws-v2-l1');
        var _blockById = Object.create(null);
        for (var _bi = 0; _bi < _blocks.length; _bi++) {
          _blockById[_blocks[_bi].getAttribute('data-scw-ws-v2-l1')] = _blocks[_bi];
        }
        for (var _li = 0; _li < tree.length; _li++) {
          var _l1 = tree[_li];
          var _block = _blockById[_l1.id];
          if (!_block) continue;
          // Does this L1 hold a dirty record? If not, its summary/header are
          // unchanged — skip the rebuild.
          var _l1Affected = false;
          for (var _l2i = 0; _l2i < _l1.l2.length && !_l1Affected; _l2i++) {
            var _recs = _l1.l2[_l2i].records || [];
            for (var _ri = 0; _ri < _recs.length; _ri++) {
              if (_recs[_ri] && dirty.ids[_recs[_ri].id]) { _l1Affected = true; break; }
            }
          }
          if (!_l1Affected) continue;
          var _sumOld = _block.querySelector('.scw-ws-v2-summary');
          if (_sumOld && ns.summary && ns.summary.buildL1Summary) {
            try {
              var _sumNew = ns.summary.buildL1Summary(_l1, _mOpts);
              if (_sumNew && _sumOld.parentNode) {
                _sumOld.parentNode.replaceChild(_sumNew, _sumOld);
              }
            } catch (e) { /* keep old */ }
          }
          var _headOld = _block.querySelector('.scw-ws-v2-l1-head');
          if (_headOld && _headOld.parentNode) {
            _headOld.parentNode.replaceChild(buildL1Header(_l1, sourceViewKey), _headOld);
          }
        }
        if (bannerChips) {
          bannerChips.innerHTML =
            (ns.summary && typeof ns.summary.grandIssueChips === 'function')
              ? (ns.summary.grandIssueChips(tree) || '') : '';
        }
        if (_PF) {
          var _totIP = SCW._now() - _pf0;
          if (SCW.recordHandlerTiming) {
            SCW.recordHandlerTiming('view ' + sourceViewKey + ' worksheetV2.renderView', _totIP);
          }
          console.log('[SCW perf] worksheetV2.renderView ' + sourceViewKey + ': ' +
            _totIP.toFixed(1) + 'ms  (IN-PLACE  dirty=' + _dids.length +
            '  records=' + records.length + ')');
        }
        return;
      }
    }

    function makeCard(record, viewKey) {
      var id  = record && record.id;
      var ex  = id && existingCards[id];
      // Fast path: a record we have a card for, that DIDN'T change and isn't in
      // this render's self-heal window → reuse verbatim with NO JSON.stringify.
      // This is the win — idle/unchanged rows cost nothing.
      if (ex && !dirty.all && !dirty.ids[id] && !healSet[id]) {
        delete existingCards[id];
        if (_PF) _reused++;
        return ex;
      }
      // Changed / new / heal-sampled → verify via signature.
      var _ss = _PF ? SCW._now() : 0;
      var sig = cardSig(record);
      if (_PF) _pfSig += SCW._now() - _ss;
      if (ex && ex.getAttribute('data-scw-sig') === sig) {
        // A DOM node lives in one place only — drop it from the index so if the
        // same record somehow appears twice in the tree the second gets a fresh
        // build instead of stealing (and thus removing) the first.
        delete existingCards[id];
        if (_PF) _reused++;
        return ex; // unchanged — reuse node verbatim (keeps open state, focus-safe)
      }
      var card = ns.card.buildCard(record, viewKey);
      if (_PF) _built++;
      if (card && card.setAttribute) card.setAttribute('data-scw-sig', sig);
      return card;
    }

    var frag = document.createDocumentFragment();
    // Whole-grid summary at the top — aggregates every L1\'s records
    // into one table. Visible in default mode AND summary-only mode.
    var _grandSales = false;
    var _grandSurvey = false;
    var _grandInstall = false;
    try {
      var _vcGrand = ns.cfg && typeof ns.cfg.viewCfg === 'function' &&
                     ns.cfg.viewCfg(sourceViewKey);
      _grandSales  = !!(_vcGrand && _vcGrand.moneyMode === 'sales');
      _grandSurvey = !!(_vcGrand && _vcGrand.moneyMode === 'survey');
      _grandInstall = !!(_vcGrand && _vcGrand.moneyMode === 'install');
    } catch (e) { /* default */ }
    var grandMoneyOpts = _grandSales
      ? { moneyField: 'field_2269', moneyLabel: 'Total' }
      : (_grandSurvey ? { moneyField: 'field_2401', moneyLabel: 'Sub Bid' } : {});
    if (_grandInstall) grandMoneyOpts.hideMoney = true;
    if (_grandSurvey) grandMoneyOpts.includeServices = true;
    try {
      grandMoneyOpts.fields = (ns.cfg && typeof ns.cfg.fields === 'function')
        ? ns.cfg.fields(sourceViewKey) : null;
    } catch (eGF) { grandMoneyOpts.fields = null; }
    grandMoneyOpts.viewKey = sourceViewKey;
    // Grand summary — rendered for every money model (install = no-money variant).
    var _as = _PF ? SCW._now() : 0;
    if (ns.summary && typeof ns.summary.buildGrandSummary === 'function') {
      try {
        var grand = ns.summary.buildGrandSummary(tree, grandMoneyOpts);
        if (grand) frag.appendChild(grand);
      } catch (gErr) {
        console.warn('[scw-ws-v2] grand summary failed', gErr);
      }
    }
    if (_PF) _pfS = SCW._now() - _as;
    var _ac = _PF ? SCW._now() : 0;
    for (var i = 0; i < tree.length; i++) {
      frag.appendChild(buildL1Block(tree[i], sourceViewKey, makeCard));
    }
    if (_PF) _pfC = SCW._now() - _ac;

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

    if (_PF) {
      var _tot = SCW._now() - _pf0;
      var _lbl = 'view ' + sourceViewKey + ' worksheetV2.renderView';
      if (SCW.recordHandlerTiming) {
        SCW.recordHandlerTiming(_lbl, _tot);
        SCW.recordHandlerTiming(_lbl + '  ├ buildCards',     _pfC);
        SCW.recordHandlerTiming(_lbl + '  ├ buildGroupTree', _pfG);
        SCW.recordHandlerTiming(_lbl + '  ├ warnings',       _pfW);
        SCW.recordHandlerTiming(_lbl + '  └ grandSummary',   _pfS);
      }
      console.log('[SCW perf] worksheetV2.renderView ' + sourceViewKey + ': ' +
        _tot.toFixed(1) + 'ms  (records=' + records.length +
        '  cards=' + _pfC.toFixed(1) + ' [built=' + _built + ' reused=' + _reused +
        ' sig=' + _pfSig.toFixed(1) + ']' +
        '  tree=' + _pfG.toFixed(1) +
        '  warnings=' + _pfW.toFixed(1) + '  summary=' + _pfS.toFixed(1) + ')');
    }
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
