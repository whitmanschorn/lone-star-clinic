import { expect, test } from '@playwright/test'

// The request logging middleware gives every response an X-Request-ID. What it
// writes to the log is covered by the unit tests in backend/tests.

const GENERATED_ID = /^[0-9a-f]{32}$/

test('every response carries a request id, errors included', async ({ request }) => {
  const responses = await Promise.all([
    request.get('/health'),
    request.get('/patients?page_size=1'),
    request.get('/patients/00000000-0000-4000-8000-000000000000'),
    request.post('/patients', { data: {} }),
  ])

  expect(responses.map((response) => response.status())).toEqual([200, 200, 404, 422])
  const ids = responses.map((response) => response.headers()['x-request-id'])
  for (const id of ids) expect(id).toMatch(GENERATED_ID)
  expect(new Set(ids).size).toBe(4)
})

test('a sensible id from the caller is kept, so logs can be correlated', async ({ request }) => {
  const response = await request.get('/health', { headers: { 'X-Request-ID': 'gateway-42.a_b' } })

  expect(response.headers()['x-request-id']).toBe('gateway-42.a_b')
})

test('an id that could corrupt the log is replaced', async ({ request }) => {
  for (const unsafe of ['two words', 'x'.repeat(65), 'semi;colon']) {
    const response = await request.get('/health', { headers: { 'X-Request-ID': unsafe } })

    expect(response.headers()['x-request-id']).toMatch(GENERATED_ID)
  }
})
