// Unified client-side fetch helper. Throws ApiError on non-2xx (or network
// failure) and, unless { silent: true }, emits a global 'api-error' event so the
// dashboard's ApiErrorToaster can surface the failure instead of the UI silently
// showing an empty / "no data" state. Owners need to know when something broke.

export const API_ERROR_EVENT = 'api-error'

export class ApiError extends Error {
  status: number
  body: string
  url: string
  constructor(status: number, body: string, url: string) {
    super(`Request to ${url} failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.url = url
  }
}

function friendlyMessage(status: number): string {
  if (status === 0) return 'Network error — please check your connection and try again.'
  if (status === 401) return 'Your session has expired — please sign in again.'
  if (status === 403) return "You don't have access to that."
  if (status === 404) return "We couldn't find what you were looking for."
  if (status === 429) return 'Too many requests — please wait a moment and retry.'
  if (status >= 500) return 'Something went wrong on our end — please retry, or contact support if it persists.'
  return 'Something went wrong — please try again.'
}

function emit(message: string) {
  if (typeof window === 'undefined') return
  try { window.dispatchEvent(new CustomEvent(API_ERROR_EVENT, { detail: { message } })) } catch { /* non-fatal */ }
}

interface ApiFetchOptions extends RequestInit {
  /** Suppress the global error toast (e.g. when the caller renders its own inline error). */
  silent?: boolean
}

export async function apiFetch<T = unknown>(url: string, opts?: ApiFetchOptions): Promise<T> {
  const { silent, ...init } = opts ?? {}
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (e) {
    if (!silent) emit(friendlyMessage(0))
    throw new ApiError(0, e instanceof Error ? e.message : String(e), url)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (!silent) emit(friendlyMessage(res.status))
    throw new ApiError(res.status, body, url)
  }
  return res.json() as Promise<T>
}
