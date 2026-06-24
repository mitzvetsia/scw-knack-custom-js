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

  // Diagnostic logger — gated behind SCW.DEBUG so the per-write "catch"
  // lines don't spam the console on every record edit (the body-rewrite
  // logic below always runs; only the logging is gated). Flip on with
  // SCW.DEBUG = true to trace what each transport sends.
  function clog() {
    if (window.SCW && window.SCW.DEBUG) {
      try { console.log.apply(console, arguments); } catch (e) {}
    }
  }

  // Known chit fields. Value declares the SHAPE the field's API
  // expects on PUT/POST:
  //   'yesno'   → string "Yes" / "No"   (Yes/No object field type)
  //   'boolean' → JSON true / false     (Boolean object field type)
  //
  // For each field, whichever shape is canonical we coerce the body
  // into — regardless of which form (boolean, "true"/"false" string,
  // or "Yes"/"No" string) the caller sent. Knack silently no-ops
  // mis-shaped writes for these fields, which is what produced the
  // "bulk-edit looks like it ran but the cell doesn't flip" bug.
  var CHIT_FIELDS = {
    field_2370: 'yesno',   // Existing cabling (view_3505 / survey)
    field_2371: 'boolean', // Plenum           (view_3505 / survey) — Boolean type
    field_2372: 'yesno',   // Exterior         (view_3505 / survey)
    field_2461: 'yesno',   // Existing cabling (view_3313 / view_3610 / SOW)
    field_1984: 'yesno',   // Exterior         (SOW)
    field_1983: 'yesno',   // Plenum           (SOW)
    field_2634: 'yesno'    // Lock Record
  };

  // Returns:
  //   true / false  if the value is recognizably yes-ish or no-ish
  //   null          if we shouldn't touch it (unknown shape)
  function asBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (typeof v === 'string') {
      var lc = v.trim().toLowerCase();
      if (lc === 'yes' || lc === 'true')  return true;
      if (lc === 'no'  || lc === 'false') return false;
    }
    return null;
  }

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
      var shape = CHIT_FIELDS[key];
      if (!shape) continue;
      var b = asBool(parsed[key]);
      if (b === null) continue; // unrecognized — leave it alone
      var target;
      if (shape === 'yesno') target = b ? 'Yes' : 'No';
      else                   target = b;                // 'boolean'
      // Skip if already in the target shape.
      if (parsed[key] === target) continue;
      parsed[key] = target;
      changed = true;
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
    return m === 'PUT' || m === 'POST' || m === 'PATCH';
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
        clog('[scw-chit-fix] XHR catch',
          this.__scwChitMethod, this.__scwChitUrl, 'body:', body);
        var result = coerceBody(body);
        if (result.body !== body) {
          clog('[scw-chit-fix] XHR rewrote body →', result.body);
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
          clog('[scw-chit-fix] fetch catch', method, url,
            'body:', init && init.body);
          if (init && typeof init.body === 'string') {
            var result = coerceBody(init.body);
            hadChit = result.hadChit;
            if (result.body !== init.body) {
              clog('[scw-chit-fix] fetch rewrote body →', result.body);
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
      // Best-effort "saved" ping. Must NEVER throw — some environments wrap
      // window.fetch so its .then() doesn't return a spec Promise (no .catch),
      // and an exception here would propagate OUT of fetch() before we return
      // the promise, breaking the caller's save. Use the two-arg .then form and
      // guard the whole thing.
      try {
        if (hadChit && promise && typeof promise.then === 'function') {
          promise.then(function (resp) {
            if (resp && resp.ok) setTimeout(notifySaved, 250);
          }, function () { /* ignore */ });
        }
      } catch (e) { /* ignore — don't let the ping break the request */ }
      return promise;
    };
    try { window.fetch.__scwChitWrapped = true; } catch (e) {}
  }
})();
