/* ============================================================
 * PROPOSAL ACCESS — PUBLIC TOKENIZED VIEW (Knack-side snippet)
 * ============================================================
 *
 * PASTE THIS INTO KNACK'S CUSTOM JS INPUT (Settings → API & Code → JS).
 *
 * This snippet is fully self-contained — it has NO dependency on
 * window.SCW, no dependency on the CDN bundle, and no dependency
 * on any other custom JS. It only needs:
 *   • jQuery (loaded by Knack by default)
 *   • The Knack global (loaded by Knack by default)
 *
 * WHAT IT DOES
 * ============
 *
 * The customer arrives at a URL of the form:
 *
 *   https://<your-app>.knack.com/<app-path>#proposal-access/?token=<hex>
 *
 *   (Or whatever HASH_ROUTE you've configured below — the sales-side
 *   "Generate Secure Proposal Link" feature builds URLs in this shape.)
 *
 * On the public proposal-access scene:
 *
 *   1. Read the `token=` parameter off the hash query string.
 *   2. Apply a runtime filter on a HIDDEN Knack list view so it only
 *      fetches proposals whose access-token field (field_2904) equals
 *      that token. The hidden view is what does the actual database
 *      lookup — it's configured in the Knack Builder to be publicly
 *      readable but expose ONLY the fields we want
 *      (field_2904 + field_2680).
 *   3. Wait for the hidden view to re-render, then read its records.
 *   4. Require EXACTLY ONE matching record. Zero or many → fallback.
 *      Then run any optional gate checks (active flag, superseded,
 *      expiration date).
 *   5. Inject the snapshot HTML (field_2680) into a mount node
 *      (#scw-proposal-access-root) on the page.
 *   6. On any failure path render a polished generic fallback message
 *      — never leak which check failed.
 *
 * SECURITY MODEL
 * ==============
 *
 * The Knack view itself is the security boundary. Even if a customer
 * tampered with this JS, they could only ever read what the view
 * permits. So:
 *
 *   • The hidden view MUST be configured to expose ONLY the fields
 *     used here (field_2904 for matching, field_2680 for rendering,
 *     plus optionally the active/superseded/expiration fields if you
 *     turn those gates on). Do not expose pricing, customer PII, or
 *     any field that isn't needed for the public render.
 *
 *   • The hidden view MUST be a list view (not a details view) that
 *     allows record-level filtering via the API. The page itself
 *     must NOT require login.
 *
 *   • field_2904 should be a plain text field. Tokens are 64-char
 *     lowercase hex (32 random bytes). Anything that isn't plausibly
 *     hex is rejected client-side before any request goes out.
 *
 * CONFIGURATION
 * =============
 *
 * Fill in the four UPPERCASE values below before pasting into Knack:
 *
 *   SCENE_ID         → public proposal-access scene id
 *   LOOKUP_VIEW_ID   → hidden list view id (proposals object, exposes
 *                      field_2904 + field_2680, public read)
 *   TOKEN_FIELD      → 'field_2904' (Proposal Access Token)
 *   HTML_FIELD       → 'field_2680' (Published HTML snapshot)
 *
 * The HASH_ROUTE must match the route the sales-side link generator
 * builds into its URLs. Default 'proposal-access'.
 *
 * Optional gate fields (leave null to disable):
 *   ACTIVE_FIELD       → Yes/No flag — record must be Yes
 *   SUPERSEDED_FIELD   → Yes/No flag — record must NOT be Yes
 *   EXPIRATION_FIELD   → Date field — must be today or later
 * ============================================================ */

(function () {
  'use strict';

  // ---- CONFIG (edit these) ----------------------------------------------
  var SCENE_ID         = 'scene_1321';              // Public proposal-access scene
  var LOOKUP_VIEW_ID   = 'view_3952';               // Hidden list view (proposal object)
  var TOKEN_FIELD      = 'field_2904';              // Proposal Access Token
  var HTML_FIELD       = 'field_2680';              // Snapshot HTML to render
  var HASH_ROUTE       = 'project-proposal';        // matches scene_1321 slug AND the sales-side URL builder

  // Optional gates — set to a field key to enable; leave null to skip.
  var ACTIVE_FIELD     = null;             // e.g. 'field_XXXX' (Yes/No flag)
  var SUPERSEDED_FIELD = null;             // e.g. 'field_XXXX' (Yes/No flag)
  var EXPIRATION_FIELD = 'field_2659';     // Proposal expiration date (enabled)

  // Placeholder for future email/OTP verification step. Setting this
  // to true today FAILS CLOSED — nothing will render until the OTP
  // UI is wired up. Leave false until that work lands.
  var OTP_REQUIRED     = false;

  // DOM id where the proposal HTML gets injected. If the scene's
  // Knack template doesn't already contain a node with this id, the
  // snippet will create one inside the scene container.
  var MOUNT_ID         = 'scw-proposal-access-root';

  // Customer-facing fallback message. Intentionally vague — don't
  // reveal which failure path was hit.
  var FALLBACK_MESSAGE =
    'This proposal link is no longer active or could not be found. ' +
    'Please contact your SCW representative.';

  // -----------------------------------------------------------------------
  // Everything below is implementation. You shouldn't need to edit it.
  // -----------------------------------------------------------------------

  var STYLE_ID = 'scw-proposal-access-css';
  var NS       = '.scwProposalAccessSnippet';
  // Cross-render state. We store the parsed token + "pending" flag on
  // window so that when the scene-render handler kicks off a fetch
  // and the lookup-view-render handler fires later, both can see the
  // same in-flight request.
  var STATE_KEY = '__scwProposalAccessState';

  // ---- Styles -----------------------------------------------------------
  // Hide the lookup view (it would otherwise show a raw record table
  // to the customer). Styled fallback + loading states use the same
  // mount node we render the proposal into.
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '#' + LOOKUP_VIEW_ID + ' { display: none !important; }\n' +
      '#' + MOUNT_ID + ' {\n' +
      '  max-width: 980px; margin: 24px auto; padding: 0 16px;\n' +
      '  font: 14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;\n' +
      '  color: #0f172a;\n' +
      '}\n' +
      '#' + MOUNT_ID + ' .scw-pa-loading,\n' +
      '#' + MOUNT_ID + ' .scw-pa-error {\n' +
      '  margin: 64px auto; padding: 28px 28px;\n' +
      '  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;\n' +
      '  text-align: center; max-width: 560px;\n' +
      '  box-shadow: 0 2px 12px rgba(0,0,0,.04);\n' +
      '}\n' +
      '#' + MOUNT_ID + ' .scw-pa-error .scw-pa-title {\n' +
      '  font-weight: 700; font-size: 18px; color: #0f172a; margin-bottom: 8px;\n' +
      '}\n' +
      '#' + MOUNT_ID + ' .scw-pa-error .scw-pa-body {\n' +
      '  color: #475569; font-size: 14px; line-height: 1.5;\n' +
      '}\n' +
      '#' + MOUNT_ID + ' .scw-pa-loading { color: #475569; }\n';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- Hash parsing -----------------------------------------------------
  // The customer URL looks like: #proposal-access/?token=abc123
  // We walk the query string manually rather than relying on a URL
  // helper, because hash-routed Knack URLs aren't standard URL syntax.
  function readTokenFromHash() {
    var hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash) return '';
    // Confirm we're on the right route before reading the token.
    var routeRe = new RegExp('^' + HASH_ROUTE + '(?:/|$)');
    if (!routeRe.test(hash)) return '';
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

  // Defense-in-depth: reject anything that doesn't look like hex.
  // Real tokens generated by the sales-side feature are 64-char hex.
  // The Knack backend filter is the real gate — this just avoids
  // pointless API calls on obvious garbage tokens.
  function isPlausibleToken(t) {
    return typeof t === 'string' && t.length >= 16 && /^[0-9a-fA-F]+$/.test(t);
  }

  // ---- Mount node + render helpers -------------------------------------
  function ensureMountNode() {
    var el = document.getElementById(MOUNT_ID);
    if (el) return el;
    var scene = document.querySelector('.kn-scene') || document.body;
    el = document.createElement('div');
    el.id = MOUNT_ID;
    scene.appendChild(el);
    return el;
  }

  function renderLoading() {
    ensureMountNode().innerHTML =
      '<div class="scw-pa-loading">Loading your proposal…</div>';
  }

  function renderFallback() {
    ensureMountNode().innerHTML =
      '<div class="scw-pa-error">' +
        '<div class="scw-pa-title">Proposal Unavailable</div>' +
        '<div class="scw-pa-body">' + escapeHtml(FALLBACK_MESSAGE) + '</div>' +
      '</div>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  // ---- Apply runtime filter on the hidden lookup view ------------------
  //
  // The lookup view is a Knack list view of the proposal object. We
  // override its Backbone model's filters at runtime so it only fetches
  // the one record matching our token, then call .fetch() to re-pull
  // from the server. After Knack finishes the request it fires
  // knack-view-render.<viewId>, which is where we read out the result.
  //
  // Filter shape Knack expects:
  //   { match: 'and', rules: [ { field, operator, value } ] }
  //
  // Knack's "is" operator does exact equality on plain text fields,
  // which is what we want for a hex token. We're NOT using "contains"
  // or any fuzzy operator — exact match only.
  function applyLookupFilter(token) {
    var view = window.Knack && Knack.views && Knack.views[LOOKUP_VIEW_ID];
    if (!view || !view.model) return false;

    var filterSpec = {
      match: 'and',
      rules: [
        { field: TOKEN_FIELD, operator: 'is', value: token }
      ]
    };

    try {
      if (typeof view.model.setFilters === 'function') {
        // Modern Knack — preferred path.
        view.model.setFilters(filterSpec);
      } else if (view.model.view) {
        // Older shape: filters live on the view config object.
        view.model.view.filters = filterSpec;
      }
      // Triggers a server fetch. On success Knack re-renders the view
      // and fires the knack-view-render event our handler below listens for.
      view.model.fetch();
      return true;
    } catch (e) {
      console.warn('[proposal-access] Filter/fetch failed', e);
      return false;
    }
  }

  // Knack list views store fetched records on view.model.data — either
  // as a Backbone-style collection (.models[]) or a plain array.
  // Normalize to a plain array of attribute objects.
  function readRecordsFromView(viewId) {
    try {
      var view = Knack.views[viewId];
      var data = view && view.model && view.model.data;
      if (!data) return [];
      var models = data.models || data;
      if (!Array.isArray(models)) return [];
      var out = [];
      for (var i = 0; i < models.length; i++) {
        var attrs = (models[i] && models[i].attributes) || models[i];
        if (attrs) out.push(attrs);
      }
      return out;
    } catch (e) { return []; }
  }

  // ---- Optional gate checks --------------------------------------------
  // Each is opt-in: leave the corresponding field key null at the top
  // of this file to disable. When enabled, a failing gate produces the
  // generic fallback message — the customer never sees which gate
  // tripped (active/superseded/expired all look identical).
  function passesGates(attrs) {
    if (ACTIVE_FIELD) {
      if (!isYes(attrs[ACTIVE_FIELD + '_raw']) && !isYes(attrs[ACTIVE_FIELD])) return false;
    }
    if (SUPERSEDED_FIELD) {
      if (isYes(attrs[SUPERSEDED_FIELD + '_raw']) || isYes(attrs[SUPERSEDED_FIELD])) return false;
    }
    if (EXPIRATION_FIELD) {
      var raw = attrs[EXPIRATION_FIELD + '_raw'];
      var dateStr =
        (raw && (raw.iso_timestamp || raw.date || raw.date_formatted)) ||
        attrs[EXPIRATION_FIELD];
      if (!dateStr) return false;
      var expiry = new Date(dateStr);
      if (isNaN(expiry.getTime())) return false;
      // Compare on a calendar-day basis so today's expiration is
      // still valid right up to midnight.
      var today = new Date(); today.setHours(0, 0, 0, 0);
      if (expiry < today) return false;
    }
    return true;
  }

  function isYes(v) {
    if (v === true) return true;
    if (typeof v === 'string') return /^(yes|true)$/i.test(v.trim());
    return false;
  }

  // ---- Render the proposal HTML ----------------------------------------
  //
  // We use innerHTML here (NOT an iframe). This is safe ONLY because
  // the HTML stored in field_2680 is generated by your own publish
  // pipeline and that field is writable only by authenticated sales
  // staff. If you ever start accepting HTML from less-trusted sources
  // on this field, switch to an iframe-with-srcdoc isolation model.
  function renderProposal(attrs) {
    var html = attrs[HTML_FIELD + '_raw'] || attrs[HTML_FIELD] || '';
    if (!html) { renderFallback(); return; }
    // Knack sometimes wraps rich-text fields in <span>; peel that off.
    html = String(html).replace(/^<span>([\s\S]*)<\/span>$/i, '$1');
    ensureMountNode().innerHTML = html;
  }

  // ---- Main flow --------------------------------------------------------
  //
  // Two render events drive this snippet:
  //
  //   knack-scene-render.<SCENE_ID>          — page first loads, or
  //                                            the customer navigates
  //                                            in via the hash route.
  //                                            We read the token,
  //                                            show "Loading…", and
  //                                            kick off the filtered
  //                                            fetch on the lookup view.
  //
  //   knack-view-render.<LOOKUP_VIEW_ID>     — fires both on the lookup
  //                                            view's initial render AND
  //                                            after our .fetch() finishes.
  //                                            We read the records out
  //                                            and either render or fall back.
  //
  function handleSceneRender() {
    injectStyles();

    var token = readTokenFromHash();
    if (!isPlausibleToken(token)) { renderFallback(); return; }

    window[STATE_KEY] = { token: token, pending: true };
    renderLoading();

    // Try to apply the filter immediately. If the lookup view hasn't
    // constructed yet (Knack hasn't built its model), the lookup
    // view-render handler will run handleLookupRender() once it does.
    applyLookupFilter(token);
  }

  function handleLookupRender() {
    var state = window[STATE_KEY];
    if (!state || !state.pending) {
      // No active request — this is the initial unfiltered render. If
      // we have a token in the URL already, apply the filter now.
      var token = readTokenFromHash();
      if (isPlausibleToken(token)) {
        window[STATE_KEY] = { token: token, pending: true };
        renderLoading();
        applyLookupFilter(token);
      }
      return;
    }

    var records = readRecordsFromView(LOOKUP_VIEW_ID);

    // Exactly one match required. Zero (bad token) or many (data bug
    // — tokens should be unique) → fallback.
    if (!records || records.length !== 1) {
      renderFallback();
      state.pending = false;
      return;
    }

    var attrs = records[0];

    // Optional gate checks (active/superseded/expiration).
    if (!passesGates(attrs)) { renderFallback(); state.pending = false; return; }

    // OTP placeholder — fails closed by design.
    if (OTP_REQUIRED) { renderFallback(); state.pending = false; return; }

    try {
      renderProposal(attrs);
    } catch (e) {
      console.warn('[proposal-access] Render failed', e);
      renderFallback();
    }
    state.pending = false;
  }

  // ---- Bindings ---------------------------------------------------------
  // Knack fires jQuery events for scene/view renders. We always use
  // .off().on() with a namespace so re-loading this snippet during
  // development doesn't pile duplicate handlers.

  $(document)
    .off('knack-scene-render.' + SCENE_ID + NS)
    .on('knack-scene-render.' + SCENE_ID + NS, function () {
      handleSceneRender();
    });

  $(document)
    .off('knack-view-render.' + LOOKUP_VIEW_ID + NS)
    .on('knack-view-render.' + LOOKUP_VIEW_ID + NS, function () {
      handleLookupRender();
    });

  // hashchange — if the customer pastes a new token URL while already
  // on the scene, re-run the flow.
  $(window)
    .off('hashchange' + NS)
    .on('hashchange'  + NS, function () {
      var hash = (window.location.hash || '').replace(/^#/, '');
      if (new RegExp('^' + HASH_ROUTE + '(?:/|$)').test(hash)) {
        handleSceneRender();
      }
    });
})();
