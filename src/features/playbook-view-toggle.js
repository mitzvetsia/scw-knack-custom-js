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
  var VIEW_ALWAYS_HIDE      = 'view_3830';

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
    $('#' + VIEW_ALWAYS_HIDE).hide();
  }

  function formatDescriptions(container) {
    var descs = (container || document).querySelectorAll('.kn-description');
    for (var i = 0; i < descs.length; i++) {
      var el = descs[i];
      if (el.getAttribute('data-scw-formatted')) continue;
      el.setAttribute('data-scw-formatted', '1');
      el.style.paddingLeft = '5px';
      el.style.paddingRight = '5px';
      var html = el.innerHTML;
      html = html.replace(/(^|<br\s*\/?>)\s*-\s*/gi, '$1\u2022 ');
      el.innerHTML = html;
    }
  }

  $(document).on('knack-scene-render.scene_1116.scwPlaybookToggle', function () {
    toggle();
    formatDescriptions();
  });

  $(document).on('knack-scene-render.scene_977.scwPlaybookToggle', function () {
    formatDescriptions();
  });

  $(document).on(
    'knack-view-render.' + VIEW_SHOW_WHEN_FILLED + '.scwPlaybookToggle ' +
    'knack-view-render.' + VIEW_SHOW_WHEN_BLANK + '.scwPlaybookToggle',
    function () { toggle(); }
  );
})();
/*** END FEATURE: Playbook View Toggle ****************************************/
