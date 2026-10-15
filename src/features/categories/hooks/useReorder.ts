import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react'
import type { Id } from '@/db/types'
import { moveTo } from '../categories'

/**
 * Drag-to-reorder for the category list.
 *
 * Pointer events rather than HTML5 drag-and-drop, which does not fire on a
 * touchscreen — and this is a phone-first app. Rows swap as the pointer
 * passes their midpoint, so what is on screen during the drag is already the
 * order that will be saved. The handle also answers the arrow keys, because
 * a drag is not something every reader can perform.
 */
export interface Reorder {
  /** The order to render in: the live one mid-drag, otherwise what came in. */
  order: Id[]
  draggingId: Id | null
  /**
   * Where the last keyboard move landed, for a live region. A drag shows
   * its own result; an arrow press is otherwise silent.
   */
  announcement: string
  /** Ref callback for each row, so the hook can measure where they sit. */
  setRow: (id: Id) => (element: HTMLElement | null) => void
  handleProps: (id: Id) => {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  }
}

export function useReorder(
  ids: readonly Id[],
  commit: (next: Id[]) => void,
  /** Row labels by id, so the announcement can name what moved. */
  nameOf: (id: Id) => string = () => 'Item',
): Reorder {
  const rows = useRef(new Map<Id, HTMLElement>())
  const [order, setOrder] = useState<Id[] | null>(null)
  const [draggingId, setDraggingId] = useState<Id | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // Mirrors of what the window listeners need, so a drag does not have to
  // re-subscribe on every pointer move.
  const orderRef = useRef<Id[]>([])
  const idsRef = useRef(ids)
  const commitRef = useRef(commit)

  useEffect(() => {
    idsRef.current = ids
    commitRef.current = commit
  })

  const live = order ?? [...ids]
  const key = ids.join()

  // The local order is held until the saved one comes back, so the list does
  // not flick to where it was for a frame while Dexie writes. Adjusting the
  // state during render rather than in an effect is what keeps that frame
  // from being painted at all.
  const [seen, setSeen] = useState(key)
  if (seen !== key) {
    setSeen(key)
    if (draggingId === null) setOrder(null)
  }

  const setRow = (id: Id) => (element: HTMLElement | null) => {
    if (element) rows.current.set(id, element)
    else rows.current.delete(id)
  }

  /** Moves `id` to a slot, and reports where the list ended up. */
  const moveWithin = (id: Id, to: number): Id[] => {
    const current = orderRef.current
    const from = current.indexOf(id)
    if (from === -1 || to === from || to < 0 || to >= current.length) return current

    const next = moveTo(current, from, to)
    orderRef.current = next
    setOrder(next)
    return next
  }

  /**
   * The listeners sit on the window for the length of a drag. Reordering the
   * list moves the row's element in the DOM, and a moved element loses its
   * pointer capture — so the handle itself stops hearing the pointer halfway
   * through the very gesture it started.
   */
  useEffect(() => {
    const dragging = draggingId
    if (dragging === null) return

    /** The slot the pointer is over, by row midpoints. */
    const slotAt = (y: number): number => {
      for (const [index, id] of orderRef.current.entries()) {
        const box = rows.current.get(id)?.getBoundingClientRect()
        if (box && y < box.top + box.height / 2) return index
      }
      return orderRef.current.length - 1
    }

    const onMove = (event: globalThis.PointerEvent) => {
      moveWithin(dragging, slotAt(event.clientY))
    }

    const onUp = () => {
      setDraggingId(null)
      const next = orderRef.current
      if (next.join() === idsRef.current.join()) setOrder(null)
      else commitRef.current(next)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // Only the drag: everything else the listeners read is a ref, so they
    // are subscribed once per gesture rather than once per pointer move.
  }, [draggingId])

  const handleProps = (id: Id) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      // Stops the browser treating the drag as a text selection or a scroll.
      event.preventDefault()
      orderRef.current = [...ids]
      setOrder([...ids])
      setDraggingId(id)
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      if (step === 0) return
      event.preventDefault()

      orderRef.current = order ?? [...ids]
      const next = moveWithin(id, orderRef.current.indexOf(id) + step)
      if (next.join() !== key) commit(next)
      setAnnouncement(`${nameOf(id)}, position ${next.indexOf(id) + 1} of ${next.length}`)
    },
  })

  return { order: live, draggingId, announcement, setRow, handleProps }
}
