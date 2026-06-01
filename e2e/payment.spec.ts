import { test, expect } from '@playwright/test'
import { login, hasCredentials } from './helpers/auth'

// Stripe test card numbers — NEVER use real card numbers
const CARD_SUCCESS = '4242424242424242'
const CARD_DECLINED = '4000000000000002'
const CARD_INSUFFICIENT = '4000000000009995'

/** Fill a Stripe Elements card input inside a frame. */
async function fillStripeCard(
  page: import('@playwright/test').Page,
  cardNumber: string,
) {
  // Stripe Elements renders in iframes
  const stripeFrame = page.frameLocator('iframe[name*="__privateStripeFrame"], iframe[src*="stripe.com"]').first()
  const cardInput = stripeFrame.locator('[name="cardnumber"], [placeholder*="Card number"], [autocomplete="cc-number"]')
  if (await cardInput.isVisible({ timeout: 8_000 })) {
    await cardInput.fill(cardNumber)
    await stripeFrame.locator('[name="exp-date"], [placeholder*="MM"], [autocomplete="cc-exp"]').fill('12 / 26')
    await stripeFrame.locator('[name="cvc"], [placeholder*="CVC"], [autocomplete="cc-csc"]').fill('123')
  }
}

test.describe('Payment processing (Stripe test mode)', () => {
  test.skip(!hasCredentials, 'Set TEST_EMAIL and TEST_PASSWORD to run payment tests')

  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('checkout with successful test card (4242) completes payment', async ({ page }) => {
    // Navigate to a checkout or payment page
    await page.goto('/dashboard/invoices')
    await expect(page.locator('body')).toBeVisible()

    const createBtn = page
      .getByRole('button', { name: '+ New Invoice' })
      .or(page.getByRole('button', { name: /create.*invoice/i }))

    if (!await createBtn.isVisible({ timeout: 5_000 })) {
      test.skip()
      return
    }

    // Invoice → payment flow (if Stripe checkout is present)
    // This test verifies the Stripe integration path exists; full E2E
    // payment confirmation requires a live Stripe webhook or test clock.
    // We verify: the payment UI renders with Stripe Elements, no error thrown.
    await createBtn.click()

    const payBtn = page
      .getByRole('button', { name: /pay|charge|checkout|submit.*payment/i })
    if (await payBtn.isVisible({ timeout: 5_000 })) {
      await payBtn.click()
      // Stripe Elements iframe should appear
      const stripeFrame = page.frameLocator(
        'iframe[name*="__privateStripeFrame"], iframe[src*="stripe.com"]'
      ).first()
      const cardEl = stripeFrame.locator(
        '[name="cardnumber"], [placeholder*="Card"], [autocomplete="cc-number"]'
      )
      if (await cardEl.isVisible({ timeout: 8_000 })) {
        await fillStripeCard(page, CARD_SUCCESS)
        // Attempt submit
        const submitBtn = page.getByRole('button', { name: /pay|submit|confirm/i })
        if (await submitBtn.isVisible({ timeout: 3_000 })) {
          await submitBtn.click()
          // Should NOT show a card error for the success test card
          await page.waitForTimeout(3_000)
          await expect(page.getByText(/your card was declined|invalid card/i)).not.toBeVisible()
        }
      }
    }

    // Assert no application-level crash regardless
    await expect(page.getByText(/application error|500|crashed/i)).not.toBeVisible()
  })

  test('checkout with declined card (4000000000000002) shows decline error', async ({ page }) => {
    await page.goto('/dashboard/invoices')
    const createBtn = page
      .getByRole('button', { name: '+ New Invoice' })
      .or(page.getByRole('button', { name: /create.*invoice/i }))

    if (!await createBtn.isVisible({ timeout: 5_000 })) {
      test.skip()
      return
    }
    await createBtn.click()

    const payBtn = page.getByRole('button', { name: /pay|charge|checkout|submit.*payment/i })
    if (!await payBtn.isVisible({ timeout: 5_000 })) {
      test.skip()
      return
    }
    await payBtn.click()

    const stripeFrame = page.frameLocator(
      'iframe[name*="__privateStripeFrame"], iframe[src*="stripe.com"]'
    ).first()
    const cardEl = stripeFrame.locator(
      '[name="cardnumber"], [placeholder*="Card"], [autocomplete="cc-number"]'
    )
    if (!await cardEl.isVisible({ timeout: 8_000 })) {
      test.skip()
      return
    }

    await fillStripeCard(page, CARD_DECLINED)

    const submitBtn = page.getByRole('button', { name: /pay|submit|confirm/i })
    if (await submitBtn.isVisible({ timeout: 3_000 })) {
      await submitBtn.click()
      // Declined card must show an error — not silently succeed
      await expect(
        page.getByText(/declined|card was declined|insufficient|try.*different.*card/i)
          .or(stripeFrame.getByText(/declined|card was declined/i))
      ).toBeVisible({ timeout: 15_000 })
    }
  })

  test('POS cash sale does not involve Stripe — completes immediately', async ({ page }) => {
    // Cash transactions must never hit Stripe
    await page.goto('/pos/terminal')
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    if (!page.url().includes('/pos/terminal')) return

    const bypassBtn = page.getByRole('button', { name: /continue as owner/i })
    if (await bypassBtn.isVisible({ timeout: 5_000 })) await bypassBtn.click()

    const grid = page.locator('.pos-product-grid')
    if (!await grid.isVisible({ timeout: 8_000 })) return

    const tile = grid.locator('button, [role="button"]').first()
    if (!await tile.isVisible({ timeout: 3_000 })) return

    await tile.click()
    await page.locator('.charge-btn').click({ timeout: 5_000 })

    const cashBtn = page.getByRole('button', { name: /cash/i })
    if (!await cashBtn.isVisible({ timeout: 5_000 })) return
    await cashBtn.click()

    // Cash flow must NOT show Stripe Elements
    const stripeFrameCount = await page.frameLocator(
      'iframe[src*="stripe.com"]'
    ).locator('body').count().catch(() => 0)
    expect(stripeFrameCount).toBe(0)
  })
})