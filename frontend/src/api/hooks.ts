import useSWR, { type ScopedMutator } from 'swr'
import { api, unwrap, type ApiError } from './client'
import type {
  Health,
  Note,
  Patient,
  PatientListParams,
  PatientsPage,
  PatientStats,
  PatientSummary,
} from './types'

// Every key for patient data starts with 'patients', and everything about one
// patient starts with ['patients', 'detail', id], so a prefix match can
// revalidate exactly what a change affects.
const patientKey = (patientId: string, ...rest: string[]) => [
  'patients',
  'detail',
  patientId,
  ...rest,
]

/** Refetch everything cached about one patient: record, notes and summary. */
export function revalidatePatient(mutate: ScopedMutator, patientId: string) {
  return mutate(
    (key) =>
      Array.isArray(key) && key[0] === 'patients' && key[1] === 'detail' && key[2] === patientId,
  )
}

/** Refetch all patient data: lists, counts and every open record. */
export function revalidateAllPatients(mutate: ScopedMutator) {
  return mutate((key) => Array.isArray(key) && key[0] === 'patients')
}

/** A missing record will not appear by asking again, so do not retry those. */
const noRetryWhenMissing = {
  shouldRetryOnError: (error: ApiError) => error.status !== 404 && error.status !== 422,
}

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
    patientId ? patientKey(patientId) : null,
    () =>
      unwrap(api.GET('/patients/{patient_id}', { params: { path: { patient_id: patientId! } } })),
    noRetryWhenMissing,
  )
}

export function usePatientNotes(patientId: string) {
  return useSWR<Note[], ApiError>(
    patientKey(patientId, 'notes'),
    () =>
      unwrap(
        api.GET('/patients/{patient_id}/notes', { params: { path: { patient_id: patientId } } }),
      ),
    noRetryWhenMissing,
  )
}

export function usePatientSummary(patientId: string) {
  return useSWR<PatientSummary, ApiError>(
    patientKey(patientId, 'summary'),
    () =>
      unwrap(
        api.GET('/patients/{patient_id}/summary', { params: { path: { patient_id: patientId } } }),
      ),
    noRetryWhenMissing,
  )
}
