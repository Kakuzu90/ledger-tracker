import { abbreviate } from '@/lib/text'

type Tone = 'positive' | 'negative' | 'neutral'

const TONES: Readonly<Record<Tone, string>> = {
  positive: 'bg-primary/15 text-primary',
  negative: 'bg-negative/15 text-negative',
  neutral: 'bg-divider text-muted',
}

interface AvatarProps {
  name: string
  /** Green when they owe you, orange when you owe them. */
  tone?: Tone
  className?: string
}

/** The round initials circle the people lists lead with. */
export function Avatar({ name, tone = 'neutral', className = '' }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full font-heading text-sm font-semibold ${TONES[tone]} ${className}`}
    >
      {abbreviate(name)}
    </span>
  )
}
