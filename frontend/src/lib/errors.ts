import { ApiError } from '../api/client'
import type { ValidationIssue } from '../api/types'

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

/**
 * Field-by-field messages from a 422 response, keyed by field name, ready for
 * `form.setErrors`. Returns null if the error is not a validation failure.
 */
export function fieldErrors(error: unknown): Record<string, string> | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null
  const issues = (error.detail as { detail?: unknown } | undefined)?.detail
  if (!Array.isArray(issues)) return null

  const errors: Record<string, string> = {}
  for (const issue of issues as ValidationIssue[]) {
    // loc is e.g. ["body", "email"] or ["body", "changes", 0, "value"]. Joined
    // with dots it is the same path @mantine/form uses: "changes.0.value".
    const path = (issue.loc[0] === 'body' ? issue.loc.slice(1) : issue.loc).join('.')
    if (path && !(path in errors)) {
      errors[path] = tidyMessage(issue.msg)
    }
  }
  return errors
}

/** Pydantic prefixes custom messages with "Value error, "; people do not need that. */
function tidyMessage(message: string): string {
  const text = message.replace(/^Value error, /, '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
