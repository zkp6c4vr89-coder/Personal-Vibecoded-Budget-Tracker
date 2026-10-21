import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bars, HBar } from '../components/charts';
import {
  Button,
  Card,
  ErrorBanner,
  PageHeader,
  ProgressBar,
  SectionTitle,
  SkeletonList,
} from '../components/ui';
import { Icon, categoryColor, categoryIcon } from '../components/icons';
import { api } from '../lib/api';
import { downloadCsv, reportCsv, transactionsCsv } from '../lib/csv';
import { money } from '../lib/money';
import { dayMonth, monthKey, monthLabel, mondayOf, shiftMonth, todayISO, weekLabel } from '../lib/period';
import type { Report, Transaction } from '../lib/types';
import { useAsync } from '../lib/hooks';
import { useApp } from '../state/AppContext';

type Kind = 'week' | 'month';

export default function Reports() {
  const { settings } = useApp();
  const navigate = useNavigate();
  const today = todayISO();
  const [kind, setKind] = useState<Kind>('week');
  const [anchor, setAnchor] = useState<string>(
    kind === 'week' ? mondayOf(today) : monthKey(today),
  );

  function switchKind(next: Kind) {
    setKind(next);
    setAnchor(next === 'week' ? mondayOf(today) : monthKey(today));
  }

  const path =
    kind === 'week' ? `/api/report/week?start=${anchor}` : `/api/report/month?month=${anchor}`;

  const { data, error, loading, reload } = useAsync(() => api.get<Report>(path), [path]);

  async function exportTransactions() {
    try {
      const res = await api.get<{ transactions: Transaction[] }>('/api/transactions?limit=5000');
      downloadCsv(`all-transactions-${today}.csv`, transactionsCsv(res.transactions, settings.usd_myr_rate));
    } catch (err: any) {
      window.alert(err?.message || 'Export failed');
    }
  }

  function exportReport() {
    if (!data) return;
    downloadCsv(
      `${data.kind === 'week' ? 'week' : 'month'}-${data.start}${data.kind === 'week' ? '_to_' + data.end : ''}.csv`,
      reportCsv(data),
    );
  }

  const shift = (dir: -1 | 1) =>
    setAnchor((a) =>
      kind === 'week'
        ? (() => {
            const d = new Date(a + 'T00:00:00Z');
            d.setUTCDate(d.getUTCDate() + dir * 7);
            return d.toISOString().slice(0, 10);
          })()
        : shiftMonth(a, dir),
    );

  const periodWord = kind === 'week' ? 'week' : 'month';

  const periodLabel = data
    ? kind === 'week'
      ? weekLabel(data.start, data.end)
      : monthLabel(data.start.slice(0, 7))
    : kind === 'week'
      ? weekLabel(anchor, anchor)
      : monthLabel(anchor);

  return (
    <>
      <PageHeader title="Reports" />

      {/* Kind tabs — 44pt targets */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
        {(['week', 'month'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchKind(k)}
            aria-pressed={kind === k}
            className={`min-h-11 rounded-lg text-sm font-semibold transition ${
              kind === k
                ? 'bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {k === 'week' ? 'Weekly' : 'Monthly'}
          </button>
        ))}
      </div>

      {/* Period navigation */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous period"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-xl text-slate-700 active:bg-white dark:border-slate-700 dark:text-slate-200 dark:active:bg-slate-900"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-base font-semibold">{periodLabel}</p>
          <p className="text-xs text-slate-500">
            {data?.sublabel ?? (kind === 'week' ? 'Weekly report' : 'Monthly report')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => data?.next_key && setAnchor(data.next_key)}
          disabled={!data || !data.next_key}
          aria-label="Next period"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 text-xl text-slate-700 disabled:border-slate-200 disabled:text-slate-400 active:bg-white dark:border-slate-700 dark:text-slate-200 dark:disabled:border-slate-800 dark:disabled:text-slate-600 dark:active:bg-slate-900"
        >
          ›
        </button>
      </div>

      {error && <ErrorBanner message={error} onDismiss={reload} />}

      {loading && !data ? (
        <SkeletonList rows={3} />
      ) : !data ? null : (
        <>
          {/* Totals + comparison */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="Spent"
              value={money(data.totals.spent_minor)}
              delta={data.delta?.spent_pct}
              invert
              periodWord={periodWord}
            />
            <Metric
              label="Income"
              value={money(data.totals.income_minor)}
              delta={data.delta?.income_pct}
              periodWord={periodWord}
            />
            <Metric
              label="Net"
              value={`${data.totals.net_minor >= 0 ? '+' : ''}${money(data.totals.net_minor)}`}
              netDelta={data.delta ? data.delta.net_abs : null}
              periodWord={periodWord}
            />
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">
            {data.prev_label && data.delta
              ? `Compared with ${data.prev_label}`
              : data.prev_label
                ? `No transactions in ${data.prev_label} to compare with`
                : 'First recorded period'}{' '}
            · {data.totals.count} transaction{data.totals.count === 1 ? '' : 's'} · avg{' '}
            {money(data.avg_daily_spent)}/day
          </p>

          {/* Spending over time for the browsed period */}
          <SectionTitle>Spending over time</SectionTitle>
          <Card>
            <Bars
              data={data.series.map((s, i) => ({
                label: s.label,
                value: s.spent_minor,
                key: s.key,
                highlight: i === data.series.length - 1,
              }))}
            />
            <p className="mt-2 text-center text-xs text-slate-500">
              {kind === 'week' ? 'Last 13 weeks (Mon–Sun)' : 'Last 12 months'} · current{' '}
              {periodWord} highlighted
            </p>
          </Card>

          {/* Category breakdown — every expense category, tappable through to the list */}
          <SectionTitle right={<span className="text-xs font-normal">expenses only</span>}>
            Where the money went
          </SectionTitle>
          {data.by_category.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">No spending recorded in this period.</p>
            </Card>
          ) : (
            <Card className="space-y-3">
              {(() => {
                const total = data.by_category.reduce((s, c) => s + c.spent_minor, 0) || 1;
                return data.by_category.map((c, i) => (
                  <button
                    key={c.category_id ?? c.name}
                    type="button"
                    onClick={() =>
                      navigate(
                        c.category_id
                          ? `/transactions?category=${encodeURIComponent(c.category_id)}&type=expense`
                          : '/transactions?type=expense',
                      )
                    }
                    className="block w-full rounded-lg p-1 text-left active:bg-slate-100 dark:active:bg-slate-800"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <Icon
                          name={categoryIcon(c.name)}
                          size={16}
                          style={{ color: categoryColor(c.name) }}
                        />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">
                        {money(c.spent_minor)} · {((c.spent_minor / total) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <HBar
                      pct={(c.spent_minor / total) * 100}
                      color={`hsl(${(i * 47 + 150) % 360} 65% 45%)`}
                    />
                  </button>
                ));
              })()}
            </Card>
          )}

          {/* Biggest expenses */}
          <SectionTitle>Biggest expenses</SectionTitle>
          {data.top_expenses.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">Nothing to list.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-slate-100 !p-0 dark:divide-slate-800">
              {data.top_expenses.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigate(`/add?id=${t.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800/60"
                >
                  <span className="w-5 text-sm font-semibold text-slate-400">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {t.note || t.category_name || 'Expense'}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {dayMonth(t.occurred_on)} · {t.account_name}
                      {t.category_name ? ` · ${t.category_name}` : ''}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                    {money(t.amount_minor, t.account_currency ?? 'MYR')}
                  </span>
                </button>
              ))}
            </Card>
          )}

          {/* Budget performance */}
          <SectionTitle right={<span className="text-xs font-normal">{data.budget_label}</span>}>
            Budget performance
          </SectionTitle>
          {data.budgets.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">
                No budgets set — add them on the Budgets page.
              </p>
            </Card>
          ) : (
            <Card className="space-y-3.5">
              {data.budgets.map((b) => {
                const pct = (b.spent_minor / b.budget_minor) * 100;
                const over = pct >= 100;
                const near = !over && pct >= 70;
                return (
                  <div key={b.category_id}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon
                          name={categoryIcon(b.name)}
                          size={16}
                          style={{ color: categoryColor(b.name) }}
                        />
                        {b.name}
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {money(b.spent_minor)} / {money(b.budget_minor)}
                        <span
                          className={`ml-2 font-semibold ${
                            over
                              ? 'text-rose-600 dark:text-rose-400'
                              : near
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {pct.toFixed(0)}%
                        </span>
                      </span>
                    </div>
                    <ProgressBar pct={pct} />
                  </div>
                );
              })}
            </Card>
          )}

          {/* Export */}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={exportReport}>
              <Icon name="download" size={18} /> Export this report (CSV)
            </Button>
            <Button variant="outline" onClick={exportTransactions}>
              <Icon name="download" size={18} /> Export all transactions (CSV)
            </Button>
          </div>
          <div className="mt-3 flex justify-center">
            <Button variant="ghost" onClick={reload}>
              <Icon name="refresh" size={18} /> Recalculate
            </Button>
          </div>
        </>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  delta,
  netDelta,
  invert,
  periodWord,
}: {
  label: string;
  value: string;
  delta?: number | null;
  netDelta?: number | null;
  invert?: boolean;
  periodWord: string;
}) {
  let badge: { text: string; good: boolean } | null = null;
  let context: string | null = null;
  if (typeof delta === 'number') {
    const up = delta >= 0;
    const good = invert ? !up : up;
    badge = { text: `${up ? '▲' : '▼'} ${Math.abs(delta)}%`, good };
    context = `${Math.abs(delta)}% ${up ? 'more' : 'less'} than last ${periodWord}`;
  } else if (typeof netDelta === 'number') {
    badge = { text: `${netDelta >= 0 ? '▲' : '▼'} ${money(Math.abs(netDelta))}`, good: netDelta >= 0 };
    // Plain language beats a bare signed number: "RM 900.19 less saved…".
    context =
      netDelta === 0
        ? `same as last ${periodWord}`
        : `${money(Math.abs(netDelta))} ${netDelta > 0 ? 'more' : 'less'} saved than last ${periodWord}`;
  }

  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {badge ? (
        <>
          <p
            className={`mt-1 text-xs font-semibold ${
              badge.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {badge.text}
          </p>
          <p className="text-xs text-slate-500">{context}</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-500">no previous data</p>
      )}
    </Card>
  );
}
