import { expect, test, type APIRequestContext } from '@playwright/test'
import { createPatient, deletePatient } from '../helpers'
import type { ChartChange, ErrorMessage, Note, Patient, ValidationErrors } from '../types'

async function getPatient(request: APIRequestContext, id: string): Promise<Patient> {
  return (await (await request.get(`/patients/${id}`)).json()) as Patient
}

async function getNotes(request: APIRequestContext, id: string): Promise<Note[]> {
  return (await (await request.get(`/patients/${id}/notes`)).json()) as Note[]
}

function postNote(request: APIRequestContext, id: string, changes: unknown, content = 'Visit.') {
  return request.post(`/patients/${id}/notes`, { data: { content, changes } })
}

test.describe('chart changes made with a note', () => {
  let patient: Patient

  test.beforeEach(async ({ request }) => {
    patient = await createPatient(request, {
      conditions: ['Hypertension'],
      medications: ['Lisinopril 10 mg daily', 'Aspirin 81 mg daily'],
      allergies: ['Penicillin'],
    })
  })

  test.afterEach(async ({ request }) => {
    await deletePatient(request, patient.id)
  })

  test('a note without changes leaves the chart alone', async ({ request }) => {
    const response = await postNote(request, patient.id, undefined)

    expect(response.status()).toBe(201)
    expect(((await response.json()) as Note).changes).toEqual([])
    expect(await getPatient(request, patient.id)).toEqual(patient)
  })

  test('adds a new condition, medication and allergy', async ({ request }) => {
    const changes: ChartChange[] = [
      { field: 'conditions', action: 'add', value: 'Type 2 diabetes' },
      { field: 'medications', action: 'add', value: '  Metformin 500 mg twice daily  ' },
      { field: 'allergies', action: 'add', value: 'Latex' },
    ]
    const response = await postNote(request, patient.id, changes, 'A1c 7.8%. Starting metformin.')

    expect(response.status()).toBe(201)
    const note = (await response.json()) as Note
    // The note records what it changed, with values tidied.
    expect(note.changes).toEqual([
      { field: 'conditions', action: 'add', value: 'Type 2 diabetes', new_value: null },
      {
        field: 'medications',
        action: 'add',
        value: 'Metformin 500 mg twice daily',
        new_value: null,
      },
      { field: 'allergies', action: 'add', value: 'Latex', new_value: null },
    ])

    const updated = await getPatient(request, patient.id)
    expect(updated.conditions).toEqual(['Hypertension', 'Type 2 diabetes'])
    expect(updated.medications).toEqual([
      'Lisinopril 10 mg daily',
      'Aspirin 81 mg daily',
      'Metformin 500 mg twice daily',
    ])
    expect(updated.allergies).toEqual(['Penicillin', 'Latex'])
    expect(Date.parse(updated.updated_at)).toBeGreaterThan(Date.parse(patient.updated_at))

    // The list endpoint returns the recorded changes too.
    expect((await getNotes(request, patient.id))[0]?.changes).toEqual(note.changes)
  })

  test('updates an existing entry in place, matching it case-insensitively', async ({
    request,
  }) => {
    const response = await postNote(request, patient.id, [
      {
        field: 'medications',
        action: 'update',
        value: 'lisinopril 10 MG daily',
        new_value: 'Lisinopril 20 mg daily',
      },
      {
        field: 'conditions',
        action: 'update',
        value: 'Hypertension',
        new_value: 'Hypertension (poorly controlled)',
      },
    ])

    expect(response.status()).toBe(201)
    const updated = await getPatient(request, patient.id)
    // Same position in the list as before.
    expect(updated.medications).toEqual(['Lisinopril 20 mg daily', 'Aspirin 81 mg daily'])
    expect(updated.conditions).toEqual(['Hypertension (poorly controlled)'])
    expect(updated.allergies).toEqual(['Penicillin'])
  })

  test('an update may change only the capitalisation of an entry', async ({ request }) => {
    const response = await postNote(request, patient.id, [
      { field: 'allergies', action: 'update', value: 'Penicillin', new_value: 'penicillin' },
    ])

    expect(response.status()).toBe(201)
    expect((await getPatient(request, patient.id)).allergies).toEqual(['penicillin'])
  })

  test('removes an entry', async ({ request }) => {
    const response = await postNote(request, patient.id, [
      { field: 'medications', action: 'remove', value: 'Aspirin 81 mg daily' },
    ])

    expect(response.status()).toBe(201)
    expect((await getPatient(request, patient.id)).medications).toEqual(['Lisinopril 10 mg daily'])
  })

  test('applies several changes in order', async ({ request }) => {
    const response = await postNote(request, patient.id, [
      { field: 'medications', action: 'add', value: 'Amlodipine 5 mg daily' },
      {
        field: 'medications',
        action: 'update',
        value: 'Amlodipine 5 mg daily',
        new_value: 'Amlodipine 10 mg daily',
      },
      { field: 'medications', action: 'remove', value: 'Lisinopril 10 mg daily' },
    ])

    expect(response.status()).toBe(201)
    expect((await getPatient(request, patient.id)).medications).toEqual([
      'Aspirin 81 mg daily',
      'Amlodipine 10 mg daily',
    ])
  })

  const conflicts: [string, ChartChange, string][] = [
    [
      'adding an entry that is already there',
      { field: 'allergies', action: 'add', value: 'penicillin' },
      'Allergy "penicillin" is already on the chart.',
    ],
    [
      'updating an entry that is not there',
      { field: 'medications', action: 'update', value: 'Warfarin', new_value: 'Warfarin 2 mg' },
      'Medication "Warfarin" is not on the chart.',
    ],
    [
      'updating an entry to match another',
      {
        field: 'medications',
        action: 'update',
        value: 'Lisinopril 10 mg daily',
        new_value: 'Aspirin 81 mg daily',
      },
      'Medication "Aspirin 81 mg daily" is already on the chart.',
    ],
    [
      'removing an entry that is not there',
      { field: 'conditions', action: 'remove', value: 'Gout' },
      'Condition "Gout" is not on the chart.',
    ],
  ]
  for (const [description, change, message] of conflicts) {
    test(`refuses ${description} with 409 and saves nothing`, async ({ request }) => {
      // A valid change first, to prove the request is all-or-nothing.
      const response = await postNote(request, patient.id, [
        { field: 'conditions', action: 'add', value: 'Asthma' },
        change,
      ])

      expect(response.status()).toBe(409)
      expect((await response.json()) as ErrorMessage).toEqual({ detail: message })
      expect(await getPatient(request, patient.id)).toEqual(patient)
      expect(await getNotes(request, patient.id)).toEqual([])
    })
  }

  const invalid: [string, unknown][] = [
    [
      'an update without new_value',
      [{ field: 'allergies', action: 'update', value: 'Penicillin' }],
    ],
    [
      'an update whose new_value equals value',
      [{ field: 'allergies', action: 'update', value: 'Penicillin', new_value: 'Penicillin' }],
    ],
    ['an add with new_value', [{ field: 'allergies', action: 'add', value: 'A', new_value: 'B' }]],
    ['an unknown field', [{ field: 'hobbies', action: 'add', value: 'Roping' }]],
    ['an unknown action', [{ field: 'allergies', action: 'rename', value: 'Penicillin' }]],
    ['a blank value', [{ field: 'allergies', action: 'add', value: '   ' }]],
    ['a value that is too long', [{ field: 'allergies', action: 'add', value: 'x'.repeat(101) }]],
    ['changes that are not a list', { field: 'allergies', action: 'add', value: 'Latex' }],
    [
      'more than 20 changes',
      Array.from({ length: 21 }, (_, i) => ({ field: 'allergies', action: 'add', value: `A${i}` })),
    ],
  ]
  for (const [description, changes] of invalid) {
    test(`rejects ${description} with 422`, async ({ request }) => {
      const response = await postNote(request, patient.id, changes)

      expect(response.status()).toBe(422)
      const errors = (await response.json()) as ValidationErrors
      expect(errors.detail?.[0]?.loc.slice(0, 2)).toEqual(['body', 'changes'])
      expect(await getPatient(request, patient.id)).toEqual(patient)
      expect(await getNotes(request, patient.id)).toEqual([])
    })
  }

  test('deleting a note does not undo its chart changes', async ({ request }) => {
    const note = (await (
      await postNote(request, patient.id, [{ field: 'allergies', action: 'add', value: 'Latex' }])
    ).json()) as Note

    expect((await request.delete(`/patients/${patient.id}/notes/${note.id}`)).status()).toBe(204)

    expect((await getPatient(request, patient.id)).allergies).toEqual(['Penicillin', 'Latex'])
  })
})
