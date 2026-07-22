/*** BUILDER SNIPPET — window.SCW.photoTypeOptions *****************************
 *
 * Paste into Knack Builder → Settings → API & Code → JavaScript (app-level),
 * alongside the other SCW snippets. Runs before the CDN bundle loads and
 * exposes the FULL Photo Type catalog (CONFIG_photo type object, the object
 * field_2445 connects to on DOC_photos) for in-bundle photo-type pickers:
 *
 *   window.SCW.photoTypeOptions = [
 *     { id: '<24-hex>', label: 'Installed Device' },
 *     ...
 *   ]
 *
 * Consumer: photo-edit-panel.js collectTypeOptions() — prefers this global
 * over scraping field_2445 connection values already rendered on the scene
 * (incomplete by construction — only shows types currently in use).
 *
 * ⚠️ Known Issue #17: this ships the REST key client-side like the other
 * catalog snippets (productBucketMap, dropPrefixOptions, fileTypeOptions).
 * Deferred — follows the existing pattern until that migration happens.
 ***************************************************************************/
(function () {
  var APP_ID  = Knack.application_id;
  // ⚠️ Key is NOT stored in this repo. Fill in from Builder → Settings →
  // API & Code before pasting. A wrong key = silent 401/403 on the fetch
  // below → SCW.photoTypeOptions never set → pickers fall back to
  // in-use scraping (same as before this snippet existed).
  var API_KEY = '###';   // TBD — fill from Builder, never commit the value

  // ── TODO: fill in from Builder (CONFIG_photo type object) ───────────
  var PHOTO_TYPE_OBJECT = 'object_XX';    // CONFIG_photo type object key
  var LABEL_FIELD        = 'field_XXXX';  // type name field

  window.SCW = window.SCW || {};
  var out = [];

  function fetchPage(page) {
    $.ajax({
      url: 'https://api.knack.com/v1/objects/' + PHOTO_TYPE_OBJECT +
           '/records?rows_per_page=1000&page=' + page,
      type: 'GET',
      headers: {
        'X-Knack-Application-Id': APP_ID,
        'X-Knack-REST-API-Key': API_KEY
      },
      success: function (res) {
        var records = res.records || [];
        for (var i = 0; i < records.length; i++) {
          var rec = records[i];
          if (!rec || !rec.id) continue;
          var label = String(rec[LABEL_FIELD + '_raw'] != null
            ? rec[LABEL_FIELD + '_raw'] : (rec[LABEL_FIELD] || ''))
            .replace(/<[^>]*>/g, '').trim();
          if (!label) continue;
          out.push({ id: rec.id, label: label });
        }
        if (res.total_pages && page < res.total_pages) fetchPage(page + 1);
        else window.SCW.photoTypeOptions = out;
      }
    });
  }
  fetchPage(1);
})();
