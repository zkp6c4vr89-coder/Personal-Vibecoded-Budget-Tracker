/*
 * API smoke test against a locally running dev server:
 *   npm run build && npx wrangler dev --config wrangler.jsonc --port 8788 &
 *   node scripts/smoke.mjs
 *
 * Covers: session auth on every route, login rate limiting, account/category/
 * budget/settings CRUD, transaction create/edit/delete, transfers (including
 * cross-currency), balance math, dashboard aggregation and weekly/monthly
 * reports with previous-period comparison. Local only: it clears the
 * login_attempts table in the local D1 state file before starting.
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';

let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`);
  }
}
function eq(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected });
}

async function req(p, { method = 'GET', body, headers = {}, cookie } = {}) {
  const h = {};
  if (body !== undefined) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  Object.assign(h, headers);
  const res = await fetch(BASE + p, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { res, data, text };
}

const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const mondayOf = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
};
const today = new Date().toISOString().slice(0, 10);
const dPrevWeek = addDays(today, -7);
const monthStart = today.slice(0, 8) + '01';

async function clearRateLimits() {
  try {
    const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
    if (!fs.existsSync(dir)) return 'no local D1 state yet';
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite'));
    if (!files.length) return 'no D1 file yet';
    const { DatabaseSync } = await import('node:sqlite');
    for (const f of files) {
      const db = new DatabaseSync(path.join(dir, f));
      try {
        db.exec('DELETE FROM login_attempts');
      } catch (e) {
        /* table may not exist yet */
      }
      db.close();
    }
    return 'cleared';
  } catch (e) {
    return 'could not clear (' + e.message + ')';
  }
}

const PASSWORD = process.env.APP_PASSWORD || 'test-password-123';

async function main() {
  console.log(`\n== API smoke test against ${BASE} ==`);
  console.log(`rate-limit reset: ${await clearRateLimits()}\n`);

  /* ------------------------------------------------------------ session */
  console.log('auth + rate limit');
  let r = await req('/api/me');
  eq('unauthenticated /api/me is 401', r.res.status, 401);

  r = await req('/api/dashboard');
  eq('unauthenticated /api/dashboard is 401', r.res.status, 401);

  r = await req('/api/transactions');
  eq('unauthenticated /api/transactions is 401', r.res.status, 401);

  r = await req('/api/login', { method: 'POST', body: { password: 'definitely-wrong' } });
  eq('wrong password returns 401', r.res.status, 401);

  r = await req('/api/login', { method: 'POST', body: { password: PASSWORD } });
  eq('correct password returns 200', r.res.status, 200);
  const setCookie = r.res.headers.get('set-cookie') || '';
  check('session cookie is set', setCookie.includes('tb_sess='), setCookie);
  check('cookie is HttpOnly', setCookie.includes('HttpOnly'));
  check('cookie is SameSite=Strict', setCookie.includes('SameSite=Strict'));
  check('cookie lives ~30 days', setCookie.includes('Max-Age=2592000'), setCookie);
  check('cookie is not Secure on plain-http dev', !/;\s*Secure/i.test(setCookie));
  const token = (setCookie.match(/tb_sess=([^;]+)/) || [])[1];
  const cookie = `tb_sess=${token}`;

  r = await req('/api/me', { cookie });
  eq('/api/me with session is 200', r.res.status, 200);
  const skewDays = (r.data.expires_at - Date.now()) / 86400000;
  check('session expiry is ~30 days out', skewDays > 29 && skewDays < 31, skewDays);

  /* ----------------------------------------------------- seed + accounts */
  console.log('\nbootstrap seeds');
  r = await req('/api/bootstrap', { cookie });
  eq('bootstrap returns 200', r.res.status, 200);
  const boot = r.data;
  eq(
    'four seeded accounts',
    boot.accounts.map((a) => a.name),
    ['Cash', 'Touch \'n Go eWallet', 'Bank account', 'Cash USD'],
  );
  eq(
    'USD account currency',
    boot.accounts.find((a) => a.id === 'acc_usd').currency,
    'USD',
  );
  eq(
    'seven seeded categories',
    boot.categories.map((c) => c.name),
    ['Food', 'Transport', 'Bills', 'Shopping', 'Entertainment', 'Education', 'Other'],
  );
  check('usd rate setting present', boot.settings.usd_myr_rate > 0, boot.settings);

  const rate = boot.settings.usd_myr_rate;

  r = await req('/api/accounts/acc_bank', {
    method: 'PATCH',
    cookie,
    body: { opening_balance_minor: 500000 },
  });
  eq('set bank opening balance', r.res.status, 200);
  r = await req('/api/accounts/acc_usd', {
    method: 'PATCH',
    cookie,
    body: { opening_balance_minor: 10000 },
  });
  eq('set USD opening balance', r.res.status, 200);

  /* -------------------------------------------------------- transactions */
  console.log('\ntransactions: create / edit / delete');
  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: {
      type: 'expense',
      amount_minor: 1250,
      account_id: 'acc_bank',
      category_id: 'cat_food',
      note: 'Lunch',
      occurred_on: today,
    },
  });
  eq('create expense', r.res.status, 201);
  const txA = r.data.transaction;
  check('expense row carries account name', txA.account_name === 'Bank account', txA);
  check('expense row carries category name', txA.category_name === 'Food', txA);

  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: { type: 'expense', amount_minor: 0, account_id: 'acc_bank', category_id: 'cat_food' },
  });
  eq('zero amount rejected', r.res.status, 400);

  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: { type: 'expense', amount_minor: 500, account_id: 'nope' },
  });
  eq('unknown account rejected', r.res.status, 400);

  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: { type: 'dance', amount_minor: 500, account_id: 'acc_bank' },
  });
  eq('bad type rejected', r.res.status, 400);

  r = await req(`/api/transactions/${txA.id}`, {
    method: 'PATCH',
    cookie,
    body: { amount_minor: 2000, note: 'Lunch + drink' },
  });
  eq('edit transaction', r.res.status, 200);
  eq('edited amount saved', r.data.transaction.amount_minor, 2000);
  eq('edited note saved', r.data.transaction.note, 'Lunch + drink');

  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: {
      type: 'income',
      amount_minor: 300000,
      account_id: 'acc_bank',
      note: 'Salary',
      occurred_on: today,
    },
  });
  eq('create income without category', r.res.status, 201);
  const txC = r.data.transaction;

  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: {
      type: 'expense',
      amount_minor: 5000,
      account_id: 'acc_bank',
      category_id: 'cat_transport',
      note: 'Bus pass',
      occurred_on: dPrevWeek,
    },
  });
  eq('create previous-week expense', r.res.status, 201);
  const txD = r.data.transaction;

  /* ------------------------------------------------------------ transfers */
  console.log('\ntransfers');
  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: {
      type: 'transfer',
      amount_minor: 10000,
      account_id: 'acc_bank',
      to_account_id: 'acc_cash',
      note: 'ATM withdrawal',
      occurred_on: today,
    },
  });
  eq('create same-currency transfer', r.res.status, 201);
  const txB = r.data.transaction;
  eq('same-currency to_amount matches', txB.to_amount_minor, 10000);

  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: {
      type: 'transfer',
      amount_minor: 5000,
      account_id: 'acc_usd',
      to_account_id: 'acc_bank',
      note: 'Convert USD',
      occurred_on: today,
    },
  });
  eq('create cross-currency transfer', r.res.status, 201);
  const txE = r.data.transaction;
  eq('cross-currency to_amount uses rate', txE.to_amount_minor, Math.round(5000 * rate));

  r = await req('/api/transactions', {
    method: 'POST',
    cookie,
    body: { type: 'transfer', amount_minor: 100, account_id: 'acc_cash', to_account_id: 'acc_cash' },
  });
  eq('transfer to same account rejected', r.res.status, 400);

  /* ------------------------------------------------------- balances math */
  console.log('\nbalances and dashboard');
  r = await req('/api/dashboard?today=' + today, { cookie });
  eq('dashboard is 200', r.res.status, 200);
  const dash = r.data;
  const bal = (id) => dash.accounts.find((a) => a.id === id).balance_minor;
  const bankExpect = 500000 - 2000 - 5000 - 10000 + 300000 + Math.round(5000 * rate);
  eq('bank balance (opening − expenses − transfer + income + conversion)', bal('acc_bank'), bankExpect);
  eq('cash balance gains transfers in', bal('acc_cash'), 10000);
  eq('TnG balance untouched', bal('acc_tng'), 0);
  eq('USD balance in own currency', bal('acc_usd'), 5000);
  eq(
    'combined total in MYR',
    dash.total_myr_minor,
    bankExpect + 10000 + Math.round(5000 * rate),
  );

  eq('week totals exclude transfers (spent)', dash.week.spent_minor, 2000);
  eq('week totals exclude transfers (income)', dash.week.income_minor, 300000);
  eq('week net', dash.week.net_minor, 298000);
  eq('week transaction count counts only expense+income', dash.week.count, 2);

  const dInMonth = dPrevWeek >= monthStart;
  eq('month income', dash.month.income_minor, 300000);
  eq('month spent', dash.month.spent_minor, 2000 + (dInMonth ? 5000 : 0));
  eq('series has 13 weekly buckets', dash.series.length, 13);
  eq('series last bucket starts current week', dash.series[12].key, mondayOf(today));
  eq('series last bucket equals current-week spend', dash.series[12].spent_minor, 2000);
  const foodCat = dash.by_category.find((c) => c.name === 'Food');
  eq('donut shows food spend', foodCat?.spent_minor, 2000);
  check('recent list populated', dash.recent.length >= 3, dash.recent.length);

  /* ------------------------------------------------------------- budgets */
  console.log('\nbudgets');
  r = await req('/api/budgets', { method: 'POST', cookie, body: { category_id: 'cat_food', monthly_amount_minor: 100000 } });
  eq('create budget', r.res.status, 201);
  r = await req('/api/budgets', { cookie });
  eq('budget list 200', r.res.status, 200);
  const bFood = r.data.budgets.find((b) => b.category_id === 'cat_food');
  eq('budget amount stored', bFood?.monthly_amount_minor, 100000);
  eq('budget spent this month', bFood?.spent_minor, 2000);

  r = await req('/api/budgets', { method: 'POST', cookie, body: { category_id: 'cat_food', monthly_amount_minor: 0 } });
  eq('zero budget rejected', r.res.status, 400);

  /* ------------------------------------------------------------ settings */
  console.log('\nsettings');
  r = await req('/api/settings', { method: 'PUT', cookie, body: { usd_myr_rate: 5.25 } });
  eq('update rate', r.res.status, 200);
  eq('rate saved', r.data.settings.usd_myr_rate, 5.25);
  r = await req('/api/settings', { method: 'PUT', cookie, body: { usd_myr_rate: -3 } });
  eq('invalid rate rejected', r.res.status, 400);
  r = await req('/api/settings', { method: 'PUT', cookie, body: { usd_myr_rate: rate } });
  eq('restore rate', r.res.status, 200);

  /* ------------------------------------------------- search and filters */
  console.log('\nsearch + filters');
  r = await req('/api/transactions?q=Bus', { cookie });
  eq('note search finds one', r.data.transactions.length, 1);
  eq('note search match', r.data.transactions[0].id, txD.id);

  r = await req('/api/transactions?account=acc_cash', { cookie });
  eq('account filter matches either side of transfers', r.data.transactions.length, 1);
  eq('account filter result', r.data.transactions[0].id, txB.id);

  r = await req('/api/transactions?category=cat_transport', { cookie });
  eq('category filter', r.data.transactions.length, 1);

  r = await req('/api/transactions?type=transfer', { cookie });
  eq('type filter finds both transfers', r.data.transactions.length, 2);

  r = await req(`/api/transactions?from=${today}&to=${today}`, { cookie });
  check('date range excludes last week', r.data.transactions.every((t) => t.occurred_on === today), r.data.transactions.map((t) => t.occurred_on));

  r = await req('/api/transactions?q=300000', { cookie });
  eq('amount search', r.data.transactions.length, 1);

  /* -------------------------------------------------- accounts + categories */
  console.log('\naccount and category CRUD');
  r = await req('/api/accounts', { method: 'POST', cookie, body: { name: 'Petty cash', currency: 'MYR', opening_balance_minor: 10000 } });
  eq('create account', r.res.status, 201);
  const accNew = r.data.account;
  r = await req(`/api/accounts/${accNew.id}`, { method: 'PATCH', cookie, body: { opening_balance_minor: 20000 } });
  eq('edit opening balance', r.data.account.opening_balance_minor, 20000);
  r = await req(`/api/accounts/${accNew.id}`, { method: 'DELETE', cookie });
  eq('unused account deletes hard', r.res.status, 204);

  r = await req('/api/accounts/acc_cash', { method: 'DELETE', cookie });
  eq('account with history is archived', r.data.archived, true);
  r = await req('/api/accounts/acc_cash', { method: 'PATCH', cookie, body: { archived: 0 } });
  eq('account restored', r.data.account.archived, 0);

  r = await req('/api/accounts/acc_cash', { method: 'PATCH', cookie, body: { currency: 'USD' } });
  eq('currency change blocked once used', r.res.status, 400);

  r = await req('/api/categories', { method: 'POST', cookie, body: { name: 'Subscriptions' } });
  eq('create category', r.res.status, 201);
  const catNew = r.data.category;
  r = await req(`/api/categories/${catNew.id}`, { method: 'PATCH', cookie, body: { name: 'Subs' } });
  eq('rename category', r.data.category.name, 'Subs');
  r = await req(`/api/categories/${catNew.id}`, { method: 'DELETE', cookie });
  eq('unused category deletes', r.res.status, 204);

  r = await req('/api/categories/cat_food', { method: 'DELETE', cookie });
  eq('category with history archives', r.data.archived, true);
  r = await req('/api/categories/cat_food', { method: 'PATCH', cookie, body: { archived: 0 } });
  eq('category restored', r.data.category.archived, 0);

  /* -------------------------------------------------------------- reports */
  console.log('\nweekly report');
  r = await req(`/api/report/week?start=${today}`, { cookie });
  eq('week report 200', r.res.status, 200);
  const wk = r.data;
  eq('week starts monday', wk.start, mondayOf(today));
  eq('week ends sunday', wk.end, addDays(mondayOf(today), 6));
  eq('week spent', wk.totals.spent_minor, 2000);
  eq('week income', wk.totals.income_minor, 300000);
  eq('week prev spent', wk.prev.spent_minor, 5000);
  eq('week delta pct', wk.delta.spent_pct, -60);
  eq('week delta income pct (no prev income)', wk.delta.income_pct, null);
  eq('week delta net', wk.delta.net_abs, 298000 + 5000);
  eq('week category breakdown', wk.by_category.map((c) => c.name), ['Food']);
  eq('week biggest expense is lunch', wk.top_expenses[0]?.amount_minor, 2000);
  eq('week avg daily spend', wk.avg_daily_spent, Math.round(2000 / 7));
  check('week navigation prev key set', typeof wk.prev_key === 'string' && wk.prev_key.length === 10, wk.prev_key);
  eq('week navigation next is null for current week', wk.next_key, null);
  const bWeek = wk.budgets.find((b) => b.category_id === 'cat_food');
  eq('week report includes budget performance', bWeek?.budget_minor, 100000);

  r = await req('/api/report/week?start=not-a-date', { cookie });
  eq('invalid date falls back to current week', r.res.status, 200);
  eq('fallback week start', r.data.start, mondayOf(today));

  console.log('\nmonthly report');
  const month = today.slice(0, 7);
  const prevMonthDate = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1));
  const prevMonth = prevMonthDate.toISOString().slice(0, 7);
  r = await req(`/api/report/month?month=${month}`, { cookie });
  eq('month report 200', r.res.status, 200);
  const mn = r.data;
  eq('month label', mn.label.split(' ')[1], today.slice(0, 4));
  eq('month income', mn.totals.income_minor, 300000);
  eq('month spent', mn.totals.spent_minor, 2000 + (dInMonth ? 5000 : 0));
  eq('month prev is empty month', mn.prev.spent_minor, 0);
  eq('month delta null without previous data', mn.delta, null);
  eq('month prev label is previous month', mn.prev_label, prevMonthLabel(prevMonth));
  eq('month navigation next is null for current month', mn.next_key, null);
  eq('month budget label', mn.budget_label, mn.label);

  r = await req(`/api/report/month?month=${prevMonth}`, { cookie });
  eq('browse previous month', r.res.status, 200);
  eq('previous month prev_key exists', typeof r.data.prev_key, 'string');
  eq('previous month next_key is current month', r.data.next_key, month);

  r = await req('/api/report/month?month=2026-13', { cookie });
  eq('invalid month falls back', r.res.status, 200);

  /* ------------------------------------------------------ security checks */
  console.log('\nsecurity');
  r = await req('/api/transactions', { method: 'POST', cookie, headers: { Origin: 'https://evil.example' }, body: { type: 'expense', amount_minor: 100, account_id: 'acc_bank' } });
  eq('foreign origin rejected', r.res.status, 403);

  r = await req('/api/nope', { cookie });
  eq('unknown api route is 404', r.res.status, 404);

  r = await req('/api/login', { method: 'DELETE', cookie });
  eq('method not allowed is 405', r.res.status, 405);

  r = await req('/api/transactions/00000000-0000-4000-8000-000000000000', { method: 'DELETE', cookie });
  eq('delete unknown transaction is 404', r.res.status, 404);

  r = await req('/', {});
  eq('static asset served', r.res.status, 200);
  check('security headers on static', (r.res.headers.get('content-security-policy') || '').includes("default-src 'self'"), r.res.headers.get('content-security-policy'));
  check('nosniff header present', r.res.headers.get('x-content-type-options') === 'nosniff');

  /* ------------------------------------------------------------- delete */
  r = await req(`/api/transactions/${txA.id}`, { method: 'DELETE', cookie });
  eq('delete transaction', r.res.status, 204);
  r = await req(`/api/transactions/${txA.id}`, { cookie });
  eq('deleted transaction gone', r.res.status, 404);

  r = await req(`/api/budgets/${bFood.id}`, { method: 'DELETE', cookie });
  eq('delete budget', r.res.status, 204);
  r = await req('/api/budgets', { cookie });
  eq('budget list empty after delete', r.data.budgets.length, 0);

  /* -------------------------------------------------------------- logout */
  console.log('\nlogout + rate limit');
  r = await req('/api/logout', { method: 'POST', cookie });
  eq('logout 200', r.res.status, 200);
  check('logout clears cookie', (r.res.headers.get('set-cookie') || '').includes('Max-Age=0'));
  r = await req('/api/bootstrap', { cookie });
  eq('session invalid after logout', r.res.status, 401);

  r = await req('/api/login', { method: 'POST', body: { password: PASSWORD } });
  eq('fresh login works', r.res.status, 200);
  const cookie2 = `tb_sess=${(r.res.headers.get('set-cookie') || '').match(/tb_sess=([^;]+)/)[1]}`;
  void cookie2;

  let saw429 = false;
  for (let i = 1; i <= 10; i++) {
    const attempt = await req('/api/login', { method: 'POST', body: { password: `wrong-${i}` } });
    if (attempt.res.status === 429) {
      saw429 = true;
      check('rate limit kicks in after 8 failures', i >= 8, `first 429 at attempt ${i}`);
      check('Retry-After header sent', Boolean(attempt.res.headers.get('retry-after')), attempt.res.headers.get('retry-after'));
      break;
    }
    if (attempt.res.status !== 401) check('failed login is 401 before limit', false, attempt.res.status);
  }
  check('rate limiter triggered', saw429);

  const after = await req('/api/login', { method: 'POST', body: { password: PASSWORD } });
  eq('correct password is still blocked while rate limited', after.res.status, 429);

  /* -------------------------------------------------------------- summary */
  console.log(`\n== ${pass} passed, ${failures.length} failed ==`);
  if (failures.length) {
    console.log('failures:\n - ' + failures.join('\n - '));
    process.exitCode = 1;
  }
}

const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function prevMonthLabel(m) {
  return `${MN[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
}

main().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exitCode = 1;
});