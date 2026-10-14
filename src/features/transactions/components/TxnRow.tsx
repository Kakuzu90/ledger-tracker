import { Link } from 'react-router-dom'
import { CategoryTile } from '@/ui/CategoryTile'
import { Money } from '@/ui/Money'
import { LoansIcon } from '@/ui/Icon'
import type { TxnDescription } from '../describe'

interface TxnRowProps {
  row: TxnDescription
  subtitle: string
  /** Rows link to the detail screen unless told otherwise. */
  linkTo?: string | false
}

/** One line in any transaction list. */
export function TxnRow({ row, subtitle, linkTo }: TxnRowProps) {
  const body = (
    <>
      {row.isTransfer ? (
        <span aria-hidden="true" className="row-icon bg-divider text-muted">
          <LoansIcon size={18} />
        </span>
      ) : (
        <CategoryTile color={row.color} name={row.tileName} />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{row.title}</span>
        <span className="block truncate text-meta text-muted">{subtitle}</span>
      </span>

      <Money
        value={row.amount}
        tone={row.tone}
        signed={!row.isTransfer}
        compact
        className="font-semibold"
      />
    </>
  )

  if (linkTo === false) return <div className="list-row">{body}</div>

  return (
    <Link to={linkTo ?? `/txn/${row.id}`} className="list-row text-ink no-underline">
      {body}
    </Link>
  )
}
