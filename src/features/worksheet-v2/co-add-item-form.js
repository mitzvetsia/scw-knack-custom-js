/*** CHANGE ORDER — custom "Add line item(s)" modal ************************
 *
 * Replaces the native DTO add form (view_4100) on the CO worksheet. The DTO
 * form carries one product connection field PER bucket purely so Knack can
 * filter products by bucket — a problem the bundle already solves client-side
 * (SCW.productBucketMap). This modal uses ONE bucket-filtered product picker,
 * ports the DTO view's per-bucket field rules + order, and fires a Make
 * webhook that creates the SOW Line Item records DIRECTLY (no DTO staging
 * object), connected to THIS change order's SOW.
 *
 * Opened by the worksheet-v2 toolbar "+ Add New Item" button (the view_4079
 * config entry sets customAddModal:true → toolbar handleAction calls
 * SCW.worksheetV2.coAddForm.open).
 *
 * All pickers (product / MDF / accessories) are INLINE comboboxes inside the
 * form — no stacked ns.picker overlay (which rendered behind this modal). The
 * label prefix is its own dropdown (CONFIG: Pre-Fix options), not free text.
 *
 * CO SOW id: last 24-hex segment of the hash (view_4079 is a drill-in child
 * page whose own record IS the CO's SOW — same rule co-adopt.js uses).
 ***************************************************************************/
(function () {
  'use strict';

  var ns  = (window.SCW = window.SCW || {});
  ns.worksheetV2 = ns.worksheetV2 || {};
  var wv2 = ns.worksheetV2;

  var STYLE_ID = 'scw-co-add-form-css';
  var HEX24    = /^[a-f0-9]{24}$/i;
  var CUSTOM_ASSUMPTION_ID = '69ce7098172caa5786d3767d';

  // Bucket ids ← view_4100 field_2223 options. Each bucket's `fields` is an
  // ORDERED list of field descriptors — the render order IS this array, so
  // reordering a bucket's inputs is a config edit. Descriptor types:
  //   product | mdf(mode:single|multi|opt) | accessories | qty | prefix |
  //   startNumber | serviceCost | description | notes | toggles(items:[...])
  // `label`/`helper` override the default label / add helper text.
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

  var BUCKETS = [
    { id: B_CAMERA, name: 'Camera or Reader', fields: [
      { t: 'product' },
      { t: 'mdf', mode: 'single' },
      { t: 'qty', label: 'How many cameras or readers do you want to add?' },
      { t: 'prefix', label: 'Label prefix' },
      { t: 'startNumber', label: 'What number should we start the camera label numbers on?', helper: CAM_START_HELPER },
      { t: 'toggles', items: ['existingCabling', 'exterior', 'plenum'] },
      { t: 'accessories' },
      { t: 'notes' }
    ]},
    { id: B_NETWORKING, name: 'Networking or Headend', fields: [
      { t: 'product' },
      { t: 'mdf', mode: 'multi' },
      { t: 'qty' },
      { t: 'accessories' }
    ]},
    { id: B_OTHEREQUIP, name: 'Other Equipment', fields: [
      { t: 'product' },
      { t: 'mdf', mode: 'opt' },
      { t: 'qty' }
    ]},
    { id: B_SERVICE, name: 'Other Services', fields: [
      { t: 'product' },
      { t: 'mdf', mode: 'opt' },
      { t: 'serviceCost' },
      { t: 'qty' },
      { t: 'description' }
    ]},
    { id: B_ASSUMPTIONS, name: 'Assumptions', fields: [
      { t: 'product' },
      { t: 'mdf', mode: 'opt' },
      { t: 'description', conditional: 'customAssumption' }
    ]},
    { id: B_MATERIALS, name: 'Materials', fields: [
      { t: 'product' },
      { t: 'mdf', mode: 'opt' },
      { t: 'accessories' }
    ]},
    { id: B_LICENSE, name: 'License', fields: [
      { t: 'product' },
      { t: 'qty' }
    ]}
  ];
  function bucketById(id) {
    for (var i = 0; i < BUCKETS.length; i++) if (BUCKETS[i].id === id) return BUCKETS[i];
    return null;
  }

  // Label prefix options (object_111 CONFIG: Pre-Fix) — small + stable, from
  // the native view_4100 field_2241 connection. Payload carries both the id
  // (for the connection) and the text (for label numbering).
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
    existingCabling: 'Re-use existing cabling',
    exterior:        'Exterior mounting',
    plenum:          'Plenum'
  };

  // ── helpers ────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function stripHtml(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function getCoSowId() {
    var segs = (window.location.hash || '').replace(/^#/, '').split('?')[0].split('/');
    for (var i = segs.length - 1; i >= 0; i--) if (HEX24.test(segs[i])) return segs[i];
    return '';
  }
  function viewCfg(viewKey) {
    try { return wv2.cfg && wv2.cfg.viewCfg && wv2.cfg.viewCfg(viewKey); } catch (e) { return null; }
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

  // ── candidate sources ──────────────────────────────────────────────
  // Products: ONE list, filtered to the chosen bucket via SCW.productMap /
  // SCW.productBucketMap. No per-bucket field — that's the point.
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
      var v = window.Knack && Knack.views && Knack.views[viewKey];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
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
  // MDF/IDF locations from the CO scene grid (mdfSourceViewKey → view_4084).
  function mdfCandidates(viewKey) {
    var vc = viewCfg(viewKey) || {};
    var mv = vc.mdfSourceViewKey, lf = vc.mdfLabelField || 'field_1642';
    var out = [];
    var v = mv && window.Knack && Knack.views && Knack.views[mv];
    var models = (v && v.model && v.model.data && v.model.data.models) || [];
    for (var i = 0; i < models.length; i++) {
      var a = models[i] && models[i].attributes; if (!a || !a.id) continue;
      var label = stripHtml(a[lf + '_raw'] != null ? a[lf + '_raw'] : a[lf]);
      out.push({ id: a.id, name: label || a.id });
    }
    out.sort(sortByName);
    return out;
  }
  function sortByName(a, b) {
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: 'base' });
  }
  // Accessories: OPTIONAL accessories only — Make auto-adds a product's
  // default accessories, so the user picks additions. Same source + rule as
  // the bulk editor's add-accessory modal (toolbar.js): SCW.mountingBoxProducts
  // filtered to products whose compatibleProducts (field_2236) OR
  // compatibleProductsAlt (field_2205) list the chosen product. "No compat
  // list" = not an accessory → excluded (the catalog spans every product).
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
      '.scw-coadd__overlay{position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.5);',
      'display:flex;align-items:center;justify-content:center;padding:20px;}',
      '.scw-coadd{background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.28);',
      'width:560px;max-width:96vw;max-height:92vh;display:flex;flex-direction:column;',
      'font:13px/1.45 system-ui,-apple-system,sans-serif;color:#1e293b;}',
      '.scw-coadd.is-busy{opacity:.65;pointer-events:none;}',
      // Inline (strip-hosted) variant: full width, no dialog chrome.
      '.scw-coadd--inline{width:auto;max-width:none;max-height:none;',
      'box-shadow:none;border:0;border-radius:0;}',
      '.scw-coadd--inline .scw-coadd__body{overflow:visible;max-width:640px;}',
      '.scw-coadd--inline .scw-coadd__foot{justify-content:flex-start;border-top:0;padding-top:0;}',
      '.scw-coadd--inline .scw-coadd__err{margin-right:0;order:3;align-self:center;}',
      '.scw-coadd__head{display:flex;align-items:center;gap:8px;padding:16px 20px 12px;border-bottom:1px solid #e2e8f0;}',
      '.scw-coadd__title{font:700 15px/1.3 system-ui,sans-serif;color:#0f4c75;flex:1 1 auto;}',
      '.scw-coadd__x{border:none;background:none;font-size:22px;line-height:1;color:#94a3b8;cursor:pointer;padding:0 4px;}',
      '.scw-coadd__x:hover{color:#475569;}',
      '.scw-coadd__body{padding:16px 20px;overflow-y:auto;}',
      '.scw-coadd__row{margin-bottom:14px;}',
      '.scw-coadd__lbl{display:block;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.04em;',
      'text-transform:uppercase;color:#64748b;margin-bottom:6px;}',
      '.scw-coadd__help{font:400 11.5px/1.4 system-ui,sans-serif;color:#94a3b8;margin:5px 0 0;}',
      '.scw-coadd__chips{display:flex;flex-wrap:wrap;gap:8px;}',
      '.scw-coadd__chip{padding:7px 13px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;',
      'font:600 12.5px/1 system-ui,sans-serif;color:#334155;cursor:pointer;}',
      '.scw-coadd__chip:hover{background:#f1f5f9;}',
      '.scw-coadd__chip.is-on{background:#0f4c75;border-color:#0a3a63;color:#fff;}',
      '.scw-coadd__in{width:100%;padding:9px 11px;border:1px solid #cbd5e1;border-radius:7px;',
      'font:13px/1.4 system-ui,sans-serif;color:#1e293b;box-sizing:border-box;background:#fff;}',
      '.scw-coadd__in:focus{outline:none;border-color:#60a5fa;}',
      'textarea.scw-coadd__in{min-height:64px;resize:vertical;}',
      'select.scw-coadd__in{appearance:auto;}',
      '.scw-coadd__grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
      // inline combobox
      '.scw-coadd__combo{position:relative;}',
      '.scw-coadd__tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;}',
      '.scw-coadd__tags:empty{display:none;}',
      '.scw-coadd__tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;',
      'background:#eef2f7;color:#0f4c75;font:600 12px/1 system-ui,sans-serif;}',
      '.scw-coadd__tag button{border:none;background:none;color:#64748b;cursor:pointer;font-size:14px;line-height:1;padding:0;}',
      '.scw-coadd__menu{margin-top:5px;border:1px solid #cbd5e1;border-radius:7px;max-height:220px;',
      'overflow-y:auto;background:#fff;box-shadow:0 6px 18px rgba(15,23,42,.12);}',
      '.scw-coadd__menu[hidden]{display:none;}',
      '.scw-coadd__opt{padding:8px 11px;font:13px/1.35 system-ui,sans-serif;color:#1e293b;cursor:pointer;}',
      '.scw-coadd__opt:hover{background:#eef2f7;}',
      '.scw-coadd__opt.is-sel{background:#0f4c75;color:#fff;}',
      '.scw-coadd__opt.scw-coadd__hide{display:none;}',
      '.scw-coadd__menu-empty{padding:10px 11px;font:12px/1.4 system-ui,sans-serif;color:#94a3b8;}',
      // checkbox / radio group (MDF/IDF)
      '.scw-coadd__checks{display:flex;flex-direction:column;gap:7px;border:1px solid #e2e8f0;',
      'border-radius:7px;padding:9px 11px;max-height:200px;overflow-y:auto;}',
      '.scw-coadd__check{display:flex;align-items:center;gap:8px;font:13px/1.3 system-ui,sans-serif;',
      'color:#1e293b;cursor:pointer;}',
      '.scw-coadd__check input{cursor:pointer;}',
      '.scw-coadd__toggles{display:flex;flex-wrap:wrap;gap:16px;}',
      '.scw-coadd__tog{display:inline-flex;align-items:center;gap:7px;font:600 12.5px/1 system-ui,sans-serif;color:#334155;cursor:pointer;}',
      '.scw-coadd__foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e2e8f0;}',
      '.scw-coadd__btn{padding:9px 18px;border-radius:7px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;}',
      '.scw-coadd__btn--sec{background:#fff;border:1px solid #cbd5e1;color:#475569;}',
      '.scw-coadd__btn--sec:hover{background:#f1f5f9;}',
      '.scw-coadd__btn--pri{background:#0f4c75;border:1px solid #0a3a63;color:#fff;}',
      '.scw-coadd__btn--pri:hover{background:#0a3a63;}',
      '.scw-coadd__err{color:#b91c1c;font:600 12px/1.3 system-ui,sans-serif;margin-right:auto;align-self:center;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── inline combobox ────────────────────────────────────────────────
  // Renders search input + a filterable option list INSIDE `host` (no
  // overlay). Selection lives here; onChange(ids) surfaces it. Single-select
  // shows the label in the input; multi shows removable tags.
  function makeCombo(host, cfg) {
    var multi = !!cfg.multi;
    var selected = [];
    var labels = {};
    (cfg.candidates || []).forEach(function (c) { labels[c.id] = c.name; });

    host.classList.add('scw-coadd__combo');
    var tags  = document.createElement('div'); tags.className = 'scw-coadd__tags';
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'scw-coadd__in scw-coadd__combo-in';
    input.placeholder = cfg.placeholder || 'Search…';
    input.autocomplete = 'off';
    var menu  = document.createElement('div'); menu.className = 'scw-coadd__menu'; menu.hidden = true;
    if (!(cfg.candidates || []).length) {
      menu.innerHTML = '<div class="scw-coadd__menu-empty">' + esc(cfg.emptyText || 'No options') + '</div>';
    } else {
      var frag = '';
      for (var i = 0; i < cfg.candidates.length; i++) {
        frag += '<div class="scw-coadd__opt" data-id="' + esc(cfg.candidates[i].id) + '">' +
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
        h += '<span class="scw-coadd__tag">' + esc(labels[selected[i]] || selected[i]) +
          '<button type="button" data-rm="' + esc(selected[i]) + '">&times;</button></span>';
      }
      tags.innerHTML = h;
    }
    function markSel() {
      var opts = menu.querySelectorAll('.scw-coadd__opt');
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle('is-sel', selected.indexOf(opts[i].getAttribute('data-id')) !== -1);
      }
    }
    function filter(q) {
      q = (q || '').toLowerCase();
      var opts = menu.querySelectorAll('.scw-coadd__opt');
      for (var i = 0; i < opts.length; i++) {
        var hit = !q || opts[i].textContent.toLowerCase().indexOf(q) !== -1;
        opts[i].classList.toggle('scw-coadd__hide', !hit);
      }
    }
    input.addEventListener('focus', function () { if (!multi) input.select(); menu.hidden = false; });
    input.addEventListener('input', function () { menu.hidden = false; filter(input.value); });
    // Close on blur — the menu options preventDefault on mousedown so picking
    // one does NOT blur the input (multi-select stays open); focus only leaves
    // when the user clicks/tabs elsewhere, which is exactly when to dismiss.
    input.addEventListener('blur', function () {
      setTimeout(function () { menu.hidden = true; }, 120);
    });
    menu.addEventListener('mousedown', function (e) {
      var opt = e.target.closest && e.target.closest('.scw-coadd__opt');
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
    // close handled at modal level (see below) to avoid per-combo doc leaks
    host._closeMenu = function (target) { if (!host.contains(target)) menu.hidden = true; };
    return { ids: function () { return selected.slice(); } };
  }

  // ── inline checkbox / radio group (short lists — MDF/IDF) ──────────
  // All options visible at once, no search. multi → checkboxes, single →
  // radios.
  var _cgSeq = 0;
  function makeCheckGroup(host, cfg) {
    var multi = !!cfg.multi;
    var cands = cfg.candidates || [];
    host.className = 'scw-coadd__checks';
    if (!cands.length) {
      host.innerHTML = '<div class="scw-coadd__menu-empty">' + esc(cfg.emptyText || 'No options') + '</div>';
      if (typeof cfg.onChange === 'function') cfg.onChange([]);
      return;
    }
    var name = 'scw-coadd-cg-' + (++_cgSeq);
    var type = multi ? 'checkbox' : 'radio';
    var h = '';
    for (var i = 0; i < cands.length; i++) {
      h += '<label class="scw-coadd__check"><input type="' + type + '" name="' + name +
        '" value="' + esc(cands[i].id) + '"> ' + esc(cands[i].name) + '</label>';
    }
    host.innerHTML = h;
    host.addEventListener('change', function () {
      var checked = host.querySelectorAll('input:checked');
      var ids = [];
      for (var k = 0; k < checked.length; k++) ids.push(checked[k].value);
      if (typeof cfg.onChange === 'function') cfg.onChange(ids);
    });
  }

  // Who is adding — derived STRUCTURALLY from which deployment hosts the
  // form, never from the user's email (accounts/roles drift). The sub
  // portal's Manage Change Order page (scene_1374) hosts view_4112; the
  // internal CO drafting scene (scene_1362) hosts view_4079. Make reads
  // `origin` to stamp authorship (the "Added by sub" flag) on the created
  // line items; `originPage`/`originView`/`originScene` are human/debug
  // context riding along.
  var ORIGINS = {
    view_4079: { origin: 'ops', originPage: 'SCW build CO' },
    view_4112: { origin: 'sub', originPage: 'Sub bid pricing' }
  };

  // ── form (modal OR inline host) ────────────────────────────────────
  // open({ host: el, onClose: fn }) renders the SAME form inline into `host`
  // (no overlay) — used by the CO scene's "+ Add new items" strip. Without
  // `host` it renders as the centered modal. Submit/cancel behavior is
  // identical; close() tears down the form and fires opts.onClose.
  function open(opts) {
    opts = opts || {};
    var viewKey = opts.viewKey || 'view_4079';
    var inlineHost = opts.host || null;
    var coSowId = getCoSowId();
    injectCss();

    var st = { bucketId: '', productIds: [], mdfIds: [], accessoryIds: [] };

    var chrome =
      '<div class="scw-coadd__body"></div>' +
      '<div class="scw-coadd__foot">' +
        '<span class="scw-coadd__err" hidden></span>' +
        '<button type="button" class="scw-coadd__btn scw-coadd__btn--sec" data-act="cancel">Cancel</button>' +
        '<button type="button" class="scw-coadd__btn scw-coadd__btn--pri" data-act="submit">Add to Change Order</button>' +
      '</div>';

    var overlay = null, root;
    if (inlineHost) {
      root = document.createElement('div');
      root.className = 'scw-coadd scw-coadd--inline';
      root.innerHTML = chrome;
      inlineHost.innerHTML = '';
      inlineHost.appendChild(root);
    } else {
      overlay = document.createElement('div');
      overlay.className = 'scw-coadd__overlay';
      overlay.innerHTML =
        '<div class="scw-coadd" role="dialog" aria-modal="true">' +
          '<div class="scw-coadd__head">' +
            '<span class="scw-coadd__title">Add line item to Change Order</span>' +
            '<button type="button" class="scw-coadd__x" aria-label="Close">&times;</button>' +
          '</div>' + chrome +
        '</div>';
      document.body.appendChild(overlay);
      root = overlay.querySelector('.scw-coadd');
    }

    var modal = root;
    var body  = root.querySelector('.scw-coadd__body');
    var errEl = root.querySelector('.scw-coadd__err');
    var combos = {};   // key → combo controller

    function close() {
      if (!inlineHost) document.removeEventListener('keydown', onKey, true);
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (inlineHost) inlineHost.innerHTML = '';
      if (typeof opts.onClose === 'function') opts.onClose();
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      // Escape closes an open combo menu first; only closes the modal when no
      // menu is open.
      var openMenu = body.querySelector('.scw-coadd__menu:not([hidden])');
      if (openMenu) { e.preventDefault(); e.stopPropagation(); openMenu.hidden = true; return; }
      e.preventDefault(); close();
    }
    if (!inlineHost) {
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
      overlay.querySelector('.scw-coadd__x').addEventListener('click', close);
    }
    // One handler closes any open combo menu whose host wasn't clicked.
    modal.addEventListener('mousedown', function (e) {
      var hosts = body.querySelectorAll('.scw-coadd__combo');
      for (var i = 0; i < hosts.length; i++) {
        if (typeof hosts[i]._closeMenu === 'function') hosts[i]._closeMenu(e.target);
      }
    });
    function showErr(msg) { errEl.textContent = msg || ''; errEl.hidden = !msg; }

    // Row scaffolding — returns the row element and (for combos/inputs) wires
    // them up after insertion.
    function labelRow(label, helper) {
      var row = document.createElement('div'); row.className = 'scw-coadd__row';
      row.innerHTML = '<span class="scw-coadd__lbl">' + esc(label) + '</span>';
      if (helper) row.insertAdjacentHTML('beforeend', '<p class="scw-coadd__help">' + esc(helper) + '</p>');
      return row;
    }

    function buildField(fd, b) {
      var t = fd.t;
      if (t === 'product') {
        // Camera/Reader is single-select (label numbering is per-camera:
        // one prefix + start #). Every other bucket allows MULTIPLE products
        // — productIds stays an array either way, so the webhook payload is
        // identical shape and Make iterates one uniform list (length 1 for
        // cameras, N otherwise) with no per-bucket branch.
        var pMulti = b.id !== B_CAMERA;
        var row = labelRow(fd.label || (pMulti ? 'Products' : 'Product'));
        var host = document.createElement('div'); row.appendChild(host);
        combos.product = makeCombo(host, {
          candidates: productCandidates(st.bucketId, viewKey), multi: pMulti,
          placeholder: pMulti ? 'Search products…' : 'Search products…',
          emptyText: 'No products available on this scene',
          onChange: function (ids) {
            st.productIds = ids;
            if (b.id === B_ASSUMPTIONS) syncAssumptionDesc();
            rebuildAccessoryCombo();   // optional accessories depend on the product
          }
        });
        return row;
      }
      if (t === 'mdf') {
        var req = fd.mode === 'single' || fd.mode === 'multi';
        var lbl = 'MDF / IDF' + (req ? ' *' : ' (optional)') +
          (fd.mode === 'single' ? '' : ' — one item created per location');
        var mrow = labelRow(lbl);
        var mhost = document.createElement('div'); mrow.appendChild(mhost);
        // Checkbox (multi) / radio (single) group — short list, all visible.
        makeCheckGroup(mhost, {
          candidates: mdfCandidates(viewKey), multi: fd.mode !== 'single',
          emptyText: 'No MDF/IDF locations — add one from Manage Deployment first',
          onChange: function (ids) { st.mdfIds = ids; }
        });
        return mrow;
      }
      if (t === 'accessories') {
        var arow = labelRow('Optional accessories',
          'Default accessories are added automatically — pick only extras.');
        var ahost = document.createElement('div'); arow.appendChild(ahost);
        combos.accessoryHost = ahost;   // rebuilt when the product changes
        buildAccessoryCombo();
        return arow;
      }
      if (t === 'qty') {
        var qrow = labelRow(fd.label || 'Quantity');
        qrow.insertAdjacentHTML('beforeend', '<input type="number" min="1" class="scw-coadd__in" data-f="qty" value="1">');
        return qrow;
      }
      if (t === 'startNumber') {
        var srow = labelRow(fd.label || 'Start label number', fd.helper);
        srow.querySelector('.scw-coadd__lbl').insertAdjacentHTML('afterend',
          '<input type="number" class="scw-coadd__in" data-f="startNumber" placeholder="e.g. 12">');
        return srow;
      }
      if (t === 'prefix') {
        var prow = labelRow(fd.label || 'Label prefix');
        var opts = '<option value="">Select…</option>';
        for (var i = 0; i < PREFIX_OPTIONS.length; i++) {
          opts += '<option value="' + esc(PREFIX_OPTIONS[i].id) + '">' + esc(PREFIX_OPTIONS[i].label) + '</option>';
        }
        prow.insertAdjacentHTML('beforeend', '<select class="scw-coadd__in" data-f="prefix">' + opts + '</select>');
        return prow;
      }
      if (t === 'serviceCost') {
        var crow = labelRow(fd.label || 'Service cost ($)');
        crow.insertAdjacentHTML('beforeend', '<input type="number" step="0.01" class="scw-coadd__in" data-f="serviceCost">');
        return crow;
      }
      if (t === 'description') {
        var drow = labelRow(fd.label || 'Description of service');
        drow.insertAdjacentHTML('beforeend', '<textarea class="scw-coadd__in" data-f="description"></textarea>');
        if (fd.conditional === 'customAssumption') { drow.setAttribute('data-cond', 'customAssumption'); drow.style.display = 'none'; }
        return drow;
      }
      if (t === 'notes') {
        var nrow = labelRow(fd.label || 'Camera / reader notes');
        nrow.insertAdjacentHTML('beforeend', '<textarea class="scw-coadd__in" data-f="notes"></textarea>');
        return nrow;
      }
      if (t === 'toggles') {
        var trow = labelRow('Cabling');
        var wrap = document.createElement('div'); wrap.className = 'scw-coadd__toggles';
        for (var k = 0; k < fd.items.length; k++) {
          var key = fd.items[k];
          wrap.insertAdjacentHTML('beforeend',
            '<label class="scw-coadd__tog"><input type="checkbox" data-f="' + key + '"> ' +
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

    // Optional-accessory combo is (re)built from the CHOSEN product's
    // compatible accessories — so it must rebuild whenever the product
    // changes (and resets its own selection).
    function buildAccessoryCombo() {
      var host = combos.accessoryHost;
      if (!host) return;
      host.innerHTML = '';
      host.className = '';   // makeCombo re-adds .scw-coadd__combo
      st.accessoryIds = [];
      // Accessories are per-product, so a single optional-accessory list is
      // ambiguous once MULTIPLE products are chosen — defer those to the
      // worksheet card (per item, after creating). Defaults still auto-attach.
      if (st.productIds.length > 1) {
        host.innerHTML = '<div class="scw-coadd__menu-empty">Multiple products selected — ' +
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
        onChange: function (ids) { st.accessoryIds = ids; }
      });
    }
    function rebuildAccessoryCombo() { if (combos.accessoryHost) buildAccessoryCombo(); }

    // Full render — runs on open + on bucket change. Combos are re-created
    // (and reset) each time; within a bucket they manage themselves.
    function render() {
      combos = {};
      st.productIds = []; st.mdfIds = []; st.accessoryIds = [];
      body.innerHTML = '';

      var chipRow = document.createElement('div'); chipRow.className = 'scw-coadd__row';
      var chipHtml = '<span class="scw-coadd__lbl">Item type</span><div class="scw-coadd__chips">';
      for (var i = 0; i < BUCKETS.length; i++) {
        chipHtml += '<button type="button" class="scw-coadd__chip' +
          (BUCKETS[i].id === st.bucketId ? ' is-on' : '') + '" data-bucket="' +
          BUCKETS[i].id + '">' + esc(BUCKETS[i].name) + '</button>';
      }
      chipRow.innerHTML = chipHtml + '</div>';
      body.appendChild(chipRow);
      chipRow.querySelector('.scw-coadd__chips').addEventListener('click', function (e) {
        var chip = e.target.closest && e.target.closest('[data-bucket]');
        if (!chip) return;
        st.bucketId = chip.getAttribute('data-bucket');
        showErr(''); render();
      });

      var b = bucketById(st.bucketId);
      if (!b) return;
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
      if (!st.productIds.length) { showErr('Pick a product.'); return; }
      var mdfField = null;
      for (var i = 0; i < b.fields.length; i++) if (b.fields[i].t === 'mdf') mdfField = b.fields[i];
      if (mdfField && (mdfField.mode === 'single' || mdfField.mode === 'multi') && !st.mdfIds.length) {
        showErr('Pick at least one MDF / IDF.'); return;
      }
      if (!coSowId) { showErr('Could not resolve this change order from the URL.'); return; }
      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_ADD_ITEMS_WEBHOOK) || '';
      if (!url || /PLACEHOLDER/.test(url)) { showErr('Add-item webhook is not configured.'); return; }

      var prefixId = readField('prefix') || '';
      var payload = {
        coSowId:         coSowId,
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
        // Structural origin (see ORIGINS above): 'sub' = the sub portal's
        // pricing page, 'ops' = the internal build-CO page. An unknown
        // deployment fails safe to 'ops' (internal pages are the default;
        // sub authorship is only ever granted explicitly).
        origin:          (ORIGINS[viewKey] || {}).origin || 'ops',
        originPage:      (ORIGINS[viewKey] || {}).originPage || viewKey,
        originView:      viewKey,
        originScene:     (typeof Knack !== 'undefined' && Knack.router &&
                          Knack.router.current_scene_key) || ''
      };

      showErr('');
      modal.classList.add('is-busy');
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (resp) {
          var ok = resp.ok;
          return resp.text().then(function (txt) {
            var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
            return { ok: ok, data: data };
          });
        }).then(function (r) {
          var explicitFail = !!(r.data && (r.data.success === false || r.data.error));
          if (r.ok && !explicitFail) {
            close();
            if (wv2.data && typeof wv2.data.refetchAndNotify === 'function') {
              setTimeout(function () { wv2.data.refetchAndNotify(viewKey); }, 1500);
            }
            if (typeof wv2.toast === 'function') wv2.toast('Adding item to change order…');
          } else {
            modal.classList.remove('is-busy');
            showErr((r.data && r.data.error) ? ('Failed: ' + r.data.error) : 'Add failed — try again.');
          }
        }).catch(function () {
          modal.classList.remove('is-busy');
          showErr('Network error — try again.');
        });
    }

    root.querySelector('[data-act="cancel"]').addEventListener('click', close);
    root.querySelector('[data-act="submit"]').addEventListener('click', submit);

    render();
  }

  wv2.coAddForm = { open: open };
})();
/*** END: CO add-item modal ***********************************************/
