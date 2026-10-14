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

/** Sums centavos. Integer in, integer out. */
export function sumMoney(amounts: readonly Centavos[]): Centavos {
  return amounts.reduce((total, amount) => total + amount, 0)
}

/**
 * Chart axes and tiles where the full number would not fit: `₱31.5k`.
 * Rounds toward zero so a short label never overstates an amount.
 */
export function formatMoneyShort(amount: Centavos, currency = DEFAULT_CURRENCY): string {
  const pesos = Math.abs(amount) / 100
  const sign = amount < 0 ? '−' : ''
  const symbol = currencySymbol(currency)

  const [value, suffix] =
    pesos >= 1_000_000
      ? [pesos / 1_000_000, 'M']
      : pesos >= 1_000
        ? [pesos / 1_000, 'k']
        : [pesos, '']

  // One decimal below 100 of a unit, none above — "₱1.2M", "₱426k".
  const digits = suffix !== '' && value < 100 ? 1 : 0
  const truncated = Math.trunc(value * 10 ** digits) / 10 ** digits
  const body = new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(truncated)

  return `${sign}${symbol}${body}${suffix}`
}

function currencySymbol(currency: string): string {
  const parts = formatter(currency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    signDisplay: 'never',
  }).formatToParts(0)
  return parts.find((part) => part.type === 'currency')?.value ?? ''
}

/** Replaces an amount when "hide amounts" is on. */
export const HIDDEN_AMOUNT = '••••'

/**
 * `0.79` → `"79%"`. Ratios are rounded for display only; budget maths stays
 * in centavos.
 */
export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '—'
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio)
}

/** Period-on-period change for the reports list: `"+12%"`, `"−8%"`, `"new"`. */
export function formatPercentDelta(current: Centavos, previous: Centavos): string {
  if (previous === 0) return current === 0 ? '0%' : 'new'
  const change = (current - previous) / Math.abs(previous)
  const rounded = Math.round(change * 100)
  if (rounded === 0) return '0%'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`
}

/** `ratio(31_480_00, 40_000_00)` → `0.787`. Zero limit gives 0, not Infinity. */
export function ratio(part: Centavos, whole: Centavos): number {
  if (whole === 0) return 0
  return part / whole
}

/**
 * Splits `total` in the given proportions, to the centavo, with the parts
 * summing back to `total` exactly — largest remainder gets the odd centavos.
 * Used for uneven bill splits and for proportional sample data.
 */
export function allocateByWeight(
  total: Centavos,
  weights: readonly number[],
): Centavos[] {
  if (weights.length === 0) return []
  if (weights.some((w) => w < 0)) throw new RangeError('weights must not be negative')

  const totalWeight = weights.reduce((a, b) => a + b, 0)
  if (totalWeight === 0) return splitEvenly(total, weights.length)

  const exact = weights.map((w) => (total * w) / totalWeight)
  const parts = exact.map((value) => Math.trunc(value))
  let remainder = total - parts.reduce((a, b) => a + b, 0)

  // Hand out the leftover centavos to the largest fractions first.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.trunc(value) }))
    .sort((a, b) => b.fraction - a.fraction)

  const step = remainder < 0 ? -1 : 1
  for (let i = 0; remainder !== 0; i++) {
    const slot = order[i % order.length]
    if (slot === undefined) break
    parts[slot.index] += step
    remainder -= step
  }

  return parts
}
