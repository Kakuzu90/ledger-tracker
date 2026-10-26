# Ledger — Personal Expense & Loan Tracker (PWA)

Offline-first, single-user, installable PWA. IndexedDB is the source of truth and
every write lands there first. Firebase is optional and opt-in: FCM push, and a
one-way cloud copy of the ledger pushed from an outbox when there is a network
(`src/lib/sync.ts`, `src/db/outbox.ts`, `src/features/sync`). Receipts (Blobs) and
the `settings` table are never uploaded.

## Design reference
- `design/*.dc.html` are **visual mockups** (one file per screen, 390px mobile width). Match their layout, spacing, colors, copy and component patterns.
- Do NOT copy their markup syntax (`<x-dc>`, `<helmet>`, `{{ }}`, `sc-for`, `support.js`) — rebuild as React components.
- Sample numbers in the mockups are placeholder data; real values come from the database.

| Mockup | Route | Notes |
|---|---|---|
| Main.dc.html | `/` | Home dashboard, install banner, backup reminder |
| QuickAdd.dc.html | bottom sheet from FAB | expense / income / transfer + keypad |
| Activity.dc.html | `/activity` | search, filters, grouped list, pending recurring, undo snackbar |
| Calendar.dc.html | `/activity/calendar` | month heatmap |
| TxnDetail.dc.html | `/txn/:id` | receipt, duplicate, split, make recurring, delete |
| Loans.dc.html | `/loans` | people + formal loans |
| Person.dc.html | `/loans/person/:id` | partial repayments, remind (Web Share), settle |
| AddLoan.dc.html | `/loans/new` | |
| FormalLoan.dc.html | `/loans/formal/:id` | amortization + extra payment simulator |
| Split.dc.html | `/split/:txnId` | creates personal loans |
| Accounts.dc.html | `/accounts` | net worth, transfer, credit card |
| Budgets.dc.html | `/budgets` | category budgets, rollover, savings goals |
| Bills.dc.html | `/bills` | recurring, subscriptions, notification prompt |
| Reports.dc.html | `/reports` | donut, 6-month trend, vs last month, year in review |
| Lock.dc.html | overlay | PIN + WebAuthn |
| Settings.dc.html | `/settings` | |
| Categories.dc.html | `/settings/categories` | drag reorder, subcategories, tags, merge |
| Backup.dc.html | `/settings/backup` | JSON/CSV export, import preview, persistent storage |

Bottom tabs: Home · Activity · (+ FAB) · Loans · Reports. Sub-screens use a back button and no tab bar.

## UI work
- **Always invoke the `ui-ux-pro-max` skill before touching the UI** — new screens or components, styling, layout, responsive behaviour, interaction, charts, accessibility, and any review or fix of existing UI. Load it first, then work; do not answer from memory.
- It does not override anything above. The mockups, the design tokens and the 44px touch target stay authoritative; use the skill for what they do not say.
- Skip it only for work that changes nothing on screen — pure `src/lib` logic, Dexie schema, tests, tooling.

## Stack
- Vite + React + TypeScript (strict)
- Tailwind CSS (tokens below in `tailwind.config`)
- React Router
- Dexie.js + `dexie-react-hooks` (`useLiveQuery`)
- `vite-plugin-pwa` (Workbox, `registerType: 'prompt'` for the update banner)
- Recharts (charts), date-fns (dates), Zustand (UI state only)
- Vitest + Testing Library; Playwright for e2e

## Design tokens
- Background `#F6F7F4`, surface `#FFFFFF`, border `#E3E5E0`, divider `#EEF0EB`
- Ink `#16181D`, muted `#5B616B`
- Primary / positive `#0F6E64` (owed to you, income)
- Negative / warning `#B4501A` (you owe, expense, over budget)
- Fonts: Space Grotesk (headings, all numbers with `tabular-nums`), IBM Plex Sans (body)
- Radius: cards 18px, buttons/inputs 12–14px, chips full
- Touch targets ≥ 44px. Light + dark theme via CSS variables.

## Data rules
- Money stored as **integer centavos**. Never floats. Format with `Intl.NumberFormat`.
- Every table: `id` (uuid), `createdAt`, `updatedAt`.
- Balances, loan remaining, budget spent are **computed**, never stored.
- Loan payments and formal-loan installments also create a linked transaction (no double entry by the user).

### Dexie schema (v1)
- `accounts`: name, type (cash|bank|ewallet|credit), currency, openingBalance, color, archived, creditLimit?, statementDay?, dueDay?
- `categories`: name, kind (expense|income), parentId?, color, order, archived
- `transactions`: type (expense|income|transfer), amount, accountId, toAccountId?, categoryId?, date, note, tags[], receiptId?, recurringId?, loanId?, status (posted|pending)
- `receipts`: blob, mime, size
- `recurring`: template (txn fields), freq, interval, startDate, endDate?, nextDate, mode (auto|confirm)
- `contacts`: name, phone?, note?
- `loans`: kind (personal|formal), direction (lent|borrowed), contactId?, lender?, principal, ratePct?, termMonths?, startDate, dueDate?, note, accountId?, status (open|settled), splitFromTxnId?
- `loanPayments`: loanId, amount, date, accountId?, transactionId, installmentNo?
- `budgets`: month (YYYY-MM), categoryId (null = overall), limit, rollover
- `goals`: name, target, saved, deadline?
- `settings`: key, value

## Conventions
- Feature folders: `src/features/<feature>/{components,hooks,db.ts}`; shared UI in `src/ui`.
- Pure logic (amortization, budgets, recurring scheduler, CSV) in `src/lib` with unit tests.
- Request `navigator.storage.persist()` on first launch.
- No `localStorage` for app data — IndexedDB only.
- Run `npm run lint && npm test` before finishing a task.
