/**************************************************************************************************
 * LEGACY / RATKING SEGMENT
 * Goal: Make boundaries between “features” obvious without changing behavior.
 * Note: This file mixes global handlers, per-view hacks, and legacy utilities.
 **************************************************************************************************/

/**************************************************************************************************
 * FEATURE: Modal backdrop click-to-close DISABLE (possibly obsolete)
 * - DEPRECATE? Knack now has “keep open till action”
 * - Purpose: prevents closing modal when clicking outside it
 **************************************************************************************************/
(function modalBackdropClickDisable() {
  $(document).on('knack-scene-render.any', function (event, scene) {
    $('.kn-modal-bg').off('click');
  });
})();
/*** END FEATURE: Modal backdrop click-to-close DISABLE ************************************************/


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

/*** END FEATURE: Default field value injection *********************************************************/


/**************************************************************************************************
 * FEATURE: Post-inline-edit behavior (refresh / spinner / alerts)
 **************************************************************************************************/

/** Inline edit: view_1991 shows spinner + minor hash tweak */
(function inlineEdit_view1991_spinner() {
  $(document).on('knack-cell-update.view_1991', function (event, view, data) {
    setTimeout(function () { location.hash = location.hash + "#"; }, 100);
    Knack.showSpinner();
  });
})();

/** Record update: view_1493 alerts + fetches view model */
(function recordUpdate_view1493_alertAndFetch() {
  $(document).on('knack-record-update.view_1493', function (event, view, record) {
    alert("Click 'OK' to update equipment total");
    Knack.views["view_1493"].model.fetch();
    console.log("hello world");
    console.log(Knack.views);
  });
})();

/*** END FEATURE: Post-inline-edit behavior *************************************************************/


/**************************************************************************************************
 * FEATURE: Timepicker initialization (per-view list)
 * - Applies timepicker to .ui-timepicker-input when view renders
 **************************************************************************************************/
(function timepickerInit_perViewList() {
  var view_names = ["view_832"]; // add view numbers as necessary

  view_names.forEach(function bindToUpdate1(selector_view_name) {
    $(document).on('knack-view-render.' + selector_view_name, function (event, view, data) {
      $(document).ready(function () {
        $('.ui-timepicker-input').timepicker({
          minTime: '09:30:00', // change as necessary
          maxTime: '16:30:00'
        });
      });
    });
  });
})();
/*** END FEATURE: Timepicker initialization **************************************************************/





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
 * FEATURE: view_1509 UI text tweaks (discount description / label helpers)
 **************************************************************************************************/
(function discountCopyTweaks_view1509() {
  $(document).on('knack-view-render.view_1509', function (event, view) {
    // Add discount description
    $('<div><hr></br></div>').insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(3)');

    // Modify text around discount amount
    $('<span>-</span>').insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span');

    $('<span> discount for Annual plan = </span>').insertAfter('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span:nth-child(2)');
  });
})();
/*** END FEATURE: view_1509 UI tweaks *********************************************************************/


/**************************************************************************************************
 * FEATURE: Record update => “hash bump” refresh (micro-hacks)
 **************************************************************************************************/
(function hashBump_onRecordUpdate() {
  $(document).on('knack-record-update.view_2074', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2083', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2078', function (event, view, record) { location.hash = location.hash + "#"; });
  $(document).on('knack-record-update.view_2084', function (event, view, record) { location.hash = location.hash + "#"; });
})();
/*** END FEATURE: Record update => hash bump **************************************************************/


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

/** view_1378: Get Photos from TLS WO (Make/Integromat webhook) */
(function getPhotosFromTLS_view1378() {
  $(document).on('knack-view-render.view_1378', function (event, view) {
    $('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="getTLSPhotos"">Get Photos from TLS WO</button>')
      .insertAfter('#view_1378 > div.view-header > h2');

    $('#getTLSPhotos').click(function () {
      var projectID = window.location.href.split('/')[window.location.href.split('/').length - 2];
      var tlWO = prompt("What is the TLS WO ID?:");

      commandURL = "https://hook.integromat.com/bp83h6wunhoa9oc2ubm5hwklbc8u775i?projectID=" + projectID + "&tlWO=" + tlWO;

      $.get(commandURL, function (data, status) {
        Knack.hideSpinner();
      });

      Knack.showSpinner();

      setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
      alert('Integromat is going to download photos from ' + tlWO + ' . Depending on how many photos there are it could take a moment for this to complete. ');
      Knack.hideSpinner(); // ⚠ removed stray “P”
    });
  });
})();

/*** END FEATURE: Bulk actions on table rows **************************************************************/


/**************************************************************************************************
 * FEATURE: McGandy’s Experiment (scene_213) — margin/cost math
 * ⚠ Contains likely bug: document.querySelector('text#field_1365') should probably be input#field_1365
 **************************************************************************************************/
(function mcgandyExperiment_scene213() {
  $(document).on('knack-scene-render.scene_213', function (event, view, record) {
    setTimeout(function () {

      // subcontractor cost changed
      $('input#field_1364').change(function () {
        var subcontractor_cost = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = document.querySelector('input#field_1365').value;
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        var install_total = Knack.models['view_507'].toJSON().field_343.replaceAll(',', '').replaceAll('$', '');
        var fees_added = document.querySelector('input#field_1251').value.replaceAll(',', '');
        var more_fees_to_add = Math.round((marked_up_labor - install_total) + Math.round(fees_added));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1580').val(more_fees_to_add);
      });

      // survey cost changed
      $('input#field_1363').change(function () {
        var survey_cost = $(this).val();
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = document.querySelector('text#field_1365').value; // ⚠ likely wrong selector
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1365').keyup();
      });

      // marked up labor changed -> update margin
      $('input#field_1366').change(function () {
        var marked_up_labor = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var margin = Math.abs(Math.round(marked_up_labor - total_cost) / marked_up_labor);
        var margin_rounded = Math.round((margin + Number.EPSILON) * 100) / 100;

        $('input#field_1365').val(margin_rounded);
        $('input#field_1365').keyup();
      });

      // margin changed -> update marked up labor
      $('input#field_1365').change(function () {
        var margin = $(this).val();
        var survey_cost = document.querySelector('input#field_1363').value;
        var subcontractor_cost = document.querySelector('input#field_1364').value;
        var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
        var marked_up_labor = Math.round(total_cost / (1 - margin));

        $('input#field_1366').val(marked_up_labor);
        $('input#field_1366').keyup();
      });

    }, 1);
  });
})();
/*** END FEATURE: McGandy’s Experiment ********************************************************************/


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


/**************************************************************************************************
 * FEATURE: Quote / publish gating refresh & scroll preservation (legacy bundle)
 * - Contains multiple “rerender scene_view + restore scroll” handlers
 **************************************************************************************************/

/** Submit quote details form when equipment table changes (view_2830 -> submit view_2833) */
(function submitFormOnCellUpdate_view2830() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2830', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();

      $('#view_2833 button[type=submit]').submit();

      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 2000);
    });
  });
})();

/** Force rerender on equipment table edits (view_2911) */
(function rerenderOnCellUpdate_view2911_restoreScroll() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2911', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();
      Knack.router.scene_view.render();
      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 2000);
    });
  });
})();

/** Force rerender on drops table edits (view_2835) */
(function rerenderOnCellUpdate_view2835_restoreScroll() {
  $(document).ready(function () {
    $(document).on('knack-cell-update.view_2835', function (event, view, record) {
      var scrollPosition = $(window).scrollTop();
      Knack.router.scene_view.render();
      setTimeout(function () {
        $(window).scrollTop(scrollPosition);
      }, 500);
    });
  });
})();

/** Enhanced scroll anchoring for view_2835 changes (uses requestAnimationFrame) */
(function rerenderAndScrollTo_view2835_onFieldChange() {
  $(document).ready(function () {
    let previousFieldValue = null;
    let scrolling = false;

    function scrollToView2835() {
      const $v = $("#view_2835");
      if (!$v.length) return false;
      window.scrollTo(0, $v.offset().top);
      return true;
    }

    $(document).on("knack-cell-update.view_2835", function (event, view, record) {
      const currentFieldValue = record.field_60;

      if (previousFieldValue === null) previousFieldValue = currentFieldValue;
      if (previousFieldValue === currentFieldValue) return;

      previousFieldValue = currentFieldValue;

      if (scrolling) return;
      scrolling = true;

      Knack.router.scene_view.render();

      requestAnimationFrame(() => {
        scrollToView2835();
        requestAnimationFrame(() => {
          scrollToView2835();
          setTimeout(() => {
            scrollToView2835();
            scrolling = false;
          }, 200);
        });
      });
    });
  });
})();

/** Enhanced rerender for view_2911 changes only when certain fields change */
(function rerenderOnWatchedFields_view2911() {
  $(document).ready(function () {
    const watchedFields = ["field_128", "field_129", "field_301"];
    const prevByRecordId = {};
    let scrolling = false;

    function scrollToView2911() {
      const $v = $("#view_2911");
      if (!$v.length) return false;
      const headerOffset = 0;
      window.scrollTo(0, $v.offset().top - headerOffset);
      return true;
    }

    function getRecordId(record) {
      return record && (record.id || record._id || record.record_id);
    }

    function snapshot(record) {
      const snap = {};
      watchedFields.forEach((f) => { snap[f] = record ? record[f] : undefined; });
      return snap;
    }

    function changed(prevSnap, nextSnap) {
      if (!prevSnap) return true;
      return watchedFields.some((f) => prevSnap[f] !== nextSnap[f]);
    }

    $(document).on("knack-cell-update.view_2911", function (event, view, record) {
      const rid = getRecordId(record);
      if (!rid) return;

      const nextSnap = snapshot(record);
      const prevSnap = prevByRecordId[rid];

      if (!changed(prevSnap, nextSnap)) return;

      prevByRecordId[rid] = nextSnap;

      if (scrolling) return;
      scrolling = true;

      Knack.router.scene_view.render();

      requestAnimationFrame(() => {
        scrollToView2911();
        requestAnimationFrame(() => {
          scrollToView2911();
          setTimeout(() => {
            scrollToView2911();
            scrolling = false;
          }, 250);
        });
      });
    });
  });
})();

/*** END FEATURE: Quote/publish gating refresh bundle ******************************************************/


/**************************************************************************************************
 * FEATURE: Odd scene_776 stub (currently non-functional)
 **************************************************************************************************/
(function scene776_stub() {
  $(document).on('knack-scene-render.scene_776', function (event, view, data) {
    $('').click(function () { // ⚠ selector is empty -> does nothing
      $('#view_hide').show();
    });
  });
})();
/*** END FEATURE: Odd scene_776 stub ************************************************************************/
