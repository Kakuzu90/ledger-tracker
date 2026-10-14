import { useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Screen } from '@/ui/Screen'
import { Sheet } from '@/ui/Sheet'
import { Toggle } from '@/ui/Toggle'
import { Badge, Row, RowGroup } from '@/ui/Rows'
import {
  AlertIcon,
  CloudIcon,
  DevicesIcon,
  DownloadIcon,
  FileIcon,
  LockIcon,
  SyncIcon,
  TableIcon,
  UploadIcon,
} from '@/ui/Icon'
import { useUIStore } from '@/store/ui'
import {
  backupFilename,
  decryptBackup,
  encryptBackup,
  parseBackup,
  summarise,
  type BackupEnvelope,
  type BackupSummary,
  type EncryptedEnvelope,
} from '@/lib/backup'
import { REMINDER_INTERVALS } from '@/lib/preferences'
import { downloadJson } from '@/lib/download'
import { downloadCsv } from '@/lib/csv'
import { toDateOnly } from '@/lib/dates'
import { transactionsToCsv } from '@/features/activity/csv'
import { buildLookups } from '@/features/transactions/describe'
import { customRange } from '@/features/reports/reports'
import { savePreference } from '@/features/settings/db'
import { db } from '@/db/db'
import {
  askForPersistentStorage,
  buildBackup,
  markBackedUp,
  readStorageFacts,
  resetAllData,
  restoreBackup,
  useBackupData,
} from './db'
import { buildBackupView, summaryLine, type StorageFacts } from './backup'
import { PasswordSheet } from './components/PasswordSheet'

interface Chosen {
  filename: string
  envelope?: BackupEnvelope
  locked?: EncryptedEnvelope
  summary?: BackupSummary
  problem?: string
}

const NO_STORAGE: StorageFacts = { usage: null, receipts: 0, persisted: false }

/** Backup & data (design/Backup.dc.html). */
export function BackupScreen() {
  const data = useBackupData()
  const showSnack = useUIStore((s) => s.showSnack)
  const today = useMemo(() => new Date(), [])
  const fileInput = useRef<HTMLInputElement>(null)

  const [storage, setStorage] = useState<StorageFacts>(NO_STORAGE)
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [asking, setAsking] = useState<'export' | 'import' | null>(null)
  const [csvOpen, setCsvOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [intervalOpen, setIntervalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [from, setFrom] = useState(() => toDateOnly(new Date(today.getFullYear(), 0, 1)))
  const [to, setTo] = useState(() => toDateOnly(today))

  const receipts = data?.receipts ?? 0
  useEffect(() => {
    void readStorageFacts(receipts).then(setStorage)
  }, [receipts])

  const view = useMemo(
    () => (data ? buildBackupView({ ...data, storage }, today) : undefined),
    [data, storage, today],
  )

  if (!view) {
    return (
      <Screen title="Backup & data" back>
        <div aria-hidden="true" className="h-64 animate-pulse rounded-card bg-surface" />
      </Screen>
    )
  }

  /** Writes the file, with a password when the user asked for one. */
  const exportBackup = async (password?: string) => {
    setBusy(true)
    try {
      const { envelope, skippedReceipts } = await buildBackup()
      const payload = password ? await encryptBackup(envelope, password) : envelope

      downloadJson(backupFilename(new Date(), password !== undefined), payload)
      await markBackedUp()

      showSnack({
        message:
          skippedReceipts > 0
            ? `Backed up — ${skippedReceipts} receipts could not be read`
            : `Backed up ${summarise(envelope).rows.toLocaleString()} rows`,
      })
    } finally {
      setBusy(false)
    }
  }

  const onBackUp = () => {
    if (view.encrypt) setAsking('export')
    else void exportBackup()
  }

  const onExportCsv = async () => {
    const range = customRange(from, to)
    const [transactions, categories, accounts] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.accounts.toArray(),
    ])

    const rows = transactions.filter(
      (txn) => txn.date >= range.start && txn.date <= range.end,
    )
    setCsvOpen(false)

    if (rows.length === 0) {
      showSnack({ message: 'No entries in that range' })
      return
    }

    downloadCsv(
      `ledger-${range.start}-to-${range.end}.csv`,
      transactionsToCsv(rows, buildLookups(categories, accounts)),
    )
    showSnack({ message: `Exported ${rows.length} entries` })
  }

  const onChooseFile = async (file: File) => {
    const parsed = parseBackup(await file.text())

    if (parsed.kind === 'invalid') {
      setChosen({ filename: file.name, problem: parsed.problem })
      return
    }
    if (parsed.kind === 'encrypted') {
      setChosen({ filename: file.name, locked: parsed.envelope })
      return
    }
    setChosen({
      filename: file.name,
      envelope: parsed.envelope,
      summary: summarise(parsed.envelope),
    })
  }

  const onRestore = async (envelope: BackupEnvelope) => {
    setBusy(true)
    try {
      await restoreBackup(envelope)
      setChosen(null)
      showSnack({ message: 'Restored. Everything on this device is from the file now.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen title="Backup & data" back>
      <section
        className={`rounded-card border p-4 ${
          view.overdue
            ? 'border-negative-soft bg-negative-soft'
            : 'border-primary-soft bg-primary-soft'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <AlertIcon size={22} className={view.overdue ? 'text-negative' : 'text-primary'} />
          <p className={`font-medium ${view.overdue ? 'text-negative' : 'text-primary'}`}>
            {view.ageHeadline}
          </p>
        </div>
        <p className="mb-3 mt-1.5 text-meta text-muted">
          Your data is stored only in this browser. Clearing site data or losing this
          phone erases it.
        </p>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={busy}
          onClick={onBackUp}
        >
          <DownloadIcon size={18} />
          {busy ? 'Working…' : 'Back up now'}
        </button>
      </section>

      <p className="label mt-1">Export</p>
      <RowGroup>
        <Row
          icon={<FileIcon />}
          label="Full backup"
          hint="JSON · everything, restorable"
          onClick={onBackUp}
        />
        <Row
          icon={<TableIcon />}
          label="Transactions"
          hint="CSV · pick a date range"
          onClick={() => setCsvOpen(true)}
        />
        <Toggle
          icon={<LockIcon />}
          label="Encrypt backups"
          hint="Password required to restore"
          checked={view.encrypt}
          onChange={(on) => void savePreference('encryptBackups', on)}
        />
      </RowGroup>
      {view.encrypt && (
        <p className="px-1 text-meta text-muted">
          There is nowhere to recover a lost password from — the file is the only copy
          and the key is never stored.
        </p>
      )}

      <p className="label mt-1">Restore</p>
      <div className="rounded-card border border-border bg-surface p-3.5">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void onChooseFile(file)
            event.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-ctl border border-dashed border-border-strong bg-bg font-medium"
        >
          <UploadIcon />
          Choose backup file
        </button>

        {chosen && (
          <div className="mt-3 rounded-ctl bg-bg p-3">
            <p className="text-sm font-medium">{chosen.filename}</p>

            {chosen.problem && <p className="text-meta text-negative">{chosen.problem}</p>}

            {chosen.locked && (
              <>
                <p className="text-meta text-muted">
                  Encrypted · made{' '}
                  {chosen.locked.exportedAt
                    ? format(parseISO(chosen.locked.exportedAt), 'd MMM yyyy')
                    : 'at an unknown time'}
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-3 w-full"
                  onClick={() => setAsking('import')}
                >
                  Unlock to see what is in it
                </button>
              </>
            )}

            {chosen.envelope && chosen.summary && (
              <>
                <p className="text-meta text-muted">{summaryLine(chosen.summary)}</p>
                {chosen.summary.warning && (
                  <p className="mt-1 text-meta text-negative">{chosen.summary.warning}</p>
                )}
                <p className="mt-1 text-meta text-negative">
                  Replaces all current data on this device
                </p>
                <button
                  type="button"
                  className="btn-primary mt-3 w-full"
                  disabled={busy}
                  onClick={() => void onRestore(chosen.envelope as BackupEnvelope)}
                >
                  Restore this backup
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <p className="label mt-1">Cloud &amp; sync</p>
      <RowGroup>
        <Row
          icon={<CloudIcon />}
          label="Google Drive"
          hint="Ledger has no server to connect one through"
          value={<Badge>Later</Badge>}
          chevron={false}
        />
        <Row
          icon={<SyncIcon />}
          label="Auto backup weekly"
          hint="Needs a connected cloud"
          value={<Badge>Later</Badge>}
          chevron={false}
        />
        <Row
          icon={<DevicesIcon />}
          label="Sync across devices"
          hint="Requires an account"
          value={<Badge>Later</Badge>}
          chevron={false}
        />
      </RowGroup>

      <p className="label mt-1">Storage</p>
      <RowGroup>
        <Row
          label="Persistent storage"
          hint="Browser won't auto-clear your data"
          chevron={false}
          {...(view.storage.persisted
            ? { value: <Badge tone="positive">Granted</Badge> }
            : {
                value: <span className="text-sm font-semibold text-primary">Ask</span>,
                onClick: () => {
                  void askForPersistentStorage().then(async (granted) => {
                    setStorage(await readStorageFacts(receipts))
                    showSnack({
                      message: granted
                        ? 'The browser will keep your data'
                        : 'The browser did not grant it — keep backing up',
                    })
                  })
                },
              })}
        />
        <Row label="Space used" value={<span className="num">{view.storageLabel}</span>} chevron={false} />
        <Row
          label="Backup reminder"
          value={view.reminderLabel}
          onClick={() => setIntervalOpen(true)}
        />
      </RowGroup>

      <button
        type="button"
        onClick={() => setResetOpen(true)}
        className="mt-3 min-h-[50px] w-full rounded-btn border border-negative-soft bg-negative-soft font-semibold text-negative"
      >
        Reset all data
      </button>

      {asking === 'export' && (
        <PasswordSheet
          onClose={() => setAsking(null)}
          title="Password for this backup"
          hint="You will need it to restore. It is not stored anywhere."
          confirm
          action="Encrypt and download"
          onSubmit={exportBackup}
        />
      )}

      {asking === 'import' && (
        <PasswordSheet
          onClose={() => setAsking(null)}
          title="Unlock this backup"
          hint="The password the file was encrypted with."
          action="Unlock"
          onSubmit={async (password) => {
            const envelope = await decryptBackup(
              chosen?.locked as EncryptedEnvelope,
              password,
            )
            setChosen({
              filename: chosen?.filename ?? '',
              envelope,
              summary: summarise(envelope),
            })
          }}
        />
      )}

      <Sheet open={csvOpen} onClose={() => setCsvOpen(false)} title="Export transactions">
        <div className="flex gap-3">
          <label className="flex-1">
            <span className="label">From</span>
            <input
              className="field mt-1"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="flex-1">
            <span className="label">To</span>
            <input
              className="field mt-1"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
        <button type="button" className="btn-primary w-full" onClick={() => void onExportCsv()}>
          Export {customRange(from, to).label}
        </button>
      </Sheet>

      <Sheet
        open={intervalOpen}
        onClose={() => setIntervalOpen(false)}
        title="Backup reminder"
      >
        <RowGroup>
          {REMINDER_INTERVALS.map((option) => (
            <Row
              key={option.days}
              label={option.label}
              chevron={false}
              onClick={() => {
                void savePreference('backupReminderDays', option.days)
                setIntervalOpen(false)
              }}
              value={option.days === view.reminderDays ? 'On' : undefined}
            />
          ))}
        </RowGroup>
      </Sheet>

      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} title="Reset all data">
        <p className="text-meta text-muted">
          Every entry, account, loan, budget and receipt on this device is deleted, and
          Ledger starts again with the default categories. There is no undo, and no copy
          anywhere else.
        </p>
        <p className="text-meta text-muted">
          {view.lastBackupAt === undefined
            ? 'You have never backed this up.'
            : `Your last backup was ${view.ageLabel.toLowerCase()}.`}
        </p>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            setResetOpen(false)
            onBackUp()
          }}
        >
          Back up first
        </button>
        <button
          type="button"
          className="min-h-[50px] w-full rounded-btn bg-negative font-semibold text-negative-ink"
          onClick={() => {
            void resetAllData().then(() => {
              setResetOpen(false)
              showSnack({ message: 'Everything deleted' })
            })
          }}
        >
          Delete everything
        </button>
      </Sheet>
    </Screen>
  )
}
