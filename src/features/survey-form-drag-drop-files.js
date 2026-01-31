
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


