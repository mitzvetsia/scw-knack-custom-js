/*** FEATURE: device-worksheet sort presets ***********************************
 *
 * Replaces the per-column thead sort affordance on worksheet views with a
 * single "Sort by ▾" dropdown in the toolbar. The thead is hidden globally
 * via CSS (see hideThead style below) — it was a fake-column header that
 * pretended to label fields the cards already self-label, and on views
 * with `forceRowSort: true` it didn't even work because device-worksheet's
 * client-side rowSort immediately overrode any Knack-native click.
 *
 * Mechanics:
 *   - Each view in device-worksheet.js opts in via `viewCfg.sortPresets`:
 *       [{ id, label, rule: null | [{field, order, type}, ...] }, ...]
 *     `rule: null` (or omitted) on the first preset means "use the view's
 *     default viewCfg.rowSort" — the active selection is the absence of
 *     an explicit override.
 *   - Selection persists per (scene, viewId) in localStorage.
 *   - SCW.worksheetSort.getActiveSortRules(viewCfg) is what
 *     device-worksheet.js calls when picking rowSortRules.
 *   - Changing the selection re-fetches the view (Knack.views.X.model.fetch),
 *     which fires knack-view-render → transformView re-runs with the new
 *     rules. Fetching costs one round trip per click; acceptable given how
 *     rarely sort changes.
 *
 * Coexists with device-worksheet-toolbar.js by mounting its DOM inside
 * .kn-records-nav before consolidate() runs. The toolbar's orderSelectors
 * list places the dropdown right after the Expand/Summary/Collapse cluster.
 ******************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-ws-sort-css';
  var DD_CLS   = 'scw-ws-sort';
  var EVENT_NS = '.scwWsSort';

  // ── Styles ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // Hide the worksheet thead globally. The cards self-label every
      // summary field via .scw-ws-sum-label, so the thead was redundant
      // labelling that couldn't align with anything in the cards anyway.
      'table.kn-table-table > thead.scw-ws-thead-styled,',
      'table.kn-table > thead.scw-ws-thead-styled {',
      '  display: none !important;',
      '}',

      // Dropdown shell
      '.' + DD_CLS + ' {',
      '  position: relative;',
      '  display: inline-flex; align-items: center;',
      '  font: 12px/1.3 system-ui, -apple-system, sans-serif;',
      '}',
      '.' + DD_CLS + '__button {',
      '  display: inline-flex; align-items: center; gap: 6px;',
      '  padding: 5px 11px;',
      '  border: 1px solid var(--scw-border-default);',
      '  background: var(--scw-surface-base);',
      '  color: var(--scw-text-default);',
      '  border-radius: 6px;',
      '  font: 600 12px/1.2 system-ui, -apple-system, sans-serif;',
      '  cursor: pointer;',
      '  transition: background 100ms ease, border-color 100ms ease;',
      '}',
      '.' + DD_CLS + '__button:hover {',
      '  background: var(--scw-surface-muted);',
      '  border-color: var(--scw-border-strong);',
      '}',
      '.' + DD_CLS + '__button-label {',
      '  color: var(--scw-text-caption);',
      '  font-weight: 600;',
      '  letter-spacing: 0.02em;',
      '  text-transform: uppercase;',
      '  font-size: 11px;',
      '  margin-right: 4px;',
      '}',
      '.' + DD_CLS + '__caret {',
      '  width: 10px; height: 10px;',
      '  stroke: currentColor;',
      '}',

      // Menu
      '.' + DD_CLS + '__menu {',
      '  position: absolute;',
      '  top: calc(100% + 4px); left: 0;',
      '  z-index: 50;',
      '  min-width: 200px;',
      '  background: var(--scw-surface-base);',
      '  border: 1px solid var(--scw-border-default);',
      '  border-radius: 6px;',
      '  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.10);',
      '  padding: 4px 0;',
      '  display: none;',
      '}',
      '.' + DD_CLS + '.is-open .' + DD_CLS + '__menu {',
      '  display: block;',
      '}',
      '.' + DD_CLS + '__item {',
      '  display: block; width: 100%;',
      '  padding: 7px 12px;',
      '  background: transparent;',
      '  border: 0;',
      '  text-align: left;',
      '  font: 500 12px/1.3 system-ui, -apple-system, sans-serif;',
      '  color: var(--scw-text-default);',
      '  cursor: pointer;',
      '}',
      '.' + DD_CLS + '__item:hover {',
      '  background: var(--scw-surface-muted);',
      '}',
      '.' + DD_CLS + '__item.is-active {',
      '  background: var(--scw-accent);',
      '  color: var(--scw-surface-base);',
      '  font-weight: 600;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Scene detection (for storage key scoping) ───────────────────────
  function getCurrentSceneId() {
    var bodyId = document.body && document.body.id;
    if (bodyId) {
      var m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    try {
      var k = window.Knack && Knack.router && Knack.router.scene_view;
      if (k && k.model && k.model.attributes && k.model.attributes.key) {
        return k.model.attributes.key;
      }
    } catch (e) { /* ignore */ }
    return 'unknown_scene';
  }

  // ── Persisted state ─────────────────────────────────────────────────
  function storageKey(viewId) {
    return 'scw:ws-sort:' + getCurrentSceneId() + ':' + viewId;
  }
  function loadSelected(viewId) {
    try { return localStorage.getItem(storageKey(viewId)) || ''; }
    catch (e) { return ''; }
  }
  function saveSelected(viewId, presetId) {
    try {
      if (presetId) localStorage.setItem(storageKey(viewId), presetId);
      else          localStorage.removeItem(storageKey(viewId));
    } catch (e) { /* ignore */ }
  }

  // ── Active preset lookup ────────────────────────────────────────────
  function findPreset(viewCfg, presetId) {
    var presets = viewCfg && viewCfg.sortPresets;
    if (!presets || !presets.length) return null;
    if (!presetId) return presets[0];  // first preset = default
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].id === presetId) return presets[i];
    }
    return presets[0];  // stale selection → default
  }

  // Returns the rowSort rule array to apply, or null if device-worksheet
  // should fall back to its existing viewCfg.rowSort / hardcoded default.
  function getActiveSortRules(viewCfg) {
    var presets = viewCfg && viewCfg.sortPresets;
    if (!presets || !presets.length) return null;
    var presetId = loadSelected(viewCfg.viewId);
    var preset = findPreset(viewCfg, presetId);
    if (!preset) return null;
    // First preset with no explicit rule = "Default" = let device-worksheet
    // use its own viewCfg.rowSort.
    return preset.rule || null;
  }

  // ── Dropdown render ─────────────────────────────────────────────────
  function renderDropdown(viewCfg) {
    var view = document.getElementById(viewCfg.viewId);
    if (!view) return;
    var nav = view.querySelector('.kn-records-nav');
    if (!nav) return;

    var presets = viewCfg.sortPresets;
    if (!presets || !presets.length) return;

    // Tear down any prior dropdown — Knack rebuilds the view from scratch
    // on many events; we want fresh markup, not stale.
    var prior = nav.querySelector('.' + DD_CLS + '[data-view-id="' + viewCfg.viewId + '"]');
    if (prior) prior.parentNode.removeChild(prior);

    var selectedId = loadSelected(viewCfg.viewId);
    var active = findPreset(viewCfg, selectedId);

    var dd = document.createElement('div');
    dd.className = DD_CLS;
    dd.setAttribute('data-view-id', viewCfg.viewId);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = DD_CLS + '__button';
    btn.innerHTML =
      '<span class="' + DD_CLS + '__button-label">Sort:</span>' +
      '<span class="' + DD_CLS + '__current"></span>' +
      '<svg class="' + DD_CLS + '__caret" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="6 9 12 15 18 9"></polyline></svg>';
    btn.querySelector('.' + DD_CLS + '__current').textContent = (active && active.label) || 'Default';
    dd.appendChild(btn);

    var menu = document.createElement('div');
    menu.className = DD_CLS + '__menu';
    presets.forEach(function (preset) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = DD_CLS + '__item';
      if (active && active.id === preset.id) item.classList.add('is-active');
      item.setAttribute('data-preset-id', preset.id);
      item.textContent = preset.label;
      menu.appendChild(item);
    });
    dd.appendChild(menu);

    nav.insertBefore(dd, nav.firstChild);
  }

  // ── Click handling (delegated) ──────────────────────────────────────
  document.addEventListener('click', function (e) {
    var target = e.target;

    // Item click → save selection, close menu, re-fetch view to re-sort.
    var item = target.closest && target.closest('.' + DD_CLS + '__item');
    if (item) {
      var dd = item.closest('.' + DD_CLS);
      if (!dd) return;
      var viewId = dd.getAttribute('data-view-id');
      var presetId = item.getAttribute('data-preset-id') || '';

      saveSelected(viewId, presetId);
      dd.classList.remove('is-open');

      // Trigger view re-render so transformView re-reads the active rules.
      // model.fetch() costs one round trip but guarantees a clean rebuild
      // (rows are PROCESSED_ATTR-gated, in-place re-sort would need
      // significant extra logic to reorder existing card triplets).
      try {
        if (window.Knack && Knack.views[viewId] && Knack.views[viewId].model &&
            typeof Knack.views[viewId].model.fetch === 'function') {
          Knack.views[viewId].model.fetch();
        }
      } catch (err) { /* ignore */ }

      // Update active class + button label locally so the UI reflects the
      // change immediately even before the re-render completes.
      var siblings = dd.querySelectorAll('.' + DD_CLS + '__item');
      for (var i = 0; i < siblings.length; i++) {
        siblings[i].classList.toggle(
          'is-active',
          (siblings[i].getAttribute('data-preset-id') || '') === presetId
        );
      }
      var current = dd.querySelector('.' + DD_CLS + '__current');
      if (current) current.textContent = item.textContent;
      return;
    }

    // Button click → toggle menu.
    var btn = target.closest && target.closest('.' + DD_CLS + '__button');
    if (btn) {
      var ddBtn = btn.closest('.' + DD_CLS);
      if (!ddBtn) return;
      var wasOpen = ddBtn.classList.contains('is-open');
      // Close any other open dropdowns first.
      document.querySelectorAll('.' + DD_CLS + '.is-open').forEach(function (d) {
        d.classList.remove('is-open');
      });
      if (!wasOpen) ddBtn.classList.add('is-open');
      e.stopPropagation();
      return;
    }

    // Outside click → close all.
    document.querySelectorAll('.' + DD_CLS + '.is-open').forEach(function (d) {
      d.classList.remove('is-open');
    });
  });

  // ── Bindings ────────────────────────────────────────────────────────
  injectStyles();

  function refresh(viewCfg) {
    renderDropdown(viewCfg);
  }

  function bind() {
    // Walk the device-worksheet config to discover which views opt in.
    // window.SCW.deviceWorksheet exists once device-worksheet.js has run;
    // its config is owned by that file. We don't want to duplicate the
    // list here, so wait for the API and discover targets from the
    // configured set of views.
    var ws = window.SCW && window.SCW.deviceWorksheet;
    var configs = ws && ws._configs;  // exposed below by device-worksheet.js
    if (!configs) return;

    configs.forEach(function (viewCfg) {
      if (!viewCfg || !viewCfg.viewId || !viewCfg.sortPresets) return;

      if (window.SCW && typeof SCW.onViewRender === 'function') {
        SCW.onViewRender(viewCfg.viewId, function () {
          // 220ms — device-worksheet's transformView fires at 150ms; we
          // run after it so the .kn-records-nav has finished settling.
          setTimeout(function () { refresh(viewCfg); }, 220);
        }, 'scwWsSort_' + viewCfg.viewId);
      }

      if (document.getElementById(viewCfg.viewId)) {
        setTimeout(function () { refresh(viewCfg); }, 220);
      }
    });
  }

  // device-worksheet.js exposes its configs on window.SCW.deviceWorksheet
  // at file scope; by build order our IIFE runs after it, so the configs
  // are already present. Still, defensively retry if missing.
  function bindWithRetry(attempts) {
    var ws = window.SCW && window.SCW.deviceWorksheet;
    if (ws && ws._configs) { bind(); return; }
    if (attempts <= 0) return;
    setTimeout(function () { bindWithRetry(attempts - 1); }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bindWithRetry(20); });
  } else {
    bindWithRetry(20);
  }

  // ── Public API ──────────────────────────────────────────────────────
  window.SCW = window.SCW || {};
  window.SCW.worksheetSort = {
    getActiveSortRules: getActiveSortRules,
    getSelectedId: loadSelected
  };
})();
/*** END FEATURE: device-worksheet sort presets *******************************/
