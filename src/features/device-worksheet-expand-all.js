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

  var BTN_HOST_CLS    = 'scw-ws-bulk-toggle';
  var CLICK_BOUND_KEY = '__scwBulkClickBound';
  var OBS_KEY         = '__scwBulkToggleObs';
  var SUMMARY_STATE   = 'data-scw-summary-state';
  // Native Knack classes only — DO NOT include scw-group-header here,
  // that's added by group-collapse.js's enhance pass which can run
  // after device-worksheet finishes. If we required it, mount() would
  // bail on every retry until group-collapse caught up, and on slow
  // scenes the buttons would never appear.
  var L1_SEL          = 'tr.kn-table-group.kn-group-level-1';
  var SUMMARY_CLASS   = 'scw-mdf-summary-row';

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

      // Tag headers in summary state so the click interceptor can
      // convert the next click into an expand instead of letting
      // group-collapse fully collapse the group from a partially-open
      // state.
      if (mode === 'summary') h.setAttribute(SUMMARY_STATE, '1');
      else                    h.removeAttribute(SUMMARY_STATE);

      state['L1:' + readL1Label(h)] = collapse ? 1 : 0;

      var rows = rowsUntilNextL1(h);
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        var show;
        if (mode === 'expand') show = true;
        else if (mode === 'collapse') show = false;
        else show = !!(r.classList && r.classList.contains(SUMMARY_CLASS));
        r.style.display = show ? '' : 'none';

        // In summary mode the per-L1 mdf-summary-panel strip is the
        // only useful content under each group header — force it open
        // so the user sees actual summary tables instead of a row of
        // collapsed "Summary ▾" bars. We don't touch strip state in
        // expand/collapse mode (user's choice survives).
        if (mode === 'summary' &&
            r.classList && r.classList.contains(SUMMARY_CLASS)) {
          var strips = r.querySelectorAll('.scw-mdf-strip');
          for (var s = 0; s < strips.length; s++) {
            strips[s].classList.add('scw-mdf-strip--open');
          }
        }
      }
    }

    saveState(sceneId, viewId, state);
  }

  // Expand a single L1 group (used by the summary-state click
  // interceptor). Mirrors applyMode's expand branch but scoped to one
  // header so we don't blow away other groups' state.
  function expandOneGroup(viewEl, header) {
    header.classList.remove('scw-collapsed');
    header.removeAttribute(SUMMARY_STATE);
    var rows = rowsUntilNextL1(header);
    for (var j = 0; j < rows.length; j++) {
      rows[j].style.display = '';
    }
    var sceneId = getSceneId();
    var viewId  = viewEl.id;
    var state   = loadState(sceneId, viewId);
    state['L1:' + readL1Label(header)] = 0;
    saveState(sceneId, viewId, state);
  }

  // Returns true when every L1 group on the view is currently open
  // (no .scw-collapsed). The combined Expand/Collapse button uses
  // this to decide whether the next click should expand or collapse.
  // Summary mode counts as "open" (L1s are expanded), which is
  // intentional — clicking the toggle from summary state should
  // collapse everything in one move.
  function allExpanded(viewEl) {
    var headers = viewEl.querySelectorAll(L1_SEL);
    if (!headers.length) return false;
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].classList.contains('scw-collapsed')) return false;
    }
    return true;
  }

  function updateToggleLabel(btn, viewEl) {
    var expanded = allExpanded(viewEl);
    btn.textContent = expanded ? 'Collapse all' : 'Expand all';
    btn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  }

  // True when any L1 header on this view is currently tagged
  // SUMMARY_STATE='1' — i.e. summary mode is the active state.
  function inSummaryMode(viewEl) {
    return !!viewEl.querySelector(L1_SEL + '[' + SUMMARY_STATE + '="1"]');
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
      onClick(b);
    });
    return b;
  }

  // Bind the capture-phase click interceptor for summary-state clicks.
  // Lives on the viewEl, which Knack reuses across re-renders, so we
  // only need to bind it once per view element.
  function bindSummaryClickInterceptor(viewEl) {
    if (viewEl[CLICK_BOUND_KEY]) return;
    viewEl[CLICK_BOUND_KEY] = true;
    viewEl.addEventListener('click', function (e) {
      var t = e.target;
      var header = null;
      while (t && t !== viewEl) {
        if (t.nodeType === 1 &&
            t.classList.contains('kn-table-group') &&
            t.classList.contains('kn-group-level-1')) {
          header = t; break;
        }
        t = t.parentNode;
      }
      if (!header) return;
      if (header.getAttribute(SUMMARY_STATE) !== '1') return;
      e.stopPropagation();
      e.preventDefault();
      expandOneGroup(viewEl, header);
    }, true);
  }

  // Idempotent mount: callable on every observer tick. Returns true
  // when the buttons are present in the current DOM (whether we just
  // built them or they were already there), false when prerequisites
  // aren't ready yet so the observer keeps watching.
  //
  // Knack re-renders frequently wipe the inner view DOM (kn-records-nav
  // included) without replacing the outer #view_xxxx element. We must
  // re-attach the buttons on every such wipe — hence no "already done"
  // attribute guard. The cost is one querySelector per mutation tick.
  function mount(viewEl) {
    if (!viewEl) return false;
    if (!viewEl.querySelector('tr.scw-ws-row')) return false;
    if (!viewEl.querySelector(L1_SEL)) return false;

    var nav = viewEl.querySelector('.kn-records-nav');
    if (!nav) return false;

    // Already present in the live DOM — nothing to do. (We bind the
    // click interceptor below regardless, but it self-dedupes.)
    var existing = nav.querySelector('.' + BTN_HOST_CLS);
    if (!existing) {
      var host = document.createElement('div');
      host.className = BTN_HOST_CLS;
      host.style.cssText = 'display:inline-flex;gap:0;margin-right:10px;';

      // Single Expand-all / Collapse-all toggle — label reflects what
      // the next click will do based on the current expansion state.
      var toggleBtn = buildBtn('', function (self) {
        applyMode(viewEl, allExpanded(viewEl) ? 'collapse' : 'expand');
        updateToggleLabel(self, viewEl);
      });
      updateToggleLabel(toggleBtn, viewEl);
      host.appendChild(toggleBtn);

      // Summary Only also toggles. While summary mode is active, the
      // same button collapses everything — that gets the user back
      // to a clean state without needing to hunt for the Collapse
      // button.
      host.appendChild(buildBtn('Summary only', function () {
        applyMode(viewEl, inSummaryMode(viewEl) ? 'collapse' : 'summary');
        updateToggleLabel(toggleBtn, viewEl);
      }));

      nav.insertBefore(host, nav.firstChild);
    } else {
      // Already mounted — refresh the toggle label since state may
      // have changed since the last render (group-collapse persists
      // L1 open/closed across navigations).
      var tBtn = existing.querySelector('button');
      if (tBtn) updateToggleLabel(tBtn, viewEl);
    }

    bindSummaryClickInterceptor(viewEl);
    return true;
  }

  // Per-view observer: watches the view's subtree and re-runs mount on
  // every mutation. Stays attached for the life of the view so the
  // buttons survive Knack's inner-DOM rebuilds (filter changes, edit
  // saves, sort changes, anything that re-paints the kn-records-nav).
  function attachObserver(viewEl) {
    if (viewEl[OBS_KEY]) return;
    mount(viewEl);

    var debounce = null;
    var obs = new MutationObserver(function () {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(function () { mount(viewEl); }, 50);
    });
    obs.observe(viewEl, { childList: true, subtree: true });
    viewEl[OBS_KEY] = obs;
  }

  function runScan() {
    var views = document.querySelectorAll('.kn-view[id^="view_"]');
    for (var i = 0; i < views.length; i++) {
      attachObserver(views[i]);
    }
  }

  $(document).on('knack-view-render.any', runScan);
  $(document).on('knack-scene-render.any', runScan);
  document.addEventListener('scw-worksheet-ready', runScan);

  // First-load entry point: the script can load after the initial
  // scene render has already fired. Run an immediate scan so we don't
  // wait for the next render event.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runScan);
  } else {
    runScan();
  }
})();
/*** END DEVICE WORKSHEET — EXPAND/COLLAPSE/SUMMARY-ONLY ***/
