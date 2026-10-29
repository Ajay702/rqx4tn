// Guided walkthrough for recording the demo video: drives a visible Brave
// window through the dashboard at presenting pace.
//   node demo.mjs [url]        (default http://localhost:8000)
import { chromium } from '@playwright/test'

const url = process.argv[2] ?? 'http://localhost:8000'
const brave = process.env.BROWSER_PATH ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
const pause = (s) => new Promise((r) => setTimeout(r, s * 1000))
const step = (msg) => console.log(`\n▶ ${msg}`)

const browser = await chromium.launch({ executablePath: brave, headless: false, args: ['--start-maximized'] })
const page = await browser.newPage({ viewport: null })
const scrollTo = (sel) => page.locator(sel).first().scrollIntoViewIfNeeded().then(() => pause(0.5))

step('Overview: forecast at decision time vs actual')
await page.goto(url)
await page.locator('.recharts-wrapper').first().waitFor()
await pause(8)
await page.locator('.recharts-wrapper').first().hover({ position: { x: 300, y: 120 } })
await pause(5)

step('KPIs: bias and P90 shortfall')
await scrollTo('.kpis')
await pause(8)

step('Change the decision cutoff to 08:00')
await page.locator('input[type=time]').fill('08:00')
await pause(5)

step('Fixed lead time: sweep 1h -> 48h')
await page.getByRole('radio', { name: 'Fixed lead time' }).click()
for (const h of [1, 6, 12, 24, 36, 48]) {
  await page.getByLabel('Lead time in hours').fill(String(h))
  await pause(1.5)
}
await page.getByRole('radio', { name: 'Day-ahead decision' }).click()

step('Accuracy vs lead time + error distribution')
await page.mouse.wheel(0, 600)
await pause(10)

step('Time of day + daily error')
await page.mouse.wheel(0, 400)
await pause(8)

step('Forecast evolution for 28 Jan (worst day)')
await page.getByLabel('Delivery day').fill('2026-01-28')
await scrollTo('input[aria-label="Delivery day"]')
await pause(10)

step('Method')
await page.mouse.wheel(0, 600)
await pause(6)

console.log('\nDone. Close the window or press Ctrl+C.')
await page.waitForEvent('close', { timeout: 0 })
await browser.close()
