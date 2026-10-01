import { expect, test } from '@playwright/test'
import { createPatient, deletePatient } from '../helpers'
import type { PatientsPage, PatientSummary } from '../types'

test.describe('GET /patients/{id}/summary', () => {
  test('summarises a seeded patient from profile and notes', async ({ request }) => {
    const page = (await (await request.get('/patients?q=slim calhoun')).json()) as PatientsPage
    const slim = page.items[0]!

    const response = await request.get(`/patients/${slim.id}/summary`)

    expect(response.status()).toBe(200)
    const summary = (await response.json()) as PatientSummary
    expect(summary).toMatchObject({
      patient_id: slim.id,
      name: 'Slim Calhoun',
      age: slim.age,
      blood_type: 'O+',
      status: 'active',
      conditions: ['Hypertension', 'Type 2 diabetes'],
      medications: ['Lisinopril 10 mg daily', 'Metformin 500 mg twice daily'],
      allergies: ['Penicillin'],
      note_count: 3,
      generator: 'template',
    })

    // The plain-text summary carries the identifiers and clinical information...
    expect(summary.summary).toContain(`Slim Calhoun is a ${slim.age}-year-old patient`)
    expect(summary.summary).toContain('born March 14, 1958')
    expect(summary.summary).toContain('blood type O+')
    expect(summary.summary).toContain('Known conditions: Hypertension and Type 2 diabetes.')
    expect(summary.summary).toContain(
      'Current medications: Lisinopril 10 mg daily and Metformin 500 mg twice daily.',
    )
    expect(summary.summary).toContain('Allergies: Penicillin.')
    // ...and ends with the narrative.
    expect(summary.summary.endsWith(summary.narrative)).toBe(true)
  })

  test('tells the notes as a story in date order', async ({ request }) => {
    const patient = await createPatient(request, { first_name: 'Rowdy' })
    try {
      // Added out of order on purpose.
      const notes = [
        ['2026-03-10T16:00:00Z', 'Cast removed; grip strength returning'],
        ['2026-01-05T16:00:00Z', 'Fell from a horse. Left wrist fracture, cast applied.'],
        ['2026-02-02T16:00:00Z', 'X-ray shows good alignment.'],
      ]
      for (const [timestamp, content] of notes) {
        await request.post(`/patients/${patient.id}/notes`, { data: { timestamp, content } })
      }

      const summary = (await (
        await request.get(`/patients/${patient.id}/summary`)
      ).json()) as PatientSummary

      expect(summary.note_count).toBe(3)
      expect(summary.narrative).toBe(
        'There are 3 clinical notes on file, from January 5, 2026 to March 10, 2026. ' +
          'The record opens on January 5, 2026: Fell from a horse. Left wrist fracture, cast applied. ' +
          'On February 2, 2026: X-ray shows good alignment. ' +
          'Most recently, on March 10, 2026: Cast removed; grip strength returning.',
      )
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('keeps a long history readable by quoting only some notes', async ({ request }) => {
    const patient = await createPatient(request)
    try {
      for (let month = 1; month <= 8; month++) {
        await request.post(`/patients/${patient.id}/notes`, {
          data: { timestamp: `2026-0${month}-15T16:00:00Z`, content: `Visit number ${month}.` },
        })
      }

      const summary = (await (
        await request.get(`/patients/${patient.id}/summary`)
      ).json()) as PatientSummary

      expect(summary.note_count).toBe(8)
      expect(summary.narrative).toContain('There are 8 clinical notes on file')
      expect(summary.narrative).toContain('The record opens on January 15, 2026: Visit number 1.')
      expect(summary.narrative).toContain('(3 further notes are not quoted here.)')
      expect(summary.narrative).not.toContain('Visit number 3.')
      expect(summary.narrative).toContain('On July 15, 2026: Visit number 7.')
      expect(summary.narrative).toContain('Most recently, on August 15, 2026: Visit number 8.')
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('shortens a very long note', async ({ request }) => {
    const patient = await createPatient(request)
    try {
      await request.post(`/patients/${patient.id}/notes`, {
        data: { content: 'Long consult. ' + 'word '.repeat(400) },
      })

      const summary = (await (
        await request.get(`/patients/${patient.id}/summary`)
      ).json()) as PatientSummary

      expect(summary.narrative.length).toBeLessThan(400)
      expect(summary.narrative.endsWith('…')).toBe(true)
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('handles a patient with no notes, conditions, allergies or blood type', async ({
    request,
  }) => {
    const patient = await createPatient(request, {
      first_name: 'Rowdy',
      blood_type: null,
      conditions: [],
      medications: [],
      allergies: [],
      last_visit: null,
    })
    try {
      const summary = (await (
        await request.get(`/patients/${patient.id}/summary`)
      ).json()) as PatientSummary

      expect(summary).toMatchObject({ note_count: 0, blood_type: null, conditions: [] })
      expect(summary.narrative).toBe('No clinical notes have been recorded for Rowdy yet.')
      expect(summary.summary).toContain('blood type unknown')
      expect(summary.summary).toContain('No conditions are on record.')
      expect(summary.summary).toContain('No medications are on record.')
      expect(summary.summary).toContain('No known allergies.')
      expect(summary.summary).toContain('No visits are on record.')
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('mentions the chart changes made with each note', async ({ request }) => {
    const patient = await createPatient(request, { medications: ['Lisinopril 10 mg daily'] })
    try {
      await request.post(`/patients/${patient.id}/notes`, {
        data: {
          timestamp: '2026-04-01T16:00:00Z',
          content: 'Blood pressure still high',
          changes: [
            {
              field: 'medications',
              action: 'update',
              value: 'Lisinopril 10 mg daily',
              new_value: 'Lisinopril 20 mg daily',
            },
            { field: 'allergies', action: 'add', value: 'Latex' },
          ],
        },
      })

      const summary = (await (
        await request.get(`/patients/${patient.id}/summary`)
      ).json()) as PatientSummary

      expect(summary.medications).toEqual(['Lisinopril 20 mg daily'])
      expect(summary.summary).toContain('Current medications: Lisinopril 20 mg daily.')
      expect(summary.narrative).toBe(
        'There is one clinical note on file, from April 1, 2026: Blood pressure still high. ' +
          'Chart updated: changed medication Lisinopril 10 mg daily to Lisinopril 20 mg daily ' +
          'and added allergy Latex.',
      )
    } finally {
      await deletePatient(request, patient.id)
    }
  })

  test('says who wrote the narrative and what else could', async ({ request }) => {
    const page = (await (await request.get('/patients?q=slim calhoun')).json()) as PatientsPage

    const summary = (await (
      await request.get(`/patients/${page.items[0]!.id}/summary`)
    ).json()) as PatientSummary

    // The test server has LLM summaries turned off, so the template wrote it.
    expect(summary.generator).toBe('template')
    expect(summary.model).toBeNull()
    expect(summary.fallback_reason).toBeNull()
    expect(summary.available_generators).toEqual(['template'])
  })

  test('asking for an unavailable LLM falls back to the template and says why', async ({
    request,
  }) => {
    const page = (await (await request.get('/patients?q=slim calhoun')).json()) as PatientsPage
    const plain = (await (
      await request.get(`/patients/${page.items[0]!.id}/summary`)
    ).json()) as PatientSummary

    for (const generator of ['deepseek', 'openai', 'anthropic']) {
      const response = await request.get(
        `/patients/${page.items[0]!.id}/summary?generator=${generator}&refresh=true`,
      )

      expect(response.status()).toBe(200)
      const summary = (await response.json()) as PatientSummary
      expect(summary.generator).toBe('template')
      // The test server turns LLMs off outright; a stack that merely has no
      // API key gives the other reason. Either way the template is used.
      expect(summary.fallback_reason).toMatch(
        /^(AI summaries are turned off on this server|no API key is configured for \w+)$/,
      )
      // Still a complete, usable summary.
      expect(summary.narrative).toBe(plain.narrative)
    }
  })

  test('rejects an unknown generator with 422', async ({ request }) => {
    const page = (await (await request.get('/patients?q=slim calhoun')).json()) as PatientsPage

    const response = await request.get(`/patients/${page.items[0]!.id}/summary?generator=robot`)

    expect(response.status()).toBe(422)
  })

  test('returns 404 for a patient that does not exist', async ({ request }) => {
    const response = await request.get('/patients/00000000-0000-4000-8000-000000000000/summary')

    expect(response.status()).toBe(404)
  })
})
