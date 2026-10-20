import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Chip, ErrorBanner, PageHeader, inputClass } from '../components/ui';
import { api } from '../lib/api';
import { money, parseAmount } from '../lib/money';
import { addDays, todayISO } from '../lib/period';
import type { Transaction, TxType } from '../lib/types';
import { useLocal } from '../lib/hooks';
import { useApp } from '../state/AppContext';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 dark:border-slate-700 dark:bg-slate-700">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          data-key={k}
          onClick={() => onKey(k)}
          className="h-14 bg-white text-2xl font-medium text-slate-800 active:bg-emerald-100 dark:bg-slate-900 dark:text-slate-100 dark:active:bg-emerald-950"
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
  // Three integer digits + 2 decimals is plenty for a personal ledger.
  if (/[0-9]/.test(key)) {
    const [intPart, decPart] = value.split('.');
    if (value.includes('.')) {
      if ((decPart ?? '').length >= 2) return value;
      if (intPart === '0') return key + (decPart ?? '') ? '0.' + key : value;
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
  const [params] = useSearchParams();
  const editId = params.get('id');
  const [lastAccount, setLastAccount] = useLocal<string>('lastAccount', '');
  const [lastCategory, setLastCategory] = useLocal<string>('lastCategory', '');

  const defaultAccount =
    accounts.find((a) => a.id === lastAccount)?.id ?? accounts.find(() => true)?.id ?? '';

  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(defaultAccount);
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState(lastCategory || '');
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

  const visibleCategories = useMemo(() => categories.filter((c) => !c.archived), [categories]);
  const budgetedCategory = budgets.find((b) => b.category_id === categoryId);

  async function save() {
    if (busy) return;
    if (amountMinor <= 0) {
      setError('Enter an amount first');
      amountRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (type !== 'transfer' && visibleCategories.length > 0 && !categoryId) {
      setError('Pick a category');
      return;
    }
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
      if (editId) await api.patch(`/api/transactions/${editId}`, body);
      else await api.post('/api/transactions', body);
      if (accountId) setLastAccount(accountId);
      if (categoryId) setLastCategory(categoryId);
      await reload();
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
      navigate('/transactions');
    } catch (err: any) {
      setError(err?.message || 'Could not delete');
      setBusy(false);
    }
  }

  if (!loaded) return <PageHeader title={type === 'expense' ? 'Add expense' : 'Transaction'} back={() => navigate(-1)} />;
  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="Add" back={() => navigate('/')} />
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

  return (
    <div className="flex min-h-dvh flex-col">
      <PageHeader
        title={editId ? 'Edit transaction' : type === 'transfer' ? 'Transfer' : type === 'income' ? 'Add income' : 'Add expense'}
        back={() => navigate(editId ? '/transactions' : '/')}
        right={
          <div className="flex gap-1">
            {editId && (
              <button
                type="button"
                onClick={remove}
                className="min-h-10 rounded-xl px-3 text-sm font-semibold text-rose-600 active:bg-rose-50 dark:text-rose-400 dark:active:bg-rose-950"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(editId ? '/transactions' : '/')}
              className="min-h-10 rounded-xl px-3 text-sm font-semibold text-slate-500 active:bg-slate-200 dark:active:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Type toggle */}
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
        {(['expense', 'income', 'transfer'] as TxType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`min-h-10 rounded-lg text-sm font-semibold capitalize transition ${
              type === t
                ? 'bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Amount */}
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
        {crossCurrency && (
          <p className="mt-1 text-xs text-slate-500">
            ≈ {money(previewToAmount, toCurrency)} in {toAccount?.name} (rate{' '}
            {settings.usd_myr_rate})
          </p>
        )}
        <div className="mt-3">
          <Keypad onKey={(k) => setAmount((v) => pressKey(v, k))} />
        </div>
        {type !== 'transfer' && budgetedCategory && (
          <p className="mt-2 text-xs text-slate-500">
            {budgetedCategory.category_name}: budget {money(budgetedCategory.monthly_amount_minor)} ·
            spent {money(budgetedCategory.spent_minor ?? 0)}
          </p>
        )}
      </div>

      {/* Accounts */}
      <div className="mt-4">
        <p className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
          {type === 'transfer' ? 'From account' : 'Account'}
        </p>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <Chip key={a.id} active={a.id === accountId} onClick={() => setAccountId(a.id)}>
              {a.name}
            </Chip>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Balance {money(accounts.find((a) => a.id === accountId)?.balance_minor ?? 0, currency)}
        </p>
      </div>

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
        </div>
      )}

      {/* Categories */}
      {type !== 'transfer' && visibleCategories.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">Category</p>
          <div className="flex flex-wrap gap-2">
            {visibleCategories.map((c) => (
              <Chip key={c.id} active={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Note + date */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
            Note (where / what)
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
                : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
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
                : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300'
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

      {/* Save */}
      <div className="sticky bottom-0 mt-5 bg-gradient-to-t from-slate-100 via-slate-100 to-transparent pt-3 dark:from-[#0b1220]">
        <Button onClick={save} loading={busy} className="w-full py-3.5 text-base">
          {editId ? 'Save changes' : `Save ${type}`}
        </Button>
      </div>
    </div>
  );
}