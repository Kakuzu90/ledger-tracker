/**
 * Splitting one expense between people (design/Split.dc.html).
 *
 * The three methods all land in the same place: a share per participant, in
 * centavos, summing back to the whole. Nothing here touches the database —
 * it is the arithmetic the screen shows live as the user tweaks it.
 */

import type { Centavos } from '@/db/types'
import { allocateByWeight, splitEvenly, sumMoney } from '@/lib/money'

export type SplitMethod = 'equally' | 'amount' | 'shares'

export const METHODS: ReadonlyArray<{ value: SplitMethod; label: string }> = [
  { value: 'equally', label: 'Equally' },
  { value: 'amount', label: 'By amount' },
  { value: 'shares', label: 'By shares' },
]

/** The id the payer is listed under — they are not a contact. */
export const YOU = 'you'

export interface Participant {
  /** A contact id, or `YOU`. */
  key: string
  name: string
  included: boolean
  /** Typed figure under "By amount", in centavos. */
  amount?: Centavos
  /** Weight under "By shares". */
  shares?: number
}

export interface SplitShare {
  key: string
  name: string
  included: boolean
  amount: Centavos
}

export interface SplitResult {
  shares: SplitShare[]
  /** What the shares add up to. */
  assigned: Centavos
  /** total − assigned. Zero for every method but "By amount". */
  remainder: Centavos
  /** Only the people who will end up owing the payer. */
  debtors: SplitShare[]
  owed: Centavos
  /** Whether "Split & create loans" can be pressed. */
  valid: boolean
  /** Why not, when it cannot. */
  problem?: string
}

/** The payer's own share, which stays as their expense. */
export const yourShare = (result: SplitResult): Centavos =>
  result.shares.find((share) => share.key === YOU)?.amount ?? 0

export function computeSplit(
  total: Centavos,
  participants: readonly Participant[],
  method: SplitMethod,
): SplitResult {
  const included = participants.filter((person) => person.included)

  const amounts = new Map<string, Centavos>()
  if (method === 'amount') {
    for (const person of included) amounts.set(person.key, Math.max(0, person.amount ?? 0))
  } else if (included.length > 0) {
    const split =
      method === 'equally'
        ? splitEvenly(total, included.length)
        : allocateByWeight(
            total,
            // A blank weight is one share; the control never offers zero.
            included.map((person) => Math.max(0, person.shares ?? 1)),
          )
    included.forEach((person, index) => amounts.set(person.key, split[index] ?? 0))
  }

  const shares: SplitShare[] = participants.map((person) => ({
    key: person.key,
    name: person.name,
    included: person.included,
    amount: amounts.get(person.key) ?? 0,
  }))

  const assigned = sumMoney(shares.map((share) => share.amount))
  const remainder = total - assigned
  const debtors = shares.filter(
    (share) => share.included && share.key !== YOU && share.amount > 0,
  )

  const problem =
    debtors.length === 0
      ? 'Pick at least one person to owe you'
      : remainder > 0
        ? 'Some of the bill is still unassigned'
        : remainder < 0
          ? 'The shares add up to more than the bill'
          : undefined

  return {
    shares,
    assigned,
    remainder,
    debtors,
    owed: sumMoney(debtors.map((share) => share.amount)),
    valid: problem === undefined,
    ...(problem ? { problem } : {}),
  }
}

/** "Juan, Maria and Ana" — the sentence under the summary card. */
export function listNames(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
