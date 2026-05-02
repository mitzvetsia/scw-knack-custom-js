/*** FILTER INLINE-EDIT MDF/IDF OPTIONS BY ANOTHER VIEW'S MODEL ***/
/**
 * Constrains the inline-edit popover for field_2375 (MDF/IDF) on
 * view_3505 to the set of records currently rendered by view_3617
 * (the survey's MDF/IDF list view that lives on the same scene).
 *
 * Mirrors the filter-products-by-bucket.js pattern: capture the click,
 * poll for the popover's <select>, hide options whose IDs aren't in the
 * source view's model, refresh Chosen.
 */
(function () {
  'use strict';

  var LOG_PREFIX = '[scwMdfIdfFilter]';

  var CONFIG = {
    TARGET_VIEW:    'view_3505',
    TARGET_FIELD:   'field_2375',
    SOURCE_VIEW:    'view_3617',
    POLL_INTERVAL:  200,
    POLL_MAX:       6000,
    DEBUG:          false
  };

  var _pollTimer = null;

  function log() {
    if (!CONFIG.DEBUG || !window.console) return;
    var args = [LOG_PREFIX].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  // ── Read the allowed record-id set from the source view's model ──
  function getAllowedIds() {
    if (typeof Knack === 'undefined' || !Knack.views) return null;
    var view = Knack.views[CONFIG.SOURCE_VIEW];
    if (!view || !view.model) return null;
    var records = (view.model.data && view.model.data.models) || view.model.models || [];
    if (!records.length) return null;
    var ids = {};
    for (var i = 0; i < records.length; i++) {
      var attrs = records[i].attributes || records[i];
      if (attrs && attrs.id) ids[attrs.id] = true;
    }
    return ids;
  }

  // ── Find the chosen <select> inside the popover ──
  function findSelect() {
    var sel = document.querySelector(
      '#connection-picker-chosen-' + CONFIG.TARGET_FIELD + ' select'
    );
    if (sel && sel.options.length > 1) return sel;
    sel = document.querySelector('#cell-editor select.chzn-select');
    if (sel && sel.options.length > 1) return sel;
    return null;
  }

  function tryFilter() {
    var allowed = getAllowedIds();
    if (!allowed) { log('Source view model not loaded yet'); return false; }

    var select = findSelect();
    if (!select) { log('Select not populated yet'); return false; }

    var opts = select.options;
    var hexPattern = /^[a-f0-9]{24}$/;
    var hidden = 0, shown = 0, total = 0;

    for (var i = 0; i < opts.length; i++) {
      var val = opts[i].value;
      if (!val || !hexPattern.test(val)) continue;
      total++;
      if (allowed[val]) {
        opts[i].disabled = false;
        opts[i].style.display = '';
        opts[i].removeAttribute('data-scw-hidden');
        shown++;
      } else {
        opts[i].disabled = true;
        opts[i].style.display = 'none';
        opts[i].setAttribute('data-scw-hidden', '1');
        hidden++;
      }
    }
    if (total === 0) { log('No hex IDs yet'); return false; }

    $(select).trigger('chosen:updated').trigger('liszt:updated');
    log('Filtered: hidden', hidden, ', shown', shown, 'of', total);
    return true;
  }

  function startPolling() {
    stopPolling();
    var elapsed = 0;
    _pollTimer = setInterval(function () {
      elapsed += CONFIG.POLL_INTERVAL;
      if (tryFilter()) { stopPolling(); return; }
      if (elapsed >= CONFIG.POLL_MAX) { log('Timed out'); stopPolling(); }
    }, CONFIG.POLL_INTERVAL);
  }

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  document.addEventListener('click', function (e) {
    var td = e.target.closest
      ? e.target.closest('td.' + CONFIG.TARGET_FIELD)
      : null;
    if (!td) return;
    var viewEl = td.closest('[id^="view_"]');
    if (!viewEl || viewEl.id !== CONFIG.TARGET_VIEW) return;
    log('Cell clicked in', viewEl.id);
    startPolling();
  }, true);

  log('Module loaded');
})();
/*** END FILTER INLINE-EDIT MDF/IDF OPTIONS BY ANOTHER VIEW'S MODEL ***/
