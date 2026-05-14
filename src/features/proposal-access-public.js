/*** PUBLIC PROPOSAL ACCESS — Tokenized customer view ***********************
 *
 * Runs on the public proposal-access scene. The customer arrives at a URL
 * of the form:
 *
 *   https://<host>/<app-path>#proposal-access/?token=<hex-token>
 *
 * This module:
 *   1. Parses the token out of the hash query string.
 *   2. Tells a hidden Knack list view to fetch ONLY proposals whose
 *      access-token field (field_2904) equals that token, by setting
 *      a runtime filter on the view's Backbone model and calling
 *      .fetch(). The view is kept visually hidden (display:none) so
 *      the customer never sees the raw lookup table.
 *   3. After the view re-renders, reads the resulting records out of
 *      the model. We REQUIRE exactly one match — zero or many → fallback.
 *      We also re-check optional gates (active flag, superseded flag,
 *      expiration date) before rendering anything.
 *   4. Pulls the snapshot HTML field (default field_2680 — the same
 *      published-HTML field used by the sales-side preview) out of
 *      the matched record and injects it into:
 *           #scw-proposal-access-root
 *      If that mount node doesn't exist yet on the scene, we create
 *      one so we always have a deterministic insertion point.
 *   5. If anything goes wrong — bad/missing token, no match, multiple
 *      matches, missing snapshot HTML, gate failure, AJAX error — we
 *      render a polished fallback message instead of leaking details.
 *
 * Why filter on the model instead of a Make webhook
 * -------------------------------------------------
 * Knack's view-based REST endpoints respect view-level permissions,
 * so the hidden view can be configured in the Knack builder to be
 * publicly readable but only expose the fields/records we want. The
 * client-side filter is then just a convenience — even if a customer
 * tampered with the JS, they could only ever see records the view
 * itself permits. Treat the view's Knack-side configuration (filters,
 * fields, login requirement) as the actual security boundary.
 *
 * Future extension points (configured here, currently no-ops):
 *   ACTIVE_FIELD      — record must be active=Yes
 *   SUPERSEDED_FIELD  — record must NOT be superseded
 *   EXPIRATION_FIELD  — record's date must be >= today
 *   OTP_REQUIRED      — additional verification gate (not implemented yet)
 ****************************************************************************/
(function () {
  'use strict';

  // ── Configuration ───────────────────────────────────────────
  // Multiple scenes/views supported via SCENES array. Each entry is
  // self-contained — you can run this on more than one public scene
  // (e.g. legacy vs. v2 layouts) without code changes.
  var CONFIG = {
    // The hash-route prefix this feature handles. Must match the
    // route the sales-side generator builds into its URLs.
    HASH_ROUTE: 'proposal-access',

    // Fields on the proposal record.
    TOKEN_FIELD:       'field_2904',     // Proposal Access Token
    HTML_FIELD:        'field_2680',     // Published HTML snapshot
    EXPIRATION_FIELD:  'field_2659',     // Proposal expiration date (enabled)
    ACTIVE_FIELD:      null,             // optional: Yes/No
    SUPERSEDED_FIELD:  null,             // optional: Yes/No

    // Future gate — placeholder only. When implemented, set true
    // for scenes that should challenge for an OTP before render.
    OTP_REQUIRED: false,

    // The DOM id where the rendered proposal HTML gets injected.
    // If a node with this id already exists on the scene's template
    // we use it; otherwise we create one inside the scene container.
    MOUNT_ID: 'scw-proposal-access-root',

    SCENES: [
      {
        // The public Knack scene the customer lands on.
        sceneId:  'scene_1321',

        // Hidden Knack list view on the proposal object that exposes
        // field_2904 + field_2680 (+ field_2659 expiration). View-level
        // permissions (public read, narrowly-exposed fields) are the
        // real security boundary — see header.
        lookupViewId: 'view_3952'
      }
      // Add more scenes here if you stand up additional public surfaces.
    ],

    // Generic customer-facing fallback copy. Intentionally vague — we
    // don't want to leak which failure path was hit.
    FALLBACK_MESSAGE:
      'This proposal link is no longer active or could not be found. ' +
      'Please contact your SCW representative.'
  };

  var NS         = '.scwProposalAccess';
  var STYLE_ID   = 'scw-proposal-access-css';
  var STATE_KEY  = 'scwProposalAccessState';

  // ── Styles ──────────────────────────────────────────────────
  function injectStyles(sceneCfg) {
    if (document.getElementById(STYLE_ID)) return;
    var lookupHide = '#' + sceneCfg.lookupViewId + ' { display: none !important; }';
    var css = [
      lookupHide,
      '#' + CONFIG.MOUNT_ID + ' {',
      '  max-width: 980px; margin: 24px auto; padding: 0 16px;',
      '  font: 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;',
      '  color: #0f172a;',
      '}',
      '#' + CONFIG.MOUNT_ID + ' .scw-pa-loading,',
      '#' + CONFIG.MOUNT_ID + ' .scw-pa-error {',
      '  margin: 64px auto; padding: 28px 28px;',
      '  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;',
      '  text-align: center; max-width: 560px;',
      '  box-shadow: 0 2px 12px rgba(0,0,0,.04);',
      '}',
      '#' + CONFIG.MOUNT_ID + ' .scw-pa-error .scw-pa-title {',
      '  font-weight: 700; font-size: 18px; color: #0f172a; margin-bottom: 8px;',
      '}',
      '#' + CONFIG.MOUNT_ID + ' .scw-pa-error .scw-pa-body {',
      '  color: #475569; font-size: 14px; line-height: 1.5;',
      '}',
      '#' + CONFIG.MOUNT_ID + ' .scw-pa-loading {',
      '  color: #475569;',
      '}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Hash parsing ────────────────────────────────────────────
  // Hash format: "#proposal-access/?token=abc123"
  // We need to handle this safely even if upstream code rewrites
  // location.hash a few times during scene load.
  function readTokenFromHash() {
    var hash = window.location.hash || '';
    if (!hash) return '';
    // Strip leading '#'
    hash = hash.replace(/^#/, '');
    // Confirm this is our route — don't try to read tokens off
    // unrelated routes (defensive — the scene binding already
    // gates this, but a hash change mid-session could happen).
    var routeRe = new RegExp('^' + CONFIG.HASH_ROUTE + '(?:/|$)');
    if (!routeRe.test(hash)) return '';
    // Split route from query
    var qIdx = hash.indexOf('?');
    if (qIdx === -1) return '';
    var qs = hash.substring(qIdx + 1);
    var pairs = qs.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var kv = pairs[i].split('=');
      if (decodeURIComponent(kv[0] || '') === 'token') {
        return decodeURIComponent(kv[1] || '').trim();
      }
    }
    return '';
  }

  // Hex tokens only — anything outside [0-9a-f] is rejected. This
  // is a defense-in-depth check; the real filter is the Knack
  // backend equality match.
  function isPlausibleToken(t) {
    return typeof t === 'string' && t.length >= 16 && /^[0-9a-fA-F]+$/.test(t);
  }

  // ── Mount node ──────────────────────────────────────────────
  function ensureMountNode() {
    var el = document.getElementById(CONFIG.MOUNT_ID);
    if (el) return el;
    // Fall back to creating one inside the active scene.
    var scene = document.querySelector('.kn-scene') || document.body;
    el = document.createElement('div');
    el.id = CONFIG.MOUNT_ID;
    scene.appendChild(el);
    return el;
  }

  function renderLoading() {
    var el = ensureMountNode();
    el.innerHTML =
      '<div class="scw-pa-loading">Loading your proposal…</div>';
  }

  function renderFallback() {
    var el = ensureMountNode();
    el.innerHTML =
      '<div class="scw-pa-error">' +
        '<div class="scw-pa-title">Proposal Unavailable</div>' +
        '<div class="scw-pa-body">' + escapeHtml(CONFIG.FALLBACK_MESSAGE) + '</div>' +
      '</div>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // ── Knack model filter + fetch ──────────────────────────────
  //
  // The lookup view is a Knack list view of the proposal object with
  // field_2904 exposed. We override its filters at runtime to be an
  // equality match on the token, then call .fetch() so Knack re-
  // requests the records. After the resulting knack-view-render
  // fires, we read view.model.data.models[] back.
  //
  // Why not just set a URL param: Knack's auto-filter URL params work
  // (e.g. view_XXXX_filters=) but they're easier for a customer to
  // notice and tamper with than runtime model filters. Functionally
  // both end up calling the same server endpoint with the same
  // protections.
  function applyLookupFilter(sceneCfg, token) {
    var view = window.Knack && Knack.views && Knack.views[sceneCfg.lookupViewId];
    if (!view || !view.model) return false;

    // Backbone view models on Knack list/table views support a
    // .setFilters() / .fetch() flow. The shape Knack expects:
    //   { match: 'and', rules: [ { field, operator, value } ] }
    var filterSpec = {
      match: 'and',
      rules: [
        { field: CONFIG.TOKEN_FIELD, operator: 'is', value: token }
      ]
    };

    try {
      // Newer Knack versions expose setFilters() — preferred.
      if (typeof view.model.setFilters === 'function') {
        view.model.setFilters(filterSpec);
      } else if (view.model.view) {
        // Older shape: filters live on the view config.
        view.model.view.filters = filterSpec;
      }
      // Trigger a fetch. Knack will re-render the view on success,
      // firing knack-view-render.<viewId> — that's where we read out.
      view.model.fetch();
      return true;
    } catch (e) {
      console.warn('[scw-proposal-access] Filter/fetch failed', e);
      return false;
    }
  }

  function readRecordsFromView(viewId) {
    try {
      var view = Knack.views[viewId];
      var data = view && view.model && view.model.data;
      if (!data) return [];
      // Knack's data shape varies — .models[] for Backbone collections,
      // or a plain array for some list views.
      var models = data.models || data;
      if (!Array.isArray(models)) return [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        var attrs = (models[i] && models[i].attributes) || models[i];
        if (attrs) out.push(attrs);
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  // ── Gate checks (active / superseded / expiration) ──────────
  // All optional — when the corresponding CONFIG field is null we
  // skip the check entirely. This lets us land the feature now and
  // turn each gate on later by just setting a field key.
  function passesGates(attrs) {
    // Active flag — record must be Yes/true if configured.
    if (CONFIG.ACTIVE_FIELD) {
      if (!isYes(attrs[CONFIG.ACTIVE_FIELD + '_raw']) && !isYes(attrs[CONFIG.ACTIVE_FIELD])) {
        return false;
      }
    }
    // Superseded flag — must be NOT-yes when configured.
    if (CONFIG.SUPERSEDED_FIELD) {
      if (isYes(attrs[CONFIG.SUPERSEDED_FIELD + '_raw']) || isYes(attrs[CONFIG.SUPERSEDED_FIELD])) {
        return false;
      }
    }
    // Expiration — date field must be today or later when configured.
    if (CONFIG.EXPIRATION_FIELD) {
      var raw = attrs[CONFIG.EXPIRATION_FIELD + '_raw'];
      var dateStr =
        (raw && (raw.iso_timestamp || raw.date || raw.date_formatted)) ||
        attrs[CONFIG.EXPIRATION_FIELD];
      if (!dateStr) return false;
      var expiry = new Date(dateStr);
      if (isNaN(expiry.getTime())) return false;
      // Compare on a calendar-day basis so end-of-day is still valid.
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiry < today) return false;
    }
    return true;
  }

  function isYes(v) {
    if (v === true) return true;
    if (typeof v === 'string') return /^(yes|true)$/i.test(v.trim());
    return false;
  }

  // ── Render the proposal HTML ────────────────────────────────
  function renderProposal(attrs) {
    var html = attrs[CONFIG.HTML_FIELD + '_raw'] || attrs[CONFIG.HTML_FIELD] || '';
    if (!html) { renderFallback(); return; }

    var mount = ensureMountNode();
    // Strip wrapping <span> Knack may have added on the rich-text field.
    html = String(html).replace(/^<span>([\s\S]*)<\/span>$/i, '$1');

    // We DELIBERATELY set innerHTML rather than using an iframe here.
    // The HTML snapshot is generated by our own publish pipeline and
    // stored on a field only writable by sales staff. If you ever
    // accept HTML from less-trusted sources, switch to the iframe
    // pattern used by published-proposal-render.js.
    mount.innerHTML = html;
  }

  // ── Main flow per scene render ──────────────────────────────
  function handleSceneRender(sceneCfg) {
    injectStyles(sceneCfg);

    var token = readTokenFromHash();
    if (!isPlausibleToken(token)) {
      renderFallback();
      return;
    }

    // Remember state across the async fetch → re-render hop.
    window[STATE_KEY] = { token: token, sceneCfg: sceneCfg, pending: true };

    renderLoading();

    // Tell the hidden view to fetch matching records. If the view
    // isn't ready yet (Knack hasn't constructed it), retry once the
    // view first renders.
    if (!applyLookupFilter(sceneCfg, token)) {
      // Wait for first render of the lookup view, then apply filter.
      SCW.onViewRender(sceneCfg.lookupViewId, function () {
        if (!window[STATE_KEY] || !window[STATE_KEY].pending) return;
        applyLookupFilter(sceneCfg, token);
      }, 'scwProposalAccessRetry');
    }
  }

  function handleLookupRender(sceneCfg) {
    var state = window[STATE_KEY];
    if (!state || !state.pending) return;
    if (state.sceneCfg.sceneId !== sceneCfg.sceneId) return;

    var records = readRecordsFromView(sceneCfg.lookupViewId);

    // Reject anything other than exactly one match.
    if (!records || records.length !== 1) {
      renderFallback();
      state.pending = false;
      return;
    }

    var attrs = records[0];

    if (!passesGates(attrs)) {
      renderFallback();
      state.pending = false;
      return;
    }

    if (CONFIG.OTP_REQUIRED) {
      // Placeholder — OTP/email-verification gate goes here. For now
      // we treat OTP_REQUIRED=true as "feature flagged off, fail closed"
      // so flipping the config to true won't accidentally expose
      // proposals before the verification UI is wired up.
      renderFallback();
      state.pending = false;
      return;
    }

    try {
      renderProposal(attrs);
    } catch (e) {
      console.warn('[scw-proposal-access] Render failed', e);
      renderFallback();
    }
    state.pending = false;
  }

  // ── Init: bind to each configured scene + its lookup view ───
  CONFIG.SCENES.forEach(function (sceneCfg) {
    SCW.onSceneRender(sceneCfg.sceneId, function () {
      handleSceneRender(sceneCfg);
    }, 'scwProposalAccess');

    SCW.onViewRender(sceneCfg.lookupViewId, function () {
      handleLookupRender(sceneCfg);
    }, 'scwProposalAccessLookup');

    // If the user navigates the hash within the same scene (e.g.
    // pastes a different token), re-run the flow.
    $(window).off('hashchange' + NS + '_' + sceneCfg.sceneId)
             .on('hashchange'  + NS + '_' + sceneCfg.sceneId, function () {
      // Only act if we're still on the proposal-access route.
      var hash = (window.location.hash || '').replace(/^#/, '');
      if (new RegExp('^' + CONFIG.HASH_ROUTE + '(?:/|$)').test(hash)) {
        handleSceneRender(sceneCfg);
      }
    });
  });
})();
/*** END PUBLIC PROPOSAL ACCESS — Tokenized customer view *******************/
