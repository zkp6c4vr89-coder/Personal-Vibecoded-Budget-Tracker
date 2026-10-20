import { handleLogin, handleLogout, handleMe, requireSession } from './auth';
import {
  bootstrap,
  createAccount,
  createCategory,
  createTransaction,
  deleteAccount,
  deleteBudget,
  deleteCategory,
  deleteTransaction,
  getSettings,
  getTransaction,
  listAccounts,
  listBudgets,
  listCategories,
  listTransactions,
  updateAccount,
  updateCategory,
  updateTransaction,
  updateSettings,
  upsertBudget,
} from './api';
import { getDashboard, getMonthReport, getWeekReport } from './reports';
import { ensureSchema } from './schema';
import {
  apiError,
  isSameOriginRequest,
  json,
  withSecurityHeaders,
  type Env,
  type RouteHandler,
} from './util';

interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
  auth?: boolean;
}

const ROUTES: Route[] = [
  { method: 'POST', pattern: '/api/login', handler: ({ req, env }) => handleLogin(req, env), auth: false },
  { method: 'POST', pattern: '/api/logout', handler: ({ req, env }) => handleLogout(req, env), auth: false },
  { method: 'GET', pattern: '/api/me', handler: ({ req, env }) => handleMe(req, env), auth: false },

  { method: 'GET', pattern: '/api/bootstrap', handler: bootstrap },
  { method: 'GET', pattern: '/api/accounts', handler: ({ env }) => listAccounts(env) },
  { method: 'POST', pattern: '/api/accounts', handler: createAccount },
  { method: 'PATCH', pattern: '/api/accounts/:id', handler: updateAccount },
  { method: 'DELETE', pattern: '/api/accounts/:id', handler: deleteAccount },

  { method: 'GET', pattern: '/api/categories', handler: ({ env }) => listCategories(env) },
  { method: 'POST', pattern: '/api/categories', handler: createCategory },
  { method: 'PATCH', pattern: '/api/categories/:id', handler: updateCategory },
  { method: 'DELETE', pattern: '/api/categories/:id', handler: deleteCategory },

  { method: 'GET', pattern: '/api/transactions', handler: listTransactions },
  { method: 'POST', pattern: '/api/transactions', handler: createTransaction },
  { method: 'GET', pattern: '/api/transactions/:id', handler: getTransaction },
  { method: 'PATCH', pattern: '/api/transactions/:id', handler: updateTransaction },
  { method: 'DELETE', pattern: '/api/transactions/:id', handler: deleteTransaction },

  { method: 'GET', pattern: '/api/budgets', handler: listBudgets },
  { method: 'POST', pattern: '/api/budgets', handler: upsertBudget },
  { method: 'DELETE', pattern: '/api/budgets/:id', handler: deleteBudget },

  { method: 'GET', pattern: '/api/settings', handler: ({ env }) => getSettings(env) },
  { method: 'PUT', pattern: '/api/settings', handler: updateSettings },

  { method: 'GET', pattern: '/api/dashboard', handler: getDashboard },
  { method: 'GET', pattern: '/api/report/week', handler: getWeekReport },
  { method: 'GET', pattern: '/api/report/month', handler: getMonthReport },
];

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

async function handleApi(request: Request, url: URL, env: Env): Promise<Response> {
  await ensureSchema(env.DB);

  if (!isSameOriginRequest(request, env)) {
    return json({ error: 'Cross-origin request rejected' }, 403);
  }

  let matchedPattern = false;
  for (const route of ROUTES) {
    const params = matchRoute(route.pattern, url.pathname);
    if (!params) continue;
    if (route.method !== request.method) {
      matchedPattern = true;
      continue;
    }
    if (route.auth !== false) {
      const denied = await requireSession(request, env);
      if (denied) return denied;
    }
    try {
      return await route.handler({ req: request, env, url, params });
    } catch (err) {
      console.error('handler error', url.pathname, err);
      return json({ error: 'Internal server error' }, 500);
    }
  }

  return matchedPattern
    ? apiError(`Method ${request.method} not allowed`, 405)
    : apiError('Not found', 404);
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      const asset = await env.ASSETS.fetch(request);
      return withSecurityHeaders(asset);
    }

    try {
      const res = await handleApi(request, url, env);
      return withSecurityHeaders(res);
    } catch (err) {
      console.error('api error', url.pathname, err);
      return withSecurityHeaders(json({ error: 'Internal server error' }, 500));
    }
  },
};