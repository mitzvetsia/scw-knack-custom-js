/*** CUSTOMER QUESTIONNAIRE — customer-facing schema-driven answers ***
 *
 * Sibling of deliverables-worksheet.js, but for the CUSTOMER. Same schema
 * source (the boot snippet's window.SCW.deliverablesFields) and same answer
 * blob (field_2932 on the line item), with two differences:
 *   1. Only fields flagged "included on questionnaire" (field_2933 = Yes) show.
 *   2. It runs on a plain Knack grid (not worksheet-v2 cards). We hide the
 *      native table and render one always-open card per line item with the
 *      questionnaire fields inline (no collapse — there are only a few).
 *
 * Schema resolves per line item from field_2930; answers save to field_2932.
 ****************************************************************************/
(function () {
  'use strict';
  var NS = '.scwCustQ';
  var PREFIX = 'scw-cq';
  var CONFIG = {
    WORKSHEET_VIEW:  'view_4031',   // the customer questionnaire grid view
    // Fields on the LINE ITEM
    VALUE_FIELD:            'field_2932',   // JSON answer blob
    LINE_ITEM_SCHEMA_FIELD: 'field_2930',   // Deliverable Schema connection
    LABEL_FIELD:            'field_2801',   // LABEL_set label by bucket ("AC-01") — card title
    PRODUCT_FIELD:          'field_2790',   // PRODUCT STORED_name — card subtitle
    // Config Field Definition columns (read off the raw snippet records).
    DEF: {
      schema:    'field_2924',  // connection -> Deliverable Schema
      label:     'field_2922',  // short text  ("OSD")
      key:       'field_2925',  // machine key ("osd") — blank -> slug(label)
      inputType: 'field_2923',  // "Short text" / "Single Select" … (case-insensitive)
      choices:   'field_2929',  // paragraph — one choice per line
      required:  'field_2926',  // yes/no
      sortOrder: 'field_2927',  // number
      active:    'field_2928',  // yes/no (soft delete)
      def:       'field_2931'   // paragraph — Default Value (literal and/or {token})
    },
    CUSTOMER_FLAG: 'field_2933', // INPUT_included on questionnaire (Yes = show to customer)
    // Friendly token name -> line-item field key for {token} defaults. Empty:
    // raw {field_###} tokens resolve against this view's model with no config.
    DEFAULT_TOKENS: {},
    INPUT_TYPES: {
      'Short Text': 'text', 'Text': 'text',
      'Long Text': 'textarea', 'Paragraph': 'textarea', 'Paragraph Text': 'textarea', 'Rich Text': 'textarea',
      'Number': 'number',
      'Yes-No': 'yesno', 'Yes/No': 'yesno', 'Boolean': 'yesno',
      'Single Select': 'select', 'Dropdown': 'select',
      'Multi Select': 'multiselect', 'Multi-Select': 'multiselect',
      'Date': 'date'
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
  function rawVal(rec, fk) {
    if (!fk || !rec) return '';
    var r = rec[fk + '_raw'];
    if (typeof r === 'number' || typeof r === 'boolean' || typeof r === 'string') return r;
    var v = rec[fk];
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '');
  }
  function isYes(v) {
    if (v === true) return true;
    return /^(yes|true|on|1)$/i.test(String(v == null ? '' : v).trim());
  }
  function parseChoices(v) {
    return String(v == null ? '' : v).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function inputTypeWidget(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    var keys = Object.keys(CONFIG.INPUT_TYPES);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === s.toLowerCase()) return CONFIG.INPUT_TYPES[keys[i]];
    }
    var widgets = { text: 1, textarea: 1, number: 1, yesno: 1, select: 1, multiselect: 1, date: 1 };
    return widgets[s.toLowerCase()] ? s.toLowerCase() : '';
  }
  function slug(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  /* ── load schema fields grouped by schema id — CUSTOMER subset only ── */
  function loadSchemaFields() {
    var rows = (window.SCW && window.SCW.deliverablesFields) || [];
    var D = CONFIG.DEF, bySchema = {};
    rows.forEach(function (rec) {
      if (!rec) return;
      var activeVal = rawVal(rec, D.active);
      if (activeVal !== '' && activeVal != null && !isYes(activeVal)) return;  // soft-deleted
      if (!isYes(rawVal(rec, CONFIG.CUSTOMER_FLAG))) return;                   // not on customer questionnaire
      var schemaId = firstConnId(rec, D.schema);
      if (!schemaId) return;
      var type = inputTypeWidget(rawVal(rec, D.inputType));
      if (!type) return;
      var label = String(rawVal(rec, D.label) || '').trim();
      var key   = String(rawVal(rec, D.key) || '').trim() || slug(label);
      if (!key) return;
      var def = {
        key:       key,
        label:     label,
        type:      type,
        choices:   parseChoices(rawVal(rec, D.choices)),
        required:  isYes(rawVal(rec, D.required)),
        sortOrder: Number(rawVal(rec, D.sortOrder)) || 0,
        def:       String(rawVal(rec, D.def) || '').trim()
      };
      (bySchema[schemaId] = bySchema[schemaId] || []).push(def);
    });
    Object.keys(bySchema).forEach(function (sid) {
      bySchema[sid].sort(function (a, b) {
        return (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label);
      });
    });
    if (CONFIG.debug) SCW.log('[' + PREFIX + '] customer fields', bySchema);
    return bySchema;
  }

  /* ── value blob + defaults ── */
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
    var id = PREFIX + '-' + def.key + '-' + Math.random().toString(36).slice(2, 7);
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
  function buildCard(rec, fields, values) {
    var labelTxt   = String(rawVal(rec, CONFIG.LABEL_FIELD) || '').trim();
    var productTxt = String(rawVal(rec, CONFIG.PRODUCT_FIELD) || '').trim();
    var title = labelTxt || productTxt || 'Item';
    var sub   = (labelTxt && productTxt) ? productTxt : '';
    var body = fields.map(function (def) {
      var v = Object.prototype.hasOwnProperty.call(values, def.key) ? values[def.key] : coerceDefault(def, rec);
      return renderField(def, v);
    }).join('');
    return '<div class="' + PREFIX + '-card" data-record-id="' + esc(rec.id) + '">' +
        '<div class="' + PREFIX + '-card-head">' +
          '<div class="' + PREFIX + '-card-titles">' +
            '<span class="' + PREFIX + '-card-title">' + esc(title) + '</span>' +
            (sub ? '<span class="' + PREFIX + '-card-sub">' + esc(sub) + '</span>' : '') +
          '</div>' +
          '<span class="' + PREFIX + '-status" aria-live="polite"></span>' +
        '</div>' +
        '<div class="' + PREFIX + '-grid">' + body + '</div>' +
      '</div>';
  }
  function collectValues(cardEl) {
    var out = {};
    cardEl.querySelectorAll('[data-key]').forEach(function (el) {
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

  /* ── wire a card (auto-save, no Save button) ── */
  function wireCard(cardEl, viewId) {
    var recordId = cardEl.getAttribute('data-record-id');
    var statusEl = cardEl.querySelector('.' + PREFIX + '-status');
    var lastSaved = JSON.stringify(collectValues(cardEl));
    var saving = false, pending = false, fadeTimer = null;

    function setStatus(kind, text) {
      statusEl.className = PREFIX + '-status' + (kind ? ' is-' + kind : '');
      statusEl.textContent = text || '';
    }
    function commit() {
      var current = JSON.stringify(collectValues(cardEl));
      if (current === lastSaved) return;
      if (saving) { pending = true; return; }
      saving = true;
      setStatus('saving', 'Saving…');
      save(viewId, recordId, JSON.parse(current), function (ok, msg) {
        saving = false;
        if (!ok) { setStatus('err', msg || 'Save failed'); pending = false; return; }
        lastSaved = current;
        if (pending) { pending = false; commit(); return; }
        setStatus('ok', 'Saved');
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function () { setStatus('', ''); }, 1500);
      });
    }

    cardEl.addEventListener('click', function (e) {
      var chip = e.target.closest('.' + PREFIX + '-chip');
      if (!chip) return;
      var on = chip.classList.toggle('is-on');
      chip.setAttribute('aria-pressed', on);
      commit();
    });
    cardEl.addEventListener('change', function (e) {
      if (e.target.matches && e.target.matches('select.' + PREFIX + '-input')) commit();
    });
    cardEl.addEventListener('blur', function (e) {
      if (e.target.matches && e.target.matches('input.' + PREFIX + '-input, textarea.' + PREFIX + '-input')) commit();
    }, true);
    cardEl.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t.matches || !t.matches('input.' + PREFIX + '-input, textarea.' + PREFIX + '-input')) return;
      if (e.key !== 'Enter') return;
      if (t.tagName === 'TEXTAREA' && e.shiftKey) return;
      e.preventDefault();
      commit();
    });
  }

  /* ── render: hide native table, render a card per line item ── */
  function ensureContainer(viewEl, viewId) {
    var id = PREFIX + '-' + viewId;
    var c = document.getElementById(id);
    if (!c) {
      c = document.createElement('div');
      c.id = id;
      c.className = PREFIX + '-panel';
      var table = viewEl.querySelector('.kn-table-wrapper') || viewEl.querySelector('table.kn-table') || viewEl;
      if (table && table.parentNode) table.parentNode.insertBefore(c, table.nextSibling);
      else viewEl.appendChild(c);
    }
    return c;
  }

  function render(viewId) {
    // Boot-race guard (snippet fetch may still be in flight on cold load).
    if (!(window.SCW && window.SCW.deliverablesFieldsReady)) {
      if (render._tries == null) render._tries = 0;
      if (render._tries++ < 20) { setTimeout(function () { render(viewId); }, 300); }
      return;
    }
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;
    var bySchema = loadSchemaFields();
    var records = getViewRecords(viewId);
    var container = ensureContainer(viewEl, viewId);

    var any = false;
    records.forEach(function (rec) {
      var schemaId = firstConnId(rec, CONFIG.LINE_ITEM_SCHEMA_FIELD);
      var fields = schemaId ? bySchema[schemaId] : null;
      var existing = container.querySelector('.' + PREFIX + '-card[data-record-id="' + rec.id + '"]');
      if (!fields || !fields.length) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        return;
      }
      any = true;
      if (existing) return;   // keep mounted cards (preserve in-progress answers)
      var values = readValues(rec);
      var holder = document.createElement('div');
      holder.innerHTML = buildCard(rec, fields, values);
      var card = holder.firstChild;
      container.appendChild(card);
      wireCard(card, viewId);
    });

    // Empty-state placeholder when nothing has customer questions.
    var empty = container.querySelector('.' + PREFIX + '-empty');
    if (!any && !container.querySelector('.' + PREFIX + '-card')) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = PREFIX + '-empty';
        empty.textContent = 'No questions to answer at this time.';
        container.appendChild(empty);
      }
    } else if (empty) {
      empty.parentNode.removeChild(empty);
    }
  }

  /* ── CSS ── */
  function injectCss() {
    var STYLE_ID = PREFIX + '-css';
    if (document.getElementById(STYLE_ID)) return;
    var css =
      // Hide the native grid — we render cards instead.
      '#' + CONFIG.WORKSHEET_VIEW + ' .kn-table-wrapper,' +
      '#' + CONFIG.WORKSHEET_VIEW + ' table.kn-table{display:none !important;}' +
      '.' + PREFIX + '-panel{display:flex;flex-direction:column;gap:14px;margin:10px 0;' +
        'font-family:system-ui,-apple-system,sans-serif;}' +
      '.' + PREFIX + '-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;' +
        'box-shadow:0 1px 2px rgba(15,23,42,.04);padding:16px 18px;}' +
      '.' + PREFIX + '-card-head{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;' +
        'padding-bottom:10px;border-bottom:1px solid #eef2f6;}' +
      '.' + PREFIX + '-card-titles{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1 1 auto;}' +
      '.' + PREFIX + '-card-title{font:700 15px/1.2 system-ui,sans-serif;color:#0f4c75;}' +
      '.' + PREFIX + '-card-sub{font:500 12px/1.2 system-ui,sans-serif;color:#64748b;}' +
      '.' + PREFIX + '-status{font:600 11px/1.2 system-ui,sans-serif;color:#94a3b8;flex:0 0 auto;}' +
      '.' + PREFIX + '-status.is-saving{color:#2563eb;}' +
      '.' + PREFIX + '-status.is-ok{color:#15803d;}' +
      '.' + PREFIX + '-status.is-err{color:#b91c1c;}' +
      '.' + PREFIX + '-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px 18px;}' +
      '.' + PREFIX + '-field{display:flex;flex-direction:column;gap:4px;min-width:0;}' +
      '.' + PREFIX + '-field[data-type="textarea"]{grid-column:1/-1;}' +
      '.' + PREFIX + '-label{font:600 12px/1.3 system-ui,sans-serif;color:#374151;}' +
      '.' + PREFIX + '-req{color:#b45309;margin-left:2px;}' +
      '.' + PREFIX + '-input{display:block;width:100%;box-sizing:border-box;padding:7px 9px;' +
        'border:1px solid #cbd5e1;border-radius:6px;background:#fff;font:14px/1.35 system-ui,sans-serif;' +
        'color:#1f2937;min-height:36px;transition:border-color .1s,box-shadow .1s;}' +
      '.' + PREFIX + '-input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.14);}' +
      'textarea.' + PREFIX + '-input{min-height:64px;resize:vertical;}' +
      '.' + PREFIX + '-chips{display:flex;flex-wrap:wrap;gap:6px;}' +
      '.' + PREFIX + '-chip{font:600 13px/1.2 system-ui,sans-serif;padding:7px 13px;border:1px solid #cbd5e1;' +
        'border-radius:999px;background:#fff;color:#374151;cursor:pointer;transition:all .1s;}' +
      '.' + PREFIX + '-chip:hover{border-color:#94a3b8;}' +
      '.' + PREFIX + '-chip.is-on{background:#2563eb;border-color:#2563eb;color:#fff;}' +
      '.' + PREFIX + '-empty{padding:24px;text-align:center;color:#94a3b8;font:500 13px system-ui,sans-serif;}';
    var style = document.createElement('style'); style.id = STYLE_ID; style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── bind ── */
  SCW.onViewRender(CONFIG.WORKSHEET_VIEW, function () {
    injectCss();
    render(CONFIG.WORKSHEET_VIEW);
  }, NS);

  /* ── diagnostic (silent unless called) ── */
  window.SCW = window.SCW || {};
  window.SCW.customerQDebug = function () {
    var g = window.SCW && window.SCW.deliverablesFields;
    var bySchema = loadSchemaFields();
    var records = getViewRecords(CONFIG.WORKSHEET_VIEW);
    var info = {
      globalLength: (g && g.length) || 0,
      ready: !!(window.SCW && window.SCW.deliverablesFieldsReady),
      customerSchemaCount: Object.keys(bySchema).length,
      customerSchemaIds: Object.keys(bySchema),
      records: records.length,
      matched: 0
    };
    records.forEach(function (rec) {
      var sid = firstConnId(rec, CONFIG.LINE_ITEM_SCHEMA_FIELD);
      if (sid && bySchema[sid]) info.matched++;
    });
    if (window.console) console.log('[' + PREFIX + '] debug', info);
    return info;
  };
})();
/*** END CUSTOMER QUESTIONNAIRE ***/
