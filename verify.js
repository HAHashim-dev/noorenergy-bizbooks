#!/usr/bin/env node
/**
 * BizBooks consistency check.
 *
 *   node verify.js
 *
 * Loads NoorEnergy_BizBooks.html, evaluates its script block against a stub DOM, renders
 * every financial year x quarter, and asserts that figures agree wherever they appear.
 * Exits non-zero on any failure so it can gate a commit.
 *
 * Add a new assertion whenever a bug is found — that is what stops it coming back.
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const FILE  = path.join(__dirname, 'NoorEnergy_BizBooks.html');
const DOCS  = path.resolve(__dirname, '../../2. Expenses And Receipts');

// Bank statement closing balances, transcribed from the CBA PDFs. The single most
// important check in this file: if book cash drifts from these, a transaction is
// missing or duplicated. Retained earnings is a derived plug and will silently
// absorb such an error, so the balance sheet still balancing proves nothing.
const STATEMENT_CASH = { FY2425: 10000.00, FY2526: 17166.34 };

let failures = 0, checks = 0;
const money = n => '$' + Number(n).toLocaleString('en-AU', { minimumFractionDigits: 2 });
function eq(label, a, b, tol = 0.02) {
  checks++;
  if (a == null || b == null || Math.abs(a - b) > tol) {
    console.log(`  FAIL  ${label}\n          ${a == null ? 'null' : money(a)}  vs  ${b == null ? 'null' : money(b)}`);
    failures++;
    return false;
  }
  console.log(`  ok    ${label}  ${money(a)}`);
  return true;
}
function ok(label, cond, detail = '') {
  checks++;
  if (!cond) { console.log(`  FAIL  ${label}${detail ? '\n          ' + detail : ''}`); failures++; return false; }
  console.log(`  ok    ${label}`);
  return true;
}

// ── Load the app into a stub DOM ──────────────────────────────────────────────
const html = fs.readFileSync(FILE, 'utf8');
const open = html.indexOf('<script>', html.indexOf('chart.umd.min.js'));
let body = html.slice(html.indexOf('>', open) + 1, html.lastIndexOf('</script>'));

const els = {};
const stub = () => ({
  innerHTML: '', textContent: '', value: '', className: '', style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  querySelectorAll: () => [], closest: () => ({ querySelectorAll: () => [] }),
  appendChild() {}, setAttribute() {}, getContext: () => null,
});
const store = {};
const charts = [];
const sandbox = {
  console,
  localStorage:   { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  sessionStorage: { getItem: () => null, setItem() {} },
  document: {
    getElementById: id => els[id] || (els[id] = stub()),
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener() {}, body: stub(),
  },
  window: { addEventListener() {} },
  Chart: function (el, cfg) { charts.push(cfg); return { destroy() {} }; },
};
// Chart canvases are static markup; return a truthy stub so the chart blocks run.
body = body.replace(/document\.getElementById\('chart-([a-z-]+)'\)/g, "{__chart:'$1'}");
const ctx = vm.createContext(sandbox);
try {
  vm.runInContext(body, ctx);
} catch (e) {
  console.error('FATAL: script block failed to evaluate —', e.message);
  process.exit(1);
}
const run = (fy, q) => { charts.length = 0; vm.runInContext(`aFY=${JSON.stringify(fy)};aQ=${JSON.stringify(q)};rAll();`, ctx); return { els, charts }; };
const evalIn = expr => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, ctx));

// Pull a labelled figure out of rendered HTML, reading the VALUE COLUMN rather than the
// first dollar amount after the label — labels may carry explanatory notes containing their
// own figures (e.g. "...after $1,151.65 prior-year loss offset").
const flat = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cash = s => (s.trim()[0] === '(' ? -1 : 1) * parseFloat(s.replace(/[()$,\s]/g, ''));
function figure(h, label) {
  const i = h.indexOf(label);
  if (i < 0) return null;
  // The value lives in the next .mono / .fs-mono span after the label.
  const m = h.slice(i).match(/class="[^"]*\bfs-mono\b[^"]*"[^>]*>\s*(\(?\$[\d,]+\.\d\d\)?)/)
         || h.slice(i).match(/class="[^"]*\bmono\b[^"]*"[^>]*>\s*(\(?\$[\d,]+\.\d\d\)?)/);
  if (m) return cash(m[1]);
  // KPI tiles and plain banners have no value column — fall back to the first amount.
  const f = flat(h.slice(i)).match(/\(?\$[\d,]+\.\d\d\)?/);
  return f ? cash(f[0]) : null;
}

const FYS = ['FY2425', 'FY2526', 'FY2627'];

// ── 1. Cash ties to the bank statements ───────────────────────────────────────
console.log('\nCash vs bank statements');
for (const [fy, expected] of Object.entries(STATEMENT_CASH)) {
  eq(`${fy} book cash == CBA closing balance`, evalIn(`computeBS(${JSON.stringify(fy)}).cashBalance`), expected);
}

// ── 2. Balance sheet integrity ────────────────────────────────────────────────
console.log('\nBalance sheet');
for (const fy of FYS) {
  const bs = evalIn(`computeBS(${JSON.stringify(fy)})`);
  eq(`${fy} Net Assets == Total Equity`, bs.netAssets, bs.shareCapital + bs.retainedEarnings);
}

// ── 3. The same figure across tabs ────────────────────────────────────────────
console.log('\nCross-tab agreement (full year)');
for (const fy of FYS) {
  const { els: e } = run(fy, 'ALL');
  const bs = evalIn(`computeBS(${JSON.stringify(fy)})`);
  const IS = e['fs-is'].innerHTML, CF = e['fs-cf'].innerHTML, TAX = e['tax-kpi'].innerHTML;

  eq(`${fy} Balance Sheet cash == Cash Flow closing`, bs.cashBalance, figure(CF, 'Cash at end of period'));
  eq(`${fy} Balance Sheet tax == Income Tax tab tax`, bs.taxPayable, figure(TAX, 'Tax payable — T5/T6'));
  eq(`${fy} Income Statement tax == Balance Sheet tax`,
     Math.abs(figure(IS, 'Income tax expense') || 0), bs.taxPayable);
  eq(`${fy} Income Tax 6S == Income Statement revenue`, figure(TAX, 'Total income — 6S'), figure(IS, 'Total revenue'));
  eq(`${fy} Income Tax 6Q == Income Statement expenses`,
     figure(TAX, 'Total expense — 6Q'),
     Math.abs(figure(IS, 'Total cost of revenue') || 0) + Math.abs(figure(IS, 'Total operating expenses') || 0));

  // Share capital must read the same on the Income Tax banner as on the Balance Sheet.
  const banner = figure(e['tax-fas-form'].innerHTML, 'Total share capital held (net of refunds, all time):');
  const allSC  = evalIn('scNet(DATA.bank)');
  eq(`${fy} Income Tax share-capital banner == scNet(all bank)`, banner, allSC);
}

// ── 4. Lodged BAS vs the ledger ───────────────────────────────────────────────
console.log('\nLodged BAS vs recomputed GST (±$1 ATO whole-dollar rounding)');
const bas = evalIn(`ATO_BAS_DATA.filter(r=>r.result!=='nofile').map(r=>{
  const a = DATA.bank.filter(b=>b.fy===r.fy&&b.type==='Credit'&&b.classification==='Income'&&QD[r.period].m.includes(gm(b.date))).reduce((s,b)=>s+(b.gst||0),0);
  const c = DATA.expenses.filter(e=>e.fy===r.fy&&e.status==='Approved'&&e.gst>0&&QD[r.period].m.includes(gm(e.date))).reduce((s,e)=>s+e.gst,0);
  return {p:r.fy+' '+r.period, l1A:r.gstToATO, c1A:a, l1B:r.gstByATO, c1B:c};
})`);
for (const r of bas) {
  ok(`${r.p}  1A ${r.l1A}/${r.c1A.toFixed(2)}  1B ${r.l1B}/${r.c1B.toFixed(2)}`,
     Math.abs(r.l1A - r.c1A) < 1 && Math.abs(r.l1B - r.c1B) < 1);
}

// ── 5. Charts ─────────────────────────────────────────────────────────────────
console.log('\nCharts');
let chartProblems = [];
for (const fy of ['FY2425', 'FY2526', 'FY2627', 'FY2728']) {
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4', 'ALL']) {
    let cs;
    try { cs = run(fy, q).charts; }
    catch (e) { chartProblems.push(`${fy} ${q} threw: ${e.message}`); continue; }
    for (const c of cs) {
      const legendVisible = c.options?.plugins?.legend?.display !== false;
      for (const d of c.data.datasets) {
        if (d.backgroundColor === undefined) chartProblems.push(`${fy} ${q}: dataset "${d.label}" has no colour`);
        // A per-bar colour array draws the legend swatch from element 0, so every other
        // bar's colour contradicts the legend.
        if (Array.isArray(d.backgroundColor) && legendVisible && c.data.datasets.length > 1 && c.type !== 'doughnut')
          chartProblems.push(`${fy} ${q}: "${d.label}" uses a per-bar colour array with a visible legend`);
      }
      if (c.type !== 'doughnut' && new Set(c.data.datasets.map(d => d.data.length)).size > 1)
        chartProblems.push(`${fy} ${q}: datasets have differing lengths`);
    }
  }
}
ok('every FY x quarter renders; legend swatches match their bars', chartProblems.length === 0, chartProblems.join('\n          '));

// ── 6. Document references resolve ────────────────────────────────────────────
console.log('\nDocument references');
const onDisk = new Set();
(function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else onDisk.add(d.name.replace(/\.[^.]+$/, ''));
  }
})(DOCS);
// Bank statements and evidence images are referenced by stem, and e20 is a cash payment
// with no receipt (vendor requested cash); e17 covers a two-part scan.
const REF_EXEMPT = /^BANK_|^EQUIPMENT-PURCHASE|NOTARIZATION|SITE SURVEY EXPENSES/;
const dangling = evalIn(`[
  ...DATA.expenses.map(x=>({id:x.id,v:x.src})),
  ...DATA.invoicesIn.map(x=>({id:x.id,v:x.ref})),
  ...DATA.invoicesOut.map(x=>({id:x.id,v:x.ref}))
]`).filter(r => r.v && !REF_EXEMPT.test(r.v) && !onDisk.has(r.v));
ok('every src/ref resolves to a real document', dangling.length === 0,
   dangling.map(d => `${d.id}: ${d.v}`).join('\n          '));

// ── 7. Ledger arithmetic ──────────────────────────────────────────────────────
console.log('\nLedger arithmetic');
const arith = evalIn(`[
  ...DATA.expenses.filter(e=>Math.abs((e.gst+e.net)-e.total)>0.005).map(e=>'EX '+e.id),
  ...DATA.invoicesIn.filter(i=>Math.abs((i.gst+i.net)-i.amount)>0.005).map(i=>'II '+i.id),
  ...DATA.invoicesOut.filter(i=>Math.abs((i.gst+i.net)-i.amount)>0.005).map(i=>'IO '+i.id)
]`);
ok('every entry satisfies total == gst + net', arith.length === 0, arith.join(', '));

const dupes = evalIn(`(() => {
  const all = [...DATA.expenses, ...DATA.bank, ...DATA.invoicesIn, ...DATA.invoicesOut].map(x=>x.id);
  return all.filter((v,i)=>all.indexOf(v)!==i);
})()`);
ok('no duplicate entry ids', dupes.length === 0, dupes.join(', '));

const fyTag = evalIn(`(() => {
  const of = d => { const y=+d.slice(0,4), m=+d.slice(5,7), s=m>=7?y:y-1;
                    return 'FY'+String(s).slice(2)+String(s+1).slice(2); };
  return [...DATA.expenses, ...DATA.bank, ...DATA.invoicesIn, ...DATA.invoicesOut]
    .filter(x => of(x.date) !== x.fy).map(x => x.id + ' ' + x.date + ' tagged ' + x.fy);
})()`);
ok('every entry\'s fy tag matches its date', fyTag.length === 0, fyTag.join('\n          '));

// ── Result ────────────────────────────────────────────────────────────────────
console.log(`\n${failures ? '✗ ' + failures + ' of ' + checks + ' checks FAILED' : '✓ all ' + checks + ' checks passed'}\n`);
process.exit(failures ? 1 : 0);
