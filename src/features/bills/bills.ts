/**
 * Bills & recurring (design/Bills.dc.html): what is coming, what it costs a
 * month, and which rules decide for themselves.
 *
 * The forecast is two things joined: occurrences a rule will still produce,
 * and the ones the scheduler has already materialised but nobody has decided
 * on yet. A pending bill is every bit as much an upcoming payment as one the
 * rule has not reached.
 */

import { addDays, endOfWeek, format, parseISO } from 'date-fns'
import type {
  Account,
  Category,
  Centavos,
  DateOnly,
  Recurring,
  RecurringMode,
  Transaction,
} from '@/db/types'
import { sumMoney } from '@/lib/money'
import { advanceDate, hasEnded } from '@/lib/recurring'
import { toDateOnly } from '@/lib/dates'

/** The tag that marks a rule as a subscription, set by the rule form. */
export const SUBSCRIPTION_TAG = 'subscription'

/** How far the list looks ahead. */
export const HORIZON_DAYS = 35
/** The window the "next 30 days" card totals. */
export const SUMMARY_DAYS = 30

export interface BillRow {
  /** Unique within the list: a pending row is keyed by its transaction. */
  key: string
  rule?: Recurring
  /** Set when the scheduler has already made this occurrence. */
  pending?: Transaction
  date: DateOnly
  /** "Oct" / "14" for the date tile. */
  month: string
  day: string
  title: string
  /** "Today · GCash", "Subscription · Visa", "Varies · last ₱3,410". */
  subtitle: string
  amount: Centavos
  /** The figure is a guess from past entries, so it prints with a "~". */
  estimated: boolean
  /** What the rule last actually cost, printed beside a guess. */
  lastAmount?: Centavos
  mode: RecurringMode
  /** Due today or overdue. */
  due: boolean
}

export interface BillsView {
  /** Due within the next seven days, overdue entries included. */
  thisWeek: BillRow[]
  later: BillRow[]
  next30: { total: Centavos; count: number }
  subscriptions: { monthly: Centavos; yearly: Centavos; count: number }
  /** Every rule, for the manage list. */
  rules: RuleRow[]
}

export interface RuleRow {
  rule: Recurring
  title: string
  /** "Monthly · GCash · next Nov 14" */
  subtitle: string
  amount: Centavos
  subscription: boolean
  ended: boolean
}

export interface BillsInput {
  rules: readonly Recurring[]
  accounts: readonly Account[]
  categories: readonly Category[]
  /** Only needs the pending rows and anything a rule has produced. */
  transactions: readonly Transaction[]
}

const FREQ_LABEL: Readonly<Record<Recurring['freq'], string>> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

/** "Monthly", or "Every 3 months" once the interval is more than one. */
export function cadence(freq: Recurring['freq'], interval: number): string {
  if (interval <= 1) return FREQ_LABEL[freq]
  const unit = { daily: 'days', weekly: 'weeks', monthly: 'months', yearly: 'years' }[freq]
  return `Every ${interval} ${unit}`
}

export const isSubscription = (rule: Recurring): boolean =>
  rule.template.tags.includes(SUBSCRIPTION_TAG)

/** A monthly figure for any cadence, so subscriptions can be added up. */
export function monthlyCost(rule: Recurring): Centavos {
  const per = { daily: 30, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 }[rule.freq]
  return Math.round((rule.template.amount * per) / Math.max(1, rule.interval))
}

/**
 * What a rule's own entries say it actually costs. A bill that lands at a
 * different figure every month — electricity, water — is worth flagging as a
 * guess rather than printing a number the user will take literally.
 */
export function estimateFrom(
  rule: Recurring,
  transactions: readonly Transaction[],
): { amount: Centavos; estimated: boolean; last?: Centavos } {
  const history = transactions
    .filter((txn) => txn.recurringId === rule.id && txn.status === 'posted')
    .sort((a, b) => b.date.localeCompare(a.date))

  const last = history[0]?.amount
  if (last === undefined) return { amount: rule.template.amount, estimated: false }

  const varies = history.some((txn) => txn.amount !== rule.template.amount)
  if (!varies) return { amount: rule.template.amount, estimated: false, last }

  // The mean of the last three, to the nearest hundred pesos: enough to plan
  // around, visibly not a quoted figure.
  const recent = history.slice(0, 3).map((txn) => txn.amount)
  const mean = Math.round(sumMoney(recent) / recent.length)
  return { amount: Math.round(mean / 100_00) * 100_00, estimated: true, last }
}

export function buildBillsView(
  { rules, accounts, categories, transactions }: BillsInput,
  today: Date = new Date(),
): BillsView {
  const todayIso = toDateOnly(today)
  const horizon = toDateOnly(addDays(today, HORIZON_DAYS))
  // The rest of this calendar week, not a rolling seven days: "this week"
  // should stop on Sunday the way a wall calendar does.
  const weekEnd = toDateOnly(endOfWeek(today, { weekStartsOn: 1 }))
  const summaryEnd = toDateOnly(addDays(today, SUMMARY_DAYS))

  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const categoryName = new Map(categories.map((category) => [category.id, category.name]))
  const ruleById = new Map(rules.map((rule) => [rule.id, rule]))

  const rows: BillRow[] = []

  /**
   * "Today · GCash", "Subscription · Visa", "Varies · GCash". Two parts only:
   * the row is 390px wide and the amount has to fit beside it.
   */
  const describe = (rule: Recurring, date: DateOnly, estimated: boolean): string => {
    // What it last cost says more about a bill that moves than which account
    // it leaves from, and the row only has space for one of them.
    if (estimated) return 'Varies'

    const lead =
      date === todayIso
        ? 'Today'
        : isSubscription(rule)
          ? 'Subscription'
          : cadence(rule.freq, rule.interval)

    const where =
      accountName.get(rule.template.accountId) ??
      (rule.template.categoryId ? categoryName.get(rule.template.categoryId) : undefined)

    return [lead, where].filter(Boolean).join(' · ')
  }

  // Occurrences the scheduler has already made and nobody has answered.
  for (const txn of transactions) {
    if (txn.status !== 'pending') continue
    const rule = txn.recurringId ? ruleById.get(txn.recurringId) : undefined
    rows.push({
      key: txn.id,
      ...(rule ? { rule } : {}),
      pending: txn,
      date: txn.date,
      month: format(parseISO(txn.date), 'MMM'),
      day: format(parseISO(txn.date), 'd'),
      title: txn.note || (rule?.template.note ?? 'Payment'),
      subtitle: [
        txn.date === todayIso ? 'Today' : rule ? cadence(rule.freq, rule.interval) : 'One-off',
        accountName.get(txn.accountId),
      ]
        .filter(Boolean)
        .join(' · '),
      amount: txn.amount,
      estimated: false,
      mode: rule?.mode ?? 'confirm',
      due: txn.date <= todayIso,
    })
  }

  // Occurrences still to come, walked out to the horizon.
  for (const rule of rules) {
    if (hasEnded(rule)) continue
    const estimate = estimateFrom(rule, transactions)

    let cursor = rule.nextDate
    for (let i = 0; cursor <= horizon && i < 64; i++) {
      if (rule.endDate !== undefined && cursor > rule.endDate) break
      rows.push({
        key: `${rule.id}@${cursor}`,
        rule,
        date: cursor,
        month: format(parseISO(cursor), 'MMM'),
        day: format(parseISO(cursor), 'd'),
        title: rule.template.note || 'Payment',
        subtitle: describe(rule, cursor, estimate.estimated),
        amount: estimate.amount,
        estimated: estimate.estimated,
        ...(estimate.estimated && estimate.last !== undefined
          ? { lastAmount: estimate.last }
          : {}),
        mode: rule.mode,
        due: cursor <= todayIso,
      })
      cursor = advanceDate(cursor, rule.freq, rule.interval)
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))

  const within = rows.filter((row) => row.date <= summaryEnd)
  const subscriptions = rules.filter((rule) => isSubscription(rule) && !hasEnded(rule))
  const monthly = sumMoney(subscriptions.map(monthlyCost))

  return {
    thisWeek: rows.filter((row) => row.date <= weekEnd),
    later: rows.filter((row) => row.date > weekEnd),
    next30: { total: sumMoney(within.map((row) => row.amount)), count: within.length },
    subscriptions: { monthly, yearly: monthly * 12, count: subscriptions.length },
    rules: rules
      .map((rule): RuleRow => {
        const estimate = estimateFrom(rule, transactions)
        return {
          rule,
          title: rule.template.note || 'Payment',
          // The account goes last: it is the part worth losing when the row
          // truncates.
          subtitle: [
            cadence(rule.freq, rule.interval),
            hasEnded(rule) ? 'ended' : `next ${format(parseISO(rule.nextDate), 'MMM d')}`,
            accountName.get(rule.template.accountId),
          ]
            .filter(Boolean)
            .join(' · '),
          amount: estimate.amount,
          subscription: isSubscription(rule),
          ended: hasEnded(rule),
        }
      })
      .sort((a, b) => a.rule.nextDate.localeCompare(b.rule.nextDate)),
  }
}

/** The rows worth a notification: due today, or within `days`. */
export function dueSoon(view: BillsView, days = 1, today: Date = new Date()): BillRow[] {
  const edge = toDateOnly(addDays(today, days))
  return view.thisWeek.filter((row) => row.date <= edge)
}
