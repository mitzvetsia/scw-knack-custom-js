
/***************************** SURVEY / PROJECT FORM: drag + drop View / Location Upload fields *******************/

(function () {
  'use strict';

  /**
   * Enhance upload fields in a Knack form view with drag-and-drop
   * styling and status messages (red = empty, green = uploaded,
   * orange = pending replacement).
   */
  function enhanceUploadFields(uploadFields) {
    uploadFields.forEach(function (inputFieldId) {
      var $uploadWrapper = $('#' + inputFieldId).parent('.kn-file-upload');
      var $fileInput = $('#' + inputFieldId);

      var existingFilename = '';

      if (!$uploadWrapper.length || !$fileInput.length) return;

      // Style wrapper
      $uploadWrapper.css({
        position: 'relative',
        width: '100%',
        height: '150px',
        minHeight: '150px',
        backgroundColor: 'rgba(255, 0, 0, 0.2)',
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
        $uploadWrapper.append(
          '<div class="upload-message" style="' +
            'position: absolute; top: 0; left: 0; right: 0; bottom: 0;' +
            'display: flex; align-items: center; justify-content: center;' +
            'border: 2px dashed #1890ff; border-radius: 8px;' +
            'font-size: 16px; font-weight: 500; color: #1890ff;' +
            'text-align: center; pointer-events: none; z-index: 1;">' +
            'Drop your file here or click to upload' +
          '</div>'
        );
      }

      function getFilenameFromAsset(assetElement) {
        if (!assetElement) return '';
        var link = assetElement.querySelector('a');
        if (link) return link.innerText.trim();
        return assetElement.innerText.replace(/remove/i, '').trim();
      }

      function setUploadMessage(currentFilename, newFilename, mode) {
        newFilename = newFilename || '';
        mode = mode || 'normal';
        var $message = $uploadWrapper.find('.upload-message');

        if (mode === 'uploading-new') {
          $message.html(
            '<div style="padding: 20px;">Please click UPDATE to upload this file:<br><strong>' +
            newFilename + '</strong></div>'
          );
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)');
        } else if (mode === 'uploading-replacement') {
          $message.html(
            '<div style="padding: 20px;">Click UPDATE to replace <br><strong>' +
            currentFilename + '</strong><br> with <br><strong>' + newFilename + '</strong></div>'
          );
          $uploadWrapper.css('background-color', 'rgba(255, 165, 0, 0.2)');
        } else if (currentFilename) {
          $message.html('<div style="padding: 20px;">Good Job!</div>');
          $uploadWrapper.css('background-color', 'rgba(0, 128, 0, 0.2)');
        } else {
          $message.html('Drop your file here or click to upload');
          $uploadWrapper.css('background-color', 'rgba(255, 0, 0, 0.2)');
        }
      }

      function hideAssetCurrent() {
        var el = document.getElementById(inputFieldId);
        if (!el) return;
        var knInput = el.closest('.kn-input');
        if (!knInput) return;
        var asset = knInput.querySelector('.kn-asset-current');
        if (asset) $(asset).hide();
      }

      function checkExistingUpload() {
        var el = document.getElementById(inputFieldId);
        if (!el) return;
        var knInput = el.closest('.kn-input');
        if (!knInput) return;
        var asset = knInput.querySelector('.kn-asset-current');
        var filename = getFilenameFromAsset(asset);

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
      var el = document.getElementById(inputFieldId);
      var knInput = el ? el.closest('.kn-input') : null;
      var observeTarget = knInput ? knInput.querySelector('.kn-asset-current') : null;

      if (observeTarget) {
        var observer = new MutationObserver(function () {
          var asset = knInput.querySelector('.kn-asset-current');
          var filename = getFilenameFromAsset(asset);

          if (filename) {
            if (existingFilename && filename !== existingFilename) {
              setUploadMessage(existingFilename, filename, 'uploading-replacement');
            } else if (!existingFilename) {
              setUploadMessage('', filename, 'uploading-new');
            } else {
              existingFilename = filename;
              setUploadMessage(filename);
            }
          } else {
            setUploadMessage('', '', 'empty');
          }
          hideAssetCurrent();
        });

        observer.observe(observeTarget, { childList: true, subtree: true });
      }
    });
  }

  // ── View configs: viewId → upload field IDs ──
  var VIEW_CONFIGS = [
    { viewId: 'view_3094', fields: ['field_1808_upload', 'field_1809_upload'] },
    { viewId: 'view_3297', fields: ['field_1808_upload', 'field_1809_upload', 'field_1930_upload'] }
  ];

  VIEW_CONFIGS.forEach(function (cfg) {
    $(document).on('knack-view-render.' + cfg.viewId, function () {
      enhanceUploadFields(cfg.fields);
    });
  });
})();

/***************************** /SURVEY / PROJECT FORM: drag + drop Upload fields *******************/
