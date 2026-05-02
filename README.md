# NoorEnergy BizBooks

A lightweight, self-contained bookkeeping dashboard for **Noor Energy** (ABN 24 678 922 051).  
No installation, no backend — runs entirely in the browser as a single HTML file.

**Live site:** https://hahashim-dev.github.io/noorenergy-bizbooks/

---

## Features

| Tab | What it does |
|---|---|
| **Dashboard** | KPI summary cards, quarter timeline, expense & bank snapshots, GST position |
| **Bank** | Log and view CBA transactions by period |
| **Expenses** | Record receipts with GST, category, and source file reference |
| **Share Capital** | Track shareholder equity payments (no GST, no income tax) |
| **GST & BAS** | Estimated BAS figures per quarter with due-date reminders |
| **P&L** | Profit & Loss statement for the selected period |
| **Add Data** | Forms to add expenses, bank transactions, and a file-naming guide |

Supports **FY 2024–25 through FY 2027–28**, with per-quarter (Q1–Q4) and full-year filtering.

---

## Data & Privacy

All data is stored **locally in your browser** (localStorage). Nothing is sent to any server.

- **Export JSON** — saves a backup file to your computer
- **Import JSON** — restores from a backup file

> Regularly export a backup so you don't lose data if the browser cache is cleared.

---

## Usage

Open the live link above in any modern browser. No login required.

To update the app, replace `index.html` in this repository — GitHub Pages will reflect changes within ~2 minutes.

---

## Disclaimer

GST and BAS figures are **estimates only**. Verify all figures with a registered tax agent before lodging with the ATO.
