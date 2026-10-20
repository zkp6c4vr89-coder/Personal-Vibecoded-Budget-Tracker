/*
 * Live instance verifier: independently recomputes balances, period totals,
 * category breakdown and report deltas from the raw transaction list, then
 * compares them against the aggregated API responses. Also times the main
 * endpoints (warm, keep-alive).
 *
 *   BASE=https://... APP_PASSWORD_FILE=.secrets/app_password.txt node scripts/verify-live.mjs
 */
import fs from 'node:fs';

const BASE = process.env.BASE || 'https://site-7116c7ba1c644ed19fe722c7436da33f.freebuff.page';
const PW_FILE = process.env.APP_PASSWORD_FILE || '.secrets/app_password.txt';

let pass = 0;
const failures = [];
const eq = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}\n       actual   ${JSON.stringify(actual)}\n       expected ${JSON.stringify(expected)}`);
  }
};

/* ---- date helpers (Mon-Sun weeks, same rules as src/lib/period.ts) ---- */
const toISO = (d) => d.toISOString().slice(0, 10);
const fromISO = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => {
  const d = fromISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
const mondayOf = (s) => {
  const d = fromISO(s);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return toISO(d);
};
const monthRange = (m) => {
  const [y, mo] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { start: `${m}-01`, end: `${m}-${String(last).padStart(2, '0')}` };
};

const password = fs.readFileSync(PW_FILE, 'utf8').trim();

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.origin ? { Origin: opts.origin } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') };
}

const round = (n) => Math.round(n);

async function main() {
  console.log(`\n== live verify: ${BASE} ==\n`);

  /* ---------------- auth ---------------- */
  const wrong = await api('/api/login', { method: 'POST', body: { password: 'not-the-password' } });
  eq('wrong password -> 401', wrong.status, 401);
  const login = await api('/api/login', { method: 'POST', body: { password } });
  eq('correct password -> 200', login.status, 200);
  const cookie = `tb_sess=${(login.setCookie || '').match(/tb_sess=([^;]+)/)?.[1]}`;
  eq('session cookie issued', Boolean((login.setCookie || '').match(/tb_sess=([^;]+)/)), true);
  const anon = await api('/api/me');
  eq('unauthenticated -> 401', anon.status, 401);

  /* ---------------- gather data ---------------- */
  const boot = await api('/api/bootstrap', { cookie });
  const dash = await api('/api/dashboard', { cookie });
  const txRes = await api('/api/transactions?limit=5000', { cookie });
  eq('bootstrap/dashboard/transactions -> 200', [boot.status, dash.status, txRes.status], [200, 200, 200]);

  const settings = boot.data.settings;
  const accounts = boot.data.accounts;
  const txs = txRes.data.transactions;
  const D = dash.data;
  const rate = settings.usd_myr_rate;
  const today = D.today;
  const week = { start: mondayOf(today), end: addDays(mondayOf(today), 6) };
  const mRange = monthRange(today.slice(0, 7));

  const myr = (t, value) => (t.account_currency === 'USD' ? round(value * rate) : value);

  /* ---------------- balances ---------------- */
  for (const a of accounts) {
    let bal = a.opening_balance_minor;
    for (const t of txs) {
      if (t.account_id === a.id) {
        if (t.type === 'income') bal += t.amount_minor;
        else if (t.type === 'expense') bal -= t.amount_minor;
        else if (t.type === 'transfer') bal -= t.amount_minor;
      }
      if (t.to_account_id === a.id && t.type === 'transfer') bal += t.to_amount_minor ?? t.amount_minor;
    }
    const apiBal = D.accounts.find((x) => x.id === a.id)?.balance_minor;
    eq(`balance ${a.name}`, apiBal, bal);
  }

  const totalExpected =
    accounts.reduce((s, a) => {
      let bal = a.opening_balance_minor;
      for (const t of txs) {
        if (t.account_id === a.id) {
          if (t.type === 'income') bal += t.amount_minor;
          else if (t.type === 'expense') bal -= t.amount_minor;
          else if (t.type === 'transfer') bal -= t.amount_minor;
        }
        if (t.to_account_id === a.id && t.type === 'transfer') bal += t.to_amount_minor ?? t.amount_minor;
        void t;
      }
      return s + (a.currency === 'USD' ? round(bal * rate) : bal);
    }, 0);
  eq('combined total (MYR)', D.total_myr_minor, totalExpected);

  /* ---------------- period totals (transfers excluded) ---------------- */
  const inRange = (t, r) => t.occurred_on >= r.start && t.occurred_on <= r.end;
  const periodTotals = (r) => {
    let spent = 0;
    let income = 0;
    let count = 0;
    for (const t of txs) {
      if (t.type !== 'expense' && t.type !== 'income') continue;
      if (!inRange(t, r)) continue;
      count++;
      if (t.type === 'expense') spent += myr(t, t.amount_minor);
      else income += myr(t, t.amount_minor);
    }
    return { spent_minor: spent, income_minor: income, net_minor: income - spent, count };
  };

  const w = periodTotals(week);
  eq('week spent (transfers excluded)', D.week.spent_minor, w.spent_minor);
  eq('week income', D.week.income_minor, w.income_minor);
  eq('week count', D.week.count, w.count);
  const m = periodTotals(mRange);
  eq('month spent', D.month.spent_minor, m.spent_minor);
  eq('month income', D.month.income_minor, m.income_minor);
  eq('month count', D.month.count, m.count);

  /* ---------------- transfers never counted ---------------- */
  const transfersInPeriods = txs.filter(
    (t) => t.type === 'transfer' && (inRange(t, week) || inRange(t, mRange)),
  ).length;
  const check =
    w.spent_minor + w.income_minor ===
    txs
      .filter((t) => (t.type === 'expense' || t.type === 'income') && inRange(t, week))
      .reduce((s, t) => s + myr(t, t.amount_minor), 0);
  eq(`transfer exclusion holds (${transfersInPeriods} transfers present)`, check, true);

  /* ---------------- category breakdown ---------------- */
  const catExpected = new Map();
  for (const t of txs) {
    if (t.type !== 'expense' || !inRange(t, mRange)) continue;
    const key = t.category_id ?? null;
    catExpected.set(key, (catExpected.get(key) ?? 0) + myr(t, t.amount_minor));
  }
  const apiCats = D.by_category
    .map((c) => [c.category_id, c.spent_minor])
    .filter(([, v]) => v > 0)
    .sort();
  const expCats = [...catExpected.entries()].filter(([, v]) => v > 0).sort();
  eq('donut category totals', apiCats, expCats);

  /* ---------------- weekly report + delta ---------------- */
  const wk = await api(`/api/report/week?start=${today}`, { cookie });
  eq('week report -> 200', wk.status, 200);
  const R = wk.data;
  eq('week report totals', R.totals, w);
  const prevWeek = periodTotals({ start: addDays(week.start, -7), end: addDays(week.end, -7) });
  // Contract: when *neither* period has any transactions the API returns prev: null.
  const prevExpected = w.count === 0 && prevWeek.count === 0 ? null : prevWeek;
  eq('week report previous totals', R.prev, prevExpected);
  const deltaExpected =
    prevWeek.count === 0
      ? null
      : {
          spent_pct: prevWeek.spent_minor > 0 ? round(((w.spent_minor - prevWeek.spent_minor) / prevWeek.spent_minor) * 1000) / 10 : null,
          income_pct: prevWeek.income_minor > 0 ? round(((w.income_minor - prevWeek.income_minor) / prevWeek.income_minor) * 1000) / 10 : null,
          net_abs: w.net_minor - prevWeek.net_minor,
        };
  eq('week report delta', R.delta, deltaExpected);
  const topSorted = R.top_expenses.map((t) => t.amount_minor);
  eq('biggest expenses sorted desc', topSorted, [...topSorted].sort((a, b) => b - a));

  /* ---------------- monthly report + budgets ---------------- */
  const mr = await api(`/api/report/month?month=${today.slice(0, 7)}`, { cookie });
  eq('month report -> 200', mr.status, 200);
  eq('month report totals', mr.data.totals, m);
  for (const b of mr.data.budgets) {
    let spent = 0;
    for (const t of txs) {
      if (t.type === 'expense' && t.category_id === b.category_id && inRange(t, mRange)) {
        spent += myr(t, t.amount_minor);
      }
    }
    eq(`budget ${b.name} spent`, b.spent_minor, spent);
  }

  /* ---------------- live security spot-checks ---------------- */
  const evil = await api('/api/transactions', {
    method: 'POST',
    cookie,
    origin: 'https://evil.example',
    body: { type: 'expense', amount_minor: 100, account_id: 'acc_cash' },
  });
  eq('foreign origin -> 403', evil.status, 403);

  /* ---------------- latency (warm, keep-alive) ---------------- */
  console.log('\nlatency (3 samples each):');
  for (const ep of ['/api/dashboard', '/api/report/week', '/api/bootstrap', '/']) {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await fetch(BASE + ep, { headers: ep.startsWith('/api') ? { Cookie: cookie } : {} });
      times.push(Math.round(performance.now() - t0));
    }
    console.log(`  ${ep.padEnd(18)} ${times.join(' / ')} ms`);
  }

  console.log(`\n== ${pass} passed, ${failures.length} failed ==`);
  if (failures.length) {
    console.log('failures:\n - ' + failures.join('\n - '));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('verify crashed:', err);
  process.exitCode = 1;
});