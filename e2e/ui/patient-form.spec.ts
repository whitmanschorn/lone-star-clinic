import { expect, test, type Page } from '@playwright/test'
import { API_URL, createPatient, deletePatient } from '../helpers'
import type { Patient, PatientCreate, PatientsPage } from '../types'

/** A last name no other test will use, so this test can find its own patient. */
function uniqueLastName(): string {
  return `Testcase-${Math.random().toString(36).slice(2, 10)}`
}

async function findByLastName(page: Page, lastName: string): Promise<Patient[]> {
  const list = (await (
    await page.request.get(`${API_URL}/patients?q=${lastName}`)
  ).json()) as PatientsPage
  return list.items
}

async function addTags(page: Page, label: string, entries: string[]) {
  const input = page.getByRole('combobox', { name: label })
  for (const entry of entries) {
    await input.fill(entry)
    await input.press('Enter')
  }
}

test.describe('creating a patient on the /patients/new page', () => {
  // Remove whatever a test created, however it ended.
  let lastName: string
  test.beforeEach(() => {
    lastName = uniqueLastName()
  })
  test.afterEach(async ({ page }) => {
    for (const patient of await findByLastName(page, lastName)) {
      await deletePatient(page.request, patient.id)
    }
  })

  test('creates a patient with every field filled in', async ({ page }) => {
    await page.goto('/patients/new')
    await expect(page.getByRole('heading', { name: 'New patient' })).toBeVisible()

    await page.getByLabel('First name').fill('  Calamity ')
    await page.getByLabel('Last name').fill(lastName)
    await page.getByLabel('Date of birth').fill('1975-05-01')
    await page.getByLabel('Email').fill('calamity@example.com')
    await page.getByLabel('Phone').fill('(512) 555-0188')
    await page.getByLabel('Address').fill('12 Deadwood Dr')
    await page.getByLabel('City').fill('Pflugerville')
    await page.getByLabel('State').fill('tx')
    await page.getByLabel('ZIP code').fill('78660')
    await page.getByLabel('Status', { exact: true }).selectOption('Critical')
    await page.getByLabel('Blood type').selectOption('AB-')
    await addTags(page, 'Conditions', ['Asthma', 'Migraine'])
    await addTags(page, 'Medications', ['Albuterol inhaler as needed'])
    await addTags(page, 'Allergies', ['Latex'])
    await page.getByLabel('Last visit').fill('2026-06-30')

    // The state is upper-cased as it is typed.
    await expect(page.getByLabel('State')).toHaveValue('TX')

    await page.getByRole('button', { name: 'Create patient' }).click()

    // Lands on the new patient's page, which shows what was entered.
    await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { name: `Calamity ${lastName}` })).toBeVisible()
    await expect(page.getByText(`Calamity ${lastName} was added`)).toBeVisible()
    const contact = page.getByRole('region', { name: 'Contact' })
    await expect(contact.getByText('calamity@example.com')).toBeVisible()
    await expect(contact.getByText('Pflugerville, TX 78660')).toBeVisible()
    const medical = page.getByRole('region', { name: 'Medical' })
    await expect(medical.getByText('AB-')).toBeVisible()
    await expect(medical.getByText('Migraine')).toBeVisible()
    await expect(medical.getByText('Albuterol inhaler as needed')).toBeVisible()

    // And the server stored exactly that.
    const [saved] = await findByLastName(page, lastName)
    expect(saved).toMatchObject({
      first_name: 'Calamity',
      last_name: lastName,
      date_of_birth: '1975-05-01',
      email: 'calamity@example.com',
      phone: '(512) 555-0188',
      address_line: '12 Deadwood Dr',
      city: 'Pflugerville',
      state: 'TX',
      postal_code: '78660',
      status: 'critical',
      blood_type: 'AB-',
      conditions: ['Asthma', 'Migraine'],
      medications: ['Albuterol inhaler as needed'],
      allergies: ['Latex'],
      last_visit: '2026-06-30',
    } satisfies PatientCreate)

    // The new patient shows up in the list.
    await page.getByRole('link', { name: 'Back to patients' }).click()
    await page.getByRole('textbox', { name: 'Search patients' }).fill(lastName)
    await expect(page.getByRole('link', { name: `Calamity ${lastName}` })).toBeVisible()
  })

  test('creates a patient from just the required fields @mobile', async ({ page }) => {
    await page.goto('/patients/new')

    await page.getByLabel('First name').fill('Calamity')
    await page.getByLabel('Last name').fill(lastName)
    await page.getByLabel('Date of birth').fill('2001-12-31')
    await page.getByRole('button', { name: 'Create patient' }).click()

    await expect(page.getByRole('heading', { name: `Calamity ${lastName}` })).toBeVisible()
    const [saved] = await findByLastName(page, lastName)
    // Fields left empty are stored as null, not as empty strings.
    expect(saved).toMatchObject({
      email: null,
      phone: null,
      address_line: null,
      city: null,
      state: null,
      postal_code: null,
      blood_type: null,
      last_visit: null,
      status: 'active',
      conditions: [],
      medications: [],
      allergies: [],
    })
  })

  test('names every missing required field and sends nothing', async ({ page }) => {
    let posts = 0
    page.on('request', (request) => {
      if (request.method() === 'POST') posts += 1
    })
    await page.goto('/patients/new')

    await page.getByRole('button', { name: 'Create patient' }).click()

    await expect(page.getByText('First name is required')).toBeVisible()
    await expect(page.getByText('Last name is required')).toBeVisible()
    await expect(page.getByText('Date of birth is required')).toBeVisible()
    // Focus moves to the first field that needs attention.
    await expect(page.getByLabel('First name')).toBeFocused()
    expect(posts).toBe(0)
    await expect(page).toHaveURL('/patients/new')
  })

  test('submitting straight from an invalid field still submits @mobile', async ({ page }) => {
    await page.goto('/patients/new')

    // Focus is still in the ZIP field when the button is pressed. Its error
    // must not make the press miss: the whole form should be validated.
    await page.getByLabel('ZIP code').fill('786')
    await page.getByRole('button', { name: 'Create patient' }).click()

    await expect(page.getByText('Use a 5-digit ZIP code, or ZIP+4')).toBeVisible()
    await expect(page.getByText('First name is required')).toBeVisible()
    await expect(page.getByText('Date of birth is required')).toBeVisible()
    await expect(page.getByLabel('First name')).toBeFocused()
  })

  test('checks each field as you leave it', async ({ page }) => {
    await page.goto('/patients/new')

    const cases: [string, string, string][] = [
      ['First name', '   ', 'First name is required'],
      ['Date of birth', '2999-01-01', 'Date of birth cannot be in the future'],
      ['Email', 'calamity@', 'Enter a valid email address'],
      ['Phone', 'call me', 'Use 7 to 20 digits; spaces and + ( ) . - are allowed'],
      ['State', 'T', 'Use the two-letter state code, e.g. TX'],
      ['ZIP code', '7866', 'Use a 5-digit ZIP code, or ZIP+4'],
      ['Last visit', '2999-01-01', 'Last visit cannot be in the future'],
    ]
    for (const [label, value, message] of cases) {
      const input = page.getByLabel(label)
      await input.fill(value)
      await input.blur()
      await expect(page.getByText(message)).toBeVisible()
      await expect(input).toHaveAttribute('aria-invalid', 'true')
    }

    // Correcting a field clears its message.
    await page.getByLabel('Email').fill('calamity@example.com')
    await page.getByLabel('Email').blur()
    await expect(page.getByText('Enter a valid email address')).toHaveCount(0)

    await page.getByLabel('Date of birth').fill('1850-01-01')
    await page.getByLabel('Date of birth').blur()
    await expect(page.getByText('Date of birth is too far in the past')).toBeVisible()
  })

  test('shows validation errors from the server on the matching fields', async ({ page }) => {
    // The browser's rules mirror the server's, so stand in for a server that
    // disagrees, to prove its answer is what the user sees.
    await page.route('**/api/patients', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 422,
            json: {
              detail: [
                {
                  loc: ['body', 'email'],
                  msg: 'value is not a valid email address: The domain name example.invalid does not exist.',
                  type: 'value_error',
                },
                {
                  loc: ['body', 'date_of_birth'],
                  msg: 'Value error, date of birth cannot be in the future',
                  type: 'value_error',
                },
              ],
            },
          })
        : route.continue(),
    )
    await page.goto('/patients/new')
    await page.getByLabel('First name').fill('Calamity')
    await page.getByLabel('Last name').fill(lastName)
    await page.getByLabel('Date of birth').fill('1975-05-01')
    await page.getByLabel('Email').fill('calamity@example.invalid')

    await page.getByRole('button', { name: 'Create patient' }).click()

    await expect(page.getByText(/The domain name example\.invalid does not exist/)).toBeVisible()
    await expect(page.getByText('Date of birth cannot be in the future')).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    // Still on the form, with everything that was typed.
    await expect(page.getByLabel('Last name')).toHaveValue(lastName)
  })

  test('a real server-side rejection reaches the form', async ({ page }) => {
    await page.goto('/patients/new')
    await page.getByLabel('First name').fill('Calamity')
    await page.getByLabel('Last name').fill(lastName)
    await page.getByLabel('Date of birth').fill('1975-05-01')
    // Passes the browser's email check, but the server refuses reserved domains.
    await page.getByLabel('Email').fill('calamity@clinic.test')

    await page.getByRole('button', { name: 'Create patient' }).click()

    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText(/not a valid email address/i)).toBeVisible()
    expect(await findByLastName(page, lastName)).toEqual([])
  })

  test('survives a network failure: explains, keeps the form, saves on retry', async ({ page }) => {
    let offline = true
    await page.route('**/api/patients', (route) =>
      offline && route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    await page.goto('/patients/new')
    await page.getByLabel('First name').fill('Calamity')
    await page.getByLabel('Last name').fill(lastName)
    await page.getByLabel('Date of birth').fill('1975-05-01')
    await addTags(page, 'Allergies', ['Latex'])

    await page.getByRole('button', { name: 'Create patient' }).click()

    const alert = page.getByRole('alert').filter({ hasText: 'The patient was not saved' })
    await expect(alert).toContainText('Could not reach the server')
    await expect(page.getByLabel('Last name')).toHaveValue(lastName)
    await expect(page.getByText('Latex')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create patient' })).toBeEnabled()

    offline = false
    await page.getByRole('button', { name: 'Create patient' }).click()
    await expect(page.getByRole('heading', { name: `Calamity ${lastName}` })).toBeVisible()
    expect(await findByLastName(page, lastName)).toHaveLength(1)
  })

  test('explains a server error without losing the form', async ({ page }) => {
    await page.route('**/api/patients', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, json: { detail: 'Internal server error' } })
        : route.continue(),
    )
    await page.goto('/patients/new')
    await page.getByLabel('First name').fill('Calamity')
    await page.getByLabel('Last name').fill(lastName)
    await page.getByLabel('Date of birth').fill('1975-05-01')

    await page.getByRole('button', { name: 'Create patient' }).click()

    await expect(page.getByText('The server ran into a problem')).toBeVisible()
    await expect(page.getByLabel('First name')).toHaveValue('Calamity')
  })

  test('Cancel goes back to the list without saving', async ({ page }) => {
    await page.goto('/patients/new')
    await page.getByLabel('Last name').fill(lastName)

    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page).toHaveURL('/patients')
    expect(await findByLastName(page, lastName)).toEqual([])
  })
})

test.describe('editing a patient on the /patients/:id/edit page', () => {
  let patient: Patient

  test.beforeEach(async ({ request }) => {
    patient = await createPatient(request, {
      first_name: 'Rowdy',
      conditions: ['Hypertension'],
      medications: ['Lisinopril 10 mg daily', 'Aspirin 81 mg daily'],
      allergies: ['Penicillin'],
    })
  })

  test.afterEach(async ({ request }) => {
    await deletePatient(request, patient.id)
  })

  test('starts from the current record and saves the changes @mobile', async ({ page }) => {
    await page.goto(`/patients/${patient.id}/edit`)

    await expect(
      page.getByRole('heading', { name: `Edit Rowdy ${patient.last_name}` }),
    ).toBeVisible()
    // Every field starts with what is on record.
    await expect(page.getByLabel('First name')).toHaveValue('Rowdy')
    await expect(page.getByLabel('Date of birth')).toHaveValue('1980-06-15')
    await expect(page.getByLabel('Email')).toHaveValue('rowdy@example.com')
    await expect(page.getByLabel('State')).toHaveValue('TX')
    await expect(page.getByLabel('Blood type')).toHaveValue('O+')
    await expect(page.getByLabel('Status', { exact: true })).toHaveValue('active')
    await expect(page.getByLabel('Last visit')).toHaveValue('2026-01-15')
    await expect(page.getByText('Lisinopril 10 mg daily')).toBeVisible()

    await page.getByLabel('First name').fill('Rowena')
    await page.getByLabel('Phone').fill('')
    await page.getByLabel('Status', { exact: true }).selectOption('Inactive')
    await page.getByLabel('Blood type').selectOption('Unknown')
    await addTags(page, 'Conditions', ['Gout'])
    // Remove a medication with Backspace, the way a tag input works.
    await page.getByRole('combobox', { name: 'Medications' }).press('Backspace')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page).toHaveURL(`/patients/${patient.id}`)
    await expect(page.getByRole('heading', { name: `Rowena ${patient.last_name}` })).toBeVisible()
    await expect(page.getByText('Changes saved')).toBeVisible()
    const medical = page.getByRole('region', { name: 'Medical' })
    await expect(medical.getByText('Gout')).toBeVisible()
    await expect(medical.getByText('Aspirin 81 mg daily')).toHaveCount(0)

    const saved = (await (
      await page.request.get(`${API_URL}/patients/${patient.id}`)
    ).json()) as Patient
    expect(saved).toMatchObject({
      first_name: 'Rowena',
      phone: null,
      status: 'inactive',
      blood_type: null,
      conditions: ['Hypertension', 'Gout'],
      medications: ['Lisinopril 10 mg daily'],
      allergies: ['Penicillin'],
      // Untouched fields are sent back unchanged.
      email: 'rowdy@example.com',
      date_of_birth: '1980-06-15',
      last_visit: '2026-01-15',
    })
  })

  test('validates edits like a new record, and Cancel discards them', async ({ page }) => {
    await page.goto(`/patients/${patient.id}/edit`)

    await page.getByLabel('Last name').fill('')
    await page.getByLabel('ZIP code').fill('abc')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('Last name is required')).toBeVisible()
    await expect(page.getByText('Use a 5-digit ZIP code, or ZIP+4')).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(`/patients/${patient.id}`)
    await expect(page.getByRole('heading', { name: `Rowdy ${patient.last_name}` })).toBeVisible()
    expect(await (await page.request.get(`${API_URL}/patients/${patient.id}`)).json()).toEqual(
      patient,
    )
  })

  test('keeps the edits when saving fails, then saves on retry', async ({ page }) => {
    let offline = true
    await page.route(`**/api/patients/${patient.id}`, (route) =>
      offline && route.request().method() === 'PUT' ? route.abort() : route.continue(),
    )
    await page.goto(`/patients/${patient.id}/edit`)
    await page.getByLabel('City').fill('Lampasas')

    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('The patient was not saved')).toBeVisible()
    await expect(page.getByLabel('City')).toHaveValue('Lampasas')

    offline = false
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(
      page.getByRole('region', { name: 'Contact' }).getByText('Lampasas, TX 78701'),
    ).toBeVisible()
  })

  test('shows "not found" when editing a patient that does not exist', async ({ page }) => {
    await page.goto('/patients/00000000-0000-4000-8000-000000000000/edit')

    await expect(page.getByRole('heading', { name: 'Patient not found' })).toBeVisible()
  })
})

test.describe('deleting a patient', () => {
  test('asks first, then deletes and returns to the list @mobile', async ({ page, request }) => {
    const patient = await createPatient(request, { first_name: 'Rowdy' })
    try {
      await page.goto(`/patients/${patient.id}`)

      await page.getByRole('button', { name: 'Delete' }).click()
      const dialog = page.getByRole('dialog', { name: `Delete Rowdy ${patient.last_name}?` })
      await expect(dialog).toContainText('It cannot be undone.')

      // Cancelling changes nothing.
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toBeHidden()
      expect((await request.get(`${API_URL}/patients/${patient.id}`)).status()).toBe(200)

      await page.getByRole('button', { name: 'Delete' }).click()
      await dialog.getByRole('button', { name: 'Delete patient' }).click()

      await expect(page).toHaveURL('/patients')
      await expect(page.getByText(`Rowdy ${patient.last_name} was deleted`)).toBeVisible()
      expect((await request.get(`${API_URL}/patients/${patient.id}`)).status()).toBe(404)

      await page.getByRole('textbox', { name: 'Search patients' }).fill(patient.last_name)
      await expect(page.getByText('No patients found')).toBeVisible()
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('says so when the delete fails and leaves the patient in place', async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request, { first_name: 'Rowdy' })
    try {
      await page.route(`**/api/patients/${patient.id}`, (route) =>
        route.request().method() === 'DELETE' ? route.abort() : route.continue(),
      )
      await page.goto(`/patients/${patient.id}`)

      await page.getByRole('button', { name: 'Delete' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Delete patient' }).click()

      await expect(page.getByText('The patient was not deleted')).toBeVisible()
      await expect(page.getByText('Could not reach the server')).toBeVisible()
      await expect(page).toHaveURL(`/patients/${patient.id}`)
      await expect(
        page.getByRole('heading', { name: `Rowdy ${patient.last_name}`, exact: true }),
      ).toBeVisible()
    } finally {
      await deletePatient(request, patient.id)
    }
  })
})
