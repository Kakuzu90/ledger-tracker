import { describe, expect, it } from 'vitest'
import { escapeCsv, toCsv } from './csv'

describe('escapeCsv', () => {
  it('leaves a plain value alone', () => {
    expect(escapeCsv('Lunch')).toBe('Lunch')
    expect(escapeCsv(289)).toBe('289')
  })

  it('quotes a value containing a comma', () => {
    expect(escapeCsv('Lunch, with team')).toBe('"Lunch, with team"')
  })

  it('doubles embedded quotes', () => {
    expect(escapeCsv('He said "hi"')).toBe('"He said ""hi"""')
  })

  it('quotes a value spanning lines', () => {
    expect(escapeCsv('one\ntwo')).toBe('"one\ntwo"')
  })

  it('writes nothing for null and undefined', () => {
    expect(escapeCsv(null)).toBe('')
    expect(escapeCsv(undefined)).toBe('')
  })
})

describe('toCsv', () => {
  it('writes a header and rows separated by CRLF', () => {
    const csv = toCsv(
      ['date', 'note', 'amount'],
      [
        ['2026-10-14', 'Lunch with team', '-289.00'],
        ['2026-10-13', 'SM Supermarket, Makati', '-2145.00'],
      ],
    )

    expect(csv).toBe(
      'date,note,amount\r\n' +
        '2026-10-14,Lunch with team,-289.00\r\n' +
        '2026-10-13,"SM Supermarket, Makati",-2145.00',
    )
  })

  it('writes just the header for no rows', () => {
    expect(toCsv(['date'], [])).toBe('date')
  })
})
