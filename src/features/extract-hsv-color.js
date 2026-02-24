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
   * Return the description HTML for a Knack view by searching
   * Knack.scenes.models — the application schema collection that is
   * loaded once at boot and contains the full metadata (including
   * descriptions).  The runtime collection at
   * Knack.router.scene_view.model.views strips descriptions in
   * production, so we must use the schema collection instead.
   */
  function getViewDescription(viewKey) {
    try {
      var sceneModels = Knack.scenes.models;
      if (!sceneModels) return null;
      for (var s = 0; s < sceneModels.length; s++) {
        var scene = sceneModels[s];
        var views = scene.views;
        if (!views) continue;
        // views may be a Backbone Collection (.models) or a plain array.
        var viewList = views.models || views;
        for (var v = 0; v < viewList.length; v++) {
          var view = viewList[v];
          var attrs = view.attributes || view;
          if (attrs.key === viewKey) {
            return attrs.description || null;
          }
        }
      }
    } catch (e) { /* Knack not ready yet – ignore */ }
    return null;
  }

  /**
   * Resolve a raw _hsvcolor value (keyword name or hex literal) to a
   * CSS colour string, or return null if unrecognised.
   */
  function resolveColorValue(raw) {
    if (!raw) return null;
    var v = raw.trim().toLowerCase();
    if (COLOR_KEYWORDS[v]) return COLOR_KEYWORDS[v];
    if (/^#[0-9a-fA-F]{3,8}$/.test(v)) return v;
    return null;
  }

  /**
   * Try to pull the _hsvcolor value from KTL's pre-parsed keyword cache.
   *
   * KTL strips all underscore-prefixed keywords from view descriptions
   * at init time (via cleanUpKeywords) and stores the parsed results in
   * window.ktlKeywords[viewKey].  By the time our render handler fires
   * the raw description no longer contains _hsvcolor=…, so we must read
   * from the cache instead.
   *
   * The cache structure is:
   *   ktlKeywords[viewKey]._hsvcolor = [ entry, … ]
   * where each entry may be a string, an array of param strings, or an
   * object with a .params array — we handle all three defensively.
   */
  function readFromKtlKeywords(viewKey) {
    try {
      var kw = window.ktlKeywords;
      if (!kw) return null;
      var vkw = kw[viewKey];
      if (!vkw || !vkw._hsvcolor) return null;

      var entries = vkw._hsvcolor;            // array of param groups
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var val;

        if (typeof entry === 'string') {
          val = entry;
        } else if (Array.isArray(entry)) {
          val = entry[0];
        } else if (entry && typeof entry === 'object') {
          // Object with .params array (KTL parseParameters format).
          val = entry.params ? entry.params[0] : null;
        }
        var resolved = resolveColorValue(val);
        if (resolved) return resolved;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  /**
   * Extract the _hsvcolor= value from a Knack view's description.
   *
   * Accepted formats in the description field:
   *   _hsvcolor=documentation
   *   _hsvcolor=#cc3300
   *
   * Strategy:
   *   1. Read from KTL's pre-parsed keyword cache (primary — works after
   *      KTL has stripped the description).
   *   2. Fall back to raw description parsing (covers the case where KTL
   *      is not loaded or has not yet initialised).
   *
   * @param  {string} viewKey  e.g. "view_3477"
   * @return {string|null}     Resolved hex colour, or null if not found.
   */
  function extractHsvColor(viewKey) {
    try {
      // ── Strategy 1: KTL keyword cache ──
      var fromKtl = readFromKtlKeywords(viewKey);
      if (fromKtl) return fromKtl;

      // ── Strategy 2: raw description (fallback) ──
      var desc = getViewDescription(viewKey);
      if (!desc) return null;

      // Normalise <br /> variants to spaces so the regex stays simple.
      var text = desc.replace(/<br\s*\/?>/gi, ' ');

      var match = text.match(/_hsvcolor=([^\s<]+)/i);
      if (!match) return null;

      return resolveColorValue(match[1]);
    } catch (e) {
      return null;
    }
  }

  /**
   * Walk the current scene's view models, extract any _hsvcolor=
   * keywords from their descriptions (looked up via the app schema),
   * and inject a <style> block with per-view colour overrides.
   */
  var _diagDone = false;
  function applyHsvColors() {
    var models;
    try {
      var views = Knack.router.scene_view.model.views;
      if (!views || !views.models) return;
      models = views.models;
    } catch (e) { return; }

    // One-time diagnostic dump so we can see exactly what KTL stored.
    if (!_diagDone) {
      _diagDone = true;
      try {
        var kw = window.ktlKeywords;
        console.log('[SCW _hsvcolor diag] ktlKeywords exists:', !!kw);
        if (kw) {
          var viewKeys = Object.keys(kw);
          console.log('[SCW _hsvcolor diag] ktlKeywords has',
                      viewKeys.length, 'entries:', viewKeys.slice(0, 20));
          viewKeys.forEach(function (k) {
            if (kw[k]._hsvcolor) {
              console.log('[SCW _hsvcolor diag] ' + k + '._hsvcolor =',
                          JSON.stringify(kw[k]._hsvcolor));
            }
          });
        }
        for (var d = 0; d < models.length; d++) {
          var da = models[d].attributes || models[d];
          if (da.key) {
            var rawDesc = getViewDescription(da.key);
            console.log('[SCW _hsvcolor diag] ' + da.key +
              ' desc (first 120 chars):', rawDesc ? rawDesc.substring(0, 120) : '(null)');
          }
        }
      } catch (diagErr) {
        console.log('[SCW _hsvcolor diag] error:', diagErr.message);
      }
    }

    var rules = [];

    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var attrs = m.attributes || m;
      if (!attrs.key) continue;

      var viewKey = attrs.key;
      var color = extractHsvColor(viewKey);
      if (!color) continue;

      console.log('[SCW _hsvcolor] ' + viewKey + ' → ' + color);

      rules.push(
        '/* ── ' + viewKey + ' via _hsvcolor ── */\n' +
        '#hideShow_' + viewKey + '_button.ktlHideShowButton ' +
          '{ background-color: ' + color + '; }\n' +
        '#' + viewKey + ':has(.ktlHideShowButton) ' +
          '{ background-color: ' + color + '; }'
      );
    }

    // Remove previous overrides if any.
    var existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();

    if (!rules.length) return;

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = rules.join('\n');
    document.head.appendChild(style);
  }

  // Re-evaluate colours on every view render and scene render.
  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function () {
      applyHsvColors();
    });
  $(document)
    .off('knack-scene-render.any' + EVENT_NS)
    .on('knack-scene-render.any' + EVENT_NS, function () {
      applyHsvColors();
    });

  // Also expose the helper on the SCW namespace for other features.
  window.SCW = window.SCW || {};
  window.SCW.extractHsvColor = extractHsvColor;
})();
/*************  Extract _hsvcolor keyword from view descriptions  **************/
