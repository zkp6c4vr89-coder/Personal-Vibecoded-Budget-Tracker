import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  ProgressBar,
  SectionTitle,
  inputClass,
} from '../components/ui';
import { api } from '../lib/api';
import { money, parseAmount } from '../lib/money';
import { monthKey, monthLabel, shiftMonth, todayISO } from '../lib/period';
import type { Budget } from '../lib/types';
import { useAsync } from '../lib/hooks';
import { useApp } from '../state/AppContext';

interface BudgetsResponse {
  budgets: Array<Omit<Budget, 'spent_minor'> & { category_name: string; spent_minor: number }>;
  month: string;
}

export default function Budgets() {
  const { categories, budgets: bootBudgets, reload } = useApp();
  const thisMonth = monthKey(todayISO());
  const [month, setMonth] = useState(thisMonth);

  const { data, error, loading, reload: refetch } = useAsync(
    () => api.get<BudgetsResponse>(`/api/budgets?today=${month}-01`),
    [month],
  );

  const [editing, setEditing] = useState<{ category_id: string; name: string; amount: number } | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const rows = data?.budgets ?? [];
  const categoriesWithout = categories.filter((c) => !rows.some((b) => b.category_id === c.id));

  const monthSpent = rows.reduce((s, b) => s + b.spent_minor, 0);
  const monthBudget = rows.reduce((s, b) => s + b.monthly_amount_minor, 0);

  useEffect(() => {
    setAmount(editing ? (editing.amount / 100).toString() : '');
    setFormError(null);
  }, [editing]);

  async function save() {
    if (!editing || busy) return;
    const minor = parseAmount(amount);
    if (minor <= 0) {
      setFormError('Enter a budget greater than zero');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/budgets', { category_id: editing.category_id, monthly_amount_minor: minor });
      await Promise.all([reload(), refetch()]);
      setEditing(null);
    } catch (err: any) {
      setFormError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || busy) return;
    const existing = rows.find((b) => b.category_id === editing.category_id);
    if (!existing) return setEditing(null);
    if (!window.confirm(`Remove the ${editing.name} budget?`)) return;
    setBusy(true);
    try {
      await api.del(`/api/budgets/${existing.id}`);
      await Promise.all([reload(), refetch()]);
      setEditing(null);
    } catch (err: any) {
      setFormError(err?.message || 'Could not delete');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Budgets"
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Previous month"
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 active:bg-slate-200 dark:active:bg-slate-800"
            >
              ‹
            </button>
            <span className="text-sm font-semibold tabular-nums">{monthLabel(month)}</span>
            <button
              type="button"
              onClick={() => setMonth((m) => (m < thisMonth ? shiftMonth(m, 1) : m))}
              disabled={month >= thisMonth}
              aria-label="Next month"
              className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 disabled:opacity-30 active:bg-slate-200 dark:active:bg-slate-800"
            >
              ›
            </button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={refetch} />}

      {loading && !data ? null : rows.length === 0 ? (
        <>
          <EmptyState
            title="No budgets yet"
            body="Set a monthly limit for a category and watch spending against it."
          />
          {categories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.slice(0, 7).map((c) => (
                <Chip
                  key={c.id}
                  onClick={() => setEditing({ category_id: c.id, name: c.name, amount: 0 })}
                >
                  + {c.name}
                </Chip>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Card className="mb-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-500">All categories</span>
              <span className="text-sm font-semibold tabular-nums">
                {money(monthSpent)} / {money(monthBudget)}
              </span>
            </div>
            <ProgressBar pct={monthBudget ? (monthSpent / monthBudget) * 100 : 0} />
          </Card>

          <SectionTitle>By category</SectionTitle>
          <div className="space-y-3">
            {rows.map((b) => {
              const pct = (b.spent_minor / b.monthly_amount_minor) * 100;
              const over = pct >= 100;
              const near = !over && pct >= 80;
              return (
                <Card
                  key={b.category_id}
                  className="p-3.5"
                  onClick={() =>
                    setEditing({
                      category_id: b.category_id,
                      name: b.category_name,
                      amount: b.monthly_amount_minor,
                    })
                  }
                >
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="truncate font-medium">{b.category_name}</span>
                    <span className="shrink-0 text-sm tabular-nums text-slate-500">
                      {money(b.spent_minor)} / {money(b.monthly_amount_minor)}
                    </span>
                  </div>
                  <ProgressBar pct={pct} />
                  <p
                    className={`mt-1.5 flex items-center justify-between text-xs font-medium ${
                      over
                        ? 'text-rose-600 dark:text-rose-400'
                        : near
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500'
                    }`}
                  >
                    <span>{over ? '⚠ Over budget' : near ? '⚠ Near the limit' : 'On track'}</span>
                    <span className="tabular-nums">{pct.toFixed(0)}% used</span>
                  </p>
                </Card>
              );
            })}
          </div>

          {categoriesWithout.length > 0 && (
            <>
              <SectionTitle>Add another</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {categoriesWithout.map((c) => (
                  <Chip key={c.id} onClick={() => setEditing({ category_id: c.id, name: c.name, amount: 0 })}>
                    + {c.name}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <p className="mt-5 text-center text-xs text-slate-500">
        Budgets apply to the current month; spending is counted in MYR (USD converted at your rate).
        Last updated from {bootBudgets.length} saved budget{bootBudgets.length === 1 ? '' : 's'}.
      </p>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.name} budget` : 'Budget'}
      >
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        <Field label="Monthly limit" hint="Applies to every month unless you change it.">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              RM
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500.00"
              autoFocus
              className={`${inputClass} pl-11 tabular-nums`}
            />
          </div>
        </Field>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={remove} disabled={busy} className="flex-1">
            Remove
          </Button>
          <Button onClick={save} loading={busy} className="flex-[2]">
            Save budget
          </Button>
        </div>
      </Modal>
    </>
  );
}