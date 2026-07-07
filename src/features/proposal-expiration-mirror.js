/*** PROPOSAL EXPIRATION MIRROR — field_2659 → SOW field_2135 ****************
 *
 * The proposal expiration date (`field_2659`, on the published-proposal
 * record) must stay mirrored onto the SOW record's own expiration field
 * (`field_2135`). They live on DIFFERENT records — the proposal record vs the
 * SOW record — so a single PUT can't touch both; every place that edits
 * field_2659 has to fire a second PUT at the SOW.
 *
 * This module centralises that second write so the two editable surfaces
 * (the bid comparison grid → view_3918; the build-SOW page → view_3325) share
 * one implementation and one field key. Each write site, on a SUCCESSFUL
 * field_2659 save, calls:
 *
 *   SCW.mirrorProposalExpToSow(sowRecordId, mdy, writeView)
 *
 * where `writeView` is a view on the CURRENT scene that renders the SOW object
 * with field_2135 editable, and `mdy` is the same MM/DD/YYYY string written to
 * field_2659 ('' clears it).
 *
 * The mirror is best-effort + non-fatal: the field_2659 save has already
 * landed, so a failed field_2135 write only console.warns (never a toast or a
 * thrown error). If it turns out to drift, a reconcile sweep can be added
 * later — but a per-edit mirror keeps them aligned on every ordinary edit.
 ******************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};

  var SOW_EXP_FIELD = 'field_2135';   // expiration date on the SOW record

  /**
   * Write field_2135 = mdy on the SOW record via a scene-appropriate view.
   * @param {string}   sowRecordId  24-hex SOW record id (the DIFFERENT record).
   * @param {string}   mdy          MM/DD/YYYY, or '' to clear.
   * @param {string}   writeView    view_XXXX on this scene with field_2135 editable.
   * @param {function} [onDone]     optional cb(err|null).
   */
  SCW.mirrorProposalExpToSow = function (sowRecordId, mdy, writeView, onDone) {
    function done(err) { if (typeof onDone === 'function') onDone(err); }

    if (!sowRecordId || !writeView ||
        typeof SCW.knackAjax !== 'function' ||
        typeof SCW.knackRecordUrl !== 'function') {
      // Missing a piece (no SOW id on the block, no configured view, helpers
      // not loaded) — skip quietly. The field_2659 save still stands.
      console.warn('[scw-exp-mirror] skipped — missing sowRecordId/writeView/helpers',
        { sowRecordId: sowRecordId, writeView: writeView });
      done(new Error('mirror skipped'));
      return;
    }

    var body = {};
    body[SOW_EXP_FIELD] = mdy;   // empty string clears the date

    SCW.knackAjax({
      url:  SCW.knackRecordUrl(writeView, sowRecordId),
      type: 'PUT',
      data: JSON.stringify(body),
      success: function () { done(null); },
      error: function (xhr) {
        var status = xhr && xhr.status;
        var hint = (status === 403 || status === 401)
          ? ' — ' + writeView + ' needs ' + SOW_EXP_FIELD +
            ' editable (inline edit / update rights) on the SOW object'
          : '';
        console.warn('[scw-exp-mirror] field_2135 write failed on SOW',
          sowRecordId, 'via', writeView, '(HTTP ' + status + ')' + hint,
          xhr && xhr.responseText);
        done(new Error('mirror failed (HTTP ' + status + ')'));
      }
    });
  };
})();
/*** END PROPOSAL EXPIRATION MIRROR *****************************************/
