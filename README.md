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
**formal loan**, **Split**, **Bills & recurring**, **Budgets**, **Reports**,
**Settings**, **Categories & tags**, **Backup & data** and the **lock** are
built (`src/features/{home,quick-add,activity,transactions,accounts,loans,
split,bills,budgets,reports,settings,categories,backup,lock}`).
They all follow the same split: a pure module holds the logic (`dashboard.ts`,
`draft.ts`, `loans.ts`, `person.ts`, `formal.ts`, `split.ts`, `bills.ts`,
`budgets.ts`, `reports.ts`, `settings.ts`, `categories.ts`, `backup.ts`), a
`db.ts` holds the Dexie queries and writes, and the components only render. That is what makes the
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

Budgets run off `src/lib/budgets.ts`: a limit per category per month, what
was spent against it, and rollover, which chains back through earlier months
for as long as the rule held. Savings goals are the one place a running total
is stored — money set aside is not a transaction, it is a note about intent.

Reports slices the ledger by week, month, year or a custom range, rolls spend
up to top-level categories, and compares each with the period before. The
donut and the six-period bar chart are Recharts; the goal rings are a plain
SVG circle, since one number does not need a chart library.

A formal loan's screen is the amortisation calculator made visible:
`src/lib/amortization.ts` walks the schedule payment by payment, rounding the
interest each month the way a lender does, and `formal.ts` turns that into the
table, the stats and the extra-payment simulator. All of it is derived — the
balance after 24 of 60 payments on the ₱650,000 car loan is ₱426,161.50 every
time, and ₱2,000 extra a month finishes it five months sooner for ₱9,550 less
interest.

Settings is the stored preferences, read through `readPreferences` in
`src/lib/preferences.ts`, which falls back to a default for any value that is
not the type it should be — a restored file or an older version cannot take a
screen down with one bad row. Rows the app cannot honour yet carry a "Later"
badge instead of a switch that does nothing.

Categories & tags is the only screen that rewrites rows the rest of the app
reads. Reordering, merging and the tag edits are each one Dexie transaction
that hands back enough to undo it. Dragging is pointer-based, not HTML5
drag-and-drop, which never fires on a touchscreen; the handle answers the
arrow keys too.

Backup & data is the only copy of the ledger that survives a cleared browser,
so the file format lives on its own in `src/lib/backup.ts` — it carries every
table including the receipt blobs, refuses anything it cannot vouch for, and
can wrap the whole thing in AES-GCM under a PBKDF2 key when the user asks.

The lock renders *instead of* the app rather than over it, so nothing behind
it is reachable by a scroll, a screen reader or a devtools pane. The PIN goes
through `src/lib/pin.ts` (PBKDF2-SHA256, random salt, growing cooldowns);
fingerprint and face unlock go through `src/lib/webauthn.ts`, which asks the
device's own platform authenticator and checks both that the credential is the
one this app registered and that the authenticator says it verified a person.

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
- **A zero budget is no budget.** Clearing a limit deletes the row rather
  than storing `0`, which would read as "budgeted nothing" and make every
  peso an overspend.
- **Rollover carries a surplus, never a debt.** An overspent month carries
  zero into the next one; compounding a bad month into a worse one is not
  what the toggle promises.
- **Averages skip empty periods.** "Avg saved per month" divides by the
  periods that had activity, not by six — otherwise a year view that reaches
  back before the ledger existed quietly understates every month. The same
  thinking keeps the month still in progress out of "leanest month".
- **Reports is a lazy route.** Recharts is about a third of the bundle and
  only that screen draws a chart, so it loads on demand: the main chunk is
  698 kB instead of over a megabyte, and the service worker still precaches
  both so offline is unaffected.
- **A fourth colour: `warning`.** The budget mockup distinguishes "near the
  limit" from "over it", and negative alone cannot carry both without every
  budget reading as blown. It lives with the other tokens in
  `src/styles/tokens.css`.
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
  from, so `runReminders` in `src/features/settings/db.ts` raises at most one
  system notice a day per kind — bills, loans and budget alerts, each behind
  its own switch — and the copy on both screens says exactly that. The one
  reminder the mockup asks for and cannot be built is the 8pm daily nudge; it
  carries a "Later" badge, because nothing can wake a PWA at a set time.
- **Switching a reminder on asks the browser first.** Storing `true` for a
  notice the browser will never show is a setting that lies; the toggles are
  disabled outright, with the reason in the hint, where permission is denied.
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
- **A preference has to be made true, not just stored.** `savePreference`
  applies the theme and the currency as it writes them, and
  `applyStartupPreferences` puts the stored ones into force at launch, before
  the first screen prints a number.
- **Currency is a label, not a conversion.** Changing it re-prints every
  amount; it does not touch a stored figure, and the picker says so. Only
  two-decimal currencies are offered, because an amount *is* an integer
  number of hundredths — the yen would be stored a hundred times too large.
  Every amount on screen goes through `src/ui/Money.tsx`, which subscribes to
  the choice; that is also what keeps "hide amounts" covering all of them.
- **A category with history is archived, not deleted.** `removeCategory`
  deletes one nothing points at and archives the rest, so an entry from two
  years ago keeps its name instead of turning into "Uncategorised".
- **Merging adds budget limits together.** Two budgets for the same month
  cannot both stand, and the user budgeted that much for the spending either
  way. `mergeCategories` returns every row it touched so `undoMerge` can put
  the lot back — a merge rewrites history, and discovering it was wrong with
  no way out is not acceptable.
- **A backup is refused unless it is understood.** `parseBackup` returns a
  sentence to show rather than a half-read envelope: restoring a file we only
  half recognise would wipe the real data to put back rubbish. Restoring is
  a replace, not a merge — nothing could tell a restored duplicate from a
  real one.
- **Encryption is AES-GCM under PBKDF2-SHA256** (210k iterations, a fresh
  salt and IV per file). The password is never stored, which the screen says
  before the toggle goes on. GCM fails closed, so a wrong password and a
  tampered file give the same answer — and they mean the same thing to the
  reader.
- **A receipt that cannot be read does not stop the backup.** It is counted
  and reported instead; losing a photo is worth far less than losing the
  ledger over it.
- **The lock hides the screen; it does not encrypt the data.** IndexedDB is
  stored in the clear, so anyone with the unlocked device and a devtools
  window can read the ledger whatever the PIN says. What the lock is worth is
  the ordinary case — a phone handed over, a shoulder at a desk — and the
  Settings copy says exactly that rather than implying more. Encryption is
  what a *backup file* gets, because that is the copy that leaves the device.
- **The PIN is never stored**, only PBKDF2-SHA256 over it with a random salt,
  so reading the database does not hand anyone a PIN they may also be using
  elsewhere. That also means there is nothing to reset it from: "Forgot PIN?"
  offers erase-and-restore, and says what that costs without a backup file.
- **Guessable PINs are refused, not warned about.** A lock that opens to 1234
  is decoration, and 1234 is the first thing anyone tries.
- **The failed-attempt count and the cooldown live in the database**, not in
  memory. A lockout you could get past by reloading the page would not be one.
  The waits grow — 30s, 1m, 5m, 15m — which is what turns ten thousand
  four-digit combinations from an afternoon's work into nothing.
- **WebAuthn here is a local gate, not a proof to anyone.** With no server
  there is no challenge to verify a signature against, so two things are
  checked instead of assumed: the credential that answers has to be the one
  registered on this origin, and the authenticator has to set the
  user-verified flag — otherwise `userVerification: 'required'` is a request
  it is free to ignore, and a button press would unlock the app. A failed
  read does not count as a wrong PIN; a wet thumb is not an attacker.
- **A launch always locks; the interval only governs coming back.** The app
  was not away for a while, it was closed. Returning from the background
  measures against a `lastActiveAt` written when the app was left, so a phone
  asleep for an hour and a tab backgrounded for an hour behave the same and
  nothing has to keep running while the app is away.
- **The lock screen is dark in both themes**, which is why `--c-lock-*` is
  the one group of tokens in `src/styles/tokens.css` deliberately not
  redefined for dark mode. A light lock screen at night is a flashbang.
- **Unlocking is an opening**, so it re-applies "hide amounts on open" rather
  than handing back whatever state the session was left in.
- **Theme** is a `data-theme` attribute on `<html>` over CSS variables in
  `src/styles/tokens.css`; Tailwind colours all resolve through them. The
  preference lives in the IndexedDB `settings` table — `localStorage` holds a
  mirror used only to set the attribute before first paint.
- **Service worker** uses `registerType: 'prompt'`, so a new build waits
  behind the banner in `src/ui/UpdateBanner.tsx` rather than swapping itself
  in — reloading under someone mid-entry is not a trade worth making for a
  ledger. It is inert in dev. An installed app can run for days without a
  navigation, so the banner also asks the registration to look for a new
  build every hour and whenever the tab comes back to the front.
- **An update check has to survive being offline.** `registration.update()`
  rejects when it cannot fetch the script, which is precisely the state this
  app is built for; unguarded, it threw an unhandled rejection on every
  check with no signal. It is now skipped when the device reports no network
  and caught when it fails anyway.
- **Everything is precached, and there are no runtime caching rules.** Fonts
  are self-hosted and the only chunks are our own, so there is no third
  party left to cache at runtime — a `runtimeCaching` entry here would be
  decoration. `navigateFallback: 'index.html'` is what makes opening
  `/loans` offline work, since every route is served by the one document.
- **Precache entries must not be listed twice.** `includeAssets` and
  `includeManifestIcons` both add files the `globPatterns` sweep of `dist`
  already has; with all three on, ten of the twenty-two entries were
  duplicates and the reported precache size was a third too big. The glob
  alone covers `public/`, so the other two are off.
- **Form fields are 16px, one point above body text, on purpose.** iOS
  Safari zooms the page when a focused control is smaller than that, and the
  usual answer — `maximum-scale=1` in the viewport meta — pays for it by
  taking pinch-zoom away from everyone, which fails WCAG 1.4.4. Sizing the
  controls fixes the cause. `text-input` is the token; a base rule in
  `src/index.css` is the floor for anything that does not use `.field`,
  which matters most for the invisible `select` and `date` overlays behind
  the Quick Add chips, since those inherited 14px from the chip.
- **Icons** in `public/` are generated by `node scripts/make-icons.mjs`:
  the app mark at 192 and 512 in both plain and maskable (maskable art is
  inset so a circular crop does not clip it), an apple-touch icon, and a
  96px glyph per manifest shortcut.
- **Shortcuts are plain links**, three of them to routes. "Add an expense"
  cannot be — Quick Add is a sheet over whatever screen you are on — so it
  arrives as `/?add=expense`, which `src/lib/launch.ts` turns back into an
  action once the lock has let the app open. The parameter is then stripped,
  or a refresh would reopen the sheet.
- **Persistent storage is asked for once a day until it is granted.** Not
  once per install: Chrome decides on engagement, so the first ask on a new
  install is the one most likely to be refused and never retrying would
  leave the ledger evictable forever. Not every launch either, because
  Firefox puts a prompt on screen for it.
- **Category tiles** tint with `color-mix` against the surface and ink tokens,
  so one stored colour works in both themes.
- `resolve.dedupe` in the Vite config is load-bearing: without it
  `dexie-react-hooks` can resolve a second copy of React and every hook in the
  components using it throws.
