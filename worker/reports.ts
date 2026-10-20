import type {
  BudgetRow,
  CategorySpend,
  Dashboard,
  MoneyTotals,
  Report,
  SeriesPoint,
  Transaction,
} from '../src/lib/types';
import {
  addDays,
  daysInMonth,
  isValidISO,
  isValidMonth,
  monthKey,
  monthLabel,
  monthRange,
  mondayOf,
  dayMonth,
  shiftMonth,
  shiftWeeks,
  todayISO,
  weekLabel,
  weekRange,
} from '../src/lib/period';
import { accountBalanceRows, getRate, listBudgetRows, TX_LIST_SELECT } from './api';
import { json, type Env, type RouteCtx } from './util';

/*
 * Aggregation is deliberately query-frugal: D1 statements run one after
 * another inside a request, so every saved round-trip is visible latency.
 * Each handler reads the exchange rate once and packs two date ranges into
 * single conditional-aggregation queries.
 */

/** MYR-converted amount expression (USD at the manual rate). */
const amt = (rateStr: string) =>
  `CASE WHEN a.currency = 'USD' THEN t.amount_minor * ${rateStr} ELSE t.amount_minor END`;

interface PairRow {
  a_exp: number | null;
  a_inc: number | null;
  a_n: number | null;
  b_exp: number | null;
  b_inc: number | null;
  b_n: number | null;
}

const pack = (
  spent: number | null | undefined,
  income: number | null | undefined,
  count: number | null | undefined,
): MoneyTotals => {
  const s = spent ?? 0;
  const i = income ?? 0;
  return { spent_minor: s, income_minor: i, net_minor: i - s, count: count ?? 0 };
};

/** Expense/income totals + counts for two date ranges in one query (MYR). */
async function totalsPair(
  env: Env,
  rateStr: string,
  a1: string,
  a2: string,
  b1: string,
  b2: string,
): Promise<{ a: MoneyTotals; b: MoneyTotals }> {
  const m = amt(rateStr);
  const row = await env.DB.prepare(
    `SELECT
       CAST(ROUND(SUM(CASE WHEN t.type = 'expense' AND t.occurred_on >= ?1 AND t.occurred_on <= ?2 THEN ${m} ELSE 0 END)) AS INTEGER) AS a_exp,
       CAST(ROUND(SUM(CASE WHEN t.type = 'income'  AND t.occurred_on >= ?1 AND t.occurred_on <= ?2 THEN ${m} ELSE 0 END)) AS INTEGER) AS a_inc,
       SUM(CASE WHEN t.occurred_on >= ?1 AND t.occurred_on <= ?2 THEN 1 ELSE 0 END) AS a_n,
       CAST(ROUND(SUM(CASE WHEN t.type = 'expense' AND t.occurred_on >= ?3 AND t.occurred_on <= ?4 THEN ${m} ELSE 0 END)) AS INTEGER) AS b_exp,
       CAST(ROUND(SUM(CASE WHEN t.type = 'income'  AND t.occurred_on >= ?3 AND t.occurred_on <= ?4 THEN ${m} ELSE 0 END)) AS INTEGER) AS b_inc,
       SUM(CASE WHEN t.occurred_on >= ?3 AND t.occurred_on <= ?4 THEN 1 ELSE 0 END) AS b_n
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.type IN ('expense', 'income')
       AND ((t.occurred_on >= ?1 AND t.occurred_on <= ?2) OR (t.occurred_on >= ?3 AND t.occurred_on <= ?4))`,
  )
    .bind(a1, a2, b1, b2)
    .first<PairRow>();

  return {
    a: pack(row?.a_exp, row?.a_inc, row?.a_n),
    b: pack(row?.b_exp, row?.b_inc, row?.b_n),
  };
}

interface CategoryPairRow {
  category_id: string | null;
  name: string;
  p_spent: number | null;
  m_spent: number | null;
}

/**
 * Spending by category for two ranges in one query:
 * `period` drives the breakdown, `monthSpend` feeds budget progress
 * (which tracks the calendar month, not necessarily the report period).
 */
async function byCategoryPair(
  env: Env,
  rateStr: string,
  p1: string,
  p2: string,
  m1: string,
  m2: string,
): Promise<{ period: CategorySpend[]; monthSpend: Map<string, number> }> {
  const m = amt(rateStr);
  const rows = await env.DB.prepare(
    `SELECT t.category_id, COALESCE(c.name, 'Other') AS name,
       CAST(ROUND(SUM(CASE WHEN t.occurred_on >= ?1 AND t.occurred_on <= ?2 THEN ${m} ELSE 0 END)) AS INTEGER) AS p_spent,
       CAST(ROUND(SUM(CASE WHEN t.occurred_on >= ?3 AND t.occurred_on <= ?4 THEN ${m} ELSE 0 END)) AS INTEGER) AS m_spent
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.type = 'expense'
       AND ((t.occurred_on >= ?1 AND t.occurred_on <= ?2) OR (t.occurred_on >= ?3 AND t.occurred_on <= ?4))
     GROUP BY t.category_id
     ORDER BY p_spent DESC, m_spent DESC`,
  )
    .bind(p1, p2, m1, m2)
    .all<CategoryPairRow>();

  const monthSpend = new Map<string, number>();
  const period: CategorySpend[] = [];
  for (const r of rows.results) {
    if (r.category_id) monthSpend.set(r.category_id, r.m_spent ?? 0);
    if ((r.p_spent ?? 0) > 0) {
      period.push({ category_id: r.category_id, name: r.name, spent_minor: r.p_spent ?? 0 });
    }
  }
  return { period, monthSpend };
}

function buildBudgetRows(
  budgets: Awaited<ReturnType<typeof listBudgetRows>>,
  spent: Map<string, number>,
): BudgetRow[] {
  return budgets.map((b) => ({
    category_id: b.category_id,
    name: b.category_name ?? 'Other',
    budget_minor: b.monthly_amount_minor,
    spent_minor: spent.get(b.category_id) ?? 0,
  }));
}

/** Top expenses in a range, biggest first (MYR converted). */
async function topExpenses(
  env: Env,
  start: string,
  end: string,
  rateStr: string,
  limit = 8,
): Promise<Transaction[]> {
  const rows = await env.DB.prepare(
    `${TX_LIST_SELECT}
     WHERE t.type = 'expense' AND t.occurred_on >= ?1 AND t.occurred_on <= ?2
     ORDER BY (${amt(rateStr)}) DESC
     LIMIT ${Math.max(1, Math.min(limit, 50))}`,
  )
    .bind(start, end)
    .all<Transaction>();
  return rows.results;
}

async function recentTransactions(env: Env, limit = 8): Promise<Transaction[]> {
  const rows = await env.DB.prepare(
    `${TX_LIST_SELECT} ORDER BY t.occurred_on DESC, t.created_at DESC LIMIT ${Math.max(1, Math.min(limit, 50))}`,
  ).all<Transaction>();
  return rows.results;
}

function pctChange(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/* --------------------------------------------------------------- dashboard */

export async function getDashboard(ctx: RouteCtx): Promise<Response> {
  const env = ctx.env;
  const paramToday = ctx.url.searchParams.get('today');
  const today = isValidISO(paramToday) ? paramToday : todayISO();

  const week = weekRange(today);
  const month = monthKey(today);
  const mRange = monthRange(month);
  const { rate, rateStr } = await getRate(env);

  const [accounts, totals, byCat, budgetList, recent] = await Promise.all([
    accountBalanceRows(env, true),
    totalsPair(env, rateStr, week.start, week.end, mRange.start, mRange.end),
    byCategoryPair(env, rateStr, mRange.start, mRange.end, mRange.start, mRange.end),
    listBudgetRows(env),
    recentTransactions(env, 8),
  ]);

  // Spending over time: last 13 weeks (Mon-Sun buckets), current week last.
  const seriesStart = shiftWeeks(week.start, -12);
  const daily = await env.DB.prepare(
    `SELECT t.occurred_on, ${amt(rateStr)} AS amt
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.type = 'expense' AND t.occurred_on >= ?1 AND t.occurred_on <= ?2`,
  )
    .bind(seriesStart, week.end)
    .all<{ occurred_on: string; amt: number }>();

  const buckets = new Map<string, number>();
  for (let i = 0; i < 13; i++) {
    const key = shiftWeeks(seriesStart, i);
    buckets.set(key, 0);
  }
  for (const row of daily.results) {
    const key = mondayOf(row.occurred_on);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + row.amt);
  }
  const series: SeriesPoint[] = [...buckets.entries()].map(([key, value]) => ({
    key,
    label: dayMonth(key),
    spent_minor: Math.round(value),
  }));

  const myrTotals = accounts
    .filter((a) => a.currency === 'MYR')
    .reduce((sum, a) => sum + (a.balance_minor ?? 0), 0);
  const usdTotals = accounts
    .filter((a) => a.currency === 'USD')
    .reduce((sum, a) => sum + (a.balance_minor ?? 0), 0);

  const budgets = buildBudgetRows(budgetList, byCat.monthSpend);

  const payload: Dashboard = {
    today,
    usd_myr_rate: rate,
    accounts,
    total_myr_minor: myrTotals + Math.round(usdTotals * rate),
    week: { ...totals.a, start: week.start, end: week.end },
    month: { ...totals.b, start: mRange.start, end: mRange.end, label: monthLabel(month) },
    by_category: byCat.period,
    series,
    budgets,
    budgets_total_minor: budgets.reduce((sum, b) => sum + b.budget_minor, 0),
    recent,
  };
  return json(payload);
}

/* ----------------------------------------------------------------- reports */

interface BuildArgs {
  kind: 'week' | 'month';
  start: string;
  end: string;
  label: string;
  sublabel: string;
  prevStart: string;
  prevEnd: string;
  prevLabel: string;
  prevKey: string;
  nextKey: string | null;
  budgetMonth: string;
}

async function buildReport(env: Env, args: BuildArgs): Promise<Report> {
  const days = Math.max(1, Math.round((Date.parse(args.end) - Date.parse(args.start)) / 86400000) + 1);
  const bRange = monthRange(args.budgetMonth);
  const { rateStr } = await getRate(env);

  const [totals, byCat, top, budgetList] = await Promise.all([
    totalsPair(env, rateStr, args.start, args.end, args.prevStart, args.prevEnd),
    byCategoryPair(env, rateStr, args.start, args.end, bRange.start, bRange.end),
    topExpenses(env, args.start, args.end, rateStr),
    listBudgetRows(env),
  ]);
  const prev = totals.b;

  const report: Report = {
    kind: args.kind,
    start: args.start,
    end: args.end,
    label: args.label,
    sublabel: args.sublabel,
    totals: totals.a,
    prev: totals.a.count === 0 && prev.count === 0 ? null : prev,
    prev_label: totals.a.count === 0 && prev.count === 0 ? null : args.prevLabel,
    delta:
      prev.count === 0
        ? null
        : {
            spent_pct: pctChange(totals.a.spent_minor, prev.spent_minor),
            income_pct: pctChange(totals.a.income_minor, prev.income_minor),
            net_abs: totals.a.net_minor - prev.net_minor,
          },
    by_category: byCat.period,
    top_expenses: top,
    budgets: buildBudgetRows(budgetList, byCat.monthSpend),
    budget_label: monthLabel(args.budgetMonth),
    prev_key: args.prevKey,
    next_key: args.nextKey,
    avg_daily_spent: Math.round(totals.a.spent_minor / days),
  };
  return report;
}

export async function getWeekReport(ctx: RouteCtx): Promise<Response> {
  const param = ctx.url.searchParams.get('start');
  const anchor = isValidISO(param) ? mondayOf(param) : mondayOf(todayISO());
  const range = weekRange(anchor);
  const currentWeekStart = mondayOf(todayISO());

  const report = await buildReport(ctx.env, {
    kind: 'week',
    start: range.start,
    end: range.end,
    label: weekLabel(range.start, range.end),
    sublabel: 'Weekly report (Mon – Sun)',
    prevStart: addDays(range.start, -7),
    prevEnd: addDays(range.end, -7),
    prevLabel: weekLabel(addDays(range.start, -7), addDays(range.end, -7)),
    prevKey: addDays(range.start, -7),
    nextKey: range.start < currentWeekStart ? addDays(range.start, 7) : null,
    budgetMonth: monthKey(range.start),
  });
  return json(report);
}

export async function getMonthReport(ctx: RouteCtx): Promise<Response> {
  const param = ctx.url.searchParams.get('month');
  const month = isValidMonth(param) ? param : monthKey(todayISO());
  const range = monthRange(month);
  const prevMonth = shiftMonth(month, -1);
  const prevRange = monthRange(prevMonth);
  const days = daysInMonth(month);

  const report = await buildReport(ctx.env, {
    kind: 'month',
    start: range.start,
    end: range.end,
    label: monthLabel(month),
    sublabel: `Monthly report · ${days} days`,
    prevStart: prevRange.start,
    prevEnd: prevRange.end,
    prevLabel: monthLabel(prevMonth),
    prevKey: prevMonth,
    nextKey: month < monthKey(todayISO()) ? shiftMonth(month, 1) : null,
    budgetMonth: month,
  });
  return json(report);
}