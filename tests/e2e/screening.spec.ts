import { expect, test } from '@playwright/test'

const cv = `Priya Shah
priya.shah@example.com
Location: Bengaluru
Skills: React, TypeScript, CSS
6 years experience
Led the migration of our design system and cut the bundle by 30 percent.
`

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Full flow runs on desktop Chromium with a fake camera.')
  await page.addInitScript(() => {
    localStorage.setItem('hiring-disable-llm', '1')
    const spoken: string[] = []
    ;(window as unknown as { __spoken: string[] }).__spoken = spoken
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [{ name: 'Test Voice', lang: 'en-US', default: true, localService: true, voiceURI: 'test' }],
      speak(utterance: { text: string; onend?: () => void }) {
        spoken.push(utterance.text)
        utterance.onend?.()
      },
      cancel() {},
      resume() {},
      pause() {},
      addEventListener() {},
      removeEventListener() {},
    }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth })
    class FakeRecognition {
      continuous = false
      interimResults = false
      lang = 'en-US'
      onresult: ((event: unknown) => void) | null = null
      onerror: ((event: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      start() {
        ;(window as unknown as { __rec: FakeRecognition }).__rec = this
      }
      stop() {
        this.onend?.()
      }
      abort() {
        this.onend?.()
      }
    }
    ;(window as unknown as { SpeechRecognition: typeof FakeRecognition }).SpeechRecognition = FakeRecognition
    ;(window as unknown as { webkitSpeechRecognition: typeof FakeRecognition }).webkitSpeechRecognition = FakeRecognition
  })
})

test('screens a CV, speaks the script, records, and saves a partial report', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('role-title').fill('Senior frontend engineer')
  await page.getByTestId('role-skills').fill('React, TypeScript, CSS')
  await page.getByTestId('role-years').fill('5')
  await page.getByTestId('role-location').fill('Bengaluru')
  await page.getByTestId('role-budget-min').fill('20')
  await page.getByTestId('role-budget-max').fill('40')
  await page.getByTestId('save-role').click()
  await page.getByTestId('add-cvs').setInputFiles({ name: 'priya.txt', mimeType: 'text/plain', buffer: Buffer.from(cv) })
  await expect(page.getByTestId('candidate-name')).toContainText('Priya Shah')
  await expect(page.getByText(/CV match/)).toBeVisible()

  await page.waitForFunction(() => document.querySelector('[data-testid="interview-url"]')?.getAttribute('data-url'))
  const url = await page.getByTestId('interview-url').getAttribute('data-url')
  if (!url) throw new Error('missing interview link')
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
  await page.getByTestId('consent-check').check()
  await page.getByTestId('start-interview').click()
  await expect(page.getByTestId('bot-line')).toContainText('Priya Shah', { timeout: 20_000 })
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)
  expect(spoken.some((line) => line.includes('Tell me a little'))).toBe(true)

  await page.waitForFunction(() => Boolean((window as unknown as { __rec?: unknown }).__rec))
  await page.evaluate(() => {
    const rec = (window as unknown as { __rec?: { onresult: ((event: unknown) => void) | null } }).__rec
    rec?.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: 'I build React and TypeScript products in Bengaluru every day.', confidence: 0.42 } }],
    })
  })
  await expect(page.getByTestId('bot-line')).toContainText('proud of', { timeout: 15_000 })
  await page.getByTestId('answer-input').fill('I am proud of a design system that made checkout faster for customers.')
  await page.getByTestId('send-answer').click()
  await expect(page.getByTestId('bot-line')).toContainText('[Replace this question]', { timeout: 15_000 })
  await page.getByTestId('end-interview').click()
  await expect(page.getByTestId('done')).toBeVisible()
  await expect(page.getByTestId('partial-banner')).toBeVisible()
  await expect(page.getByTestId('video-saved')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByTestId('download-bundle').click()
  const file = await download
  expect(file.suggestedFilename()).toContain('result.zip')

  await page.goto('/')
  await expect(page.getByTestId('candidate-card')).toContainText('Partial')
  await page.getByTestId('open-report').click()
  await expect(page.getByTestId('partial-banner')).toBeVisible()
  await expect(page.getByTestId('rubric-version')).toContainText('1.0.0')
  await expect(page.getByTestId('score')).toBeVisible()
  const pdf = page.waitForEvent('download')
  await page.getByTestId('download-pdf').click()
  expect((await pdf).suggestedFilename()).toContain('.pdf')
})

test('settings bump the score rules version', async ({ page }) => {
  await page.goto('/#/settings')
  await page.getByTestId('shortlist-min').fill('80')
  await page.getByTestId('save-settings').click()
  await expect(page.getByText('Score rules version 1.0.1')).toBeVisible()
})