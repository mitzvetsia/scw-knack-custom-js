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



/*** END FEATURE: Bulk actions on table rows **************************************************************/

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
