/*** DELIVERABLES WORKSHEET — schema-driven install-data collection ***/
(function () {
  'use strict';
  var NS = '.scwDeliverables';
  var PREFIX = 'scw-deliverables';
  var CONFIG = {
    // The install worksheet (view_3915) is a V2 cutover: the native table is
    // hidden and worksheet-v2 renders cards. We mount the deliverables panel
    // INSIDE each v2 install card's detail panel (not the hidden native rows).
    WORKSHEET_VIEW:  'view_3915',
    // Fields on the LINE ITEM
    VALUE_FIELD:            'field_2932',   // Paragraph/Rich-Text — stores the JSON answer blob
    LINE_ITEM_SCHEMA_FIELD: 'field_2930',   // Deliverable Schema connection on the line item
    // Schema FIELD DEFINITIONS come from the boot snippet's global — NOT an
    // on-page view, and NOT raw Knack records — so the bundle needs ZERO
    // Config-Field-Definition column ids. The snippet reads that object
    // (schema connection field_2924, label/key/inputType/choices/required/
    // sortOrder/active/default) and emits one SHAPED object per field:
    //   window.SCW.deliverablesFields = [{
    //     schemaId,            // Deliverable Schema record id (field_2924 conn)
    //     key, label,
    //     inputType,           // human label (INPUT_TYPES key) or a widget type
    //     choices,             // array OR newline-joined string
    //     required, active,    // bool OR "Yes"/"No"
    //     sortOrder,           // number
    //     default              // string (literal and/or {token})
    //   }, …]
    //   window.SCW.deliverablesFieldsReady = true;   // set when the fetch completes
    // Friendly token name -> line-item field key for {token} defaults. Empty:
    // we use raw {field_###} tokens (resolved against the worksheet model with
    // zero config). Add entries only for friendly aliases.
    DEFAULT_TOKENS: {},
    // Input Type label -> widget (snippet may also pass a widget type directly,
    // which passes through unchanged).
    INPUT_TYPES: {
      'Short Text': 'text', 'Long Text': 'textarea', 'Number': 'number',
      'Yes-No': 'yesno', 'Single Select': 'select', 'Multi Select': 'multiselect', 'Date': 'date'
    },
    debug: false
  };
  /* ── read Knack view records ── */
  function getViewRecords(viewId) {
    var view = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
    var models = view && view.model && view.model.data && view.model.data.models;
    if (!models || !models.length) return [];
    return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); });
  }
  function firstConnId(rec, fieldKey) {
    var raw = rec[fieldKey + '_raw'];
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || null;
    if (raw && raw.id) return raw.id;
    return null;
  }
  /* ── load schema fields grouped by schema id ── */
  function loadSchemaFields() {
    // The snippet emits pre-shaped field objects (friendly keys), so there are
    // no Knack column ids to read here — just normalize light types and group
    // by schema. Tolerant of inputType being a human label ("Single Select")
    // or an already-mapped widget type, and choices/booleans in either form.
    var rows = (window.SCW && window.SCW.deliverablesFields) || [];
    var bySchema = {};
    rows.forEach(function (f) {
      if (!f) return;
      if (f.active != null && !isYes(f.active)) return;   // honor soft-delete when present
      var schemaId = f.schemaId || f.schema;
      if (!schemaId) return;
      var key = String(f.key == null ? '' : f.key).trim();
      if (!key) return;
      var rawType = String(f.inputType || f.type || '').trim();
      var type = CONFIG.INPUT_TYPES[rawType] || rawType || 'text';
      var def = {
        key:       key,
        label:     String(f.label == null ? '' : f.label).trim(),
        type:      type,
        choices:   Array.isArray(f.choices)
                     ? f.choices.map(function (c) { return String(c == null ? '' : c).trim(); }).filter(Boolean)
                     : parseChoices(f.choices),
        required:  isYes(f.required),
        sortOrder: Number(f.sortOrder) || 0,
        def:       String(f['default'] == null ? '' : f['default']).trim()
      };
      (bySchema[schemaId] = bySchema[schemaId] || []).push(def);
    });
    Object.keys(bySchema).forEach(function (sid) {
      bySchema[sid].sort(function (a, b) {
        return (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label);
      });
    });
    if (CONFIG.debug) SCW.log('[' + PREFIX + '] schema fields', bySchema);
    return bySchema;
  }
  // Schema resolves directly from the line item's Deliverable Schema
  // connection (field_2930) — no product→schema view needed.
  function resolveSchemaId(rec) {
    return CONFIG.LINE_ITEM_SCHEMA_FIELD
      ? firstConnId(rec, CONFIG.LINE_ITEM_SCHEMA_FIELD)
      : null;
  }
  /* ── parsing helpers ── */
  function isYes(v) {
    if (v === true) return true;
    return /^(yes|true|on|1)$/i.test(String(v == null ? '' : v).trim());
  }
  function parseChoices(v) {
    return String(v == null ? '' : v).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function readValues(rec) {
    var raw = rec[CONFIG.VALUE_FIELD];
    if (!raw) return {};
    var text = String(raw).replace(/<[^>]*>/g, '').trim();
    if (!text) return {};
    try { return JSON.parse(text) || {}; } catch (e) { return {}; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  /* ── default tokens (hybrid: {field_###} raw, or friendly names) ── */
  function fieldDisplay(rec, fk) {
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) return raw.map(function (r) { return r.identifier || ''; }).join(', ');
    if (raw && raw.identifier) return raw.identifier;
    var v = rec[fk];
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim();
  }
  function recordHasField(rec, fk) {
    return Object.prototype.hasOwnProperty.call(rec, fk) ||
           Object.prototype.hasOwnProperty.call(rec, fk + '_raw');
  }
  function resolveDefaultTokens(str, rec) {
    return String(str || '').replace(/\{(\w+)\}/g, function (m, name) {
      if (/^field_\d+$/.test(name)) return recordHasField(rec, name) ? fieldDisplay(rec, name) : m;
      var fk = CONFIG.DEFAULT_TOKENS[name];
      return fk ? fieldDisplay(rec, fk) : m;
    });
  }
  function coerceDefault(def, rec) {
    var resolved = resolveDefaultTokens(def.def, rec);
    if (def.type === 'multiselect') return parseChoices(resolved);
    return resolved;
  }
  /* ── render one field ── */
  function renderField(def, value) {
    var id = PREFIX + '-' + def.key;
    var req = def.required ? ' <span class="' + PREFIX + '-req">*</span>' : '';
    var label = '<label class="' + PREFIX + '-label" for="' + id + '">' + esc(def.label) + req + '</label>';
    var control = '', v = value == null ? '' : value;
    switch (def.type) {
      case 'textarea':
        control = '<textarea id="' + id + '" data-key="' + esc(def.key) + '" class="' + PREFIX + '-input">' + esc(v) + '</textarea>'; break;
      case 'number':
        control = '<input id="' + id + '" data-key="' + esc(def.key) + '" type="number" class="' + PREFIX + '-input" value="' + esc(v) + '">'; break;
      case 'date':
        control = '<input id="' + id + '" data-key="' + esc(def.key) + '" type="date" class="' + PREFIX + '-input" value="' + esc(v) + '">'; break;
      case 'yesno':
        control = '<select id="' + id + '" data-key="' + esc(def.key) + '" class="' + PREFIX + '-input">' +
          '<option value=""'    + (v === ''    ? ' selected' : '') + '></option>' +
          '<option value="Yes"' + (v === 'Yes' ? ' selected' : '') + '>Yes</option>' +
          '<option value="No"'  + (v === 'No'  ? ' selected' : '') + '>No</option></select>'; break;
      case 'select':
        control = '<select id="' + id + '" data-key="' + esc(def.key) + '" class="' + PREFIX + '-input"><option value=""></option>' +
          def.choices.map(function (c) {
            return '<option value="' + esc(c) + '"' + (String(v) === c ? ' selected' : '') + '>' + esc(c) + '</option>';
          }).join('') + '</select>'; break;
      case 'multiselect':
        var sel = Array.isArray(v) ? v : (v ? [v] : []);
        control = '<div class="' + PREFIX + '-chips" data-key="' + esc(def.key) + '">' +
          def.choices.map(function (c) {
            var on = sel.indexOf(c) !== -1;
            return '<button type="button" class="' + PREFIX + '-chip' + (on ? ' is-on' : '') +
                   '" data-val="' + esc(c) + '" aria-pressed="' + on + '">' + esc(c) + '</button>';
          }).join('') + '</div>'; break;
      default:
        control = '<input id="' + id + '" data-key="' + esc(def.key) + '" type="text" class="' + PREFIX + '-input" value="' + esc(v) + '">';
    }
    return '<div class="' + PREFIX + '-field" data-type="' + def.type + '">' + label + control + '</div>';
  }
  /* ── build / collect / save ── */
  function buildPanel(recordId, rec, fields, values) {
    var body = fields.map(function (def) {
      var v = Object.prototype.hasOwnProperty.call(values, def.key) ? values[def.key] : coerceDefault(def, rec);
      return renderField(def, v);
    }).join('');
    return '<div class="' + PREFIX + '-panel" data-record-id="' + esc(recordId) + '">' +
        '<div class="' + PREFIX + '-grid">' + body + '</div>' +
        '<div class="' + PREFIX + '-actions">' +
          '<span class="' + PREFIX + '-status" aria-live="polite"></span>' +
          '<button type="button" class="' + PREFIX + '-save">Save</button>' +
        '</div></div>';
  }
  function collectValues(panelEl) {
    var out = {};
    panelEl.querySelectorAll('[data-key]').forEach(function (el) {
      var key = el.getAttribute('data-key');
      if (el.classList.contains(PREFIX + '-chips')) {
        out[key] = Array.prototype.slice.call(el.querySelectorAll('.is-on')).map(function (b) { return b.getAttribute('data-val'); });
      } else { out[key] = el.value; }
    });
    return out;
  }
  function parseKnackError(xhr) {
    try {
      var b = JSON.parse(xhr.responseText || '{}');
      if (b.errors && b.errors.length) return b.errors.map(function (e) { return e.message || e; }).join('; ');
      if (b.message) return b.message;
    } catch (e) {}
    return 'Save failed';
  }
  function save(viewId, recordId, valuesObj, onDone) {
    var data = {}; data[CONFIG.VALUE_FIELD] = JSON.stringify(valuesObj);
    var view = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recordId, data, { success: function () { onDone(true); }, error: function () { onDone(false, 'updateRecord failed'); } });
      return;
    }
    SCW.knackAjax({
      url: SCW.knackRecordUrl(viewId, recordId), type: 'PUT', data: JSON.stringify(data),
      success: function () { onDone(true); }, error: function (xhr) { onDone(false, parseKnackError(xhr)); }
    });
  }
  /* ── wire a mounted panel ── */
  function wirePanel(panelEl, viewId) {
    var recordId = panelEl.getAttribute('data-record-id');
    panelEl.addEventListener('click', function (e) {
      var chip = e.target.closest('.' + PREFIX + '-chip');
      if (chip) { var on = chip.classList.toggle('is-on'); chip.setAttribute('aria-pressed', on); }
    });
    var saveBtn = panelEl.querySelector('.' + PREFIX + '-save');
    var statusEl = panelEl.querySelector('.' + PREFIX + '-status');
    saveBtn.addEventListener('click', function () {
      saveBtn.disabled = true; statusEl.textContent = 'Saving…'; statusEl.className = PREFIX + '-status';
      save(viewId, recordId, collectValues(panelEl), function (ok, msg) {
        saveBtn.disabled = false;
        statusEl.textContent = ok ? 'Saved' : (msg || 'Save failed');
        statusEl.classList.add(ok ? 'is-ok' : 'is-err');
        if (ok) setTimeout(function () { statusEl.textContent = ''; statusEl.className = PREFIX + '-status'; }, 1800);
      });
    });
  }
  /* ── mount: fold one editor into each v2 install card's detail panel ──
   * view_3915 is a V2 cutover — the native table is display:none and
   * worksheet-v2 renders cards (.scw-ws-v2-card[data-scw-ws-v2-record]) whose
   * collapsible body is .scw-ws-v2-detail. We mount the deliverables panel
   * there (so it follows the card accordion). worksheet-v2 rebuilds its body
   * innerHTML on every data tick, so we re-inject idempotently on a container
   * observer + staggered passes (mirrors install-config-subpanel.js). */
  var V2_CONTAINER_ID = 'scw-ws-v2-' + CONFIG.WORKSHEET_VIEW;
  var _selfMutating = false;

  function v2DetailFor(recordId) {
    var card = document.querySelector(
      '.scw-ws-v2-card[data-scw-ws-v2-record="' + recordId + '"]');
    return card ? card.querySelector('.scw-ws-v2-detail') : null;
  }

  function mount(viewId) {
    // Boot-race guard: the snippet that fills window.SCW.deliverablesFields
    // may not have finished its API fetch when the worksheet first renders
    // (same cold-load race as productBucketMap). Retry briefly instead of
    // rendering nothing — re-run mount until the global is ready (~6s).
    if (!(window.SCW && window.SCW.deliverablesFieldsReady)) {
      if (mount._tries == null) mount._tries = 0;
      if (mount._tries++ < 20) { setTimeout(function () { mount(viewId); }, 300); }
      return;
    }
    var bySchema = loadSchemaFields();
    var records = getViewRecords(viewId);
    if (!records.length) return;
    _selfMutating = true;
    try {
      records.forEach(function (rec) {
        var detail = v2DetailFor(rec.id);
        if (!detail) return;   // card not painted yet — a later pass catches it
        var schemaId = resolveSchemaId(rec);
        var fields = schemaId ? bySchema[schemaId] : null;
        var existing = detail.querySelector(
          '.' + PREFIX + '-panel[data-record-id="' + rec.id + '"]');
        if (!fields || !fields.length) {
          // No schema for this row → ensure no stale panel lingers.
          if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
          return;
        }
        if (existing) return;   // already mounted (and holds the user's edits) — leave it
        var values = readValues(rec);
        var holder = document.createElement('div');
        holder.innerHTML = buildPanel(rec.id, rec, fields, values);
        var panel = holder.firstChild;
        detail.appendChild(panel);
        wirePanel(panel, viewId);
      });
    } finally {
      setTimeout(function () { _selfMutating = false; }, 0);
    }
  }

  /** Re-run mount at staggered delays — worksheet-v2 mounts its panel + paints
   *  cards slightly AFTER the view-render fires (its data subscriber is async). */
  function stagger() {
    var delays = [50, 250, 750, 2000];
    for (var i = 0; i < delays.length; i++) {
      setTimeout(function () {
        installV2Observer();
        mount(CONFIG.WORKSHEET_VIEW);
      }, delays[i]);
    }
  }

  /** Watch the worksheet-v2 container — it swaps its body innerHTML on every
   *  data subscriber fire, wiping our panels; re-mount on any child mutation.
   *  No-op until the v2 panel exists. Ignores our own writes via _selfMutating. */
  function installV2Observer() {
    var container = document.getElementById(V2_CONTAINER_ID);
    if (!container || container.__scwDeliverablesObs) return;
    var body = container.querySelector('.scw-ws-v2-body') || container;
    container.__scwDeliverablesObs = true;
    var pending = false;
    var obs = new MutationObserver(function () {
      if (_selfMutating || pending) return;
      pending = true;
      setTimeout(function () { pending = false; mount(CONFIG.WORKSHEET_VIEW); }, 150);
    });
    obs.observe(body, { childList: true, subtree: true });
  }
  /* ── CSS ── */
  function injectCss() {
    var STYLE_ID = PREFIX + '-css';
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.' + PREFIX + '-panel{padding:14px 18px;background:#f8fafc;border-top:1px solid #e5e7eb;}' +
      '.' + PREFIX + '-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px 18px;}' +
      '.' + PREFIX + '-field{display:flex;flex-direction:column;gap:4px;}' +
      '.' + PREFIX + '-label{font:600 12px/1.3 system-ui,sans-serif;color:#374151;}' +
      '.' + PREFIX + '-req{color:#b45309;}' +
      '.' + PREFIX + '-input{font:14px/1.3 system-ui,sans-serif;padding:6px 8px;border:1px solid #d1d5db;border-radius:5px;background:#f3f4f6;}' +
      '.' + PREFIX + '-input:focus{background:#fff;outline:2px solid #93c5fd;}' +
      'textarea.' + PREFIX + '-input{min-height:54px;resize:vertical;}' +
      '.' + PREFIX + '-chips{display:flex;flex-wrap:wrap;gap:6px;}' +
      '.' + PREFIX + '-chip{font:600 12px/1 system-ui,sans-serif;padding:6px 10px;border:1px solid #d1d5db;border-radius:14px;background:#fff;color:#374151;cursor:pointer;}' +
      '.' + PREFIX + '-chip.is-on{background:#0f4c75;border-color:#0f4c75;color:#fff;}' +
      '.' + PREFIX + '-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:12px;}' +
      '.' + PREFIX + '-status{font:600 12px/1 system-ui,sans-serif;color:#6b7280;}' +
      '.' + PREFIX + '-status.is-ok{color:#15803d;}.' + PREFIX + '-status.is-err{color:#b91c1c;}' +
      '.' + PREFIX + '-save{font:600 13px/1 system-ui,sans-serif;padding:8px 16px;border:0;border-radius:6px;background:#0f4c75;color:#fff;cursor:pointer;}' +
      '.' + PREFIX + '-save:disabled{opacity:.6;cursor:default;}';
    var style = document.createElement('style'); style.id = STYLE_ID; style.textContent = css;
    document.head.appendChild(style);
  }
  /* ── bind ── */
  var _autoDbg = false;
  SCW.onViewRender(CONFIG.WORKSHEET_VIEW, function () {
    injectCss();
    installV2Observer();
    stagger();
    // One-time auto-diagnostic: ~2.5s after the first worksheet render (gives
    // the snippet + cards time), dump the gate status so we don't need a
    // manual console call. Remove once this is dialed in.
    if (!_autoDbg) {
      _autoDbg = true;
      setTimeout(function () {
        if (window.SCW && typeof window.SCW.deliverablesDebug === 'function') {
          window.SCW.deliverablesDebug();
        }
      }, 2500);
    }
  }, NS);

  /* ── diagnostic: run SCW.deliverablesDebug() in the console to see which
   * gate is failing (snippet global ready? field_2930 on the model? schema
   * matched?). Returns + logs a summary; harmless to leave shipped. */
  window.SCW = window.SCW || {};
  window.SCW.deliverablesDebug = function () {
    var g = window.SCW && window.SCW.deliverablesFields;
    var bySchema = loadSchemaFields();
    var schemaIds = Object.keys(bySchema);
    var records = getViewRecords(CONFIG.WORKSHEET_VIEW);
    var info = {
      globalPresent: !!g,
      globalLength: (g && g.length) || 0,
      ready: !!(window.SCW && window.SCW.deliverablesFieldsReady),
      schemaCount: schemaIds.length,
      schemaIds: schemaIds,
      records: records.length,
      withField2930: 0,
      matched: 0,
      v2Cards: document.querySelectorAll('.scw-ws-v2-card[data-scw-ws-v2-record]').length,
      sample: []
    };
    records.forEach(function (rec) {
      var has = recordHasField(rec, CONFIG.LINE_ITEM_SCHEMA_FIELD);
      var sid = resolveSchemaId(rec);
      if (has) info.withField2930++;
      if (sid && bySchema[sid]) info.matched++;
      if (info.sample.length < 6) {
        info.sample.push({ id: rec.id, hasField2930: has, schemaId: sid, matched: !!(sid && bySchema[sid]) });
      }
    });
    if (window.console) console.log('[scw-deliverables] debug', info);
    return info;
  };

  if (window.console) {
    console.log('[scw-deliverables] module loaded — view ' + CONFIG.WORKSHEET_VIEW +
      '; run SCW.deliverablesDebug() any time for details');
  }
})();
/*** END DELIVERABLES WORKSHEET ***/
