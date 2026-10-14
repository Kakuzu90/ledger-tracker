# Ledger

Offline-first personal expense & loan tracker. Single user, no backend — every
byte lives in IndexedDB on the device.

The product spec, design tokens and data rules are in [CLAUDE.md](CLAUDE.md);
the per-screen visual reference is in [`design/`](design/).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Type-check, build, generate the service worker |
| `npm run preview` | Serve the build (the only way to exercise the PWA) |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (`npm run test:watch` to watch) |
| `npm run e2e` | Playwright, against a production build |

`npm run lint && npm test` is the gate before finishing any task.

Playwright needs its browser once: `npx playwright install chromium`.

## Layout

```
src/
  db/           Dexie schema (v1) and row types
  lib/          pure logic, unit-tested — money, theme, storage
  store/        Zustand, UI state only
  ui/           shared components: Screen, TabBar, Sheet, Icon
  features/     one folder per feature: components, hooks, db.ts
  routes/       route table
e2e/            Playwright specs
scripts/        build-time helpers (PWA icon generation)
```

## Data

`bootstrapDatabase()` runs on every launch. It seeds the default categories
(11 expense, 3 income, two under Food) and default settings into an empty
database, and never touches values the user has since changed.

In **dev only**, an empty database also gets the demo dataset from
`src/db/sample.ts`. It is deterministic and built around *today*, and it
reproduces the figures in the mockups — ₱64,250 net worth, ₱52,000 in against
₱31,480 out this month, ₱12,500 owed to the user, nine recurring rules —
so the screens have realistic data to render. `src/db/sample.test.ts` asserts
those figures, which means a change that breaks the arithmetic fails the suite.

Opening balances are *solved* from the generated history rather than written
by hand, so computed balances land exactly on their targets. Nothing loads
sample data in production; that stays an explicit action.

## Screens

**Home**, **Quick Add**, **Activity**, **Calendar**, **Transaction detail**,
**Accounts**, the **Loans** hub, a **person's ledger**, **New loan**, a
**formal loan**, **Split** and **Bills & recurring** are built
(`src/features/{home,quick-add,activity,transactions,accounts,loans,split,bills}`).
They all follow the same split: a pure module holds the logic (`dashboard.ts`,
`draft.ts`, `loans.ts`, `person.ts`, `formal.ts`, `split.ts`, `bills.ts`), a `db.ts` holds the Dexie
queries and writes, and the components only render. That is what makes the
figures testable — `dashboard.test.ts` asserts the home cards against the
sample data, so a change that breaks the arithmetic fails the suite rather
than the screen.

Home reads through one `useLiveQuery`, so a saved transaction updates every
card at once. Amounts render through `src/ui/Money.tsx`, which is what makes
the "hide amounts" toggle cover the whole screen.

Activity filters in memory rather than through an index: search and the chips
cut across date, account, category, tags and amount at once, and no single
index serves that. Deleting goes through `deleteTransaction`, which returns
everything it removed so the Undo bar can put it back exactly — receipt
included, so no orphaned blob is left behind.

Loans are three views over the same two tables. The hub groups open personal
loans by contact and amortises the formal ones; a person's page adds the
per-loan progress, the history of every movement and the reminder message;
Split turns one expense into a loan per person. Repayments go through
`recordPayment`, which writes the `loanPayments` row *and* the transaction
that mirrors it, and closes the loan when nothing is left.

The recurring scheduler runs on every app open, from `App.tsx`. `planSchedule`
in `src/lib/recurring.ts` works out everything that has come due without
touching the database; `runSchedule` applies it in one Dexie transaction.
Auto rules post straight into the ledger, confirm rules land as pending
entries in Activity and on Bills. It catches up: three months away from a
monthly rule posts all three, capped at 60 occurrences a run so a phone left
in a drawer cannot wake up and write a year of daily rows at once.

A formal loan's screen is the amortisation calculator made visible:
`src/lib/amortization.ts` walks the schedule payment by payment, rounding the
interest each month the way a lender does, and `formal.ts` turns that into the
table, the stats and the extra-payment simulator. All of it is derived — the
balance after 24 of 60 payments on the ₱650,000 car loan is ₱426,161.50 every
time, and ₱2,000 extra a month finishes it five months sooner for ₱9,550 less
interest.

## Notes for the next change

- **Money** is integer centavos end to end. `src/lib/money.ts` parses from
  digits rather than `Number(x) * 100`, which drifts, and splits with
  `allocateByWeight` so parts sum back exactly.
- **Computed, never stored**: balances live in `src/lib/balances.ts`, loan
  remainders in `src/lib/loans.ts`. Transfers and loan principal are movements,
  not income or expense, so they are excluded from month totals.
- **One rule for what counts as a flow.** `countsAsFlow` in
  `src/lib/balances.ts` decides it: transfers move money sideways, and loan
  principal is borrowed or lent rather than earned or spent. Home, Activity's
  in/out strip, the day nets and the calendar heatmap all defer to it, so a
  month reads the same figure wherever you look at it.
- **Transfers are entered through Quick Add**, not a second form. The
  Accounts screen opens it pre-set (`openQuickAdd({ type: 'transfer' })`),
  and a card's "Pay this card" also fills in the destination. Paying a card
  is just a transfer into it, so the debt drops and net worth does not move.
- **Formal loans** need amortisation for their remaining balance; `outstanding()`
  is principal less payments, which is only right at 0%. `schedule()` runs
  from the original principal, `remainingSchedule()` from where the loan
  actually is — the simulator needs the second one, or it would answer a
  question about a loan the user no longer has. `loanTotals()` covers
  personal loans only, matching the cards in Loans.dc.html. For the same
  reason `recordPayment` caps a *personal* loan at what it is owed but lets a
  formal one take more — the extra is interest, not principal.
- **The schedule is the contract, the balance is the record.** The table on a
  formal loan is the plan the lender wrote; how far through it you are comes
  from how many instalments have been logged. Keeping the two apart is what
  lets the screen show ticks against future rows without inventing history.
- **The scheduler owns `nextDate` — nothing else writes it.** It materialises
  an occurrence and advances the rule in the same transaction, which is what
  makes running it twice (React's double effect, two tabs, a reload) a no-op
  rather than a double charge. `confirmPending` only posts and `skipPending`
  only deletes: advancing there as well would skip a month every time the
  user answered.
- **A pending entry is still an upcoming bill.** Its rule has already moved
  past it, so the Bills forecast and the Home card read pending rows *and*
  future rule occurrences, or the next payment would vanish from both the
  moment the scheduler made it.
- **Subscriptions are a tag** (`subscription`) on the rule's template, set by
  a toggle in the rule form. The v1 schema has no field for it, and a
  threshold on the amount would quietly reclassify a cheap utility bill.
- **Reminders fire on open, not on a schedule.** There is no server to push
  from, so `remindAboutBills` raises one system notice a day for anything due
  within a day, and the banner's copy says exactly that.
- **A loan payment is never deleted from the transaction.**
  `deleteTransaction` refuses rows that carry one; `deletePayment` is the way
  back, and it removes the payment, its transaction and the settled flag it
  may have set. The Undo on the payment snackbar calls it.
- **Settling records no money.** It is for a debt written off or squared away
  outside the app; `settleLoans` returns what it actually closed so Undo
  reopens only that. Money changing hands is `recordPayment`.
- **A split moves nothing.** The expense already left your account, so each
  split loan books no transaction of its own — counting it again would double
  the peso. The loans carry `splitFromTxnId`, which is what lets the Split
  screen show an existing split and unpick it while no one has paid.
- **Theme** is a `data-theme` attribute on `<html>` over CSS variables in
  `src/styles/tokens.css`; Tailwind colours all resolve through them. The
  preference lives in the IndexedDB `settings` table — `localStorage` holds a
  mirror used only to set the attribute before first paint.
- **Service worker** uses `registerType: 'prompt'`, so a new build waits behind
  the banner in `src/ui/UpdateBanner.tsx`. It is inert in dev.
- **Icons** in `public/` are generated by `node scripts/make-icons.mjs`.
- **Category tiles** tint with `color-mix` against the surface and ink tokens,
  so one stored colour works in both themes.
- `resolve.dedupe` in the Vite config is load-bearing: without it
  `dexie-react-hooks` can resolve a second copy of React and every hook in the
  components using it throws.
