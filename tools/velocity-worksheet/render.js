/* node render.js <data.json> <out.html> — bakes the Velocity Worksheet page. */
'use strict';
const fs = require('fs'), path = require('path');
require('./core.js');
const C = globalThis.VelocityCore;
const DATA = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const OUT = process.argv[3];
const coreSrc = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

const S = C.DEFAULT_SETTINGS;
const results = C.computeAll(DATA, S, {});
const custs = DATA.customers;
const st = C.stats(DATA, results);
const esc = C.esc, fmt = C.fmt, money = C.money;
const asOfLabel = C.monthLabel(DATA.asOf), firstLabel = C.monthLabel(DATA.months[0]);
const types = Array.from(new Set(DATA.skus.map(s => s.type).filter(Boolean))).sort();
const notMaster = DATA.skus.filter(s => s.status === 'NOT IN MASTER').sort((a, b) => b.total - a.total);
const unresolvedCusts = Object.keys(custs).filter(k => custs[k].kind === 'order');
const unresolvedUnits = DATA.skus.reduce((n, s) => n + s.customers.filter(c => custs[c.cid] && custs[c.cid].kind === 'order').reduce((m, c) => m + c.total, 0), 0);
const builtLabel = new Date(DATA.built + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const css = `
/* Layout: one working table, summary tiles above, shared rule bar, four tabs. */
:root{
  --bg:#f3f4f1; --surface:#ffffff; --surface2:#e9ece7; --ink:#1c2328; --ink2:#5f6b70; --line:#d5dbd6;
  --accent:#2b5f8c; --accent-soft:#e0eaf3; --accent-ink:#1f4a70;
  --crit:#a33a2c; --crit-soft:#f6e4e0; --warn:#8c5a0b; --warn-soft:#f6ecd5; --ok:#24705a; --ok-soft:#dfefe8;
  --mut-soft:#e6e9e5; --drv:#6b4ea8; --drv-soft:#ece6f6;
  --font:"IBM Plex Sans",system-ui,-apple-system,sans-serif; --mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
  --shadow:0 1px 2px rgba(28,35,40,.05),0 4px 14px rgba(28,35,40,.06);
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#15191b; --surface:#1d2326; --surface2:#252c30; --ink:#e3e8e6; --ink2:#97a3a6; --line:#2f383c;
  --accent:#7fb0dc; --accent-soft:#1d3144; --accent-ink:#9cc3e6;
  --crit:#e27a6a; --crit-soft:#3b231f; --warn:#d9a24e; --warn-soft:#3a2f12; --ok:#6cc3a6; --ok-soft:#1c3630;
  --mut-soft:#2a3236; --drv:#b59ae6; --drv-soft:#2d2540;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.25); color-scheme:dark } }
:root[data-theme="dark"]{
  --bg:#15191b; --surface:#1d2326; --surface2:#252c30; --ink:#e3e8e6; --ink2:#97a3a6; --line:#2f383c;
  --accent:#7fb0dc; --accent-soft:#1d3144; --accent-ink:#9cc3e6;
  --crit:#e27a6a; --crit-soft:#3b231f; --warn:#d9a24e; --warn-soft:#3a2f12; --ok:#6cc3a6; --ok-soft:#1c3630;
  --mut-soft:#2a3236; --drv:#b59ae6; --drv-soft:#2d2540;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 4px 14px rgba(0,0,0,.25); color-scheme:dark }
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:400 14.5px/1.5 var(--font)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--bg)}
.wrap{max-width:1400px;margin:0 auto;padding-block:28px 80px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.eyebrow{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.12em;text-transform:uppercase;color:var(--ink2)}
h1{font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-.015em;margin:8px 0 6px;text-wrap:balance}
h2{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:0 0 6px;text-wrap:balance}
h3{font-size:15px;font-weight:600;margin:14px 0 4px}
p{max-width:72ch}
.sub{color:var(--ink2);font-size:12px;margin-top:1px}
.lede{color:var(--ink2);margin:4px 0 16px;max-width:80ch}
.id,.mono{font-family:var(--mono)}
.dim{color:var(--ink2)} .ok{color:var(--ok)} .warn{color:var(--warn)}
a{color:var(--accent)}
a.hs{font-size:11.5px;font-weight:500;text-decoration:none;border-bottom:1px dashed var(--accent)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:18px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 16px 10px}
.stat .lb{font-family:var(--mono);font-size:10.5px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2)}
.stat .v{font-family:var(--mono);font-size:22px;font-weight:600;letter-spacing:-.02em;margin-top:3px;font-variant-numeric:tabular-nums}
.stat .n{font-size:12px;color:var(--ink2);margin-top:1px}
.chip{display:inline-flex;align-items:center;gap:4px;font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:99px;white-space:nowrap;vertical-align:middle}
.chip.up{background:var(--ok-soft);color:var(--ok)} .chip.down{background:var(--crit-soft);color:var(--crit)} .chip.flat{background:var(--mut-soft);color:var(--ink2)}
.chip.mut{background:var(--mut-soft);color:var(--ink2)} .chip.warn{background:var(--warn-soft);color:var(--warn)} .chip.drv{background:var(--drv-soft);color:var(--drv)}
.chip.store.ok{background:var(--ok-soft);color:var(--ok)} .chip.store.warn{background:var(--warn-soft);color:var(--warn)} .chip.store.off{background:var(--crit-soft);color:var(--crit)} .chip.store.connecting{background:var(--mut-soft);color:var(--ink2)}
/* rule bar (shared settings) */
.rulebar{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-top:22px;box-shadow:var(--shadow)}
.rulebar .hd{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;margin-bottom:10px}
.rulebar .hd h2{margin:0;font-size:16px}
.rulegrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 22px}
.rule label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink2)}
.rule .lb{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2)}
.rule .ctl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rule input[type=number]{font:inherit;font-family:var(--mono);font-size:15px;width:84px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:6px 10px}
.rule input:focus-visible,.filters input:focus-visible,.filters select:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.rule .unit{font-size:13px;color:var(--ink2)}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{font:inherit;font-size:12.5px;font-weight:500;padding:6px 12px;border:none;background:var(--surface);color:var(--ink2);cursor:pointer;border-right:1px solid var(--line)}
.seg button:last-child{border-right:none} .seg button.on{background:var(--accent);color:#fff}
.rule .help{font-size:12.5px;color:var(--ink2);max-width:40ch}
#rule-text{font-size:13px;color:var(--ink)}
.linkbtn{font:inherit;font-size:12px;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;text-decoration:underline}
/* tabs */
.tabbar{position:sticky;top:env(safe-area-inset-top,0px);z-index:40;display:flex;gap:8px;flex-wrap:wrap;background:var(--bg);padding:12px 0 10px;border-bottom:2px solid var(--line);margin:18px 0 22px}
.tabbar button{font:inherit;font-size:14px;font-weight:600;border:1px solid var(--line);background:var(--surface);color:var(--ink2);border-radius:99px;padding:7px 18px;cursor:pointer}
.tabbar button:hover{color:var(--accent);border-color:var(--accent)} .tabbar button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.tabbar .cnt{font-family:var(--mono);font-size:11px;opacity:.8;margin-left:4px}
.tabsec{display:none} body[data-tab="plan"] #sec-plan,body[data-tab="drivers"] #sec-drivers,body[data-tab="customers"] #sec-customers,body[data-tab="method"] #sec-method{display:block}
/* filters */
.filters{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin:12px 0}
.filters input[type=search],.filters select{font:inherit;font-size:13px;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 10px}
.filters input[type=search]{flex:1;min-width:200px}
.filters .ck{display:inline-flex;gap:6px;align-items:center;font-size:13px;color:var(--ink2);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer}
.filters .count{font-family:var(--mono);font-size:12px;color:var(--ink2);margin-left:auto}
.filters .mini{font:inherit;font-size:12px;color:var(--ink2);background:none;border:1px solid var(--line);border-radius:8px;padding:5px 10px;cursor:pointer}
/* table */
.tblwrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;background:var(--surface);box-shadow:var(--shadow)}
table{border-collapse:collapse;width:100%;font-size:13px}
th{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);background:var(--surface2);white-space:nowrap;position:sticky;top:0;z-index:2}
td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:none}
td.num,th.num{text-align:right;font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
td.fwd b{font-size:14px}
.skutd{min-width:230px;max-width:320px;display:flex;gap:6px;align-items:flex-start}
.skutd .nm{font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.skutd .ids{display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;margin-top:1px}
.tgl{width:18px;height:18px;flex:0 0 18px;border:none;background:transparent;color:var(--ink2);cursor:pointer;padding:0;margin-top:2px;border-radius:4px}
.tgl::before{content:"▸";display:inline-block;transition:transform .12s} .tgl:hover{color:var(--accent)}
tr.prow[data-open] .tgl::before{transform:rotate(90deg)}
tr.prow[data-open] td{background:var(--accent-soft)}
.spk{display:block} .spk-bar{fill:var(--accent);opacity:.35} .spk-drv{fill:var(--drv)} .spk-base{stroke:var(--line)}
.cov{font-weight:600} .cov.crit{color:var(--crit)} .cov.warn{color:var(--warn)} .cov.ok{color:var(--ok)}
td.sug b{font-size:14px;color:var(--accent-ink)}
.drvbtn{font:inherit;font-family:var(--mono);font-size:12px;font-weight:600;color:var(--drv);background:var(--drv-soft);border:none;border-radius:99px;padding:2px 9px;cursor:pointer}
.drvbtn.unk{outline:1.5px dashed var(--warn);outline-offset:1px} .drvbtn i{font-style:normal;color:var(--warn)}
td.edit input.qty{font:inherit;font-family:var(--mono);font-size:13px;width:76px;text-align:right;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:4px 8px}
td.edit input.qty:focus{border-color:var(--accent);background:var(--surface)}
.dec{font:inherit;font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;border-radius:99px;padding:3px 10px;border:1px dashed var(--line);background:transparent;color:var(--ink2);cursor:pointer;white-space:nowrap}
.dec[data-dec="order"]{background:var(--ok-soft);color:var(--ok);border-style:solid;border-color:transparent}
.dec[data-dec="hold"]{background:var(--warn-soft);color:var(--warn);border-style:solid;border-color:transparent}
.dec[data-dec="watch"]{background:var(--accent-soft);color:var(--accent-ink);border-style:solid;border-color:transparent}
.dec[data-dec="skip"]{background:var(--mut-soft);color:var(--ink2);border-style:solid;border-color:transparent}
tr.prow[data-dec="skip"] td,tr.prow[data-dec="hold"] td{opacity:.75} tr.prow[data-dec] td.dectd,tr.prow[data-dec] td.notetd{opacity:1}
.notetd{min-width:180px;max-width:280px}
.notecell{font-size:12.5px;line-height:1.4;color:var(--ink);min-height:20px;border-radius:6px;padding:2px 6px;outline:none;border:1px dashed transparent;white-space:pre-wrap;overflow-wrap:anywhere}
.notecell:hover{border-color:var(--line)} .notecell:focus{border:1px solid var(--accent);background:var(--surface)}
.notecell:empty::before{content:"add a note…";color:var(--ink2);opacity:.6}
/* detail */
tr.det>td{background:var(--surface2);padding:12px 16px 16px 40px}
.detwrap{display:flex;flex-direction:column;gap:6px;max-width:100%}
.detgrid{display:grid;grid-template-columns:minmax(300px,1.4fr) minmax(260px,1fr);gap:18px 28px;margin-bottom:10px}
.dhead{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2);margin-bottom:6px}
.mchart{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;align-items:end;height:120px}
.mcol{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;min-width:0}
.mbar{position:relative;width:100%;flex:1;display:flex;align-items:flex-end}
.mfill{width:100%;background:var(--accent);opacity:.35;border-radius:3px 3px 0 0}
.mdrv{position:absolute;left:0;right:0;bottom:0;background:var(--drv);border-radius:3px 3px 0 0}
.mval{font-family:var(--mono);font-size:10.5px;color:var(--ink2);margin-top:3px} .mlab{font-size:10.5px;color:var(--ink2)}
.mix{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--ink2);margin-top:8px}
.mathbox{display:grid;gap:4px;font-size:13px} .mathbox .lb{display:inline-block;width:130px;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2)}
.ctbl{font-size:12.5px} .ctbl th{position:static}
/* outlook rows */
.olrow{display:grid;grid-template-columns:minmax(220px,1.3fr) 100px auto auto;gap:8px 16px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-top:8px}
.olwho{min-width:0} .olwho b{overflow-wrap:anywhere}
.olchips{display:flex;flex-wrap:wrap;gap:4px}
.ol{font:inherit;font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;border-radius:99px;padding:3px 10px;border:1px solid var(--line);background:transparent;color:var(--ink2);cursor:pointer}
.ol.on.ol-unknown{background:var(--warn-soft);color:var(--warn);border-color:transparent}
.ol.on.ol-ongoing{background:var(--ok-soft);color:var(--ok);border-color:transparent}
.ol.on.ol-ending{background:var(--accent-soft);color:var(--accent-ink);border-color:transparent}
.ol.on.ol-oneoff{background:var(--mut-soft);color:var(--ink);border-color:transparent}
.olin{display:flex;gap:10px;flex-wrap:wrap} .olin label{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink2)}
.olin input{font:inherit;font-family:var(--mono);font-size:12.5px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:4px 8px;width:86px}
.olin input[type=month]{width:140px}
.oleff{grid-column:1/-1;font-size:12px;color:var(--ink2)} .olnote{grid-column:1/-1}
.dcard{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin-top:12px;box-shadow:var(--shadow)}
.dcard .olrow{border:none;background:var(--surface2);margin-top:6px}
.dcard-hd{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:center;font-size:14px}
.note{background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--ink2);margin-top:12px;max-width:none}
.note b{color:var(--ink)}
ul{padding-left:20px;max-width:80ch} li{margin:4px 0} li::marker{color:var(--accent)}
.method h2{margin-top:26px}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;font-size:13.5px;max-width:80ch} .kv div:nth-child(odd){color:var(--ink2);font-family:var(--mono);font-size:12px}
@media(max-width:760px){h1{font-size:25px}.detgrid{grid-template-columns:1fr}.olrow{grid-template-columns:1fr}.mchart{height:90px}.filters .count{margin-left:0}}
@media(prefers-reduced-motion:reduce){.tgl::before{transition:none}}
`;

const planRows = DATA.skus.map(s => C.renderPlanRow(s, results[s.sku], DATA, {})).join('');
const driversHtml = C.renderDriversTab(DATA, results, custs);
const custHtml = C.renderCustomersTab(DATA, results, custs);

const html = `<title>Velocity Worksheet</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>${css}</style>
<div class="wrap">
<header>
  <span class="eyebrow">SCW purchasing · Shipedge shipments ${esc(firstLabel)} – ${esc(asOfLabel)} · customers resolved through HubSpot · inventory from Adam's velocity sheet · built ${esc(builtLabel)}</span>
  <h1>Velocity Worksheet — what to order, and who is moving the numbers</h1>
  <p class="lede">Every SKU's 12 / 6 / 3‑month velocity from the Shipedge export, with the customers behind the big swings pulled out so you can decide how much of their volume to count forward. Set the driver rule and horizon once (saved for everyone), assess each driver's outlook, then mark a decision and quantity per SKU. Rebuilt monthly after Adam drops the new export; your assessments and decisions carry over.</p>
  <div class="stats">
    <div class="stat"><div class="lb">SKUs in master</div><div class="v" id="st-skus">${fmt(st.skus)}</div><div class="n">${notMaster.length} more shipped but not tracked in the sheet</div></div>
    <div class="stat"><div class="lb">Units shipped, 12 mo</div><div class="v" id="st-u12">${fmt(st.u12)}</div><div class="n">master SKUs, RMA lines excluded</div></div>
    <div class="stat"><div class="lb">Drivers flagged</div><div class="v" id="st-drv">${fmt(st.drivers)}</div><div class="n" id="st-drv-n">${st.unknown ? st.unknown + ' not yet assessed' : 'all assessed'}</div></div>
    <div class="stat"><div class="lb">Under 3 months cover</div><div class="v" id="st-low">${fmt(st.low)}</div><div class="n">on hand + on order vs forward velocity</div></div>
    <div class="stat"><div class="lb">SKUs with a suggested order</div><div class="v" id="st-order">${fmt(st.orderSkus)}</div><div class="n">at the current horizon</div></div>
    <div class="stat"><div class="lb">Suggested order cost</div><div class="v" id="st-cost">${money(st.cost)}</div><div class="n">case‑rounded, at sheet cost</div></div>
  </div>
</header>

<section class="rulebar" aria-label="Shared settings">
  <div class="hd"><h2>Rule &amp; horizon</h2><span id="store-chip" class="chip store connecting">Connecting…</span><span id="rule-text">A customer is a driver on a SKU when they bought ≥ ${S.sharePct}% of its 12‑month units and ≥ ${S.minUnits} units.</span><button type="button" id="reset-rule" class="linkbtn">reset to defaults</button></div>
  <div class="rulegrid">
    <div class="rule"><span class="lb">Driver rule · share of SKU</span><div class="ctl"><input type="number" id="set-share" min="0" max="100" step="1" value="${S.sharePct}" aria-label="Minimum share of 12-month units"><span class="unit">% of the SKU's 12‑month units</span></div><div class="help">Catches customers who dominate a SKU.</div></div>
    <div class="rule"><span class="lb">Driver rule · minimum units</span><div class="ctl"><input type="number" id="set-min" min="0" step="1" value="${S.minUnits}" aria-label="Minimum units"><span class="unit">units in 12 months</span></div><div class="help">Stops a 1‑of‑2‑unit buyer on a slow part from being flagged.</div></div>
    <div class="rule"><span class="lb">Baseline velocity window</span><div class="ctl"><span class="seg"><button type="button" data-bl="3">3 mo</button><button type="button" data-bl="6" class="on">6 mo</button><button type="button" data-bl="12">12 mo</button><button type="button" data-bl="blend">Blend</button></span></div><div class="help">The monthly rate carried forward after driver adjustments. Blend = ½·3mo + ⅓·6mo + ⅕·12mo.</div></div>
    <div class="rule"><span class="lb">Order horizon</span><div class="ctl"><input type="number" id="set-horizon" min="1" max="24" step="1" value="${S.horizon}" aria-label="Order horizon in months"><span class="unit">months of forward demand to cover</span></div><div class="help">Suggested qty = forward units over the horizon − (on hand + on order), rounded up to the case.</div></div>
  </div>
</section>

<nav class="tabbar" aria-label="Views" role="tablist">
  <button type="button" data-t="plan" class="on" role="tab" aria-selected="true">Order plan</button>
  <button type="button" data-t="drivers" role="tab" aria-selected="false">Drivers <span class="cnt" id="tab-drivers-n">${st.drivers}</span></button>
  <button type="button" data-t="customers" role="tab" aria-selected="false">Customers</button>
  <button type="button" data-t="method" role="tab" aria-selected="false">Method &amp; data</button>
</nav>

<main>
<section id="sec-plan" class="tabsec">
  <h2>Order plan</h2>
  <p class="lede">Sorted by months of cover, thinnest first. Expand a row for the monthly picture, the customers behind it, and the driver outlooks. Plan qty, decision and note are shared with Adam.</p>
  <div class="filters">
    <input type="search" id="plan-q" placeholder="Search SKU, name, BOM…" aria-label="Search SKUs">
    <select id="plan-type" aria-label="Type"><option value="">All types</option>${types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
    <select id="plan-only" aria-label="Show"><option value="all">Everything</option><option value="order">Suggested order &gt; 0</option><option value="low">Under 3 months cover</option><option value="drivers">Has drivers</option><option value="undecided">Suggested but undecided</option><option value="decided">Decided</option></select>
    <select id="plan-sort" aria-label="Sort"><option value="cover">Sort: cover (thin first)</option><option value="sug">Sort: suggested qty</option><option value="u12">Sort: 12‑month units</option><option value="drv">Sort: drivers</option><option value="name">Sort: name</option></select>
    <label class="ck"><input type="checkbox" id="plan-nm"> include items not in the master</label>
    <button type="button" id="expand-all" class="mini">Expand shown</button><button type="button" id="collapse-all" class="mini">Collapse</button>
    <span class="count" id="plan-count"></span>
  </div>
  <div class="tblwrap"><table id="ptable">
    <thead><tr><th>SKU</th><th class="num">On hand</th><th class="num">On order</th><th class="num" title="Units per month, trailing 12 months">12 mo</th><th class="num" title="Units per month, trailing 6 months">6 mo</th><th class="num" title="Units per month, trailing 3 months">3 mo</th><th title="3-month rate vs 12-month rate">Trend</th><th>By month</th><th class="num">Drivers</th><th class="num" title="Baseline after driver adjustments, plus driver add-backs">Forward /mo</th><th class="num" title="(on hand + on order) ÷ forward velocity">Cover</th><th class="num">Suggest</th><th class="num">Plan qty</th><th>Decision</th><th>Note</th></tr></thead>
    <tbody id="plan-body">${planRows}</tbody>
  </table></div>
</section>

<section id="sec-drivers" class="tabsec">
  <h2>Drivers</h2>
  <p class="lede">Every customer the rule flags, biggest first. For each one, say what you know: <b>Ongoing</b> keeps their volume (enter a units/month if you know the real run rate), <b>Ending</b> counts their rate only until the month you set, <b>One‑off</b> strips them from the baseline. Unassessed drivers stay in the baseline, so the forward number can be too high until you decide.</p>
  <div id="drivers-list">${driversHtml}</div>
</section>

<section id="sec-customers" class="tabsec">
  <h2>Customers</h2>
  <p class="lede">Who bought what over the 12 months, at least 10 units, resolved from Shipedge order numbers to HubSpot companies. Rows with no deal match are orders HubSpot could not place.</p>
  <div class="filters"><input type="search" id="cust-q" placeholder="Search customers…" aria-label="Search customers"><span class="count" id="cust-count"></span></div>
  <div class="tblwrap"><table><thead><tr><th>Customer</th><th class="num">Units</th><th class="num">SKUs</th><th class="num">Active months</th><th class="num">Driver on</th><th>By month</th></tr></thead><tbody id="cust-body">${custHtml}</tbody></table></div>
</section>

<section id="sec-method" class="tabsec method">
  <h2>Where the numbers come from</h2>
  <div class="kv">
    <div>Shipments</div><div>Adam's "Experimenting" sheet, monthly Shipedge export tabs ${esc(DATA.months[0])} → ${esc(DATA.asOf)}: ${fmt(DATA.source.rows)} shipment lines after cleanup.</div>
    <div>Excluded</div><div>${fmt(DATA.source.rmaRows)} RMA / repair lines (${fmt(DATA.source.rmaUnits)} units, $0 lines whose description says Repair or RMA) and ${fmt(DATA.source.droppedMalformed)} malformed rows. ${fmt(DATA.source.nonCatalogUnits)} units on non‑catalog SKUs (short numeric codes, "product return") are not shown.</div>
    <div>Customers</div><div>Each Shipedge order is matched to a HubSpot deal: install orders carry the deal id in Ref#, every other order number sits in the deal's description. ${fmt(DATA.source.resolvedRows)} lines matched; ${fmt(DATA.source.unresolvedRows)} did not (mostly small web orders with no deal). The deal's associated company is the customer. ${unresolvedCusts.length} unmatched orders of 3+ units are kept as their own "Unmatched order" rows (${fmt(unresolvedUnits)} units) so a big anonymous order can still be flagged.</div>
    <div>Inventory</div><div>On hand / on order from the S.Updates tab where the SKU is listed there, else the Full Breakdown tab. Cost, case qty and status from Full Breakdown. Inbound dates from S.Updates.</div>
    <div>Velocity</div><div>12 / 6 / 3 = units in that trailing window ÷ months. Trend = 3‑month rate vs 12‑month rate.</div>
    <div>Drivers</div><div>Per SKU, a customer is flagged when their 12‑month units reach the share and unit thresholds in the rule bar. Changing the rule recomputes instantly and is saved for everyone.</div>
    <div>Forward velocity</div><div>Baseline window rate computed after removing the units of drivers marked One‑off, Ending, or Ongoing‑with‑a‑rate; then driver add‑backs: Ongoing rate × horizon, Ending rate × months until the end month. Unassessed drivers are left in.</div>
    <div>Suggested qty</div><div>max(0, forward units over the horizon − on hand − on order), rounded up to the case quantity. Cover = (on hand + on order) ÷ forward velocity. SKUs moving under 1 unit a month are never coloured critical.</div>
    <div>Saved on this page</div><div>Rule &amp; horizon, every driver outlook, and every SKU decision, qty and note live in this page's shared store and survive the monthly rebuild. Filters, sort and expanded rows are yours alone.</div>
  </div>
  <h2>Monthly refresh</h2>
  <ul>
    <li>Adam drops the new Shipedge month into the sheet as usual and updates S.Updates inventory.</li>
    <li>Ask Claude to rebuild: it re‑reads the sheet, resolves any new orders through HubSpot, recomputes, and republishes this page at the same link. Nothing you entered here is touched.</li>
    <li>New drivers show up as "Not assessed" on the Drivers tab; that is the monthly to‑do.</li>
  </ul>
  <h2>Shipped but not in the master (${notMaster.length})</h2>
  <p class="lede">These moved in the last 12 months but have no row in Full Breakdown or S.Updates, so there is no inventory or cost for them. Tick "include items not in the master" on the Order plan to see their velocity.</p>
  <div class="tblwrap"><table><thead><tr><th>SKU</th><th>Description</th><th class="num">12‑mo units</th><th class="num">3‑mo /mo</th></tr></thead><tbody>${notMaster.slice(0, 60).map(s => `<tr><td class="id">${esc(s.sku)}${s.scwSku ? ' <span class="dim">' + esc(s.scwSku) + '</span>' : ''}</td><td>${esc(s.name)}</td><td class="num">${fmt(s.total)}</td><td class="num">${fmt(results[s.sku].v3, 1)}</td></tr>`).join('')}</tbody></table></div>
</section>
</main>
</div>
<script>window.VELOCITY_DATA=${JSON.stringify(DATA).replace(/<\//g, '<\\/')};</script>
<script>${coreSrc}</script>
<script>${pageSrc}</script>
`;
fs.writeFileSync(OUT, html);
console.log('wrote', OUT, (html.length / 1024).toFixed(0) + ' KB', 'skus', DATA.skus.length, 'drivers', st.drivers, 'order skus', st.orderSkus);
