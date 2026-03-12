/*** GRID DIRECT-EDIT — type-and-save inputs for standard Knack grids ***/
(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────
  var CONFIG = {
    // viewId → array of { key, number?, multiline? }
    'view_32': [
      { key: 'field_32' },
      { key: 'field_960' },
      { key: 'field_98' },
      { key: 'field_409' },
      { key: 'field_1721' },
      { key: 'field_1730' },
      { key: 'field_12' },
      { key: 'field_1734', number: true }
    ]
  };

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

  // ── Get configured fields for a view ─────────────────────────
  function getFields(viewId) {
    return CONFIG[viewId] || [];
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
    var newValue = input.value;
    var previousValue = input._scwPrev || '';

    // Client-side number validation
    if (input.hasAttribute('data-number')) {
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

    var fields = getFields(viewId);
    if (!fields.length) {
      console.log('[' + PREFIX + '] No fields configured for ' + viewId);
      return;
    }

    var rows = $view.querySelectorAll('table.kn-table tbody tr');
    if (!rows.length) return;

    for (var r = 0; r < rows.length; r++) {
      var tr = rows[r];
      if (!tr.id) continue; // skip non-record rows

      for (var f = 0; f < fields.length; f++) {
        var field = fields[f];
        var td = tr.querySelector('td[data-field-key="' + field.key + '"]');
        if (!td || td.classList.contains(PREFIX + '-cell')) continue; // already enhanced

        var currentVal = readCellText(td);
        td.classList.add(PREFIX + '-cell');
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
        if (field.number) input.setAttribute('data-number', '1');
        input.setAttribute(EDIT_ATTR, '1');
        input._scwPrev = currentVal;

        td.appendChild(input);
      }
    }

    console.log('[' + PREFIX + '] Enhanced ' + viewId + ' with ' + fields.length + ' direct-edit fields');
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
  var VIEW_IDS = Object.keys(CONFIG);
  VIEW_IDS.forEach(function (viewId) {
    $(document).on('knack-view-render.' + viewId + '.scwGridDirectEdit', function (event, view) {
      injectStyles();
      enhanceView(viewId);
      installObserver(viewId);
    });
  });

  console.log('[' + PREFIX + '] Grid direct-edit module loaded for: ' + VIEW_IDS.join(', '));
})();
