/*** BID REVIEW V2 — HEADER REWORK (SOW tabs · status line · column cards) ***
 *
 * The top of the reconcile-bids page, reworked (design: canvas "Worksheet
 * Scope Summary", boards 7–9, 2026-10-09). One band, one party:
 *
 *   SOW tabs      one SOW at a time — number + Original / Alternate / Change
 *                 order badge, the full SOW name (rename from the ✎ on the
 *                 active tab), the scope counts, the review state. The
 *                 synthetic "no matching SOW" grid is the "Unmatched bid
 *                 items" tab. The choice persists per scene + project.
 *   status line   the old navy SOW header, restyled: a "Scope summary ▸"
 *                 disclosure (the worksheet scope strip for this SOW) and the
 *                 aggregate warning chips. Status only, never an action.
 *   column cards  the four head bands (title / totals / details / actions)
 *                 re-read as one card per column with four aligned slots —
 *                 who · money · workflow · actions. SCW's card: the basis
 *                 picker (moved from the diff bar), survey costs, margin,
 *                 proposal, then "Next step": the review state (mirrored
 *                 from the diff bar's readiness) ahead of Preview Proposal.
 *                 Each sub's card: a radio that sets it as the basis, the
 *                 BASIS badge and basis-filter's "Show all bids (+N)" pill,
 *                 its total with "$X off the SOW" (never good news, whichever
 *                 way it differs) or "✓ matches the SOW", status · PDF ·
 *                 Reopen Bid, the gap count (basis card), and "N change
 *                 requests queued for <sub>" over "Review & send to <sub>"
 *                 (today's Preview Change Request modal — Cancel | Submit at
 *                 its foot — is the one path to sending) plus a ⋮ menu with
 *                 the rest (set as basis, open the PDF, request changes on
 *                 selected rows, discard the queued requests, update SOW to
 *                 match / create a SOW from this bid).
 *   documents     stays its own row under the cards, above the line items
 *                 (card.js already mounts it there); the Line item / Photos
 *                 labels sit in a thin row directly above the rows, which
 *                 also names each column (card.js buildColLabelsRow).
 *
 * Nothing from the line items moves up, and no handler is reinvented: the
 * existing buttons are MOVED (same classes + data-action, so init.js's
 * delegated click still routes them to v1), the diff bar's <select> is
 * moved into SCW's card and the card radios drive it (one change event, so
 * sub-bid-diff persists field_2942 and basis-filter repaints exactly as for
 * a dropdown pick), and the readiness / gap pills are MIRRORS of the diff
 * bar's own (a MutationObserver re-syncs them when it re-renders). The diff
 * bar keeps its fold handle; its exceptions list + reviewer note are as they
 * were.
 *
 * Kill switch: CONFIG.headerRework (config.js). Off → nothing here runs and
 * the page renders as before.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  var CLS      = 'scw-bid-review-v2';
  var STYLE_ID = 'scw-bid-review-v2-header-css';
  var K1_ID    = 'K1';
  var NO_SOW   = (ns.transform && ns.transform.NO_SOW) || '__no_sow__';
  // The worksheet-v2 config key for the SOW line items this grid reads
  // (view_3921) — only used to resolve the proposal-bucket ids for the counts.
  var SCOPE_VIEW = 'view_3921';
  var DOTS = ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0891b2'];

  function enabled() {
    return !!(ns.CONFIG && ns.CONFIG.enabled !== false && ns.CONFIG.headerRework);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
  function container() { return document.getElementById(ns.CONFIG && ns.CONFIG.mountId); }
  function sceneId() {
    var m = (document.body && document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }
  /** The project this page is about — the route's project-dashboard segment,
   *  else its last 24-hex segment — so one project's tab choice never carries
   *  to the next project. */
  function projectId() {
    var hash = (window.location.hash || '').split('?')[0];
    var m = hash.match(/project-dashboard\/([a-f0-9]{24})/i);
    if (m) return m[1];
    var all = hash.match(/[a-f0-9]{24}/ig);
    return (all && all[all.length - 1]) || '';
  }
  function storeKey() { return 'scw:br-v2:sow-tab:' + sceneId() + ':' + projectId(); }
  function storedActive() {
    try { return localStorage.getItem(storeKey()) || ''; } catch (e) { return ''; }
  }
  function storeActive(id) {
    try { if (id) localStorage.setItem(storeKey(), id); else localStorage.removeItem(storeKey()); }
    catch (e) { /* private mode */ }
  }

  // ── Readers ────────────────────────────────────────────────────────────
  function v1() { return window.SCW && window.SCW.bidReview; }
  function sbd() {
    var s = window.SCW && window.SCW.subBidDiff;
    return (s && s.render) || null;
  }
  function wsv2() { return window.SCW && window.SCW.worksheetV2; }
  function gridFor(sowId) {
    var st = ns.builtState;
    var grids = (st && st.sowGrids) || [];
    for (var i = 0; i < grids.length; i++) if (grids[i] && grids[i].sowId === sowId) return grids[i];
    return null;
  }
  function basisOf(sowId) {
    var r = sbd();
    if (r && typeof r.basisFor === 'function') {
      try { return r.basisFor(sowId) || ''; } catch (e) { /* fall through */ }
    }
    if (ns.basisFilter && typeof ns.basisFilter.basisOf === 'function') {
      try { return ns.basisFilter.basisOf(sowId) || ''; } catch (e2) { /* none */ }
    }
    return '';
  }
  function friendlyName(sowId) {
    var r = v1();
    if (r && typeof r.sowFriendlyName === 'function') {
      try { return stripHtml(r.sowFriendlyName(sowId) || ''); } catch (e) { /* none */ }
    }
    return '';
  }
  /** The SOW's Type (field_2952, change order) when the next-step grid
   *  carries the column — else '' and the CO suffix decides. */
  function sowTypeText(sowId) {
    var cfg = v1() && v1().CONFIG;
    var viewKey = (cfg && cfg.nextStepViewKey) || 'view_3918';
    var fld = (cfg && cfg.sowTypeField) || 'field_2952';
    var view = document.getElementById(viewKey);
    if (!view || !sowId) return '';
    var tr = view.querySelector('tbody tr[id="' + sowId + '"]');
    var td = tr && tr.querySelector('td.' + fld + ', td[data-field-key="' + fld + '"]');
    return td ? stripHtml(td.textContent) : '';
  }
  function whoLabel(pkg, idx) {
    var who = String((pkg && (pkg.subName || pkg.bidName || pkg.name)) || '').trim();
    return who || ('Bid ' + ((idx || 0) + 1));
  }
  function crCountFor(grid) {
    var r = v1();
    var api = r && r.changeRequests;
    if (!grid || !api || typeof api.getPending !== 'function') return 0;
    var pending;
    try { pending = api.getPending() || {}; } catch (e) { return 0; }
    var n = 0;
    for (var i = 0; i < grid.packages.length; i++) {
      var b = pending[grid.packages[i].id];
      if (b && b.items) n += b.items.length;
    }
    return n;
  }
  function crCountForPkg(pkgId) {
    var r = v1();
    var api = r && r.changeRequests;
    if (!api || typeof api.getPending !== 'function') return 0;
    try {
      var b = (api.getPending() || {})[pkgId];
      return (b && b.items) ? b.items.length : 0;
    } catch (e) { return 0; }
  }
  /** The SOW line-item records on a SOW (field_2154) — render.js stashes the
   *  source view's records as ns.lastSowItems. */
  function sowItemsFor(sowId) {
    var items = ns.lastSowItems || [];
    var key = ((ns.CONFIG && ns.CONFIG.sowItemFieldKeys) || {}).sow || 'field_2154';
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var raw = items[i] && items[i][key + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var k = 0; k < raw.length; k++) {
        if (raw[k] && raw[k].id === sowId) { out.push(items[i]); break; }
      }
    }
    return out;
  }
  function scopeOpts(records) {
    return { viewKey: SCOPE_VIEW, hideMoney: true, records: records };
  }
  /** "24 cameras · 22 mounts · 9 headend · 4 other" for a SOW — the same
   *  families + order as the worksheet's MDF/IDF header line. */
  function countsText(sowId) {
    var w = wsv2();
    var sum = w && w.summary;
    if (!sum || typeof sum.aggregateScope !== 'function') return '';
    var recs = sowItemsFor(sowId);
    if (!recs.length) return '';
    var a;
    try { a = sum.aggregateScope(recs, scopeOpts(recs)); } catch (e) { return ''; }
    var parts = [];
    if (a.cam.count) {
      var camLabel = String(a.title || 'Cameras').toLowerCase();
      if (a.cam.count === 1) camLabel = camLabel === 'readers' ? 'reader' : 'camera';
      parts.push(a.cam.count + ' ' + camLabel);
    }
    if (a.mounts.count)   parts.push(a.mounts.count + ' ' + plural(a.mounts.count, 'mount'));
    if (a.headend.count)  parts.push(a.headend.count + ' headend');
    if (a.other.count)    parts.push(a.other.count + ' other');
    if (a.services.count) parts.push(a.services.count + ' ' + plural(a.services.count, 'service'));
    if (a.licenses.count) parts.push(a.licenses.count + ' ' + plural(a.licenses.count, 'license'));
    return parts.join(' · ');
  }
  function readinessOf(section) {
    var e = section.querySelector('.scw-sbd-inline .scw-sbd-ready');
    if (!e) return { state: '', label: '' };
    var m = (e.className || '').match(/scw-sbd-ready--([a-z-]+)/);
    var label = stripHtml(e.textContent).replace(/\s*[—–-]\s*auto-saved\s*$/i, '');
    return { state: m ? m[1] : '', label: label };
  }
  function gapsOf(section) {
    var e = section.querySelector('.scw-sbd-inline .scw-sbd-bargap');
    if (!e) return 0;
    var m = stripHtml(e.textContent).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // ── Original / Alternate / Change order ────────────────────────────────
  var SW_RE   = /\bSW-?(\d+)\s*(CO)?\b/i;
  var BARE_RE = /^\s*(\d{2,6})\s*(CO)?(?:\s*$|\s*[-–—:·(])/i;
  function parseSow(label, name) {
    var m = String(label || '').match(SW_RE) || String(name || '').match(SW_RE) ||
            String(label || '').match(BARE_RE) || String(name || '').match(BARE_RE);
    return { num: m ? parseInt(m[1], 10) : NaN, isCo: !!(m && m[2]) };
  }
  /** Stamp kind on each {id, label, name, isCo}: the lowest-numbered non-CO
   *  SOW is the Original, every other numbered one an Alternate. Uses the
   *  worksheet's own classifier when it is on the page so the two surfaces
   *  can never disagree. */
  function classify(list) {
    var w = wsv2();
    if (w && w.sowContext && typeof w.sowContext.classify === 'function') {
      try { return w.sowContext.classify(list); } catch (e) { /* local */ }
    }
    var lowest = Infinity, i, s, p;
    for (i = 0; i < list.length; i++) {
      s = list[i]; p = parseSow(s.label, s.name);
      s.num = p.num;
      s.kind = (p.isCo || s.isCo) ? 'co' : (isNaN(p.num) ? 'other' : 'numbered');
      if (s.kind === 'numbered' && p.num < lowest) lowest = p.num;
    }
    for (i = 0; i < list.length; i++) {
      s = list[i];
      if (s.kind === 'numbered') s.kind = s.num === lowest ? 'original' : 'alternate';
    }
    return list;
  }
  var KIND_LABEL = { original: 'Original', alternate: 'Alternate', co: 'Change order', other: '' };

  // ── Active SOW ─────────────────────────────────────────────────────────
  var _active = '';
  function activeSowId() { return _active; }
  function sectionsOf(root) {
    return (root || document).querySelectorAll('.' + CLS + '__sow[data-sow-id]');
  }
  function resolveActive(sections, kinds) {
    var ids = [], i;
    for (i = 0; i < sections.length; i++) ids.push(sections[i].getAttribute('data-sow-id'));
    if (!ids.length) return '';
    var want = _active || storedActive();
    if (want && ids.indexOf(want) !== -1) return want;
    // Default: the Original (lowest number), else the first real SOW, else
    // whatever there is.
    for (i = 0; i < kinds.length; i++) if (kinds[i].kind === 'original') return kinds[i].id;
    for (i = 0; i < ids.length; i++) if (ids[i] !== NO_SOW) return ids[i];
    return ids[0];
  }
  function applyActive(sections) {
    for (var i = 0; i < sections.length; i++) {
      var on = sections[i].getAttribute('data-sow-id') === _active;
      sections[i].classList.toggle(CLS + '__sow--active', on);
      // Tabs mode has no section fold — a persisted fold would hide the one
      // visible grid with nothing left to click.
      sections[i].classList.remove(CLS + '__sow--collapsed');
    }
    var tabs = document.querySelectorAll('.' + CLS + '__sowtab[data-scw-br-v2-tab]');
    for (var t = 0; t < tabs.length; t++) {
      var isOn = tabs[t].getAttribute('data-scw-br-v2-tab') === _active;
      tabs[t].classList.toggle(CLS + '__sowtab--active', isOn);
      tabs[t].setAttribute('aria-selected', isOn ? 'true' : 'false');
      tabs[t].setAttribute('tabindex', isOn ? '0' : '-1');
      var pen = tabs[t].querySelector('[data-scw-br-v2-rename]');
      if (pen) pen.hidden = !isOn || tabs[t].classList.contains(CLS + '__sowtab--synthetic');
    }
  }
  function setActive(sowId) {
    if (!sowId) return;
    _active = sowId;
    storeActive(sowId);
    applyActive(sectionsOf(container()));
    if (ns.toolbar && typeof ns.toolbar.syncLabels === 'function') {
      try { ns.toolbar.syncLabels(); } catch (e) { /* ignore */ }
    }
  }

  // ── Tabs ───────────────────────────────────────────────────────────────
  function kindsFor(sections) {
    var list = [];
    for (var i = 0; i < sections.length; i++) {
      var id = sections[i].getAttribute('data-sow-id');
      if (id === NO_SOW) continue;
      var grid = gridFor(id);
      list.push({
        id: id,
        label: (grid && grid.sowName) || '',
        name: friendlyName(id),
        isCo: /change\s*order/i.test(sowTypeText(id))
      });
    }
    return classify(list);
  }
  function stateOf(section, grid) {
    var sowId = section.getAttribute('data-sow-id');
    var basis = basisOf(sowId);
    var rd = readinessOf(section);
    var gaps = gapsOf(section);
    var cr = crCountFor(grid);
    var parts = [];
    var ok = rd.state === 'ready';
    if (ok) parts.push('✓ reviewed');
    else if (!basis) parts.push('○ pick a basis bid');
    else if (basis === K1_ID) parts.push('● self-perform (K1)');
    else parts.push('● basis chosen');
    if (gaps) parts.push(gaps + ' ' + plural(gaps, 'gap'));
    if (cr) parts.push(cr + ' ' + plural(cr, 'change request') + ' queued');
    if (!basis && grid) parts.push(grid.packages.length + ' ' + plural(grid.packages.length, 'bid') + ' in');
    return { text: parts.join(' · '), ok: ok, ready: ok };
  }
  function tabHtml(section, kind, idx) {
    var sowId = section.getAttribute('data-sow-id');
    var grid = gridFor(sowId);
    if (sowId === NO_SOW) {
      var n = (grid && grid.rows && grid.rows.length) || 0;
      return '<div class="' + CLS + '__sowtab ' + CLS + '__sowtab--synthetic" role="tab" ' +
        'data-scw-br-v2-tab="' + esc(sowId) + '" aria-selected="false" tabindex="-1">' +
        '<span class="' + CLS + '__sowtab-line1"><span class="' + CLS + '__sowtab-num">Unmatched bid items</span>' +
          '<span class="' + CLS + '__sowtab-count">' + n + '</span></span>' +
        '<span class="' + CLS + '__sowtab-counts">bid lines on no SOW</span>' +
      '</div>';
    }
    var number = stripHtml((grid && grid.sowName) || (kind && kind.label) || '');
    var name = (kind && kind.name) || '';
    if (name && name === number) name = '';
    var badge = kind && KIND_LABEL[kind.kind]
      ? '<span class="' + CLS + '__sowtab-badge ' + CLS + '__sowtab-badge--' + esc(kind.kind) + '">' +
          esc(KIND_LABEL[kind.kind]) + '</span>'
      : '';
    var counts = countsText(sowId);
    var st = stateOf(section, grid);
    return '<div class="' + CLS + '__sowtab" role="tab" data-scw-br-v2-tab="' + esc(sowId) + '" ' +
      'aria-selected="false" tabindex="-1" data-scw-br-v2-reviewed="' + (st.ready ? '1' : '0') + '">' +
      '<span class="' + CLS + '__sowtab-line1">' +
        '<span class="' + CLS + '__sowtab-dot" style="background:' + DOTS[idx % DOTS.length] + '"></span>' +
        '<span class="' + CLS + '__sowtab-num">' + esc(number) + '</span>' + badge +
      '</span>' +
      '<span class="' + CLS + '__sowtab-namerow">' +
        '<span class="' + CLS + '__sowtab-name" title="' + esc(name) + '">' + esc(name) + '</span>' +
        '<button type="button" class="' + CLS + '__sowtab-rename" data-scw-br-v2-rename="' + esc(sowId) + '" ' +
          'title="Rename this SOW" aria-label="Rename this SOW" hidden>✎</button>' +
      '</span>' +
      (counts ? '<span class="' + CLS + '__sowtab-counts">' + esc(counts) + '</span>' : '') +
      '<span class="' + CLS + '__sowtab-state ' + CLS + '__sowtab-state--' + (st.ok ? 'ok' : 'todo') + '">' +
        esc(st.text) + '</span>' +
    '</div>';
  }
  function buildTabs(c, sections, kinds) {
    var old = c.querySelector(':scope > .' + CLS + '__sowtabs');
    if (!sections.length) { if (old) old.parentNode.removeChild(old); return; }
    var byId = Object.create(null);
    for (var k = 0; k < kinds.length; k++) byId[kinds[k].id] = kinds[k];
    var html = '', real = 0, reviewed = 0, idx = 0;
    for (var i = 0; i < sections.length; i++) {
      var sowId = sections[i].getAttribute('data-sow-id');
      html += tabHtml(sections[i], byId[sowId], idx);
      if (sowId !== NO_SOW) {
        idx++; real++;
        if (readinessOf(sections[i]).state === 'ready') reviewed++;
      }
    }
    html += '<span class="' + CLS + '__sowtabs-spacer"></span>' +
      '<span class="' + CLS + '__sowtabs-meta">' + reviewed + ' of ' + real + ' ' + plural(real, 'scope') + ' reviewed</span>';
    var bar = old || el('div', CLS + '__sowtabs');
    bar.setAttribute('role', 'tablist');
    bar.innerHTML = html;
    if (!old) {
      var toolbar = c.querySelector(':scope > .' + CLS + '__toolbar');
      var body = c.querySelector(':scope > .' + CLS + '-body');
      c.insertBefore(bar, toolbar || body || null);
    }
  }
  /** Refresh the live bits of the tabs (state line, reviewed count) without
   *  a rebuild — the diff bar re-rendered. */
  function syncTabs(c) {
    var sections = sectionsOf(c);
    var real = 0, reviewed = 0;
    for (var i = 0; i < sections.length; i++) {
      var sowId = sections[i].getAttribute('data-sow-id');
      var tab = c.querySelector('.' + CLS + '__sowtab[data-scw-br-v2-tab="' + sowId + '"]');
      if (sowId === NO_SOW) continue;
      real++;
      var st = stateOf(sections[i], gridFor(sowId));
      if (st.ready) reviewed++;
      if (!tab) continue;
      var stEl = tab.querySelector('.' + CLS + '__sowtab-state');
      if (stEl) {
        stEl.textContent = st.text;
        stEl.className = CLS + '__sowtab-state ' + CLS + '__sowtab-state--' + (st.ok ? 'ok' : 'todo');
      }
      tab.setAttribute('data-scw-br-v2-reviewed', st.ready ? '1' : '0');
    }
    var meta = c.querySelector('.' + CLS + '__sowtabs-meta');
    if (meta) meta.textContent = reviewed + ' of ' + real + ' ' + plural(real, 'scope') + ' reviewed';
  }

  // ── Rename from the tab ────────────────────────────────────────────────
  function startRename(tab) {
    var sowId = tab.getAttribute('data-scw-br-v2-tab');
    var nameEl = tab.querySelector('.' + CLS + '__sowtab-name');
    if (!nameEl || tab.querySelector('.' + CLS + '__sowtab-input')) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = CLS + '__sowtab-input';
    input.value = nameEl.textContent || '';
    input.placeholder = 'SOW name';
    input.setAttribute('data-scw-br-v2-rename-input', sowId);
    input.setAttribute('aria-label', 'SOW name');
    nameEl.hidden = true;
    nameEl.parentNode.insertBefore(input, nameEl);
    input.focus();
    try { input.select(); } catch (e) { /* ignore */ }
  }
  function endRename(input, commit) {
    var tab = input.closest('.' + CLS + '__sowtab');
    var nameEl = tab && tab.querySelector('.' + CLS + '__sowtab-name');
    var sowId = input.getAttribute('data-scw-br-v2-rename-input');
    var value = String(input.value || '').trim();
    if (input.parentNode) input.parentNode.removeChild(input);
    if (nameEl) nameEl.hidden = false;
    if (!commit || !nameEl || value === (nameEl.textContent || '')) return;
    // The real SOW Name input (v1's status bar, hidden inside SCW's card)
    // carries the save: set it and fire the change v2 routes to v1.
    var section = document.querySelector('.' + CLS + '__sow[data-sow-id="' + sowId + '"]');
    var real = section && section.querySelector('.scw-bid-review__sow-name-input[data-action="sow_name_update"]');
    if (!real) return;
    real.value = value;
    dispatch(real, 'change');
    nameEl.textContent = value;
    nameEl.title = value;
  }
  function dispatch(target, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true, cancelable: true }); }
    catch (e) { ev = document.createEvent('Event'); ev.initEvent(type, true, true); }
    target.dispatchEvent(ev);
  }

  // ── Basis bridge ───────────────────────────────────────────────────────
  /** Set the basis bid for a SOW through the diff bar's own <select> (moved
   *  into SCW's card) so ONE change event does what a dropdown pick does:
   *  sub-bid-diff persists field_2942 + snapshot, basis-filter repaints. */
  function setBasis(sowId, pkgId) {
    var section = document.querySelector('.' + CLS + '__sow[data-sow-id="' + sowId + '"]');
    var sel = section && section.querySelector('select[data-scw-sbd-basis]');
    if (!sel) return false;
    if (sel.value === pkgId) return true;
    sel.value = pkgId;
    if (sel.value !== pkgId) return false;
    dispatch(sel, 'change');
    return true;
  }

  // ── Per-section decoration ─────────────────────────────────────────────
  function decorateSection(section) {
    if (section.getAttribute('data-scw-br-v2-hdr') === '1') return;
    section.setAttribute('data-scw-br-v2-hdr', '1');
    var sowId = section.getAttribute('data-sow-id');
    var grid = gridFor(sowId);
    decorateHeader(section);
    decorateHead(section, grid);
  }

  /** The navy SOW header becomes the status line: scope summary disclosure +
   *  the warning chips it already carries. Its fold behaviour is off (init.js
   *  reads data-scw-br-v2-tabs). */
  function decorateHeader(section) {
    var header = section.querySelector(':scope > .' + CLS + '__sow-header');
    if (!header) return;
    header.removeAttribute('role');
    header.setAttribute('tabindex', '-1');
    header.removeAttribute('aria-expanded');
    var btn = el('button', CLS + '__scope-toggle', 'Scope summary ▸');
    btn.type = 'button';
    btn.setAttribute('data-scw-br-v2-scope', section.getAttribute('data-sow-id') || '');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = 'What is on this SOW: cameras / readers with their splits, headend products by name, other equipment, services';
    var sep = el('span', CLS + '__status-sep');
    header.insertBefore(sep, header.firstChild);
    header.insertBefore(btn, header.firstChild);
    var holder = el('div', CLS + '__scope-holder');
    holder.hidden = true;
    header.appendChild(holder);
  }

  function buildStrip(section) {
    var w = wsv2();
    var sum = w && w.summary;
    if (!sum || typeof sum.buildScopeStrip !== 'function') return null;
    var sowId = section.getAttribute('data-sow-id');
    var grid = gridFor(sowId);
    var recs = sowItemsFor(sowId);
    var byId = Object.create(null);
    for (var i = 0; i < recs.length; i++) if (recs[i] && recs[i].id) byId[recs[i].id] = recs[i];
    // One L1 per MDF/IDF group so the strip's "N MDF/IDFs" is right; the
    // tiles count from the full record list (attached mounts included).
    var tree = [];
    var groups = (grid && grid.groups) || [];
    for (var g = 0; g < groups.length; g++) {
      var rows = groups[g].rows || [], list = [];
      for (var r = 0; r < rows.length; r++) {
        var rec = rows[r] && rows[r].sowItem && byId[rows[r].sowItem];
        if (rec) list.push(rec);
      }
      tree.push({ l2: [{ records: list }], isSynthetic: !groups[g].mdfIdfId });
    }
    try { return sum.buildScopeStrip(tree, scopeOpts(recs)); }
    catch (e) { return null; }
  }
  function toggleScope(section, btn) {
    var holder = section.querySelector('.' + CLS + '__scope-holder');
    if (!holder) return;
    var open = holder.hidden;
    if (open && !holder.firstChild) {
      var strip = buildStrip(section);
      if (strip) holder.appendChild(strip);
      else holder.innerHTML = '<div class="' + CLS + '__scope-empty">No scope summary for this SOW yet.</div>';
    }
    holder.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? 'Scope summary ▾' : 'Scope summary ▸';
  }

  /** The four head bands as column cards. Existing elements are moved, never
   *  rebuilt, so every handler keeps working. */
  function decorateHead(section, grid) {
    var sowId = section.getAttribute('data-sow-id');
    var pkgs = (grid && grid.packages) || [];
    // SCW column — who
    var sowTitle = section.querySelector('.' + CLS + '__th--sow.' + CLS + '__head-cell--title .' + CLS + '__head-title');
    if (sowTitle) sowTitle.textContent = 'SCW · SOW';
    // SCW column — workflow: the basis picker slot (filled by sync) ahead of
    // the status-bar metrics.
    var sowDetails = section.querySelector('.' + CLS + '__head--sow-details');
    if (sowDetails && !sowDetails.querySelector('.' + CLS + '__basis-slot')) {
      var slot = el('div', CLS + '__basis-slot');
      sowDetails.insertBefore(slot, sowDetails.firstChild);
    }
    // SCW column — actions: "Next step" + the review state ahead of the pill.
    var sowActions = section.querySelector('.' + CLS + '__head--sow-actions');
    if (sowActions && !sowActions.querySelector('.' + CLS + '__nextstep')) {
      var next = el('div', CLS + '__nextstep');
      next.innerHTML = '<span class="' + CLS + '__nextstep-label">Next step</span>' +
        '<span class="' + CLS + '__ready" hidden></span>';
      sowActions.insertBefore(next, sowActions.firstChild);
    }
    // Bid columns
    for (var i = 0; i < pkgs.length; i++) {
      var pkg = pkgs[i];
      if (!pkg || !pkg.id) continue;
      decoratePkgTitle(section, pkg, i, sowId);
      decoratePkgDetails(section, pkg);
      decoratePkgActions(section, pkg, i, sowId);
    }
  }
  function pkgCell(section, band, pkgId) {
    return section.querySelector('.' + CLS + '__head-cell--' + band + '[data-pkg-id="' + pkgId + '"]');
  }
  function decoratePkgTitle(section, pkg, idx, sowId) {
    var th = pkgCell(section, 'title', pkg.id);
    if (!th || th.querySelector('.' + CLS + '__card-who')) return;
    var who = el('div', CLS + '__card-who');
    var radio = el('label', CLS + '__basis-radio');
    radio.title = 'Make this bid the basis for this SOW → proposal';
    radio.innerHTML = '<input type="radio" name="scw-br-v2-basis-' + esc(sowId) + '" value="' + esc(pkg.id) + '" ' +
      'data-scw-br-v2-basis-radio="' + esc(pkg.id) + '" data-sow-id="' + esc(sowId) + '">' +
      '<span class="' + CLS + '__basis-radio-label">Set as basis</span>';
    who.appendChild(radio);
    var title = th.querySelector('.' + CLS + '__head-title');
    if (title) who.appendChild(title);
    else who.appendChild(el('span', CLS + '__head-title', whoLabel(pkg, idx)));
    if (pkg.label && pkg.label !== whoLabel(pkg, idx)) who.appendChild(el('span', CLS + '__card-pkglabel', pkg.label));
    var badge = el('span', CLS + '__basis-badge', 'Basis');
    badge.hidden = true;
    who.appendChild(badge);
    th.appendChild(who);
  }
  function decoratePkgDetails(section, pkg) {
    var th = pkgCell(section, 'details', pkg.id);
    if (!th || th.querySelector('.' + CLS + '__gap')) return;
    // The PDF link sits with the status badge + Reopen Bid on one line.
    var statusline = th.querySelector('.' + CLS + '__head-statusline');
    var subtitle = th.querySelector('.' + CLS + '__head-subtitle');
    var pdf = subtitle && subtitle.querySelector('.' + CLS + '__pdf-link');
    if (!statusline) {
      statusline = el('div', CLS + '__head-statusline');
      th.appendChild(statusline);
    }
    if (pdf) statusline.insertBefore(pdf, statusline.firstChild);
    var reopen = statusline.querySelector('[data-action="package_reopen_bid"]');
    if (reopen) statusline.appendChild(reopen);
    var gap = el('button', CLS + '__gap');
    gap.type = 'button';
    gap.hidden = true;
    gap.setAttribute('data-scw-br-v2-gap', pkg.id);
    gap.title = 'SOW lines needing a bid, or bid lines off this SOW — opens the diff panel';
    th.appendChild(gap);
  }
  function menuBtn(text, attrs, cls) {
    var b = el('button', CLS + '__menu-item' + (cls ? ' ' + cls : ''), text);
    b.type = 'button';
    for (var k in attrs) b.setAttribute(k, attrs[k]);
    return b;
  }
  function decoratePkgActions(section, pkg, idx, sowId) {
    var th = pkgCell(section, 'actions', pkg.id);
    if (!th || th.querySelector('.' + CLS + '__card-actions')) return;
    var who = whoLabel(pkg, idx);
    var cr = crCountForPkg(pkg.id);
    var preview = th.querySelector('[data-action="cr_preview"]');
    var bulk    = th.querySelector('[data-action="cr_bulk_selected"]');
    var clear   = th.querySelector('[data-action="cr_clear_all"]');
    var submit  = th.querySelector('[data-action="cr_submit"]');
    var adopt   = th.querySelector('[data-action="package_copy_to_sow"]');
    var create  = th.querySelector('[data-action="package_create_sow"]');

    var wrap = el('div', CLS + '__card-actions');
    var line = el('div', CLS + '__card-actions-line');
    line.innerHTML = cr
      ? '<b>' + cr + ' ' + plural(cr, 'change request') + '</b> queued for ' + esc(who) + ', not sent yet'
      : 'no change requests queued';
    var row = el('div', CLS + '__card-actions-row');
    var menu = el('div', CLS + '__menu');
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('data-scw-br-v2-menu', pkg.id);

    if (cr && preview) {
      preview.textContent = 'Review & send to ' + who;
      preview.title = 'Opens the change request exactly as ' + who + ' will receive it — send from there';
      preview.classList.add(CLS + '__card-primary');
      row.appendChild(preview);
    } else if (bulk) {
      bulk.textContent = 'Request changes on selected…';
      bulk.classList.add(CLS + '__card-primary');
      row.appendChild(bulk);
      bulk = null;
    }
    // The ⋮ menu — the rest of this bid's actions, in this bid's column.
    var setBasisBtn = menuBtn('Set as basis bid',
      { 'data-scw-br-v2-setbasis': pkg.id, 'data-sow-id': sowId, 'role': 'menuitem' });
    menu.appendChild(setBasisBtn);
    if (pkg.pdfUrl) {
      var a = el('a', CLS + '__menu-item', 'Open bid PDF');
      a.href = pkg.pdfUrl; a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('role', 'menuitem');
      menu.appendChild(a);
    }
    menu.appendChild(el('div', CLS + '__menu-sep'));
    if (bulk) {
      bulk.textContent = 'Request changes on selected rows…';
      bulk.classList.add(CLS + '__menu-item');
      menu.appendChild(bulk);
    }
    if (cr && clear) {
      clear.textContent = 'Discard the ' + cr + ' queued ' + plural(cr, 'request');
      clear.classList.add(CLS + '__menu-item', CLS + '__menu-item--danger');
      menu.appendChild(clear);
    }
    // Sending happens from the preview modal (Cancel | Submit) — the direct
    // submit button stays in the DOM for v1's state handling, unseen.
    if (submit) submit.hidden = true;
    if (adopt || create) menu.appendChild(el('div', CLS + '__menu-sep'));
    if (adopt) {
      adopt.textContent = 'Update SOW to match this bid…';
      adopt.classList.add(CLS + '__menu-item');
      menu.appendChild(adopt);
    }
    if (create) {
      create.textContent = 'Create a new SOW from this bid…';
      create.classList.add(CLS + '__menu-item');
      menu.appendChild(create);
    }
    var more = el('button', CLS + '__menu-toggle', '⋮');
    more.type = 'button';
    more.title = 'More actions for this bid';
    more.setAttribute('aria-label', 'More actions for ' + who);
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('data-scw-br-v2-menu-toggle', pkg.id);
    row.appendChild(el('span', CLS + '__card-actions-spacer'));
    row.appendChild(more);
    wrap.appendChild(line);
    wrap.appendChild(row);
    wrap.appendChild(menu);
    th.appendChild(wrap);
    // The old labelled groups are empty now — out of the way.
    var groups = th.querySelectorAll('.' + CLS + '__head-group');
    for (var g = 0; g < groups.length; g++) groups[g].hidden = true;
  }

  // ── Mirrors — re-synced whenever the diff bar re-renders ───────────────
  function syncSection(section) {
    var sowId = section.getAttribute('data-sow-id');
    var grid = gridFor(sowId);
    var basis = basisOf(sowId);
    var rd = readinessOf(section);
    var gaps = gapsOf(section);

    // Basis picker: the diff bar's fresh <select> block moves into SCW's card.
    var slot = section.querySelector('.' + CLS + '__basis-slot');
    var fresh = section.querySelector('.scw-sbd-inline .scw-sbd-baseline');
    if (slot && fresh) {
      while (slot.firstChild) slot.removeChild(slot.firstChild);
      slot.appendChild(fresh);
    }
    // Review state in SCW's Next step.
    var ready = section.querySelector('.' + CLS + '__ready');
    if (ready) {
      ready.hidden = !rd.state;
      ready.textContent = rd.label;
      ready.className = CLS + '__ready' + (rd.state ? ' ' + CLS + '__ready--' + rd.state : '');
    }
    // Per bid column: radio, badge, basis column marker, gap pill, menu item.
    var pkgs = (grid && grid.packages) || [];
    for (var i = 0; i < pkgs.length; i++) {
      var pkg = pkgs[i];
      if (!pkg || !pkg.id) continue;
      var isBasis = basis === pkg.id;
      var radio = section.querySelector('[data-scw-br-v2-basis-radio="' + pkg.id + '"]');
      if (radio) {
        radio.checked = isBasis;
        var lbl = radio.parentNode && radio.parentNode.querySelector('.' + CLS + '__basis-radio-label');
        if (lbl) lbl.hidden = isBasis;
      }
      var titleTh = pkgCell(section, 'title', pkg.id);
      if (titleTh) {
        titleTh.classList.toggle(CLS + '__head-cell--basis', isBasis);
        var badge = titleTh.querySelector('.' + CLS + '__basis-badge');
        if (badge) badge.hidden = !isBasis;
      }
      var gapBtn = section.querySelector('[data-scw-br-v2-gap="' + pkg.id + '"]');
      if (gapBtn) {
        gapBtn.hidden = !(isBasis && gaps > 0);
        gapBtn.textContent = gaps + ' ' + plural(gaps, 'gap');
      }
      var setB = section.querySelector('[data-scw-br-v2-setbasis="' + pkg.id + '"]');
      if (setB) setB.hidden = isBasis;
      var colLabel = section.querySelector('.' + CLS + '__collabel--pkg[data-pkg-id="' + pkg.id + '"] .' + CLS + '__collabel-basis');
      if (colLabel) colLabel.hidden = !isBasis;
    }
  }
  function syncAll() {
    var c = container();
    if (!c || !enabled()) return;
    var sections = sectionsOf(c);
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getAttribute('data-scw-br-v2-hdr') !== '1') decorateSection(sections[i]);
      syncSection(sections[i]);
    }
    syncTabs(c);
    if (_mo) _mo.takeRecords();   // our own moves must not re-trigger a sync
  }

  var _mo = null, _syncTimer = null;
  function observe(body) {
    if (_mo || typeof MutationObserver !== 'function') return;
    _mo = new MutationObserver(function () {
      if (_syncTimer) return;
      _syncTimer = setTimeout(function () { _syncTimer = null; syncAll(); }, 30);
    });
    _mo.observe(body, { childList: true, subtree: true });
  }

  /** Scope tile → toggle a highlight on every grid row of that family (the
   *  SOW item ids ride on the tile), scroll to the first. One family at a
   *  time; a second click clears. */
  var ROW_HL = CLS + '__row--scope-hl';
  function highlightFamilyRows(tile) {
    var section = tile.closest('.' + CLS + '__sow');
    if (!section) return;
    var wasOn = tile.getAttribute('aria-pressed') === 'true';
    var tiles = section.querySelectorAll('[data-scw-ws-v2-scope-tile]');
    for (var t = 0; t < tiles.length; t++) {
      tiles[t].classList.remove('is-on');
      tiles[t].setAttribute('aria-pressed', 'false');
    }
    var lit = section.querySelectorAll('.' + ROW_HL);
    for (var c = 0; c < lit.length; c++) lit[c].classList.remove(ROW_HL);
    if (wasOn) return;
    tile.classList.add('is-on');
    tile.setAttribute('aria-pressed', 'true');
    var ids = (tile.getAttribute('data-scw-ws-v2-scope-ids') || '').split(',');
    var first = null;
    for (var i = 0; i < ids.length; i++) {
      if (!ids[i]) continue;
      var rows = section.querySelectorAll('tr.' + CLS + '__row[data-sow-item-id="' + ids[i] + '"]');
      for (var k = 0; k < rows.length; k++) {
        rows[k].classList.add(ROW_HL);
        if (!first) first = rows[k];
      }
    }
    if (first) {
      try { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { /* ignore */ }
    }
  }

  // ── Wiring ─────────────────────────────────────────────────────────────
  function closeMenus(except) {
    var open = document.querySelectorAll('.' + CLS + '__menu:not([hidden])');
    for (var i = 0; i < open.length; i++) {
      if (open[i] === except) continue;
      open[i].hidden = true;
      var tg = open[i].parentNode && open[i].parentNode.querySelector('[data-scw-br-v2-menu-toggle]');
      if (tg) tg.setAttribute('aria-expanded', 'false');
    }
  }
  function wire() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-header-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-header-bound', '1');

    // Capture phase: the moved buttons stop propagation in v2's own handler,
    // so a menu must close BEFORE the item's click is dispatched. The scope
    // tiles are handled here too — worksheet-v2's own tile handler looks for
    // worksheet cards, which this grid only has inside expanded rows; on this
    // page a tile highlights that family's ROWS, the warning-chip gesture.
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var tile = t.closest('.' + CLS + '__scope-holder [data-scw-ws-v2-scope-tile]');
      if (tile) {
        e.preventDefault(); e.stopImmediatePropagation();
        highlightFamilyRows(tile);
        return;
      }
      var toggle = t.closest('[data-scw-br-v2-menu-toggle]');
      if (toggle) {
        e.preventDefault(); e.stopPropagation();
        var menu = toggle.parentNode.parentNode.querySelector('.' + CLS + '__menu');
        if (!menu) return;
        var opening = menu.hidden;
        closeMenus();
        menu.hidden = !opening;
        toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
        return;
      }
      closeMenus();
    }, true);

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      // Tab click (not the rename button / input inside it).
      var tab = t.closest('[data-scw-br-v2-tab]');
      if (tab && !t.closest('[data-scw-br-v2-rename], .' + CLS + '__sowtab-input')) {
        e.preventDefault();
        setActive(tab.getAttribute('data-scw-br-v2-tab'));
        return;
      }
      var pen = t.closest('[data-scw-br-v2-rename]');
      if (pen) {
        e.preventDefault(); e.stopPropagation();
        var pTab = pen.closest('[data-scw-br-v2-tab]');
        if (pTab) startRename(pTab);
        return;
      }
      var scope = t.closest('[data-scw-br-v2-scope]');
      if (scope) {
        e.preventDefault(); e.stopPropagation();
        var sec = scope.closest('.' + CLS + '__sow');
        if (sec) toggleScope(sec, scope);
        return;
      }
      var setB = t.closest('[data-scw-br-v2-setbasis]');
      if (setB) {
        e.preventDefault(); e.stopPropagation();
        setBasis(setB.getAttribute('data-sow-id'), setB.getAttribute('data-scw-br-v2-setbasis'));
        return;
      }
      var gap = t.closest('[data-scw-br-v2-gap]');
      if (gap) {
        e.preventDefault(); e.stopPropagation();
        var gSec = gap.closest('.' + CLS + '__sow');
        var block = gSec && gSec.querySelector('.scw-sbd-inline');
        if (!block) return;
        if (block.classList.contains('scw-sbd-inline--collapsed')) {
          var fold = block.querySelector('[data-scw-sbd-collapse]');
          if (fold) fold.click();
        }
        try { block.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) { /* ignore */ }
        return;
      }
    });

    document.addEventListener('change', function (e) {
      var r = e.target && e.target.closest && e.target.closest('[data-scw-br-v2-basis-radio]');
      if (!r) return;
      if (!setBasis(r.getAttribute('data-sow-id'), r.getAttribute('data-scw-br-v2-basis-radio'))) {
        r.checked = false;   // no picker yet — the next sync re-asserts the truth
      }
    });

    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var input = t.closest('[data-scw-br-v2-rename-input]');
      if (input) {
        if (e.key === 'Enter') { e.preventDefault(); endRename(input, true); }
        else if (e.key === 'Escape') { e.preventDefault(); endRename(input, false); }
        return;
      }
      if (e.key === 'Escape') { closeMenus(); return; }
      var tab = t.closest('[data-scw-br-v2-tab]');
      if (tab && t === tab && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        setActive(tab.getAttribute('data-scw-br-v2-tab'));
      }
    });
    document.addEventListener('focusout', function (e) {
      var input = e.target && e.target.closest && e.target.closest('[data-scw-br-v2-rename-input]');
      if (input && input.parentNode) endRename(input, true);
    }, true);
  }

  // ── Entry point — render.js calls this after every paint ───────────────
  function afterRender(body) {
    var c = container();
    if (!c) return;
    if (!enabled()) {
      c.classList.remove(CLS + '--tabs');
      document.documentElement.removeAttribute('data-scw-br-v2-tabs');
      return;
    }
    injectStyles();
    wire();
    c.classList.add(CLS + '--tabs');
    document.documentElement.setAttribute('data-scw-br-v2-tabs', '1');
    body = body || c.querySelector('.' + CLS + '-body');
    var sections = sectionsOf(body);
    for (var i = 0; i < sections.length; i++) decorateSection(sections[i]);
    var kinds = kindsFor(sections);
    _active = resolveActive(sections, kinds);
    buildTabs(c, sections, kinds);
    applyActive(sections);
    if (body) observe(body);
    syncAll();
  }

  // ── CSS ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var T = '.' + CLS + '--tabs ';
    var css = [
      /* one SOW at a time */
      T + '.' + CLS + '__sow:not(.' + CLS + '__sow--active) { display: none !important; }',
      /* ── SOW tabs ── */
      '.' + CLS + '__sowtabs { display: flex; align-items: stretch; gap: 6px; padding: 0 2px; margin: 10px 0 0;',
      '  border-bottom: 2px solid #e2e8f0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }',
      '.' + CLS + '__sowtab { flex: 1 1 0; max-width: 370px; min-width: 0; display: flex; flex-direction: column; gap: 3px;',
      '  padding: 8px 14px 9px; margin-bottom: -2px; border: 1px solid transparent; border-radius: 8px 8px 0 0;',
      '  cursor: pointer; color: #475569; background: transparent; font-size: 12px; line-height: 1.3; text-align: left; }',
      '.' + CLS + '__sowtab:hover { background: #f8fafc; }',
      '.' + CLS + '__sowtab:focus-visible { outline: 2px solid #163c6e; outline-offset: -2px; }',
      '.' + CLS + '__sowtab--active { border-color: #163c6e; border-bottom: 2px solid #fff; background: #fff; color: #0f172a; }',
      '.' + CLS + '__sowtab--active:hover { background: #fff; }',
      '.' + CLS + '__sowtab--synthetic { flex: 0 1 auto; color: #64748b; }',
      '.' + CLS + '__sowtab-line1 { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 13px; }',
      '.' + CLS + '__sowtab-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }',
      '.' + CLS + '__sowtab-num { white-space: nowrap; }',
      '.' + CLS + '__sowtab-count { padding: 1px 7px; border-radius: 999px; background: #fef3c7; color: #92400e; font-size: 10.5px; font-weight: 700; }',
      '.' + CLS + '__sowtab-badge { padding: 1px 6px; border-radius: 999px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }',
      '.' + CLS + '__sowtab-badge--original { background: #e0e7ff; color: #3730a3; }',
      '.' + CLS + '__sowtab-badge--alternate { background: #fef3c7; color: #92400e; }',
      '.' + CLS + '__sowtab-badge--co { background: #ffe4e6; color: #9f1239; }',
      '.' + CLS + '__sowtab-namerow { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }',
      '.' + CLS + '__sowtab-name { font-size: 12.5px; font-weight: 600; color: #0f172a; min-width: 0; overflow: hidden;',
      '  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }',
      '.' + CLS + '__sowtab-name:empty { display: none; }',
      '.' + CLS + '__sowtab:not(.' + CLS + '__sowtab--active) .' + CLS + '__sowtab-name { color: #334155; }',
      '.' + CLS + '__sowtab-rename { flex: 0 0 auto; border: 0; background: transparent; color: #163c6e; cursor: pointer;',
      '  padding: 0 2px; font-size: 12px; line-height: 1.3; opacity: .7; }',
      '.' + CLS + '__sowtab-rename:hover { opacity: 1; }',
      '.' + CLS + '__sowtab-rename[hidden] { display: none !important; }',
      '.' + CLS + '__sowtab-input { flex: 1 1 auto; min-width: 0; font: inherit; font-size: 12.5px; font-weight: 600; color: #0f172a;',
      '  padding: 1px 6px; border: 1px solid #163c6e; border-radius: 5px; background: #fff; }',
      '.' + CLS + '__sowtab-counts { font-size: 10.5px; color: #475569; font-variant-numeric: tabular-nums; }',
      '.' + CLS + '__sowtab-state { font-size: 10.5px; font-weight: 600; }',
      '.' + CLS + '__sowtab-state--ok { color: #166534; }',
      '.' + CLS + '__sowtab-state--todo { color: #92400e; }',
      '.' + CLS + '__sowtabs-spacer { flex: 1 0 auto; }',
      '.' + CLS + '__sowtabs-meta { align-self: center; font-size: 11px; color: #64748b; white-space: nowrap; }',
      /* ── status line (the old SOW header) ── */
      T + '.' + CLS + '__sow-header { background: #fff !important; color: #475569 !important; cursor: default !important;',
      '  user-select: auto !important; padding: 7px 12px !important; gap: 8px !important; flex-wrap: wrap !important;',
      '  align-items: center !important; border-bottom: 1px solid #e2e8f0; }',
      T + '.' + CLS + '__sow-header:hover { background: #fff !important; }',
      T + '.' + CLS + '__sow-header:focus-visible { box-shadow: none !important; }',
      T + '.' + CLS + '__sow-caret, ' + T + '.' + CLS + '__sow-name, ' + T + '.' + CLS + '__sow-friendly,',
      T + '.' + CLS + '__sow-meta, ' + T + '.' + CLS + '__sow-groups-toggle { display: none !important; }',
      T + '.' + CLS + '__sow-header .' + CLS + '__warn-chips--sum { margin-left: 0 !important; }',
      '.' + CLS + '__scope-toggle { padding: 2px 9px; border: 1px solid #cbd5e1; border-radius: 999px; background: #fff;',
      '  color: #163c6e; font: 600 10.5px/1.4 system-ui, -apple-system, sans-serif; cursor: pointer; white-space: nowrap; }',
      '.' + CLS + '__scope-toggle:hover { background: #f1f5f9; }',
      '.' + CLS + '__status-sep { width: 1px; height: 16px; background: #e2e8f0; flex: 0 0 auto; }',
      '.' + CLS + '__scope-holder { flex-basis: 100%; width: 100%; }',
      '.' + CLS + '__scope-holder[hidden] { display: none !important; }',
      '.' + CLS + '__scope-holder .scw-ws-v2-scope { margin: 4px 0 0 !important; }',
      '.' + CLS + '__scope-empty { padding: 8px 2px; font-size: 11.5px; color: #64748b; }',
      T + 'tr.' + CLS + '__row--scope-hl > td { background: #eaf0f7 !important; box-shadow: inset 3px 0 0 #163c6e; }',
      /* ── diff bar: the fold handle stays; picker / readiness / gaps have moved ── */
      T + '.scw-sbd-inline-bar .scw-sbd-baseline, ' + T + '.scw-sbd-inline-bar .scw-sbd-ready,',
      T + '.scw-sbd-inline-bar .scw-sbd-bargap { display: none !important; }',
      /* ── column cards ── */
      T + '.' + CLS + '__th--label, ' + T + '.' + CLS + '__th--photos { background: #f8fafc; font-size: 0; }',
      T + '.' + CLS + '__head-cell--title { padding-top: 10px !important; }',
      T + '.' + CLS + '__head--pkg.' + CLS + '__head-cell--title { border-top: 2px solid transparent; }',
      T + '.' + CLS + '__head--pkg.' + CLS + '__head-cell--basis { border-top-color: #163c6e; }',
      T + '.' + CLS + '__head--pkg { background: #fff; }',
      T + '.' + CLS + '__head-eyebrow { display: none !important; }',
      '.' + CLS + '__card-who { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-right: 22px; }',
      T + '.' + CLS + '__card-who .' + CLS + '__head-title { margin: 0; font-size: 12px; text-transform: none; letter-spacing: 0; }',
      '.' + CLS + '__card-pkglabel { color: #64748b; font-weight: 500; font-size: 11px; }',
      '.' + CLS + '__basis-radio { display: inline-flex; align-items: center; gap: 4px; margin: 0; cursor: pointer;',
      '  font: 600 10.5px/1.3 system-ui, -apple-system, sans-serif; color: #163c6e; text-transform: none; letter-spacing: 0; }',
      '.' + CLS + '__basis-radio input { margin: 0; accent-color: #163c6e; cursor: pointer; }',
      '.' + CLS + '__basis-radio-label[hidden] { display: none !important; }',
      '.' + CLS + '__basis-badge { padding: 1px 7px; border-radius: 999px; background: #163c6e; color: #fff;',
      '  font-size: 9.5px; letter-spacing: .08em; font-weight: 800; text-transform: uppercase; }',
      '.' + CLS + '__basis-badge[hidden] { display: none !important; }',
      T + '.' + CLS + '__basis-toggle { margin-left: auto; }',
      T + '.' + CLS + '__head-total-value { font-size: 15px; }',
      T + '.' + CLS + '__head-name-label { display: none !important; }',
      T + '.' + CLS + '__head-name { margin-bottom: 4px; }',
      T + '.' + CLS + '__head-name-value { font-size: 11.5px; font-weight: 600; color: #475569; }',
      T + '.' + CLS + '__head-subtitle { margin-bottom: 4px; }',
      T + '.' + CLS + '__head-statusline { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }',
      T + '.' + CLS + '__head-btn--reopen-inline { margin: 0 0 0 auto; width: auto; }',
      '.' + CLS + '__gap { display: inline-block; padding: 2px 8px; border: 0; border-radius: 999px; background: #fef3c7;',
      '  color: #92400e; font: 700 10.5px/1.4 system-ui, -apple-system, sans-serif; cursor: pointer; }',
      '.' + CLS + '__gap:hover { background: #fde68a; }',
      '.' + CLS + '__gap[hidden] { display: none !important; }',
      /* SCW card */
      T + '.scw-bid-review__sow-name { display: none !important; }',
      '.' + CLS + '__basis-slot:empty { display: none; }',
      '.' + CLS + '__basis-slot .scw-sbd-baseline { display: flex; flex-wrap: wrap; align-items: center; gap: 6px;',
      '  padding: 0 0 6px !important; margin: 0 0 6px !important; background: transparent !important; border: 0 !important;',
      '  border-bottom: 1px solid #e2e8f0 !important; border-radius: 0 !important; }',
      '.' + CLS + '__basis-slot .scw-sbd-baseline > label { font: 600 11px/1.3 system-ui, -apple-system, sans-serif; color: #64748b; margin: 0; }',
      '.' + CLS + '__basis-slot .scw-sbd-baseline select { max-width: 100%; font-size: 11.5px; }',
      '.' + CLS + '__basis-slot .scw-sbd-baseline__meta { flex-basis: 100%; font-size: 10.5px; }',
      '.' + CLS + '__nextstep { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }',
      '.' + CLS + '__nextstep-label { font: 600 10.5px/1.3 system-ui, -apple-system, sans-serif; color: #64748b; }',
      '.' + CLS + '__ready { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid #e2e8f0;',
      '  background: #f8fafc; color: #475569; font: 700 10.5px/1.4 system-ui, -apple-system, sans-serif; }',
      '.' + CLS + '__ready[hidden] { display: none !important; }',
      '.' + CLS + '__ready--ready { background: #dcfce7; color: #166534; border-color: #bbf7d0; }',
      '.' + CLS + '__ready--needs-basis, .' + CLS + '__ready--needs-note, .' + CLS + '__ready--needs-pdf {',
      '  background: #fffbeb; color: #b45309; border-color: #fde68a; }',
      '.' + CLS + '__ready--stale { background: #fff1f2; color: #9f1239; border-color: #fecdd3; }',
      /* sub card actions */
      T + '.' + CLS + '__head-cell--actions { position: relative; }',
      '.' + CLS + '__card-actions-line { font: 400 10.5px/1.3 system-ui, -apple-system, sans-serif; color: #64748b; margin-bottom: 5px; }',
      '.' + CLS + '__card-actions-line b { color: #0f172a; }',
      '.' + CLS + '__card-actions-row { display: flex; align-items: center; gap: 6px; }',
      '.' + CLS + '__card-actions-spacer { flex: 1 0 auto; }',
      T + '.' + CLS + '__head-btn.' + CLS + '__card-primary { display: inline-flex; align-items: center; width: auto;',
      '  margin: 0; padding: 4px 10px; border-radius: 6px; background: #163c6e; color: #fff; border: 1px solid #163c6e;',
      '  font-weight: 700; white-space: nowrap; }',
      T + '.' + CLS + '__head-btn.' + CLS + '__card-primary:hover { background: #1f4a73; }',
      '.' + CLS + '__menu-toggle { flex: 0 0 auto; padding: 3px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff;',
      '  color: #0f172a; font: 700 13px/1 system-ui, -apple-system, sans-serif; cursor: pointer; }',
      '.' + CLS + '__menu-toggle:hover { background: #f1f5f9; }',
      '.' + CLS + '__menu { position: absolute; right: 10px; top: calc(100% - 6px); z-index: 40; min-width: 260px;',
      '  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 6px 20px rgba(15, 23, 42, .12);',
      '  padding: 6px 0; text-align: left; text-transform: none; letter-spacing: 0; }',
      '.' + CLS + '__menu[hidden] { display: none !important; }',
      '.' + CLS + '__menu > .' + CLS + '__menu-item, ' + T + '.' + CLS + '__menu > .' + CLS + '__head-btn.' + CLS + '__menu-item {',
      '  display: block; width: 100%; margin: 0; padding: 7px 12px; border: 0; border-radius: 0; background: transparent;',
      '  color: #0f172a; font: 600 12px/1.3 system-ui, -apple-system, sans-serif; text-align: left; text-decoration: none;',
      '  cursor: pointer; white-space: normal; }',
      '.' + CLS + '__menu > .' + CLS + '__menu-item:hover, ' + T + '.' + CLS + '__menu > .' + CLS + '__head-btn.' + CLS + '__menu-item:hover {',
      '  background: #f1f5f9; color: #0f172a; }',
      '.' + CLS + '__menu-item--danger, ' + T + '.' + CLS + '__menu > .' + CLS + '__menu-item--danger { color: #9f1239 !important; }',
      '.' + CLS + '__menu-item[hidden] { display: none !important; }',
      '.' + CLS + '__menu-sep { height: 1px; background: #e2e8f0; margin: 4px 0; }',
      '.' + CLS + '__menu-sep + .' + CLS + '__menu-sep { display: none; }',
      /* column labels row, directly above the line items */
      '.' + CLS + '__collabels td { padding: 5px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;',
      '  font: 700 10.5px/1.3 system-ui, -apple-system, sans-serif; color: #64748b; letter-spacing: .02em; }',
      '.' + CLS + '__collabel--photos { text-align: center; }',
      '.' + CLS + '__collabel--sow { color: #163c6e; border-right: 2px solid #cbd5e1; }',
      '.' + CLS + '__collabel--pkg { color: #0f172a; border-right: 1px solid #e2e8f0; }',
      '.' + CLS + '__collabel-id { color: #94a3b8; font-weight: 500; margin-left: 4px; }',
      '.' + CLS + '__collabel-basis { margin-left: 6px; padding: 0 6px; border-radius: 999px; background: #163c6e; color: #fff;',
      '  font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }',
      '.' + CLS + '__collabel-basis[hidden] { display: none !important; }',
      /* documents row: its own band under the cards, tighter */
      T + '.' + CLS + '__docs-cell { padding: 8px 12px 10px; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  ns.header = {
    enabled:     enabled,
    afterRender: afterRender,
    syncAll:     syncAll,
    setActive:   setActive,
    activeSowId: activeSowId,
    setBasis:    setBasis,
    wire:        wire,
    // exposed for tests
    countsText:  countsText,
    classify:    classify,
    stateOf:     stateOf
  };
})();
/*** END BID REVIEW V2 — HEADER REWORK ***************************************/
