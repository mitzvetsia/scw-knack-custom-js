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
