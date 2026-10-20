import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/*
 * One snackbar host for the whole app: success messages ("Saved"), errors, and
 * action toasts (the transaction Undo bar). Kept outside the router so a toast
 * survives navigation that happens right after a save.
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  message: string;
  tone?: 'default' | 'success' | 'danger';
  /** Optional inline action, e.g. Undo. */
  action?: ToastAction;
  /** ms on screen; defaults to 3.2s, or 6s when an action is offered. */
  duration?: number;
}

type Show = (input: string | ToastInput) => void;

const ToastContext = createContext<Show>(() => {});

export function useToast(): Show {
  return useContext(ToastContext);
}

interface ActiveToast extends ToastInput {
  id: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const show = useCallback<Show>(
    (input) => {
      const base: ToastInput = typeof input === 'string' ? { message: input } : input;
      const next: ActiveToast = { ...base, id: Date.now() + Math.random() };
      clear();
      setToast(next);
      timer.current = window.setTimeout(
        () => setToast((t) => (t && t.id === next.id ? null : t)),
        next.duration ?? (next.action ? 6000 : 3200),
      );
    },
    [clear],
  );

  useEffect(() => clear, [clear]);

  const dismiss = () => {
    clear();
    setToast(null);
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-50 flex justify-center px-4"
        aria-live="polite"
        aria-atomic="true"
      >
        {toast && (
          <div
            key={toast.id}
            className={`toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === 'danger'
                ? 'bg-rose-600 text-white'
                : toast.tone === 'success'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
            }`}
          >
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  dismiss();
                }}
                className="-mr-2 min-h-11 shrink-0 rounded-xl px-3 font-semibold uppercase tracking-wide text-emerald-300 active:bg-white/10 dark:text-emerald-600"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss notification"
              className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full opacity-70 active:bg-white/10"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
