import { expect, test, type Locator, type Page } from '@playwright/test'
import { API_URL } from '../helpers'
import type { PatientsPage, PatientStats } from '../types'

async function loadStats(page: Page): Promise<PatientStats> {
  return (await (await page.request.get(`${API_URL}/patients/stats`)).json()) as PatientStats
}

const chart = (page: Page, title: string) => page.getByRole('region', { name: title })

async function size(locator: Locator): Promise<{ width: number; height: number }> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Element is not rendered')
  return box
}

/** The path and query the browser is on, with the query's parameters sorted. */
function address(page: Page): string {
  const url = new URL(page.url())
  url.searchParams.sort()
  return url.pathname + url.search
}

function patientRows(page: Page) {
  return page.getByRole('row').filter({ has: page.getByRole('cell') })
}

test.describe('patients by status chart', () => {
  test('shows each status with its count and share, and sizes the bar to match', async ({
    page,
  }) => {
    // Other tests add and remove patients, so read the numbers the page itself got.
    const statsResponse = page.waitForResponse('**/api/patients/stats')
    await page.goto('/')
    const stats = (await (await statsResponse).json()) as PatientStats
    const status = chart(page, 'Patients by status')

    // The legend is always there, and carries the numbers.
    const legend = status.getByRole('list', { name: 'Legend' })
    await expect(legend.getByRole('listitem')).toHaveText([
      new RegExp(`^Critical${stats.by_status.critical}\\d+%$`),
      new RegExp(`^Active${stats.by_status.active}\\d+%$`),
      new RegExp(`^Inactive${stats.by_status.inactive}\\d+%$`),
    ])

    // Segment widths follow the counts: active is by far the largest.
    const critical = await size(status.getByRole('link', { name: /^Critical:/ }))
    const active = await size(status.getByRole('link', { name: /^Active:/ }))
    const inactive = await size(status.getByRole('link', { name: /^Inactive:/ }))
    expect(active.width).toBeGreaterThan(inactive.width)
    expect(inactive.width).toBeGreaterThan(critical.width)
    const widthPerPatient = active.width / stats.by_status.active
    expect(critical.width / stats.by_status.critical).toBeCloseTo(widthPerPatient, 0)
    // Thin marks: the bar is no taller than 24px.
    expect(active.height).toBeLessThanOrEqual(24)
  })

  test('a segment opens the patient list filtered to that status', async ({ page }) => {
    await page.goto('/')

    await chart(page, 'Patients by status')
      .getByRole('link', { name: /^Inactive:/ })
      .click()

    await expect(page).toHaveURL('/patients?status=inactive')
    await expect(page.getByRole('radio', { name: 'Inactive' })).toBeChecked()
    await expect(patientRows(page).first().getByRole('cell').nth(3)).toHaveText('Inactive')
  })
})

test.describe('patients by age chart', () => {
  test('draws a column per age band, as tall as its count', async ({ page }) => {
    const statsResponse = page.waitForResponse('**/api/patients/stats')
    await page.goto('/')
    const stats = (await (await statsResponse).json()) as PatientStats
    const age = chart(page, 'Patients by age')

    const columns = age.getByRole('list', { name: 'Patients by age' }).getByRole('listitem')
    await expect(columns).toHaveText(stats.by_age_band.map((band) => `${band.count}${band.label}`))

    // Find the marks through their links and compare the tallest with the shortest.
    const counts = stats.by_age_band.map((band) => band.count)
    const tallest = stats.by_age_band[counts.indexOf(Math.max(...counts))]!
    const shortest = stats.by_age_band[counts.indexOf(Math.min(...counts))]!
    const markOf = (label: string) =>
      age
        .getByRole('link', { name: new RegExp(`^Aged ${label.replace('+', '\\+')}:`) })
        .locator('[data-chart-mark]')
    const tall = await size(markOf(tallest.label))
    const short = await size(markOf(shortest.label))
    expect(tall.height).toBeGreaterThan(short.height)
    expect(tall.height / short.height).toBeCloseTo(tallest.count / shortest.count, 0)
    expect(tall.width).toBeLessThanOrEqual(24)
  })

  test('a column opens the patient list filtered to that age band', async ({ page }) => {
    await page.goto('/')
    const stats = await loadStats(page)
    const youngest = stats.by_age_band[0]!

    await chart(page, 'Patients by age')
      .getByRole('link', { name: /^Aged 0–17:/ })
      .click()

    await expect.poll(() => address(page)).toBe('/patients?max_age=17&min_age=0')
    await expect(
      page.getByRole('group', { name: 'Active filters' }).getByText('Age 0–17'),
    ).toBeVisible()
    await expect(patientRows(page)).toHaveCount(youngest.count)

    // The open-ended last band has no upper limit.
    await page.goto('/')
    await chart(page, 'Patients by age')
      .getByRole('link', { name: /^Aged 80\+:/ })
      .click()
    await expect.poll(() => address(page)).toBe('/patients?min_age=80')
    await expect(
      page.getByRole('group', { name: 'Active filters' }).getByText('Age 80 and over'),
    ).toBeVisible()
  })
})

test.describe('most common conditions chart', () => {
  test('lists conditions from most to least common with their counts', async ({ page }) => {
    const statsResponse = page.waitForResponse('**/api/patients/stats')
    await page.goto('/')
    const stats = (await (await statsResponse).json()) as PatientStats
    const conditions = chart(page, 'Most common conditions')

    const rows = conditions
      .getByRole('list', { name: 'Most common conditions' })
      .getByRole('listitem')
    await expect(rows).toHaveText(stats.top_conditions.map(({ name, count }) => `${name}${count}`))
    expect(stats.top_conditions[0]?.name).toBe('Hypertension')
  })

  test('a bar opens the patient list filtered to that condition', async ({ page, request }) => {
    await page.goto('/')

    await chart(page, 'Most common conditions')
      .getByRole('link', { name: /^Type 2 diabetes:/ })
      .click()

    await expect.poll(() => address(page)).toBe('/patients?condition=Type+2+diabetes')
    await expect(
      page.getByRole('group', { name: 'Active filters' }).getByText('Condition: Type 2 diabetes'),
    ).toBeVisible()
    const expected = (await (
      await request.get(`${API_URL}/patients?condition=Type%202%20diabetes&page_size=100`)
    ).json()) as PatientsPage
    await expect(patientRows(page)).toHaveCount(Math.min(expected.total, 20))
  })
})

test.describe('reading the charts without relying on colour or hover', () => {
  test('a mark shows its value on hover and on keyboard focus', async ({ page }) => {
    const statsResponse = page.waitForResponse('**/api/patients/stats')
    await page.goto('/')
    const stats = (await (await statsResponse).json()) as PatientStats
    const band = stats.by_age_band[2]!
    const column = chart(page, 'Patients by age').getByRole('link', { name: /^Aged 40–64:/ })

    await column.hover()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText(`${band.count} patients`)
    await expect(tooltip).toContainText('Aged 40–64')

    // The same readout for keyboard users.
    await page.mouse.move(0, 0)
    await expect(tooltip).toBeHidden()
    await column.focus()
    await expect(tooltip).toContainText(`${band.count} patients`)
  })

  test('every chart can be read as a table instead', async ({ page }) => {
    const statsResponse = page.waitForResponse('**/api/patients/stats')
    await page.goto('/')
    const stats = (await (await statsResponse).json()) as PatientStats

    const status = chart(page, 'Patients by status')
    await status.getByRole('button', { name: 'View as table' }).click()
    await expect(status.getByRole('columnheader')).toHaveText(['Status', 'Patients', 'Share'])
    await expect(status.getByRole('row').nth(1).getByRole('cell')).toHaveText([
      'Critical',
      String(stats.by_status.critical),
      /^\d+%$/,
    ])
    await expect(status.getByRole('row')).toHaveCount(4)
    // And back again.
    await status.getByRole('button', { name: 'View as chart' }).click()
    await expect(status.getByRole('table')).toHaveCount(0)
    await expect(status.getByRole('link', { name: /^Critical:/ })).toBeVisible()

    const age = chart(page, 'Patients by age')
    await age.getByRole('button', { name: 'View as table' }).click()
    await expect(age.getByRole('row')).toHaveCount(1 + stats.by_age_band.length)
    await expect(age.getByRole('row').nth(1).getByRole('cell')).toHaveText([
      '0–17',
      String(stats.by_age_band[0]!.count),
      /^\d+%$/,
    ])

    const conditions = chart(page, 'Most common conditions')
    await conditions.getByRole('button', { name: 'View as table' }).click()
    await expect(conditions.getByRole('row').nth(1).getByRole('cell').first()).toHaveText(
      stats.top_conditions[0]!.name,
    )
  })

  test('bar colours change with the colour scheme', async ({ page, isMobile }) => {
    test.skip(isMobile, 'On a phone the toggle is in the navigation drawer')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/')
    const bar = chart(page, 'Most common conditions')
      .getByRole('link', { name: /^Hypertension:/ })
      .locator('[data-chart-mark]')
    const colour = () => bar.evaluate((element) => getComputedStyle(element).backgroundColor)

    expect(await colour()).toBe('rgb(168, 82, 31)')
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect.poll(colour).toBe('rgb(198, 106, 42)')
  })
})

test('the charts fit a phone screen @mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Layout check for narrow screens')
  await page.goto('/')

  await expect(
    chart(page, 'Patients by status').getByRole('link', { name: /^Active:/ }),
  ).toBeVisible()
  await expect(
    chart(page, 'Patients by age').getByRole('link', { name: /^Aged 80\+:/ }),
  ).toBeVisible()
  await expect(chart(page, 'Most common conditions').getByRole('link').first()).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  // Tapping a mark still drills down.
  await chart(page, 'Patients by status')
    .getByRole('link', { name: /^Critical:/ })
    .click()
  await expect(page).toHaveURL('/patients?status=critical')
})
