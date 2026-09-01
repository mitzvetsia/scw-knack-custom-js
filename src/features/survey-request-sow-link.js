/*** SURVEY REQUEST → SOW LINK — attribute the capture record at creation ***
 *
 * The survey-request capture form (view_3853, sales build page scene_1116)
 * creates SOW_OPS_site survey request records with REL_scope of work
 * (field_2329) BLANK — the form never set it. That leaves every request
 * unattributed: SOW-connected views of the object (view_4141 on the ops
 * preview page) render No data, and nothing downstream can tell WHICH SOW
 * a pending request was captured for — which matters, because the armed
 * survey fires when ITS SOW is validated, not when any sibling is.
 *
 * Fix: prefill field_2329 with the page's SOW the moment the form
 * renders, then hide the input — sales never sees the plumbing, and every
 * new capture record is born attributed. The Knack model only picks up
 * programmatic values when a change event fires (see CLAUDE.md "Setting
 * Form Fields Programmatically"), so the full select + hidden-input +
 * change sequence is required.
 *
 * ⚠️ Builder prerequisite (fail open until then): add the field_2329
 * connection input to the view_3853 form. Without the input on the form
 * there is nothing to prefill — the module no-ops and submits behave
 * exactly as today (blank attribution).
 *
 * The one-time backfill for records created before this shipped: set
 * REL_scope of work by hand (Builder → Records, or any grid with inline
 * edit on field_2329).
 */
(function () {
  'use strict';

  var FORM_VIEW  = 'view_3853';   // survey-request capture form (scene_1116)
  var SOW_FIELD  = 'field_2329';  // REL_scope of work on the capture object
  var SOW_VIEW   = 'view_3827';   // hidden SOW-header details view, same scene
  var NS         = '.scwSrqSowLink';

  // The page's SOW record id — the model of the SOW-header details view is
  // the SOW itself. Hash fallback matches survey-request-cards.js
  // currentSowId(): the second 24-hex token in the URL is the SOW.
  function pageSowId() {
    try {
      var v = window.Knack && Knack.views && Knack.views[SOW_VIEW];
      var a = v && v.model && v.model.attributes;
      if (a && /^[a-f0-9]{24}$/i.test(a.id || '')) return a.id;
    } catch (e) { /* fall through */ }
    var m = (window.location.hash || '').match(/[a-f0-9]{24}/g);
    return (m && m[1]) || '';
  }

  function apply() {
    var $select = $('#' + FORM_VIEW + '-' + SOW_FIELD);
    if (!$select.length) return;   // input not on the form yet — fail open

    var sowId = pageSowId();
    if (!sowId) return;            // SOW view not loaded yet — retry covers it

    // Hide the input group either way — even mid-retry the user shouldn't
    // see (or touch) the plumbing field.
    var group = document.querySelector('#' + FORM_VIEW + ' #kn-input-' + SOW_FIELD);
    if (group) group.style.display = 'none';

    if ($select.val() === sowId) return;   // already set — idempotent re-render

    // Lazy-loading connection dropdowns may not carry the SOW as an
    // <option> yet — append one so val() sticks.
    if (!$select.find('option[value="' + sowId + '"]').length) {
      $select.append($('<option>', { value: sowId, text: 'Current SOW' }));
    }
    $select.val(sowId);
    $select.trigger('chosen:updated');
    $select.trigger('liszt:updated');
    $('#kn-input-' + SOW_FIELD + ' input.connection[name="' + SOW_FIELD + '"]', '#' + FORM_VIEW)
      .val(sowId);
    $select.trigger('change');     // ← syncs Knack's internal form model
  }

  function onRender() {
    // The connection input (and the SOW view's model) can land after the
    // form's render event — retry a few times, harmless once applied.
    [50, 400, 1200].forEach(function (ms) { setTimeout(apply, ms); });
  }

  if (window.SCW && SCW.onViewRender) {
    SCW.onViewRender(FORM_VIEW, onRender, NS);
  } else {
    $(document)
      .off('knack-view-render.' + FORM_VIEW + NS)
      .on('knack-view-render.' + FORM_VIEW + NS, onRender);
  }

})();
