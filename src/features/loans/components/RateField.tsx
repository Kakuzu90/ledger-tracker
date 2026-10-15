import { Segmented } from '@/ui/Segmented'
import { rateLabel } from '@/lib/loans'
import type { RateBasis } from '@/db/types'

const BASES: ReadonlyArray<{ value: RateBasis; label: string }> = [
  { value: 'month', label: 'a month' },
  { value: 'year', label: 'a year' },
]

/**
 * The interest rate, in whichever unit the lender quoted.
 *
 * Lenders here quote per month — "3.95% a month" — while the
 * amortisation works in annual terms, so the form used to make people do
 * the ×12 themselves and then showed the loan back as 47.4%. The unit is
 * part of the entry now, and is kept so the loan reads the way the
 * contract does.
 */
export function RateField({
  rate,
  basis,
  onRate,
  onBasis,
}: {
  /** As typed, in `basis` units — not the stored annual figure. */
  rate: string
  basis: RateBasis
  onRate: (next: string) => void
  onBasis: (next: RateBasis) => void
}) {
  const typed = Number(rate)
  const annual = Number.isFinite(typed) ? typed * (basis === 'month' ? 12 : 1) : 0

  return (
    <div>
      <label className="block">
        <span className="label">Interest rate</span>
        <input
          className="field mt-1"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          value={rate}
          onChange={(event) => onRate(event.target.value)}
          placeholder={basis === 'month' ? '3.95' : '9.5'}
        />
      </label>

      <div className="mt-2">
        <Segmented label="Rate period" options={BASES} value={basis} onChange={onBasis} />
      </div>

      {/* The number the schedule is actually built from, when it differs. */}
      {basis === 'month' && annual > 0 && (
        <p className="mt-1.5 text-meta text-muted">{rateLabel(annual, 'year')} in total</p>
      )}
    </div>
  )
}
