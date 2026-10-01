import { ApiError } from '../api/client'

/** A sentence a person can act on, for any error thrown by the API layer. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return 'Could not reach the server. Check your connection and try again.'
    }
    if (error.status >= 500) {
      return 'The server ran into a problem. Please try again in a moment.'
    }
    const detail = (error.detail as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
  }
  return 'Something went wrong. Please try again.'
}

/** True when the API says the thing being asked for does not exist. */
export function isNotFound(error: unknown): boolean {
  // 422 covers ids that are not UUIDs, which cannot belong to any record.
  return error instanceof ApiError && (error.status === 404 || error.status === 422)
}
