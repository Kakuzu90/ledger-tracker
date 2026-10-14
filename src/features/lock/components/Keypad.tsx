import type { ReactNode } from 'react'
import { BackspaceIcon, FingerprintIcon } from '@/ui/Icon'

interface KeypadProps {
  onDigit: (digit: string) => void
  onDelete: () => void
  /** Omitted when this device has nothing to offer. */
  onBiometric?: () => void
  disabled?: boolean
}

const KEY =
  'flex h-[76px] w-[76px] items-center justify-center justify-self-center rounded-full font-heading text-[28px] font-medium transition-opacity disabled:opacity-40'

function Key({
  onClick,
  label,
  ghost = false,
  disabled = false,
  children,
}: {
  onClick: () => void
  label?: string
  ghost?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...(label ? { 'aria-label': label } : {})}
      className={`${KEY} ${ghost ? 'bg-transparent' : 'bg-lock-key'}`}
    >
      {children}
    </button>
  )
}

/** The PIN keypad from design/Lock.dc.html. */
export function Keypad({ onDigit, onDelete, onBiometric, disabled = false }: KeypadProps) {
  return (
    <div className="grid w-full max-w-[300px] grid-cols-3 gap-x-7 gap-y-[18px]">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <Key key={digit} onClick={() => onDigit(digit)} disabled={disabled}>
          {digit}
        </Key>
      ))}

      {onBiometric ? (
        <Key
          ghost
          onClick={onBiometric}
          disabled={disabled}
          label="Unlock with fingerprint or face"
        >
          <span className="text-lock-accent">
            <FingerprintIcon />
          </span>
        </Key>
      ) : (
        <span aria-hidden="true" />
      )}

      <Key onClick={() => onDigit('0')} disabled={disabled}>
        0
      </Key>

      <Key ghost onClick={onDelete} disabled={disabled} label="Delete digit">
        <BackspaceIcon />
      </Key>
    </div>
  )
}
