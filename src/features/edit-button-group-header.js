/*************  Edit Button on Grouped Headers – view_3561  **********************/
(function () {
  'use strict';

  var VIEW_ID = 'view_3561';
  var EVENT_NS = '.scwEditBtnGroupHeader';
  var CSS_ID = 'scw-edit-btn-group-header-css';
  var BUTTON_CLASS = 'scw-group-edit-btn';
  var LINK_COL_CLASS = 'knTableColumn__link';

  // ── CSS ──────────────────────────────────────────────────────────────
  function injectCssOnce() {
    if (document.getElementById(CSS_ID)) return;
    var style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = [
      '#' + VIEW_ID + ' td.' + LINK_COL_CLASS + ',',
      '#' + VIEW_ID + ' th.' + LINK_COL_CLASS + ' {',
      '  display: none !important;',
      '}',

      '.' + BUTTON_CLASS + ' {',
      '  display: inline-block;',
      '  margin-left: 10px;',
      '  padding: 2px 10px;',
      '  font-size: 11px;',
      '  font-weight: 600;',
      '  line-height: 1.6;',
      '  color: #fff;',
      '  background: rgba(255,255,255,.22);',
      '  border: 1px solid rgba(255,255,255,.35);',
      '  border-radius: 4px;',
      '  cursor: pointer;',
      '  vertical-align: middle;',
      '  transition: background 120ms ease;',
      '}',
      '.' + BUTTON_CLASS + ':hover {',
      '  background: rgba(255,255,255,.38);',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function getEditHrefForGroup($headerRow) {
    // Walk subsequent rows until the next group header; grab the first edit link.
    var href = null;
    $headerRow.nextAll('tr').each(function () {
      var $tr = $(this);
      if ($tr.hasClass('kn-table-group')) return false; // stop at next group
      var $link = $tr.find('td.' + LINK_COL_CLASS + ' a.kn-link-page');
      if ($link.length) {
        href = $link.attr('href');
        return false;
      }
    });
    return href;
  }

  function addButtons() {
    var $view = $('#' + VIEW_ID);
    if (!$view.length) return;

    $view.find('tr.kn-table-group').each(function () {
      var $tr = $(this);
      if ($tr.find('.' + BUTTON_CLASS).length) return; // already added

      var href = getEditHrefForGroup($tr);
      if (!href) return;

      var $cell = $tr.children('td').first();
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = BUTTON_CLASS;
      btn.textContent = 'Edit';
      btn.setAttribute('data-href', href);
      $cell.append(btn);
    });
  }

  // ── Auto-select Survey Request in Add DOC_photo modal (view_3563) ───
  var ADD_PHOTO_VIEW = 'view_3563';

  function waitForFieldAndSelect(srId, attempts) {
    if (attempts <= 0) return;
    var $form = $('#' + ADD_PHOTO_VIEW);
    var $select = $('#' + ADD_PHOTO_VIEW + '-field_2423');
    var $option = $select.find('option[value="' + srId + '"]');
    if ($option.length) {
      // Select the option in the chosen widget
      $option.prop('selected', true);
      $select.trigger('chosen:updated').trigger('change');
      // Also set the hidden connection input that Knack actually submits
      $form.find('input.connection[name="field_2423"]').val(srId);
    } else {
      setTimeout(function () { waitForFieldAndSelect(srId, attempts - 1); }, 250);
    }
  }

  // ── Click handler (delegated) ───────────────────────────────────────
  $(document)
    .off('click' + EVENT_NS, '.' + BUTTON_CLASS)
    .on('click' + EVENT_NS, '.' + BUTTON_CLASS, function (e) {
      e.preventDefault();
      e.stopPropagation();
      var href = $(this).attr('data-href');
      if (!href) return;

      // Grab the SR record ID from the current page URL before navigating
      var srMatch = (window.location.hash || '').match(/site-survey-request-details\/([a-f0-9]{24})/);
      var srId = srMatch ? srMatch[1] : '';

      window.location.hash = href.replace(/^#/, '');

      // Poll for the form + chosen options to be ready (up to ~5 seconds)
      if (srId) {
        waitForFieldAndSelect(srId, 20);
      }
    });

  // ── Init on view render ─────────────────────────────────────────────
  injectCssOnce();

  $(document).on('knack-view-render.' + VIEW_ID, function () {
    addButtons();
  });
})();
/*************  Edit Button on Grouped Headers – view_3561  **************************/
