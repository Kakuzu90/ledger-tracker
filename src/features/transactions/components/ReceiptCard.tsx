import { useEffect, useMemo, useState } from 'react'
import type { Id, Receipt } from '@/db/types'
import { CloseIcon, ReceiptIcon, TrashIcon } from '@/ui/Icon'
import { setReceipt } from '../db'

/** Human-readable blob size: "182 KB". */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * The URL is derived from the blob rather than stored in state, so there is
 * no render-then-update step; the effect exists only to revoke it when the
 * blob changes or the card unmounts. Without that, every visit to a receipt
 * leaks a URL for the life of the page.
 */
function useBlobUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob])

  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  return url
}

interface ReceiptCardProps {
  transactionId: Id
  receipt: Receipt | undefined
}

/** The receipt photo: view it full size, replace it, or take it off. */
export function ReceiptCard({ transactionId, receipt }: ReceiptCardProps) {
  const url = useBlobUrl(receipt?.blob)
  const [zoomed, setZoomed] = useState(false)

  const onPick = async (file: File | null) => {
    if (!file) return
    await setReceipt(transactionId, {
      blob: file,
      mime: file.type || 'image/jpeg',
      size: file.size,
    })
  }

  if (!receipt) {
    return (
      <label className="card relative flex min-h-[64px] cursor-pointer items-center gap-3">
        <span className="row-icon bg-divider text-muted">
          <ReceiptIcon size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Add a receipt</span>
          <span className="block text-meta text-muted">Kept on this device only</span>
        </span>
        <input
          type="file"
          accept="image/*"
          aria-label="Add a receipt"
          onChange={(event) => void onPick(event.target.files?.[0] ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    )
  }

  return (
    <>
      <section className="card flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          aria-label="View receipt full size"
          className="h-20 w-16 flex-none overflow-hidden rounded-[10px] border border-border bg-divider"
        >
          {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="font-medium">Receipt photo</p>
          <p className="text-meta text-muted">
            Stored on device · {formatSize(receipt.size)}
          </p>
        </div>

        <label className="icon-btn relative cursor-pointer">
          <ReceiptIcon size={20} />
          <input
            type="file"
            accept="image/*"
            aria-label="Replace receipt"
            onChange={(event) => void onPick(event.target.files?.[0] ?? null)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>

        <button
          type="button"
          className="icon-btn text-negative"
          aria-label="Remove receipt"
          onClick={() => void setReceipt(transactionId, null)}
        >
          <TrashIcon size={18} />
        </button>
      </section>

      {zoomed && url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Receipt"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-4"
        >
          <img src={url} alt="Receipt" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            aria-label="Close"
            onClick={() => setZoomed(false)}
            className="absolute right-4 top-4 flex h-touch w-touch items-center justify-center rounded-ctl bg-surface text-ink"
          >
            <CloseIcon size={20} />
          </button>
        </div>
      )}
    </>
  )
}
