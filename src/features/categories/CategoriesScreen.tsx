import { useMemo, useState } from 'react'
import { Screen } from '@/ui/Screen'
import { Money } from '@/ui/Money'
import { Segmented } from '@/ui/Segmented'
import { CategoryTile } from '@/ui/CategoryTile'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, GripIcon, PlusIcon } from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import type { Category, CategoryKind, Id } from '@/db/types'
import {
  buildCategoriesView,
  planFromOrder,
  type ParentRow,
  type TagRow,
} from './categories'
import {
  applyOrder,
  createCategory,
  mergeCategories,
  removeCategory,
  removeTag,
  renameTag,
  restoreCategory,
  undoMerge,
  undoTagEdit,
  updateCategory,
  useCategoriesData,
} from './db'
import { useReorder } from './hooks/useReorder'
import { CategoryForm } from './components/CategoryForm'
import { MergeSheet } from './components/MergeSheet'
import { TagSheet } from './components/TagSheet'

type Editing =
  | { kind: 'new'; parent?: Category }
  | { kind: 'edit'; category: Category }
  | null

/** Categories & tags (design/Categories.dc.html). */
export function CategoriesScreen() {
  const data = useCategoriesData()
  const showSnack = useUIStore((s) => s.showSnack)

  const [kind, setKind] = useState<CategoryKind>('expense')
  const [open, setOpen] = useState<Set<Id>>(new Set())
  const [merging, setMerging] = useState(false)
  const [selected, setSelected] = useState<Set<Id>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [tag, setTag] = useState<TagRow | null>(null)

  const view = useMemo(
    () => (data ? buildCategoriesView(data, kind) : undefined),
    [data, kind],
  )

  const parents = useMemo(() => view?.rows.map((row) => row.category) ?? [], [view])
  const reorder = useReorder(
    useMemo(() => parents.map((category) => category.id), [parents]),
    (next) => void applyOrder(planFromOrder(parents, next)),
    (id) => parents.find((category) => category.id === id)?.name ?? 'Category',
  )

  if (!view || !data) {
    return (
      <Screen title="Categories & tags" back>
        <div aria-hidden="true" className="h-64 animate-pulse rounded-card bg-surface" />
      </Screen>
    )
  }

  const byId = new Map(view.rows.map((row) => [row.category.id, row]))
  const ordered = reorder.order
    .map((id) => byId.get(id))
    .filter((row): row is ParentRow => row !== undefined)

  const toggleOpen = (id: Id) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleSelected = (id: Id) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const stopMerging = () => {
    setMerging(false)
    setSelected(new Set())
    setConfirming(false)
  }

  const onMerge = async (sourceIds: Id[], targetId: Id) => {
    const name = byId.get(targetId)?.category.name ?? 'one category'
    try {
      const record = await mergeCategories(sourceIds, targetId)
      stopMerging()
      showSnack({
        message: `Merged into ${name}`,
        actionLabel: 'Undo',
        onAction: () => undoMerge(record),
      })
    } catch (error) {
      showSnack({ message: error instanceof Error ? error.message : 'That did not work' })
    }
  }

  const onRemove = async (category: Category) => {
    const removed = await removeCategory(category.id)
    showSnack({
      message: removed.archived
        ? `${category.name} hidden — its entries keep the name`
        : `${category.name} deleted`,
      actionLabel: 'Undo',
      onAction: () => restoreCategory(removed),
    })
  }

  const selectedCategories = view.rows
    .map((row) => row.category)
    .filter((category) => selected.has(category.id))

  return (
    <Screen
      title="Categories & tags"
      back
      actions={
        <button
          type="button"
          onClick={() => (merging ? stopMerging() : setMerging(true))}
          className="min-h-touch rounded-ctl border border-border bg-surface px-3 text-sm font-medium"
        >
          {merging ? 'Cancel' : 'Merge'}
        </button>
      }
    >
      <Segmented
        label="Category type"
        value={kind}
        onChange={(next) => {
          setKind(next)
          setSelected(new Set())
        }}
        options={[
          { value: 'expense', label: `Expense · ${view.expenseCount}` },
          { value: 'income', label: `Income · ${view.incomeCount}` },
        ]}
      />

      <p id="reorder-help" className="px-1 text-meta text-muted">
        {merging
          ? 'Pick the categories to merge, then choose which one to keep.'
          : 'Drag to reorder, or focus a handle and use the up and down arrows. Tap to rename, recolour or add subcategories.'}
      </p>

      {/* Says where a row landed after an arrow press, which nothing did. */}
      <p role="status" className="sr-only">
        {reorder.announcement}
      </p>

      <div className="rounded-card border border-border bg-surface pl-1 pr-2">
        {ordered.map((row) => {
          const expanded = open.has(row.category.id)
          const picked = selected.has(row.category.id)

          return (
            <div
              key={row.category.id}
              ref={reorder.setRow(row.category.id)}
              className={
                reorder.draggingId === row.category.id
                  ? 'relative z-10 rounded-ctl bg-surface shadow-sheet'
                  : ''
              }
            >
              <div className="flex min-h-[60px] items-center gap-2.5 border-b border-divider last:border-b-0">
                {merging ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={picked}
                    aria-label={`Select ${row.category.name}`}
                    onClick={() => toggleSelected(row.category.id)}
                    className="flex h-touch w-touch flex-none items-center justify-center"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                        picked
                          ? 'border-primary bg-primary text-primary-ink'
                          : 'border-border-strong'
                      }`}
                    >
                      {picked && <CheckIcon size={14} />}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={`Reorder ${row.category.name}`}
                    aria-describedby="reorder-help"
                    className="flex h-touch w-touch flex-none cursor-grab touch-none items-center justify-center text-muted"
                    {...reorder.handleProps(row.category.id)}
                  >
                    <GripIcon />
                  </button>
                )}

                <CategoryTile color={row.category.color} name={row.category.name} />

                <button
                  type="button"
                  onClick={() =>
                    merging
                      ? toggleSelected(row.category.id)
                      : setEditing({ kind: 'edit', category: row.category })
                  }
                  className="min-w-0 flex-1 py-2 text-left"
                >
                  <span className="block truncate font-medium">{row.category.name}</span>
                  <span className="block text-meta text-muted">{row.subtitle}</span>
                </button>

                {!merging && (
                  <button
                    type="button"
                    aria-label={expanded ? 'Hide subcategories' : 'Show subcategories'}
                    aria-expanded={expanded}
                    onClick={() => toggleOpen(row.category.id)}
                    className="flex h-touch w-touch flex-none items-center justify-center text-muted"
                  >
                    {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  </button>
                )}
              </div>

              {expanded && !merging && (
                <>
                  {row.children.map((child) => (
                    <button
                      key={child.category.id}
                      type="button"
                      onClick={() => setEditing({ kind: 'edit', category: child.category })}
                      className="flex min-h-[46px] w-full items-center gap-2.5 border-b border-divider pl-[58px] text-left text-sm"
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ backgroundColor: child.category.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{child.category.name}</span>
                      <span className="pr-2 text-meta text-muted">{child.entries}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditing({ kind: 'new', parent: row.category })}
                    className="flex min-h-[46px] w-full items-center gap-2 border-b border-divider pl-[58px] text-left text-sm font-medium text-primary last:border-b-0"
                  >
                    <PlusIcon size={16} />
                    Add subcategory
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setEditing({ kind: 'new' })}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-btn border border-dashed border-border-strong font-medium"
      >
        <PlusIcon size={18} />
        New category
      </button>

      <div className="mt-2 flex items-center justify-between px-1">
        <h2 className="text-title font-heading font-semibold">Tags</h2>
        <p className="text-meta text-muted">Total spent · entries</p>
      </div>

      {view.tags.length === 0 ? (
        <p className="px-1 text-meta text-muted">
          No tags yet. Add one to an entry and it shows up here.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {view.tags.map((row) => (
            <button key={row.tag} type="button" className="chip" onClick={() => setTag(row)}>
              #{row.tag}{' '}
              <span className="num text-meta text-muted">
                <Money value={row.total} whole /> · {row.count}
              </span>
            </button>
          ))}
        </div>
      )}

      {merging && selected.size > 0 && <div aria-hidden="true" className="h-16" />}

      {merging && selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-screen gap-3 border-t border-border bg-surface p-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <p className="flex-1 self-center text-meta text-muted">{selected.size} selected</p>
          <button
            type="button"
            className="btn-primary"
            disabled={selected.size < 2}
            onClick={() => setConfirming(true)}
          >
            Merge
          </button>
        </div>
      )}

      <MergeSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        selected={selectedCategories}
        data={data}
        onMerge={onMerge}
      />

      {editing && (
        <CategoryForm
          open
          onClose={() => setEditing(null)}
          {...(editing.kind === 'edit' ? { category: editing.category } : {})}
          {...(editing.kind === 'new' && editing.parent
            ? { parentName: editing.parent.name }
            : {})}
          {...(editing.kind === 'edit'
            ? { onRemove: () => onRemove(editing.category) }
            : {})}
          onSave={async (fields) => {
            if (editing.kind === 'edit') {
              await updateCategory(editing.category.id, fields)
              return
            }

            const parent = editing.parent
            await createCategory({
              name: fields.name,
              // A subcategory is drawn in its parent's colour everywhere.
              color: parent?.color ?? fields.color,
              kind,
              ...(parent ? { parentId: parent.id } : {}),
            })
            if (parent) setOpen((current) => new Set(current).add(parent.id))
          }}
        />
      )}

      {tag && (
        <TagSheet
          tag={tag}
          onClose={() => setTag(null)}
          onRename={async (to) => {
            const edit = await renameTag(tag.tag, to)
            if (edit.transactions.length > 0) {
              showSnack({
                message: `Renamed on ${edit.transactions.length} entries`,
                actionLabel: 'Undo',
                onAction: () => undoTagEdit(edit),
              })
            }
          }}
          onRemove={async () => {
            const edit = await removeTag(tag.tag)
            showSnack({
              message: `#${tag.tag} removed`,
              actionLabel: 'Undo',
              onAction: () => undoTagEdit(edit),
            })
          }}
        />
      )}
    </Screen>
  )
}
