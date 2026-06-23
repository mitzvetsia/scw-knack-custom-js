/*** SUB-BID DIFF — RENDER ***************************************************/
(function () {
  'use strict';

  var ns = window.SCW.subBidDiff;
  if (!ns || !ns.CONFIG) return;
  var C = ns.CONFIG, T = C.TIERS;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  function money(n) {
    var neg = n < 0;
    var v = Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '-$' : '$') + v;
  }
  function signedMoney(n) {
    if (!n) return '$0.00';
    return (n > 0 ? '+' : '-') + '$' +
      Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** State the user can flip without a full data re-read. */
  var overridePkgId = '';
  var hideCovered = true;

  function baselinePicker(ranked, baselineId) {
    var opts = ranked.map(function (r) {
      var bits = [r.name];
      if (r.status) bits.push(r.status);
      bits.push(r.overlap + '/' + r.items + ' on SOW');
      if (r.complete) bits.push('✓ complete');
      return '<option value="' + esc(r.pkgId) + '"' +
        (r.pkgId === baselineId ? ' selected' : '') + '>' +
        esc(bits.join(' · ')) + '</option>';
    }).join('');
    return '<div class="scw-sbd-baseline">' +
      '<label for="scw-sbd-baseline-sel">Baseline bid:</label>' +
      '<select id="scw-sbd-baseline-sel" data-scw-sbd-baseline>' + opts + '</select>' +
      '<span class="scw-sbd-baseline__meta">auto-picked by most overlap with this SOW' +
        ' · override if wrong</span>' +
      '</div>';
  }

  function tallyHeader(diff) {
    var t = diff.tally;
    function stat(n, label, cls) {
      return '<div class="scw-sbd-stat ' + (cls || '') + '">' +
        '<span class="scw-sbd-stat__n">' + n + '</span>' +
        '<span class="scw-sbd-stat__l">' + esc(label) + '</span></div>';
    }
    var d = diff.laborDelta;
    var dCls = Math.abs(d) <= C.moneyEps ? 'zero' : (d > 0 ? 'pos' : 'neg');
    var deltaStat = '<div class="scw-sbd-stat scw-sbd-stat--delta">' +
      '<span class="scw-sbd-stat__n ' + dCls + '">' + signedMoney(d) + '</span>' +
      '<span class="scw-sbd-stat__l">labor Δ (SOW − sub)</span></div>';

    return '<div class="scw-sbd-tally">' +
      stat(t.material, 'Labor change') +
      stat(t.added, 'Not bid') +
      stat(t.orphan, 'Bid only') +
      stat(t.spec, 'Spec change') +
      stat(t.covered, 'Covered') +
      deltaStat +
      '</div>';
  }

  function coverageFlag(diff) {
    if (diff.coverageGaps > 0) {
      return '<div class="scw-sbd-flag scw-sbd-flag--gap">' +
        '⚠️ ' + diff.coverageGaps + ' coverage gap' + (diff.coverageGaps === 1 ? '' : 's') +
        ' — SOW lines with no bid, or bid lines with no SOW. Review before publishing.</div>';
    }
    if (!diff.hasIssues) {
      return '<div class="scw-sbd-flag scw-sbd-flag--ok">' +
        '✓ Every SOW line is covered and no material labor changes.</div>';
    }
    return '';
  }

  function badge(tier) {
    var def = T[tier] || T.covered;
    return '<span class="scw-sbd-badge" style="background:' + def.color + '">' +
      esc(def.label) + '</span>';
  }

  function deltaCell(n) {
    if (Math.abs(n) <= C.moneyEps) return '<td class="scw-sbd-num scw-sbd-delta-zero">—</td>';
    var cls = n > 0 ? 'scw-sbd-delta-pos' : 'scw-sbd-delta-neg';
    return '<td class="scw-sbd-num ' + cls + '">' + signedMoney(n) + '</td>';
  }

  function rowHtml(r) {
    return '<tr class="scw-sbd-row scw-sbd-row--' + r.tier + '">' +
      '<td>' + badge(r.tier) + '</td>' +
      '<td><div class="scw-sbd-label">' + esc(r.label || '(no label)') + '</div>' +
        (r.product ? '<div class="scw-sbd-product">' + esc(r.product) + '</div>' : '') +
        (r.mdfIdf ? '<div class="scw-sbd-mdf">' + esc(r.mdfIdf) + '</div>' : '') + '</td>' +
      '<td class="scw-sbd-num">' + money(r.sowLabor) + '</td>' +
      '<td class="scw-sbd-num">' + money(r.bidLabor) + '</td>' +
      deltaCell(r.delta) +
      '</tr>';
  }

  function table(diff) {
    if (!diff.rows.length) {
      return '<div class="scw-sbd-empty">No line items to compare.</div>';
    }
    var body = diff.rows.map(rowHtml).join('');
    return '<table class="scw-sbd-table"><thead><tr>' +
      '<th>Status</th><th>Line item</th>' +
      '<th class="scw-sbd-num">SOW labor</th>' +
      '<th class="scw-sbd-num">Sub bid</th>' +
      '<th class="scw-sbd-num">Δ</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>' +
      (diff.tally.covered
        ? '<div class="scw-sbd-toggle" data-scw-sbd-toggle-covered>' +
            (hideCovered ? '▸ Show' : '▾ Hide') + ' ' + diff.tally.covered +
            ' covered (no change) line' + (diff.tally.covered === 1 ? '' : 's') + '</div>'
        : '');
  }

  /** Read source records (off the v2 data layer if present, else direct). */
  function readSources() {
    var keys = [C.bidViewKey, C.sowItemsViewKey, C.bidPkgViewKey];
    var v2 = window.SCW.bidReviewV2 && window.SCW.bidReviewV2.data;
    function read(k) {
      if (v2 && typeof v2.readRecords === 'function') return v2.readRecords(k);
      try {
        var v = Knack.views[k];
        var models = (v && v.model && v.model.data && v.model.data.models) || [];
        return models.map(function (m) { return m.attributes || m.toJSON(); });
      } catch (e) { return []; }
    }
    return { bids: read(keys[0]), sow: read(keys[1]), pkgs: read(keys[2]) };
  }

  function render() {
    var container = document.getElementById(C.mountId);
    if (!container) return;
    var body = container.querySelector('.scw-sbd-body');
    if (!body) return;

    var src = readSources();
    var result = ns.transform.buildDiff(src.bids, src.sow, src.pkgs, overridePkgId);

    if (result.isEmpty) {
      body.innerHTML = '<div class="scw-sbd-empty">No bid packages loaded for this SOW yet.</div>';
      return;
    }
    container.setAttribute('data-hide-covered', hideCovered ? '1' : '0');
    body.innerHTML =
      baselinePickerSafe(result) +
      tallyHeader(result.diff) +
      coverageFlag(result.diff) +
      table(result.diff);
  }

  function baselinePickerSafe(result) {
    try { return baselinePicker(result.ranked, result.baselineId); }
    catch (e) { return ''; }
  }

  // ── delegated interactions (bound once) ────────────────────────────────
  function bindOnce() {
    if (document.documentElement.hasAttribute('data-scw-sbd-bound')) return;
    document.documentElement.setAttribute('data-scw-sbd-bound', '1');

    document.addEventListener('change', function (e) {
      var sel = e.target.closest && e.target.closest('[data-scw-sbd-baseline]');
      if (!sel) return;
      overridePkgId = sel.value || '';
      render();
    });
    document.addEventListener('click', function (e) {
      var tog = e.target.closest && e.target.closest('[data-scw-sbd-toggle-covered]');
      if (!tog) return;
      hideCovered = !hideCovered;
      render();
    });
  }

  ns.render = { render: render, bindOnce: bindOnce };
})();
/*** END SUB-BID DIFF — RENDER ***********************************************/
