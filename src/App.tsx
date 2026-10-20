import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import { ToastProvider } from './components/Toast';
import { Spinner } from './components/ui';
import Budgets from './pages/Budgets';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import AddTransaction from './pages/AddTransaction';
import Transactions from './pages/Transactions';
import { AppProvider, useApp } from './state/AppContext';

function Shell() {
  const { booting, authed } = useApp();
  const { pathname } = useLocation();

  if (booting) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="h-6 w-6 text-emerald-600" />
      </div>
    );
  }

  if (!authed) return <Login />;

  const pad = pathname.startsWith('/add') ? 'pb-6' : 'pb-nav';
  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-4 pt-4">
      <div className={pad}>
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/add" element={<AddTransaction />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </ToastProvider>
  );
}