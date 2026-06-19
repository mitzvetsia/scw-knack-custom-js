/*** DELIVERABLES WORKSHEET — schema-driven install-data collection ***/
(function () {
  'use strict';
  var NS = '.scwDeliverables';
  var PREFIX = 'scw-deliverables';
  var CONFIG = {
    WORKSHEET_VIEW:  'view_XXXX',   // TODO: line-items grid/worksheet view
    SCHEMA_DEF_VIEW: 'view_XXXX',   // TODO: hidden view listing ALL Config Field Definition records
    PRODUCT_SCHEMA_VIEW: '',        // not needed — schema is direct on the line item
    // Fields on the LINE ITEM
    VALUE_FIELD:            'field_XXXX',   // TODO: Paragraph/Rich-Text — stores the JSON blob
    PRODUCT_FIELD:          'field_XXXX',   // TODO (optional): product connection, only if a token needs it
    LINE_ITEM_SCHEMA_FIELD: 'field_2930',   // Deliverable Schema connection on the line item
    // Fields on the CONFIG FIELD DEFINITION object
    DEF: {
      schema:    'field_2924',  // connection -> Deliverable Schema
      label:     'field_XXXX',  // TODO: short text  "Mount Height"
      key:       'field_XXXX',  // TODO: short text  "mount_height" (locked on create)
      inputType: 'field_XXXX',  // TODO: single-select (see INPUT_TYPES)
      choices:   'field_XXXX',  // TODO: paragraph — one choice per line (select types)
      required:  'field_XXXX',  // TODO: yes/no
      sortOrder: 'field_XXXX',  // TODO: number
      active:    'field_XXXX',  // TODO: yes/no (soft delete)
      default:   'field_XXXX'   // TODO: paragraph — Default Value (literal and/or {token})
    },
    // Friendly token name -> line-item field key. Raw {field_###} also works with no entry here.
    DEFAULT_TOKENS: {
      label: 'field_XXXX'       // TODO: the camera-label field on the line item
    },
    // Input Type choice text -> widget
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
    var rows = getViewRecords(CONFIG.SCHEMA_DEF_VIEW);
    var D = CONFIG.DEF, bySchema = {};
    rows.forEach(function (rec) {
      if (!isYes(rec[D.active])) return;
      var schemaId = firstConnId(rec, D.schema);
      if (!schemaId) return;
      var type = CONFIG.INPUT_TYPES[String(rec[D.inputType] || '').trim()];
      if (!type) return;
      var def = {
        key:       String(rec[D.key] || '').trim(),
        label:     String(rec[D.label] || '').trim(),
        type:      type,
        choices:   parseChoices(rec[D.choices]),
        required:  isYes(rec[D.required]),
        sortOrder: Number(rec[D.sortOrder]) || 0,
        def:       String(rec[D.default] == null ? '' : rec[D.default]).trim()
      };
      if (!def.key) return;
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
  function loadProductSchemaMap() {
    if (!CONFIG.PRODUCT_SCHEMA_VIEW) return {};
    var map = {};
    getViewRecords(CONFIG.PRODUCT_SCHEMA_VIEW).forEach(function (rec) {
      var sid = firstConnId(rec, CONFIG.DEF.schema);
      if (rec.id && sid) map[rec.id] = sid;
    });
    return map;
  }
  function resolveSchemaId(rec, productSchemaMap) {
    if (CONFIG.LINE_ITEM_SCHEMA_FIELD) {
      var direct = firstConnId(rec, CONFIG.LINE_ITEM_SCHEMA_FIELD);
      if (direct) return direct;
    }
    var pid = CONFIG.PRODUCT_FIELD ? firstConnId(rec, CONFIG.PRODUCT_FIELD) : null;
    return pid ? (productSchemaMap[pid] || null) : null;
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
  /* ── mount: one editor per line-item row (ADAPT to your layout) ── */
  function mount(viewId) {
    var bySchema = loadSchemaFields();
    var productSchemaMap = loadProductSchemaMap();
    var records = getViewRecords(viewId);
    if (!records.length) return;
    records.forEach(function (rec) {
      var tr = document.querySelector('#' + viewId + ' tr#' + rec.id +
                                      ', #' + viewId + ' tr[data-record-id="' + rec.id + '"]');
      if (!tr) return;
      var schemaId = resolveSchemaId(rec, productSchemaMap);
      var fields = schemaId ? bySchema[schemaId] : null;
      if (!fields || !fields.length) return;
      var holderId = PREFIX + '-row-' + rec.id;
      if (document.getElementById(holderId)) return;
      var values = readValues(rec);
      var holder = document.createElement('tr');
      holder.id = holderId; holder.className = PREFIX + '-row';
      var td = document.createElement('td'); td.colSpan = (tr.children.length || 1);
      td.innerHTML = buildPanel(rec.id, rec, fields, values);
      holder.appendChild(td);
      tr.parentNode.insertBefore(holder, tr.nextSibling);
      wirePanel(holder.querySelector('.' + PREFIX + '-panel'), viewId);
    });
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
  SCW.onViewRender(CONFIG.WORKSHEET_VIEW, function () { injectCss(); mount(CONFIG.WORKSHEET_VIEW); }, NS);
})();
/*** END DELIVERABLES WORKSHEET ***/
