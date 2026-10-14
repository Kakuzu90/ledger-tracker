import { useMemo, useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import { Row, RowGroup } from '@/ui/Rows'
import { CheckIcon } from '@/ui/Icon'
import type { Category, Id } from '@/db/types'
import { mergeLabel, mergePreview, type MergeInput } from '../categories'

interface MergeSheetProps {
  open: boolean
  onClose: () => void
  selected: Category[]
  data: MergeInput
  onMerge: (sourceIds: Id[], targetId: Id) => Promise<void>
}

/**
 * Picks which of the chosen categories survives, and says what will move
 * before it moves. A merge rewrites history, so it is spelled out first.
 */
export function MergeSheet({ open, onClose, selected, data, onMerge }: MergeSheetProps) {
  const [targetId, setTargetId] = useState<Id | null>(null)
  const keep = targetId ?? selected[0]?.id ?? ''
  const sources = selected.filter((category) => category.id !== keep).map((c) => c.id)

  const preview = useMemo(
    () => mergePreview(sources, keep, data),
    [sources, keep, data],
  )

  const moving = [
    preview.entries > 0 && `${preview.entries} entries`,
    preview.children > 0 && `${preview.children} subcategories`,
    preview.budgets > 0 && `${preview.budgets} budgets`,
    preview.rules > 0 && `${preview.rules} recurring rules`,
  ].filter((part): part is string => Boolean(part))

  const target = selected.find((category) => category.id === keep)
  const gone = selected
    .filter((category) => category.id !== keep)
    .map((category) => category.name)
    .join(' and ')

  return (
    <Sheet open={open} onClose={onClose} title="Merge categories">
      <p className="text-meta text-muted">Which one should everything end up in?</p>
      <RowGroup>
        {selected.map((category) => (
          <Row
            key={category.id}
            label={category.name}
            chevron={false}
            onClick={() => setTargetId(category.id)}
            value={category.id === keep ? <CheckIcon className="text-primary" /> : undefined}
          />
        ))}
      </RowGroup>

      {preview.problem ? (
        <p className="text-meta text-negative">{preview.problem}</p>
      ) : (
        <p className="text-meta text-muted">
          {moving.length > 0 && `${moving.join(', ')} move to ${target?.name ?? ''}. `}
          {gone} then {sources.length === 1 ? 'disappears' : 'disappear'} from every
          picker and list.
        </p>
      )}

      <button
        type="button"
        className="btn-primary w-full"
        disabled={preview.problem !== undefined}
        onClick={() => void onMerge(sources, keep)}
      >
        {mergeLabel(sources.length, target?.name ?? '')}
      </button>
    </Sheet>
  )
}
