import { abbreviate } from '@/lib/text'

interface CategoryTileProps {
  /** Category or account colour, as a hex string. */
  color: string
  /** Full name — abbreviated to two characters for the tile. */
  name: string
  className?: string
}

/**
 * Two-letter tile that leads every list row. The tint is mixed against the
 * surface and ink tokens, so one colour works in both themes.
 */
export function CategoryTile({ color, name, className = '' }: CategoryTileProps) {
  return (
    <span
      aria-hidden="true"
      className={`row-icon ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, rgb(var(--c-surface)))`,
        color: `color-mix(in srgb, ${color} 60%, rgb(var(--c-ink)))`,
      }}
    >
      {abbreviate(name)}
    </span>
  )
}
