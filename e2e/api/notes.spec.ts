import { expect, test, type APIRequestContext } from '@playwright/test'
import { createPatient, deletePatient } from '../helpers'
import type { ErrorMessage, Note, Patient, PatientsPage, ValidationErrors } from '../types'

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

async function addNote(
  request: APIRequestContext,
  patientId: string,
  content: string,
  timestamp?: string,
): Promise<Note> {
  const response = await request.post(`/patients/${patientId}/notes`, {
    data: { content, timestamp },
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as Note
}

async function listNotes(request: APIRequestContext, patientId: string): Promise<Note[]> {
  const response = await request.get(`/patients/${patientId}/notes`)
  expect(response.status()).toBe(200)
  return (await response.json()) as Note[]
}

test.describe('patient notes', () => {
  let patient: Patient

  test.beforeEach(async ({ request }) => {
    patient = await createPatient(request)
  })

  test.afterEach(async ({ request }) => {
    await deletePatient(request, patient.id)
  })

  test('a new patient has no notes', async ({ request }) => {
    expect(await listNotes(request, patient.id)).toEqual([])
  })

  test('POST adds a note with the given timestamp and content', async ({ request }) => {
    const response = await request.post(`/patients/${patient.id}/notes`, {
      data: { timestamp: '2026-03-04T15:30:00-06:00', content: '  Sprained wrist.  ' },
    })

    expect(response.status()).toBe(201)
    const note = (await response.json()) as Note
    expect(note).toMatchObject({ patient_id: patient.id, content: 'Sprained wrist.' })
    // Stored and returned in UTC, whatever offset it arrived with.
    expect(Date.parse(note.timestamp)).toBe(Date.parse('2026-03-04T21:30:00Z'))
    expect(response.headers()['location']).toBe(`/patients/${patient.id}/notes/${note.id}`)

    expect(await listNotes(request, patient.id)).toEqual([note])
  })

  test('the timestamp defaults to now', async ({ request }) => {
    const before = Date.now()
    const note = await addNote(request, patient.id, 'Walk-in visit.')

    expect(Date.parse(note.timestamp)).toBeGreaterThanOrEqual(before - 5_000)
    expect(Date.parse(note.timestamp)).toBeLessThanOrEqual(Date.now() + 5_000)
  })

  test('a timestamp without an offset is taken as UTC', async ({ request }) => {
    const note = await addNote(request, patient.id, 'Phone call.', '2026-03-04T15:30:00')

    expect(Date.parse(note.timestamp)).toBe(Date.parse('2026-03-04T15:30:00Z'))
  })

  test('GET lists notes newest first, whatever order they were added in', async ({ request }) => {
    await addNote(request, patient.id, 'Second visit.', '2026-02-01T10:00:00Z')
    await addNote(request, patient.id, 'Third visit.', '2026-03-01T10:00:00Z')
    await addNote(request, patient.id, 'First visit.', '2026-01-01T10:00:00Z')

    const notes = await listNotes(request, patient.id)
    expect(notes.map((note) => note.content)).toEqual([
      'Third visit.',
      'Second visit.',
      'First visit.',
    ])
  })

  const invalidNotes: [string, Record<string, unknown>, string][] = [
    ['missing content', {}, 'content'],
    ['blank content', { content: '   ' }, 'content'],
    ['content over 5000 characters', { content: 'x'.repeat(5001) }, 'content'],
    ['content that is not text', { content: 42 }, 'content'],
    ['a timestamp that is not a date', { content: 'ok', timestamp: 'yesterday' }, 'timestamp'],
    [
      'a timestamp in the future',
      { content: 'ok', timestamp: '2999-01-01T00:00:00Z' },
      'timestamp',
    ],
  ]
  for (const [description, body, field] of invalidNotes) {
    test(`POST rejects ${description} with 422`, async ({ request }) => {
      const response = await request.post(`/patients/${patient.id}/notes`, { data: body })

      expect(response.status()).toBe(422)
      const errors = (await response.json()) as ValidationErrors
      expect(errors.detail?.map((error) => error.loc.at(-1))).toEqual([field])
      expect(await listNotes(request, patient.id)).toEqual([])
    })
  }

  test('DELETE removes one note and leaves the others', async ({ request }) => {
    const keep = await addNote(request, patient.id, 'Keep me.', '2026-01-01T10:00:00Z')
    const remove = await addNote(request, patient.id, 'Remove me.', '2026-02-01T10:00:00Z')

    const response = await request.delete(`/patients/${patient.id}/notes/${remove.id}`)
    expect(response.status()).toBe(204)
    expect(await listNotes(request, patient.id)).toEqual([keep])

    const again = await request.delete(`/patients/${patient.id}/notes/${remove.id}`)
    expect(again.status()).toBe(404)
    expect((await again.json()) as ErrorMessage).toEqual({ detail: 'Note not found' })
  })

  test("DELETE will not remove another patient's note", async ({ request }) => {
    const other = await createPatient(request)
    try {
      const theirs = await addNote(request, other.id, 'Not yours.')

      const response = await request.delete(`/patients/${patient.id}/notes/${theirs.id}`)

      expect(response.status()).toBe(404)
      expect(await listNotes(request, other.id)).toHaveLength(1)
    } finally {
      await deletePatient(request, other.id)
    }
  })

  test('DELETE rejects a note id that is not a UUID with 422', async ({ request }) => {
    const response = await request.delete(`/patients/${patient.id}/notes/not-a-uuid`)

    expect(response.status()).toBe(422)
  })

  test("deleting a patient deletes the patient's notes", async ({ request }) => {
    const doomed = await createPatient(request)
    await addNote(request, doomed.id, 'Soon gone.')

    expect((await request.delete(`/patients/${doomed.id}`)).status()).toBe(204)

    expect((await request.get(`/patients/${doomed.id}/notes`)).status()).toBe(404)
  })
})

test.describe('notes for a patient that does not exist', () => {
  test('GET returns 404', async ({ request }) => {
    const response = await request.get(`/patients/${UNKNOWN_ID}/notes`)

    expect(response.status()).toBe(404)
    expect((await response.json()) as ErrorMessage).toEqual({ detail: 'Patient not found' })
  })

  test('POST returns 404', async ({ request }) => {
    const response = await request.post(`/patients/${UNKNOWN_ID}/notes`, {
      data: { content: 'Nobody home.' },
    })

    expect(response.status()).toBe(404)
  })

  test('DELETE returns 404', async ({ request }) => {
    const response = await request.delete(`/patients/${UNKNOWN_ID}/notes/${UNKNOWN_ID}`)

    expect(response.status()).toBe(404)
  })
})

test('seeded patients come with notes', async ({ request }) => {
  const page = (await (await request.get('/patients?q=slim calhoun')).json()) as PatientsPage
  const notes = await listNotes(request, page.items[0]!.id)

  expect(notes).toHaveLength(3)
  expect(notes[0]?.content).toContain('A1c down to 6.9%')
  expect(notes[2]?.content).toContain('Annual physical')
})
