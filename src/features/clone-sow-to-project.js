/*** CLONE SOW TO PROJECT ***/
/**
 * Piggybacks on the SOW Header update form submit. When the user picks a
 * target Project in field_2753 and submits, Knack saves the record as
 * usual; we then fire a Make webhook with the SOW id, the target Project
 * id (field_2753), and the user that submitted. Make handles the deep
 * clone (SOW + MDFs + photos) into the target Project.
 *
 * If field_2753 is empty on submit, we do nothing — submit is a no-op
 * for cloning.
 */
(function () {
  'use strict';

  var CONFIG = {
    FORM_VIEW: 'view_3907',
    TARGET_PROJECT_FIELD: 'field_2753'
  };

  var NS = '.scwCloneSowToProject';
  var TAG = '[scw-clone-sow-to-project]';

  console.log(TAG, 'module loaded — binding to', CONFIG.FORM_VIEW);

  function getTriggeredBy() {
    try {
      var u = Knack.getUserAttributes && Knack.getUserAttributes();
      if (u && typeof u === 'object') {
        return { id: u.id || '', name: u.name || '', email: u.email || '' };
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  // field_2753 is a connection field. Knack's record-update event hands
  // back a record where connection fields live at `field_XXXX_raw` as an
  // array of { id, identifier }. The plain `field_XXXX` is the rendered
  // HTML/label. Prefer _raw, fall back to plain.
  function readTargetProjectId(record) {
    if (!record) return '';
    var raw = record[CONFIG.TARGET_PROJECT_FIELD + '_raw'];
    if (raw && raw.length && raw[0] && raw[0].id) return raw[0].id;
    var plain = record[CONFIG.TARGET_PROJECT_FIELD];
    if (typeof plain === 'string' && /^[a-f0-9]{24}$/.test(plain)) return plain;
    return '';
  }

  // Fallback: read the picked Project id directly from the DOM. The
  // hidden <input class="connection" name="field_2753"> holds a JSON
  // (URL-encoded) array like %5B%22<recordId>%22%5D after a pick.
  function readTargetProjectIdFromDom() {
    try {
      var $form = $('#' + CONFIG.FORM_VIEW + ' form');
      var $hidden = $form.find('input.connection[name="' + CONFIG.TARGET_PROJECT_FIELD + '"]');
      if (!$hidden.length) return '';
      var raw = $hidden.val() || '';
      var decoded = decodeURIComponent(raw);
      if (!decoded || decoded === '[]') return '';
      var parsed = null;
      try { parsed = JSON.parse(decoded); } catch (e) { /* not JSON */ }
      if (Array.isArray(parsed) && parsed.length) {
        var first = parsed[0];
        if (typeof first === 'string' && /^[a-f0-9]{24}$/.test(first)) return first;
        if (first && typeof first === 'object' && first.id) return first.id;
      }
      // Last resort: the visible <select>'s current value.
      var $select = $('#' + CONFIG.FORM_VIEW + '-' + CONFIG.TARGET_PROJECT_FIELD);
      var sel = $select.val();
      if (typeof sel === 'string' && /^[a-f0-9]{24}$/.test(sel)) return sel;
    } catch (e) { /* ignore */ }
    return '';
  }

  function readSourceSowIdFromDom() {
    try {
      var $form = $('#' + CONFIG.FORM_VIEW + ' form');
      var v = $form.find('input[name="id"]').val();
      if (typeof v === 'string' && /^[a-f0-9]{24}$/.test(v)) return v;
    } catch (e) { /* ignore */ }
    return '';
  }

  function fireWebhook(sourceRecordId, targetProjectId) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CLONE_SOW_TO_PROJECT_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      console.warn(TAG, 'webhook URL not configured');
      return;
    }

    var payload = {
      sourceRecordId:  sourceRecordId,
      targetProjectId: targetProjectId,
      triggeredBy:     getTriggeredBy()
    };

    console.log(TAG, 'firing webhook', payload);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      console.log(TAG, 'webhook status=' + resp.status);
    }).catch(function (err) {
      console.warn(TAG, 'webhook error', err);
    });
  }

  // Knack clears the form's connection input as part of its save flow,
  // so by the time knack-record-update / knack-form-submit fires, the
  // hidden input.connection is back to "[]" and the record arg has no
  // field_2753. Workaround: capture the picked Project id at submit-
  // button-click time (capture phase, before Knack's own click handler
  // tears down the form), then use the captured value when the post-
  // save event fires.
  var pendingTargetProjectId = '';
  var pendingSourceRecordId  = '';
  var pendingCapturedAt      = 0;

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('button[type="submit"]');
    if (!btn) return;
    var form = btn.closest('form');
    if (!form) return;
    if (!form.closest('#' + CONFIG.FORM_VIEW)) return;

    pendingTargetProjectId = readTargetProjectIdFromDom();
    pendingSourceRecordId  = readSourceSowIdFromDom();
    pendingCapturedAt      = Date.now();
    console.log(TAG, 'submit click captured', {
      sourceRecordId:  pendingSourceRecordId,
      targetProjectId: pendingTargetProjectId
    });
  }, true); // capture phase — runs before Knack's own click handler

  // Single dispatch: works whether the event delivered the record arg
  // (knack-record-update) or not (knack-form-submit). De-duped via a
  // short cooldown so we don't fire twice when both events fire on the
  // same submit.
  var lastFiredAt = 0;
  function handleSubmit(eventName, recordArg) {
    var now = Date.now();
    if (now - lastFiredAt < 1500) {
      console.log(TAG, eventName + ' fired but within cooldown — skipping');
      return;
    }

    // Prefer the captured-on-click value (Knack clears the form by the
    // time the post-save event fires). Fall back to record / DOM in case
    // the click capture didn't run (e.g. Enter key submit on some flows).
    var capturedFresh = (now - pendingCapturedAt) < 30000;
    var targetProjectId = (capturedFresh && pendingTargetProjectId) ||
                          readTargetProjectId(recordArg) ||
                          readTargetProjectIdFromDom();
    var sourceRecordId  = (recordArg && recordArg.id) ||
                          (capturedFresh && pendingSourceRecordId) ||
                          readSourceSowIdFromDom();

    console.log(TAG, eventName + ' fired', {
      sourceRecordId:  sourceRecordId,
      targetProjectId: targetProjectId,
      capturedFresh:   capturedFresh,
      recordArg:       recordArg
    });

    if (!targetProjectId) {
      console.log(TAG, 'field_2753 empty — skipping webhook');
      return;
    }
    if (!sourceRecordId) {
      console.warn(TAG, 'no SOW record id — skipping webhook');
      return;
    }

    lastFiredAt = now;
    pendingTargetProjectId = '';
    pendingSourceRecordId  = '';
    fireWebhook(sourceRecordId, targetProjectId);
  }

  function bind() {
    $(document).off('knack-record-update.' + CONFIG.FORM_VIEW + NS)
               .on('knack-record-update.' + CONFIG.FORM_VIEW + NS, function (event, view, record) {
      handleSubmit('knack-record-update', record);
    });

    $(document).off('knack-form-submit.' + CONFIG.FORM_VIEW + NS)
               .on('knack-form-submit.' + CONFIG.FORM_VIEW + NS, function (event, view, record) {
      handleSubmit('knack-form-submit', record);
    });
  }

  bind();
})();
