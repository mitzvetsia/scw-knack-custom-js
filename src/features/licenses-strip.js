/*** RECURRING LICENSES STRIP (deploy page, scene_1311) *********************
 *
 * docs/deploy-page-redesign.md addendum (2026-09-22). A full-width card
 * between "Also on this project" and the worksheet — the same shelf as the
 * site maps strip, not a drawer: what the client is expecting to be billed
 * for on its own recurring cycle belongs in the PM's face, not one click
 * away inside "Also on this project" (where it first landed and felt
 * buried). Collapsed by default, like the worksheet's own Assumptions /
 * Services quiet tier — the header alone states the count and the
 * extended total, so the fact reads without opening anything.
 *
 * Display only. No activation control yet: every line reads "Not yet
 * activated" until that workflow (a PM-facing "Purchased — start billing"
 * action, feeding a Make → Xero repeating-invoice scenario) is designed.
 *
 * Data: the install line items (view_4093) worksheet-v2 already has
 * loaded, filtered to the License bucket the same way the worksheet's own
 * synthetic "Recurring licenses" group does (worksheet-v2/card.js
 * isLicenseBucket). Object_128 (the install line item object) carries no
 * money field of its own (config.js moneyMode:'install', hideMoneyColumns)
 * — pricing is joined from the PROPOSED SOW line item the install record
 * points at (field_2819 → the hidden view_4072 grid), the exact join
 * bom-tray.js already uses for its own pricing column: retail
 * (field_1960), discount $ each (field_2262), net unit (field_2268),
 * shown extended (× qty). No billing-cadence field exists anywhere in the
 * data model yet, so the total is a plain extended dollar figure — never
 * labelled "/mo" or "/yr" until that's real.
 *
 * Ops scene only (scene_1311): this is a billing fact for the PM, not
 * something the sub-contractor dashboard needs.
 ****************************************************************************/
(function () {
  'use strict';

  var SCENES = [
    { sceneId: 'scene_1311', installView: 'view_4093', sowView: 'view_4072' }
  ];
  // Install line item (worksheet-v2 config, view_4093) — same keys bom-tray.js reads.
  var IF = {
    productName: 'field_2790',   // PRODUCT STORED_name
    product:     'field_2846',   // CORE_product (connection)
    qty:         'field_2789',
    bucket:      'field_2822',   // REL_CONFIG_proposal bucket (connection) — license fallback only
    sortOrder:   'field_2218',
    sowItem:     'field_2819'    // → proposed SOW line item (pricing)
  };
  // Proposed SOW line item (view_4072)
  var SF = {
    retail:       'field_1960',
    discountEach: 'field_2262',
    netUnit:      'field_2268',
    sku:          'field_56'
  };
  var LICENSE_BUCKET = '645554dce6f3a60028362a6a';
  var STRIP_ID = 'scw-lic-strip';
  var STYLE_ID = 'scw-lic-strip-css';
  var EVENT_NS = '.scwLicStrip';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '#' + STRIP_ID + ' {',
      '  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;',
      '  font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #0f172a; overflow: hidden;',
      '}',
      '.scw-lic__head {',
      '  display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box;',
      '  padding: 12px 16px; background: none; border: 0; cursor: pointer; text-align: left; font: inherit; color: inherit;',
      '}',
      '.scw-lic__chevron { flex: none; color: #94a3b8; transition: transform 120ms ease; }',
      '#' + STRIP_ID + '.is-open .scw-lic__chevron { transform: rotate(90deg); }',
      '.scw-lic__titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }',
      '.scw-lic__title { font-weight: 700; font-size: 13px; }',
      '.scw-lic__sub { font-size: 11.5px; color: #64748b; }',
      '.scw-lic__stats { margin-left: auto; display: flex; align-items: center; gap: 10px; flex: none; }',
      '.scw-lic__count {',
      '  background: #eaf1f7; color: #163C6E; border-radius: 999px; padding: 1px 9px;',
      '  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap;',
      '}',
      '.scw-lic__total { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.scw-lic__body { display: none; border-top: 1px solid #e2e8f0; padding: 10px 16px 14px; }',
      '#' + STRIP_ID + '.is-open .scw-lic__body { display: block; }',
      '.scw-lic__rows { display: flex; flex-direction: column; gap: 6px; }',
      '.scw-lic__row {',
      '  display: flex; align-items: center; gap: 10px; border: 1px solid #e2e8f0; border-radius: 8px;',
      '  padding: 8px 11px; background: #fbfcfd;',
      '}',
      '.scw-lic__id { flex: 1 1 auto; min-width: 0; }',
      '.scw-lic__name { font-weight: 600; font-size: 12.5px; }',
      '.scw-lic__sku { display: block; font: 500 10.5px/1.5 ui-monospace, Menlo, Consolas, monospace; color: #64748b; }',
      '.scw-lic__qty { flex: none; width: 34px; text-align: center; font-variant-numeric: tabular-nums; color: #475569; font-size: 12px; }',
      '.scw-lic__money { flex: none; width: 76px; text-align: right; font-variant-numeric: tabular-nums; font-size: 12.5px; }',
      '.scw-lic__status { flex: none; width: 132px; text-align: right; font-size: 11.5px; color: #64748b; display: flex; align-items: center; justify-content: flex-end; gap: 5px; }',
      '.scw-lic__dot { width: 5px; height: 5px; border-radius: 999px; background: #94a3b8; flex: none; }',
      '.scw-lic__foot { margin-top: 10px; font-size: 11px; color: #64748b; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function plain(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  }
  function num(v) {
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function connLabel(rec, fk) {
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) return raw.length && raw[0] ? plain(raw[0].identifier) : '';
    if (raw && typeof raw === 'object') return plain(raw.identifier);
    return plain(rec[fk]);
  }
  function connId(rec, fk) {
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) return raw.length && raw[0] ? (raw[0].id || '') : '';
    if (raw && typeof raw === 'object') return raw.id || '';
    return '';
  }
  function hasValue(rec, fk) {
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) return raw.length > 0;
    if (raw != null && raw !== '') return true;
    return plain(rec[fk]) !== '';
  }
  function money(n) {
    var neg = n < 0, a = Math.abs(n);
    var s = a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '−' : '') + '$' + s;
  }
  function modelRecords(viewKey) {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewKey] : null;
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return [];
    return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); });
  }
  /** The install records the worksheet renders: worksheet-v2's cache when
   *  it's there (tracks Knack's collection + inline edits), else the raw
   *  Knack model — same fallback bom-tray.js uses. */
  function installRecords(cfg) {
    var ns = window.SCW && SCW.worksheetV2;
    try {
      if (ns && ns.data && typeof ns.data.readRecords === 'function') {
        var recs = ns.data.readRecords(cfg.installView);
        if (recs && recs.length) return recs;
      }
    } catch (e) { /* fall through */ }
    return modelRecords(cfg.installView);
  }
  function sowIndex(cfg) {
    var out = {}, recs = modelRecords(cfg.sowView);
    for (var i = 0; i < recs.length; i++) if (recs[i] && recs[i].id) out[recs[i].id] = recs[i];
    return out;
  }
  /** SKU column, found by its header text ("SKU") on the SOW grid first,
   *  then the install grid — the same trick bom-tray.js uses (hidden Knack
   *  grids keep their DOM, so the header is there to read). */
  function skuField(cfg) {
    var views = [cfg.sowView, cfg.installView];
    for (var v = 0; v < views.length; v++) {
      var ths = document.querySelectorAll('#' + views[v] + ' thead th');
      for (var i = 0; i < ths.length; i++) {
        var m = (ths[i].className || '').match(/\bfield_\d+\b/);
        if (m && /\bsku\b/i.test(ths[i].textContent)) return { view: views[v], key: m[0] };
      }
    }
    return null;
  }
  function isLicense(rec, viewKey) {
    var ns = window.SCW && SCW.worksheetV2;
    try {
      if (ns && ns.card && typeof ns.card.isLicenseBucket === 'function') return ns.card.isLicenseBucket(rec, viewKey);
    } catch (e) { /* fall through to the raw bucket check */ }
    var raw = rec && rec[IF.bucket + '_raw'];
    var one = Array.isArray(raw) ? raw[0] : raw;
    return !!one && (one.id === LICENSE_BUCKET || /^\s*licen[cs]e/i.test(String(one.identifier || '')));
  }

  function licenseLines(cfg) {
    var recs = installRecords(cfg), sow = sowIndex(cfg), skuCol = skuField(cfg), out = [];
    for (var i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || !r.id || !isLicense(r, cfg.installView)) continue;
      var s = sow[connId(r, IF.sowItem)] || null;
      var sku = '';
      if (skuCol) {
        var src = skuCol.view === cfg.installView ? r : s;
        sku = src ? (connLabel(src, skuCol.key) || plain(src[skuCol.key])) : '';
      }
      if (!sku) sku = plain(s && s[SF.sku]);
      var retail   = s && hasValue(s, SF.retail)       ? num(s[SF.retail]) : null;
      var discount = s && hasValue(s, SF.discountEach) ? num(s[SF.discountEach]) : null;
      var net      = s && hasValue(s, SF.netUnit)      ? num(s[SF.netUnit]) : null;
      if (net == null && retail != null) net = retail - (discount || 0);
      var qty = hasValue(r, IF.qty) ? num(r[IF.qty]) : 1;
      out.push({
        id: r.id,
        name: plain(r[IF.productName]) || connLabel(r, IF.product) || '(unnamed)',
        sku: sku,
        qty: qty,
        net: net,
        extended: net != null ? net * qty : null,
        sortOrder: hasValue(r, IF.sortOrder) ? num(r[IF.sortOrder]) : Infinity
      });
    }
    out.sort(function (a, b) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    return out;
  }

  function toggle(strip) {
    var open = strip.classList.toggle('is-open');
    var head = strip.querySelector('.scw-lic__head');
    if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function render(cfg) {
    var nav = document.getElementById('scw-deploy-nav');
    var slot = nav && nav.querySelector('.scw-deploy-licenses-slot');
    if (!slot) return;
    if (!document.getElementById(cfg.installView)) {
      if (slot.firstChild) slot.innerHTML = '';
      return;
    }

    var lines = licenseLines(cfg);
    var strip = document.getElementById(STRIP_ID);
    if (!lines.length) {
      // Nothing recurring on this project: no card, no gap. Unlike site
      // maps (every project needs those), most projects have none — a
      // permanent empty-state card would just be noise on every deploy page.
      if (strip) slot.innerHTML = '';
      return;
    }
    var sig = lines.map(function (l) { return l.id + ':' + l.qty + ':' + l.net; }).join('|');
    if (strip && strip.getAttribute('data-scw-sig') === sig) return;
    var wasOpen = strip ? strip.classList.contains('is-open') : false;
    if (!strip) {
      strip = document.createElement('div');
      strip.id = STRIP_ID;
      slot.appendChild(strip);
    }
    strip.setAttribute('data-scw-sig', sig);

    var total = 0, known = true;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].extended == null) known = false; else total += lines[i].extended;
    }
    var rows = lines.map(function (l) {
      return '<div class="scw-lic__row">' +
        '<div class="scw-lic__id"><span class="scw-lic__name">' + esc(l.name) + '</span>' +
          (l.sku ? '<span class="scw-lic__sku">' + esc(l.sku) + '</span>' : '') + '</div>' +
        '<div class="scw-lic__qty">×' + esc(l.qty) + '</div>' +
        '<div class="scw-lic__money">' + (l.extended != null ? esc(money(l.extended)) : '—') + '</div>' +
        '<div class="scw-lic__status"><span class="scw-lic__dot"></span>Not yet activated</div>' +
      '</div>';
    }).join('');

    strip.innerHTML =
      '<button type="button" class="scw-lic__head" aria-expanded="' + (wasOpen ? 'true' : 'false') + '">' +
        '<svg class="scw-lic__chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
          '<path d="M2 1L8 5L2 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
        '<span class="scw-lic__titles"><span class="scw-lic__title">Recurring licenses</span>' +
          '<span class="scw-lic__sub">Billed separately, on its own cycle — not part of the worksheet or its totals below.</span></span>' +
        '<span class="scw-lic__stats">' +
          '<span class="scw-lic__count">' + lines.length + (lines.length === 1 ? ' line' : ' lines') + '</span>' +
          (known ? '<span class="scw-lic__total">' + esc(money(total)) + '</span>' : '') +
        '</span>' +
      '</button>' +
      '<div class="scw-lic__body"><div class="scw-lic__rows">' + rows + '</div>' +
        (known ? '' : '<div class="scw-lic__foot">One or more lines have no linked SOW pricing yet — total left out.</div>') +
      '</div>';
    strip.classList.toggle('is-open', wasOpen);
    strip.querySelector('.scw-lic__head').addEventListener('click', function () { toggle(strip); });
  }

  function activeScene() {
    for (var i = 0; i < SCENES.length; i++) {
      if (document.getElementById('kn-' + SCENES[i].sceneId)) return SCENES[i];
    }
    return null;
  }

  var _timer = null;
  function scheduleApply(delay) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      _timer = null;
      var cfg = activeScene();
      if (!cfg) return;
      injectStyles();
      try { render(cfg); } catch (e) { /* strip is optional chrome */ }
    }, delay == null ? 300 : delay);
  }
  for (var s = 0; s < SCENES.length; s++) {
    (function (cfg) {
      $(document).on('knack-scene-render.' + cfg.sceneId + EVENT_NS, function () { scheduleApply(400); });
      $(document).on('knack-view-render.' + cfg.installView + EVENT_NS, function () { scheduleApply(100); });
    })(SCENES[s]);
  }
  $(document).on('knack-view-render.any' + EVENT_NS, function () { if (activeScene()) scheduleApply(400); });
})();
/*** END: RECURRING LICENSES STRIP *******************************************/
