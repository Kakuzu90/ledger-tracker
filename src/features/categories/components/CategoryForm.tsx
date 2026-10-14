import { useState } from 'react'
import { Sheet } from '@/ui/Sheet'
import type { Category } from '@/db/types'
import { CATEGORY_COLORS } from '../categories'

interface CategoryFormProps {
  open: boolean
  onClose: () => void
  /** Editing an existing category, or adding one when absent. */
  category?: Category
  /** Shown when adding under a parent. */
  parentName?: string
  onSave: (fields: { name: string; color: string }) => Promise<void>
  onRemove?: () => Promise<void>
}

/** New category, new subcategory, and rename / recolour — all one sheet. */
export function CategoryForm({
  open,
  onClose,
  category,
  parentName,
  onSave,
  onRemove,
}: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0] ?? '#5B616B')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const title = category
    ? category.name
    : parentName
      ? `New subcategory in ${parentName}`
      : 'New category'

  const run = async (action: () => Promise<void>) => {
    setSaving(true)
    setProblem(null)
    try {
      await action()
      onClose()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That did not work')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <label className="block">
        <span className="label">Name</span>
        <input
          className="field mt-1"
          value={name}
          autoFocus
          placeholder="Groceries"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      {/* A subcategory follows its parent's colour, so there is nothing to pick. */}
      {parentName === undefined && (
        <div>
          <span className="label">Colour</span>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {CATEGORY_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Colour ${swatch}`}
                aria-pressed={swatch === color}
                onClick={() => setColor(swatch)}
                style={{ backgroundColor: swatch }}
                className={`h-10 w-10 rounded-full ${
                  swatch === color ? 'ring-2 ring-ink ring-offset-2 ring-offset-bg' : ''
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {problem && <p className="text-meta text-negative">{problem}</p>}

      <button
        type="button"
        className="btn-primary w-full"
        disabled={saving}
        onClick={() => void run(() => onSave({ name, color }))}
      >
        {category ? 'Save' : 'Add'}
      </button>

      {onRemove && (
        <button
          type="button"
          className="min-h-touch rounded-btn text-sm font-semibold text-negative"
          disabled={saving}
          onClick={() => void run(onRemove)}
        >
          Remove this category
        </button>
      )}
    </Sheet>
  )
}
