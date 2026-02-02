(function () {
  const VIEW_IDS = ['view_3364'];
  const EVENT_NS = '.scwHideEmptyGrid';
  const CSS_ID = 'scw-hide-empty-grid-preload';

  // Hide these views by default (prevents flash)
  if (!document.getElementById(CSS_ID)) {
    const css = VIEW_IDS.map(id => `#${id}{visibility:hidden;}`).join('\n');
    $('<style>', { id: CSS_ID, text: css }).appendTo('head');
  }

  function revealOrRemove(viewId) {
    const $view = $('#' + viewId);
    if (!$view.length) return;

    const hasNoDataRow = $view.find('tbody tr.kn-tr-nodata').length > 0;

    if (hasNoDataRow) {
      $view.remove();
    } else {
      $view.css('visibility', 'visible');
    }
  }

  $(document)
    .off('knack-view-render.any' + EVENT_NS)
    .on('knack-view-render.any' + EVENT_NS, function (event, view) {
      if (!view || !VIEW_IDS.includes(view.key)) return;
      revealOrRemove(view.key);
    });
})();
