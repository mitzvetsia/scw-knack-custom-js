/*** BID REVIEW V2 — WARNINGS ************************************************
 *
 * Surfaces the SAME issue warnings the worksheet-v2 Build-SOW grid shows
 * (missing required photos, disconnected cam/reader, wrong accessory,
 * non-blank SCW notes) on the comparison grid's SOW column + MDF/IDF
 * group headers.
 *
 * Detection sources (all SOW ITEMS ONLY — bid records are never analyzed):
 *   - photos / disconnected / notes: delegated to worksheet-v2's analyzer
 *     pointed at view_3921. Those checks read object-level fields
 *     (field_2219 bucket, field_2197 connected device, field_1953 SCW
 *     notes) + scrape the view's photo cells (field_771 / field_2446 /
 *     field_2447), all of which view_3921 mirrors from view_3610.
 *   - wrong accessory: computed LOCALLY here by scraping each SOW item's
 *     own row field_2244 cell (the per-accessory match-check spans). On
 *     scene_1155 the accessory child records aren't in view_3921's model,
 *     so worksheet-v2's accessory-record approach finds nothing — but the
 *     parent row still renders one connection-value span per accessory with
 *     its Yes/No match value (same source v1's connected-records.js reads).
 *     An explicit No / False on any accessory flags the parent.
 *
 * Public API:
 *   ns.warnings.analyze(sowItems)           — run once per render
 *   ns.warnings.issuesFor(sowItemId)        — [] or [issueType, ...]
 *   ns.warnings.chipsHtml(sowItemId)        — per-cell chip markup
 *   ns.warnings.summaryChipsHtml(ids)       — aggregate chips (L1 header)
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  var SOW_VIEW = (ns.CONFIG && ns.CONFIG.sourceViewKeys && ns.CONFIG.sourceViewKeys[1]) ||
                 'view_3921';
  var TYPES = ['photos', 'disconnected', 'bracket', 'notes', 'surveyAdded'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // worksheet-v2 analyzer (same bundle, registered on app boot regardless
  // of scene). Null if unavailable so we fail soft.
  function wv2() {
    var w = window.SCW && window.SCW.worksheetV2 && window.SCW.worksheetV2.warnings;
    return (w && typeof w.analyze === 'function') ? w : null;
  }

  // Wrong-accessory maps for the current render.
  var bracketByParent    = Object.create(null);
  var bracketByAccessory = Object.create(null);

  // Walk up from a node to the owning SOW line-item record id (24-hex).
  function ownerRecordId(el) {
    var node = el;
    while (node && node.getAttribute) {
      var id = node.getAttribute('data-record-id') ||
               node.getAttribute('data-scw-ws-v2-record') ||
               node.getAttribute('id') || '';
      if (/^[a-f0-9]{24}$/i.test(id)) return id;
      node = node.parentNode;
    }
    return '';
  }

  /** Wrong-accessory detection for the comparison grid. The mounting-bracket
   *  RECORDS are filtered out of view_3921, so they're not rows/model records
   *  we can read directly (the v2 own-field approach finds nothing). Instead
   *  the field_2244 cell on each PARENT line item renders one connection-value
   *  span per attached accessory (span id = accessory id, text = Yes/No) — the
   *  same representation v1 reads. Scan the WHOLE view element (the cell may be
   *  relocated into a worksheet card by device-worksheet), flag any No/False
   *  accessory span, and roll up to the owning parent record. */
  // Knack attribute hashes of a view's loaded records ([] when absent).
  function modelRecords(viewKey) {
    var out = [];
    try {
      var kv = viewKey && window.Knack && Knack.views && Knack.views[viewKey];
      var models = (kv && kv.model && kv.model.data && kv.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var m = models[i];
        var a = m && (m.attributes || (typeof m.toJSON === 'function' ? m.toJSON() : null));
        if (a && a.id) out.push(a);
      }
    } catch (e) { /* best-effort */ }
    return out;
  }

  function buildBracketMaps() {
    var byParent = Object.create(null);
    var byAccessory = Object.create(null);
    // Source 0 — the catalog's own answer (product-catalog.js, 2026-10-13),
    // nothing stamped. The accessory line items are rows of view_3921 like
    // their parents (transform.js weaves each one under its parent by its
    // field_2464 pointer), so the audit runs over the view's own records.
    // Wherever the catalog answers it is authoritative: a fit clears any
    // stale stamp below, a misfit is flagged with no stamp at all; where it
    // cannot say, the stamped sources decide.
    var cleared = Object.create(null);
    try {
      var cat = window.SCW && window.SCW.catalog;
      if (cat && typeof cat.auditAccessories === 'function') {
        var audit = cat.auditAccessories(modelRecords(SOW_VIEW), { product: 'field_1949', parent: 'field_2464' });
        if (audit && audit.ready) {
          for (var okId in audit.ok) cleared[okId] = true;
          for (var badId in audit.wrong) {
            byAccessory[badId] = true;
            if (audit.wrong[badId]) byParent[audit.wrong[badId]] = true;
          }
        }
      }
    } catch (e) { /* the stamped sources below still run */ }
    var view = document.getElementById(SOW_VIEW);
    if (view) {
      // Source 1 — raw per-accessory spans in the parent's field_2244 cell.
      var cells = view.querySelectorAll(
        'td.field_2244, td[data-field-key="field_2244"]');
      for (var c = 0; c < cells.length; c++) {
        var spans = cells[c].querySelectorAll('span[id][data-kn="connection-value"]');
        if (!spans.length) continue;
        var parentId = ownerRecordId(cells[c]);
        for (var s = 0; s < spans.length; s++) {
          var accId = (spans[s].id || '').trim();
          var v = (spans[s].textContent || '').trim().toLowerCase();
          if (accId && (v === 'no' || v === 'false') && !cleared[accId]) {
            byAccessory[accId] = true;
            if (parentId) byParent[parentId] = true;
          }
        }
      }
      // Source 2 — connected-records.js already computes the mismatch on
      // view_3921 and tags the offending accessory item .scw-cr-item-warn
      // (accessory id on the inner .scw-cr-remove[data-record-id]). This is
      // the authoritative, parent-derived signal.
      var warns = view.querySelectorAll('.scw-cr-item-warn');
      for (var w2 = 0; w2 < warns.length; w2++) {
        var rem = warns[w2].querySelector('.scw-cr-remove[data-record-id]');
        var aId = rem ? (rem.getAttribute('data-record-id') || '').trim() : '';
        if (aId && cleared[aId]) continue;   // the catalog says it fits — a stale stamp loses
        var pId = ownerRecordId(warns[w2]);
        if (aId) byAccessory[aId] = true;
        if (pId) byParent[pId] = true;
      }
    }
    return { byParent: byParent, byAccessory: byAccessory };
  }

  function analyze(sowItems) {
    var w = wv2();
    if (w) {
      try { w.analyze(sowItems || [], SOW_VIEW); }
      catch (e) {
        if (ns.CONFIG && ns.CONFIG.debug) console.warn('[scw-br-v2] warnings analyze failed', e);
      }
    }
    var maps = buildBracketMaps();
    bracketByParent    = maps.byParent;
    bracketByAccessory = maps.byAccessory;
    // Feed the offending bracket ids to worksheet-v2 so the embedded card's
    // per-accessory chit (isAccessoryMismatch) lights up on this scene too.
    if (w && typeof w.mergeAccessoryMismatch === 'function') {
      try { w.mergeAccessoryMismatch(bracketByAccessory); } catch (e2) { /* ignore */ }
    }
  }

  function issuesFor(sowItemId) {
    if (!sowItemId) return [];
    var out = [];
    var w = wv2();
    if (w && typeof w.getIssuesFor === 'function') {
      var base = [];
      try { base = w.getIssuesFor(SOW_VIEW, sowItemId) || []; } catch (e) { base = []; }
      for (var i = 0; i < base.length; i++) {
        // Bracket comes from the parent-span scan above (brackets are
        // filtered out of view_3921, so the analyzer can't see them).
        if (base[i] !== 'bracket' && out.indexOf(base[i]) === -1) out.push(base[i]);
      }
    }
    if (bracketByParent[sowItemId] && out.indexOf('bracket') === -1) out.push('bracket');
    return out;
  }

  /** Per-cell chips — icon-only, one per issue type the SOW item has.
   *  `noteText` (optional) is the SOW item's actual SCW Notes text — when
   *  present, the "notes" chip's hover shows the note itself instead of
   *  just the generic "has SCW notes" label. */
  function chipsHtml(sowItemId, noteText) {
    var w = wv2();
    if (!w) return '';
    var issues = issuesFor(sowItemId);
    if (!issues.length) return '';
    var ICONS  = w.ICONS  || {};
    var LABELS = w.LABELS || {};
    var parts = [];
    for (var t = 0; t < TYPES.length; t++) {
      var k = TYPES[t];
      if (issues.indexOf(k) === -1) continue;
      var title = (k === 'notes' && noteText) ? noteText : (LABELS[k] || k);
      parts.push('<span class="scw-bid-review-v2__warn-chip" ' +
        'data-issue-type="' + k + '" title="' + esc(title) + '">' +
        (ICONS[k] || '') + '</span>');
    }
    return parts.length
      ? '<div class="scw-bid-review-v2__warn-chips">' + parts.join('') + '</div>'
      : '';
  }

  /** Aggregate chips for a set of SOW item ids — count + label per issue
   *  type. Rendered into the MDF/IDF (L1) group header. */
  function summaryChipsHtml(ids) {
    var w = wv2();
    if (!w || !ids || !ids.length) return '';
    var ICONS  = w.ICONS  || {};
    var LABELS = w.LABELS || {};
    var counts = { photos: 0, disconnected: 0, bracket: 0, notes: 0, surveyAdded: 0 };
    for (var i = 0; i < ids.length; i++) {
      var issues = issuesFor(ids[i]);
      for (var j = 0; j < issues.length; j++) {
        if (counts[issues[j]] != null) counts[issues[j]]++;
      }
    }
    var parts = [];
    for (var t = 0; t < TYPES.length; t++) {
      var k = TYPES[t];
      var n = counts[k];
      if (!n) continue;
      // Clickable (see wireChipClicks below): the title says so, like the
      // worksheet-v2 summary chips.
      var title = (LABELS[k] || k) + ' — click to highlight the ' + n +
                  ' affected row' + (n === 1 ? '' : 's');
      parts.push('<span class="scw-bid-review-v2__warn-chip scw-bid-review-v2__warn-chip--sum" ' +
        'data-issue-type="' + k + '" role="button" tabindex="0" title="' + esc(title) + '">' +
        (ICONS[k] || '') +
        '<span class="scw-bid-review-v2__warn-chip-n">' + n + '</span>' +
        '<span class="scw-bid-review-v2__warn-chip-l">' + esc(LABELS[k] || k) + '</span>' +
        '</span>');
    }
    return parts.length
      ? '<span class="scw-bid-review-v2__warn-chips scw-bid-review-v2__warn-chips--sum">' +
          parts.join('') + '</span>'
      : '';
  }

  // ── Summary-chip click → reveal + flash the affected rows ─────────
  // Mirrors worksheet-v2's highlightIssueType. Scope = the MDF/IDF group
  // whose header row holds the chip, or the whole SOW section for the
  // SOW-header chip. A matching row can be hidden by a collapsed subgroup
  // AND a collapsed L1 group (and the SOW section itself) — expand each by
  // clicking its header so init.js's persisted collapse state stays honest,
  // then scroll the first match into view and flash all of them.

  /** The grid rows a summary chip speaks for. */
  function scopeRows(chip) {
    var rows = [];
    var grpHead = chip.closest('tr.scw-bid-review-v2__group-header');
    if (grpHead) {
      var n = grpHead.nextElementSibling;
      while (n && !n.classList.contains('scw-bid-review-v2__group-header')) {
        if (n.classList.contains('scw-bid-review-v2__row')) rows.push(n);
        n = n.nextElementSibling;
      }
      return rows;
    }
    var sec = chip.closest('.scw-bid-review-v2__sow');
    var all = sec ? sec.querySelectorAll('tr.scw-bid-review-v2__row') : [];
    for (var i = 0; i < all.length; i++) rows.push(all[i]);
    return rows;
  }

  /** Expand whatever is folding `row` away: the SOW section, then the
   *  row's own subgroup (if it sits in one), then its L1 group — each by
   *  clicking the header so init.js's walkers + persisted state do the
   *  work. Innermost first on purpose: the L1 walker reads each subgroup's
   *  --collapsed flag as it opens, so un-folding the subgroup before the L1
   *  leaves every sibling row in a consistent state. (Stopping as soon as
   *  the row itself loses --hidden is not enough — a subgroup expand
   *  un-hides its rows even while the L1 above is still collapsed.) */
  function revealRow(row) {
    var sec = row.closest('.scw-bid-review-v2__sow');
    if (sec && sec.classList.contains('scw-bid-review-v2__sow--collapsed')) {
      var hdr = sec.querySelector('.scw-bid-review-v2__sow-header');
      if (hdr) hdr.click();
    }
    var subDone = !row.classList.contains('scw-bid-review-v2__row--in-subgroup');
    var prev = row.previousElementSibling;
    while (prev) {
      if (!subDone && prev.classList.contains('scw-bid-review-v2__subgroup-header')) {
        if (prev.classList.contains('scw-bid-review-v2__subgroup-header--collapsed')) prev.click();
        subDone = true;
      } else if (prev.classList.contains('scw-bid-review-v2__group-header')) {
        if (prev.classList.contains('scw-bid-review-v2__group-header--collapsed')) prev.click();
        break;
      }
      prev = prev.previousElementSibling;
    }
  }

  function highlightIssueType(chip) {
    var type = chip.getAttribute('data-issue-type');
    if (!type) return [];
    var rows = scopeRows(chip);
    var matches = [];
    var sel = '.scw-bid-review-v2__sow-cell .scw-bid-review-v2__warn-chip[data-issue-type="' + type + '"]';
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].querySelector(sel)) matches.push(rows[i]);
    }
    if (!matches.length) return matches;
    revealRow(matches[0]);
    try { matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* jsdom */ }
    for (var m = 0; m < matches.length; m++) {
      (function (tr) {
        tr.classList.remove('scw-bid-review-v2__row--warn-flash');
        void tr.offsetWidth;          // restart the animation
        tr.classList.add('scw-bid-review-v2__row--warn-flash');
        setTimeout(function () { tr.classList.remove('scw-bid-review-v2__row--warn-flash'); }, 2200);
      })(matches[m]);
    }
    return matches;
  }

  /** Bound once, in the CAPTURE phase: the chips sit inside the L1 header
   *  row and the SOW header, whose bubble-phase click handlers (init.js)
   *  would otherwise fold the group / section on the same click. */
  function wireChipClicks() {
    if (document.documentElement.hasAttribute('data-scw-br-v2-warnchip-bound')) return;
    document.documentElement.setAttribute('data-scw-br-v2-warnchip-bound', '1');
    function chipOf(e) {
      return e.target && e.target.closest &&
             e.target.closest('.scw-bid-review-v2__warn-chip--sum[data-issue-type]');
    }
    document.addEventListener('click', function (e) {
      var chip = chipOf(e);
      if (!chip) return;
      e.preventDefault();
      e.stopPropagation();
      highlightIssueType(chip);
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var chip = chipOf(e);
      if (!chip || e.target !== chip) return;
      e.preventDefault();
      e.stopPropagation();
      highlightIssueType(chip);
    }, true);
  }
  wireChipClicks();

  // Reconcile grid painted before the catalog landed: once it arrives,
  // rebuild through v1's rerender (a no-op before the first render) so the
  // chips carry the derived verdicts.
  try {
    if (window.SCW && window.SCW.catalog && typeof window.SCW.catalog.ready === 'function') {
      window.SCW.catalog.ready(function () {
        var v1 = window.SCW && window.SCW.bidReview;
        if (v1 && typeof v1.rerender === 'function') {
          try { v1.rerender(); } catch (e) { /* next render carries it */ }
        }
      });
    }
  } catch (e) { /* no catalog on this page */ }

  // ── Discontinued products bar (2026-10-13) ───────────────────────────
  // A full-width warning bar under a SOW section's status line whenever any
  // of that SOW's line items carries a product the catalog no longer offers
  // (worksheet-v2 card.isDiscontinued → product-catalog.js). Names every such
  // product with its count; a click on one highlights its rows and scrolls
  // to the first (the scope-tile gesture), a second click clears.
  var DISC = 'scw-bid-review-v2__disc';
  var DISC_STYLE_ID = DISC + '-css';
  var DISC_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';

  function isDiscontinuedItem(rec) {
    try {
      var w = window.SCW && window.SCW.worksheetV2 && window.SCW.worksheetV2.card;
      if (w && typeof w.isDiscontinued === 'function') return !!w.isDiscontinued(rec, SOW_VIEW);
      var cat = window.SCW && window.SCW.catalog;
      var raw = rec['field_1949_raw']; if (Array.isArray(raw)) raw = raw[0];
      var pid = raw && raw.id;
      return !!(cat && pid && cat.isDisabled(String(pid)) === true);
    } catch (e) { return false; }
  }
  function productLabelOf(rec) {
    var raw = rec['field_1949_raw']; if (Array.isArray(raw)) raw = raw[0];
    var s = raw && raw.identifier ? String(raw.identifier) : String(rec['field_1949'] == null ? '' : rec['field_1949']);
    return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || 'Unnamed product';
  }
  function onSow(rec, sowId) {
    var raw = rec['field_2154_raw'];
    var ids = [];
    if (Array.isArray(raw)) { for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) ids.push(String(raw[i].id)); }
    else if (raw && raw.id) ids.push(String(raw.id));
    if (!/^[a-f0-9]{24}$/i.test(sowId || '')) return ids.length === 0;   // the no-SOW section
    return ids.indexOf(sowId) !== -1;
  }
  /** [{ name, ids }] of the SOW's discontinued line items, by product name. */
  function collectDiscontinued(sowItems, sowId) {
    var out = [], byName = Object.create(null);
    for (var i = 0; i < (sowItems || []).length; i++) {
      var rec = sowItems[i];
      if (!rec || !rec.id || !onSow(rec, sowId) || !isDiscontinuedItem(rec)) continue;
      var name = productLabelOf(rec);
      var e = byName[name];
      if (!e) { e = byName[name] = { name: name, ids: [] }; out.push(e); }
      e.ids.push(rec.id);
    }
    out.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }); });
    return out;
  }
  function discontinuedBarHtml(list) {
    if (!list || !list.length) return '';
    var n = 0;
    for (var i = 0; i < list.length; i++) n += list[i].ids.length;
    var h = '<span class="' + DISC + '-icon">' + DISC_SVG + '</span>' +
      '<span class="' + DISC + '-text"><b>' + n + ' discontinued product' + (n === 1 ? '' : 's') +
      '</b> on this scope \u2014 replace ' + (n === 1 ? 'it' : 'them') + ' before it goes out:</span>';
    for (var j = 0; j < list.length; j++) {
      var c = list[j].ids.length;
      h += '<button type="button" class="' + DISC + '-chip" aria-pressed="false" ' +
        'data-scw-br-v2-disc-ids="' + esc(list[j].ids.join(',')) + '" ' +
        'title="Highlight ' + (c === 1 ? 'this line item' : 'these ' + c + ' line items') + '">' +
        esc(list[j].name) + (c > 1 ? '<span class="' + DISC + '-n">\u00d7' + c + '</span>' : '') + '</button>';
    }
    return h;
  }
  function injectDiscStyles() {
    if (document.getElementById(DISC_STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = DISC_STYLE_ID;
    s.textContent = [
      '.' + DISC + ' { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; padding: 9px 14px;',
      '  background: #fffbeb; border-top: 1px solid #fcd34d; border-bottom: 1px solid #fcd34d; box-shadow: inset 4px 0 0 #b45309;',
      '  color: #78350f; font: 500 13px/1.35 system-ui, -apple-system, sans-serif; }',
      '.' + DISC + '-icon { display: inline-flex; color: #b45309; }',
      '.' + DISC + '-text b { font-weight: 800; color: #7c2d12; }',
      '.' + DISC + '-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border: 1px solid #f59e0b;',
      '  border-radius: 999px; background: #fff; color: #7c2d12; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }',
      '.' + DISC + '-chip:hover { background: #fef3c7; }',
      '.' + DISC + '-chip.is-on { background: #b45309; border-color: #b45309; color: #fff; }',
      '.' + DISC + '-n { font-weight: 800; opacity: .8; }'
    ].join('\n');
    document.head.appendChild(s);
  }
  /** Mount / refresh / remove the bar on one SOW section (idempotent). */
  function mountDiscontinuedBar(section, sowItems) {
    if (!section || !section.querySelector) return;
    var sowId = section.getAttribute('data-sow-id') || '';
    var list = collectDiscontinued(sowItems || ns.lastSowItems || [], sowId);
    var bar = section.querySelector(':scope > .' + DISC);
    var h = discontinuedBarHtml(list);
    if (!h) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    injectDiscStyles();
    if (!bar) {
      bar = document.createElement('div');
      bar.className = DISC;
      bar.setAttribute('role', 'alert');
      var head = section.querySelector(':scope > .scw-bid-review-v2__sow-header');
      if (head) section.insertBefore(bar, head.nextSibling);
      else section.insertBefore(bar, section.firstChild);
    }
    if (bar.getAttribute('data-scw-sig') !== h) { bar.innerHTML = h; bar.setAttribute('data-scw-sig', h); }
  }
  var ROW_HL = 'scw-bid-review-v2__row--scope-hl';
  function clearDiscHighlight(section) {
    var lit = section.querySelectorAll('.' + ROW_HL);
    for (var c = 0; c < lit.length; c++) lit[c].classList.remove(ROW_HL);
    var on = section.querySelectorAll('.' + DISC + '-chip.is-on');
    for (var o = 0; o < on.length; o++) { on[o].classList.remove('is-on'); on[o].setAttribute('aria-pressed', 'false'); }
  }
  if (!document.documentElement.hasAttribute('data-scw-br-v2-disc-bound')) {
    document.documentElement.setAttribute('data-scw-br-v2-disc-bound', '1');
    document.addEventListener('click', function (e) {
      var chip = e.target && e.target.closest && e.target.closest('[data-scw-br-v2-disc-ids]');
      if (!chip) return;
      var section = chip.closest('.scw-bid-review-v2__sow');
      if (!section) return;
      e.preventDefault();
      var wasOn = chip.classList.contains('is-on');
      clearDiscHighlight(section);
      if (wasOn) return;
      chip.classList.add('is-on');
      chip.setAttribute('aria-pressed', 'true');
      var ids = (chip.getAttribute('data-scw-br-v2-disc-ids') || '').split(',');
      var first = null;
      for (var i = 0; i < ids.length; i++) {
        if (!ids[i]) continue;
        var rows = section.querySelectorAll('tr.scw-bid-review-v2__row[data-sow-item-id="' + ids[i] + '"]');
        for (var k = 0; k < rows.length; k++) { rows[k].classList.add(ROW_HL); if (!first) first = rows[k]; }
      }
      if (first) { try { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { /* ignore */ } }
    });
  }

  ns.warnings = {
    analyze:            analyze,
    collectDiscontinued:   collectDiscontinued,
    discontinuedBarHtml:   discontinuedBarHtml,
    mountDiscontinuedBar:  mountDiscontinuedBar,
    issuesFor:          issuesFor,
    chipsHtml:          chipsHtml,
    summaryChipsHtml:   summaryChipsHtml,
    highlightIssueType: highlightIssueType
  };
})();
/*** END BID REVIEW V2 — WARNINGS ********************************************/
