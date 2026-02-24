/*************  Extract _hsvcolor keyword from view descriptions  ************/
(function () {
  'use strict';

  const COLOR_KEYWORDS = {
    'documentation':          '#4f7c8a',
    'project-scope-details':  '#5877a8',
    'passive-info':           '#5F6B7A',
  };

  const STYLE_ID = 'scw-hsv-color-overrides-css';
  const EVENT_NS = '.scwHsvColor';

  // Optional debug toggle
  const DEBUG = false;
  function log() { if (DEBUG) console.log.apply(console, arguments); }

  /**
   * Find a view model reliably by view key (e.g., "view_3477")
   */
  function getViewModelByKey(viewKey) {
    try {
      // 1) If the view is rendered, Knack.views is usually the best source
      if (window.Knack && Knack.views && Knack.views[viewKey] && Knack.views[viewKey].model) {
        return Knack.views[viewKey].model;
      }

      // 2) Fall back to current scene view collection
      const scene = Knack && Knack.router && Knack.router.scene_view;
      const collection = scene && scene.model && scene.model.views;
      if (!collection || !collection.models) return null;

      // Search by "key" (NOT by .get(viewKey))
      for (let i = 0; i < collection.models.length; i++) {
        const m = collection.models[i];
        if (m && m.attributes && m.attributes.key === viewKey) return m;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract the _hsvcolor= value from a Knack view's description.
   * Accepted formats:
   *   _hsvcolor=documentation
   *   _hsvcolor=#cc3300
   */
  function extractHsvColor(viewKey) {
    try {
      const viewModel = getViewModelByKey(viewKey);
      if (!viewModel) { log('[hsv] no viewModel for', viewKey); return null; }

      const desc = viewModel.attributes && viewModel.attributes.description;
      if (!desc) { log('[hsv] no description for', viewKey); return null; }

      // Normalize <br> to whitespace
      const text = String(desc).replace(/<br\s*\/?>/gi, ' ');

      const match = text.match(/_hsvcolor=([^\s<]+)/i);
      if (!match) { log('[hsv] no _hsvcolor token for', viewKey); return null; }

      const value = match[1].trim();

      if (COLOR_KEYWORDS[value]) return COLOR_KEYWORDS[value];
      if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;

      log('[hsv] invalid value for', viewKey, value);
      return null;
    } catch (e) {
      return null;
    }
  }

  function applyHsvColors() {
    const buttons = document.querySelectorAll(
      '.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]'
    );

    const rules = [];

    Array.prototype.forEach.call(buttons, function (btn) {
      const m = btn.id.match(/^hideShow_(view_\d+)_button$/);
      if (!m) return;

      const viewKey = m[1];
      const color = extractHsvColor(viewKey);
      if (!color) return;

      rules.push(
        '/* ── ' + viewKey + ' via _hsvcolor ── */\n' +
        '#hideShow_' + viewKey + '_button.ktlHideShowButton { background-color: ' + color + ' !important; }\n' +
        // wrapper: best-effort (Knack view wrapper)
        '#' + viewKey + ' { background-color: ' + color + ' !important; }\n' +
        // original intent: only when it contains KTL button (works in modern Chrome)
        '#' + viewKey + ':has(.ktlHideShowButton) { background-color: ' + color + ' !important; }'
      );
    });

    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    if (!rules.length) { log('[hsv] no rules generated'); return; }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = rules.join('\n');
    document.head.appendChild(style);

    log('[hsv] applied rules:', rules.length);
  }

  // KTL often injects after the render event; do a short delayed pass.
  function applySoon() {
    applyHsvColors();
    setTimeout(applyHsvColors, 50);
    setTimeout(applyHsvColors, 250);
  }

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      applySoon();
    });

  // Also run once on load (covers direct page hits + cached renders)
  $(function () {
    applySoon();
  });

  window.SCW = window.SCW || {};
  window.SCW.extractHsvColor = extractHsvColor;
})();
/*************  Extract _hsvcolor keyword from view descriptions  ************/