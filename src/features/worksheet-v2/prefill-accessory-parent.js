/*** WORKSHEET V2 — PREFILL ACCESSORY PARENT *********************************
 *
 * When the "Add Accessory" form (view_3580) renders, the REL accessories
 * field (field_2464) should default to the parent line item the user
 * clicked "+ Add" on. Knack pre-fills the hidden input but leaves the
 * Chosen-rendered <select> empty, which means the user sees an empty
 * picker and has to search for the parent manually.
 *
 * Pattern matches ratking/default-field-values.js — bind to the view\'s
 * render event, inject an <option>, set it selected, fire chosen:updated
 * + change so Knack\'s model picks it up.
 *
 * Parent id source: last 24-hex segment in the URL hash (Knack\'s
 * `add-accessory-line-item_id` crumb). Label source: walk view_3962\'s
 * Backbone model for the matching record and read field_1949 (product
 * name) — falls back to field_1950 (drop label) then the bare id.
 *****************************************************************************/
(function () {
  'use strict';

  var ADD_ACCESSORY_VIEW = 'view_3580';
  var PARENT_FIELD       = 'field_2464';
  var SOURCE_VIEW        = 'view_3962'; // v2 worksheet source for label lookup

  function lastIdInHash() {
    var hash = window.location.hash || '';
    var matches = hash.match(/[a-f0-9]{24}/g);
    return matches && matches.length ? matches[matches.length - 1] : '';
  }

  function lookupLabel(parentId) {
    try {
      var v = window.Knack && Knack.views && Knack.views[SOURCE_VIEW];
      if (!v || !v.model || !v.model.data || typeof v.model.data.get !== 'function') return '';
      var rec = v.model.data.get(parentId);
      if (!rec) return '';
      var attrs = rec.attributes || rec;
      var product = (attrs.field_1949 || '').toString().replace(/<[^>]*>/g, '').trim();
      var drop    = (attrs.field_1950 || '').toString().replace(/<[^>]*>/g, '').trim();
      if (product && drop) return drop + ' — ' + product;
      return product || drop || '';
    } catch (e) { return ''; }
  }

  function prefill() {
    var parentId = lastIdInHash();
    if (!parentId) return;
    var $select = window.jQuery && jQuery('#' + ADD_ACCESSORY_VIEW + '-' + PARENT_FIELD);
    if (!$select || !$select.length) return;
    // Skip if Knack already populated something.
    if ($select.val() && $select.val().length) return;

    var label = lookupLabel(parentId) || parentId;
    // Inject the option (Knack\'s connection-picker normally lazy-loads
    // via search; we shortcut by pre-seeding the picker with the one
    // option we know is correct).
    var existing = $select.find('option[value="' + parentId + '"]');
    if (!existing.length) {
      $select.append('<option value="' + parentId + '">' + jQuery('<div/>').text(label).html() + '</option>');
    }
    $select.val(parentId);

    // Also patch the hidden connection input so Knack\'s submit handler
    // reads the correct value even before the Chosen UI sync.
    var $hidden = jQuery('#kn-input-' + PARENT_FIELD + ' input.connection[name="' + PARENT_FIELD + '"]');
    $hidden.val(parentId);

    // Sync Chosen + Knack model — both event names cover the two
    // Chosen variants Knack ships.
    $select.trigger('chosen:updated');
    $select.trigger('liszt:updated');
    $select.trigger('change');
  }

  // Two render events bracket the modal mount (view + modal). Bind to
  // both so we don\'t miss the right pass on either path.
  $(document).on('knack-view-render.' + ADD_ACCESSORY_VIEW, function () {
    setTimeout(prefill, 1);
  });
  $(document).on('knack-modal-render.' + ADD_ACCESSORY_VIEW, function () {
    setTimeout(prefill, 1);
  });
})();
/*** END WORKSHEET V2 — PREFILL ACCESSORY PARENT *****************************/
