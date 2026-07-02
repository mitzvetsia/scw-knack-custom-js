/*****  Install "As Quoted" Panel  *****************************************/
/**
 * On the manage-deployment page (scene_1311), each install line item
 * (view_3915 / view_4056) was created from an "OG" proposed line item now
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

  // view_3915 = Implementation install worksheet; view_4056 = "WHAT WE'RE
  // INSTALLING" (same install object). No-ops on any scene where view_4072
  // isn't present (the proposed index comes back empty).
  var INSTALL_VIEWS = ['view_3915', 'view_4056'];
  var PROPOSED_VIEW = 'view_4072';     // hidden grid of the OG proposed line items
  var LINK_FIELD    = 'field_2819';    // on the install record → proposed record id

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
    plenum:           'field_1983'     // Plenum
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

  // ── panel markup ────────────────────────────────────────────────
  function buildPanel(pa) {
    var panel = document.createElement('div');
    panel.className = PANEL_CLS;

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
      '<span class="' + PANEL_CLS + '-hint">original proposal</span>';
    panel.appendChild(head);

    var body = document.createElement('div');
    body.className = PANEL_CLS + '-body';

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
  function injectPanel(installId, proposedAttrs) {
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
        detail.appendChild(buildPanel(proposedAttrs));
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

  function merge() {
    var linkIdx = buildInstallLinkIndex();
    var ids = Object.keys(linkIdx);
    if (!ids.length) return;
    var propIdx = buildProposedIndex();

    var hash = computeHash(linkIdx);
    if (hash === _lastHash) return;   // reset by invalidate() on any rebuild
    _lastHash = hash;

    _selfMutating = true;
    try {
      for (var i = 0; i < ids.length; i++) {
        var pa = propIdx[linkIdx[ids[i]]];
        if (pa) injectPanel(ids[i], pa);
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
      '  white-space: pre-wrap; word-break: break-word; }'
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
/*****  END Install "As Quoted" Panel  ***********************************/
