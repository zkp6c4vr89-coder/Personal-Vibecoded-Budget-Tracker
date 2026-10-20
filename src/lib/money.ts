import type { Currency } from './types';

/** "RM 1,234.50" for MYR, "$1,234.50" for USD. `minor` is cents. */
export function money(minor: number, currency: Currency = 'MYR'): string {
  const value = (minor ?? 0) / 100;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = value < 0 ? '-' : '';
  return currency === 'USD' ? `${sign}$${formatted}` : `${sign}RM ${formatted}`;
}

/** Signed amount with an explicit +/- prefix, for list rows. */
export function signedMoney(minor: number, type: string, currency: Currency = 'MYR'): string {
  if (type === 'income') return `+${money(minor, currency)}`;
  if (type === 'expense') return `-${money(minor, currency)}`;
  return money(minor, currency);
}

/** "12.5" / "12.50" / "1,234" → 1250 / 1250 / 123400 */
export function parseAmount(input: string): number {
  const cleaned = (input || '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function formatRate(rate: number): string {
  return rate.toLocaleString('en-US', { maximumFractionDigits: 4 });
}