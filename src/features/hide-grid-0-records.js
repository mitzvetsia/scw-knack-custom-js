(function () {
  const VIEW_IDS = ['view_3364']; // add as needed

  $(document).on('knack-view-render.any', function (event, view, data) {
    if (!VIEW_IDS.includes(view.key)) return;

    if (!data || data.total_records === 0) {
      $('#' + view.key).remove(); 
      // or .hide() if you want layout spacing preserved
    }
  });
})();