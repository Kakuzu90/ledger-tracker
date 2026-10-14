import { createBrowserRouter } from 'react-router-dom'
import { App } from '@/App'
import { TabLayout } from '@/ui/TabLayout'
import { SubLayout } from '@/ui/SubLayout'
import { NotFound } from '@/features/NotFound'

import { HomeScreen } from '@/features/home/HomeScreen'
import { ActivityScreen } from '@/features/activity/ActivityScreen'
import { CalendarScreen } from '@/features/activity/CalendarScreen'
import { TxnDetailScreen } from '@/features/transactions/TxnDetailScreen'
import { LoansScreen } from '@/features/loans/LoansScreen'
import { AddLoanScreen } from '@/features/loans/AddLoanScreen'
import { PersonScreen } from '@/features/loans/PersonScreen'
import { FormalLoanScreen } from '@/features/loans/FormalLoanScreen'
import { SplitScreen } from '@/features/split/SplitScreen'
import { AccountsScreen } from '@/features/accounts/AccountsScreen'
import { BudgetsScreen } from '@/features/budgets/BudgetsScreen'
import { BillsScreen } from '@/features/bills/BillsScreen'

/**
 * Route table mirrors the mockup list in CLAUDE.md.
 * TabLayout = bottom tab bar; SubLayout = back button, no tab bar.
 */
export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      {
        element: <TabLayout />,
        children: [
          { path: '/', element: <HomeScreen /> },
          { path: '/activity', element: <ActivityScreen /> },
          { path: '/activity/calendar', element: <CalendarScreen /> },
          { path: '/loans', element: <LoansScreen /> },
          {
            // Reports is the only screen that pulls in Recharts — around a
            // third of the bundle. Loading it on demand keeps that weight
            // out of every other screen's first paint.
            path: '/reports',
            lazy: async () => ({
              Component: (await import('@/features/reports/ReportsScreen')).ReportsScreen,
            }),
          },
        ],
      },
      {
        element: <SubLayout />,
        children: [
          { path: '/txn/:id', element: <TxnDetailScreen /> },
          { path: '/loans/new', element: <AddLoanScreen /> },
          { path: '/loans/person/:id', element: <PersonScreen /> },
          { path: '/loans/formal/:id', element: <FormalLoanScreen /> },
          { path: '/split/:txnId', element: <SplitScreen /> },
          { path: '/accounts', element: <AccountsScreen /> },
          { path: '/budgets', element: <BudgetsScreen /> },
          { path: '/bills', element: <BillsScreen /> },
          // Settings and the two screens under it are reached deliberately
          // and rarely, so they are not worth carrying in the chunk that
          // every first paint downloads.
          {
            path: '/settings',
            lazy: async () => ({
              Component: (await import('@/features/settings/SettingsScreen')).SettingsScreen,
            }),
          },
          {
            path: '/settings/categories',
            lazy: async () => ({
              Component: (await import('@/features/categories/CategoriesScreen'))
                .CategoriesScreen,
            }),
          },
          {
            path: '/settings/backup',
            lazy: async () => ({
              Component: (await import('@/features/backup/BackupScreen')).BackupScreen,
            }),
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
