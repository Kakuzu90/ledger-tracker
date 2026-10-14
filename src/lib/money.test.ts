import { describe, expect, it } from 'vitest'
import { formatAmount, formatMoney, parseMoney, splitEvenly } from './money'

describe('formatMoney', () => {
  it('formats centavos with the currency symbol', () => {
    expect(formatMoney(28900)).toBe('₱289.00')
  })

  it('uses a typographic minus for negatives', () => {
    expect(formatMoney(-28900)).toBe('−₱289.00')
  })

  it('marks positives when asked', () => {
    expect(formatMoney(2600000, { signed: true })).toBe('+₱26,000.00')
  })

  it('drops centavos for whole amounts in compact mode', () => {
    expect(formatMoney(1500000, { compact: true })).toBe('₱15,000')
    expect(formatMoney(169900, { compact: true })).toBe('₱1,699')
    expect(formatMoney(28950, { compact: true })).toBe('₱289.50')
  })
})

describe('formatAmount', () => {
  it('renders without a currency symbol', () => {
    expect(formatAmount(6425000)).toBe('64,250.00')
  })
})

describe('parseMoney', () => {
  it.each([
    ['289', 28900],
    ['289.5', 28950],
    ['1,699.00', 169900],
    ['₱15,000', 1500000],
    ['-214', -21400],
  ])('parses %s', (input, expected) => {
    expect(parseMoney(input)).toBe(expected)
  })

  it('rounds to whole centavos without float drift', () => {
    // 0.145 * 100 is 14.499999999999998 in binary floating point.
    expect(parseMoney('0.145')).toBe(15)
    expect(parseMoney('0.144')).toBe(14)
    expect(parseMoney('1.005')).toBe(101)
  })

  it('pads a short fraction', () => {
    expect(parseMoney('12.3')).toBe(1230)
    expect(parseMoney('.5')).toBe(50)
  })

  it('returns null for non-numbers', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
  })
})

describe('splitEvenly', () => {
  it('distributes the remainder so the parts sum exactly', () => {
    const parts = splitEvenly(10000, 3)
    expect(parts).toEqual([3334, 3333, 3333])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000)
  })

  it('handles an exact division', () => {
    expect(splitEvenly(9000, 3)).toEqual([3000, 3000, 3000])
  })

  it('handles negative amounts', () => {
    const parts = splitEvenly(-10000, 3)
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-10000)
  })

  it('rejects a part count below one', () => {
    expect(() => splitEvenly(100, 0)).toThrow(RangeError)
  })
})
