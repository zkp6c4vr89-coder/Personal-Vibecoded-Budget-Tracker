import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './icons';

/*
 * Tab bar: one outline icon set at 24px inside 44x44 targets, with the active
 * tab shown as colour + a filled glyph.
 *
 * Layout is a strict 5-column grid (repeat(5, 1fr)): Home and List on the left,
 * Reports and Budgets on the right, and the docked "+" FAB in the middle column.
 * Equal columns keep the four tabs symmetric and put the FAB dead-centre on the
 * viewport — no space-between, no manual margins. Settings lives in the header
 * gear instead of the bar, so the tabs balance 2 + 2 around the FAB.
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

  const [left, right] = [items.slice(0, 2), items.slice(2)];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur dark:border-slate-800 dark:bg-[#0f172a]/95">
      <div className="mx-auto grid max-w-2xl grid-cols-[repeat(5,minmax(0,1fr))] items-center">
        {left.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        {/* Middle column: the FAB is centred on the viewport because all five
            columns are equal width. */}
        <div className="flex h-16 items-center justify-center">
          <button
            type="button"
            onClick={() => navigate('/add')}
            aria-label="Add transaction"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition active:scale-95"
          >
            <Icon name="plus" size={28} strokeWidth={2.5} />
          </button>
        </div>

        {right.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
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
        `flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
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
