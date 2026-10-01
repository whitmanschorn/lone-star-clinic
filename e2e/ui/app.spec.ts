import { expect, test } from '@playwright/test'

test('the header shows the clinic name and a healthy API @mobile', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Lone Star Clinic')
  await expect(page.getByRole('heading', { name: 'Lone Star Clinic' })).toBeVisible()
  // "API online" is only rendered once GET /api/health has answered through the proxy.
  await expect(page.getByText('API online')).toBeVisible()
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

test('on a phone the navigation lives in a drawer @mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'The burger menu only exists on narrow screens')
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
