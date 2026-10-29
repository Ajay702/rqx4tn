import { expect, test } from '@playwright/test'

test('dashboard loads with charts and January KPIs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Windcast' })).toBeVisible()
  await expect(page.getByText('forecast runs')).toBeVisible()

  // Six charts render once data arrives (count wrappers: legend icons are SVGs too).
  await expect(page.locator('.recharts-wrapper')).toHaveCount(6, { timeout: 15_000 })
  await expect(page.locator('.kpi-value').first()).toContainText('GW')

  await page.screenshot({ path: 'screenshots/dashboard.png', fullPage: true })
  expect(errors).toEqual([])
})

test('switching to fixed lead time changes the metrics', async ({ page }) => {
  await page.goto('/')
  const mae = page.locator('.kpi-value').first()
  await expect(mae).toContainText('GW')
  const before = await mae.textContent()

  await page.getByRole('radio', { name: 'Fixed lead time' }).click()
  const slider = page.getByLabel('Lead time in hours')
  await slider.fill('1')
  await expect(page.getByText('1h', { exact: true })).toBeVisible()
  await expect(mae).not.toHaveText(before!)
})

test('clicking a day in the daily chart drives the evolution chart', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Delivery day').fill('2026-01-20')
  await expect(page.getByRole('heading', { name: /evolved for 20 Jan/ })).toBeVisible()
})

test('API rejects bad input', async ({ request }) => {
  const res = await request.get('/api/series?start=2026-01-10&end=2026-01-01')
  expect(res.status()).toBe(422)
})
