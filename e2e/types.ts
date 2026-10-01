// The tests share the frontend's generated API types, so a change to the
// backend's models shows up here as a type error rather than a silent drift.
import type { components } from '../frontend/src/api/schema'

type Schemas = components['schemas']

export type Health = Schemas['Health']
export type Patient = Schemas['PatientPublic']
export type PatientCreate = Schemas['PatientCreate']
export type PatientsPage = Schemas['PatientsPage']
export type PatientStats = Schemas['PatientStats']
export type ErrorMessage = Schemas['ErrorMessage']
export type ValidationErrors = Schemas['HTTPValidationError']
