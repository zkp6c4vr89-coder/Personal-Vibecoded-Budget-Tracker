import { useEffect, type ReactNode } from 'react';

export function PageHeader({
  title,
  back,
  right,
}: {
  title: string;
  back?: () => void;
  right?: ReactNode;
}) {
  return (
    // Opaque + fixed height: the old translucent, blur-backed header ghosted
    // content underneath while scrolling.
    <header className="sticky top-0 z-20 -mx-4 mb-3 flex h-16 items-center gap-2 border-b border-slate-200 bg-slate-100 px-4 dark:border-slate-800 dark:bg-[#0b1220]">
      {back && (
        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-slate-700 active:bg-slate-200 dark:text-slate-200 dark:active:bg-slate-800"
        >
          ‹
        </button>
      )}
      <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
      {right}
    </header>
  );
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const base =
    'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/60';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} block w-full p-4 text-left active:opacity-90 ${className}`}
      >
        {children}
      </button>
    );
  }
  return <div className={`${base} p-4 ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  loading,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const styles = {
    primary:
      'bg-emerald-600 text-white hover:bg-emerald-500 disabled:bg-emerald-600/50',
    outline:
      'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
    ghost: 'text-slate-600 dark:text-slate-300',
    danger: 'bg-rose-600 text-white hover:bg-rose-500',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[0.99] disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

/** Shimmering placeholder used while a screen's first payload loads. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`skel block ${className}`} aria-hidden />;
}

/** Skeleton stand-in for a list of cards while data loads. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="mt-3 h-5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 font-semibold">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
      <p className="font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      {body && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="sheet-in relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 pb-8 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:max-w-md sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-500 active:bg-slate-100 dark:active:bg-slate-800"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Tap-friendly horizontal chip row. */
export function Chip({
  active,
  onClick,
  children,
  tone = 'default',
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  const activeStyles =
    tone === 'danger'
      ? 'border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
      : 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95 ${
        active
          ? activeStyles
          : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

export function ProgressBar({ pct, warn }: { pct: number; warn?: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const over = pct >= 100;
  const near = !over && pct >= 70;
  const color = over ? 'bg-rose-500' : near || warn ? 'bg-amber-500' : 'bg-emerald-500';
  // Anything spent at all stays visible, however small the percentage.
  const width = pct > 0 && clamped < 2 ? 2 : clamped;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-200 ease-out ${color}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}