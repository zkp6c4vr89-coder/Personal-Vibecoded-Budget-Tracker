export type Currency = 'MYR' | 'USD';
export type TxType = 'expense' | 'income' | 'transfer';

export interface Account {
  id: string;
  name: string;
  currency: Currency;
  opening_balance_minor: number;
  sort_order: number;
  archived: number;
  balance_minor?: number;
}

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  archived: number;
  /** Which picker the category belongs to; legacy rows are 'expense'. */
  kind?: 'expense' | 'income';
}

export interface Budget {
  id: string;
  category_id: string;
  monthly_amount_minor: number;
  category_name?: string;
  spent_minor?: number;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount_minor: number;
  to_amount_minor: number | null;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  note: string;
  occurred_on: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
  account_name?: string | null;
  account_currency?: Currency | null;
  to_account_name?: string | null;
  category_name?: string | null;
}

export interface Settings {
  usd_myr_rate: number;
  /** YYYY-MM-DD of the last rate change, shown in Settings. */
  usd_myr_rate_updated?: string;
}

export interface MoneyTotals {
  spent_minor: number;
  income_minor: number;
  net_minor: number;
  count: number;
}

export interface PeriodTotals extends MoneyTotals {
  start: string;
  end: string;
}

export interface CategorySpend {
  category_id: string | null;
  name: string;
  spent_minor: number;
}

export interface SeriesPoint {
  key: string; // period bucket key (week start or month)
  label: string;
  spent_minor: number;
}

export interface BudgetRow {
  category_id: string;
  name: string;
  budget_minor: number;
  spent_minor: number;
}

export interface Dashboard {
  today: string;
  usd_myr_rate: number;
  accounts: Account[];
  total_myr_minor: number;
  week: PeriodTotals;
  month: PeriodTotals & { label: string };
  by_category: CategorySpend[];
  series: SeriesPoint[];
  budgets: BudgetRow[];
  recent: Transaction[];
  budgets_total_minor: number;
}

export interface ReportDelta {
  spent_pct: number | null;
  income_pct: number | null;
  net_abs: number;
}

export interface Report {
  kind: 'week' | 'month';
  start: string;
  end: string;
  label: string;
  sublabel: string;
  totals: MoneyTotals;
  prev: MoneyTotals | null;
  prev_label: string | null;
  delta: ReportDelta | null;
  by_category: CategorySpend[];
  top_expenses: Transaction[];
  budgets: BudgetRow[];
  budget_label: string;
  prev_key: string;
  next_key: string | null;
  avg_daily_spent: number;
  /** Spending-over-time buckets for the chart under the summary cards. */
  series: SeriesPoint[];
}

export interface Bootstrap {
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  settings: Settings;
  expires_at?: number;
}

/** One downloadable JSON document (GET /api/backup, POST /api/restore). */
export interface Backup {
  version: 1;
  exported_at: string;
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  settings: Record<string, string>;
  transactions: Transaction[];
}