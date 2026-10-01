// Friendly names for the generated API types. Import from here, not from
// schema.d.ts, so the rest of the app does not depend on the generator's layout.
import type { components, operations } from './schema'

type Schemas = components['schemas']

export type Health = Schemas['Health']

export type Patient = Schemas['PatientPublic']
export type PatientCreate = Schemas['PatientCreate']
export type PatientsPage = Schemas['PatientsPage']
export type PatientStats = Schemas['PatientStats']
export type PatientStatus = Schemas['PatientStatus']
export type BloodType = Schemas['BloodType']
export type PatientSort = Schemas['PatientSort']
export type SortOrder = Schemas['SortOrder']

export type Note = Schemas['NotePublic']
export type NoteCreate = Schemas['NoteCreate']
export type PatientSummary = Schemas['PatientSummary']
export type NotePreview = Schemas['NotePreview']
export type ChartChange = Schemas['ChartChange']
export type ChartField = Schemas['ChartField']
export type ChartAction = Schemas['ChartAction']

/** One entry in the `detail` list of a 422 response. */
export type ValidationIssue = Schemas['ValidationError']

/** Query string accepted by GET /patients. */
export type PatientListParams = NonNullable<operations['list_patients']['parameters']['query']>
