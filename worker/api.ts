import type { Account, Budget, Bootstrap, Category, Settings, Transaction } from '../src/lib/types';
import { isValidISO, monthKey, monthRange, todayISO } from '../src/lib/period';
import {
  apiError,
  clampRate,
  json,
  newId,
  noContent,
  readJson,
  toMinor,
  type Env,
  type RouteCtx,
} from './util';

/* ------------------------------------------------------------------ helpers */

/**
 * Validated USD->MYR rate, its SQL-literal form, and when it last changed.
 * Reads both keys in one statement so showing "last updated" costs nothing extra.
 */
export async function getRate(
  env: Env,
): Promise<{ rate: number; rateStr: string; updated: string | null }> {
  const rows = await env.DB.prepare(
    `SELECT key, value FROM settings WHERE key IN ('usd_myr_rate', 'usd_myr_rate_updated')`,
  ).all<{ key: string; value: string }>();
  const map = new Map(rows.results.map((r) => [r.key, r.value]));
  const parsed = Number(map.get('usd_myr_rate'));
  const rate = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return { rate, rateStr: String(rate), updated: map.get('usd_myr_rate_updated') ?? null };
}

/** Signed minor-unit parse (opening balances can be negative). */
function parseSignedMinor(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (Math.abs(rounded) > 1e11) return fallback;
  return rounded;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export const TX_LIST_SELECT = `
  SELECT t.id, t.type, t.amount_minor, t.to_amount_minor, t.account_id, t.to_account_id,
         t.category_id, t.note, t.occurred_on, t.created_at, t.updated_at,
         a.name AS account_name, a.currency AS account_currency,
         b.name AS to_account_name, c.name AS category_name
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts b ON b.id = t.to_account_id
  LEFT JOIN categories c ON c.id = t.category_id`;

const TX_SELECT = TX_LIST_SELECT;

function likeParam(q: string): string {
  return '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
}

/* ---------------------------------------------------------------- accounts */

/**
 * Accounts with computed balances (opening + income − expense ± transfers).
 * Shared by the accounts route and the dashboard, so the dashboard issues one
 * statement instead of a second, identical one.
 */
export async function accountBalanceRows(env: Env, activeOnly = false): Promise<Account[]> {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.name, a.currency, a.opening_balance_minor, a.sort_order, a.archived,
       (a.opening_balance_minor
        + COALESCE((SELECT SUM(t.amount_minor) FROM transactions t WHERE t.account_id = a.id AND t.type = 'income'), 0)
        - COALESCE((SELECT SUM(t.amount_minor) FROM transactions t WHERE t.account_id = a.id AND t.type = 'expense'), 0)
        + COALESCE((SELECT SUM(t.to_amount_minor) FROM transactions t WHERE t.to_account_id = a.id AND t.type = 'transfer'), 0)
        - COALESCE((SELECT SUM(t.amount_minor) FROM transactions t WHERE t.account_id = a.id AND t.type = 'transfer'), 0)
       ) AS balance_minor
     FROM accounts a
     ${activeOnly ? 'WHERE a.archived = 0' : ''}
     ORDER BY a.sort_order, a.created_at`,
  ).all<Account>();
  return rows.results;
}

export async function listAccounts(env: Env): Promise<Response> {
  return json({ accounts: await accountBalanceRows(env) });
}

async function accountById(env: Env, id: string): Promise<Account | null> {
  return env.DB.prepare('SELECT * FROM accounts WHERE id = ?').bind(id).first<Account>();
}

export async function createAccount(ctx: RouteCtx): Promise<Response> {
  const body = await readJson(ctx.req);
  const name = cleanText(body?.name, 40);
  if (!name) return apiError('Account name is required');
  const currency = body?.currency === 'USD' ? 'USD' : 'MYR';
  const opening = parseSignedMinor(body?.opening_balance_minor);
  const id = newId();
  const order =
    ((await ctx.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM accounts').first<{ n: number }>())?.n ??
      1);
  await ctx.env.DB.prepare(
    `INSERT INTO accounts (id, name, currency, opening_balance_minor, sort_order) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, name, currency, opening, order)
    .run();
  const account = await accountById(ctx.env, id);
  return json({ account }, 201);
}

export async function updateAccount(ctx: RouteCtx): Promise<Response> {
  const existing = await accountById(ctx.env, ctx.params.id);
  if (!existing) return apiError('Account not found', 404);
  const body = await readJson(ctx.req);
  if (!body) return apiError('Invalid JSON body');

  const sets: string[] = [];
  const values: unknown[] = [];

  if (typeof body.name === 'string') {
    const name = cleanText(body.name, 40);
    if (!name) return apiError('Account name is required');
    sets.push('name = ?');
    values.push(name);
  }
  if (body.opening_balance_minor !== undefined) {
    sets.push('opening_balance_minor = ?');
    values.push(parseSignedMinor(body.opening_balance_minor));
  }
  if (body.currency !== undefined) {
    const currency = body.currency === 'USD' ? 'USD' : 'MYR';
    if (currency !== existing.currency) {
      const used = await ctx.env.DB.prepare(
        'SELECT 1 AS x FROM transactions WHERE account_id = ? OR to_account_id = ? LIMIT 1',
      )
        .bind(existing.id, existing.id)
        .first();
      if (used) return apiError('This account already has transactions, so its currency cannot change.');
      sets.push('currency = ?');
      values.push(currency);
    }
  }
  if (body.archived !== undefined) {
    sets.push('archived = ?');
    values.push(body.archived ? 1 : 0);
  }
  if (body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))) {
    sets.push('sort_order = ?');
    values.push(Math.max(1, Math.round(Number(body.sort_order))));
  }
  if (sets.length === 0) return apiError('Nothing to update');

  values.push(existing.id);
  await ctx.env.DB.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  return json({ account: await accountById(ctx.env, existing.id) });
}

export async function deleteAccount(ctx: RouteCtx): Promise<Response> {
  const existing = await accountById(ctx.env, ctx.params.id);
  if (!existing) return apiError('Account not found', 404);
  const used = await ctx.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?',
  )
    .bind(existing.id, existing.id)
    .first<{ n: number }>();
  if ((used?.n ?? 0) > 0) {
    // Keep history intact: archive instead of deleting.
    await ctx.env.DB.prepare('UPDATE accounts SET archived = 1 WHERE id = ?').bind(existing.id).run();
    return json({ archived: true });
  }
  await ctx.env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(existing.id).run();
  return noContent();
}

/* -------------------------------------------------------------- categories */

export async function listCategories(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    'SELECT id, name, sort_order, archived, kind FROM categories ORDER BY sort_order, created_at',
  ).all<Category>();
  return json({ categories: rows.results });
}

/** Accepts an explicit kind, defaulting to expense (legacy rows included). */
function parseKind(value: unknown): 'expense' | 'income' | null {
  return value === 'income' || value === 'expense' ? value : null;
}

export async function createCategory(ctx: RouteCtx): Promise<Response> {
  const body = await readJson(ctx.req);
  const name = cleanText(body?.name, 40);
  if (!name) return apiError('Category name is required');
  const kind = parseKind(body?.kind) ?? 'expense';
  const order =
    ((await ctx.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM categories').first<{ n: number }>())?.n ??
      1);
  const id = newId();
  await ctx.env.DB.prepare('INSERT INTO categories (id, name, sort_order, kind) VALUES (?, ?, ?, ?)')
    .bind(id, name, order, kind)
    .run();
  const row = await ctx.env.DB.prepare(
    'SELECT id, name, sort_order, archived, kind FROM categories WHERE id = ?',
  )
    .bind(id)
    .first();
  return json({ category: row }, 201);
}

export async function updateCategory(ctx: RouteCtx): Promise<Response> {
  const existing = await ctx.env.DB.prepare('SELECT * FROM categories WHERE id = ?')
    .bind(ctx.params.id)
    .first<{ id: string; sort_order: number }>();
  if (!existing) return apiError('Category not found', 404);
  const body = await readJson(ctx.req);
  if (!body) return apiError('Invalid JSON body');

  const sets: string[] = [];
  const values: unknown[] = [];
  if (typeof body.name === 'string') {
    const name = cleanText(body.name, 40);
    if (!name) return apiError('Category name is required');
    sets.push('name = ?');
    values.push(name);
  }
  if (body.archived !== undefined) {
    sets.push('archived = ?');
    values.push(body.archived ? 1 : 0);
  }
  const kind = parseKind(body.kind);
  if (kind) {
    sets.push('kind = ?');
    values.push(kind);
  }
  if (sets.length === 0) return apiError('Nothing to update');
  values.push(existing.id);
  await ctx.env.DB.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
  const row = await ctx.env.DB.prepare(
    'SELECT id, name, sort_order, archived, kind FROM categories WHERE id = ?',
  )
    .bind(existing.id)
    .first();
  return json({ category: row });
}

export async function deleteCategory(ctx: RouteCtx): Promise<Response> {
  const existing = await ctx.env.DB.prepare('SELECT id FROM categories WHERE id = ?')
    .bind(ctx.params.id)
    .first();
  if (!existing) return apiError('Category not found', 404);
  const used = await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?')
    .bind(ctx.params.id)
    .first<{ n: number }>();
  if ((used?.n ?? 0) > 0) {
    // History exists: keep the category (and its budget), just hide it.
    await ctx.env.DB.prepare('UPDATE categories SET archived = 1 WHERE id = ?').bind(ctx.params.id).run();
    return json({ archived: true });
  }
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(ctx.params.id),
    ctx.env.DB.prepare('DELETE FROM budgets WHERE category_id = ?').bind(ctx.params.id),
  ]);
  return noContent();
}

/* ------------------------------------------------------------- transactions */

interface TxInput {
  type: string;
  amount_minor: number;
  to_amount_minor: number | null;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  note: string;
  occurred_on: string;
}

async function resolveTransferAmount(
  env: Env,
  fromAccount: Account,
  toAccount: Account,
  amountMinor: number,
  provided: unknown,
): Promise<number> {
  const providedMinor = toMinor(provided);
  if (providedMinor && fromAccount.currency === toAccount.currency) return providedMinor;
  if (fromAccount.currency === toAccount.currency) return amountMinor;
  const { rate } = await getRate(env);
  if (fromAccount.currency === 'USD') return Math.round(amountMinor * rate);
  return Math.round(amountMinor / rate);
}

async function buildInput(ctx: RouteCtx, raw: Record<string, unknown> | null): Promise<TxInput | string> {
  if (!raw) return 'Invalid JSON body';
  const type = raw.type;
  if (type !== 'expense' && type !== 'income' && type !== 'transfer') return 'Type must be expense, income or transfer';

  const amount = toMinor(raw.amount_minor ?? raw.amount);
  if (!amount) return 'Amount must be greater than zero';

  const account_id = typeof raw.account_id === 'string' ? raw.account_id : '';
  const account = await ctx.env.DB.prepare('SELECT * FROM accounts WHERE id = ? AND archived = 0')
    .bind(account_id)
    .first<Account>();
  if (!account) return 'Choose a valid account';

  let to_account_id: string | null = null;
  let to_amount_minor: number | null = null;
  let category_id: string | null = null;

  if (type === 'transfer') {
    to_account_id = typeof raw.to_account_id === 'string' ? raw.to_account_id : '';
    if (!to_account_id || to_account_id === account_id) return 'Pick two different accounts';
    const toAccount = await ctx.env.DB.prepare('SELECT * FROM accounts WHERE id = ? AND archived = 0')
      .bind(to_account_id)
      .first<Account>();
    if (!toAccount) return 'Choose a valid destination account';
    to_amount_minor = await resolveTransferAmount(ctx.env, account, toAccount, amount, raw.to_amount_minor);
    category_id = null;
  } else {
    category_id = typeof raw.category_id === 'string' && raw.category_id ? raw.category_id : null;
    if (category_id) {
      const cat = await ctx.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(category_id).first();
      if (!cat) return 'Choose a valid category';
    }
  }

  const occurred_on = isValidISO(raw.occurred_on) ? raw.occurred_on : todayISO();
  const note = cleanText(raw.note, 200);

  return {
    type,
    amount_minor: amount,
    to_amount_minor,
    account_id,
    to_account_id,
    category_id,
    note,
    occurred_on,
  };
}

export async function listTransactions(ctx: RouteCtx): Promise<Response> {
  const p = ctx.url.searchParams;
  const where: string[] = [];
  const values: unknown[] = [];

  const type = p.get('type');
  if (type === 'expense' || type === 'income' || type === 'transfer') {
    where.push('t.type = ?');
    values.push(type);
  }
  const account = p.get('account');
  if (account) {
    where.push('(t.account_id = ? OR t.to_account_id = ?)');
    values.push(account, account);
  }
  const category = p.get('category');
  if (category) {
    where.push('t.category_id = ?');
    values.push(category);
  }
  const from = p.get('from');
  if (from && isValidISO(from)) {
    where.push('t.occurred_on >= ?');
    values.push(from);
  }
  const to = p.get('to');
  if (to && isValidISO(to)) {
    where.push('t.occurred_on <= ?');
    values.push(to);
  }
  const q = (p.get('q') || '').trim();
  if (q) {
    where.push("(t.note LIKE ? ESCAPE '\\' OR CAST(t.amount_minor AS TEXT) LIKE ? ESCAPE '\\')");
    values.push(likeParam(q), likeParam(q));
  }

  const limit = Math.min(Math.max(Number(p.get('limit')) || 500, 1), 5000);
  values.push(limit);

  const rows = await queryAll<Transaction>(
    ctx.env,
    `${TX_SELECT}${where.length ? ' WHERE ' + where.join(' AND ') : ''}
     ORDER BY t.occurred_on DESC, t.created_at DESC
     LIMIT ?`,
    values,
  );
  return json({ transactions: rows });
}

function queryAll<T>(env: Env, sql: string, values: unknown[]): Promise<T[]> {
  return env.DB.prepare(sql)
    .bind(...values)
    .all<T>()
    .then((r) => r.results);
}

export async function getTransaction(ctx: RouteCtx): Promise<Response> {
  const row = await ctx.env.DB.prepare(`${TX_SELECT} WHERE t.id = ?`)
    .bind(ctx.params.id)
    .first<Transaction>();
  if (!row) return apiError('Transaction not found', 404);
  return json({ transaction: row });
}

export async function createTransaction(ctx: RouteCtx): Promise<Response> {
  const raw = await readJson(ctx.req);
  const input = await buildInput(ctx, raw);
  if (typeof input === 'string') return apiError(input);

  const id = newId();
  await ctx.env.DB.prepare(
    `INSERT INTO transactions (id, type, amount_minor, to_amount_minor, account_id, to_account_id, category_id, note, occurred_on)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.type,
      input.amount_minor,
      input.to_amount_minor,
      input.account_id,
      input.to_account_id,
      input.category_id,
      input.note,
      input.occurred_on,
    )
    .run();

  const created = await ctx.env.DB.prepare(`${TX_SELECT} WHERE t.id = ?`).bind(id).first<Transaction>();
  return json({ transaction: created }, 201);
}

export async function updateTransaction(ctx: RouteCtx): Promise<Response> {
  const current = await ctx.env.DB.prepare('SELECT * FROM transactions WHERE id = ?')
    .bind(ctx.params.id)
    .first<Record<string, unknown>>();
  if (!current) return apiError('Transaction not found', 404);

  const body = await readJson(ctx.req);
  if (!body) return apiError('Invalid JSON body');

  const merged: Record<string, unknown> = { ...current, ...body };
  const input = await buildInput(ctx, merged);
  if (typeof input === 'string') return apiError(input);

  await ctx.env.DB.prepare(
    `UPDATE transactions SET type = ?, amount_minor = ?, to_amount_minor = ?, account_id = ?,
       to_account_id = ?, category_id = ?, note = ?, occurred_on = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      input.type,
      input.amount_minor,
      input.to_amount_minor,
      input.account_id,
      input.to_account_id,
      input.category_id,
      input.note,
      input.occurred_on,
      ctx.params.id,
    )
    .run();

  const updated = await ctx.env.DB.prepare(`${TX_SELECT} WHERE t.id = ?`)
    .bind(ctx.params.id)
    .first<Transaction>();
  return json({ transaction: updated });
}

export async function deleteTransaction(ctx: RouteCtx): Promise<Response> {
  const result = await ctx.env.DB.prepare('DELETE FROM transactions WHERE id = ?')
    .bind(ctx.params.id)
    .run();
  if (!result.meta.changes) return apiError('Transaction not found', 404);
  return noContent();
}

/* ------------------------------------------------------------------ budgets */

/** Budget rows with category names (shared by the budgets route and /api/bootstrap). */
export async function listBudgetRows(env: Env): Promise<
  Array<{ id: string; category_id: string; monthly_amount_minor: number; category_name: string | null }>
> {
  return queryAll(
    env,
    `SELECT b.id, b.category_id, b.monthly_amount_minor, c.name AS category_name
     FROM budgets b JOIN categories c ON c.id = b.category_id
     ORDER BY c.sort_order`,
    [],
  );
}

export async function listBudgets(ctx: RouteCtx, precomputedRateStr?: string): Promise<Response> {
  const month = isValidISO(ctx.url.searchParams.get('today') || '') ? monthKey(ctx.url.searchParams.get('today')!) : monthKey(todayISO());
  const range = monthRange(month);
  const rows = await listBudgetRows(ctx.env);
  const rateStr = precomputedRateStr ?? (await getRate(ctx.env)).rateStr;
  const spent = await monthSpendByCategory(ctx.env, range.start, range.end, rateStr);
  const budgets: Budget[] = rows.map((r) => ({
    id: r.id,
    category_id: r.category_id,
    monthly_amount_minor: r.monthly_amount_minor,
    category_name: r.category_name ?? undefined,
    spent_minor: spent.get(r.category_id) ?? 0,
  }));
  return json({ budgets, month });
}

export async function monthSpendByCategory(
  env: Env,
  start: string,
  end: string,
  rateStr: string,
): Promise<Map<string, number>> {
  const rows = await env.DB.prepare(
    `SELECT t.category_id AS cat_id,
       CAST(ROUND(SUM(CASE WHEN a.currency = 'USD' THEN t.amount_minor * ${rateStr} ELSE t.amount_minor END)) AS INTEGER) AS spent
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE t.type = 'expense' AND t.category_id IS NOT NULL AND t.occurred_on >= ?1 AND t.occurred_on <= ?2
     GROUP BY t.category_id`,
  )
    .bind(start, end)
    .all<{ cat_id: string; spent: number }>();
  return new Map(rows.results.map((r) => [r.cat_id, r.spent]));
}

export async function upsertBudget(ctx: RouteCtx): Promise<Response> {
  const body = await readJson(ctx.req);
  const category_id = typeof body?.category_id === 'string' ? body.category_id : '';
  const amount = toMinor(body?.monthly_amount_minor ?? body?.amount);
  if (!category_id) return apiError('Category is required');
  if (!amount) return apiError('Budget must be greater than zero');
  const cat = await ctx.env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(category_id).first();
  if (!cat) return apiError('Category not found', 404);

  await ctx.env.DB.prepare(
    `INSERT INTO budgets (id, category_id, monthly_amount_minor) VALUES (?, ?, ?)
     ON CONFLICT(category_id) DO UPDATE SET monthly_amount_minor = excluded.monthly_amount_minor`,
  )
    .bind(newId(), category_id, amount)
    .run();
  return json({ ok: true }, 201);
}

export async function deleteBudget(ctx: RouteCtx): Promise<Response> {
  const result = await ctx.env.DB.prepare('DELETE FROM budgets WHERE id = ?').bind(ctx.params.id).run();
  if (!result.meta.changes) return apiError('Budget not found', 404);
  return noContent();
}

/* ----------------------------------------------------------------- settings */

export async function getSettings(env: Env): Promise<Response> {
  const { rate, updated } = await getRate(env);
  const settings: Settings = { usd_myr_rate: rate };
  if (updated) settings.usd_myr_rate_updated = updated;
  return json({ settings });
}

export async function updateSettings(ctx: RouteCtx): Promise<Response> {
  const body = await readJson(ctx.req);
  if (body?.usd_myr_rate !== undefined) {
    const rate = clampRate(body.usd_myr_rate);
    if (rate === null) return apiError('Rate must be a positive number');
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('usd_myr_rate', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).bind(String(rate)),
      // Remember when it last changed, shown next to the field in Settings.
      ctx.env.DB.prepare(
        `INSERT INTO settings (key, value) VALUES ('usd_myr_rate_updated', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).bind(todayISO()),
    ]);
  }
  return getSettings(ctx.env);
}

/* ---------------------------------------------------------------- bootstrap */

export async function bootstrap(ctx: RouteCtx): Promise<Response> {
  const { rate, rateStr, updated } = await getRate(ctx.env);
  const [accountsRes, categoriesRes, budgetsRes] = await Promise.all([
    listAccounts(ctx.env),
    listCategories(ctx.env),
    listBudgets(ctx, rateStr),
  ]);
  const [accounts, categories] = [
    ((await accountsRes.json()) as { accounts: Account[] }).accounts,
    ((await categoriesRes.json()) as { categories: Category[] }).categories,
  ];
  const { budgets } = (await budgetsRes.json()) as { budgets: Budget[] };
  const settings: Settings = { usd_myr_rate: rate };
  if (updated) settings.usd_myr_rate_updated = updated;
  const payload: Bootstrap = { accounts, categories, budgets, settings };
  return json(payload);
}

/* ------------------------------------------------------ backup / restore */

const MAX_RESTORE_ROWS = 50000;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function int(v: unknown, min = -1e11, max = 1e11): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

/**
 * Full JSON backup: every table the app owns, in one downloadable document.
 * One round trip per table — the payload is small and this is a manual action.
 */
export async function exportBackup(ctx: RouteCtx): Promise<Response> {
  const [accounts, categories, budgets, settingsRows, transactions] = await Promise.all([
    ctx.env.DB.prepare('SELECT * FROM accounts ORDER BY sort_order, created_at').all(),
    ctx.env.DB.prepare('SELECT * FROM categories ORDER BY sort_order, created_at').all(),
    ctx.env.DB.prepare('SELECT * FROM budgets ORDER BY created_at').all(),
    ctx.env.DB.prepare('SELECT key, value FROM settings').all(),
    ctx.env.DB.prepare('SELECT * FROM transactions ORDER BY occurred_on, created_at').all(),
  ]);
  return json({
    version: 1,
    exported_at: todayISO(),
    accounts: accounts.results,
    categories: categories.results,
    budgets: budgets.results,
    settings: Object.fromEntries(
      settingsRows.results.map((r) => [(r as { key: string }).key, (r as { value: string }).value]),
    ),
    transactions: transactions.results,
  });
}

interface RestoreCounts {
  accounts: number;
  categories: number;
  budgets: number;
  transactions: number;
  skipped: number;
}

/**
 * Merge a backup document into this database. Everything is INSERT OR IGNORE
 * keyed on the original id, so restoring twice — or restoring over live data —
 * never duplicates or overwrites what is already there.
 */
export async function restoreBackup(ctx: RouteCtx): Promise<Response> {
  const raw = await readJson<Record<string, unknown>>(ctx.req);
  if (!raw || raw.version !== 1) {
    return apiError('Not a budget-tracker backup file (expected version 1)');
  }
  const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  const categories = Array.isArray(raw.categories) ? raw.categories : [];
  const budgets = Array.isArray(raw.budgets) ? raw.budgets : [];
  const transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
  if (transactions.length > MAX_RESTORE_ROWS) {
    return apiError(`Backup too large (${transactions.length} transactions, max ${MAX_RESTORE_ROWS})`);
  }

  // Rows are validated first (invalid ones counted as skipped), then D1 tells
  // us which statements actually inserted — an id that already exists is
  // ignored by INSERT OR IGNORE and reported as skipped, not restored.
  const attempted = { accounts: 0, categories: 0, budgets: 0, transactions: 0 };
  const invalid = { accounts: 0, categories: 0, budgets: 0, transactions: 0 };
  const accountStmts: D1PreparedStatement[] = [];
  const categoryStmts: D1PreparedStatement[] = [];
  const budgetStmts: D1PreparedStatement[] = [];

  /** Runs statements in chunks (D1 caps statements per batch), returns inserts. */
  async function runAll(list: D1PreparedStatement[]): Promise<number> {
    let inserted = 0;
    for (let i = 0; i < list.length; i += 200) {
      const results = await ctx.env.DB.batch(list.slice(i, i + 200));
      for (const r of results) if ((r.meta.changes ?? 0) > 0) inserted++;
    }
    return inserted;
  }

  for (const a of accounts) {
    const id = str((a as Record<string, unknown>).id, 64);
    const name = str((a as Record<string, unknown>).name, 40);
    const currency = (a as Record<string, unknown>).currency === 'USD' ? 'USD' : 'MYR';
    const opening = int((a as Record<string, unknown>).opening_balance_minor) ?? 0;
    const order = int((a as Record<string, unknown>).sort_order, 0, 100000) ?? 1;
    const archived = (a as Record<string, unknown>).archived ? 1 : 0;
    if (!id || !name) {
      invalid.accounts++;
      continue;
    }
    accountStmts.push(
      ctx.env.DB.prepare(
        `INSERT OR IGNORE INTO accounts (id, name, currency, opening_balance_minor, sort_order, archived)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(id, name, currency, opening, order, archived),
    );
    attempted.accounts++;
  }

  for (const c of categories) {
    const row = c as Record<string, unknown>;
    const id = str(row.id, 64);
    const name = str(row.name, 40);
    const order = int(row.sort_order, 0, 100000) ?? 1;
    const kind = row.kind === 'income' ? 'income' : 'expense';
    if (!id || !name) {
      invalid.categories++;
      continue;
    }
    categoryStmts.push(
      ctx.env.DB.prepare(
        'INSERT OR IGNORE INTO categories (id, name, sort_order, archived, kind) VALUES (?, ?, ?, ?, ?)',
      ).bind(id, name, order, row.archived ? 1 : 0, kind),
    );
    attempted.categories++;
  }

  for (const b of budgets) {
    const row = b as Record<string, unknown>;
    const id = str(row.id, 64);
    const category_id = str(row.category_id, 64);
    const amount = int(row.monthly_amount_minor, 1);
    if (!id || !category_id || amount === null) {
      invalid.budgets++;
      continue;
    }
    budgetStmts.push(
      ctx.env.DB.prepare(
        'INSERT OR IGNORE INTO budgets (id, category_id, monthly_amount_minor) VALUES (?, ?, ?)',
      ).bind(id, category_id, amount),
    );
    attempted.budgets++;
  }

  const accountsInserted = await runAll(accountStmts);
  const categoriesInserted = await runAll(categoryStmts);
  const budgetsInserted = await runAll(budgetStmts);

  const accountIds = new Set(
    (
      await ctx.env.DB.prepare('SELECT id FROM accounts').all<{ id: string }>()
    ).results.map((r) => r.id),
  );
  const categoryIds = new Set(
    (
      await ctx.env.DB.prepare('SELECT id FROM categories').all<{ id: string }>()
    ).results.map((r) => r.id),
  );

  const txStmts: D1PreparedStatement[] = [];
  for (const t of transactions) {
    const row = t as Record<string, unknown>;
    const id = str(row.id, 64);
    const type = row.type;
    const amount = int(row.amount_minor, 1);
    const account_id = str(row.account_id, 64);
    const occurred_on = str(row.occurred_on, 10);
    const category_id = row.category_id ? str(row.category_id, 64) : null;
    const to_account_id = row.to_account_id ? str(row.to_account_id, 64) : null;
    if (
      !id ||
      amount === null ||
      (type !== 'expense' && type !== 'income' && type !== 'transfer') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(occurred_on) ||
      !accountIds.has(account_id) ||
      (to_account_id && !accountIds.has(to_account_id)) ||
      (category_id && !categoryIds.has(category_id))
    ) {
      invalid.transactions++;
      continue;
    }
    txStmts.push(
      ctx.env.DB.prepare(
        `INSERT OR IGNORE INTO transactions
           (id, type, amount_minor, to_amount_minor, account_id, to_account_id, category_id, note, occurred_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        type,
        amount,
        row.to_amount_minor === null || row.to_amount_minor === undefined
          ? null
          : int(row.to_amount_minor, 1),
        account_id,
        to_account_id,
        category_id,
        str(row.note, 200),
        occurred_on,
      ),
    );
    attempted.transactions++;
  }

  const transactionsInserted = await runAll(txStmts);

  // Restore settings only where this database has no value yet — never
  // silently overwrite the rate you are actively using.
  const existingSettings = new Set(
    (await ctx.env.DB.prepare('SELECT key FROM settings').all<{ key: string }>()).results.map(
      (r) => r.key,
    ),
  );
  const settings =
    raw.settings && typeof raw.settings === 'object'
      ? (raw.settings as Record<string, unknown>)
      : {};
  const settingStmts: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(settings)) {
    if (existingSettings.has(key)) continue;
    if (typeof value !== 'string' && typeof value !== 'number') continue;
    settingStmts.push(
      ctx.env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(
        str(key, 64),
        str(String(value), 100),
      ),
    );
  }
  if (settingStmts.length) await ctx.env.DB.batch(settingStmts);

  const counts: RestoreCounts = {
    accounts: accountsInserted,
    categories: categoriesInserted,
    budgets: budgetsInserted,
    transactions: transactionsInserted,
    skipped:
      invalid.accounts +
      invalid.categories +
      invalid.budgets +
      invalid.transactions +
      (attempted.accounts - accountsInserted) +
      (attempted.categories - categoriesInserted) +
      (attempted.budgets - budgetsInserted) +
      (attempted.transactions - transactionsInserted),
  };
  return json({ ok: true, restored: counts });
}