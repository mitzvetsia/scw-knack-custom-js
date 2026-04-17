/*** FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
/**
 * Requires: window.SCW.productBucketMap (object: productId → [bucketId, ...])
 *
 * That map is built by a snippet in Knack's custom JS input (not in this
 * public repo) which calls the object API with the app's API key.
 * This module only reads the map — no API key, no fetch.
 */
(function () {
  'use strict';

  var EVENT_NS = '.scwProdBucketFilter';
  var LOG_PREFIX = '[scwProdBucketFilter]';

  // ── CONFIG ──────────────────────────────────────────────────────
  var CONFIG = {
    LINE_ITEM_BUCKET_FIELD: 'field_2219',
    PRODUCT_CELL_FIELD: 'field_1949',
    VIEWS: ['view_3456', 'view_3586', 'view_3610'],
    POLL_INTERVAL: 150,
    POLL_MAX: 5000,
    DEBUG: true
  };

  // ── STATE ──────────────────────────────────────────────────────
  var _lastClickedTr = null;
  var _pollTimer = null;

  function log() {
    if (!CONFIG.DEBUG || !window.console) return;
    var args = [LOG_PREFIX].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function getMap() {
    return (window.SCW && window.SCW.productBucketMap) || null;
  }

  // ── READ BUCKET ID FROM A TABLE ROW ──────────────────────────
  function readRowBucketId(tr) {
    var cell = tr.querySelector('td.' + CONFIG.LINE_ITEM_BUCKET_FIELD);
    if (cell) {
      var span = cell.querySelector('span[data-kn="connection-value"]');
      if (span) {
        var id = (span.className || '').trim();
        if (id) return id;
      }
    }

    var recordId = tr.id;
    if (!recordId) return '';
    for (var v = 0; v < CONFIG.VIEWS.length; v++) {
      var view = Knack.views[CONFIG.VIEWS[v]];
      if (!view || !view.model || !view.model.data) continue;
      var records = view.model.data.models || view.model.data;
      if (!records) continue;
      for (var i = 0; i < records.length; i++) {
        var attrs = records[i].attributes || records[i];
        if (attrs.id !== recordId) continue;
        var raw = attrs[CONFIG.LINE_ITEM_BUCKET_FIELD + '_raw'];
        if (Array.isArray(raw) && raw[0] && raw[0].id) return raw[0].id;
        if (raw && raw.id) return raw.id;
        return '';
      }
    }
    return '';
  }

  // ── CHECK IF A PRODUCT MATCHES THE BUCKET ────────────────────
  function productMatchesBucket(productId, bucketId) {
    var map = getMap();
    if (!map || !productId || !bucketId) return true;
    var buckets = map[productId];
    if (!buckets) return true;
    for (var i = 0; i < buckets.length; i++) {
      if (buckets[i] === bucketId) return true;
    }
    return false;
  }

  // ── FIND THE OPEN POPOVER ────────────────────────────────────
  function findOpenPopover() {
    var popovers = document.querySelectorAll('.kn-popover.drop-open');
    for (var i = 0; i < popovers.length; i++) {
      if (popovers[i].querySelector('.conn_inputs') || popovers[i].querySelector('select')) {
        return popovers[i];
      }
    }
    return null;
  }

  // ── CHECK IF OPTIONS ARE LOADED ──────────────────────────────
  function optionsAreLoaded(popover) {
    var controls = popover.querySelectorAll('.conn_inputs .control');
    if (!controls.length) return false;
    for (var i = 0; i < controls.length; i++) {
      var input = controls[i].querySelector('input[type="radio"], input[type="checkbox"]');
      if (input && input.value) return true;
      var label = (controls[i].textContent || '').trim().toLowerCase();
      if (label === 'loading...' || label === 'loading') return false;
    }
    return false;
  }

  // ── FILTER POPOVER OPTIONS ───────────────────────────────────
  function filterPopover(popover) {
    var map = getMap();
    if (!map || !_lastClickedTr) return false;

    var bucketId = readRowBucketId(_lastClickedTr);
    if (!bucketId) {
      log('No bucket on row — skipping filter');
      return false;
    }

    // Check controls
    var controls = popover.querySelectorAll('.conn_inputs .control');
    if (controls.length) {
      if (!optionsAreLoaded(popover)) {
        log('Options still loading... will retry');
        return false;
      }

      var hidden = 0;
      var total = controls.length;

      for (var i = 0; i < controls.length; i++) {
        var input = controls[i].querySelector('input[type="radio"], input[type="checkbox"]');
        if (!input || !input.value) continue;
        var val = input.value;
        var matches = productMatchesBucket(val, bucketId);
        if (CONFIG.DEBUG) {
          var label = (controls[i].textContent || '').trim();
          var inMap = map[val] ? map[val].join(',') : 'NOT IN MAP';
          log('  [' + i + '] value:', val, '| label:', label.substring(0, 40), '| buckets:', inMap, '| match:', matches);
        }
        if (!matches) {
          controls[i].style.display = 'none';
          hidden++;
        } else {
          controls[i].style.display = '';
        }
      }

      log('Filtered: hidden', hidden, 'of', total, 'for bucket', bucketId);
      return true;
    }

    // Check select
    var select = popover.querySelector('select');
    if (select) {
      var opts = select.querySelectorAll('option');
      if (!opts.length) return false;

      var hiddenS = 0;
      for (var j = 0; j < opts.length; j++) {
        if (!opts[j].value) continue;
        if (!productMatchesBucket(opts[j].value, bucketId)) {
          opts[j].disabled = true;
          opts[j].style.display = 'none';
          hiddenS++;
        } else {
          opts[j].disabled = false;
          opts[j].style.display = '';
        }
      }
      $(select).trigger('chosen:updated').trigger('liszt:updated');
      log('Filtered select: hidden', hiddenS, 'of', opts.length);
      return true;
    }

    return false;
  }

  // ── POLL UNTIL OPTIONS LOAD, THEN FILTER ─────────────────────
  function startPolling() {
    stopPolling();
    var elapsed = 0;

    _pollTimer = setInterval(function () {
      elapsed += CONFIG.POLL_INTERVAL;

      var popover = findOpenPopover();
      if (!popover) {
        log('Poll: no open popover found, stopping');
        stopPolling();
        return;
      }

      var done = filterPopover(popover);
      if (done) {
        log('Poll: filter applied after', elapsed, 'ms');
        stopPolling();
        return;
      }

      if (elapsed >= CONFIG.POLL_MAX) {
        log('Poll: timed out after', elapsed, 'ms');
        stopPolling();
      }
    }, CONFIG.POLL_INTERVAL);
  }

  function stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  // ── CAPTURE CLICK ON PRODUCT CELL ────────────────────────────
  document.addEventListener('click', function (e) {
    var td = e.target.closest
      ? e.target.closest('td.' + CONFIG.PRODUCT_CELL_FIELD)
      : null;
    if (!td) return;

    var viewEl = td.closest('[id^="view_"]');
    if (!viewEl || CONFIG.VIEWS.indexOf(viewEl.id) === -1) return;

    var tr = td.closest('tr');
    if (!tr || !tr.id) return;

    _lastClickedTr = tr;
    log('Product cell clicked in', viewEl.id, 'row', tr.id);

    // Start polling for options to load
    startPolling();
  }, true);

  log('Module loaded, waiting for SCW.productBucketMap');
})();
/*** END FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
