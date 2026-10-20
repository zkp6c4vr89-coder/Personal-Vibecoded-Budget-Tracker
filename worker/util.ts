export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Login password — server-side secret, never exposed to the client. */
  APP_PASSWORD?: string;
  /** Optional canonical origin, used for CSRF origin checks. */
  APP_ORIGIN?: string;
}

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export function apiError(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function noContent(headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 204, headers });
}

/** Adds security headers to a response without consuming its body. */
export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    const body = (await req.json()) as T;
    if (!body || typeof body !== 'object') return null;
    return body;
  } catch {
    return null;
  }
}

export function getCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export function parseAcceptsJson(req: Request): boolean {
  return (req.headers.get('Accept') || '').includes('text/csv') ? false : true;
}

export function newId(): string {
  return crypto.randomUUID();
}

/**
 * Rejects cross-site state-changing requests (belt and braces next to the
 * SameSite=Strict session cookie).
 */
export function isSameOriginRequest(req: Request, env: Env): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = req.headers.get('Origin');
  if (!origin) return true; // non-browser client (curl) — cookie still required
  const urlOrigin = new URL(req.url).origin;
  if (origin === urlOrigin) return true;
  if (env.APP_ORIGIN && origin === env.APP_ORIGIN) return true;
  return false;
}

/** Coerce an incoming value to a safe positive integer of minor units (cents). */
export function toMinor(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded <= 0 || rounded > 1e11) return null;
  return rounded;
}

/** Context handed to every API route handler. */
export interface RouteCtx {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
}

export type RouteHandler = (ctx: RouteCtx) => Promise<Response>;

export function clampRate(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n <= 0 || n > 10000) return null;
  return n;
}