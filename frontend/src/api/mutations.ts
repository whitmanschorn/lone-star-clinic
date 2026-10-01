// Calls that change data. Each returns a promise that rejects with ApiError;
// callers decide what to revalidate afterwards.
import { api, unwrap } from './client'
import type { Note, NoteCreate, Patient, PatientCreate } from './types'

export function addNote(patientId: string, body: NoteCreate): Promise<Note> {
  return unwrap(
    api.POST('/patients/{patient_id}/notes', {
      params: { path: { patient_id: patientId } },
      body,
    }),
  )
}

export async function deleteNote(patientId: string, noteId: string): Promise<void> {
  await unwrap(
    api.DELETE('/patients/{patient_id}/notes/{note_id}', {
      params: { path: { patient_id: patientId, note_id: noteId } },
    }),
  )
}

export function createPatient(body: PatientCreate): Promise<Patient> {
  return unwrap(api.POST('/patients', { body }))
}

export function updatePatient(patientId: string, body: PatientCreate): Promise<Patient> {
  return unwrap(
    api.PUT('/patients/{patient_id}', { params: { path: { patient_id: patientId } }, body }),
  )
}

export async function deletePatient(patientId: string): Promise<void> {
  await unwrap(
    api.DELETE('/patients/{patient_id}', { params: { path: { patient_id: patientId } } }),
  )
}
