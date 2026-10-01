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

/** Query string accepted by GET /patients. */
export type PatientListParams = NonNullable<operations['list_patients']['parameters']['query']>
