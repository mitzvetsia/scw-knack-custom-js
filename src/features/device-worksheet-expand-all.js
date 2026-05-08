/*** DEVICE WORKSHEET — EXPAND/COLLAPSE/SUMMARY-ONLY ***/
/**
 * Adds three buttons above any worksheet view that has L1 (MDF/IDF) group
 * accordions:
 *   • Expand all   → open every L1 group (rows under each L1 visible)
 *   • Summary only → open every L1 group, hide all rows under each L1
 *                    except its scw-mdf-summary-row
 *   • Collapse all → close every L1 group (only group headers visible)
 *
 * L1 toggling mirrors group-collapse.js's class/state contract
 * (.scw-collapsed on the header + display on rows up to the next L1) and
 * writes the resulting state to the same localStorage key group-collapse
 * reads on its next enhance pass. That way exclusive-accordion views
 * (view_3586/3610/3921) honour the bulk action instead of snapping back
 * to one-open-only on the next render.
 */
(function () {
  'use strict';

  var BTN_HOST_CLS  = 'scw-ws-bulk-toggle';
  var BOUND_ATTR    = 'data-scw-bulk-toggle-bound';
  // Native Knack classes only — DO NOT include scw-group-header here,
  // that's added by group-collapse.js's enhance pass which can run
  // after device-worksheet finishes. If we required it, mount() would
  // bail on every retry until group-collapse caught up, and on slow
  // scenes the buttons would never appear.
  var L1_SEL        = 'tr.kn-table-group.kn-group-level-1';
  var SUMMARY_CLASS = 'scw-mdf-summary-row';

  function getSceneId() {
    var bodyId = document.body.id || '';
    var m = bodyId.match(/scene_\d+/);
    return m ? m[0] : null;
  }

  function stateKey(sceneId, viewId) {
    return 'scw:collapse:' + sceneId + ':' + viewId;
  }

  function loadState(sceneId, viewId) {
    try { return JSON.parse(localStorage.getItem(stateKey(sceneId, viewId)) || '{}'); }
    catch (e) { return {}; }
  }

  function saveState(sceneId, viewId, state) {
    try { localStorage.setItem(stateKey(sceneId, viewId), JSON.stringify(state)); }
    catch (e) {}
  }

  // Mirror group-collapse.js's getRowLabelText: textContent minus the
  // injected chevron and badge wrappers, whitespace collapsed.
  function readL1Label(header) {
    var clone = header.cloneNode(true);
    var strip = clone.querySelectorAll('.scw-collapse-icon, .scw-group-badges');
    for (var i = 0; i < strip.length; i++) {
      strip[i].parentNode.removeChild(strip[i]);
    }
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function rowsUntilNextL1(header) {
    var rows = [];
    var node = header.nextElementSibling;
    while (node) {
      if (node.classList && node.classList.contains('kn-group-level-1')) break;
      rows.push(node);
      node = node.nextElementSibling;
    }
    return rows;
  }

  // mode: 'expand' | 'collapse' | 'summary'
  function applyMode(viewEl, mode) {
    var headers = viewEl.querySelectorAll(L1_SEL);
    if (!headers.length) return;
    var sceneId = getSceneId();
    var viewId  = viewEl.id;
    var state   = loadState(sceneId, viewId);
    var collapse = (mode === 'collapse');

    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      if (collapse) h.classList.add('scw-collapsed');
      else          h.classList.remove('scw-collapsed');

      state['L1:' + readL1Label(h)] = collapse ? 1 : 0;

      var rows = rowsUntilNextL1(h);
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        var show;
        if (mode === 'expand') show = true;
        else if (mode === 'collapse') show = false;
        else show = !!(r.classList && r.classList.contains(SUMMARY_CLASS));
        r.style.display = show ? '' : 'none';
      }
    }

    saveState(sceneId, viewId, state);
  }

  function buildBtn(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'kn-button is-small';
    b.textContent = label;
    b.style.marginRight = '6px';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  function mount(viewEl) {
    if (!viewEl) return;
    if (viewEl.hasAttribute(BOUND_ATTR)) return;
    if (!viewEl.querySelector('tr.scw-ws-row')) return;
    if (!viewEl.querySelector(L1_SEL)) return;

    var nav = viewEl.querySelector('.kn-records-nav');
    if (!nav) return;

    var existing = nav.querySelector('.' + BTN_HOST_CLS);
    if (existing) existing.remove();

    var host = document.createElement('div');
    host.className = BTN_HOST_CLS;
    host.style.cssText = 'display:inline-flex;gap:0;margin-right:10px;';

    host.appendChild(buildBtn('Expand all', function () {
      applyMode(viewEl, 'expand');
    }));
    host.appendChild(buildBtn('Summary only', function () {
      applyMode(viewEl, 'summary');
    }));
    host.appendChild(buildBtn('Collapse all', function () {
      applyMode(viewEl, 'collapse');
    }));

    nav.insertBefore(host, nav.firstChild);
    viewEl.setAttribute(BOUND_ATTR, '1');
  }

  // Scan unbound views and try to mount on each. Trivially cheap: the
  // selector skips already-bound views, and mount() returns early
  // unless tr.scw-ws-row + L1 group rows are both present.
  function runScan() {
    var views = document.querySelectorAll(
      '.kn-view[id^="view_"]:not([' + BOUND_ATTR + '])'
    );
    for (var i = 0; i < views.length; i++) mount(views[i]);
  }

  // Debounced scheduler. knack-view-render fires before
  // device-worksheet's transformView and group-collapse's enhance, so a
  // single fast scan can land before tr.scw-ws-row or the L1 group
  // headers exist. Schedule a few retries to cover the lifecycle:
  //   250ms — typical case
  //   1200ms — slower scenes / coordinated post-edit restore
  //   3000ms — last-resort safety net
  // Plus an immediate run on scw-worksheet-ready (device-worksheet's
  // own completion signal) which deterministically catches the moment
  // worksheet rows are in the DOM.
  var scanTimers = [];
  function clearTimers() {
    for (var i = 0; i < scanTimers.length; i++) clearTimeout(scanTimers[i]);
    scanTimers.length = 0;
  }
  function scheduleScan() {
    clearTimers();
    scanTimers.push(setTimeout(runScan, 250));
    scanTimers.push(setTimeout(runScan, 1200));
    scanTimers.push(setTimeout(runScan, 3000));
  }

  $(document).on('knack-view-render.any', scheduleScan);
  $(document).on('knack-scene-render.any', scheduleScan);
  document.addEventListener('scw-worksheet-ready', runScan);
})();
/*** END DEVICE WORKSHEET — EXPAND/COLLAPSE/SUMMARY-ONLY ***/
