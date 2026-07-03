/*** BID REVIEW V2 — SEARCH ***************************************************
 *
 * A single search bar pinned to the very top of the comparison grid that
 * filters line items across EVERY SOW / bid grid at once. Matches on the
 * meaningful text of each row — SOW product + description + device label,
 * plus every bid column's product + description — never on button text.
 *
 * Non-matching rows hide; group / subgroup headers and whole SOW sections
 * fold away when nothing under them matches. While a query is active the
 * container gets `.scw-br-v2-searching`, whose CSS overrides group / subgroup
 * / SOW-accordion collapse so a match inside a closed group still surfaces —
 * clearing the query restores the collapse state untouched (search uses its
 * OWN `.scw-br-v2-search-hide` class, never the collapse classes).
 *
 * The bar lives OUTSIDE the grid body so it survives body re-renders; render.js
 * calls mount() (idempotent) + apply() after every rebuild to re-filter.
 ****************************************************************************/
(function () {
  'use strict';

  var ns = window.SCW && window.SCW.bidReviewV2;
  if (!ns) return;

  var STYLE_ID = 'scw-br-v2-search-css';
  var HIDE = 'scw-br-v2-search-hide';
  var _query = '';   // module-scoped so it survives bar remounts / rebuilds

  function container() {
    return document.getElementById(ns.CONFIG && ns.CONFIG.mountId);
  }

  // Meaningful searchable text for a line-item row: product / description /
  // device label on the SOW side + each bid cell — NOT the action buttons
  // ("Revise" / "Add to bid" / …), which would make every removed row match
  // "add". Cached on the node (survives keyed section reuse; recomputed on a
  // fresh rebuild).
  var TEXT_SEL = [
    '.scw-bid-review-v2__sow-product',
    '.scw-bid-review-v2__sow-desc',
    '.scw-bid-review-v2__row-label',
    '.scw-bid-review-v2__cell-product',
    '.scw-bid-review-v2__cell-desc'
  ].join(',');
  function rowText(row) {
    if (row._scwSearchText != null) return row._scwSearchText;
    var parts = [], nodes = row.querySelectorAll(TEXT_SEL);
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || '').trim();
      if (t) parts.push(t);
    }
    var s = parts.join(' ').toLowerCase();
    row._scwSearchText = s;
    return s;
  }

  function setHide(el, hide) {
    if (!el) return;
    if (hide) el.classList.add(HIDE);
    else el.classList.remove(HIDE);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.scw-br-v2-search {',
      '  display: flex; align-items: center; gap: 12px;',
      '  padding: 10px 14px; margin: 0 0 8px;',
      '  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;',
      '  position: sticky; top: 0; z-index: 40;',
      '  box-shadow: 0 1px 3px rgba(15,23,42,0.06);',
      '}',
      '.scw-br-v2-search-box {',
      '  flex: 1 1 auto; display: flex; align-items: center; gap: 8px;',
      '  padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px;',
      '  background: #f8fafc; transition: border-color 120ms, box-shadow 120ms, background 120ms;',
      '}',
      '.scw-br-v2-search-box:focus-within {',
      '  border-color: #2563eb; background: #fff;',
      '  box-shadow: 0 0 0 3px rgba(37,99,235,0.15);',
      '}',
      '.scw-br-v2-search-box svg { flex: 0 0 auto; color: #64748b; }',
      '.scw-br-v2-search-input {',
      '  flex: 1 1 auto; border: 0; outline: 0; background: transparent;',
      '  font: 14px/1.3 system-ui, -apple-system, sans-serif; color: #1f2937;',
      '}',
      '.scw-br-v2-search-clear {',
      '  flex: 0 0 auto; width: 22px; height: 22px; padding: 0;',
      '  border: 0; border-radius: 50%; cursor: pointer;',
      '  background: #e2e8f0; color: #475569; font: 700 16px/1 system-ui;',
      '  display: inline-flex; align-items: center; justify-content: center;',
      '}',
      '.scw-br-v2-search-clear:hover { background: #cbd5e1; color: #1f2937; }',
      '.scw-br-v2-search-clear[hidden] { display: none; }',
      '.scw-br-v2-search-count {',
      '  flex: 0 0 auto; font: 600 12.5px system-ui, sans-serif; color: #64748b;',
      '  white-space: nowrap; font-variant-numeric: tabular-nums;',
      '}',
      '.scw-br-v2-search-count--none { color: #b45309; }',
      // The filter itself.
      '.' + HIDE + ' { display: none !important; }',
      // While searching, reveal anything NOT search-hidden even if a group /
      // subgroup / SOW accordion had collapsed it — so a match inside a closed
      // group surfaces. Search hiding (its own class) still wins via :not().
      '.scw-br-v2-searching .scw-bid-review-v2__sow--collapsed .scw-bid-review-v2__table {',
      '  display: table !important;',
      '}',
      '.scw-br-v2-searching .scw-bid-review-v2__row--hidden:not(.' + HIDE + '),',
      '.scw-br-v2-searching .scw-bid-review-v2__subgroup-header--hidden:not(.' + HIDE + ') {',
      '  display: table-row !important;',
      '}'
    ].join('\n');
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  var ICON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

  /** Filter every SOW section against the current query. */
  function apply() {
    var c = container();
    if (!c) return;
    var bar = c.querySelector(':scope > .scw-br-v2-search');
    var countEl = bar && bar.querySelector('.scw-br-v2-search-count');
    var clearEl = bar && bar.querySelector('.scw-br-v2-search-clear');
    var q = _query;

    if (!q) {
      c.classList.remove('scw-br-v2-searching');
      var hidden = c.querySelectorAll('.' + HIDE);
      for (var h = 0; h < hidden.length; h++) hidden[h].classList.remove(HIDE);
      if (countEl) { countEl.textContent = ''; countEl.classList.remove('scw-br-v2-search-count--none'); }
      if (clearEl) clearEl.hidden = true;
      return;
    }

    c.classList.add('scw-br-v2-searching');
    if (clearEl) clearEl.hidden = false;

    var totalMatches = 0;
    var sections = c.querySelectorAll('.scw-bid-review-v2__sow[data-sow-id]');
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var tbody = sec.querySelector('.scw-bid-review-v2__table tbody');
      if (!tbody) { setHide(sec, true); continue; }

      // Group / subgroup state accumulated across an ordered walk so a header
      // hides only when EVERY line item beneath it is filtered out.
      var curGroup = null, groupVisible = false, groupDetails = [];
      var curSub = null, subVisible = false;
      var sectionVisible = false;

      var closeSub = function () {
        if (curSub) setHide(curSub, !subVisible);
        curSub = null; subVisible = false;
      };
      var closeGroup = function () {
        closeSub();
        if (curGroup) {
          setHide(curGroup, !groupVisible);
          for (var d = 0; d < groupDetails.length; d++) setHide(groupDetails[d], !groupVisible);
        }
        curGroup = null; groupVisible = false; groupDetails = [];
      };

      var trs = tbody.children;
      for (var r = 0; r < trs.length; r++) {
        var tr = trs[r];
        var cl = tr.classList;
        if (cl.contains('scw-bid-review-v2__group-header')) {
          closeGroup();
          curGroup = tr;
        } else if (cl.contains('scw-bid-review-v2__l1-detail-row')) {
          groupDetails.push(tr);          // SCW-notes strip — hide with its group
        } else if (cl.contains('scw-bid-review-v2__subgroup-header')) {
          closeSub();
          curSub = tr;
        } else if (cl.contains('scw-bid-review-v2__expand-row')) {
          setHide(tr, true);              // collapse open editors while searching
        } else if (cl.contains('scw-bid-review-v2__row--expandable')) {
          var match = rowText(tr).indexOf(q) !== -1;
          setHide(tr, !match);
          if (match) {
            groupVisible = true; sectionVisible = true; totalMatches++;
            if (curSub) subVisible = true;
          }
        }
      }
      closeGroup();
      setHide(sec, !sectionVisible);
    }

    if (countEl) {
      countEl.textContent = totalMatches
        ? (totalMatches + ' matching line item' + (totalMatches === 1 ? '' : 's'))
        : 'No matches';
      countEl.classList.toggle('scw-br-v2-search-count--none', totalMatches === 0);
    }
  }

  function setQuery(v) {
    _query = String(v == null ? '' : v).trim().toLowerCase();
    apply();
  }

  /** Mount the search bar at the very top of the grid container (idempotent;
   *  survives body re-renders since it lives outside .scw-bid-review-v2-body). */
  function mount() {
    var c = container();
    if (!c) return;
    if (c.querySelector(':scope > .scw-br-v2-search')) return;
    injectStyles();
    var bar = document.createElement('div');
    bar.className = 'scw-br-v2-search';
    bar.innerHTML =
      '<div class="scw-br-v2-search-box">' + ICON +
        '<input type="text" class="scw-br-v2-search-input" ' +
          'placeholder="Search all SOWs & bids — product, description, or device label…" ' +
          'autocomplete="off" spellcheck="false" aria-label="Search the comparison grid">' +
        '<button type="button" class="scw-br-v2-search-clear" aria-label="Clear search" hidden>&times;</button>' +
      '</div>' +
      '<span class="scw-br-v2-search-count"></span>';
    c.insertBefore(bar, c.firstChild);

    var input = bar.querySelector('.scw-br-v2-search-input');
    var clear = bar.querySelector('.scw-br-v2-search-clear');
    if (_query) input.value = _query;   // restore across a remount
    input.addEventListener('input', function () { setQuery(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; setQuery(''); }
    });
    clear.addEventListener('click', function () {
      input.value = ''; setQuery(''); input.focus();
    });
  }

  ns.search = { mount: mount, apply: apply };
})();
/*** END BID REVIEW V2 — SEARCH ***********************************************/
