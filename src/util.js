window.SCW = window.SCW || {};

// ── Gated debug logging ──────────────────────────────────────
// All per-feature diagnostic logs go through SCW.debug / SCW.log
// instead of console.log. They no-op unless SCW.DEBUG is truthy,
// which keeps production quiet (and fast — DevTools retains object
// references from every console.log, which adds up on grids with
// hundreds of rows). Flip on in the browser console when
// troubleshooting: SCW.DEBUG = true.
//
// console.error and console.warn are intentionally NOT gated —
// real errors and auth failures should always surface.
(function (namespace) {
  function noop() {}
  function realLog()   { if (namespace.DEBUG) console.log.apply(console, arguments); }
  function realDebug() { if (namespace.DEBUG) (console.debug || console.log).apply(console, arguments); }
  namespace.DEBUG = namespace.DEBUG || false;
  namespace.log   = realLog;
  namespace.debug = realDebug;
  // Explicit no-op alias for call sites that want to fully strip
  // a log without removing the line. Useful during triage.
  namespace.nolog = noop;
})(window.SCW);

(function initBindingsHelpers(namespace) {
  function normalizeNamespace(ns) {
    if (!ns) return '.scw';
    return ns.startsWith('.') ? ns : `.${ns}`;
  }

  // ── Hard-stop render error overlay ─────────────────────────────
  // Any throw inside an onViewRender / onSceneRender handler is a
  // potential data-correctness incident — a half-rendered proposal
  // grid can yield bad totals which become bad PDFs which become
  // bad invoices. Block the UI with a full-screen modal until the
  // user reloads. They can dismiss explicitly if they understand
  // the risk (e.g. they're SCW staff debugging).
  var OVERLAY_ID = 'scw-render-error-overlay';
  function showRenderErrorOverlay(detail) {
    if (document.getElementById(OVERLAY_ID)) return;
    var safe = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    }); };
    var msg  = safe(detail.message || 'Unknown error');
    var stk  = safe(detail.stack    || '');
    var ctx  = safe(detail.context  || '');
    var html = '' +
      '<div style="position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.78);' +
      'display:flex;align-items:center;justify-content:center;padding:24px;' +
      'font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;">' +
        '<div style="background:#fff;max-width:680px;width:100%;border-radius:10px;' +
        'box-shadow:0 12px 48px rgba(0,0,0,.55);overflow:hidden;border-top:6px solid #b91c1c;">' +
          '<div style="padding:20px 24px 12px;">' +
            '<div style="font-weight:800;font-size:18px;color:#7f1d1d;margin-bottom:6px;">' +
              'Page render error — do not publish or invoice from this view' +
            '</div>' +
            '<div style="color:#374151;margin-bottom:12px;">' +
              'A feature on this page failed to render. Totals, line items, or other ' +
              'figures may be wrong. Reload the page before continuing.' +
            '</div>' +
            '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;' +
            'padding:10px 12px;font-family:ui-monospace,Menlo,monospace;font-size:12px;' +
            'color:#991b1b;white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto;">' +
              '<div><strong>Where:</strong> ' + ctx + '</div>' +
              '<div><strong>Error:</strong> ' + msg + '</div>' +
              (stk ? '<div style="opacity:.75;margin-top:6px;">' + stk + '</div>' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 24px 18px;' +
          'background:#f9fafb;border-top:1px solid #e5e7eb;">' +
            '<button id="scw-render-error-dismiss" type="button" ' +
            'style="background:#fff;border:1px solid #d1d5db;color:#374151;' +
            'padding:8px 14px;border-radius:6px;font-weight:600;cursor:pointer;">' +
              'Dismiss (I understand the risk)' +
            '</button>' +
            '<button id="scw-render-error-reload" type="button" ' +
            'style="background:#b91c1c;border:0;color:#fff;' +
            'padding:8px 16px;border-radius:6px;font-weight:700;cursor:pointer;">' +
              'Reload page' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    var wrap = document.createElement('div');
    wrap.id = OVERLAY_ID;
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    document.getElementById('scw-render-error-reload').addEventListener('click', function () {
      window.location.reload();
    });
    document.getElementById('scw-render-error-dismiss').addEventListener('click', function () {
      wrap.remove();
    });
  }
  namespace.showRenderError = showRenderErrorOverlay;

  function safeHandler(handler, contextLabel) {
    return function scwSafeHandler() {
      try {
        return handler.apply(this, arguments);
      } catch (err) {
        console.error('[SCW render error] ' + contextLabel, err);
        showRenderErrorOverlay({
          context: contextLabel,
          message: (err && err.message) || String(err),
          stack:   (err && err.stack)   || ''
        });
        // Re-throw so any upstream listener / debugger pause behaves
        // normally too. The overlay is informational, not a swallow.
        throw err;
      }
    };
  }

  // ── Catch-up: invoke handler if the view/scene already rendered ──
  // The bundle is loaded async; on slow connections the IIFE for a
  // feature can parse AFTER Knack has emitted its initial
  // knack-view-render / knack-scene-render event. Without a catch-up
  // pass the feature silently no-ops on first paint until the user
  // navigates or refreshes. Poll briefly for the rendered DOM and
  // fire the matching event once.
  function scheduleCatchUp(eventName, viewOrSceneId, kind) {
    var attempts = 0;
    var maxAttempts = 20;          // ~6s at 300ms cadence
    var iv = setInterval(function () {
      attempts++;
      var found = false;
      try {
        if (kind === 'view') {
          var view = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewOrSceneId] : null;
          var rootEl = document.getElementById(viewOrSceneId);
          // Knack puts data on view.model.data (Backbone-ish). Either array
          // or { models: [] } depending on view type.
          var hasModel = !!(view && view.model);
          if (rootEl && hasModel) {
            $(document).trigger(eventName, [view]);
            found = true;
          }
        } else if (kind === 'scene') {
          var sceneEl = document.getElementById('kn-' + viewOrSceneId);
          if (sceneEl) {
            $(document).trigger(eventName);
            found = true;
          }
        }
      } catch (e) { /* keep polling */ }
      if (found || attempts >= maxAttempts) clearInterval(iv);
    }, 300);
  }

  namespace.onViewRender = function onViewRender(viewId, handler, ns) {
    if (!viewId || typeof handler !== 'function') return;
    var eventName = 'knack-view-render.' + viewId + normalizeNamespace(ns);
    var wrapped  = safeHandler(handler, 'onViewRender(' + viewId + ', ns=' + (ns || '.scw') + ')');
    $(document).off(eventName).on(eventName, wrapped);
    scheduleCatchUp(eventName, viewId, 'view');
  };

  namespace.onSceneRender = function onSceneRender(sceneId, handler, ns) {
    if (!sceneId || typeof handler !== 'function') return;
    var eventName = 'knack-scene-render.' + sceneId + normalizeNamespace(ns);
    var wrapped  = safeHandler(handler, 'onSceneRender(' + sceneId + ', ns=' + (ns || '.scw') + ')');
    $(document).off(eventName).on(eventName, wrapped);
    scheduleCatchUp(eventName, sceneId, 'scene');
  };
})(window.SCW);

// ── Authenticated Knack AJAX wrapper ─────────────────────────
// Detects 401/403 "Invalid token" responses and shows a
// non-intrusive toast prompting the user to log out and back in.
(function (namespace) {
  var TOAST_ID = 'scw-session-toast';
  var RETURN_KEY = 'scw-session-return';
  var _toastVisible = false;

  /** After login, redirect back to the page the user was on. */
  function checkReturnRedirect() {
    var returnHash = sessionStorage.getItem(RETURN_KEY);
    if (returnHash && window.location.hash !== '#logout') {
      sessionStorage.removeItem(RETURN_KEY);
      window.location.hash = returnHash;
    }
  }
  // Run on load — if we're returning from a re-login, restore the page
  checkReturnRedirect();

  function showSessionToast() {
    if (_toastVisible) return;
    _toastVisible = true;

    var el = document.createElement('div');
    el.id = TOAST_ID;
    el.innerHTML =
      '<span>Session expired &mdash; save failed. Please log out and back in.</span>' +
      '<button id="scw-session-logout">Log out &amp; come back</button>' +
      '<button id="scw-session-dismiss">&times;</button>';

    var css =
      '#' + TOAST_ID + '{' +
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:100000;' +
        'display:flex;align-items:center;gap:12px;' +
        'background:#b91c1c;color:#fff;padding:12px 20px;border-radius:8px;' +
        'font:600 14px/1.3 system-ui,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.35);}' +
      '#scw-session-logout{' +
        'background:#fff;color:#b91c1c;border:none;border-radius:4px;' +
        'padding:6px 14px;font:600 13px/1 system-ui,sans-serif;cursor:pointer;}' +
      '#scw-session-dismiss{' +
        'background:none;border:none;color:#fff;font-size:18px;cursor:pointer;' +
        'padding:0 0 0 4px;line-height:1;}';

    var style = document.createElement('style');
    style.textContent = css;
    el.prepend(style);

    document.body.appendChild(el);

    document.getElementById('scw-session-logout').addEventListener('click', function () {
      // Save current page so we can return after re-login
      sessionStorage.setItem(RETURN_KEY, window.location.hash);
      window.location.hash = '#logout';
    });
    document.getElementById('scw-session-dismiss').addEventListener('click', function () {
      el.remove();
      _toastVisible = false;
    });
  }

  /**
   * SCW.knackAjax(options)
   *
   * Drop-in wrapper around $.ajax that:
   *   1. Auto-adds Knack auth headers
   *   2. Detects 401/403 auth failures and shows a reload toast
   *   3. Still calls the caller's error/success callbacks
   *
   * Options are the same as $.ajax, except:
   *   - `headers` are merged with the Knack auth headers (caller wins)
   *   - An extra `error403` callback can be provided (called on auth failures only)
   */
  namespace.knackAjax = function knackAjax(opts) {
    if (typeof Knack === 'undefined') return;

    var callerError = opts.error;

    var defaults = {
      contentType: 'application/json',
      headers: {
        'X-Knack-Application-Id': Knack.application_id,
        'x-knack-rest-api-key': 'knack',
        'Authorization': Knack.getUserToken()
      }
    };

    // Merge headers — caller overrides win
    var merged = $.extend(true, {}, defaults, opts);

    merged.error = function (xhr) {
      if (xhr.status === 401 || xhr.status === 403) {
        var body = '';
        try { body = xhr.responseText || ''; } catch (e) { /* ignore */ }
        if (/invalid token|reauthenticate/i.test(body)) {
          console.warn('[SCW] Auth expired — prompting reload');
          showSessionToast();
        }
      }
      if (typeof callerError === 'function') callerError.apply(this, arguments);
    };

    return $.ajax(merged);
  };

  /**
   * Build a standard Knack record URL for a view-based PUT/GET.
   */
  namespace.knackRecordUrl = function (viewId, recordId) {
    return Knack.api_url + '/v1/pages/' + Knack.router.current_scene_key +
           '/views/' + viewId + '/records/' + recordId;
  };

  // ── Global 401/403 interceptor ──
  // Catches auth failures from ANY AJAX/fetch call (including KTL bulk ops)
  // and shows the session-expired toast.

  // 1) jQuery $.ajax errors
  $(document).ajaxError(function (event, xhr, settings) {
    if (xhr.status === 401 || xhr.status === 403) {
      var url = settings.url || '';
      if (url.indexOf('knack.com') !== -1 || url.indexOf('/v1/') !== -1) {
        var body = '';
        try { body = xhr.responseText || ''; } catch (e) {}
        if (/invalid token|reauthenticate/i.test(body)) {
          showSessionToast();
        }
      }
    }
  });

  // 2) fetch() errors — KTL uses fetch for bulk delete/write operations
  var _origFetch = window.fetch;
  if (typeof _origFetch === 'function') {
    window.fetch = function scwFetchInterceptor(input, init) {
      return _origFetch.apply(this, arguments).then(function (response) {
        if (response.status === 401 || response.status === 403) {
          var url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
          if (url.indexOf('knack.com') !== -1 || url.indexOf('/v1/') !== -1) {
            response.clone().text().then(function (body) {
              if (/invalid token|reauthenticate/i.test(body)) {
                console.warn('[SCW] Auth failure (' + response.status + ') on fetch: ' + url);
                showSessionToast();
              }
            });
          }
        }
        return response;
      });
    };
  }
})(window.SCW);
