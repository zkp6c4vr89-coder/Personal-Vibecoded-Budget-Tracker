import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  ErrorBanner,
  Field,
  Modal,
  PageHeader,
  SectionTitle,
  inputClass,
} from '../components/ui';
import { Icon } from '../components/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { downloadCsv, transactionsCsv } from '../lib/csv';
import { useTheme, type ThemeChoice } from '../lib/hooks';
import { formatRate, money } from '../lib/money';
import { dayHeadingShort, todayISO } from '../lib/period';
import type { Account, Backup, Transaction } from '../lib/types';
import { useApp } from '../state/AppContext';

interface AccountDraft {
  id?: string;
  name: string;
  currency: 'MYR' | 'USD';
  opening: number; // minor units
  archived: boolean;
}

interface CategoryDraft {
  id?: string;
  name: string;
  archived: boolean;
}

export default function Settings() {
  const { accounts, allAccounts, allCategories, settings, reload, logout } = useApp();
  const navigate = useNavigate();
  const toast = useToast();
  const [theme, setTheme] = useTheme();
  const restoreInput = useRef<HTMLInputElement>(null);

  const [rateInput, setRateInput] = useState(String(settings.usd_myr_rate));
  const [rateState, setRateState] = useState<{ busy: boolean; error: string | null; saved: boolean }>({
    busy: false,
    error: null,
    saved: false,
  });

  const [accountDraft, setAccountDraft] = useState<AccountDraft | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => setRateInput(String(settings.usd_myr_rate)), [settings.usd_myr_rate]);

  const rateChanged = Number(rateInput) !== settings.usd_myr_rate;

  async function saveRate() {
    const value = Number(rateInput);
    setRateState({ busy: true, error: null, saved: false });
    try {
      await api.put('/api/settings', { usd_myr_rate: value });
      await reload();
      setRateState({ busy: false, error: null, saved: true });
      toast({ message: 'Rate saved', tone: 'success' });
      setTimeout(() => setRateState((s) => ({ ...s, saved: false })), 2000);
    } catch (err: any) {
      setRateState({ busy: false, error: err?.message || 'Could not save', saved: false });
    }
  }

  async function saveAccount() {
    if (!accountDraft || busy) return;
    const name = accountDraft.name.trim();
    if (!name) return setModalError('Name is required');
    setBusy(true);
    setModalError(null);
    try {
      if (accountDraft.id) {
        await api.patch(`/api/accounts/${accountDraft.id}`, {
          name,
          currency: accountDraft.currency,
          opening_balance_minor: accountDraft.opening,
          archived: accountDraft.archived,
        });
      } else {
        await api.post('/api/accounts', {
          name,
          currency: accountDraft.currency,
          opening_balance_minor: accountDraft.opening,
        });
      }
      await reload();
      toast({ message: 'Account saved', tone: 'success' });
      setAccountDraft(null);
    } catch (err: any) {
      setModalError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!accountDraft?.id || busy) return;
    const used = (allAccounts.find((a) => a.id === accountDraft.id)?.balance_minor ?? 0) !== 0;
    if (!window.confirm(used ? 'Archive this account? Past transactions keep it in reports.' : 'Delete this account permanently?')) return;
    setBusy(true);
    try {
      await api.del(`/api/accounts/${accountDraft.id}`);
      await reload();
      toast({ message: used ? 'Account archived' : 'Account deleted', tone: 'danger' });
      setAccountDraft(null);
    } catch (err: any) {
      setModalError(err?.message || 'Could not delete');
    } finally {
      setBusy(false);
    }
  }

  /** Reorder by swapping sort_order with the neighbour above/below. */
  async function moveAccount(id: string, dir: -1 | 1) {
    const active = accounts;
    const index = active.findIndex((a) => a.id === id);
    const other = active[index + dir];
    if (index < 0 || !other) return;
    setBusy(true);
    try {
      await Promise.all([
        api.patch(`/api/accounts/${id}`, { sort_order: index + dir + 1 }),
        api.patch(`/api/accounts/${other.id}`, { sort_order: index + 1 }),
      ]);
      await reload();
    } catch (err: any) {
      setPageError(err?.message || 'Could not reorder');
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory() {
    if (!categoryDraft || busy) return;
    const name = categoryDraft.name.trim();
    if (!name) return setModalError('Name is required');
    setBusy(true);
    setModalError(null);
    try {
      if (categoryDraft.id) {
        await api.patch(`/api/categories/${categoryDraft.id}`, { name, archived: categoryDraft.archived });
      } else {
        await api.post('/api/categories', { name });
      }
      await reload();
      setCategoryDraft(null);
    } catch (err: any) {
      setModalError(err?.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory() {
    if (!categoryDraft?.id || busy) return;
    if (!window.confirm('Delete this category? Transactions that use it are kept.')) return;
    setBusy(true);
    try {
      const res = await api.del<{ archived?: boolean }>(`/api/categories/${categoryDraft.id}`);
      await reload();
      setCategoryDraft(null);
      if (res?.archived) setPageError('That category has transactions, so it was archived instead of deleted.');
    } catch (err: any) {
      setModalError(err?.message || 'Could not delete');
    } finally {
      setBusy(false);
    }
  }

  async function exportAll() {
    try {
      const res = await api.get<{ transactions: Transaction[] }>('/api/transactions?limit=5000');
      downloadCsv(`all-transactions-${todayISO()}.csv`, transactionsCsv(res.transactions, settings.usd_myr_rate));
      toast({ message: 'CSV downloaded', tone: 'success' });
    } catch (err: any) {
      setPageError(err?.message || 'Export failed');
    }
  }

  async function downloadBackup() {
    try {
      const backup = await api.get<Backup>('/api/backup');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `budget-tracker-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ message: 'Backup downloaded', tone: 'success' });
    } catch (err: any) {
      setPageError(err?.message || 'Backup failed');
    }
  }

  async function restoreBackup(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.version !== 1) {
        setPageError('That file is not a budget-tracker backup.');
        return;
      }
      const res = await api.post<{ restored: Record<string, number> }>('/api/restore', parsed);
      await reload();
      const r = res?.restored ?? {};
      toast({
        message: `Restored ${r.transactions ?? 0} transactions, ${r.accounts ?? 0} accounts` +
          (r.skipped ? `, ${r.skipped} skipped` : ''),
        tone: 'success',
      });
    } catch (err: any) {
      setPageError(err?.message || 'Restore failed — check the file is a JSON backup.');
    } finally {
      if (restoreInput.current) restoreInput.current.value = '';
    }
  }

  const themeOptions: Array<{ value: ThemeChoice; label: string; icon: 'monitor' | 'sun' | 'moon' }> = [
    { value: 'system', label: 'System', icon: 'monitor' },
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <>
      <PageHeader title="Settings" back={() => navigate(-1)} showSettings={false} />

      {pageError && <ErrorBanner message={pageError} onDismiss={() => setPageError(null)} />}

      {/* Appearance */}
      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              aria-pressed={theme === opt.value}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition ${
                theme === opt.value
                  ? 'bg-white text-slate-900 shadow dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              <Icon name={opt.icon} size={18} />
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          System follows your device's light/dark setting.
        </p>
      </Card>

      {/* Exchange rate */}
      <SectionTitle>USD → MYR rate</SectionTitle>
      <Card>
        <p className="mb-2 text-sm text-slate-500">
          Manual rate used to combine your USD account into the MYR total and to convert USD
          spending in reports and budgets.
        </p>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300">
            1 USD =
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            className={`${inputClass} flex-1 tabular-nums`}
            aria-label="USD to MYR rate"
          />
          <span className="shrink-0 text-sm font-medium text-slate-600 dark:text-slate-300">MYR</span>
          <Button onClick={saveRate} loading={rateState.busy} disabled={!rateChanged}>
            {rateState.saved ? 'Saved ✓' : 'Save'}
          </Button>
        </div>
        {rateState.error && <p className="mt-2 text-sm text-rose-600">{rateState.error}</p>}
        <p className="mt-2 text-xs text-slate-500">
          Current: {formatRate(settings.usd_myr_rate)}
          {settings.usd_myr_rate_updated
            ? ` · last updated ${dayHeadingShort(settings.usd_myr_rate_updated, todayISO())}`
            : ''}
        </p>
      </Card>

      {/* Accounts */}
      <SectionTitle
        right={
          <button
            type="button"
            onClick={() => setAccountDraft({ name: '', currency: 'MYR', opening: 0, archived: false })}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            + Add account
          </button>
        }
      >
        Accounts
      </SectionTitle>
      <div className="space-y-2">
        {allAccounts.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            onOpen={() =>
              setAccountDraft({
                id: a.id,
                name: a.name,
                currency: a.currency,
                opening: a.opening_balance_minor,
                archived: !!a.archived,
              })
            }
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {accounts.length} active account{accounts.length === 1 ? '' : 's'} · tap to rename or edit the
        starting balance · tap an account to reorder it.
      </p>

      {/* Categories */}
      <SectionTitle
        right={
          <button
            type="button"
            onClick={() => setCategoryDraft({ name: '', archived: false })}
            className="text-xs font-semibold text-emerald-600 dark:text-emerald-400"
          >
            + Add category
          </button>
        }
      >
        Categories
      </SectionTitle>
      <div className="flex flex-wrap gap-2">
        {allCategories.map((c) => (
          <Chip
            key={c.id}
            active={!!c.archived}
            onClick={() => setCategoryDraft({ id: c.id, name: c.name, archived: !!c.archived })}
          >
            {c.name}
            {c.kind === 'income' ? ' ↑' : ''}
            {c.archived ? ' (archived)' : ''}
          </Chip>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">↑ marks income-only categories.</p>

      {/* Data */}
      <SectionTitle>Data</SectionTitle>
      <Card className="space-y-3">
        <Button variant="outline" onClick={exportAll} className="w-full">
          <Icon name="download" size={18} /> Export all transactions (CSV)
        </Button>
        <Button variant="outline" onClick={downloadBackup} className="w-full">
          <Icon name="download" size={18} /> Download full backup (JSON)
        </Button>
        <Button variant="outline" onClick={() => restoreInput.current?.click()} className="w-full">
          <Icon name="upload" size={18} /> Restore from backup
        </Button>
        <input
          ref={restoreInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Restore from backup file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) restoreBackup(file);
          }}
        />
        <p className="text-xs text-slate-500">
          CSV is a spreadsheet copy of your transactions; the JSON backup also contains accounts,
          categories, budgets and settings, and restoring merges it without overwriting existing
          data.
        </p>
      </Card>

      {/* Session */}
      <SectionTitle>Session</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-slate-500">
          You are signed in on this device for 30 days. Signing out here does not sign out other
          devices.
        </p>
        <Button
          variant="danger"
          className="w-full"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
        >
          Sign out
        </Button>
      </Card>

      <div className="h-4" />

      {/* Account modal */}
      <Modal
        open={!!accountDraft}
        onClose={() => setAccountDraft(null)}
        title={accountDraft?.id ? 'Edit account' : 'New account'}
      >
        {modalError && <ErrorBanner message={modalError} onDismiss={() => setModalError(null)} />}
        {accountDraft && (
          <div className="space-y-4">
            <Field label="Name">
              <input
                type="text"
                value={accountDraft.name}
                maxLength={40}
                autoFocus
                onChange={(e) => setAccountDraft({ ...accountDraft, name: e.target.value })}
                className={inputClass}
                placeholder="e.g. Savings"
              />
            </Field>
            <Field label="Currency">
              <div className="flex gap-2">
                {(['MYR', 'USD'] as const).map((c) => (
                  <Chip
                    key={c}
                    active={accountDraft.currency === c}
                    onClick={() => setAccountDraft({ ...accountDraft, currency: c })}
                  >
                    {c}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field
              label="Starting balance"
              hint="The amount in this account before you started tracking. Negative is allowed."
            >
              <input
                type="text"
                inputMode="decimal"
                value={(accountDraft.opening / 100).toString()}
                onChange={(e) =>
                  setAccountDraft({ ...accountDraft, opening: Math.round(Number(e.target.value || 0) * 100) })
                }
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            {accountDraft.id && allAccounts.find((a) => a.id === accountDraft.id)?.balance_minor !== undefined && (
              <p className="text-sm text-slate-500">
                Current balance:{' '}
                {money(
                  allAccounts.find((a) => a.id === accountDraft.id)?.balance_minor ?? 0,
                  accountDraft.currency,
                )}
              </p>
            )}
            <div className="flex gap-2">
              {accountDraft.id && (
                <Button variant="outline" onClick={deleteAccount} loading={busy} className="flex-1">
                  Delete
                </Button>
              )}
              <Button onClick={saveAccount} loading={busy} className="flex-1">
                Save
              </Button>
            </div>
            {accountDraft.id && !accountDraft.archived && accounts.length > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={busy || accounts[0]?.id === accountDraft.id}
                  onClick={() => moveAccount(accountDraft.id!, -1)}
                  className="flex-1"
                >
                  <Icon name="chevronUp" size={18} /> Move up
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || accounts[accounts.length - 1]?.id === accountDraft.id}
                  onClick={() => moveAccount(accountDraft.id!, 1)}
                  className="flex-1"
                >
                  <Icon name="chevronDown" size={18} /> Move down
                </Button>
              </div>
            )}
            {accountDraft.id && (
              <label className="flex min-h-11 items-center justify-between text-sm">
                <span className="text-slate-500">Archived (hidden from pickers)</span>
                <input
                  type="checkbox"
                  checked={accountDraft.archived}
                  onChange={(e) => setAccountDraft({ ...accountDraft, archived: e.target.checked })}
                  className="h-5 w-5"
                />
              </label>
            )}
          </div>
        )}
      </Modal>

      {/* Category modal */}
      <Modal
        open={!!categoryDraft}
        onClose={() => setCategoryDraft(null)}
        title={categoryDraft?.id ? 'Edit category' : 'New category'}
      >
        {modalError && <ErrorBanner message={modalError} onDismiss={() => setModalError(null)} />}
        {categoryDraft && (
          <div className="space-y-4">
            <Field label="Name">
              <input
                type="text"
                value={categoryDraft.name}
                maxLength={40}
                autoFocus
                onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })}
                className={inputClass}
                placeholder="e.g. Medical"
              />
            </Field>
            <div className="flex gap-2">
              {categoryDraft.id && (
                <Button variant="outline" onClick={deleteCategory} loading={busy} className="flex-1">
                  Delete
                </Button>
              )}
              <Button onClick={saveCategory} loading={busy} className="flex-1">
                Save
              </Button>
            </div>
            {categoryDraft.id && (
              <label className="flex min-h-11 items-center justify-between text-sm">
                <span className="text-slate-500">Archived (hidden from pickers)</span>
                <input
                  type="checkbox"
                  checked={categoryDraft.archived}
                  onChange={(e) => setCategoryDraft({ ...categoryDraft, archived: e.target.checked })}
                  className="h-5 w-5"
                />
              </label>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function AccountRow({ account, onOpen }: { account: Account; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full min-h-14 items-center gap-3 rounded-2xl border p-3.5 text-left active:opacity-90 ${
        account.archived
          ? 'border-dashed border-slate-300 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-900/40'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {account.name}
          {account.archived ? ' · archived' : ''}
        </span>
        <span className="block text-xs text-slate-500">
          {account.currency} · starting {money(account.opening_balance_minor, account.currency)}
        </span>
      </span>
      <span className="text-sm font-semibold tabular-nums">
        {money(account.balance_minor ?? 0, account.currency)}
      </span>
    </button>
  );
}
