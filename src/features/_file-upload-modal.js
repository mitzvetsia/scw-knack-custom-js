/*** FILE UPLOAD MODAL — shared uploader (drop zone → file chip → Upload) ***
 *
 * One modal for every "attach a file to a record" gesture in the bundle, so
 * they all look and behave the same. The design is the agreement uploader
 * from acceptance-card.js: the file already on record (linked) → a drop zone
 * / click-to-browse → the chosen file as a chip (name + size + × to change)
 * → Cancel | Upload. Nothing happens until the single Upload button; there is
 * no separate "choose" step to explain.
 *
 * The caller owns the actual upload + save (onUpload returns a promise); the
 * modal owns choosing, validating, progress and error states.
 *
 *   SCW.fileUploadModal.open({
 *     title:    'Sub bid PDF',
 *     accept:   'application/pdf,.pdf',        // <input accept>
 *     current:  { name, href } | null,         // file already on record
 *     hint:     'optional line under the zone',
 *     okLabel:  'Upload',
 *     validate: function (file) { return ''; } // or an error message
 *     onUpload: function (file, say) { return Promise; }
 *               // say(msg) writes the progress line; resolve → the modal
 *               // closes; reject(err) → the error shows, Upload re-enables
 *   }) → { close, setFile, backdrop }
 ****************************************************************************/
(function () {
  'use strict';

  window.SCW = window.SCW || {};
  if (window.SCW.fileUploadModal) return;

  var STYLE_ID = 'scw-file-upload-modal-css';
  var FILE_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
  var UPLOAD_SVG =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>' +
    '<polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.scw-fum-backdrop { position: fixed; inset: 0; background: rgba(15,23,42,.55);',
      '  z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 18px; }',
      '.scw-fum { background: #fff; color: #0f172a; border-radius: 10px; width: 100%;',
      '  max-width: 420px; box-shadow: 0 20px 50px rgba(0,0,0,.35); overflow: hidden;',
      '  font: 13px/1.45 system-ui, -apple-system, sans-serif; }',
      '.scw-fum__head { padding: 12px 16px; background: #0f4c75; color: #fff;',
      '  font-weight: 700; font-size: 13.5px; }',
      '.scw-fum__body { padding: 14px 16px; }',
      '.scw-fum__hint { margin: 0 0 12px; color: #475569; font-size: 12.5px; line-height: 1.45; }',
      '.scw-fum__status { margin-top: 10px; font-weight: 600; color: #0f4c75; }',
      '.scw-fum__status.is-err { color: #be123c; }',
      '.scw-fum__foot { padding: 11px 16px; border-top: 1px solid #e2e8f0;',
      '  display: flex; justify-content: flex-end; gap: 8px; background: #f8fafc; }',
      '.scw-fum__btn { padding: 7px 14px; border-radius: 5px; cursor: pointer;',
      '  font: 600 12.5px/1.2 system-ui, sans-serif; border: 1px solid transparent; }',
      '.scw-fum__btn--cancel { background: #fff; color: #475569; border-color: #cbd5e1; }',
      '.scw-fum__btn--ok { background: #0f4c75; color: #fff; }',
      '.scw-fum__btn--ok:disabled { background: #cbd5e1; cursor: not-allowed; }',
      /* Current file on record */
      '.scw-fum-cur { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }',
      '.scw-fum-cur__cap { font: 700 9.5px/1 system-ui, sans-serif; letter-spacing: .08em;',
      '  text-transform: uppercase; color: #94a3b8; }',
      '.scw-fum-cur__file { display: flex; align-items: center; gap: 8px;',
      '  padding: 10px 12px; border: 1px solid #bbf7d0; border-radius: 9px;',
      '  background: #f0fdf4; color: #15803d !important;',
      '  font: 600 12.5px/1.3 system-ui, sans-serif; text-decoration: none !important; }',
      '.scw-fum-cur__file svg { flex: none; color: #16a34a; }',
      '.scw-fum-cur__nm { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }',
      '.scw-fum-cur__hint { flex: none; font: 500 11px/1 system-ui, sans-serif; color: #4ade80; }',
      'a.scw-fum-cur__file:hover .scw-fum-cur__hint { color: #15803d; }',
      /* Drop zone and the chosen-file chip are the same slot in two states */
      '.scw-fum-drop { display: flex; flex-direction: column; align-items: center;',
      '  justify-content: center; gap: 4px; padding: 22px 14px; cursor: pointer;',
      '  border: 2px dashed #cbd5e1; border-radius: 9px; background: #f8fafc;',
      '  color: #64748b; text-align: center;',
      '  transition: border-color .12s, background .12s, color .12s; }',
      '.scw-fum-drop:hover, .scw-fum-drop:focus-visible { border-color: #0f4c75;',
      '  color: #0f4c75; background: #f1f5f9; outline: none; }',
      '.scw-fum-drop.is-over { border-color: #0f4c75; background: #e6f0f7;',
      '  color: #0f4c75; border-style: solid; }',
      '.scw-fum-drop[hidden] { display: none; }',
      '.scw-fum-drop svg { color: inherit; }',
      '.scw-fum-drop__t { font: 600 13px/1.3 system-ui, sans-serif; }',
      '.scw-fum-drop__s { font: 500 11.5px/1.3 system-ui, sans-serif; color: #94a3b8; }',
      '.scw-fum-file { display: flex; align-items: center; gap: 8px;',
      '  padding: 10px 10px 10px 12px; border: 1px solid #bbf7d0; border-radius: 9px;',
      '  background: #f0fdf4; color: #15803d; font: 600 12.5px/1.3 system-ui, sans-serif; }',
      '.scw-fum-file[hidden] { display: none; }',
      '.scw-fum-file svg { flex: none; color: #16a34a; }',
      '.scw-fum-file__nm { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }',
      '.scw-fum-file__sz { flex: none; font-weight: 500; color: #4ade80; }',
      '.scw-fum-file__x { flex: none; border: none; background: transparent;',
      '  color: #15803d; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px;',
      '  opacity: .6; }',
      '.scw-fum-file__x:hover { opacity: 1; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function fmtSize(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function open(opts) {
    opts = opts || {};
    injectCss();
    var current = opts.current && (opts.current.name || opts.current.href) ? opts.current : null;
    var okLabel = opts.okLabel || 'Upload';

    var backdrop = document.createElement('div');
    backdrop.className = 'scw-fum-backdrop';
    backdrop.innerHTML =
      '<div class="scw-fum" role="dialog" aria-modal="true">' +
        '<div class="scw-fum__head"></div>' +
        '<div class="scw-fum__body">' +
          (opts.hint ? '<p class="scw-fum__hint">' + esc(opts.hint) + '</p>' : '') +
          (current
            ? '<div class="scw-fum-cur">' +
                '<div class="scw-fum-cur__cap">Current file</div>' +
                (current.href
                  ? '<a class="scw-fum-cur__file" target="_blank" rel="noopener" href="' + esc(current.href) + '" ' +
                       'title="Open ' + esc(current.name || 'file') + ' in a new tab">' +
                      FILE_SVG + '<span class="scw-fum-cur__nm">' + esc(current.name || 'file') + '</span>' +
                      '<span class="scw-fum-cur__hint">view</span>' +
                    '</a>'
                  : '<span class="scw-fum-cur__file">' + FILE_SVG +
                      '<span class="scw-fum-cur__nm">' + esc(current.name || 'file') + '</span></span>') +
              '</div>'
            : '') +
          '<div class="scw-fum-drop" tabindex="0" role="button" ' +
               'aria-label="' + (current ? 'Drop a replacement here or click to browse'
                                         : 'Drop a file here or click to browse') + '">' +
            UPLOAD_SVG +
            '<div class="scw-fum-drop__t">' + (current ? 'Drop a replacement here' : 'Drop the file here') + '</div>' +
            '<div class="scw-fum-drop__s">or click to browse</div>' +
          '</div>' +
          '<div class="scw-fum-file" hidden>' +
            FILE_SVG +
            '<span class="scw-fum-file__nm"></span>' +
            '<span class="scw-fum-file__sz"></span>' +
            '<button type="button" class="scw-fum-file__x" title="Choose a different file">&times;</button>' +
          '</div>' +
          '<div class="scw-fum__status" style="display:none"></div>' +
        '</div>' +
        '<div class="scw-fum__foot">' +
          '<button type="button" class="scw-fum__btn scw-fum__btn--cancel">Cancel</button>' +
          '<button type="button" class="scw-fum__btn scw-fum__btn--ok" disabled></button>' +
        '</div>' +
      '</div>';
    backdrop.querySelector('.scw-fum__head').textContent = opts.title || 'Upload a file';

    var body   = backdrop.querySelector('.scw-fum__body');
    var drop   = backdrop.querySelector('.scw-fum-drop');
    var chip   = backdrop.querySelector('.scw-fum-file');
    var chipNm = backdrop.querySelector('.scw-fum-file__nm');
    var chipSz = backdrop.querySelector('.scw-fum-file__sz');
    var chipX  = backdrop.querySelector('.scw-fum-file__x');
    var status = backdrop.querySelector('.scw-fum__status');
    var ok     = backdrop.querySelector('.scw-fum__btn--ok');
    var cancel = backdrop.querySelector('.scw-fum__btn--cancel');
    ok.textContent = okLabel;

    // Hidden native input — the drop zone's click/keyboard path.
    var input = document.createElement('input');
    input.type = 'file';
    if (opts.accept) input.accept = opts.accept;
    input.style.display = 'none';
    body.appendChild(input);

    var chosen = null, busy = false;

    function close() { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }
    function say(msg) {
      status.style.display = msg ? '' : 'none';
      status.classList.remove('is-err');
      status.textContent = msg || '';
    }
    function fail(msg) {
      status.style.display = '';
      status.classList.add('is-err');
      status.textContent = msg;
      busy = false;
      ok.disabled = !chosen;
      ok.textContent = okLabel;
      cancel.disabled = false;
    }
    function setFile(file) {
      if (file && typeof opts.validate === 'function') {
        var problem = '';
        try { problem = opts.validate(file) || ''; } catch (e) { problem = ''; }
        if (problem) { input.value = ''; fail(problem); return; }
      }
      chosen = file || null;
      if (!chosen) {
        chip.hidden = true;
        drop.hidden = false;
      } else {
        chipNm.textContent = chosen.name || 'file';
        chipSz.textContent = fmtSize(chosen.size);
        chip.hidden = false;
        drop.hidden = true;        // the chip IS the state — no duplicate zone
        say('');
      }
      ok.disabled = !chosen;
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () { setFile(input.files && input.files[0]); });
    chipX.addEventListener('click', function () {
      if (busy) return;
      input.value = '';
      setFile(null);
    });

    // Drag + drop. dragover MUST preventDefault or the browser navigates to
    // the file instead of firing drop.
    ['dragenter', 'dragover'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.add('is-over');
      });
    });
    ['dragleave', 'dragend'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        drop.classList.remove('is-over');
      });
    });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); e.stopPropagation();
      drop.classList.remove('is-over');
      var dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length) setFile(dt.files[0]);
    });
    // A miss anywhere else in the modal must not hand the page to the file.
    ['dragover', 'drop'].forEach(function (evt) {
      backdrop.addEventListener(evt, function (e) {
        if (drop.contains(e.target)) return;
        e.preventDefault();
      });
    });

    cancel.addEventListener('click', function () { if (!busy) close(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop && !busy) close(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key !== 'Escape') return;
      if (!backdrop.parentNode) { document.removeEventListener('keydown', onKey); return; }
      if (!busy) { close(); document.removeEventListener('keydown', onKey); }
    });

    ok.addEventListener('click', function () {
      if (!chosen || busy || typeof opts.onUpload !== 'function') return;
      busy = true;
      ok.disabled = true;
      ok.textContent = 'Uploading…';
      cancel.disabled = true;
      say('Uploading ' + (chosen.name || 'file') + '…');
      var p;
      try { p = opts.onUpload(chosen, say); } catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(function () {
        busy = false;
        close();
      }, function (err) {
        var msg = (err && err.message) ? err.message
          : (err && err.status ? 'HTTP ' + err.status : String(err || 'upload failed'));
        fail('Upload failed — ' + msg + '. Try again.');
      });
    });

    document.body.appendChild(backdrop);
    setTimeout(function () { try { drop.focus(); } catch (e) { /* ignore */ } }, 20);
    return { close: close, setFile: setFile, backdrop: backdrop };
  }

  window.SCW.fileUploadModal = { open: open };
})();
/*** END FILE UPLOAD MODAL ****************************************************/
