import { money } from '../lib/money';
import { CHART_COLORS } from '../lib/palette';

export { CHART_COLORS } from '../lib/palette';

export interface Slice {
  name: string;
  value: number;
  /** Category id, so a tap can deep-link into a filtered list. */
  id?: string | null;
}

interface Segment extends Slice {
  color: string;
  dash: string;
  offset: number;
  pct: number;
}

/**
 * Donut chart of spending by category. Pure SVG, no chart library.
 * Segments and legend rows are tappable when `onSelect` is given, so a
 * category can be opened in the transaction list.
 */
export function Donut({
  data,
  size = 168,
  onSelect,
  renderIcon,
}: {
  data: Slice[];
  size?: number;
  onSelect?: (slice: Slice) => void;
  renderIcon?: (slice: Slice) => React.ReactNode;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const stroke = size * 0.12;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <div
          className="rounded-full border-[14px] border-slate-200 dark:border-slate-800"
          style={{ width: size, height: size }}
        />
        <p className="mt-2 text-xs text-slate-500">No spending yet</p>
      </div>
    );
  }

  let offset = 0;
  const segments: Segment[] = data.map((d, i) => {
    const len = (d.value / total) * c;
    const seg: Segment = {
      ...d,
      color: CHART_COLORS[i % CHART_COLORS.length],
      dash: `${Math.max(len - 1.5, 0)} ${c - Math.max(len - 1.5, 0)}`,
      offset: -offset,
      pct: (d.value / total) * 100,
    };
    offset += len;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Spending by category">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-800" />
            {segments.map((s, i) => (
              <circle
                key={`${s.id ?? s.name}-${i}`}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={s.dash}
                strokeDashoffset={s.offset}
                className={onSelect ? 'cursor-pointer transition-opacity hover:opacity-80' : undefined}
                onClick={
                  onSelect
                    ? (e) => {
                        e.stopPropagation();
                        onSelect(s);
                      }
                    : undefined
                }
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={
                  onSelect
                    ? `${s.name}: ${money(s.value)}, ${s.pct.toFixed(0)} percent. Open in list.`
                    : undefined
                }
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(s);
                        }
                      }
                    : undefined
                }
              />
            ))}
          </g>
          <text
            x="50%"
            y="47%"
            textAnchor="middle"
            className="fill-slate-400"
            style={{ fontSize: size * 0.085 }}
          >
            Total
          </text>
          <text
            x="50%"
            y="60%"
            textAnchor="middle"
            className="fill-slate-900 dark:fill-white"
            style={{ fontSize: size * 0.1, fontWeight: 700 }}
          >
            {money(total)}
          </text>
        </svg>
      </div>

      <ul className="w-full min-w-0 space-y-1">
        {segments.map((s, i) => {
          const rowClass = `grid w-full grid-cols-[auto_1fr_3rem_5.5rem] items-center gap-2 rounded-lg px-1.5 py-2 text-sm text-left ${
            onSelect ? 'active:bg-slate-100 dark:active:bg-slate-800' : ''
          }`;
          const content = (
            <>
              <span className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                {renderIcon?.(s)}
              </span>
              <span className="min-w-0 truncate">{s.name}</span>
              <span className="text-right tabular-nums text-slate-600 dark:text-slate-300">
                {s.pct.toFixed(0)}%
              </span>
              <span className="text-right font-semibold tabular-nums">{money(s.value)}</span>
            </>
          );
          return (
            <li key={`${s.id ?? s.name}-${i}`}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(s)} className={rowClass}>
                  {content}
                </button>
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface Bar {
  label: string;
  value: number;
  highlight?: boolean;
  key?: string;
}

/** Horizontal-scroll-free column chart for weekly spend history. */
export function Bars({ data, height = 132 }: { data: Bar[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const showEvery = data.length > 10 ? 2 : 1;

  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          const h = d.value === 0 ? 2 : Math.max(4, (d.value / max) * height);
          return (
            <div key={d.key ?? d.label + i} className="group relative flex flex-1 flex-col justify-end">
              <div
                className={`w-full rounded-t-md transition-all ${
                  d.highlight ? 'bg-emerald-500' : 'bg-emerald-500/50 group-hover:bg-emerald-400'
                }`}
                style={{ height: `${h}px` }}
                title={`${d.label}: ${money(d.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => (
          <div
            key={`l-${d.key ?? d.label + i}`}
            className={`flex-1 truncate text-center text-[9px] tabular-nums ${
              d.highlight ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
            }`}
          >
            {i % showEvery === 0 ? d.label : ''}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Plain horizontal bar used for category breakdowns and budget rows. */
export function HBar({ pct, color = '#10b981' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }}
      />
    </div>
  );
}