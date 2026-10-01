import { expect, test } from '@playwright/test'

test('home page shows the clinic name and a healthy API @mobile', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Lone Star Clinic')
  await expect(page.getByRole('heading', { name: 'Lone Star Clinic' })).toBeVisible()
  // "API online" is only rendered once GET /api/health has answered through the proxy.
  await expect(page.getByText('API online')).toBeVisible()
})

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/no-such-trail')

  await expect(page.getByRole('heading', { name: 'This trail has gone cold' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the dashboard' }).click()
  await expect(page).toHaveURL('/')
})

test('the status badge reports an unreachable API', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort())
  await page.goto('/')

  await expect(page.getByText('API unreachable')).toBeVisible()
})
