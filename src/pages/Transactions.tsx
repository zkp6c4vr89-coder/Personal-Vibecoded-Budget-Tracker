import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Chip, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '../components/ui';
import { Icon, txColor, txIconName } from '../components/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { txSpeechWithDate } from '../lib/a11y';
import { money } from '../lib/money';
import { dayHeading, todayISO } from '../lib/period';
import type { Transaction } from '../lib/types';
import { useAsync } from '../lib/hooks';
import { useApp } from '../state/AppContext';

const PAGE_SIZE = 50;

export default function Transactions() {
  const { accounts, categories, reload } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const today = todayISO();
  const [params] = useSearchParams();

  // Deep links (e.g. tapping a donut slice on Home) preselect the filters.
  const [q, setQ] = useState(params.get('q') ?? '');
  const [account, setAccount] = useState(params.get('account') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [type, setType] = useState(params.get('type') ?? '');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
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

  const activeFilters = [account, category, type, from, to].filter(Boolean).length;

  /**
   * Swipe-left deletes, and the snackbar's Undo re-creates the same row from
   * its stored fields — no confirmation dialog, no mis-tappable red ✕.
   */
  async function deleteTx(tx: Transaction) {
    try {
      await api.del(`/api/transactions/${tx.id}`);
      await Promise.all([reload(), refetch()]);
      toast({
        message: `Deleted ${tx.note || tx.category_name || tx.type}`,
        tone: 'danger',
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await api.post('/api/transactions', {
                type: tx.type,
                amount_minor: tx.amount_minor,
                to_amount_minor: tx.to_amount_minor,
                account_id: tx.account_id,
                to_account_id: tx.to_account_id,
                category_id: tx.category_id,
                note: tx.note,
                occurred_on: tx.occurred_on,
              });
              await Promise.all([reload(), refetch()]);
              toast({ message: 'Restored', tone: 'success' });
            } catch (err: any) {
              toast({ message: err?.message || 'Could not restore', tone: 'danger' });
            }
          },
        },
      });
    } catch (err: any) {
      toast({ message: err?.message || 'Could not delete', tone: 'danger' });
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
            aria-expanded={showFilters}
            className={`relative flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${
              showFilters || activeFilters
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'text-slate-700 active:bg-slate-200 dark:text-slate-200 dark:active:bg-slate-800'
            }`}
          >
            <Icon name="filter" size={18} />
            Filters
            {activeFilters > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[11px] font-bold text-white">
                {activeFilters}
              </span>
            )}
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
                  {c.kind === 'income' ? ' ↑' : ''}
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
            <span className="text-sm text-slate-500">{transactions.length} matching</span>
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
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-700 active:bg-slate-200 dark:text-slate-200 dark:active:bg-slate-800"
            >
              Clear all
            </button>
          </div>
        </Card>
      )}

      {error && <ErrorBanner message={error} onDismiss={refetch} />}

      {loading && !data ? (
        <SkeletonList rows={5} />
      ) : transactions.length === 0 ? (
        <EmptyState
          title={activeFilters || q ? 'No transactions match' : 'No transactions yet'}
          body={activeFilters || q ? 'Try clearing the filters.' : 'Tap + to add your first one.'}
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => {
            const spent = items
              .filter((t) => t.type === 'expense')
              .reduce((s, t) => s + t.amount_minor, 0);
            const earned = items
              .filter((t) => t.type === 'income')
              .reduce((s, t) => s + t.amount_minor, 0);
            const parts: string[] = [];
            if (spent > 0) parts.push(`${money(spent)} spent`);
            if (earned > 0) parts.push(`+${money(earned)} in`);
            return (
              <section key={day}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                    {dayHeading(day, today)}
                  </h2>
                  {parts.length > 0 && (
                    <span className="text-xs text-slate-500">{parts.join(' · ')}</span>
                  )}
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <Row
                      key={t.id}
                      tx={t}
                      today={today}
                      onOpen={() => navigate(`/add?id=${t.id}`)}
                      onDelete={() => deleteTx(t)}
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

const SWIPE_THRESHOLD = 72; // px of left travel that commits a delete

function Row({
  tx,
  today,
  onOpen,
  onDelete,
}: {
  tx: Transaction;
  today: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const currency = tx.account_currency ?? 'MYR';
  const isTransfer = tx.type === 'transfer';
  const color = txColor(tx);
  const speech = txSpeechWithDate(tx, today);
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  // Mirror of dx for the pointerup decision: state may still be stale when
  // events arrive within one frame.
  const dxRef = useRef(0);

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY, active: true };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current.active) return;
    const moveX = e.clientX - start.current.x;
    const moveY = e.clientY - start.current.y;
    // Vertical movement means the user is scrolling — stand down.
    if (Math.abs(moveY) > Math.abs(moveX)) {
      start.current.active = false;
      dxRef.current = 0;
      setDx(0);
      return;
    }
    const next = Math.max(-SWIPE_THRESHOLD - 24, Math.min(0, moveX));
    dxRef.current = next;
    setDx(next);
  }

  function onPointerUp() {
    if (!start.current.active) {
      dxRef.current = 0;
      setDx(0);
      return;
    }
    start.current.active = false;
    if (dxRef.current <= -SWIPE_THRESHOLD) {
      dxRef.current = -SWIPE_THRESHOLD;
      setDx(-SWIPE_THRESHOLD);
      onDelete();
    } else {
      dxRef.current = 0;
      setDx(0);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Delete affordance — only mounted mid-swipe, so it can never show
          through the (deliberately tinted) row surface at rest. */}
      {dx !== 0 && (
        <div className="absolute inset-y-0 right-0 flex w-24 items-center justify-center rounded-r-2xl bg-rose-600 text-white">
          <Icon name="trash" size={20} />
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        aria-label={`${speech}. Swipe left to delete.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-transform dark:border-slate-800 dark:bg-[#0d1526]"
        style={{
          transform: `translateX(${dx}px)`,
          touchAction: 'pan-y',
          transition: start.current.active ? 'none' : undefined,
        }}
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${color}22`, color }}
        >
          <Icon name={txIconName(tx)} size={18} />
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
        <span
          className={`text-sm font-semibold tabular-nums ${
            tx.type === 'income'
              ? 'text-emerald-600 dark:text-emerald-400'
              : tx.type === 'expense'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-sky-600 dark:text-sky-400'
          }`}
        >
          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
          {money(tx.amount_minor, currency)}
        </span>
      </div>
    </div>
  );
}
