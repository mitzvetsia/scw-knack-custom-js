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
 * jQuery ajaxPrefilter intercepts every request before it ships,
 * which lets us normalize the body without touching KTL's source.
 * Scoped to known chit field keys so we don't accidentally reshape
 * legitimate boolean payloads on other fields.
 */
(function () {
  'use strict';

  if (typeof $ === 'undefined' || !$.ajaxPrefilter) return;

  // Known Yes/No chit fields used by device-worksheet's toggleChit
  // type. Boolean values for these get coerced into "Yes" / "No"
  // strings before the PUT goes out.
  var CHIT_FIELDS = {
    field_2370: true,   // Existing cabling (view_3559 / view_3577)
    field_2461: true,   // Existing cabling (view_3505 / view_3313 / view_3610 / etc.)
    field_1984: true,   // Exterior
    field_1983: true,   // Plenum
    field_2634: true    // Lock Record
  };

  function coerce(value) {
    if (value === true)  return 'Yes';
    if (value === false) return 'No';
    return value;
  }

  $.ajaxPrefilter(function (options /*, originalOptions, jqXHR */) {
    if (!options || !options.type) return;
    var method = String(options.type).toUpperCase();
    if (method !== 'PUT' && method !== 'POST') return;

    // Knack record endpoints look like
    //   /v1/scenes/<scene>/views/<view>/records/<id>
    //   /v1/objects/<obj>/records/<id>
    // — anything that's clearly a Knack record write.
    var url = options.url || '';
    if (url.indexOf('/records/') === -1 && url.indexOf('/records?') === -1 &&
        !/\/records$/.test(url)) {
      return;
    }

    var body = options.data;
    if (typeof body !== 'string' || !body) return;

    // Quick string-level guard so we only parse JSON when there's a
    // chance of a hit.
    var hasChitKey = false;
    for (var k in CHIT_FIELDS) {
      if (CHIT_FIELDS.hasOwnProperty(k) && body.indexOf(k) !== -1) {
        hasChitKey = true; break;
      }
    }
    if (!hasChitKey) return;

    var parsed;
    try { parsed = JSON.parse(body); } catch (e) { return; }
    if (!parsed || typeof parsed !== 'object') return;

    var changed = false;
    for (var key in parsed) {
      if (!parsed.hasOwnProperty(key)) continue;
      if (!CHIT_FIELDS[key]) continue;
      var v = parsed[key];
      if (typeof v === 'boolean') {
        parsed[key] = coerce(v);
        changed = true;
      }
    }
    if (changed) {
      options.data = JSON.stringify(parsed);
      SCW.debug && SCW.debug('[scw-chit-bulk-edit] coerced boolean → Yes/No', parsed);
    }
  });
})();
