import { expect, test, type Page } from '@playwright/test'
import { API_URL } from '../helpers'
import type { PatientsPage, PatientSummary, SummaryGenerator } from '../types'

// The test server has LLM summaries turned off, so these tests stand in for a
// server that has them on: the summary response is intercepted and rewritten.
// What is under test is the panel: who it says wrote the narrative, the
// choice it offers, and what it shows when the LLM could not answer.

const AI_NARRATIVE = 'Tex came in short of breath on September 1 and is being followed closely.'

async function texHolloway(page: Page) {
  const list = (await (
    await page.request.get(`${API_URL}/patients?q=tex holloway`)
  ).json()) as PatientsPage
  const tex = list.items[0]!
  const real = (await (
    await page.request.get(`${API_URL}/patients/${tex.id}/summary`)
  ).json()) as PatientSummary
  return { tex, real }
}

/** Answer summary requests as a server with DeepSeek configured would. */
async function serveSummaries(
  page: Page,
  real: PatientSummary,
  respond: (asked: { generator: string; refresh: boolean }) => Partial<PatientSummary>,
) {
  const asked: { generator: string; refresh: boolean }[] = []
  await page.route('**/api/patients/*/summary*', async (route) => {
    const params = new URL(route.request().url()).searchParams
    const request = {
      generator: params.get('generator') ?? 'auto',
      refresh: params.get('refresh') === 'true',
    }
    asked.push(request)
    const available: SummaryGenerator[] = ['deepseek', 'template']
    await route.fulfill({ json: { ...real, available_generators: available, ...respond(request) } })
  })
  return asked
}

const byDeepSeek = (narrative = AI_NARRATIVE): Partial<PatientSummary> => ({
  generator: 'deepseek',
  model: 'deepseek-flash',
  narrative,
  fallback_reason: null,
})

test('with no LLM configured, the summary is the template and offers no choice', async ({
  page,
}) => {
  const { tex } = await texHolloway(page)
  await page.goto(`/patients/${tex.id}?tab=summary`)
  const summary = page.getByRole('region', { name: 'Summary' })

  await expect(summary.getByText(/^There are 3 clinical notes on file/)).toBeVisible()
  await expect(summary.getByText(/^Written by/)).toHaveCount(0)
  await expect(summary.getByText(/AI-generated/)).toHaveCount(0)
  await expect(summary.getByRole('combobox', { name: 'Summary written by' })).toHaveCount(0)
})

test('an LLM-written narrative is labelled with its provider and model @mobile', async ({
  page,
}) => {
  const { tex, real } = await texHolloway(page)
  await serveSummaries(page, real, () => byDeepSeek())
  await page.goto(`/patients/${tex.id}?tab=summary`)
  const summary = page.getByRole('region', { name: 'Summary' })

  await expect(summary.getByText(AI_NARRATIVE)).toBeVisible()
  await expect(summary.getByText('Written by DeepSeek (deepseek-flash)')).toBeVisible()
  await expect(summary.getByText(/AI-generated from this patient's notes/)).toBeVisible()
  // The facts around the narrative still come straight from the record.
  await expect(summary.getByText('COPD', { exact: true })).toBeVisible()
  await expect(summary.getByText('Sulfa drugs')).toBeVisible()
})

test('the reader can switch between the LLM and the standard template', async ({ page }) => {
  const { tex, real } = await texHolloway(page)
  const asked = await serveSummaries(page, real, ({ generator }) =>
    generator === 'template'
      ? { generator: 'template', model: null, fallback_reason: null }
      : byDeepSeek(),
  )
  await page.goto(`/patients/${tex.id}?tab=summary`)
  const summary = page.getByRole('region', { name: 'Summary' })
  const picker = summary.getByRole('combobox', { name: 'Summary written by' })

  // The server's default is offered first and selected.
  await expect(picker.getByRole('option')).toHaveText(['DeepSeek', 'Standard template'])
  await expect(picker).toHaveValue('deepseek')
  await expect(summary.getByText(AI_NARRATIVE)).toBeVisible()

  await picker.selectOption('Standard template')
  await expect(summary.getByText(/^There are 3 clinical notes on file/)).toBeVisible()
  await expect(summary.getByText(/^Written by/)).toHaveCount(0)
  expect(asked.at(-1)).toEqual({ generator: 'template', refresh: false })

  await picker.selectOption('DeepSeek')
  await expect(summary.getByText(AI_NARRATIVE)).toBeVisible()
  expect(asked.at(-1)).toEqual({ generator: 'deepseek', refresh: false })
})

test('Regenerate asks the LLM for a fresh narrative', async ({ page }) => {
  const { tex, real } = await texHolloway(page)
  const asked = await serveSummaries(page, real, ({ refresh }) =>
    byDeepSeek(refresh ? 'A second take on the same notes.' : AI_NARRATIVE),
  )
  await page.goto(`/patients/${tex.id}?tab=summary`)
  const summary = page.getByRole('region', { name: 'Summary' })
  await expect(summary.getByText(AI_NARRATIVE)).toBeVisible()

  await summary.getByRole('button', { name: 'Regenerate' }).click()

  await expect(summary.getByText('A second take on the same notes.')).toBeVisible()
  expect(asked.at(-1)).toEqual({ generator: 'auto', refresh: true })
})

test('when the LLM cannot answer, the template is shown with the reason', async ({ page }) => {
  const { tex, real } = await texHolloway(page)
  await serveSummaries(page, real, () => ({
    generator: 'template',
    model: null,
    fallback_reason: 'the provider took too long to answer',
  }))
  await page.goto(`/patients/${tex.id}?tab=summary`)
  const summary = page.getByRole('region', { name: 'Summary' })

  // A complete summary is still there...
  await expect(summary.getByText(/^There are 3 clinical notes on file/)).toBeVisible()
  // ...with a plain statement of what happened, and no AI label.
  const notice = summary.getByRole('alert').filter({ hasText: 'AI summary unavailable' })
  await expect(notice).toContainText(
    'Showing the standard summary instead: the provider took too long to answer.',
  )
  await expect(summary.getByText(/^Written by/)).toHaveCount(0)
})
