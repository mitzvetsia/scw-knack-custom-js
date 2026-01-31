////************* HIGHLIGHT DUPLICATE CELLS view_3313 - BUILD SOW PAGE  ***************//////


$(document).on('knack-view-render.view_3313', function () {

  const FIELD_KEY = 'field_1950';
  const DUP_BG = '#ffe2e2'; // light red highlight

  const valueMap = {};

  // Gather values from the column
  $('#view_3313 td.' + FIELD_KEY).each(function () {
    const value = $(this).text().trim();

    if (!value) return;

    if (!valueMap[value]) {
      valueMap[value] = [];
    }

    valueMap[value].push(this);
  });

  // Highlight duplicates
  Object.keys(valueMap).forEach(value => {
    if (valueMap[value].length > 1) {
      valueMap[value].forEach(cell => {
        $(cell).css({
          'background-color': DUP_BG,
          'font-weight': '600'
        });
      });
    }
  });

});
////************* HIGHLIGHT DUPLICATE CELLS view_3313 - BUILD SOW PAGE  ***************//////
