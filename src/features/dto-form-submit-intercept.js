/*** DTO FORM SUBMIT INTERCEPT — submit only the fields the bucket shows ***/
//
// The SOW line-item "Add to Scope" DTO forms show a different set of fields
// per bucket (SOW-line-item-DTO-bucket-field-visibility.js hides the rest
// with CSS). Several hidden fields are REQUIRED (mandatory MDF/IDF single +
// multi selects, one product field per bucket, Label Pre-Fix). Knack used to
// skip required inputs that weren't visible; since 2026-10 its in-browser
// check validates them anyway, so every bucket's submit fails with
// "X is required" for fields the user never saw.
//
// Records submitted this way were always accepted server-side with those
// hidden fields EMPTY, so the block is Knack's browser-side check. This
// module takes over Submit on the listed forms: it collects the fields the
// selected bucket shows (plus any input the visibility module doesn't
// manage), POSTs them through the SAME form view's records endpoint with
// the user's session — creating the same DTO record Knack would have — and
// then returns to the parent page the way the form's own submit does.
// Required stays ON in Knack; nothing fake is written.
//
// The form's parent-record CRUMBS (hidden input.crumb in .kn-submit, e.g.
// scope-of-work-details_id=<sow id>) travel IN THE BODY alongside the
// field values, exactly as Knack's own submit serializes them — they are
// what connects the new record to the page's record. (2026-10-08: sending
// them only in the URL left every DTO record unconnected to its SOW.)
//
// ⚠ If Make is triggered by a RULE on this form's submit (not by watching
// the DTO object), a view-based POST may not run it — the project-notes
// composer's record rule did not run through the same kind of POST.
(function () {
  'use strict';

  var CONFIG = {
    // Every DTO add form a bucket-visibility module hides fields on:
    //   view_3329 / view_4002  Add to Scope (SOW-line-item-DTO-bucket-field-visibility.js)
    //   view_3451 / view_3748  Add to Scope, ops + sales pages (…_view_3451.js)
    //   view_3544 / view_3619 / view_3627  Add survey bid item (bucket-field-visibility_add-survey-bid-item.js)
    // view_4100 (CO add form) is replaced by worksheet-v2/co-add-item-form.js.
    VIEWS: ['view_3329', 'view_4002', 'view_3451', 'view_3748', 'view_3544', 'view_3619', 'view_3627'],
    BUCKET_FIELD: 'field_2223',
    // Field keys the visibility module manages: hidden unless .scw-visible.
    // Anything else on the form is submitted as-is.
    VISIBLE_CLASS: 'scw-visible',
    // Sent whether or not the bucket shows them: the bucket itself and the
    // unified product (set_unified_product_field.js fills it from the
    // bucket's product picker and parks it off-screen; not every bucket's
    // rule lists it).
    ALWAYS_SEND: ['field_2223', 'field_2246'],
    debug: true
  };
  var NS = '.scwDtoIntercept';
  var HEX24 = /^[a-f0-9]{24}$/i;
  var STYLE_ID = 'scw-dto-intercept-css';
  var _busy = {};

  function log() { if (CONFIG.debug) { try { console.info.apply(console, ['[scw-dto-submit]'].concat([].slice.call(arguments))); } catch (e) { /* ignore */ } } }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.scw-dto-msg{margin:0 0 14px;padding:10px 14px;border-radius:8px;font:600 13px/1.4 system-ui,sans-serif}' +
      '.scw-dto-msg.is-err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c}' +
      '.scw-dto-msg.is-info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}';
    document.head.appendChild(s);
  }

  // ── which fields to send ─────────────────────────────────────────
  // A field is sent when its wrapper is visible for this bucket, or when
  // the visibility module doesn't manage it at all (no scw-visible toggling
  // on the form → every wrapper counts as visible). The bucket always goes.
  function managed(formEl) {
    return !!formEl.querySelector('.kn-input.' + CONFIG.VISIBLE_CLASS);
  }
  function fieldKeyOf(wrap) {
    var k = wrap.getAttribute('data-input-id') || '';
    if (/^field_\d+$/.test(k)) return k;
    var m = (wrap.id || '').match(/field_\d+$/);
    return m ? m[0] : '';
  }
  function isSent(wrap, key, isManaged) {
    if (CONFIG.ALWAYS_SEND.indexOf(key) >= 0) return true;
    if (!isManaged) return true;
    return wrap.classList.contains(CONFIG.VISIBLE_CLASS);
  }
  function hasValue(v) {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return v;
    return v !== null && v !== undefined && String(v).trim() !== '';
  }

  /** Read one input wrapper into the view-API value shape. */
  function readValue(wrap, key) {
    // Chosen / native selects (connections, multiple choice).
    var sel = wrap.querySelector('select#' + CSS.escape(wrap.closest('.kn-view').id + '-' + key)) ||
              wrap.querySelector('select[name="' + key + '"]') ||
              wrap.querySelector('select:not([name="page_select"]):not([name="limit"])');
    if (sel) {
      if (sel.multiple) {
        var vals = [];
        for (var i = 0; i < sel.options.length; i++) if (sel.options[i].selected && sel.options[i].value) vals.push(sel.options[i].value);
        return vals;
      }
      var v = sel.value || '';
      return HEX24.test(v) ? [v] : v;
    }
    // Checkbox lists: connection ids (24-hex values) → array; a lone
    // Yes/No checkbox → boolean.
    var boxes = wrap.querySelectorAll('input[type="checkbox"]');
    if (boxes.length) {
      var anyHex = false, picked = [];
      for (var b = 0; b < boxes.length; b++) {
        if (HEX24.test(boxes[b].value)) anyHex = true;
        if (boxes[b].checked) picked.push(boxes[b].value);
      }
      if (anyHex) return picked.filter(function (x) { return HEX24.test(x); });
      if (boxes.length === 1) return !!boxes[0].checked;
      return picked;
    }
    var radio = wrap.querySelector('input[type="radio"]:checked');
    if (radio) return radio.value;
    if (wrap.querySelector('input[type="radio"]')) return '';
    // Hidden connection carrier.
    var conn = wrap.querySelector('input.connection');
    if (conn && conn.value) {
      var cv = conn.value.trim();
      if (cv.charAt(0) === '[') { try { var arr = JSON.parse(cv); return arr.map(function (x) { return x && x.id ? x.id : x; }); } catch (e) { /* split below */ } }
      return cv.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    }
    var ta = wrap.querySelector('textarea');
    if (ta) return ta.value;
    var inp = wrap.querySelector('input[name="' + key + '"], input#' + CSS.escape(key) + ', input[id$="-' + key + '"]') ||
              wrap.querySelector('input:not([type="hidden"]):not([type="file"])');
    return inp ? inp.value : '';
  }

  function collect(formEl) {
    var isManaged = managed(formEl);
    var body = {}, sent = [], skipped = [], hiddenWithValue = [];
    var wraps = formEl.querySelectorAll('.kn-input');
    for (var i = 0; i < wraps.length; i++) {
      var key = fieldKeyOf(wraps[i]);
      if (!key || body.hasOwnProperty(key)) continue;
      var val = readValue(wraps[i], key);
      if (!isSent(wraps[i], key, isManaged)) {
        // Knack's own submit sent hidden fields too; only the EMPTY ones are
        // what its required check trips on. A hidden field something filled
        // (a default, a JS setter) still goes, so nothing is lost vs before.
        if (!hasValue(val)) { skipped.push(key); continue; }
        hiddenWithValue.push(key);
      }
      body[key] = val;
      sent.push(key);
    }
    return { body: body, sent: sent, skipped: skipped, hiddenWithValue: hiddenWithValue };
  }

  /** The form's parent-record crumbs — Knack renders them as hidden
   *  input.crumb elements in the form's .kn-submit block and sends them with
   *  the field values; they are what connects the new record to the page's
   *  record. Fallbacks: the scene's crumbs, then the page hash
   *  (…/<slug>/<24-hex id> → <slug>_id). */
  function crumbs(formEl, scene) {
    var out = [], seen = {};
    function take(els) {
      for (var i = 0; i < els.length; i++) {
        var n = els[i].getAttribute('name'), v = els[i].value;
        if (!n || !v || seen[n]) continue;
        seen[n] = true;
        out.push({ name: n, value: v });
      }
    }
    take(formEl.querySelectorAll('input.crumb[name]'));
    if (!out.length) {
      var sceneEl = scene ? document.getElementById('kn-' + scene) : null;
      take((sceneEl || document).querySelectorAll('input.crumb[name]'));
    }
    if (!out.length) {
      var parts = (window.location.hash || '').split('?')[0].replace(/^#\/?/, '').split('/').filter(Boolean);
      for (var j = 1; j < parts.length; j++) {
        var name = parts[j - 1] + '_id';
        if (HEX24.test(parts[j]) && !HEX24.test(parts[j - 1]) && !seen[name]) {
          seen[name] = true;
          out.push({ name: name, value: parts[j] });
        }
      }
    }
    return out;
  }

  function message(formEl, text, kind) {
    var box = formEl.querySelector('.scw-dto-msg');
    if (!text) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.className = 'scw-dto-msg';
      formEl.insertBefore(box, formEl.firstChild);
    }
    box.className = 'scw-dto-msg ' + (kind === 'err' ? 'is-err' : 'is-info');
    box.textContent = text;
  }

  /** A child-page form opens in Knack's modal shell; an inline form sits
   *  in the page itself and just resets after a submit. */
  function inModal(formEl) {
    return !!(formEl.closest && formEl.closest('.kn-modal, .kn-modal-bg'));
  }
  function resetForm(formEl) {
    try { formEl.reset(); } catch (e) { /* ignore */ }
    try {
      var sels = formEl.querySelectorAll('select');
      for (var i = 0; i < sels.length; i++) $(sels[i]).trigger('chosen:updated').trigger('liszt:updated').trigger('change');
    } catch (e) { /* jQuery-less test envs */ }
  }

  /** Leave the modal the way the form's own submit does: back to the
   *  parent page (drop the modal's slug [+ record id] from the hash),
   *  which re-renders the parent and its grids. */
  function returnToParent() {
    var raw = window.location.hash || '';
    var q = raw.indexOf('?');
    var path = (q >= 0 ? raw.slice(0, q) : raw).replace(/\/+$/, '');
    var query = q >= 0 ? raw.slice(q) : '';
    var parts = path.replace(/^#\/?/, '').split('/').filter(Boolean);
    // Child-page hash is .../<modal-slug>/<record-id>; drop both (same as
    // modal-refresh-redirect.js). A lone slug drops just itself.
    if (parts.length >= 2) parts.splice(-2, 2); else parts.length = 0;
    var next = '#' + parts.join('/') + query;
    try { window.location.replace(window.location.pathname + window.location.search + next); }
    catch (e) { window.location.hash = next; }
  }

  function submit(viewId, formEl, btn) {
    if (_busy[viewId]) return;
    if (!(window.SCW && typeof SCW.knackAjax === 'function')) { message(formEl, 'Cannot submit: the bundle request helper is missing.', 'err'); return; }
    var scene = Knack.router && Knack.router.current_scene_key;
    if (!scene) { message(formEl, 'Cannot submit: no current page.', 'err'); return; }
    var c = collect(formEl);
    if (c.hiddenWithValue.length) log(viewId + ' hidden fields carrying a value, sent anyway:', c.hiddenWithValue);
    // Parent crumbs go in the body (where Knack's own submit puts them —
    // that is what connects the record to the page's SOW) and in the URL.
    var cr = crumbs(formEl, scene), qs = [];
    for (var k = 0; k < cr.length; k++) {
      c.body[cr[k].name] = cr[k].value;
      qs.push(encodeURIComponent(cr[k].name) + '=' + encodeURIComponent(cr[k].value));
    }
    var url = Knack.api_url + '/v1/pages/' + scene + '/views/' + viewId + '/records' + (qs.length ? '?' + qs.join('&') : '');
    if (!cr.length) console.warn('[scw-dto-submit] ' + viewId + ': no parent-record crumb found — the new record will NOT connect to the page\'s record');
    log(viewId + ' submitting ' + c.sent.length + ' fields (bucket-visible), skipping ' + c.skipped.length + ' hidden:', c.body, 'skipped:', c.skipped, 'crumbs:', cr, 'url:', url);

    _busy[viewId] = true;
    var label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    message(formEl, 'Submitting…', 'info');
    SCW.knackAjax({
      url: url, type: 'POST', data: JSON.stringify(c.body),
      success: function (res) {
        _busy[viewId] = false;
        var record = res && (res.record || res);
        log(viewId + ' created', record && record.id);
        message(formEl, 'Added.', 'info');
        if (btn) { btn.disabled = false; btn.textContent = label || 'Submit'; }
        // Let anything listening for this form's submit run as usual.
        try {
          var v = Knack.views && Knack.views[viewId];
          $(document).trigger('knack-form-submit.' + viewId, [v, record]);
          $(document).trigger('knack-record-create.' + viewId, [v, record]);
        } catch (e) { /* listeners are best-effort */ }
        if (inModal(formEl)) setTimeout(returnToParent, 300);
        else resetForm(formEl);
      },
      error: function (xhr) {
        _busy[viewId] = false;
        if (btn) { btn.disabled = false; btn.textContent = label || 'Submit'; }
        var msg = 'HTTP ' + (xhr && xhr.status);
        try {
          var j = JSON.parse(xhr.responseText);
          if (j && j.errors && j.errors.length) msg = j.errors.map(function (e) { return e.message || e; }).join(' · ');
        } catch (e) { /* not JSON */ }
        console.warn('[scw-dto-submit] ' + viewId + ' failed:', msg, c.body);
        message(formEl, 'Could not add: ' + msg, 'err');
      }
    });
  }

  /** Only ADD forms: an edit form would need a PUT to its record; none of
   *  the listed views is one, but don't take over Submit if that changes. */
  function isInsertForm(viewId) {
    var v = Knack.views && Knack.views[viewId];
    var vw = v && v.model && v.model.view;
    return !vw || !vw.action || vw.action === 'insert' || vw.action === 'create';
  }

  function bind(viewId) {
    if (!isInsertForm(viewId)) { log(viewId + ' is not an add form — leaving Knack submit alone'); return; }
    var view = document.getElementById(viewId);
    var formEl = view && view.querySelector('form');
    if (!formEl || formEl.__scwDtoBound) return;
    formEl.__scwDtoBound = true;
    injectCss();
    // Capture phase on the form: ours runs before Knack's handlers, which
    // never see the submit (their required check is what blocks today).
    formEl.addEventListener('submit', function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      submit(viewId, formEl, formEl.querySelector('button[type="submit"], .kn-submit .kn-button'));
    }, true);
    formEl.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('button[type="submit"], input[type="submit"], .kn-submit .kn-button');
      if (!btn || !formEl.contains(btn)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      submit(viewId, formEl, btn);
    }, true);
    log(viewId + ' submit intercepted (bucket-visible fields only)');
  }

  // SCW.onViewRender replays for a view that rendered before the bundle
  // finished loading; a raw $(document).on() would miss that first render.
  CONFIG.VIEWS.forEach(function (viewId) {
    var handler = function () { bind(viewId); };
    if (window.SCW && typeof SCW.onViewRender === 'function') SCW.onViewRender(viewId, handler, NS);
    else $(document).off('knack-view-render.' + viewId + NS).on('knack-view-render.' + viewId + NS, handler);
  });

  window.SCW = window.SCW || {};
  SCW.dtoSubmitIntercept = { CONFIG: CONFIG, collect: collect, crumbs: crumbs, bind: bind };
})();
