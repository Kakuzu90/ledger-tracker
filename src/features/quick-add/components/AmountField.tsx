import { currencySymbol } from '@/lib/money'
import { useUIStore } from '@/store/ui'
import type { TransactionType } from '@/db/types'

/**
 * The amount, as a real field rather than an on-screen keypad.
 *
 * `inputMode="decimal"` is what brings up the number pad on a phone;
 * `type="text"` rather than `number` because a number input adds spinners,
 * accepts `e` and `-`, and reports an empty string for anything it decides
 * is invalid — which loses the partial value mid-typing. The digits are
 * held to shape by `sanitizeAmount` instead.
 */
export function AmountField({
  value,
  type,
  onChange,
}: {
  value: string
  type: TransactionType
  onChange: (next: string) => void
}) {
  // The old display hardcoded a peso sign whatever the currency was set to.
  const currency = useUIStore((s) => s.currency)
  const tone =
    type === 'expense' ? 'text-negative' : type === 'income' ? 'text-primary' : 'text-ink'

  return (
    <div
      className="flex items-center justify-center gap-1 rounded-ctl py-1 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-bg short:py-0"
    >
      <label htmlFor="qa-amount" className="sr-only">
        Amount
      </label>
      <span aria-hidden="true" className={`num text-[34px] font-bold ${tone}`}>
        {currencySymbol(currency)}
      </span>
      <input
        id="qa-amount"
        /*
         * Sized to its content so the symbol hugs the digits and the pair
         * stays centred, which a `w-full` input cannot do: its text would
         * centre inside the full width and drift away from the symbol.
         * `ch` is exact here because the figures are tabular.
         */
        style={{ width: `${Math.max((value || '0.00').length, 4) + 0.5}ch` }}
        // The ring goes on the row, not here: around a borderless field
        // set in 44px type it drew a box floating in the middle of the
        // sheet rather than something that looked like a control.
        className={`num min-w-0 border-0 bg-transparent p-0 text-[44px] font-bold tracking-[-.02em] outline-none placeholder:text-muted/50 focus-visible:ring-0 focus-visible:ring-offset-0 short:text-[34px] ${tone}`}
        type="text"
        inputMode="decimal"
        // iOS falls back to this when it does not honour inputMode.
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="done"
        placeholder="0.00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
