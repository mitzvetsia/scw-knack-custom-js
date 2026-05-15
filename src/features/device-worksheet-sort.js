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
 *     rules.
 *
 * Mounting is delegated to SCW.toolbar — this file owns the markup, click
 * handlers, and state. The toolbar registry decides when to call mount()
 * and re-runs it on accordion-subtree mutations. mount() is idempotent:
 * if the dropdown is already in the nav, only refresh its visible state.
 ******************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-ws-sort-css';
  var DD_CLS   = 'scw-ws-sort';

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
      '  display: flex; align-items: center; justify-content: space-between;',
      '  gap: 12px;',
      '  width: 100%;',
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
      '}',
      '.' + DD_CLS + '__item-label { flex: 1 1 auto; }',
      '.' + DD_CLS + '__item-dir {',
      '  flex: 0 0 auto;',
      '  font-size: 13px; line-height: 1;',
      '  opacity: 0.30;',  // hint glyph on inactive items
      '}',
      '.' + DD_CLS + '__item-dir.is-active {',
      '  opacity: 1;',
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
  function saveSelected(viewId, value) {
    try {
      if (value) localStorage.setItem(storageKey(viewId), value);
      else       localStorage.removeItem(storageKey(viewId));
    } catch (e) { /* ignore */ }
  }

  // Stored value shape:
  //   ''                        → no selection (use viewCfg.rowSort default)
  //   '<presetId>'              → preset with a fixed compound rule
  //   '<presetId>|asc' / '|desc'→ bidirectional preset + current direction
  function parseSelected(value) {
    if (!value) return { presetId: '', direction: '' };
    var bar = value.indexOf('|');
    if (bar < 0) return { presetId: value, direction: '' };
    return { presetId: value.substring(0, bar), direction: value.substring(bar + 1) };
  }
  function serializeSelected(presetId, direction) {
    if (!presetId) return '';
    return direction ? presetId + '|' + direction : presetId;
  }

  // Default direction when first activating a bidirectional preset:
  // text fields → asc (A→Z reads naturally), numeric → desc (most users
  // who pick "Total" want highest-first).
  function defaultDirection(preset) {
    return (preset && preset.type === 'text') ? 'asc' : 'desc';
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

  function isBidirectional(preset) {
    return !!(preset && preset.field && !preset.rule);
  }

  function findViewCfg(viewId) {
    var ws = window.SCW && window.SCW.deviceWorksheet;
    var configs = ws && ws._configs;
    if (!configs) return null;
    for (var i = 0; i < configs.length; i++) {
      if (configs[i] && configs[i].viewId === viewId) return configs[i];
    }
    return null;
  }

  // Returns the rowSort rule array to apply, or null if device-worksheet
  // should fall back to its existing viewCfg.rowSort / hardcoded default.
  function getActiveSortRules(viewCfg) {
    var presets = viewCfg && viewCfg.sortPresets;
    if (!presets || !presets.length) return null;
    var sel = parseSelected(loadSelected(viewCfg.viewId));
    var preset = findPreset(viewCfg, sel.presetId);
    if (!preset) return null;

    if (isBidirectional(preset)) {
      var dir = sel.direction || defaultDirection(preset);
      return [{ field: preset.field, order: dir, type: preset.type || 'text' }];
    }

    if (preset.rule) return preset.rule;

    return null;
  }

  function dirGlyph(direction) {
    return direction === 'desc' ? '↓' : '↑';
  }

  // Build dropdown markup from scratch. Pure function — no DOM lookups.
  function buildDropdown(viewCfg) {
    var presets = viewCfg.sortPresets;
    var sel = parseSelected(loadSelected(viewCfg.viewId));
    var active = findPreset(viewCfg, sel.presetId);
    var activeDir = '';
    if (active && isBidirectional(active)) {
      activeDir = sel.direction || defaultDirection(active);
    }

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
    btn.querySelector('.' + DD_CLS + '__current').textContent =
      ((active && active.label) || 'Default') + (activeDir ? ' ' + dirGlyph(activeDir) : '');
    dd.appendChild(btn);

    var menu = document.createElement('div');
    menu.className = DD_CLS + '__menu';
    presets.forEach(function (preset) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = DD_CLS + '__item';
      var isActive = active && active.id === preset.id;
      if (isActive) item.classList.add('is-active');
      item.setAttribute('data-preset-id', preset.id);

      var labelSpan = document.createElement('span');
      labelSpan.className = DD_CLS + '__item-label';
      labelSpan.textContent = preset.label;
      item.appendChild(labelSpan);

      // Show direction glyph on the active bidirectional preset; hint
      // glyph (faded) on inactive bidirectional presets so the affordance
      // is discoverable. Compound and Default presets get no glyph.
      if (isBidirectional(preset)) {
        var dirSpan = document.createElement('span');
        dirSpan.className = DD_CLS + '__item-dir';
        if (isActive) {
          dirSpan.classList.add('is-active');
          dirSpan.textContent = dirGlyph(activeDir);
        } else {
          dirSpan.textContent = dirGlyph(defaultDirection(preset));
        }
        item.appendChild(dirSpan);
      }
      menu.appendChild(item);
    });
    dd.appendChild(menu);
    return dd;
  }

  // Refresh an existing dropdown's visible state (active class, current
  // label, direction glyph) without rebuilding the markup. Cheap to
  // call on every mount tick; nothing happens unless storage changed.
  function refreshDropdownState(dd, viewCfg) {
    var sel = parseSelected(loadSelected(viewCfg.viewId));
    var active = findPreset(viewCfg, sel.presetId);
    var activeDir = '';
    if (active && isBidirectional(active)) {
      activeDir = sel.direction || defaultDirection(active);
    }

    var currentLabel =
      ((active && active.label) || 'Default') +
      (activeDir ? ' ' + dirGlyph(activeDir) : '');
    var currentSpan = dd.querySelector('.' + DD_CLS + '__current');
    if (currentSpan && currentSpan.textContent !== currentLabel) {
      currentSpan.textContent = currentLabel;
    }

    var items = dd.querySelectorAll('.' + DD_CLS + '__item');
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var isActive = active && item.getAttribute('data-preset-id') === active.id;
      item.classList.toggle('is-active', !!isActive);

      var dirSpan = item.querySelector('.' + DD_CLS + '__item-dir');
      if (dirSpan) {
        var preset = findPreset(viewCfg, item.getAttribute('data-preset-id'));
        if (isActive) {
          dirSpan.classList.add('is-active');
          dirSpan.textContent = dirGlyph(activeDir);
        } else {
          dirSpan.classList.remove('is-active');
          dirSpan.textContent = dirGlyph(defaultDirection(preset));
        }
      }
    }
  }

  // ── Click handling (delegated, document-wide) ──────────────────────
  document.addEventListener('click', function (e) {
    var target = e.target;

    // Item click → save selection, close menu, re-fetch view to re-sort.
    var item = target.closest && target.closest('.' + DD_CLS + '__item');
    if (item) {
      var dd = item.closest('.' + DD_CLS);
      if (!dd) return;
      var viewId = dd.getAttribute('data-view-id');
      var presetId = item.getAttribute('data-preset-id') || '';

      var viewCfg = findViewCfg(viewId);
      var preset = findPreset(viewCfg, presetId);
      var prev = parseSelected(loadSelected(viewId));
      var nextDir = '';
      if (preset && isBidirectional(preset)) {
        if (prev.presetId === presetId) {
          // Clicking the active bidirectional preset flips direction.
          var curDir = prev.direction || defaultDirection(preset);
          nextDir = (curDir === 'desc') ? 'asc' : 'desc';
        } else {
          nextDir = defaultDirection(preset);
        }
      }

      saveSelected(viewId, serializeSelected(presetId, nextDir));
      dd.classList.remove('is-open');

      // Trigger view re-render so transformView re-reads the active rules.
      try {
        if (window.Knack && Knack.views[viewId] && Knack.views[viewId].model &&
            typeof Knack.views[viewId].model.fetch === 'function') {
          Knack.views[viewId].model.fetch();
        }
      } catch (err) { /* ignore */ }

      // Refresh the dropdown's local visible state immediately.
      if (viewCfg) refreshDropdownState(dd, viewCfg);
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

  // Each view with viewCfg.sortPresets becomes a toolbar entry. We
  // register one entry per view (vs. one entry that handles all views)
  // so the viewMatch can be a simple id check.
  function registerForView(viewCfg) {
    if (!viewCfg || !viewCfg.viewId || !viewCfg.sortPresets ||
        !viewCfg.sortPresets.length) return;

    SCW.toolbar.register({
      id:    'sort-' + viewCfg.viewId,
      slot:  SCW.toolbar.SLOTS.sort,
      viewMatch: function (viewEl) { return viewEl.id === viewCfg.viewId; },
      mount: function (viewEl, nav) {
        var dd = nav.querySelector(
          '.' + DD_CLS + '[data-view-id="' + viewCfg.viewId + '"]'
        );
        if (dd) {
          refreshDropdownState(dd, viewCfg);
          return;
        }
        // Visual order is controlled by the toolbar's CSS `order` rule.
        nav.appendChild(buildDropdown(viewCfg));
      }
    });
  }

  function registerAll() {
    var ws = window.SCW && window.SCW.deviceWorksheet;
    var configs = ws && ws._configs;
    if (!configs) return;
    configs.forEach(registerForView);
  }

  // device-worksheet.js exposes its configs on window.SCW.deviceWorksheet
  // at file scope; by build order our IIFE runs after it, so configs are
  // present. Still, defensively retry if missing.
  function registerWithRetry(attempts) {
    var ws = window.SCW && window.SCW.deviceWorksheet;
    if (ws && ws._configs) { registerAll(); return; }
    if (attempts <= 0) return;
    setTimeout(function () { registerWithRetry(attempts - 1); }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { registerWithRetry(20); });
  } else {
    registerWithRetry(20);
  }

  // ── Public API ──────────────────────────────────────────────────────
  window.SCW = window.SCW || {};
  window.SCW.worksheetSort = {
    getActiveSortRules: getActiveSortRules,
    getSelectedId: loadSelected
  };
})();
/*** END FEATURE: device-worksheet sort presets *******************************/
