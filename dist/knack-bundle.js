



(function () {
  const applyCheckboxGrid = () => {
    document.querySelectorAll('#connection-picker-checkbox-field_739').forEach(container => {
      if (!container.classList.contains('multi-column-processed')) {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(4, 1fr)';
        container.style.gap = '0.5em';
        container.classList.add('multi-column-processed');

        container.querySelectorAll('.control').forEach(ctrl => {
          ctrl.style.marginBottom = '0.25em';
        });
      }
    });
  };

  // MutationObserver to watch for popups / form changes
  const observer = new MutationObserver(() => applyCheckboxGrid());

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Apply once on DOM ready
  document.addEventListener('DOMContentLoaded', applyCheckboxGrid);
})();






/***************************** SURVEY / PROJECT FORM - network device mapping *******************/

















const checkboxStateByView = {};

function enableCheckboxSelectSync({ viewId, selectFieldId }) {
  checkboxStateByView[viewId] = checkboxStateByView[viewId] || [];

  $(document).on(`knack-view-render.${viewId}`, function () {
    console.log(`✅ View ${viewId} rendered`);

    const $selectInput = $(`#${viewId}-${selectFieldId}`);
    if (!$selectInput.length) {
      console.error(`❌ Select input not found in ${viewId}`);
      return;
    }

    // ✅ Force open to trigger Knack to populate options
    $selectInput.trigger('focus').trigger('mousedown');

    // ✅ MutationObserver for normal (multi-option) cases
    const observer = new MutationObserver(() => {
      const options = $selectInput.find('option');
      if (options.length === 0) return;

      console.log(`📋 ${options.length} options detected in ${viewId}`);
      syncSelectedToCheckboxState(options, viewId);
      observer.disconnect();
      renderCheckboxes();
      bindCheckboxListeners();
    });

    observer.observe($selectInput[0], { childList: true, subtree: true });

    // ✅ Fallback polling in case only one quote and Knack injects slowly
    const fallbackPoll = setInterval(() => {
      const options = $selectInput.find('option');
      if (options.length > 0) {
        clearInterval(fallbackPoll);
        console.log(`⏳ Fallback: camera options detected in ${viewId}`);
        syncSelectedToCheckboxState(options, viewId);
        renderCheckboxes();
        bindCheckboxListeners();
      }
    }, 100);

    // ✅ Handle quote field change (clear + wait for new camera list)
    $(document).off(`change.quote-${viewId}`);
    $(document).on(`change.quote-${viewId}`, `#${viewId}-field_1864`, function () {
      console.log(`🔁 Quote field changed in ${viewId}`);

      $(`#custom-checkboxes-${viewId} input[type="checkbox"]:checked`).each(function () {
        const val = $(this).val();
        const label = $(this).parent().text().trim();
        if (!checkboxStateByView[viewId].some(o => o.value === val)) {
          checkboxStateByView[viewId].push({ value: val, label });
        }
      });

      const reobserve = new MutationObserver(() => {
        const options = $selectInput.find('option');
        if (options.length === 0) return;

        reobserve.disconnect();
        renderCheckboxes();
        bindCheckboxListeners();
      });

      $selectInput.trigger('focus').trigger('mousedown');
      reobserve.observe($selectInput[0], { childList: true, subtree: true });
    });

    function syncSelectedToCheckboxState(options, viewId) {
      options.filter(':selected').each(function () {
        const val = $(this).val();
        const label = $(this).text();
        if (!checkboxStateByView[viewId].some(o => o.value === val)) {
          checkboxStateByView[viewId].push({ value: val, label });
        }
      });
    }

    function renderCheckboxes() {
      const $chosen = $selectInput.siblings('.chzn-container');
      if ($chosen.length) $chosen.hide();

      $(`#custom-checkboxes-${viewId}`).remove();

      $selectInput.find('option').prop('selected', false);
      checkboxStateByView[viewId].forEach(({ value }) => {
        $selectInput.find(`option[value="${value}"]`).prop('selected', true);
      });
      $selectInput.trigger('change').trigger('chosen:updated');

      let html = `<div id="custom-checkboxes-${viewId}" style="margin-top:10px;">`;
      const seen = {};

      checkboxStateByView[viewId].forEach(({ value, label }) => {
        html += `<label style="display:block;margin:5px 0;">
                   <input type="checkbox" value="${value}" checked> ${label}
                 </label>`;
        seen[value] = true;
      });

      $selectInput.find('option').each(function () {
        const val = $(this).val();
        const label = $(this).text();
        if (!seen[val]) {
          html += `<label style="display:block;margin:5px 0;">
                     <input type="checkbox" value="${val}"> ${label}
                   </label>`;
        }
      });

      html += '</div>';
      $selectInput.after(html);
    }

    function bindCheckboxListeners() {
      $(document).off(`change.checkbox-${viewId}`);
      $(document).on(`change.checkbox-${viewId}`, `#custom-checkboxes-${viewId} input[type="checkbox"]`, function () {
        $selectInput.find('option').prop('selected', false);
        checkboxStateByView[viewId] = [];

        $(`#custom-checkboxes-${viewId} input[type="checkbox"]:checked`).each(function () {
          const val = $(this).val();
          const label = $(this).parent().text().trim();
          checkboxStateByView[viewId].push({ value: val, label });
          $selectInput.find(`option[value="${val}"]`).prop('selected', true);
        });

        $selectInput.trigger('change').trigger('chosen:updated');
      });
    }
  });
}

// ✅ Activate for each view
enableCheckboxSelectSync({
  viewId: 'view_2688',
  selectFieldId: 'field_1656'
});

enableCheckboxSelectSync({
  viewId: 'view_2697',
  selectFieldId: 'field_1656'
});

/*










/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/

// Working version + Different message for each situation 🎯

$(document).on('knack-view-render.view_3094', function(event, view, data) {
  console.log('✅ View 3094 loaded');

  const uploadFields = ['field_1808_upload', 'field_1809_upload'];

  uploadFields.forEach(function(inputFieldId) {
    const $uploadWrapper = $('#' + inputFieldId).parent('.kn-file-upload');
    const $fileInput = $('#' + inputFieldId);

    let existingFilename = '';

    if ($uploadWrapper.length && $fileInput.length) {
      console.log('🔎 Upload wrapper exists for', inputFieldId);

      // Style wrapper
      $uploadWrapper.css({
        position: 'relative',
        width: '100%',
        height: '150px',
        minHeight: '150px',
        backgroundColor: 'rgba(255, 0, 0, 0.2)', // Default RED
        transition: 'background-color 0.5s ease'
      });

      $fileInput.css({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
        zIndex: 2
      });

      // Add overlay (only once)
      if ($uploadWrapper.find('.upload-message').length === 0) {
        $uploadWrapper.append(`
          <div class="upload-message" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed #1890ff;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            color: #1890ff;
            text-align: center;
            pointer-events: none;
            z-index: 1;
          ">
            📂 Drop your file here or click to upload
          </div>
        `);
      }

      function getFilenameFromAsset(assetElement) {
        if (!assetElement) return '';
        const link = assetElement.querySelector('a');
        if (link) {
          return link.innerText.trim();
        } else {
          return assetElement.innerText.replace(/remove/i, '').trim();
        }
      }

      function setUploadMessage(currentFilename, newFilename = '', mode = 'normal') {
        const $message = $uploadWrapper.find('.upload-message');

        if (mode === 'uploading-new') {
          // Uploading a file where none existed
          $message.html(`
            <div style="padding: 20px;">
              📂 Please click UPDATE to upload this file:<br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (mode === 'uploading-replacement') {
          // Replacing an existing file
          $message.html(`
            <div style="padding: 20px;">
              ♻️ Click UPDATE to replace <br><strong>${currentFilename}</strong><br> with <br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (currentFilename) {
          // File already uploaded
          $message.html(`
            <div style="padding: 20px;">
              📄 Good Job!
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(0, 128, 0, 0.2)'); // GREEN
        } else {
          // Default state (no file)
          $message.html(`📂 Drop your file here or click to upload`);
          $uploadWrapper.css('background-color', 'rgba(255, 0, 0, 0.2)'); // RED
        }
      }

      function hideAssetCurrent() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        if (assetCurrentNow) {
          $(assetCurrentNow).hide();
        }
      }

      function checkExistingUpload() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        const filename = getFilenameFromAsset(assetCurrentNow);

        console.log('📦 Existing upload detected for', inputFieldId, ':', filename);

        if (filename) {
          existingFilename = filename;
          setUploadMessage(existingFilename);
        } else {
          setUploadMessage('');
        }

        hideAssetCurrent();
      }

      checkExistingUpload();

      // MutationObserver for each upload field
      const observeTarget = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
      if (observeTarget) {
        const observer = new MutationObserver(function(mutationsList, observer) {
          for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              console.log('🛰️ Upload updated for', inputFieldId);

              const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
              const filename = getFilenameFromAsset(assetCurrentNow);

              console.log('🛰️ Found filename:', filename);

              if (filename) {
                if (existingFilename && filename !== existingFilename) {
                  // Replacing an existing file
                  setUploadMessage(existingFilename, filename, 'uploading-replacement');
                } else if (!existingFilename) {
                  // Uploading a new file where there was none
                  setUploadMessage('', filename, 'uploading-new');
                } else {
                  // No change
                  existingFilename = filename;
                  setUploadMessage(filename);
                }
              } else {
                setUploadMessage('', '', 'empty');
              }

              hideAssetCurrent();
            }
          }
        });

        observer.observe(observeTarget, { childList: true, subtree: true });
        console.log('🔭 Observer initialized for', inputFieldId);
      } else {
        console.log('🚫 No observer target for', inputFieldId);
      }

    } else {
      console.log('🚫 Upload wrapper or input not found for', inputFieldId);
    }
  });

});


/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/




/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: YES WATTBOX SECTION *******************/

// Working version + Different message for each situation 🎯

$(document).on('knack-view-render.view_3297', function(event, view, data) {
  console.log('✅ View 3297 loaded');

  const uploadFields = ['field_1808_upload', 'field_1809_upload', 'field_1930_upload'];

  uploadFields.forEach(function(inputFieldId) {
    const $uploadWrapper = $('#' + inputFieldId).parent('.kn-file-upload');
    const $fileInput = $('#' + inputFieldId);

    let existingFilename = '';

    if ($uploadWrapper.length && $fileInput.length) {
      console.log('🔎 Upload wrapper exists for', inputFieldId);

      // Style wrapper
      $uploadWrapper.css({
        position: 'relative',
        width: '100%',
        height: '150px',
        minHeight: '150px',
        backgroundColor: 'rgba(255, 0, 0, 0.2)', // Default RED
        transition: 'background-color 0.5s ease'
      });

      $fileInput.css({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        cursor: 'pointer',
        zIndex: 2
      });

      // Add overlay (only once)
      if ($uploadWrapper.find('.upload-message').length === 0) {
        $uploadWrapper.append(`
          <div class="upload-message" style="
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px dashed #1890ff;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 500;
            color: #1890ff;
            text-align: center;
            pointer-events: none;
            z-index: 1;
          ">
            📂 Drop your file here or click to upload
          </div>
        `);
      }

      function getFilenameFromAsset(assetElement) {
        if (!assetElement) return '';
        const link = assetElement.querySelector('a');
        if (link) {
          return link.innerText.trim();
        } else {
          return assetElement.innerText.replace(/remove/i, '').trim();
        }
      }

      function setUploadMessage(currentFilename, newFilename = '', mode = 'normal') {
        const $message = $uploadWrapper.find('.upload-message');

        if (mode === 'uploading-new') {
          // Uploading a file where none existed
          $message.html(`
            <div style="padding: 20px;">
              📂 Please click UPDATE to upload this file:<br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (mode === 'uploading-replacement') {
          // Replacing an existing file
          $message.html(`
            <div style="padding: 20px;">
              ♻️ Click UPDATE to replace <br><strong>${currentFilename}</strong><br> with <br><strong>${newFilename}</strong>
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)'); // ORANGE
        } else if (currentFilename) {
          // File already uploaded
          $message.html(`
            <div style="padding: 20px;">
              📄 Good Job!
            </div>
          `);
          $uploadWrapper.css('background-color', 'rgba(0, 128, 0, 0.2)'); // GREEN
        } else {
          // Default state (no file)
          $message.html(`📂 Drop your file here or click to upload`);
          $uploadWrapper.css('background-color', 'rgba(255, 0, 0, 0.2)'); // RED
        }
      }

      function hideAssetCurrent() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        if (assetCurrentNow) {
          $(assetCurrentNow).hide();
        }
      }

      function checkExistingUpload() {
        const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
        const filename = getFilenameFromAsset(assetCurrentNow);

        console.log('📦 Existing upload detected for', inputFieldId, ':', filename);

        if (filename) {
          existingFilename = filename;
          setUploadMessage(existingFilename);
        } else {
          setUploadMessage('');
        }

        hideAssetCurrent();
      }

      checkExistingUpload();

      // MutationObserver for each upload field
      const observeTarget = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
      if (observeTarget) {
        const observer = new MutationObserver(function(mutationsList, observer) {
          for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              console.log('🛰️ Upload updated for', inputFieldId);

              const assetCurrentNow = document.querySelector(`#${inputFieldId}`).closest('.kn-input').querySelector('.kn-asset-current');
              const filename = getFilenameFromAsset(assetCurrentNow);

              console.log('🛰️ Found filename:', filename);

              if (filename) {
                if (existingFilename && filename !== existingFilename) {
                  // Replacing an existing file
                  setUploadMessage(existingFilename, filename, 'uploading-replacement');
                } else if (!existingFilename) {
                  // Uploading a new file where there was none
                  setUploadMessage('', filename, 'uploading-new');
                } else {
                  // No change
                  existingFilename = filename;
                  setUploadMessage(filename);
                }
              } else {
                setUploadMessage('', '', 'empty');
              }

              hideAssetCurrent();
            }
          }
        });

        observer.observe(observeTarget, { childList: true, subtree: true });
        console.log('🔭 Observer initialized for', inputFieldId);
      } else {
        console.log('🚫 No observer target for', inputFieldId);
      }

    } else {
      console.log('🚫 Upload wrapper or input not found for', inputFieldId);
    }
  });

});


/***************************** SURVEY / PROJECT FORM: drag + drop VIew / Location UPload fields: NO WATTBOX SECTION *******************/








// PM REVIEW SYSTEM QUESTIONNAIRE
$(document).on('knack-scene-render.scene_1003', function (event, scene) {
//$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
//$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});





// NEW Q1 2024 Technician SOW View
$(document).on('knack-scene-render.scene_915', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});




// NEW Q2 2023 Customer Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_828', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// NEW Q2 2023 Scope of Work-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_833', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
$(".kn-menu.view_44").hide();
});

// NEW Q3 2023 DRAFT Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_873', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// NEW Q2 2023 DRAFT Scope of Work-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_886', function (event, scene) {
$(".kn-back-link").hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-info-bar").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
$(".kn-menu.view_44").hide();
});


/* Change the below scene_1 to the specific scene for your application or use `any` to enable for all scenes */
/* Turns off modal pages closing when clicking off to the side? */
  $(document).on('knack-scene-render.any', function(event, scene) {
    $('.kn-modal-bg').off('click');
  });


$(document).on('knack-view-render.view_1519', function (event, view, data) {
 setTimeout(function(){
  $('input#field_932').attr('value', '5deebcd9525d220015a14e1f');  // this works
    },1); //set timeout value
});


// Set Trigger field to Triad Branch for Traid Site Visit Booking
 $(document).on('knack-modal-render.view_1328', function(event, view, record){
setTimeout(function(){
  
 $('input#field_737').attr('value', 'Create_Project');   
  
  },1); //set timeout value
});

// Set Trigger field to Triad Branch for Traid Site Visit Booking
 $(document).on('knack-scene-render.scene_208', function(event, view, record){
setTimeout(function(){
  
 $('input#field_877').attr('value', 'Deputy 8.0');   
  
  },1); //set timeout value
});

// Set Trigger field to Triad Branch for Traid Site Visit Booking
 $(document).on('knack-modal-render.view_1457', function(event, view, record){
setTimeout(function(){
  
 $('input#field_737').attr('value', 'Create_Project');   
  
  },1); //set timeout value
});


/*
// Change view_1 to the table view you want to listen to
$(document).on('knack-cell-update.view_32', function(event, view, record) {
  // Do something after the inline edit
 // alert('updated a record for table view: ' + view.key);
  Knack.views["view_32"].model.fetch();
  console.log("hello world");
  console.log(Knack.views);
});
*/


$(document).on('knack-cell-update.view_1991', function(event, view, data) {

setTimeout(function () { location.hash = location.hash + "#"; }, 100);
//alert("Click 'OK' to update equipment total");
Knack.showSpinner();
  });

 


$(document).on('knack-record-update.view_1493', function(event, view, record) {
  // Do something after the inline edit
  alert("Click 'OK' to update equipment total");
  Knack.views["view_1493"].model.fetch();
  console.log("hello world");
  console.log(Knack.views);
});




var view_names = ["view_832"]; ///add view numbers as necessary

view_names.forEach(bindToUpdate1);

function bindToUpdate1(selector_view_name){
$(document).on('knack-view-render.' + selector_view_name, function(event, view, data) {

$(document).ready(function(){
$('.ui-timepicker-input').timepicker({
minTime: '09:30:00',     //  7:00 AM,  Change as necessary
maxTime: '16:30:00'        //  7:00 PM,  Change as necessary

});
});
});

}






// Project Summary View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_292', function (event, scene) {
//$('.kn-back-link').hide();
//$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
//$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});



// Customer Quote View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_212', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});

// Request site Visit View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_733', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
//$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu.view_44").hide();
});



// Customer Project Summary View-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_401', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});

// Customer Camera Location Sign Off-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_689', function (event, scene) {
$(".kn-back-link").hide();
$(".kn-crumbtrail").hide();
$(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});

// Customer Final Approval Sign Off-Hide all options to navigate except for print
$(document).on('knack-scene-render.scene_696', function (event, scene) {
$('.kn-back-link').hide();
$(".kn-crumbtrail").hide();
// $(".kn-title").hide();
$(".kn-app-header").hide();
$(".kn-navigation-bar").hide();
  $(".kn-menu").hide();


});


//Call the function when your table renders

//AS Built Other Equipment
$(document).on('knack-view-render.view_2147', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//AS Built Cameras
$(document).on('knack-view-render.view_2128', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Client Dashboard > Installation Projects
$(document).on('knack-view-render.view_249', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Client Dashboard > Quotes
//$(document).on('knack-view-render.view_1160', function (event, view , data) {
 // addGroupExpandCollapse(view);
//})

//ADMIN: Missing CoCs
$(document).on('knack-view-render.view_1671', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN: Missing System Details Reports
$(document).on('knack-view-render.view_1672', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN: Scheduled
$(document).on('knack-view-render.view_1674', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN > All > Missing CoCs
$(document).on('knack-view-render.view_1792', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN > All > Bid Accepted
$(document).on('knack-view-render.view_1673', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//ADMIN > All > In Work
$(document).on('knack-view-render.view_1676', function (event, view , data) {
  addGroupExpandCollapse(view);
})
  
//Quote dashboard: Events
$(document).on('knack-view-render.view_1050', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//AVL Job Reports: Past Job Reports
$(document).on('knack-view-render.view_845', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//AVL Job Reports: Past Job Reports
$(document).on('knack-view-render.view_1420', function (event, view , data) {
  addGroupExpandCollapse(view);
})


//AVL Job Reports: In Work & Scheduled Quotes
$(document).on('knack-view-render.view_1231', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//TRIAD Job Reports: In Work & Scheduled Quotes
$(document).on('knack-view-render.view_1392', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//AVL Job Reports: All Jobs
$(document).on('knack-view-render.view_1257', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//TRIAD Job Reports: All Jobs
$(document).on('knack-view-render.view_1418', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Technician View > Jobs > Upcoming Projects
$(document).on('knack-view-render.view_1681', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Technician View > In Work > Upcoming Projects
$(document).on('knack-view-render.view_1596', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Technician View > In Work NEW TABLE
$(document).on('knack-view-render.view_1682', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Project Managment > Services Manager > Accepted Bids
$(document).on('knack-view-render.view_1662', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Project Managment > Services Manager > Scheduled Projects
$(document).on('knack-view-render.view_1838', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Project Summary > Cameras or Runs
$(document).on('knack-view-render.view_730', function (event, view , data) {
  addGroupExpandCollapse(view);
})

//Tech View > Schedules > Job Lead
$(document).on('knack-view-render.view_1602', function (event, view , data) {
  addGroupExpandCollapse(view);
})





// function that adds expand & collapse to tables with grouping
var addGroupExpandCollapse = function(view) {
  
  $('#' + view.key + ' .kn-table-group').css("cursor","pointer");

  $('#' + view.key + " .kn-group-level-1 td").each(function () {
    if($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }

    });

      $('#' + view.key + " .kn-group-level-1 td").each(function () {
    if($(this).text().length < 1) {
      var RowText = $(this).html() + "Unassigned";
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }
});

  $('#' + view.key + " .kn-group-level-2 td").each(function () {
    if($(this).text().length <= 1) {
      var RowText = $(this).html() + "Unassigned";
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }
});
  
  $('#' + view.key + ' .kn-table-group').nextUntil('.kn-table-group').toggle();


  
  $('#' + view.key + ' .kn-table-group').click(function() {
    
    $(this).nextUntil('.kn-table-group').toggle();
    
    if($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
  
}





// Admin
$(document).on('knack-view-render.view_1218', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Tasks
$(document).on('knack-view-render.view_1190', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Change Orders
$(document).on('knack-view-render.view_1584', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Project Notes
$(document).on('knack-view-render.view_1559', function (event, view , data) {
  addSceneExpandCollapse(view);
  })
  
// Micah's Shit - System Details
$(document).on('knack-view-render.view_1380', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Daily's
$(document).on('knack-view-render.view_760', function (event, view , data) {
  addSceneExpandCollapse(view);
  })

// Micah's Shit - Tasks
$(document).on('knack-view-render.view_1212', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Micah's Shit - Project Notes
$(document).on('knack-view-render.view_462', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Micah's Shit - Job Reports
//$(document).on('knack-view-render.view_760', function (event, view , data) {
//  addSceneExpandCollapse(view);
//})

// Micah's Shit - Closeout Reports
$(document).on('knack-view-render.view_1049', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Micah's Shit - Complete Tasks
$(document).on('knack-view-render.view_1314', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Dashboard - Comments
$(document).on('knack-view-render.view_1224', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Dashboard - Project Notes
$(document).on('knack-view-render.view_1498', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// AVL Job Reports > past job reports
$(document).on('knack-view-render.view_845', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// AVL Job Reports > in work & scheduled jobs
$(document).on('knack-view-render.view_1231', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// AVL Job Reports > all jobs
$(document).on('knack-view-render.view_1257', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// TRIAD Job Reports > past job reports
$(document).on('knack-view-render.view_1420', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// TRIAD Job Reports > in work & scheduled jobs
$(document).on('knack-view-render.view_1392', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// TRIAD Job Reports > all jobs
$(document).on('knack-view-render.view_1418', function (event, view , data) {
  addSceneExpandCollapse(view);
})


// Job Reports > In Work > comments and tasks
$(document).on('knack-view-render.view_1302', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Job Reports > In Work > project notes
$(document).on('knack-view-render.view_1309', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// AVL Job Reports > Service Calls & Troubleshooting
$(document).on('knack-view-render.view_1361', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// TRIAD Job Reports > Service Calls & Troubleshooting
$(document).on('knack-view-render.view_1411', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Summary > Events
$(document).on('knack-view-render.view_1185', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Summary > Site Maps
$(document).on('knack-view-render.view_1368', function (event, view , data) {
  addSceneExpandCollapse(view);
})

// Project Summary > Job Reports
$(document).on('knack-view-render.view_1710', function (event, view , data) {
  addSceneExpandCollapse(view);
})

//BUILD QUOTE > edit quote copy
$(document).on('knack-view-render.view_2812', function (event, view , data) {
  addSceneExpandCollapse(view);
})






// Project Summary > Contacts
$(document).on('knack-view-render.view_899', function (event, view , data) {
  addSceneExpandCollapse(view);
})


/*SALES EDIT QUOTE > HEADEND EQUIPMENT
$(document).on('knack-view-render.view_2843', function (event, view , data) {
  addSceneExpandCollapse(view);
})
*/

/*SALES EDIT QUOTE > HEADEND COPY
$(document).on('knack-view-render.view_2864', function (event, view , data) {
  addSceneExpandCollapse(view);
})
*/


// function that adds expand & collapse scenes
var addSceneExpandCollapse = function(view) {
  
  $('#' + view.key + ' .view-header').css("cursor","pointer");

  $('#' + view.key + " .view-header h2").each(function () {
    if($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o";></i>&nbsp;' + RowText);
    }
  });
  
  $('#' + view.key + ' .view-header').nextUntil('.view-header').toggle();
  
   $('#' + view.key + ' .view-header').click(function() {
    
    $(this).nextUntil('.view-header').toggle();
    
    if($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
  
 
}





// function that adds expand & collapse scenes
var addSceneExpandCollapseMultiple = function(view) {
  
  $('#' + view.key + ' .view-header').css("cursor","pointer");

  $('#' + view.key + " .view-header h2").each(function () {
    if($(this).text().length > 1) {
      var RowText = $(this).html();
      $(this).html('<i class="fa fa-plus-square-o"; ></i>&nbsp;' + RowText);
    }
  });
  
  $('#' + view.key + ' .view-header').nextUntil('.view-header').toggle();
  
   $('#' + view.key + ' .view-header').click(function() {
    
    $(this).nextUntil('.view-header').toggle();
    
    if($(this).html().indexOf('fa-plus') !== -1) {
      $(this).html($(this).html().replace('plus', 'minus'));
    } else {
      $(this).html($(this).html().replace('minus', 'plus'));
    }
  });
  
 
}


 //     $('#' + view.key + " .kn-group-level-1 td").each(function () {









var addCheckboxes = function(view) {
   
  // add the checkbox to to the header to select/unselect all
  $('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');
  
  
  $('#' + view.key + '.kn-table thead input').change(function() {   
    $('.' + view.key + '.kn-table tbody tr input').each(function() {
      $(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
    });
  });
  
   
  // add a checkbox to each row in the table body
  $('#' + view.key + '.kn-table tbody tr').each(function() {
    $(this).prepend('<td><input type="checkbox"></td>');
  });
}



/**** CHANGE VIEW_ID TO YOUR OWN VIEW ID ****/
$(document).on('knack-view-render.view_1224', function(event, view) {


   
  // Add an update button
  $('<button id="update"; style="font-weight: 300; margin:10px; padding: 5px; font-size: 12pt;">Mark Tasks Complete</button>'
   ).insertBefore('#' + view.key + '.kn-table thead tr');
  
  // Add checkboxes to our table
  addCheckboxes(view);
  
  
  
  // Click event for the update button
  $('#update').click(function () {
    
    // We need an array of record IDs
    
var record_ids = [];
    
// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

Knack.showSpinner();
     
    // Define the fields you want to update
    var data = {
      field_700: 'Yes'
    };
    
   // seet the delay to prevent hitting API rate limit (milliseconds)
var myDelay = 100;

//call updateRecords function
$(function() {
updateRecords(record_ids.shift(), record_ids, data);
});

var selectedRecords = record_ids.length + 1
function updateRecords(id, records, data) {

$.ajax({
//CHANGE OBJECT_ID TO YOUR OWN OBJECT ID
url: 'https://api.knackhq.com/v1/objects/object_52/records/' + id,
type: 'PUT',
/***** CHANGE TO YOUR OWN APPID AND API KEY HERE *****/
headers: {
'X-Knack-Application-ID': '594319f83817c2580c853138',
'X-Knack-REST-API-Key': 'f8371b90-524d-11e7-abaf-870b3d262aa2'
},
data: data,
success: function(response) {
if (record_ids.length > 0) {
// Every time a call is made, the array is shifted by 1.
// If the array still has a length, re-run updateRecords()
setTimeout(updateRecords(record_ids.shift(), record_ids, data), myDelay);
} else {
alert(selectedRecords + " Updated");
Knack.hideSpinner();
location.reload();
}
}
})
}
})
});

/**** CHANGE VIEW_ID TO YOUR OWN VIEW ID ****/
$(document).on('knack-view-render.view_1509', function(event, view) {


   
  // Add discount description
  $('<div><hr></br></div>'
   ).insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(3)');
  
  //modify text around discount amount
  $('<span>-</span>'
   ).insertBefore('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span');  
  
 $('<span> discount for Annual plan = </span>'
   ).insertAfter('#' + view.key + ' > section > div:nth-child(2) > div:nth-child(4) > div > div > div.field_902 > div > span > span:nth-child(2)');
  

  


});


  
//  #view_1509 > section > div:nth-child(2) > div:nth-child(3) > div


/**** Check Boxes on Build Quote ****/
/*
$(document).on('knack-view-render.view_32', function(event, view) {


   
  // Add an update button
  $('<button id="update"; style="font-weight: 300; margin:10px; padding: 5px; font-size: 12pt;">Mark Tasks Complete</button>'
   ).insertBefore('#' + view.key + '.kn-table thead tr');
  
  // Add checkboxes to our table
  addCheckboxes(view);
  
  $("#update").click(function() {
    es_last_updated();
  });
  
  });

function es_last_updated() {
   //add variable here this example does a pop up box to enter information
  var checkNumber = prompt("Enter Check Number");
   Knack.showSpinner(); } 

*/





/*

// Function that adds checkboxes to view_32
var addCheckboxes = function(view) {

// Add the checkbox to to the header to select/unselect all
$('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');
$('#' + view.key + '.kn-table thead input').change(function() {
$('.' + view.key + '.kn-table tbody tr input').each(function() {
$(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
});
});

// Add a checkbox to each row in the table body
$('#' + view.key + '.kn-table tbody tr').each(function() {
$(this).prepend('<td><input type="checkbox"></td>');
});
}

$(document).on('knack-view-render.view_32', function (event, view) {

// Add Delete Records + add to quote buttons
//$('<button style="margin:20px 20px 20px 0; padding:10px; font-size:14px; font-weight:600;" id="OutofWarranty"">Delete Runs</button>').insertAfter('#view_32 > div.kn-records-nav > div:nth-child(3)');
//$('<button style="margin:20px 20px 20px 0; padding:10px; font-size:14px; font-weight:600;" id="AddtoQuote"">Add Runs to Quote</button>').insertAfter('#view_32 > div.kn-records-nav > div:nth-child(3)');

$('<button style="padding:5px; margin:5px; fontsize=12px;" id="OutofWarranty"">Delete Runs</button>').insertAfter('#view_32 > div.kn-records-nav > div:nth-child(3)');
$('<button style="padding:5px; margin:5px; fontsize=12px;" id="AddtoQuote"">Add Runs to Quote</button>').insertAfter('#view_32 > div.kn-records-nav > div:nth-child(3)');


//Add checkboxes to table
addCheckboxes(view);


// Click event for the add to supplier auth button
$('#OutofWarranty').click(function () {

// Array of record IDs
var record_ids = [];

// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/j43lwblm9pjmo9ypjt3825789n9dodi8?recordid=" + record_ids;

$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length
alert('Are you sure you want to delete ' + selectedRecords + ' record(s)?');
Knack.hideSpinner();

window.location.reload(true);

})




// Click event for the add to supplier auth button
$('#AddtoQuote').click(function () {

// Array of record IDs
var record_ids = [];
var quoteNumber = prompt("Enter LAST FOUR numbers of Quote Number you want to add these Runs");


// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/azj3bt7zjoy11ie5thevpnx3v2poagek?recordid=" + record_ids + "&quoteNumber=" + quoteNumber;



$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length
alert('Are you sure you want to assign these ' + selectedRecords + ' runs to additional quote ending in ' + quoteNumber + '?');
Knack.hideSpinner();

window.location.reload(true);

})
});


*/

/*
// Function that adds checkboxes to view_208
var addCheckboxes = function(view) {

// Add the checkbox to to the header to select/unselect all
$('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');
$('#' + view.key + '.kn-table thead input').change(function() {
$('.' + view.key + '.kn-table tbody tr input').each(function() {
$(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
});
});

// Add a checkbox to each row in the table body
$('#' + view.key + '.kn-table tbody tr').each(function() {
$(this).prepend('<td><input type="checkbox"></td>');
});
}

$(document).on('knack-view-render.view_207', function (event, view) {

// Add Delete Records + add to quote buttons
$('<button id="DeleteEquipment"">Delete Runs</button>').insertAfter('#view_207 > div.kn-records-nav > div:nth-child(3)');
$('<button id="AddtoEquipmentQuote"">Add Equipment to Quote</button>').insertAfter('#view_207 > div.kn-records-nav > div:nth-child(3)');


//Add checkboxes to table
addCheckboxes(view);


// Click event for the add to supplier auth button
$('#DeleteEquipment').click(function () {

// Array of record IDs
var record_ids = [];

// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/j43lwblm9pjmo9ypjt3825789n9dodi8?recordid=" + record_ids;

$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length
alert('Are you sure you want to delete ' + selectedRecords + ' record(s)?');
Knack.hideSpinner();

window.location.reload(true);

})




// Click event for the add to supplier auth button
$('#AddtoEquipmentQuote').click(function () {

// Array of record IDs
var record_ids = [];
var quoteNumber = prompt("Add this equipment to quote ending (enter ONLY the LAST FOUR numbers):");


// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/azj3bt7zjoy11ie5thevpnx3v2poagek?recordid=" + record_ids + "&quoteNumber=" + quoteNumber;



$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length
alert('Are you sure you want to assign these ' + selectedRecords + ' equipment items to additional quote ending in ' + quoteNumber + '?');
Knack.hideSpinner();

window.location.reload(true);

})
});

*/

$(document).on('knack-record-update.view_2074', function(event, view, record) {
location.hash = location.hash + "#"
});

$(document).on('knack-record-update.view_2083', function(event, view, record) {
location.hash = location.hash + "#"
});

$(document).on('knack-record-update.view_2078', function(event, view, record) {
location.hash = location.hash + "#"
});

$(document).on('knack-record-update.view_2084', function(event, view, record) {
location.hash = location.hash + "#"
});





//add photos to this Run... 


// Function that adds checkboxes
var addCheckboxes = function(view) {
// Add the checkbox to to the header to select/unselect all
$('#' + view.key + '.kn-table thead tr').prepend('<th><input type="checkbox"></th>');
$('#' + view.key + '.kn-table thead input').change(function() {
$('.' + view.key + '.kn-table tbody tr input').each(function() {
$(this).attr('checked', $('#' + view.key + '.kn-table thead input').attr('checked') != undefined);
});
});

// Add a checkbox to each row in the table body
$('#' + view.key + '.kn-table tbody tr').each(function() {
$(this).prepend('<td><input type="checkbox"></td>');
});
}

$(document).on('knack-view-render.view_2179', function (event, view) {

// Add add to supplier Auth button
$('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="assignphotos"">Assign Photos to Run</button>').insertAfter('#view_2179 > div.view-header > h2');


//Add checkboxes to table
addCheckboxes(view);

// Click event for the add to supplier auth button
$('#assignphotos').click(function () {

  

// Array of record IDs
var record_ids = [];
var runID = window.location.href.split('/')[window.location.href.split('/').length - 2];

// Populate the record IDs using all checked rows
$('#' + view.key + ' tbody input[type=checkbox]:checked').each(function() {
record_ids.push($(this).closest('tr').attr('id')); // record id
});

commandURL = "https://hook.integromat.com/ecrm451p73bbgy6it4iu8iwpnpqh1vdf?recordid=" + record_ids + "&runID=" + runID;

$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;

var selectedRecords = record_ids.length

setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
alert('Integromat is updating ' + selectedRecords + ' records. Depending on how many photos you are updating this could take a few minutes');
Knack.hideSpinner();P


})



});


$(document).on('knack-view-render.view_1378', function (event, view) {

// Add add to supplier Auth button
$('<button style="border-radius: 0.35em; margin:20px 20px 20px 0; padding:10px; font-size:20px; font-weight: 600; background-color: #00396D !important; color: #ffffff !important; border-color: #00396D !important; font-weight:600;" id="getTLSPhotos"">Get Photos from TLS WO</button>').insertAfter('#view_1378 > div.view-header > h2' );

// Click event for the add to supplier auth button
$('#getTLSPhotos').click(function () {

  
// Array of record IDs
var projectID = window.location.href.split('/')[window.location.href.split('/').length - 2];
var tlWO = prompt("What is the TLS WO ID?:");


commandURL = "https://hook.integromat.com/bp83h6wunhoa9oc2ubm5hwklbc8u775i?projectID=" + projectID + "&tlWO=" + tlWO;

$.get(commandURL, function(data, status){
Knack.hideSpinner();
//$(".kn-message.success").html("<b>" + data + "</b>");
});

// turn on the Knack wait spinner
Knack.showSpinner();

// set the delay to prevent hitting Knack API rate limit (milliseconds)
var myDelay = 100;


setTimeout(function () { location.hash = location.hash + "#"; }, 6000);
alert('Integromat is going to download photos from ' + tlWO + ' . Depending on how many photos there are it could take a moment for this to complete. ');
Knack.hideSpinner();P


})



});




//McGandy's Experiement //

// Run when edit quote page is loaded
$(document).on('knack-scene-render.scene_213', function(event, view, record){
setTimeout(function(){

//ubcontractor cost is populated
$('input#field_1364').change(function() { // When the subcontractor cost is changed
  var subcontractor_cost = $(this).val(); // Get the value of the subcontractor cost
  var survey_cost = document.querySelector('input#field_1363').value;
  var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
  var margin = document.querySelector('input#field_1365').value;
  var marked_up_labor = Math.round(total_cost / (1 - margin));

  var install_total = Knack.models['view_507'].toJSON().field_343.replaceAll(',','').replaceAll('$','');
  var fees_added = document.querySelector('input#field_1251').value.replaceAll(',','');
  var more_fees_to_add = Math.round((marked_up_labor - install_total) + Math.round(fees_added));


$('input#field_1366').val(marked_up_labor); // Update the marked up labor field to reflect costs + margin
$('input#field_1580').val(more_fees_to_add); // Update the marked up labor field to reflect costs + margin
});


//survey cost is populated
$('input#field_1363').change(function() { // When the survey cost is changed
  var survey_cost = $(this).val(); // Get the value of the survey cost
  var subcontractor_cost = document.querySelector('input#field_1364').value;
  var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost));
  var margin = document.querySelector('text#field_1365').value; // get the value from margin field
  var marked_up_labor = Math.round(total_cost / (1 - margin)); // calculate marked up labor
 
$('input#field_1366').val(marked_up_labor); // Update the marked up labor field to reflect costs + margin
$('input#field_1365').keyup(); 

});


//Sets margin when the marked_up_labor cost field is populated...
$('input#field_1366').change(function() { // When the marked up labor cost field is changed
  var marked_up_labor = $(this).val(); // Get the new marked_up_labor_cost
  var survey_cost = document.querySelector('input#field_1363').value;
  var subcontractor_cost = document.querySelector('input#field_1364').value;
  var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost))
  var margin = Math.abs(Math.round(marked_up_labor - total_cost) / marked_up_labor);
  var margin_rounded = Math.round((margin + Number.EPSILON) * 100) / 100;
  
$('input#field_1365').val(margin_rounded); // Update the margin value
$('input#field_1365').keyup(); 


});


//when the margin field is populated...
$('input#field_1365').change(function() { // When the margin field is changed
  var margin = $(this).val(); // Get the value of the margin field
  var survey_cost = document.querySelector('input#field_1363').value;
  var subcontractor_cost = document.querySelector('input#field_1364').value;
  var total_cost = Math.abs(Math.abs(survey_cost) + Math.abs(subcontractor_cost))
  var marked_up_labor = Math.round(total_cost / (1 - margin))

$('input#field_1366').val(marked_up_labor); // Update the value of the second input
$('input#field_1366').keyup();
});


},1); //set timeout value
});

/*// Set Trigger field to Triad Branch for Traid Site Visit Booking
$(document).on('knack-scene-render.scene_213', function(event, view, record){
setTimeout(function(){


});

},1); //set timeout value
}); */


/*$('#input1').change(function() { // When the first input is changed
  var input1Value = $(this).val(); // Get the value of the first input
  $('#input2').val(input1Value); // Update the value of the second input
})


/*
// Set Trigger field to Triad Branch for Traid Site Visit Booking
 $(document).on('knack-scene-render.scene_213', function(event, view, record){
setTimeout(function(){

    var test = data.field_1363;

  
$('#input1').change(function() { // When the first input is changed
  var input1Value = $(this).val(); // Get the value of the first input
  $('#input2').val(input1Value); // Update the value of the second input
})

  },1) //set timeout value
}); 
input#field_1363

  $('input#field_1363').on('change keydown paste input', function(){
      var test = $(this).val();
});

*/


/*

/CODE TO ADD COLUMN SELECTORS on views 158, 198, 196, 759

$(document).on('knack-view-render.view_2128', function(event, view, data) {
  addTableColumnChoose(view);
});
//for multiple tables: $(document).on('knack-view-render.view_289.view_1111.view_1118.view_1119', function(event, view, data) {addTableColumnChoose(view);});

var addTableColumnChoose = function(view) {
  //See http://helpdesk.knackhq.com/support/discussions/topics/5000074312 and https://jsfiddle.net/HvA4s/
  // added support for cookies to keep selected columns between renders and sessions
  var clearFix = $('#' + view.key + ' div.kn-records-nav');
    clearFix.append("
Filter Columns
");

  var hstring = getCookie("hstring_"+view.key);
  if (hstring != ''){
    var headers = JSON.parse(hstring);
           $.each(headers, function(i, show) {
                var cssIndex = i + 1;
                var tags = $('#' + view.key + '  table th:nth-child(' + cssIndex + '), #' + view.key + '  table td:nth-child(' + cssIndex + ')');
                if (show)
                    tags.show();
                else
                    tags.hide();
               
            });
  }
 
    $('#' + view.key + ' .choose-columns').click(function() {
      // remove other open columns set dialog on the same page
      if( $('#tableChooseColumns')!=null) {$('#tableChooseColumns').remove();}
        var headers = $('#' + view.key + ' table th').map(function() {
            var th =  $(this);
            return {text: th.text(), shown: th.css('display') != 'none'};
        });
      var hs;
      h = ['
'];
      $.each(headers, function() {
        h.push('');
        });
        h.push('
OK
 ',
               this.text,
               '
');
        hs = h.join('');

        $('body').append(hs);
        var pos = $('#' + view.key + ' .choose-columns').position();
      $('#tableChooseColumns').css({'position': 'absolute','left': '20px', 'top': pos.top,'padding': '5px', 'border': '1px solid #666', 'border-radius':'3px','background': '#fff'});
        $('#done').click(function() {
            var showHeaders = $('#tableChooseColumns input').map(function() { return this.checked; });
            var columns =[];
           $.each(showHeaders, function(i, show) {
                var cssIndex = i + 1;
                var tags = $('#' + view.key + ' table th:nth-child(' + cssIndex + '), #' + view.key + ' table td:nth-child(' + cssIndex + ')');
                if (show)
                    tags.show(300,"swing");
                else
                    tags.hide(300,"swing");
                columns.push(show);
            });
         
            $('#tableChooseColumns').remove();
            setCookie("hstring_"+view.key,JSON.stringify(columns),100);

          mixpanel.track("Preferences changes",{"Page":("Knack: "+view.scene.name), "View":view.title});
          return false;
        });
        return false;
    });
}

/* Cookie support -----------------------------------------------*/

/*

function setCookie(cname, cvalue, exdays) {
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
}

function getCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for(var i = 0; i 
                    




*/

$(document).on('knack-scene-render.scene_776', function (event, view, data) {
    $('').click(function () {
        $('#view_hide').show();
    });
});

/* Instructions Placement */


$(document).on('knack-view-render.form', function(event, view, data) {
  $("#" + view.key + " .kn-instructions").each(function() {
    //find the input label for this field
    var inputLabel = $(this).closest(".kn-input").find(".kn-label");
    //append the instructions for this field after the label
    $(this).insertAfter(inputLabel);
  });
});








/*

$(document).on('knack-scene-render.scene_915', function saveData() {
            const now = new Date();
            const item = {
                data: 'field_1630',
                expiry: now.getTime() + (30 * 24 * 60 * 60 * 1000), // Current time + 30 days in milliseconds
            };
            localStorage.setItem('cachedData', JSON.stringify(item));
            document.getElementById('cacheStatus').textContent = 'Data automatically saved to cache.';
        }
        function loadData() {
            const itemStr = localStorage.getItem('cachedData');
            if (!itemStr) {
                saveData(); // No data found, save new data
                return;
            }
            const item = JSON.parse(itemStr);
            const now = new Date();
            // Check if the data has expired
            if (now.getTime() > item.expiry) {
                localStorage.removeItem('cachedData'); // Clear expired data
                document.getElementById('cacheStatus').textContent = 'Cached data expired. Cache cleared.';
                saveData(); // Save new data since the old data expired
            } else {
                document.getElementById('cacheStatus').textContent = 'Cached data loaded: ' + item.data;
            }
        }
        // Load data from cache or save it if not present/expired
        loadData();


});


*/


/*


var autoRefreshViews = ['view_2833']; // Replace with your view keys

$(document).on('knack-cell-update.view_2830', function (event, view) {
    if (autoRefreshViews.includes(view.key)) {
        AutoRefresh(view.key, 5000);
    }
});

function AutoRefresh(viewId, ms) {
    setTimeout(function() {
//        Knack.views[viewId].model.fetch();
        AutoRefresh(viewId, ms);
    }, ms);
}


/*
// Change view_1 to the table view you want to listen to
$(document).on('knack-cell-update.view_2830', function(event, view, record) {
  // Do something after the inline edit
  alert('updated a record for table view: ' + view.key);
  Knack.views['view_2833'].model.fetch();
  $('input#field_365').keyup();

  
});
*/

/******** SUBMIT QUOTE DETAILS & DISCOUNTS FOMR TO FORCE REFRESH WHEN OTHER EQUIPMENT RECORDS UPDATED **************/


$(document).ready(function() {
   $(document).on('knack-cell-update.view_2830', function(event, view, record) {
       // Save the current scroll position
       var scrollPosition = $(window).scrollTop();
      
       // Trigger the form submission by clicking the button
       $('#view_2833 button[type=submit]').submit();

       // Restore the scroll position after a delay
       setTimeout(function() {
           // Alternatively, to scroll to the bottom of the page, use: $(document).scrollTop($(document).height());
           $(window).scrollTop(scrollPosition);
       }, 2000); // Adjust the delay as needed
   });
});

/*
$(document).ready(function() {
   $(document).on('knack-cell-update.view_2911', function(event, view, record) {
       // Do something after the inline edit
         $('#view_2833 button[type=submit]').submit();

   });
});
*/

/**************************** FORCE REFRESH OF PAGE WHEN EDIT IS MADE TO EQUIPMENT TABLE TO ENSURE PUBLISH QUOTE OPTION IS REMOVED IF APPLICABLE ********************************/
$(document).ready(function() {
   $(document).on('knack-cell-update.view_2911', function(event, view, record) {
       // Save the current scroll position
       var scrollPosition = $(window).scrollTop();

       // Re-render the Knack view
       Knack.router.scene_view.render();

       // Restore the scroll position after a delay
       setTimeout(function() {
           // Alternatively, to scroll to the bottom of the page, use: $(document).scrollTop($(document).height());
           $(window).scrollTop(scrollPosition);
       }, 2000); // Adjust the delay as needed
   });
});
/**************************** FORCE REFRESH OF PAGE WHEN EDIT IS MADE TO EQUIPMENT TABLE TO ENSURE PUBLISH QUOTE OPTION IS REMOVED IF APPLICABLE ********************************/




/**************************** FORCE REFRESH OF PAGE WHEN EDIT IS MADE TO DROPS TABLE TO ENSURE PUBLISH QUOTE OPTION IS REMOVED IF APPLICABLE ********************************/

$(document).ready(function() {
   $(document).on('knack-cell-update.view_2835', function(event, view, record) {
       // Save the current scroll position
       var scrollPosition = $(window).scrollTop();

       // Re-render the Knack view
       Knack.router.scene_view.render();

       // Restore the scroll position after a delay
       setTimeout(function() {
           // Alternatively, to scroll to the bottom of the page, use: $(document).scrollTop($(document).height());
           $(window).scrollTop(scrollPosition);
       }, 500); // Adjust the delay as needed
   });
});
/**************************** FORCE REFRESH OF PAGE WHEN EDIT IS MADE TO √ TABLE TO ENSURE PUBLISH QUOTE OPTION IS REMOVED IF APPLICABLE ********************************/



/*


$(document).ready(function() {
    // Variable to store the previous value of the specific field
    let previousFieldValue = null;

    $(document).on('knack-cell-update.view_2835', function(event, view, record) {
        // Replace 'specificFieldName' with the name of the field you want to monitor
        const currentFieldValue = record.field_60; // Change 'field_123' to your specific field ID

        // Check if the specific field has changed
        if (previousFieldValue !== currentFieldValue) {
            // Update the previous field value
            previousFieldValue = currentFieldValue;

            // Save the current scroll position
            var scrollPosition = $(window).scrollTop();

            // Re-render the Knack view
            Knack.router.scene_view.render();

            // Restore the scroll position after a delay
            setTimeout(function() {
                $(window).scrollTop(scrollPosition);
            }, 500); // Adjust the delay as needed
        }
    });
});



*/



$(document).ready(function () {
  let previousFieldValue = null;
  let scrolling = false;

  function scrollToView2835() {
    const $v = $("#view_2835");
    if (!$v.length) return false;

    const y = $v.offset().top; // top of the view in the page
    window.scrollTo(0, y);
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

    // Re-apply scroll a few times because Knack can change it during render
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



$(document).ready(function () {
  const watchedFields = ["field_128","field_129","field_301"]; // <-- add more: ["field_60","field_123","field_999"]

  // track last-seen values per record id
  const prevByRecordId = {};
  let scrolling = false;

  function scrollToView2835() {
    const $v = $("#view_2911");
    if (!$v.length) return false;

    const headerOffset = 0; // set if you have a fixed header
    const y = $v.offset().top - headerOffset;

    window.scrollTo(0, y);
    return true;
  }

  function getRecordId(record) {
    // Knack record id is usually on record.id
    return record && (record.id || record._id || record.record_id);
  }

  function snapshot(record) {
    const snap = {};
    watchedFields.forEach((f) => {
      snap[f] = record ? record[f] : undefined;
    });
    return snap;
  }

  function changed(prevSnap, nextSnap) {
    if (!prevSnap) return true; // first time we see this record
    return watchedFields.some((f) => prevSnap[f] !== nextSnap[f]);
  }

  $(document).on("knack-cell-update.view_2911", function (event, view, record) {
    const rid = getRecordId(record);
    if (!rid) return;

    const nextSnap = snapshot(record);
    const prevSnap = prevByRecordId[rid];

    // If none of the watched fields changed, do nothing
    if (!changed(prevSnap, nextSnap)) return;

    // Update our snapshot
    prevByRecordId[rid] = nextSnap;

    if (scrolling) return;
    scrolling = true;

    Knack.router.scene_view.render();

    // Re-apply scroll a few times because Knack can change it during render
    requestAnimationFrame(() => {
      scrollToView2835();
      requestAnimationFrame(() => {
        scrollToView2835();
        setTimeout(() => {
          scrollToView2835();
          scrolling = false;
        }, 250);
      });
    });
  });
});



/*

$(document).ready(function () {
  let busy = false;

  function scrollToView2835() {
    const $v = $("#view_2835");
    if (!$v.length) return;

    const headerOffset = 0; // set to 80–120 if you have a fixed header
    const y = $v.offset().top - headerOffset;

    window.scrollTo(0, y);
  }

  $(document).on("knack-cell-update.view_2835", function (event, view, record) {
    if (busy) return;
    busy = true;

    Knack.router.scene_view.render();

    // Knack may reset scroll multiple times during render — reapply it
    requestAnimationFrame(() => {
      scrollToView2835();
      requestAnimationFrame(() => {
        scrollToView2835();
        setTimeout(() => {
          scrollToView2835();
          busy = false;
        }, 200);
      });
    });
  });
});








/******** SUBMIT QUOTE DETAILS & DISCOUNTS FOMR TO FORCE REFRESH WHEN OTHER EQUIPMENT RECORDS UPDATED **************/
$(document).on('knack-view-render.view_2895', function(event, view, data) {
    if (document.querySelector('input#field_1747').value == "blank") {
        $("#view_2913").css("visibility", "hidden");
        $("#view_2913").css("height", "0px");
    }
    else {
    $("#view_2895").css("visibility", "hidden");
    $("#view_2895").css("height", "0px");
}
});


$(document).on('knack-view-render.view_2913', function(event, view, data) {
    $("#view_2914").css("visibility", "hidden");
    $("#view_2914").css("height", "0px");

});

$(document).on('knack-view-render.view_2895', function(event, view, data) {
    $("#view_2914").css("visibility", "hidden");
    $("#view_2914").css("height", "0px");
});


$(document).on('knack-form-submit.view_2895', function(event, view, record) {
    // Refresh the view and use a callback to ensure the condition runs after the fetch
    Knack.views["view_2914"].model.fetch({
        success: function() {
            // Only check the condition after the view is refreshed
            if (document.querySelector('input#field_1747').value != "blank") {
                $("#view_2913").css({
                    "visibility": "visible",
                    "height": "100%"
                });
            }
        }
    });
});



$(document).on('knack-view-render.view_2833', function(event, view, data) {
    $("#kn-input-field_1509").css("visibility", "hidden");
    $("#kn-input-field_1509").css("height", "0px");
});



$(document).on('knack-view-render.view_3094', function(event, view) {
    let fileInput = $('#' + view.key + ' input[type="file"]');

    fileInput.on('change', function () {
        if (this.files.length > 0) {
            // Wait for Knack to process the file upload before submitting
            setTimeout(function () {
                $(fileInput).closest('form').submit();
            }, 1000); // Delay to allow Knack to process file selection
        }
    });
});

//*********** EDIT PROPOSAL: PLAYBOOK ****************************** *//
$(document).on('keydown', function (event) {
    if (event.key === "Tab") {
        let focusedElement = document.activeElement;
        let targetFieldKey = "field_1802"; // Replace with the actual field key

        if (focusedElement && focusedElement.id.includes(targetFieldKey)) {
            event.preventDefault(); // Prevent default tab behavior
            $('.kn-button.is-primary').click(); // Simulate form submission
        }
    }
});


//*********** EDIT PROPOSAL: UPLOAD FILES, DO NOT REFRESH PARENT PAGE ****************************** *//

const targetSceneID = 'scene_1040'; // Your specific scene ID

$(document).on('click', '.delete.close-modal', function() {
    // Wait for the modal to fully close before checking
    setTimeout(() => {
        if ($(`#${targetSceneID}`).length === 0) {
            location.reload(); // Refresh parent page after modal closes
        }
    }, 500); // Small delay to ensure the modal has been removed
});












/*************  // view_3332 - truncate field_1949 with click-to-expand **************************/

// view_3332 - truncate field_1949 with click-to-expand
(function () {
  const VIEW_ID = 'view_3332';
  const FIELD_CLASS = 'field_1949';
  const MAX = 25;

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function applyTruncate(viewEl) {
    const cells = viewEl.querySelectorAll(`td.${FIELD_CLASS}`);
    cells.forEach((td) => {
      // Avoid double-processing on re-render/pagination
      if (td.dataset.scwTruncated === '1') return;

      const full = (td.textContent || '').trim();
      if (!full) return;

      // If short already, leave it
      if (full.length <= MAX) {
        td.dataset.scwTruncated = '1';
        return;
      }

      const preview = full.slice(0, MAX);

      td.dataset.scwTruncated = '1';
      td.dataset.scwFull = full;
      td.dataset.scwPreview = preview;
      td.dataset.scwExpanded = '0';

      td.innerHTML = `
        <a href="#" class="scw-trunc-toggle" style="text-decoration: underline;">
          <span class="scw-trunc-text">${escapeHtml(preview)}…</span>
        </a>
      `;
    });
  }

  // On view render, truncate
  $(document).on(`knack-view-render.${VIEW_ID}`, function (e, view) {
    const viewEl = document.getElementById(VIEW_ID);
    if (!viewEl) return;
    applyTruncate(viewEl);
  });

  // Delegate click handler (works after pagination/filter refresh)
  $(document).on('click', `#${VIEW_ID} td.${FIELD_CLASS} .scw-trunc-toggle`, function (e) {
    e.preventDefault();

    const td = this.closest(`td.${FIELD_CLASS}`);
    if (!td) return;

    const expanded = td.dataset.scwExpanded === '1';
    const nextText = expanded ? (td.dataset.scwPreview + '…') : td.dataset.scwFull;

    td.dataset.scwExpanded = expanded ? '0' : '1';

    // Keep it clickable for toggling back
    this.querySelector('.scw-trunc-text').textContent = nextText;
  });
})();


/*************  // view_3332 - truncate field_1949 with click-to-expand **************************/







/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 and view_3341 **************************/


(function () {
  const VIEW_IDS = ['view_3301', 'view_3341'];
  const LIMIT_VALUE = '1000';
  const EVENT_NS = '.scwLimit1000';

  VIEW_IDS.forEach((VIEW_ID) => {
    $(document)
      .off(`knack-view-render.${VIEW_ID}${EVENT_NS}`)
      .on(`knack-view-render.${VIEW_ID}${EVENT_NS}`, function () {
        const $view = $('#' + VIEW_ID);
        if (!$view.length) return;

        // Run-once guard per view instance
        if ($view.data('scwLimitSet')) return;
        $view.data('scwLimitSet', true);

        const $limit = $view.find('select[name="limit"]');
        if (!$limit.length) return;

        if ($limit.val() !== LIMIT_VALUE) {
          $limit.val(LIMIT_VALUE).trigger('change');
        }
      });
  });
})();


/*************  SET RECORD CONTROL to 1000 and HIDE view_3313 **************************/









/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const SCENE_IDS = ['scene_1085']; // add more scenes as needed
  const EVENT_NS = '.scwGroupCollapse';

  const COLLAPSED_BY_DEFAULT = true;
  const PERSIST_STATE = true;

  // ======================
  // STATE (localStorage)
  // ======================
  function storageKey(sceneId, viewId) {
    return `scw:collapse:${sceneId}:${viewId}`;
  }
  function loadState(sceneId, viewId) {
    if (!PERSIST_STATE) return {};
    try {
      return JSON.parse(localStorage.getItem(storageKey(sceneId, viewId)) || '{}');
    } catch {
      return {};
    }
  }
  function saveState(sceneId, viewId, state) {
    if (!PERSIST_STATE) return;
    try {
      localStorage.setItem(storageKey(sceneId, viewId), JSON.stringify(state));
    } catch {}
  }

  // ======================
  // CSS (ONCE, SCENE-SCOPED)
  // ======================
  function injectCssOnce() {
    const id = 'scw-group-collapse-css';
    if (document.getElementById(id)) return;

    const sceneScopes = (SCENE_IDS || [])
      .map((s) => `#kn-${s}`)
      .join(', ');
    const S = sceneScopes || '';

    // ---------- THEME TOKENS ----------
    const L1 = {
      fontSize: '18px',
      fontWeight: '200',
      bg: '#07467c',
      color: '#ffffff',
      tdPadding: '8px 12px',
      collapsedOpacity: '0.92',
      textalign: 'center',
    };

    const L2 = {
      fontSize: '15px',
      fontWeight: '400',
      bg: 'aliceblue',
      color: '#07467c',
      tdPadding: '20px 12px',
      collapsedOpacity: '0.88',
    };

    const css = `
      /* ===== Shared group header behavior ===== */
      ${S} tr.scw-group-header {
        cursor: pointer;
        user-select: none;
      }
      ${S} tr.scw-group-header .scw-collapse-icon {
        display: inline-block;
        width: 1.2em;
        text-align: center;
        margin-right: .35em;
        font-weight: 700;
      }

      /* ===== LEVEL 1 (MDF / IDF) ===== */
      ${S} .kn-table-group.kn-group-level-1.scw-group-header {
        font-size: ${L1.fontSize};
        font-weight: ${L1.fontWeight} !important;
        background-color: ${L1.bg} !important;
        color: ${L1.color} !important;
        text-align: ${L1.textalign} !important;
      }
      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td {
        padding: ${L1.tdPadding} !important;
      }
      ${S} .kn-table-group.kn-group-level-1.scw-group-header.scw-collapsed {
        opacity: ${L1.collapsedOpacity};
      }
      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td,
      ${S} .kn-table-group.kn-group-level-1.scw-group-header > td * {
        color: ${L1.color} !important;
      }

      /* ===== LEVEL 2 (Bucket) ===== */
      ${S} .kn-table-group.kn-group-level-2.scw-group-header {
        font-size: ${L2.fontSize};
        font-weight: ${L2.fontWeight} !important;
        background-color: ${L2.bg} !important;
        color: ${L2.color} !important;
      }
      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td {
        padding: ${L2.tdPadding} !important;
      }
      ${S} .kn-table-group.kn-group-level-2.scw-group-header.scw-collapsed {
        opacity: ${L2.collapsedOpacity};
      }
      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td,
      ${S} .kn-table-group.kn-group-level-2.scw-group-header > td * {
        color: ${L2.color} !important;
      }
    `;

    const style = document.createElement('style');
    style.id = id;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ======================
  // GROUP ROW HELPERS
  // ======================
  const GROUP_ROW_SEL =
    'tr.kn-table-group.kn-group-level-1, tr.kn-table-group.kn-group-level-2';

  function getGroupLevel($tr) {
    return $tr.hasClass('kn-group-level-2') ? 2 : 1;
  }

  function ensureIcon($tr) {
    const $cell = $tr.children('td,th').first();
    if (!$cell.find('.scw-collapse-icon').length) {
      $cell.prepend('<span class="scw-collapse-icon" aria-hidden="true">▼</span>');
    }
  }

  function buildKey($tr, level) {
    const label = $tr
      .clone()
      .find('.scw-collapse-icon')
      .remove()
      .end()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    return `L${level}:${label}`;
  }

  // 🔑 LEVEL-AWARE ROW COLLECTION (THIS IS THE BIG FIX)
  function rowsUntilNextRelevantGroup($headerRow) {
    const isLevel2 = $headerRow.hasClass('kn-group-level-2');
    let $rows = $();

    $headerRow.nextAll('tr').each(function () {
      const $tr = $(this);

      if (isLevel2) {
        if ($tr.hasClass('kn-table-group')) return false;
        $rows = $rows.add($tr);
        return;
      }

      // Level 1: stop only at NEXT Level 1
      if ($tr.hasClass('kn-group-level-1')) return false;

      $rows = $rows.add($tr);
    });

    return $rows;
  }

  function setCollapsed($header, collapsed) {
    $header.toggleClass('scw-collapsed', collapsed);
    $header.find('.scw-collapse-icon').text(collapsed ? '▶' : '▼');
    rowsUntilNextRelevantGroup($header).toggle(!collapsed);
  }

  // ======================
  // SCENE DETECTION
  // ======================
  function getCurrentSceneId() {
    const bodyId = $('body').attr('id');
    if (bodyId && bodyId.includes('scene_')) {
      const m = bodyId.match(/scene_\d+/);
      if (m) return m[0];
    }
    const $fallback = $('[id*="scene_"]').filter(':visible').first();
    if ($fallback.length) {
      const m = ($fallback.attr('id') || '').match(/scene_\d+/);
      if (m) return m[0];
    }
    return null;
  }

  function isEnabledScene(sceneId) {
    return !!sceneId && SCENE_IDS.includes(sceneId);
  }

  // ======================
  // ENHANCE GRIDS
  // ======================
  function enhanceAllGroupedGrids(sceneId) {
    if (!isEnabledScene(sceneId)) return;

    $(GROUP_ROW_SEL).each(function () {
      const $tr = $(this);
      const $view = $tr.closest('.kn-view[id^="view_"]');
      const viewId = $view.attr('id') || 'unknown_view';

      const state = loadState(sceneId, viewId);

      $tr.addClass('scw-group-header');
      ensureIcon($tr);

      const level = getGroupLevel($tr);
      const key = buildKey($tr, level);
      const shouldCollapse =
        key in state ? !!state[key] : COLLAPSED_BY_DEFAULT;

      setCollapsed($tr, shouldCollapse);
    });
  }

  // ======================
  // CLICK HANDLER (DELEGATED)
  // ======================
  function bindClicksOnce() {
    $(document)
      .off('click' + EVENT_NS, GROUP_ROW_SEL)
      .on('click' + EVENT_NS, GROUP_ROW_SEL, function (e) {
        if ($(e.target).closest('a,button,input,select,textarea,label').length) return;

        const sceneId = getCurrentSceneId();
        if (!isEnabledScene(sceneId)) return;

        const $tr = $(this);
        const $view = $tr.closest('.kn-view[id^="view_"]');
        const viewId = $view.attr('id') || 'unknown_view';

        $tr.addClass('scw-group-header');
        ensureIcon($tr);

        const level = getGroupLevel($tr);
        const key = buildKey($tr, level);

        const state = loadState(sceneId, viewId);
        const collapseNow = !$tr.hasClass('scw-collapsed');

        setCollapsed($tr, collapseNow);
        state[key] = collapseNow ? 1 : 0;
        saveState(sceneId, viewId, state);
      });
  }

  // ======================
  // MUTATION OBSERVER
  // ======================
  const observerByScene = {};

  function startObserverForScene(sceneId) {
    if (!isEnabledScene(sceneId) || observerByScene[sceneId]) return;

    let raf = 0;
    const obs = new MutationObserver(() => {
      if (!isEnabledScene(getCurrentSceneId())) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => enhanceAllGroupedGrids(sceneId));
    });

    obs.observe(document.body, { childList: true, subtree: true });
    observerByScene[sceneId] = obs;
  }

  // ======================
  // INIT
  // ======================
  injectCssOnce();
  bindClicksOnce();

  SCENE_IDS.forEach((sceneId) => {
    $(document)
      .off(`knack-scene-render.${sceneId}${EVENT_NS}`)
      .on(`knack-scene-render.${sceneId}${EVENT_NS}`, function () {
        enhanceAllGroupedGrids(sceneId);
        startObserverForScene(sceneId);
      });
  });

  const initialScene = getCurrentSceneId();
  if (isEnabledScene(initialScene)) {
    enhanceAllGroupedGrids(initialScene);
    startObserverForScene(initialScene);
  }
})();


/*************  Collapsible Level-1 & Level-2 Groups (collapsed by default) **************************/















/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE **************************/

// Replace *whatever* is rendered in field_1946 cells with an icon
// Runs on multiple grid views
(function () {
  const VIEW_IDS = [
    "view_3313",
    "view_3332"   // ← add the second view id here
  ];

  const FIELD_KEY = "field_1946";

  const ICON_HTML =
    '<i class="fa fa-solid fa-sort" aria-hidden="true" title="Changing Location" style="font-size:30px; vertical-align:middle;"></i>';

  // Inject CSS once (covers all target views)
  function injectCssOnce() {
    const id = "scw-field1946-icon-css";
    if (document.getElementById(id)) return;

    const selectors = VIEW_IDS
      .map(v => `#${v} td.${FIELD_KEY}`)
      .join(", ");

    const css = `
      ${selectors} {
        display: table-cell !important;
        text-align: center;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  VIEW_IDS.forEach((VIEW_ID) => {
    $(document).on(`knack-view-render.${VIEW_ID}`, function () {
      injectCssOnce();

      const $view = $("#" + VIEW_ID);
      if (!$view.length) return;

      $view.find(`table.kn-table tbody td.${FIELD_KEY}`).each(function () {
        const $cell = $(this);

        // idempotent
        if ($cell.data("scwReplacedWithIcon")) return;

        $cell.empty().append(ICON_HTML);
        $cell.data("scwReplacedWithIcon", true);
      });
    });
  });
})();

/********************* REPLACE MDF COLUMN WITH ICON ON BUILD QUOTE PAGE **************************/






////************* HIGHLIGHT DUPLICATE CELLS view_3313 - BUILD SOW PAGE  ***************//////


$(document).on('knack-view-render.view_3313', function () {

  const FIELD_KEY = 'field_1950';
  const DUP_BG = '#ffe2e2'; // light red highlight

  const valueMap = {};

  // Gather values from the column
  $('#view_3313 td.' + FIELD_KEY).each(function () {
    const value = $(this).text().trim();

    if (!value) return;

    if (!valueMap[value]) {
      valueMap[value] = [];
    }

    valueMap[value].push(this);
  });

  // Highlight duplicates
  Object.keys(valueMap).forEach(value => {
    if (valueMap[value].length > 1) {
      valueMap[value].forEach(cell => {
        $(cell).css({
          'background-color': DUP_BG,
          'font-weight': '600'
        });
      });
    }
  });

});
////************* HIGHLIGHT DUPLICATE CELLS view_3313 - BUILD SOW PAGE  ***************//////



////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////

(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================
  const VIEW_IDS = ['view_3329']; // add more views
  const BUCKET_FIELD_KEY = 'field_2223';
  const EVENT_NS = '.scwBucketRules';
  const CSS_ID = 'scw-bucket-visibility-css';

  // Readable mapping
  const BUCKET_RULES_HUMAN = {
    //cameras or readers
    '6481e5ba38f283002898113c': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_required'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2193', 'REL_products_cameras+cabling'],
      ['field_2206', 'REL_product accessories'],
      ['field_2241', 'INPUT_DROP: Pre-fix'],
      ['field_2184', 'INPUT_DROP: label number'],
      ['field_2186', 'INPUT_DROP: mount_cable_both'],
      ['field_2187', 'INPUT_DROP: variables'],
    ],
    //networking or headend
    '647953bb54b4e1002931ed97': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_required'],
      ['field_2194', 'REL_products_for networking'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2206', 'REL_product accessories'],
    ],
    //other equipment
    '5df12ce036f91b0015404d78': [
      ['field_2182', 'REL_scope of work'],
      ['field_2211', 'REL_mdf-idf_required'],
      ['field_2195', 'REL_products_for other equipment'],
      ['field_2183', 'INPUT_product quantity'],
    ],
    //service
    '6977caa7f246edf67b52cbcd': [
      ['field_2182', 'REL_scope of work'],
      ['field_2180', 'REL_mdf-idf_optional'],
      ['field_2233', 'INPUT_exepcted sub bid #'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2210', 'INPUT_service description'],
    ],
    //assumptions
    '6977ad1234ba695a17190963': [
      ['field_2182', 'REL_scope of work'],
      ['field_2204', 'REL_assumptions'],
    ],
    //licenses
    '645554dce6f3a60028362a6a': [
      ['field_2182', 'REL_scope of work'],
      ['field_2183', 'INPUT_product quantity'],
      ['field_2224', 'REL_products for licenses'],
    ],
  };

  const ALL_FIELD_KEYS = [
    'field_2182','field_2180','field_2188','field_2193','field_2194','field_2183','field_2210','field_2224',
    'field_2206','field_2195','field_2241','field_2184','field_2186','field_2187','field_2204', 'field_2211','field_2233',
  ];

  function compileRules(human) {
    const out = {};
    Object.keys(human || {}).forEach((bucket) => {
      out[bucket] = (human[bucket] || [])
        .map((x) => (Array.isArray(x) ? x[0] : x))
        .filter(Boolean);
    });
    return out;
  }
  const BUCKET_RULES = compileRules(BUCKET_RULES_HUMAN);

  // ============================================================
  // ✅ EARLY CSS: inject immediately so there’s no initial “flash”
  // ============================================================
  function injectGlobalCssOnce() {
    let el = document.getElementById(CSS_ID);
    if (el) return;

    el = document.createElement('style');
    el.id = CSS_ID;

    // Hide all fields inside the target views immediately.
    // Then only show ones marked scw-visible, plus the bucket input failsafe.
    const blocks = VIEW_IDS.map((viewId) => `
#${viewId} .kn-input { display: none !important; }
#${viewId} .kn-input.scw-visible { display: block !important; }
#${viewId} #kn-input-${BUCKET_FIELD_KEY} { display: block !important; } /* bucket always visible */
    `.trim()).join('\n\n');

    el.appendChild(document.createTextNode('\n' + blocks + '\n'));
    document.head.appendChild(el);
  }

  // Run ASAP (before Knack paints the view)
  injectGlobalCssOnce();

  // ======================
  // DOM helpers
  // ======================
  function $wrapForKeyWithinScope($scope, key) {
    let $w = $scope.find('#kn-input-' + key);
    if ($w.length) return $w;

    $w = $scope.find('.kn-input[data-input-id="' + key + '"]');
    if ($w.length) return $w;

    return $();
  }

  function hideField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.removeClass('scw-visible');
  }

  function showField($scope, key) {
    const $w = $wrapForKeyWithinScope($scope, key);
    if ($w.length) $w.addClass('scw-visible');
  }

  function hideAllExceptBucket($scope) {
    ALL_FIELD_KEYS.forEach((k) => {
      if (k === BUCKET_FIELD_KEY) return;
      hideField($scope, k);
    });
    showField($scope, BUCKET_FIELD_KEY);
  }

  function findBucketSelectInScope($scope, viewId) {
    let $sel = $scope.find('#' + viewId + '-' + BUCKET_FIELD_KEY);
    if ($sel.length) return $sel;
    return $scope.find('select[name="' + BUCKET_FIELD_KEY + '"]');
  }

  function getBucketValue($scope, viewId) {
    const $sel = findBucketSelectInScope($scope, viewId);
    return (($sel.val() || '') + '').trim();
  }

  function applyRules($scope, viewId) {
    const bucketValue = getBucketValue($scope, viewId);

    hideAllExceptBucket($scope);
    if (!bucketValue) return;

    (BUCKET_RULES[bucketValue] || []).forEach((k) => showField($scope, k));
  }

  // ======================
  // Binding strategy
  // ======================
  function bindDelegatedChange(viewId) {
    const sel = `#${viewId} select[name="${BUCKET_FIELD_KEY}"], #${viewId} #${viewId}-${BUCKET_FIELD_KEY}`;

    $(document)
      .off('change' + EVENT_NS, sel)
      .on('change' + EVENT_NS, sel, function () {
        const $bucketWrap = $(this).closest('.kn-input');
        const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
          ? $bucketWrap.closest('form, .kn-form, .kn-view')
          : $('#' + viewId);

        applyRules($scope, viewId);
      });
  }

  function initView(viewId) {
    bindDelegatedChange(viewId);

    const $view = $('#' + viewId);
    const $bucketWrap = $view.find('#kn-input-' + BUCKET_FIELD_KEY);
    const $scope = $bucketWrap.closest('form, .kn-form, .kn-view').length
      ? $bucketWrap.closest('form, .kn-form, .kn-view')
      : $view;

    applyRules($scope, viewId);
  }

  VIEW_IDS.forEach((viewId) => {
    $(document)
      .off('knack-view-render.' + viewId + EVENT_NS)
      .on('knack-view-render.' + viewId + EVENT_NS, function () {
        initView(viewId);
      });
  });
})();

////************* DTO: SCOPE OF WORK LINE ITEM MULTI-ADD (view_3329)***************//////








/***************************** DISABLE QUANTITY CELL ON DESIGNATED QUANTITY 1 ONLY LINE ITEM TYPES *******************************/
(function () {
  // ============================================================
  // SCW / Knack: Row-based cell locks (multi-view, multi-rule)
  // - Locks target cells on specific rows based on a detect field value
  // - Prevents inline edit by killing events in CAPTURE phase
  // - Adds per-rule message tooltip + optional “Locked” badge
  // - Avoids rewriting cell HTML (safe for REL/connection fields like field_1957)
  // ============================================================

  const EVENT_NS = ".scwRowLocks";

  // ============================================================
  // CONFIG
  // ============================================================
  const VIEWS = [
    {
      viewId: "view_3332",
      rules: [
        {
          detectFieldKey: "field_2230",      // qty limit boolean
          when: "yes",
          lockFieldKeys: ["field_1964"],     // lock qty
          message: "Qty locked (must be 1)"
        },
        {
          detectFieldKey: "field_2231",      // <-- was field_2232; field_2231 exists in your DOM
          when: "no",
          lockFieldKeys: ["field_1957"],     // lock map connections field
          message: "This field is locked until map connections = Yes"
        }
      ]
    },

    // Example for adding more views:
    // {
    //   viewId: "view_1953",
    //   rules: [
    //     { detectFieldKey: "field_2230", when: "yes", lockFieldKeys: ["field_1964"], message: "Qty locked" }
    //   ]
    // }
  ];

  // ============================================================
  // INTERNALS
  // ============================================================
  const LOCK_ATTR = "data-scw-locked";
  const LOCK_MSG_ATTR = "data-scw-locked-msg";
  const LOCK_CLASS = "scw-cell-locked";
  const ROW_CLASS = "scw-row-has-locks";

  function normText(s) {
    return (s || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function readCellValue($cell) {
    return normText($cell.text());
  }

  function matchesWhen(cellVal, when) {
    if (typeof when === "function") return !!when(cellVal);
    if (when === true) return cellVal === "yes" || cellVal === "true" || cellVal === "1";
    if (when === false) return cellVal === "no" || cellVal === "false" || cellVal === "0" || cellVal === "";
    return cellVal === normText(String(when));
  }

  // Safer lock: do NOT replace the cell HTML (important for REL/connection fields)
  function lockTd($td, msg) {
    if (!$td || !$td.length) return;
    if ($td.attr(LOCK_ATTR) === "1") return;

    const m = (msg || "N/A").trim();

    $td
      .attr(LOCK_ATTR, "1")
      .attr(LOCK_MSG_ATTR, m)
      .addClass(LOCK_CLASS)
      .attr("title", m);

    // Remove common Knack/KTL inline-edit hooks
    $td.removeClass("cell-edit ktlInlineEditableCellsStyle");
    $td.find(".cell-edit, .ktlInlineEditableCellsStyle").removeClass("cell-edit ktlInlineEditableCellsStyle");

    // Belt-and-suspenders: if KTL uses pointer events, kill them in locked cells
    // (We also have capture-blocker below.)
  }

  function applyLocksForView(viewCfg) {
    const { viewId, rules } = viewCfg;
    const $view = $("#" + viewId);
    if (!$view.length) return;

    const $tbody = $view.find("table.kn-table-table tbody");
    if (!$tbody.length) return;

    $tbody.find("tr").each(function () {
      const $tr = $(this);

      // Skip group/header rows
      if ($tr.hasClass("kn-table-group") || $tr.hasClass("kn-table-group-container")) return;

      let rowLocked = false;

      rules.forEach((rule) => {
        const $detect = $tr.find(`td.${rule.detectFieldKey}`);
        if (!$detect.length) return;

        const cellVal = readCellValue($detect);
        if (!matchesWhen(cellVal, rule.when)) return;

        (rule.lockFieldKeys || []).forEach((fk) => {
          const $td = $tr.find(`td.${fk}`);
          if ($td.length) {
            lockTd($td, rule.message);
            rowLocked = true;
          }
        });
      });

      if (rowLocked) $tr.addClass(ROW_CLASS);
    });
  }

  function applyWithRetries(viewCfg, tries = 12) {
    let i = 0;
    (function tick() {
      i++;
      applyLocksForView(viewCfg);
      if (i < tries) setTimeout(tick, 250);
    })();
  }

  // Capture-phase event killer: blocks Knack’s delegated inline-edit before it runs
  function installCaptureBlockerOnce() {
    if (window.__scwRowLocksCaptureInstalled) return;
    window.__scwRowLocksCaptureInstalled = true;

    const kill = (e) => {
      const td = e.target.closest && e.target.closest(`td[${LOCK_ATTR}="1"]`);
      if (!td) return;

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return false;
    };

    ["mousedown", "mouseup", "click", "dblclick", "touchstart", "keydown"].forEach((evt) => {
      document.addEventListener(evt, kill, true); // capture phase
    });
  }

  // MutationObserver per view: if KTL/Knack re-renders tbody, re-apply locks
  function installObserver(viewCfg) {
    const { viewId } = viewCfg;
    const $view = $("#" + viewId);
    if (!$view.length) return;

    if ($view.data("scwRowLocksObserver")) return;
    $view.data("scwRowLocksObserver", true);

    const el = $view.find("table.kn-table-table tbody").get(0);
    if (!el) return;

    const obs = new MutationObserver(() => applyLocksForView(viewCfg));
    obs.observe(el, { childList: true, subtree: true });
  }

  function bindTriggers(viewCfg) {
    const { viewId, rules } = viewCfg;

    const triggers = new Set();
    rules.forEach((r) => (r.triggerFieldKeys || []).forEach((k) => triggers.add(k)));
    if (triggers.size === 0) triggers.add("*");

    $(document)
      .off(`click${EVENT_NS}`, `#${viewId} td`)
      .on(`click${EVENT_NS}`, `#${viewId} td`, function () {
        const $td = $(this);
        const cls = ($td.attr("class") || "").split(/\s+/);

        const triggered = triggers.has("*") || cls.some((c) => triggers.has(c));
        if (!triggered) return;

        setTimeout(() => applyLocksForView(viewCfg), 50);
        setTimeout(() => applyLocksForView(viewCfg), 300);
      });
  }

  function injectLockCssOnce() {
    const id = "scw-row-locks-css";
    if (document.getElementById(id)) return;

    const css = `
      /* Locked look + no interaction */
      td.${LOCK_CLASS} {
        position: relative;
        cursor: not-allowed !important;
      }
      td.${LOCK_CLASS} * {
        cursor: not-allowed !important;
      }

      /* Hide any KTL inline-edit hover affordance inside locked cells */
      td.${LOCK_CLASS} .ktlInlineEditableCellsStyle,
      td.${LOCK_CLASS} .cell-edit {
        pointer-events: none !important;
      }

      /* Optional: add a small badge */
      td.${LOCK_CLASS}::after{
        content: "N/A";
        position: absolute;
        top: 2px;
        right: 4px;
        font-size: 10px;
        opacity: .7;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(0,0,0,.06);
      }

      td.scw-cell-locked {
        background-color: slategray;
      }

      /* Hide only the Knack-rendered value */
      td.field_1964.scw-cell-locked span[class^="col-"] {
         visibility: hidden;
      }


      /* Tooltip bubble using per-cell message */
      td.${LOCK_CLASS}:hover::before{
        content: attr(${LOCK_MSG_ATTR});
        position: absolute;
        bottom: 100%;
        left: 0;
        margin-bottom: 6px;
        max-width: 260px;
        white-space: normal;
        font-size: 12px;
        line-height: 1.2;
        padding: 6px 8px;
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,.15);
        background: #fff;
        color: #111;
        z-index: 999999;
      }
    `;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ============================================================
  // INIT
  // ============================================================
  injectLockCssOnce();
  installCaptureBlockerOnce();

  VIEWS.forEach((viewCfg) => {
    const viewId = viewCfg.viewId;

    $(document)
      .off(`knack-view-render.${viewId}${EVENT_NS}`)
      .on(`knack-view-render.${viewId}${EVENT_NS}`, function () {
        applyWithRetries(viewCfg);
        installObserver(viewCfg);
        bindTriggers(viewCfg);
      });
  });
})();

/***************************** DISABLE QUANTITY CELL ON DESIGNATED QUANTITY 1 ONLY LINE ITEM TYPES *******************************/




























/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/////************* PROPOSAL VIEW OF SOW (effective Q1 2026) ***************//////
/**
 * SCW Totals Script - Optimized Version
 * Version: 2.0 - Fixed WeakMap.clear() issue
 * Last Updated: 2025-01-26
 *
 * PATCHES:
 *  - Hide Level-3 header row when product-name group label is blank-ish (grouped by field_2208)
 *  - Restore camera concat for "drop" (Cameras/Entries) by expanding L2_CONTEXT.byLabel variants
 *  - L4 field_2019 injection is non-destructive (never hides L4 header)
 *  - ✅ NEW: When Level-2 is "Mounting Hardware", inject camera label list into Level-3 header (not Level-4)
 *  - ✅ FIX: Mounting Hardware L3 concat gating is centralized + normalized (no brittle string match inside injector)
 *  - ✅ NEW PATCH (2026-01-30): Hide stray blank Level-4 header rows (Knack creates a group for empty L4 grouping values)
 */
(function () {
  'use strict';

  // ======================
  // CONFIG
  // ======================

  const VIEW_IDS = ['view_3301', 'view_3341'];
  const EVENT_NS = '.scwTotals';

  // Field keys
  const QTY_FIELD_KEY = 'field_1964';
  const LABOR_FIELD_KEY = 'field_2028';
  const HARDWARE_FIELD_KEY = 'field_2201';
  const COST_FIELD_KEY = 'field_2203';

  // ✅ Hide L3 group header if product-name group label is blank-ish
  const HIDE_LEVEL3_WHEN_FIELD_BLANK = {
    enabled: true,
    fieldKey: 'field_2208',
  };

  // ✅ NEW: Hide stray blank Level-4 headers
  // (Knack creates a Level-4 group for empty grouping values; we hide header-only if there’s no usable label.)
  const HIDE_LEVEL4_WHEN_HEADER_BLANK = {
    enabled: true,
    cssClass: 'scw-hide-level4-header',
    // If field_2019 has meaningful text, we keep the header (because injectField2019IntoLevel4Header may fill it).
    requireField2019AlsoBlank: true,
  };

  // Level-2 Label Rewriting Configuration
  const LEVEL_2_LABEL_CONFIG = {
    enabled: true,
    selectorFieldKey: 'field_2228',
    rules: [
      {
        when: 'Video',
        match: 'exact',
        renames: {
          'Camera or Reader': 'Cameras',
          'Networking or Headend': 'NVRs, Switches, and Networking',
        },
      },
      {
        when: 'Access Control',
        match: 'exact',
        renames: {
          'Camera or Reader': 'Entries',
          'Networking or Headend': 'AC Controllers, Switches, and Networking',
        },
      },
      {
        when: 'video',
        match: 'contains',
        renames: {
          'Networking or Headend': 'NVR, Switches, and Networking',
        },
      },
    ],
  };

  const EACH_COLUMN = {
    enabled: false,
    fieldKey: 'field_1960',
  };

  // Camera label builder inputs (USED FOR BOTH L4 CAMERAS + L3 MOUNTING HARDWARE)
  const CONCAT = {
    enabled: true,
    onlyContextKey: 'drop',
    onlyLevel: 4,
    prefixFieldKey: 'field_2240',
    numberFieldKey: 'field_1951',
  };

  // ✅ NEW: For Mounting Hardware, inject camera list into Level-3 header (not Level-4)
  const CONCAT_L3_FOR_MOUNTING = {
    enabled: true,
    level2Label: 'Mounting Hardware',
    level: 3,
    cssClass: 'scw-concat-cameras--mounting',
  };

  // Context mapping for "drop" etc
  const L2_CONTEXT = {
    byId: {},
    byLabel: {
      'Cameras & Cabling': 'drop',
      'Cameras and Cabling': 'drop',
      'Cameras or Cabling': 'drop',
      'Camera or Reader': 'drop',
      'Cameras': 'drop',
      'Entries': 'drop',

      'Networking or Headend': 'headend',
      'Networking & Headend': 'headend',
      'NVRs, Switches, and Networking': 'headend',
      'NVR, Switches, and Networking': 'headend',
      'AC Controllers, Switches, and Networking': 'headend',

      'Services': 'services',
    },
  };

  const L2_SPECIALS = {
    mountingHardwareId: '',
    mountingHardwareLabel: 'Mounting Hardware',
    classOnLevel3: 'scw-level3--mounting-hardware',
  };

  // ======================
  // CACHED UTILITIES
  // ======================

  const decoderElement = document.createElement('textarea');
  const htmlEscapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  const htmlEscapeRegex = /[&<>"']/g;

  function escapeHtml(str) {
    return String(str ?? '').replace(htmlEscapeRegex, (char) => htmlEscapeMap[char]);
  }

  function decodeEntities(str) {
    decoderElement.innerHTML = str;
    return decoderElement.value;
  }

  const sanitizeRegex = /<\/?strong\b[^>]*>/gi;
  const removeTagsRegex = /<(?!\/?(br|b)\b)[^>]*>/gi;

  function sanitizeAllowOnlyBrAndB(html) {
    if (!html) return '';
    return html
      .replace(sanitizeRegex, (tag) => tag.replace(/strong/gi, 'b'))
      .replace(removeTagsRegex, '');
  }

  function formatMoney(n) {
    const num = Number(n || 0);
    return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
  }

  function sumField($rows, fieldKey) {
    let total = 0;
    const rows = $rows.get();

    for (let i = 0; i < rows.length; i++) {
      const cell = rows[i].querySelector(`td.${fieldKey}`);
      if (!cell) continue;
      const num = parseFloat(cell.textContent.replace(/[^\d.-]/g, ''));
      if (Number.isFinite(num)) total += num;
    }
    return total;
  }

  function norm(s) {
    return String(s || '').replace(/\u00A0/g, ' ').trim();
  }

  const normKeyCache = new Map();
  function normKey(s) {
    const key = String(s);
    if (normKeyCache.has(key)) return normKeyCache.get(key);
    const result = norm(s).toLowerCase();
    normKeyCache.set(key, result);
    return result;
  }

  function isBlankish(v) {
    const t = norm(v);
    return !t || t === '-' || t === '—' || t === '–';
  }

  // ✅ NEW: read group label text (works for L3/L4)
  function getGroupLabelText($groupRow) {
    const $td = $groupRow.children('td').first();
    return $td.length ? norm($td.text()) : '';
  }

  let cssInjected = false;
  function injectCssOnce() {
    if (cssInjected) return;
    cssInjected = true;

    const style = document.createElement('style');
    style.id = 'scw-totals-css';
    style.textContent = `
      tr.scw-level-total-row.scw-subtotal td { vertical-align: middle; }
      tr.scw-level-total-row.scw-subtotal .scw-level-total-label { white-space: nowrap; }
      .scw-concat-cameras { line-height: 1.2; }
      .scw-l4-2019 { line-height: 1.2; }
      .scw-each { line-height: 1.1; }
      .scw-each__label { font-weight: 700; opacity: .9; margin-bottom: 2px; }

      /* hard-hide L3 header rows when flagged */
      tr.scw-hide-level3-header { display: none !important; }

      /* optional: slightly tighter list for Mounting Hardware L3 */
      .scw-concat-cameras--mounting { line-height: 1.15; }

      /* ✅ NEW: hard-hide stray blank L4 header rows when flagged */
      tr.scw-hide-level4-header { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  // ======================
  // RECORD-ID EXTRACTION
  // ======================

  function extractRecordIdFromElement(el) {
    if (!el) return null;

    const direct = el.getAttribute('data-record-id') || el.getAttribute('data-id');
    if (direct) return direct.trim();

    const nested = el.querySelector('[data-record-id],[data-id]');
    if (nested) {
      const nestedId = nested.getAttribute('data-record-id') || nested.getAttribute('data-id');
      if (nestedId) return nestedId.trim();
    }

    const a = el.querySelector('a[href]');
    if (a) {
      const href = a.getAttribute('href') || '';
      const patterns = [/\/records\/([A-Za-z0-9]+)/i, /\/record\/([A-Za-z0-9]+)/i, /[?&]id=([A-Za-z0-9]+)/i];
      for (const pattern of patterns) {
        const match = href.match(pattern);
        if (match?.[1]) return match[1];
      }
    }

    return null;
  }

  function getLevel2InfoFromGroupRow($groupRow) {
    const el = $groupRow[0];
    if (!el) return { label: null, recordId: null };

    const td = el.querySelector('td:first-child');
    const label = td ? norm(td.textContent) : null;
    const recordId = extractRecordIdFromElement(td);

    return { label, recordId };
  }

  function contextKeyFromLevel2Info(level2Info) {
    const id = level2Info?.recordId;
    const label = level2Info?.label;

    if (id && L2_CONTEXT.byId[id]) return L2_CONTEXT.byId[id];
    if (label && L2_CONTEXT.byLabel[label]) return L2_CONTEXT.byLabel[label];
    return 'default';
  }

  let nearestL2Cache = new WeakMap();
  function getNearestLevel2Info($row) {
    const el = $row[0];
    if (nearestL2Cache.has(el)) return nearestL2Cache.get(el);

    let current = el.previousElementSibling;
    while (current) {
      const classList = current.classList;
      if (classList.contains('kn-group-level-2')) {
        const result = getLevel2InfoFromGroupRow($(current));
        nearestL2Cache.set(el, result);
        return result;
      }
      if (classList.contains('kn-group-level-1')) break;
      current = current.previousElementSibling;
    }

    const result = { label: null, recordId: null };
    nearestL2Cache.set(el, result);
    return result;
  }

  // ======================
  // LEVEL-2 LABEL REWRITING
  // ======================

  function getSelectorFieldValue($row) {
    const $cell = $row.find(`td.${LEVEL_2_LABEL_CONFIG.selectorFieldKey}`).first();
    if (!$cell.length) return '';

    const attrs = ['data-raw-value', 'data-value', 'data-id', 'data-record-id'];
    for (const attr of attrs) {
      const val = $cell.attr(attr);
      if (val) return norm(val);
    }

    const $nested = $cell.find('[data-raw-value],[data-value],[data-id],[data-record-id]').first();
    if ($nested.length) {
      for (const attr of attrs) {
        const val = $nested.attr(attr);
        if (val) return norm(val);
      }
    }

    const titleish = $cell.attr('title') || $cell.attr('aria-label');
    if (titleish) return norm(titleish);

    return norm($cell.text());
  }

  function valueMatchesRule(value, rule) {
    const v = normKey(value);
    const w = normKey(rule.when);
    if (!v || !w) return false;
    return rule.match === 'contains' ? v.includes(w) : v === w;
  }

  function findRuleForSection($rowsInSection) {
    if (!LEVEL_2_LABEL_CONFIG.enabled || !LEVEL_2_LABEL_CONFIG.rules) return null;

    const values = new Set();

    $rowsInSection.filter('tr[id]').each(function () {
      const val = getSelectorFieldValue($(this));
      if (val) values.add(val);
    });

    if (values.size === 0) {
      $rowsInSection.each(function () {
        const val = getSelectorFieldValue($(this));
        if (val) values.add(val);
      });
    }

    for (const val of values) {
      for (const rule of LEVEL_2_LABEL_CONFIG.rules) {
        if (valueMatchesRule(val, rule)) return rule;
      }
    }
    return null;
  }

  function applyLevel2LabelRewrites($tbody, runId) {
    if (!LEVEL_2_LABEL_CONFIG.enabled) return;

    const $l1 = $tbody.find('tr.kn-table-group.kn-group-level-1');
    if (!$l1.length) return;

    for (let idx = 0; idx < $l1.length; idx++) {
      const $start = $l1.eq(idx);
      const $nextL1 = idx + 1 < $l1.length ? $l1.eq(idx + 1) : null;

      const $rowsInSection = $nextL1 ? $start.nextUntil($nextL1).addBack() : $start.nextAll().addBack();

      const rule = findRuleForSection($rowsInSection);
      if (!rule?.renames) continue;

      $rowsInSection.filter('tr.kn-table-group.kn-group-level-2').each(function () {
        const $groupRow = $(this);

        if ($groupRow.data(`scwL2Rewrite_${runId}`)) return;
        $groupRow.data(`scwL2Rewrite_${runId}`, true);

        const $td = $groupRow.children('td').first();
        if (!$td.length) return;

        const currentLabel = norm($td.text());
        const newLabel = rule.renames[currentLabel];

        if (newLabel) {
          const $a = $td.find('a');
          if ($a.length) $a.text(newLabel);
          else $td.text(newLabel);
        }
      });

      $rowsInSection
        .filter('tr.scw-level-total-row.scw-subtotal[data-scw-subtotal-level="2"]')
        .each(function () {
          const $tr = $(this);
          const gl = norm($tr.attr('data-scw-group-label'));
          const replacement = rule.renames[gl];
          if (!replacement) return;

          $tr.attr('data-scw-group-label', replacement);
          $tr.find('.scw-level-total-label strong').text(replacement);
        });
    }
  }

  // ======================
  // GROUP BOUNDARY DETECTION
  // ======================

  function getGroupBlock($groupRow, levelNum) {
    const nodes = [];
    let current = $groupRow[0].nextElementSibling;

    while (current) {
      if (current.classList.contains('kn-table-group')) {
        const match = current.className.match(/kn-group-level-(\d+)/);
        const currentLevel = match ? parseInt(match[1], 10) : null;
        if (currentLevel !== null && currentLevel <= levelNum) break;
      }
      nodes.push(current);
      current = current.nextElementSibling;
    }

    return $(nodes);
  }

  // ======================
  // CAMERA LIST BUILDER (USED FOR BOTH L4 + L3)
  // ======================

  function buildCameraListHtml($rows) {
    const items = [];
    const rows = $rows.get();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const prefixCell = row.querySelector(`td.${CONCAT.prefixFieldKey}`);
      const numCell = row.querySelector(`td.${CONCAT.numberFieldKey}`);
      if (!prefixCell || !numCell) continue;

      const prefix = prefixCell.textContent.trim();
      const numRaw = numCell.textContent.trim();
      if (!prefix || !numRaw) continue;

      const digits = numRaw.replace(/\D/g, '');
      const num = parseInt(digits, 10);
      if (!Number.isFinite(num)) continue;

      const prefixUpper = prefix.toUpperCase();
      items.push({ prefix: prefixUpper, num, text: `${prefixUpper}${digits}` });
    }

    if (!items.length) return '';

    items.sort((a, b) => (a.prefix === b.prefix ? a.num - b.num : a.prefix < b.prefix ? -1 : 1));
    return items.map((it) => escapeHtml(it.text)).join(', ');
  }

  function injectConcatIntoHeader({ level, contextKey, $groupRow, $rowsToSum, runId }) {
    if (!CONCAT.enabled || level !== CONCAT.onlyLevel || contextKey !== CONCAT.onlyContextKey) return;
    if ($groupRow.data('scwConcatRunId') === runId) return;
    $groupRow.data('scwConcatRunId', runId);

    const cameraListHtml = buildCameraListHtml($rowsToSum);
    if (!cameraListHtml) return;

    const $labelCell = $groupRow.find('td:first');
    if (!$labelCell.length) return;

    const currentHtml = $labelCell.html() || '';
    const sanitizedBase = sanitizeAllowOnlyBrAndB(decodeEntities(currentHtml));

    $labelCell.html(
      `<div class="scw-concat-cameras">${sanitizedBase}<br/><b style="color:orange;"> (${cameraListHtml})</b></div>`
    );
  }

  function injectConcatIntoLevel3HeaderForMounting({ $groupRow, $rowsToSum, runId }) {
    if (!CONCAT.enabled) return;
    if (!CONCAT_L3_FOR_MOUNTING.enabled) return;
    if (!$groupRow.length || !$rowsToSum.length) return;

    if ($groupRow.data('scwConcatL3MountRunId') === runId) return;
    $groupRow.data('scwConcatL3MountRunId', runId);

    const cameraListHtml = buildCameraListHtml($rowsToSum);
    if (!cameraListHtml) return;

    const $labelCell = $groupRow.children('td').first();
    if (!$labelCell.length) return;

    const currentHtml = $labelCell.html() || '';
    const sanitizedBase = sanitizeAllowOnlyBrAndB(decodeEntities(currentHtml));

    $labelCell.html(
      `<div class="scw-concat-cameras ${CONCAT_L3_FOR_MOUNTING.cssClass}">` +
        `${sanitizedBase}<br/>` +
        `<b style="color:orange;">(${cameraListHtml})</b>` +
        `</div>`
    );
  }

  // ======================
  // FIELD_2019 INJECTION
  // ======================

  function injectField2019IntoLevel4Header({ level, $groupRow, $rowsToSum, runId }) {
    if (level !== 4 || !$groupRow.length || !$rowsToSum.length) return;
    if ($groupRow.data('scwL4_2019_RunId') === runId) return;
    $groupRow.data('scwL4_2019_RunId', runId);

    const labelCell = $groupRow[0].querySelector('td:first-child');
    if (!labelCell) return;

    const firstRow = $rowsToSum[0];
    const fieldCell = firstRow ? firstRow.querySelector('td.field_2019') : null;
    if (!fieldCell) return;

    let html = sanitizeAllowOnlyBrAndB(decodeEntities(fieldCell.innerHTML || ''));

    const textContent = html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?b>/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .trim();

    if (!textContent) return;

    labelCell.innerHTML = `<div class="scw-l4-2019">${html}</div>`;
  }

  // ======================
  // EACH COLUMN
  // ======================

  function injectEachIntoLevel3Header({ level, $groupRow, $rowsToSum, runId }) {
    if (!EACH_COLUMN.enabled || level !== 3) return;
    if (!$groupRow.length || !$rowsToSum.length) return;
    if ($groupRow.data('scwL3EachRunId') === runId) return;
    $groupRow.data('scwL3EachRunId', runId);

    const $target = $groupRow.find(`td.${EACH_COLUMN.fieldKey}`);
    if (!$target.length) return;

    const firstRow = $rowsToSum[0];
    const cell = firstRow.querySelector(`td.${EACH_COLUMN.fieldKey}`);
    if (!cell) return;

    const num = parseFloat(cell.textContent.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(num)) return;

    $target.html(`
      <div class="scw-each">
        <div class="scw-each__label">each</div>
        <div>${escapeHtml(formatMoney(num))}</div>
      </div>
    `);
  }

  // ======================
  // ROW BUILDERS
  // ======================

  function buildSubtotalRow({
    $cellsTemplate,
    $rowsToSum,
    labelOverride,
    level,
    contextKey,
    groupLabel,
    qtyFieldKey,
    costFieldKey,
    costSourceKey,
  }) {
    const leftText = labelOverride || groupLabel || '';

    const qty = sumField($rowsToSum, qtyFieldKey);
    const cost = sumField($rowsToSum, costSourceKey);

    const $row = $(`
      <tr
        class="scw-level-total-row scw-subtotal scw-subtotal--level-${level}"
        data-scw-subtotal-level="${level}"
        data-scw-context="${escapeHtml(contextKey || 'default')}"
        data-scw-group-label="${escapeHtml(groupLabel || '')}"
      >
        <td class="scw-level-total-label"><strong>${escapeHtml(leftText)}</strong></td>
      </tr>
    `);

    $row.append($cellsTemplate.clone());

    $row.find(`td.${qtyFieldKey}`).html(`<strong>${Math.round(qty)}</strong>`);
    $row.find(`td.${costFieldKey}`).html(`<strong>${escapeHtml(formatMoney(cost))}</strong>`);
    $row.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();

    return $row;
  }

  // ======================
  // MAIN PROCESSOR
  // ======================

  function addGroupTotalsRuleDriven(view) {
    const runId = Date.now();
    const $tbody = $(`#${view.key} .kn-table tbody`);

    if (!$tbody.length || $tbody.find('.kn-tr-nodata').length) return;

    nearestL2Cache = new WeakMap();
    normKeyCache.clear();

    $tbody
      .find('tr')
      .removeData([
        'scwConcatRunId',
        'scwConcatL3MountRunId',
        'scwL4_2019_RunId',
        'scwL3EachRunId',
        'scwHeaderCellsAdded',
      ]);

    $tbody.find('tr.scw-level-total-row').remove();
    $tbody
      .find(`tr.kn-table-group.kn-group-level-3.${L2_SPECIALS.classOnLevel3}`)
      .removeClass(L2_SPECIALS.classOnLevel3);

    const $firstDataRow = $tbody.find('tr[id]').first();
    if (!$firstDataRow.length) return;

    const $cellsTemplate = $firstDataRow.find('td:gt(0)').clone().empty();
    const $allGroupRows = $tbody.find('tr.kn-table-group');

    const sectionContext = {
      level2: { label: null, recordId: null },
      key: 'default',
    };

    const footerQueue = [];

    $allGroupRows.each(function () {
      const $groupRow = $(this);
      const match = this.className.match(/kn-group-level-(\d+)/);
      if (!match) return;

      const level = parseInt(match[1], 10);

      if (level === 2) {
        const info = getLevel2InfoFromGroupRow($groupRow);
        sectionContext.level2 = info;
        sectionContext.key = contextKeyFromLevel2Info(info);
      }

      const $groupBlock = getGroupBlock($groupRow, level);
      if (!$groupBlock.length) return;

      const $rowsToSum = $groupBlock.filter('tr[id]');
      if (!$rowsToSum.length) return;

      // Level 1: Headers only
      if (level === 1) {
        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        $groupRow.find(`td.${QTY_FIELD_KEY}`).html('<strong>Qty</strong>');
        $groupRow.find(`td.${COST_FIELD_KEY}`).html('<strong>Cost</strong>');
        $groupRow.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();
      }

      // Level 3
      if (level === 3) {
        $groupRow.removeClass('scw-hide-level3-header').show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        if (HIDE_LEVEL3_WHEN_FIELD_BLANK.enabled) {
          const labelText = getGroupLabelText($groupRow);
          if (isBlankish(labelText)) {
            $groupRow.addClass('scw-hide-level3-header');
            return; // Level-4 will still be processed
          }
        }

        const nearestL2 = getNearestLevel2Info($groupRow);

        const isMounting =
          (L2_SPECIALS.mountingHardwareId && nearestL2.recordId === L2_SPECIALS.mountingHardwareId) ||
          (!L2_SPECIALS.mountingHardwareId &&
            norm(nearestL2.label) === norm(L2_SPECIALS.mountingHardwareLabel));

        if (isMounting) {
          $groupRow.addClass(L2_SPECIALS.classOnLevel3);
          injectConcatIntoLevel3HeaderForMounting({ $groupRow, $rowsToSum, runId });
        }

        const qty = sumField($rowsToSum, QTY_FIELD_KEY);
        const hardware = sumField($rowsToSum, HARDWARE_FIELD_KEY);

        $groupRow.find(`td.${QTY_FIELD_KEY}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${COST_FIELD_KEY}`).html(`<strong>${escapeHtml(formatMoney(hardware))}</strong>`);
        $groupRow.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();

        injectEachIntoLevel3Header({ level, $groupRow, $rowsToSum, runId });
      }

      // Level 4
      if (level === 4) {
        // reset any prior hide flag this run
        $groupRow.removeClass(HIDE_LEVEL4_WHEN_HEADER_BLANK.cssClass).show();

        if (!$groupRow.data('scwHeaderCellsAdded')) {
          $groupRow.find('td').removeAttr('colspan');
          $groupRow.append($cellsTemplate.clone());
          $groupRow.data('scwHeaderCellsAdded', true);
        }

        // ✅ NEW PATCH: hide stray blank L4 header rows
        if (HIDE_LEVEL4_WHEN_HEADER_BLANK.enabled) {
          const headerText = getGroupLabelText($groupRow);

          let field2019Text = '';
          if (HIDE_LEVEL4_WHEN_HEADER_BLANK.requireField2019AlsoBlank) {
            const firstRow = $rowsToSum[0];
            const cell2019 = firstRow ? firstRow.querySelector('td.field_2019') : null;
            field2019Text = cell2019 ? norm(cell2019.textContent || '') : '';
          }

          if (isBlankish(headerText) && (!HIDE_LEVEL4_WHEN_HEADER_BLANK.requireField2019AlsoBlank || isBlankish(field2019Text))) {
            $groupRow.addClass(HIDE_LEVEL4_WHEN_HEADER_BLANK.cssClass);
            // DO NOT return; keep totals/subtotals working for these rows
          }
        }

        injectField2019IntoLevel4Header({ level, $groupRow, $rowsToSum, runId });

        const qty = sumField($rowsToSum, QTY_FIELD_KEY);
        const labor = sumField($rowsToSum, LABOR_FIELD_KEY);

        $groupRow.find(`td.${QTY_FIELD_KEY}`).html(`<strong>${Math.round(qty)}</strong>`);
        $groupRow.find(`td.${COST_FIELD_KEY}`).html(`<strong>${escapeHtml(formatMoney(labor))}</strong>`);
        $groupRow.find(`td.${HARDWARE_FIELD_KEY},td.${LABOR_FIELD_KEY}`).empty();

        injectConcatIntoHeader({ level, contextKey: sectionContext.key, $groupRow, $rowsToSum, runId });
      }

      // Queue footers for L1 and L2
      if (level === 1 || level === 2) {
        footerQueue.push({
          level,
          label: getLevel2InfoFromGroupRow($groupRow).label,
          contextKey: sectionContext.key,
          $groupBlock,
          $cellsTemplate,
          $rowsToSum,
        });
      }
    });

    const footersByAnchor = new Map();
    for (const item of footerQueue) {
      const anchorEl = item.$groupBlock.last()[0];
      if (!anchorEl) continue;

      if (!footersByAnchor.has(anchorEl)) footersByAnchor.set(anchorEl, []);
      footersByAnchor.get(anchorEl).push(item);
    }

    const anchors = Array.from(footersByAnchor.keys())
      .sort((a, b) => {
        if (a === b) return 0;
        const pos = a.compareDocumentPosition(b);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : pos & Node.DOCUMENT_POSITION_PRECEDING ? 1 : 0;
      })
      .reverse();

    for (const anchorEl of anchors) {
      const items = footersByAnchor.get(anchorEl);

      items.sort((a, b) =>
        a.level === 2 && b.level === 1 ? -1 : a.level === 1 && b.level === 2 ? 1 : b.level - a.level
      );

      const fragment = document.createDocumentFragment();

      for (const item of items) {
        const $row = buildSubtotalRow({
          $cellsTemplate: item.$cellsTemplate,
          $rowsToSum: item.$rowsToSum,
          labelOverride: item.level === 1 ? `${item.label} — Subtotal` : null,
          level: item.level,
          contextKey: item.contextKey,
          groupLabel: item.label,
          qtyFieldKey: QTY_FIELD_KEY,
          costFieldKey: COST_FIELD_KEY,
          costSourceKey: COST_FIELD_KEY,
        });

        fragment.appendChild($row[0]);
      }

      anchorEl.parentNode.insertBefore(fragment, anchorEl.nextSibling);
    }

    applyLevel2LabelRewrites($tbody, runId);
  }

  // ======================
  // FIELD_2019 NORMALIZE
  // ======================

  function normalizeField2019ForGrouping(viewId) {
    const cells = document.querySelectorAll(`#${viewId} .kn-table td.field_2019`);
    for (const cell of cells) {
      let html = sanitizeAllowOnlyBrAndB(decodeEntities(cell.innerHTML || ''));
      html = html
        .replace(/\s*<br\s*\/?>\s*/gi, '<br>')
        .replace(/\s*<b>\s*/gi, '<b>')
        .replace(/\s*<\/b>\s*/gi, '</b>')
        .trim();
      cell.innerHTML = html;
    }
  }

  // ======================
  // EVENT BINDING
  // ======================

  function bindForView(viewId) {
    const ev = `knack-records-render.${viewId}${EVENT_NS}`;
    $(document)
      .off(ev)
      .on(ev, function (event, view) {
        if (!document.getElementById(viewId)) return;

        injectCssOnce();
        normalizeField2019ForGrouping(viewId);

        requestAnimationFrame(() => {
          try {
            addGroupTotalsRuleDriven(view);
          } catch (error) {
            console.error(`[SCW totals][${viewId}] error:`, error);
          }
        });
      });
  }

  VIEW_IDS.forEach(bindForView);
})();
