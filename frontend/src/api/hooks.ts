import useSWR from 'swr'
import { api, unwrap, type ApiError } from './client'
import type { Health, Patient, PatientListParams, PatientsPage, PatientStats } from './types'

// Every key for patient data starts with 'patients', so one prefix match can
// revalidate all of it after a change.

export function useHealth() {
  return useSWR<Health, ApiError>('health', () => unwrap(api.GET('/health')), {
    refreshInterval: 30_000,
  })
}

export function usePatients(params: PatientListParams) {
  return useSWR<PatientsPage, ApiError>(
    ['patients', 'list', params],
    () => unwrap(api.GET('/patients', { params: { query: params } })),
    // Keep showing the current rows while the next search or page loads, so
    // typing in the search box never blanks the list.
    { keepPreviousData: true },
  )
}

export function usePatientStats() {
  return useSWR<PatientStats, ApiError>(['patients', 'stats'], () =>
    unwrap(api.GET('/patients/stats')),
  )
}

export function usePatient(patientId: string | undefined) {
  return useSWR<Patient, ApiError>(
    patientId ? ['patients', 'detail', patientId] : null,
    () =>
      unwrap(api.GET('/patients/{patient_id}', { params: { path: { patient_id: patientId! } } })),
    // A missing patient will not appear by asking again.
    { shouldRetryOnError: (error: ApiError) => error.status !== 404 && error.status !== 422 },
  )
}
