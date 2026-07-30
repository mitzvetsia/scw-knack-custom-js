/*** FEATURE: Modal form connection prefill sync ******************************
 *
 * When Knack opens a child-page form in a modal with a parent-record crumb
 * (e.g. the bid-review "Upload new document" flow → add-document-review-bid
 * → view_3967), it prefills connection fields' Chosen UI from the crumb —
 * the chip renders selected — but can leave the hidden `input.connection`
 * (the value Knack actually serializes on submit) holding its encoded-empty
 * placeholder (`%22%22`). Submitting then POSTs a junk connection value and
 * the renderer-write endpoint rejects the whole form with 400 Bad Request,
 * so the Submit button looks dead.
 *
 * Fix: after the form view renders, for each configured connection field,
 * read the select's real value and — only when the hidden input is out of
 * sync — write it back and fire `change` so Knack's own handler re-syncs
 * its internal form model (the CLAUDE.md programmatic-set contract).
 ****************************************************************************/
(function () {
  'use strict';

  // viewId → connection field keys to keep in sync on that form.
  var FORMS = [
    { viewId: 'view_3967', fields: ['field_2143'] }   // Add DOC_file (bid review)
  ];

  function syncField(viewId, fieldKey) {
    var $select = $('#' + viewId + '-' + fieldKey);
    if (!$select.length) return;
    var v = $select.val();
    var vals = Array.isArray(v) ? v : (v ? [v] : []);
    if (!vals.length) return;   // nothing selected — leave Knack's empty state alone

    var $hidden = $('#' + viewId + ' #kn-input-' + fieldKey +
                    ' input.connection[name="' + fieldKey + '"]');
    if (!$hidden.length) return;

    // Already carrying every selected id? Then Knack synced it — hands off.
    var hv = String($hidden.val() || '');
    var inSync = vals.every(function (id) { return hv.indexOf(id) !== -1; });
    if (inSync) return;

    $hidden.val(vals.join(','));
    // Let Knack's own change handler rewrite hidden + internal model in its
    // canonical shape (our comma-join is just the fallback if it doesn't).
    $select.trigger('chosen:updated');
    $select.trigger('liszt:updated');
    $select.trigger('change');
  }

  FORMS.forEach(function (cfg) {
    SCW.onViewRender(cfg.viewId, function () {
      // Small delay so Knack's own prefill (and Chosen init) finishes first.
      setTimeout(function () {
        for (var i = 0; i < cfg.fields.length; i++) {
          try { syncField(cfg.viewId, cfg.fields[i]); }
          catch (e) { console.warn('[scw-modal-conn-sync]', cfg.viewId, cfg.fields[i], e); }
        }
      }, 150);
    }, 'scwModalConnSync');
  });
})();
/*** END FEATURE: Modal form connection prefill sync **************************/
