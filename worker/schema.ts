/* Schema + seed data, applied lazily by the worker the first time an API
 * request hits a fresh database. Migrations are recorded in schema_migrations
 * and run exactly once each, in order; every statement is idempotent so a
 * partially-applied migration can safely retry.
 */

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     id TEXT PRIMARY KEY,
     applied_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS accounts (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     currency TEXT NOT NULL DEFAULT 'MYR',
     opening_balance_minor INTEGER NOT NULL DEFAULT 0,
     sort_order INTEGER NOT NULL DEFAULT 0,
     archived INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS categories (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     sort_order INTEGER NOT NULL DEFAULT 0,
     archived INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS transactions (
     id TEXT PRIMARY KEY,
     type TEXT NOT NULL,
     amount_minor INTEGER NOT NULL,
     to_amount_minor INTEGER,
     account_id TEXT NOT NULL,
     to_account_id TEXT,
     category_id TEXT,
     note TEXT NOT NULL DEFAULT '',
     occurred_on TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_tx_occurred ON transactions(occurred_on)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_to_account ON transactions(to_account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id)`,
  `CREATE TABLE IF NOT EXISTS budgets (
     id TEXT PRIMARY KEY,
     category_id TEXT NOT NULL UNIQUE,
     monthly_amount_minor INTEGER NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     token_hash TEXT PRIMARY KEY,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
     key TEXT PRIMARY KEY,
     window_start INTEGER NOT NULL,
     count INTEGER NOT NULL
   )`,
  // --- seed data: the four accounts this app is set up for ---
  `INSERT OR IGNORE INTO accounts (id, name, currency, opening_balance_minor, sort_order) VALUES
     ('acc_cash', 'Cash', 'MYR', 0, 1),
     ('acc_tng',  'Touch ''n Go eWallet', 'MYR', 0, 2),
     ('acc_bank', 'Bank account', 'MYR', 0, 3),
     ('acc_usd',  'Cash USD', 'USD', 0, 4)`,
  `INSERT OR IGNORE INTO categories (id, name, sort_order) VALUES
     ('cat_food', 'Food', 1),
     ('cat_transport', 'Transport', 2),
     ('cat_bills', 'Bills', 3),
     ('cat_shopping', 'Shopping', 4),
     ('cat_entertainment', 'Entertainment', 5),
     ('cat_education', 'Education', 6),
     ('cat_other', 'Other', 7)`,
  `INSERT OR IGNORE INTO settings (key, value) VALUES ('usd_myr_rate', '4.60')`,
];

/** Income-only categories (migration 0002), inserted by name-safe upsert. */
const INCOME_SEEDS: Array<[string, string]> = [
  ['cat_allowance', 'Allowance'],
  ['cat_family', 'Family'],
  ['cat_salary', 'Salary'],
  ['cat_gift', 'Gift'],
  ['cat_income_other', 'Other'],
];

interface Migration {
  id: string;
  run: (db: D1Database) => Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    id: '0001_initial',
    run: async (db) => {
      for (const sql of STATEMENTS) await db.prepare(sql).run();
    },
  },
  {
    // Categorise existing rows as expenses (their default) and seed the
    // income-side categories. Existing databases only need the ALTER plus the
    // five INSERTs; both are safe to retry.
    id: '0002_category_kind',
    run: async (db) => {
      try {
        await db
          .prepare(`ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'`)
          .run();
      } catch (err) {
        // A retry after a partial run: the column is already there.
        if (!String(err).toLowerCase().includes('duplicate column')) throw err;
      }
      for (const [id, name] of INCOME_SEEDS) {
        // By name, not just id, so a user-created "Salary" isn't duplicated.
        await db
          .prepare(
            `INSERT INTO categories (id, name, sort_order, kind)
             SELECT ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories), 'income'
             WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ? AND kind = 'income')`,
          )
          .bind(id, name, name)
          .run();
      }
    },
  },
];

let ready: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // Create the tracking table first — a fresh DB has nothing to read from.
      await db
        .prepare(`CREATE TABLE IF NOT EXISTS schema_migrations (
           id TEXT PRIMARY KEY,
           applied_at TEXT NOT NULL DEFAULT (datetime('now'))
         )`)
        .run();
      for (const migration of MIGRATIONS) {
        const seen = await db
          .prepare('SELECT id FROM schema_migrations WHERE id = ?')
          .bind(migration.id)
          .first();
        if (seen) continue;
        await migration.run(db);
        await db
          .prepare('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)')
          .bind(migration.id)
          .run();
      }
    })().catch((err) => {
      ready = null; // allow retry on the next request
      throw err;
    });
  }
  return ready;
}
