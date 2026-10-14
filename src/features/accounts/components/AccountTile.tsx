import type { AccountType } from '@/db/types'
import { BankIcon, CardIcon, CashIcon, PhoneIcon } from '@/ui/Icon'

const ICONS: Readonly<Record<AccountType, typeof BankIcon>> = {
  bank: BankIcon,
  ewallet: PhoneIcon,
  cash: CashIcon,
  credit: CardIcon,
}

/** The tinted square that leads an account row, carrying its type icon. */
export function AccountTile({ type, color }: { type: AccountType; color: string }) {
  const Icon = ICONS[type]

  return (
    <span
      aria-hidden="true"
      className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-ctl"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, rgb(var(--c-surface)))`,
        color: `color-mix(in srgb, ${color} 60%, rgb(var(--c-ink)))`,
      }}
    >
      <Icon />
    </span>
  )
}
