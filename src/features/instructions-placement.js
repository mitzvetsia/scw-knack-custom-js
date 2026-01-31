

/**************************************************************************************************
 * FEATURE: Instructions placement (move .kn-instructions under labels)
 **************************************************************************************************/
(function instructionsPlacement_allForms() {
  $(document).on('knack-view-render.form', function (event, view, data) {
    $("#" + view.key + " .kn-instructions").each(function () {
      var inputLabel = $(this).closest(".kn-input").find(".kn-label");
      $(this).insertAfter(inputLabel);
    });
  });
})();
/*** END FEATURE: Instructions placement ******************************************************************/

