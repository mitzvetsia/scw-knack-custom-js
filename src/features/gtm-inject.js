/***************************** GOOGLE TAG MANAGER — SCENE-SPECIFIC INJECTION *******************************/
(function () {
  var GTM_ID = "GTM-5XL9S9J";
  var SCENES = ["scene_1096"];

  var headInjected = false;

  function injectHead() {
    if (headInjected) return;
    if (document.getElementById("gtm-head-script")) return;
    headInjected = true;

    var script = document.createElement("script");
    script.id = "gtm-head-script";
    script.textContent =
      "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':" +
      "new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0]," +
      "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=" +
      "'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);" +
      "})(window,document,'script','dataLayer','" + GTM_ID + "');";

    // Insert as high in <head> as possible
    var first = document.head.firstChild;
    if (first) {
      document.head.insertBefore(script, first);
    } else {
      document.head.appendChild(script);
    }
  }

  function injectBody() {
    if (document.getElementById("gtm-body-noscript")) return;

    var ns = document.createElement("noscript");
    ns.id = "gtm-body-noscript";
    ns.innerHTML =
      '<iframe src="https://www.googletagmanager.com/ns.html?id=' + GTM_ID + '"' +
      ' height="0" width="0" style="display:none;visibility:hidden"></iframe>';

    // Insert immediately after the opening <body> tag
    var first = document.body.firstChild;
    if (first) {
      document.body.insertBefore(ns, first);
    } else {
      document.body.appendChild(ns);
    }
  }

  SCENES.forEach(function (sceneId) {
    $(document).on("knack-scene-render." + sceneId, function () {
      injectHead();
      injectBody();
    });
  });
})();
/***************************** GOOGLE TAG MANAGER — SCENE-SPECIFIC INJECTION *******************************/
