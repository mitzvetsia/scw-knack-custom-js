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
  var PRODUCT_FIELD      = 'field_1949';
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

  /** Read the parent\'s field_1949 (product) id from view_3962. */
  function lookupParentProductId(parentId) {
    try {
      var v = window.Knack && Knack.views && Knack.views[SOURCE_VIEW];
      if (!v || !v.model || !v.model.data || typeof v.model.data.get !== 'function') return '';
      var rec = v.model.data.get(parentId);
      if (!rec) return '';
      var attrs = rec.attributes || rec;
      var raw = attrs.field_1949_raw;
      if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
      if (raw && raw.id) return raw.id;
      return '';
    } catch (e) { return ''; }
  }

  /** Build the bucket-grouped, compatibility-filtered option set for
   *  the accessory product picker and rewrite the Chosen <select> in
   *  place. We rely on Chosen\'s native <optgroup> rendering — Knack\'s
   *  form submit just reads the selected value as before. */
  function rewriteProductPicker(parentProductId) {
    var $select = window.jQuery && jQuery('#' + ADD_ACCESSORY_VIEW + '-' + PRODUCT_FIELD);
    if (!$select || !$select.length) return;
    var catalog = (window.SCW && window.SCW.mountingBoxProducts) || [];
    if (!catalog.length) return; // snippet hasn\'t loaded yet — leave Knack\'s default

    // Compatibility gate: an accessory is eligible if its
    // field_2236 OR field_2205 list contains the parent\'s product id.
    // Entries with neither field exposed pass through (old catalog data).
    var filtered = catalog.filter(function (p) {
      if (!p) return false;
      if (!parentProductId) return true;
      var a = Array.isArray(p.compatibleProducts)    ? p.compatibleProducts    : null;
      var b = Array.isArray(p.compatibleProductsAlt) ? p.compatibleProductsAlt : null;
      if (!a && !b) return true;
      return (a && a.indexOf(parentProductId) !== -1) ||
             (b && b.indexOf(parentProductId) !== -1);
    });

    // Group by proposal bucket (field_133-derived bucketName), same
    // shape as the toolbar\'s + Add Accessories modal.
    var grouped = Object.create(null);
    for (var i = 0; i < filtered.length; i++) {
      var p = filtered[i];
      var key   = p.bucketId   || '__other';
      var label = p.bucketName || 'Other';
      if (!grouped[key]) grouped[key] = { label: label, items: [] };
      grouped[key].items.push(p);
    }
    var groupList = Object.keys(grouped).map(function (k) { return grouped[k]; });
    groupList.sort(function (a, b) {
      if (a.label === 'Other' && b.label !== 'Other') return 1;
      if (b.label === 'Other' && a.label !== 'Other') return -1;
      return a.label.localeCompare(b.label, undefined,
        { numeric: true, sensitivity: 'base' });
    });

    // Rebuild the select. Keep Knack\'s "Select" placeholder, then
    // emit one <optgroup> per bucket with its products sorted by name.
    var prev = $select.val();
    $select.empty();
    $select.append('<option value="">Select</option>');
    groupList.forEach(function (g) {
      g.items.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), undefined,
          { numeric: true, sensitivity: 'base' });
      });
      var $og = jQuery('<optgroup></optgroup>').attr('label', g.label);
      g.items.forEach(function (p) {
        $og.append(
          jQuery('<option></option>')
            .attr('value', p.id)
            .text(p.name || '(unnamed)')
        );
      });
      $select.append($og);
    });
    if (prev) $select.val(prev);
    // Refresh Chosen so the new options render with groups.
    $select.trigger('chosen:updated');
    $select.trigger('liszt:updated');
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

  function applyAll() {
    prefill();
    var parentId = lastIdInHash();
    var parentProductId = parentId ? lookupParentProductId(parentId) : '';
    rewriteProductPicker(parentProductId);
  }

  // Two render events bracket the modal mount (view + modal). Bind to
  // both so we don\'t miss the right pass on either path.
  $(document).on('knack-view-render.' + ADD_ACCESSORY_VIEW, function () {
    setTimeout(applyAll, 1);
  });
  $(document).on('knack-modal-render.' + ADD_ACCESSORY_VIEW, function () {
    setTimeout(applyAll, 1);
  });

  // If the catalog is still loading when the modal opens, rewrite once
  // it lands (the snippet dispatches this event when out is ready).
  document.addEventListener('scw-mounting-box-products-ready', function () {
    var openModal = document.querySelector('#' + ADD_ACCESSORY_VIEW);
    if (openModal) applyAll();
  });
})();
/*** END WORKSHEET V2 — PREFILL ACCESSORY PARENT *****************************/
