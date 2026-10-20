import type { ReactNode, SVGProps } from 'react';
import { CHART_COLORS } from './charts';

/*
 * One outline icon set (Lucide-style, 24px grid, 1.75 stroke) so every tab,
 * action and category reads as the same family. Nav icons also have a solid
 * variant for the active state, which pairs colour + a filled glyph.
 */

const outline = {
  /* tabs */
  home: (
    <>
      <path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8.5h6M9 12.5h6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7.5h16M4 16.5h16" />
      <circle cx="9" cy="7.5" r="2.6" />
      <circle cx="15.5" cy="16.5" r="2.6" />
    </>
  ),
  /* actions */
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 4.5V10H15" />
    </>
  ),
  filter: <path d="M4 5.5h16l-6.3 7.5V19l-3.4-2v-4.5z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  check: <path d="M5 12.5 9.8 17.3 19 7.5" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronUp: <path d="M5 15l7-7 7 7" />,
  chevronDown: <path d="M5 9l7 7 7-7" />,
  trash: (
    <>
      <path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="M6.6 7l.8 12a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9l.8-12" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4L19.4 8.6a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  upload: <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19.5h14" />,
  calendar: (
    <>
      <path d="M5 6.5h14v13H5z" />
      <path d="M5 10.5h14M9 4.5v4M15 4.5v4" />
    </>
  ),
  tag: (
    <>
      <path d="M4 11.6 11.6 4H20v8.4L12.4 20z" />
      <circle cx="16.2" cy="7.8" r="1.3" />
    </>
  ),
  wallet: (
    <>
      <path d="M3.5 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2z" />
      <path d="M16 10.5h4.5v3H16a1.5 1.5 0 0 1 0-3" />
    </>
  ),
  undo: (
    <>
      <path d="M8 6.5 3.5 11 8 15.5" />
      <path d="M3.5 11H14a5 5 0 0 1 0 10h-2.5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5M12 16.3h.01" />
    </>
  ),
  transfer: (
    <>
      <path d="M7.5 4.5 4 8l3.5 3.5M4 8h16" />
      <path d="M16.5 19.5 20 16l-3.5-3.5M20 16H4" />
    </>
  ),
  /* income / expense cues (secondary to the +/- sign and colour) */
  trendUp: (
    <>
      <path d="M4 16l5-5 3.5 3.5L20 7" />
      <path d="M15.5 7H20v4.5" />
    </>
  ),
  trendDown: (
    <>
      <path d="M4 8l5 5 3.5-3.5L20 17" />
      <path d="M15.5 17H20v-4.5" />
    </>
  ),
  /* appearance */
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20 14.6A8.6 8.6 0 0 1 9.4 4 8.6 8.6 0 1 0 20 14.6" />,
  monitor: (
    <>
      <path d="M3.5 5.5h17v11h-17z" />
      <path d="M9 20.5h6M12 16.5v4" />
    </>
  ),
  /* categories */
  utensils: (
    <>
      <path d="M7 3.5v5a2 2 0 0 0 4 0v-5" />
      <path d="M9 10.5v10" />
      <path d="M16.5 3.5c1.8 2 1.8 6.5 0 8.5v8.5" />
    </>
  ),
  bus: (
    <>
      <path d="M5 5.5h14v10.5H5z" />
      <path d="M5 11h14M7.5 16v2.5M16.5 16v2.5" />
      <path d="M7.8 8.2h.01M16.2 8.2h.01" />
    </>
  ),
  zap: <path d="M13 3 5.5 13.5H11L10.5 21 18.5 10.5H13z" />,
  bag: (
    <>
      <path d="M5.8 8h12.4l-1 12.5H6.8z" />
      <path d="M9 8V6.6a3 3 0 0 1 6 0V8" />
    </>
  ),
  film: (
    <>
      <path d="M4 5.5h16v13H4z" />
      <path d="M10.5 9.5 15 12l-4.5 2.5z" />
    </>
  ),
  cap: (
    <>
      <path d="M2.5 9 12 5l9.5 4-9.5 4z" />
      <path d="M6.5 11v4.4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V11" />
    </>
  ),
  dots: <path d="M7 12h.01M12 12h.01M17 12h.01" />,
  heart: (
    <path d="M12 20s-7-4.3-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6c0 5.1-7 9.4-7 9.4z" />
  ),
  shield: <path d="M12 3.5 5 6v5.6c0 4.2 3 7.3 7 8.9 4-1.6 7-4.7 7-8.9V6z" />,
  briefcase: (
    <>
      <path d="M4 8.5h16v11H4z" />
      <path d="M9 8.5V6.6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.9" />
      <path d="M4 13h16" />
    </>
  ),
  banknote: (
    <>
      <path d="M3.5 7.5h17v9h-17z" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M6.5 10.5h.01M17.5 13.5h.01" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.2" r="3.2" />
      <path d="M3.5 19.5c0-3 2.4-5.2 5.5-5.2s5.5 2.2 5.5 5.2" />
      <path d="M16 5.4a3.2 3.2 0 0 1 0 6" />
      <path d="M17.2 14.6c1.9.7 3.3 2.4 3.3 4.6" />
    </>
  ),
  gift: (
    <>
      <path d="M4.5 12.5h15V21h-15z" />
      <path d="M3.5 7.8h17v4.7h-17z" />
      <path d="M12 7.8V21" />
    </>
  ),
} satisfies Record<string, ReactNode>;

/* Solid variants for the active tab state (fill only, no stroke). */
const solid: Partial<Record<keyof typeof outline, ReactNode>> = {
  home: <path d="M12 3 2.5 11.2V20.8H9.4V15.4H14.6V20.8H21.5V11.2z" />,
  receipt: (
    <path
      fillRule="evenodd"
      d="M6 3h12v18l-3-2-3 2-3-2-3 2zM8.4 8h7.2v1.7H8.4zm0 3.6h7.2v1.7H8.4zm0 3.6h4.8v1.7H8.4z"
    />
  ),
  chart: <path d="M4 4h1.9v16H4zm4.2 6H10v10H8.2zm4.2-8H14v18h-1.6zm4.2 4h1.8v14h-1.8z" />,
  target: (
    <path
      fillRule="evenodd"
      d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 3.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8m0 3.6a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6"
    />
  ),
  sliders: (
    <path d="M4 6.4h16v2.2H4zM4 15.4h16v2.2H4zM9 5a2.8 2.8 0 1 0 0 5.6A2.8 2.8 0 0 0 9 5m6.5 9a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6" />
  ),
};

export type IconName = keyof typeof outline;

const CATEGORY_ICONS: Record<string, IconName> = {
  food: 'utensils',
  transport: 'bus',
  bills: 'zap',
  shopping: 'bag',
  entertainment: 'film',
  education: 'cap',
  other: 'dots',
  health: 'heart',
  medical: 'heart',
  insurance: 'shield',
  salary: 'briefcase',
  allowance: 'banknote',
  family: 'users',
  gift: 'gift',
};

/** Stable colour per category name (falls back through the chart palette). */
export function categoryColor(name: string | null | undefined): string {
  const key = (name ?? '').toLowerCase();
  if (key === 'food') return CHART_COLORS[2];
  if (key === 'transport') return CHART_COLORS[1];
  if (key === 'bills') return CHART_COLORS[5];
  if (key === 'shopping') return CHART_COLORS[4];
  if (key === 'entertainment') return CHART_COLORS[9];
  if (key === 'education') return CHART_COLORS[8];
  if (key === 'other') return '#94a3b8';
  if (key === 'health' || key === 'medical') return '#f43f5e';
  if (key === 'insurance') return '#14b8a6';
  if (key === 'salary') return CHART_COLORS[0];
  if (key === 'allowance') return CHART_COLORS[6];
  if (key === 'family') return '#06b6d4';
  if (key === 'gift') return '#a855f7';
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CHART_COLORS[hash % CHART_COLORS.length];
}

/** Icon for a category name; unknown names get the generic tag. */
export function categoryIcon(name: string | null | undefined): IconName {
  return CATEGORY_ICONS[(name ?? '').toLowerCase()] ?? 'tag';
}

export function Icon({
  name,
  size = 24,
  solid: filled = false,
  strokeWidth = 1.75,
  className,
  ...rest
}: { name: IconName; size?: number; solid?: boolean; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  const solidGlyph = filled ? solid[name] : undefined;
  const glyphs = solidGlyph ?? outline[name];
  if (!glyphs) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={solidGlyph ? 'currentColor' : 'none'}
      stroke={solidGlyph ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
      {...rest}
    >
      {glyphs}
    </svg>
  );
}
