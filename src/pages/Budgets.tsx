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
  SkeletonList,
  inputClass,
} from '../components/ui';
import { Icon, categoryColor, categoryIcon } from '../components/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { money, parseAmount } from '../lib/money';
import { daysInMonth, monthKey, monthLabel, shiftMonth, todayISO } from '../lib/period';
import type { Budget } from '../lib/types';
import { useAsync } from '../lib/hooks';
import { useApp } from '../state/AppContext';

interface BudgetsResponse {
  budgets: Array<Omit<Budget, 'spent_minor'> & { category_name: string; spent_minor: number }>;
  month: string;
}

/** Days left in the month (inclusive of today) for the daily-pace line. */
function daysLeft(month: string, today: string): number {
  const end = monthRangeEnd(month);
  if (end <= today) return 0;
  return Math.round((Date.parse(end) - Date.parse(today)) / 86400000) + 1;
}

function monthRangeEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
}

export default function Budgets() {
  const { categories, reload } = useApp();
  const toast = useToast();
  const thisMonth = monthKey(todayISO());
  const today = todayISO();
  const [month, setMonth] = useState(thisMonth);

  const { data, error, loading, reload: refetch } = useAsync(
    () => api.get<BudgetsResponse>(`/api/budgets?today=${month}-01`),
    [month],
  );

  const [editing, setEditing] = useState<{ category_id: string; name: string; amount: number } | null>(null);
  const [adding, setAdding] = useState<{ category_id: string; name: string } | null>(null);
  const [addAmount, setAddAmount] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const rows = data?.budgets ?? [];
  const categoriesWithout = categories.filter(
    (c) => c.kind !== 'income' && !rows.some((b) => b.category_id === c.id),
  );

  const monthSpent = rows.reduce((s, b) => s + b.spent_minor, 0);
  const monthBudget = rows.reduce((s, b) => s + b.monthly_amount_minor, 0);
  const left = month === thisMonth ? daysLeft(month, today) : 0;

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
      toast({ message: `${editing.name} budget saved`, tone: 'success' });
      setEditing(null);
    } catch (err: any) {
      setFormError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function saveInline() {
    if (!adding || busy) return;
    const minor = parseAmount(addAmount);
    if (minor <= 0) {
      setFormError('Enter a budget greater than zero');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await api.post('/api/budgets', { category_id: adding.category_id, monthly_amount_minor: minor });
      await Promise.all([reload(), refetch()]);
      toast({ message: `${adding.name} budget added`, tone: 'success' });
      setAdding(null);
      setAddAmount('');
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
      toast({ message: `${editing.name} budget removed`, tone: 'danger' });
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
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-200 dark:text-slate-200 dark:active:bg-slate-800"
            >
              ‹
            </button>
            <span className="text-sm font-semibold tabular-nums">{monthLabel(month)}</span>
            <button
              type="button"
              onClick={() => setMonth((m) => (m < thisMonth ? shiftMonth(m, 1) : m))}
              disabled={month >= thisMonth}
              aria-label="Next month"
              className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 disabled:text-slate-400 active:bg-slate-200 dark:text-slate-200 dark:disabled:text-slate-600 dark:active:bg-slate-800"
            >
              ›
            </button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={refetch} />}

      {loading && !data ? (
        <SkeletonList rows={3} />
      ) : rows.length === 0 ? (
        <>
          <EmptyState
            title="No budgets yet"
            body="Set a monthly limit for a category and watch spending against it."
          />
          {categories.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {categoriesWithout.slice(0, 7).map((c) => (
                <Chip
                  key={c.id}
                  active={adding?.category_id === c.id}
                  onClick={() => {
                    setAdding({ category_id: c.id, name: c.name });
                    setAddAmount('');
                    setFormError(null);
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <Icon name={categoryIcon(c.name)} size={16} style={{ color: categoryColor(c.name) }} />
                    {c.name}
                  </span>
                </Chip>
              ))}
            </div>
          )}
          {adding && (
            <InlineBudgetInput
              name={adding.name}
              value={addAmount}
              onChange={setAddAmount}
              onSave={saveInline}
              onCancel={() => setAdding(null)}
              busy={busy}
              error={formError}
            />
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
              const near = !over && pct >= 70;
              const remaining = b.monthly_amount_minor - b.spent_minor;
              const pace = left > 0 ? Math.round(remaining / left) : 0;
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
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon
                        name={categoryIcon(b.category_name)}
                        size={16}
                        style={{ color: categoryColor(b.category_name) }}
                      />
                      <span className="truncate font-medium">{b.category_name}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-slate-500">
                      {money(b.spent_minor)} / {money(b.monthly_amount_minor)}
                    </span>
                  </div>
                  <ProgressBar pct={pct} />
                  <p
                    className={`mt-1.5 text-xs font-medium ${
                      over
                        ? 'text-rose-600 dark:text-rose-400'
                        : near
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {over
                      ? `${money(Math.abs(remaining))} over the limit`
                      : `${money(remaining)} left${
                          left > 0 ? ` · ${money(pace)}/day for ${left} days` : ''
                        }`}
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
                  <Chip
                    key={c.id}
                    active={adding?.category_id === c.id}
                    onClick={() => {
                      setAdding({ category_id: c.id, name: c.name });
                      setAddAmount('');
                      setFormError(null);
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon name={categoryIcon(c.name)} size={16} style={{ color: categoryColor(c.name) }} />
                      {c.name}
                    </span>
                  </Chip>
                ))}
              </div>
              {adding && (
                <InlineBudgetInput
                  name={adding.name}
                  value={addAmount}
                  onChange={setAddAmount}
                  onSave={saveInline}
                  onCancel={() => setAdding(null)}
                  busy={busy}
                  error={formError}
                />
              )}
            </>
          )}
        </>
      )}

      <p className="mt-5 text-center text-xs text-slate-500">
        Each budget is a monthly limit for one category, counted in MYR (USD spending converts at
        your rate). Tap a budget to edit or remove it.
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

/** Inline amount input shown under the "Add another" chips when one is tapped. */
function InlineBudgetInput({
  name,
  value,
  onChange,
  onSave,
  onCancel,
  busy,
  error,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Card className="mt-3">
      <p className="mb-2 text-sm font-semibold">
        {name} budget
        {error && <span className="ml-2 font-normal text-rose-600 dark:text-rose-400">{error}</span>}
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            RM
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="500.00"
            autoFocus
            className={`${inputClass} pl-11 tabular-nums`}
            aria-label={`${name} monthly limit`}
          />
        </div>
        <Button onClick={onSave} loading={busy}>
          Add
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
