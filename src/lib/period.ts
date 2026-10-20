/*
 * Pure ISO-date helpers (YYYY-MM-DD strings, no time zones involved).
 * Weeks run Monday -> Sunday everywhere in the app.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

export function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function todayISO(): string {
  return toISO(new Date());
}

/** Monday of the week containing `iso` (Mon-Sun weeks). */
export function mondayOf(iso: string): string {
  const d = fromISO(iso);
  const dow = d.getUTCDay(); // 0=Sun .. 6=Sat
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return toISO(d);
}

export function weekRange(iso: string): { start: string; end: string } {
  const start = mondayOf(iso);
  return { start, end: addDays(start, 6) };
}

export function shiftWeeks(iso: string, n: number): string {
  return addDays(iso, 7 * n);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { start, end };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "Mon 12 Oct 2026" style short date. */
export function shortDate(iso: string): string {
  const d = fromISO(iso);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${names[d.getUTCDay()]} ${ordinal(d.getUTCDate())} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "12 Oct" */
export function dayMonth(iso: string): string {
  const d = fromISO(iso);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function weekdayShort(iso: string): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names[fromISO(iso).getUTCDay()];
}

/** Week label: "12 – 18 Oct 2026" or "28 Sep – 4 Oct 2026" for cross-month ranges. */
export function weekLabel(start: string, end: string): string {
  const a = fromISO(start);
  const b = fromISO(end);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  if (sameMonth) {
    return `${ordinal(a.getUTCDate())} – ${ordinal(b.getUTCDate())} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  }
  const left = `${dayMonth(start)}`;
  const right = `${dayMonth(end)} ${b.getUTCFullYear()}`;
  return `${left} – ${right}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthLabelShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

/** Human day-heading for grouped lists: "Today", "Yesterday" or "Mon 12 Oct 2026". */
export function dayHeading(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return shortDate(iso);
}

/** Compact day label for dense rows: "Today", "Yesterday" or "18 Oct". */
export function dayHeadingShort(iso: string, today: string): string {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  return dayMonth(iso);
}

export function isValidISO(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromISO(s).getTime());
}

export function isValidMonth(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}