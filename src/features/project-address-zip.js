/*** PROJECT ADDRESS ZIP — SCW.projectZip ***/
/**
 * "Block the acceptance of a proposal if there is no zip code in the project
 * address" (2026-11-04). One reader, two consumers:
 *   - accept-proposal-guard.js  — the accept form page (accept-proposal3,
 *     scene_1324) replaces the form with a notice while the zip is missing;
 *   - ops-stepper.js            — "Post and/or Publish Final" (scene_1096)
 *     stays locked while the zip is missing, so a proposal the client cannot
 *     accept is never published.
 *
 * The project address is CORE_project field_22. A page knows it when one of
 * its views shows that field — scene_1096 has view_3349 "Project Address";
 * the accept page needs a (hidden) details view of the project added in
 * Builder, connected through the proposal's SOW (the view_3874 path on
 * scene_1279). Field keys are unique across a Knack app, so ANY view on the
 * page that carries field_22 is the project's address; no view key is
 * configured here.
 *
 * read() → { state, zip, address, blank, viewKey, source }
 *   state 'ok'      — a zip is on the address
 *         'missing' — the address is blank, or has no zip
 *         'unknown' — no view on the page shows field_22 (callers fail open)
 */
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var FIELD = 'field_22';   // CORE_project Address

  function knackViews() {
    return (window.Knack && Knack.views) || {};
  }

  function stripHtml(s) {
    return String(s == null ? '' : s)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
  }

  /** A US zip at the END of a rendered address ("…, NC 28803", "…28803-1234",
   *  an optional trailing country). A five-digit street number never counts:
   *  the match has to be the last thing on the address. */
  function zipFromText(text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    var m = t.match(/(?:^|[\s,])(\d{5}(?:-\d{4})?)\s*(?:,?\s*(?:USA|US|United States(?: of America)?))?\s*$/i);
    return m ? m[1] : '';
  }

  /** The zip off Knack's address raw ({ street, city, state, zip, … }).
   *  null when the raw is not an address object (read the text instead). */
  function zipFromRaw(raw) {
    if (Array.isArray(raw)) raw = raw[0];
    if (raw && typeof raw === 'object') return String(raw.zip == null ? '' : raw.zip).trim();
    return null;
  }

  function addressText(raw, formatted) {
    var t = stripHtml(formatted);
    if (t) return t.replace(/\n/g, ', ');
    if (Array.isArray(raw)) raw = raw[0];
    if (raw && typeof raw === 'object') {
      var parts = [raw.street, raw.street2, raw.city, raw.state, raw.zip];
      var out = [];
      for (var i = 0; i < parts.length; i++) {
        var p = String(parts[i] == null ? '' : parts[i]).trim();
        if (p) out.push(p);
      }
      return out.join(', ');
    }
    return '';
  }

  function result(zip, address, viewKey, source) {
    return {
      state: zip ? 'ok' : 'missing',
      zip: zip || '',
      address: address || '',
      blank: !address,
      viewKey: viewKey,
      source: source
    };
  }

  /** Every view rendered on the page that shows field_22, model first. */
  function read(opts) {
    opts = opts || {};
    var all = knackViews();
    var keys = opts.views || Object.keys(all);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var el = document.getElementById(key);
      if (!el) continue;                       // a view left over from another page
      var attrs = null;
      try {
        var m = all[key] && all[key].model;
        var a = m && m.attributes;
        if (a && ((FIELD + '_raw') in a || FIELD in a)) attrs = a;
      } catch (e) { attrs = null; }
      if (attrs) {
        var raw = attrs[FIELD + '_raw'];
        var address = addressText(raw, attrs[FIELD]);
        var zip = zipFromRaw(raw);
        if (zip === null) zip = zipFromText(address);
        return result(zip, address, key, 'model');
      }
      var cell = el.querySelector('.kn-detail.' + FIELD + ' .kn-detail-body');
      if (cell) {
        var text = stripHtml(cell.innerHTML);
        return result(zipFromText(text), text.replace(/\n/g, ', '), key, 'dom');
      }
    }
    // A rendered address whose view has no model on hand.
    if (!opts.views) {
      var body = document.querySelector('.kn-view .kn-detail.' + FIELD + ' .kn-detail-body');
      if (body) {
        var host = body.closest('.kn-view');
        var t = stripHtml(body.innerHTML);
        return result(zipFromText(t), t.replace(/\n/g, ', '), (host && host.id) || '', 'dom');
      }
    }
    return { state: 'unknown', zip: '', address: '', blank: false, viewKey: '', source: '' };
  }

  SCW.projectZip = {
    FIELD: FIELD,
    read: read,
    zipFromText: zipFromText
  };
})();
/*** END PROJECT ADDRESS ZIP ***/
