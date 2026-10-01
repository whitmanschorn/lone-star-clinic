import { expect, test, type Page } from '@playwright/test'
import { API_URL, createPatient, deletePatient } from '../helpers'
import type { Note, Patient } from '../types'

function noteItems(page: Page) {
  return page.getByRole('region', { name: 'Notes' }).getByRole('listitem')
}

/** The n-th "chart update" row in the note form (1-based). */
function chartUpdate(page: Page, position: number) {
  return page.getByRole('group', { name: `Chart update ${position}`, exact: true })
}

test.describe('updating the chart while adding a note', () => {
  let patient: Patient

  test.beforeEach(async ({ page, request }) => {
    patient = await createPatient(request, {
      first_name: 'Rowdy',
      conditions: ['Hypertension'],
      medications: ['Lisinopril 10 mg daily', 'Aspirin 81 mg daily'],
      allergies: ['Penicillin'],
    })
    await page.goto(`/patients/${patient.id}?tab=notes`)
    await expect(page.getByRole('textbox', { name: 'New note' })).toBeVisible()
  })

  test.afterEach(async ({ request }) => {
    await deletePatient(request, patient.id)
  })

  test('adds a new condition, medication and allergy with the note @mobile', async ({
    page,
    request,
  }) => {
    await page.getByRole('textbox', { name: 'New note' }).fill('A1c 7.8%. Starting metformin.')

    await page.getByRole('button', { name: 'Condition' }).click()
    await chartUpdate(page, 1)
      .getByRole('textbox', { name: 'New condition' })
      .fill('Type 2 diabetes')
    await page.getByRole('button', { name: 'Medication' }).click()
    await chartUpdate(page, 2)
      .getByRole('textbox', { name: 'New medication' })
      .fill('Metformin 500 mg twice daily')
    await page.getByRole('button', { name: 'Allergy' }).click()
    await chartUpdate(page, 3).getByRole('textbox', { name: 'New allergy' }).fill('Latex')

    await page.getByRole('button', { name: 'Add note' }).click()

    // The note lists what it changed...
    const note = noteItems(page).first()
    await expect(note).toContainText('A1c 7.8%. Starting metformin.')
    const changes = note.getByRole('group', { name: 'Chart changes' })
    await expect(changes).toContainText('Added condition: Type 2 diabetes')
    await expect(changes).toContainText('Added medication: Metformin 500 mg twice daily')
    await expect(changes).toContainText('Added allergy: Latex')
    // ...and the form is back to a plain note.
    await expect(chartUpdate(page, 1)).toHaveCount(0)

    // The chart itself has changed, on the server and on the Overview tab.
    const saved = (await (await request.get(`${API_URL}/patients/${patient.id}`)).json()) as Patient
    expect(saved.conditions).toEqual(['Hypertension', 'Type 2 diabetes'])
    expect(saved.medications).toEqual([
      'Lisinopril 10 mg daily',
      'Aspirin 81 mg daily',
      'Metformin 500 mg twice daily',
    ])
    expect(saved.allergies).toEqual(['Penicillin', 'Latex'])

    await page.getByRole('tab', { name: 'Overview' }).click()
    const medical = page.getByRole('region', { name: 'Medical' })
    await expect(medical.getByText('Type 2 diabetes')).toBeVisible()
    await expect(medical.getByText('Metformin 500 mg twice daily')).toBeVisible()
    await expect(medical.getByText('Latex')).toBeVisible()
  })

  test('updates an existing medication, starting from its current wording', async ({
    page,
    request,
  }) => {
    await page.getByRole('textbox', { name: 'New note' }).fill('BP still high. Doubling the dose.')
    await page.getByRole('button', { name: 'Medication' }).click()
    const row = chartUpdate(page, 1)
    await row.getByRole('combobox', { name: 'Action' }).selectOption('Update')

    // Only this patient's medications are offered.
    const existing = row.getByRole('combobox', { name: 'Existing medication' })
    await expect(existing.getByRole('option')).toHaveText([
      'Choose a medication…',
      'Lisinopril 10 mg daily',
      'Aspirin 81 mg daily',
    ])
    await existing.selectOption('Lisinopril 10 mg daily')

    const changeTo = row.getByRole('textbox', { name: 'Change to' })
    await expect(changeTo).toHaveValue('Lisinopril 10 mg daily')
    await changeTo.fill('Lisinopril 20 mg daily')
    await page.getByRole('button', { name: 'Add note' }).click()

    await expect(noteItems(page).first()).toContainText(
      'Updated medication: Lisinopril 10 mg daily → Lisinopril 20 mg daily',
    )
    const saved = (await (await request.get(`${API_URL}/patients/${patient.id}`)).json()) as Patient
    expect(saved.medications).toEqual(['Lisinopril 20 mg daily', 'Aspirin 81 mg daily'])

    // The summary reflects the new chart and tells what the note changed.
    await page.getByRole('tab', { name: 'Summary' }).click()
    const summary = page.getByRole('region', { name: 'Summary' })
    await expect(summary.getByText('Lisinopril 20 mg daily', { exact: true })).toBeVisible()
    await expect(
      summary.getByText(
        /Chart updated: changed medication Lisinopril 10 mg daily to Lisinopril 20 mg daily\./,
      ),
    ).toBeVisible()
  })

  test('updates a condition and an allergy, and removes a medication, in one note', async ({
    page,
    request,
  }) => {
    await page.getByRole('textbox', { name: 'New note' }).fill('Annual review of the chart.')

    await page.getByRole('button', { name: 'Condition' }).click()
    await chartUpdate(page, 1).getByRole('combobox', { name: 'Action' }).selectOption('Update')
    await chartUpdate(page, 1)
      .getByRole('combobox', { name: 'Existing condition' })
      .selectOption('Hypertension')
    await chartUpdate(page, 1)
      .getByRole('textbox', { name: 'Change to' })
      .fill('Hypertension (controlled)')

    await page.getByRole('button', { name: 'Allergy' }).click()
    await chartUpdate(page, 2).getByRole('combobox', { name: 'Action' }).selectOption('Update')
    await chartUpdate(page, 2)
      .getByRole('combobox', { name: 'Existing allergy' })
      .selectOption('Penicillin')
    await chartUpdate(page, 2)
      .getByRole('textbox', { name: 'Change to' })
      .fill('Penicillin (hives)')

    await page.getByRole('button', { name: 'Medication' }).click()
    await chartUpdate(page, 3).getByRole('combobox', { name: 'Action' }).selectOption('Remove')
    await chartUpdate(page, 3)
      .getByRole('combobox', { name: 'Existing medication' })
      .selectOption('Aspirin 81 mg daily')

    await page.getByRole('button', { name: 'Add note' }).click()

    const changes = noteItems(page).first().getByRole('group', { name: 'Chart changes' })
    await expect(changes).toContainText(
      'Updated condition: Hypertension → Hypertension (controlled)',
    )
    await expect(changes).toContainText('Updated allergy: Penicillin → Penicillin (hives)')
    await expect(changes).toContainText('Removed medication: Aspirin 81 mg daily')

    const saved = (await (await request.get(`${API_URL}/patients/${patient.id}`)).json()) as Patient
    expect(saved.conditions).toEqual(['Hypertension (controlled)'])
    expect(saved.allergies).toEqual(['Penicillin (hives)'])
    expect(saved.medications).toEqual(['Lisinopril 10 mg daily'])
  })

  test('the row type can be switched, and a row can be discarded', async ({ page, request }) => {
    await page.getByRole('textbox', { name: 'New note' }).fill('Plain note after all.')
    await page.getByRole('button', { name: 'Condition' }).click()
    const row = chartUpdate(page, 1)

    await row.getByRole('combobox', { name: 'Type' }).selectOption('Allergy')
    await expect(row.getByRole('textbox', { name: 'New allergy' })).toBeVisible()

    await page.getByRole('button', { name: 'Discard chart update 1' }).click()
    await expect(row).toHaveCount(0)
    await page.getByRole('button', { name: 'Add note' }).click()

    await expect(noteItems(page)).toHaveCount(1)
    await expect(noteItems(page).first().getByRole('group', { name: 'Chart changes' })).toHaveCount(
      0,
    )
    const notes = (await (
      await request.get(`${API_URL}/patients/${patient.id}/notes`)
    ).json()) as Note[]
    expect(notes[0]?.changes).toEqual([])
  })

  test('checks chart updates in the browser before sending anything', async ({ page }) => {
    let posts = 0
    page.on('request', (request) => {
      if (request.method() === 'POST') posts += 1
    })
    await page.getByRole('textbox', { name: 'New note' }).fill('Checking validation.')

    // An empty "add".
    await page.getByRole('button', { name: 'Medication' }).click()
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(chartUpdate(page, 1).getByText('Enter the medication to add')).toBeVisible()

    // A duplicate, whatever the capitalisation.
    await chartUpdate(page, 1)
      .getByRole('textbox', { name: 'New medication' })
      .fill('aspirin 81 mg DAILY')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(chartUpdate(page, 1).getByText('Already on the chart')).toBeVisible()

    // An update with nothing chosen, then with the wording left unchanged.
    await chartUpdate(page, 1).getByRole('combobox', { name: 'Action' }).selectOption('Update')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(chartUpdate(page, 1).getByText('Choose the medication to update')).toBeVisible()
    await chartUpdate(page, 1)
      .getByRole('combobox', { name: 'Existing medication' })
      .selectOption('Aspirin 81 mg daily')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(
      chartUpdate(page, 1).getByText('This is the same as the current entry'),
    ).toBeVisible()

    expect(posts).toBe(0)
    await expect(noteItems(page)).toHaveCount(0)
  })

  test('says so when there is nothing on the chart to update', async ({ page, request }) => {
    const blank = await createPatient(request, { conditions: [], medications: [], allergies: [] })
    try {
      await page.goto(`/patients/${blank.id}?tab=notes`)
      await page.getByRole('textbox', { name: 'New note' }).fill('Nothing to change.')
      await page.getByRole('button', { name: 'Allergy' }).click()
      await chartUpdate(page, 1).getByRole('combobox', { name: 'Action' }).selectOption('Update')

      const existing = chartUpdate(page, 1).getByRole('combobox', { name: 'Existing allergy' })
      await expect(existing).toBeDisabled()
      await expect(existing).toContainText('No allergy on the chart')

      await page.getByRole('button', { name: 'Add note' }).click()
      await expect(chartUpdate(page, 1).getByText('There is no allergy to update')).toBeVisible()
    } finally {
      await deletePatient(request, blank.id)
    }
  })

  test('explains a conflict when the chart changed elsewhere, and keeps the note', async ({
    page,
    request,
  }) => {
    await page.getByRole('textbox', { name: 'New note' }).fill('Stopping aspirin.')
    await page.getByRole('button', { name: 'Medication' }).click()
    await chartUpdate(page, 1).getByRole('combobox', { name: 'Action' }).selectOption('Remove')
    await chartUpdate(page, 1)
      .getByRole('combobox', { name: 'Existing medication' })
      .selectOption('Aspirin 81 mg daily')

    // Meanwhile, someone else removes it first.
    await request.post(`${API_URL}/patients/${patient.id}/notes`, {
      data: {
        content: 'Aspirin stopped by phone.',
        changes: [{ field: 'medications', action: 'remove', value: 'Aspirin 81 mg daily' }],
      },
    })
    await page.getByRole('button', { name: 'Add note' }).click()

    await expect(page.getByText('The note was not saved')).toBeVisible()
    await expect(
      page.getByText('Medication "Aspirin 81 mg daily" is not on the chart.'),
    ).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'New note' })).toHaveValue('Stopping aspirin.')
    // The form now offers the chart as it really is.
    await expect(
      chartUpdate(page, 1)
        .getByRole('combobox', { name: 'Existing medication' })
        .getByRole('option'),
    ).toHaveText(['Choose a medication…', 'Lisinopril 10 mg daily'])
  })

  test('shows server-side validation errors on the row they belong to', async ({ page }) => {
    await page.route('**/api/patients/*/notes', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 422,
            json: {
              detail: [
                {
                  loc: ['body', 'changes', 0, 'value'],
                  msg: 'String should have at most 100 characters',
                  type: 'string_too_long',
                },
              ],
            },
          })
        : route.continue(),
    )
    await page.getByRole('textbox', { name: 'New note' }).fill('Fine in the browser.')
    await page.getByRole('button', { name: 'Condition' }).click()
    await chartUpdate(page, 1).getByRole('textbox', { name: 'New condition' }).fill('Gout')
    await page.getByRole('button', { name: 'Add note' }).click()

    await expect(
      chartUpdate(page, 1).getByText('String should have at most 100 characters'),
    ).toBeVisible()
  })
})
