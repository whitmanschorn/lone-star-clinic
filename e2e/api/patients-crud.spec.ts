import { expect, test } from '@playwright/test'
import { createPatient, deletePatient, patientBody } from '../helpers'
import type { ErrorMessage, Patient, ValidationErrors } from '../types'

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

/** The field names a 422 response complains about. */
function invalidFields(body: ValidationErrors): string[] {
  return (body.detail ?? []).map((error) => String(error.loc.at(-1)))
}

test.describe('POST /patients', () => {
  test('creates a patient and returns 201 with a Location header', async ({ request }) => {
    const body = patientBody()
    const response = await request.post('/patients', { data: body })

    expect(response.status()).toBe(201)
    const patient = (await response.json()) as Patient
    try {
      expect(response.headers()['location']).toBe(`/patients/${patient.id}`)
      expect(patient).toMatchObject(body)
      expect(patient.age).toBeGreaterThanOrEqual(46)

      const fetched = await request.get(`/patients/${patient.id}`)
      expect(fetched.status()).toBe(200)
      expect(await fetched.json()).toEqual(patient)
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('fills in defaults when only the required fields are sent', async ({ request }) => {
    const response = await request.post('/patients', {
      data: { first_name: 'Rowdy', last_name: 'Testcase-minimal', date_of_birth: '2000-02-29' },
    })

    expect(response.status()).toBe(201)
    const patient = (await response.json()) as Patient
    try {
      expect(patient).toMatchObject({
        status: 'active',
        allergies: [],
        conditions: [],
        medications: [],
        email: null,
        blood_type: null,
        last_visit: null,
      })
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('trims names and tidies allergy and condition lists', async ({ request }) => {
    const patient = await createPatient(request, {
      first_name: '  Rowdy  ',
      allergies: [' Latex ', 'latex', ''],
      conditions: [],
    })
    try {
      expect(patient.first_name).toBe('Rowdy')
      expect(patient.allergies).toEqual(['Latex'])
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('reports every missing required field', async ({ request }) => {
    const response = await request.post('/patients', { data: {} })

    expect(response.status()).toBe(422)
    expect(invalidFields((await response.json()) as ValidationErrors).sort()).toEqual([
      'date_of_birth',
      'first_name',
      'last_name',
    ])
  })

  const invalidBodies: [string, Record<string, unknown>, string][] = [
    ['a blank name', { first_name: '   ' }, 'first_name'],
    ['a name that is too long', { last_name: 'x'.repeat(101) }, 'last_name'],
    ['a date of birth in the future', { date_of_birth: '2999-01-01' }, 'date_of_birth'],
    ['an impossible date of birth', { date_of_birth: '1850-01-01' }, 'date_of_birth'],
    ['a malformed date', { date_of_birth: '15/06/1980' }, 'date_of_birth'],
    ['a malformed email', { email: 'not-an-email' }, 'email'],
    ['a malformed phone number', { phone: 'call me' }, 'phone'],
    ['a lower-case state', { state: 'tx' }, 'state'],
    ['a short postal code', { postal_code: '7870' }, 'postal_code'],
    ['an unknown blood type', { blood_type: 'Z+' }, 'blood_type'],
    ['an unknown status', { status: 'asleep' }, 'status'],
    ['a last visit in the future', { last_visit: '2999-01-01' }, 'last_visit'],
    ['allergies that are not a list', { allergies: 'Penicillin' }, 'allergies'],
    ['medications that are not a list', { medications: 'Aspirin' }, 'medications'],
    ['a medication name that is too long', { medications: ['x'.repeat(101)] }, 'medications'],
  ]
  for (const [description, overrides, field] of invalidBodies) {
    test(`rejects ${description} with 422`, async ({ request }) => {
      const response = await request.post('/patients', {
        data: { ...patientBody(), ...overrides },
      })

      expect(response.status()).toBe(422)
      expect(invalidFields((await response.json()) as ValidationErrors)).toEqual([field])
    })
  }

  test('rejects a body that is not JSON with 422', async ({ request }) => {
    const response = await request.post('/patients', {
      headers: { 'content-type': 'application/json' },
      data: Buffer.from('{not json'),
    })

    expect(response.status()).toBe(422)
  })
})

test.describe('GET /patients/{id}', () => {
  test('returns 404 for an id that does not exist', async ({ request }) => {
    const response = await request.get(`/patients/${UNKNOWN_ID}`)

    expect(response.status()).toBe(404)
    expect((await response.json()) as ErrorMessage).toEqual({ detail: 'Patient not found' })
  })

  test('returns 422 for an id that is not a UUID', async ({ request }) => {
    const response = await request.get('/patients/not-a-uuid')

    expect(response.status()).toBe(422)
  })
})

test.describe('PUT /patients/{id}', () => {
  test('replaces the record and bumps updated_at', async ({ request }) => {
    const original = await createPatient(request)
    try {
      const replacement = patientBody({
        last_name: original.last_name,
        status: 'critical',
        conditions: ['Hypertension', 'Atrial fibrillation'],
        email: null,
      })
      const response = await request.put(`/patients/${original.id}`, { data: replacement })

      expect(response.status()).toBe(200)
      const updated = (await response.json()) as Patient
      expect(updated).toMatchObject({ ...replacement, id: original.id })
      expect(updated.created_at).toBe(original.created_at)
      expect(Date.parse(updated.updated_at)).toBeGreaterThan(Date.parse(original.updated_at))
    } finally {
      await deletePatient(request, original.id)
    }
  })

  test('resets fields that are left out, because PUT replaces', async ({ request }) => {
    const original = await createPatient(request)
    try {
      const response = await request.put(`/patients/${original.id}`, {
        data: {
          first_name: original.first_name,
          last_name: original.last_name,
          date_of_birth: original.date_of_birth,
        },
      })

      expect(response.status()).toBe(200)
      expect((await response.json()) as Patient).toMatchObject({
        allergies: [],
        conditions: [],
        medications: [],
        phone: null,
        blood_type: null,
      })
    } finally {
      await deletePatient(request, original.id)
    }
  })

  test('returns 422 for invalid data and leaves the record alone', async ({ request }) => {
    const original = await createPatient(request)
    try {
      const response = await request.put(`/patients/${original.id}`, {
        data: patientBody({ email: 'nope' }),
      })

      expect(response.status()).toBe(422)
      expect(await (await request.get(`/patients/${original.id}`)).json()).toEqual(original)
    } finally {
      await deletePatient(request, original.id)
    }
  })

  test('returns 404 for an id that does not exist', async ({ request }) => {
    const response = await request.put(`/patients/${UNKNOWN_ID}`, { data: patientBody() })

    expect(response.status()).toBe(404)
  })
})

test.describe('DELETE /patients/{id}', () => {
  test('deletes the patient, then reports 404', async ({ request }) => {
    const patient = await createPatient(request)

    const deleted = await request.delete(`/patients/${patient.id}`)
    expect(deleted.status()).toBe(204)
    expect(await deleted.text()).toBe('')

    expect((await request.get(`/patients/${patient.id}`)).status()).toBe(404)
    expect((await request.delete(`/patients/${patient.id}`)).status()).toBe(404)
  })
})
