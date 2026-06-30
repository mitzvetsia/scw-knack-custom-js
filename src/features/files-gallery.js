/*** FILES / PHOTOS GALLERY *************************************************
 *
 * Turns a file/photo-list table into a thumbnail GALLERY. Each row becomes a
 * card with an image thumbnail (or a PDF / generic-file tile for non-image
 * File fields), chips, and a notes caption. Clicking opens the asset in a new
 * tab. Raw table tables only show filename links / tiny thumbs; a gallery is
 * far easier to scan.
 *
 * Config-driven over multiple views (VIEWS):
 *   - view_3531 "Site Maps & Other Files" — Knack FILE field (field_68); ext-
 *     sniffed so PDFs get a file tile. Type (field_67) chip + Notes (field_588).
 *   - view_3530 "Additional Photos" — Knack IMAGE field (field_771; always an
 *     image). BID (field_2420) + Line Items (field_2419) connection chips +
 *     Notes (field_114).
 *
 * The original table is kept in the DOM (display:none) for the Knack model +
 * native links + inline edit; a persisted "Table view" toggle restores it.
 ***************************************************************************/
(function () {
  'use strict';

  var STYLE_ID = 'scw-files-gallery-css';
  var EVENT_NS = '.scwFilesGallery';
  var MODE_LS  = 'scwFilesGalleryMode';   // 'gallery' | 'table' (shared)

  // Per-view configs. kind:'file' = Knack File field (PDF/image, ext-sniffed);
  // kind:'image' = Knack Image field (always rendered as an image).
  var VIEWS = [
    {
      id: 'view_3531', kind: 'file',
      media: 'field_68', type: 'field_67', notes: 'field_588',
      empty: 'No files yet.'
    },
    {
      id: 'view_3530', kind: 'image',
      media: 'field_771', notes: 'field_114',
      chips: [
        { key: 'field_2420', cls: 'bid' },    // BID
        { key: 'field_2419', cls: 'line' }     // Line Items
      ],
      empty: 'No photos yet.'
    }
  ];

  function cfgFor(viewId) {
    for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i].id === viewId) return VIEWS[i];
    return null;
  }

  // ── reads ───────────────────────────────────────────────────
  function rowAttrs(viewId, tr) {
    try {
      var id = tr && tr.id;
      if (!id) return null;
      var v = Knack && Knack.views && Knack.views[viewId];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return null;
      for (var i = 0; i < models.length; i++) {
        if (models[i].id === id) return models[i].attributes;
      }
    } catch (e) {}
    return null;
  }
  function stripTags(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  // Display value for type / notes / connection chips. Connection fields carry a
  // _raw ARRAY of {id, identifier} — join the identifiers; plain fields use the
  // scalar _raw or the cell text.
  function disp(tr, attrs, fk) {
    if (attrs) {
      var rawv = attrs[fk + '_raw'];
      if (Array.isArray(rawv)) {
        var ids = [];
        for (var k = 0; k < rawv.length; k++) {
          var it = rawv[k];
          if (it && typeof it === 'object') ids.push(String(it.identifier != null ? it.identifier : (it.id || '')));
          else if (it != null) ids.push(String(it));
        }
        if (ids.length) return ids.join(', ');
      } else if (rawv != null && typeof rawv !== 'object') {
        return String(rawv);
      }
      var v = attrs[fk];
      if (v != null && typeof v !== 'object') return stripTags(v);
    }
    var td = tr && tr.querySelector('td.' + fk + ', td[data-field-key="' + fk + '"]');
    return td ? stripTags(td.textContent) : '';
  }
  // Media (File or Image field) → {url, filename}. File fields store an object
  // {url, filename}; image fields may store an object OR a bare URL string. The
  // DOM link's href is an in-app route (not a usable <img> src), so prefer raw.
  function mediaRaw(attrs, cfg) {
    if (!attrs) return null;
    var raw = attrs[cfg.media + '_raw'];
    if (raw == null) return null;
    if (Array.isArray(raw)) raw = raw[0];
    if (raw && typeof raw === 'object') {
      return { url: raw.url || raw.thumb_url || '', filename: raw.filename || '' };
    }
    if (typeof raw === 'string') return { url: raw, filename: '' };
    return null;
  }
  function extOf(name) {
    var m = /\.([a-z0-9]+)\s*$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  }
  function isImageExt(e) { return /^(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/.test(e); }
  function isPdfExt(e)   { return e === 'pdf'; }

  // ── card ────────────────────────────────────────────────────
  function fileIcon(kind) {
    var paths = {
      pdf:  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
            '<polyline points="14 2 14 8 20 8"/>',
      file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>' +
            '<polyline points="13 2 13 9 20 9"/>'
    };
    return '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" ' +
      'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (paths[kind] || paths.file) + '</svg>';
  }

  function buildCard(cfg, tr) {
    var attrs = rowAttrs(cfg.id, tr);
    var link  = tr.querySelector('a.kn-view-asset');
    var assetHref = link ? (link.getAttribute('href') || '') : '';
    var mr = mediaRaw(attrs, cfg);
    var fileName = (mr && mr.filename) || (link && link.getAttribute('data-file-name')) ||
                   (link && stripTags(link.textContent)) || '';
    var directUrl = (mr && mr.url) || '';
    // Image-field fallback: the rendered thumbnail <img> in the cell.
    if (!directUrl) {
      var imgEl = tr.querySelector('td.' + cfg.media + ' img, td[data-field-key="' + cfg.media + '"] img');
      if (imgEl) directUrl = imgEl.getAttribute('src') || '';
    }
    var href = directUrl || assetHref;

    var notes = disp(tr, attrs, cfg.notes);
    var e = extOf(fileName);
    var treatAsImage = (cfg.kind === 'image') || (directUrl && isImageExt(e));

    var thumb;
    if (directUrl && treatAsImage) {
      thumb = '<span class="scw-gallery-thumb"><img class="scw-gallery-img" loading="lazy" ' +
        'src="' + esc(directUrl) + '" alt="' + esc(fileName || 'Photo') + '"></span>';
    } else {
      var kind = isPdfExt(e) ? 'pdf' : 'file';
      thumb = '<span class="scw-gallery-thumb scw-gallery-thumb--icon scw-gallery-thumb--' + kind + '">' +
        fileIcon(kind) + '<span class="scw-gallery-ext">' + esc(e ? e.toUpperCase() : 'FILE') + '</span></span>';
    }

    // Chips: a single Type chip (file gallery) or one chip per configured
    // connection field (photo gallery).
    var chips = '';
    if (cfg.type) {
      var type = disp(tr, attrs, cfg.type);
      if (type) chips += '<span class="scw-gallery-type scw-gallery-type--' +
        (/site\s*plan/i.test(type) ? 'plan' : 'other') + '">' + esc(type) + '</span>';
    }
    if (cfg.chips) {
      for (var c = 0; c < cfg.chips.length; c++) {
        var val = disp(tr, attrs, cfg.chips[c].key);
        if (val) chips += '<span class="scw-gallery-type scw-gallery-type--' + cfg.chips[c].cls + '">' +
          esc(val) + '</span>';
      }
    }

    var titleAttr = (fileName || 'Photo') + (notes ? ' — ' + notes : '');
    var meta =
      (fileName ? '<span class="scw-gallery-name">' + esc(fileName) + '</span>' : '') +
      (chips || notes
        ? '<span class="scw-gallery-sub">' + chips +
            (notes ? '<span class="scw-gallery-notes">' + esc(notes) + '</span>' : '') + '</span>'
        : '');

    var a = document.createElement('a');
    a.className = 'scw-gallery-card';
    if (href) { a.setAttribute('href', href); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
    a.setAttribute('title', titleAttr);
    a.innerHTML = thumb + (meta ? '<span class="scw-gallery-meta">' + meta + '</span>' : '');
    return a;
  }

  // ── transform ───────────────────────────────────────────────
  function currentMode() {
    try { return localStorage.getItem(MODE_LS) === 'table' ? 'table' : 'gallery'; }
    catch (e) { return 'gallery'; }
  }
  function applyMode(view, mode) {
    view.classList.toggle('scw-files-gallery-on', mode !== 'table');
    var btn = view.querySelector('.scw-files-gallery-toggle');
    if (btn) btn.textContent = (mode === 'table') ? '▦ Gallery view' : '▤ Table view';
  }
  function ensureChrome(view, wrapper) {
    if (!view.querySelector('.scw-files-gallery-toolbar')) {
      var toolbar = document.createElement('div');
      toolbar.className = 'scw-files-gallery-toolbar';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-files-gallery-toggle';
      btn.addEventListener('click', function () {
        var mode = view.classList.contains('scw-files-gallery-on') ? 'table' : 'gallery';
        try { localStorage.setItem(MODE_LS, mode); } catch (e) {}
        applyMode(view, mode);
      });
      toolbar.appendChild(btn);
      wrapper.parentNode.insertBefore(toolbar, wrapper);
    }
    var grid = view.querySelector('.scw-gallery');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'scw-gallery';
      wrapper.parentNode.insertBefore(grid, wrapper);
    }
    return grid;
  }

  function transform(cfg) {
    var view = document.getElementById(cfg.id);
    if (!view) return;
    var table = view.querySelector('table.kn-table-table');
    var wrapper = view.querySelector('.kn-table-wrapper');
    if (!table || !wrapper) return;

    var grid = ensureChrome(view, wrapper);
    var rows = table.querySelectorAll('tbody tr[id]');
    var frag = document.createDocumentFragment();
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.classList.contains('kn-tr-nodata')) continue;
      if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
      frag.appendChild(buildCard(cfg, tr));
      n++;
    }
    grid.innerHTML = '';
    if (n === 0) {
      var empty = document.createElement('div');
      empty.className = 'scw-gallery-empty';
      empty.textContent = cfg.empty || 'Nothing here yet.';
      grid.appendChild(empty);
    } else {
      grid.appendChild(frag);
    }
    applyMode(view, currentMode());
  }

  // ── styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var ACC = 'var(--scw-accent, #2f5f91)';
    var viewScoped = [];
    for (var i = 0; i < VIEWS.length; i++) {
      var id = VIEWS[i].id;
      viewScoped.push('#' + id + '.scw-files-gallery-on .kn-table-wrapper { display: none !important; }');
      viewScoped.push('#' + id + '.scw-files-gallery-on .kn-records-nav { display: none !important; }');
      viewScoped.push('#' + id + ':not(.scw-files-gallery-on) .scw-gallery { display: none !important; }');
    }
    var css = viewScoped.concat([
      '.scw-files-gallery-toolbar { display: flex; justify-content: flex-end; margin: 0 0 10px; }',
      '.scw-files-gallery-toggle { background: #fff; border: 1px solid #cbd5e1; color: #475569;',
      '  border-radius: 6px; padding: 4px 10px; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }',
      '.scw-files-gallery-toggle:hover { background: #f1f5f9; }',

      '.scw-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));',
      '  gap: 14px; padding: 2px; }',
      '.scw-gallery-empty { padding: 24px; text-align: center; color: #94a3b8; background: #fff;',
      '  border: 1px dashed #cbd5e1; border-radius: 10px; font: 500 14px/1.4 system-ui, sans-serif; }',

      /* card */
      '.scw-gallery-card { display: flex; flex-direction: column; background: #fff;',
      '  border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; text-decoration: none;',
      '  color: inherit; box-shadow: 0 1px 2px rgba(15,23,42,.04); transition: box-shadow .15s, transform .15s, border-color .15s;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
      '.scw-gallery-card:hover { box-shadow: 0 6px 18px rgba(15,23,42,.12); transform: translateY(-2px);',
      '  border-color: ' + ACC + '; }',

      /* thumbnail (fixed aspect) */
      '.scw-gallery-thumb { display: flex; align-items: center; justify-content: center;',
      '  aspect-ratio: 4 / 3; background: #f1f5f9; overflow: hidden; }',
      '@supports not (aspect-ratio: 1) { .scw-gallery-thumb { height: 140px; } }',
      '.scw-gallery-img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.scw-gallery-thumb--icon { flex-direction: column; gap: 6px; color: #94a3b8; }',
      '.scw-gallery-thumb--pdf { background: #fef2f2; color: #dc2626; }',
      '.scw-gallery-ext { font: 800 11px/1 system-ui, sans-serif; letter-spacing: .5px; }',

      /* meta */
      '.scw-gallery-meta { display: flex; flex-direction: column; gap: 5px; padding: 9px 11px 11px; }',
      '.scw-gallery-name { font-size: 12.5px; font-weight: 600; color: #0f172a; line-height: 1.3;',
      '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.scw-gallery-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }',
      '.scw-gallery-type { font: 700 10px/1 system-ui, sans-serif; text-transform: uppercase;',
      '  letter-spacing: .3px; padding: 3px 7px; border-radius: 999px; white-space: nowrap; }',
      '.scw-gallery-type--plan { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }',
      '.scw-gallery-type--other { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }',
      '.scw-gallery-type--bid { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }',
      '.scw-gallery-type--line { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }',
      /* notes caption — clamp to two lines so longer captions stay readable */
      '.scw-gallery-notes { font-size: 11.5px; color: #64748b; line-height: 1.35; min-width: 0;',
      '  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }'
    ]).join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── bindings ────────────────────────────────────────────────
  function bindView(cfg) {
    if (window.SCW && typeof SCW.onViewRender === 'function') {
      SCW.onViewRender(cfg.id, function () { setTimeout(function () { transform(cfg); }, 120); }, EVENT_NS);
    } else {
      $(document)
        .off('knack-view-render.' + cfg.id + EVENT_NS)
        .on('knack-view-render.' + cfg.id + EVENT_NS, function () { setTimeout(function () { transform(cfg); }, 120); });
    }
  }

  injectStyles();
  for (var v = 0; v < VIEWS.length; v++) {
    bindView(VIEWS[v]);
    if (document.getElementById(VIEWS[v].id)) {
      (function (cfg) { setTimeout(function () { transform(cfg); }, 150); })(VIEWS[v]);
    }
  }
})();
/*** END FILES / PHOTOS GALLERY *********************************************/
