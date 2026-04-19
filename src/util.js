window.SCW = window.SCW || {};

(function initBindingsHelpers(namespace) {
  function normalizeNamespace(ns) {
    if (!ns) return '.scw';
    return ns.startsWith('.') ? ns : `.${ns}`;
  }

  namespace.onViewRender = function onViewRender(viewId, handler, ns) {
    if (!viewId || typeof handler !== 'function') return;
    const eventName = `knack-view-render.${viewId}${normalizeNamespace(ns)}`;
    $(document).off(eventName).on(eventName, handler);
  };

  namespace.onSceneRender = function onSceneRender(sceneId, handler, ns) {
    if (!sceneId || typeof handler !== 'function') return;
    const eventName = `knack-scene-render.${sceneId}${normalizeNamespace(ns)}`;
    $(document).off(eventName).on(eventName, handler);
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
