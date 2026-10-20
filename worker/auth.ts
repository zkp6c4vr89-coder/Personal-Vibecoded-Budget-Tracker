import { apiError, getCookie, json, readJson, type Env } from './util';

export const SESSION_COOKIE = 'tb_sess';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // rate-limit window
const MAX_LOGIN_ATTEMPTS = 8; // attempts per window per IP

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function isHttps(req: Request): boolean {
  return new URL(req.url).protocol === 'https:';
}

function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearedCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Returns the session row for this request, or null when missing/expired. */
export async function getSession(
  req: Request,
  env: Env,
): Promise<{ token_hash: string; expires_at: number } | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token || token.length < 32 || token.length > 128) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT token_hash, expires_at FROM sessions WHERE token_hash = ?',
  )
    .bind(tokenHash)
    .first<{ token_hash: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return row;
}

export async function requireSession(req: Request, env: Env): Promise<Response | null> {
  const session = await getSession(req, env);
  if (session) return null;
  return json({ error: 'Not signed in' }, 401);
}

async function checkRateLimit(env: Env, key: string): Promise<{ retryAfter?: number }> {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT window_start, count FROM login_attempts WHERE key = ?')
    .bind(key)
    .first<{ window_start: number; count: number }>();

  let windowStart = now;
  let count = 1;
  if (row) {
    if (now - row.window_start > LOGIN_WINDOW_MS) {
      windowStart = now;
      count = 1;
    } else {
      windowStart = row.window_start;
      count = row.count + 1;
    }
  }

  await env.DB.prepare(
    `INSERT INTO login_attempts (key, window_start, count) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`,
  )
    .bind(key, windowStart, count)
    .run();

  if (count > MAX_LOGIN_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((windowStart + LOGIN_WINDOW_MS - now) / 1000));
    return { retryAfter };
  }
  return {};
}

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'unknown';

  const limit = await checkRateLimit(env, `login:${ip}`);
  if (limit.retryAfter !== undefined) {
    return json(
      { error: 'Too many attempts. Please wait a few minutes and try again.' },
      429,
      { 'Retry-After': String(limit.retryAfter) },
    );
  }

  if (!env.APP_PASSWORD) {
    return json({ error: 'Server password is not configured (APP_PASSWORD is missing).' }, 500);
  }

  const body = await readJson<{ password?: unknown }>(req);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) return apiError('Password required', 400);

  // Hashing both sides keeps the comparison free of length leaks.
  const [given, expected] = await Promise.all([
    sha256Hex(password),
    sha256Hex(env.APP_PASSWORD),
  ]);
  if (given !== expected) {
    return json({ error: 'Wrong password' }, 401);
  }

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...tokenBytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const tokenHash = await sha256Hex(token);
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare('DELETE FROM login_attempts WHERE key = ?').bind(`login:${ip}`),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB
      .prepare('INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)')
      .bind(tokenHash, now, now + SESSION_TTL_MS),
  ]);

  return json(
    { ok: true, expires_at: now + SESSION_TTL_MS },
    200,
    { 'Set-Cookie': sessionCookie(token, isHttps(req)) },
  );
}

export async function handleLogout(req: Request, env: Env): Promise<Response> {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearedCookie(isHttps(req)) });
}

export async function handleMe(req: Request, env: Env): Promise<Response> {
  const session = await getSession(req, env);
  if (!session) return json({ error: 'Not signed in' }, 401);
  return json({ ok: true, expires_at: session.expires_at });
}