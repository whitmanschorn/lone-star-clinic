import { expect, test, type Page } from '@playwright/test'
import { API_URL, createPatient, deletePatient, holdRequests } from '../helpers'
import type { Note, Patient, PatientsPage } from '../types'

// Working from the patient list: create, edit and add notes in modals, and
// watch the list update underneath.

function uniqueLastName(): string {
  return `Testcase-${Math.random().toString(36).slice(2, 10)}`
}

function patientRows(page: Page) {
  return page.getByRole('row').filter({ has: page.getByRole('cell') })
}

async function searchFor(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Search patients' }).fill(text)
}

async function findByLastName(page: Page, lastName: string): Promise<Patient[]> {
  const list = (await (
    await page.request.get(`${API_URL}/patients?q=${lastName}`)
  ).json()) as PatientsPage
  return list.items
}

test.describe('creating a patient from the list', () => {
  let lastName: string
  test.beforeEach(() => {
    lastName = uniqueLastName()
  })
  test.afterEach(async ({ page }) => {
    for (const patient of await findByLastName(page, lastName)) {
      await deletePatient(page.request, patient.id)
    }
  })

  test('opens a modal, saves, and the new row appears without leaving the list', async ({
    page,
  }) => {
    await page.goto('/patients')
    await searchFor(page, lastName)
    await expect(page.getByText('No patients found')).toBeVisible()

    await page.getByRole('button', { name: 'New patient' }).click()
    const dialog = page.getByRole('dialog', { name: 'New patient' })
    await dialog.getByLabel('First name').fill('Calamity')
    await dialog.getByLabel('Last name').fill(lastName)
    await dialog.getByLabel('Date of birth').fill('1975-05-01')
    await dialog.getByLabel('Status', { exact: true }).selectOption('Critical')
    await dialog.getByRole('button', { name: 'Create patient' }).click()

    await expect(dialog).toBeHidden()
    // Still on the list, with the search in the address.
    await expect(page).toHaveURL(/\/patients\?q=Testcase-/)
    // The search is still applied, and now matches the new patient.
    await expect(page.getByRole('textbox', { name: 'Search patients' })).toHaveValue(lastName)
    const row = patientRows(page).filter({ hasText: `Calamity ${lastName}` })
    await expect(row).toBeVisible()
    await expect(row.getByRole('cell').nth(3)).toHaveText('Critical')
    await expect(row.getByRole('cell').nth(4)).toHaveText('No notes')
    await expect(page.getByText('Showing 1–1 of 1')).toBeVisible()

    // The confirmation links to the new record.
    await page.getByRole('link', { name: 'Open their record' }).click()
    await expect(page.getByRole('heading', { name: `Calamity ${lastName}` })).toBeVisible()
  })

  test('validates in the modal and Cancel closes it without saving', async ({ page }) => {
    await page.goto('/patients')
    await page.getByRole('button', { name: 'New patient' }).click()
    const dialog = page.getByRole('dialog', { name: 'New patient' })

    await dialog.getByLabel('Last name').fill(lastName)
    await dialog.getByRole('button', { name: 'Create patient' }).click()
    await expect(dialog.getByText('First name is required')).toBeVisible()
    await expect(dialog.getByText('Date of birth is required')).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(await findByLastName(page, lastName)).toEqual([])

    // Reopening starts from a blank form.
    await page.getByRole('button', { name: 'New patient' }).click()
    await expect(dialog.getByLabel('Last name')).toHaveValue('')
  })

  test('keeps the modal and what was typed when the save fails', async ({ page }) => {
    let offline = true
    await page.route('**/api/patients', (route) =>
      offline && route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    await page.goto('/patients')
    await page.getByRole('button', { name: 'New patient' }).click()
    const dialog = page.getByRole('dialog', { name: 'New patient' })
    await dialog.getByLabel('First name').fill('Calamity')
    await dialog.getByLabel('Last name').fill(lastName)
    await dialog.getByLabel('Date of birth').fill('1975-05-01')

    await dialog.getByRole('button', { name: 'Create patient' }).click()
    await expect(dialog.getByText('The patient was not saved')).toBeVisible()
    await expect(dialog.getByText('Could not reach the server')).toBeVisible()
    await expect(dialog.getByLabel('Last name')).toHaveValue(lastName)

    offline = false
    await dialog.getByRole('button', { name: 'Create patient' }).click()
    await expect(dialog).toBeHidden()
    expect(await findByLastName(page, lastName)).toHaveLength(1)
  })
})

test.describe('working on an existing patient from the list', () => {
  let patient: Patient

  test.beforeEach(async ({ page, request }) => {
    patient = await createPatient(request, {
      first_name: 'Rowdy',
      city: 'Austin',
      medications: ['Aspirin 81 mg daily'],
      allergies: [],
    })
    await page.goto('/patients')
    await searchFor(page, patient.last_name)
    await expect(patientRows(page)).toHaveCount(1)
  })

  test.afterEach(async ({ request }) => {
    await deletePatient(request, patient.id)
  })

  test('edits in a modal and the row updates in place', async ({ page }) => {
    await page.getByRole('button', { name: `Edit Rowdy ${patient.last_name}` }).click()
    const dialog = page.getByRole('dialog', { name: `Edit Rowdy ${patient.last_name}` })
    await expect(dialog.getByLabel('First name')).toHaveValue('Rowdy')
    await expect(dialog.getByLabel('Date of birth')).toHaveValue('1980-06-15')

    await dialog.getByLabel('First name').fill('Rowena')
    await dialog.getByLabel('Status', { exact: true }).selectOption('Critical')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    // Still on the list, with the search in the address.
    await expect(page).toHaveURL(/\/patients\?q=Testcase-/)
    const row = patientRows(page).first()
    await expect(row.getByRole('link')).toHaveText(`Rowena ${patient.last_name}`)
    await expect(row.getByRole('cell').nth(3)).toHaveText('Critical')
    // The changed row is pointed out for a moment, then settles.
    await expect(row).toHaveAttribute('data-highlighted', 'true')
    await expect(row).not.toHaveAttribute('data-highlighted', 'true')
    // The sidebar count picks up the new critical patient as well.
    const saved = (await (
      await page.request.get(`${API_URL}/patients/${patient.id}`)
    ).json()) as Patient
    expect(saved).toMatchObject({ first_name: 'Rowena', status: 'critical', city: 'Austin' })
  })

  test('shows the saved row at once, marked as updating until the refetch lands', async ({
    page,
  }) => {
    // Pause list requests so the "stale, revalidating" state can be looked at.
    const listRequests = await holdRequests(page, '**/api/patients?*')
    const updating = page.getByRole('status').filter({ hasText: 'Updating…' })

    await page.getByRole('button', { name: `Edit Rowdy ${patient.last_name}` }).click()
    const dialog = page.getByRole('dialog', { name: `Edit Rowdy ${patient.last_name}` })
    await dialog.getByLabel('First name').fill('Rowena')
    listRequests.hold()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    // Stale-while-revalidate: the row already shows the server's copy of the
    // edit, from the cache, while the list request is still unanswered.
    const name = patientRows(page).first().getByRole('link')
    await expect(name).toHaveText(`Rowena ${patient.last_name}`)
    await expect(updating).toBeVisible()

    // Once the refetch lands, the indicator goes away and the row stays.
    listRequests.release()
    await expect(updating).toHaveCount(0)
    await expect(name).toHaveText(`Rowena ${patient.last_name}`)
  })

  test('the edit form starts from the latest record, not the stale row', async ({
    page,
    request,
  }) => {
    // Someone else changes the patient after this list was loaded.
    const { id, created_at, updated_at, age, last_note, ...body } = patient
    void [id, created_at, updated_at, age, last_note]
    await request.put(`${API_URL}/patients/${patient.id}`, {
      data: { ...body, city: 'Lampasas' },
    })

    await page.getByRole('button', { name: `Edit Rowdy ${patient.last_name}` }).click()
    const dialog = page.getByRole('dialog', { name: `Edit Rowdy ${patient.last_name}` })

    await expect(dialog.getByLabel('City')).toHaveValue('Lampasas')
  })

  test('adds a note in a modal and the Last note column updates', async ({ page, request }) => {
    const row = patientRows(page).first()
    await expect(row.getByRole('cell').nth(4)).toHaveText('No notes')

    await page.getByRole('button', { name: `Add a note for Rowdy ${patient.last_name}` }).click()
    const dialog = page.getByRole('dialog', { name: `Add a note for Rowdy ${patient.last_name}` })
    await dialog.getByRole('textbox', { name: 'New note' }).fill('Kicked by a mule. Shin bruised.')
    // Chart updates work here just as on the patient page.
    await dialog.getByRole('button', { name: 'Allergy' }).click()
    await dialog.getByRole('textbox', { name: 'New allergy' }).fill('Latex')
    await dialog.getByRole('button', { name: 'Add note' }).click()

    await expect(dialog).toBeHidden()
    // Still on the list, with the search in the address.
    await expect(page).toHaveURL(/\/patients\?q=Testcase-/)
    await expect(row.getByRole('cell').nth(4)).toContainText('Kicked by a mule. Shin bruised.')
    // Today's date, e.g. "Oct 1, 2026".
    await expect(row.getByRole('cell').nth(4)).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{4}/)
    await expect(page.getByText('Note added and chart updated')).toBeVisible()

    const notes = (await (
      await request.get(`${API_URL}/patients/${patient.id}/notes`)
    ).json()) as Note[]
    expect(notes.map((note) => note.content)).toEqual(['Kicked by a mule. Shin bruised.'])
    const saved = (await (await request.get(`${API_URL}/patients/${patient.id}`)).json()) as Patient
    expect(saved.allergies).toEqual(['Latex'])
  })

  test('row actions do not open the patient page, but the row still does', async ({ page }) => {
    await page.getByRole('button', { name: `Edit Rowdy ${patient.last_name}` }).click()
    // Still on the list, with the search in the address.
    await expect(page).toHaveURL(/\/patients\?q=Testcase-/)
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()

    await patientRows(page).first().getByRole('cell').nth(1).click()
    await expect(page).toHaveURL(`/patients/${patient.id}`)
  })

  test('says so if the patient was deleted in the meantime', async ({ page, request }) => {
    await deletePatient(request, patient.id)

    await page.getByRole('button', { name: `Edit Rowdy ${patient.last_name}` }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('This patient no longer exists.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Back to the list' }).click()
    await expect(dialog).toBeHidden()
  })
})

test('sorts the list by last note, with never-noted patients last', async ({ page, request }) => {
  // Three patients only this test can see, found through a shared marker.
  const marker = uniqueLastName()
  const newest = await createPatient(request, { last_name: `${marker}-newest` })
  const older = await createPatient(request, { last_name: `${marker}-older` })
  const never = await createPatient(request, { last_name: `${marker}-never` })
  try {
    await request.post(`${API_URL}/patients/${older.id}/notes`, {
      data: { content: 'January visit.', timestamp: '2026-01-10T16:00:00Z' },
    })
    await request.post(`${API_URL}/patients/${newest.id}/notes`, {
      data: { content: 'June visit.', timestamp: '2026-06-10T16:00:00Z' },
    })
    await page.goto('/patients')
    await searchFor(page, marker)
    await expect(patientRows(page)).toHaveCount(3)
    const names = () => patientRows(page).locator('td:nth-child(1)')
    const header = page.getByRole('columnheader', { name: 'Last note' })

    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    await expect(names()).toHaveText([
      `Rowdy ${marker}-older`,
      `Rowdy ${marker}-newest`,
      `Rowdy ${marker}-never`,
    ])

    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'descending')
    await expect(names()).toHaveText([
      `Rowdy ${marker}-newest`,
      `Rowdy ${marker}-older`,
      `Rowdy ${marker}-never`,
    ])
    await expect(patientRows(page).first().getByRole('cell').nth(4)).toContainText('June visit.')
  } finally {
    for (const patient of [newest, older, never]) await deletePatient(request, patient.id)
  }
})

test('the patient page edits in a modal too, and updates in place', async ({ page, request }) => {
  const patient = await createPatient(request, { first_name: 'Rowdy', city: 'Austin' })
  try {
    await page.goto(`/patients/${patient.id}`)

    await page.getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: `Edit Rowdy ${patient.last_name}` })
    await dialog.getByLabel('City').fill('Lampasas')
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(`/patients/${patient.id}`)
    await expect(
      page.getByRole('region', { name: 'Contact' }).getByText('Lampasas, TX 78701'),
    ).toBeVisible()
  } finally {
    await deletePatient(request, patient.id)
  }
})

test.describe('working from the list on a phone', () => {
  test('cards show the last note and open the same modals @mobile-only', async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, { first_name: 'Rowdy' })
    try {
      await page.goto('/patients')
      await searchFor(page, patient.last_name)
      const card = page.getByRole('list', { name: 'Patients' }).getByRole('listitem')
      await expect(card).toHaveCount(1)
      await expect(card).toContainText('No notes')

      await card.getByRole('button', { name: /^Add a note for/ }).click()
      const noteDialog = page.getByRole('dialog', { name: /^Add a note for Rowdy/ })
      await noteDialog.getByRole('textbox', { name: 'New note' }).fill('Sunburn. Advised a hat.')
      await noteDialog.getByRole('button', { name: 'Add note' }).click()
      await expect(noteDialog).toBeHidden()
      await expect(card).toContainText(
        /Last note [A-Z][a-z]{2} \d{1,2}, \d{4}: Sunburn\. Advised a hat\./,
      )

      await card.getByRole('button', { name: /^Edit Rowdy/ }).click()
      const editDialog = page.getByRole('dialog', { name: /^Edit Rowdy/ })
      await editDialog.getByLabel('Status', { exact: true }).selectOption('Inactive')
      await editDialog.getByRole('button', { name: 'Save changes' }).click()
      await expect(editDialog).toBeHidden()
      await expect(card).toContainText('Inactive')

      // Still nothing wider than the screen.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    } finally {
      await deletePatient(request, patient.id)
    }
  })
})
