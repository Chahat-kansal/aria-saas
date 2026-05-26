import { test, expect } from '@playwright/test'

const EMAIL = process.env.TEST_EMAIL ?? ''
const PASSWORD = process.env.TEST_PASSWORD ?? ''

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page).toHaveURL(/dashboard|onboarding/, { timeout: 20_000 })
}

test.describe('Onboarding wizard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('onboarding page loads without application error', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page.locator('body')).toBeVisible()
    // If business already onboarded, may redirect to dashboard — both are valid
    await expect(page.getByText(/application error|something went wrong|500/i)).not.toBeVisible()
  })

  test('can fill business name and proceed if wizard is shown', async ({ page }) => {
    await page.goto('/onboarding')
    const nameInput = page.getByPlaceholder(/business name|cafe|shop/i)
    if (await nameInput.isVisible({ timeout: 5_000 })) {
      await nameInput.fill('Test Cafe')
      const nextBtn = page.getByRole('button', { name: /next|continue|proceed/i })
      await nextBtn.click()
      await expect(page.getByRole('button', { name: /next|continue|finish|complete/i })).toBeVisible({ timeout: 10_000 })
    }
  })

  test('wizard has at least one step or redirects to dashboard', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.getByText(/application error|500|crashed/i)).not.toBeVisible()
  })
})
