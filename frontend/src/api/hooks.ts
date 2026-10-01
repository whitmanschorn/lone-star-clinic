import useSWR, { type ScopedMutator } from 'swr'
import { api, unwrap, type ApiError } from './client'
import type {
  GeneratorChoice,
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

const isPatientListKey = (key: unknown) =>
  Array.isArray(key) && key[0] === 'patients' && key[1] === 'list'

/** Change one patient's row in every cached page of the list, without refetching. */
function updateCachedRows(
  mutate: ScopedMutator,
  patientId: string,
  change: (row: Patient) => Patient,
) {
  return mutate<PatientsPage>(
    isPatientListKey,
    (page) =>
      page && {
        ...page,
        items: page.items.map((row) => (row.id === patientId ? change(row) : row)),
      },
    { revalidate: false },
  )
}

/**
 * After a patient is created or saved. This is stale-while-revalidate done by
 * hand: the server's copy goes straight into the cache, so the record and any
 * list row showing it change at once; then everything is refetched in the
 * background, which settles sort order, filters and counts. Components show
 * that second step through `isValidating`.
 */
export async function patientSaved(mutate: ScopedMutator, patient: Patient) {
  await mutate(patientKey(patient.id), patient, { revalidate: false })
  await updateCachedRows(mutate, patient.id, () => patient)
  void revalidateAllPatients(mutate)
}

/** After a note is added: show it as the row's last note at once, then refetch. */
export async function noteAdded(mutate: ScopedMutator, patientId: string, note: Note) {
  await updateCachedRows(mutate, patientId, (row) => {
    const isNewest =
      !row.last_note || Date.parse(row.last_note.timestamp) <= Date.parse(note.timestamp)
    return isNewest
      ? { ...row, last_note: { id: note.id, timestamp: note.timestamp, excerpt: note.content } }
      : row
  })
  void revalidateAllPatients(mutate)
}

/**
 * Seed a patient's record from a list row, unless a copy is already cached,
 * so a modal opened from the list has something to show immediately. SWR
 * still refetches the record when the modal mounts.
 */
export function primePatient(mutate: ScopedMutator, row: Patient) {
  return mutate<Patient>(patientKey(row.id), (current) => current ?? row, { revalidate: false })
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

/** Fetch a patient's summary. `refresh` asks an LLM generator to write it afresh. */
export function fetchPatientSummary(
  patientId: string,
  generator: GeneratorChoice,
  refresh = false,
): Promise<PatientSummary> {
  return unwrap(
    api.GET('/patients/{patient_id}/summary', {
      params: { path: { patient_id: patientId }, query: { generator, refresh } },
    }),
  )
}

export function usePatientSummary(patientId: string, generator: GeneratorChoice = 'auto') {
  return useSWR<PatientSummary, ApiError>(
    patientKey(patientId, 'summary', generator),
    () => fetchPatientSummary(patientId, generator),
    noRetryWhenMissing,
  )
}
