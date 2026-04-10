/**************************************************************************************************
 * FEATURE: Default field value injection (single-purpose hacks)
 **************************************************************************************************/

/** Default: view_1519 sets field_932 */
(function defaultValue_view1519_field932() {
  $(document).on('knack-view-render.view_1519', function (event, view, data) {
    setTimeout(function () {
      $('input#field_932').attr('value', '5deebcd9525d220015a14e1f'); // works
    }, 1);
  });
})();

/** Default: modal view_1328 sets field_737 */
(function defaultValue_modal1328_field737() {
  $(document).on('knack-modal-render.view_1328', function (event, view, record) {
    setTimeout(function () {
      $('input#field_737').attr('value', 'Create_Project');
    }, 1);
  });
})();

/** Default: scene_208 sets field_877 */
(function defaultValue_scene208_field877() {
  $(document).on('knack-scene-render.scene_208', function (event, view, record) {
    setTimeout(function () {
      $('input#field_877').attr('value', 'Deputy 8.0');
    }, 1);
  });
})();

/** Default: modal view_1457 sets field_737 */
(function defaultValue_modal1457_field737() {
  $(document).on('knack-modal-render.view_1457', function (event, view, record) {
    setTimeout(function () {
      $('input#field_737').attr('value', 'Create_Project');
    }, 1);
  });
})();

/** Default: view_3566 auto-selects the first option for field_2342 (REL_sow line items) */
(function defaultValue_view3566_field2342() {
  $(document).on('knack-view-render.view_3566', function () {
    setTimeout(function () {
      var $select = $('#view_3566-field_2342');
      if (!$select.length) return;

      // Skip if something is already selected
      if ($select.val() && $select.val().length) return;

      // Grab the first option with a real value
      var $first = $select.find('option').filter(function () {
        return !!this.value;
      }).first();
      if (!$first.length) return;

      $first.prop('selected', true);
      $select.trigger('chosen:updated');
      $select.trigger('liszt:updated');

      // Sync the hidden input Knack uses for form submission
      var $hidden = $('#kn-input-field_2342 input.connection[name="field_2342"]');
      $hidden.val($first.val());

      $select.trigger('change');
    }, 1);
  });
})();

/*** END FEATURE: Default field value injection *********************************************************/
