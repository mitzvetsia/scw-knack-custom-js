/*****  Install Camera Config Sub-panel  ************************/
/**
 * On the Implementation page (scene_1311), view_3916 holds IP-camera
 * configs that connect back to install line items (view_3915) via
 * field_2835. This module folds each config into the matching install
 * worksheet card's detail panel and hides the standalone view_3916
 * table so the data lives in one place.
 *
 * v1 scope: read-only display of the 4 config fields.  A small
 * "Show config grid" button at the top of the install worksheet
 * un-hides view_3916 for direct inline editing when needed.
 *
 * Fields displayed:
 *   field_2836  INPUT_recording schedule
 *   field_2837  INPUT_osd
 *   field_2842  INPUT_audio
 *   field_2843  INPUT_client notes
 *
 * Source row connection:
 *   field_2835  INSTALL_line item  (connection to view_3915 record)
 *
 * Merge strategy:
 *   1. Run on knack-view-render.view_3915 (after device-worksheet has
 *      built the worksheet cards).
 *   2. Run on knack-view-render.view_3916 (after the config grid loads).
 *   3. Re-run at staggered delays (50/250/750/2000 ms) because the two
 *      views can render in either order and device-worksheet may run
 *      post-render passes that rebuild the detail panel.
 *   4. MutationObserver on view_3915 catches any later DOM rebuild.
 */
(function () {
  'use strict';

  // view_3915 = Implementation install worksheet; view_4056 = "WHAT WE'RE
  // INSTALLING" (SAME install object/fields). Fold camera configs into the
  // matching card on either surface. Everything no-ops on a scene where the
  // config grid (view_3916) isn't present (buildConfigIndex returns empty).
  var INSTALL_VIEWS = ['view_3915', 'view_4056'];
  var CONFIG_VIEW   = 'view_3916';

  var CONNECTION_FIELD = 'field_2835';   // → install line item record id
  var FIELDS = [
    { key: 'field_2836', label: 'Recording schedule' },
    { key: 'field_2837', label: 'OSD' },
    { key: 'field_2842', label: 'Audio' },
    { key: 'field_2843', label: 'Client notes' }
  ];

  // QA fields on the camera-config object — read by readConfigQA below
  // and written by config-qa-popover when the user clicks Verify/Revert.
  var QA = {
    status:        'field_2896',  // Multiple Choice: Pending / Verified
    completedBy:   'field_2897',  // Connection → user
    completedDate: 'field_2898',  // Date
    notes:         'field_2899',  // Paragraph
    history:       'field_2900'   // Paragraph (append-only audit)
  };

  var SUBPANEL_CLS  = 'scw-install-config';
  var CSS_ID        = 'scw-install-config-css';
  // V2 worksheet (worksheet-v2) container mounted as a sibling of
  // #view_3915 — id is "scw-ws-v2-<sourceView>". Cards inside carry
  // data-scw-ws-v2-record="<recordId>"; the detail panel is
  // .scw-ws-v2-detail. Today view_3915 still renders V1 cards so this
  // selector matches nothing; after the cutover flip it matches and the
  // subpanel folds into the V2 detail instead. See CLAUDE.md migration.
  function v2ContainerId(viewId) { return 'scw-ws-v2-' + viewId; }
  // (former toggle-button constants removed — the camera-config grid is
  // now always hidden; configs are folded into the worksheet detail panel.)

  // ── CSS ─────────────────────────────────────────────────────────
  function injectCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    // Scope the cabling/exterior/plenum chip restyle to EVERY install surface
    // (view_3915 + view_4056) — generate the selector list across both.
    var _chipFields = ['field_2807', 'field_2805', 'field_2806'];
    function chipSel(sub) {
      var parts = [];
      INSTALL_VIEWS.forEach(function (v) {
        _chipFields.forEach(function (f) {
          parts.push('#' + v + ' .scw-ws-field[data-scw-field="' + f + '"] .scw-ws-field-' + sub);
        });
      });
      return parts.join(',\n');
    }
    s.textContent = [
      /* Camera-config grid view is always hidden — its data is folded
         into each worksheet card's detail panel via the merge() pass. */
      '#' + CONFIG_VIEW + ' { display: none !important; }',

      /* Match .scw-ws-section padding so the camera-config left edge
         lines up with the detail-panel field labels above. */
      '.' + SUBPANEL_CLS + ' {',
      '  border-top: 1px dashed #e2e8f0;',
      '  padding: 14px 20px 14px 70px;',
      '}',

      /* ── Existing-cabling / Exterior / Plenum as inline info chips ──
         The fields live in the detail's Info section as normal field
         rows.  showWhenFieldIsYes hides the row when value != Yes via
         inline style="display: none", so we MUST NOT override the
         host .scw-ws-field's display — we only restyle the LABEL
         (which becomes the chip) and HIDE the value.  Sky-blue
         palette so it reads informational, not as a warning. */
      chipSel('label') + ' {',
      '  display: inline-block;',
      '  width: auto;',
      '  min-width: 0;',
      '  padding: 3px 10px;',
      '  background: #e0f2fe;',
      '  border: 1px solid #7dd3fc;',
      '  color: #075985;',
      '  border-radius: 999px;',
      '  font-size: 12px;',
      '  font-weight: 700;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.4px;',
      '  white-space: nowrap;',
      '}',
      chipSel('value') + ' {',
      '  display: none;',
      '}',
      '.' + SUBPANEL_CLS + '-title {',
      '  font-size: 11px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.3px;',
      '  text-transform: uppercase;',
      '  color: #0f4c75;',
      '  margin-bottom: 6px;',
      '}',

      /* 4-column grid — each config row uses one full grid line. */
      '.' + SUBPANEL_CLS + '-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(4, minmax(0, 1fr));',
      '  gap: 8px 16px;',
      '  align-items: start;',
      '}',
      '.' + SUBPANEL_CLS + '-cell {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 2px;',
      '  min-width: 0;',
      '}',
      '.' + SUBPANEL_CLS + '-cell-label {',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  color: #4b5563;',
      '  text-transform: uppercase;',
      '  letter-spacing: 0.3px;',
      '}',
      '.' + SUBPANEL_CLS + '-cell-value {',
      '  font-size: 13px;',
      '  color: #1f2937;',
      '  word-break: break-word;',
      '  overflow-wrap: anywhere;',
      '}',
      '.' + SUBPANEL_CLS + '-cell-empty {',
      '  color: #94a3b8;',
      '}',
      /* Moved-in source td — strip table styling, give it a clean
         editable surface that matches the rest of the detail panel. */
      'td.' + SUBPANEL_CLS + '-cell-td {',
      '  display: block !important;',
      '  width: 100% !important;',
      '  padding: 4px 8px !important;',
      '  margin: 0 !important;',
      '  border: 1px solid #e5e7eb !important;',
      '  border-radius: 4px;',
      '  background: #fff !important;',
      '  font-size: 13px !important;',
      '  color: #1f2937 !important;',
      '  word-break: break-word;',
      '  overflow-wrap: anywhere;',
      '  min-height: 26px;',
      '  box-sizing: border-box;',
      '  cursor: pointer;',
      '  transition: border-color 0.12s, box-shadow 0.12s;',
      '}',
      'td.' + SUBPANEL_CLS + '-cell-td:hover {',
      '  border-color: #93c5fd !important;',
      '  box-shadow: 0 0 0 2px rgba(59,130,246,0.12);',
      '}',
      'td.' + SUBPANEL_CLS + '-cell-td.' + SUBPANEL_CLS + '-cell-empty {',
      '  color: #94a3b8 !important;',
      '  font-style: italic;',
      '}',
      'td.' + SUBPANEL_CLS + '-cell-td.' + SUBPANEL_CLS + '-cell-empty::before {',
      '  content: "Click to add";',
      '}',
      'td.' + SUBPANEL_CLS + '-cell-td.' + SUBPANEL_CLS + '-cell-empty > * {',
      '  display: none !important;',
      '}',
      /* On narrower viewports collapse to 2 cols */
      '@media (max-width: 900px) {',
      '  .' + SUBPANEL_CLS + '-grid { grid-template-columns: 1fr 1fr; }',
      '}',

      /* Per-config section header + QA chit */
      '.' + SUBPANEL_CLS + '-section-head {',
      '  display: flex; justify-content: space-between; align-items: center;',
      '  margin: 6px 0 4px;',
      '}',
      '.' + SUBPANEL_CLS + '-section-label {',
      '  font-size: 11px; font-weight: 700; color: #6b7280;',
      '  text-transform: uppercase; letter-spacing: 0.04em;',
      '}',
      /* Same dimensions as .scw-ws-req-photo-chit so when the chit is
         injected into the photo strip column it aligns flush with the
         photo chits above. */
      '.' + SUBPANEL_CLS + '-qa-chit {',
      '  display: flex; align-items: center; gap: 4px;',
      '  height: 22px; width: 100%; padding: 0 10px 0 8px;',
      '  border-radius: 999px; border: 1px solid transparent;',
      '  font-size: 12px; font-weight: 700;',
      '  letter-spacing: 0.02em; text-transform: uppercase;',
      '  line-height: 1; white-space: nowrap; overflow: hidden;',
      '  box-sizing: border-box; flex-shrink: 0;',
      '  cursor: pointer; user-select: none;',
      '  transition: filter 0.12s, box-shadow 0.12s;',
      '}',
      '.' + SUBPANEL_CLS + '-qa-chit:hover {',
      '  filter: brightness(0.97); box-shadow: 0 1px 2px rgba(0,0,0,0.08);',
      '}',
      '.' + SUBPANEL_CLS + '-qa-chit-name {',
      '  overflow: hidden; text-overflow: ellipsis; min-width: 0;',
      '}',
      '.' + SUBPANEL_CLS + '-qa-chit-state {',
      '  flex-shrink: 0; margin-left: auto; padding-left: 8px;',
      '  font-weight: 600; font-size: 9px; opacity: 0.75;',
      '}',
      '.' + SUBPANEL_CLS + '-qa-chit-state::before {',
      '  content: "·"; display: inline-block; margin-right: 6px; opacity: 0.6;',
      '}',
      '.' + SUBPANEL_CLS + '-qa-chit.is-pending {',
      '  background: #eef2ff; color: #4338ca; border-color: #a5b4fc;',
      '}',
      '.' + SUBPANEL_CLS + '-qa-chit.is-verified {',
      '  background: #dcfce7; color: #15803d; border-color: #86efac;',
      '}',

      /* ── V2 worksheet host overrides ──────────────────────────────
         When the subpanel is folded into a worksheet-v2 detail panel
         (.scw-ws-v2-detail) the V1 left-gutter padding (70px) is wrong —
         the V2 detail has its own padding scale. Tighten the edges so the
         camera-config block lines up with the V2 detail fields above it,
         and let the QA chit sit inline in the section header (V2 has no
         photo-strip column to mirror into). */
      '.scw-ws-v2-detail .' + SUBPANEL_CLS + ' {',
      '  padding: 12px 0 4px;',
      '  margin-top: 8px;',
      '}',
      '.scw-ws-v2-detail .' + SUBPANEL_CLS + '-section-head {',
      '  gap: 10px;',
      '}',
      /* In the V2 host the chit shouldn\'t stretch full-width (no column to
         fill) — size it to its content. */
      '.scw-ws-v2-detail .' + SUBPANEL_CLS + '-qa-chit {',
      '  width: auto; flex: 0 0 auto;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Plain text from a td (for hash diffing). */
  function tdText(td) {
    if (!td) return "";
    return (td.textContent || "").replace(/\s+/g, " ").trim();
  }

  /** Pull the QA snapshot off a config row's <tr>. */
  function readConfigQA(tr) {
    function statusOf(raw) {
      var v = (raw || '').toLowerCase();
      if (v === 'verified') return 'Verified';
      return 'Pending';
    }
    function historyHtml(td) {
      if (!td) return '';
      var inner = td.querySelector('span[class^="col-"]') || td;
      return (inner.innerHTML || '').trim();
    }
    function connText(td) {
      if (!td) return '';
      var inner = td.querySelector('span[data-kn="connection-value"] span[data-kn="connection-value"]')
                || td.querySelector('span[data-kn="connection-value"]');
      return inner ? (inner.textContent || '').trim() : tdText(td);
    }
    return {
      status:        statusOf(tdText(tr.querySelector('td.' + QA.status))),
      notes:         tdText(tr.querySelector('td.' + QA.notes)),
      history:       historyHtml(tr.querySelector('td.' + QA.history)),
      completedBy:   connText(tr.querySelector('td.' + QA.completedBy)),
      completedDate: tdText(tr.querySelector('td.' + QA.completedDate))
    };
  }

  /** Read the connected install-line-item record id from a config row. */
  function readLineItemId(configTr) {
    var td = configTr.querySelector('td.' + CONNECTION_FIELD);
    if (!td) return '';
    var span = td.querySelector('span[data-kn="connection-value"]');
    if (!span) return '';
    return (span.className || '').trim();
  }

  /**
   * Build { lineItemId → [configRec, ...] } from view_3916 DOM.
   *
   * Each configRec holds REFERENCES to the source <td> elements (not
   * copies of text), so injectSubpanel can MOVE them into the worksheet
   * detail panel.  Keeping the actual td means Knack's native inline-
   * edit (cell-edit class + click handler) still works — click opens
   * Knack's modal, save fires view_3916 re-render which triggers our
   * merge() and re-grafts the fresh cells.
   */
  function buildConfigIndex() {
    var index = {};
    var configView = document.getElementById(CONFIG_VIEW);
    if (!configView) return index;
    var rows = configView.querySelectorAll('table tbody > tr[id]');
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      var lineItemId = readLineItemId(tr);
      if (!lineItemId) continue;
      var cfg = { id: tr.id, cells: {}, qa: readConfigQA(tr) };
      for (var f = 0; f < FIELDS.length; f++) {
        cfg.cells[FIELDS[f].key] = tr.querySelector('td.' + FIELDS[f].key) || null;
      }
      if (!index[lineItemId]) index[lineItemId] = [];
      index[lineItemId].push(cfg);
    }
    return index;
  }

  /** Build the QA state chit for a single config record.  Structure
   *  mirrors .scw-ws-req-photo-chit (icon · name · state suffix) so it
   *  drops into the photo strip and inherits the column's width and
   *  visual rhythm. */
  function buildQaChit(cfg, index, total) {
    var state    = (cfg.qa && cfg.qa.status === 'Verified') ? 'verified' : 'pending';
    var stateText = state === 'verified' ? 'Verified' : 'Pending';
    var nameText  = (total && total > 1) ? ('Config ' + (index + 1)) : 'Camera config';
    var chit = document.createElement('span');
    chit.className = SUBPANEL_CLS + '-qa-chit is-' + state;
    chit.setAttribute('data-config-id', cfg.id);
    chit.setAttribute('data-qa-state', state);
    chit.title = state === 'verified'
      ? 'Config verified — click to revert'
      : 'Click to verify this config';
    var iconCheck = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var iconClock = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    chit.innerHTML = (state === 'verified' ? iconCheck : iconClock) +
      '<span class="' + SUBPANEL_CLS + '-qa-chit-name">' + nameText + '</span>' +
      '<span class="' + SUBPANEL_CLS + '-qa-chit-state">' + stateText + '</span>';
    chit.addEventListener('click', function (e) {
      e.stopPropagation();
      if (window.SCW && SCW.configQaPopover && typeof SCW.configQaPopover.open === 'function') {
        SCW.configQaPopover.open(chit, cfg.id, cfg.qa);
      }
    });
    return chit;
  }

  /**
   * Resolve the detail container + host kind for one record id, trying the
   * V2 worksheet card first, then the V1 worksheet card. Returns null when
   * neither is present on the page.
   *
   *   V2: .scw-ws-v2-card[data-scw-ws-v2-record="<id>"] .scw-ws-v2-detail
   *   V1: tr.scw-ws-row[id="<id>"] .scw-ws-card > .scw-ws-detail
   *
   * `host` is the element we hang the subpanel off (the card/row root) so
   * the photo-strip mirror (V1 only) can find the summary photo column.
   */
  function findDetailTarget(recordId) {
    if (!recordId) return null;
    // V2 first — after the cutover flip view_3915 renders V2 cards.
    var v2Card = document.querySelector(
      '.scw-ws-v2-card[data-scw-ws-v2-record="' + recordId + '"]'
    );
    if (v2Card) {
      var v2Detail = v2Card.querySelector('.scw-ws-v2-detail');
      if (v2Detail) return { detail: v2Detail, host: v2Card, v2: true };
    }
    // V1 fallback — current production structure.
    var v1Row = document.querySelector(
      'tr.scw-ws-row[id="' + recordId + '"]'
    );
    if (v1Row) {
      var v1Detail = v1Row.querySelector('.scw-ws-card > .scw-ws-detail');
      if (v1Detail) return { detail: v1Detail, host: v1Row, v2: false };
    }
    return null;
  }

  /** Inject the configs sub-panel into one worksheet card. The panel
   *  lives INSIDE the detail panel so it follows the accordion (hidden
   *  when the row/card is collapsed). Works on both the V1 (.scw-ws-detail)
   *  and V2 (.scw-ws-v2-detail) card structures. */
  // A config record is "empty" when none of its 4 display cells carries
  // content AND it has no Verified QA state — i.e. a connected view_3916 stub
  // with no actual config. Don't render a blank "Camera config" block for it.
  function cellHasContent(td) {
    if (!td) return false;
    return td.textContent.replace(/ /g, '').trim() !== '';
  }
  function isConfigEmpty(cfg) {
    if (cfg && cfg.qa && cfg.qa.status === 'Verified') return false;
    if (!cfg || !cfg.cells) return true;
    for (var f = 0; f < FIELDS.length; f++) {
      if (cellHasContent(cfg.cells[FIELDS[f].key])) return false;
    }
    return true;
  }
  function filterNonEmptyConfigs(configs) {
    if (!configs) return configs;
    var out = [];
    for (var i = 0; i < configs.length; i++) {
      if (!isConfigEmpty(configs[i])) out.push(configs[i]);
    }
    return out;
  }

  function injectSubpanel(recordId, configs) {
    var target = findDetailTarget(recordId);
    if (!target) return;
    var detail = target.detail;
    // Drop blank config stubs so a record with no real config renders nothing
    // (the stale-removal below still runs, then the length guard returns).
    configs = filterNonEmptyConfigs(configs);

    var prior = detail.querySelector('.' + SUBPANEL_CLS);
    if (prior) prior.parentNode.removeChild(prior);
    // Also strip any chits we mirrored into the V1 photo strip last pass.
    if (target.host) {
      var stalePhotoChits = target.host.querySelectorAll(
        '.scw-ws-req-photos .' + SUBPANEL_CLS + '-qa-chit'
      );
      for (var s = 0; s < stalePhotoChits.length; s++) {
        stalePhotoChits[s].remove();
      }
    }
    if (!configs || !configs.length) return;

    var panel = document.createElement('div');
    panel.className = SUBPANEL_CLS;

    var title = document.createElement('div');
    title.className = SUBPANEL_CLS + '-title';
    title.textContent = configs.length > 1
      ? 'Camera Configs (' + configs.length + ')'
      : 'Camera Config';
    panel.appendChild(title);

    for (var c = 0; c < configs.length; c++) {
      var cfg = configs[c];

      // When there are multiple configs, label each section with
      // "Config N".  In the V1 host the QA chit lives in the photo-strip
      // column above (see injectQaChitsIntoPhotoStrip below) so it
      // visually aligns directly under the photo QA chits. The V2 host
      // has no photo-strip column to mirror into, so render the chit
      // inline in the section header instead — and always emit a header
      // (single config too) so the V2 card still surfaces QA at a glance.
      if (configs.length > 1 || target.v2) {
        var header = document.createElement('div');
        header.className = SUBPANEL_CLS + '-section-head';
        var hLabel = document.createElement('span');
        hLabel.className = SUBPANEL_CLS + '-section-label';
        hLabel.textContent = configs.length > 1
          ? ('Config ' + (c + 1))
          : 'Camera config';
        header.appendChild(hLabel);
        if (target.v2 && cfg.qa) {
          header.appendChild(buildQaChit(cfg, c, configs.length));
        }
        panel.appendChild(header);
      }

      var grid = document.createElement('div');
      grid.className = SUBPANEL_CLS + '-grid';

      for (var f = 0; f < FIELDS.length; f++) {
        var spec = FIELDS[f];
        var sourceTd = cfg.cells[spec.key];

        var cell = document.createElement('div');
        cell.className = SUBPANEL_CLS + '-cell';

        var lbl = document.createElement('div');
        lbl.className = SUBPANEL_CLS + '-cell-label';
        lbl.textContent = spec.label;
        cell.appendChild(lbl);

        if (sourceTd) {
          // Move the actual td so Knack's cell-edit click handler keeps
          // firing and saves go through Knack's native modal.  Add a
          // local class so we can restyle it (strip table borders,
          // align with the rest of the detail panel typography).
          sourceTd.classList.add(SUBPANEL_CLS + '-cell-td');
          if (tdText(sourceTd) === '') {
            sourceTd.classList.add(SUBPANEL_CLS + '-cell-empty');
          } else {
            sourceTd.classList.remove(SUBPANEL_CLS + '-cell-empty');
          }
          cell.appendChild(sourceTd);
        } else {
          var v = document.createElement('div');
          v.className = SUBPANEL_CLS + '-cell-value ' + SUBPANEL_CLS + '-cell-empty';
          v.textContent = '—';
          cell.appendChild(v);
        }
        grid.appendChild(cell);
      }

      panel.appendChild(grid);

      if (c < configs.length - 1) {
        var sep = document.createElement('hr');
        sep.style.cssText = 'border: 0; border-top: 1px dashed #e2e8f0; margin: 8px 0;';
        panel.appendChild(sep);
      }
    }

    // Mount as the FIRST child of the detail panel so the camera config
    // sits above the sections grid (and stays hidden when the row/card
    // accordion is closed, since it lives inside the collapsible panel).
    detail.insertBefore(panel, detail.firstChild);

    // V1 only: mirror the per-config QA chits into the row's photo-strip
    // column so they stack directly beneath the photo QA chits at matching
    // width. The V2 host has no photo-strip column — its chits render
    // inline in the section header above.
    if (!target.v2) injectQaChitsIntoPhotoStrip(target.host, configs);
  }

  /**
   * Append one QA chit per config into the row header's photo-strip
   * column (.scw-ws-req-photos).  The chit shares the column's flex
   * layout so width matches the photo chits above and the icons +
   * state suffix align vertically with the photo chit content.
   */
  function injectQaChitsIntoPhotoStrip(wsTr, configs) {
    var photoStrip = wsTr.querySelector(
      '.scw-ws-card .scw-ws-summary .scw-ws-req-photos'
    );
    if (!photoStrip) return;

    // Remove any chits we injected on a prior merge.
    var prior = photoStrip.querySelectorAll('.' + SUBPANEL_CLS + '-qa-chit');
    for (var p = 0; p < prior.length; p++) prior[p].remove();

    for (var c = 0; c < configs.length; c++) {
      if (!configs[c].qa) continue;
      photoStrip.appendChild(buildQaChit(configs[c], c, configs.length));
    }
  }

  // Set true while we're writing our own DOM so the MutationObserver
  // doesn't re-fire merge() in response to our own injections.
  var _selfMutating = false;
  // Hash of (configs + wsRow ids) from the last successful merge —
  // skip work when nothing changed.
  var _lastHash = '';

  function computeHash(index, recordIds) {
    var keys = Object.keys(index).sort();
    var parts = [];
    for (var k = 0; k < keys.length; k++) {
      var lid = keys[k];
      parts.push(lid);
      var arr = index[lid];
      for (var a = 0; a < arr.length; a++) {
        var cfg = arr[a];
        parts.push(cfg.id);
        for (var f = 0; f < FIELDS.length; f++) {
          parts.push(tdText(cfg.cells[FIELDS[f].key]));
        }
        parts.push((cfg.qa && cfg.qa.status) || '');
        parts.push((cfg.qa && cfg.qa.notes)  || '');
      }
    }
    var sorted = recordIds.slice().sort();
    for (var w = 0; w < sorted.length; w++) parts.push(sorted[w]);
    return parts.join('|');
  }

  /**
   * Collect the install line-item record ids currently rendered as cards,
   * from BOTH worksheet structures:
   *   V1: tr.scw-ws-row[data-scw-view-id="view_3915"]  (id = record id)
   *   V2: .scw-ws-v2-card[data-scw-ws-v2-record]       (inside the v2 panel)
   * Today only V1 matches; after the cutover flip only V2 matches. The
   * dedupe keeps merge() correct even during a transient overlap.
   */
  function collectRecordIds() {
    var ids = [];
    var seen = {};
    function push(id) { if (id && !seen[id]) { seen[id] = true; ids.push(id); } }

    for (var v = 0; v < INSTALL_VIEWS.length; v++) {
      var viewId = INSTALL_VIEWS[v];
      var v1Rows = document.querySelectorAll(
        'tr.scw-ws-row[data-scw-view-id="' + viewId + '"]'
      );
      for (var i = 0; i < v1Rows.length; i++) push(v1Rows[i].id);

      var v2Container = document.getElementById(v2ContainerId(viewId));
      if (v2Container) {
        var v2Cards = v2Container.querySelectorAll(
          '.scw-ws-v2-card[data-scw-ws-v2-record]'
        );
        for (var j = 0; j < v2Cards.length; j++) {
          push(v2Cards[j].getAttribute('data-scw-ws-v2-record'));
        }
      }
    }
    return ids;
  }

  /** Merge configs into every install worksheet card (V1 + V2). */
  function merge() {
    var recordIds = collectRecordIds();
    if (!recordIds.length) return;
    var index = buildConfigIndex();
    var hash = computeHash(index, recordIds);
    var needsInject = (hash !== _lastHash);
    _lastHash = hash;
    if (!needsInject) return;

    _selfMutating = true;
    try {
      for (var i = 0; i < recordIds.length; i++) {
        injectSubpanel(recordIds[i], index[recordIds[i]] || []);
      }
    } finally {
      // Defer clearing so the observer ignores the microtask batch
      // emitted by our DOM writes above.
      setTimeout(function () { _selfMutating = false; }, 0);
    }
  }

  /** Reset the hash so the next merge() rebuilds even if data is unchanged. */
  function invalidate() { _lastHash = ''; }

  /** Fire merge() at staggered delays so we catch whichever worksheet
   *  (V1 or V2) paints first / last. Re-attaches the V2 observer at each
   *  pass since the V2 panel may mount after the first run. */
  function stagger() {
    var delays = [50, 250, 750, 2000];
    for (var i = 0; i < delays.length; i++) {
      setTimeout(function () {
        installV2MutationObserver();
        merge();
      }, delays[i]);
    }
  }

  /** Watch only the install-view tbody (row add/remove). Anything deeper
   *  is our own work and is ignored via _selfMutating. */
  function installMutationObserver() {
    for (var v = 0; v < INSTALL_VIEWS.length; v++) {
      var installView = document.getElementById(INSTALL_VIEWS[v]);
      if (!installView || installView.__scwInstallObs) continue;
      var tbody = installView.querySelector('table tbody');
      if (!tbody) continue;
      installView.__scwInstallObs = true;
      var pending = false;
      var obs = new MutationObserver(function () {
        if (_selfMutating || pending) return;
        pending = true;
        setTimeout(function () {
          pending = false;
          // Row set may have changed — re-evaluate.
          invalidate();
          merge();
        }, 150);
      });
      obs.observe(tbody, { childList: true });
    }
  }

  /** Watch the worksheet-v2 panel container. worksheet-v2 rebuilds its
   *  card list on every data subscriber fire (full innerHTML swap of the
   *  body), so we re-merge on any child mutation under the container.
   *  No-op until the V2 panel exists (i.e. after the cutover flip). */
  function installV2MutationObserver() {
    for (var v = 0; v < INSTALL_VIEWS.length; v++) {
      var v2Container = document.getElementById(v2ContainerId(INSTALL_VIEWS[v]));
      if (!v2Container || v2Container.__scwInstallConfigObs) continue;
      var body = v2Container.querySelector('.scw-ws-v2-body') || v2Container;
      v2Container.__scwInstallConfigObs = true;
      var pending = false;
      var obs = new MutationObserver(function () {
        if (_selfMutating || pending) return;
        pending = true;
        setTimeout(function () {
          pending = false;
          // Card set / detail panels may have been rebuilt — re-evaluate.
          invalidate();
          merge();
        }, 150);
      });
      obs.observe(body, { childList: true, subtree: true });
    }
  }

  // ── Init ────────────────────────────────────────────────────────
  function init() {
    injectCss();
    if (!window.SCW || typeof window.SCW.onViewRender !== 'function') return;

    INSTALL_VIEWS.forEach(function (iv) {
      window.SCW.onViewRender(iv, function () {
        // tbody is re-built; row set may have changed. The V2 panel (if
        // mounted) is a sibling of the install view and re-renders off the
        // same view render via its data subscriber, so attach its observer too.
        // Stagger the re-runs: V2 mounts its panel + paints cards slightly
        // AFTER this view-render fires (its data subscriber runs async), so
        // a single 50ms pass can miss the V2 cards. The observers above
        // catch later rebuilds; these passes catch the initial paint.
        invalidate();
        installMutationObserver();
        installV2MutationObserver();
        stagger();
      }, 'scwInstallConfig');
    });

    window.SCW.onViewRender(CONFIG_VIEW, function () {
      // Config data may have changed after an inline edit.
      invalidate();
      stagger();
    }, 'scwInstallConfig');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
