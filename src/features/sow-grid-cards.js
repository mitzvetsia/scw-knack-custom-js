/*** SOW GRID CARDS — view_3325 (Scopes of Work list) **********************
 *
 * Replaces the 20-column "Scopes of Work" table with one compact CARD per
 * SOW. The wide table crams a long name, two flag columns, a "Next Step"
 * affordance, EIGHT financial figures, two note columns and three action
 * links into a single horizontal row — unreadable with one SOW and far worse
 * stacked across the several SOWs most projects carry.
 *
 * The original <table> is kept in the DOM (display:none) so the Knack model,
 * ops-review-pill's machinery, inline-edit endpoints and bulk-ops state all
 * stay intact — a "Table view" toggle un-hides it. Cards read their display
 * data from the Knack model and REUSE SCW.opsReview.buildBlockForRow(tr) for
 * the whole Next-Step block (pill + survey-cost gate + margin recovery +
 * published-proposal info), so none of that logic is duplicated here.
 *
 * Editable: survey cost (field_2750) — it gates the preview pill, so it has to
 * be fillable without leaving the list. Everything else routes to the existing
 * edit page via the row's own page link. Clone / delete proxy the row's native
 * Knack links so their behaviour (Vue delete confirm, page nav) is preserved.
 ***************************************************************************/
(function () {
  'use strict';

  var VIEW_ID  = 'view_3325';
  var PROP_VIEW = 'view_3885';     // published proposals — may render after us
  var STYLE_ID = 'scw-sow-grid-cards-css';
  var EVENT_NS = '.scwSowGridCards';
  var MODE_LS  = 'scwSowGridCardsMode';   // 'cards' | 'table'

  // Field map (from the view_3325 columns).
  var F = {
    id:        'field_2122',  // ID
    name:      'field_2126',  // NAME
    survey:    'field_2706',  // FLAG_survey requested
    released:  'field_2725',  // FLAG_released to sales
    notesInt:  'field_2198',  // Internal Notes
    notesCust: 'field_2128',  // NOTES (customer facing) — HTML
    hrs:       'field_2163',  // HRs
    mat:       'field_2164',  // Mat
    subBid:    'field_2162',  // Sub Bid total
    install:   'field_2161',  // Install Total
    equip:     'field_2298',  // Equipment Total
    projTotal: 'field_2200',  // Project Total
    surveyCost:'field_2750',  // INPUT_survey cost (editable)
    margin:    'field_2749'   // CALC margin on labor (%)
  };
  var MARGIN_LOW = 10;   // % — match ops-review's threshold for the amber tint

  // ── model reads ─────────────────────────────────────────────
  function rowAttrs(tr) {
    try {
      var id = tr && tr.id;
      if (!id || !/^[a-f0-9]{24}$/i.test(id)) return null;
      var v = Knack && Knack.views && Knack.views[VIEW_ID];
      var models = v && v.model && v.model.data && v.model.data.models;
      if (!models) return null;
      for (var i = 0; i < models.length; i++) {
        if (models[i].id === id) return models[i].attributes;
      }
    } catch (e) {}
    return null;
  }
  function stripTags(s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').trim(); }
  // Display value (tags stripped). Falls back to the DOM cell if the model
  // isn't ready yet, mirroring ops-review-pill's readText.
  function disp(tr, attrs, fk) {
    if (attrs) {
      var rawv = attrs[fk + '_raw'];
      if (rawv != null && typeof rawv !== 'object') return String(rawv);
      var v = attrs[fk];
      if (v != null) return stripTags(v);
    }
    var td = tr && tr.querySelector('td.' + fk + ', td[data-field-key="' + fk + '"]');
    return td ? stripTags(td.textContent) : '';
  }
  // Raw HTML (for the customer-facing notes list). Prefers the display value
  // (which carries the rendered <ul>), DOM cell as fallback.
  function dispHtml(tr, attrs, fk) {
    if (attrs && attrs[fk] != null && /<[a-z]/i.test(String(attrs[fk]))) return String(attrs[fk]);
    var td = tr && tr.querySelector('td.' + fk + ', td[data-field-key="' + fk + '"] span');
    if (td) {
      var inner = td.querySelector('span') || td;
      var html = inner.innerHTML;
      if (html && html.replace(/&nbsp;|\s/g, '')) return html;
    }
    return attrs && attrs[fk] != null ? stripTags(attrs[fk]) : '';
  }
  function isYes(tr, attrs, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    if (typeof raw === 'boolean') return raw;
    var s = stripTags((raw != null ? raw : disp(tr, attrs, fk))).toLowerCase();
    return s === 'yes' || s === 'true';
  }
  function moneyRaw(tr, attrs, fk) {
    var raw = attrs && attrs[fk + '_raw'];
    if (typeof raw === 'number') return raw;
    var s = String(disp(tr, attrs, fk)).replace(/[$,\s]/g, '');
    return s === '' ? null : (isNaN(parseFloat(s)) ? null : parseFloat(s));
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }
  // Currency as $#,###.## (always two decimals). Bare model numbers (e.g.
  // Material "0") get the $ + cents treatment, not just the raw value.
  function money(n) {
    if (n == null || isNaN(n)) return '—';
    var neg = n < 0;
    return (neg ? '-$' : '$') + Math.abs(n)
      .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function moneyCell(tr, attrs, fk) { return money(moneyRaw(tr, attrs, fk)); }

  // Per-card collapse — independent per SOW, persisted across reloads. Survives
  // transform()'s rebuild because the class is re-applied from this map.
  var COLLAPSE_LS = 'scwSowCardsCollapsed';
  function loadCollapsed() {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_LS)) || {}; } catch (e) { return {}; }
  }
  var collapsedBySow = loadCollapsed();
  function saveCollapsed() {
    try { localStorage.setItem(COLLAPSE_LS, JSON.stringify(collapsedBySow)); } catch (e) {}
  }

  // ── card pieces ─────────────────────────────────────────────
  function flagChip(label, on, kind) {
    var cls = 'scw-sow-chip scw-sow-chip--' + (on ? kind : 'off');
    return '<span class="' + cls + '">' +
      '<span class="scw-sow-chip__dot"></span>' + esc(label) + '</span>';
  }

  function stat(label, value, extraCls) {
    return '<div class="scw-sow-stat ' + (extraCls || '') + '">' +
      '<span class="scw-sow-stat__l">' + esc(label) + '</span>' +
      '<span class="scw-sow-stat__v">' + esc(value || '—') + '</span></div>';
  }

  function financialsHtml(tr, attrs, sowId) {
    var marginPct = (function () {
      var n = moneyRaw(tr, attrs, F.margin);
      if (n == null) return null;
      if (n > 0 && n <= 1.5) n = n * 100;   // fraction-stored → percent
      return n;
    })();
    var marginCls = (marginPct != null && marginPct < MARGIN_LOW) ? 'scw-sow-stat--warn' : '';

    var surveyRaw = moneyRaw(tr, attrs, F.surveyCost);
    var surveyVal = (surveyRaw == null) ? '' : String(surveyRaw);
    var surveyMissing = surveyVal === '';

    return '' +
      '<div class="scw-sow-money">' +
        '<span class="scw-sow-money__l">Project total</span>' +
        '<span class="scw-sow-money__v">' + esc(moneyCell(tr, attrs, F.projTotal)) + '</span>' +
      '</div>' +
      '<div class="scw-sow-stats">' +
        stat('Sub bid',   moneyCell(tr, attrs, F.subBid)) +
        stat('Install',   moneyCell(tr, attrs, F.install)) +
        stat('Equipment', moneyCell(tr, attrs, F.equip)) +
        stat('Labor hrs', disp(tr, attrs, F.hrs)) +
        stat('Material',  moneyCell(tr, attrs, F.mat)) +
        stat('Margin', (marginPct != null ? marginPct.toFixed(1) + '%' : (disp(tr, attrs, F.margin) || '—')), marginCls) +
      '</div>' +
      '<label class="scw-sow-survey' + (surveyMissing ? ' scw-sow-survey--missing' : '') + '">' +
        '<span class="scw-sow-survey__l">Survey cost</span>' +
        '<span class="scw-sow-survey__field">' +
          '<span class="scw-sow-survey__prefix">$</span>' +
          '<input type="text" inputmode="decimal" class="scw-sow-survey__input" ' +
            'data-sow-id="' + esc(sowId) + '" value="' + esc(surveyVal) + '" ' +
            'placeholder="enter $0 if none">' +
        '</span>' +
        (surveyMissing ? '<span class="scw-sow-survey__hint">Required to preview</span>' : '') +
      '</label>';
  }

  function notesHtml(tr, attrs) {
    var cust = dispHtml(tr, attrs, F.notesCust);
    var intl = stripTags(disp(tr, attrs, F.notesInt));
    var hasCust = cust && stripTags(cust);
    var hasInt  = intl;
    if (!hasCust && !hasInt) return '';
    var body = '';
    if (hasCust) body += '<div class="scw-sow-note"><span class="scw-sow-note__l">Customer-facing</span>' +
      '<div class="scw-sow-note__body">' + cust + '</div></div>';
    if (hasInt) body += '<div class="scw-sow-note"><span class="scw-sow-note__l">Internal</span>' +
      '<div class="scw-sow-note__body">' + esc(intl) + '</div></div>';
    return '<details class="scw-sow-notes"><summary>Notes</summary>' + body + '</details>';
  }

  // Footer actions — reuse the row's own native links so Knack's behaviour
  // (Vue delete confirm, page navigation) is preserved verbatim.
  function actionsEl(tr) {
    var wrap = document.createElement('div');
    wrap.className = 'scw-sow-card__actions';

    // The row's kn-link-page route ("edit-sow-sow-header2") actually kicks
    // off the SOW CLONE flow — label it honestly so users aren't surprised.
    var pageLink = tr.querySelector('a.kn-link-page');
    if (pageLink && pageLink.getAttribute('href')) {
      var clone = document.createElement('a');
      clone.className = 'scw-sow-act scw-sow-act--clone';
      clone.setAttribute('href', pageLink.getAttribute('href'));
      clone.setAttribute('title', 'Clone this SOW');
      clone.innerHTML = iconSvg('clone') + '<span>Clone</span>';
      wrap.appendChild(clone);
    }

    var delLink = tr.querySelector('a.kn-link-delete');
    if (delLink) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'scw-sow-act scw-sow-act--del';
      del.setAttribute('title', 'Delete SOW');
      del.innerHTML = iconSvg('trash') + '<span>Delete</span>';
      del.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        delLink.click();   // fire Knack's native delete (its own confirm)
      });
      wrap.appendChild(del);
    }
    return wrap;
  }

  function iconSvg(name) {
    var paths = {
      clone: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
             '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      trash: '<polyline points="3 6 5 6 21 6"/>' +
             '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
    };
    return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (paths[name] || '') + '</svg>';
  }

  function buildCard(tr) {
    var attrs = rowAttrs(tr);
    var sowId = tr.id;

    var card = document.createElement('div');
    card.className = 'scw-sow-card' + (collapsedBySow[sowId] ? ' scw-sow-card--collapsed' : '');
    card.setAttribute('data-sow-id', sowId);

    // Header — collapse toggle (chevron + heading + a collapsed-only project-
    // total summary) on the left, actions on the right.
    var header = document.createElement('div');
    header.className = 'scw-sow-card__header';
    var idText = disp(tr, attrs, F.id);
    var chevron = '<span class="scw-sow-chevron" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="6 9 12 15 18 9"></polyline></svg></span>';
    header.innerHTML =
      '<div class="scw-sow-card__headmain" role="button" tabindex="0" data-scw-sow-toggle ' +
        'data-sow-id="' + esc(sowId) + '" aria-label="Collapse or expand this SOW">' +
        chevron +
        '<div class="scw-sow-card__heading">' +
          // Friendly name — click-to-edit. The pencil (hover affordance) swaps
          // the text for an input; Enter/blur PUTs field_2126 through this view
          // (same path as the survey-cost input), Escape cancels. data-sow-name
          // carries the raw current value so the editor prefills without
          // re-reading the model.
          '<div class="scw-sow-card__name" data-scw-sow-name data-sow-id="' + esc(sowId) + '" ' +
            'data-sow-name="' + esc(disp(tr, attrs, F.name) || '') + '">' +
            '<span class="scw-sow-card__name-text">' + esc(disp(tr, attrs, F.name) || '(unnamed SOW)') + '</span>' +
            '<button type="button" class="scw-sow-name-edit" title="Rename this SOW" aria-label="Rename this SOW">' +
              '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
                'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
                '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<div class="scw-sow-card__meta">' +
            (idText ? '<span class="scw-sow-card__id">#' + esc(idText) + '</span>' : '') +
            flagChip(isYes(tr, attrs, F.survey)   ? 'Survey requested' : 'Survey not requested', isYes(tr, attrs, F.survey),   'survey') +
            flagChip(isYes(tr, attrs, F.released) ? 'Released to sales' : 'Not released',          isYes(tr, attrs, F.released), 'released') +
          '</div>' +
        '</div>' +
        '<span class="scw-sow-card__collapsed-total" title="Project total">' +
          esc(moneyCell(tr, attrs, F.projTotal)) + '</span>' +
      '</div>';
    header.appendChild(actionsEl(tr));
    card.appendChild(header);

    // Body — two columns: Next Step (reused) | Financials.
    var body = document.createElement('div');
    body.className = 'scw-sow-card__body';

    var nextCol = document.createElement('div');
    nextCol.className = 'scw-sow-card__col scw-sow-card__col--next';
    nextCol.innerHTML = '<div class="scw-sow-card__col-label">Next step</div>';
    var block = null;
    if (window.SCW && SCW.opsReview && typeof SCW.opsReview.buildBlockForRow === 'function') {
      try { block = SCW.opsReview.buildBlockForRow(tr); } catch (e) { block = null; }
    }
    if (block) nextCol.appendChild(block);
    else nextCol.appendChild(fallbackPill(sowId));
    body.appendChild(nextCol);

    var finCol = document.createElement('div');
    finCol.className = 'scw-sow-card__col scw-sow-card__col--fin';
    finCol.innerHTML = '<div class="scw-sow-card__col-label">Financials</div>' +
      financialsHtml(tr, attrs, sowId);
    body.appendChild(finCol);

    card.appendChild(body);

    // Notes (collapsed by default).
    var notes = notesHtml(tr, attrs);
    if (notes) {
      var nWrap = document.createElement('div');
      nWrap.className = 'scw-sow-card__footer';
      nWrap.innerHTML = notes;
      card.appendChild(nWrap);
    }
    return card;
  }

  // Fallback when ops-review isn't available (build-order safety net).
  function fallbackPill(sowId) {
    var a = document.createElement('a');
    a.className = 'scw-sow-fallback-pill';
    a.setAttribute('href', '#proposals/proposal/' + sowId + '/');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    a.textContent = 'Open proposal ›';
    return a;
  }

  // ── survey-cost inline save ─────────────────────────────────
  function saveSurveyCost(input) {
    var sowId = input.getAttribute('data-sow-id');
    if (!sowId) return;
    if (!(window.SCW && typeof SCW.knackAjax === 'function' && typeof SCW.knackRecordUrl === 'function')) return;
    var rawStr = String(input.value == null ? '' : input.value).replace(/[$,\s]/g, '');
    var body = {};
    body[F.surveyCost] = rawStr === '' ? '' : (isNaN(parseFloat(rawStr)) ? '' : parseFloat(rawStr));
    input.disabled = true;
    input.closest('.scw-sow-survey') && input.closest('.scw-sow-survey').classList.add('scw-sow-survey--saving');
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(VIEW_ID, sowId),
      type: 'PUT',
      data: JSON.stringify(body),
      dataType: 'json'
    }).always(function () {
      // Refetch so the margin + pill gate recompute, then the view re-renders
      // → cards rebuild with fresh data.
      try {
        var v = Knack && Knack.views && Knack.views[VIEW_ID];
        if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
      } catch (e) {}
    });
  }

  // ── friendly-name inline edit ───────────────────────────────
  // Swap the heading text for an input. Enter/blur commits (PUT field_2126
  // through this view, then refetch so the card + ops pill rebuild with the
  // new name), Escape restores the text without saving.
  function openNameEditor(nameEl) {
    if (nameEl.querySelector('.scw-sow-card__name-input')) return;   // already editing
    var sowId = nameEl.getAttribute('data-sow-id');
    if (!sowId) return;
    var current = nameEl.getAttribute('data-sow-name') || '';
    nameEl.classList.add('scw-sow-card__name--editing');
    nameEl.innerHTML = '<input type="text" class="scw-sow-card__name-input" ' +
      'data-sow-id="' + esc(sowId) + '" data-sow-prev="' + esc(current) + '" ' +
      'aria-label="SOW name" placeholder="SOW name">';
    var input = nameEl.querySelector('.scw-sow-card__name-input');
    input.value = current;
    setTimeout(function () { input.focus(); input.select(); }, 0);
  }
  function commitNameEditor(input, cancel) {
    // One-shot: Escape triggers a restore that removes the input, which fires
    // a focusout on it — without this guard that second call would double-run.
    if (input._scwNameDone) return;
    input._scwNameDone = true;
    var nameEl = input.closest('[data-scw-sow-name]');
    var sowId  = input.getAttribute('data-sow-id');
    var prev   = input.getAttribute('data-sow-prev') || '';
    var next   = String(input.value == null ? '' : input.value).trim();
    function restore(text) {
      if (!nameEl) return;
      nameEl.classList.remove('scw-sow-card__name--editing');
      nameEl.setAttribute('data-sow-name', text);
      nameEl.innerHTML =
        '<span class="scw-sow-card__name-text">' + esc(text || '(unnamed SOW)') + '</span>' +
        '<button type="button" class="scw-sow-name-edit" title="Rename this SOW" aria-label="Rename this SOW">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" ' +
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>' +
            '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>' +
          '</svg>' +
        '</button>';
    }
    if (cancel || next === prev || !sowId) { restore(prev); return; }
    if (!(window.SCW && typeof SCW.knackAjax === 'function' && typeof SCW.knackRecordUrl === 'function')) {
      restore(prev); return;
    }
    // Optimistic: show the new name immediately; the refetch re-renders with
    // server truth (and reverts visually if the PUT failed).
    restore(next);
    var body = {};
    body[F.name] = next;
    SCW.knackAjax({
      url:  SCW.knackRecordUrl(VIEW_ID, sowId),
      type: 'PUT',
      data: JSON.stringify(body),
      dataType: 'json'
    }).always(function () {
      try {
        var v = Knack && Knack.views && Knack.views[VIEW_ID];
        if (v && v.model && typeof v.model.fetch === 'function') v.model.fetch();
      } catch (e) {}
    });
  }

  // ── transform ───────────────────────────────────────────────
  function currentMode() {
    try { return localStorage.getItem(MODE_LS) === 'table' ? 'table' : 'cards'; }
    catch (e) { return 'cards'; }
  }
  function setMode(view, mode) {
    try { localStorage.setItem(MODE_LS, mode); } catch (e) {}
    applyMode(view, mode);
  }
  function applyMode(view, mode) {
    if (mode === 'table') view.classList.remove('scw-sow-cards-on');
    else view.classList.add('scw-sow-cards-on');
    var btn = view.querySelector('.scw-sow-cards-toggle');
    if (btn) btn.textContent = (mode === 'table') ? '▤ Card view' : '▤ Table view';
  }

  // Collapse / expand every card in the view at once + keep the toolbar
  // button's label in sync with the current state.
  function anyCardOpen(view) {
    var cards = view.querySelectorAll('.scw-sow-card');
    for (var i = 0; i < cards.length; i++) {
      if (!cards[i].classList.contains('scw-sow-card--collapsed')) return true;
    }
    return false;
  }
  function setAllCollapsed(view, collapse) {
    var cards = view.querySelectorAll('.scw-sow-card');
    for (var i = 0; i < cards.length; i++) {
      var id = cards[i].getAttribute('data-sow-id');
      if (id) collapsedBySow[id] = collapse;
      cards[i].classList.toggle('scw-sow-card--collapsed', collapse);
    }
    saveCollapsed();
    updateCollapseAllLabel(view);
  }
  function updateCollapseAllLabel(view) {
    var btn = view.querySelector('.scw-sow-cards-collapseall');
    if (btn) btn.textContent = anyCardOpen(view) ? 'Collapse all' : 'Expand all';
  }

  function ensureChrome(view, wrapper) {
    var toolbar = view.querySelector('.scw-sow-cards-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'scw-sow-cards-toolbar';

      var collapseAll = document.createElement('button');
      collapseAll.type = 'button';
      collapseAll.className = 'scw-sow-cards-collapseall';
      collapseAll.textContent = 'Collapse all';
      collapseAll.addEventListener('click', function () {
        setAllCollapsed(view, anyCardOpen(view));   // any open → collapse; all closed → expand
      });
      toolbar.appendChild(collapseAll);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'scw-sow-cards-toggle';
      btn.addEventListener('click', function () {
        setMode(view, view.classList.contains('scw-sow-cards-on') ? 'table' : 'cards');
      });
      toolbar.appendChild(btn);
      wrapper.parentNode.insertBefore(toolbar, wrapper);
    }
    var container = view.querySelector('.scw-sow-cards');
    if (!container) {
      container = document.createElement('div');
      container.className = 'scw-sow-cards';
      wrapper.parentNode.insertBefore(container, wrapper);
    }
    return container;
  }

  function transform() {
    var view = document.getElementById(VIEW_ID);
    if (!view) return;
    var table = view.querySelector('table.kn-table-table');
    var wrapper = view.querySelector('.kn-table-wrapper');
    if (!table || !wrapper) return;

    var container = ensureChrome(view, wrapper);

    var rows = table.querySelectorAll('tbody tr[id]');
    var frag = document.createDocumentFragment();
    var n = 0;
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (tr.classList.contains('kn-tr-nodata')) continue;
      if (!/^[a-f0-9]{24}$/i.test(tr.id || '')) continue;
      frag.appendChild(buildCard(tr));
      n++;
    }
    container.innerHTML = '';
    if (n === 0) {
      var empty = document.createElement('div');
      empty.className = 'scw-sow-cards-empty';
      empty.textContent = 'No scopes of work yet.';
      container.appendChild(empty);
    } else {
      container.appendChild(frag);
    }
    applyMode(view, currentMode());
    updateCollapseAllLabel(view);
  }

  // ── styles ──────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var ACC = 'var(--scw-accent, #2f5f91)';
    var css = [
      /* mode switching — hide the raw table in card mode, hide cards in table mode */
      '#' + VIEW_ID + '.scw-sow-cards-on .kn-table-wrapper { display: none !important; }',
      /* Card mode hides the whole records-nav (Showing N-of-N, Add filters,
         per-page, bulk-ops) — it's clutter once rows are cards. Table view
         restores it. */
      '#' + VIEW_ID + '.scw-sow-cards-on .kn-records-nav { display: none !important; }',
      '#' + VIEW_ID + ':not(.scw-sow-cards-on) .scw-sow-cards { display: none !important; }',

      '.scw-sow-cards-toolbar { display: flex; justify-content: flex-end; margin: 0 0 10px; }',
      '.scw-sow-cards-toolbar { gap: 8px; }',
      '.scw-sow-cards-toggle, .scw-sow-cards-collapseall { background: #fff; border: 1px solid #cbd5e1;',
      '  color: #475569; border-radius: 6px; padding: 4px 10px; font: 600 12px/1.2 system-ui, sans-serif;',
      '  cursor: pointer; }',
      '.scw-sow-cards-toggle:hover, .scw-sow-cards-collapseall:hover { background: #f1f5f9; }',

      '.scw-sow-cards { display: flex; flex-direction: column; gap: 14px; }',
      '.scw-sow-cards-empty { padding: 28px; text-align: center; color: #94a3b8;',
      '  font: 500 14px/1.4 system-ui, sans-serif; background: #fff; border: 1px dashed #cbd5e1;',
      '  border-radius: 10px; }',

      /* card shell */
      '.scw-sow-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;',
      '  box-shadow: 0 1px 2px rgba(15,23,42,.04); overflow: hidden;',
      '  border-left: 4px solid ' + ACC + ';',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',

      /* header */
      '.scw-sow-card__header { display: flex; align-items: flex-start; gap: 12px;',
      '  padding: 12px 16px; border-bottom: 1px solid #f1f5f9;',
      '  background: linear-gradient(0deg, #fff, rgba(var(--scw-accent-rgb, 47,95,145), .045)); }',
      /* collapse toggle region (chevron + heading + collapsed-only total) */
      '.scw-sow-card__headmain { flex: 1 1 auto; min-width: 0; display: flex; align-items: flex-start;',
      '  gap: 10px; cursor: pointer; background: none; border: none; padding: 0; text-align: left; }',
      '.scw-sow-card__headmain:focus-visible { outline: 2px solid ' + ACC + '; outline-offset: 2px; border-radius: 6px; }',
      '.scw-sow-chevron { flex: none; margin-top: 1px; color: #94a3b8; transition: transform .15s ease; }',
      '.scw-sow-card--collapsed .scw-sow-chevron { transform: rotate(-90deg); }',
      '.scw-sow-card__headmain:hover .scw-sow-chevron { color: ' + ACC + '; }',
      /* collapsed-only project-total chip pinned to the right of the heading */
      '.scw-sow-card__collapsed-total { display: none; margin-left: auto; align-self: center;',
      '  font: 800 16px/1 system-ui, sans-serif; color: ' + ACC + '; font-variant-numeric: tabular-nums;',
      '  white-space: nowrap; }',
      '.scw-sow-card--collapsed .scw-sow-card__collapsed-total { display: inline-block; }',
      '.scw-sow-card--collapsed .scw-sow-card__body,',
      '.scw-sow-card--collapsed .scw-sow-card__footer { display: none !important; }',
      '.scw-sow-card--collapsed .scw-sow-card__header { border-bottom: none; }',
      '.scw-sow-card__heading { flex: 1 1 auto; min-width: 0; }',
      '.scw-sow-card__name { font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.3;',
      '  display: flex; align-items: center; gap: 6px; min-width: 0; }',
      '.scw-sow-card__name-text { overflow-wrap: anywhere; }',
      /* Rename pencil — hidden until the heading is hovered so the header stays
         clean; always reachable via keyboard focus. */
      '.scw-sow-name-edit { display: inline-flex; align-items: center; justify-content: center;',
      '  flex: none; width: 22px; height: 22px; border: none; border-radius: 5px;',
      '  background: transparent; color: #94a3b8; cursor: pointer; padding: 0;',
      '  opacity: 0; transition: opacity .12s, background .12s; }',
      '.scw-sow-card__headmain:hover .scw-sow-name-edit,',
      '.scw-sow-name-edit:focus-visible { opacity: 1; }',
      '.scw-sow-name-edit:hover { background: #e2e8f0; color: #334155; }',
      '.scw-sow-card__name-input { width: 100%; max-width: 420px; box-sizing: border-box;',
      '  font: 700 15px/1.3 system-ui, -apple-system, sans-serif; color: #0f172a; padding: 3px 8px;',
      '  border: 1px solid ' + ACC + '; border-radius: 6px; background: #fff; }',
      '.scw-sow-card__name-input:focus { outline: none;',
      '  box-shadow: 0 0 0 2px rgba(var(--scw-accent-rgb,47,95,145),.18); }',
      '.scw-sow-card__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 5px; }',
      '.scw-sow-card__id { font-size: 11.5px; color: #94a3b8; font-weight: 600;',
      '  letter-spacing: .2px; font-variant-numeric: tabular-nums; }',

      /* flag chips */
      '.scw-sow-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px;',
      '  font-weight: 600; padding: 2px 9px 2px 7px; border-radius: 999px; white-space: nowrap;',
      '  border: 1px solid transparent; }',
      '.scw-sow-chip__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .8; }',
      '.scw-sow-chip--survey   { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }',
      '.scw-sow-chip--released { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }',
      '.scw-sow-chip--off      { background: #f8fafc; color: #94a3b8; border-color: #e2e8f0; }',

      /* actions */
      '.scw-sow-card__actions { display: flex; gap: 6px; flex: none; }',
      '.scw-sow-act { display: inline-flex; align-items: center; gap: 5px; font: 600 12px/1 system-ui, sans-serif;',
      '  padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0; background: #fff;',
      '  color: #475569; cursor: pointer; text-decoration: none; }',
      '.scw-sow-act:hover { background: #f8fafc; }',
      '.scw-sow-act--del { color: #b91c1c; border-color: #fecaca; }',
      '.scw-sow-act--del:hover { background: #fef2f2; }',
      '.scw-sow-act svg { flex: none; }',

      /* body grid */
      '.scw-sow-card__body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);',
      '  gap: 18px; padding: 14px 16px; }',
      '.scw-sow-card__col { min-width: 0; }',
      '.scw-sow-card__col-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: .5px; color: #94a3b8; margin-bottom: 8px; }',
      '.scw-sow-card__col--fin { border-left: 1px solid #f1f5f9; padding-left: 18px; }',
      '@media (max-width: 760px) { .scw-sow-card__body { grid-template-columns: 1fr; }',
      '  .scw-sow-card__col--fin { border-left: none; padding-left: 0; border-top: 1px solid #f1f5f9; padding-top: 14px; } }',

      /* financials */
      '.scw-sow-money { display: flex; align-items: baseline; justify-content: space-between; gap: 10px;',
      '  padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid #f1f5f9; }',
      '.scw-sow-money__l { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #64748b; }',
      '.scw-sow-money__v { font-size: 22px; font-weight: 800; color: ' + ACC + '; font-variant-numeric: tabular-nums; }',
      '.scw-sow-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }',
      '.scw-sow-stat { display: flex; flex-direction: column; gap: 2px; padding: 7px 9px;',
      '  background: #f8fafc; border: 1px solid #eef2f7; border-radius: 8px; }',
      '.scw-sow-stat__l { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .3px; color: #94a3b8; }',
      '.scw-sow-stat__v { font-size: 14px; font-weight: 700; color: #1e293b; font-variant-numeric: tabular-nums; }',
      '.scw-sow-stat--warn { background: #fffbeb; border-color: #fde68a; }',
      '.scw-sow-stat--warn .scw-sow-stat__v { color: #b45309; }',

      /* survey cost input */
      '.scw-sow-survey { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 12px; }',
      '.scw-sow-survey__l { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #64748b; }',
      '.scw-sow-survey__field { position: relative; display: inline-flex; align-items: center; }',
      '.scw-sow-survey__prefix { position: absolute; left: 9px; color: #94a3b8; font-size: 13px; pointer-events: none; }',
      '.scw-sow-survey__input { width: 110px; padding: 5px 8px 5px 18px; border: 1px solid #cbd5e1;',
      '  border-radius: 6px; font: 600 13px/1.2 system-ui, sans-serif; color: #1e293b; background: #fff;',
      '  font-variant-numeric: tabular-nums; }',
      '.scw-sow-survey__input:focus { outline: none; border-color: ' + ACC + '; box-shadow: 0 0 0 2px rgba(var(--scw-accent-rgb,47,95,145),.18); }',
      '.scw-sow-survey--missing .scw-sow-survey__input { border-color: #dc2626; background: #fef2f2; }',
      '.scw-sow-survey__hint { font-size: 10.5px; font-weight: 600; color: #dc2626; }',
      '.scw-sow-survey--saving { opacity: .6; }',

      /* notes */
      '.scw-sow-card__footer { border-top: 1px solid #f1f5f9; }',
      '.scw-sow-notes > summary { cursor: pointer; padding: 10px 16px; font-size: 12px; font-weight: 600;',
      '  color: #475569; list-style: none; user-select: none; }',
      '.scw-sow-notes > summary::-webkit-details-marker { display: none; }',
      '.scw-sow-notes > summary::before { content: "▸ "; color: #94a3b8; }',
      '.scw-sow-notes[open] > summary::before { content: "▾ "; }',
      '.scw-sow-notes[open] > summary:hover { background: #f8fafc; }',
      '.scw-sow-note { padding: 0 16px 12px; }',
      '.scw-sow-note__l { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase;',
      '  letter-spacing: .4px; color: #94a3b8; margin-bottom: 4px; }',
      '.scw-sow-note__body { font-size: 13px; color: #334155; line-height: 1.5; }',
      '.scw-sow-note__body ul { margin: 0; padding-left: 18px; }',

      /* the reused ops block sits naturally in the next-step column */
      '.scw-sow-card__col--next .scw-ops-block { display: block; }',
      '.scw-sow-card__col--next .scw-ops-pill { min-width: 0; width: 100%; }',
      '.scw-sow-fallback-pill { display: inline-flex; align-items: center; padding: 7px 12px;',
      '  background: #0891b2; color: #fff !important; border-radius: 6px; text-decoration: none;',
      '  font: 600 12px/1.2 system-ui, sans-serif; }'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── bindings ────────────────────────────────────────────────
  function bind() {
    $(document)
      .off('knack-view-render.' + VIEW_ID + EVENT_NS)
      .on('knack-view-render.' + VIEW_ID + EVENT_NS, function () { setTimeout(transform, 180); });
    // Published proposals view may arrive after us — rebuild so the per-card
    // proposal info (inside the reused ops block) populates.
    $(document)
      .off('knack-view-render.' + PROP_VIEW + EVENT_NS)
      .on('knack-view-render.' + PROP_VIEW + EVENT_NS, function () { setTimeout(transform, 180); });
    $(document)
      .off('knack-cell-update.' + VIEW_ID + EVENT_NS)
      .on('knack-cell-update.' + VIEW_ID + EVENT_NS, function () { setTimeout(transform, 180); });

    // Survey-cost inline save (delegated; commit on blur / Enter).
    document.addEventListener('change', function (e) {
      var inp = e.target.closest && e.target.closest('.scw-sow-survey__input');
      if (inp) saveSurveyCost(inp);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var inp = e.target.closest && e.target.closest('.scw-sow-survey__input');
      if (inp) { e.preventDefault(); inp.blur(); }
    });

    // Friendly-name inline edit (delegated). The pencil (or the name text
    // itself) opens the editor; commits on blur / Enter, cancels on Escape.
    document.addEventListener('click', function (e) {
      var pencil = e.target.closest && e.target.closest('.scw-sow-name-edit');
      var nameEl = e.target.closest && e.target.closest('[data-scw-sow-name]');
      if (!pencil && !nameEl) return;
      if (nameEl && nameEl.querySelector('.scw-sow-card__name-input')) {
        e.stopPropagation();   // mid-edit — clicks inside must not toggle collapse
        return;
      }
      if (pencil) {
        e.preventDefault();
        e.stopPropagation();   // never toggle collapse from the pencil
        openNameEditor(pencil.closest('[data-scw-sow-name]'));
      }
    }, true);   // capture — run BEFORE the collapse-toggle click handler below
    document.addEventListener('focusout', function (e) {
      var inp = e.target.closest && e.target.closest('.scw-sow-card__name-input');
      if (inp) commitNameEditor(inp, false);
    });
    document.addEventListener('keydown', function (e) {
      var inp = e.target.closest && e.target.closest('.scw-sow-card__name-input');
      if (!inp) return;
      // The input lives inside the headmain toggle region — keep Enter/Space/
      // Escape from reaching the collapse-toggle keydown handler.
      e.stopPropagation();
      if (e.key === 'Enter')  { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); commitNameEditor(inp, true); }
    }, true);

    // Per-card collapse toggle (chevron / header). Ignore clicks that land on
    // the action buttons or any link/button/input so those still work.
    function toggleCard(el) {
      var sowId = el.getAttribute('data-sow-id');
      if (!sowId) return;
      var collapsed = !collapsedBySow[sowId];
      collapsedBySow[sowId] = collapsed;
      saveCollapsed();
      var card = el.closest('.scw-sow-card');
      if (card) card.classList.toggle('scw-sow-card--collapsed', collapsed);
      var view = el.closest('.kn-view');
      if (view) updateCollapseAllLabel(view);
    }
    // Only the headmain region carries the toggle hook; the action buttons are
    // its siblings (not descendants), so they never trigger a collapse.
    document.addEventListener('click', function (e) {
      var head = e.target.closest && e.target.closest('[data-scw-sow-toggle]');
      if (head) toggleCard(head);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var head = e.target.closest && e.target.closest('[data-scw-sow-toggle]');
      if (head) { e.preventDefault(); toggleCard(head); }
    });
  }

  injectStyles();
  bind();
  if (document.getElementById(VIEW_ID)) setTimeout(transform, 180);
})();
/*** END SOW GRID CARDS *****************************************************/
