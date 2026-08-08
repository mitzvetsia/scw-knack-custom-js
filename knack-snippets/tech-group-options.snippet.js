/*** BUILDER SNIPPET — window.SCW.techGroupOptions ****************************
 *
 * Paste into Knack Builder → Settings → API & Code → JavaScript (app-level),
 * alongside the other SCW catalog snippets. Runs before the CDN bundle loads
 * and exposes the branch / tech-group catalog for the Ops Mark Ready modal's
 * branch picker (a standalone grid on scene_1096 wasn't addable, so this
 * follows the dropPrefixOptions pattern instead):
 *
 *   window.SCW.techGroupOptions = [
 *     { id: '<24-hex>', label: 'Michigan West Techs' },
 *     ...
 *   ]
 *
 * Consumers (grep techGroupOptions in src/):
 *   - ops-stepper.js — readBranchOptions(): the Mark Ready — Send Pending
 *     Survey Request modal's multi-select branch picker. Absent global →
 *     no picker renders and the banner says assignment falls to the Make
 *     default (fail open, validation still works).
 *
 * The object is the one REL_tech group points at (field_2954 on the SOW
 * header / field_2347 on SITE SURVEY_requests).
 *
 * ⚠️ Known Issue #17: this ships the REST key client-side like the other
 * catalog snippets. Slated for migration to a hidden-view read; until then
 * it follows the existing productBucketMap / dropPrefixOptions pattern.
 * Ops-only scenes today, but don't paste onto customer-facing pages.
 ***************************************************************************/
(function () {
  var APP_ID  = Knack.application_id;
  // ⚠️ Key is NOT stored in this repo. Fill in from Builder → Settings →
  // API & Code before pasting. A wrong key = silent 401/403 on the fetch
  // below → SCW.techGroupOptions never set → Mark Ready falls back to
  // "assignment falls to the Make default".
  var API_KEY = '###';   // TBD — fill from Builder, never commit the value

  // ── TODO: fill in from Builder (tech group / branch object) ─────────
  var TECH_GROUP_OBJECT = 'object_XX';    // the object field_2954/field_2347 connect to
  var LABEL_FIELD       = 'field_XXXX';   // group display-name field
  // Group status — ONLY records whose status is 'Active' are offered.
  // Filtered server-side in the fetch AND re-checked client-side.
  var STATUS            = 'field_1583';

  // Server-side filter: fetch only Active groups (same pattern as the
  // productBucketMap snippet's Enabled filter).
  var filters = encodeURIComponent(JSON.stringify({
    match: 'and',
    rules: [ { field: STATUS, operator: 'is', value: 'Active' } ]
  }));

  window.SCW = window.SCW || {};
  var out = [];

  function isActive(rec) {
    var s = String(rec[STATUS] == null ? '' : rec[STATUS])
      .replace(/<[^>]*>/g, '').trim().toLowerCase();
    return s === 'active';
  }

  function fetchPage(page) {
    $.ajax({
      url: 'https://api.knack.com/v1/objects/' + TECH_GROUP_OBJECT +
           '/records?rows_per_page=1000&filters=' + filters + '&page=' + page,
      type: 'GET',
      headers: {
        'X-Knack-Application-Id': APP_ID,
        'X-Knack-REST-API-Key': API_KEY
      },
      success: function (res) {
        var records = res.records || [];
        for (var i = 0; i < records.length; i++) {
          var rec = records[i];
          if (!rec || !rec.id || !isActive(rec)) continue;
          var label = String(rec[LABEL_FIELD + '_raw'] != null
            ? rec[LABEL_FIELD + '_raw'] : (rec[LABEL_FIELD] || ''))
            .replace(/<[^>]*>/g, '').trim();
          if (!label) continue;
          out.push({ id: rec.id, label: label });
        }
        if (res.total_pages && page < res.total_pages) fetchPage(page + 1);
        else window.SCW.techGroupOptions = out;
      }
    });
  }
  fetchPage(1);
})();
