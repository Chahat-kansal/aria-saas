import * as Sentry from '@sentry/nextjs'

type AICallContext = {
  route: string
  model: string
  businessId?: string
  industry?: string
  purpose: string
  inputTokensEstimate?: number
}

export async function trackAICall<T>(
  ctx: AICallContext,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const durationMs = Date.now() - start

    console.log(JSON.stringify({
      type: 'aria_ai_call',
      status: 'success',
      route: ctx.route,
      model: ctx.model,
      purpose: ctx.purpose,
      durationMs,
      businessId: ctx.businessId,
      industry: ctx.industry,
      inputTokensEstimate: ctx.inputTokensEstimate,
      ts: new Date().toISOString(),
    }))

    return result
  } catch (err: any) {
    const durationMs = Date.now() - start

    Sentry.captureException(err, {
      tags: {
        type: 'aria_ai_failure',
        route: ctx.route,
        model: ctx.model,
        purpose: ctx.purpose,
        industry: ctx.industry ?? 'unknown',
      },
      extra: {
        businessId: ctx.businessId,
        durationMs,
        errorMessage: err?.message,
      },
    })

    throw err
  }
}
