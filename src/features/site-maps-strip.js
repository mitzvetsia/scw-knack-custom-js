/*** SITE MAPS STRIP (deploy pages) ******************************************
 *
 * docs/deploy-page-redesign.md, Phase I. Site plans and coverage maps sit
 * in a strip directly under the stage tiles, always visible — PMs need the
 * maps in their face. Each map: thumbnail, caption, Open (the file in a new
 * tab) and Pop out (a small viewer page in its own browser window, so the
 * map can live on a second monitor at any size; PDFs just open in a tab).
 *
 * Data: a hidden DOC_files grid on the scene filtered to doc type
 * "Site Plan" (Builder TODO — set `mapsView` below when it exists). Until
 * then the strip renders nothing and the "Also on this project" list keeps
 * its compact row layout. Phase II (zoom-to-item) is deferred to the
 * floorplan application.
 ****************************************************************************/
(function () {
  'use strict';

  // The scene's "Other Files" DOC_files grid: every file on the project.
  // Site plans are picked out by TYPE — FLAG_doc type (field_67, has the
  // "Site Plan" choice) when that column is on the grid, else the
  // CONFIG_file type name (field_2877), else the filename as a last resort.
  // A Knack view model only carries the grid's columns, so adding field_67
  // (and field_754, the image variant of a map) to view_3942 is the one
  // Builder step; both columns can stay hidden.
  var SCENES = [
    { sceneId: 'scene_1311',
      mapsView: 'view_3942',
      fields: { file: 'field_68', image: 'field_754', type: 'field_67', typeAlt: 'field_2877', notes: 'field_588' } },
    { sceneId: 'scene_1353',
      mapsView: 'view_4063',
      fields: { file: 'field_68', image: 'field_754', type: 'field_67', typeAlt: 'field_2877', notes: 'field_588' } }
  ];
  var MAP_TYPE = /site\s*plan|site\s*map|coverage|floor\s*plan/i;
  var MAP_FILE = /site[-_ ]?(plan|map)|coverage|floor[-_ ]?plan/i;
  var STRIP_ID = 'scw-site-maps';
  var STYLE_ID = 'scw-site-maps-css';
  var EVENT_NS = '.scwSiteMaps';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '#' + STRIP_ID + ' {',
      '  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 16px 14px;',
      '  display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box;',
      '  font: 13px/1.4 system-ui, sans-serif; color: #0f172a;',
      '}',
      '.scw-maps__head { display: flex; align-items: center; gap: 10px; }',
      '.scw-maps__title { margin: 0; font: 700 13px/1.2 system-ui, sans-serif; }',
      '.scw-maps__sub { font-size: 12px; color: #475569; }',
      '.scw-maps__tiles { display: flex; gap: 12px; flex-wrap: wrap; }',
      '.scw-maps__tile { width: 300px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; }',
      '.scw-maps__thumb { display: block; height: 128px; background: #eef2f6; text-decoration: none; overflow: hidden; }',
      '.scw-maps__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }',
      '.scw-maps__thumb--file { display: flex; align-items: center; justify-content: center; color: #475569; font-weight: 700; font-size: 12px; gap: 8px; }',
      '.scw-maps__foot { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-top: 1px solid #e2e8f0; }',
      '.scw-maps__name { font-weight: 600; font-size: 12.5px; flex: 1 1 auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.scw-maps__btn {',
      '  display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 6px;',
      '  border: 1px solid #dbe4ee; background: #fff; color: #163C6E; font: 600 11.5px/1.2 system-ui, sans-serif;',
      '  cursor: pointer; text-decoration: none; white-space: nowrap;',
      '}',
      '.scw-maps__btn:hover { background: #eaf1f7; }',
      '.scw-maps__empty { font-size: 12.5px; color: #64748b; }'
    ].join('\n');
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function plain(v) {
    return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
  function activeScene() {
    for (var i = 0; i < SCENES.length; i++) {
      if (document.getElementById('kn-' + SCENES[i].sceneId)) return SCENES[i];
    }
    return null;
  }
  function records(viewId) {
    var v = (typeof Knack !== 'undefined' && Knack.views) ? Knack.views[viewId] : null;
    var models = v && v.model && v.model.data && v.model.data.models;
    if (!models || !models.length) return [];
    return models.map(function (m) { return m.attributes || (m.toJSON ? m.toJSON() : m); });
  }
  function fileOf(raw, formatted) {
    if (raw && typeof raw === 'object') {
      return { url: raw.url || '', thumb: raw.thumb_url || '', name: raw.filename || '' };
    }
    var m = String(formatted || '').match(/href="([^"]+)"/);
    return { url: m ? m[1] : '', thumb: '', name: '' };
  }
  function isImage(url) { return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url || ''); }

  function has(rec, fk) {
    return Object.prototype.hasOwnProperty.call(rec, fk) || Object.prototype.hasOwnProperty.call(rec, fk + '_raw');
  }
  function typeText(rec, fk) {
    var raw = rec[fk + '_raw'];
    if (Array.isArray(raw)) return raw.map(function (r) { return r.identifier || ''; }).join(', ');
    if (raw && typeof raw === 'object' && raw.identifier) return raw.identifier;
    return plain(rec[fk]);
  }
  /** Is this DOC record a site plan / coverage map? Type wins; filename is
   *  the fallback only when no type column is on the grid at all. */
  function isMap(rec, F, file) {
    if (has(rec, F.type))    return MAP_TYPE.test(typeText(rec, F.type));
    if (has(rec, F.typeAlt)) return MAP_TYPE.test(typeText(rec, F.typeAlt));
    return MAP_FILE.test(file.name || file.url);
  }
  function maps(cfg) {
    var F = cfg.fields, out = [];
    records(cfg.mapsView).forEach(function (rec) {
      var img = fileOf(rec[F.image + '_raw'], rec[F.image]);
      var file = fileOf(rec[F.file + '_raw'], rec[F.file]);
      var url = img.url || file.url;
      if (!url) return;
      if (!isMap(rec, F, img.url ? img : file)) return;
      var name = plain(rec[F.notes]) || img.name || file.name || 'Site plan';
      out.push({ id: rec.id, url: url, thumb: img.thumb || (isImage(url) ? url : ''), name: name, image: isImage(url) });
    });
    return out;
  }

  // Pop-out viewer: a plain page in its own window (images). Zoom/fit only —
  // Phase II (zoom-to-item) is the floorplan app's job.
  function popOut(map) {
    if (!map.image) { window.open(map.url, '_blank', 'noopener'); return; }
    var w = window.open('', 'scw-map-' + map.id, 'width=1100,height=800,resizable=yes,scrollbars=yes');
    if (!w) { window.open(map.url, '_blank', 'noopener'); return; }
    var title = esc(map.name) + ' · ' + esc(plain((document.querySelector('.kn-scene h1') || {}).textContent) || 'Site map');
    w.document.open();
    w.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>' + title + '</title>' +
      '<style>body{margin:0;font:13px/1.4 system-ui,sans-serif;background:#eef2f6;color:#0f172a;display:flex;flex-direction:column;height:100vh}' +
      'header{display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-bottom:1px solid #e2e8f0;flex:none}' +
      'header b{margin-right:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      'button,a.btn{height:30px;padding:0 10px;border:1px solid #dbe4ee;border-radius:6px;background:#fff;color:#163C6E;font:600 12px/1 system-ui,sans-serif;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}' +
      '#z{min-width:44px;text-align:center;color:#475569}main{flex:1 1 auto;overflow:auto;padding:16px}img{display:block;transform-origin:0 0;box-shadow:0 2px 12px rgba(15,23,42,.12);background:#fff}</style></head><body>' +
      '<header><b>' + title + '</b><button id="m">−</button><span id="z">100%</span><button id="p">+</button><button id="f">Fit</button><button id="o">100%</button>' +
      '<a class="btn" href="' + esc(map.url) + '" target="_blank" rel="noopener">Open original</a></header>' +
      '<main><img id="i" src="' + esc(map.url) + '" alt="' + esc(map.name) + '"></main>' +
      '<script>(function(){var i=document.getElementById("i"),z=document.getElementById("z"),s=1;function ap(){i.style.width=(i.naturalWidth*s)+"px";z.textContent=Math.round(s*100)+"%";}' +
      'function fit(){var m=document.querySelector("main");s=Math.min((m.clientWidth-32)/i.naturalWidth,(m.clientHeight-32)/i.naturalHeight,4);ap();}' +
      'document.getElementById("p").onclick=function(){s=Math.min(s*1.25,8);ap();};document.getElementById("m").onclick=function(){s=Math.max(s/1.25,.1);ap();};' +
      'document.getElementById("f").onclick=fit;document.getElementById("o").onclick=function(){s=1;ap();};' +
      'if(i.complete)fit();else i.onload=fit;window.onresize=fit;})();<\/script></body></html>');
    w.document.close();
  }

  function render(cfg) {
    var nav = document.getElementById('scw-deploy-nav');
    var row2 = nav && nav.querySelector('.scw-deploy-row2');
    var slot = row2 && row2.querySelector('.scw-deploy-maps-slot');
    if (!slot) return;
    var list = cfg.mapsView && document.getElementById(cfg.mapsView) ? maps(cfg) : null;
    if (!list || !list.length) {   // no grid, or no site plan on this project → no strip
      if (slot.firstChild) slot.innerHTML = '';
      row2.classList.remove('has-maps');
      return;
    }
    var sig = list.map(function (m) { return m.id + ':' + m.url + ':' + m.name; }).join('|');
    var strip = document.getElementById(STRIP_ID);
    if (strip && strip.getAttribute('data-scw-sig') === sig) { row2.classList.add('has-maps'); return; }
    if (!strip) {
      strip = document.createElement('div');
      strip.id = STRIP_ID;
      slot.appendChild(strip);
    }
    strip.setAttribute('data-scw-sig', sig);
    var tiles = list.map(function (m) {
      var thumb = m.thumb
        ? '<a class="scw-maps__thumb" href="' + esc(m.url) + '" target="_blank" rel="noopener" aria-label="Open ' + esc(m.name) + '"><img src="' + esc(m.thumb) + '" alt="" loading="lazy"></a>'
        : '<a class="scw-maps__thumb scw-maps__thumb--file" href="' + esc(m.url) + '" target="_blank" rel="noopener">PDF · open</a>';
      return '<div class="scw-maps__tile" data-map-id="' + esc(m.id) + '">' + thumb +
        '<div class="scw-maps__foot"><span class="scw-maps__name" title="' + esc(m.name) + '">' + esc(m.name) + '</span>' +
        '<button type="button" class="scw-maps__btn" data-map-pop="' + esc(m.id) + '">Pop out</button></div></div>';
    }).join('');
    strip.innerHTML =
      '<div class="scw-maps__head"><h2 class="scw-maps__title">Site maps &amp; coverage</h2>' +
        '<span class="scw-maps__sub">' + list.length + (list.length === 1 ? ' plan' : ' plans') + ' · click to open, or pop one out into its own window</span></div>' +
      (tiles ? '<div class="scw-maps__tiles">' + tiles + '</div>' : '<div class="scw-maps__empty">No site plan on this project yet.</div>');
    strip.onclick = function (e) {
      var b = e.target.closest && e.target.closest('[data-map-pop]');
      if (!b) return;
      var id = b.getAttribute('data-map-pop');
      for (var i = 0; i < list.length; i++) if (list[i].id === id) { popOut(list[i]); break; }
    };
    row2.classList.add('has-maps');
  }

  var _timer = null;
  function scheduleApply(delay) {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(function () {
      _timer = null;
      var cfg = activeScene();
      if (!cfg) return;
      injectStyles();
      try { render(cfg); } catch (e) { /* strip is optional chrome */ }
    }, delay == null ? 300 : delay);
  }
  for (var s = 0; s < SCENES.length; s++) {
    $(document).on('knack-scene-render.' + SCENES[s].sceneId + EVENT_NS, function () { scheduleApply(400); });
    if (SCENES[s].mapsView) {
      $(document).on('knack-view-render.' + SCENES[s].mapsView + EVENT_NS, function () { scheduleApply(100); });
    }
  }
  $(document).on('knack-view-render.any' + EVENT_NS, function () { if (activeScene()) scheduleApply(400); });
})();
/*** END SITE MAPS STRIP ****************************************************/
