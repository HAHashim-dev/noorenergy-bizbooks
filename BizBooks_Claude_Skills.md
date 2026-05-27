# BizBooks × Claude — Skills & Lessons Learned

> Last updated: 15 May 2026
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
