/*** WORKSHEET V2 — SOW CONTEXT ***********************************************
 *
 * Makes "which scope of work am I looking at?" unavoidable. Root cause from
 * the 2026-10-06 revision RCA: the ops project page showed every SOW's items
 * mixed unless a filter pill happened to be active, so "22 cameras at the
 * MDF" and "no cameras at the MDF" were both true, and nothing on screen said
 * "you are working on SW1589 — Alternate Sign Option". Two surfaces, one bar:
 *
 *  • PROJECT page (view_3962 — the project's SOWs share one worksheet): a
 *    sticky bar above the worksheet banner names the SOW the worksheet is
 *    filtered to — number, name, an Original / Alternate / Change order
 *    badge, its line-item count, how many of its items are shared with
 *    another SOW — and carries the scope tabs (one per SOW, "All · mixed",
 *    "(no SOW)"). With no single SOW chosen the bar turns AMBER: "Showing 2
 *    scopes mixed … counts and totals combine them". On a project with two
 *    or more SOWs and no stored choice, the worksheet body waits behind a
 *    chooser ("Which scope of work are you working on?") until one is picked;
 *    "Show all, mixed" is the explicit alternative. The choice IS the SOW
 *    filter's selection (sow-filter.js storage), so it persists the same way.
 *  • SOW page (view_3586 — one SOW): the bar names THIS SOW (the view_3827
 *    detail record) and its siblings on the project (view_3869): "1 of 2
 *    scopes on this project · also SW1334 (Original)".
 *  • SURVEY / BID worksheet (view_3505, kind:'bid' — 2026-10-16): the same bar
 *    for the request's BIDS. The sub's items are spread over BD-1 / BD-2 …
 *    (variants), so the bar names the bid being worked on (BD-n · friendly
 *    name · Base / Variant · the BIDs grid's status, or "Submitted" when it
 *    carries a bid PDF), the bid tabs with counts, "(no bid)" for items taken
 *    off every bid, "All · mixed" (amber), and the chooser ("Which bid are you
 *    working on?") when the request has 2+ bids and nothing is stored. The
 *    selection is the Bid filter's (sow-filter.js filterPills on field_2415),
 *    stored per survey request. The list comes from the filter spec, which
 *    on that view also lists every bid on the BIDs grid (filterPills.listAll)
 *    so a freshly created variant with no items yet still has a tab.
 *
 * Badge rule — no Builder field marks an alternate, so: among the project's
 * non-change-order SOWs the LOWEST SW number is the Original and every other
 * one an Alternate; an identifier ending in CO (or field_2952 = change order
 * where the SOW grid loads it) is a Change order and never an alternate. Bids
 * follow the same rule on their BD-n number: the lowest is the Base bid,
 * every other one a Variant (what "Create Variant Bid" makes).
 *
 * Config (worksheet-v2/config.js per view):
 *   sowContext: { requireChoice: true }                       // project page
 *   sowContext: { page: 'sow', detailView: 'view_3827',
 *                 siblingsView: 'view_3869' }                  // SOW page
 *   sowContext: { kind: 'bid', requireChoice: true, listView: 'view_3507',
 *                 idField: 'field_2414', nameField: 'field_2636',
 *                 statusField: 'field_2550', pdfField: 'field_2626' } // survey
 * Fields: idField (default field_2122, the SOW ID), nameField (field_2126),
 * typeField (field_2952). The scope strip's meta line reads describe().
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var ALL   = '__all';
  var BLANK = '__blank';
  var BAR_CLS = 'scw-ws-v2-sowctx';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim(); }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }

  // ── Vocabulary ───────────────────────────────────────────────────────
  // One bar, two nouns. Every user-facing string that names the thing being
  // chosen lives here so the survey page's bid bar reads naturally without a
  // second module. `kinds` are the badge labels for classify()'s kinds.
  var VOCAB = {
    sow: {
      kind: 'sow',
      eyebrow: 'Scope of work', one: 'scope', many: 'scopes', ofWhat: 'on this project',
      tabsLabel: 'Scope', allTab: 'All · mixed',
      allTitle: 'Every scope\'s items together — counts and totals combine them',
      blankTab: '(no SOW)', blankTabTitle: 'Line items on no SOW',
      blankTitle: 'No SOW designated', blankBadge: 'Unassigned',
      blankMeta: 'on no scope of work — not on any proposal until a SOW is set',
      blankTok: 'no SOW', blankDescribe: 'with no SOW designated',
      hintTab: 'click a scope tab to work on one',
      chooserQ: 'Which scope of work are you working on?',
      chooserSub: function (n) {
        return 'This project has ' + n + ' scopes and this page holds all of their line items. ' +
          'Pick one so counts, totals and edits stay in the right scope.';
      },
      chooserAll: function (n) { return 'Show all ' + n + ' scopes together (mixed counts)'; },
      kinds: { original: 'Original', alternate: 'Alternate', co: 'Change order', other: '' },
      showName: false, status: false
    },
    bid: {
      kind: 'bid',
      eyebrow: 'Bid', one: 'bid', many: 'bids', ofWhat: 'on this survey',
      tabsLabel: 'Bid', allTab: 'All · mixed',
      allTitle: 'Every bid\'s items together — counts and totals combine them',
      blankTab: '(no bid)', blankTabTitle: 'Line items on no bid',
      blankTitle: 'Not on any bid', blankBadge: 'Unassigned',
      blankMeta: 'on no bid — not priced on any bid until one is set',
      blankTok: 'no bid', blankDescribe: 'with no bid',
      hintTab: 'click a bid tab to work on one',
      chooserQ: 'Which bid are you working on?',
      chooserSub: function (n) {
        return 'This survey has ' + n + ' bids and this page holds all of their line items. ' +
          'Pick one so counts, totals and edits stay in the right bid.';
      },
      chooserAll: function (n) { return 'Show all ' + n + ' bids together (mixed counts)'; },
      kinds: { original: 'Base', alternate: 'Variant', co: '', other: '' },
      showName: true, status: true
    }
  };
  function vocabOf(kind) { return VOCAB[kind] || VOCAB.sow; }

  function ctxCfg(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' ? ns.cfg.viewCfg(viewKey) : null;
      var c = vc && vc.sowContext;
      if (!c) return null;
      return {
        kind:         c.kind === 'bid' ? 'bid' : 'sow',
        page:         c.page || 'project',
        requireChoice: !!c.requireChoice,
        hideChangeOrders: !!c.hideChangeOrders,
        detailView:   c.detailView || '',
        siblingsView: c.siblingsView || '',
        listView:     c.listView || '',
        idField:      c.idField   || 'field_2122',
        nameField:    c.nameField || 'field_2126',
        typeField:    c.typeField || 'field_2952',
        statusField:  c.statusField || '',
        pdfField:     c.pdfField || ''
      };
    } catch (e) { return null; }
  }

  // ── Identity ─────────────────────────────────────────────────────────
  /** "SW-1589" / "60486704913-SW1589CO" / "SW1589 - Alternate …" → number + CO
   *  flag. The SOW connection identifier is usually the BARE number ("1628",
   *  "1926CO" — what the pills and card chips show), so a label or name that
   *  starts with a bare number parses too. Bids: "BD-1" / "BD 2" / a bare
   *  number; a bid is never a change order. */
  var SW_RE   = /\bSW-?(\d+)\s*(CO)?\b/i;
  var BD_RE   = /\bBD-?\s?(\d+)\b/i;
  var BARE_RE = /^\s*(\d{2,6})\s*(CO)?(?:\s*$|\s*[-–—:·(])/i;
  var BARE_BID_RE = /^\s*(\d{1,6})\s*(?:$|[-–—:·(])/;
  function parseRef(label, name, kind) {
    var m;
    if (kind === 'bid') {
      m = String(label || '').match(BD_RE) || String(name || '').match(BD_RE) ||
          String(label || '').match(BARE_BID_RE) || String(name || '').match(BARE_BID_RE);
      return { num: m ? parseInt(m[1], 10) : NaN, isCo: false };
    }
    m = String(label || '').match(SW_RE) || String(name || '').match(SW_RE) ||
        String(label || '').match(BARE_RE) || String(name || '').match(BARE_RE);
    return { num: m ? parseInt(m[1], 10) : NaN, isCo: !!(m && m[2]) };
  }
  function parseSow(label, name) { return parseRef(label, name, 'sow'); }
  /** Is this SOW connection ref ({id, identifier}) a change order? The
   *  identifier's CO suffix, or the SOW grid's Type (field_2952) when the
   *  pill list carries it. */
  function isChangeOrderRef(ref, viewKey) {
    if (!ref) return false;
    if (parseSow(ref.identifier, '').isCo) return true;
    var set = coIdSet(viewKey);
    return !!(ref.id && set[ref.id]);
  }
  var _coCache = { key: '', at: 0, set: null };
  function coIdSet(viewKey) {
    var now = Date.now();
    if (_coCache.set && _coCache.key === viewKey && now - _coCache.at < 1000) return _coCache.set;
    var set = Object.create(null);
    try {
      var sf = ns.sowFilter;
      // includeCo: on a view that hides change orders the filtered list has
      // none — but a CO ref on a mixed item must still be recognised by id.
      var list = (sf && typeof sf.collectSowList === 'function') ? sf.collectSowList(viewKey, { includeCo: true }) : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && (list[i].isCo || parseSow(list[i].label, list[i].name).isCo)) set[list[i].id] = true;
      }
    } catch (e) { /* no grid */ }
    _coCache = { key: viewKey, at: now, set: set };
    return set;
  }
  function isCoType(typeText) { return /change\s*order/i.test(stripHtml(typeText)); }
  /** Stamp kind ('original' | 'alternate' | 'co' | 'other') on each entry.
   *  kind 'bid' reads BD-n numbers: lowest = Base ('original'), others
   *  Variant ('alternate'). */
  function classify(sows, kind) {
    kind = kind === 'bid' ? 'bid' : 'sow';
    var lowest = Infinity;
    var i, s;
    for (i = 0; i < sows.length; i++) {
      s = sows[i];
      var p = parseRef(s.label, s.name, kind);
      s.num = p.num;
      s.kind = (p.isCo || s.isCo) ? 'co' : (isNaN(p.num) ? 'other' : 'numbered');
      if (s.kind === 'numbered' && p.num < lowest) lowest = p.num;
    }
    for (i = 0; i < sows.length; i++) {
      s = sows[i];
      if (s.kind === 'numbered') s.kind = s.num === lowest ? 'original' : 'alternate';
    }
    return sows;
  }
  function kindLabel(V, kind) { return (V && V.kinds && V.kinds[kind]) || ''; }
  function badge(kind, V) {
    var t = kindLabel(V, kind);
    return t ? '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--' + kind + '">' + t + '</span>' : '';
  }
  /** Bid status chip: the BIDs grid's status text when it serves one, else
   *  "Submitted" when the bid carries a PDF. Nothing for SOWs. */
  function statusBadge(s, V) {
    if (!V || !V.status) return '';
    if (s.status) return '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--status" title="Bid status">' + esc(s.status) + '</span>';
    if (s.hasPdf) return '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--submitted" title="A bid PDF has been generated for this bid">Submitted</span>';
    return '';
  }
  /** Short token for prose: the bare identifier as the app shows it ("1628",
   *  "1926CO"), else "SW1589" when the label carries more (a deal-prefixed id).
   *  A bid's token is its label as shown ("BD-1"). */
  function token(s, V) {
    var label = stripHtml(s.label || '');
    if (V && V.kind === 'bid') return label || stripHtml(s.name || '');
    if (/^\s*\d+\s*(CO)?\s*$/i.test(label)) return label.replace(/\s+/g, '');
    if (!isNaN(s.num)) return 'SW' + s.num + (s.kind === 'co' ? 'CO' : '');
    return label || stripHtml(s.name || '');
  }
  /** Name without a leading SW / BD / bare-number token (field_2126 often starts with it). */
  function cleanName(s) {
    var n = stripHtml(s.name || '');
    n = n.replace(/^\s*(SW-?|BD-?\s?)?\d+\s*(CO)?\s*[-–—:·]?\s*/i, '').trim();
    if (/^\d+\s*(CO)?$/i.test(n)) n = '';
    return n;
  }
  function viewLocksCo(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' ? ns.cfg.viewCfg(viewKey) : null;
      return !!(vc && vc.coItemsReadOnly);
    } catch (e) { return false; }
  }

  // ── Project page: the filter's selection is the context ─────────────
  /** The connection field the view's filter pills read (SOW field_2154 by
   *  default; the survey worksheet's Bid field_2415 via filterPills). */
  function connFieldKey(viewKey) {
    try {
      var sf = ns.sowFilter;
      if (sf && typeof sf.filterSpec === 'function') {
        var sp = sf.filterSpec(viewKey);
        if (sp && sp.fieldKey) return sp.fieldKey;
      }
    } catch (e) { /* fall through */ }
    try { return (ns.cfg && ns.cfg.fields(viewKey).sow) || 'field_2154'; }
    catch (e2) { return 'field_2154'; }
  }
  function readRecords(viewKey) {
    var recs;
    try { recs = (ns.data && typeof ns.data.readRecords === 'function') ? ns.data.readRecords(viewKey) : []; }
    catch (e) { recs = []; }
    // A view that hides change orders never counts the records it does not
    // serve (sow-filter.js visibleRecords: CO-only line items).
    try {
      if (ns.sowFilter && typeof ns.sowFilter.visibleRecords === 'function') recs = ns.sowFilter.visibleRecords(viewKey, recs || []);
    } catch (e2) { /* unfiltered */ }
    return recs || [];
  }
  /** Per-SOW (per-bid) line-item counts + the unassigned count from the view's records. */
  function countBySow(viewKey) {
    var fk = connFieldKey(viewKey) + '_raw';
    var recs = readRecords(viewKey) || [];
    var counts = Object.create(null), blank = 0, total = 0;
    for (var i = 0; i < recs.length; i++) {
      var raw = recs[i] && recs[i][fk];
      total++;
      if (!Array.isArray(raw) || !raw.length) { blank++; continue; }
      for (var j = 0; j < raw.length; j++) {
        if (raw[j] && raw[j].id) counts[raw[j].id] = (counts[raw[j].id] || 0) + 1;
      }
    }
    return { counts: counts, blank: blank, total: total };
  }
  /** Items on `sowId` that another SOW (bid) also lists. */
  function sharedCount(viewKey, sowId) {
    var fk = connFieldKey(viewKey) + '_raw';
    var recs = readRecords(viewKey) || [];
    var cfg = ctxCfg(viewKey);
    var hideCo = !!(cfg && cfg.hideChangeOrders);
    var n = 0;
    for (var i = 0; i < recs.length; i++) {
      var raw = recs[i] && recs[i][fk];
      if (!Array.isArray(raw) || raw.length < 2) continue;
      var onThis = false, other = false;
      for (var j = 0; j < raw.length; j++) {
        if (!raw[j] || !raw[j].id) continue;
        if (raw[j].id === sowId) { onThis = true; continue; }
        // A change order the view does not serve is not "another scope" here.
        if (hideCo && isChangeOrderRef(raw[j], viewKey)) continue;
        other = true;
      }
      if (onThis && other) n++;
    }
    return n;
  }
  /** kind 'bid': status text / PDF presence (and a name fallback) off the
   *  BIDs grid (cfg.listView) for each listed bid. */
  function stampListMeta(sows, cfg) {
    if (!cfg || cfg.kind !== 'bid' || !cfg.listView) return;
    var rows = gridRows(cfg.listView);
    var byId = Object.create(null);
    for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].id) byId[rows[i].id] = rows[i];
    for (var k = 0; k < sows.length; k++) {
      var a = byId[sows[k].id];
      if (!a) continue;
      if (cfg.statusField) {
        var st = a[cfg.statusField + '_raw'] != null ? a[cfg.statusField + '_raw'] : a[cfg.statusField];
        sows[k].status = (st != null && typeof st !== 'object') ? stripHtml(st) : '';
      }
      if (cfg.pdfField) {
        var pr = a[cfg.pdfField + '_raw'];
        sows[k].hasPdf = !!((pr && typeof pr === 'object' && (pr.id || pr.url || pr.filename)) ||
                            (typeof pr === 'string' && pr) || stripHtml(a[cfg.pdfField]));
      }
      if (!sows[k].name && cfg.nameField) sows[k].name = stripHtml(a[cfg.nameField]);
    }
  }

  /** The project-page context: sows (with kind, idx, count), active ids, mode. */
  function projectInfo(viewKey, cfg) {
    var sf = ns.sowFilter;
    if (!sf || typeof sf.collectSowList !== 'function') return null;
    var sows = sf.collectSowList(viewKey) || [];
    if (!sows.length) return null;
    var tally = countBySow(viewKey);
    for (var i = 0; i < sows.length; i++) {
      sows[i].idx = i;
      sows[i].count = tally.counts[sows[i].id] || 0;
    }
    classify(sows, cfg.kind);
    stampListMeta(sows, cfg);
    var stored = (typeof sf.loadActive === 'function' ? sf.loadActive(viewKey) : []) || [];
    var real = [], all = false, blank = false;
    for (var a = 0; a < stored.length; a++) {
      if (stored[a] === ALL) all = true;
      else if (stored[a] === BLANK) blank = true;
      else real.push(stored[a]);
    }
    var byId = Object.create(null);
    for (var b = 0; b < sows.length; b++) byId[sows[b].id] = sows[b];
    var activeSows = [];
    for (var r = 0; r < real.length; r++) if (byId[real[r]]) activeSows.push(byId[real[r]]);
    var mode;
    if (activeSows.length === 1 && !blank) mode = 'single';
    else if (blank && !activeSows.length)  mode = 'blank';    // only the unassigned items
    else if (activeSows.length || blank)   mode = 'multi';
    else if (sows.length < 2)              mode = 'only';     // one scope / bid: nothing to choose, nothing mixed
    else if (all)                          mode = 'all';
    else                                   mode = cfg && cfg.requireChoice ? 'unchosen' : 'all';
    return { page: 'project', kind: cfg.kind, vocab: vocabOf(cfg.kind), sows: sows, active: activeSows,
             blankActive: blank, mode: mode, blankCount: tally.blank, total: tally.total };
  }

  // ── SOW page: the page's own SOW + its siblings ──────────────────────
  function modelAttrs(viewKey) {
    var v = window.Knack && Knack.views && Knack.views[viewKey];
    return (v && v.model && v.model.attributes) || null;
  }
  function gridRows(viewKey) {
    var v = window.Knack && Knack.views && Knack.views[viewKey];
    var models = (v && v.model && v.model.data && v.model.data.models) || [];
    var out = [];
    for (var i = 0; i < models.length; i++) if (models[i] && models[i].attributes) out.push(models[i].attributes);
    return out;
  }
  function sowFromAttrs(attrs, cfg) {
    if (!attrs || !attrs.id) return null;
    var idRaw = attrs[cfg.idField + '_raw'];
    var label = (idRaw != null && typeof idRaw !== 'object') ? String(idRaw) : stripHtml(attrs[cfg.idField]);
    var name  = stripHtml(attrs[cfg.nameField]);
    var type  = attrs[cfg.typeField + '_raw'] != null ? attrs[cfg.typeField + '_raw'] : attrs[cfg.typeField];
    return { id: attrs.id, label: label, name: name, isCo: isCoType(type) };
  }
  function sowPageInfo(viewKey, cfg) {
    var self = sowFromAttrs(modelAttrs(cfg.detailView), cfg);
    if (!self) return null;
    var sows = [self];
    var rows = cfg.siblingsView ? gridRows(cfg.siblingsView) : [];
    for (var i = 0; i < rows.length; i++) {
      var s = sowFromAttrs(rows[i], cfg);
      if (s && s.id !== self.id) sows.push(s);
    }
    classify(sows, 'sow');
    sows.sort(function (a, b) { return (a.num || 0) - (b.num || 0); });
    for (var k = 0; k < sows.length; k++) sows[k].idx = k;
    var recs = readRecords(viewKey) || [];
    self.count = recs.length;
    return { page: 'sow', kind: 'sow', vocab: VOCAB.sow, sows: sows, self: self, active: [self], mode: 'single', total: recs.length };
  }

  function info(viewKey) {
    var cfg = ctxCfg(viewKey);
    if (!cfg) return null;
    return cfg.page === 'sow' ? sowPageInfo(viewKey, cfg) : projectInfo(viewKey, cfg);
  }

  /** Short phrase for the scope strip's meta line ('' when there is no context to state). */
  function describe(viewKey) {
    var inf = info(viewKey);
    if (!inf) return '';
    var V = inf.vocab;
    function kindTail(s) { var t = kindLabel(V, s.kind); return t ? ' (' + t.toLowerCase() + ')' : ''; }
    if (inf.page === 'sow') {
      var self = inf.self;
      return 'on ' + token(self, V) + kindTail(self);
    }
    if (inf.mode === 'blank') return V.blankDescribe;
    if (inf.mode === 'only' || (inf.sows.length < 2 && inf.mode !== 'multi')) return '';
    if (inf.mode === 'single') {
      var s = inf.active[0];
      return 'on ' + token(s, V) + kindTail(s);
    }
    if (inf.mode === 'multi') {
      var toks = inf.active.map(function (x) { return token(x, V); });
      if (inf.blankActive) toks.push(V.blankTok);
      return 'across ' + toks.join(' + ') + ', mixed';
    }
    return 'across ' + inf.sows.length + ' ' + V.many + ', mixed';
  }

  // ── Rendering ─────────────────────────────────────────────────────────
  function dot(idx) {
    var c = (window.SCW && SCW.sowColor && typeof SCW.sowColor.dot === 'function') ? SCW.sowColor.dot(idx) : '#64748b';
    return '<span class="' + BAR_CLS + '-dot" style="background:' + c + '"></span>';
  }
  var LOCK_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var CO_VIEW_ONLY = 'view-only here — change-order items are edited on the change order\'s own page';
  function tabHtml(s, on, locksCo, V) {
    var viewOnly = locksCo && s.kind === 'co';
    var kl = kindLabel(V, s.kind);
    var nm = V.showName ? cleanName(s) : '';
    return '<button type="button" class="' + BAR_CLS + '-tab' + (on ? ' is-on' : '') + (viewOnly ? ' ' + BAR_CLS + '-tab--viewonly' : '') + '" ' +
      'data-scw-ws-v2-sowctx-tab="' + esc(s.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' +
      'title="' + esc(token(s, V) + (cleanName(s) ? ' — ' + cleanName(s) : '') + (kl ? ' · ' + kl : '') +
                     (s.status ? ' · ' + s.status : (s.hasPdf && V.status ? ' · Submitted' : '')) +
                     (viewOnly ? ' · ' + CO_VIEW_ONLY : '') +
                     ' · click: only this ' + V.one + ' · shift-click: add to the view') + '">' +
      dot(s.idx) + '<span class="' + BAR_CLS + '-tab-tok">' + esc(token(s, V)) + '</span>' +
      ((s.kind === 'alternate' || s.kind === 'co') && kl ? '<span class="' + BAR_CLS + '-tab-kind">' + esc(kl) + '</span>' : '') +
      (nm ? '<span class="' + BAR_CLS + '-tab-name">' + esc(nm) + '</span>' : '') +
      (viewOnly ? '<span class="' + BAR_CLS + '-lock" aria-label="View only">' + LOCK_SVG + '</span>' : '') +
      '<span class="' + BAR_CLS + '-tab-n">' + s.count + '</span>' +
    '</button>';
  }
  function tabsHtml(inf, viewKey) {
    var V = inf.vocab;
    var h = '<span class="' + BAR_CLS + '-tabs-label">' + esc(V.tabsLabel) + '</span>';
    var activeIds = Object.create(null);
    var locksCo = viewLocksCo(viewKey);
    for (var a = 0; a < inf.active.length; a++) activeIds[inf.active[a].id] = true;
    for (var i = 0; i < inf.sows.length; i++) h += tabHtml(inf.sows[i], inf.mode !== 'all' && !!activeIds[inf.sows[i].id], locksCo, V);
    if (inf.blankCount) {
      h += '<button type="button" class="' + BAR_CLS + '-tab ' + BAR_CLS + '-tab--blank' + (inf.blankActive ? ' is-on' : '') + '" ' +
        'data-scw-ws-v2-sowctx-tab="' + BLANK + '" aria-pressed="' + (inf.blankActive ? 'true' : 'false') + '" ' +
        'title="' + esc(V.blankTabTitle) + ' · click: only these · shift-click: add to the view">' +
        '<span class="' + BAR_CLS + '-tab-tok">' + esc(V.blankTab) + '</span><span class="' + BAR_CLS + '-tab-n">' + inf.blankCount + '</span></button>';
    }
    if (inf.sows.length > 1) {
      h += '<button type="button" class="' + BAR_CLS + '-tab ' + BAR_CLS + '-tab--all' + (inf.mode === 'all' ? ' is-on' : '') + '" ' +
        'data-scw-ws-v2-sowctx-tab="' + ALL + '" aria-pressed="' + (inf.mode === 'all' ? 'true' : 'false') + '" ' +
        'title="' + esc(V.allTitle) + '">' + esc(V.allTab) + '</button>';
    }
    return '<span class="' + BAR_CLS + '-tabs">' + h + '</span>';
  }
  function titleHtml(s, V) {
    var nm = cleanName(s);
    return dot(s.idx) +
      '<span class="' + BAR_CLS + '-tok">' + esc(token(s, V)) + '</span>' +
      (nm ? '<span class="' + BAR_CLS + '-name">' + esc(nm) + '</span>' : '') +
      badge(s.kind, V) + statusBadge(s, V);
  }
  function siblingsText(inf, self) {
    var V = inf.vocab;
    var others = [];
    for (var i = 0; i < inf.sows.length; i++) {
      if (inf.sows[i].id === self.id) continue;
      var o = inf.sows[i];
      var kl = kindLabel(V, o.kind);
      others.push(token(o, V) + (kl ? ' (' + kl + ')' : ''));
    }
    return others.length ? ' · also on this project: ' + others.join(', ') : '';
  }

  function barHtml(inf, viewKey) {
    var V = inf.vocab;
    var h = '';
    if (inf.page === 'sow') {
      var self = inf.self;
      h += '<span class="' + BAR_CLS + '-eyebrow">' + esc(V.eyebrow) + '</span>' +
        '<span class="' + BAR_CLS + '-title">' + titleHtml(self, V) + '</span>' +
        '<span class="' + BAR_CLS + '-meta">' + inf.total + ' line ' + plural(inf.total, 'item') +
          (inf.sows.length > 1 ? ' · 1 of ' + inf.sows.length + ' scopes on this project' + esc(siblingsText(inf, self)) : ' · the only scope on this project') +
        '</span>';
      return h;
    }
    if (inf.mode === 'single') {
      var s = inf.active[0];
      var shared = sharedCount(viewKey, s.id);
      var coView = s.kind === 'co' && viewLocksCo(viewKey);
      var others = inf.sows.length - 1;
      h += '<span class="' + BAR_CLS + '-eyebrow">' + (coView ? 'Viewing' : 'Working on') + '</span>' +
        '<span class="' + BAR_CLS + '-title">' + titleHtml(s, V) +
          (coView ? '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--viewonly">' + LOCK_SVG + ' View only</span>' : '') + '</span>' +
        '<span class="' + BAR_CLS + '-meta">' + s.count + ' line ' + plural(s.count, 'item') +
          (shared ? ' · ' + shared + ' also on another ' + esc(V.one) : '') +
          (others > 0 ? ' · ' + others + ' other ' + esc(plural(others, V.one, V.many)) + ' hidden' : '') +
          (coView ? ' · ' + esc(CO_VIEW_ONLY) : '') +
        '</span>';
    } else if (inf.mode === 'blank') {
      h += '<span class="' + BAR_CLS + '-eyebrow">Showing</span>' +
        '<span class="' + BAR_CLS + '-title"><span class="' + BAR_CLS + '-tok">' + esc(V.blankTitle) + '</span>' +
          '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--blank">' + esc(V.blankBadge) + '</span></span>' +
        '<span class="' + BAR_CLS + '-meta">' + inf.blankCount + ' line ' + plural(inf.blankCount, 'item') +
          ' ' + esc(V.blankMeta) + ' · ' + esc(V.hintTab) + '</span>';
    } else if (inf.mode === 'multi') {
      var parts = inf.active.map(function (x) { return token(x, V) + ' (' + x.count + ')'; });
      if (inf.blankActive) parts.push(V.blankTok + ' (' + inf.blankCount + ')');
      h += '<span class="' + BAR_CLS + '-eyebrow">Showing</span>' +
        '<span class="' + BAR_CLS + '-title"><span class="' + BAR_CLS + '-tok">' + esc(parts.join(' · ')) + '</span>' +
          '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--mixed">Mixed</span></span>' +
        '<span class="' + BAR_CLS + '-meta">counts and totals combine these ' + esc(V.many) + ' · ' + esc(V.hintTab) + '</span>';
    } else if (inf.mode === 'only' || inf.sows.length === 1) {
      // One scope / bid here: nothing to choose, just say which it is.
      h += '<span class="' + BAR_CLS + '-eyebrow">' + esc(V.eyebrow) + '</span>' +
        '<span class="' + BAR_CLS + '-title">' + titleHtml(inf.sows[0], V) + '</span>' +
        '<span class="' + BAR_CLS + '-meta">' + inf.total + ' line ' + plural(inf.total, 'item') + ' · the only ' + esc(V.one) + ' ' + esc(V.ofWhat) + '</span>';
    } else {
      var all = inf.sows.map(function (x) { return token(x, V) + ' (' + x.count + ')'; });
      h += '<span class="' + BAR_CLS + '-eyebrow">Showing</span>' +
        '<span class="' + BAR_CLS + '-title"><span class="' + BAR_CLS + '-tok">All ' + inf.sows.length + ' ' + esc(V.many) + '</span>' +
          '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--mixed">Mixed</span></span>' +
        '<span class="' + BAR_CLS + '-meta">' + esc(all.join(' · ')) +
          ' · counts and totals combine every ' + esc(V.one) + ' · ' + esc(V.hintTab) + '</span>';
    }
    if (inf.sows.length > 1 || inf.blankCount) h += tabsHtml(inf, viewKey);
    return h;
  }

  function chooserHtml(inf, viewKey) {
    var V = inf.vocab;
    var locksCo = viewLocksCo(viewKey);
    var h = '<div class="' + BAR_CLS + '-chooser" role="group" aria-label="' + esc('Choose the ' + (V.kind === 'bid' ? 'bid' : 'scope of work')) + '">' +
      '<div class="' + BAR_CLS + '-chooser-q">' + esc(V.chooserQ) + '</div>' +
      '<div class="' + BAR_CLS + '-chooser-sub">' + esc(V.chooserSub(inf.sows.length)) + '</div>' +
      '<div class="' + BAR_CLS + '-chooser-opts">';
    for (var i = 0; i < inf.sows.length; i++) {
      var s = inf.sows[i];
      var nm = cleanName(s);
      h += '<button type="button" class="' + BAR_CLS + '-opt" data-scw-ws-v2-sowctx-choose="' + esc(s.id) + '">' +
        '<span class="' + BAR_CLS + '-opt-head">' + dot(s.idx) + '<span class="' + BAR_CLS + '-tok">' + esc(token(s, V)) + '</span>' + badge(s.kind, V) + statusBadge(s, V) + '</span>' +
        (nm ? '<span class="' + BAR_CLS + '-opt-name">' + esc(nm) + '</span>' : '') +
        '<span class="' + BAR_CLS + '-opt-n">' + s.count + ' line ' + plural(s.count, 'item') +
          (locksCo && s.kind === 'co' ? ' · view only here' : '') + '</span>' +
      '</button>';
    }
    h += '</div>' +
      '<button type="button" class="' + BAR_CLS + '-chooser-all" data-scw-ws-v2-sowctx-choose="' + ALL + '">' +
        esc(V.chooserAll(inf.sows.length)) + '</button>' +
    '</div>';
    return h;
  }

  // position:sticky resolves against the nearest ancestor whose overflow is
  // anything but visible — and KTL wraps every view in section.ktlBoxWithBorder
  // { overflow: hidden }. Inside such a box the bar can never reach the
  // viewport, and a top offset only shoves it DOWN by that many pixels from
  // the top of the box, over whatever sits beneath it. 2026-10-12: a re-mount
  // after the project bar had pinned read its 48px and the worksheet toolbar
  // vanished under the scope bar (only the add buttons' top edge showed). So
  // the offset applies only when every ancestor lets sticky through.
  function canStickToViewport(el) {
    var p = el && el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      var cs = null;
      try { cs = window.getComputedStyle(p); } catch (e) { cs = null; }
      if (cs) {
        var o = (cs.overflow || '') + ' ' + (cs.overflowX || '') + ' ' + (cs.overflowY || '');
        if (/\b(hidden|scroll|auto|overlay)\b/.test(o)) return false;
      }
      p = p.parentElement;
    }
    return true;
  }
  function stickyTop(bar) {
    if (bar && !canStickToViewport(bar)) return 0;
    var pinned = document.getElementById('scw-phn-bar');
    return pinned ? Math.round(pinned.getBoundingClientRect().height || 48) : 0;
  }

  /** Render (or refresh) the bar for a view. Idempotent; call after each render. */
  function mount(viewKey) {
    var cfg = ctxCfg(viewKey);
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;
    var bar = container.querySelector(':scope > .' + BAR_CLS);
    var inf = cfg ? info(viewKey) : null;
    if (!inf) {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
      container.classList.remove('scw-ws-v2--sowctx', 'scw-ws-v2--sow-unchosen', 'scw-ws-v2--sow-mixed', 'scw-ws-v2--sow-blank');
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.className = BAR_CLS;
      container.insertBefore(bar, container.firstChild);
    }
    container.classList.add('scw-ws-v2--sowctx');
    container.classList.toggle('scw-ws-v2--sow-unchosen', inf.mode === 'unchosen');
    container.classList.toggle('scw-ws-v2--sow-mixed', inf.mode === 'all' || inf.mode === 'multi');
    container.classList.toggle('scw-ws-v2--sow-blank', inf.mode === 'blank');
    bar.className = BAR_CLS + ' ' + BAR_CLS + '--' + inf.mode + ' ' + BAR_CLS + '--' + inf.page + ' ' + BAR_CLS + '--kind-' + inf.kind;
    bar.setAttribute('data-scw-ws-v2-sowctx-view', viewKey);
    bar.setAttribute('data-scw-ws-v2-sowctx-mode', inf.mode);
    bar.setAttribute('data-scw-ws-v2-sowctx-kind', inf.kind);
    bar.style.setProperty('--scw-sowctx-top', stickyTop(bar) + 'px');
    var html = '<div class="' + BAR_CLS + '-row">' + barHtml(inf, viewKey) + '</div>';
    if (inf.mode === 'unchosen') html += chooserHtml(inf, viewKey);
    if (bar.innerHTML !== html) bar.innerHTML = html;
    bind();
  }

  /** Apply a selection through the SOW / Bid filter (it re-renders and re-mounts the bar). */
  function choose(viewKey, ids) {
    if (!ns.sowFilter || typeof ns.sowFilter.setActive !== 'function') return;
    ns.sowFilter.setActive(viewKey, ids);
  }

  var _bound = false;
  function bind() {
    if (_bound) return;
    _bound = true;
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-scw-ws-v2-sowctx-tab], [data-scw-ws-v2-sowctx-choose]');
      if (!t) return;
      var bar = t.closest('.' + BAR_CLS);
      var viewKey = bar && bar.getAttribute('data-scw-ws-v2-sowctx-view');
      if (!viewKey) return;
      e.preventDefault();
      var id = t.getAttribute('data-scw-ws-v2-sowctx-tab') || t.getAttribute('data-scw-ws-v2-sowctx-choose');
      if (id === ALL) { choose(viewKey, [ALL]); return; }
      // Only ids the page lists right now ride along: a stored id the list
      // lacks at this instant is kept in storage by the filter (sow-filter.js
      // mount, 2026-10-22) but never folded into a new choice.
      var listed = Object.create(null);
      listed[BLANK] = true;
      var listNow = (ns.sowFilter && typeof ns.sowFilter.collectSowList === 'function') ? (ns.sowFilter.collectSowList(viewKey) || []) : [];
      for (var li = 0; li < listNow.length; li++) listed[listNow[li].id] = true;
      var current = (ns.sowFilter && ns.sowFilter.loadActive(viewKey) || []).filter(function (x) { return x !== ALL && listed[x]; });
      var additive = !!(e.shiftKey || e.metaKey || e.ctrlKey) && t.hasAttribute('data-scw-ws-v2-sowctx-tab');
      var next;
      if (additive) {
        next = current.slice();
        var at = next.indexOf(id);
        if (at === -1) next.push(id); else next.splice(at, 1);
        if (!next.length) next = [ALL];
      } else {
        next = [id];
      }
      choose(viewKey, next);
    }, true);
  }

  // Re-render the bar when its source views (re)load: the SOW page's detail /
  // siblings grids, the survey page's BIDs grid (names, status, PDF).
  function bindSources() {
    var views = (ns.CONFIG && ns.CONFIG.views) || [];
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (!v || !v.enabled || !v.sowContext) continue;
      var srcs = [v.sowContext.detailView, v.sowContext.siblingsView, v.sowContext.listView];
      for (var k = 0; k < srcs.length; k++) {
        if (!srcs[k] || !window.SCW || typeof SCW.onViewRender !== 'function') continue;
        (function (worksheetKey, srcKey) {
          SCW.onViewRender(srcKey, function () { try { mount(worksheetKey); } catch (e) { /* ignore */ } }, '.scwWsV2SowCtx');
        })(v.sourceViewKey, srcs[k]);
      }
    }
  }
  try { bindSources(); } catch (e) { /* config not ready */ }

  ns.sowContext = {
    mount:            mount,
    info:             info,
    describe:         describe,
    classify:         classify,
    parseSow:         parseSow,
    parseRef:         parseRef,
    vocab:            vocabOf,
    isChangeOrderRef: isChangeOrderRef,
    canStickToViewport: canStickToViewport,
    ALL:              ALL
  };
})();
/*** END WORKSHEET V2 — SOW CONTEXT *******************************************/
