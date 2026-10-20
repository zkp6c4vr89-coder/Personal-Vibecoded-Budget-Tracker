import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Chip, EmptyState, ErrorBanner, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { money } from '../lib/money';
import { dayHeading, todayISO } from '../lib/period';
import type { Transaction } from '../lib/types';
import { useAsync } from '../lib/hooks';
import { useApp } from '../state/AppContext';

const PAGE_SIZE = 50;

export default function Transactions() {
  const { accounts, categories, reload } = useApp();
  const navigate = useNavigate();
  const today = todayISO();

  const [q, setQ] = useState('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set('q', q.trim());
    if (account) sp.set('account', account);
    if (category) sp.set('category', category);
    if (type) sp.set('type', type);
    if (from) sp.set('from', from);
    if (to) sp.set('to', to);
    sp.set('limit', '2000');
    return sp.toString();
  }, [q, account, category, type, from, to]);

  const { data, error, loading, reload: refetch } = useAsync(
    () => api.get<{ transactions: Transaction[] }>(`/api/transactions?${query}`),
    [query],
  );

  const transactions = data?.transactions ?? [];
  const visible = transactions.slice(0, limit);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of visible) {
      const list = map.get(t.occurred_on) ?? [];
      list.push(t);
      map.set(t.occurred_on, list);
    }
    return [...map.entries()];
  }, [visible]);

  const hasFilters = Boolean(q || account || category || type || from || to);

  async function removeTx(tx: Transaction) {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.del(`/api/transactions/${tx.id}`);
      await Promise.all([reload(), refetch()]);
    } catch (err: any) {
      window.alert(err?.message || 'Could not delete');
    }
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        right={
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={`min-h-10 rounded-xl px-3 text-sm font-semibold ${
              showFilters || hasFilters
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'text-slate-500 active:bg-slate-200 dark:active:bg-slate-800'
            }`}
          >
            Filters
          </button>
        }
      />

      <input
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setLimit(PAGE_SIZE);
        }}
        placeholder="Search note or amount…"
        className="mb-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900"
        aria-label="Search transactions"
      />

      {showFilters && (
        <Card className="mb-3 space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Account
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip active={account === ''} onClick={() => setAccount('')}>
                All
              </Chip>
              {accounts.map((a) => (
                <Chip key={a.id} active={account === a.id} onClick={() => setAccount(a.id)}>
                  {a.name}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Category
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip active={category === ''} onClick={() => setCategory('')}>
                All
              </Chip>
              {categories.map((c) => (
                <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Type
            </p>
            <div className="flex flex-wrap gap-2">
              <Chip active={type === ''} onClick={() => setType('')}>
                All
              </Chip>
              <Chip active={type === 'expense'} onClick={() => setType('expense')}>
                Expense
              </Chip>
              <Chip active={type === 'income'} onClick={() => setType('income')}>
                Income
              </Chip>
              <Chip active={type === 'transfer'} onClick={() => setType('transfer')}>
                Transfer
              </Chip>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Date range
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                aria-label="From date"
              />
              <span className="text-slate-400">→</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                aria-label="To date"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-slate-500">
              {transactions.length} matching
            </span>
            <button
              type="button"
              onClick={() => {
                setQ('');
                setAccount('');
                setCategory('');
                setType('');
                setFrom('');
                setTo('');
              }}
              className="min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-500 active:bg-slate-200 dark:active:bg-slate-800"
            >
              Clear all
            </button>
          </div>
        </Card>
      )}

      {error && <ErrorBanner message={error} onDismiss={refetch} />}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6 text-emerald-600" />
        </div>
      ) : transactions.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No transactions match' : 'No transactions yet'}
          body={hasFilters ? 'Try clearing the filters.' : 'Tap + to add your first one.'}
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => {
            const spent = items
              .filter((t) => t.type === 'expense')
              .reduce((s, t) => s + t.amount_minor, 0);
            return (
              <section key={day}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {dayHeading(day, today)}
                  </h2>
                  {spent > 0 && (
                    <span className="text-xs text-slate-500">{money(spent)} spent</span>
                  )}
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <Row
                      key={t.id}
                      tx={t}
                      onOpen={() => navigate(`/add?id=${t.id}`)}
                      onDelete={() => removeTx(t)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {visible.length < transactions.length && (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              className="w-full min-h-12 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 active:bg-white dark:border-slate-700 dark:text-slate-300 dark:active:bg-slate-900"
            >
              Load more ({transactions.length - visible.length} remaining)
            </button>
          )}
        </div>
      )}
    </>
  );
}

function Row({ tx, onOpen, onDelete }: { tx: Transaction; onOpen: () => void; onDelete: () => void }) {
  const currency = tx.account_currency ?? 'MYR';
  const isTransfer = tx.type === 'transfer';
  const tone =
    tx.type === 'income'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tx.type === 'expense'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-sky-600 dark:text-sky-400';

  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
      <button type="button" onClick={onOpen} className="flex min-h-11 flex-1 items-center gap-3 text-left">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            isTransfer
              ? 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300'
              : tx.type === 'income'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300'
          }`}
        >
          {isTransfer ? '⇄' : tx.type === 'income' ? '↓' : '↑'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {tx.note || tx.category_name || (isTransfer ? 'Transfer' : tx.type)}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {isTransfer
              ? `${tx.account_name} → ${tx.to_account_name}`
              : `${tx.account_name}${tx.category_name ? ` · ${tx.category_name}` : ''}`}
          </span>
        </span>
      </button>
      <div className="flex items-center gap-1">
        <span className={`text-sm font-semibold tabular-nums ${tone}`}>
          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
          {money(tx.amount_minor, currency)}
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete transaction"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 active:bg-rose-50 active:text-rose-600 dark:active:bg-rose-950"
        >
          ×
        </button>
      </div>
    </div>
  );
}