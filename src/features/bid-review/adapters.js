/*** BID REVIEW — KNACK ADAPTERS ***/
/**
 * Reads raw record arrays from a single Knack view.
 * Each record is one "cell" (package × SOW item intersection).
 * The transform layer pivots these into rows.
 *
 * Reads : SCW.bidReview.CONFIG
 * Writes: SCW.bidReview.loadRawData() → { records: [] }
 */
(function () {
  'use strict';

  var ns  = (window.SCW.bidReview = window.SCW.bidReview || {});
  var CFG = ns.CONFIG;

  /**
   * Find a Knack model by its view key.
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
   */
  function extractRecords(model) {
    if (!model) return [];

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
   * Fallback: paginated fetch via Knack REST API.
   * Returns a jQuery Deferred resolving to an array of records.
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
                '&rows_per_page=1000';

      SCW.knackAjax({
        url: url,
        type: 'GET',
        success: function (resp) {
          var records = resp.records || [];
          allRecords = allRecords.concat(records);

          if (records.length === 1000 && page < maxPages) {
            page++;
            fetchPage();
          } else {
            deferred.resolve(allRecords);
          }
        },
        error: function (xhr) {
          console.error('[BidReview] Failed to fetch ' + viewKey +
                        ' page ' + page, xhr.status);
          deferred.resolve(allRecords);
        },
      });
    }

    fetchPage();
    return deferred.promise();
  }

  /**
   * Load ALL records from a single view via the REST API.
   * Always fetches from the API with rows_per_page=1000 to avoid
   * incomplete data from Knack's model cache (default 25 per page).
   * Returns a jQuery Deferred resolving to an array of records.
   */
  function loadView(viewKey) {
    return fetchFromApi(viewKey).then(function (recs) {
      if (CFG.debug) {
        console.log('[BidReview] API records from ' + viewKey + ':', recs.length);
      }
      return recs;
    });
  }

  /**
   * loadRawData() → jQuery.Deferred → { records: [], sowItems: [] }
   *
   * Loads bid records from view_3680 and unbid SOW items from view_3728.
   */
  ns.loadRawData = function loadRawData() {
    var bidPromise     = loadView(CFG.viewKey);
    var sowItemPromise = loadView(CFG.sowItemsViewKey);

    return $.when(bidPromise, sowItemPromise).then(function (bidRecs, sowRecs) {
      if (CFG.debug) {
        console.log('[BidReview] Loaded', bidRecs.length, 'bid records,',
                    sowRecs.length, 'unbid SOW items');
      }
      return { records: bidRecs, sowItems: sowRecs };
    });
  };

})();
