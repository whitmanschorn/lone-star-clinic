import { expect, test } from '@playwright/test'
import type { components } from '../../frontend/src/api/schema'

type Health = components['schemas']['Health']

test('GET /health reports ok', async ({ request }) => {
  const response = await request.get('/health')

  expect(response.status()).toBe(200)
  const body = (await response.json()) as Health
  expect(body).toEqual({ status: 'ok' })
})

test('the OpenAPI document describes the health endpoint', async ({ request }) => {
  const response = await request.get('/openapi.json')

  expect(response.status()).toBe(200)
  const document = (await response.json()) as { paths: Record<string, unknown> }
  expect(Object.keys(document.paths)).toContain('/health')
})
