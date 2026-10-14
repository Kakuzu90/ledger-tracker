import { db } from './db'
import { ensureSeeded } from './seed'
import { loadSampleData } from './sample'

export interface BootstrapResult {
  categoriesAdded: number
  settingsAdded: number
  sampleLoaded: boolean
}

/**
 * Runs once per launch: default categories and settings always, and — in dev
 * only — the demo dataset when there is nothing to look at yet, so the screens
 * have realistic data to render. A real install never loads sample data on its
 * own; that stays an explicit action.
 */
export async function bootstrapDatabase(): Promise<BootstrapResult> {
  const seeded = await ensureSeeded(db)

  let sampleLoaded = false
  if (import.meta.env.DEV && (await db.transactions.count()) === 0) {
    await loadSampleData(db)
    sampleLoaded = true
  }

  return { ...seeded, sampleLoaded }
}
