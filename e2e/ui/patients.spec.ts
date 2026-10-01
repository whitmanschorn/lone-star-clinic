import { expect, test, type Page } from '@playwright/test'
import { createPatient, deletePatient } from '../helpers'

/** Table rows that hold a patient (i.e. not the header row). */
function patientRows(page: Page) {
  return page.getByRole('row').filter({ has: page.getByRole('cell') })
}

async function columnValues(page: Page, columnIndex: number): Promise<string[]> {
  return patientRows(page).locator(`td:nth-child(${columnIndex})`).allTextContents()
}

test.describe('patient list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/patients')
    await expect(patientRows(page)).toHaveCount(20)
  })

  test('shows name, age, last visit and status for each patient', async ({ page }) => {
    await expect(page.getByRole('columnheader')).toHaveText([
      'Name',
      'Age',
      'Last visit',
      'Status',
      'City',
    ])
    await expect(page.getByText(/^Showing 1–20 of \d+$/)).toBeVisible()

    const first = patientRows(page).first()
    await expect(first.getByRole('link', { name: 'Buck Abbott' })).toBeVisible()
    await expect(first.getByRole('cell').nth(1)).toHaveText(/^\d+$/)
    await expect(first.getByRole('cell').nth(2)).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)
    await expect(first.getByRole('cell').nth(3)).toHaveText('Critical')
  })

  test('search narrows the list as you type and can be cleared', async ({ page }) => {
    const search = page.getByRole('textbox', { name: 'Search patients' })

    await search.fill('slim')
    await expect(patientRows(page)).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Slim Calhoun' })).toBeVisible()
    await expect(page.getByText('Showing 1–1 of 1')).toBeVisible()

    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(search).toHaveValue('')
    await expect(patientRows(page)).toHaveCount(20)
  })

  test('search waits for a pause in typing before asking the server', async ({ page }) => {
    const searches: string[] = []
    page.on('request', (request) => {
      const q = new URL(request.url()).searchParams.get('q')
      if (request.url().includes('/api/patients?') && q) searches.push(q)
    })

    await page
      .getByRole('textbox', { name: 'Search patients' })
      .pressSequentially('holloway', { delay: 40 })
    await expect(patientRows(page)).toHaveCount(1)

    // Eight keystrokes, one request: intermediate values were never sent.
    expect(searches).toEqual(['holloway'])
  })

  test('typing stays responsive while results are loading', async ({ page }) => {
    // Hold every search response back for a second.
    await page.route('**/api/patients?*q=*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await route.continue()
    })
    const search = page.getByRole('textbox', { name: 'Search patients' })

    await search.fill('lefty')
    // While the request is pending the input already shows the text, the old
    // rows are still on screen, and the user can keep typing.
    await expect(search).toHaveValue('lefty')
    await expect(page.getByRole('link', { name: 'Buck Abbott' })).toBeVisible()
    await search.press('End')
    await search.pressSequentially(' mc')
    await expect(search).toHaveValue('lefty mc')

    await expect(patientRows(page)).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Lefty McGraw' })).toBeVisible()
  })

  test('shows an empty state with a way out when nothing matches', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Search patients' }).fill('zzz-nobody')

    await expect(page.getByText('No patients found')).toBeVisible()
    await page.getByRole('button', { name: 'Clear search and filter' }).click()
    await expect(patientRows(page)).toHaveCount(20)
    await expect(page.getByRole('textbox', { name: 'Search patients' })).toHaveValue('')
  })

  test('filters by status', async ({ page }) => {
    await page.getByRole('radiogroup', { name: 'Filter by status' }).getByText('Inactive').click()

    await expect(patientRows(page).first().getByRole('cell').nth(3)).toHaveText('Inactive')
    expect(new Set(await columnValues(page, 4))).toEqual(new Set(['Inactive']))
  })

  test('sorts by a column and reverses on a second click', async ({ page }) => {
    const ageHeader = page.getByRole('columnheader', { name: 'Age' })

    await ageHeader.getByRole('button').click()
    await expect(ageHeader).toHaveAttribute('aria-sort', 'ascending')
    await expect(page.getByRole('link', { name: 'Daisy Longmire' })).toBeVisible()
    const youngestFirst = (await columnValues(page, 2)).map(Number)
    expect(youngestFirst).toEqual([...youngestFirst].sort((a, b) => a - b))

    await ageHeader.getByRole('button').click()
    await expect(ageHeader).toHaveAttribute('aria-sort', 'descending')
    await expect(patientRows(page).first().getByRole('link')).toHaveText('Clementine Hayes')
    const oldestFirst = (await columnValues(page, 2)).map(Number)
    expect(oldestFirst).toEqual([...oldestFirst].sort((a, b) => b - a))
  })

  test('pages through the list', async ({ page }) => {
    const firstPageNames = await columnValues(page, 1)

    await page.getByRole('button', { name: 'next page' }).click()
    await expect(page.getByText(/^Showing 21–40 of \d+$/)).toBeVisible()
    const secondPageNames = await columnValues(page, 1)
    expect(secondPageNames).toHaveLength(20)
    expect(secondPageNames.filter((name) => firstPageNames.includes(name))).toEqual([])

    await page.getByRole('button', { name: '1', exact: true }).click()
    await expect(page.getByText(/^Showing 1–20 of \d+$/)).toBeVisible()
  })

  test('changes the page size', async ({ page }) => {
    await page.getByRole('combobox', { name: 'Patients per page' }).click()
    await page.getByRole('option', { name: '50 per page' }).click()

    await expect(patientRows(page)).toHaveCount(50)
    await expect(page.getByText(/^Showing 1–50 of \d+$/)).toBeVisible()
  })

  test('remembers search, filter and sort after visiting a patient', async ({ page }) => {
    await page.getByRole('textbox', { name: 'Search patients' }).fill('abbott')
    await page
      .getByRole('radiogroup', { name: 'Filter by status' })
      .getByText('Active', { exact: true })
      .click()
    await page.getByRole('columnheader', { name: 'Age' }).getByRole('button').click()
    await expect(patientRows(page).first().getByRole('link')).toHaveText('June Abbott')

    await page.getByRole('link', { name: 'June Abbott' }).click()
    await expect(page.getByRole('heading', { name: 'June Abbott' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to patients' }).click()

    await expect(page.getByRole('textbox', { name: 'Search patients' })).toHaveValue('abbott')
    await expect(page.getByRole('radio', { name: 'Active', exact: true })).toBeChecked()
    await expect(page.getByRole('columnheader', { name: 'Age' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await expect(patientRows(page).first().getByRole('link')).toHaveText('June Abbott')
  })

  test('sidebar shortcuts filter the list by status', async ({ page }) => {
    const shortcuts = page.getByRole('navigation', { name: 'Patients by status' })

    await shortcuts.getByRole('link', { name: /^Critical/ }).click()
    await expect(page.getByRole('radio', { name: 'Critical' })).toBeChecked()
    await expect(patientRows(page).first().getByRole('cell').nth(3)).toHaveText('Critical')

    await shortcuts.getByRole('link', { name: /^All patients/ }).click()
    await expect(page.getByRole('radio', { name: 'All' })).toBeChecked()
  })
})

test('the list shows an error with a retry when the API fails', async ({ page }) => {
  let failing = true
  await page.route('**/api/patients?*', (route) =>
    failing
      ? route.fulfill({ status: 500, json: { detail: 'Internal server error' } })
      : route.continue(),
  )
  await page.goto('/patients')

  await expect(page.getByText('Could not load patients')).toBeVisible()
  await expect(page.getByText('The server ran into a problem')).toBeVisible()

  failing = false
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(patientRows(page)).toHaveCount(20)
})

test.describe('patient detail', () => {
  test('opens from the list and shows the full record', async ({ page }) => {
    await page.goto('/patients')
    await page.getByRole('textbox', { name: 'Search patients' }).fill('slim')
    await page.getByRole('link', { name: 'Slim Calhoun' }).click()

    await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: 'Slim Calhoun' })).toBeVisible()
    await expect(page.getByText(/^\d+ years old · Born Mar 14, 1958$/)).toBeVisible()

    const contact = page.getByRole('region', { name: 'Contact' })
    await expect(contact.getByRole('link', { name: 'slim.calhoun@example.com' })).toBeVisible()
    await expect(contact.getByText('830-555-0101')).toBeVisible()
    await expect(contact.getByText('Luckenbach, TX 78624')).toBeVisible()

    const medical = page.getByRole('region', { name: 'Medical' })
    await expect(medical.getByText('O+')).toBeVisible()
    await expect(medical.getByText('Hypertension')).toBeVisible()
    await expect(medical.getByText('Type 2 diabetes')).toBeVisible()
    await expect(medical.getByText('Penicillin')).toBeVisible()
  })

  test('copes with a patient who has only the required fields', async ({ page, request }) => {
    const patient = await createPatient(request, {
      email: null,
      phone: null,
      address_line: null,
      city: null,
      state: null,
      postal_code: null,
      blood_type: null,
      allergies: [],
      conditions: [],
      last_visit: null,
    })
    try {
      await page.goto(`/patients/${patient.id}`)

      await expect(page.getByRole('heading', { name: patient.last_name })).toBeVisible()
      const medical = page.getByRole('region', { name: 'Medical' })
      await expect(medical.getByText('Unknown')).toBeVisible()
      await expect(medical.getByText('Never')).toBeVisible()
      await expect(medical.getByText('None recorded')).toBeVisible()
      await expect(medical.getByText('No known allergies')).toBeVisible()
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  for (const [description, id] of [
    ['an id that does not exist', '00000000-0000-4000-8000-000000000000'],
    ['an id that is not a UUID', 'not-a-uuid'],
  ]) {
    test(`shows "not found" for ${description}`, async ({ page }) => {
      await page.goto(`/patients/${id}`)

      await expect(page.getByRole('heading', { name: 'Patient not found' })).toBeVisible()
      await page.getByRole('link', { name: 'Back to patients' }).click()
      await expect(page).toHaveURL('/patients')
    })
  }
})

test.describe('patient list on a phone', () => {
  test('shows cards, and search, filter and paging still work @mobile', async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, 'Cards replace the table only on narrow screens')
    await page.goto('/patients')
    const cards = page.getByRole('list', { name: 'Patients' }).getByRole('listitem')

    await expect(cards).toHaveCount(20)
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(cards.first()).toContainText('Buck Abbott')
    await expect(cards.first()).toContainText(/Age \d+ · Last visit/)
    await expect(cards.first()).toContainText('Critical')

    // Nothing is wider than the screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)

    await page.getByRole('textbox', { name: 'Search patients' }).fill('tex')
    await expect(cards).toHaveCount(1)
    await cards.first().getByRole('link').click()
    await expect(page.getByRole('heading', { name: 'Tex Holloway' })).toBeVisible()
  })

  test('sorts from the sort picker @mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The sort picker replaces column headers only on narrow screens')
    await page.goto('/patients')
    const cards = page.getByRole('list', { name: 'Patients' }).getByRole('listitem')

    await page.getByRole('combobox', { name: 'Sort by' }).click()
    await page.getByRole('option', { name: 'Age' }).click()
    await expect(cards.first()).toContainText('Daisy Longmire')

    await page.getByRole('button', { name: 'Sorted ascending' }).click()
    await expect(cards.first()).toContainText('Clementine Hayes')
  })
})
