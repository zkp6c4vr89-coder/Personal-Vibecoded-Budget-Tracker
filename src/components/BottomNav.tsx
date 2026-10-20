import { NavLink, useLocation, useNavigate } from 'react-router-dom';

const items = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/transactions', label: 'List', icon: '☰' },
  { to: '/reports', label: 'Reports', icon: '▤' },
  { to: '/budgets', label: 'Budgets', icon: '◧' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Full-screen add/edit flow hides the nav to keep taps focused.
  if (pathname.startsWith('/add')) return null;

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-[#0f172a]/95">
      <div className="mx-auto flex h-16 max-w-2xl items-stretch">
        {items.slice(0, 2).map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => navigate('/add')}
            aria-label="Add transaction"
            className="-mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-3xl font-light text-white shadow-lg shadow-emerald-600/30 transition active:scale-95"
          >
            +
          </button>
        </div>

        {items.slice(2).map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex w-[68px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              isActive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`
          }
        >
          <span className="text-lg leading-none">⚙</span>
          <span>Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex w-[68px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
          isActive
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-slate-500 dark:text-slate-400'
        }`
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}