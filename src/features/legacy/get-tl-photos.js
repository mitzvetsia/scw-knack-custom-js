
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
