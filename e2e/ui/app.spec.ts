import { expect, test } from '@playwright/test'

test('shows the clinic name, and a healthy API at the bottom left', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Lone Star Clinic')
  await expect(page.getByRole('heading', { name: 'Lone Star Clinic' })).toBeVisible()
  // "API online" is only rendered once GET /api/health has answered through the proxy.
  const status = page.getByText('API online')
  await expect(status).toBeInViewport()

  // It sits at the foot of the sidebar: left edge of the window, lower half.
  const box = (await status.boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.x).toBeLessThan(240)
  expect(box.y).toBeGreaterThan(viewport.height / 2)
  // And no longer in the header.
  await expect(page.getByRole('banner').getByText('API online')).toHaveCount(0)
})

test('on a phone the API status is at the bottom of the drawer @mobile-only', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Lone Star Clinic' })).toBeVisible()
  const status = page.getByText('API online')
  await expect(status).not.toBeInViewport()

  await page.getByRole('button', { name: 'Open navigation' }).click()

  await expect(status).toBeInViewport()
  const box = (await status.boundingBox())!
  expect(box.y).toBeGreaterThan(page.viewportSize()!.height / 2)
})

test('the status badge reports an unreachable API', async ({ page }) => {
  await page.route('**/api/health', (route) => route.abort())
  await page.goto('/')

  await expect(page.getByText('API unreachable')).toBeVisible()
})

test('unknown routes show the not-found page inside the layout', async ({ page }) => {
  await page.goto('/no-such-trail')

  await expect(page.getByRole('heading', { name: 'This trail has gone cold' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to the dashboard' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('header navigation moves between the dashboard and the patient list', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })

  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('link', { name: 'Patients' }).click()

  await expect(page).toHaveURL('/patients')
  await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Patients' })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('link', { name: 'Lone Star Clinic home' }).click()
  await expect(page).toHaveURL('/')
})

test('on a phone the navigation lives in a drawer @mobile-only', async ({ page }) => {
  await page.goto('/')
  const drawerNav = page.getByRole('navigation', { name: 'Main' })

  await expect(drawerNav).not.toBeInViewport()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(drawerNav).toBeInViewport()

  await drawerNav.getByRole('link', { name: 'Patients' }).click()
  await expect(page).toHaveURL('/patients')
  // Following a link closes the drawer again.
  await expect(drawerNav).not.toBeInViewport()
})
