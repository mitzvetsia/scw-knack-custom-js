/*** DEVICE WORKSHEET — EXPAND/COLLAPSE/SUMMARY-ONLY ***/
/**
 * Adds three buttons above any worksheet view that has L1 (MDF/IDF) group
 * accordions:
 *   • Expand all   → open every L1 group (card detail panels left as-is)
 *   • Summary only → open every L1 group, close every card detail panel
 *                    (only the summary row shows under each L1)
 *   • Collapse all → close every L1 group (only group headers visible)
 *
 * L1 toggling mirrors group-collapse.js's class/state contract
 * (.scw-collapsed on the header + display on rows up to the next L1) and
 * writes the resulting state to the same localStorage key group-collapse
 * reads on its next enhance pass. That way exclusive-accordion views
 * (view_3586/3610/3921) honour the bulk action instead of snapping back
 * to one-open-only on the next render.
 *
 * Card detail toggling mirrors device-worksheet.js's toggleDetail:
 * .scw-ws-detail.scw-ws-open, .scw-ws-chevron.scw-ws-expanded /
 * .scw-ws-collapsed, and .scw-ws-photo-wrap.scw-ws-photo-hidden.
 */
(function () {
  'use strict';

  var BTN_HOST_CLS = 'scw-ws-bulk-toggle';
  var BOUND_ATTR   = 'data-scw-bulk-toggle-bound';
  var L1_SEL = 'tr.kn-table-group.kn-group-level-1.scw-group-header';

  // ── L1 ACCORDION STATE ──────────────────────────────────────────
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

  function setAllL1(viewEl, expand) {
    var headers = viewEl.querySelectorAll(L1_SEL);
    if (!headers.length) return;
    var sceneId = getSceneId();
    var viewId  = viewEl.id;
    var state   = loadState(sceneId, viewId);

    for (var i = 0; i < headers.length; i++) {
      var h = headers[i];
      if (expand) h.classList.remove('scw-collapsed');
      else        h.classList.add('scw-collapsed');

      state['L1:' + readL1Label(h)] = expand ? 0 : 1;

      var rows = rowsUntilNextL1(h);
      var disp = expand ? '' : 'none';
      for (var j = 0; j < rows.length; j++) {
        rows[j].style.display = disp;
      }
    }

    saveState(sceneId, viewId, state);
  }

  // ── CARD DETAIL PANELS ──────────────────────────────────────────
  function expandCard(tr) {
    var detail = tr.querySelector('.scw-ws-detail');
    if (!detail) return;
    detail.classList.add('scw-ws-open');
    var chevron = tr.querySelector('.scw-ws-chevron');
    if (chevron) {
      chevron.classList.remove('scw-ws-collapsed');
      chevron.classList.add('scw-ws-expanded');
    }
    var photoWrap = tr.querySelector('.scw-ws-photo-wrap');
    if (photoWrap) photoWrap.classList.remove('scw-ws-photo-hidden');
  }

  function collapseCard(tr) {
    var detail = tr.querySelector('.scw-ws-detail');
    if (!detail) return;
    detail.classList.remove('scw-ws-open');
    var chevron = tr.querySelector('.scw-ws-chevron');
    if (chevron) {
      chevron.classList.remove('scw-ws-expanded');
      chevron.classList.add('scw-ws-collapsed');
    }
    // Match toggleDetail: keep the photo wrap visible when the row is
    // flagged photo-always and has actual uploaded images. Otherwise
    // hide it on collapse.
    var photoWrap = tr.querySelector('.scw-ws-photo-wrap');
    if (!photoWrap) return;
    var keepPhoto = tr.hasAttribute('data-scw-photo-always');
    var hasRealPhotos = keepPhoto &&
      photoWrap.querySelector('.scw-inline-photo-card[data-photo-has-image="true"]');
    if (!keepPhoto || !hasRealPhotos) {
      photoWrap.classList.add('scw-ws-photo-hidden');
    }
  }

  function setAllCards(viewEl, wantOpen) {
    var rows = viewEl.querySelectorAll('tr.scw-ws-row');
    var fn = wantOpen ? expandCard : collapseCard;
    for (var i = 0; i < rows.length; i++) fn(rows[i]);
  }

  // ── BUTTONS ─────────────────────────────────────────────────────
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
      setAllL1(viewEl, true);
    }));
    host.appendChild(buildBtn('Summary only', function () {
      setAllL1(viewEl, true);
      setAllCards(viewEl, false);
    }));
    host.appendChild(buildBtn('Collapse all', function () {
      setAllL1(viewEl, false);
    }));

    nav.insertBefore(host, nav.firstChild);
    viewEl.setAttribute(BOUND_ATTR, '1');
  }

  // One debounced scan per render burst, scoped to views that aren't
  // already bound. Avoids re-querying the whole DOM on every individual
  // knack-view-render.
  var scanTimer = 0;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () {
      scanTimer = 0;
      var views = document.querySelectorAll(
        '.kn-view[id^="view_"]:not([' + BOUND_ATTR + '])'
      );
      for (var i = 0; i < views.length; i++) mount(views[i]);
    }, 250);
  }

  $(document).on('knack-view-render.any', scheduleScan);
  $(document).on('knack-scene-render.any', scheduleScan);
})();
/*** END DEVICE WORKSHEET — EXPAND/COLLAPSE/SUMMARY-ONLY ***/
