import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('create links -> typed interview -> results zip -> import', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Create links' })).toBeVisible()
  await page.getByRole('button', { name: 'Create links' }).click()
  const links = page.getByRole('textbox', { name: /^Link \d+$/ })
  await expect(links).toHaveCount(5)
  const url = await links.first().inputValue()
  const hash = url.slice(url.indexOf('#'))

  const cand = await context.newPage()
  await cand.goto('/?test=1' + hash)
  await expect(cand.getByRole('heading', { name: 'Frontend Developer (React)' })).toBeVisible()
  await cand.getByLabel(/Your name/).fill('Asha')
  await cand.getByRole('button', { name: 'Start interview' }).click()
  const ai = cand.getByTestId('ai')
  const box = cand.getByLabel('Your answer')
  const send = async (text: string) => {
    await expect(cand.getByRole('button', { name: 'Send' })).toBeDisabled()
    await box.fill(text)
    await cand.getByRole('button', { name: 'Send' }).click()
  }
  await expect(ai).toContainText('Tell me about yourself')
  await send("I'm a frontend developer with five years of experience, mainly React and TypeScript.")
  await expect(ai).toContainText('5 years')
  await send('Yes, that is right.')
  for (let i = 0; i < 20; i++) {
    if (await cand.getByRole('heading', { name: /Thank you/ }).isVisible()) break
    await expect(ai).not.toHaveText('')
    await send('State lives in the component and props come from the parent to the child; changes re-render. I use useEffect with a dependency array and cleanup, plus media query, flexbox and grid for responsive layouts.')
    await cand.waitForTimeout(150)
  }
  await expect(cand.getByRole('heading', { name: 'Thank you, Asha!' })).toBeVisible()
  const [dl] = await Promise.all([cand.waitForEvent('download'), cand.getByRole('button', { name: /Download results/ }).click()])
  const zipPath = await dl.path()

  await page.locator('input[type=file][accept=".zip"]').setInputFiles({ name: dl.suggestedFilename(), mimeType: 'application/zip', buffer: readFileSync(zipPath!) })
  await expect(page.getByText('Imported 1 file(s).')).toBeVisible()
  await page.getByRole('button', { name: /Asha/ }).click()
  await expect(page.getByText(/5 years · Frontend Developer · Mid-level/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible()
})

test('profiles page: sample job description fills technologies', async ({ page }) => {
  await page.goto('/#/profiles')
  await page.getByRole('button', { name: 'New profile' }).click()
  await page.getByLabel('Use a sample').selectOption({ label: 'Job description – Java Backend Engineer' })
  await expect(page.getByLabel(/Required technologies/)).toHaveValue(/Java.*Spring.*Kafka/)
  await expect(page.getByLabel('Role name')).toHaveValue('Java Backend Engineer')
})
