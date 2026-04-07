/*** BID REVIEW — KNACK ADAPTERS ***/
/**
 * Reads raw record arrays from the Knack runtime.
 * Isolates all Knack.models / Knack.views access so the rest of
 * the feature never touches Knack internals directly.
 *
 * Reads : SCW.bidReview.CONFIG
 * Writes: SCW.bidReview.loadRawData() → { rows, cells }
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  /**
   * Find a Knack model by its view key.
   * Knack stores models keyed by an internal key that often differs
   * from the view key, so we iterate and match on view_key.
   */
  function findModel(viewKey) {
    if (typeof Knack === 'undefined' || !Knack.models) return null;

    var keys = Object.keys(Knack.models);
    for (var i = 0; i < keys.length; i++) {
      var m = Knack.models[keys[i]];
      if (m && m.view && m.view.key === viewKey) return m;
    }
    return null;
  }

  /**
   * Extract records from a Knack model.
   * Handles both .data (array) and .toJSON().records patterns.
   */
  function extractRecords(model) {
    if (!model) return [];

    // Preferred: model.data is a Backbone collection or plain array
    if (model.data) {
      if (Array.isArray(model.data)) return model.data;
      if (typeof model.data.toJSON === 'function') return model.data.toJSON();
      if (model.data.models && Array.isArray(model.data.models)) {
        return model.data.models.map(function (m) {
          return typeof m.toJSON === 'function' ? m.toJSON() : m.attributes || m;
        });
      }
    }

    return [];
  }

  /**
   * Fallback: fetch records via Knack REST API for a view.
   * Returns a jQuery Deferred that resolves to an array of records.
   * Paginates automatically up to 10 pages (1 000 records).
   */
  function fetchFromApi(viewKey) {
    var deferred = $.Deferred();

    if (typeof Knack === 'undefined') {
      deferred.resolve([]);
      return deferred.promise();
    }

    var allRecords = [];
    var page = 1;
    var maxPages = 10;

    function fetchPage() {
      var url = Knack.api_url + '/v1/pages/' + CFG.sceneKey +
                '/views/' + viewKey + '/records?page=' + page +
                '&rows_per_page=100';

      SCW.knackAjax({
        url: url,
        type: 'GET',
        success: function (resp) {
          var records = resp.records || [];
          allRecords = allRecords.concat(records);

          if (records.length === 100 && page < maxPages) {
            page++;
            fetchPage();
          } else {
            deferred.resolve(allRecords);
          }
        },
        error: function (xhr) {
          console.error('[BidReview] Failed to fetch ' + viewKey +
                        ' page ' + page, xhr.status);
          // Return whatever we have so far
          deferred.resolve(allRecords);
        },
      });
    }

    fetchPage();
    return deferred.promise();
  }

  /**
   * loadRawData() → jQuery.Deferred → { rows: [], cells: [] }
   *
   * Tries Knack.models first (synchronous, fast).
   * Falls back to REST API fetch if models are empty.
   */
  ns.loadRawData = function loadRawData() {
    var rowModel  = findModel(CFG.rowViewKey);
    var cellModel = findModel(CFG.cellViewKey);

    var rows  = extractRecords(rowModel);
    var cells = extractRecords(cellModel);

    if (CFG.debug) {
      console.log('[BidReview] Model rows:', rows.length,
                  'cells:', cells.length);
    }

    // If both have data, return synchronously (wrapped in resolved deferred)
    if (rows.length > 0 && cells.length > 0) {
      return $.Deferred().resolve({ rows: rows, cells: cells }).promise();
    }

    // Fall back to API fetch for whichever is missing
    var rowPromise  = rows.length  > 0
      ? $.Deferred().resolve(rows).promise()
      : fetchFromApi(CFG.rowViewKey);

    var cellPromise = cells.length > 0
      ? $.Deferred().resolve(cells).promise()
      : fetchFromApi(CFG.cellViewKey);

    return $.when(rowPromise, cellPromise).then(function (r, c) {
      return { rows: r, cells: c };
    });
  };

})();
