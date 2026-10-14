import { Sheet } from '@/ui/Sheet'
import { Placeholder } from '@/ui/Screen'
import { useUIStore } from '@/store/ui'

/** Reached from the FAB in the tab bar. See design/QuickAdd.dc.html. */
export function QuickAddSheet() {
  const open = useUIStore((s) => s.quickAddOpen)
  const close = useUIStore((s) => s.closeQuickAdd)

  return (
    <Sheet open={open} onClose={close} title="New transaction">
      <Placeholder mockup="QuickAdd.dc.html" />
    </Sheet>
  )
}
