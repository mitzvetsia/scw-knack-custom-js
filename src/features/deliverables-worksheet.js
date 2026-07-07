/*** DELIVERABLES WORKSHEET — schema-driven install-data collection ***/
(function () {
  'use strict';
  var NS = '.scwDeliverables';
  var PREFIX = 'scw-deliverables';
  var CONFIG = {
    // The install worksheet (view_4093) is a V2 cutover: the native table is
    // hidden and worksheet-v2 renders cards. We mount the deliverables panel
    // INSIDE each v2 install card's detail panel (not the hidden native rows).
    // view_4093 = Implementation install worksheet; view_4056 = "WHAT WE'RE
    // INSTALLING" (SAME install object/fields). Mount the deliverables panel on
    // both v2 install surfaces.
    WORKSHEET_VIEWS: ['view_4093', 'view_4056'],
    // Fields on the LINE ITEM
    VALUE_FIELD:            'field_2932',   // Paragraph/Rich-Text — stores the JSON answer blob
    LINE_ITEM_SCHEMA_FIELD: 'field_2930',   // Deliverable Schema connection on the line item
    // The boot snippet emits RAW Knack records (field_XXXX / field_XXXX_raw)
    // for each Config Field Definition row, so we read the columns here.
    // Mapping inferred from a live record; adjust if a column moves. The three
    // yes/no columns are field_2926/field_2928/field_2933 — required/active are
    // two of them (field_2933 unused/unknown).
    DEF: {
      schema:    'field_2924',  // connection -> Deliverable Schema ("IP Cameras")
      label:     'field_2922',  // short text  ("OSD")
      key:       'field_2925',  // machine key ("osd") — blank falls back to slug(label)
      inputType: 'field_2923',  // "Short text" / "Single Select" … (matched case-insensitively)
      choices:   'field_2929',  // paragraph — one choice per line (select types)
      required:  'field_2926',  // yes/no
      sortOrder: 'field_2927',  // number
      active:    'field_2928',  // yes/no (soft delete)
      def:       'field_2931',  // paragraph — Default Value (literal and/or {token})
      tooltip:   'field_2938'   // paragraph — field explanation (shown under the label)
    },
    // Friendly token name -> line-item field key for {token} defaults. Empty:
    // we use raw {field_###} tokens (resolved against the worksheet model with
    // zero config). Add entries only for friendly aliases.
    DEFAULT_TOKENS: {},
    // Input Type label -> widget (matched case-insensitively; a widget type
    // passed directly also works). Synonyms included so the non-backend user
    // can pick natural Knack-style names ("Paragraph", "Dropdown", …).
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
  /* ── load schema fields grouped by schema id ── */
  /** Prefer the clean `_raw` value (string/number/bool); else strip HTML off
   *  the formatted value. Connection fields keep their array _raw — use
   *  firstConnId for those instead. */
  function rawVal(rec, fk) {
    if (!fk || !rec) return '';
    var r = rec[fk + '_raw'];
    if (typeof r === 'number' || typeof r === 'boolean' || typeof r === 'string') return r;
    var v = rec[fk];
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '');
  }
  /** Input-type label/widget -> widget, case-insensitive; passes a widget
   *  type ('text'/'select'/…) through unchanged. Unknown -> '' (skip). */
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
  /** Slug a label into a stable storage key when the key column is blank. */
  function slug(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function loadSchemaFields() {
    // Snippet emits RAW Knack records — read the Config-Field-Definition
    // columns (CONFIG.DEF) off each, group by the schema connection (field_2924).
    var rows = (window.SCW && window.SCW.deliverablesFields) || [];
    var D = CONFIG.DEF, bySchema = {};
    rows.forEach(function (rec) {
      if (!rec) return;
      var activeVal = rawVal(rec, D.active);
      if (activeVal !== '' && activeVal != null && !isYes(activeVal)) return;  // soft-deleted
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
        def:       String(rawVal(rec, D.def) || '').trim(),
        tooltip:   String(rawVal(rec, D.tooltip) || '').trim()
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
        '<div class="' + PREFIX + '-head">' +
          '<span class="' + PREFIX + '-title">System Questionnaire</span>' +
          '<span class="' + PREFIX + '-status" aria-live="polite"></span>' +
        '</div>' +
        '<div class="' + PREFIX + '-grid">' + body + '</div>' +
      '</div>';
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
  /* ── wire a mounted panel (auto-save, no Save button) ──
   * Persists the whole blob on any change: chip toggle / select change / input
   * blur (tab/click-away) / Enter. Inline Saving…→Saved feedback, a dirty-skip
   * (don't re-PUT an unchanged blob), and a pending-resave queue so an edit
   * landing mid-save still lands. */
  function wirePanel(panelEl, viewId) {
    var recordId = panelEl.getAttribute('data-record-id');
    var statusEl = panelEl.querySelector('.' + PREFIX + '-status');
    var lastSaved = JSON.stringify(collectValues(panelEl));
    var saving = false, pending = false, fadeTimer = null;

    function setStatus(kind, text) {
      statusEl.className = PREFIX + '-status' + (kind ? ' is-' + kind : '');
      statusEl.textContent = text || '';
    }
    function commit() {
      var current = JSON.stringify(collectValues(panelEl));
      if (current === lastSaved) return;          // nothing changed — skip
      if (saving) { pending = true; return; }     // queue behind the in-flight save
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

    // Multi-select chips: toggle + save.
    panelEl.addEventListener('click', function (e) {
      var chip = e.target.closest('.' + PREFIX + '-chip');
      if (!chip) return;
      var on = chip.classList.toggle('is-on');
      chip.setAttribute('aria-pressed', on);
      commit();
    });
    // Selects (Yes-No / Single Select) save on change.
    panelEl.addEventListener('change', function (e) {
      if (e.target.matches && e.target.matches('select.' + PREFIX + '-input')) commit();
    });
    // Text / number / date / textarea save on blur (tab or click-away).
    panelEl.addEventListener('blur', function (e) {
      if (e.target.matches && e.target.matches('input.' + PREFIX + '-input, textarea.' + PREFIX + '-input')) commit();
    }, true);
    // Enter commits (Shift+Enter = newline in a textarea).
    panelEl.addEventListener('keydown', function (e) {
      var t = e.target;
      if (!t.matches || !t.matches('input.' + PREFIX + '-input, textarea.' + PREFIX + '-input')) return;
      if (e.key !== 'Enter') return;
      if (t.tagName === 'TEXTAREA' && e.shiftKey) return;
      e.preventDefault();
      commit();
    });
  }
  /* ── mount: fold one editor into each v2 install card's detail panel ──
   * view_4093 is a V2 cutover — the native table is display:none and
   * worksheet-v2 renders cards (.scw-ws-v2-card[data-scw-ws-v2-record]) whose
   * collapsible body is .scw-ws-v2-detail. We mount the deliverables panel
   * there (so it follows the card accordion). worksheet-v2 rebuilds its body
   * innerHTML on every data tick, so we re-inject idempotently on a container
   * observer + staggered passes (mirrors install-config-subpanel.js). */
  function v2ContainerId(viewId) { return 'scw-ws-v2-' + viewId; }
  var _selfMutating = false;

  function v2DetailFor(recordId, viewId) {
    // Scope to the view's own v2 container so a record id present on BOTH
    // install surfaces (view_4093 + view_4056, same object) resolves to the
    // right card instead of whichever appears first in the DOM.
    var root = document.getElementById(v2ContainerId(viewId)) || document;
    var card = root.querySelector(
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
        var detail = v2DetailFor(rec.id, viewId);
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
        CONFIG.WORKSHEET_VIEWS.forEach(function (v) {
          installV2Observer(v);
          mount(v);
        });
      }, delays[i]);
    }
  }

  /** Watch the worksheet-v2 container — it swaps its body innerHTML on every
   *  data subscriber fire, wiping our panels; re-mount on any child mutation.
   *  No-op until the v2 panel exists. Ignores our own writes via _selfMutating. */
  function installV2Observer(viewId) {
    var container = document.getElementById(v2ContainerId(viewId));
    if (!container || container.__scwDeliverablesObs) return;
    var body = container.querySelector('.scw-ws-v2-body') || container;
    container.__scwDeliverablesObs = true;
    var pending = false;
    var obs = new MutationObserver(function () {
      if (_selfMutating || pending) return;
      pending = true;
      setTimeout(function () { pending = false; mount(viewId); }, 150);
    });
    obs.observe(body, { childList: true, subtree: true });
  }
  /* ── CSS ── */
  function injectCss() {
    var STYLE_ID = PREFIX + '-css';
    if (document.getElementById(STYLE_ID)) return;
    // Visual language mirrors worksheet-v2 detail fields (label #64748b,
    // inputs #e2e8f0 border, chips #295f91 selected) so it reads as part of the
    // card — but the panel keeps a distinct slate background + border so it's a
    // clearly contained sub-section.
    var css =
      '.' + PREFIX + '-panel{margin-top:10px;padding:11px 13px;background:#eef2f6;' +
        'border:1px solid #e2e8f0;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;}' +
      '.' + PREFIX + '-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;}' +
      '.' + PREFIX + '-title{font:700 10.5px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:#0f4c75;}' +
      '.' + PREFIX + '-status{font:600 11px/1.2 system-ui,sans-serif;color:#94a3b8;min-height:13px;}' +
      '.' + PREFIX + '-status.is-saving{color:#2563eb;}' +
      '.' + PREFIX + '-status.is-ok{color:#15803d;}' +
      '.' + PREFIX + '-status.is-err{color:#b91c1c;}' +
      '.' + PREFIX + '-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:9px 14px;}' +
      '.' + PREFIX + '-field{display:flex;flex-direction:column;gap:3px;min-width:0;}' +
      /* Long-text / paragraph fields span the full panel width. */
      '.' + PREFIX + '-field[data-type="textarea"]{grid-column:1/-1;}' +
      '.' + PREFIX + '-label{font:500 11px/1.2 system-ui,sans-serif;color:#64748b;}' +
      '.' + PREFIX + '-req{color:#b45309;margin-left:2px;}' +
      '.' + PREFIX + '-input{display:block;width:100%;box-sizing:border-box;padding:4px 7px;' +
        'border:1px solid #e2e8f0;border-radius:4px;background:#fff;font:13px/1.3 system-ui,sans-serif;' +
        'color:#1f2937;min-height:28px;transition:border-color .1s,box-shadow .1s;}' +
      '.' + PREFIX + '-input:focus{outline:none;border-color:#93c5fd;box-shadow:0 0 0 2px rgba(59,130,246,.14);}' +
      'textarea.' + PREFIX + '-input{min-height:46px;resize:vertical;}' +
      '.' + PREFIX + '-chips{display:flex;flex-wrap:wrap;gap:4px;}' +
      '.' + PREFIX + '-chip{font:600 11px/1.2 system-ui,sans-serif;padding:4px 10px;border:1px solid #cbd5e1;' +
        'border-radius:6px;background:#fff;color:#475569;cursor:pointer;white-space:nowrap;transition:all .1s;}' +
      '.' + PREFIX + '-chip:hover{border-color:#94a3b8;}' +
      '.' + PREFIX + '-chip.is-on{background:#295f91;border-color:#295f91;color:#fff;}';
    var style = document.createElement('style'); style.id = STYLE_ID; style.textContent = css;
    document.head.appendChild(style);
  }
  /* ── bind ── */
  CONFIG.WORKSHEET_VIEWS.forEach(function (wv) {
    SCW.onViewRender(wv, function () {
      injectCss();
      installV2Observer(wv);
      stagger();
    }, NS);
  });

  /* ── diagnostic: run SCW.deliverablesDebug() in the console to see which
   * gate is failing (snippet global ready? field_2930 on the model? schema
   * matched?) + a per-config-row kept/DROPPED table. Silent unless called. */
  window.SCW = window.SCW || {};
  window.SCW.deliverablesDebug = function () {
    var g = window.SCW && window.SCW.deliverablesFields;
    var bySchema = loadSchemaFields();
    var schemaIds = Object.keys(bySchema);
    var records = [];
    CONFIG.WORKSHEET_VIEWS.forEach(function (v) { records = records.concat(getViewRecords(v)); });
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
    // Per-config-row breakdown: why each Config Field Definition row is kept or
    // dropped by loadSchemaFields. Use this to see why one field (e.g.
    // client-notes-ac-entry) doesn't render while its siblings do.
    var D = CONFIG.DEF;
    info.rows = (g || []).map(function (rec) {
      var label    = String(rawVal(rec, D.label) || '').trim();
      var key      = String(rawVal(rec, D.key) || '').trim() || slug(label);
      var inputRaw = String(rawVal(rec, D.inputType) || '');
      var type     = inputTypeWidget(inputRaw);
      var schemaId = firstConnId(rec, D.schema);
      var activeVal = rawVal(rec, D.active);
      var active   = !(activeVal !== '' && activeVal != null && !isYes(activeVal));
      var reason = 'kept';
      if (!active)        reason = 'DROPPED: inactive (' + D.active + ' = No)';
      else if (!schemaId) reason = 'DROPPED: no schema (' + D.schema + ' empty)';
      else if (!type)     reason = 'DROPPED: unknown Input Type "' + inputRaw + '"';
      else if (!key)      reason = 'DROPPED: no key/label';
      return { label: label, key: key, inputType: inputRaw, mappedType: type,
        schemaId: schemaId, active: active, reason: reason };
    });
    if (window.console) {
      console.log('[scw-deliverables] debug', info);
      if (console.table) console.table(info.rows);
    }
    return info;
  };

  // Reusable API so other surfaces (e.g. worksheet-v2 bulk edit) can render +
  // save the same questionnaire fields without duplicating the schema logic.
  // Uses the INTERNAL field set (all active fields, no customer flag).
  window.SCW.deliverables = {
    schemaFieldsById: loadSchemaFields,        // -> { schemaId: [def, …] }
    schemaIdOf: function (rec) { return firstConnId(rec, CONFIG.LINE_ITEM_SCHEMA_FIELD); },
    readValues: readValues,                    // (rec) -> answers blob object
    renderField: renderField,                  // (def, value) -> field HTML
    coerceDefault: coerceDefault,              // (def, rec) -> default value
    classPrefix: PREFIX,                       // 'scw-deliverables' (for value reads)
    valueField: CONFIG.VALUE_FIELD,            // field_2932
    ready: function () { return !!(window.SCW && window.SCW.deliverablesFieldsReady); }
  };
})();
/*** END DELIVERABLES WORKSHEET ***/
