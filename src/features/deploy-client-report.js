/*** DEPLOYMENT PAGE — CLIENT REPORT (browser print to PDF) *******************
 *
 * A "Client report (PDF)" button in the install worksheet's toolbar on the ops
 * Manage Deployment page (scene_1311, worksheet view_4093). It builds a
 * client-facing deployment report from the data already on the page, opens it
 * in a new tab and triggers the browser's Print dialog (Save as PDF). No Make
 * scenario, no API key, nothing is written back to Knack.
 *
 * Pages (design: Claude Design canvas "Client Deployment Report", 2026-10-21):
 *   1. Cover — project number banner first (house rule), client / site,
 *      report date, prepared by, scope tiles (Cameras OR Readers — projects
 *      never mix them), what is in the report.
 *   2. Site maps — one page per image map on the project's files grid.
 *   3. Devices by location — one page per MDF/IDF in the worksheet's own
 *      order (groups.js: proposal-bucket sort order, then drop prefix and
 *      number). Each device: label, product, install status, facts
 *      (connected to / connected devices, mount, cable, the per-device
 *      configuration answers), then every photo on the record.
 *   4. Network map — a tree drawn from each device's Connected To
 *      (field_2821) and the parents' Connected Devices (field_2820):
 *      recorders as roots, switches as branches, cameras as leaves,
 *      cameras with no connection in their own list.
 *   5. Removed by change order (field_2967) + the device index.
 *
 * Never printed: SCW notes, labor descriptions, pricing, sub names, QA notes,
 * edit history, services, assumptions, licenses, and any configuration answer
 * whose label matches CONFIG.CONFIG_EXCLUDE (passwords and the like).
 *
 * Gate: CONFIG.ALLOWED_EMAILS — the button renders only for those Knack
 * logins (empty = everyone on the scene).
 *
 * Public API (window.SCW.deployClientReport): collect(cfg) → report object,
 * buildHtml(report) → standalone HTML document, generate(cfg, btn) → opens
 * the print tab, plus mount / isAllowed for the toolbar button.
 ******************************************************************************/
(function () {
  'use strict';

  var CONFIG = {
    // Preview gate. Empty = every user who can open the scene.
    ALLOWED_EMAILS: ['micah.shearer@getscw.com'],
    SCENES: [
      { sceneId: 'scene_1311', viewKey: 'view_4093',
        // The scene's "Other Files" DOC_files grid (same source + rules as
        // site-maps-strip.js): image maps print as full-page site map pages.
        mapsView: 'view_3942',
        mapFields: { file: 'field_68', image: 'field_754', type: 'field_2877', notes: 'field_588' } }
    ],
    BUTTON_LABEL: 'Client report (PDF)',
    // Photos are redrawn in the browser to this longest side (JPEG) before
    // the report is written. That needs the image host to allow cross-origin
    // reads; when it refuses (the first live run: 71 originals, an 18 MB
    // PDF) the photo falls back to Knack's own thumbnail derivative
    // (PHOTO_FALLBACK_STYLE — thumb_14 is the app's 300 px style, which
    // needs no cross-origin access), and only then to the full-size file.
    // 0 = embed the original URLs untouched (tests).
    PHOTO_MAX_DIM: 800,
    PHOTO_QUALITY: 0.72,
    PHOTO_CONCURRENCY: 3,
    PHOTO_LOAD_TIMEOUT_MS: 15000,
    PHOTO_FALLBACK_STYLE: 'thumb_14',
    // The install status chip on a card: 'none' (the status field is not
    // maintained yet — 2026-10-21, every card read "NOT STARTED"); 'done'
    // prints it only when it reads done / installed / complete; 'all'
    // prints every value.
    STATUS_CHIP: 'none',
    // The accessory lines on a device card: the mounting hardware attached
    // to it ("Mount") and any other attached accessory ("Accessories", e.g.
    // the hard drives in a recorder). Mounting hardware is never a card of
    // its own and never counts as other equipment.
    SHOW_MOUNTS: true,
    SHOW_ACCESSORIES: true,
    // Every photo with an image prints, typed or not (decided 2026-10-21).
    INCLUDE_UNTYPED_PHOTOS: true,
    // Configuration answers whose field label or key matches never print.
    CONFIG_EXCLUDE: /password|passcode|\bpin\b|credential|secret|user\s*name|login|api\s*key|token/i,
    PRINT_DELAY_MS: 900,
    debug: false
  };

  var BTN_ID   = 'scw-client-report-btn';
  var STYLE_ID = 'scw-client-report-css';
  var NS       = '.scwClientReport';
  var MAP_TYPE = /site\s*plan|site\s*map|coverage|floor\s*plan/i;
  var MAP_FILE = /site[-_ ]?(plan|map)|coverage|floor[-_ ]?plan/i;
  var NAVY = '#07467c';

  // ── Small helpers ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function stripHtml(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function decodeEntities(s) {
    return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  /** Display text of a field: the raw connection identifiers / raw value when
   *  present, else the formatted value with its HTML stripped. A bare 24-hex
   *  id reads as empty. */
  function readText(rec, fk) {
    if (!rec || !fk) return '';
    var raw = rec[fk + '_raw'], v;
    if (raw != null && raw !== '') {
      if (Array.isArray(raw)) v = raw.map(function (r) { return r && (r.identifier || r.name) || ''; }).join(', ');
      else if (typeof raw === 'object') v = raw.identifier || raw.name || raw.url || '';
      else v = raw;
    } else {
      v = rec[fk];
    }
    var s = decodeEntities(stripHtml(v));
    return /^[a-f0-9]{24}$/i.test(s) ? '' : s;
  }
  function hasValue(rec, fk) { return readText(rec, fk) !== ''; }
  function readNum(rec, fk) {
    var s = readText(rec, fk).replace(/[$,\s]/g, '');
    if (s === '') return null;
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }
  function isYes(rec, fk) {
    if (!rec || !fk) return false;
    var raw = rec[fk + '_raw'];
    if (raw === true) return true;
    if (raw === false) return false;
    return /^(yes|true|1)$/i.test(readText(rec, fk));
  }
  function connList(rec, fk) {
    if (!rec || !fk) return [];
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) {
      return raw.filter(function (r) { return r && r.id; })
                .map(function (r) { return { id: r.id, identifier: stripHtml(r.identifier || r.name || '') }; });
    }
    if (raw && typeof raw === 'object' && raw.id) return [{ id: raw.id, identifier: stripHtml(raw.identifier || raw.name || '') }];
    return [];
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function todayText() {
    try { return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (e) { return new Date().toDateString(); }
  }
  function log() {
    if (!CONFIG.debug || !window.console) return;
    console.log.apply(console, ['[scw-client-report]'].concat([].slice.call(arguments)));
  }

  // ── Who is logged in ───────────────────────────────────────────────────
  function userAttrs() {
    try {
      var u = typeof Knack !== 'undefined' && Knack.getUserAttributes && Knack.getUserAttributes();
      return (u && u !== 'No user found') ? u : null;
    } catch (e) { return null; }
  }
  function userEmail() {
    var u = userAttrs();
    return u && u.email ? String(u.email).trim().toLowerCase() : '';
  }
  function userName() {
    var u = userAttrs();
    if (!u) return '';
    if (typeof u.name === 'string') return u.name;
    if (u.name && (u.name.first || u.name.last)) return [u.name.first, u.name.last].filter(Boolean).join(' ');
    return u.email || '';
  }
  function isAllowed() {
    var list = CONFIG.ALLOWED_EMAILS || [];
    if (!list.length) return true;
    var me = userEmail();
    return !!me && list.map(function (e) { return String(e).trim().toLowerCase(); }).indexOf(me) !== -1;
  }

  // ── Page data ──────────────────────────────────────────────────────────
  function ws() { return (window.SCW && window.SCW.worksheetV2) || null; }
  function fieldsFor(viewKey) {
    var n = ws();
    try { return (n && n.cfg && typeof n.cfg.fields === 'function' && n.cfg.fields(viewKey)) || {}; }
    catch (e) { return {}; }
  }
  function viewCfg(viewKey) {
    var n = ws();
    try { return (n && n.cfg && typeof n.cfg.viewCfg === 'function' && n.cfg.viewCfg(viewKey)) || null; }
    catch (e) { return null; }
  }
  function modelRecords(viewKey) {
    try {
      var v = typeof Knack !== 'undefined' && Knack.views && Knack.views[viewKey];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models || !models.length) return [];
      return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); }).filter(Boolean);
    } catch (e) { return []; }
  }
  function records(viewKey) {
    var n = ws();
    try {
      if (n && n.data && typeof n.data.readRecords === 'function') {
        var r = n.data.readRecords(viewKey);
        if (r && r.length) return r;
      }
    } catch (e) { /* model fallback */ }
    return modelRecords(viewKey);
  }
  function familyOf(rec, viewKey) {
    var n = ws();
    try {
      if (n && n.summary && typeof n.summary.familyOf === 'function') return n.summary.familyOf(rec, viewKey);
    } catch (e) { /* fall through */ }
    return 'other';
  }
  function photosOf(viewKey, recordId) {
    var n = ws(), list = [];
    try {
      if (n && n.photos && typeof n.photos.extractPhotoRecords === 'function') list = n.photos.extractPhotoRecords(viewKey, recordId) || [];
    } catch (e) { list = []; }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.imgUrl) continue;
      var type = stripHtml(p.type || '');
      if (!type && !CONFIG.INCLUDE_UNTYPED_PHOTOS) continue;
      out.push({ id: p.id || '', url: p.imgUrl, type: type });
    }
    return out;
  }

  // Per-device configuration answers (deliverables-worksheet.js): the schema
  // the line item names, its active field definitions in order, the answers
  // blob on the record. Labels matching CONFIG_EXCLUDE never print.
  var schemaCache = null;
  function configFacts(rec) {
    var D = window.SCW && window.SCW.deliverables;
    if (!D || typeof D.ready !== 'function' || !D.ready()) return [];
    var out = [];
    try {
      var sid = typeof D.schemaIdOf === 'function' ? D.schemaIdOf(rec) : '';
      if (!sid) return out;
      if (!schemaCache) schemaCache = (typeof D.schemaFieldsById === 'function' && D.schemaFieldsById()) || {};
      var defs = schemaCache[sid] || [];
      var vals = (typeof D.readValues === 'function' && D.readValues(rec)) || {};
      for (var i = 0; i < defs.length; i++) {
        var def = defs[i];
        if (!def || !def.key) continue;
        if (CONFIG.CONFIG_EXCLUDE.test((def.label || '') + ' ' + def.key)) continue;
        var s = formatAnswer(vals[def.key]);
        if (s) out.push({ label: def.label || def.key, value: s });
      }
    } catch (e) { log('config answers failed', e); }
    return out;
  }
  function formatAnswer(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(formatAnswer).filter(Boolean).join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') return '';
    return stripHtml(v);
  }

  // New drop vs existing cable only (2026-10-21: length, interior /
  // exterior, plenum and conduit were struck from the client copy).
  function composeCable(rec, F) {
    if (!F.existCabling || !hasValue(rec, F.existCabling)) return '';
    return isYes(rec, F.existCabling) ? 'Existing cable' : 'New drop';
  }
  // Location display names arrive as "TYPE: ##: name"; a HEADEND carries no
  // number, so its name reads "HEADEND: : 019 - Server Room". Tidy that.
  function cleanLocation(label) {
    return stripHtml(label).replace(/:\s*:/g, ':').replace(/^\s*:\s*/, '').replace(/\s{2,}/g, ' ').trim();
  }
  function coLabel(ident) {
    var s = stripHtml(ident);
    if (!s) return 'Change order';
    var m = s.match(/CO[-\s]?(\d+)/i) || s.match(/(\d{2,})\s*CO\b/i) || s.match(/^(\d+)$/) || s.match(/SW\s?(\d+)/i);
    if (m) return 'CO ' + m[1];
    return 'CO ' + (s.length > 16 ? s.slice(0, 16) + '…' : s);
  }
  function labelOf(rec, F) {
    var d = readText(rec, F.displayLabel) || readText(rec, F.labelAlt);
    if (d) return d;
    var pre = readText(rec, F.dropPrefix), num = readText(rec, F.dropNumber);
    if (pre && num) return pre + '-' + num;
    return pre || num || '';
  }
  function productOf(rec, F) {
    return readText(rec, F.productName) || readText(rec, F.product);
  }

  // The site map images on the project's files grid (site-maps-strip rules:
  // the file type wins, the file name is the fallback when no type column
  // is on the grid). Only image files can print; PDFs are named, not shown.
  function mapsOf(cfg) {
    if (!cfg || !cfg.mapsView) return [];
    var F = cfg.mapFields || {}, out = [];
    function fileOf(raw, formatted) {
      if (raw && typeof raw === 'object') return { url: raw.url || '', name: raw.filename || '' };
      var m = String(formatted || '').match(/href="([^"]+)"/);
      return { url: m ? m[1] : '', name: '' };
    }
    function isImage(url) { return /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url || ''); }
    modelRecords(cfg.mapsView).forEach(function (rec) {
      var img = fileOf(rec[F.image + '_raw'], rec[F.image]);
      var file = fileOf(rec[F.file + '_raw'], rec[F.file]);
      var url = img.url || file.url;
      if (!url) return;
      var hasType = Object.prototype.hasOwnProperty.call(rec, F.type) || Object.prototype.hasOwnProperty.call(rec, F.type + '_raw');
      var isMap = hasType ? MAP_TYPE.test(readText(rec, F.type)) : MAP_FILE.test((img.url ? img : file).name || url);
      if (!isMap) return;
      var fileName = img.name || file.name || '';
      out.push({ id: rec.id, url: url, name: readText(rec, F.notes) || fileName || 'Site plan', image: isImage(url) });
    });
    return out;
  }

  // Cover facts the scene already shows: the project number (project-id-badge,
  // authoritative), the project name off a loaded record, and the client /
  // site / address off any details view on the scene, matched by label.
  function sceneRoot(sceneId) { return document.getElementById('kn-' + sceneId); }
  function detailByLabel(root, re) {
    if (!root) return '';
    var dets = root.querySelectorAll('.kn-detail');
    for (var i = 0; i < dets.length; i++) {
      var lbl = dets[i].querySelector('.kn-detail-label');
      var body = dets[i].querySelector('.kn-detail-body');
      if (!lbl || !body) continue;
      if (re.test(stripHtml(lbl.textContent))) {
        var t = stripHtml(body.textContent);
        if (t) return t;
      }
    }
    return '';
  }
  function projectNameOf(sceneId) {
    var root = sceneRoot(sceneId);
    try {
      var views = (typeof Knack !== 'undefined' && Knack.views) || {};
      for (var k in views) {
        if (!Object.prototype.hasOwnProperty.call(views, k)) continue;
        var el = document.getElementById(k);
        if (root && el && !root.contains(el)) continue;
        var recs = modelRecords(k);
        for (var i = 0; i < recs.length; i++) {
          var n = readText(recs[i], 'field_4');
          if (n && !recs[i].field_2119 && !recs[i].field_2119_raw) return n;
        }
      }
    } catch (e) { /* DOM fallback */ }
    var hero = document.querySelector('#scw-pid-hero .scw-pid-adopt h1, #scw-pid-hero .scw-pid-adopt h2, #scw-pid-hero .scw-pid-adopt .scw-bsh-title');
    if (hero && stripHtml(hero.textContent)) return stripHtml(hero.textContent).replace(/\s*[·\-–—]\s*\d{6,}\s*$/, '');
    return detailByLabel(root, /^(project\s*name|project|name)$/i);
  }
  function projectNumberOf(sceneId) {
    var pid = window.SCW && window.SCW.projectId;
    if (pid && typeof pid.resolve === 'function') {
      try { var r = pid.resolve(sceneId); return r && r.id ? String(r.id) : ''; } catch (e) { return ''; }
    }
    return '';
  }

  // ── Collect: the report object ─────────────────────────────────────────
  function collect(cfg) {
    var n = ws();
    if (!n || !n.groups || typeof n.groups.buildGroupTree !== 'function') {
      throw new Error('The install worksheet is not loaded on this page.');
    }
    var viewKey = cfg.viewKey;
    var F = fieldsFor(viewKey);
    var vc = viewCfg(viewKey);
    var all = records(viewKey);
    schemaCache = null;

    // Attached accessories by the parent they hang off — the child's
    // back-pointer is authoritative (CLAUDE.md, accessory pair). Mounting
    // hardware and every other attached item (a recorder's hard drives) are
    // kept apart so the card can label them.
    var accessoriesOf = Object.create(null), attached = Object.create(null);
    all.forEach(function (rec) {
      var p = connList(rec, F.parent)[0];
      if (!p) return;
      attached[rec.id] = true;
      var name = productOf(rec, F);
      if (!name) return;
      var acc = accessoriesOf[p.id] || (accessoriesOf[p.id] = { mounts: [], accessories: [] });
      acc[familyOf(rec, viewKey) === 'mount' ? 'mounts' : 'accessories'].push(name);
    });

    var tree = n.groups.buildGroupTree(all, null, {
      fields: F, viewKey: viewKey,
      accessoriesAlwaysAttach: !!(vc && vc.accessoriesAlwaysAttach)
    }) || [];

    var locations = [], removed = [], devices = [], seen = Object.create(null);
    function deviceOf(rec, loc) {
      var fam = familyOf(rec, viewKey);
      var qty = readNum(rec, F.qty);
      return {
        id: rec.id,
        label: labelOf(rec, F) || productOf(rec, F) || rec.id,
        product: productOf(rec, F),
        family: fam === 'cam' ? 'cam' : (fam === 'headend' ? 'headend' : 'other'),
        location: loc.label, locationId: loc.id,
        status: readText(rec, F.installStatus),
        qty: qty && qty > 1 ? qty : 0,
        connectedTo: connList(rec, F.connectedDevice)[0] || null,
        connectedDeviceIds: connList(rec, F.connectedDevices).map(function (c) { return c.id; }),
        connectedDevices: [],
        mounts: (accessoriesOf[rec.id] || {}).mounts || [],
        accessories: (accessoriesOf[rec.id] || {}).accessories || [],
        cable: composeCable(rec, F),
        facts: configFacts(rec),
        photos: photosOf(viewKey, rec.id)
      };
    }
    tree.forEach(function (l1) {
      var label = stripHtml(l1.label || '');
      if (l1.isSynthetic && /service|assumption|licen|orphan/i.test(label)) return;
      var loc = { id: l1.id, label: (l1.isSynthetic ? 'No location assigned' : cleanLocation(label)) || 'Location', devices: [] };
      (l1.l2 || []).forEach(function (l2) {
        (l2.records || []).forEach(function (rec) {
          if (!rec || seen[rec.id]) return;
          seen[rec.id] = true;
          var fam = familyOf(rec, viewKey);
          if (fam === 'services' || fam === 'assumptions' || fam === 'license' || fam === 'mount') return;
          if (attached[rec.id]) return;
          var d = deviceOf(rec, loc);
          if (connList(rec, F.removedByCo).length) {
            d.co = coLabel(connList(rec, F.removedByCo)[0].identifier);
            removed.push(d);
            return;
          }
          loc.devices.push(d);
          devices.push(d);
        });
      });
      if (loc.devices.length) locations.push(loc);
    });

    // Resolve connections against the live devices (labels, not identifiers).
    var byId = Object.create(null);
    devices.forEach(function (d) { byId[d.id] = d; });
    devices.forEach(function (d) {
      if (d.connectedTo) {
        var p = byId[d.connectedTo.id];
        d.connectedTo = { id: d.connectedTo.id, label: p ? p.label : d.connectedTo.identifier, product: p ? p.product : '' };
      }
    });
    var network = buildNetwork(devices);
    devices.forEach(function (d) {
      d.connectedDevices = (network.childrenOf[d.id] || []).map(function (c) { return { id: c.id, label: c.label }; });
    });

    var photoCount = 0;
    devices.forEach(function (d) { photoCount += d.photos.length; });
    // The tiles count the devices that get cards (qty-weighted) — never an
    // attached accessory, a mount, a service or a removed item. The scope
    // aggregate is only asked which family name fits: Cameras or Readers.
    var scope = { title: 'Cameras', cameras: 0, headend: 0, other: 0 };
    devices.forEach(function (d) {
      var q = d.qty || 1;
      if (d.family === 'cam') scope.cameras += q; else if (d.family === 'headend') scope.headend += q; else scope.other += q;
    });
    try {
      if (n.summary && typeof n.summary.aggregateScope === 'function') {
        var a = n.summary.aggregateScope(all, { fields: F, viewKey: viewKey, hideMoney: true });
        if (a && a.title) scope.title = a.title;
      }
    } catch (e) { log('aggregateScope failed', e); }
    scope.locations = locations.length;
    scope.photos = photoCount;
    scope.removed = removed.length;

    var root = sceneRoot(cfg.sceneId);
    return {
      sceneId: cfg.sceneId, viewKey: viewKey,
      projectNo: projectNumberOf(cfg.sceneId),
      projectName: projectNameOf(cfg.sceneId),
      client: detailByLabel(root, /company|client|customer|account/i),
      site: detailByLabel(root, /site\s*name|location\s*name|property/i),
      address: detailByLabel(root, /address/i),
      preparedBy: userName(),
      date: todayText(),
      scope: scope,
      maps: mapsOf(cfg),
      locations: locations,
      devices: devices,
      removed: removed,
      network: network
    };
  }

  // The network tree. A child's own Connected To wins; a forward Connected
  // Devices claim only adopts a child that names no parent itself (same
  // authoritative-union rule the worksheet displays). Roots = devices with
  // no parent and at least one child; cameras with neither are listed as
  // not connected.
  function buildNetwork(devices) {
    var byId = Object.create(null), parentOf = Object.create(null), childrenOf = Object.create(null);
    devices.forEach(function (d, i) { d.order = i; byId[d.id] = d; childrenOf[d.id] = []; });
    devices.forEach(function (d) {
      if (d.connectedTo && byId[d.connectedTo.id] && d.connectedTo.id !== d.id) parentOf[d.id] = d.connectedTo.id;
    });
    devices.forEach(function (d) {
      (d.connectedDeviceIds || []).forEach(function (cid) {
        if (byId[cid] && cid !== d.id && !parentOf[cid]) parentOf[cid] = d.id;
      });
    });
    devices.forEach(function (d) { var p = parentOf[d.id]; if (p && childrenOf[p]) childrenOf[p].push(d); });
    Object.keys(childrenOf).forEach(function (k) { childrenOf[k].sort(function (a, b) { return a.order - b.order; }); });

    var seen = Object.create(null);
    function node(d, depth) {
      seen[d.id] = true;
      var branches = [], leaves = [];
      (childrenOf[d.id] || []).forEach(function (k) {
        if (seen[k.id]) return;
        if ((childrenOf[k.id] || []).length && depth < 4) branches.push(node(k, depth + 1));
        else { seen[k.id] = true; leaves.push(k); }
      });
      return { device: d, branches: branches, leaves: leaves };
    }
    var roots = [], unconnected = [];
    devices.forEach(function (d) {
      if (parentOf[d.id]) return;
      if ((childrenOf[d.id] || []).length) roots.push(node(d, 0));
      else if (d.family === 'cam') unconnected.push(d);
    });
    // A cycle (two devices naming each other) leaves both parented: break it
    // at the first unseen device that has children so nothing disappears.
    devices.forEach(function (d) {
      if (!seen[d.id] && (childrenOf[d.id] || []).length) roots.push(node(d, 0));
    });
    return { roots: roots, unconnected: unconnected, childrenOf: childrenOf };
  }

  // ── Images: redraw every photo smaller before the document is written ──
  // A Knack image is reachable at two addresses (the api.knack.com download
  // endpoint and the S3 asset path). The browser may redraw it only when the
  // host it is loaded from allows cross-origin reads, so both are tried;
  // when neither does, the photo prints from Knack's thumbnail derivative
  // (no cross-origin access needed), and only as a last resort full size.
  function hostForms(url) {
    var s0 = String(url || ''), out = [];
    var m = s0.match(/^https?:\/\/s3[^/]*\.amazonaws\.com\/assets\.knackhq\.com\/assets\/([a-f0-9]{24})\/([a-f0-9]{24})\/original\/(.+)$/i);
    if (m) {
      out.push('https://api.knack.com/v1/applications/' + m[1] + '/download/asset/' + m[2] + '/' + m[3]);
      out.push(s0);
      return out;
    }
    m = s0.match(/^https?:\/\/api\.knack\.com\/v1\/applications\/([a-f0-9]{24})\/download\/asset\/([a-f0-9]{24})\/(.+)$/i);
    if (m) {
      out.push(s0);
      out.push('https://s3.us-east-1.amazonaws.com/assets.knackhq.com/assets/' + m[1] + '/' + m[2] + '/original/' + m[3]);
      return out;
    }
    out.push(s0);
    return out;
  }
  function loadCors(url) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      var img;
      try { img = new Image(); } catch (e) { finish(null); return; }
      img.onload = function () { finish(img); };
      img.onerror = function () { finish(null); };
      try { img.crossOrigin = 'anonymous'; } catch (e) { /* optional */ }
      setTimeout(function () { finish(null); }, CONFIG.PHOTO_LOAD_TIMEOUT_MS);
      img.src = url;
    });
  }
  function shrink(img, maxDim, quality) {
    try {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      if (!w || !h) return '';
      var scale = Math.min(1, maxDim / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var ctx = c.getContext('2d');
      if (!ctx) return '';
      ctx.drawImage(img, 0, 0, cw, ch);
      var out = c.toDataURL('image/jpeg', quality);
      return /^data:image\/jpeg/.test(out || '') ? out : '';
    } catch (e) { return ''; }                 // a tainted canvas throws here
  }
  function thumbOf(url) {
    var style = CONFIG.PHOTO_FALLBACK_STYLE;
    if (!style || !window.SCW || typeof window.SCW.knackImgThumb !== 'function') return '';
    var t = window.SCW.knackImgThumb(url, style);
    return t && t !== url ? t : '';
  }
  function resolvePhoto(p) {
    var forms = hostForms(p.url), i = 0;
    function tryNext() {
      if (i >= forms.length) {
        var t = thumbOf(p.url);
        if (t) { p.src = t; p.fallback = p.url; p.mode = 'thumb'; }
        else { p.src = p.url; p.mode = 'original'; }
        return Promise.resolve(p);
      }
      var u = forms[i++];
      return loadCors(u).then(function (img) {
        var data = img ? shrink(img, CONFIG.PHOTO_MAX_DIM, CONFIG.PHOTO_QUALITY) : '';
        if (data) { p.src = data; p.mode = 'reduced'; return p; }
        return tryNext();
      });
    }
    return tryNext();
  }
  function prepareImages(report, onProgress) {
    var jobs = [];
    report.devices.forEach(function (d) { d.photos.forEach(function (p) { jobs.push(p); }); });
    var total = jobs.length, doneCount = 0;
    report.photoStats = { total: total, reduced: 0, thumb: 0, original: 0 };
    if (!total || !CONFIG.PHOTO_MAX_DIM) return Promise.resolve(report);
    return new Promise(function (resolve) {
      var i = 0, running = 0;
      function next() {
        while (running < CONFIG.PHOTO_CONCURRENCY && i < jobs.length) {
          (function (p) {
            running++;
            resolvePhoto(p).then(function () {
              running--; doneCount++;
              report.photoStats[p.mode] = (report.photoStats[p.mode] || 0) + 1;
              if (onProgress) { try { onProgress(doneCount, total); } catch (e) { /* ui only */ } }
              if (doneCount >= total) {
                log('photos', report.photoStats);
                resolve(report);
              } else next();
            });
          })(jobs[i++]);
        }
      }
      next();
    });
  }
  function photoStatsText(st) {
    if (!st || !st.total) return '';
    var parts = [];
    if (st.reduced) parts.push(st.reduced + ' reduced in the browser');
    if (st.thumb) parts.push(st.thumb + ' at Knack\'s thumbnail size (the photo host blocks in-browser reduction)');
    if (st.original) parts.push(st.original + ' at full size');
    return st.total + ' photos: ' + parts.join(' · ');
  }

  // ── The document ───────────────────────────────────────────────────────
  function css() {
    return [
      '@page { size: letter portrait; margin: 0.6in 0.7in; }',
      '*, *::before, *::after { box-sizing: border-box; }',
      'html, body { background: #ffffff; }',
      'body { margin: 0; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1f2937; font-size: 14px; line-height: 1.45;',
      '  -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      'h1, h2, h3, p, dl, dd, dt, figure { margin: 0; }',
      '.cr-screen { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 14px; padding: 10px 16px; background: #0f172a; color: #e2e8f0; font-size: 13px; }',
      '.cr-screen button { font: 600 13px/1 inherit; padding: 9px 14px; border: 0; border-radius: 6px; background: #ed8326; color: #fff; cursor: pointer; }',
      '.cr-doc { max-width: 7.1in; margin: 0 auto; padding: 24px 0 40px; }',
      '@media print { .cr-screen { display: none; } .cr-doc { max-width: none; padding: 0; } }',
      '.cr-page { break-before: page; page-break-before: always; }',
      '.cr-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ' + NAVY + '; }',
      '.cr-h1 { font-size: 38px; line-height: 1.1; font-weight: 800; color: #111827; }',
      '.cr-h2 { font-size: 22px; line-height: 1.25; font-weight: 600; color: #1f2937; }',
      '.cr-sec { font-size: 26px; line-height: 1.2; font-weight: 800; color: #111827; }',
      '.cr-muted { color: #4b5563; }',
      '.cr-small { font-size: 12px; color: #4b5563; }',
      '.cr-title { margin-top: 36px; display: flex; flex-direction: column; gap: 10px; }',
      '.cr-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; padding: 18px 22px; border: 1px solid #d0d7de; border-radius: 6px; background: #f8fafc; margin-top: 28px; }',
      '.cr-meta-k { font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #4b5563; }',
      '.cr-meta-v { font-size: 16px; }',
      '.cr-pn { font-size: 26px; font-weight: 800; color: ' + NAVY + '; line-height: 1.1; }',
      '.cr-tiles { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 24px; }',
      '.cr-note { margin-top: 10px; font-size: 12px; color: #4b5563; }',
      '.cr-tile { padding: 12px; border: 1px solid #d0d7de; border-radius: 6px; }',
      '.cr-tile b { display: block; font-size: 28px; color: ' + NAVY + '; line-height: 1; margin-bottom: 6px; }',
      '.cr-tile span { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #4b5563; }',
      '.cr-toc { margin-top: 24px; }',
      '.cr-toc div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }',
      '.cr-lochead { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 8px; border-bottom: 2px solid ' + NAVY + '; margin: 0 0 12px; }',
      '.cr-lochead h2 { font-size: 22px; line-height: 1.2; font-weight: 800; color: #111827; }',
      // Three device cards to a Letter page: compact head, one-column facts,
      // four photos to a row (the whole photo, never a crop), the card never
      // split across pages.
      '.cr-card { border: 1px solid #d0d7de; border-radius: 6px; padding: 10px 12px; margin: 0 0 10px; break-inside: avoid; page-break-inside: avoid; }',
      '.cr-card-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }',
      '.cr-label { font-size: 17px; font-weight: 800; color: ' + NAVY + '; }',
      '.cr-product { font-size: 13.5px; font-weight: 600; }',
      '.cr-qty { font-size: 12px; color: #4b5563; }',
      '.cr-status { margin-left: auto; font-size: 10.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #065f46; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 999px; padding: 2px 8px; }',
      '.cr-status--open { color: #374151; background: #f3f4f6; border-color: #d1d5db; }',
      '.cr-facts { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 2px 10px; margin-top: 6px; font-size: 12px; line-height: 1.35; }',
      '.cr-facts dt { color: #4b5563; }',
      '.cr-facts dd { color: #1f2937; overflow-wrap: anywhere; }',
      '.cr-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; vertical-align: top; }',
      '.cr-chip { font-size: 10.5px; font-weight: 600; border: 1px solid #c9d4de; border-radius: 999px; padding: 1px 7px; color: #1f2937; line-height: 1.4; }',
      '.cr-photos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }',
      '.cr-photo { width: calc(25% - 6px); }',
      '.cr-photo img { width: 100%; aspect-ratio: 4 / 3; object-fit: contain; background: #f3f4f6; display: block; border: 1px solid #e5e7eb; border-radius: 4px; }',
      '.cr-photo figcaption { font-size: 10px; color: #4b5563; margin-top: 2px; line-height: 1.3; }',
      '.cr-map figure { margin-top: 16px; }',
      '.cr-map img { width: 100%; height: auto; max-height: 8.6in; object-fit: contain; display: block; border: 1px solid #d0d7de; border-radius: 6px; }',
      '.cr-map figcaption { font-size: 12px; color: #4b5563; margin-top: 6px; }',
      'table.cr-table { border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 12px; }',
      '.cr-table th { text-align: left; font-size: 11px; letter-spacing: .5px; text-transform: uppercase; color: ' + NAVY + '; background: #eef4fb; padding: 7px 9px; border-bottom: 1px solid #c9d4de; }',
      '.cr-table td { padding: 6px 9px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }',
      '.cr-table td.num, .cr-table th.num { text-align: right; }',
      '.cr-table--removed th { color: #9f1239; background: #fff1f2; border-bottom-color: #fecdd3; }',
      '.cr-removed { display: inline-block; color: #9f1239; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 999px; font-size: 11px; font-weight: 700; padding: 2px 8px; text-transform: uppercase; letter-spacing: .5px; }',
      // Network map on ONE page: a band per location, one row per recorder
      // or switch (node on the left, the devices connected to it as chips).
      '.nm-intro { margin: 4px 0 12px; color: #4b5563; font-size: 12.5px; }',
      '.nm-loc { margin: 0 0 10px; break-inside: avoid; page-break-inside: avoid; }',
      '.nm-band { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ' + NAVY + '; padding: 4px 0; border-bottom: 2px solid ' + NAVY + '; }',
      '.nm-row { display: grid; grid-template-columns: 2.2in minmax(0, 1fr); gap: 10px; align-items: start; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }',
      '.nm-node { font-size: 12px; line-height: 1.3; }',
      '.nm-node b { display: block; font-size: 13px; color: ' + NAVY + '; }',
      '.nm-node small { display: block; font-size: 10.5px; color: #4b5563; }',
      '.nm-node--root b { color: #0f172a; }',
      '.nm-chips { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 2px; }',
      '.nm-feeds { font-size: 10.5px; color: #4b5563; }',
      '.nm-unconnected { margin-top: 14px; padding: 8px 12px; border: 1px solid #fde68a; background: #fffbeb; border-radius: 6px; break-inside: avoid; }',
      '.cr-footer { margin-top: 24px; }'
    ].join('\n');
  }

  function bannerHtml(report) {
    var pid = window.SCW && window.SCW.projectId;
    var right = ['Deployment report', report.projectName].filter(Boolean);
    if (pid && typeof pid.banner === 'function') {
      try { return pid.banner(report.projectNo, { right: right }); } catch (e) { /* fallback */ }
    }
    return '<div class="scw-pid-banner" style="border-top:3px solid #0f4c75;padding:12px 0 10px;margin:0 0 18px;">' +
      '<div class="cr-small">Project #</div><div class="cr-pn">' + esc(report.projectNo || 'not on record') + '</div></div>';
  }
  function footerHtml(report) {
    var pid = window.SCW && window.SCW.projectId;
    if (pid && typeof pid.footer === 'function') {
      try { return pid.footer(report.projectNo, 'Deployment report · ' + report.date); } catch (e) { /* fallback */ }
    }
    return '';
  }

  function coverHtml(report) {
    var s = report.scope, h = [];
    var client = report.client || report.projectName || '';
    var site = report.site || (report.client ? report.projectName : '');
    h.push('<section class="cr-cover">');
    h.push(bannerHtml(report));
    h.push('<div class="cr-title">');
    h.push('<div class="cr-eyebrow">Your installed system</div>');
    if (client) h.push('<h1 class="cr-h1">' + esc(client) + '</h1>');
    if (site && site !== client) h.push('<h2 class="cr-h2">' + esc(site) + '</h2>');
    if (report.address) h.push('<p class="cr-muted">' + esc(report.address) + '</p>');
    h.push('</div>');
    h.push('<div class="cr-meta">');
    h.push('<div style="grid-column: span 2"><div class="cr-meta-k">Project number</div>' +
      '<div class="cr-pn">' + esc(report.projectNo || 'not on record') + '</div>' +
      '<div class="cr-small">Reference this project number when contacting SCW support.</div></div>');
    h.push('<div><div class="cr-meta-k">Report date</div><div class="cr-meta-v">' + esc(report.date) + '</div></div>');
    if (report.preparedBy) h.push('<div><div class="cr-meta-k">Prepared by</div><div class="cr-meta-v">' + esc(report.preparedBy) + ' · SCW</div></div>');
    h.push('</div>');
    h.push('<div class="cr-tiles">');
    h.push('<div class="cr-tile"><b>' + s.cameras + '</b><span>' + esc(s.title) + '</span></div>');
    h.push('<div class="cr-tile"><b>' + s.headend + '</b><span>Headend &amp; network</span></div>');
    h.push('<div class="cr-tile"><b>' + s.other + '</b><span>Other equipment</span></div>');
    h.push('<div class="cr-tile"><b>' + s.locations + '</b><span>MDF / IDF locations</span></div>');
    h.push('<div class="cr-tile"><b>' + s.photos + '</b><span>Photos</span></div>');
    h.push('</div>');
    h.push('<div class="cr-toc"><div class="cr-meta-k" style="border:0">In this report</div>');
    if (report.maps.length) h.push('<div><span>Site map' + (report.maps.length === 1 ? '' : 's') + '</span><span class="cr-muted">' + report.maps.length + '</span></div>');
    h.push('<div><span>Devices by location, with photos</span><span class="cr-muted">' + plural(report.locations.length, 'location') + '</span></div>');
    h.push('<div><span>Network map</span><span class="cr-muted">' + plural(report.network.roots.length, 'recorder or switch', 'recorders and switches') + '</span></div>');
    if (report.removed.length) h.push('<div><span>Removed by change order</span><span class="cr-muted">' + plural(report.removed.length, 'item') + '</span></div>');
    h.push('<div><span>Device index</span><span class="cr-muted">' + plural(report.devices.length, 'device') + '</span></div>');
    h.push('</div>');
    h.push('</section>');
    return h.join('\n');
  }

  function mapsHtml(report) {
    var h = [];
    report.maps.forEach(function (m) {
      h.push('<section class="cr-page cr-map">');
      h.push('<div class="cr-eyebrow">Site map</div><h2 class="cr-sec">' + esc(m.name) + '</h2>');
      if (m.image) {
        h.push('<figure><img src="' + esc(m.url) + '" alt="' + esc(m.name) + '"><figcaption>Device labels on the map match the labels used throughout this report.</figcaption></figure>');
      } else {
        h.push('<p class="cr-muted" style="margin-top:12px">This site plan is a document, not an image, and is delivered alongside this report.</p>');
      }
      h.push('</section>');
    });
    return h.join('\n');
  }

  function factsHtml(pairs) {
    if (!pairs.length) return '';
    var h = ['<dl class="cr-facts">'];
    pairs.forEach(function (p) {
      h.push('<dt>' + esc(p.label) + '</dt><dd>' + (p.html ? p.html : esc(p.value)) + '</dd>');
    });
    h.push('</dl>');
    return h.join('');
  }
  function chipsHtml(labels) {
    return '<span class="cr-chips">' + labels.map(function (l) { return '<span class="cr-chip">' + esc(l) + '</span>'; }).join('') + '</span>';
  }
  function photosHtml(photos) {
    if (!photos.length) return '';
    var h = ['<div class="cr-photos">'];
    photos.forEach(function (p) {
      h.push('<figure class="cr-photo"><img src="' + esc(p.src || p.url) + '" alt="' + esc(p.type || 'Photo') + '"' +
        (p.fallback ? ' onerror="this.onerror=null;this.src=\'' + esc(p.fallback) + '\'"' : '') + '>' +
        '<figcaption>' + esc(p.type || 'Photo') + '</figcaption></figure>');
    });
    h.push('</div>');
    return h.join('');
  }
  function normTxt(str) { return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function labelCarries(label, product) {
    var l = normTxt(label), p = normTxt(product);
    return !!(l && p && l.indexOf(p) !== -1);
  }
  function statusChip(d) {
    if (!d.status || CONFIG.STATUS_CHIP === 'none') return '';
    var done = /done|install|complete|pass|finish/i.test(d.status);
    if (CONFIG.STATUS_CHIP !== 'all' && !done) return '';
    return '<span class="cr-status' + (done ? '' : ' cr-status--open') + '">' + esc(d.status) + '</span>';
  }
  function deviceCardHtml(d) {
    var h = ['<article class="cr-card">'];
    h.push('<div class="cr-card-head"><span class="cr-label">' + esc(d.label) + '</span>' +
      (d.product && !labelCarries(d.label, d.product) ? '<span class="cr-product">' + esc(d.product) + '</span>' : '') +
      (d.qty ? '<span class="cr-qty">× ' + d.qty + '</span>' : '') + statusChip(d) + '</div>');
    var pairs = [];
    if (d.connectedTo) {
      pairs.push({ label: 'Connected to', value: d.connectedTo.label +
        (d.connectedTo.product && !labelCarries(d.connectedTo.label, d.connectedTo.product) ? ' · ' + d.connectedTo.product : '') });
    }
    if (d.connectedDevices.length) {
      pairs.push({ label: 'Connected devices', html: chipsHtml(d.connectedDevices.map(function (c) { return c.label; })) });
    }
    if (CONFIG.SHOW_MOUNTS && d.mounts.length) pairs.push({ label: 'Mount', value: d.mounts.join(', ') });
    if (CONFIG.SHOW_ACCESSORIES && d.accessories.length) pairs.push({ label: 'Accessories', value: d.accessories.join(', ') });
    if (d.cable) pairs.push({ label: 'Cable', value: d.cable });
    d.facts.forEach(function (f) { pairs.push(f); });
    h.push(factsHtml(pairs));
    h.push(photosHtml(d.photos));
    h.push('</article>');
    return h.join('');
  }
  function locationsHtml(report) {
    var h = [];
    report.locations.forEach(function (loc) {
      var cams = 0, head = 0, other = 0;
      loc.devices.forEach(function (d) { if (d.family === 'cam') cams++; else if (d.family === 'headend') head++; else other++; });
      var counts = [];
      if (cams) counts.push(plural(cams, report.scope.title === 'Readers' ? 'reader' : 'camera'));
      if (head) counts.push(plural(head, 'headend / network device'));
      if (other) counts.push(plural(other, 'other item'));
      h.push('<section class="cr-page cr-location">');
      h.push('<div class="cr-lochead"><div><div class="cr-eyebrow">Devices by location</div><h2>' + esc(loc.label) + '</h2>' +
        '<div class="cr-muted">' + esc(counts.join(' · ')) + '</div></div></div>');
      loc.devices.forEach(function (d) { h.push(deviceCardHtml(d)); });
      h.push('</section>');
    });
    return h.join('\n');
  }

  // Flatten the tree into rows (one per recorder / switch, in tree order),
  // then group the rows by location in the report's location order.
  function networkRows(report) {
    var rows = [];
    function walk(node, parent) {
      rows.push({ device: node.device, parent: parent, leaves: node.leaves,
                  feeds: node.branches.map(function (b) { return b.device; }) });
      node.branches.forEach(function (b) { walk(b, node.device); });
    }
    report.network.roots.forEach(function (r) { walk(r, null); });
    var order = {};
    report.locations.forEach(function (l, i) { order[l.label] = i; });
    var groups = [], byLoc = {};
    rows.forEach(function (row) {
      var key = row.device.location || 'No location assigned';
      if (!byLoc[key]) { byLoc[key] = { label: key, rows: [] }; groups.push(byLoc[key]); }
      byLoc[key].rows.push(row);
    });
    groups.sort(function (a, b) {
      var oa = order[a.label] == null ? 999 : order[a.label], ob = order[b.label] == null ? 999 : order[b.label];
      return oa - ob;
    });
    return groups;
  }
  function chipList(devices) {
    return devices.map(function (l) { return '<span class="cr-chip">' + esc(l.label) + '</span>'; }).join('');
  }
  function networkHtml(report) {
    var h = ['<section class="cr-page cr-network">'];
    h.push('<div class="cr-eyebrow">Network map</div><h2 class="cr-sec">What connects to what</h2>');
    h.push('<p class="nm-intro">One row per recorder or switch; the chips are the devices connected to it, from the connection recorded on every device.</p>');
    var groups = networkRows(report);
    if (!groups.length) h.push('<p class="cr-muted">No connections are recorded on this deployment yet.</p>');
    groups.forEach(function (g) {
      h.push('<div class="nm-loc"><div class="nm-band">' + esc(g.label) + '</div>');
      g.rows.forEach(function (row) {
        var d = row.device;
        var sub = [d.product && !labelCarries(d.label, d.product) ? d.product : '',
                   row.parent ? 'uplinks to ' + row.parent.label : ''].filter(Boolean).join(' · ');
        var chips = chipList(row.leaves);
        if (row.feeds.length) {
          chips += '<span class="nm-feeds">' + (row.leaves.length ? ' · ' : '') + 'feeds ' +
            esc(row.feeds.map(function (f) { return f.label; }).join(', ')) + '</span>';
        }
        h.push('<div class="nm-row"><div class="nm-node' + (row.parent ? '' : ' nm-node--root') + '"><b>' + esc(d.label) + '</b>' +
          (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div><div class="nm-chips">' + chips + '</div></div>');
      });
      h.push('</div>');
    });
    if (report.network.unconnected.length) {
      h.push('<div class="nm-unconnected"><div class="cr-meta-k" style="color:#92400e;margin-bottom:4px">Not connected to a recorder or switch</div>' +
        '<div class="nm-chips">' + chipList(report.network.unconnected) + '</div></div>');
    }
    h.push('</section>');
    return h.join('\n');
  }

  function removedHtml(report) {
    if (!report.removed.length) return '';
    var h = ['<section class="cr-page cr-removed-sec">'];
    h.push('<div class="cr-eyebrow">Change orders</div><h2 class="cr-sec">Removed by change order</h2>');
    h.push('<p class="cr-muted" style="margin-top:6px">These items were in the original scope and were removed by a signed change order. They are not installed.</p>');
    h.push('<table class="cr-table cr-table--removed"><thead><tr><th>Label</th><th>Product</th><th>Location</th><th>Change order</th><th>Status</th></tr></thead><tbody>');
    report.removed.forEach(function (d) {
      h.push('<tr><td><b>' + esc(d.label) + '</b></td><td>' + esc(d.product) + '</td><td>' + esc(d.location) + '</td><td>' + esc(d.co) + '</td><td><span class="cr-removed">Removed</span></td></tr>');
    });
    h.push('</tbody></table></section>');
    return h.join('\n');
  }
  function indexHtml(report) {
    var h = ['<section class="' + (report.removed.length ? '' : 'cr-page ') + 'cr-index" style="margin-top:' + (report.removed.length ? '30px' : '0') + '">'];
    h.push('<div class="cr-eyebrow">Reference</div><h2 class="cr-sec">Device index</h2>');
    h.push('<table class="cr-table"><thead><tr><th>Label</th><th>Product</th><th>Location</th><th>Connected to</th><th class="num">Photos</th></tr></thead><tbody>');
    report.devices.forEach(function (d) {
      h.push('<tr><td><b>' + esc(d.label) + '</b></td><td>' + esc(d.product) + '</td><td>' + esc(d.location) + '</td>' +
        '<td>' + (d.connectedTo ? esc(d.connectedTo.label) : '<span class="cr-muted">None</span>') + '</td><td class="num">' + d.photos.length + '</td></tr>');
    });
    h.push('</tbody></table></section>');
    return h.join('\n');
  }

  function buildHtml(report) {
    var title = [report.client || report.projectName || 'Deployment', 'Deployment report'].filter(Boolean).join(' · ');
    return [
      '<!DOCTYPE html>',
      '<html lang="en"><head><meta charset="utf-8">',
      '<title>' + esc(title) + '</title>',
      '<style>' + css() + '</style>',
      '</head><body>',
      '<div class="cr-screen"><button type="button" onclick="window.print()">Print / Save as PDF</button>' +
        '<span>In the print dialog choose <b>Save as PDF</b>. This bar does not print.' +
        (photoStatsText(report.photoStats) ? ' · ' + esc(photoStatsText(report.photoStats)) : '') + '</span></div>',
      '<div class="cr-doc">',
      coverHtml(report),
      mapsHtml(report),
      locationsHtml(report),
      networkHtml(report),
      removedHtml(report),
      indexHtml(report),
      '<div class="cr-footer">' + footerHtml(report) + '</div>',
      '</div>',
      '</body></html>'
    ].join('\n');
  }

  // ── Generate: open the tab first (user gesture), fill it when ready ────
  function setBusy(btn, text) {
    if (!btn) return;
    if (!btn.hasAttribute('data-scw-cr-label')) btn.setAttribute('data-scw-cr-label', btn.textContent);
    btn.textContent = text;
    btn.disabled = true;
  }
  function clearBusy(btn) {
    if (!btn) return;
    btn.textContent = btn.getAttribute('data-scw-cr-label') || CONFIG.BUTTON_LABEL;
    btn.disabled = false;
  }
  function generate(cfg, btn) {
    cfg = cfg || activeScene();
    if (!cfg) return null;
    var win = null;
    try { win = window.open('', '_blank'); } catch (e) { win = null; }
    if (!win) {
      window.alert('The report opens in a new tab. Allow pop-ups for this site, then click Client report again.');
      return null;
    }
    try {
      win.document.write('<!DOCTYPE html><title>Client report</title><body style="font:15px/1.5 system-ui,sans-serif;padding:28px;color:#1f2937">' +
        '<p>Preparing the client report… <span id="scw-cr-progress"></span></p></body>');
    } catch (e) { /* the final write replaces it */ }
    setBusy(btn, 'Preparing…');
    var report;
    try {
      report = collect(cfg);
    } catch (e) {
      clearBusy(btn);
      try { win.document.body.innerHTML = '<p>Could not build the report: ' + esc(e && e.message || e) + '</p>'; } catch (e2) { /* closed */ }
      console.warn('[scw-client-report] collect failed', e);
      return null;
    }
    function progress(done, total) {
      setBusy(btn, 'Preparing photos ' + done + ' / ' + total + '…');
      try { var p = win.document.getElementById('scw-cr-progress'); if (p) p.textContent = done + ' / ' + total + ' photos'; } catch (e) { /* closed */ }
    }
    return prepareImages(report, progress).then(function () {
      var html = buildHtml(report);
      try {
        win.document.open();
        win.document.write(html);
        win.document.close();
        setTimeout(function () { try { win.focus(); win.print(); } catch (e) { /* user prints from the bar */ } }, CONFIG.PRINT_DELAY_MS);
      } catch (e) { console.warn('[scw-client-report] could not write the report tab', e); }
      clearBusy(btn);
      return report;
    }, function (e) {
      clearBusy(btn);
      console.warn('[scw-client-report] failed', e);
      return null;
    });
  }

  // ── The toolbar button ─────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + BTN_ID + '[disabled] { opacity: .7; cursor: progress; }'
    ].join('\n');
    document.head.appendChild(s);
  }
  function activeScene() {
    for (var i = 0; i < CONFIG.SCENES.length; i++) {
      if (sceneRoot(CONFIG.SCENES[i].sceneId)) return CONFIG.SCENES[i];
    }
    return null;
  }
  function mount(cfg) {
    cfg = cfg || activeScene();
    if (!cfg || !isAllowed()) return false;
    var panel = document.getElementById('scw-ws-v2-' + cfg.viewKey);
    var group = panel && panel.querySelector('.scw-ws-v2-toolbar-group--cta');
    if (!group) return false;
    injectStyles();
    var btn = document.getElementById(BTN_ID);
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = BTN_ID;
      btn.className = 'scw-ws-v2-toolbar-btn scw-ws-v2-toolbar-btn--cta' +
        ((CONFIG.ALLOWED_EMAILS || []).length ? ' scw-ws-v2-toolbar-btn--preview' : '');
      btn.textContent = CONFIG.BUTTON_LABEL;
      btn.title = 'Build the client-facing deployment report (devices, configuration, photos, network map) and print it to PDF' +
        ((CONFIG.ALLOWED_EMAILS || []).length ? ' — preview: only you see this button' : '');
      btn.addEventListener('click', function () { generate(cfg, btn); });
    }
    if (btn.parentNode !== group) group.appendChild(btn);
    return true;
  }

  // The worksheet rebuilds its toolbar on every render; watch the scene and
  // put the button back (idempotent, debounced).
  var observer = null, observedScene = '', remountTimer = null;
  function watch(cfg) {
    if (!cfg || !isAllowed()) return;
    var root = sceneRoot(cfg.sceneId);
    if (!root || typeof MutationObserver === 'undefined') { mount(cfg); return; }
    if (observer && observedScene === cfg.sceneId) { mount(cfg); return; }
    if (observer) observer.disconnect();
    observedScene = cfg.sceneId;
    observer = new MutationObserver(function () {
      if (document.getElementById(BTN_ID) && document.getElementById(BTN_ID).isConnected) return;
      if (remountTimer) clearTimeout(remountTimer);
      remountTimer = setTimeout(function () { remountTimer = null; mount(cfg); }, 150);
    });
    observer.observe(root, { childList: true, subtree: true });
    mount(cfg);
  }
  function unwatch() {
    if (observer) { observer.disconnect(); observer = null; observedScene = ''; }
  }

  function bind() {
    if (!window.SCW || typeof SCW.onSceneRender !== 'function') return;
    CONFIG.SCENES.forEach(function (cfg) {
      SCW.onSceneRender(cfg.sceneId, function () { watch(cfg); }, NS);
      if (typeof SCW.onViewRender === 'function') SCW.onViewRender(cfg.viewKey, function () { watch(cfg); }, NS);
    });
    if (typeof $ !== 'undefined' && $.fn) {
      $(document).off('knack-scene-render.any' + NS).on('knack-scene-render.any' + NS, function (e, scene) {
        var key = scene && scene.key;
        if (key && !CONFIG.SCENES.some(function (c) { return c.sceneId === key; })) unwatch();
      });
    }
  }

  window.SCW = window.SCW || {};
  window.SCW.deployClientReport = {
    CONFIG: CONFIG,
    collect: collect,
    buildHtml: buildHtml,
    prepareImages: prepareImages,
    generate: generate,
    mount: mount,
    watch: watch,
    isAllowed: isAllowed,
    _internals: { composeCable: composeCable, coLabel: coLabel, buildNetwork: buildNetwork, configFacts: configFacts, mapsOf: mapsOf,
                  hostForms: hostForms, resolvePhoto: resolvePhoto, cleanLocation: cleanLocation, networkRows: networkRows }
  };
  bind();
})();
/*** END DEPLOYMENT PAGE — CLIENT REPORT **************************************/
