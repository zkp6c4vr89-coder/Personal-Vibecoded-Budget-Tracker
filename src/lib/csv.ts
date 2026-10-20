import type { Report, Transaction } from './types';

type Cell = string | number;
type Row = Cell[];

function escape(cell: Cell): string {
  const s = cell === null || cell === undefined ? '' : String(cell);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[]): string {
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

/** Triggers a browser download of the given rows as a CSV file. */
export function downloadCsv(filename: string, rows: Row[]): void {
  const csv = toCsv(rows);
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const major = (minor: number) => Math.round(minor) / 100;

/** All transactions, with both the original and MYR-converted amounts. */
export function transactionsCsv(txs: Transaction[], rate: number): Row[] {
  const rows: Row[] = [
    ['Date', 'Type', 'Account', 'To account', 'Category', 'Amount', 'Currency', 'Amount (MYR)', 'Note'],
  ];
  for (const t of txs) {
    const currency = t.account_currency ?? 'MYR';
    const amount = major(t.amount_minor);
    const inMyr = currency === 'USD' ? Math.round(t.amount_minor * rate) / 100 : amount;
    rows.push([
      t.occurred_on,
      t.type,
      t.account_name ?? '',
      t.type === 'transfer' ? (t.to_account_name ?? '') : '',
      t.category_name ?? '',
      t.type === 'income' ? amount : -amount,
      currency,
      t.type === 'income' ? inMyr : -inMyr,
      t.note ?? '',
    ]);
  }
  return rows;
}

/** A single weekly/monthly report, flattened for spreadsheets. */
export function reportCsv(report: Report): Row[] {
  const rows: Row[] = [];
  rows.push([report.kind === 'week' ? 'Weekly report' : 'Monthly report', report.label]);
  if (report.sublabel) rows.push(['', report.sublabel]);
  rows.push(['Period', report.start, report.end]);
  rows.push([]);
  rows.push(['Totals (MYR)']);
  rows.push(['Spent', major(report.totals.spent_minor)]);
  rows.push(['Income', major(report.totals.income_minor)]);
  rows.push(['Net', major(report.totals.net_minor)]);
  rows.push(['Transactions counted', report.totals.count]);
  rows.push(['Average spend per day', major(report.avg_daily_spent)]);
  if (report.prev) {
    rows.push([]);
    rows.push([`Previous period (${report.prev_label ?? ''})`]);
    rows.push(['Spent', major(report.prev.spent_minor)]);
    rows.push(['Income', major(report.prev.income_minor)]);
    rows.push(['Net', major(report.prev.net_minor)]);
  }
  rows.push([]);
  rows.push(['Category', 'Spent (MYR)', 'Share of total %']);
  const catTotal = report.by_category.reduce((s, c) => s + c.spent_minor, 0) || 1;
  for (const c of report.by_category) {
    rows.push([c.name, major(c.spent_minor), Math.round((c.spent_minor / catTotal) * 1000) / 10]);
  }
  rows.push([]);
  rows.push(['Date', 'Description', 'Account', 'Amount (MYR)']);
  for (const t of report.top_expenses) {
    rows.push([
      t.occurred_on,
      t.note || t.category_name || 'Expense',
      t.account_name ?? '',
      major(t.amount_minor),
    ]);
  }
  if (report.budgets.length) {
    rows.push([]);
    rows.push([`Budget performance — ${report.budget_label}`]);
    rows.push(['Category', 'Budget (MYR)', 'Spent (MYR)', 'Used %', 'Status']);
    for (const b of report.budgets) {
      const pct = Math.round((b.spent_minor / b.budget_minor) * 1000) / 10;
      rows.push([
        b.name,
        major(b.budget_minor),
        major(b.spent_minor),
        pct,
        pct >= 100 ? 'OVER' : pct >= 80 ? 'Near limit' : 'OK',
      ]);
    }
  }
  return rows;
}