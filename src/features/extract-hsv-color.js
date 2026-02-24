/*************  Extract _hsvcolor keyword from view descriptions  **************/
(function () {
  'use strict';

  const COLOR_KEYWORDS = {
    'documentation':          '#4f7c8a',
    'project-scope-details':  '#5877a8',
    'passive-info':           '#5F6B7A',
  };

  const STYLE_ID = 'scw-hsv-color-overrides-css';
  const EVENT_NS = '.scwHsvColor';

  /**
   * Extract the _hsvcolor= value from a Knack view's description.
   *
   * Knack stores the description as an HTML string in
   * view.attributes.description.  KTL-style keywords start with an
   * underscore and are separated by whitespace or <br /> tags.
   *
   * Accepted formats in the description field:
   *   _hsvcolor=documentation
   *   _hsvcolor=#cc3300
   *
   * @param  {string} viewKey  e.g. "view_3477"
   * @return {string|null}     Resolved hex colour, or null if not found.
   */
  function extractHsvColor(viewKey) {
    try {
      var viewModel = Knack.router.scene_view.model.views.get(viewKey);
      if (!viewModel) return null;

      var desc = viewModel.attributes.description;
      if (!desc) return null;

      // Normalise <br /> variants to spaces so the regex stays simple.
      var text = desc.replace(/<br\s*\/?>/gi, ' ');

      var match = text.match(/_hsvcolor=([^\s<]+)/i);
      if (!match) return null;

      var value = match[1];

      // If the value is a recognised keyword, resolve it.
      if (COLOR_KEYWORDS[value]) return COLOR_KEYWORDS[value];

      // If it already looks like a hex colour, use it directly.
      if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Scan every rendered KTL hide/show button and inject a <style> block
   * with per-view colour overrides for any view whose description
   * contains _hsvcolor=<keyword|#hex>.
   */
  function applyHsvColors() {
    var buttons = document.querySelectorAll(
      '.ktlHideShowButton[id^="hideShow_view_"][id$="_button"]'
    );

    var rules = [];

    buttons.forEach(function (btn) {
      // id format: hideShow_view_1234_button
      var parts = btn.id.match(/^hideShow_(view_\d+)_button$/);
      if (!parts) return;

      var viewKey = parts[1];
      var color = extractHsvColor(viewKey);
      if (!color) return;

      rules.push(
        '/* ── ' + viewKey + ' via _hsvcolor ── */\n' +
        '#hideShow_' + viewKey + '_button.ktlHideShowButton ' +
          '{ background-color: ' + color + '; }\n' +
        '#' + viewKey + ':has(.ktlHideShowButton) ' +
          '{ background-color: ' + color + '; }'
      );
    });

    // Remove previous overrides if any.
    var existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    if (!rules.length) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
  }

  // Re-evaluate colours every time a view renders (KTL buttons may
  // appear or disappear at any time).
  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      applyHsvColors();
    });

  // Also expose the helper on the SCW namespace for other features.
  window.SCW = window.SCW || {};
  window.SCW.extractHsvColor = extractHsvColor;
})();
/*************  Extract _hsvcolor keyword from view descriptions  **************/
