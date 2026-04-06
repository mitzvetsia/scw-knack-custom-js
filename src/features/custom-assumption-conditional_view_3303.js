////************* CUSTOM ASSUMPTION CONDITIONAL (view_3303) ***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_ID = 'view_3303';
  const BUCKET_FIELD_KEY = 'field_2223';
  const ASSUMPTION_TYPE_FIELD = 'field_2248';
  const ASSUMPTION_DESC_FIELD = 'field_2210';

  const ASSUMPTIONS_BUCKET_ID = '697b7a023a31502ec68b3303';
  const CUSTOM_ASSUMPTION_RECORD = '69ce7098172caa5786d3767d';

  const EVENT_NS = '.scwCustomAssumption3303';
  const CUSTOM_LABEL = 'detail custom assumption:';

  // ======================
  // DOM helpers
  // ======================
  function $wrapForKey($scope, key) {
    var $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;
    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;
    return $();
  }

  function getSelectValue($scope, fieldKey) {
    var $sel = $scope.find('#' + VIEW_ID + '-' + fieldKey);
    if (!$sel.length) $sel = $scope.find('select[name="' + fieldKey + '"]');
    return (($sel.val() || '') + '').trim();
  }

  function applyConditional($scope) {
    var bucketVal = getSelectValue($scope, BUCKET_FIELD_KEY);
    var typeVal = getSelectValue($scope, ASSUMPTION_TYPE_FIELD);

    var $descWrap = $wrapForKey($scope, ASSUMPTION_DESC_FIELD);
    if (!$descWrap.length) return;

    if (bucketVal === ASSUMPTIONS_BUCKET_ID && typeVal === CUSTOM_ASSUMPTION_RECORD) {
      $descWrap.show();
      // Rename the label
      var $label = $descWrap.find('label:first');
      if ($label.length && $label.text().trim() !== CUSTOM_LABEL) {
        $label.text(CUSTOM_LABEL);
      }
    } else {
      $descWrap.hide();
    }
  }

  // ======================
  // Binding
  // ======================
  function bindChanges() {
    var bucketSel = '#' + VIEW_ID + ' select[name="' + BUCKET_FIELD_KEY + '"], #' + VIEW_ID + ' #' + VIEW_ID + '-' + BUCKET_FIELD_KEY;
    var typeSel = '#' + VIEW_ID + ' select[name="' + ASSUMPTION_TYPE_FIELD + '"], #' + VIEW_ID + ' #' + VIEW_ID + '-' + ASSUMPTION_TYPE_FIELD;

    $(document)
      .off('change' + EVENT_NS, bucketSel)
      .on('change' + EVENT_NS, bucketSel, function () {
        var $scope = $(this).closest('form, .kn-form, .kn-view');
        if (!$scope.length) $scope = $('#' + VIEW_ID);
        applyConditional($scope);
      });

    $(document)
      .off('change' + EVENT_NS + '-type', typeSel)
      .on('change' + EVENT_NS + '-type', typeSel, function () {
        var $scope = $(this).closest('form, .kn-form, .kn-view');
        if (!$scope.length) $scope = $('#' + VIEW_ID);
        applyConditional($scope);
      });
  }

  function initView() {
    bindChanges();
    var $view = $('#' + VIEW_ID);
    applyConditional($view);
  }

  $(document)
    .off('knack-view-render.' + VIEW_ID + EVENT_NS)
    .on('knack-view-render.' + VIEW_ID + EVENT_NS, function () {
      initView();
    });
})();

////************* CUSTOM ASSUMPTION CONDITIONAL (view_3303) ***************//////

