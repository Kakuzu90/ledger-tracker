import type { Category, CategoryKind } from '@/db/types'

/**
 * Display order for every category list: expense before income, parents by
 * their own order, and each parent immediately followed by its children.
 * Dexie hands rows back in key order, which is uuid order — meaningless to
 * a reader, and it separates Groceries from Food.
 */
export function orderCategories(
  categories: readonly Category[],
  kind?: CategoryKind,
): Category[] {
  const scoped = kind ? categories.filter((c) => c.kind === kind) : categories
  const kinds: CategoryKind[] = kind ? [kind] : ['expense', 'income']

  return kinds.flatMap((group) => {
    const inGroup = scoped.filter((c) => c.kind === group)
    return inGroup
      .filter((c) => c.parentId === undefined)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .flatMap((parent) => [
        parent,
        ...inGroup
          .filter((c) => c.parentId === parent.id)
          .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
      ])
  })
}
