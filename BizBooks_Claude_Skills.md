# BizBooks × Claude — Skills & Lessons Learned

> Last updated: 27 Jul 2026
> Purpose: Reference guide for working with Claude Code on the NoorEnergy BizBooks HTML file

---

## 1. Accessing OneDrive Files from Claude

Claude Code can read OneDrive files directly via macOS's local sync path:

```
/Users/hashim/Library/CloudStorage/OneDrive-Personal(2)/Business/NoorEnergy/
```

This works for PDFs, images, Excel files, and HTML — as long as the file is synced locally. If a file shows a cloud icon (not downloaded), Claude cannot read it.

**Key paths used:**
- BizBooks HTML: `3. Operations/Finance/Book Keeping/NoorEnergy-BizBooks/NoorEnergy_BizBooks.html`
- Receipts & expenses: `3. Operations/Finance/Expenses And Receipts/FY2425/` and `FY2526/`

---

## 2. Reading PDFs — Installing poppler

By default, Claude cannot extract text from PDFs. Install **poppler** once to enable this:

```bash
brew install poppler
```

Then extract text from any PDF:

```bash
pdftotext "path/to/file.pdf" -
```

The `-` sends output to terminal (stdout). Works on receipts, invoices, and bank statements. If a PDF is image-only (scanned), use `tesseract` (already installed) instead.

---

## 3. Auditing BizBooks Data

### Workflow
1. List all files in each FY folder and compare against `BASE_EX`, `BASE_BK`, `BASE_INV_IN`, `BASE_INV_OUT` in the HTML
2. Any file in OneDrive not referenced in the HTML is a **missing entry**
3. Extract PDF text and verify amounts match the hardcoded data

### GST Calculation Checks
Standard formula: `GST = Total / 11`, `Net = Total - GST`

| Entry | Total | GST | Net | Verified |
|-------|-------|-----|-----|----------|
| NRMA FY2425 | $610.12 | $55.47 | $554.65 | ✓ |
| Lawpath | $468.00 | $42.54 | $425.46 | ✓ (invoice stated $42.54, not $42.55 — trust the document) |
| Equipment (Raddock) | $11,996.00 | $1,090.56 | $10,905.44 | ✓ (quote stated $1,090.56 — trust the document) |
| NRMA FY2526 | $671.15 | $61.01 | $610.14 | ✓ |
| Construction invoice | $1,485.00 | $135.00 | $1,350.00 | ✓ |
| Income tax fee | $33.00 | $3.00 | $30.00 | ✓ |

**Rule:** When the invoice/receipt states a specific GST amount, use that figure — don't override with a rounded calculation. Suppliers sometimes round per-unit GST differently.

---

## 4. Invoice Matching Logic

The HTML links bank entries to invoices via a **reference string match**:

```javascript
// Invoice sent — payment received:
DATA.bank.filter(b => b.type === 'Credit' && b.src === inv.ref)

// Bill received — payment made:
DATA.bank.filter(b => b.type === 'Debit' && b.src === inv.ref)
```

**Critical rule:** `b.src` on the bank entry **must exactly match** `inv.ref` on the invoice, or the invoice will show as "Outstanding" even if fully paid.

### Bug found this session
- `io1.ref = 'INV-OUT_FY2526_JAN_CONSTRUCTION JOB'`
- `b9.src  = 'RECEIPT_FY2526_JAN_CONSTRUCTION JOB PAYMENT'`  ← wrong, didn't match
- **Fix:** Set `b9.src = 'INV-OUT_FY2526_JAN_CONSTRUCTION JOB'`

**Naming convention for `src`:**
| Transaction type | src should reference |
|-----------------|----------------------|
| Bank debit paying a received invoice | `inv.ref` of the `invoicesIn` entry |
| Bank credit receiving payment on a sent invoice | `inv.ref` of the `invoicesOut` entry |
| Bank debit paying an expense (no invoice) | the receipt/statement filename |

---

## 5. Finding Missing Entries

### Step-by-step
```bash
# 1. List all files in a FY folder
ls "Expenses And Receipts/FY2526/Receipts/"
ls "Expenses And Receipts/FY2526/Expenses/"
ls "Expenses And Receipts/FY2526/InvoicesReceived/"
ls "Expenses And Receipts/FY2526/InvoicesSent/"
ls "Expenses And Receipts/FY2526/BankStatements/"
ls "Expenses And Receipts/FY2526/Other/"

# 2. Cross-reference against the HTML's BASE_EX, BASE_BK, BASE_INV_IN, BASE_INV_OUT arrays
# Any file not referenced in src/ref fields is a missing entry
```

### Missing entry found this session
`RECEIPT_FY2526_MAY_INCOME TAX FEE.pdf` was in OneDrive but not in the HTML.
- Supplier: Free Accounting Software
- Invoice S9008, 14 May 2026
- Total: $33, GST: $3, Net: $30
- Category: Professional Services
- Status: Approved
- Note: Q4 FY2526 bank statement not yet available — bank debit pending

---

## 6. Date Verification

Always verify dates against the source document, not just the filename.

**Bug found this session:**
- `io1` (construction invoice) had `date: '2025-12-20'` in HTML
- Actual invoice PDF said "Invoice Date: 12 Jan 2026"
- **Fix:** Corrected to `date: '2026-01-12'`

Filenames use month codes (e.g. `JAN`) — use this as a clue but always confirm against the PDF.

---

## 7. Bank Statement Checks

Bank statements with **no transactions** (opening balance = closing balance) still matter — they confirm nothing was missed. Both of these were checked and had zero transactions:

- `BANK_FY2526_DEC_CBA.pdf` — Oct–Dec 2025, balance held at $9,203
- `BANK_FY2425_JUN_CBA.pdf` — Jun 2025, balance held at $10,000

---

## 8. BizBooks Data Structure Reference

```javascript
// Expense entry fields
{
  id, date, fy, desc, supplier, cat, total, gst, net,
  src,       // filename reference (no extension)
  status,    // 'Approved' | 'Refund' | 'Future Reimbursement'
  notes
}

// Bank entry fields
{
  id, date, fy, desc, type,    // 'Credit' | 'Debit'
  amount, classification,       // 'Share Capital' | 'Income' | 'Client Funds' | 'Expense' | 'Transfer' | 'Other'
  shareholder, matched, src, gst
}

// Invoice received (bill to pay)
{ id, date, fy, ref, desc, supplier, amount, gst, net, notes }

// Invoice sent (payment to receive)
{ id, date, fy, ref, desc, client, amount, gst, net, notes }
```

**FY codes:** `FY2425` = Jul 2024–Jun 2025 · `FY2526` = Jul 2025–Jun 2026 · `FY2627` = Jul 2026–Jun 2027

**Quarter months:**
- Q1 = Jul, Aug, Sep
- Q2 = Oct, Nov, Dec
- Q3 = Jan, Feb, Mar
- Q4 = Apr, May, Jun

---

## 9. Checklist for Each New FY

- [ ] Create subfolders: `Receipts/`, `Expenses/`, `InvoicesReceived/`, `InvoicesSent/`, `BankStatements/`, `Other/`
- [ ] Add FY pill button in the period bar HTML
- [ ] Add FY option to all `<select>` dropdowns in the file
- [ ] Add FY to `valid` array in the constants section
- [ ] File all documents using the naming convention (see below)

---

## 10. File Naming Convention

```
RECEIPT_FY2526_AUG_LAWPATH          ← Receipt for a direct payment
EXPENSE_FY2526_APR_SITE SURVEY [FUTURE][  ← Partner-paid, future reimbursement
INV-IN_FY2526_FEB_RADDOCK           ← Invoice received (you pay)
INV-OUT_FY2526_JAN_CLIENT NAME      ← Invoice sent (you get paid)
BANK_FY2526_SEP_CBA                 ← Bank statement (month = statement end month)
BAS_FY2526_JUL-SEP_ATO              ← BAS lodgement
```

Month codes: `JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC`

---

## 11. Share Capital Refunds

A return of capital is recorded as a **Debit** bank entry with `classification: 'Share Capital'`. Example:

```js
{id:'b17', date:'2026-05-27', fy:'FY2526',
 desc:'Transfer To MOHAMMED MAGZOUB — Share capital refund',
 type:'Debit', amount:2500, classification:'Share Capital',
 shareholder:'Mohammed Magzoub', matched:false,
 src:'BANK_FY2526_MAY_CBA', gst:0}
```

The `rShares()` function must use credit/debit-aware summation — not a plain `.reduce((a,b) => a+b.amount)`:

```js
const scAmt = b => b.type === 'Credit' ? b.amount : -b.amount;
const tot = allSC.reduce((a,b) => a + scAmt(b), 0);
```

Set `matched: false` when the bank statement is not yet available. The `src` field should reference the expected bank statement filename so it auto-matches when that statement is added.

---

## 12. localStorage Merge Pattern

`loadData()` uses a `mergeBase()` helper to ensure new hardcoded entries (added to BASE_BK/BASE_EX) always appear even when localStorage is already populated:

```js
function mergeBase(base, stored) {
  if (!stored) return [...base];
  const storedIds = new Set(stored.map(e => e.id));
  const newBase = base.filter(e => !storedIds.has(e.id));
  return [...stored, ...newBase];
}
```

**Rule:** Sequential IDs (b1–b17, e1–e21, etc.) are used for hardcoded entries. The merge detects new IDs not present in localStorage and appends them. User-added entries get timestamp-based UIDs and are never displaced.

**When this matters:** Any time a new entry is hardcoded into BASE_BK or BASE_EX, it will automatically appear in existing installs without requiring a localStorage reset.

---

## 13. Charts, Filters, and Collapse/Expand (Session 2)

### Chart.js integration
- CDN: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>` in `<head>`
- Registry: `const CHARTS = {};` — always call `CHARTS.key.destroy()` before recreating to avoid "canvas already in use" error
- Colour palette: `const CP = ['#0f9b8e','#2a6ee8','#f0b429','#1a7a5e','#c0392b','#d4750a','#6d28d9','#6e7a8a']`
- Canvas elements live in static HTML inside view divs; chart JS runs at the end of each `rXxx()` render function

### Table filters
- `fRow(cols)` helper generates `<tr class="frow">` with `<input oninput="filterTbl(this)">` per column
- Pass `''` for numeric/badge columns where text filtering isn't useful
- `filterTbl(input)` walks up to the table and hides rows that don't match all filter inputs

### Collapse/expand
- Add `data-card-key="unique-key"` to each `<div class="card">`
- Replace `<div class="ch"><h3>Title</h3></div>` with `<div class="ch"><h3>Title</h3><button class="collapse-btn" onclick="toggleCard(this)">▲ Hide</button></div>`
- `toggleCard(btn)` toggles `.collapsed` class and persists state in `sessionStorage` (prefix: `ne_card_`)
- `restoreCards()` must be called after `rAll()` and inside the tab-restore IIFE

### CSS classes added
`.ch`, `.collapse-btn`, `.card.collapsed > :not(.ch)`, `tr.frow`, `tr.frow input`, `.chart-wrap` (240px), `.chart-wrap-sm` (180px)

---

## 14. Q4 FY2526 GST Lodgement (Session 3)

### Verified Q4 figures (Apr–Jun 2026, Statement 7)

Opening $10,015.60 → closing **$17,166.34 CR** · credits $25,001.30 · debits $17,850.56 · 12 lines.

| Label | Amount |
|-------|--------|
| G1 — Total sales (incl. GST) | $25,000.00 |
| G11 — Purchases (incl. GST) | $17,681.92 |
| 1A — GST on sales | $2,181.09 |
| 1B — GST credits | $1,366.19 |
| **Net — PAYABLE to ATO** | **$814.90** |

1B components: Free Accounting $3.00 · Reeds $545.28 · Finders Keepers #1251 $545.27 ·
Finders Keepers #1358 $272.64 · DHL $0 (international, GST-free).

G11 is larger than the Q4 cash outflow because it is date-based, not payment-based: it picks up
the Yagoub invoice ($2,000, dated 27 Apr 2026 but paid Feb/Mar) and the unpaid DHL PERR000717171
($331.36, dated 26 Jun, due 26 Jul). Neither carries GST, so 1B is unaffected.

### Classification rule — this one silently loses GST

`rGST()` computes 1A from `DATA.bank` credits where `classification === 'Income'` **only**.
A taxable sale booked as `'Client Funds'` (the pass-through classification used for the Feb
equipment deal) contributes **$0 to 1A** with no warning. Rule:

| Situation | Classification | GST on bank entry |
|-----------|----------------|-------------------|
| Money received against a tax invoice we issued | `Income` | apportion the invoice GST |
| Client money held / passed straight through | `Client Funds` | 0 |

When one invoice is paid in instalments, split the invoice's stated GST across the entries so
the total is exact. Talia's $2,181.09 across five $5,000 credits → `436.22 × 4 + 436.21`.
Don't use `amount/11` per entry: INV-26-001's GST is not 1/11 of $25,000 because the two DHL
freight lines are GST-free.

### `'ready'` BAS result type

Added to `ATO_BAS_DATA.result` for "figures prepared, not yet lodged". Requires four touch
points in `rATO()` — miss any one and the row renders wrong:
1. `resultBadge` → `$815.00 DR` in red
2. `lodgeBadge` → amber "Ready to lodge"
3. `rowClass` → `'ra'`
4. `pendingBAS` / `totalBAS` filters → include `'ready'` in pending, exclude from the lodged
   denominator, or the "Next Action" KPI falsely reads "All current BAS lodged"

### Bug fixed — quarterly GST table assumed refunds forever

The `rGST()` quarterly summary hardcoded GST-on-sales as `$0.00` and rendered the net position
as `(x) Refund` whenever input credits existed. Correct through FY2425–Q3 FY2526 (all refunds),
wrong from Q4 FY2526 (first payable quarter). Now computes `net = 1A − 1B` per quarter and
renders Payable / Refund / Nil. The `chart-gst-q` block directly below already did this
correctly — reuse its `q1A` pattern rather than inventing a new one.

### GST amounts confirmed this session

| Entry | Total | GST | Net | Source |
|-------|-------|-----|-----|--------|
| Reeds Prospecting 26-00003114 | $5,998.00 | $545.28 | $5,452.72 | invoice states $545.28 |
| Finders Keepers #1251 | $5,998.00 | $545.27 | $5,452.73 | receipt states $545.27 |
| Finders Keepers #1358 | $2,999.00 | $272.64 | $2,726.36 | receipt states $272.64 |
| Talia INV-26-001 | $25,000.00 | $2,181.09 | $22,818.91 | invoice states $2,181.09 |

Reeds and Finders Keepers charge the same $2,999 unit price but round per-unit GST in opposite
directions ($545.28 vs $545.27 on identical $5,998 totals) — further proof of §3's rule.

### Open reconciliation items

- INV-26-001 bills Talia for **8×** Gold Monster 2000; only **5** appear in FY2526 purchases
  (2 Reeds + 2 FK + 1 FK = $14,995). Gross margin is overstated until the other 3 are located.
- INV-26-001 bills freight of $322.56 (2pcs) and **$685.47 (6pcs)**; only $322.56 and $331.36
  exist as DHL invoices. Nothing matches $685.47.
- `b17`: statement narration reads "Transfer To Moahmmed Albashier", booked as Mohammed
  Magzoub's share-capital refund per director instruction. File note recommended.
- DHL invoices are addressed to **Yagoub Bala**, not Noor Energy, though paid on company card
  xx9281. GST is $0 on both so there's no input-credit exposure, but future DHL accounts should
  be opened in the company name.

---

## 15. Full-Ledger Audit (Session 3)

### The single most important check: cash must tie to the statement

```js
computeBS(fy).cashBalance   // must equal the CBA closing balance for that FY
```

FY2425 was $610.12 short and nobody noticed for two years, because `retainedEarnings` is a
**derived plug** (`netAssets − shareCapital`) — it silently absorbs any missing transaction
instead of producing an imbalance. The balance sheet always "balances", so balancing proves
nothing. Reconcile cash to the statement directly, every quarter.

Verified: FY2425 = $10,000.00 · FY2526 = $17,166.34. Both agree to the CBA closing balance.

### Missing entry found — 16 May 2025

The statement shows a **single $1,810.12 credit**; the book recorded only the $1,200 share
capital portion (`b6`). Added `b29` for the remaining $610.12 (advance from Hashim covering the
NRMA premium the company had already paid). Lesson: when one bank line is split across two
accounting purposes, record **both** halves — a split entry is where money goes missing.

### The credit/debit share capital bug was in four places, not one

§11 documented `rShares()` but three other call sites still did a plain
`.reduce((a,b) => a+b.amount)`, so the $2,500 refund was **added** instead of subtracted:

| Site | Symptom |
|------|---------|
| `rDash()` | Share capital tile read +$2,500 for a quarter whose only movement was a refund |
| `computeBS()` | Balance sheet share capital $12,500 instead of $7,500 — **$5,000 overstated** |
| `rPL()` | P&L note misstated capital movements |
| `rCF()` | Refund fell into "other" instead of financing outflow |

Now centralised — use these and never re-derive:

```js
const scAmt = b => b.type === 'Credit' ? b.amount : -b.amount;
const scNet = list => list.filter(b => b.classification === 'Share Capital')
                          .reduce((a,b) => a + scAmt(b), 0);
```

### Dashboard repeated the GST tab's refund-only bug

`rDash()` hardcoded 1A as `$0.00` and always rendered "ATO owes you". For Q4 it announced a
**$1,366.19 refund when $814.90 was payable**. Same root cause as §14 — anywhere GST is
summarised, compute `1A − 1B` and branch on the sign. Both are fixed; check any new summary.

### Partner reimbursements are now a balance sheet liability

Amounts partners paid personally were owed but appeared nowhere in liabilities, overstating
equity (FY2425 showed retained earnings $0.00 against a lodged $1,152 loss). `computeBS()` now
returns `partnerPayable`. **Note the deliberate inconsistency:** those expenses are still
excluded from the P&L until reimbursed — matching the lodged FY2425 return, which claimed only
Approved items ($1,151.65 ≈ $1,152). So retained earnings will not equal the taxable result.
Disclosed in the balance sheet note. Confirm the policy with the accountant.

### Chart rules (enforced by the audit sweep)

1. **Shared colour constants** — `C_IN` green (money in / refund), `C_OUT` red (money out /
   payable), `C_NEU` grey, `C_ACC` blue. Never inline an rgba string; three tabs previously used
   different alphas of the same hue for the same meaning.
2. **Never give a multi-series dataset a per-bar colour array.** Chart.js draws the legend swatch
   from the *first* element, so every other bar's colour contradicts the legend. This is why the
   GST "Net" series is one colour and the sign carries the meaning.
3. **A chart must use the same basis as the statement above it.** `chart-pl-bar` plotted
   GST-inclusive income excluding client funds while the P&L above it was ex-GST including them.
4. **Both series must cover the same population.** The credits/debits bars excluded client funds
   from credits but not debits, inflating every quarter's apparent loss.
5. **Sign conventions must agree with the table.** The GST chart used `1B − 1A` while its own
   table used `1A − 1B` — the same quarter appeared as a refund in one and a payable in the other.

---

## 16. `verify.js` — run this before every commit

```bash
node verify.js     # exits non-zero on any failure
```

Loads the HTML, evaluates its script block against a stub DOM, renders every FY × quarter and
asserts 36 checks: cash vs the CBA statements, Net Assets == Total Equity, the same tax figure
on the Income Statement / Balance Sheet / Income Tax tab, 6S/6Q vs the Income Statement, Cash
Flow closing vs Balance Sheet cash, every lodged BAS row vs GST recomputed from the ledger,
chart legend/bar colour agreement, document references resolving to real files, and ledger
arithmetic (`total == gst + net`, unique ids, fy tag matching the date).

**When a bug is found, add an assertion.** That is what stops it recurring — every check in
there exists because something was once wrong.

`STATEMENT_CASH` at the top holds the transcribed CBA closing balances. **Add the new balance
each quarter** when you file a statement; that check is the one that catches a missing or
duplicated transaction, and it is the reason the $610.12 gap surfaced.

### Cross-tab drift — the pattern behind almost every bug found

Six of the defects in sessions 3 had the same shape: **one quantity computed independently in
two or more places, and the copies drifted.** Share capital was summed in six places, the
prior-year loss loop existed in two, GST net position in three. Fixes were all the same move —
extract one helper and have every caller use it:

| Helper | Replaces |
|--------|----------|
| `scAmt` / `scNet(list)` | six hand-rolled Share Capital reductions |
| `priorLoss(fy)` / `fyNetPL(fy)` | duplicated carry-forward loops in `computeBS()` and `rTax()` |

Before adding a calculation, grep for the quantity — it probably already exists.

### Income tax must offset carried-forward losses everywhere

`rIS()` charged `ebit * 0.25` with no offset while `rTax()` and `computeBS()` both applied the
FY2425 loss, so FY2526 reported tax of **$2,394.47** on the Statements tab against **$2,106.56**
on the other two. All three now call `priorLoss(aFY)`. Verified by the cross-tab check.

### "Net profit" needs a qualifier

The P&L tab is **before tax**; the Statements tab is **after tax**. Same label, two numbers
($9,577.89 vs $7,471.33 for FY2526). Both are now labelled explicitly. Any new profit figure
must say which basis it is on.

---

## 17. ⚠️ This repo is PUBLIC — read before committing

`HAHashim-dev/noorenergy-bizbooks` is a **public** repo with **GitHub Pages enabled**:

> https://hahashim-dev.github.io/noorenergy-bizbooks/

**The password gate is client-side only.** It stops nobody. Anyone can open the page, view
source, and read every transaction without entering it. Never treat it as access control.

### Never commit these

| Never | Fine |
|-------|------|
| Tax file numbers | ABN, ACN (publicly registrable) |
| Full bank account numbers | BSB alone |
| Partner/supplier personal account details | Supplier business names |
| API tokens, card numbers | Masked card refs (`xx9281`) |

Grep before every commit — `verify.js` does **not** check for this:

```bash
grep -nE "TFN ?[0-9]|Account [Nn]umber'?,? ?'?[0-9]|Smart Access [0-9]|[0-9]{3}-[0-9]{3} [0-9]{4} [0-9]{4}|gho_|ghp_|github_pat_" NoorEnergy_BizBooks.html
```

Deliberately narrow. A broad `[0-9]{8,}` matches every receipt number, invoice number and
Bank-of-Khartoum transaction ID in the ledger — all harmless — and the noise trains you to
ignore it. Match the shapes that actually matter and eyeball the handful of hits.

Current convention: `TFN on file`, account `xxx3737`, `Smart Access acct on file`.
Receipt numbers, BPAY references, ATO document IDs and masked card refs are fine to keep.

### What happened on 27 Jul 2026

The file had been publishing the company TFN and full CBA account number since the first
commit. Redacted, then purged from all 28 commits with:

```bash
git filter-repo --replace-text redactions.txt --force   # 'secret==>replacement' per line
git remote add origin https://github.com/HAHashim-dev/noorenergy-bizbooks.git  # filter-repo drops the remote
git push --force origin main
```

**A history rewrite does not remove the data from GitHub.** Verified afterwards — the old blob
was still fetchable unauthenticated by SHA:

```bash
curl https://raw.githubusercontent.com/HAHashim-dev/noorenergy-bizbooks/<old-sha>/NoorEnergy_BizBooks.html
```

Unreferenced objects survive a force-push and there is no API to garbage-collect them. **Only a
GitHub Support ticket can purge them.** And once something has been public, treat it as
disclosed permanently — rewriting history does not un-publish it. The real remedy is the
out-of-band one: notify the ATO, rotate the credential.

Take a backup before any rewrite (`cp -R . ~/bizbooks-backup-$(date +%F)`); `filter-repo`
prunes objects irreversibly, and commits that become empty are dropped from the log.

### Token hygiene

The `origin` URL had a `gho_…` token embedded in it, in plaintext in `.git/config` inside an
OneDrive-synced folder — replicated to Microsoft's cloud and every synced device. Use
`gh auth setup-git` and a plain remote URL instead of embedding credentials.
