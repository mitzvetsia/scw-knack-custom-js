
(function () {
  const applyCheckboxGrid = () => {
    document.querySelectorAll('#connection-picker-checkbox-field_739').forEach(container => {
      if (!container.classList.contains('multi-column-processed')) {
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(4, 1fr)';
        container.style.gap = '0.5em';
        container.classList.add('multi-column-processed');

        container.querySelectorAll('.control').forEach(ctrl => {
          ctrl.style.marginBottom = '0.25em';
        });
      }
    });
  };

  // MutationObserver to watch for popups / form changes
  const observer = new MutationObserver(() => applyCheckboxGrid());

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Apply once on DOM ready
  document.addEventListener('DOMContentLoaded', applyCheckboxGrid);
})();


