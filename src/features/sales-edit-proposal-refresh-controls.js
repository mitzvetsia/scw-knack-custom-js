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
