/* ── Style Detail Labels ─────────────────────────────────────────────
 *  Adds custom styling to .kn-detail-label elements within specified scenes.
 *  To apply the style to additional scenes, add the scene ID to the array below.
 * ──────────────────────────────────────────────────────────────────── */
(function styleDetailLabels() {
  var SCENE_IDS = [
    'scene_1096',
  ];

  var CSS_ID = 'scw-detail-label-css';

  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;

    var selectors = SCENE_IDS.map(function (id) {
      return '#kn-' + id + ' .kn-detail-label';
    }).join(',\n');

    var style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent =
      selectors + ' {\n' +
      '  background-color: aliceblue;\n' +
      '  width: 15%;\n' +
      '  text-align: center;\n' +
      '  vertical-align: middle;\n' +
      '}\n';
    document.head.appendChild(style);
  }

  SCENE_IDS.forEach(function (sceneId) {
    SCW.onSceneRender(sceneId, injectCSS, 'styleDetailLabels');
  });
})();
