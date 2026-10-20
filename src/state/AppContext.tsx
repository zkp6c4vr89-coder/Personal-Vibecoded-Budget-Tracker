import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../lib/api';
import type { Account, Bootstrap, Budget, Category, Settings } from '../lib/types';

interface AppValue {
  booting: boolean;
  authed: boolean;
  data: Bootstrap | null;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  accounts: Account[]; // active accounts only
  allAccounts: Account[];
  categories: Category[]; // active categories only
  allCategories: Category[];
  budgets: Budget[];
  settings: Settings;
}

const defaultValue: AppValue = {
  booting: true,
  authed: false,
  data: null,
  login: async () => {},
  logout: async () => {},
  reload: async () => {},
  accounts: [],
  allAccounts: [],
  categories: [],
  allCategories: [],
  budgets: [],
  settings: { usd_myr_rate: 0 },
};

const AppContext = createContext<AppValue>(defaultValue);

export function AppProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<Bootstrap | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await api.get<Bootstrap>('/api/bootstrap');
      setData(result);
      setAuthed(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setData(null);
        setAuthed(false);
      }
      throw err;
    }
  }, []);

  const login = useCallback(
    async (password: string) => {
      await api.post('/api/login', { password });
      await reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/api/logout');
    } finally {
      setData(null);
      setAuthed(false);
    }
  }, []);

  // Initial session probe.
  useEffect(() => {
    reload()
      .catch(() => {
        /* 401 handled by state flags; other errors surface on submit */
      })
      .finally(() => setBooting(false));
  }, [reload]);

  // A protected call returned 401 → drop back to the login screen.
  useEffect(() => {
    const onExpired = () => {
      setData(null);
      setAuthed(false);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const value = useMemo<AppValue>(() => {
    const allAccounts = data?.accounts ?? [];
    const allCategories = data?.categories ?? [];
    return {
      booting,
      authed,
      data,
      login,
      logout,
      reload,
      accounts: allAccounts.filter((a) => !a.archived),
      allAccounts,
      categories: allCategories.filter((c) => !c.archived),
      allCategories,
      budgets: data?.budgets ?? [],
      settings: data?.settings ?? { usd_myr_rate: 0 },
    };
  }, [booting, authed, data, login, logout, reload]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  return useContext(AppContext);
}