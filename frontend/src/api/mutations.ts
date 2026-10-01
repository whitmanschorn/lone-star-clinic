// Calls that change data. Each returns a promise that rejects with ApiError;
// callers decide what to revalidate afterwards.
import { api, unwrap } from './client'
import type { Note, NoteCreate } from './types'

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
