import { expect, test } from '@playwright/test'

test('the bottom tabs move between the top-level screens', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Ledger' })).toBeVisible()

  const tabs = page.getByRole('navigation', { name: 'Main' })
  await tabs.getByRole('link', { name: 'Activity' }).click()
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()

  await tabs.getByRole('link', { name: 'Loans' }).click()
  await expect(page.getByRole('heading', { name: 'Loans' })).toBeVisible()

  await tabs.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
})

test('sub-screens hide the tab bar and offer a way back', async ({ page }) => {
  await page.goto('/accounts')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
})

test('the FAB opens the quick-add sheet', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Add transaction' }).click()
  await expect(page.getByRole('dialog', { name: 'New transaction' })).toBeVisible()
})
