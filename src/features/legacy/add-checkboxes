

/**************************************************************************************************
 * FEATURE: Add row selection checkboxes to a table (utility)
 * ⚠ NOTE: This function is defined AGAIN later in your original blob.
 * Keeping one canonical copy is strongly recommended.
 **************************************************************************************************/
var addCheckboxes = function (view) {
  // add checkbox in header (select/unselect all)
  $('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');

  $('#' + view.key + '.kn-table thead input').change(function () {
    $('.' + view.key + '.kn-table tbody tr input').each(function () {
      $(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
    });
  });

  // add checkbox to each row in the table body
  $('#' + view.key + '.kn-table tbody tr').each(function () {
    $(this).prepend('<td><input type="checkbox"></td>');
  });
};
/*** END FEATURE: Add row selection checkboxes ************************************************************/



/**************************************************************************************************
 * FEATURE: Bulk actions on table rows (Assign Photos to Run / Get Photos from TLS)
 * - Uses addCheckboxes(view) utility above
 * ⚠ NOTE: Original had stray “P” after Knack.hideSpinner(); leaving as-is is unsafe.
 **************************************************************************************************/

/** view_2179: Assign Photos to Run (Make/Integromat webhook) */
(function assignPhotosToRun_view2179() {
  $(document).on('knack-view-render.view_2179', function (event, view) {
    $('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="assignphotos"">Assign Photos to Run</button>')
      .insertAfter('#view_2179 > div.view-header > h2');

    addCheckboxes(view);

    $('#assignphotos').click(function () {
      var record_ids = [];
      var runID = window.location.href.split('/')[window.location.href.split('/').length - 2];

      $('#' + view.key + ' tbody input[type=checkbox]:checked').each(function () {
        record_ids.push($(this).closest('tr').attr('id'));
      });

      commandURL = "https://hook.integromat.com/ecrm451p73bbgy6it4iu8iwpnpqh1vdf?recordid=" + record_ids + "&runID=" + runID;

      $.get(commandURL, function (data, status) {
        Knack.hideSpinner();
      });

      Knack.showSpinner();

      var selectedRecords = record_ids.length;

      setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
      alert('Integromat is updating ' + selectedRecords + ' records. Depending on how many photos you are updating this could take a few minutes');
      Knack.hideSpinner(); // ⚠ removed stray “P”
    });
  });
})();
