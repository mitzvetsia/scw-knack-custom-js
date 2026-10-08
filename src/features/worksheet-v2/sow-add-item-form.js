/*** SOW — custom "Add to Scope of Work" modal (replaces the DTO add forms) ***
 *
 * The native Add to Scope forms (view_3329 build-SOW, view_3748 / view_3451
 * sales + ops pages) create a DTO_create scope line items record that Make
 * expands into SOW Line Items. Since 2026-10 Knack's browser-side required
 * check blocks every bucket's submit (hidden required fields), and the
 * dto-form-submit-intercept.js workaround creates DTO records that never
 * connect to the SOW header (2026-10-08). Decision 2026-10-08: pivot to a
 * modal we control — the same engine as the CO add modal
 * (co-add-item-form.js), the DTO forms' per-bucket field suite
 * (SOW-line-item-DTO-bucket-field-visibility.js), and a Make webhook
 * (SCW.CONFIG.MAKE_SOW_ADD_ITEMS_WEBHOOK) that creates the SOW Line Items
 * directly, connected to the chosen SOW(s). No DTO record, no Knack form.
 *
 * Rollout gate: the "+ Add to SOW (new)" toolbar button renders only for
 * the users in CONFIG.ALLOWED_EMAILS (worksheet-v2/toolbar.js asks
 * isAllowed()); the native "+ Add to SOW" button stays for everyone. Empty
 * the list to open it up.
 *
 * Wiring: a worksheet-v2 config entry sets sowAddModal:true → toolbar
 * build() adds the gated button → handleAction('add-sow-modal') calls
 * SCW.worksheetV2.sowAddForm.open({ viewKey }).
 *
 * SOW target: the page's record (last 24-hex segment of the hash — the
 * build-SOW and sales SOW pages are both SOW record pages), pre-checked;
 * when the worksheet's rows carry other SOWs (field_2154) they are offered
 * too, mirroring the DTO's "Which SOWs are you adding to?" multi-select.
 ***************************************************************************/
(function () {
  'use strict';

  var ns  = (window.SCW = window.SCW || {});
  ns.worksheetV2 = ns.worksheetV2 || {};
  var wv2 = ns.worksheetV2;

  var CONFIG = {
    // Who sees the new button (case-insensitive). Empty list = everyone.
    ALLOWED_EMAILS: ['micah.shearer@getscw.com'],
    // SCW.CONFIG key holding the Make webhook that creates the line items.
    WEBHOOK_KEY:    'MAKE_SOW_ADD_ITEMS_WEBHOOK',
    BUTTON_LABEL:   '+ Add to SOW (new)',
    BUTTON_TITLE:   'Add line items through the new modal (Make creates them directly)',
    // Line item → SOW(s): where the "other SOWs on this project" list comes from.
    SOW_FIELD:      'field_2154',
    // Make creates N records asynchronously — refetch the worksheet twice.
    REFETCH_DELAYS_MS: [2500, 8000],
    // Structural initiator per hosting deployment (never the user's email).
    ORIGINS: {
      view_3962: { origin: 'ops',   originPage: 'Build SOW' },
      view_3586: { origin: 'sales', originPage: 'Sales SOW' }
    },
    debug: false
  };

  var STYLE_ID = 'scw-sow-add-form-css';
  var HEX24    = /^[a-f0-9]{24}$/i;
  var CUSTOM_ASSUMPTION_ID = '69ce7098172caa5786d3767d';

  function log() { if (CONFIG.debug) { try { console.info.apply(console, ['[scw-sow-add]'].concat([].slice.call(arguments))); } catch (e) { /* ignore */ } } }

  // Bucket ids ← the DTO forms' field_2223 options. Each bucket's `fields`
  // is an ORDERED list of field descriptors — the render order IS this
  // array. Mirrors BUCKET_RULES_HUMAN in
  // SOW-line-item-DTO-bucket-field-visibility.js (view_3329) /
  // …_view_3451.js (view_3451 + view_3748), with the Knack forms' labels.
  // Descriptor types:
  //   product | mdf(mode:single|multi|opt) | accessories | qty | prefix |
  //   startNumber | serviceCost | description | notes | toggles(items:[...])
  var B_CAMERA      = '6481e5ba38f283002898113c';
  var B_NETWORKING  = '647953bb54b4e1002931ed97';
  var B_OTHEREQUIP  = '5df12ce036f91b0015404d78';
  var B_SERVICE     = '6977caa7f246edf67b52cbcd';
  var B_ASSUMPTIONS = '697b7a023a31502ec68b3303';
  var B_MATERIALS   = '6a14eee134e422f3769ada00';
  var B_LICENSE     = '645554dce6f3a60028362a6a';

  var CAM_START_HELPER =
    'I.e. If you’re adding quantity 5 cameras here with a pre-fix of ' +
    '"EX-" and want to start the numbering at 12, you’ll get EX-12, ' +
    'EX-13, EX-14, EX-15, and EX-16';
  var MDF_MULTI_HELPER =
    'If multiple MDF/IDFs are selected, the selected product(s) will be added ' +
    'to each IDF/MDF. I.e., if you select quantity 2, 2 switches will be added ' +
    'to EACH IDF/MDF for 4 switches total.';

  var BUCKETS = [
    // field_2193 product · field_2211 MDF (single, relabeled) · field_2183 qty ·
    // field_2241 pre-fix · field_2184 label number · field_2462/2739/2740 flags ·
    // field_2206 accessories · field_2466 notes
    // productMulti: Camera/Reader + Networking are SINGLE product (one prefix /
    // numbering run, one headend device); Other Equipment, License, Assumptions,
    // Materials take several at once.
    { id: B_CAMERA, name: 'Camera or Reader', productMulti: false, fields: [
      { t: 'product', label: 'Product' },
      { t: 'mdf', mode: 'single', label: 'Cabling for these cameras will route back to which MDF or IDF?' },
      { t: 'qty', label: 'How many cameras or readers do you want to add?' },
      { t: 'prefix', label: 'Label pre-fix' },
      { t: 'startNumber', label: 'What number should we start the camera label numbers on?', helper: CAM_START_HELPER },
      { t: 'toggles', items: ['existingCabling', 'exterior', 'plenum'] },
      { t: 'accessories' },
      { t: 'notes' }
    ]},
    // field_2194 product · field_2206 accessories · field_2183 qty · field_2180 MDF (multi, mandatory)
    { id: B_NETWORKING, name: 'Networking or Headend', productMulti: false, fields: [
      { t: 'product' },
      { t: 'accessories' },
      { t: 'qty', label: 'How many do you want to add to EACH MDF/IDF selected below?' },
      { t: 'mdf', mode: 'multi', label: 'Which MDF or IDFs will this item go in?', helper: MDF_MULTI_HELPER }
    ]},
    // field_2195 product · field_2250 MDF (optional multi) · field_2183 qty
    { id: B_OTHEREQUIP, name: 'Other Equipment', productMulti: true, fields: [
      { t: 'product' },
      { t: 'qty' },
      { t: 'mdf', mode: 'opt' }
    ]},
    // Product-less by design: field_2233 expected sub bid · field_2183 qty ·
    // field_2210 service description · field_2250 MDF (optional)
    { id: B_SERVICE, name: 'Other Services', productOptional: true, fields: [
      { t: 'description', label: 'Service description' },
      { t: 'serviceCost', label: 'Expected sub bid ($)' },
      { t: 'qty' },
      { t: 'mdf', mode: 'opt' }
    ]},
    // field_2248 assumption catalog (Products in the Assumptions bucket) ·
    // field_2210 description, shown only when "Custom Assumption" is picked ·
    // field_2250 MDF (optional)
    { id: B_ASSUMPTIONS, name: 'Assumptions', productMulti: true, fields: [
      { t: 'product', label: 'Assumption(s)', placeholder: 'Search assumptions…' },
      { t: 'description', label: 'Detail custom assumption', conditional: 'customAssumption' },
      { t: 'mdf', mode: 'opt' }
    ]},
    // field_2913 product · field_2206 accessories · field_2250 MDF (optional)
    { id: B_MATERIALS, name: 'Materials', productMulti: true, fields: [
      { t: 'product' },
      { t: 'accessories' },
      { t: 'mdf', mode: 'opt' }
    ]},
    // field_2224 product · field_2183 qty
    { id: B_LICENSE, name: 'License', productMulti: true, fields: [
      { t: 'product' },
      { t: 'qty' }
    ]}
  ];
  function bucketById(id) {
    for (var i = 0; i < BUCKETS.length; i++) if (BUCKETS[i].id === id) return BUCKETS[i];
    return null;
  }
  // Config names for the per-view bucket list (worksheet-v2/config.js
  // `sowAddModal: { buckets: [...] }`, names or 24-hex ids, in display order).
  var BUCKET_KEYS = {
    camera: B_CAMERA, networking: B_NETWORKING, otherEquipment: B_OTHEREQUIP, services: B_SERVICE,
    assumptions: B_ASSUMPTIONS, materials: B_MATERIALS, license: B_LICENSE
  };
  /** The buckets this worksheet offers — the view's configured list (e.g. the
   *  sales page: only the buckets whose "allow sales to add" is Yes, in the
   *  DTO dropdown's order), else every bucket. */
  function bucketsFor(viewKey) {
    var vc = viewCfg(viewKey);
    var list = vc && vc.sowAddModal && Array.isArray(vc.sowAddModal.buckets) ? vc.sowAddModal.buckets : null;
    if (!list || !list.length) return BUCKETS.slice();
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var b = bucketById(BUCKET_KEYS[list[i]] || list[i]);
      if (b && out.indexOf(b) === -1) out.push(b);
    }
    return out.length ? out : BUCKETS.slice();
  }

  // Label prefix options (object_111 CONFIG: Pre-Fix — the DTO's field_2241
  // connection). Payload carries both the id and the text.
  var PREFIX_OPTIONS = [
    { id: '69dd35883b2c9b81f2c634a1', label: 'AC-' },
    { id: '697c23e95fcd43d578c31963', label: 'E-' },
    { id: '697c23ee918bb194da5537bb', label: 'I-' },
    { id: '69eb72a13bb36ab20c234e2d', label: 'RA-AC-' },
    { id: '697c23f4918bb194da5559e1', label: 'RA-E-' },
    { id: '697c23f7178250c8b80d8332', label: 'RA-I-' },
    { id: '697c23fe178250c8b80dbd4c', label: 'UPLINK-' }
  ];
  function prefixLabelFor(id) {
    for (var i = 0; i < PREFIX_OPTIONS.length; i++) if (PREFIX_OPTIONS[i].id === id) return PREFIX_OPTIONS[i].label;
    return '';
  }

  var TOGGLE_LABELS = {
    existingCabling: 'Use existing cabling',
    exterior:        'Exterior',
    plenum:          'Plenum'
  };

  // ── DTO-shaped payload ─────────────────────────────────────────────
  // Make scenario 02.01 "SOW Line Item DTO (DUPE USING CUSTOM MODAL)" was
  // remapped MECHANICALLY from the DTO record to this webhook's payload, so
  // alongside the readable keys the payload mirrors the DTO record: every
  // connection arrives as Knack's `_raw` shape ([{id, identifier}]) under
  // the DTO's field key, every plain input under both `field_X` and
  // `field_X_raw`. Which product / MDF key carries the choice depends on
  // the bucket, exactly like the DTO form's per-bucket fields.
  var DTO_PRODUCT_FIELD = {};
  DTO_PRODUCT_FIELD[B_CAMERA]      = 'field_2193';   // REL_products_for readers & cameras
  DTO_PRODUCT_FIELD[B_NETWORKING]  = 'field_2194';   // REL_products_for networking
  DTO_PRODUCT_FIELD[B_OTHEREQUIP]  = 'field_2195';   // REL_products_for other equipment
  DTO_PRODUCT_FIELD[B_LICENSE]     = 'field_2224';   // REL_products for licenses
  DTO_PRODUCT_FIELD[B_ASSUMPTIONS] = 'field_2248';   // REL_products for assumptions
  DTO_PRODUCT_FIELD[B_MATERIALS]   = 'field_2913';   // REL_products for materials
  var DTO_MDF_FIELD = { single: 'field_2211', multi: 'field_2180', opt: 'field_2250' };
  var DTO_ARRAY_KEYS = ['field_2193', 'field_2194', 'field_2195', 'field_2224', 'field_2248', 'field_2913',
                        'field_2211', 'field_2180', 'field_2250', 'field_2206', 'field_2241', 'field_2181',
                        'field_2187'];
  function conn(ids, labels) {
    var out = [];
    for (var i = 0; i < ids.length; i++) out.push({ id: ids[i], identifier: (labels && labels[ids[i]]) || '' });
    return out;
  }
  function numOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  function yesNo(b) { return b ? 'Yes' : 'No'; }

  // ── helpers ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function hashSegments() {
    return (window.location.hash || '').replace(/^#/, '').split('?')[0].split('/');
  }
  /** The page's record — the SOW on the build-SOW / sales SOW pages. */
  function currentSowId() {
    var segs = hashSegments();
    for (var i = segs.length - 1; i >= 0; i--) if (HEX24.test(segs[i])) return segs[i];
    return '';
  }
  /** The project record, when the route carries it (…/project-dashboard/<id>/…). */
  function currentProjectId() {
    var segs = hashSegments();
    for (var i = 0; i + 1 < segs.length; i++) {
      if (segs[i] === 'project-dashboard' && HEX24.test(segs[i + 1])) return segs[i + 1];
    }
    return '';
  }
  function viewCfg(viewKey) {
    try { return wv2.cfg && wv2.cfg.viewCfg && wv2.cfg.viewCfg(viewKey); } catch (e) { return null; }
  }
  function userEmail() {
    try {
      var u = typeof Knack !== 'undefined' && Knack.getUserAttributes && Knack.getUserAttributes();
      return u && u.email ? String(u.email).trim().toLowerCase() : '';
    } catch (e) { return ''; }
  }
  /** Rollout gate for the toolbar button + open(). */
  function isAllowed() {
    if (!CONFIG.ALLOWED_EMAILS.length) return true;
    var email = userEmail();
    if (!email) return false;   // no identity → not shown
    for (var i = 0; i < CONFIG.ALLOWED_EMAILS.length; i++) {
      if (String(CONFIG.ALLOWED_EMAILS[i]).toLowerCase() === email) return true;
    }
    return false;
  }
  function triggeredBy() {
    try {
      var u = (typeof Knack !== 'undefined' && Knack.getUserAttributes) ? Knack.getUserAttributes() : null;
      if (!u) return {};
      var n = u.name;
      if (n && typeof n === 'object') n = ((n.first || '') + ' ' + (n.last || '')).trim();
      return { id: u.id || '', name: n || '', email: u.email || '' };
    } catch (e) { return {}; }
  }
  function viewModels(viewKey) {
    var v = viewKey && window.Knack && Knack.views && Knack.views[viewKey];
    return (v && v.model && v.model.data && v.model.data.models) || [];
  }

  // ── candidate sources ──────────────────────────────────────────────
  // Products: ONE list, filtered to the chosen bucket via SCW.productMap /
  // SCW.productBucketMap (Builder-snippet globals). Falls back to the
  // products already on the worksheet's rows when the catalog is absent.
  function productCandidates(bucketId, viewKey) {
    var pmap = (window.SCW && SCW.productMap) || {};
    var bmap = (window.SCW && SCW.productBucketMap) || null;
    function allowed(pid, p) {
      if (!bucketId) return true;
      var known = false, hit = false;
      if (p && Array.isArray(p.buckets) && p.buckets.length) {
        known = true; if (p.buckets.indexOf(bucketId) !== -1) hit = true;
      }
      if (!hit && bmap && bmap[pid] && bmap[pid].length) {
        known = true; if (bmap[pid].indexOf(bucketId) !== -1) hit = true;
      }
      return known ? hit : true;
    }
    var out = [], id, p;
    for (id in pmap) {
      if (!Object.prototype.hasOwnProperty.call(pmap, id)) continue;
      p = pmap[id];
      if (p && allowed(id, p)) out.push({ id: id, name: p.name || '(unnamed)' });
    }
    if (!out.length) {
      var seen = Object.create(null);
      var models = viewModels(viewKey);
      for (var i = 0; i < models.length; i++) {
        var a = models[i] && models[i].attributes;
        var raw = a && (a.field_1949_raw || a.field_2627_raw);
        if (!Array.isArray(raw)) continue;
        for (var j = 0; j < raw.length; j++) {
          var rv = raw[j];
          if (rv && rv.id && !seen[rv.id]) {
            seen[rv.id] = 1;
            out.push({ id: rv.id, name: rv.identifier != null ? stripHtml(rv.identifier) : rv.id });
          }
        }
      }
    }
    out.sort(sortByName);
    return out;
  }
  // MDF/IDF locations from the scene's locations grid (viewCfg.mdfSourceViewKey
  // — view_3577 on build-SOW, view_3602 on the sales page).
  function mdfCandidates(viewKey) {
    var vc = viewCfg(viewKey) || {};
    var mv = vc.mdfSourceViewKey, lf = vc.mdfLabelField || 'field_1642';
    var out = [];
    var models = viewModels(mv);
    for (var i = 0; i < models.length; i++) {
      var a = models[i] && models[i].attributes; if (!a || !a.id) continue;
      var label = stripHtml(a[lf + '_raw'] != null ? a[lf + '_raw'] : a[lf]);
      out.push({ id: a.id, name: label || a.id });
    }
    out.sort(sortByName);
    return out;
  }
  // SOWs: the page's SOW first (pre-checked), then every other SOW the
  // worksheet's rows connect to (field_2154) — the DTO's "Which SOWs are
  // you adding to?" list.
  function sowCandidates(viewKey) {
    var cur = currentSowId();
    var seen = Object.create(null), others = [], curName = '';
    var models = viewModels(viewKey);
    for (var i = 0; i < models.length; i++) {
      var a = models[i] && models[i].attributes;
      var raw = a && a[CONFIG.SOW_FIELD + '_raw'];
      if (!Array.isArray(raw)) continue;
      for (var j = 0; j < raw.length; j++) {
        var s = raw[j]; if (!s || !s.id || seen[s.id]) continue;
        seen[s.id] = 1;
        var nm = s.identifier != null ? stripHtml(s.identifier) : s.id;
        if (s.id === cur) curName = nm; else others.push({ id: s.id, name: nm });
      }
    }
    others.sort(sortByName);
    var out = [];
    if (cur) out.push({ id: cur, name: (curName || 'This SOW') + ' (this page)' });
    return out.concat(others);
  }
  function sortByName(a, b) {
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
  }
  // Accessories: OPTIONAL accessories only — Make auto-adds a product's
  // default accessories. SCW.mountingBoxProducts filtered to products whose
  // compatibleProducts (field_2236) OR compatibleProductsAlt (field_2205)
  // list the chosen product (same rule as the CO modal + bulk editor).
  function accessoryCandidates(productIds) {
    var raw = (window.SCW && SCW.mountingBoxProducts) || [];
    if (!raw.length || !productIds.length) return [];
    var out = raw.filter(function (p) {
      if (!p) return false;
      var a = (Array.isArray(p.compatibleProducts)    && p.compatibleProducts.length)    ? p.compatibleProducts    : null;
      var b = (Array.isArray(p.compatibleProductsAlt) && p.compatibleProductsAlt.length) ? p.compatibleProductsAlt : null;
      if (!a && !b) return false;
      for (var i = 0; i < productIds.length; i++) {
        var hit = (a && a.indexOf(productIds[i]) !== -1) || (b && b.indexOf(productIds[i]) !== -1);
        if (!hit) return false;
      }
      return true;
    }).map(function (p) { return { id: p.id, name: p.name || p.id }; });
    out.sort(sortByName);
    return out;
  }

  // ── CSS ────────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.scw-sowadd__overlay{position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.5);',
      'display:flex;align-items:center;justify-content:center;padding:20px;}',
      '.scw-sowadd{background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);',
      'width:560px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;',
      'font:13px/1.45 system-ui,-apple-system,sans-serif;color:#1e293b;}',
      '.scw-sowadd.is-busy{opacity:.65;pointer-events:none;}',
      '.scw-sowadd__head{display:flex;align-items:center;gap:8px;padding:16px 20px 12px;border-bottom:1px solid #e2e8f0;}',
      '.scw-sowadd__title{font:700 15px/1.3 system-ui,sans-serif;color:#0f4c75;flex:1 1 auto;}',
      '.scw-sowadd__beta{font:700 10px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;',
      'color:#b45309;background:#fef3c7;border:1px solid #fcd34d;border-radius:999px;padding:4px 8px;}',
      '.scw-sowadd__x{border:none;background:none;font-size:22px;line-height:1;color:#94a3b8;cursor:pointer;padding:0 4px;}',
      '.scw-sowadd__x:hover{color:#475569;}',
      '.scw-sowadd__body{padding:16px 20px;overflow-y:auto;}',
      '.scw-sowadd__row{margin-bottom:14px;}',
      '.scw-sowadd__lbl{display:block;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.04em;',
      'text-transform:uppercase;color:#64748b;margin-bottom:6px;}',
      '.scw-sowadd__help{font:400 11.5px/1.4 system-ui,sans-serif;color:#94a3b8;margin:5px 0 0;}',
      '.scw-sowadd__chips{display:flex;flex-wrap:wrap;gap:8px;}',
      '.scw-sowadd__chip{padding:7px 13px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;',
      'font:600 12.5px/1 system-ui,sans-serif;color:#334155;cursor:pointer;}',
      '.scw-sowadd__chip:hover{background:#f1f5f9;}',
      '.scw-sowadd__chip.is-on{background:#0f4c75;border-color:#0a3a63;color:#fff;}',
      '.scw-sowadd__in{width:100%;padding:9px 11px;border:1px solid #cbd5e1;border-radius:7px;',
      'font:13px/1.4 system-ui,sans-serif;color:#1e293b;box-sizing:border-box;background:#fff;}',
      '.scw-sowadd__in:focus{outline:none;border-color:#60a5fa;}',
      'textarea.scw-sowadd__in{min-height:64px;resize:vertical;}',
      'select.scw-sowadd__in{appearance:auto;}',
      // inline combobox
      '.scw-sowadd__combo{position:relative;}',
      '.scw-sowadd__tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}',
      '.scw-sowadd__tags:empty{display:none;}',
      '.scw-sowadd__tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;',
      'background:#eef2f7;color:#0f4c75;font:600 12px/1 system-ui,sans-serif;}',
      '.scw-sowadd__tag button{border:none;background:none;color:#64748b;cursor:pointer;font-size:14px;line-height:1;padding:0;}',
      '.scw-sowadd__menu{margin-top:5px;border:1px solid #cbd5e1;border-radius:7px;max-height:220px;',
      'overflow-y:auto;background:#fff;box-shadow:0 6px 18px rgba(15,23,42,.12);}',
      '.scw-sowadd__menu[hidden]{display:none;}',
      '.scw-sowadd__opt{padding:8px 11px;font:13px/1.35 system-ui,sans-serif;color:#1e293b;cursor:pointer;}',
      '.scw-sowadd__opt:hover{background:#eef2f7;}',
      '.scw-sowadd__opt.is-sel{background:#0f4c75;color:#fff;}',
      '.scw-sowadd__opt.scw-sowadd__hide{display:none;}',
      '.scw-sowadd__menu-empty{padding:10px 11px;font:12px/1.4 system-ui,sans-serif;color:#94a3b8;}',
      // checkbox / radio group (MDF/IDF, SOWs)
      '.scw-sowadd__checks{display:flex;flex-direction:column;gap:7px;border:1px solid #e2e8f0;',
      'border-radius:7px;padding:9px 11px;max-height:200px;overflow-y:auto;}',
      '.scw-sowadd__check{display:flex;align-items:center;gap:8px;font:13px/1.3 system-ui,sans-serif;',
      'color:#1e293b;cursor:pointer;}',
      '.scw-sowadd__check input{cursor:pointer;}',
      '.scw-sowadd__toggles{display:flex;flex-wrap:wrap;gap:16px;}',
      '.scw-sowadd__tog{display:inline-flex;align-items:center;gap:7px;font:600 12.5px/1 system-ui,sans-serif;color:#334155;cursor:pointer;}',
      '.scw-sowadd__foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e2e8f0;}',
      '.scw-sowadd__btn{padding:9px 18px;border-radius:7px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;}',
      '.scw-sowadd__btn--sec{background:#fff;border:1px solid #cbd5e1;color:#475569;}',
      '.scw-sowadd__btn--sec:hover{background:#f1f5f9;}',
      '.scw-sowadd__btn--pri{background:#0f4c75;border:1px solid #0a3a63;color:#fff;}',
      '.scw-sowadd__btn--pri:hover{background:#0a3a63;}',
      '.scw-sowadd__err{color:#b91c1c;font:600 12px/1.3 system-ui,sans-serif;margin-right:auto;align-self:center;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── inline combobox ────────────────────────────────────────────────
  // Search input + filterable option list INSIDE `host` (no overlay, so it
  // never renders behind the modal). Single-select shows the label in the
  // input; multi shows removable tags.
  function makeCombo(host, cfg) {
    var multi = !!cfg.multi;
    var selected = [];
    var labels = {};
    (cfg.candidates || []).forEach(function (c) { labels[c.id] = c.name; });

    host.classList.add('scw-sowadd__combo');
    var tags  = document.createElement('div'); tags.className = 'scw-sowadd__tags';
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'scw-sowadd__in scw-sowadd__combo-in';
    input.placeholder = cfg.placeholder || 'Search…';
    input.autocomplete = 'off';
    var menu  = document.createElement('div'); menu.className = 'scw-sowadd__menu'; menu.hidden = true;
    if (!(cfg.candidates || []).length) {
      menu.innerHTML = '<div class="scw-sowadd__menu-empty">' + esc(cfg.emptyText || 'No options') + '</div>';
    } else {
      var frag = '';
      for (var i = 0; i < cfg.candidates.length; i++) {
        frag += '<div class="scw-sowadd__opt" data-id="' + esc(cfg.candidates[i].id) + '">' +
          esc(cfg.candidates[i].name) + '</div>';
      }
      menu.innerHTML = frag;
    }
    host.appendChild(tags); host.appendChild(input); host.appendChild(menu);

    function fire() { if (typeof cfg.onChange === 'function') cfg.onChange(selected.slice(), labels); }
    function renderTags() {
      if (!multi) { tags.innerHTML = ''; return; }
      var h = '';
      for (var i = 0; i < selected.length; i++) {
        h += '<span class="scw-sowadd__tag">' + esc(labels[selected[i]] || selected[i]) +
          '<button type="button" data-rm="' + esc(selected[i]) + '">&times;</button></span>';
      }
      tags.innerHTML = h;
    }
    function markSel() {
      var opts = menu.querySelectorAll('.scw-sowadd__opt');
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle('is-sel', selected.indexOf(opts[i].getAttribute('data-id')) !== -1);
      }
    }
    function filter(q) {
      q = (q || '').toLowerCase();
      var opts = menu.querySelectorAll('.scw-sowadd__opt');
      for (var i = 0; i < opts.length; i++) {
        var hit = !q || opts[i].textContent.toLowerCase().indexOf(q) !== -1;
        opts[i].classList.toggle('scw-sowadd__hide', !hit);
      }
    }
    input.addEventListener('focus', function () { if (!multi) input.select(); menu.hidden = false; });
    input.addEventListener('input', function () { menu.hidden = false; filter(input.value); });
    input.addEventListener('blur', function () {
      setTimeout(function () { menu.hidden = true; }, 120);
    });
    menu.addEventListener('mousedown', function (e) {
      var opt = e.target.closest && e.target.closest('.scw-sowadd__opt');
      if (!opt) return;
      e.preventDefault();
      var id = opt.getAttribute('data-id');
      if (multi) {
        var idx = selected.indexOf(id);
        if (idx === -1) selected.push(id); else selected.splice(idx, 1);
        renderTags(); markSel(); input.value = ''; filter(''); fire();
      } else {
        selected = [id]; input.value = labels[id] || id; markSel(); menu.hidden = true; fire();
      }
    });
    tags.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-rm]');
      if (!b) return;
      var id = b.getAttribute('data-rm'), idx = selected.indexOf(id);
      if (idx !== -1) { selected.splice(idx, 1); renderTags(); markSel(); fire(); }
    });
    host._closeMenu = function (target) { if (!host.contains(target)) menu.hidden = true; };
    return { ids: function () { return selected.slice(); } };
  }

  // ── inline checkbox / radio group (short lists — MDF/IDF, SOWs) ────
  var _cgSeq = 0;
  function makeCheckGroup(host, cfg) {
    var multi = !!cfg.multi;
    var cands = cfg.candidates || [];
    var checked0 = cfg.checked || [];
    host.className = 'scw-sowadd__checks';
    if (!cands.length) {
      host.innerHTML = '<div class="scw-sowadd__menu-empty">' + esc(cfg.emptyText || 'No options') + '</div>';
      if (typeof cfg.onChange === 'function') cfg.onChange([]);
      return;
    }
    var name = 'scw-sowadd-cg-' + (++_cgSeq);
    var type = multi ? 'checkbox' : 'radio';
    var h = '';
    for (var i = 0; i < cands.length; i++) {
      h += '<label class="scw-sowadd__check"><input type="' + type + '" name="' + name +
        '" value="' + esc(cands[i].id) + '"' + (checked0.indexOf(cands[i].id) !== -1 ? ' checked' : '') + '> ' +
        esc(cands[i].name) + '</label>';
    }
    host.innerHTML = h;
    function read() {
      var checked = host.querySelectorAll('input:checked');
      var ids = [];
      for (var k = 0; k < checked.length; k++) ids.push(checked[k].value);
      return ids;
    }
    host.addEventListener('change', function () {
      if (typeof cfg.onChange === 'function') cfg.onChange(read());
    });
    if (checked0.length && typeof cfg.onChange === 'function') cfg.onChange(read());
  }

  // ── the modal ──────────────────────────────────────────────────────
  function open(opts) {
    opts = opts || {};
    var viewKey = opts.viewKey || 'view_3962';
    if (!isAllowed()) { log('open refused — user not in ALLOWED_EMAILS'); return; }
    injectCss();

    var buckets  = bucketsFor(viewKey);
    var sowCands = sowCandidates(viewKey);
    var mdfCands = mdfCandidates(viewKey);
    var sowLabels = {}, mdfLabels = {};
    sowCands.forEach(function (c) { sowLabels[c.id] = c.name.replace(/ \(this page\)$/, ''); });
    mdfCands.forEach(function (c) { mdfLabels[c.id] = c.name; });
    var st = { bucketId: '', sowIds: sowCands.length ? [sowCands[0].id] : [], productIds: [], mdfIds: [], accessoryIds: [],
               productLabels: {}, accessoryLabels: {} };

    var overlay = document.createElement('div');
    overlay.className = 'scw-sowadd__overlay';
    overlay.innerHTML =
      '<div class="scw-sowadd" role="dialog" aria-modal="true">' +
        '<div class="scw-sowadd__head">' +
          '<span class="scw-sowadd__title">Add to Scope of Work</span>' +
          '<span class="scw-sowadd__beta" title="New add-item flow — items are created by Make directly">New</span>' +
          '<button type="button" class="scw-sowadd__x" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="scw-sowadd__body"></div>' +
        '<div class="scw-sowadd__foot">' +
          '<span class="scw-sowadd__err" hidden></span>' +
          '<button type="button" class="scw-sowadd__btn scw-sowadd__btn--sec" data-act="cancel">Cancel</button>' +
          '<button type="button" class="scw-sowadd__btn scw-sowadd__btn--pri" data-act="submit">Add to SOW</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var modal = overlay.querySelector('.scw-sowadd');
    var body  = modal.querySelector('.scw-sowadd__body');
    var errEl = modal.querySelector('.scw-sowadd__err');
    var combos = {};

    function close() {
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (typeof opts.onClose === 'function') opts.onClose();
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      var openMenu = body.querySelector('.scw-sowadd__menu:not([hidden])');
      if (openMenu) { e.preventDefault(); e.stopPropagation(); openMenu.hidden = true; return; }
      e.preventDefault(); close();
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    modal.querySelector('.scw-sowadd__x').addEventListener('click', close);
    modal.addEventListener('mousedown', function (e) {
      var hosts = body.querySelectorAll('.scw-sowadd__combo');
      for (var i = 0; i < hosts.length; i++) {
        if (typeof hosts[i]._closeMenu === 'function') hosts[i]._closeMenu(e.target);
      }
    });
    function showErr(msg) { errEl.textContent = msg || ''; errEl.hidden = !msg; }

    function labelRow(label, helper) {
      var row = document.createElement('div'); row.className = 'scw-sowadd__row';
      row.innerHTML = '<span class="scw-sowadd__lbl">' + esc(label) + '</span>';
      if (helper) row.insertAdjacentHTML('beforeend', '<p class="scw-sowadd__help">' + esc(helper) + '</p>');
      return row;
    }

    function buildField(fd, b) {
      var t = fd.t;
      if (t === 'product') {
        // Single vs multi per bucket (productMulti above) — productIds is an
        // array either way so Make iterates one uniform list.
        var pMulti = !!b.productMulti;
        var row = labelRow(fd.label || (pMulti ? 'Products' : 'Product'), fd.helper);
        var host = document.createElement('div'); row.appendChild(host);
        combos.product = makeCombo(host, {
          candidates: productCandidates(st.bucketId, viewKey), multi: pMulti,
          placeholder: fd.placeholder || 'Search products…',
          emptyText: 'No products available on this page',
          onChange: function (ids, labels) {
            st.productIds = ids; st.productLabels = labels || {};
            if (b.id === B_ASSUMPTIONS) syncAssumptionDesc();
            rebuildAccessoryCombo();
          }
        });
        return row;
      }
      if (t === 'mdf') {
        var req = fd.mode === 'single' || fd.mode === 'multi';
        var lbl = fd.label || ('MDF / IDF' + (req ? '' : ' (optional)'));
        var mrow = labelRow(lbl + (req ? ' *' : ''), fd.helper);
        var mhost = document.createElement('div'); mrow.appendChild(mhost);
        makeCheckGroup(mhost, {
          candidates: mdfCands, multi: fd.mode !== 'single',
          emptyText: 'No MDF/IDF locations on this SOW yet — add one with "+ Add MDF/IDF" first',
          onChange: function (ids) { st.mdfIds = ids; }
        });
        return mrow;
      }
      if (t === 'accessories') {
        var arow = labelRow('Optional accessories',
          'Default accessories are added automatically — pick only extras.');
        var ahost = document.createElement('div'); arow.appendChild(ahost);
        combos.accessoryHost = ahost;
        buildAccessoryCombo();
        return arow;
      }
      if (t === 'qty') {
        var qrow = labelRow(fd.label || 'Quantity');
        qrow.insertAdjacentHTML('beforeend', '<input type="number" min="1" class="scw-sowadd__in" data-f="qty" value="1">');
        return qrow;
      }
      if (t === 'startNumber') {
        var srow = labelRow(fd.label || 'Start label number', fd.helper);
        srow.querySelector('.scw-sowadd__lbl').insertAdjacentHTML('afterend',
          '<input type="number" class="scw-sowadd__in" data-f="startNumber" placeholder="e.g. 12">');
        return srow;
      }
      if (t === 'prefix') {
        var prow = labelRow(fd.label || 'Label prefix');
        var sel = '<option value="">Select…</option>';
        for (var i = 0; i < PREFIX_OPTIONS.length; i++) {
          sel += '<option value="' + esc(PREFIX_OPTIONS[i].id) + '">' + esc(PREFIX_OPTIONS[i].label) + '</option>';
        }
        prow.insertAdjacentHTML('beforeend', '<select class="scw-sowadd__in" data-f="prefix">' + sel + '</select>');
        return prow;
      }
      if (t === 'serviceCost') {
        var crow = labelRow(fd.label || 'Expected sub bid ($)');
        crow.insertAdjacentHTML('beforeend', '<input type="number" step="0.01" class="scw-sowadd__in" data-f="serviceCost">');
        return crow;
      }
      if (t === 'description') {
        var drow = labelRow(fd.label || 'Description');
        drow.insertAdjacentHTML('beforeend', '<textarea class="scw-sowadd__in" data-f="description"></textarea>');
        if (fd.conditional === 'customAssumption') { drow.setAttribute('data-cond', 'customAssumption'); drow.style.display = 'none'; }
        return drow;
      }
      if (t === 'notes') {
        var nrow = labelRow(fd.label || 'Camera / reader notes');
        nrow.insertAdjacentHTML('beforeend', '<textarea class="scw-sowadd__in" data-f="notes"></textarea>');
        return nrow;
      }
      if (t === 'toggles') {
        var trow = labelRow('Cabling');
        var wrap = document.createElement('div'); wrap.className = 'scw-sowadd__toggles';
        for (var k = 0; k < fd.items.length; k++) {
          var key = fd.items[k];
          wrap.insertAdjacentHTML('beforeend',
            '<label class="scw-sowadd__tog"><input type="checkbox" data-f="' + key + '"> ' +
            esc(TOGGLE_LABELS[key] || key) + '</label>');
        }
        trow.appendChild(wrap);
        return trow;
      }
      return null;
    }

    function syncAssumptionDesc() {
      var descRow = body.querySelector('[data-cond="customAssumption"]');
      if (!descRow) return;
      descRow.style.display = st.productIds.indexOf(CUSTOM_ASSUMPTION_ID) !== -1 ? '' : 'none';
    }

    function buildAccessoryCombo() {
      var host = combos.accessoryHost;
      if (!host) return;
      host.innerHTML = '';
      host.className = '';
      st.accessoryIds = [];
      if (st.productIds.length > 1) {
        host.innerHTML = '<div class="scw-sowadd__menu-empty">Multiple products selected — ' +
          'add optional accessories per item on the worksheet after creating. ' +
          '(Default accessories attach automatically.)</div>';
        return;
      }
      combos.accessory = makeCombo(host, {
        candidates: accessoryCandidates(st.productIds), multi: true,
        placeholder: 'Search optional accessories…',
        emptyText: st.productIds.length
          ? 'No optional accessories for this product'
          : 'Pick a product first',
        onChange: function (ids, labels) { st.accessoryIds = ids; st.accessoryLabels = labels || {}; }
      });
    }
    function rebuildAccessoryCombo() { if (combos.accessoryHost) buildAccessoryCombo(); }

    // Full render — on open + on bucket change. The bucket chips and the SOW
    // row persist across buckets (the SOW choice is kept); field rows and
    // combos are re-created.
    function render() {
      combos = {};
      st.productIds = []; st.mdfIds = []; st.accessoryIds = [];
      body.innerHTML = '';

      var chipRow = document.createElement('div'); chipRow.className = 'scw-sowadd__row';
      var chipHtml = '<span class="scw-sowadd__lbl">What type of item are you adding to your Scope of Work?</span>' +
        '<div class="scw-sowadd__chips">';
      for (var i = 0; i < buckets.length; i++) {
        chipHtml += '<button type="button" class="scw-sowadd__chip' +
          (buckets[i].id === st.bucketId ? ' is-on' : '') + '" data-bucket="' +
          buckets[i].id + '">' + esc(buckets[i].name) + '</button>';
      }
      chipRow.innerHTML = chipHtml + '</div>';
      body.appendChild(chipRow);
      chipRow.querySelector('.scw-sowadd__chips').addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('[data-bucket]');
        if (!chip) return;
        st.bucketId = chip.getAttribute('data-bucket');
        showErr(''); render();
      });

      // "Which SOWs are you adding to?" — only when there is a choice.
      if (sowCands.length > 1) {
        var srow = labelRow('Which SOW(s) are you adding to? *');
        var shost = document.createElement('div'); srow.appendChild(shost);
        makeCheckGroup(shost, {
          candidates: sowCands, multi: true, checked: st.sowIds,
          onChange: function (ids) { st.sowIds = ids; }
        });
        body.appendChild(srow);
      }

      var b = bucketById(st.bucketId);
      if (!b || buckets.indexOf(b) === -1) return;
      for (var f = 0; f < b.fields.length; f++) {
        var el = buildField(b.fields[f], b);
        if (el) body.appendChild(el);
      }
    }

    function readField(f) {
      var el = body.querySelector('[data-f="' + f + '"]');
      if (!el) return '';
      if (el.type === 'checkbox') return el.checked;
      return el.value;
    }

    function submit() {
      var b = bucketById(st.bucketId);
      if (!b) { showErr('Pick an item type.'); return; }
      if (!st.sowIds.length) { showErr(sowCands.length ? 'Pick at least one SOW.' : 'Could not resolve this SOW from the URL.'); return; }
      if (!st.productIds.length && !b.productOptional) {
        showErr(b.id === B_ASSUMPTIONS ? 'Pick at least one assumption.' : 'Pick a product.'); return;
      }
      if (b.productOptional && !String(readField('description') || '').trim()) {
        showErr('Enter a description — it defines this line item.'); return;
      }
      if (b.id === B_ASSUMPTIONS && st.productIds.indexOf(CUSTOM_ASSUMPTION_ID) !== -1 &&
          !String(readField('description') || '').trim()) {
        showErr('Detail the custom assumption.'); return;
      }
      var mdfField = null;
      for (var i = 0; i < b.fields.length; i++) if (b.fields[i].t === 'mdf') mdfField = b.fields[i];
      if (mdfField && (mdfField.mode === 'single' || mdfField.mode === 'multi') && !st.mdfIds.length) {
        showErr('Pick at least one MDF / IDF.'); return;
      }
      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG[CONFIG.WEBHOOK_KEY]) || '';
      if (!url || /PLACEHOLDER/.test(url)) {
        showErr('Add-item webhook is not configured yet (SCW.CONFIG.' + CONFIG.WEBHOOK_KEY + ').'); return;
      }

      var prefixId = readField('prefix') || '';
      var org = CONFIG.ORIGINS[viewKey] || {};
      var payload = {
        sowId:           st.sowIds[0],
        sowIds:          st.sowIds.slice(),
        projectId:       currentProjectId(),
        bucketId:        b.id,
        bucketName:      b.name,
        productIds:      st.productIds.slice(),
        accessoryIds:    st.accessoryIds.slice(),
        mdfIds:          st.mdfIds.slice(),
        qty:             readField('qty') || '',
        prefixId:        prefixId,
        prefix:          prefixLabelFor(prefixId),
        startNumber:     readField('startNumber') || '',
        existingCabling: !!readField('existingCabling'),
        exterior:        !!readField('exterior'),
        plenum:          !!readField('plenum'),
        serviceCost:     readField('serviceCost') || '',
        description:     readField('description') || '',
        notes:           readField('notes') || '',
        triggeredBy:     triggeredBy(),
        origin:          org.origin || 'ops',
        originPage:      org.originPage || viewKey,
        originView:      viewKey,
        originScene:     (typeof Knack !== 'undefined' && Knack.router &&
                          Knack.router.current_scene_key) || ''
      };
      // DTO-shaped mirror (see DTO_PRODUCT_FIELD above). Keys the bucket
      // doesn't use are sent as EMPTY arrays so the scenario's merges and
      // `[].id` reads behave exactly as they did on a DTO record.
      var dto = {};
      for (var d = 0; d < DTO_ARRAY_KEYS.length; d++) dto[DTO_ARRAY_KEYS[d] + '_raw'] = [];
      dto.field_2223_raw = [{ id: b.id, identifier: b.name }];
      dto.field_2182_raw = conn(st.sowIds, sowLabels);
      if (mdfField) dto[DTO_MDF_FIELD[mdfField.mode] + '_raw'] = conn(st.mdfIds, mdfLabels);
      if (DTO_PRODUCT_FIELD[b.id]) dto[DTO_PRODUCT_FIELD[b.id] + '_raw'] = conn(st.productIds, st.productLabels);
      dto.field_2206_raw = conn(st.accessoryIds, st.accessoryLabels);
      if (prefixId) dto.field_2241_raw = [{ id: prefixId, identifier: prefixLabelFor(prefixId) }];
      if (payload.projectId) dto.field_2181_raw = [{ id: payload.projectId, identifier: '' }];
      dto.field_2183_raw = numOrNull(payload.qty);          dto.field_2183 = String(payload.qty);
      dto.field_2184_raw = numOrNull(payload.startNumber);  dto.field_2184 = String(payload.startNumber);
      dto.field_2233_raw = numOrNull(payload.serviceCost);  dto.field_2233 = String(payload.serviceCost);
      dto.field_2462_raw = payload.existingCabling;         dto.field_2462 = yesNo(payload.existingCabling);
      dto.field_2739_raw = payload.exterior;                dto.field_2739 = yesNo(payload.exterior);
      dto.field_2740_raw = payload.plenum;                  dto.field_2740 = yesNo(payload.plenum);
      dto.field_2210_raw = payload.description;             dto.field_2210 = payload.description;
      dto.field_2466_raw = payload.notes;                   dto.field_2466 = payload.notes;
      for (var dk in dto) if (Object.prototype.hasOwnProperty.call(dto, dk)) payload[dk] = dto[dk];
      log('submit', payload);

      showErr('');
      modal.classList.add('is-busy');
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (resp) {
          var ok = resp.ok;
          return resp.text().then(function (txt) {
            var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* not JSON */ }
            return { ok: ok, data: data };
          });
        }).then(function (r) {
          var explicitFail = !!(r.data && (r.data.success === false || r.data.error));
          if (r.ok && !explicitFail) {
            close();
            if (wv2.data && typeof wv2.data.refetchAndNotify === 'function') {
              CONFIG.REFETCH_DELAYS_MS.forEach(function (ms) {
                setTimeout(function () { wv2.data.refetchAndNotify(viewKey); }, ms);
              });
            }
            if (typeof wv2.toast === 'function') wv2.toast('Adding to SOW… the worksheet refreshes when Make has created the items.');
          } else {
            modal.classList.remove('is-busy');
            showErr((r.data && r.data.error) ? ('Failed: ' + r.data.error) : 'Add failed — try again.');
          }
        }).catch(function () {
          modal.classList.remove('is-busy');
          showErr('Network error — try again.');
        });
    }

    modal.querySelector('[data-act="cancel"]').addEventListener('click', close);
    modal.querySelector('[data-act="submit"]').addEventListener('click', submit);

    render();
    return { close: close };
  }

  wv2.sowAddForm = { open: open, isAllowed: isAllowed, bucketsFor: bucketsFor, CONFIG: CONFIG, BUCKETS: BUCKETS, BUCKET_KEYS: BUCKET_KEYS };
})();
/*** END: SOW add-item modal **********************************************/
