import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hiring-disable-llm', '1'))
})

test('dashboard, report, and interview fit the viewport', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByTestId('load-example').click()
  await expect(page.getByTestId('candidate-card').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-dashboard.png`, fullPage: true })

  await page.getByTestId('open-report').first().click()
  await expect(page.getByTestId('score')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-report.png`, fullPage: false })

  await page.goto('/')
  const url = await page.getByTestId('interview-url').first().getAttribute('data-url')
  if (!url) throw new Error('missing interview link')
  await page.goto(url)
  await expect(page.getByTestId('consent-check')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-interview.png`, fullPage: true })

  await page.getByTestId('consent-check').check()
  await page.getByTestId('start-interview').click()
  const withoutVideo = page.getByTestId('continue-without-video')
  if (await withoutVideo.isVisible().catch(() => false)) await withoutVideo.click()
  const bot = page.getByTestId('bot-line')
  const failed = page.getByText('could not start')
  await expect(bot.or(failed)).toBeVisible({ timeout: 20_000 })
  if (await bot.isVisible()) {
    await page.getByTestId('answer-input').fill('I build reliable interfaces and I am happy to walk through a recent project.')
    await page.getByTestId('send-answer').click()
    await expect(page.getByTestId('bot-line')).not.toHaveText('', { timeout: 15_000 })
  }
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-interview-live.png`, fullPage: true })
})

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)
  expect(overflow).toBe(false)
}