import { useNavigate } from 'react-router-dom';
import { Bars, CHART_COLORS, Donut } from '../components/charts';
import { Card, Chip, ErrorBanner, PageHeader, ProgressBar, SectionTitle, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { money } from '../lib/money';
import { dayHeading, todayISO, weekRange } from '../lib/period';
import type { Dashboard as DashboardData } from '../lib/types';
import { useAsync } from '../lib/hooks';
import { useApp } from '../state/AppContext';

export default function Dashboard() {
  const { accounts, settings, reload } = useApp();
  const navigate = useNavigate();
  const today = todayISO();
  const week = weekRange(today);

  const { data, error, loading, reload: refetch } = useAsync(
    () => api.get<DashboardData>(`/api/dashboard?today=${today}`),
    [],
  );

  if (loading && !data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6 text-emerald-600" />
      </div>
    );
  }

  if (error && !data) return <ErrorBanner message={error} onDismiss={refetch} />;
  if (!data) return null;

  const recent = data.recent.slice(0, 6);

  return (
    <>
      <PageHeader
        title="Budget Tracker"
        right={
          <button
            type="button"
            onClick={() => {
              refetch();
              reload().catch(() => {});
            }}
            aria-label="Refresh"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 active:bg-slate-200 dark:active:bg-slate-800"
          >
            ⟳
          </button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={refetch} />}

      {/* Combined total */}
      <Card className="bg-gradient-to-br from-emerald-600 to-emerald-700 !border-emerald-600 text-white dark:from-emerald-700 dark:to-emerald-800">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-100/90">
          Total balance
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums">{money(data.total_myr_minor)}</p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-emerald-100/90">{accounts.length} accounts</span>
          <button type="button" onClick={() => navigate('/settings')} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold active:bg-white/25">
            1 USD = RM {settings.usd_myr_rate} · edit
          </button>
        </div>
      </Card>

      {/* Accounts */}
      <SectionTitle>Accounts</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.accounts.map((a, i) => (
          <Card key={a.id} className="p-3.5" onClick={() => navigate('/settings')}>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{a.name}</p>
            </div>
            <p className="mt-1.5 text-lg font-semibold tabular-nums">
              {money(a.balance_minor ?? 0, a.currency)}
            </p>
          </Card>
        ))}
      </div>

      {/* Week / month */}
      <SectionTitle>This week &amp; this month</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <PeriodCard
          title={`Week · ${week.start.slice(8)}–${week.end.slice(8)}`}
          spent={data.week.spent_minor}
          income={data.week.income_minor}
          net={data.week.net_minor}
        />
        <PeriodCard
          title={data.month.label}
          spent={data.month.spent_minor}
          income={data.month.income_minor}
          net={data.month.net_minor}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">Transfers between accounts are not counted.</p>

      {/* Category donut */}
      <SectionTitle right={<span className="text-xs font-normal text-slate-500">{data.month.label}</span>}>
        Spending by category
      </SectionTitle>
      <Card>
        <Donut data={data.by_category.map((c) => ({ name: c.name, value: c.spent_minor }))} />
      </Card>

      {/* Over time */}
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
        <p className="mt-2 text-center text-xs text-slate-500">Last 13 weeks (Mon–Sun)</p>
      </Card>

      {/* Budgets */}
      <SectionTitle
        right={
          <button
            type="button"
            onClick={() => navigate('/budgets')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            Manage
          </button>
        }
      >
        Budgets
      </SectionTitle>
      {data.budgets.length === 0 ? (
        <Card onClick={() => navigate('/budgets')}>
          <p className="text-sm text-slate-500">
            No budgets yet — set a monthly limit per category to track progress.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.budgets.slice(0, 4).map((b) => {
            const pct = (b.spent_minor / b.budget_minor) * 100;
            return (
              <Card key={b.category_id} className="p-3.5" onClick={() => navigate('/budgets')}>
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{b.name}</span>
                  <span className="tabular-nums text-slate-500">
                    {money(b.spent_minor)} / {money(b.budget_minor)}
                  </span>
                </div>
                <ProgressBar pct={pct} />
                <p
                  className={`mt-1.5 text-xs font-medium ${
                    pct >= 100
                      ? 'text-rose-600 dark:text-rose-400'
                      : pct >= 80
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-slate-500'
                  }`}
                >
                  {pct >= 100
                    ? 'Over budget!'
                    : pct >= 80
                      ? 'Approaching limit'
                      : `${pct.toFixed(0)}% used`}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Recent */}
      <SectionTitle
        right={
          <button
            type="button"
            onClick={() => navigate('/transactions')}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            View all
          </button>
        }
      >
        Recent transactions
      </SectionTitle>
      <div className="space-y-2">
        {recent.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => navigate(`/add?id=${t.id}`)}
            className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left active:opacity-90 dark:border-slate-800 dark:bg-slate-900/60"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {t.note || t.category_name || (t.type === 'transfer' ? 'Transfer' : t.type)}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {dayHeading(t.occurred_on, today)} ·{' '}
                {t.type === 'transfer'
                  ? `${t.account_name} → ${t.to_account_name}`
                  : t.account_name}
              </span>
            </span>
            <span
              className={`text-sm font-semibold tabular-nums ${
                t.type === 'income'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : t.type === 'expense'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-sky-600 dark:text-sky-400'
              }`}
            >
              {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
              {money(t.amount_minor, t.account_currency ?? 'MYR')}
            </span>
          </button>
        ))}
      </div>

      <div className="h-4" />
      <div className="flex justify-center">
        <Chip onClick={() => navigate('/add')}>+ Add transaction</Chip>
      </div>
    </>
  );
}

function PeriodCard({
  title,
  spent,
  income,
  net,
}: {
  title: string;
  spent: number;
  income: number;
  net: number;
}) {
  return (
    <Card className="p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="space-y-1.5 text-sm">
        <Row label="Spent" value={money(spent)} tone="text-rose-600 dark:text-rose-400" />
        <Row label="Income" value={`+${money(income)}`} tone="text-emerald-600 dark:text-emerald-400" />
        <div className="mt-1 border-t border-dashed border-slate-200 pt-1.5 dark:border-slate-700">
          <Row label="Net" value={`${net >= 0 ? '+' : ''}${money(net)}`} bold />
        </div>
      </div>
    </Card>
  );
}

function Row({
  label,
  value,
  tone = '',
  bold,
}: {
  label: string;
  value: string;
  tone?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`tabular-nums ${bold ? 'font-semibold' : 'font-medium'} ${tone}`}>{value}</span>
    </div>
  );
}