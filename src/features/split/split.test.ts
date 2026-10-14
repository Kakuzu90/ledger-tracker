import { describe, expect, it } from 'vitest'
import { computeSplit, listNames, YOU, type Participant } from './split'

const people = (...names: string[]): Participant[] => [
  { key: YOU, name: 'You', included: true },
  ...names.map((name) => ({ key: name.toLowerCase(), name, included: true })),
]

const amounts = (total: number, participants: Participant[], method: Parameters<typeof computeSplit>[2]) =>
  computeSplit(total, participants, method).shares.map((share) => share.amount)

describe('equally', () => {
  it('splits the bill between everyone ticked, the payer included', () => {
    expect(amounts(4_800_00, people('Juan', 'Maria', 'Ana'), 'equally')).toEqual([
      1_200_00,
      1_200_00,
      1_200_00,
      1_200_00,
    ])
  })

  it('hands the odd centavos out rather than losing them', () => {
    const split = computeSplit(1_000_01, people('Juan', 'Maria'), 'equally')
    expect(split.shares.map((s) => s.amount)).toEqual([33_334, 33_334, 33_333])
    expect(split.assigned).toBe(1_000_01)
    expect(split.remainder).toBe(0)
  })

  it('leaves out whoever is unticked', () => {
    const roster = people('Juan', 'Ken')
    roster[2] = { ...(roster[2] as Participant), included: false }

    const split = computeSplit(3_000_00, roster, 'equally')
    expect(split.shares.map((s) => s.amount)).toEqual([1_500_00, 1_500_00, 0])
    expect(split.debtors.map((s) => s.name)).toEqual(['Juan'])
  })

  it('counts only what the others owe, not the payer', () => {
    expect(computeSplit(4_800_00, people('Juan', 'Maria', 'Ana'), 'equally').owed).toBe(
      3_600_00,
    )
  })
})

describe('by shares', () => {
  it('weights the split', () => {
    const roster = people('Juan', 'Maria')
    roster[0] = { ...(roster[0] as Participant), shares: 2 }
    roster[1] = { ...(roster[1] as Participant), shares: 1 }
    roster[2] = { ...(roster[2] as Participant), shares: 1 }

    expect(computeSplit(4_000_00, roster, 'shares').shares.map((s) => s.amount)).toEqual([
      2_000_00,
      1_000_00,
      1_000_00,
    ])
  })

  it('treats a missing weight as one share', () => {
    expect(amounts(3_000_00, people('Juan', 'Maria'), 'shares')).toEqual([
      1_000_00,
      1_000_00,
      1_000_00,
    ])
  })

  it('still adds up when the weights divide unevenly', () => {
    const roster = people('Juan')
    roster[0] = { ...(roster[0] as Participant), shares: 2 }
    roster[1] = { ...(roster[1] as Participant), shares: 1 }

    const split = computeSplit(1_000_00, roster, 'shares')
    expect(split.assigned).toBe(1_000_00)
    expect(split.shares.map((s) => s.amount)).toEqual([66_667, 33_333])
  })

  it('gives nothing to a zero weight, and says so', () => {
    const roster = people('Juan')
    roster[1] = { ...(roster[1] as Participant), shares: 0 }

    const split = computeSplit(1_000_00, roster, 'shares')
    expect(split.shares[1]?.amount).toBe(0)
    expect(split.valid).toBe(false)
  })
})

describe('by amount', () => {
  const typed = (you: number, juan: number): Participant[] => {
    const roster = people('Juan')
    roster[0] = { ...(roster[0] as Participant), amount: you }
    roster[1] = { ...(roster[1] as Participant), amount: juan }
    return roster
  }

  it('takes the figures as typed when they add up', () => {
    const split = computeSplit(4_800_00, typed(2_800_00, 2_000_00), 'amount')
    expect(split.remainder).toBe(0)
    expect(split.valid).toBe(true)
    expect(split.owed).toBe(2_000_00)
  })

  it('reports what is still unassigned', () => {
    const split = computeSplit(4_800_00, typed(1_000_00, 1_000_00), 'amount')
    expect(split.remainder).toBe(2_800_00)
    expect(split.valid).toBe(false)
    expect(split.problem).toBe('Some of the bill is still unassigned')
  })

  it('reports an overshoot', () => {
    const split = computeSplit(1_000_00, typed(600_00, 600_00), 'amount')
    expect(split.remainder).toBe(-200_00)
    expect(split.problem).toBe('The shares add up to more than the bill')
  })

  it('lets the payer take none of it', () => {
    const split = computeSplit(1_000_00, typed(0, 1_000_00), 'amount')
    expect(split.valid).toBe(true)
    expect(split.owed).toBe(1_000_00)
  })
})

describe('validity', () => {
  it('needs someone other than the payer', () => {
    const split = computeSplit(1_000_00, people(), 'equally')
    expect(split.valid).toBe(false)
    expect(split.problem).toBe('Pick at least one person to owe you')
  })

  it('needs the bill to be worth something', () => {
    expect(computeSplit(0, people('Juan'), 'equally').valid).toBe(false)
  })
})

describe('listNames', () => {
  it.each([
    [[], ''],
    [['Juan'], 'Juan'],
    [['Juan', 'Maria'], 'Juan and Maria'],
    [['Juan', 'Maria', 'Ana'], 'Juan, Maria and Ana'],
  ])('joins %j as %s', (names, expected) => {
    expect(listNames(names)).toBe(expected)
  })
})
