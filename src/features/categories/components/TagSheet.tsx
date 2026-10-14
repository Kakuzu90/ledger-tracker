import { useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import { Money } from '@/ui/Money'
import type { TagRow } from '../categories'

interface TagSheetProps {
  tag: TagRow
  onClose: () => void
  onRename: (to: string) => Promise<void>
  onRemove: () => Promise<void>
}

/** Renaming a tag, or taking it off every entry that carries it. */
/** Mounted only while a tag is open, so the field starts on its name. */
export function TagSheet({ tag, onClose, onRename, onRemove }: TagSheetProps) {
  const [name, setName] = useState(tag.tag)
  const [problem, setProblem] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setProblem(null)
    try {
      await action()
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not work')
    }
  }

  return (
    <Sheet open onClose={onClose} title={`#${tag.tag}`}>
      <p className="text-meta text-muted">
        <Money value={tag.total} whole className="font-semibold text-ink" /> across{' '}
        {tag.count} {tag.count === 1 ? 'entry' : 'entries'}
      </p>

      <label className="block">
        <span className="label">Name</span>
        <input
          className="field mt-1"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <p className="text-meta text-muted">
        Renaming it onto a tag that already exists merges the two.
      </p>

      {problem && <p className="text-meta text-negative">{problem}</p>}

      <button
        type="button"
        className="btn-primary w-full"
        onClick={() => void run(() => onRename(name))}
      >
        Save
      </button>
      <button
        type="button"
        className="min-h-touch rounded-btn text-sm font-semibold text-negative"
        onClick={() => void run(onRemove)}
      >
        Remove from {tag.count} {tag.count === 1 ? 'entry' : 'entries'}
      </button>
    </Sheet>
  )
}
