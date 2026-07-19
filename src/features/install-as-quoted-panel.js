/*****  Install "As Quoted" Panel  *****************************************/
/**
 * On the manage-deployment page (scene_1311), each install line item
 * (view_4093 / view_4056) was created from an "OG" proposed line item now
 * surfaced in the hidden grid view_4072. The install record points back to
 * its proposed record via field_2819 (holds the proposed record id).
 *
 * This module folds an "As Quoted" collapsible panel into each install card's
 * detail, showing the ORIGINAL quoted values for reference alongside the
 * (editable) install values: product, MDF/IDF, connected devices / connected
 * to, existing/exterior/plenum, and survey notes.
 *
 * Read-only. Mirrors install-config-subpanel.js's merge/observe machinery so
 * it survives worksheet-v2's aggressive card rebuilds:
 *   • re-run on knack-view-render of the install views + view_4072
 *   • MutationObserver on the v2 container (cards rebuild on every data notify)
 *   • staggered passes to catch the async v2 paint
 *   • _selfMutating guard so our own DOM writes don't loop the observer
 *
 * ⚠️ FIELD KEYS: PROPOSED_FIELDS below are the SOW Line Item keys (the OG
 * proposal is the accepted SOW). If view_4072 is a different object, adjust
 * these — everything else is generic.
 */
(function () {
  'use strict';

  // view_4093 = Implementation install worksheet; view_4056 = "WHAT WE'RE
  // INSTALLING" (same install object). No-ops on any scene where view_4072
  // isn't present (the proposed index comes back empty).
  var INSTALL_VIEWS = ['view_4093', 'view_4056'];
  var PROPOSED_VIEW = 'view_4072';     // hidden grid of the OG proposed line items
  var LINK_FIELD    = 'field_2819';    // on the install record → proposed record id

  // ── Provenance (which SOW/CO + which accepted quote) ────────────
  // OG line item → SOW(s) via field_2154 (must be a column on view_4072).
  // SOW number → accepted quote resolves through the acceptance grid
  // (view_3914): its proposal connection's identifier embeds both —
  // "<project#>-<SOW#> | <quote#>" — so we parse rather than needing a
  // SOW grid on the scene. CO detection = SOW number's CO suffix (the
  // system-generated numbering: SW1418 base, SW1418CO change order).
  var ACCEPT_VIEW     = 'view_3914';
  var ACCEPT_PROPOSAL = 'field_2755';  // REL_SOW_published proposal (connection)
  var ACCEPT_SIGNED   = 'field_2766';  // FLAG_agreement signed

  // Field keys on the PROPOSED line-item object (view_4072). Best-guess SOW
  // Line Item keys (DEFAULT_FIELDS in worksheet-v2/config.js). CONFIRM/adjust
  // if view_4072 renders a different object.
  var PF = {
    product:          'field_1949',    // Product (connection → display label)
    mdfIdf:           'field_1946',    // MDF / IDF location
    connectedDevices: 'field_1957',    // Connected Devices (multi, on NVR/switch)
    connectedTo:      'field_2197',    // Connected To (single, on cam/reader)
    surveyNotes:      'field_2412',    // Survey notes
    existCabling:     'field_2461',    // Existing cabling
    exterior:         'field_1984',    // Exterior
    plenum:           'field_1983',    // Plenum
    sow:              'field_2154'     // SOW connection(s) — the provenance hop
  };

  // Compact label/value grid groups (survey notes rendered full-width below).
  var GROUPS = [
    { label: 'Product',           key: 'product' },
    { label: 'MDF / IDF',         key: 'mdfIdf' },
    { label: 'Connected Devices', key: 'connectedDevices' },
    { label: 'Connected To',      key: 'connectedTo' },
    { label: 'Existing',          key: 'existCabling' },
    { label: 'Exterior',          key: 'exterior' },
    { label: 'Plenum',            key: 'plenum' }
  ];

  var PANEL_CLS = 'scw-as-quoted';
  var CSS_ID    = 'scw-as-quoted-css';

  var _selfMutating = false;
  var _lastHash     = '';

  // ── helpers ─────────────────────────────────────────────────────
  function viewModels(viewKey) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      return (v && v.model && v.model.data && v.model.data.models) || [];
    } catch (e) { return []; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // Resolve the linked proposed record id — handles a connection field
  // (field_XXXX_raw[0].id) OR a plain text field holding the 24-hex id.
  function readLinkId(attrs, key) {
    if (!attrs) return '';
    var raw = attrs[key + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
    var v = attrs[key];
    if (v == null) return '';
    var m = String(v).match(/[a-f0-9]{24}/i);
    return m ? m[0] : '';
  }
  // Display value for a field — joins connection identifiers, strips HTML,
  // renders booleans as Yes/No.
  function readVal(attrs, key) {
    if (!attrs || !key) return '';
    var raw = attrs[key + '_raw'];
    if (Array.isArray(raw)) {
      return raw.map(function (r) {
        return (r && (r.identifier != null ? r.identifier : r.id)) || '';
      }).filter(Boolean).map(stripHtml).join(', ');
    }
    if (raw != null && typeof raw === 'object' && raw.identifier != null) return stripHtml(raw.identifier);
    var v = attrs[key];
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return stripHtml(v);
  }

  // ── indexes ─────────────────────────────────────────────────────
  // proposed record id → its attributes hash.
  function buildProposedIndex() {
    var idx = Object.create(null);
    var models = viewModels(PROPOSED_VIEW);
    for (var i = 0; i < models.length; i++) {
      var a = models[i] && models[i].attributes;
      if (a && a.id) idx[a.id] = a;
    }
    return idx;
  }
  // install record id → linked proposed record id (from field_2819).
  function buildInstallLinkIndex() {
    var idx = Object.create(null);
    for (var v = 0; v < INSTALL_VIEWS.length; v++) {
      var models = viewModels(INSTALL_VIEWS[v]);
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        if (!a || !a.id) continue;
        var pid = readLinkId(a, LINK_FIELD);
        if (pid) idx[a.id] = pid;
      }
    }
    return idx;
  }

  // ── provenance resolution ───────────────────────────────────────
  function normToken(s) {
    return stripHtml(s).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }
  /** Acceptance index: normalized SOW token → { quote, proposalId, signed }.
   *  A SOW can carry several acceptances (revisions/duplicates) — signed
   *  wins; among equals the latest quote number (date-prefixed) wins. */
  function buildAcceptanceIndex() {
    var idx = Object.create(null);
    var models = viewModels(ACCEPT_VIEW);
    for (var i = 0; i < models.length; i++) {
      var a = models[i] && models[i].attributes;
      if (!a) continue;
      var raw = a[ACCEPT_PROPOSAL + '_raw'];
      var ref = Array.isArray(raw) ? raw[0] : raw;
      if (!ref || !ref.id) continue;
      var ident = stripHtml(ref.identifier || '');      // "60524852230-SW1418CO | 20260716-10730"
      var parts = ident.split('|');
      if (parts.length < 2) continue;
      var left  = parts[0].trim();
      var quote = parts[1].trim();
      var segs  = left.split('-');
      var token = normToken(segs[segs.length - 1]);      // "SW1418CO"
      if (!token) continue;
      var signed = stripHtml(a[ACCEPT_SIGNED] || '').toLowerCase() === 'yes';
      var cur = idx[token];
      var better = !cur ||
        (signed && !cur.signed) ||
        (signed === cur.signed && quote > cur.quote);
      if (better) idx[token] = { quote: quote, proposalId: ref.id, signed: signed };
    }
    return idx;
  }
  /** Origins for one OG line item: [{ label, isCo, quote, proposalId,
   *  signed }] — one entry per SOW the item connects to. */
  function resolveOrigins(pa, acceptIdx) {
    var out = [];
    var raw = pa && pa[PF.sow + '_raw'];
    if (!Array.isArray(raw)) return out;
    for (var i = 0; i < raw.length; i++) {
      if (!raw[i] || !raw[i].id) continue;
      var label = stripHtml(raw[i].identifier || '') || raw[i].id;
      var token = normToken(label);
      var acc = (acceptIdx && acceptIdx[token]) || null;
      out.push({
        label:      label,
        isCo:       /CO$/.test(token),
        quote:      acc ? acc.quote      : '',
        proposalId: acc ? acc.proposalId : '',
        signed:     acc ? acc.signed     : false
      });
    }
    // Base scope first, COs after — reads as "created on X, changed by Y".
    out.sort(function (a, b) { return (a.isCo ? 1 : 0) - (b.isCo ? 1 : 0); });
    return out;
  }
  function originChipHtml(o) {
    return '<span class="scw-aq-origin' + (o.isCo ? ' scw-aq-origin--co' : '') + '" ' +
      'title="' + esc(o.isCo ? 'Change-order item' : 'Base-scope item') +
      (o.quote ? ' · Quote ' + esc(o.quote) : '') + '">' +
      esc(o.label) + (o.isCo ? '' : '') + '</span>';
  }
  /** #<current deploy route>/sow-published-proposal-details/<id> — same
   *  child route the acceptance grid links through. Empty when the hash
   *  doesn't look like a deploy page (no link, plain text). */
  function proposalHref(proposalId) {
    if (!proposalId) return '';
    var m = (window.location.hash || '').match(/^#(.*\/deploy\/[a-f0-9]{24})/);
    return m ? ('#' + m[1] + '/sow-published-proposal-details/' + proposalId) : '';
  }

  // ── panel markup ────────────────────────────────────────────────
  function buildPanel(pa, origins) {
    origins = origins || [];
    var panel = document.createElement('div');
    panel.className = PANEL_CLS;

    var headChips = '';
    for (var oc = 0; oc < origins.length; oc++) headChips += originChipHtml(origins[oc]);

    var head = document.createElement('button');
    head.type = 'button';
    head.className = PANEL_CLS + '-head';
    head.setAttribute('aria-expanded', 'false');
    head.innerHTML =
      '<span class="' + PANEL_CLS + '-caret" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
        'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="9 6 15 12 9 18"></polyline></svg></span>' +
      '<span class="' + PANEL_CLS + '-title">As Quoted</span>' +
      headChips +
      '<span class="' + PANEL_CLS + '-hint">original proposal</span>';
    panel.appendChild(head);

    var body = document.createElement('div');
    body.className = PANEL_CLS + '-body';

    // Origin block — names the specific SOW/CO and its accepted quote,
    // linking through to the published proposal record.
    if (origins.length) {
      var ohtml = '';
      for (var oi = 0; oi < origins.length; oi++) {
        var o = origins[oi];
        var text = esc(o.label) + ' — ' + (o.isCo ? 'Change Order' : 'Base scope') +
          (o.quote ? ' · Quote ' + esc(o.quote) +
            (o.signed ? ' <span class="scw-aq-signed">signed</span>' : '') : '');
        var href = proposalHref(o.proposalId);
        ohtml += '<div class="scw-aq-origin-line">' +
          (href ? '<a href="' + esc(href) + '">' + text + '</a>' : text) +
        '</div>';
      }
      var ob = document.createElement('div');
      ob.className = 'scw-aq-origin-block';
      ob.innerHTML =
        '<div class="' + PANEL_CLS + '-label">Origin</div>' + ohtml;
      body.appendChild(ob);
    }

    var grid = document.createElement('div');
    grid.className = PANEL_CLS + '-grid';
    for (var i = 0; i < GROUPS.length; i++) {
      var g = GROUPS[i];
      var val = readVal(pa, PF[g.key]);
      var cell = document.createElement('div');
      cell.className = PANEL_CLS + '-cell';
      cell.innerHTML =
        '<div class="' + PANEL_CLS + '-label">' + esc(g.label) + '</div>' +
        '<div class="' + PANEL_CLS + '-val">' +
          (val ? esc(val) : '<span class="' + PANEL_CLS + '-empty">—</span>') +
        '</div>';
      grid.appendChild(cell);
    }
    body.appendChild(grid);

    var sn = readVal(pa, PF.surveyNotes);
    if (sn) {
      var notes = document.createElement('div');
      notes.className = PANEL_CLS + '-notes';
      notes.innerHTML =
        '<div class="' + PANEL_CLS + '-label">Survey Notes</div>' +
        '<div class="' + PANEL_CLS + '-notes-val">' + esc(sn) + '</div>';
      body.appendChild(notes);
    }

    panel.appendChild(body);

    head.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();   // don't trigger the card's own expand
      var open = panel.classList.toggle(PANEL_CLS + '--open');
      head.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    return panel;
  }

  // ── inject ──────────────────────────────────────────────────────
  function injectPanel(installId, proposedAttrs, origins) {
    for (var v = 0; v < INSTALL_VIEWS.length; v++) {
      var container = document.getElementById('scw-ws-v2-' + INSTALL_VIEWS[v]);
      if (!container) continue;
      var cards = container.querySelectorAll(
        '.scw-ws-v2-card[data-scw-ws-v2-record="' + installId + '"]'
      );
      for (var c = 0; c < cards.length; c++) {
        var detail = cards[c].querySelector('.scw-ws-v2-detail');
        if (!detail) continue;
        var prior = detail.querySelector(':scope > .' + PANEL_CLS);
        if (prior && prior.parentNode) prior.parentNode.removeChild(prior);
        detail.appendChild(buildPanel(proposedAttrs, origins));

        // Row-level origin chip(s) in the Flags cell — base vs CO is
        // scannable without expanding the card. Idempotent per rebuild.
        var flags = cards[c].querySelector('.scw-ws-v2-cell--install-flags');
        if (flags && origins && origins.length) {
          var old = flags.querySelectorAll('.scw-aq-origin');
          for (var x = 0; x < old.length; x++) old[x].remove();
          var chips = '';
          for (var oi = 0; oi < origins.length; oi++) chips += originChipHtml(origins[oi]);
          flags.insertAdjacentHTML('beforeend', chips);
          flags.classList.remove('scw-ws-v2-cell--blank');
        }
      }
    }
  }

  // ── merge ───────────────────────────────────────────────────────
  function computeHash(linkIdx) {
    var ids = Object.keys(linkIdx).sort();
    var parts = [];
    for (var i = 0; i < ids.length; i++) parts.push(ids[i] + ':' + linkIdx[ids[i]]);
    return parts.join('|');
  }
  function invalidate() { _lastHash = ''; }

  var _warnedNoSow = false;
  function merge() {
    var linkIdx = buildInstallLinkIndex();
    var ids = Object.keys(linkIdx);
    if (!ids.length) return;
    var propIdx = buildProposedIndex();
    var acceptIdx = buildAcceptanceIndex();

    // One-time diagnostic: OG records loaded but NONE carry field_2154 —
    // the provenance column isn't projected on view_4072, so origin
    // chips/links can't render. Everything else still works.
    if (!_warnedNoSow) {
      var pids = Object.keys(propIdx);
      if (pids.length) {
        var anySow = false;
        for (var pw = 0; pw < pids.length; pw++) {
          if (Array.isArray(propIdx[pids[pw]][PF.sow + '_raw'])) { anySow = true; break; }
        }
        if (!anySow) {
          _warnedNoSow = true;
          console.warn('[scw-as-quoted] no ' + PF.sow + ' (SOW connection) on any ' +
            PROPOSED_VIEW + ' record — add it as a column in Builder to get ' +
            'origin (base vs CO / quote) chips.');
        }
      }
    }

    var hash = computeHash(linkIdx);
    if (hash === _lastHash) return;   // reset by invalidate() on any rebuild
    _lastHash = hash;

    _selfMutating = true;
    try {
      for (var i = 0; i < ids.length; i++) {
        var pa = propIdx[linkIdx[ids[i]]];
        if (pa) injectPanel(ids[i], pa, resolveOrigins(pa, acceptIdx));
      }
    } finally {
      setTimeout(function () { _selfMutating = false; }, 0);
    }
  }

  // ── observers / scheduling ──────────────────────────────────────
  function installV2Observer() {
    for (var v = 0; v < INSTALL_VIEWS.length; v++) {
      var container = document.getElementById('scw-ws-v2-' + INSTALL_VIEWS[v]);
      if (!container || container.__scwAsQuotedObs) continue;
      var body = container.querySelector('.scw-ws-v2-body') || container;
      container.__scwAsQuotedObs = true;
      var pending = false;
      var obs = new MutationObserver(function () {
        if (_selfMutating || pending) return;
        pending = true;
        setTimeout(function () { pending = false; invalidate(); merge(); }, 150);
      });
      obs.observe(body, { childList: true, subtree: true });
    }
  }
  function stagger() {
    var delays = [50, 250, 750, 2000];
    for (var i = 0; i < delays.length; i++) {
      setTimeout(function () { installV2Observer(); merge(); }, delays[i]);
    }
  }

  // ── CSS ─────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var P = '.' + PANEL_CLS;
    var css = [
      P + ' { margin-top: 10px; border: 1px solid #e2e8f0; border-radius: 8px;',
      '  background: #f8fafc; overflow: hidden; }',
      P + '-head { display: flex; align-items: center; gap: 8px; width: 100%;',
      '  background: none; border: 0; cursor: pointer; padding: 8px 12px; text-align: left;',
      '  font: 700 12px/1.2 system-ui, sans-serif; color: #475569;',
      '  text-transform: uppercase; letter-spacing: .04em; }',
      P + '-head:hover { background: #f1f5f9; }',
      P + '-caret { display: inline-flex; flex: 0 0 auto; color: #94a3b8;',
      '  transition: transform 120ms ease; }',
      P + '--open ' + P + '-caret { transform: rotate(90deg); }',
      P + '-title { flex: 0 0 auto; }',
      P + '-hint { flex: 0 0 auto; margin-left: auto; font-weight: 500;',
      '  text-transform: none; letter-spacing: 0; font-size: 11px; color: #94a3b8;',
      '  font-style: italic; }',
      P + '-body { display: none; padding: 4px 12px 12px; }',
      P + '--open ' + P + '-body { display: block; }',
      P + '-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));',
      '  gap: 8px 16px; }',
      P + '-label { font: 700 10px/1.2 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .04em; color: #94a3b8; margin-bottom: 2px; }',
      P + '-val { font: 500 13px/1.4 system-ui, sans-serif; color: #1e293b;',
      '  word-break: break-word; }',
      P + '-empty { color: #cbd5e1; }',
      P + '-notes { margin-top: 10px; padding-top: 10px; border-top: 1px solid #e2e8f0; }',
      P + '-notes-val { font: 500 13px/1.5 system-ui, sans-serif; color: #334155;',
      '  white-space: pre-wrap; word-break: break-word; }',
      // ── origin (base vs CO provenance) ──
      '.scw-aq-origin { display: inline-flex; align-items: center; flex: 0 0 auto;',
      '  margin-left: 6px; padding: 1px 8px; border-radius: 999px;',
      '  font: 700 10px/1.6 system-ui, sans-serif; letter-spacing: .02em;',
      '  background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;',
      '  text-transform: none; white-space: nowrap; }',
      '.scw-aq-origin--co { background: #fffbeb; color: #92400e; border-color: #fde68a; }',
      '.scw-ws-v2-cell--install-flags .scw-aq-origin { margin-left: 0;',
      '  margin-right: 4px; }',
      '.scw-aq-origin-block { margin: 2px 0 10px; padding-bottom: 10px;',
      '  border-bottom: 1px solid #e2e8f0; }',
      '.scw-aq-origin-line { font: 500 13px/1.5 system-ui, sans-serif; color: #1e293b; }',
      '.scw-aq-origin-line a { color: #1d4ed8; text-decoration: none; }',
      '.scw-aq-origin-line a:hover { text-decoration: underline; }',
      '.scw-aq-signed { display: inline-block; margin-left: 4px; padding: 0 6px;',
      '  border-radius: 999px; font: 700 10px/1.6 system-ui, sans-serif;',
      '  background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── init ────────────────────────────────────────────────────────
  function init() {
    injectCss();
    if (!window.SCW || typeof window.SCW.onViewRender !== 'function') return;

    INSTALL_VIEWS.forEach(function (iv) {
      window.SCW.onViewRender(iv, function () {
        invalidate(); installV2Observer(); stagger();
      }, 'scwAsQuoted');
    });
    // Proposed data can render after the install views (or update).
    window.SCW.onViewRender(PROPOSED_VIEW, function () {
      invalidate(); stagger();
    }, 'scwAsQuoted');
    // The acceptance grid feeds the origin → quote resolution — re-merge
    // when it (re)loads so chips pick up fresh signed/quote state.
    window.SCW.onViewRender(ACCEPT_VIEW, function () {
      invalidate(); stagger();
    }, 'scwAsQuoted');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
/*****  END Install "As Quoted" Panel  ***********************************/
