/*** FEATURE: Playbook View Toggle **********************************************
 *
 * On scene_1116, checks field_1747 ("Playbook is Incomplete"):
 *   - blank     → hide view_3829, show view_3831
 *   - not blank → show view_3829, hide view_3831
 *
 *******************************************************************************/
(function () {
  'use strict';

  var SCENE = 'scene_1116';
  var FIELD = 'field_1747';
  var VIEW_SHOW_WHEN_FILLED = 'view_3829';
  var VIEW_SHOW_WHEN_BLANK  = 'view_3831';

  function toggle() {
    var val = '';
    var el = document.getElementById(FIELD);
    if (el) {
      val = (el.value || '').trim();
    } else {
      var cell = document.querySelector('.' + FIELD);
      if (cell) val = (cell.textContent || '').trim();
    }

    var filled = val.length > 0;
    $('#' + VIEW_SHOW_WHEN_FILLED).toggle(filled);
    $('#' + VIEW_SHOW_WHEN_BLANK).toggle(!filled);
  }

  $(document).on('knack-scene-render.scene_1116.scwPlaybookToggle', function () {
    toggle();
  });

  $(document).on(
    'knack-view-render.' + VIEW_SHOW_WHEN_FILLED + '.scwPlaybookToggle ' +
    'knack-view-render.' + VIEW_SHOW_WHEN_BLANK + '.scwPlaybookToggle',
    function () { toggle(); }
  );
})();
/*** END FEATURE: Playbook View Toggle ****************************************/
