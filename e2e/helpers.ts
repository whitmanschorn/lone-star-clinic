import { randomUUID } from 'node:crypto'
import type { APIRequestContext, Page } from '@playwright/test'
import type { Patient, PatientCreate } from './types'

/** Where the FastAPI server lives. UI tests use this to set up their own data. */
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:8001'

/**
 * A valid request body with a unique last name, so tests running in parallel
 * can find their own patient. The "Testcase" prefix sorts between the seeded
 * names, which keeps "first row" assertions about seed data stable.
 */
export function patientBody(overrides: Partial<PatientCreate> = {}): PatientCreate {
  return {
    first_name: 'Rowdy',
    last_name: `Testcase-${randomUUID().slice(0, 8)}`,
    date_of_birth: '1980-06-15',
    email: 'rowdy@example.com',
    phone: '512-555-0199',
    address_line: '1 Test Trail',
    city: 'Austin',
    state: 'TX',
    postal_code: '78701',
    blood_type: 'O+',
    status: 'active',
    allergies: ['Penicillin'],
    conditions: ['Hypertension'],
    medications: ['Lisinopril 10 mg daily'],
    last_visit: '2026-01-15',
    ...overrides,
  }
}

export async function createPatient(
  request: APIRequestContext,
  overrides: Partial<PatientCreate> = {},
): Promise<Patient> {
  const response = await request.post(`${API_URL}/patients`, { data: patientBody(overrides) })
  if (response.status() !== 201) {
    throw new Error(`Could not create patient: ${response.status()} ${await response.text()}`)
  }
  return (await response.json()) as Patient
}

export async function deletePatient(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(`${API_URL}/patients/${id}`)
}

/**
 * Lets a test pause requests to `url` and let them go again, to look at the
 * page while a response is outstanding. Every paused request waits on the same
 * gate, so releasing it frees all of them, however many there are and whenever
 * they arrived.
 */
export async function holdRequests(page: Page, url: string | RegExp) {
  let gate: Promise<void> | null = null
  let open = () => {}
  await page.route(url, async (route) => {
    if (gate) await gate
    await route.continue()
  })
  return {
    hold() {
      gate = new Promise<void>((resolve) => {
        open = resolve
      })
    },
    release() {
      open()
      gate = null
    },
  }
}
