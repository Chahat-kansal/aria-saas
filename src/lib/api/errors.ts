import { NextResponse } from 'next/server'

export type ApiError = { error: string; code?: string; details?: unknown }

export const apiError = (message: string, status: number, code?: string, details?: unknown) =>
  NextResponse.json({ error: message, code, details } satisfies ApiError, { status })

export const errors = {
  unauthorized: () => apiError('Unauthorized', 401, 'UNAUTHORIZED'),
  forbidden: () => apiError('Forbidden', 403, 'FORBIDDEN'),
  notFound: (what = 'Resource') => apiError(`${what} not found`, 404, 'NOT_FOUND'),
  badRequest: (msg = 'Bad request', details?: unknown) => apiError(msg, 400, 'BAD_REQUEST', details),
  rateLimit: () => apiError('Rate limit exceeded', 429, 'RATE_LIMIT'),
  server: (msg = 'Internal error') => apiError(msg, 500, 'INTERNAL'),
}
