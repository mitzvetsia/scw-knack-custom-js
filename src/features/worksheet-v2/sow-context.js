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
 *
 * Badge rule — no Builder field marks an alternate, so: among the project's
 * non-change-order SOWs the LOWEST SW number is the Original and every other
 * one an Alternate; an identifier ending in CO (or field_2952 = change order
 * where the SOW grid loads it) is a Change order and never an alternate.
 *
 * Config (worksheet-v2/config.js per view):
 *   sowContext: { requireChoice: true }                       // project page
 *   sowContext: { page: 'sow', detailView: 'view_3827',
 *                 siblingsView: 'view_3869' }                  // SOW page
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

  function ctxCfg(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' ? ns.cfg.viewCfg(viewKey) : null;
      var c = vc && vc.sowContext;
      if (!c) return null;
      return {
        page:         c.page || 'project',
        requireChoice: !!c.requireChoice,
        detailView:   c.detailView || '',
        siblingsView: c.siblingsView || '',
        idField:      c.idField   || 'field_2122',
        nameField:    c.nameField || 'field_2126',
        typeField:    c.typeField || 'field_2952'
      };
    } catch (e) { return null; }
  }

  // ── SOW identity ─────────────────────────────────────────────────────
  /** "SW-1589" / "60486704913-SW1589CO" / "SW1589 - Alternate …" → number + CO
   *  flag. The SOW connection identifier is usually the BARE number ("1628",
   *  "1926CO" — what the pills and card chips show), so a label or name that
   *  starts with a bare number parses too. */
  var SW_RE   = /\bSW-?(\d+)\s*(CO)?\b/i;
  var BARE_RE = /^\s*(\d{2,6})\s*(CO)?(?:\s*$|\s*[-–—:·(])/i;
  function parseSow(label, name) {
    var m = String(label || '').match(SW_RE) || String(name || '').match(SW_RE) ||
            String(label || '').match(BARE_RE) || String(name || '').match(BARE_RE);
    return { num: m ? parseInt(m[1], 10) : NaN, isCo: !!(m && m[2]) };
  }
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
      var list = (sf && typeof sf.collectSowList === 'function') ? sf.collectSowList(viewKey) : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && (list[i].isCo || parseSow(list[i].label, list[i].name).isCo)) set[list[i].id] = true;
      }
    } catch (e) { /* no grid */ }
    _coCache = { key: viewKey, at: now, set: set };
    return set;
  }
  function isCoType(typeText) { return /change\s*order/i.test(stripHtml(typeText)); }
  /** Stamp kind ('original' | 'alternate' | 'co' | 'other') on each SOW. */
  function classify(sows) {
    var lowest = Infinity;
    var i, s;
    for (i = 0; i < sows.length; i++) {
      s = sows[i];
      var p = parseSow(s.label, s.name);
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
  var KIND_LABEL = { original: 'Original', alternate: 'Alternate', co: 'Change order', other: '' };
  function badge(kind) {
    var t = KIND_LABEL[kind];
    return t ? '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--' + kind + '">' + t + '</span>' : '';
  }
  /** Short token for prose: the bare identifier as the app shows it ("1628",
   *  "1926CO"), else "SW1589" when the label carries more (a deal-prefixed id). */
  function token(s) {
    var label = stripHtml(s.label || '');
    if (/^\s*\d+\s*(CO)?\s*$/i.test(label)) return label.replace(/\s+/g, '');
    if (!isNaN(s.num)) return 'SW' + s.num + (s.kind === 'co' ? 'CO' : '');
    return label || stripHtml(s.name || '');
  }
  /** Name without a leading SW / bare-number token (field_2126 often starts with it). */
  function cleanName(s) {
    var n = stripHtml(s.name || '');
    n = n.replace(/^\s*(SW-?)?\d+\s*(CO)?\s*[-–—:·]?\s*/i, '').trim();
    if (/^\d+\s*(CO)?$/i.test(n)) n = '';
    return n;
  }
  function viewLocksCo(viewKey) {
    try {
      var vc = ns.cfg && typeof ns.cfg.viewCfg === 'function' ? ns.cfg.viewCfg(viewKey) : null;
      return !!(vc && vc.coItemsReadOnly);
    } catch (e) { return false; }
  }

  // ── Project page: the SOW filter's selection is the context ─────────
  function sowFieldKey(viewKey) {
    try { return (ns.cfg && ns.cfg.fields(viewKey).sow) || 'field_2154'; }
    catch (e) { return 'field_2154'; }
  }
  function readRecords(viewKey) {
    try { return (ns.data && typeof ns.data.readRecords === 'function') ? ns.data.readRecords(viewKey) : []; }
    catch (e) { return []; }
  }
  /** Per-SOW line-item counts + the no-SOW count from the view's records. */
  function countBySow(viewKey) {
    var fk = sowFieldKey(viewKey) + '_raw';
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
  /** Items on `sowId` that another SOW also lists. */
  function sharedCount(viewKey, sowId) {
    var fk = sowFieldKey(viewKey) + '_raw';
    var recs = readRecords(viewKey) || [];
    var n = 0;
    for (var i = 0; i < recs.length; i++) {
      var raw = recs[i] && recs[i][fk];
      if (!Array.isArray(raw) || raw.length < 2) continue;
      for (var j = 0; j < raw.length; j++) if (raw[j] && raw[j].id === sowId) { n++; break; }
    }
    return n;
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
    classify(sows);
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
    else if (blank && !activeSows.length)  mode = 'blank';    // only the no-SOW items
    else if (activeSows.length || blank)   mode = 'multi';
    else if (all || sows.length < 2)       mode = 'all';
    else                                   mode = cfg && cfg.requireChoice ? 'unchosen' : 'all';
    return { page: 'project', sows: sows, active: activeSows, blankActive: blank,
             mode: mode, blankCount: tally.blank, total: tally.total };
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
    classify(sows);
    sows.sort(function (a, b) { return (a.num || 0) - (b.num || 0); });
    for (var k = 0; k < sows.length; k++) sows[k].idx = k;
    var recs = readRecords(viewKey) || [];
    self.count = recs.length;
    return { page: 'sow', sows: sows, self: self, active: [self], mode: 'single', total: recs.length };
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
    if (inf.page === 'sow') {
      var self = inf.self;
      return 'on ' + token(self) + (KIND_LABEL[self.kind] ? ' (' + KIND_LABEL[self.kind].toLowerCase() + ')' : '');
    }
    if (inf.sows.length < 2 && inf.mode !== 'multi') return '';
    if (inf.mode === 'single') {
      var s = inf.active[0];
      return 'on ' + token(s) + (KIND_LABEL[s.kind] ? ' (' + KIND_LABEL[s.kind].toLowerCase() + ')' : '');
    }
    if (inf.mode === 'blank') return 'with no SOW designated';
    if (inf.mode === 'multi') {
      var toks = inf.active.map(token);
      if (inf.blankActive) toks.push('no SOW');
      return 'across ' + toks.join(' + ') + ', mixed';
    }
    return 'across ' + inf.sows.length + ' scopes, mixed';
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
  function tabHtml(s, on, locksCo) {
    var viewOnly = locksCo && s.kind === 'co';
    return '<button type="button" class="' + BAR_CLS + '-tab' + (on ? ' is-on' : '') + (viewOnly ? ' ' + BAR_CLS + '-tab--viewonly' : '') + '" ' +
      'data-scw-ws-v2-sowctx-tab="' + esc(s.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' +
      'title="' + esc(token(s) + (cleanName(s) ? ' — ' + cleanName(s) : '') + (KIND_LABEL[s.kind] ? ' · ' + KIND_LABEL[s.kind] : '') +
                     (viewOnly ? ' · ' + CO_VIEW_ONLY : '') +
                     ' · click: only this scope · shift-click: add to the view') + '">' +
      dot(s.idx) + '<span class="' + BAR_CLS + '-tab-tok">' + esc(token(s)) + '</span>' +
      (s.kind === 'alternate' || s.kind === 'co' ? '<span class="' + BAR_CLS + '-tab-kind">' + esc(KIND_LABEL[s.kind]) + '</span>' : '') +
      (viewOnly ? '<span class="' + BAR_CLS + '-lock" aria-label="View only">' + LOCK_SVG + '</span>' : '') +
      '<span class="' + BAR_CLS + '-tab-n">' + s.count + '</span>' +
    '</button>';
  }
  function tabsHtml(inf, viewKey) {
    var h = '<span class="' + BAR_CLS + '-tabs-label">Scope</span>';
    var activeIds = Object.create(null);
    var locksCo = viewLocksCo(viewKey);
    for (var a = 0; a < inf.active.length; a++) activeIds[inf.active[a].id] = true;
    for (var i = 0; i < inf.sows.length; i++) h += tabHtml(inf.sows[i], inf.mode !== 'all' && !!activeIds[inf.sows[i].id], locksCo);
    if (inf.blankCount) {
      h += '<button type="button" class="' + BAR_CLS + '-tab ' + BAR_CLS + '-tab--blank' + (inf.blankActive ? ' is-on' : '') + '" ' +
        'data-scw-ws-v2-sowctx-tab="' + BLANK + '" aria-pressed="' + (inf.blankActive ? 'true' : 'false') + '" ' +
        'title="Line items on no SOW · click: only these · shift-click: add to the view">' +
        '<span class="' + BAR_CLS + '-tab-tok">(no SOW)</span><span class="' + BAR_CLS + '-tab-n">' + inf.blankCount + '</span></button>';
    }
    if (inf.sows.length > 1) {
      h += '<button type="button" class="' + BAR_CLS + '-tab ' + BAR_CLS + '-tab--all' + (inf.mode === 'all' ? ' is-on' : '') + '" ' +
        'data-scw-ws-v2-sowctx-tab="' + ALL + '" aria-pressed="' + (inf.mode === 'all' ? 'true' : 'false') + '" ' +
        'title="Every scope\'s items together — counts and totals combine them">All · mixed</button>';
    }
    return '<span class="' + BAR_CLS + '-tabs">' + h + '</span>';
  }
  function titleHtml(s) {
    var nm = cleanName(s);
    return dot(s.idx) +
      '<span class="' + BAR_CLS + '-tok">' + esc(token(s)) + '</span>' +
      (nm ? '<span class="' + BAR_CLS + '-name">' + esc(nm) + '</span>' : '') +
      badge(s.kind);
  }
  function siblingsText(inf, self) {
    var others = [];
    for (var i = 0; i < inf.sows.length; i++) {
      if (inf.sows[i].id === self.id) continue;
      var o = inf.sows[i];
      others.push(token(o) + (KIND_LABEL[o.kind] ? ' (' + KIND_LABEL[o.kind] + ')' : ''));
    }
    return others.length ? ' · also on this project: ' + others.join(', ') : '';
  }

  function barHtml(inf, viewKey) {
    var h = '';
    if (inf.page === 'sow') {
      var self = inf.self;
      h += '<span class="' + BAR_CLS + '-eyebrow">Scope of work</span>' +
        '<span class="' + BAR_CLS + '-title">' + titleHtml(self) + '</span>' +
        '<span class="' + BAR_CLS + '-meta">' + inf.total + ' line ' + plural(inf.total, 'item') +
          (inf.sows.length > 1 ? ' · 1 of ' + inf.sows.length + ' scopes on this project' + esc(siblingsText(inf, self)) : ' · the only scope on this project') +
        '</span>';
      return h;
    }
    if (inf.mode === 'single') {
      var s = inf.active[0];
      var shared = sharedCount(viewKey, s.id);
      var coView = s.kind === 'co' && viewLocksCo(viewKey);
      h += '<span class="' + BAR_CLS + '-eyebrow">' + (coView ? 'Viewing' : 'Working on') + '</span>' +
        '<span class="' + BAR_CLS + '-title">' + titleHtml(s) +
          (coView ? '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--viewonly">' + LOCK_SVG + ' View only</span>' : '') + '</span>' +
        '<span class="' + BAR_CLS + '-meta">' + s.count + ' line ' + plural(s.count, 'item') +
          (shared ? ' · ' + shared + ' also on another scope' : '') +
          (inf.sows.length > 1 ? ' · ' + (inf.sows.length - 1) + ' other ' + plural(inf.sows.length - 1, 'scope') + ' hidden' : '') +
          (coView ? ' · ' + esc(CO_VIEW_ONLY) : '') +
        '</span>';
    } else if (inf.mode === 'blank') {
      h += '<span class="' + BAR_CLS + '-eyebrow">Showing</span>' +
        '<span class="' + BAR_CLS + '-title"><span class="' + BAR_CLS + '-tok">No SOW designated</span>' +
          '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--blank">Unassigned</span></span>' +
        '<span class="' + BAR_CLS + '-meta">' + inf.blankCount + ' line ' + plural(inf.blankCount, 'item') +
          ' on no scope of work — not on any proposal until a SOW is set · click a scope tab to work on one</span>';
    } else if (inf.mode === 'multi') {
      var parts = inf.active.map(function (x) { return token(x) + ' (' + x.count + ')'; });
      if (inf.blankActive) parts.push('no SOW (' + inf.blankCount + ')');
      h += '<span class="' + BAR_CLS + '-eyebrow">Showing</span>' +
        '<span class="' + BAR_CLS + '-title"><span class="' + BAR_CLS + '-tok">' + esc(parts.join(' · ')) + '</span>' +
          '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--mixed">Mixed</span></span>' +
        '<span class="' + BAR_CLS + '-meta">counts and totals combine these scopes · click a scope tab to work on one</span>';
    } else if (inf.sows.length === 1) {
      // One scope on the project: nothing to choose, just say which it is.
      h += '<span class="' + BAR_CLS + '-eyebrow">Scope of work</span>' +
        '<span class="' + BAR_CLS + '-title">' + titleHtml(inf.sows[0]) + '</span>' +
        '<span class="' + BAR_CLS + '-meta">' + inf.total + ' line ' + plural(inf.total, 'item') + ' · the only scope on this project</span>';
    } else {
      var all = inf.sows.map(function (x) { return token(x) + ' (' + x.count + ')'; });
      h += '<span class="' + BAR_CLS + '-eyebrow">Showing</span>' +
        '<span class="' + BAR_CLS + '-title"><span class="' + BAR_CLS + '-tok">All ' + inf.sows.length + ' scopes</span>' +
          '<span class="' + BAR_CLS + '-badge ' + BAR_CLS + '-badge--mixed">Mixed</span></span>' +
        '<span class="' + BAR_CLS + '-meta">' + esc(all.join(' · ')) +
          ' · counts and totals combine every scope · click a scope tab to work on one</span>';
    }
    if (inf.sows.length > 1 || inf.blankCount) h += tabsHtml(inf, viewKey);
    return h;
  }

  function chooserHtml(inf, viewKey) {
    var locksCo = viewLocksCo(viewKey);
    var h = '<div class="' + BAR_CLS + '-chooser" role="group" aria-label="Choose the scope of work">' +
      '<div class="' + BAR_CLS + '-chooser-q">Which scope of work are you working on?</div>' +
      '<div class="' + BAR_CLS + '-chooser-sub">This project has ' + inf.sows.length + ' scopes and this page holds all of their line items. ' +
        'Pick one so counts, totals and edits stay in the right scope.</div>' +
      '<div class="' + BAR_CLS + '-chooser-opts">';
    for (var i = 0; i < inf.sows.length; i++) {
      var s = inf.sows[i];
      var nm = cleanName(s);
      h += '<button type="button" class="' + BAR_CLS + '-opt" data-scw-ws-v2-sowctx-choose="' + esc(s.id) + '">' +
        '<span class="' + BAR_CLS + '-opt-head">' + dot(s.idx) + '<span class="' + BAR_CLS + '-tok">' + esc(token(s)) + '</span>' + badge(s.kind) + '</span>' +
        (nm ? '<span class="' + BAR_CLS + '-opt-name">' + esc(nm) + '</span>' : '') +
        '<span class="' + BAR_CLS + '-opt-n">' + s.count + ' line ' + plural(s.count, 'item') +
          (locksCo && s.kind === 'co' ? ' · view only here' : '') + '</span>' +
      '</button>';
    }
    h += '</div>' +
      '<button type="button" class="' + BAR_CLS + '-chooser-all" data-scw-ws-v2-sowctx-choose="' + ALL + '">' +
        'Show all ' + inf.sows.length + ' scopes together (mixed counts)</button>' +
    '</div>';
    return h;
  }

  function stickyTop() {
    var bar = document.getElementById('scw-phn-bar');
    return bar ? Math.round(bar.getBoundingClientRect().height || 48) : 0;
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
      container.classList.remove('scw-ws-v2--sowctx', 'scw-ws-v2--sow-unchosen', 'scw-ws-v2--sow-mixed');
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
    bar.className = BAR_CLS + ' ' + BAR_CLS + '--' + inf.mode + ' ' + BAR_CLS + '--' + inf.page;
    bar.setAttribute('data-scw-ws-v2-sowctx-view', viewKey);
    bar.setAttribute('data-scw-ws-v2-sowctx-mode', inf.mode);
    bar.style.setProperty('--scw-sowctx-top', stickyTop() + 'px');
    var html = '<div class="' + BAR_CLS + '-row">' + barHtml(inf, viewKey) + '</div>';
    if (inf.mode === 'unchosen') html += chooserHtml(inf, viewKey);
    if (bar.innerHTML !== html) bar.innerHTML = html;
    bind();
  }

  /** Apply a selection through the SOW filter (it re-renders and re-mounts the bar). */
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
      var current = (ns.sowFilter && ns.sowFilter.loadActive(viewKey) || []).filter(function (x) { return x !== ALL; });
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

  // Re-render the SOW-page bar when its detail / siblings views (re)load.
  function bindSources() {
    var views = (ns.CONFIG && ns.CONFIG.views) || [];
    for (var i = 0; i < views.length; i++) {
      var v = views[i];
      if (!v || !v.enabled || !v.sowContext) continue;
      var srcs = [v.sowContext.detailView, v.sowContext.siblingsView];
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
    isChangeOrderRef: isChangeOrderRef,
    ALL:              ALL
  };
})();
/*** END WORKSHEET V2 — SOW CONTEXT *******************************************/
