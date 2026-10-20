import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Chip, ErrorBanner, PageHeader, inputClass } from '../components/ui';
import { Icon, categoryColor, categoryIcon } from '../components/icons';
import { api } from '../lib/api';
import { money, parseAmount } from '../lib/money';
import { addDays, todayISO } from '../lib/period';
import type { Transaction, TxType } from '../lib/types';
import { useLocal } from '../lib/hooks';
import { useToast } from '../components/Toast';
import { useApp } from '../state/AppContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** Light tactile tick for keypad presses (no-op where unsupported). */
function haptic(pattern: number | number[] = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported — silent */
  }
}

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          data-key={k}
          onClick={() => onKey(k)}
          className="h-12 bg-white text-xl font-medium text-slate-800 active:bg-emerald-100 dark:bg-slate-900 dark:text-slate-100 dark:active:bg-emerald-950"
        >
          {k === '⌫' ? '⌫' : k}
        </button>
      ))}
    </div>
  );
}

/** Apply one keypad press to the raw amount string. */
function pressKey(value: string, key: string): string {
  if (key === '⌫') return value.slice(0, -1);
  if (key === '.') {
    if (value.includes('.')) return value;
    return value === '' ? '0.' : value + '.';
  }
  // Seven integer digits + 2 decimals is plenty for a personal ledger.
  if (/[0-9]/.test(key)) {
    const [intPart, decPart] = value.split('.');
    if (value.includes('.')) {
      if ((decPart ?? '').length >= 2) return value;
      if (intPart === '0') return '0.' + key;
      return value + key;
    }
    const digits = intPart.replace(/^0+/, '');
    if (digits.length >= 7) return value;
    if (value === '0') return key;
    return value + key;
  }
  return value;
}

export default function AddTransaction() {
  const { accounts, categories, budgets, reload, settings } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const editId = params.get('id');
  const [lastAccount, setLastAccount] = useLocal<string>('lastAccount', '');

  // Account remembers the last one you used; category deliberately starts
  // empty so a save is never attributed to the wrong bucket.
  const defaultAccount =
    accounts.find((a) => a.id === lastAccount)?.id ?? accounts.find(() => true)?.id ?? '';

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(defaultAccount);
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!editId);
  const amountRef = useRef<HTMLDivElement>(null);

  const currency = accounts.find((a) => a.id === accountId)?.currency ?? 'MYR';
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const toCurrency = toAccount?.currency ?? currency;
  const crossCurrency = type === 'transfer' && toAccount && toAccount.currency !== currency;

  const amountMinor = parseAmount(amount);

  // Editing an existing transaction: prefill the form.
  useEffect(() => {
    if (!editId || loaded) return;
    let alive = true;
    api
      .get<{ transaction: Transaction }>(`/api/transactions/${editId}`)
      .then(({ transaction }) => {
        if (!alive) return;
        setType(transaction.type);
        setAmount((transaction.amount_minor / 100).toString());
        setAccountId(transaction.account_id);
        setToAccountId(transaction.to_account_id ?? '');
        setCategoryId(transaction.category_id ?? '');
        setNote(transaction.note);
        setDate(transaction.occurred_on);
      })
      .catch((err) => setError(err.message))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [editId, loaded]);

  useEffect(() => {
    if (!accounts.some((a) => a.id === accountId) && accounts[0]) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  // Pick a sensible second account for transfers.
  useEffect(() => {
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      const other = accounts.find((a) => a.id !== accountId);
      setToAccountId(other?.id ?? '');
    }
  }, [type, accountId, accounts, toAccountId]);

  const visibleCategories = useMemo(() => {
    const wanted = type === 'income' ? 'income' : 'expense';
    return categories.filter((c) => (c.kind ?? 'expense') === wanted);
  }, [categories, type]);

  // Switching Expense <-> Income invalidates a category from the other list.
  useEffect(() => {
    if (type === 'transfer') return;
    if (categoryId && !visibleCategories.some((c) => c.id === categoryId)) setCategoryId('');
  }, [type, visibleCategories, categoryId]);

  const budgetedCategory = budgets.find((b) => b.category_id === categoryId);

  const canSave =
    amountMinor > 0 &&
    (type === 'transfer'
      ? Boolean(toAccountId) && toAccountId !== accountId
      : Boolean(categoryId));

  async function save() {
    if (busy || !canSave) return;
    setBusy(true);
    setError(null);
    const body = {
      type,
      amount_minor: amountMinor,
      account_id: accountId,
      to_account_id: type === 'transfer' ? toAccountId : null,
      category_id: type === 'transfer' ? null : categoryId || null,
      note,
      occurred_on: date,
    };
    try {
      const saved = editId
        ? await api.patch<{ transaction: Transaction }>(`/api/transactions/${editId}`, body)
        : await api.post<{ transaction: Transaction }>('/api/transactions', body);
      if (accountId) setLastAccount(accountId);
      await reload();
      haptic([10, 40, 10]);
      const label = type === 'income' ? 'Income' : type === 'transfer' ? 'Transfer' : 'Expense';
      const edited = saved?.transaction;
      const amountText = money(edited?.amount_minor ?? amountMinor, currency);
      toast({
        message: editId ? 'Changes saved' : `${label} ${amountText} saved`,
        tone: 'success',
      });
      navigate(editId ? '/transactions' : '/');
    } catch (err: any) {
      setError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editId || busy) return;
    if (!window.confirm('Delete this transaction?')) return;
    setBusy(true);
    try {
      await api.del(`/api/transactions/${editId}`);
      await reload();
      toast({ message: 'Transaction deleted', tone: 'danger' });
      navigate('/transactions');
    } catch (err: any) {
      setError(err?.message || 'Could not delete');
      setBusy(false);
    }
  }

  if (!loaded) {
    return <PageHeader title={type === 'expense' ? 'Add expense' : 'Transaction'} />;
  }
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="Add" />
        <ErrorBanner message="Add an account in Settings first." />
      </>
    );
  }

  const previewToAmount =
    crossCurrency && amountMinor > 0
      ? currency === 'USD'
        ? Math.round(amountMinor * settings.usd_myr_rate)
        : Math.round(amountMinor / settings.usd_myr_rate)
      : amountMinor;

  const missingAmount = amountMinor <= 0;
  const missingCategory = type !== 'transfer' && !categoryId;
  const hint = missingAmount
    ? 'Enter an amount to enable Save.'
    : missingCategory
      ? 'Choose a category to enable Save.'
      : type === 'transfer' && (toAccountId === accountId || !toAccountId)
        ? 'Pick a different destination account.'
        : null;

  return (
    <div className="flex min-h-dvh flex-col">
      {/* One dismiss action only — the back chevron beside it was redundant. */}
      <PageHeader
        title={
          editId
            ? 'Edit transaction'
            : type === 'transfer'
              ? 'Transfer'
              : type === 'income'
                ? 'Add income'
                : 'Add expense'
        }
        right={
          <div className="flex items-center gap-1">
            {editId && (
              <button
                type="button"
                onClick={remove}
                className="min-h-11 rounded-xl px-3 text-sm font-semibold text-rose-600 active:bg-rose-50 dark:text-rose-400 dark:active:bg-rose-950"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(editId ? '/transactions' : '/')}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-slate-700 active:bg-slate-200 dark:text-slate-200 dark:active:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        }
      />

      {/* Scrollable content: everything ends above the pinned dock. */}
      <div className="pb-sheet">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {/* Type + amount stay pinned under the header while you tap the pad */}
        <div className="sticky top-16 z-10 -mx-4 bg-slate-100 px-4 pb-3 dark:bg-[#0b1220]">
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
            {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={`min-h-11 rounded-lg text-sm font-semibold capitalize transition ${
                  type === t
                    ? 'bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div
            ref={amountRef}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div className="text-4xl font-bold tabular-nums">
              <span className="text-slate-400 dark:text-slate-500">
                {currency === 'USD' ? '$' : 'RM '}
              </span>
              {amount === '' ? <span className="text-slate-300 dark:text-slate-600">0.00</span> : amount}
            </div>
            {crossCurrency ? (
              <p className="mt-1 text-xs text-slate-500">
                ≈ {money(previewToAmount, toCurrency)} in {toAccount?.name} at your rate of{' '}
                {settings.usd_myr_rate}
              </p>
            ) : type !== 'transfer' && budgetedCategory ? (
              <p className="mt-1 text-xs text-slate-500">
                {budgetedCategory.category_name}: budget{' '}
                {money(budgetedCategory.monthly_amount_minor)} · spent{' '}
                {money(budgetedCategory.spent_minor ?? 0)}
              </p>
            ) : null}
            {hint && <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">{hint}</p>}
          </div>
        </div>

        {/* Account */}
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            {type === 'transfer' ? 'From account' : 'Account'}
          </p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <Chip key={a.id} active={a.id === accountId} onClick={() => setAccountId(a.id)}>
                {a.name} · {a.currency}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Balance {money(accounts.find((a) => a.id === accountId)?.balance_minor ?? 0, currency)}
          </p>
        </div>

        {/* Destination */}
        {type === 'transfer' && (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">To account</p>
            <div className="flex flex-wrap gap-2">
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <Chip key={a.id} active={a.id === toAccountId} onClick={() => setToAccountId(a.id)}>
                    {a.name} · {a.currency}
                  </Chip>
                ))}
            </div>
            {crossCurrency && amountMinor > 0 && (
              <p className="mt-1.5 text-xs text-slate-500">
                {toAccount?.name} receives ≈ {money(previewToAmount, toCurrency)}
              </p>
            )}
          </div>
        )}

        {/* Categories — expense buckets for spending, income buckets for earnings */}
        {type !== 'transfer' && visibleCategories.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
              Category {type === 'income' ? '(income)' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {visibleCategories.map((c) => (
                <Chip key={c.id} active={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
                  <span className="flex items-center gap-1.5">
                    <Icon
                      name={categoryIcon(c.name)}
                      size={16}
                      style={{ color: categoryColor(c.name) }}
                    />
                    {c.name}
                  </span>
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Note + date */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Note (optional)
            </span>
            <input
              type="text"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Nasi lemak, Grab to work"
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setDate(todayISO())}
              className={`min-h-11 rounded-xl border px-2 text-sm font-medium ${
                date === todayISO()
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDate(addDays(todayISO(), -1))}
              className={`min-h-11 rounded-xl border px-2 text-sm font-medium ${
                date === addDays(todayISO(), -1)
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200'
              }`}
            >
              Yesterday
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              aria-label="Date"
            />
          </div>
        </div>
      </div>

      {/* Pinned dock: compact numpad, then the sticky Save beneath it. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur dark:border-slate-800 dark:bg-[#0b1220]/95">
        <div className="mx-auto w-full max-w-2xl px-4 pt-2">
          <Keypad onKey={(k) => { haptic(); setAmount((v) => pressKey(v, k)); }} />
          <Button
            onClick={save}
            loading={busy}
            disabled={!canSave}
            className="mt-3 w-full py-3.5 text-base"
          >
            {editId ? 'Save changes' : `Save ${type}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
