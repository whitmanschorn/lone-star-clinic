import useSWR from 'swr'
import { api, unwrap, type ApiError } from './client'
import type { Health } from './types'

export function useHealth() {
  return useSWR<Health, ApiError>('health', () => unwrap(api.GET('/health')), {
    refreshInterval: 30_000,
  })
}
