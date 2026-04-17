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

  var LOG_PREFIX = '[scwProdBucketFilter]';

  var CONFIG = {
    LINE_ITEM_BUCKET_FIELD: 'field_2219',
    PRODUCT_CELL_FIELD: 'field_1949',
    VIEWS: ['view_3456', 'view_3586', 'view_3610'],
    POLL_INTERVAL: 200,
    POLL_MAX: 6000,
    DEBUG: true
  };

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

  // ── FIND THE ACTIVE POPOVER ──────────────────────────────────
  function findOpenPopover() {
    var all = document.querySelectorAll('.kn-popover.drop-open');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.querySelector('.conn_inputs') || el.querySelector('select') || el.querySelector('.chzn-results') || el.querySelector('.kn-search')) {
        return el;
      }
    }
    return all.length ? all[all.length - 1] : null;
  }

  // ── INSPECT + FILTER ─────────────────────────────────────────
  function tryFilter(popover) {
    var map = getMap();
    if (!map || !_lastClickedTr) return false;

    var bucketId = readRowBucketId(_lastClickedTr);
    if (!bucketId) { log('No bucket on row'); return false; }

    // Dump full HTML for diagnosis (only once per click)
    if (!popover._scwDumped) {
      popover._scwDumped = true;
      log('=== POPOVER FULL HTML ===');
      log(popover.innerHTML);
      log('=== END POPOVER HTML ===');
    }

    var hidden = 0;
    var total = 0;
    var foundOptions = false;

    // Strategy 1: .conn_inputs .control with radio/checkbox that have values
    var controls = popover.querySelectorAll('.conn_inputs .control');
    if (controls.length) {
      var hasRealValues = false;
      for (var c = 0; c < controls.length; c++) {
        var inp = controls[c].querySelector('input[type="radio"], input[type="checkbox"]');
        if (inp && inp.value) { hasRealValues = true; break; }
      }
      if (hasRealValues) {
        foundOptions = true;
        total = controls.length;
        for (var i = 0; i < controls.length; i++) {
          var input = controls[i].querySelector('input[type="radio"], input[type="checkbox"]');
          if (!input || !input.value) continue;
          if (!productMatchesBucket(input.value, bucketId)) {
            controls[i].style.display = 'none';
            hidden++;
          } else {
            controls[i].style.display = '';
          }
        }
        log('Controls: hidden', hidden, 'of', total, 'for bucket', bucketId);
      }
    }

    // Strategy 2: Chosen.js result list items (<li> in .chzn-results)
    if (!foundOptions) {
      var chosenItems = popover.querySelectorAll('.chzn-results li, .chosen-results li');
      if (chosenItems.length) {
        foundOptions = true;
        total = chosenItems.length;
        for (var j = 0; j < chosenItems.length; j++) {
          var li = chosenItems[j];
          var dataId = li.getAttribute('data-option-array-index') || li.getAttribute('id') || '';
          log('  Chosen li[' + j + '] id:', li.id, '| data-option-array-index:', li.getAttribute('data-option-array-index'), '| text:', (li.textContent || '').substring(0, 40));
        }
        log('Found', total, 'Chosen list items (inspect IDs above for filtering strategy)');
      }
    }

    // Strategy 3: plain <select> options
    if (!foundOptions) {
      var selects = popover.querySelectorAll('select');
      for (var s = 0; s < selects.length; s++) {
        var opts = selects[s].querySelectorAll('option');
        if (opts.length > 1) {
          foundOptions = true;
          total = opts.length;
          for (var k = 0; k < opts.length; k++) {
            if (!opts[k].value) continue;
            log('  option[' + k + '] value:', opts[k].value, '| text:', (opts[k].textContent || '').substring(0, 40));
            if (!productMatchesBucket(opts[k].value, bucketId)) {
              opts[k].disabled = true;
              opts[k].style.display = 'none';
              hidden++;
            } else {
              opts[k].disabled = false;
              opts[k].style.display = '';
            }
          }
          $(selects[s]).trigger('chosen:updated').trigger('liszt:updated');
          log('Select: hidden', hidden, 'of', total, 'for bucket', bucketId);
        }
      }
    }

    // Strategy 4: any element with a 24-char hex ID (Knack record IDs)
    if (!foundOptions) {
      var allInputs = popover.querySelectorAll('input[value]');
      var hexPattern = /^[a-f0-9]{24}$/;
      var hexFound = 0;
      for (var h = 0; h < allInputs.length; h++) {
        if (hexPattern.test(allInputs[h].value)) {
          hexFound++;
          log('  Found hex input:', allInputs[h].type, 'value:', allInputs[h].value, 'name:', allInputs[h].name);
        }
      }
      if (hexFound) {
        log('Found', hexFound, 'inputs with hex record IDs');
        foundOptions = true;
      }
    }

    return foundOptions;
  }

  // ── POLL UNTIL OPTIONS LOAD ──────────────────────────────────
  function startPolling() {
    stopPolling();
    var elapsed = 0;

    _pollTimer = setInterval(function () {
      elapsed += CONFIG.POLL_INTERVAL;

      var popover = findOpenPopover();
      if (!popover) {
        if (elapsed > 1000) { log('Poll: popover closed, stopping'); stopPolling(); }
        return;
      }

      var done = tryFilter(popover);
      if (done) {
        log('Poll: complete after', elapsed, 'ms');
        stopPolling();
        return;
      }

      if (elapsed >= CONFIG.POLL_MAX) {
        log('Poll: timed out at', elapsed, 'ms — dumping final state');
        log('Final popover HTML:', popover.innerHTML);
        stopPolling();
      }
    }, CONFIG.POLL_INTERVAL);
  }

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
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
    startPolling();
  }, true);

  log('Module loaded, waiting for SCW.productBucketMap');
})();
/*** END FILTER INLINE-EDIT PRODUCT OPTIONS BY ROW BUCKET ***/
