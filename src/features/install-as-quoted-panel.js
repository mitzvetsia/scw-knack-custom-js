/*****  Install "As Quoted" Panel  *****************************************/
/**
 * On the deployment pages (ops scene_1311 + sub scene_1353), each install
 * line item (view_4093 / view_4056) was created from an "OG" proposed line
 * item now surfaced in a hidden grid (view_4072 ops / view_4151 sub). The
 * install record points back to its proposed record via field_2819 (holds
 * the proposed record id).
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
  // INSTALLING" (same install object). No-ops on any scene where no proposed
  // grid is present (the proposed index comes back empty).
  var INSTALL_VIEWS = ['view_4093', 'view_4056'];
  // Hidden grids of the OG proposed line items — one per scene, same columns:
  //   view_4072 = ops Manage Deployment (scene_1311)
  //   view_4151 = sub deployment dashboard (scene_1353)
  // Only one scene renders at a time, so at most one has a populated model;
  // the index unions whatever is present.
  var PROPOSED_VIEWS = ['view_4072', 'view_4151'];
  var LINK_FIELD    = 'field_2819';    // on the install record → proposed record id

  // ── Provenance (which SOW/CO + which accepted quote) ────────────
  // OG line item → SOW(s) via field_2154 (must be a column on view_4072).
  // SOW number → accepted quote resolves through the acceptance grid
  // (view_3914): its proposal connection's identifier embeds both —
  // "<project#>-<SOW#> | <quote#>" — so we parse rather than needing a
  // SOW grid on the scene. CO detection = SOW number's CO suffix (the
  // system-generated numbering: SW1418 base, SW1418CO change order).
  // view_3914 = ops acceptance grid; view_4066 = the sub scene's ACCEPTANCE
  // grid (rendered but hidden by hide-data-source-views). ⚠️ view_4066
  // currently carries only project + Matching Bid columns — until field_2755
  // and field_2766 are added to it in Builder, the acceptance index is empty
  // on the sub scene and origin chips render without quote/signed badges
  // (everything else works).
  var ACCEPT_VIEWS    = ['view_3914', 'view_4066'];
  var ACCEPT_PROPOSAL = 'field_2755';  // REL_SOW_published proposal (connection)
  var ACCEPT_SIGNED   = 'field_2766';  // FLAG_agreement signed

  // Field keys on the PROPOSED line-item object (view_4072). Best-guess SOW
  // Line Item keys (DEFAULT_FIELDS in worksheet-v2/config.js). CONFIRM/adjust
  // if view_4072 renders a different object.
  var PF = {
    product:          'field_1949',    // Product (connection → display label)
    qty:              'field_1964',    // Quantity
    mdfIdf:           'field_1946',    // MDF / IDF location
    connectedDevices: 'field_1957',    // Connected Devices (multi, on NVR/switch)
    connectedTo:      'field_2197',    // Connected To (single, on cam/reader)
    surveyNotes:      'field_2412',    // Survey notes
    existCabling:     'field_2461',    // Existing cabling
    exterior:         'field_1984',    // Exterior
    plenum:           'field_1983',    // Plenum
    sow:              'field_2154',    // SOW connection(s) — the provenance hop
    // Target install item — set on a CO line (swap/remove) that acts on an
    // existing install record. The swap-provenance hop: a swapped-in item's
    // linked line is the CO ADD line; its target names the REPLACED install
    // record, whose own field_2819 link reaches the ORIGINAL SOW line — so
    // the panel can tell the whole story (quoted on SW#### → changed by
    // ####CO). ⚠️ Builder: field_2966 must be a column on view_4072 /
    // view_4151 or the hop fails open (CO-only story, today's behavior).
    target:           'field_2966',
    action:           'field_2965',    // CO action (Remove on credit lines)
    bucket:           'field_2219',    // proposal bucket (connection)
    mapConn:          'field_2231',    // FLAG_map camera or reader connections
    // Sub bid (the sub's own per-line price — sub-safe money, fine on the
    // sub portal). ⚠️ Builder: field_2150 must be a column on the proposed
    // grids (view_4072 / view_4151) or the group silently stays hidden.
    subBid:           'field_2150'
  };

  // Corresponding fields on the INSTALL record (view_4093/view_4056 object)
  // — the diff pass compares quoted vs installed per group key. Keys with
  // no install analogue (surveyNotes) simply aren't diffed.
  var IF = {
    product:          'field_2790',    // PRODUCT STORED_name (display text)
    qty:              'field_2789',
    mdfIdf:           'field_2818',
    connectedDevices: 'field_2820',
    connectedTo:      'field_2821',
    existCabling:     'field_2807',
    exterior:         'field_2805',
    plenum:           'field_2806',
    bucket:           'field_2822',    // REL_CONFIG_proposal bucket
    mapConn:          'field_2795'     // PRODUCT STORED FLAG_map cam/reader conns
  };

  // Proposal-bucket gating for the connection columns — the SAME rules the
  // worksheet cards follow everywhere (card.js): Connected To renders only
  // on cam/reader-bucket rows; Connected Devices only when the product's
  // "map camera or reader connections" flag is Yes. The proposed grids
  // don't project bucket/flag columns, so read them off the INSTALL record
  // first (it stores both), fall back to the proposed record, and never
  // hide a column that actually carries quoted data.
  var CAM_READER_BUCKET = '6481e5ba38f283002898113c';   // matches card.js
  function yesFlag(attrs, key) {
    if (!attrs || !key) return false;
    var raw = attrs[key + '_raw'];
    if (raw === true || raw === 'Yes' || raw === 'yes' || raw === 1) return true;
    var s = String(attrs[key] == null ? '' : attrs[key]).trim().toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  }
  function bucketIdOfAttrs(attrs, key) {
    var raw = attrs && attrs[key + '_raw'];
    if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
    if (raw && typeof raw === 'object' && raw.id) return raw.id;
    return '';
  }

  // Compact label/value grid groups (survey notes rendered full-width below).
  // kind drives diff normalization: 'flag' treats blank ≙ No; 'multi'
  // compares as an unordered set; default is a normalized string compare.
  var GROUPS = [
    { label: 'Product',           key: 'product' },
    { label: 'Qty',               key: 'qty' },
    { label: 'Sub Bid',           key: 'subBid' },
    { label: 'MDF / IDF',         key: 'mdfIdf' },
    { label: 'Connected Devices', key: 'connectedDevices', kind: 'multi' },
    { label: 'Connected To',      key: 'connectedTo' },
    { label: 'Existing',          key: 'existCabling', kind: 'flag' },
    { label: 'Exterior',          key: 'exterior',     kind: 'flag' },
    { label: 'Plenum',            key: 'plenum',       kind: 'flag' }
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

  // ── quoted vs installed diff ────────────────────────────────────
  // Values are compared as DISPLAY text (connection identifiers, Yes/No),
  // normalized per kind. Labels ride from quote → install at creation, so
  // a normalized mismatch is a real config drift worth flagging — but this
  // is informational highlighting, not validation.
  function normCmp(s) {
    var v = String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
    // Numeric strings compare as numbers ("1.00" ≙ "1", "1,000" ≙ "1000").
    if (/^-?[\d,]*\.?\d+$/.test(v)) {
      var n = parseFloat(v.replace(/,/g, ''));
      if (!isNaN(n)) return String(n);
    }
    return v;
  }
  function normFlag(s) {
    var v = normCmp(s);
    if (v === 'yes' || v === 'true' || v === '1') return 'yes';
    return 'no';   // blank ≙ No — a quoted blank vs installed "No" is not a diff
  }
  var NUMERIC_RE = /^-?\d+(\.\d+)?$/;
  // Loose single-value match: quoted + installed identifiers come from
  // DIFFERENT objects (SOW line item vs install line item) whose display
  // formats can differ while naming the same thing ("CD-001" vs
  // "CD-001 · Switch 24p") — one side containing the other counts as a
  // match. Pure numbers (Qty) stay strict ("1" must not match "10").
  function looseEq(a, b) {
    if (a === b) return true;
    if (NUMERIC_RE.test(a) || NUMERIC_RE.test(b)) return false;
    return !!(a && b && (a.indexOf(b) !== -1 || b.indexOf(a) !== -1));
  }
  function multiTokens(s) {
    return normCmp(s).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  /** True when quoted and installed values differ under the group's kind. */
  function valuesDiffer(kind, quoted, installed) {
    if (kind === 'flag') return normFlag(quoted) !== normFlag(installed);
    if (kind === 'multi') {
      // Unordered set compare with loose per-token matching.
      var A = multiTokens(quoted), B = multiTokens(installed);
      if (A.length !== B.length) return true;
      var used = [];
      for (var i = 0; i < A.length; i++) {
        var hit = -1;
        for (var j = 0; j < B.length; j++) {
          if (!used[j] && looseEq(A[i], B[j])) { hit = j; break; }
        }
        if (hit === -1) return true;
        used[hit] = true;
      }
      return false;
    }
    return !looseEq(normCmp(quoted), normCmp(installed));
  }

  // ── connection derivation (field_1957 ↔ field_2197 drift guard) ──
  // The SOW pair drifts (Known Issue #12): a quoted parent's forward
  // list (field_1957) can be blank while the children's back-pointers
  // (field_2197) hold the truth. Derive the quoted connections from
  // BOTH sides, and diff connections by SOURCE RECORD ID (install
  // child → field_2819 → proposed id) instead of display labels —
  // install and SOW records are different objects whose labels differ
  // ("AC-01" vs "AC-001") even when they name the same device.
  function buildConnCtx(propIdx, installIdx, linkIdx) {
    var rev = Object.create(null);        // proposed parent id → [child proposed ids]
    var fwdParent = Object.create(null);  // proposed child id → parent proposed id
    var labels = Object.create(null);     // proposed id → display identifier
    var pid, i;
    for (pid in propIdx) {
      var a = propIdx[pid];
      var back = a[PF.connectedTo + '_raw'];
      if (Array.isArray(back) && back[0] && back[0].id) {
        (rev[back[0].id] = rev[back[0].id] || []).push(pid);
        if (!labels[back[0].id]) labels[back[0].id] = stripHtml(back[0].identifier || '');
      }
      var fwd = a[PF.connectedDevices + '_raw'];
      if (Array.isArray(fwd)) {
        for (i = 0; i < fwd.length; i++) {
          if (fwd[i] && fwd[i].id) {
            fwdParent[fwd[i].id] = pid;
            if (!labels[fwd[i].id]) labels[fwd[i].id] = stripHtml(fwd[i].identifier || '');
          }
        }
      }
    }
    // Child labels via the install records that link to them — the
    // field_2819 connection identifiers carry the SOW-side labels
    // ("AC-001") even when no forward list names the child.
    for (var iid in installIdx) {
      var raw = installIdx[iid][LINK_FIELD + '_raw'];
      if (Array.isArray(raw) && raw[0] && raw[0].id && !labels[raw[0].id]) {
        labels[raw[0].id] = stripHtml(raw[0].identifier || '');
      }
    }
    return { rev: rev, fwdParent: fwdParent, labels: labels, linkIdx: linkIdx };
  }
  function uniqIds(arr) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] && !seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
    }
    return out;
  }
  function rawIds(attrs, key) {
    var raw = attrs && attrs[key + '_raw'];
    var out = [];
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) if (raw[i] && raw[i].id) out.push(raw[i].id);
    }
    return out;
  }
  function sameIdSet(a, b) {
    if (a.length !== b.length) return false;
    var s = Object.create(null), i;
    for (i = 0; i < a.length; i++) s[a[i]] = 1;
    for (i = 0; i < b.length; i++) if (!s[b[i]]) return false;
    return true;
  }
  // Quoted connected-device ids for a parent: forward list ∪ back-pointers.
  function quotedChildIds(pa, ctx) {
    return uniqIds(rawIds(pa, PF.connectedDevices).concat((ctx.rev[pa.id]) || []));
  }
  // Quoted parent id for a child: back-pointer, else any forward list naming it.
  function quotedParentId(pa, ctx) {
    var ids = rawIds(pa, PF.connectedTo);
    return ids[0] || ctx.fwdParent[pa.id] || '';
  }
  function labelsFor(ids, ctx) {
    var out = [];
    for (var i = 0; i < ids.length; i++) out.push(ctx.labels[ids[i]] || ids[i]);
    return out.join(', ');
  }

  // ── indexes ─────────────────────────────────────────────────────
  // proposed record id → its attributes hash (union across the per-scene
  // proposed grids — only the current scene's view has a model).
  function buildProposedIndex() {
    var idx = Object.create(null);
    for (var v = 0; v < PROPOSED_VIEWS.length; v++) {
      var models = viewModels(PROPOSED_VIEWS[v]);
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        if (a && a.id) idx[a.id] = a;
      }
    }
    return idx;
  }
  // Display name for warnings — the proposed view that actually has records
  // on this scene, else the whole candidate list.
  function proposedViewName() {
    for (var v = 0; v < PROPOSED_VIEWS.length; v++) {
      if (viewModels(PROPOSED_VIEWS[v]).length) return PROPOSED_VIEWS[v];
    }
    return PROPOSED_VIEWS.join('/');
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
  // install record id → its attributes (for the quoted-vs-installed diff).
  function buildInstallAttrsIndex() {
    var idx = Object.create(null);
    for (var v = 0; v < INSTALL_VIEWS.length; v++) {
      var models = viewModels(INSTALL_VIEWS[v]);
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        if (a && a.id && !idx[a.id]) idx[a.id] = a;
      }
    }
    return idx;
  }

  // ── published-proposal snapshots (the immutable history source) ─
  // A hidden grid on the ops deploy scene lists the project's PUBLISHED
  // PROPOSAL records with field_2671 = the publish-time `json` snapshot
  // (buildJsonSnapshot: { view_key: [record dumps] } — record ids + every
  // field, exactly what the client saw). Detection is by COLUMN, not view
  // id, so the grid can be rebuilt in Builder freely; the module hides it
  // (it's a data source, bottom of the page). Ops scene ONLY — the blob
  // carries SCW-side money and must never ride a sub-visible scene.
  var SNAPSHOT_FIELD = 'field_2671';
  var SNAPSHOT_VIEWS = ['view_4157'];     // known snapshot grids (scene_1311)
  var _snapCache = Object.create(null);   // record id → { len, parsed }

  /** View keys carrying the snapshot column: the pinned list plus any
   *  rendered grid whose header shows field_2671 (so a rebuilt/renamed
   *  Builder view keeps working without a code change). */
  function snapshotViewKeys() {
    var keys = {}, out = [], i;
    for (i = 0; i < SNAPSHOT_VIEWS.length; i++) keys[SNAPSHOT_VIEWS[i]] = 1;
    var tables = document.querySelectorAll('.kn-table.kn-view');
    for (i = 0; i < tables.length; i++) {
      if (tables[i].id && tables[i].querySelector('thead th.' + SNAPSHOT_FIELD)) {
        keys[tables[i].id] = 1;
      }
    }
    for (var k in keys) out.push(k);
    return out;
  }
  function snapshotViewEls() {
    var out = [], keys = snapshotViewKeys();
    for (var i = 0; i < keys.length; i++) {
      var el = document.getElementById(keys[i]);
      if (el) out.push(el);
    }
    return out;
  }
  function hideSnapshotViews() {
    var els = snapshotViewEls();
    for (var i = 0; i < els.length; i++) {
      els[i].style.setProperty('display', 'none', 'important');
      var acc = els[i].closest('.scw-ktl-accordion');
      if (acc) acc.style.setProperty('display', 'none', 'important');
    }
  }
  function parseSnapshot(recId, raw) {
    var s = String(raw == null ? '' : raw);
    if (!s) return null;
    var hit = _snapCache[recId];
    if (hit && hit.len === s.length) return hit.parsed;
    var parsed = null;
    try {
      // Model values are verbatim; a DOM-scraped value may carry entities.
      parsed = JSON.parse(s);
    } catch (e) {
      try { parsed = JSON.parse(stripHtml(s)); } catch (e2) { parsed = null; }
    }
    _snapCache[recId] = { len: s.length, parsed: parsed };
    return parsed;
  }

  /** Publications, in grid order (sort the Builder view oldest-first):
   *  [{ id, label, isCo, quote, signed, lines: {lineId: attrs},
   *     byLabel: {normLabel: attrs} }]. label/isCo come from the SOW
   *  header record INSIDE the snapshot (it carries field_2122/2126);
   *  quote/signed join through the acceptance index by proposal id. */
  function buildPublications(acceptIdx) {
    var pubs = [];
    var viewKeys = snapshotViewKeys();
    // quote/signed by proposal record id (acceptIdx is keyed by SOW token).
    var byProposal = Object.create(null);
    for (var t in acceptIdx) {
      if (acceptIdx[t] && acceptIdx[t].proposalId) byProposal[acceptIdx[t].proposalId] = acceptIdx[t];
    }
    for (var v = 0; v < viewKeys.length; v++) {
      var models = viewModels(viewKeys[v]);
      for (var m = 0; m < models.length; m++) {
        var a = models[m] && models[m].attributes;
        if (!a || !a.id) continue;
        var snap = parseSnapshot(a.id, a[SNAPSHOT_FIELD]);
        if (!snap || typeof snap !== 'object') continue;
        var pub = { id: a.id, label: '', isCo: false, quote: '', signed: false,
                    lines: Object.create(null), byLabel: Object.create(null) };
        var acc = byProposal[a.id];
        if (acc) { pub.quote = acc.quote; pub.signed = acc.signed; }
        var keys = Object.keys(snap);
        for (var k = 0; k < keys.length; k++) {
          var arr = snap[keys[k]];
          if (!Array.isArray(arr)) {
            // single-record views dump as a bare record object
            if (arr && typeof arr === 'object' && arr.id) arr = [arr];
            else continue;
          }
          for (var r = 0; r < arr.length; r++) {
            var rec = arr[r];
            if (!rec || !rec.id) continue;
            pub.lines[rec.id] = rec;
            var lbl = stripHtml(rec['field_1950'] || '');
            if (lbl) pub.byLabel[normToken(lbl)] = pub.byLabel[normToken(lbl)] || rec;
            // SOW header record inside the snapshot names the publication.
            if (!pub.label && rec['field_2122'] != null) {
              var idTxt = stripHtml(rec['field_2122']);
              var segs = idTxt.split('-');
              pub.label = segs[segs.length - 1] || idTxt;
              pub.isCo = /CO$/i.test(normToken(pub.label));
            }
          }
        }
        pubs.push(pub);
      }
    }
    // Oldest → newest when every publication has a (date-prefixed) quote
    // number; otherwise trust the Builder view's sort (set it to publish
    // date ascending).
    var allQuoted = pubs.length > 0;
    for (var q = 0; q < pubs.length; q++) if (!pubs[q].quote) { allQuoted = false; break; }
    if (allQuoted) pubs.sort(function (a, b) { return a.quote < b.quote ? -1 : 1; });
    return pubs;
  }

  /** Do two line records genuinely differ? Compares ONLY fields BOTH
   *  records actually carry — older/slim snapshots omit fields entirely,
   *  and treating an uncaptured field as "was blank" invented phantom
   *  changes ("Qty — → 1") between publications. */
  function hasField(attrs, key) {
    return !!attrs && !!key && (key in attrs || (key + '_raw') in attrs);
  }
  function linesDiffer(a, b) {
    for (var i = 0; i < GROUPS.length; i++) {
      var k = PF[GROUPS[i].key];
      if (!hasField(a, k) || !hasField(b, k)) continue;   // unknown ≠ changed
      var va = normToken(readVal(a, k) || '');
      var vb = normToken(readVal(b, k) || '');
      // Qty is blank on single-quantity line types (flag-capped at 1) —
      // blank vs a value there is a representation gap, not a change.
      if (GROUPS[i].key === 'qty' && (!va || !vb)) continue;
      // Knack renders an unset boolean blank; semantically it's No —
      // blank vs "No" must not read as a change between captures.
      if (GROUPS[i].kind === 'flag') {
        va = va === 'YES' ? 'YES' : 'NO';
        vb = vb === 'YES' ? 'YES' : 'NO';
      }
      if (va !== vb) return true;
    }
    return false;
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
    var models = [];
    for (var av = 0; av < ACCEPT_VIEWS.length; av++) {
      models = models.concat(viewModels(ACCEPT_VIEWS[av]));
    }
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
  /** First SOW identifier on a proposed line ("SW1715" / "1715CO"). */
  function firstSowLabel(attrs) {
    var raw = attrs && attrs[PF.sow + '_raw'];
    var r = Array.isArray(raw) ? raw[0] : null;
    return r ? stripHtml(r.identifier || '') : '';
  }

  /** One quoted-values section (field grid + survey notes) for one
   *  proposed line. `ia` null → no installed-vs-quoted diffing (used for
   *  the OG section of a swap story — the operative spec to diff against
   *  is the CO line, not the replaced quote). */
  function buildSection(pa, ia, ctx) {
    var frag = document.createDocumentFragment();
    var grid = document.createElement('div');
    grid.className = PANEL_CLS + '-grid';
    var diffCount = 0;
    var isCamRow = bucketIdOfAttrs(ia, IF.bucket) === CAM_READER_BUCKET ||
                   bucketIdOfAttrs(pa, PF.bucket) === CAM_READER_BUCKET;
    for (var i = 0; i < GROUPS.length; i++) {
      var g = GROUPS[i];
      // A field the record doesn't carry AT ALL (older/slim snapshot
      // dumps) is UNKNOWN, not blank — rendering it as "—" read as "was
      // empty" and invented changes between publications. Skip the cell.
      // (Live model attrs always carry every projected column, so this
      // only ever trims snapshot sections.)
      if (PF[g.key] && !hasField(pa, PF[g.key]) &&
          g.key !== 'connectedDevices' && g.key !== 'connectedTo') continue;
      // Bucket-rule gating (matches the worksheet cards): Connected Devices
      // only on map-connections products; Connected To only on cam/reader
      // rows; the cabling flags (Existing / Exterior / Plenum) only on
      // cam/reader rows — on anything else they show only when one side is
      // actually Yes (the install-flags "only-if-true" convention), so a
      // real drift can't hide. A populated quoted value always shows
      // regardless — never hide real data behind a missing bucket column.
      if (g.key === 'connectedDevices' &&
          !(yesFlag(ia, IF.mapConn) || yesFlag(pa, PF.mapConn) ||
            (ctx && quotedChildIds(pa, ctx).length))) continue;
      if (g.key === 'connectedTo' &&
          !(isCamRow || (ctx && quotedParentId(pa, ctx)))) continue;
      if (g.kind === 'flag' && !isCamRow &&
          normFlag(readVal(pa, PF[g.key])) !== 'yes' &&
          !(ia && IF[g.key] && normFlag(readVal(ia, IF[g.key])) === 'yes')) continue;
      // Sub Bid renders only when the quoted line actually carries one —
      // a blank/zero sub bid on services/assumptions is noise, not data.
      if (g.key === 'subBid') {
        var sbNum = parseFloat(String(readVal(pa, PF.subBid)).replace(/[$,\s]/g, ''));
        if (isNaN(sbNum) || sbNum === 0) continue;
      }
      var val, differs = null;   // null → default label-based compare
      if (ctx && g.key === 'connectedDevices') {
        // Derived quoted set (drift-proof) + id-set diff via field_2819.
        var qIds = quotedChildIds(pa, ctx);
        val = qIds.length ? labelsFor(qIds, ctx) : '';
        if (ia && IF[g.key]) {
          var instIds = rawIds(ia, IF[g.key]);
          var mapped = [], unmappable = false;
          for (var mi = 0; mi < instIds.length; mi++) {
            var mpid = ctx.linkIdx[instIds[mi]];
            if (mpid) mapped.push(mpid); else unmappable = true;
          }
          differs = unmappable || !sameIdSet(qIds, uniqIds(mapped));
        }
      } else if (ctx && g.key === 'connectedTo') {
        var qp = quotedParentId(pa, ctx);
        val = qp ? (ctx.labels[qp] || readVal(pa, PF.connectedTo) || qp) : '';
        if (ia && IF[g.key]) {
          var instParent = rawIds(ia, IF.connectedTo)[0] || '';
          var mappedParent = instParent ? (ctx.linkIdx[instParent] || '') : '';
          differs = instParent
            ? (!mappedParent || mappedParent !== qp)
            : !!qp;
        }
      } else {
        val = readVal(pa, PF[g.key]);
      }
      // Identifier formulas can leave empty "()" tails — pure noise.
      if (val) val = String(val).replace(/\s*\(\s*\)/g, '').trim();
      // Single-quantity line types (flag-capped at 1) leave Qty blank —
      // a "Qty —" cell is dead weight, drop it entirely.
      if (g.key === 'qty' && !val) continue;
      var cell = document.createElement('div');
      cell.className = PANEL_CLS + '-cell ' + PANEL_CLS + '-cell--' + g.key;
      var nowHtml = '';
      if (ia && IF[g.key]) {
        var curVal = readVal(ia, IF[g.key]);
        if (curVal) curVal = String(curVal).replace(/\s*\(\s*\)/g, '').trim();
        if (differs === null ? valuesDiffer(g.kind, val, curVal) : differs) {
          diffCount++;
          cell.className += ' ' + PANEL_CLS + '-cell--diff';
          nowHtml = '<div class="' + PANEL_CLS + '-now">installed: ' +
            (curVal ? esc(curVal)
                    : '<span class="' + PANEL_CLS + '-empty">—</span>') +
            '</div>';
        }
      }
      cell.innerHTML =
        '<div class="' + PANEL_CLS + '-label">' + esc(g.label) + '</div>' +
        '<div class="' + PANEL_CLS + '-val">' +
          (val ? esc(val) : '<span class="' + PANEL_CLS + '-empty">—</span>') +
        '</div>' + nowHtml;
      grid.appendChild(cell);
    }
    frag.appendChild(grid);

    var sn = readVal(pa, PF.surveyNotes);
    if (sn) {
      var notes = document.createElement('div');
      notes.className = PANEL_CLS + '-notes';
      notes.innerHTML =
        '<div class="' + PANEL_CLS + '-label">Survey Notes</div>' +
        '<div class="' + PANEL_CLS + '-notes-val">' + esc(sn) + '</div>';
      frag.appendChild(notes);
    }
    return { frag: frag, diffCount: diffCount };
  }

  function sectionLabelEl(text) {
    var el = document.createElement('div');
    el.className = PANEL_CLS + '-seclabel';
    el.textContent = text;
    return el;
  }

  // Head hint — say what the panel actually holds: "original proposal"
  // was a lie on a CO-born item (the panel showed a change order).
  function hintText(origins, ogChain) {
    if (ogChain && ogChain.length) return 'quote history';
    var anyCo = false, anyBase = false;
    for (var i = 0; i < (origins || []).length; i++) {
      if (origins[i].isCo) anyCo = true; else anyBase = true;
    }
    if (anyCo && anyBase) return 'quote history';
    if (anyCo) return 'change order';
    return 'original proposal';
  }

  // `ia` = the install record's attributes — when present, each quoted
  // value is diffed against the corresponding install field and mismatches
  // get the amber "differs" treatment (+ a count chip in the head).
  // `ogChain` (swap story) = the replaced quoted lines, BASE FIRST, one
  // per swap generation — each renders as its own labeled section above
  // the current CO section.
  function buildPanel(pa, origins, ia, ctx, ogChain, snapshotOnly) {
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
      '<span class="' + PANEL_CLS + '-hint">' + esc(hintText(origins, ogChain)) + '</span>';
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

    var diffCount = 0;
    if (ogChain && ogChain.length) {
      // Swap story, base first: "As quoted on SW####" (what was sold),
      // then one "As changed by ####CO" per swap generation, ending on
      // the CURRENT line. A credit-line entry is the replaced config as
      // carried on the swap's Remove half — label it as such (its money
      // and qty are the signed credit values). Installed-vs-quoted
      // diffing runs against the current section only.
      for (var s = 0; s < ogChain.length; s++) {
        var entry = ogChain[s];
        var lbl = firstSowLabel(entry.a);
        var text;
        if (entry.pub) {
          // Published-snapshot section — name it with the SAME identifier
          // the origin chips use (the line's own SOW connection), falling
          // back to the snapshot header parse, then generic wording.
          var pl = firstSowLabel(entry.a) || entry.pub.label;
          text = (s === 0 ? 'As quoted on ' : 'As changed by ') +
            (pl || (s === 0 ? 'the original SOW' : 'a change order')) +
            (entry.pub.quote ? ' · Quote ' + entry.pub.quote : '') +
            (entry.pub.signed ? ' · signed' : '');
        } else if (entry.credit) {
          text = 'Swapped out — as configured before ' +
            (lbl || 'this change order') + ' (from its credit line)';
        } else {
          text = s === 0
            ? 'As quoted on ' + (lbl || 'the original SOW')
            : 'As changed by ' + (lbl || 'a change order');
        }
        body.appendChild(sectionLabelEl(text));
        // Snapshot-only mode: the json IS the record — the newest
        // publication's section carries the installed-vs-quoted diff and
        // the live (mutable) line adds no section of its own.
        var secIa = (snapshotOnly && s === ogChain.length - 1) ? ia : null;
        var secR = buildSection(entry.a, secIa, ctx);
        if (secIa) diffCount = secR.diffCount;
        body.appendChild(secR.frag);
      }
      if (!snapshotOnly) {
        body.appendChild(sectionLabelEl(
          'As changed by ' + (firstSowLabel(pa) || 'the change order')));
        var coSec = buildSection(pa, ia, ctx);
        diffCount = coSec.diffCount;
        body.appendChild(coSec.frag);
      }
    } else {
      var sec = buildSection(pa, ia, ctx);
      diffCount = sec.diffCount;
      body.appendChild(sec.frag);
    }

    // Head chip: N field(s) drifted from the quote — visible without
    // expanding. Amber = warning per the repo convention.
    if (diffCount) {
      var dchip = document.createElement('span');
      dchip.className = 'scw-aq-diff-chip';
      dchip.title = 'Install config differs from the original quote on ' +
        diffCount + ' field' + (diffCount === 1 ? '' : 's');
      dchip.textContent = diffCount + ' differ' + (diffCount === 1 ? 's' : '');
      var hintEl = head.querySelector('.' + PANEL_CLS + '-hint');
      head.insertBefore(dchip, hintEl);
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
  function injectPanel(installId, proposedAttrs, origins, installAttrs, ctx, ogChain, snapshotOnly) {
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
        detail.appendChild(buildPanel(proposedAttrs, origins, installAttrs, ctx, ogChain, snapshotOnly));

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
  var _warnedNoTarget = false;
  var _warnedNoSnap = false;
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
            proposedViewName() + ' record — add it as a column in Builder to get ' +
            'origin (base vs CO / quote) chips.');
        }
      }
    }
    // Same diagnostic for the swap-history hop: without field_2966 as a
    // column on the proposed grid, swapped items can only ever show the CO
    // that created them — no "As quoted on SW#### → changed by ####CO"
    // chain, no full history.
    if (!_warnedNoTarget) {
      var pidsT = Object.keys(propIdx);
      if (pidsT.length) {
        var anyTgt = false;
        for (var pt = 0; pt < pidsT.length; pt++) {
          if (Array.isArray(propIdx[pidsT[pt]][PF.target + '_raw'])) { anyTgt = true; break; }
        }
        if (!anyTgt) {
          _warnedNoTarget = true;
          console.warn('[scw-as-quoted] no ' + PF.target + ' (Target install item) ' +
            'on any ' + proposedViewName() + ' record — add it as a column in ' +
            'Builder to unlock the swap history (original SOW quote + each CO ' +
            'generation) on swapped items.');
        }
      }
    }

    var hash = computeHash(linkIdx);
    if (hash === _lastHash) return;   // reset by invalidate() on any rebuild
    _lastHash = hash;

    hideSnapshotViews();
    var pubs = buildPublications(acceptIdx);
    if (!pubs.length && !_warnedNoSnap && snapshotViewKeys().some(function (k) {
      return viewModels(k).length > 0;
    })) {
      _warnedNoSnap = true;
      console.warn('[scw-as-quoted] snapshot grid has records but no ' +
        SNAPSHOT_FIELD + ' blob parsed — check the column is on the view ' +
        'and Make writes the publish payload `json` verbatim into it. ' +
        'Falling back to live-record history.');
    }

    _selfMutating = true;
    var missing = [];
    var installIdx = buildInstallAttrsIndex();
    var connCtx = buildConnCtx(propIdx, installIdx, linkIdx);
    // install record id → the CO lines that TARGET it (field_2966: the
    // swap/remove halves acting on that record). A swap contributes two
    // (Add + Remove); the Remove/credit half carries the REPLACED
    // product+config, which makes it the before-picture of last resort.
    var targetIdx = Object.create(null);
    for (var tp in propIdx) {
      var tid = rawIds(propIdx[tp], PF.target)[0];
      if (!tid) continue;
      (targetIdx[tid] = targetIdx[tid] || []).push(propIdx[tp]);
    }
    // The credit half among lines targeting `installId` (excluding
    // `notLine`): prefer an explicit Remove action, else any other line.
    function creditLineFor(installId, notLine) {
      var list = targetIdx[installId] || [];
      var pick = null;
      for (var c = 0; c < list.length; c++) {
        if (notLine && list[c].id === notLine.id) continue;
        if (!pick) pick = list[c];
        if (/remove/i.test(stripHtml(list[c][PF.action] || ''))) return list[c];
      }
      return pick;
    }
    function mergeOrigins(a, b) {
      var out = [], seen = {};
      var all = (a || []).concat(b || []);
      for (var m = 0; m < all.length; m++) {
        var k = normToken(all[m].label);
        if (seen[k]) continue;
        seen[k] = 1;
        out.push(all[m]);
      }
      out.sort(function (x, y) { return (x.isCo ? 1 : 0) - (y.isCo ? 1 : 0); });
      return out;
    }
    try {
      for (var i = 0; i < ids.length; i++) {
        var pa = propIdx[linkIdx[ids[i]]];
        if (!pa) { missing.push(ids[i] + ' → ' + linkIdx[ids[i]]); continue; }
        var origins = resolveOrigins(pa, acceptIdx);
        // Swap provenance — walk the WHOLE chain: my linked line is a CO
        // line acting on another install record → that record's linked
        // line is what it replaced; that line may itself be a CO line from
        // an earlier swap → keep hopping until the base quote (cycle
        // guard + depth cap). Renders one section per generation.
        var chain = [], seen = {};   // entries: { a: attrs, credit: bool }
        seen[pa.id] = 1;
        var cur = pa, guard = 0;
        while (guard++ < 6) {
          var tgt = rawIds(cur, PF.target)[0] || '';
          if (!tgt) break;
          var prev = linkIdx[tgt] ? propIdx[linkIdx[tgt]] : null;
          if (prev && !seen[prev.id]) {
            seen[prev.id] = 1;
            chain.push({ a: prev, credit: false });
            origins = mergeOrigins(resolveOrigins(prev, acceptIdx), origins);
            cur = prev;
            continue;
          }
          // Record-hop dead: the replaced install record isn't loaded, its
          // field_2819 link was repointed, or the swap re-used this very
          // record. The swap's CREDIT line still carries the replaced
          // product + config — terminal before-picture of last resort.
          var credit = creditLineFor(tgt, cur);
          if (credit && !seen[credit.id]) {
            seen[credit.id] = 1;
            chain.push({ a: credit, credit: true });
            origins = mergeOrigins(resolveOrigins(credit, acceptIdx), origins);
          }
          break;
        }
        chain.reverse();   // base/oldest first, then each CO generation
        // Reverse: MY install record is targeted by a CO line (slated for
        // removal / swapped away) — surface that CO in the origin chips so
        // the base item reads "quoted on SW#### · touched by ####CO".
        if (!chain.length) {
          var touch = creditLineFor(ids[i], pa);
          if (touch) origins = mergeOrigins(origins, resolveOrigins(touch, acceptIdx));
        }
        // ── Published-snapshot history (immutable — the record) ────────
        // Join each publication by record id (this line + every line the
        // swap chain reached) with a drop-label fallback, and drop the
        // generations where nothing changed. When ANY publication matches
        // the story is SNAPSHOT-ONLY: every section (and every origin
        // chip) comes from the json — the live mutable line contributes
        // nothing, so the panel can't half-merge two representations of
        // the same SOW into a phantom "as changed by" pair. The newest
        // snapshot section carries the installed-vs-quoted diff. Live
        // chain/credit story remains the fallback for unpublished drafts.
        var story = chain, snapshotOnly = false;
        if (pubs.length) {
          var candidates = {}; candidates[pa.id] = 1;
          for (var ce = 0; ce < chain.length; ce++) candidates[chain[ce].a.id] = 1;
          var paLbl = normToken(stripHtml(pa['field_1950'] || ''));
          var snapSecs = [], snapOrigins = [];
          for (var p = 0; p < pubs.length; p++) {
            var line = null;
            for (var cid in candidates) {
              if (pubs[p].lines[cid]) { line = pubs[p].lines[cid]; break; }
            }
            if (!line && paLbl && pubs[p].byLabel[paLbl]) line = pubs[p].byLabel[paLbl];
            if (!line) continue;
            // Chip label from the line's own SOW connection (chip
            // vocabulary), snapshot-header parse as fallback.
            var secLbl = firstSowLabel(line) || pubs[p].label;
            snapOrigins.push({
              label: secLbl || 'SOW',
              isCo:  /CO$/i.test(normToken(secLbl || '')) || pubs[p].isCo,
              quote: pubs[p].quote, proposalId: pubs[p].id,
              signed: pubs[p].signed
            });
            // Unchanged since the previous kept publication → no new
            // section; keep whichever capture carries MORE fields (a full
            // dump renders more cells than a slim one).
            if (snapSecs.length &&
                !linesDiffer(line, snapSecs[snapSecs.length - 1].a)) {
              var kept = snapSecs[snapSecs.length - 1];
              if (Object.keys(line).length > Object.keys(kept.a).length) kept.a = line;
              continue;
            }
            snapSecs.push({ a: line, credit: false, pub: pubs[p] });
          }
          if (snapSecs.length) {
            story = snapSecs;
            snapshotOnly = true;
            origins = mergeOrigins(snapOrigins, []);
          }
        }
        injectPanel(ids[i], pa, origins, installIdx[ids[i]], connCtx, story, snapshotOnly);
      }
    } finally {
      setTimeout(function () { _selfMutating = false; }, 0);
    }
    // Linked-but-unresolvable diagnostic: the install record names its OG
    // proposed record, but that record isn't in view_4072's model — so no
    // As Quoted panel renders for it. Observed live for CHANGE-ORDER items
    // (2026-07-23): either view_4072's page cap dropped the newest records
    // (now forced to 1000 via change-record-limit.js) or a Builder filter
    // on view_4072 excludes CO-typed SOW items ("Type is not change
    // order"-style) — the CO's line items must be included for their
    // install cards to show provenance.
    if (missing.length && missing.join('|') !== merge._lastMissing) {
      merge._lastMissing = missing.join('|');
      var pvn = proposedViewName();
      console.warn('[scw-as-quoted] ' + missing.length + ' install record(s) link to ' +
        'OG proposed records NOT loaded in ' + pvn + ' (no As Quoted ' +
        'panel for them). If these are change-order items, check ' + pvn +
        '’s Builder filters (a "Type is not change order" filter would ' +
        'exclude them):\n  ' + missing.join('\n  '));
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
      // Swap-story section labels ("As quoted on SW1715" / "As changed by
      // 1715CO") — CO label reads amber to match the CO origin chip family.
      P + '-seclabel { font: 700 10px/1.3 system-ui, sans-serif;',
      '  letter-spacing: .06em; text-transform: uppercase; color: #64748b;',
      '  margin: 10px 0 2px; padding-top: 8px; border-top: 1px dashed #e2e8f0; }',
      P + '-seclabel:first-child { margin-top: 0; padding-top: 0; border-top: 0; }',
      // Product names deserve the room — the product cell spans two
      // tracks so part numbers don't wrap while Qty hogs an equal column.
      P + '-cell--product { grid-column: span 2; }',
      P + '-cell--qty .scw-aq-val, ' + P + '-cell--qty { font-variant-numeric: tabular-nums; }',
      P + '-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));',
      '  gap: 8px 16px; }',
      P + '-label { font: 700 10px/1.2 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .04em; color: #94a3b8; margin-bottom: 2px; }',
      P + '-val { font: 500 13px/1.4 system-ui, sans-serif; color: #1e293b;',
      '  word-break: break-word; }',
      P + '-empty { color: #cbd5e1; }',
      // ── quoted-vs-installed diff marking (amber = warning) ──
      P + '-cell--diff { background: #fffbeb; border-left: 3px solid #f59e0b;',
      '  border-radius: 4px; padding: 4px 8px; }',
      P + '-cell--diff ' + P + '-label { color: #92400e; }',
      P + '-now { font: 600 12px/1.4 system-ui, sans-serif; color: #b45309;',
      '  margin-top: 2px; word-break: break-word; }',
      '.scw-aq-diff-chip { display: inline-flex; align-items: center; flex: 0 0 auto;',
      '  margin-left: 6px; padding: 1px 8px; border-radius: 999px;',
      '  font: 700 10px/1.6 system-ui, sans-serif; letter-spacing: .02em;',
      '  background: #fffbeb; color: #92400e; border: 1px solid #fde68a;',
      '  text-transform: none; white-space: nowrap; }',
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
    PROPOSED_VIEWS.forEach(function (pv) {
      window.SCW.onViewRender(pv, function () {
        invalidate(); stagger();
      }, 'scwAsQuoted');
    });
    // The acceptance grids feed the origin → quote resolution — re-merge
    // when one (re)loads so chips pick up fresh signed/quote state.
    ACCEPT_VIEWS.forEach(function (avk) {
      window.SCW.onViewRender(avk, function () {
        invalidate(); stagger();
      }, 'scwAsQuoted');
    });
    // The snapshot grid usually renders LAST (bottom of the page) — hide
    // it the moment it lands and re-merge so the published history joins.
    SNAPSHOT_VIEWS.forEach(function (sv) {
      window.SCW.onViewRender(sv, function () {
        hideSnapshotViews(); invalidate(); stagger();
      }, 'scwAsQuoted');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
/*****  END Install "As Quoted" Panel  ***********************************/
