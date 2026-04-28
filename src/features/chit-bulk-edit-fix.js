/*** FEATURE: Chit bulk-edit boolean → Yes/No conversion ***/
/**
 * KTL's bulk-edit reads a Yes/No source cell from the Knack model
 * (which stores the field as a boolean) and PUTs the raw boolean back
 * to the API: { field_2461: true } / { field_1984: false }. Our
 * own single-chit toggle sends the string form: { field_2461: "Yes" }.
 *
 * For most Yes/No fields Knack accepts both shapes, but for the chit
 * fields on this app the boolean form was silently no-opping, leaving
 * the bulk-edit looking like it ran but without the cell value
 * actually flipping in the UI / future loads.
 *
 * Intercepts at three layers:
 *   - jQuery ajaxPrefilter  (catches jQuery $.ajax / $.put / $.post)
 *   - XMLHttpRequest.send   (catches native XHRs)
 *   - window.fetch          (catches fetch())
 *
 * KTL uses native XHR, not jQuery, so the prefilter alone wasn't
 * enough — the lower-level patches normalize whichever transport
 * KTL ends up using on a given Knack version.
 *
 * Scoped to known chit field keys so we don't accidentally reshape
 * legitimate boolean payloads on other fields.
 */
(function () {
  'use strict';

  // Known Yes/No chit fields used by device-worksheet's toggleChit
  // type. Boolean values for these get coerced into "Yes" / "No"
  // strings before the request ships.
  var CHIT_FIELDS = {
    field_2370: true,   // Existing cabling (view_3559 / view_3577)
    field_2461: true,   // Existing cabling (view_3505 / view_3313 / view_3610 / etc.)
    field_1984: true,   // Exterior
    field_1983: true,   // Plenum
    field_2634: true    // Lock Record
  };

  function coerceBody(body) {
    if (typeof body !== 'string' || !body) return { body: body, hadChit: false };
    // Quick string-level guard before parsing JSON.
    var hit = false;
    for (var k in CHIT_FIELDS) {
      if (CHIT_FIELDS.hasOwnProperty(k) && body.indexOf(k) !== -1) {
        hit = true; break;
      }
    }
    if (!hit) return { body: body, hadChit: false };

    var parsed;
    try { parsed = JSON.parse(body); } catch (e) { return { body: body, hadChit: false }; }
    if (!parsed || typeof parsed !== 'object') return { body: body, hadChit: false };

    var changed = false;
    for (var key in parsed) {
      if (!parsed.hasOwnProperty(key)) continue;
      if (!CHIT_FIELDS[key]) continue;
      var v = parsed[key];
      if (typeof v === 'boolean') {
        parsed[key] = v ? 'Yes' : 'No';
        changed = true;
      }
    }
    if (!changed) return { body: body, hadChit: true };
    try {
      var out = JSON.stringify(parsed);
      if (window.SCW && SCW.debug) {
        SCW.debug('[scw-chit-bulk-edit] coerced boolean → Yes/No', parsed);
      }
      return { body: out, hadChit: true };
    } catch (e) { return { body: body, hadChit: true }; }
  }

  // Fire scw-record-saved (debounced via the listeners themselves) so
  // downstream features that recompute on save — mdf-summary-panel,
  // proposal-grid totals, etc. — refresh after a chit-field PUT.
  // KTL's bulk-edit doesn't fire our scw-record-saved itself, so this
  // is the bridge.
  function notifySaved() {
    try {
      if (typeof $ !== 'undefined') $(document).trigger('scw-record-saved');
    } catch (e) { /* ignore */ }
  }

  function isKnackRecordUrl(url) {
    if (!url) return false;
    return url.indexOf('/records/') !== -1
        || url.indexOf('/records?') !== -1
        || /\/records$/.test(url);
  }

  function isWriteMethod(method) {
    if (!method) return false;
    var m = String(method).toUpperCase();
    return m === 'PUT' || m === 'POST';
  }

  // ── 1. jQuery prefilter (covers $.ajax / $.put / $.post) ────
  if (typeof $ !== 'undefined' && $.ajaxPrefilter) {
    $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
      if (!options || !isWriteMethod(options.type)) return;
      if (!isKnackRecordUrl(options.url || '')) return;
      var result = coerceBody(options.data);
      if (result.body !== options.data) options.data = result.body;
      if (result.hadChit && jqXHR && typeof jqXHR.done === 'function') {
        jqXHR.done(function () { setTimeout(notifySaved, 250); });
      }
    });
  }

  // ── 2. XMLHttpRequest.send (covers KTL's native XHR) ────────
  // Save method + url at .open() time, then rewrite body in .send().
  if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype) {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__scwChitMethod = method;
      this.__scwChitUrl    = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
      var write = isWriteMethod(this.__scwChitMethod);
      var rec   = isKnackRecordUrl(this.__scwChitUrl);
      if (write && rec) {
        try {
          console.log('[scw-chit-fix] XHR catch',
            this.__scwChitMethod, this.__scwChitUrl,
            'body:', body);
        } catch (e) {}
        var result = coerceBody(body);
        if (result.body !== body) {
          try {
            console.log('[scw-chit-fix] XHR rewrote body →', result.body);
          } catch (e) {}
          body = result.body;
        }
        if (result.hadChit) {
          this.addEventListener('load', function () {
            if (this.status >= 200 && this.status < 300) {
              setTimeout(notifySaved, 250);
            }
          });
        }
      }
      return origSend.call(this, body);
    };
    try { XMLHttpRequest.prototype.send.__scwChitWrapped = true; } catch (e) {}
  }

  // ── 3. window.fetch (covers fetch-based callers) ────────────
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
      var hadChit = false;
      try {
        var url    = typeof input === 'string' ? input : (input && input.url) || '';
        var method = (init && init.method)
                  || (input && input.method)
                  || 'GET';
        if (isWriteMethod(method) && isKnackRecordUrl(url)) {
          try {
            console.log('[scw-chit-fix] fetch catch', method, url,
              'body:', init && init.body);
          } catch (e) {}
          if (init && typeof init.body === 'string') {
            var result = coerceBody(init.body);
            hadChit = result.hadChit;
            if (result.body !== init.body) {
              try {
                console.log('[scw-chit-fix] fetch rewrote body →', result.body);
              } catch (e) {}
              init = Object.assign({}, init, { body: result.body });
            }
          }
        }
      } catch (e) { /* fall through to original fetch */ }
      // Pass the (possibly-rewritten) init explicitly. Using
      // origFetch.apply(this, arguments) here would ship the original
      // arguments[1] reference instead of our rewrite, which is the
      // bug that let the boolean body through previously.
      var promise = origFetch.call(this, input, init);
      if (hadChit && promise && typeof promise.then === 'function') {
        promise.then(function (resp) {
          if (resp && resp.ok) setTimeout(notifySaved, 250);
        }).catch(function () { /* ignore */ });
      }
      return promise;
    };
    try { window.fetch.__scwChitWrapped = true; } catch (e) {}
  }
})();
