/*** BUILDER SNIPPET — window.SCW.dropPrefixOptions ***************************
 *
 * Paste into Knack Builder → Settings → API & Code → JavaScript (app-level),
 * alongside the other SCW snippets. Runs before the CDN bundle loads and
 * exposes the Drop Prefix catalog for the in-bundle pickers:
 *
 *   window.SCW.dropPrefixOptions = [
 *     { id: '<24-hex>', identifier: 'E-', subVisible: true, salesVisible: true },
 *     ...
 *   ]
 *
 * Consumers (grep dropPrefixOptions in src/):
 *   - worksheet-v2/init.js  — Prefix picker (field_2240 SOW / field_2361
 *     survey). On the survey/bid page (field_2361) entries with
 *     subVisible === false are HIDDEN; entries without the flag (older
 *     snippet shape) stay visible (fail open).
 *   - worksheet-v2/bulk.js  — bulk-edit Prefix picker (internal, unfiltered).
 *   - bid-review/change-requests.js — CR modal Prefix options (ops-side,
 *     unfiltered; falls back to in-use scrape when this global is absent).
 *
 * Reconstructed 2026-07-14 after the Builder copy was lost — keep THIS file
 * as the source of truth and re-paste on any change.
 *
 * ⚠️ Known Issue #17: this ships the REST key client-side like the other
 * catalog snippets. Slated for migration to a hidden-view read; until then
 * it follows the existing productBucketMap pattern.
 ***************************************************************************/
(function () {
  var APP_ID  = Knack.application_id;
  // ⚠️ Key is NOT stored in this repo. Fill in from Builder → Settings →
  // API & Code before pasting. A wrong key = silent 401/403 on the fetch
  // below → SCW.dropPrefixOptions never set → pickers fall back to
  // in-use scraping.
  var API_KEY = '###';   // TBD — fill from Builder, never commit the value

  // ── TODO: fill in from Builder (Drop Prefix object) ─────────────────
  var PREFIX_OBJECT = 'object_XX';    // Drop Prefix object key
  var LABEL_FIELD   = 'field_XXXX';   // prefix text field (e.g. "E-")
  // ── known flags on the Drop Prefix object (CLAUDE.md #11) ───────────
  var SUB_VISIBLE_FIELD   = 'field_2439';  // Available for Subcontractors (Yes/No)
  var SALES_VISIBLE_FIELD = 'field_2440';  // Available for Sales (Yes/No)

  window.SCW = window.SCW || {};
  var out = [];

  // Yes/No → boolean; unknown/blank → null so consumers can fail open.
  function yes(v) {
    if (v === true  || v === 1) return true;
    if (v === false || v === 0) return false;
    var s = String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim().toLowerCase();
    if (s === 'yes' || s === 'true'  || s === '1') return true;
    if (s === 'no'  || s === 'false' || s === '0') return false;
    return null;
  }

  function fetchPage(page) {
    $.ajax({
      url: 'https://api.knack.com/v1/objects/' + PREFIX_OBJECT +
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
          out.push({
            id:           rec.id,
            identifier:   label,
            subVisible:   yes(rec[SUB_VISIBLE_FIELD]),
            salesVisible: yes(rec[SALES_VISIBLE_FIELD])
          });
        }
        if (res.total_pages && page < res.total_pages) fetchPage(page + 1);
        else window.SCW.dropPrefixOptions = out;
      }
    });
  }
  fetchPage(1);
})();
