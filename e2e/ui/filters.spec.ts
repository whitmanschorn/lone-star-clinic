import { expect, test, type Page } from '@playwright/test'
import { API_URL } from '../helpers'
import type { PatientsPage } from '../types'

function patientRows(page: Page) {
  return page.getByRole('row').filter({ has: page.getByRole('cell') })
}

const names = (page: Page) => patientRows(page).locator('td:nth-child(1)')
const ages = async (page: Page) =>
  (await patientRows(page).locator('td:nth-child(2)').allTextContents()).map(Number)

/** The path and query the browser is on, with the query's parameters sorted. */
function address(page: Page): string {
  const url = new URL(page.url())
  url.searchParams.sort()
  return url.pathname + url.search
}

/** Open the filter panel if it is not open already (the button is a toggle). */
async function openFilters(page: Page) {
  const button = page.getByRole('button', { name: /^Filters/ })
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  const panel = page.getByRole('form', { name: 'Filters' })
  await expect(panel).toBeVisible()
  return panel
}

const activeFilters = (page: Page) => page.getByRole('group', { name: 'Active filters' })

/**
 * Wait until no list request is in flight. While one is, the previous rows
 * stay on screen, so anything read before this may be the old result.
 */
async function listSettled(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: 'Updating…' })).toHaveCount(0)
}

test.describe('advanced filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patients')
    await expect(patientRows(page)).toHaveCount(20)
  })

  test('filters by condition, medication, allergy and city', async ({ page }) => {
    const cases: [string, string, string, string][] = [
      ['Condition contains', 'kidney', 'Condition: kidney', 'Clementine Hayes'],
      ['Medication contains', 'apixaban', 'Medication: apixaban', 'Tex Holloway'],
      ['Allergy contains', 'venom', 'Allergy: venom', 'Doc Sutherland'],
      ['City contains', 'marfa', 'City: marfa', 'Dusty Ramirez'],
    ]
    for (const [label, value, chip, patient] of cases) {
      const panel = await openFilters(page)
      // Clearing applies "no filters" and closes the panel; open it again.
      await panel.getByRole('button', { name: 'Clear filters' }).click()
      await expect(panel).toBeHidden()
      await openFilters(page)
      await panel.getByLabel(label).fill(value)
      // Enter applies, like any form.
      await panel.getByLabel(label).press('Enter')

      await expect(names(page)).toHaveText([patient])
      await expect(activeFilters(page).getByText(chip)).toBeVisible()
      await expect(page.getByText('Showing 1–1 of 1')).toBeVisible()
    }
  })

  test('filters by an age range and by blood type together', async ({ page, request }) => {
    const panel = await openFilters(page)
    await panel.getByLabel('Minimum age').fill('60')
    await panel.getByLabel('Maximum age').fill('69')
    await panel.getByRole('group', { name: 'Blood type' }).getByText('O+', { exact: true }).click()
    await panel.getByRole('group', { name: 'Blood type' }).getByText('A-', { exact: true }).click()
    await panel.getByRole('button', { name: 'Apply filters' }).click()

    // The panel closes and the filters are summarised as chips.
    await expect(panel).toBeHidden()
    await expect(activeFilters(page).getByText('Age 60–69')).toBeVisible()
    await expect(activeFilters(page).getByText('Blood type A-, O+')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Filters, 2 applied' })).toBeVisible()

    const expected = (await (
      await request.get(
        `${API_URL}/patients?min_age=60&max_age=69&blood_type=O%2B&blood_type=A-&page_size=100`,
      )
    ).json()) as PatientsPage
    expect(expected.total).toBeGreaterThan(0)
    await expect(patientRows(page)).toHaveCount(Math.min(expected.total, 20))
    await expect(page.getByText(new RegExp(` of ${expected.total}$`))).toBeVisible()
    await listSettled(page)
    for (const age of await ages(page)) {
      expect(age).toBeGreaterThanOrEqual(60)
      expect(age).toBeLessThanOrEqual(69)
    }
  })

  test('filters by last visit dates', async ({ page }) => {
    const panel = await openFilters(page)
    await panel.getByLabel('Last visit from').fill('2020-01-01')
    await panel.getByLabel('Last visit to').fill('2025-05-31')
    await panel.getByRole('button', { name: 'Apply filters' }).click()

    await expect(
      activeFilters(page).getByText('Last visit Jan 1, 2020 – May 31, 2025'),
    ).toBeVisible()
    await listSettled(page)
    const visits = await patientRows(page).locator('td:nth-child(3)').allTextContents()
    expect(visits.length).toBeGreaterThan(0)
    for (const visit of visits) {
      expect(new Date(visit).getTime()).toBeLessThanOrEqual(new Date('May 31, 2025').getTime())
    }
  })

  test('combines with the search, the status filter and the sort', async ({ page }) => {
    await page.getByRole('radiogroup', { name: 'Filter by status' }).getByText('Critical').click()
    const panel = await openFilters(page)
    await panel.getByLabel('Minimum age').fill('70')
    await panel.getByRole('button', { name: 'Apply filters' }).click()
    await page.getByRole('columnheader', { name: 'Age' }).getByRole('button').click()
    await page.getByRole('columnheader', { name: 'Age' }).getByRole('button').click()

    await expect(names(page).first()).toHaveText('Clementine Hayes')
    await expect(names(page).nth(1)).toHaveText('Buck Abbott')
    await listSettled(page)
    expect((await ages(page)).every((age) => age >= 70)).toBe(true)

    await page.getByRole('textbox', { name: 'Search patients' }).fill('holloway')
    await expect(names(page)).toHaveText(['Tex Holloway'])
  })

  test('a chip removes one filter, and "Clear all filters" removes the rest', async ({ page }) => {
    const panel = await openFilters(page)
    await panel.getByLabel('Minimum age').fill('85')
    await panel.getByLabel('City contains').fill('a')
    await panel.getByLabel('Condition contains').fill('e')
    await panel.getByRole('button', { name: 'Apply filters' }).click()
    await expect(activeFilters(page).getByText('Age 85 and over')).toBeVisible()
    // Wait for the three filters' result before counting it.
    await expect(page.getByText(/^Showing 1–(\d) of \1$/)).toBeVisible()
    const narrowed = await patientRows(page).count()

    await page.getByRole('button', { name: 'Remove filter: Condition: e' }).click()
    await expect(activeFilters(page).getByText('Condition: e')).toHaveCount(0)
    await expect(activeFilters(page).getByText('Age 85 and over')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Filters, 2 applied' })).toBeVisible()
    // One filter fewer can only match the same patients or more.
    await expect.poll(() => patientRows(page).count()).toBeGreaterThanOrEqual(narrowed)

    await page.getByRole('button', { name: 'Clear all filters' }).click()
    await expect(activeFilters(page)).toHaveCount(0)
    await expect(patientRows(page)).toHaveCount(20)
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible()

    // The panel reopens blank.
    await openFilters(page)
    await expect(panel.getByLabel('Minimum age')).toHaveValue('')
    await expect(panel.getByLabel('City contains')).toHaveValue('')
  })

  test('refuses ranges that are the wrong way round', async ({ page }) => {
    const panel = await openFilters(page)
    await panel.getByLabel('Minimum age').fill('70')
    await panel.getByLabel('Maximum age').fill('30')
    await panel.getByLabel('Last visit from').fill('2026-06-01')
    await panel.getByLabel('Last visit to').fill('2026-01-01')
    await panel.getByRole('button', { name: 'Apply filters' }).click()

    await expect(
      panel.getByText('The minimum age cannot be greater than the maximum'),
    ).toBeVisible()
    await expect(panel.getByText('The start date cannot be after the end date')).toBeVisible()
    // Nothing was applied.
    await expect(activeFilters(page)).toHaveCount(0)
    await expect(page).toHaveURL('/patients')
  })

  test('says so when the filters match nobody, and offers a way out', async ({ page }) => {
    const panel = await openFilters(page)
    await panel.getByLabel('Condition contains').fill('lycanthropy')
    await panel.getByRole('button', { name: 'Apply filters' }).click()

    await expect(page.getByText('No patients found')).toBeVisible()
    await page.getByRole('button', { name: 'Clear search and filters' }).click()
    await expect(patientRows(page)).toHaveCount(20)
    await expect(activeFilters(page)).toHaveCount(0)
  })
})

test.describe('the list view lives in the URL', () => {
  test('search, status, filters, sort, page and page size are written to the address', async ({
    page,
  }) => {
    await page.goto('/patients')
    await expect(patientRows(page)).toHaveCount(20)
    expect(address(page)).toBe('/patients')

    await page.getByRole('columnheader', { name: 'Age' }).getByRole('button').click()
    await expect.poll(() => address(page)).toBe('/patients?sort=age')
    await page.getByRole('columnheader', { name: 'Age' }).getByRole('button').click()
    await expect.poll(() => address(page)).toBe('/patients?order=desc&sort=age')

    await page
      .getByRole('radiogroup', { name: 'Filter by status' })
      .getByText('Active', { exact: true })
      .click()
    await expect.poll(() => address(page)).toBe('/patients?order=desc&sort=age&status=active')

    // The paging controls sit below the rows; let the rows stop moving first.
    await listSettled(page)
    await page.getByRole('button', { name: 'next page' }).click()
    await expect
      .poll(() => address(page))
      .toBe('/patients?order=desc&page=2&sort=age&status=active')

    await listSettled(page)
    await page.getByRole('combobox', { name: 'Patients per page' }).click()
    await page.getByRole('option', { name: '50 per page' }).click()
    // Changing the page size goes back to the first page.
    await expect
      .poll(() => address(page))
      .toBe('/patients?order=desc&page_size=50&sort=age&status=active')

    const panel = await openFilters(page)
    await panel.getByLabel('Maximum age').fill('50')
    await panel.getByRole('group', { name: 'Blood type' }).getByText('AB+', { exact: true }).click()
    await panel.getByRole('button', { name: 'Apply filters' }).click()
    await expect
      .poll(() => address(page))
      .toBe('/patients?blood_type=AB%2B&max_age=50&order=desc&page_size=50&sort=age&status=active')

    await page.getByRole('textbox', { name: 'Search patients' }).fill('abbott')
    await expect
      .poll(() => address(page))
      .toBe(
        '/patients?blood_type=AB%2B&max_age=50&order=desc&page_size=50&q=abbott&sort=age&status=active',
      )

    // Undo each change and the address returns to plain /patients.
    await page.getByRole('button', { name: 'Clear search', exact: true }).click()
    await page.getByRole('button', { name: 'Clear all filters' }).click()
    await page.getByRole('radiogroup', { name: 'Filter by status' }).getByText('All').click()
    await page.getByRole('columnheader', { name: 'Name' }).getByRole('button').click()
    await expect.poll(() => address(page)).toBe('/patients?page_size=50')
    await listSettled(page)
    await page.getByRole('combobox', { name: 'Patients per page' }).click()
    await page.getByRole('option', { name: '20 per page' }).click()
    await expect.poll(() => address(page)).toBe('/patients')
  })

  test('a bookmarked address restores the whole view', async ({ page }) => {
    await page.goto(
      '/patients?status=critical&sort=age&order=desc&min_age=70&blood_type=A%2B&blood_type=B%2B&q=o',
    )

    // The rows...
    await expect(names(page).first()).toHaveText('Clementine Hayes')
    await expect(names(page).nth(1)).toHaveText('Tex Holloway')
    // ...and every control agree with the address.
    await expect(page.getByRole('textbox', { name: 'Search patients' })).toHaveValue('o')
    await expect(page.getByRole('radio', { name: 'Critical' })).toBeChecked()
    await expect(page.getByRole('columnheader', { name: 'Age' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await expect(activeFilters(page).getByText('Age 70 and over')).toBeVisible()
    await expect(activeFilters(page).getByText('Blood type A+, B+')).toBeVisible()
    const panel = await openFilters(page)
    await expect(panel.getByLabel('Minimum age')).toHaveValue('70')

    // A reload keeps it.
    await page.reload()
    await expect(names(page).first()).toHaveText('Clementine Hayes')
    await expect(page.getByRole('radio', { name: 'Critical' })).toBeChecked()
    await expect(activeFilters(page).getByText('Age 70 and over')).toBeVisible()
  })

  test('a bookmarked page number and page size are restored', async ({ page }) => {
    await page.goto('/patients?page=3&page_size=10')

    await expect(patientRows(page)).toHaveCount(10)
    await expect(page.getByText(/^Showing 21–30 of \d+$/)).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Patients per page' })).toHaveValue(
      '10 per page',
    )
  })

  test('nonsense in the address is ignored and tidied away', async ({ page }) => {
    await page.goto(
      '/patients?status=asleep&sort=shoe_size&page=abc&min_age=999&blood_type=Z&foo=bar',
    )

    await expect(patientRows(page)).toHaveCount(20)
    await expect(names(page).first()).toHaveText('Buck Abbott')
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked()
    await expect.poll(() => address(page)).toBe('/patients')
  })

  test('valid parts of a partly invalid address are kept', async ({ page }) => {
    await page.goto('/patients?status=critical&page=0&max_age=20&min_age=80')

    await expect(page.getByRole('radio', { name: 'Critical' })).toBeChecked()
    // A range the wrong way round is read the right way round.
    await expect(activeFilters(page).getByText('Age 20–80')).toBeVisible()
    await expect.poll(() => address(page)).toBe('/patients?max_age=80&min_age=20&status=critical')
  })

  test('the view survives a visit to a patient, by link or by the Back button', async ({
    page,
  }) => {
    await page.goto('/patients?status=critical&sort=age&order=desc')
    await expect(names(page).first()).toHaveText('Clementine Hayes')

    // Out and back with the in-app link, which points at plain /patients.
    await page.getByRole('link', { name: 'Clementine Hayes' }).click()
    await expect(page.getByRole('heading', { name: 'Clementine Hayes' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to patients' }).click()
    await expect.poll(() => address(page)).toBe('/patients?order=desc&sort=age&status=critical')
    await expect(names(page).first()).toHaveText('Clementine Hayes')

    // Out and back with the browser's Back button.
    await page.getByRole('link', { name: 'Clementine Hayes' }).click()
    await expect(page.getByRole('heading', { name: 'Clementine Hayes' })).toBeVisible()
    await page.goBack()
    await expect.poll(() => address(page)).toBe('/patients?order=desc&sort=age&status=critical')
    await expect(page.getByRole('radio', { name: 'Critical' })).toBeChecked()
    await expect(names(page).first()).toHaveText('Clementine Hayes')
  })

  test('sidebar shortcuts and the header link keep the address in step', async ({ page }) => {
    await page.goto('/patients?status=active&sort=age')
    await expect(page.getByRole('radio', { name: 'Active', exact: true })).toBeChecked()

    await page
      .getByRole('navigation', { name: 'Patients by status' })
      .getByRole('link', { name: /^Critical/ })
      .click()
    await expect(page.getByRole('radio', { name: 'Critical' })).toBeChecked()
    await expect.poll(() => address(page)).toBe('/patients?sort=age&status=critical')

    // The header link means "the list as I left it", not "reset".
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Patients' })
      .click()
    await expect.poll(() => address(page)).toBe('/patients?sort=age&status=critical')
    await expect(page.getByRole('radio', { name: 'Critical' })).toBeChecked()
  })

  test('typing in the search does not fill the Back history', async ({ page }) => {
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Patients' })
      .click()
    await expect(patientRows(page)).toHaveCount(20)

    await page.getByRole('textbox', { name: 'Search patients' }).fill('slim')
    await expect.poll(() => address(page)).toBe('/patients?q=slim')
    await page
      .getByRole('radiogroup', { name: 'Filter by status' })
      .getByText('Active', { exact: true })
      .click()
    await expect.poll(() => address(page)).toBe('/patients?q=slim&status=active')

    // One step back leaves the list; it does not replay each change.
    await page.goBack()
    await expect(page).toHaveURL('/')
  })
})

test('filters work on a phone, where the panel stacks @mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Covered on desktop by the tests above')
  await page.goto('/patients')
  const cards = page.getByRole('list', { name: 'Patients' }).getByRole('listitem')
  await expect(cards).toHaveCount(20)

  const panel = await openFilters(page)
  await panel.getByLabel('Condition contains').fill('kidney')
  await panel.getByRole('button', { name: 'Apply filters' }).click()

  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Clementine Hayes')
  await expect(activeFilters(page).getByText('Condition: kidney')).toBeVisible()
  expect(address(page)).toBe('/patients?condition=kidney')

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Remove filter: Condition: kidney' }).click()
  await expect(cards).toHaveCount(20)
})
