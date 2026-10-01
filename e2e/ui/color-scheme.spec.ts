import { expect, test, type Page } from '@playwright/test'

const scheme = (page: Page) => page.locator('html')

/** How bright the page background is, 0 (black) to 255 (white). */
async function backgroundBrightness(page: Page): Promise<number> {
  return page.evaluate(() => {
    const [red = 0, green = 0, blue = 0] = (
      getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? []
    ).map(Number)
    return (red + green + blue) / 3
  })
}

test.describe('with a light system setting', () => {
  test.use({ colorScheme: 'light' })

  test('starts light, switches to dark, and remembers the choice', async ({ page }) => {
    await page.goto('/')
    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
    expect(await backgroundBrightness(page)).toBeGreaterThan(200)

    await page.getByRole('button', { name: 'Switch to dark mode' }).click()

    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
    expect(await backgroundBrightness(page)).toBeLessThan(60)
    // The button now offers the way back.
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()

    // The choice outlives a reload and applies on every page.
    await page.goto('/patients')
    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
    expect(await backgroundBrightness(page)).toBeLessThan(60)

    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
    await page.reload()
    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
  })
})

test.describe('with a dark system setting', () => {
  test.use({ colorScheme: 'dark' })

  test('follows the system until the user chooses', async ({ page }) => {
    await page.goto('/')
    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
    expect(await backgroundBrightness(page)).toBeLessThan(60)

    // An explicit choice beats the system setting, including after a reload.
    await page.getByRole('button', { name: 'Switch to light mode' }).click()
    await page.reload()
    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'light')
    expect(await backgroundBrightness(page)).toBeGreaterThan(200)
  })

  test('is dark from the first paint, before the app has loaded', async ({ page }) => {
    // Hold the application bundle back and look at the bare document.
    let releaseBundle = () => {}
    const bundleHeld = new Promise<void>((resolve) => (releaseBundle = resolve))
    await page.route('**/assets/*.js', async (route) => {
      await bundleHeld
      await route.continue()
    })

    await page.goto('/', { waitUntil: 'commit' })
    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
    await expect(page.locator('#root')).toBeEmpty()

    releaseBundle()
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  })
})

test('on a phone the switch is in the navigation drawer @mobile-only', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  // The closed drawer is off-screen rather than removed.
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).not.toBeInViewport()

  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()

  await expect(scheme(page)).toHaveAttribute('data-mantine-color-scheme', 'dark')
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
})
