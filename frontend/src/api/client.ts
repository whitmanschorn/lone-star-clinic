import createClient from 'openapi-fetch'
import type { paths } from './schema'

/**
 * Typed client for the FastAPI backend. Paths, params and bodies are checked
 * against schema.d.ts, which is generated from the backend's OpenAPI document.
 */
export const api = createClient<paths>({ baseUrl: '/api' })

/** A failed API call. `status` is 0 when the server could not be reached. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown, message?: string) {
    super(message ?? (status === 0 ? 'Could not reach the server' : `Request failed (${status})`))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  get isNetworkError(): boolean {
    return this.status === 0
  }
}

interface ApiResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/**
 * Turn an openapi-fetch result into data-or-throw, which is the shape SWR
 * expects from a fetcher. Network failures and HTTP errors both become ApiError.
 */
export async function unwrap<T>(request: Promise<ApiResult<T>>): Promise<T> {
  let result: ApiResult<T>
  try {
    result = await request
  } catch (cause) {
    throw new ApiError(0, cause)
  }
  if (!result.response.ok) {
    throw new ApiError(result.response.status, result.error)
  }
  return result.data as T
}
