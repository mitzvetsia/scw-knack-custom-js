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

  /** Find a record's attributes in view_3962's model. Iterates .models
   *  directly — Backbone Collection.get() is unreliable on Knack's
   *  model and can return nothing even when .models is populated
   *  (same fix as worksheet-v2/bulk.js attrsIndex). */
  function findRecordAttrs(parentId) {
    try {
      var v = window.Knack && Knack.views && Knack.views[SOURCE_VIEW];
      var models = (v && v.model && v.model.data && v.model.data.models) || [];
      for (var i = 0; i < models.length; i++) {
        var attrs = models[i] && models[i].attributes;
        if (attrs && attrs.id === parentId) return attrs;
      }
    } catch (e) { /* fall through */ }
    return null;
  }

  function lookupLabel(parentId) {
    var attrs = findRecordAttrs(parentId);
    if (!attrs) return '';
    var product = (attrs.field_1949 || '').toString().replace(/<[^>]*>/g, '').trim();
    var drop    = (attrs.field_1950 || '').toString().replace(/<[^>]*>/g, '').trim();
    if (product && drop) return drop + ' — ' + product;
    return product || drop || '';
  }

  /** Read the parent\'s field_1949 (product) id from view_3962. */
  function lookupParentProductId(parentId) {
    var attrs = findRecordAttrs(parentId);
    if (!attrs) return '';
    var raw = attrs.field_1949_raw;
    if (Array.isArray(raw) && raw.length && raw[0]) return raw[0].id || '';
    if (raw && raw.id) return raw.id;
    return '';
  }

  /** Build the bucket-grouped, compatibility-filtered option set for
   *  the accessory product picker and rewrite the Chosen <select> in
   *  place. We rely on Chosen\'s native <optgroup> rendering — Knack\'s
   *  form submit just reads the selected value as before. */
  function rewriteProductPicker(parentProductId) {
    // Without the parent\'s product id we can\'t compatibility-filter.
    // The catalog spans EVERY enabled product, so rewriting here would
    // REPLACE Knack\'s own query-filtered options with the full catalog
    // — leave the native picker untouched instead.
    if (!parentProductId) return;
    var $select = window.jQuery && jQuery('#' + ADD_ACCESSORY_VIEW + '-' + PRODUCT_FIELD);
    if (!$select || !$select.length) return;
    var catalog = (window.SCW && window.SCW.mountingBoxProducts) || [];
    if (!catalog.length) return; // snippet hasn\'t loaded yet — leave Knack\'s default

    // Compatibility gate: an accessory is eligible only when its
    // field_2236 OR field_2205 list contains the parent\'s product id.
    // No compat list = not an accessory (the catalog is the whole
    // enabled product list, not just accessories) — exclude it.
    var filtered = catalog.filter(function (p) {
      if (!p) return false;
      var a = (Array.isArray(p.compatibleProducts)    && p.compatibleProducts.length)    ? p.compatibleProducts    : null;
      var b = (Array.isArray(p.compatibleProductsAlt) && p.compatibleProductsAlt.length) ? p.compatibleProductsAlt : null;
      if (!a && !b) return false;
      return (a && a.indexOf(parentProductId) !== -1) ||
             (b && b.indexOf(parentProductId) !== -1);
    });
    // Nothing compatible → keep Knack\'s own (query-filtered) options
    // rather than emptying the picker.
    if (!filtered.length) return;

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
    // reads the correct value even before the Chosen UI sync. Knack\'s
    // search-style connection picker expects a URL-encoded JSON array
    // (e.g. %5B%22<id>%22%5D), NOT the bare id — bare id makes submit
    // post the visible label as a string instead of resolving the
    // connection. Match the format used by clone-sow-to-project.
    var $hidden = jQuery('#kn-input-' + PARENT_FIELD + ' input.connection[name="' + PARENT_FIELD + '"]');
    if ($hidden.length) {
      $hidden.val(encodeURIComponent(JSON.stringify([parentId])));
    }

    // Sync Chosen + Knack model — both event names cover the two
    // Chosen variants Knack ships.
    $select.trigger('chosen:updated');
    $select.trigger('liszt:updated');
    $select.trigger('change');
  }

  /** Build a clean v2-styled picker UI inside view_3580\'s form and
   *  hide Knack\'s default Chosen-based form-group. The native
   *  <select id="view_3580-field_1949"> and its hidden connection
   *  input remain in the DOM so Knack\'s form submit still reads
   *  values from them — we just write through our own UI. */
  function buildCustomShell(parentProductId) {
    var viewEl = document.getElementById(ADD_ACCESSORY_VIEW);
    if (!viewEl) return;
    var form = viewEl.querySelector('form');
    if (!form) return;
    // Mark the view so our CSS can hide Knack\'s rendered field UI.
    viewEl.classList.add('scw-ws-v2-acc-modal-shell');

    // Idempotent: bail if we already built the shell for this render.
    if (form.querySelector('.scw-ws-v2-acc-shell-picker')) return;

    var catalog = (window.SCW && window.SCW.mountingBoxProducts) || [];
    if (!catalog.length) return; // catalog still loading — retry on next event

    // Same filter + grouping as rewriteProductPicker, but built into
    // an inline node we own. Require a compat hit — no compat list
    // means "not an accessory", not "universal".
    var filtered = catalog.filter(function (p) {
      if (!p) return false;
      if (!parentProductId) return false;
      var a = (Array.isArray(p.compatibleProducts)    && p.compatibleProducts.length)    ? p.compatibleProducts    : null;
      var b = (Array.isArray(p.compatibleProductsAlt) && p.compatibleProductsAlt.length) ? p.compatibleProductsAlt : null;
      if (!a && !b) return false;
      return (a && a.indexOf(parentProductId) !== -1) ||
             (b && b.indexOf(parentProductId) !== -1);
    });
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

    // Build the shell HTML — title + native <select> with <optgroup>
    // sections. Native select is reliable, accessible, and bypasses
    // Chosen\'s init lag entirely.
    var shell = document.createElement('div');
    shell.className = 'scw-ws-v2-acc-shell-picker';
    var html =
      '<div class="scw-ws-v2-acc-shell-title">Pick an accessory product</div>' +
      '<select class="scw-ws-v2-acc-shell-select">' +
        '<option value="">— Choose an accessory —</option>';
    groupList.forEach(function (g) {
      g.items.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), undefined,
          { numeric: true, sensitivity: 'base' });
      });
      html += '<optgroup label="' + jQuery('<div/>').text(g.label).html() + '">';
      g.items.forEach(function (pp) {
        html += '<option value="' + pp.id + '">' +
          jQuery('<div/>').text(pp.name || '(unnamed)').html() +
        '</option>';
      });
      html += '</optgroup>';
    });
    html += '</select>';
    shell.innerHTML = html;

    // Insert before Knack\'s submit block so the existing submit button
    // stays visible + functional.
    var submitBlock = form.querySelector('.kn-submit');
    if (submitBlock) form.insertBefore(shell, submitBlock);
    else form.appendChild(shell);

    // On select change, mirror the value into Knack\'s native <select>
    // + the hidden connection input so the form submit picks it up.
    var $ourSelect = jQuery(shell).find('.scw-ws-v2-acc-shell-select');
    var $knackSelect = jQuery('#' + ADD_ACCESSORY_VIEW + '-' + PRODUCT_FIELD);
    var $knackHidden = jQuery('#kn-input-' + PRODUCT_FIELD +
                              ' input.connection[name="' + PRODUCT_FIELD + '"]');
    $ourSelect.on('change', function () {
      var v = $ourSelect.val() || '';
      // Make sure the option exists on Knack\'s select (was rewritten
      // above) — if not, append one so .val() takes.
      if (v && !$knackSelect.find('option[value="' + v + '"]').length) {
        var label = $ourSelect.find('option:selected').text();
        $knackSelect.append(
          jQuery('<option></option>').attr('value', v).text(label)
        );
      }
      $knackSelect.val(v);
      $knackHidden.val(v);
      $knackSelect.trigger('chosen:updated');
      $knackSelect.trigger('liszt:updated');
      $knackSelect.trigger('change');
    });
  }

  function applyAll() {
    prefill();
    var parentId = lastIdInHash();
    var parentProductId = parentId ? lookupParentProductId(parentId) : '';
    rewriteProductPicker(parentProductId);
    // buildCustomShell(parentProductId);  // paused — verify parent prefill first
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
