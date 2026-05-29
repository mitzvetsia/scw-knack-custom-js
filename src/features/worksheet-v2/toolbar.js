/*** WORKSHEET V2 — TOOLBAR ***************************************************
 *
 * Mode toolbar above the v2 mount. Three view modes + a photos toggle:
 *
 *   - mode-default  : per-L1 accordion state (the existing behavior)
 *   - mode-expand   : every L1 open + every card row visible
 *   - mode-collapse : every L1 closed (only L1 headers visible)
 *   - mode-summary  : every L1 open + cards hidden + per-L1 summary panel
 *                     visible. The summary panel is built by summary.js
 *                     and rendered at the top of each L1 body.
 *
 *   - photos-hidden : independent boolean — hide every photo strip
 *                     regardless of expand state. Persists separately.
 *
 * Mode + photos state persists to localStorage keyed by sceneId +
 * sourceViewKey so a user\'s preferred view sticks across reloads.
 *
 * Implementation note: modes are pure CSS overrides applied via classes
 * on the v2 container. They don\'t mutate the per-L1 state.js state, so
 * the user can flip from "expand all" back to "default" and the previous
 * accordion state resumes.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.worksheetV2;
  if (!ns) return;

  var MODE_KEY_PREFIX   = 'scw:ws-v2:mode:';
  var PHOTOS_KEY_PREFIX = 'scw:ws-v2:photos:';

  function getSceneId() {
    var m = (document.body.id || '').match(/scene_\d+/);
    return m ? m[0] : 'default';
  }

  function modeKey(viewKey)   { return MODE_KEY_PREFIX   + getSceneId() + ':' + viewKey; }
  function photosKey(viewKey) { return PHOTOS_KEY_PREFIX + getSceneId() + ':' + viewKey; }

  function loadMode(viewKey) {
    try { return localStorage.getItem(modeKey(viewKey)) || 'default'; }
    catch (e) { return 'default'; }
  }
  function saveMode(viewKey, mode) {
    try { localStorage.setItem(modeKey(viewKey), mode); }
    catch (e) {}
  }
  function loadPhotosHidden(viewKey) {
    try { return localStorage.getItem(photosKey(viewKey)) === '1'; }
    catch (e) { return false; }
  }
  function savePhotosHidden(viewKey, hidden) {
    try { localStorage.setItem(photosKey(viewKey), hidden ? '1' : '0'); }
    catch (e) {}
  }

  function applyState(container, viewKey) {
    var mode  = loadMode(viewKey);
    var hidden = loadPhotosHidden(viewKey);
    container.classList.remove(
      'scw-ws-v2-mode-default',
      'scw-ws-v2-mode-expand',
      'scw-ws-v2-mode-collapse',
      'scw-ws-v2-mode-summary'
    );
    container.classList.add('scw-ws-v2-mode-' + mode);
    container.classList.toggle('scw-ws-v2-photos-hidden', hidden);

    var bar = container.querySelector('.scw-ws-v2-toolbar');
    if (!bar) return;
    var btns = bar.querySelectorAll('[data-scw-ws-v2-mode]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('scw-ws-v2-toolbar-btn--active',
        btns[i].getAttribute('data-scw-ws-v2-mode') === mode);
    }
    var photosBtn = bar.querySelector('[data-scw-ws-v2-photos-toggle]');
    if (photosBtn) {
      photosBtn.classList.toggle('scw-ws-v2-toolbar-btn--active', !hidden);
      photosBtn.setAttribute('aria-pressed', hidden ? 'false' : 'true');
    }
  }

  function build(viewKey) {
    var bar = document.createElement('div');
    bar.className = 'scw-ws-v2-toolbar';
    bar.innerHTML =
      '<div class="scw-ws-v2-toolbar-group" role="group" aria-label="View mode">' +
        btn('default',  'Default',      'Per-group accordion (default)') +
        btn('expand',   'Expand all',   'Open every group + show all rows') +
        btn('collapse', 'Collapse all', 'Close every group') +
        btn('summary',  'Summary only', 'Open every group + show only the L1 summary') +
      '</div>' +
      '<div class="scw-ws-v2-toolbar-group">' +
        '<button type="button" class="scw-ws-v2-toolbar-btn"' +
          ' data-scw-ws-v2-photos-toggle aria-pressed="true"' +
          ' title="Show/hide attached photos on expanded rows">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
            'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
            'stroke-linejoin="round">' +
            '<rect x="3" y="3" width="18" height="18" rx="2"></rect>' +
            '<circle cx="9" cy="9" r="1.8"></circle>' +
            '<path d="M21 16l-5-5-9 9"></path>' +
          '</svg>' +
          '<span>Photos</span>' +
        '</button>' +
      '</div>';
    return bar;
  }

  function btn(mode, label, title) {
    return '<button type="button" class="scw-ws-v2-toolbar-btn" ' +
      'data-scw-ws-v2-mode="' + mode + '" ' +
      'title="' + esc(title) + '">' + esc(label) + '</button>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  /** Mount the toolbar inside the v2 container for a given source view.
   *  Idempotent — re-runs on every re-render but only inserts once. */
  function mount(viewKey) {
    var container = document.getElementById('scw-ws-v2-' + viewKey);
    if (!container) return;

    var bar = container.querySelector(':scope > .scw-ws-v2-toolbar');
    if (!bar) {
      bar = build(viewKey);
      // Insert at the top, but AFTER any preview banner the user might
      // have injected. We just put it as the first child of container.
      container.insertBefore(bar, container.firstChild);

      bar.addEventListener('click', function (e) {
        var t = e.target && e.target.closest && e.target.closest('button');
        if (!t || !bar.contains(t)) return;
        if (t.hasAttribute('data-scw-ws-v2-mode')) {
          saveMode(viewKey, t.getAttribute('data-scw-ws-v2-mode'));
          applyState(container, viewKey);
        } else if (t.hasAttribute('data-scw-ws-v2-photos-toggle')) {
          savePhotosHidden(viewKey, !loadPhotosHidden(viewKey));
          applyState(container, viewKey);
        }
      });
    }
    applyState(container, viewKey);
  }

  ns.toolbar = {
    mount:           mount,
    loadMode:        loadMode,
    loadPhotosHidden: loadPhotosHidden
  };
})();
/*** END WORKSHEET V2 — TOOLBAR ***********************************************/
