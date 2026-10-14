import { describe, expect, it } from 'vitest'
import {
  allocateByWeight,
  formatAmount,
  formatMoney,
  formatMoneyShort,
  formatPercent,
  formatPercentDelta,
  parseMoney,
  ratio,
  splitEvenly,
  sumMoney,
} from './money'

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

describe('sumMoney', () => {
  it('adds centavos', () => {
    expect(sumMoney([28900, 21400, -1000])).toBe(49300)
  })

  it('is zero for nothing', () => {
    expect(sumMoney([])).toBe(0)
  })
})

describe('formatMoneyShort', () => {
  it.each([
    [31_480_00, '₱31.4k'],
    [426_178_00, '₱426k'],
    [1_250_000_00, '₱1.2M'],
    [84_900, '₱849'],
    [-20_480_00, '\u2212₱20.4k'],
  ])('shortens %i', (amount, expected) => {
    expect(formatMoneyShort(amount)).toBe(expected)
  })

  it('truncates rather than rounding up, so a label never overstates', () => {
    // 31,999.99 is not "₱32.0k" — that would read as more money than there is.
    expect(formatMoneyShort(31_999_99)).toBe('₱31.9k')
  })
})

describe('formatPercent', () => {
  it('rounds to whole percent by default', () => {
    expect(formatPercent(0.787)).toBe('79%')
  })

  it('takes a digit count', () => {
    expect(formatPercent(0.787, 1)).toBe('78.7%')
  })

  it('renders an em dash for a non-finite ratio', () => {
    expect(formatPercent(Number.NaN)).toBe('—')
  })
})

describe('formatPercentDelta', () => {
  it.each([
    [8_940_00, 7_982_00, '+12%'],
    [6_600_00, 7_174_00, '\u22128%'],
    [1000, 1000, '0%'],
    [500, 0, 'new'],
    [0, 0, '0%'],
  ])('compares %i to %i', (current, previous, expected) => {
    expect(formatPercentDelta(current, previous)).toBe(expected)
  })
})

describe('ratio', () => {
  it('divides', () => {
    expect(ratio(31_480_00, 40_000_00)).toBeCloseTo(0.787)
  })

  it('treats a zero whole as zero, not Infinity', () => {
    expect(ratio(500, 0)).toBe(0)
  })
})

describe('allocateByWeight', () => {
  it('splits in proportion and sums back exactly', () => {
    const parts = allocateByWeight(10_000_00, [1, 2, 3])
    expect(parts).toEqual([166_667, 333_333, 500_000])
    expect(sumMoney(parts)).toBe(10_000_00)
  })

  it('falls back to an even split when every weight is zero', () => {
    expect(allocateByWeight(1000, [0, 0, 0])).toEqual([334, 333, 333])
  })

  it('handles a single weight', () => {
    expect(allocateByWeight(4321, [7])).toEqual([4321])
  })

  it('returns nothing for no weights', () => {
    expect(allocateByWeight(1000, [])).toEqual([])
  })

  it('rejects negative weights', () => {
    expect(() => allocateByWeight(1000, [1, -1])).toThrow(RangeError)
  })

  it('keeps the sum exact for a negative total', () => {
    expect(sumMoney(allocateByWeight(-10_000, [1, 2, 3]))).toBe(-10_000)
  })
})
