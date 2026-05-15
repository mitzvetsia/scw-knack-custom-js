/*** SECURE PROPOSAL LINK — Sales-side generator ******************************
 *
 * Adds a "Generate Secure Proposal Link" button to one or more Sales-side
 * proposal detail pages. On click:
 *
 *   1. Reads the current proposal record id from the configured detail view.
 *   2. Generates a 256-bit (32-byte) cryptographically random token via
 *      crypto.getRandomValues() and hex-encodes it.
 *   3. PUTs { field_2904: <token> } against a configured save view so the
 *      record stores the token.
 *   4. Builds a public URL of the form:
 *        https://<host>/<app-path>#proposal-access/?token=<token>
 *      and renders a read-only input + "Copy Link" button.
 *   5. Attempts navigator.clipboard.writeText() and shows a success/error
 *      state inline.
 *
 * Token regeneration policy
 * -------------------------
 * If a token already exists on the record we show the existing link
 * immediately and put the action button into "Regenerate Link" mode.
 * Regenerating is gated behind a confirm() — it invalidates the previous
 * link, so we never silently rotate a live URL out from under a customer.
 * (Picked this over "always regenerate on click" because losing access to
 * a proposal that's already been sent is the worst failure mode here.)
 *
 * Configuration
 * -------------
 * Add entries to CONFIG.SCENES to enable on additional sales pages. Each
 * entry is self-contained — no single-view assumptions. The token field,
 * URL hash route, and mount target are all overridable per scene.
 *
 * Future extension points (already wired through config so adding them is
 * a one-line change, not a rewrite):
 *   • expirationField — write an ISO date alongside the token
 *   • activeField     — flip a Yes/No "active" flag on regenerate/revoke
 *   • supersededField — mark the previous link as superseded
 ******************************************************************************/
(function () {
  'use strict';

  // ── Configuration ────────────────────────────────────────────
  // Add a new SCENES entry for each Sales-side proposal page that
  // should offer the secure-link generator.
  var CONFIG = {
    // The hash route on the public scene — must match the scene slug
    // on the public access page in Knack Builder, AND must match the
    // HASH_ROUTE in the public-side snippet. Keep all three in sync.
    PUBLIC_HASH_ROUTE: 'project-proposal',

    // Fields on the proposal/published-proposal object. Only TOKEN_FIELD
    // is required today; the others are scaffolding for upcoming work
    // (expiration, active/superseded). Leave as null to disable.
    TOKEN_FIELD:       'field_2904',     // Proposal Access Token
    LINK_FIELD:        'field_2908',     // Cached full public URL
                                          //   (kept in sync with TOKEN_FIELD
                                          //   so reports / email merges can
                                          //   reference the link without
                                          //   re-building it from the token)
    EXPIRATION_FIELD:  null,             // e.g. 'field_XXXX' (date)
    ACTIVE_FIELD:      null,             // e.g. 'field_XXXX' (Yes/No)
    SUPERSEDED_FIELD:  null,             // e.g. 'field_XXXX' (Yes/No)

    // Token: 32 random bytes → 64-char hex. Plenty of entropy, URL-safe.
    TOKEN_BYTES: 32,

    // Per-scene wiring. Each entry must specify:
    //   sceneId        — scene this runs on
    //   detailViewId   — kn-details view of the proposal record (used to
    //                    read the record id + existing token)
    //   saveViewId     — view used in the PUT URL; usually the same
    //                    detail view, OR a hidden form/edit view that
    //                    has write access to TOKEN_FIELD (e.g. view_3951)
    //   mountTarget    — DOM selector (relative to document) where the
    //                    button + readout panel get inserted. Defaults
    //                    to placing it inside the detail view.
    SCENES: [
      {
        sceneId:      'scene_1279',       // Published Proposal (sales-side)
        detailViewId: 'view_3813',
        saveViewId:   'view_3951',         // Hidden form-view with field_2904
        mountTarget:  null                 // null → append after the detail view
      }
      // Add more scenes here:
      // { sceneId: 'scene_XXXX', detailViewId: 'view_YYYY', saveViewId: 'view_ZZZZ' }
    ]
  };

  var NS         = '.scwSecureProposalLink';
  var PANEL_ID   = 'scw-secure-link-panel';   // wrapper element id — unique-per-scene; only one ever on the page at a time
  var BTN_CLASS  = 'scw-secure-link-btn';
  var STYLE_ID   = 'scw-secure-link-css';
  var HEX24      = /^[0-9a-f]{24}$/i;

  // ── Styles ───────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    // Hide every configured saveViewId — those are hidden update forms
    // that exist solely so the PUT has write access to TOKEN_FIELD /
    // LINK_FIELD. Rendering them would show a stray "Update SOW_published
    // proposal" form with a token text input on the page.
    var saveViewHides = CONFIG.SCENES
      .map(function (s) { return s.saveViewId; })
      .filter(Boolean)
      .map(function (id) { return '#' + id + ' { display: none !important; }'; })
      .join('\n');
    var css = [
      saveViewHides,
      '#' + PANEL_ID + ' {',
      '  margin: 14px 0; padding: 14px 16px;',
      '  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;',
      '  font: 14px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;',
      '}',
      '#' + PANEL_ID + ' .scw-sl-title {',
      '  font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 8px;',
      '}',
      '#' + PANEL_ID + ' .scw-sl-row {',
      '  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;',
      '}',
      '#' + PANEL_ID + ' input.scw-sl-url {',
      '  flex: 1 1 320px; min-width: 240px;',
      '  padding: 8px 10px; font: 13px/1.3 ui-monospace,Menlo,monospace;',
      '  background: #fff; border: 1px solid #cbd5e1; border-radius: 6px;',
      '  color: #0f172a;',
      '}',
      '#' + PANEL_ID + ' button.' + BTN_CLASS + ' {',
      '  padding: 8px 14px; font: 600 13px/1 system-ui,sans-serif;',
      '  color: #fff; background: #07467c; border: none; border-radius: 6px;',
      '  cursor: pointer;',
      '}',
      '#' + PANEL_ID + ' button.' + BTN_CLASS + ':hover { opacity: 0.92; }',
      '#' + PANEL_ID + ' button.' + BTN_CLASS + '.scw-sl-copy { background: #0f4c75; }',
      '#' + PANEL_ID + ' button.' + BTN_CLASS + '.scw-sl-regen { background: #b45309; }',
      '#' + PANEL_ID + ' button.' + BTN_CLASS + '[disabled] { opacity: 0.55; cursor: default; }',
      '#' + PANEL_ID + ' .scw-sl-status {',
      '  margin-top: 8px; font-size: 13px;',
      '}',
      '#' + PANEL_ID + ' .scw-sl-status.is-ok    { color: #15803d; }',
      '#' + PANEL_ID + ' .scw-sl-status.is-err   { color: #b91c1c; }',
      '#' + PANEL_ID + ' .scw-sl-status.is-info  { color: #475569; }'
    ].join('\n');

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Token + URL helpers ──────────────────────────────────────

  // 32 random bytes → 64-char lowercase hex. crypto.getRandomValues is
  // available everywhere we run; if it's somehow missing we refuse to
  // proceed rather than fall back to Math.random.
  function generateToken() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') {
      throw new Error('crypto.getRandomValues unavailable — refusing to generate token');
    }
    var bytes = new Uint8Array(CONFIG.TOKEN_BYTES);
    window.crypto.getRandomValues(bytes);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      hex += (h.length === 1 ? '0' : '') + h;
    }
    return hex;
  }

  // Build the public URL. Uses window.location.origin + the current
  // Knack app slug so the same code works in any Knack environment
  // (preview vs production, custom domains, etc.) without hardcoding.
  function buildPublicUrl(token) {
    var origin = window.location.origin;
    // Knack hash routes follow the path part. The path up to "#" is the
    // app's base. e.g.  https://scw.knack.com/proposals#some-route/...
    var pathPart = window.location.pathname || '/';
    return origin + pathPart + '#' + CONFIG.PUBLIC_HASH_ROUTE + '/?token=' + encodeURIComponent(token);
  }

  // ── Knack model access ───────────────────────────────────────

  function getDetailAttrs(viewId) {
    try {
      var v = window.Knack && Knack.views && Knack.views[viewId];
      return v && v.model && (
        v.model.attributes || (v.model.data && v.model.data.attributes)
      ) || null;
    } catch (e) { return null; }
  }

  function getRecordId(viewId) {
    var attrs = getDetailAttrs(viewId);
    var id = attrs && attrs.id;
    return (id && HEX24.test(id)) ? id : '';
  }

  function getExistingToken(viewId) {
    var attrs = getDetailAttrs(viewId);
    if (!attrs) return '';
    var raw = attrs[CONFIG.TOKEN_FIELD + '_raw'];
    if (raw != null && raw !== '') return String(raw).trim();
    var v = attrs[CONFIG.TOKEN_FIELD];
    if (v == null) return '';
    // Knack returns plain text fields as-is. Strip any wrapping tags
    // just in case (some fields render as HTML in details views).
    return String(v).replace(/<[^>]*>/g, '').trim();
  }

  // PUT { field_2904: token } against the configured save view.
  // SCW.knackAjax wraps $.ajax with Knack auth headers + 401 handling.
  function saveToken(sceneCfg, recordId, token, onDone, onError) {
    var url  = buildPublicUrl(token);
    var data = {};
    data[CONFIG.TOKEN_FIELD] = token;
    if (CONFIG.LINK_FIELD)   data[CONFIG.LINK_FIELD]       = url;
    // Scaffolding for future fields — only write if configured.
    if (CONFIG.ACTIVE_FIELD)     data[CONFIG.ACTIVE_FIELD]     = 'Yes';
    if (CONFIG.SUPERSEDED_FIELD) data[CONFIG.SUPERSEDED_FIELD] = 'No';
    // EXPIRATION_FIELD intentionally left untouched — set policy is
    // separate from rotate policy.

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(sceneCfg.saveViewId, recordId),
      type: 'PUT',
      data: JSON.stringify(data),
      success: function (resp) {
        // Sync Knack's Backbone model on the *detail* view so
        // subsequent reads see the new token without a refresh.
        try {
          var dv = Knack.views[sceneCfg.detailViewId];
          if (dv && dv.model && typeof dv.model.set === 'function') {
            var patch = {};
            patch[CONFIG.TOKEN_FIELD]          = token;
            patch[CONFIG.TOKEN_FIELD + '_raw'] = token;
            if (CONFIG.LINK_FIELD) {
              patch[CONFIG.LINK_FIELD]          = url;
              patch[CONFIG.LINK_FIELD + '_raw'] = url;
            }
            dv.model.set(patch, { silent: true });
          }
        } catch (e) { /* non-fatal */ }
        onDone && onDone(resp);
      },
      error: function (xhr) {
        console.warn('[scw-secure-link] Token save failed', xhr && xhr.status, xhr && xhr.responseText);
        onError && onError(xhr);
      }
    });
  }

  // ── Clipboard ────────────────────────────────────────────────
  // navigator.clipboard requires a secure context AND a user gesture.
  // We're already inside the button click handler so the gesture is
  // satisfied. Fall back to document.execCommand for older browsers.
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand copy failed'));
      } catch (e) { reject(e); }
    });
  }

  // ── Panel rendering ──────────────────────────────────────────

  function setStatus(panel, kind, msg) {
    var el = panel.querySelector('.scw-sl-status');
    if (!el) return;
    el.className = 'scw-sl-status is-' + kind;
    el.textContent = msg || '';
  }

  // Renders the panel into `mountEl` and wires its buttons.
  // existingToken === '' → "Generate Secure Proposal Link" mode
  // existingToken non-empty → readout + "Copy Link" + "Regenerate Link"
  function renderPanel(sceneCfg, mountEl, existingToken) {
    // Remove a prior panel so re-renders don't stack copies.
    var prior = document.getElementById(PANEL_ID);
    if (prior) prior.remove();

    var hasToken = !!existingToken;
    var url = hasToken ? buildPublicUrl(existingToken) : '';

    var panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML =
      '<div class="scw-sl-title">Secure Proposal Link</div>' +
      '<div class="scw-sl-row">' +
        (hasToken
          ? '<input type="text" class="scw-sl-url" readonly value="' + escapeAttr(url) + '">' +
            '<button type="button" class="' + BTN_CLASS + ' scw-sl-copy">Copy Link</button>' +
            '<button type="button" class="' + BTN_CLASS + ' scw-sl-regen">Regenerate Link</button>'
          : '<button type="button" class="' + BTN_CLASS + ' scw-sl-gen">Generate Secure Proposal Link</button>'
        ) +
      '</div>' +
      '<div class="scw-sl-status is-info">' +
        (hasToken
          ? 'A secure link already exists for this proposal. Regenerating will invalidate the previous link.'
          : '') +
      '</div>';

    mountEl.appendChild(panel);
    wirePanel(sceneCfg, panel);
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function wirePanel(sceneCfg, panel) {
    var btnGen   = panel.querySelector('.scw-sl-gen');
    var btnCopy  = panel.querySelector('.scw-sl-copy');
    var btnRegen = panel.querySelector('.scw-sl-regen');
    var input    = panel.querySelector('input.scw-sl-url');

    if (btnGen)   btnGen.addEventListener('click',   function () { handleGenerate(sceneCfg, panel, false); });
    if (btnRegen) btnRegen.addEventListener('click', function () { handleGenerate(sceneCfg, panel, true);  });
    if (btnCopy)  btnCopy.addEventListener('click',  function () { handleCopy(panel, input && input.value); });
  }

  function handleGenerate(sceneCfg, panel, isRegen) {
    if (isRegen) {
      var ok = window.confirm(
        'Regenerate this proposal’s secure link?\n\n' +
        'The current link will stop working immediately. Anyone you’ve already ' +
        'sent it to will need the new link.'
      );
      if (!ok) return;
    }

    var recordId = getRecordId(sceneCfg.detailViewId);
    if (!recordId) {
      setStatus(panel, 'err', 'Could not determine the proposal record id.');
      return;
    }

    var token;
    try { token = generateToken(); }
    catch (e) {
      setStatus(panel, 'err', 'Token generation failed: ' + e.message);
      return;
    }

    // Lock the buttons while saving
    Array.prototype.forEach.call(panel.querySelectorAll('button'), function (b) { b.disabled = true; });
    setStatus(panel, 'info', isRegen ? 'Regenerating link…' : 'Generating link…');

    saveToken(sceneCfg, recordId, token, function () {
      // Re-render in "existing token" mode and auto-copy.
      var mount = panel.parentElement;
      renderPanel(sceneCfg, mount, token);
      var newPanel = document.getElementById(PANEL_ID);
      var newInput = newPanel && newPanel.querySelector('input.scw-sl-url');
      copyToClipboard(newInput ? newInput.value : buildPublicUrl(token))
        .then(function ()  { setStatus(newPanel, 'ok',  'Link generated and copied to clipboard.'); })
        .catch(function () { setStatus(newPanel, 'info','Link generated. Copy it manually — the browser blocked auto-copy.'); });
    }, function (xhr) {
      Array.prototype.forEach.call(panel.querySelectorAll('button'), function (b) { b.disabled = false; });
      var msg = 'Could not save the token.';
      if (xhr && xhr.status === 403) msg += ' (Permission denied — check the configured save view.)';
      setStatus(panel, 'err', msg);
    });
  }

  function handleCopy(panel, url) {
    if (!url) return;
    copyToClipboard(url)
      .then(function ()  { setStatus(panel, 'ok',  'Link copied to clipboard.'); })
      .catch(function () { setStatus(panel, 'err', 'Copy failed — select the link and copy manually.'); });
  }

  // ── Mounting ─────────────────────────────────────────────────

  function findMountPoint(sceneCfg) {
    // Explicit selector wins if provided.
    if (sceneCfg.mountTarget) {
      var el = document.querySelector(sceneCfg.mountTarget);
      if (el) return el;
    }
    // Default: as a previousSibling of the detail view, inside the
    // same view-column. published-proposal-render.js inserts the
    // proposal iframe as the detail view's nextSibling, so this
    // places the panel directly above the proposal preview at the
    // same horizontal width — top of the page visually, no narrow
    // sidebar artifact from being parked in a flex container that
    // wasn't sized for us.
    var detail = document.getElementById(sceneCfg.detailViewId);
    if (!detail || !detail.parentNode) return null;
    var host = document.getElementById('scw-secure-link-host-' + sceneCfg.sceneId);
    if (!host) {
      host = document.createElement('div');
      host.id = 'scw-secure-link-host-' + sceneCfg.sceneId;
    }
    if (host !== detail.previousSibling) {
      detail.parentNode.insertBefore(host, detail);
    }
    return host;
  }

  function bootSceneCfg(sceneCfg) {
    injectStyles();
    var mount = findMountPoint(sceneCfg);
    if (!mount) return;

    var recordId = getRecordId(sceneCfg.detailViewId);
    if (!recordId) return;       // detail view hasn't populated yet

    var existing = getExistingToken(sceneCfg.detailViewId);
    renderPanel(sceneCfg, mount, existing);
  }

  // ── Init: bind to each configured scene ──────────────────────
  CONFIG.SCENES.forEach(function (sceneCfg) {
    // Re-attempt on every render of the detail view — the detail view
    // re-renders after edits to fields on this scene, and we want the
    // panel to refresh its "existing token" state if the field was
    // changed elsewhere.
    SCW.onViewRender(sceneCfg.detailViewId, function () {
      // Small defer so Knack finishes wiring view.model.attributes.
      setTimeout(function () { bootSceneCfg(sceneCfg); }, 150);
    }, 'scwSecureProposalLink');

    // Scene-level cleanup: remove the panel when leaving the scene so
    // a stale node doesn't bleed into other pages.
    $(document).on('knack-scene-render.any' + NS + '_' + sceneCfg.sceneId, function (event, scene) {
      if (scene && scene.key !== sceneCfg.sceneId) {
        var panel = document.getElementById(PANEL_ID);
        if (panel) panel.remove();
        var host  = document.getElementById('scw-secure-link-host-' + sceneCfg.sceneId);
        if (host) host.remove();
      }
    });
  });
})();
/*** END SECURE PROPOSAL LINK — Sales-side generator **************************/
