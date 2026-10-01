import { expect, test } from '@playwright/test'
import { API_URL } from '../helpers'
import type { PatientStats } from '../types'

test('the dashboard shows patient counts from the API @mobile', async ({ page, request }) => {
  const stats = (await (await request.get(`${API_URL}/patients/stats`)).json()) as PatientStats
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  // Counts can shift by a few while other tests add and remove patients, so
  // check the seeded critical count, which nothing else changes.
  await expect(
    page.getByRole('link', { name: `Critical: ${stats.by_status.critical}. View in patient list` }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /^Total patients: \d+/ })).toBeVisible()
})

test('the dashboard lists critical patients and recent visits', async ({ page }) => {
  await page.goto('/')

  const attention = page.getByRole('region', { name: 'Needs attention' })
  await expect(attention.getByRole('link', { name: 'Clementine Hayes' })).toBeVisible()
  await expect(attention.getByText('Congestive heart failure')).toBeVisible()

  const recent = page.getByRole('region', { name: 'Recent visits' })
  await expect(recent.getByRole('listitem')).toHaveCount(6)

  await recent.getByRole('link', { name: 'Tex Holloway' }).click()
  await expect(page.getByRole('heading', { name: 'Tex Holloway' })).toBeVisible()
})

test('a stat card opens the patient list with that status applied', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('link', { name: /^Critical: \d+\. View in patient list$/ }).click()

  // The filter is part of the address, so this view can be bookmarked.
  await expect(page).toHaveURL('/patients?status=critical')
  await expect(page.getByRole('radio', { name: 'Critical' })).toBeChecked()
  const statuses = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell') })
    .getByText(/^(Active|Inactive|Critical)$/)
  await expect(statuses.first()).toHaveText('Critical')
  expect(new Set(await statuses.allTextContents())).toEqual(new Set(['Critical']))
})

test('the dashboard explains itself when the API is down', async ({ page }) => {
  await page.route('**/api/patients**', (route) => route.abort())
  await page.goto('/')

  await expect(page.getByText('Could not load the numbers')).toBeVisible()
  await expect(page.getByText('Could not reach the server').first()).toBeVisible()
})
