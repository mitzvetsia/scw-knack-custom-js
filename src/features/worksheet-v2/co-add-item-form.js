/*** CHANGE ORDER — custom "Add line item(s)" modal ************************
 *
 * Replaces the native DTO add form (view_4100) on the CO worksheet. The DTO
 * form is hacky: one product connection field PER bucket (field_2193/2194/
 * 2195/2224/2913/2248) purely so Knack can filter products by bucket — a
 * problem the bundle already solves client-side (SCW.productBucketMap). This
 * modal uses ONE bucket-filtered product picker, ports the DTO view's exact
 * per-bucket field show/hide rules, and fires a Make webhook that creates the
 * SOW Line Item records DIRECTLY (no DTO staging object), connected to THIS
 * change order's SOW.
 *
 * Opened by the worksheet-v2 toolbar "+ Add New Item" button (the view_4079
 * config entry sets customAddModal:true → toolbar handleAction calls
 * SCW.worksheetV2.coAddForm.open).
 *
 * CO SOW id: last 24-hex segment of the hash (view_4079 is a drill-in child
 * page whose own record IS the CO's SOW — same rule co-adopt.js uses).
 *
 * Per-bucket field rules are a straight port of
 * SOW-line-item-DTO-bucket-field-visibility.js BUCKET_RULES:
 *   Camera/Reader      → MDF(single,req) qty prefix startNumber cabling
 *                        exterior plenum accessories notes
 *   Networking/Headend → MDF(multi,req)  qty accessories
 *   Other Equipment    → MDF(opt-multi)  qty
 *   Other Services     → MDF(opt-multi)  serviceCost qty description
 *   Assumptions        → MDF(opt-multi)  (+ description when product =
 *                        "Custom Assumption")
 *   Materials          → MDF(opt-multi)  accessories
 *   License            → qty
 * Every bucket also has the universal (bucket-filtered) product picker.
 ***************************************************************************/
(function () {
  'use strict';

  var ns  = (window.SCW = window.SCW || {});
  ns.worksheetV2 = ns.worksheetV2 || {};
  var wv2 = ns.worksheetV2;

  var STYLE_ID = 'scw-co-add-form-css';
  var HEX24    = /^[a-f0-9]{24}$/i;
  var CUSTOM_ASSUMPTION_ID = '69ce7098172caa5786d3767d';

  // Bucket ids ← view_4100 field_2223 options. `mdf`: single|multi|opt|none
  // (mirrors field_2211 single-req / field_2180 multi-req / field_2250
  // optional-multi / none). `fields`: which extra inputs render.
  var BUCKETS = [
    { id: '6481e5ba38f283002898113c', name: 'Camera or Reader', mdf: 'single',
      fields: ['qty', 'prefix', 'startNumber', 'cabling', 'exterior', 'plenum', 'accessories', 'notes'] },
    { id: '647953bb54b4e1002931ed97', name: 'Networking or Headend', mdf: 'multi',
      fields: ['qty', 'accessories'] },
    { id: '5df12ce036f91b0015404d78', name: 'Other Equipment', mdf: 'opt',
      fields: ['qty'] },
    { id: '6977caa7f246edf67b52cbcd', name: 'Other Services', mdf: 'opt',
      fields: ['serviceCost', 'qty', 'description'] },
    { id: '697b7a023a31502ec68b3303', name: 'Assumptions', mdf: 'opt',
      fields: [] },
    { id: '6a14eee134e422f3769ada00', name: 'Materials', mdf: 'opt',
      fields: ['accessories'] },
    { id: '645554dce6f3a60028362a6a', name: 'License', mdf: 'none',
      fields: ['qty'] }
  ];
  function bucketById(id) {
    for (var i = 0; i < BUCKETS.length; i++) if (BUCKETS[i].id === id) return BUCKETS[i];
    return null;
  }

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
      var u = (typeof Knack !== 'undefined' && Knack.getUserAttributes)
        ? Knack.getUserAttributes() : null;
      if (!u) return {};
      var n = u.name;
      if (n && typeof n === 'object') n = ((n.first || '') + ' ' + (n.last || '')).trim();
      return { id: u.id || '', name: n || '', email: u.email || '' };
    } catch (e) { return {}; }
  }

  // ── candidate sources ──────────────────────────────────────────────
  // Products: ONE list, filtered to the chosen bucket via SCW.productMap /
  // SCW.productBucketMap (the same maps the inline product picker uses). No
  // per-bucket field — that's the whole point of going custom.
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
      return known ? hit : true;   // no bucket data anywhere → universal
    }
    var out = [], id, p;
    for (id in pmap) {
      if (!Object.prototype.hasOwnProperty.call(pmap, id)) continue;
      p = pmap[id];
      if (p && allowed(id, p)) out.push({ id: id, name: p.name || '(unnamed)' });
    }
    // Fallback: catalog snippet not on this scene (Known Issue #17) → scrape
    // distinct products already in use on the CO worksheet's records.
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
    out.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), undefined,
        { numeric: true, sensitivity: 'base' });
    });
    return out;
  }
  // MDF/IDF locations from the CO scene grid (mdfSourceViewKey → view_4084),
  // labelled by mdfLabelField (field_1642).
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
    out.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), undefined,
        { numeric: true, sensitivity: 'base' });
    });
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
      '.scw-coadd__head{display:flex;align-items:center;gap:8px;padding:16px 20px 12px;',
      'border-bottom:1px solid #e2e8f0;}',
      '.scw-coadd__title{font:700 15px/1.3 system-ui,sans-serif;color:#0f4c75;flex:1 1 auto;}',
      '.scw-coadd__x{border:none;background:none;font-size:22px;line-height:1;color:#94a3b8;',
      'cursor:pointer;padding:0 4px;}',
      '.scw-coadd__x:hover{color:#475569;}',
      '.scw-coadd__body{padding:16px 20px;overflow-y:auto;}',
      '.scw-coadd__row{margin-bottom:14px;}',
      '.scw-coadd__lbl{display:block;font:600 11px/1.2 system-ui,sans-serif;',
      'letter-spacing:.04em;text-transform:uppercase;color:#64748b;margin-bottom:6px;}',
      '.scw-coadd__chips{display:flex;flex-wrap:wrap;gap:8px;}',
      '.scw-coadd__chip{padding:7px 13px;border:1px solid #cbd5e1;border-radius:999px;',
      'background:#fff;font:600 12.5px/1 system-ui,sans-serif;color:#334155;cursor:pointer;}',
      '.scw-coadd__chip:hover{background:#f1f5f9;}',
      '.scw-coadd__chip.is-on{background:#0f4c75;border-color:#0a3a63;color:#fff;}',
      '.scw-coadd__pickbtn{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;',
      'border:1px solid #c7d4e0;border-radius:7px;background:#fff;color:#0f4c75;cursor:pointer;',
      'font:600 13px/1 system-ui,sans-serif;}',
      '.scw-coadd__pickbtn:hover{background:#f1f5f9;}',
      '.scw-coadd__picked{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
      '.scw-coadd__tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;',
      'border-radius:999px;background:#eef2f7;color:#0f4c75;font:600 12px/1 system-ui,sans-serif;}',
      '.scw-coadd__tag button{border:none;background:none;color:#64748b;cursor:pointer;font-size:14px;line-height:1;}',
      '.scw-coadd__in{width:100%;padding:9px 11px;border:1px solid #cbd5e1;border-radius:7px;',
      'font:13px/1.4 system-ui,sans-serif;color:#1e293b;box-sizing:border-box;}',
      '.scw-coadd__in:focus{outline:none;border-color:#60a5fa;}',
      'textarea.scw-coadd__in{min-height:64px;resize:vertical;}',
      '.scw-coadd__grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
      '.scw-coadd__toggles{display:flex;flex-wrap:wrap;gap:16px;}',
      '.scw-coadd__tog{display:inline-flex;align-items:center;gap:7px;font:600 12.5px/1 system-ui,sans-serif;color:#334155;cursor:pointer;}',
      '.scw-coadd__hide{display:none!important;}',
      '.scw-coadd__foot{display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;',
      'border-top:1px solid #e2e8f0;}',
      '.scw-coadd__btn{padding:9px 18px;border-radius:7px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;}',
      '.scw-coadd__btn--sec{background:#fff;border:1px solid #cbd5e1;color:#475569;}',
      '.scw-coadd__btn--sec:hover{background:#f1f5f9;}',
      '.scw-coadd__btn--pri{background:#0f4c75;border:1px solid #0a3a63;color:#fff;}',
      '.scw-coadd__btn--pri:hover{background:#0a3a63;}',
      '.scw-coadd__btn--pri:disabled{opacity:.55;cursor:default;}',
      '.scw-coadd__err{color:#b91c1c;font:600 12px/1.3 system-ui,sans-serif;margin-right:auto;align-self:center;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── modal ──────────────────────────────────────────────────────────
  function open(opts) {
    opts = opts || {};
    var viewKey = opts.viewKey || 'view_4079';
    var coSowId = getCoSowId();
    injectCss();

    // Per-open state.
    var st = {
      bucketId: '', productIds: [], productLabels: {},
      accessoryIds: [], accessoryLabels: {}, mdfIds: [], mdfLabels: {}
    };

    var overlay = document.createElement('div');
    overlay.className = 'scw-coadd__overlay';
    overlay.innerHTML =
      '<div class="scw-coadd" role="dialog" aria-modal="true">' +
        '<div class="scw-coadd__head">' +
          '<span class="scw-coadd__title">Add line item to Change Order</span>' +
          '<button type="button" class="scw-coadd__x" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="scw-coadd__body"></div>' +
        '<div class="scw-coadd__foot">' +
          '<span class="scw-coadd__err" hidden></span>' +
          '<button type="button" class="scw-coadd__btn scw-coadd__btn--sec" data-act="cancel">Cancel</button>' +
          '<button type="button" class="scw-coadd__btn scw-coadd__btn--pri" data-act="submit">Add to Change Order</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var modal = overlay.querySelector('.scw-coadd');
    var body  = overlay.querySelector('.scw-coadd__body');
    var errEl = overlay.querySelector('.scw-coadd__err');

    function close() {
      document.removeEventListener('keydown', onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.scw-coadd__x').addEventListener('click', close);

    function showErr(msg) { errEl.textContent = msg || ''; errEl.hidden = !msg; }

    // Renders the whole body for the current bucket selection.
    function render() {
      var b = bucketById(st.bucketId);
      var has = function (f) { return b && b.fields.indexOf(f) !== -1; };
      var showDesc = has('description') ||
        (b && b.id === '697b7a023a31502ec68b3303' &&
         st.productIds.indexOf(CUSTOM_ASSUMPTION_ID) !== -1);

      var html = '';
      // Bucket chips (always).
      html += '<div class="scw-coadd__row"><span class="scw-coadd__lbl">Item type</span>' +
        '<div class="scw-coadd__chips">';
      for (var i = 0; i < BUCKETS.length; i++) {
        html += '<button type="button" class="scw-coadd__chip' +
          (BUCKETS[i].id === st.bucketId ? ' is-on' : '') +
          '" data-bucket="' + BUCKETS[i].id + '">' + esc(BUCKETS[i].name) + '</button>';
      }
      html += '</div></div>';

      if (b) {
        // Product (universal, bucket-filtered).
        html += pickerRow('product', 'Product', st.productIds, st.productLabels, true);
        // MDF / IDF.
        if (b.mdf !== 'none') {
          var mdfReq = (b.mdf === 'single' || b.mdf === 'multi');
          var mdfLbl = 'MDF / IDF' + (mdfReq ? ' *' : ' (optional)') +
            (b.mdf === 'single' ? '' : ' — one item created per location');
          html += pickerRow('mdf', mdfLbl, st.mdfIds, st.mdfLabels, b.mdf !== 'single');
        }
        // Qty + startNumber row.
        if (has('qty') || has('startNumber')) {
          html += '<div class="scw-coadd__row"><div class="scw-coadd__grid2">';
          if (has('qty')) html += field('qty', 'Quantity', '<input type="number" min="1" class="scw-coadd__in" data-f="qty" value="1">');
          if (has('startNumber')) html += field('startNumber', 'Start label # ', '<input type="number" class="scw-coadd__in" data-f="startNumber" placeholder="e.g. 12">');
          html += '</div></div>';
        }
        if (has('prefix')) html += field('prefix', 'Label prefix', '<input type="text" class="scw-coadd__in" data-f="prefix" placeholder="e.g. E-">', true);
        if (has('serviceCost')) html += field('serviceCost', 'Service cost ($)', '<input type="number" step="0.01" class="scw-coadd__in" data-f="serviceCost">', true);
        // Accessories.
        if (has('accessories')) html += pickerRow('accessory', 'Optional accessories', st.accessoryIds, st.accessoryLabels, true);
        // Cabling / exterior / plenum toggles.
        if (has('cabling') || has('exterior') || has('plenum')) {
          html += '<div class="scw-coadd__row"><span class="scw-coadd__lbl">Cabling</span><div class="scw-coadd__toggles">';
          if (has('cabling'))  html += tog('existingCabling', 'Re-use existing cabling');
          if (has('exterior')) html += tog('exterior', 'Exterior mounting');
          if (has('plenum'))   html += tog('plenum', 'Plenum');
          html += '</div></div>';
        }
        if (showDesc) html += field('description', 'Description of service', '<textarea class="scw-coadd__in" data-f="description"></textarea>', true);
        if (has('notes')) html += field('notes', 'Camera / reader notes', '<textarea class="scw-coadd__in" data-f="notes"></textarea>', true);
      }
      body.innerHTML = html;
    }

    function field(f, label, inner, full) {
      return '<div class="scw-coadd__row"' + (full ? '' : '') + '>' +
        '<span class="scw-coadd__lbl">' + esc(label) + '</span>' + inner + '</div>';
    }
    function tog(f, label) {
      return '<label class="scw-coadd__tog"><input type="checkbox" data-f="' + f + '"> ' + esc(label) + '</label>';
    }
    function pickerRow(kind, label, ids, labels, multi) {
      var tags = '';
      for (var i = 0; i < ids.length; i++) {
        tags += '<span class="scw-coadd__tag">' + esc(labels[ids[i]] || ids[i]) +
          '<button type="button" data-rm="' + kind + ':' + ids[i] + '">&times;</button></span>';
      }
      return '<div class="scw-coadd__row"><span class="scw-coadd__lbl">' + esc(label) + '</span>' +
        '<button type="button" class="scw-coadd__pickbtn" data-pick="' + kind + '">' +
        (ids.length ? 'Change' : (multi ? 'Choose…' : 'Choose…')) + '</button>' +
        '<div class="scw-coadd__picked">' + tags + '</div></div>';
    }

    // Delegated body clicks: bucket chips, picker buttons, tag removal.
    body.addEventListener('click', function (e) {
      var t = e.target;
      var chip = t.closest && t.closest('[data-bucket]');
      if (chip) {
        st.bucketId = chip.getAttribute('data-bucket');
        // Reset selections that don't carry across buckets.
        st.productIds = []; st.productLabels = {};
        st.accessoryIds = []; st.accessoryLabels = {};
        showErr(''); render(); return;
      }
      var rm = t.getAttribute && t.getAttribute('data-rm');
      if (rm) {
        var parts = rm.split(':'), kind = parts[0], id = parts[1];
        removeId(kind, id); render(); return;
      }
      var pick = t.getAttribute && t.getAttribute('data-pick');
      if (pick) { openPicker(pick); return; }
    });

    function removeId(kind, id) {
      var arr = kind === 'product' ? st.productIds : kind === 'accessory' ? st.accessoryIds : st.mdfIds;
      var idx = arr.indexOf(id); if (idx !== -1) arr.splice(idx, 1);
    }

    function openPicker(kind) {
      var multi = kind !== 'product' ? true : false;   // product single-select; mdf/accessory multi
      var cands, selected, labelMap;
      if (kind === 'product') {
        cands = productCandidates(st.bucketId, viewKey);
        selected = st.productIds; labelMap = st.productLabels;
      } else if (kind === 'accessory') {
        cands = productCandidates('', viewKey);   // accessories aren't bucket-scoped
        selected = st.accessoryIds; labelMap = st.accessoryLabels;
      } else {
        cands = mdfCandidates(viewKey);
        selected = st.mdfIds; labelMap = st.mdfLabels;
      }
      if (!cands.length) {
        showErr(kind === 'mdf'
          ? 'No MDF/IDF locations found — add one from Manage Deployment first.'
          : 'No products available on this scene.');
        return;
      }
      if (!(wv2.picker && typeof wv2.picker.open === 'function')) {
        showErr('Picker unavailable.'); return;
      }
      wv2.picker.open({
        // pickOnly short-circuits before any PUT, but open() still guards on
        // these three — pass placeholders.
        fieldKey: 'co-add-' + kind, recordId: 'co-add', sourceViewKey: viewKey,
        label: kind === 'mdf' ? 'Pick MDF / IDF' : (kind === 'accessory' ? 'Pick accessories' : 'Pick a product'),
        multi: multi, groupBy: false,
        candidates: cands, selectedIds: selected.slice(),
        itemLabel: function (r) { return r.name || r.id; },
        pickOnly: true,
        onChoose: function (ids) {
          var byId = {}; for (var i = 0; i < cands.length; i++) byId[cands[i].id] = cands[i].name;
          if (kind === 'product') {
            st.productIds = ids.slice(); st.productLabels = {};
            for (var p = 0; p < ids.length; p++) st.productLabels[ids[p]] = byId[ids[p]];
          } else if (kind === 'accessory') {
            st.accessoryIds = ids.slice(); st.accessoryLabels = {};
            for (var a = 0; a < ids.length; a++) st.accessoryLabels[ids[a]] = byId[ids[a]];
          } else {
            st.mdfIds = ids.slice(); st.mdfLabels = {};
            for (var m = 0; m < ids.length; m++) st.mdfLabels[ids[m]] = byId[ids[m]];
          }
          render();
        }
      });
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
      if ((b.mdf === 'single' || b.mdf === 'multi') && !st.mdfIds.length) {
        showErr('Pick at least one MDF / IDF.'); return;
      }
      if (b.mdf === 'single' && st.mdfIds.length > 1) {
        showErr('This item type takes a single MDF / IDF.'); return;
      }
      if (!coSowId) { showErr('Could not resolve this change order from the URL.'); return; }

      var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CO_ADD_ITEMS_WEBHOOK) || '';
      if (!url || /PLACEHOLDER/.test(url)) { showErr('Add-item webhook is not configured.'); return; }

      var payload = {
        coSowId:         coSowId,
        bucketId:        b.id,
        bucketName:      b.name,
        productIds:      st.productIds.slice(),
        accessoryIds:    st.accessoryIds.slice(),
        mdfIds:          st.mdfIds.slice(),
        qty:             readField('qty') || '',
        prefix:          readField('prefix') || '',
        startNumber:     readField('startNumber') || '',
        existingCabling: !!readField('existingCabling'),
        exterior:        !!readField('exterior'),
        plenum:          !!readField('plenum'),
        serviceCost:     readField('serviceCost') || '',
        description:     readField('description') || '',
        notes:           readField('notes') || '',
        triggeredBy:     triggeredBy()
      };

      showErr('');
      modal.classList.add('is-busy');
      fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (resp) {
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

    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-act="submit"]').addEventListener('click', submit);

    render();
  }

  wv2.coAddForm = { open: open };
})();
/*** END: CO add-item modal ***********************************************/
