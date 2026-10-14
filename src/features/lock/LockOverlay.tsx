import { Placeholder } from '@/ui/Screen'

/**
 * Full-screen PIN / WebAuthn gate. Mounted above the router when the app is
 * locked. See design/Lock.dc.html.
 */
export function LockOverlay() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-center gap-4 bg-bg px-5">
      <div className="mx-auto w-full max-w-screen">
        <h1 className="mb-4 text-screen">Ledger is locked</h1>
        <Placeholder mockup="Lock.dc.html" />
      </div>
    </div>
  )
}
