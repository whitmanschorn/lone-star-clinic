import { expect, test, type Page } from '@playwright/test'
import { API_URL, createPatient, deletePatient } from '../helpers'
import type { Note, Patient, PatientsPage } from '../types'

function noteItems(page: Page) {
  return page.getByRole('region', { name: 'Notes' }).getByRole('listitem')
}

test.describe('notes on a seeded patient', () => {
  test('the Notes tab lists existing notes with timestamps, newest first', async ({
    page,
    request,
  }) => {
    const list = (await (
      await request.get(`${API_URL}/patients?q=slim calhoun`)
    ).json()) as PatientsPage
    await page.goto(`/patients/${list.items[0]!.id}`)

    await page.getByRole('tab', { name: 'Notes (3)' }).click()

    await expect(page).toHaveURL(/\?tab=notes$/)
    await expect(page.getByRole('heading', { name: '3 notes' })).toBeVisible()
    await expect(noteItems(page)).toHaveCount(3)
    await expect(noteItems(page).first()).toContainText('A1c down to 6.9%')
    await expect(noteItems(page).last()).toContainText('Annual physical')
    // Each note shows when it was written, e.g. "Sep 25, 2026, 10:30 AM".
    await expect(noteItems(page).first().locator('time')).toHaveText(
      /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s[AP]M$/,
    )
  })
})

test.describe('notes on a fresh patient', () => {
  let patient: Patient

  test.beforeEach(async ({ page, request }) => {
    patient = await createPatient(request, { first_name: 'Rowdy' })
    await page.goto(`/patients/${patient.id}?tab=notes`)
    await expect(page.getByText('No notes yet. Add the first one above.')).toBeVisible()
  })

  test.afterEach(async ({ request }) => {
    await deletePatient(request, patient.id)
  })

  test('adds a note and shows it at the top of the list @mobile', async ({ page }) => {
    await page.getByRole('textbox', { name: 'New note' }).fill('Thrown from a horse. Bruised ribs.')
    await page.getByRole('button', { name: 'Add note' }).click()

    await expect(noteItems(page)).toHaveCount(1)
    await expect(noteItems(page).first()).toContainText('Thrown from a horse. Bruised ribs.')
    await expect(page.getByRole('tab', { name: 'Notes (1)' })).toBeVisible()
    // The form is ready for the next note.
    await expect(page.getByRole('textbox', { name: 'New note' })).toHaveValue('')

    await page.getByRole('textbox', { name: 'New note' }).fill('Ribs healing well.')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(noteItems(page)).toHaveCount(2)
    await expect(noteItems(page).first()).toContainText('Ribs healing well.')
  })

  test('saves the chosen date and time with the note', async ({ page, request }) => {
    await page.getByRole('textbox', { name: 'New note' }).fill('Backdated entry.')
    await page.getByLabel('Date and time').fill('2026-02-03T14:45')
    await page.getByRole('button', { name: 'Add note' }).click()

    await expect(noteItems(page).first().locator('time')).toHaveText('Feb 3, 2026, 2:45 PM')
    const saved = (await (
      await request.get(`${API_URL}/patients/${patient.id}/notes`)
    ).json()) as Note[]
    // 2:45 PM in the browser's time zone, whatever that is.
    expect(new Date(saved[0]!.timestamp).getTime()).toBe(
      await page.evaluate(() => new Date('2026-02-03T14:45').getTime()),
    )
  })

  test('refuses an empty note or a future date without calling the server', async ({ page }) => {
    let posts = 0
    page.on('request', (request) => {
      if (request.method() === 'POST') posts += 1
    })

    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByText('Write the note before saving it')).toBeVisible()

    await page.getByRole('textbox', { name: 'New note' }).fill('From the future.')
    await page.getByLabel('Date and time').fill('2999-01-01T09:00')
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(page.getByText('A note cannot be dated in the future')).toBeVisible()

    expect(posts).toBe(0)
    await expect(noteItems(page)).toHaveCount(0)
  })

  test('shows server-side validation errors on the field', async ({ page }) => {
    // Pretend the server rejects the note, as it would if the rules differed.
    await page.route('**/api/patients/*/notes', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({
            status: 422,
            json: {
              detail: [
                {
                  loc: ['body', 'content'],
                  msg: 'Value error, must not be blank',
                  type: 'value_error',
                },
              ],
            },
          })
        : route.continue(),
    )

    await page.getByRole('textbox', { name: 'New note' }).fill('Looks fine to the browser.')
    await page.getByRole('button', { name: 'Add note' }).click()

    await expect(page.getByText('Must not be blank')).toBeVisible()
  })

  test('keeps the text and explains when the network fails, then saves on retry', async ({
    page,
  }) => {
    let offline = true
    await page.route('**/api/patients/*/notes', (route) =>
      offline && route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    const textbox = page.getByRole('textbox', { name: 'New note' })

    await textbox.fill('Do not lose this.')
    await page.getByRole('button', { name: 'Add note' }).click()

    await expect(page.getByText('The note was not saved')).toBeVisible()
    await expect(page.getByText('Could not reach the server')).toBeVisible()
    await expect(textbox).toHaveValue('Do not lose this.')

    offline = false
    await page.getByRole('button', { name: 'Add note' }).click()
    await expect(noteItems(page).first()).toContainText('Do not lose this.')
    await expect(page.getByText('The note was not saved')).toHaveCount(0)
  })

  test('deletes a note after confirmation', async ({ page, request }) => {
    await request.post(`${API_URL}/patients/${patient.id}/notes`, {
      data: { content: 'Keep this one.', timestamp: '2026-01-01T15:00:00Z' },
    })
    await request.post(`${API_URL}/patients/${patient.id}/notes`, {
      data: { content: 'Entered on the wrong chart.', timestamp: '2026-02-01T15:00:00Z' },
    })
    await page.reload()
    await expect(noteItems(page)).toHaveCount(2)

    const wrongNote = noteItems(page).filter({ hasText: 'Entered on the wrong chart.' })
    await wrongNote.getByRole('button', { name: /^Delete note from/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this note?' })
    await expect(dialog).toContainText('Entered on the wrong chart.')

    // Cancelling leaves everything as it was.
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await expect(noteItems(page)).toHaveCount(2)

    await wrongNote.getByRole('button', { name: /^Delete note from/ }).click()
    await dialog.getByRole('button', { name: 'Delete note' }).click()

    await expect(dialog).toBeHidden()
    await expect(noteItems(page)).toHaveCount(1)
    await expect(noteItems(page).first()).toContainText('Keep this one.')
    await expect(page.getByRole('tab', { name: 'Notes (1)' })).toBeVisible()
  })
})

test.describe('summary view', () => {
  test('shows identifiers, clinical information and the narrative @mobile', async ({
    page,
    request,
  }) => {
    const list = (await (
      await request.get(`${API_URL}/patients?q=tex holloway`)
    ).json()) as PatientsPage
    const tex = list.items[0]!
    await page.goto(`/patients/${tex.id}`)

    await page.getByRole('tab', { name: 'Summary' }).click()

    const summary = page.getByRole('region', { name: 'Summary' })
    await expect(summary.getByRole('heading', { name: 'Tex Holloway' })).toBeVisible()
    await expect(summary.getByText(`${tex.age} years old · Blood type B+`)).toBeVisible()
    await expect(summary.getByText('COPD', { exact: true })).toBeVisible()
    await expect(summary.getByText('Atrial fibrillation', { exact: true })).toBeVisible()
    await expect(summary.getByText('Metoprolol 50 mg twice daily')).toBeVisible()
    await expect(summary.getByText('Sulfa drugs')).toBeVisible()
    await expect(summary.getByText(/^There are 3 clinical notes on file/)).toBeVisible()
    await expect(
      summary.getByText(/Most recently, on .*: COPD flare not fully settled\./),
    ).toBeVisible()
    await expect(summary.getByText(/from 3 notes$/)).toBeVisible()
  })

  test('reflects a note added on the Notes tab', async ({ page, request }) => {
    const patient = await createPatient(request, { first_name: 'Rowdy' })
    try {
      await page.goto(`/patients/${patient.id}?tab=summary`)
      const summary = page.getByRole('region', { name: 'Summary' })
      await expect(
        summary.getByText('No clinical notes have been recorded for Rowdy yet.'),
      ).toBeVisible()

      await page.getByRole('tab', { name: /^Notes/ }).click()
      await page.getByRole('textbox', { name: 'New note' }).fill('Stepped on by a steer; toe taped')
      await page.getByRole('button', { name: 'Add note' }).click()
      await expect(noteItems(page)).toHaveCount(1)

      await page.getByRole('tab', { name: 'Summary' }).click()
      await expect(
        summary.getByText(
          /^There is one clinical note on file, from .*: Stepped on by a steer; toe taped\.$/,
        ),
      ).toBeVisible()
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('opens straight to a tab from the URL and falls back for unknown tabs', async ({
    page,
    request,
  }) => {
    const patient = await createPatient(request)
    try {
      await page.goto(`/patients/${patient.id}?tab=summary`)
      await expect(page.getByRole('tab', { name: 'Summary' })).toHaveAttribute(
        'aria-selected',
        'true',
      )

      await page.goto(`/patients/${patient.id}?tab=nonsense`)
      await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(page.getByRole('region', { name: 'Contact' })).toBeVisible()
    } finally {
      await deletePatient(request, patient.id)
    }
  })
})
