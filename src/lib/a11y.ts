import { dayHeadingShort } from './period';
import type { Transaction } from './types';

/*
 * Screen-reader phrasing. Money reads as "4 ringgit 50" / "12 dollars 5", and
 * transaction rows announce direction in words so colour is never the only cue.
 */

export function amountSpeech(minor: number, currency: 'MYR' | 'USD' = 'MYR'): string {
  const value = Math.abs(minor ?? 0) / 100;
  const unit = currency === 'USD' ? 'dollars' : 'ringgit';
  const whole = Math.floor(value);
  const cents = Math.round((value - whole) * 100);
  const wholeStr = whole.toLocaleString('en-US');
  if (cents === 0) return `${wholeStr} ${unit}`;
  return `${wholeStr} ${unit} ${cents}`;
}

/** "Laundry, expense, minus 4 ringgit 50" — used on rows and delete buttons. */
export function txSpeech(tx: Transaction): string {
  const label = tx.note || tx.category_name || (tx.type === 'transfer' ? 'Transfer' : tx.type);
  const kind =
    tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : 'transfer between accounts';
  const direction = tx.type === 'income' ? 'plus' : tx.type === 'expense' ? 'minus' : '';
  const amount = amountSpeech(tx.amount_minor, tx.account_currency ?? 'MYR');
  return `${label}, ${kind}, ${direction} ${amount}`.replace(/\s+/g, ' ').trim();
}

/** Full row announcement including when it happened. */
export function txSpeechWithDate(tx: Transaction, today: string): string {
  return `${txSpeech(tx)}, ${dayHeadingShort(tx.occurred_on, today)}`;
}
