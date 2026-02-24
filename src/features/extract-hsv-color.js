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
   * Return the description HTML for a Knack view by searching the
   * Backbone models collection on the current scene.  Backbone's
   * Collection#get() looks up by model `id`, which doesn't always
   * equal the view key, so we iterate through the models array and
   * match on `attributes.key` instead.
   */
  function getViewDescription(viewKey) {
    try {
      var views = Knack.router.scene_view.model.views;
      if (!views || !views.models) return null;
      for (var i = 0; i < views.models.length; i++) {
        var m = views.models[i];
        if (m.attributes && m.attributes.key === viewKey) {
          return m.attributes.description || null;
        }
      }
    } catch (e) { /* scene not ready yet – ignore */ }
    return null;
  }

  /**
   * Extract the _hsvcolor= value from a Knack view's description.
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
      var desc = getViewDescription(viewKey);
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
   * Walk the Backbone view models on the current scene, extract any
   * _hsvcolor= keywords from their descriptions, and inject a <style>
   * block with per-view colour overrides.
   *
   * We iterate models rather than querying the DOM for KTL buttons
   * because KTL may not have injected its buttons yet at the time
   * this handler runs.  The generated CSS selectors will match as
   * soon as the buttons appear.
   */
  function applyHsvColors() {
    var models;
    try {
      var views = Knack.router.scene_view.model.views;
      console.log('[SCW _hsvcolor] scene_view.model.views:', views);
      if (!views || !views.models) { console.log('[SCW _hsvcolor] no models found'); return; }
      models = views.models;
    } catch (e) { console.log('[SCW _hsvcolor] error accessing views:', e); return; }

    // Probe Knack.application for view descriptions (not in Backbone models).
    var appScenes = null;
    try {
      var app = Knack.application;
      if (app && app.attributes && app.attributes.scenes) {
        appScenes = app.attributes.scenes;
        console.log('[SCW _hsvcolor] Knack.application.attributes.scenes type:', typeof appScenes, Array.isArray(appScenes) ? 'len=' + appScenes.length : '');
      } else if (app && app.scenes) {
        appScenes = app.scenes;
        console.log('[SCW _hsvcolor] Knack.application.scenes type:', typeof appScenes, Array.isArray(appScenes) ? 'len=' + appScenes.length : '');
      } else {
        console.log('[SCW _hsvcolor] Knack.application keys:', app ? Object.keys(app.attributes || app) : 'N/A');
      }
    } catch (e) { console.log('[SCW _hsvcolor] error probing Knack.application:', e); }

    // Try to find description from application schema for first view
    if (appScenes && models.length > 0) {
      var firstKey = (models[0].attributes || models[0]).key;
      var sceneKey = null;
      try { sceneKey = Knack.router.scene_view.model.attributes.key || Knack.router.scene_view.model.id; } catch(e) {}
      console.log('[SCW _hsvcolor] current scene key:', sceneKey);

      // Search for view description in appScenes
      var found = false;
      var scenesArr = Array.isArray(appScenes) ? appScenes : [];
      for (var s = 0; s < scenesArr.length && !found; s++) {
        var sc = scenesArr[s];
        if (sc && sc.views) {
          for (var v = 0; v < sc.views.length; v++) {
            if (sc.views[v].key === firstKey) {
              console.log('[SCW _hsvcolor] FOUND ' + firstKey + ' in app schema, desc:', sc.views[v].description);
              found = true;
              break;
            }
          }
        }
      }
      if (!found) console.log('[SCW _hsvcolor] ' + firstKey + ' NOT found in app schema scenes');
    }

    var rules = [];

    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      var attrs = m.attributes || m;
      if (!attrs.key) continue;

      var viewKey = attrs.key;

      var color = extractHsvColor(viewKey);
      if (!color) continue;
      console.log('[SCW _hsvcolor] ' + viewKey + ' COLOR → ' + color);

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
