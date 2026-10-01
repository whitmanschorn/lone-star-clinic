import { expect, test } from '@playwright/test'
import { createPatient, deletePatient } from '../helpers'
import type { PatientsPage, PatientStats, ValidationErrors } from '../types'

// The test database is seeded with 124 patients. Other tests add and remove
// their own in parallel, so totals are asserted as "at least".
const SEEDED = 124

test.describe('GET /patients', () => {
  test('returns the first page of 20 by default, sorted by name', async ({ request }) => {
    const response = await request.get('/patients')

    expect(response.status()).toBe(200)
    const page = (await response.json()) as PatientsPage
    expect(page.items).toHaveLength(20)
    expect(page.total).toBeGreaterThanOrEqual(SEEDED)
    expect(page.page).toBe(1)
    expect(page.page_size).toBe(20)
    expect(page.pages).toBe(Math.ceil(page.total / 20))
    expect(page.items[0]?.last_name).toBe('Abbott')
  })

  test('each patient has the fields the list needs', async ({ request }) => {
    const page = (await (await request.get('/patients?q=slim calhoun')).json()) as PatientsPage

    expect(page.total).toBe(1)
    expect(page.items[0]).toMatchObject({
      first_name: 'Slim',
      last_name: 'Calhoun',
      date_of_birth: '1958-03-14',
      status: 'active',
      blood_type: 'O+',
      conditions: ['Hypertension', 'Type 2 diabetes'],
      allergies: ['Penicillin'],
    })
    expect(page.items[0]?.age).toBeGreaterThanOrEqual(68)
    expect(page.items[0]?.last_visit).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  test('pages do not overlap', async ({ request }) => {
    const first = (await (await request.get('/patients?page_size=5&page=1')).json()) as PatientsPage
    const second = (await (
      await request.get('/patients?page_size=5&page=2')
    ).json()) as PatientsPage

    expect(first.items).toHaveLength(5)
    expect(second.items).toHaveLength(5)
    const firstIds = new Set(first.items.map((patient) => patient.id))
    expect(second.items.filter((patient) => firstIds.has(patient.id))).toEqual([])
  })

  test('a page past the end is empty rather than an error', async ({ request }) => {
    const response = await request.get('/patients?page=9999')

    expect(response.status()).toBe(200)
    const page = (await response.json()) as PatientsPage
    expect(page.items).toEqual([])
    expect(page.total).toBeGreaterThanOrEqual(SEEDED)
  })

  for (const query of [
    'page=0',
    'page_size=0',
    'page_size=101',
    'sort=shoe_size',
    'order=sideways',
    'status=asleep',
  ]) {
    test(`rejects ${query} with 422`, async ({ request }) => {
      const response = await request.get(`/patients?${query}`)

      expect(response.status()).toBe(422)
      const body = (await response.json()) as ValidationErrors
      expect(body.detail?.[0]?.loc[0]).toBe('query')
    })
  }

  test('searches case-insensitively across first name, last name and email', async ({
    request,
  }) => {
    const byFirst = (await (await request.get('/patients?q=LEFTY')).json()) as PatientsPage
    expect(byFirst.items.map((patient) => patient.last_name)).toEqual(['McGraw'])

    const byLast = (await (await request.get('/patients?q=holloway')).json()) as PatientsPage
    expect(byLast.items.map((patient) => patient.first_name)).toEqual(['Tex'])

    const byEmail = (await (await request.get('/patients?q=dusty.ramirez@')).json()) as PatientsPage
    expect(byEmail.items.map((patient) => patient.first_name)).toEqual(['Dusty'])
  })

  test('treats LIKE wildcards in the search as plain text', async ({ request }) => {
    const percent = (await (await request.get('/patients?q=%25')).json()) as PatientsPage
    const underscore = (await (await request.get('/patients?q=_')).json()) as PatientsPage

    expect(percent.total).toBe(0)
    expect(underscore.total).toBe(0)
  })

  test('filters by status', async ({ request }) => {
    const page = (await (
      await request.get('/patients?status=critical&page_size=100')
    ).json()) as PatientsPage

    expect(page.total).toBeGreaterThan(0)
    expect(page.items.every((patient) => patient.status === 'critical')).toBe(true)
  })

  test('combines search and status filter', async ({ request }) => {
    const page = (await (
      await request.get('/patients?q=abbott&status=critical')
    ).json()) as PatientsPage

    expect(page.items.map((patient) => `${patient.first_name} ${patient.last_name}`)).toEqual([
      'Buck Abbott',
    ])
  })

  test('sorts by age in both directions', async ({ request }) => {
    const oldest = (await (
      await request.get('/patients?sort=age&order=desc&page_size=100')
    ).json()) as PatientsPage
    const youngest = (await (
      await request.get('/patients?sort=age&order=asc&page_size=100')
    ).json()) as PatientsPage

    const descending = oldest.items.map((patient) => patient.age)
    const ascending = youngest.items.map((patient) => patient.age)
    expect(descending).toEqual([...descending].sort((a, b) => b - a))
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b))
    expect(oldest.items[0]?.first_name).toBe('Clementine')
  })

  test('sorts by last visit with never-visited patients last', async ({ request }) => {
    const neverVisited = await createPatient(request, { last_visit: null })
    try {
      for (const order of ['asc', 'desc']) {
        const page = (await (
          await request.get(
            `/patients?sort=last_visit&order=${order}&q=${neverVisited.last_name.slice(0, 8)}`,
          )
        ).json()) as PatientsPage
        // Every other "Testcase" patient has a visit date, so ours must be at the end.
        expect(page.items.at(-1)?.last_visit ?? null).toBeNull()
      }

      const recent = (await (
        await request.get('/patients?sort=last_visit&order=desc&page_size=50')
      ).json()) as PatientsPage
      const dates = recent.items.map((patient) => patient.last_visit)
      expect(dates.every((value) => value !== null)).toBe(true)
      expect(dates).toEqual([...dates].sort().reverse())
    } finally {
      await deletePatient(request, neverVisited.id)
    }
  })

  test('sorts by status in order of urgency', async ({ request }) => {
    const page = (await (
      await request.get('/patients?sort=status&order=asc&page_size=100')
    ).json()) as PatientsPage

    const rank = { critical: 0, active: 1, inactive: 2 }
    const ranks = page.items.map((patient) => rank[patient.status])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(page.items[0]?.status).toBe('critical')
  })
})

test('GET /patients/stats counts patients by status', async ({ request }) => {
  const response = await request.get('/patients/stats')

  expect(response.status()).toBe(200)
  const stats = (await response.json()) as PatientStats
  expect(stats.total).toBeGreaterThanOrEqual(SEEDED)
  expect(stats.by_status.active + stats.by_status.inactive + stats.by_status.critical).toBe(
    stats.total,
  )
  expect(stats.by_status.critical).toBeGreaterThanOrEqual(9)
  expect(stats.seen_last_30_days).toBeGreaterThan(0)
  expect(stats.seen_last_30_days).toBeLessThan(stats.total)
})
