import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './icons';

/*
 * Tab bar: one outline icon set at 24px inside 44x44 targets, with the active
 * tab shown as colour + a filled glyph. The "+" is docked inside the bar (no
 * negative margin), so it can no longer overlap page content.
 */

interface Item {
  to: string;
  label: string;
  icon: IconName;
}

const items: Item[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/transactions', label: 'List', icon: 'receipt' },
  { to: '/reports', label: 'Reports', icon: 'chart' },
  { to: '/budgets', label: 'Budgets', icon: 'target' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Full-screen add/edit flow hides the nav to keep taps focused.
  if (pathname.startsWith('/add')) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur dark:border-slate-800 dark:bg-[#0f172a]/95">
      <div className="mx-auto flex h-16 max-w-2xl items-stretch">
        {items.slice(0, 2).map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => navigate('/add')}
            aria-label="Add transaction"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition active:scale-95"
          >
            <Icon name="plus" size={28} strokeWidth={2.5} />
          </button>
        </div>

        {items.slice(2).map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <NavItem to="/settings" label="Settings" icon="sliders" />
      </div>
    </nav>
  );
}

function NavItem({ to, label, icon }: Item) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex w-[64px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
          isActive
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-slate-600 dark:text-slate-400'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="flex h-11 w-11 items-center justify-center">
            <Icon name={icon} size={24} solid={isActive} strokeWidth={isActive ? 2 : 1.75} />
          </span>
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}
