import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { createPatient, deletePatient } from '../helpers'
import type { Patient, PatientsPage, ValidationErrors } from '../types'

async function list(request: APIRequestContext, query: string): Promise<PatientsPage> {
  const response = await request.get(`/patients?${query}`)
  expect(response.status(), await response.text()).toBe(200)
  return (await response.json()) as PatientsPage
}

const names = (page: PatientsPage) =>
  page.items.map((patient) => `${patient.first_name} ${patient.last_name}`)

/** A date `years` years before today, shifted by `days`, as YYYY-MM-DD in local time. */
function birthDate(years: number, days = 0): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  date.setDate(date.getDate() + days)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

test.describe('GET /patients filters on seeded data', () => {
  test('condition, medication and allergy match part of any entry, ignoring case', async ({
    request,
  }) => {
    expect(names(await list(request, 'condition=KIDNEY'))).toEqual(['Clementine Hayes'])
    expect(names(await list(request, 'medication=apixaban'))).toEqual(['Tex Holloway'])
    expect(names(await list(request, 'allergy=venom'))).toEqual(['Doc Sutherland'])
  })

  test('city matches part of the city name', async ({ request }) => {
    expect(names(await list(request, 'city=marf'))).toEqual(['Dusty Ramirez'])
  })

  test('blood_type accepts several values and returns any of them', async ({ request }) => {
    const page = await list(request, 'blood_type=AB-&blood_type=O-&page_size=100')

    expect(page.total).toBeGreaterThan(0)
    const found = new Set(page.items.map((patient) => patient.blood_type))
    expect([...found].sort()).toEqual(['AB-', 'O-'])

    const onlyOne = await list(request, 'blood_type=AB-&page_size=100')
    expect(onlyOne.total).toBeLessThan(page.total)
    expect(onlyOne.items.every((patient) => patient.blood_type === 'AB-')).toBe(true)
  })

  test('min_age and max_age bound the age', async ({ request }) => {
    const seniors = await list(request, 'min_age=85&page_size=100')
    expect(seniors.items.every((patient) => patient.age >= 85)).toBe(true)
    expect(names(seniors)).toContain('Clementine Hayes')

    const minors = await list(request, 'max_age=17&page_size=100')
    expect(minors.items.every((patient) => patient.age <= 17)).toBe(true)
    expect(names(minors)).toEqual(expect.arrayContaining(['Daisy Longmire', 'Bo Tanner']))

    const band = await list(request, 'min_age=60&max_age=69&page_size=100')
    expect(band.total).toBeGreaterThan(0)
    expect(band.items.every((patient) => patient.age >= 60 && patient.age <= 69)).toBe(true)
  })

  test('filters combine with each other, the search, the status and the sort', async ({
    request,
  }) => {
    const page = await list(
      request,
      'status=critical&min_age=70&condition=a&sort=age&order=desc&page_size=100',
    )

    expect(names(page).slice(0, 2)).toEqual(['Clementine Hayes', 'Tex Holloway'])
    for (const patient of page.items) {
      expect(patient.status).toBe('critical')
      expect(patient.age).toBeGreaterThanOrEqual(70)
      expect(patient.conditions.join(' ').toLowerCase()).toContain('a')
    }

    expect(names(await list(request, 'q=hayes&allergy=contrast&blood_type=A%2B'))).toEqual([
      'Clementine Hayes',
    ])
    expect((await list(request, 'q=hayes&allergy=contrast&blood_type=O-')).total).toBe(0)
  })

  test('LIKE wildcards in a filter are plain text, and blank filters are ignored', async ({
    request,
  }) => {
    expect((await list(request, 'condition=%25')).total).toBe(0)
    expect((await list(request, 'city=_')).total).toBe(0)

    const everyone = await list(request, 'page_size=1')
    const blank = await list(request, 'condition=%20&city=&page_size=1')
    // Other tests add and remove patients meanwhile, so allow a little drift.
    expect(Math.abs(blank.total - everyone.total)).toBeLessThan(15)
  })

  test('total and pages describe the filtered set, not the whole table', async ({ request }) => {
    const page = await list(request, 'status=critical&min_age=80&page_size=1')

    expect(page.items).toHaveLength(1)
    expect(page.total).toBeGreaterThanOrEqual(2)
    expect(page.pages).toBe(page.total)
    expect(page.total).toBeLessThan(20)
  })
})

test.describe('GET /patients filter boundaries', () => {
  const marker = `Testcase-${randomUUID().slice(0, 8)}`
  let created: Patient[] = []

  test.beforeAll(async ({ request }) => {
    created = await Promise.all([
      // Turns 40 today, turns 40 tomorrow (so still 39), and turned 41 today.
      createPatient(request, { last_name: `${marker}-40-today`, date_of_birth: birthDate(40) }),
      createPatient(request, { last_name: `${marker}-39`, date_of_birth: birthDate(40, 1) }),
      createPatient(request, { last_name: `${marker}-41`, date_of_birth: birthDate(41) }),
    ])
    // Visits on three different days; one patient has never visited.
    const visits: (string | null)[] = ['2026-03-10', '2026-03-20', null]
    await Promise.all(
      created.map((patient, index) => {
        const { id, created_at, updated_at, age, last_note, ...body } = patient
        void [id, created_at, updated_at, age, last_note]
        return request.put(`/patients/${patient.id}`, {
          data: { ...body, last_visit: visits[index] },
        })
      }),
    )
  })

  test.afterAll(async ({ request }) => {
    await Promise.all(created.map((patient) => deletePatient(request, patient.id)))
  })

  const lastNames = async (request: APIRequestContext, query: string) =>
    (await list(request, `q=${marker}&${query}`)).items
      .map((patient) => patient.last_name.replace(`${marker}-`, ''))
      .sort()

  test('a birthday today counts as the new age', async ({ request }) => {
    expect(await lastNames(request, 'min_age=40')).toEqual(['40-today', '41'])
    expect(await lastNames(request, 'max_age=39')).toEqual(['39'])
    expect(await lastNames(request, 'min_age=40&max_age=40')).toEqual(['40-today'])
    expect(await lastNames(request, 'min_age=41')).toEqual(['41'])
    expect(await lastNames(request, 'max_age=40')).toEqual(['39', '40-today'])
  })

  test('the last-visit range includes both end dates and skips never-visited patients', async ({
    request,
  }) => {
    expect(await lastNames(request, 'last_visit_from=2026-03-10')).toEqual(['39', '40-today'])
    expect(await lastNames(request, 'last_visit_from=2026-03-11')).toEqual(['39'])
    expect(await lastNames(request, 'last_visit_to=2026-03-10')).toEqual(['40-today'])
    expect(await lastNames(request, 'last_visit_from=2026-03-10&last_visit_to=2026-03-20')).toEqual(
      ['39', '40-today'],
    )
    expect(await lastNames(request, 'last_visit_from=2026-03-21')).toEqual([])
  })
})

test.describe('GET /patients filter validation', () => {
  const invalid: [string, string][] = [
    ['min_age above max_age', 'min_age=50&max_age=40'],
    ['a negative age', 'min_age=-1'],
    ['an age over 130', 'max_age=131'],
    ['an age that is not a number', 'min_age=old'],
    ['an unknown blood type', 'blood_type=Z%2B'],
    ['a date that is not a date', 'last_visit_from=yesterday'],
    ['last_visit_from after last_visit_to', 'last_visit_from=2026-02-01&last_visit_to=2026-01-01'],
    ['a filter value over 100 characters', `condition=${'x'.repeat(101)}`],
  ]
  for (const [description, query] of invalid) {
    test(`rejects ${description} with 422`, async ({ request }) => {
      const response = await request.get(`/patients?${query}`)

      expect(response.status()).toBe(422)
      const body = (await response.json()) as ValidationErrors
      expect(body.detail?.[0]?.loc[0]).toBe('query')
    })
  }
})
