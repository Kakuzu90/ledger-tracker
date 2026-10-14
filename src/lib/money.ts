/**
 * Money is an integer number of centavos everywhere in the app.
 * Nothing here ever produces a float amount.
 */

import type { Centavos } from '@/db/types'

export const DEFAULT_CURRENCY = 'PHP'
export const DEFAULT_LOCALE = 'en-PH'

const formatters = new Map<string, Intl.NumberFormat>()

function formatter(currency: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${currency}|${JSON.stringify(options)}`
  let found = formatters.get(key)
  if (!found) {
    found = new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency, ...options })
    formatters.set(key, found)
  }
  return found
}

export interface FormatMoneyOptions {
  currency?: string
  /** Drop the centavos when the amount is whole (list rows do this). */
  compact?: boolean
  /** Always show a leading + or − (true minus sign, as in the mockups). */
  signed?: boolean
}

/** `formatMoney(-28900)` → `"−₱289.00"` */
export function formatMoney(amount: Centavos, options: FormatMoneyOptions = {}): string {
  const { currency = DEFAULT_CURRENCY, compact = false, signed = false } = options
  const whole = Math.abs(amount) % 100 === 0
  const digits = compact && whole ? 0 : 2

  const body = formatter(currency, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    // We render the sign ourselves so it is the typographic minus.
    signDisplay: 'never',
  }).format(Math.abs(amount) / 100)

  if (amount < 0) return `−${body}`
  return signed ? `+${body}` : body
}

/** Centavos as a bare number, no currency symbol. */
export function formatAmount(amount: Centavos): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100)
}

/**
 * Parses keypad / text input into centavos. Accepts grouping separators and a
 * currency symbol. Returns null when the input is not a number.
 *
 * The digits are read as strings — `Number(x) * 100` would round 0.145 down to
 * 14 centavos, and float money is exactly what the data rules rule out.
 */
export function parseMoney(input: string): Centavos | null {
  const cleaned = input.replace(/[^\d.-]/g, '')
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned)
  if (!match) return null

  const [, sign, whole = '', fraction = ''] = match
  if (whole === '' && fraction === '') return null

  const centavos = `${fraction}00`.slice(0, 2)
  // Third decimal decides the rounding; anything beyond it cannot change it.
  const roundUp = (fraction[2] ?? '0') >= '5'
  const value = Number(`${whole || '0'}${centavos}`) + (roundUp ? 1 : 0)

  return sign === '-' ? -value : value
}

/** Splits `amount` into `parts` shares that sum back exactly (bill splitting). */
export function splitEvenly(amount: Centavos, parts: number): Centavos[] {
  if (parts < 1) throw new RangeError('parts must be at least 1')
  const base = Math.trunc(amount / parts)
  const remainder = amount - base * parts
  const step = remainder < 0 ? -1 : 1
  return Array.from({ length: parts }, (_, i) =>
    i < Math.abs(remainder) ? base + step : base,
  )
}
