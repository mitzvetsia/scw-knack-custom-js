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
    // TODO: replace with the real SOW Header update-form view id.
    FORM_VIEW: 'view_PLACEHOLDER',
    TARGET_PROJECT_FIELD: 'field_2753'
  };

  var NS = '.scwCloneSowToProject';

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

  function fireWebhook(sourceRecordId, targetProjectId) {
    var url = (window.SCW && SCW.CONFIG && SCW.CONFIG.MAKE_CLONE_SOW_TO_PROJECT_WEBHOOK) || '';
    if (!url || /PLACEHOLDER/.test(url)) {
      SCW.debug && SCW.debug('[scw-clone-sow-to-project] webhook URL not configured');
      return;
    }

    var payload = {
      sourceRecordId:  sourceRecordId,
      targetProjectId: targetProjectId,
      triggeredBy:     getTriggeredBy()
    };

    SCW.debug && SCW.debug('[scw-clone-sow-to-project] firing webhook', payload);

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      SCW.debug && SCW.debug('[scw-clone-sow-to-project] webhook status=' + resp.status);
    }).catch(function (err) {
      SCW.debug && SCW.debug('[scw-clone-sow-to-project] webhook error', err);
    });
  }

  function bind() {
    $(document).off('knack-record-update.' + CONFIG.FORM_VIEW + NS)
               .on('knack-record-update.' + CONFIG.FORM_VIEW + NS, function (event, view, record) {
      var targetProjectId = readTargetProjectId(record);
      if (!targetProjectId) {
        SCW.debug && SCW.debug('[scw-clone-sow-to-project] field_2753 empty — skipping webhook');
        return;
      }
      var sourceRecordId = (record && record.id) || '';
      if (!sourceRecordId) {
        SCW.debug && SCW.debug('[scw-clone-sow-to-project] no record id on update event — skipping');
        return;
      }
      fireWebhook(sourceRecordId, targetProjectId);
    });
  }

  bind();
})();
