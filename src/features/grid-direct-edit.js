/*** GRID DIRECT-EDIT — type-and-save inputs for standard Knack grids ***/
(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────
  var CONFIG = {
    views: ['view_32']
  };

  // Field types eligible for direct-edit (Knack type keys)
  var EDITABLE_TYPES = [
    'short_text', 'paragraph_text', 'number', 'currency',
    'rich_text', 'equation'  // equation included read-only in Knack but often editable via API
  ];

  // Field types to explicitly skip
  var SKIP_TYPES = [
    'multiple_choice', 'boolean', 'connection', 'image',
    'file', 'date_time', 'timer', 'auto_increment',
    'signature', 'address', 'phone', 'email', 'link', 'rating'
  ];

  var PREFIX = 'scw-gde';
  var EDIT_ATTR = 'data-scw-grid-edit';
  var STYLE_ID = PREFIX + '-css';
  var OBSERVER_KEY = 'scwGdeObs';

  // ── CSS ────────────────────────────────────────────────────────
  var CSS = '\
td.' + PREFIX + '-cell {\
  position: relative;\
  padding: 0 !important;\
  pointer-events: none;\
}\
td.' + PREFIX + '-cell .' + PREFIX + '-input,\
td.' + PREFIX + '-cell .' + PREFIX + '-textarea {\
  pointer-events: auto;\
}\
td.' + PREFIX + '-cell > .kn-value,\
td.' + PREFIX + '-cell > span {\
  display: none !important;\
}\
.' + PREFIX + '-input,\
.' + PREFIX + '-textarea {\
  width: 100%;\
  box-sizing: border-box;\
  border: 1px solid #ddd;\
  border-radius: 3px;\
  padding: 4px 6px;\
  font-size: 13px;\
  font-family: inherit;\
  background: #fff;\
  outline: none;\
  transition: border-color 0.15s, background-color 0.15s;\
}\
.' + PREFIX + '-input {\
  height: 30px;\
}\
.' + PREFIX + '-textarea {\
  resize: vertical;\
  min-height: 30px;\
  line-height: 1.3;\
  white-space: pre-wrap;\
  word-wrap: break-word;\
}\
.' + PREFIX + '-input:focus,\
.' + PREFIX + '-textarea:focus {\
  border-color: #4a90d9;\
  background: #fff;\
}\
.' + PREFIX + '-input.is-saving,\
.' + PREFIX + '-textarea.is-saving {\
  background: #e8f5e9;\
  border-color: #4caf50;\
}\
.' + PREFIX + '-input.is-error,\
.' + PREFIX + '-textarea.is-error {\
  background: #fdecea;\
  border-color: #f44336;\
}\
.' + PREFIX + '-error {\
  position: absolute;\
  top: 100%;\
  left: 0;\
  white-space: nowrap;\
  z-index: 10;\
  background: #fff;\
  color: #c62828;\
  font-size: 11px;\
  padding: 2px 6px;\
  border-radius: 2px;\
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);\
}\
';

  // ── Inject styles ──────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  // ── Look up a field's type from Knack.objects ───────────────────
  function getFieldType(fieldKey) {
    if (typeof Knack === 'undefined' || !Knack.objects) return null;
    var objects = Knack.objects;
    // Knack.objects may be a keyed hash or an array
    if (!Array.isArray(objects)) {
      objects = Object.keys(objects).map(function (k) { return objects[k]; });
    }
    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      if (!obj || !obj.fields || !Array.isArray(obj.fields)) continue;
      for (var j = 0; j < obj.fields.length; j++) {
        if (obj.fields[j] && obj.fields[j].key === fieldKey) return obj.fields[j].type;
      }
    }
    return null;
  }

  // ── Detect which fields are editable ───────────────────────────
  function getEditableFields(viewId) {
    var fields = [];
    var seen = {};
    try {
      // Strategy 1: try Knack.views columns metadata
      var view = Knack.views[viewId];
      if (view && view.model && view.model.view) {
        var columns = view.model.view.columns || [];
        columns.forEach(function (col) {
          var key = col.field ? col.field.key : (col.id || '');
          if (!key || seen[key]) return;
          var type = (col.field && col.field.type) ? col.field.type : getFieldType(key);
          if (!type) return;
          if (SKIP_TYPES.indexOf(type) !== -1) return;
          if (EDITABLE_TYPES.indexOf(type) !== -1) {
            seen[key] = true;
            fields.push({
              key: key,
              type: type,
              multiline: (type === 'paragraph_text' || type === 'rich_text')
            });
          }
        });
      }

      // Strategy 2: if no fields found, scan DOM for td[data-field-key] and look up types
      if (!fields.length) {
        var viewEl = document.getElementById(viewId);
        if (viewEl) {
          var firstRow = viewEl.querySelector('table.kn-table tbody tr[id]');
          if (firstRow) {
            var tds = firstRow.querySelectorAll('td[data-field-key]');
            for (var t = 0; t < tds.length; t++) {
              var key = tds[t].getAttribute('data-field-key');
              if (!key || seen[key]) continue;
              var type = getFieldType(key);
              if (!type) continue; // skip unknown fields — no guessing
              if (SKIP_TYPES.indexOf(type) !== -1) continue;
              if (EDITABLE_TYPES.indexOf(type) !== -1) {
                seen[key] = true;
                fields.push({
                  key: key,
                  type: type,
                  multiline: (type === 'paragraph_text' || type === 'rich_text')
                });
              }
            }
          }
        }
      }

      console.log('[' + PREFIX + '] Detected fields for ' + viewId + ':', fields.map(function(f) { return f.key + '(' + f.type + ')'; }).join(', '));
    } catch (e) {
      console.warn('[' + PREFIX + '] Could not read columns for ' + viewId, e);
    }
    return fields;
  }

  // ── Determine if a field is a number type ──────────────────────
  function isNumberType(type) {
    return type === 'number' || type === 'currency' || type === 'equation';
  }

  // ── Read cell text ─────────────────────────────────────────────
  function readCellText(td) {
    if (!td) return '';
    // Try kn-value span first
    var span = td.querySelector('.kn-value');
    if (span) return (span.textContent || '').replace(/[\u00a0]/g, ' ').trim();
    return (td.textContent || '').replace(/[\u00a0]/g, ' ').trim();
  }

  // ── Get record ID from table row ──────────────────────────────
  function getRecordId(tr) {
    // Knack grid rows: <tr id="5abcdef1234567890abcdef">
    return (tr && tr.id) ? tr.id : null;
  }

  // ── Parse Knack error ─────────────────────────────────────────
  function parseKnackError(xhr) {
    try {
      var body = JSON.parse(xhr.responseText || '{}');
      if (body.errors && body.errors.length) {
        return body.errors.map(function (e) { return e.message || e; }).join('; ');
      }
      if (body.message) return body.message;
    } catch (ignored) {}
    return 'Save failed';
  }

  // ── Save value via Knack API ──────────────────────────────────
  function saveValue(viewId, recordId, fieldKey, value, onSuccess, onError) {
    if (typeof Knack === 'undefined') return;

    var data = {};
    data[fieldKey] = value;

    // Prefer model.updateRecord — no re-render
    var view = Knack.views[viewId];
    if (view && view.model && typeof view.model.updateRecord === 'function') {
      view.model.updateRecord(recordId, data);
      if (onSuccess) onSuccess(null);
      return;
    }

    // Fallback: direct AJAX PUT
    $.ajax({
      url: Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
           '/views/' + viewId + '/records/' + recordId,
      type: 'PUT',
      headers: {
        'X-Knack-Application-Id': Knack.application_id,
        'x-knack-rest-api-key': 'knack',
        'Authorization': Knack.getUserToken()
      },
      contentType: 'application/json',
      data: JSON.stringify(data),
      success: function (resp) { if (onSuccess) onSuccess(resp); },
      error: function (xhr) {
        var msg = parseKnackError(xhr);
        console.warn('[' + PREFIX + '] Save failed for ' + recordId, xhr.responseText);
        if (onError) onError(msg);
      }
    });
  }

  // ── Visual feedback helpers ────────────────────────────────────
  function showSuccess(input) {
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    var wrapper = input.closest('td');
    var errEl = wrapper ? wrapper.querySelector('.' + PREFIX + '-error') : null;
    if (errEl) errEl.remove();
    setTimeout(function () { input.classList.remove('is-saving'); }, 600);
  }

  function showError(input, message, previousValue) {
    input.classList.remove('is-saving');
    input.classList.add('is-error');
    input.value = previousValue;
    input._scwPrev = previousValue;

    var wrapper = input.closest('td');
    var existing = wrapper ? wrapper.querySelector('.' + PREFIX + '-error') : null;
    if (existing) existing.remove();

    var errEl = document.createElement('div');
    errEl.className = PREFIX + '-error';
    errEl.textContent = message;
    if (wrapper) wrapper.appendChild(errEl);

    setTimeout(function () {
      input.classList.remove('is-error');
      if (errEl.parentNode) errEl.remove();
    }, 4000);
  }

  // ── Handle save ────────────────────────────────────────────────
  function handleSave(input) {
    var fieldKey = input.getAttribute('data-field') || '';
    var fieldType = input.getAttribute('data-field-type') || '';
    var newValue = input.value;
    var previousValue = input._scwPrev || '';

    // Client-side number validation
    if (isNumberType(fieldType)) {
      var trimmed = newValue.trim().replace(/[$,]/g, '');
      if (trimmed !== '' && isNaN(Number(trimmed))) {
        showError(input, 'Please enter a number', previousValue);
        return;
      }
    }

    input._scwPrev = newValue;
    input.classList.remove('is-error');
    input.classList.add('is-saving');
    var wrapper = input.closest('td');
    var errEl = wrapper ? wrapper.querySelector('.' + PREFIX + '-error') : null;
    if (errEl) errEl.remove();

    // Find record ID and view ID
    var tr = input.closest('tr');
    var recordId = getRecordId(tr);
    var viewEl = input.closest('[id^="view_"]');
    var viewId = viewEl ? viewEl.id : null;

    if (recordId && viewId) {
      saveValue(viewId, recordId, fieldKey, newValue,
        function () { showSuccess(input); },
        function (msg) { showError(input, msg, previousValue); }
      );
    }
  }

  // ── Inject inputs into a single view ──────────────────────────
  function enhanceView(viewId) {
    var $view = document.getElementById(viewId);
    if (!$view) return;

    var editableFields = getEditableFields(viewId);
    if (!editableFields.length) {
      console.log('[' + PREFIX + '] No editable fields found for ' + viewId);
      return;
    }

    var rows = $view.querySelectorAll('table.kn-table tbody tr');
    if (!rows.length) return;

    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      if (!tr.id) continue; // skip non-record rows

      for (var f = 0; f < editableFields.length; f++) {
        var field = editableFields[f];
        var td = tr.querySelector('td[data-field-key="' + field.key + '"]');
        if (!td || td.classList.contains(PREFIX + '-cell')) continue; // already enhanced

        var currentVal = readCellText(td);
        td.classList.add(PREFIX + '-cell');
        // Remove Knack's inline-edit trigger so it doesn't intercept clicks
        td.classList.remove('cell-edit');

        var input;
        if (field.multiline) {
          input = document.createElement('textarea');
          input.className = PREFIX + '-textarea';
          input.value = currentVal;
          input.rows = 2;
        } else {
          input = document.createElement('input');
          input.type = 'text';
          input.className = PREFIX + '-input';
          input.value = currentVal;
        }

        input.setAttribute('data-field', field.key);
        input.setAttribute('data-field-type', field.type);
        input.setAttribute(EDIT_ATTR, '1');
        input._scwPrev = currentVal;

        td.appendChild(input);
      }
    }

    console.log('[' + PREFIX + '] Enhanced ' + viewId + ' with ' + editableFields.length + ' direct-edit fields');
  }

  // ── MutationObserver for re-render handling ────────────────────
  function installObserver(viewId) {
    var viewEl = document.getElementById(viewId);
    if (!viewEl) return;
    if (viewEl.dataset[OBSERVER_KEY]) return; // already observing
    viewEl.dataset[OBSERVER_KEY] = '1';

    var debounceTimer;
    var obs = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { enhanceView(viewId); }, 150);
    });

    obs.observe(viewEl, { childList: true, subtree: true });
  }

  // ── Global event handlers (capture phase) ─────────────────────

  // Keydown: Enter saves, Escape reverts
  document.addEventListener('keydown', function (e) {
    var target = e.target;
    if (!target.hasAttribute(EDIT_ATTR)) return;

    if (e.key === 'Enter') {
      if (target.tagName === 'TEXTAREA' && e.shiftKey) return; // Shift+Enter = newline
      e.preventDefault();
      e.stopPropagation();
      target._scwJustSaved = true;
      handleSave(target);
      target.blur();
    }

    if (e.key === 'Escape') {
      target._scwJustSaved = true;
      target.value = target._scwPrev || '';
      target.blur();
    }
  }, true);

  // Blur: auto-save if value changed
  document.addEventListener('focusout', function (e) {
    var target = e.target;
    if (!target.hasAttribute(EDIT_ATTR)) return;

    if (target._scwJustSaved) {
      target._scwJustSaved = false;
      return;
    }

    if (target.value !== (target._scwPrev || '')) {
      handleSave(target);
    }
  }, true);

  // Block Knack inline-edit on our inputs
  document.addEventListener('click', function (e) {
    if (e.target.hasAttribute(EDIT_ATTR)) e.stopPropagation();
  }, true);
  document.addEventListener('mousedown', function (e) {
    if (e.target.hasAttribute(EDIT_ATTR)) e.stopPropagation();
  }, true);

  // ── Bind to view renders ──────────────────────────────────────
  CONFIG.views.forEach(function (viewId) {
    $(document).on('knack-view-render.' + viewId + '.scwGridDirectEdit', function (event, view) {
      injectStyles();
      enhanceView(viewId);
      installObserver(viewId);
    });
  });

  console.log('[' + PREFIX + '] Grid direct-edit module loaded for: ' + CONFIG.views.join(', '));
})();
