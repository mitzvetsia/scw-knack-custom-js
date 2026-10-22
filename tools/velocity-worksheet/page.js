/* Velocity Worksheet page wiring: shared store (db), settings, outlooks, decisions, tabs, filters. */
(function () {
  'use strict';
  var C = window.VelocityCore, DATA = window.VELOCITY_DATA, custs = DATA.customers;
  var state = { settings: Object.assign({}, C.DEFAULT_SETTINGS), outlooks: {}, decisions: {}, store: 'connecting' };
  var results = C.computeAll(DATA, state.settings, state.outlooks);
  var ui = { tab: 'plan', q: '', type: '', supplier: '', only: 'all', sort: 'cover', notMaster: false, expanded: {}, cq: '' };
  var db = null, pendingRender = false, timers = {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  try { var t = localStorage.getItem('vw:tab'); if (t) ui.tab = t; } catch (e) {}
  if (location.hash && /^#(plan|drivers|customers|method)$/.test(location.hash)) ui.tab = location.hash.slice(1);

  /* ---------- rendering ---------- */
  function editing() { var a = document.activeElement; return a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName)) && a.closest('main'); }
  function render(force) {
    if (!force && editing()) { pendingRender = true; return; }
    pendingRender = false;
    results = C.computeAll(DATA, state.settings, state.outlooks);
    var tb = $('#plan-body');
    tb.innerHTML = DATA.skus.map(function (s) { return C.renderPlanRow(s, results[s.sku], DATA, state.decisions[s.sku]); }).join('');
    Object.keys(ui.expanded).forEach(function (sku) { if (ui.expanded[sku]) openDetail(sku, true); });
    $('#drivers-list').innerHTML = C.renderDriversTab(DATA, results, custs);
    $('#cust-body').innerHTML = C.renderCustomersTab(DATA, results, custs);
    renderStats(); applyFilters(); applyCustFilter(); syncSettingsUI();
  }
  function renderStats() {
    var st = C.stats(DATA, results);
    $('#st-skus').textContent = C.fmt(st.skus);
    $('#st-u12').textContent = C.fmt(st.u12);
    $('#st-drv').textContent = C.fmt(st.drivers);
    $('#st-drv-n').textContent = st.unknown ? st.unknown + ' not yet assessed' : 'all assessed';
    $('#st-low').textContent = C.fmt(st.low);
    $('#st-order').textContent = C.fmt(st.orderSkus);
    $('#st-cost').textContent = C.money(st.cost);
    var tab = $('#tab-drivers-n'); if (tab) tab.textContent = st.drivers;
  }
  function openDetail(sku, silent) {
    var row = $('tr.prow[data-sku="' + CSS.escape(sku) + '"]'); if (!row) return;
    var s = DATA.skus.filter(function (x) { return x.sku === sku; })[0];
    var old = row.nextElementSibling; if (old && old.classList.contains('det')) old.remove();
    row.insertAdjacentHTML('afterend', C.renderDetail(s, results[sku], DATA, custs));
    row.setAttribute('data-open', '1'); ui.expanded[sku] = true;
  }
  function closeDetail(sku) {
    var row = $('tr.prow[data-sku="' + CSS.escape(sku) + '"]'); if (!row) return;
    var d = row.nextElementSibling; if (d && d.classList.contains('det')) d.remove();
    row.removeAttribute('data-open'); delete ui.expanded[sku];
  }

  /* ---------- filters / sort (local) ---------- */
  function applyFilters() {
    var rows = $$('#plan-body tr.prow'), shown = 0;
    rows.forEach(function (r) {
      var ok = true;
      if (!ui.notMaster && r.dataset.status === 'NOT IN MASTER') ok = false;
      if (ui.q && r.dataset.name.indexOf(ui.q) < 0) ok = false;
      if (ui.type && r.dataset.type !== ui.type) ok = false;
      if (ui.supplier && r.dataset.supplier !== ui.supplier) ok = false;
      if (ui.only === 'order' && !(+r.dataset.sug > 0)) ok = false;
      if (ui.only === 'low' && !(+r.dataset.cover < 3)) ok = false;
      if (ui.only === 'drivers' && !(+r.dataset.drv > 0)) ok = false;
      if (ui.only === 'undecided' && (r.dataset.dec || !(+r.dataset.sug > 0))) ok = false;
      if (ui.only === 'decided' && !r.dataset.dec) ok = false;
      r.hidden = !ok; var d = r.nextElementSibling; if (d && d.classList.contains('det')) d.hidden = !ok;
      if (ok) shown++;
    });
    var key = ui.sort, tb = $('#plan-body');
    var pairs = rows.map(function (r) { var d = r.nextElementSibling; return { r: r, d: d && d.classList.contains('det') ? d : null }; });
    pairs.sort(function (a, b) {
      var x = a.r.dataset, y = b.r.dataset;
      if (key === 'cover') return (+x.cover) - (+y.cover) || (+y.u12) - (+x.u12);
      if (key === 'sug') return (+y.sug) - (+x.sug) || (+y.u12) - (+x.u12);
      if (key === 'u12') return (+y.u12) - (+x.u12);
      if (key === 'drv') return (+y.drv) - (+x.drv) || (+y.u12) - (+x.u12);
      if (key === 'supplier') return (x.supplier || '~').localeCompare(y.supplier || '~') || (+x.cover) - (+y.cover) || (+y.u12) - (+x.u12);
      return x.name < y.name ? -1 : x.name > y.name ? 1 : 0;
    });
    pairs.forEach(function (p) { tb.appendChild(p.r); if (p.d) tb.appendChild(p.d); });
    $('#plan-count').textContent = shown + ' of ' + rows.length + ' SKUs';
  }
  function applyCustFilter() {
    var q = ui.cq, n = 0;
    $$('#cust-body tr').forEach(function (r) { var ok = !q || r.dataset.cname.indexOf(q) >= 0; r.hidden = !ok; if (ok) n++; });
    $('#cust-count').textContent = n + ' customers';
  }
  function setTab(t) {
    ui.tab = t; document.body.setAttribute('data-tab', t);
    $$('.tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t ? 'true' : 'false'); });
    try { localStorage.setItem('vw:tab', t); } catch (e) {}
  }

  /* ---------- shared store ---------- */
  function syncSettingsUI() {
    var s = state.settings;
    [['set-share', 'sharePct'], ['set-min', 'minUnits'], ['set-horizon', 'horizon']].forEach(function (p) {
      var el = $('#' + p[0]); if (el && document.activeElement !== el) el.value = s[p[1]];
    });
    $$('[data-bl]').forEach(function (b) { b.classList.toggle('on', b.dataset.bl === String(s.baseline)); });
    $('#rule-text').textContent = 'A customer is a driver on a SKU when they bought ≥ ' + s.sharePct + '% of its 12‑month units and ≥ ' + s.minUnits + ' units.';
  }
  function setStoreState(st, msg) {
    state.store = st; var el = $('#store-chip'); el.className = 'chip store ' + st; el.textContent = msg;
  }
  function writeSettings() {
    syncSettingsUI(); render(true);
    if (!db) return;
    db.doc('settings/main').set(Object.assign({}, state.settings, { updatedAt: new Date().toISOString() })).catch(onWriteError);
  }
  function writeOutlook(key) {
    var o = state.outlooks[key] || {}; render();
    if (!db) return;
    db.doc('outlook/' + C.docId(key)).set(Object.assign({ key: key }, o, { updatedAt: new Date().toISOString() })).catch(onWriteError);
  }
  function writeDecision(sku) {
    var d = state.decisions[sku] || {}; render();
    if (!db) return;
    db.doc('decisions/' + C.docId(sku)).set(Object.assign({ sku: sku }, d, { updatedAt: new Date().toISOString() })).catch(onWriteError);
  }
  function onWriteError(e) {
    var code = e && e.code;
    if (code === 'unavailable') setStoreState('warn', 'Save failed, retrying on next change');
    else if (code === 'resource_exhausted') setStoreState('warn', 'Saving too fast, slow down');
    else setStoreState('off', 'Not saving (' + (code || 'error') + ')');
  }
  function connect() {
    if (!window.claude || typeof window.claude.use !== 'function') { setStoreState('off', 'Local only: edits are not saved here'); return; }
    window.claude.use('db').then(function (d) {
      if (!d) { setStoreState('off', 'Local only: edits are not saved here'); return; }
      db = d; setStoreState('ok', 'Saved for everyone');
      db.doc('settings/main').onSnapshot(function (snap) {
        if (snap.exists) {
          var v = snap.data(), s = state.settings;
          ['sharePct', 'minUnits', 'horizon'].forEach(function (k) { if (v[k] != null && v[k] !== '') s[k] = Number(v[k]); });
          if (v.baseline) s.baseline = String(v.baseline);
          syncSettingsUI(); render();
        }
      }, onSubError);
      db.collection('outlook').onSnapshot(function (snap) {
        var o = {}; snap.docs.forEach(function (doc) { var v = doc.data(); if (v && v.key) o[v.key] = v; });
        state.outlooks = o; render();
      }, onSubError);
      db.collection('decisions').onSnapshot(function (snap) {
        var o = {}; snap.docs.forEach(function (doc) { var v = doc.data(); if (v && v.sku) o[v.sku] = v; });
        state.decisions = o; render();
      }, onSubError);
    });
  }
  function onSubError(e) { setStoreState('off', 'Live updates stopped (' + (e && e.code || 'error') + ')'); }

  /* ---------- events ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, a'); if (!t) return;
    if (t.dataset.t) { setTab(t.dataset.t); return; }
    if (t.dataset.expand) { var sku = t.dataset.expand; if (ui.expanded[sku] && t.classList.contains('tgl')) closeDetail(sku); else { openDetail(sku); setTab('plan'); } return; }
    if (t.dataset.bl) { state.settings.baseline = t.dataset.bl; writeSettings(); return; }
    if (t.classList.contains('dec')) {
      var order = ['', 'order', 'hold', 'watch', 'skip'], cur = t.dataset.dec || '', next = order[(order.indexOf(cur) + 1) % order.length];
      var sk = t.dataset.sku; state.decisions[sk] = Object.assign({}, state.decisions[sk], { status: next });
      t.dataset.dec = next; t.textContent = C.DECISION_LABEL[next]; t.closest('tr').dataset.dec = next; writeDecision(sk); return;
    }
    if (t.dataset.ol && t.dataset.st) {
      var k = t.dataset.ol; state.outlooks[k] = Object.assign({}, state.outlooks[k], { key: k, status: t.dataset.st });
      writeOutlook(k); return;
    }
    if (t.id === 'reset-rule') { state.settings = Object.assign({}, C.DEFAULT_SETTINGS); writeSettings(); return; }
    if (t.id === 'expand-all' || t.id === 'collapse-all') {
      $$('#plan-body tr.prow').forEach(function (r) { if (r.hidden) return; if (t.id === 'expand-all') openDetail(r.dataset.sku); else closeDetail(r.dataset.sku); });
      return;
    }
  });
  function debounce(id, fn) { clearTimeout(timers[id]); timers[id] = setTimeout(fn, 600); }
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.id === 'plan-q') { ui.q = el.value.trim().toLowerCase(); applyFilters(); return; }
    if (el.id === 'cust-q') { ui.cq = el.value.trim().toLowerCase(); applyCustFilter(); return; }
    if (el.id === 'set-share' || el.id === 'set-min' || el.id === 'set-horizon') {
      debounce(el.id, function () {
        var v = Number(el.value); if (isNaN(v) || v < 0) return;
        state.settings[{ 'set-share': 'sharePct', 'set-min': 'minUnits', 'set-horizon': 'horizon' }[el.id]] = v; writeSettings();
      }); return;
    }
    if (el.classList.contains('qty')) { var sk = el.dataset.sku; state.decisions[sk] = Object.assign({}, state.decisions[sk], { qty: el.value === '' ? null : Number(el.value) }); debounce('qty' + sk, function () { writeDecision(sk); }); return; }
    if (el.classList.contains('olrate') || el.classList.contains('olend')) {
      var k = el.dataset.ol, patch = el.classList.contains('olrate') ? { rate: el.value === '' ? null : Number(el.value) } : { endMonth: el.value || null };
      state.outlooks[k] = Object.assign({ key: k, status: 'unknown' }, state.outlooks[k], patch);
      debounce('ol' + k, function () { writeOutlook(k); }); return;
    }
    if (el.dataset.noteSku) { var s2 = el.dataset.noteSku; state.decisions[s2] = Object.assign({}, state.decisions[s2], { note: el.textContent }); debounce('note' + s2, function () { writeDecision(s2); }); return; }
    if (el.dataset.olnote) { var k2 = el.dataset.olnote; state.outlooks[k2] = Object.assign({ key: k2, status: 'unknown' }, state.outlooks[k2], { note: el.textContent }); debounce('oln' + k2, function () { writeOutlook(k2); }); return; }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.id === 'plan-type') { ui.type = el.value; applyFilters(); }
    if (el.id === 'plan-supplier') { ui.supplier = el.value; applyFilters(); }
    if (el.id === 'plan-only') { ui.only = el.value; applyFilters(); }
    if (el.id === 'plan-sort') { ui.sort = el.value; applyFilters(); }
    if (el.id === 'plan-nm') { ui.notMaster = el.checked; applyFilters(); }
  });
  document.addEventListener('focusout', function () { setTimeout(function () { if (pendingRender && !editing()) render(); }, 50); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target.isContentEditable) { ev.preventDefault(); ev.target.blur(); } });

  setTab(ui.tab); syncSettingsUI(); renderStats(); applyFilters(); applyCustFilter();
  connect();
})();
