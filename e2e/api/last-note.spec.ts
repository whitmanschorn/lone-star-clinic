import { expect, test, type APIRequestContext } from '@playwright/test'
import { createPatient, deletePatient } from '../helpers'
import type { Note, Patient, PatientsPage } from '../types'

async function addNote(
  request: APIRequestContext,
  patientId: string,
  content: string,
  timestamp: string,
): Promise<Note> {
  const response = await request.post(`/patients/${patientId}/notes`, {
    data: { content, timestamp },
  })
  expect(response.status()).toBe(201)
  return (await response.json()) as Note
}

async function getPatient(request: APIRequestContext, id: string): Promise<Patient> {
  return (await (await request.get(`/patients/${id}`)).json()) as Patient
}

async function list(request: APIRequestContext, query: string): Promise<PatientsPage> {
  const response = await request.get(`/patients?${query}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as PatientsPage
}

test.describe("a patient's last note", () => {
  test('seeded patients carry a preview of their most recent note', async ({ request }) => {
    const page = await list(request, 'q=slim calhoun')

    expect(page.items[0]?.last_note).toMatchObject({
      excerpt:
        'A1c down to 6.9% and BP 132/82. Reports walking the fence line every morning. Continue current plan; recheck in three…',
    })
    expect(page.items[0]?.last_note?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('is null for a patient with no notes, on every endpoint that returns a patient', async ({
    request,
  }) => {
    const created = await createPatient(request)
    try {
      expect(created.last_note).toBeNull()
      expect((await getPatient(request, created.id)).last_note).toBeNull()
      const page = await list(request, `q=${created.last_name}`)
      expect(page.items[0]?.last_note).toBeNull()
    } finally {
      await deletePatient(request, created.id)
    }
  })

  test('follows the newest note by timestamp as notes are added and deleted', async ({
    request,
  }) => {
    const patient = await createPatient(request)
    try {
      const march = await addNote(request, patient.id, 'March visit.', '2026-03-01T15:00:00Z')
      expect((await getPatient(request, patient.id)).last_note).toEqual({
        id: march.id,
        timestamp: march.timestamp,
        excerpt: 'March visit.',
      })

      // An older note, added later, does not become the last note.
      await addNote(request, patient.id, 'January visit.', '2026-01-01T15:00:00Z')
      expect((await getPatient(request, patient.id)).last_note?.id).toBe(march.id)

      const may = await addNote(request, patient.id, 'May visit.', '2026-05-01T15:00:00Z')
      expect((await getPatient(request, patient.id)).last_note?.id).toBe(may.id)
      // The list and an update of the record agree.
      expect((await list(request, `q=${patient.last_name}`)).items[0]?.last_note?.id).toBe(may.id)
      const { id, created_at, updated_at, age, last_note, ...body } = patient
      void [id, created_at, updated_at, age, last_note]
      const put = (await (
        await request.put(`/patients/${patient.id}`, { data: body })
      ).json()) as Patient
      expect(put.last_note?.id).toBe(may.id)

      // Deleting the newest note falls back to the one before it.
      await request.delete(`/patients/${patient.id}/notes/${may.id}`)
      expect((await getPatient(request, patient.id)).last_note?.id).toBe(march.id)
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('shortens a long note to an excerpt', async ({ request }) => {
    const patient = await createPatient(request)
    try {
      await addNote(
        request,
        patient.id,
        'Long   consult.\n' + 'word '.repeat(200),
        '2026-03-01T15:00:00Z',
      )

      const excerpt = (await getPatient(request, patient.id)).last_note!.excerpt
      expect(excerpt.length).toBeLessThanOrEqual(120)
      expect(excerpt.startsWith('Long consult. word word')).toBe(true)
      expect(excerpt.endsWith('…')).toBe(true)
    } finally {
      await deletePatient(request, patient.id)
    }
  })
})

test.describe('GET /patients?sort=last_note', () => {
  test('newest notes first, with never-noted patients last', async ({ request }) => {
    const page = await list(request, 'sort=last_note&order=desc&page_size=100')

    const stamps = page.items.map((patient) => patient.last_note?.timestamp ?? null)
    const noted = stamps.filter((stamp) => stamp !== null)
    // Every patient with a note comes before every patient without one...
    expect(stamps.slice(0, noted.length)).toEqual(noted)
    // ...and those with notes are in descending order.
    expect(noted).toEqual([...noted].sort().reverse())
    expect(noted.length).toBeGreaterThanOrEqual(9)
    expect(page.items[0]?.last_note?.excerpt).toBeTruthy()
  })

  test('oldest notes first still puts never-noted patients last', async ({ request }) => {
    const page = await list(request, 'sort=last_note&order=asc&page_size=100')

    const stamps = page.items.map((patient) => patient.last_note?.timestamp ?? null)
    const noted = stamps.filter((stamp) => stamp !== null)
    expect(stamps.slice(0, noted.length)).toEqual(noted)
    expect(noted).toEqual([...noted].sort())
  })

  test('a new note moves the patient to the top', async ({ request }) => {
    const patient = await createPatient(request)
    try {
      await request.post(`/patients/${patient.id}/notes`, { data: { content: 'Just now.' } })

      const page = await list(request, 'sort=last_note&order=desc&page_size=5')
      // Other tests add notes "now" too, so look in the first few rather than at row one.
      expect(page.items.map((item) => item.id)).toContain(patient.id)
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('pages do not repeat or skip patients', async ({ request }) => {
    const first = await list(request, 'sort=last_note&order=desc&page_size=10&page=1')
    const second = await list(request, 'sort=last_note&order=desc&page_size=10&page=2')

    const ids = new Set([...first.items, ...second.items].map((patient) => patient.id))
    expect(ids.size).toBe(20)
  })
})
