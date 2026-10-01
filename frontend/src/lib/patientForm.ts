// Validation and conversion for the patient form. The rules mirror the
// backend's (backend/app/models.py); the server checks everything again.
import { z } from 'zod'
import type { BloodType, Patient, PatientCreate, PatientStatus } from '../api/types'
import { STATUS_LABELS } from './format'

// Listing blood types as a Record makes TypeScript insist on every value the
// API defines, so a new one cannot be forgotten here.
const BLOOD_TYPE_SET: Record<BloodType, true> = {
  'A+': true,
  'A-': true,
  'B+': true,
  'B-': true,
  'AB+': true,
  'AB-': true,
  'O+': true,
  'O-': true,
}
export const BLOOD_TYPES = Object.keys(BLOOD_TYPE_SET) as [BloodType, ...BloodType[]]
export const STATUSES = Object.keys(STATUS_LABELS) as [PatientStatus, ...PatientStatus[]]

const OLDEST_AGE = 130

/** A local date as "YYYY-MM-DD", the format of both <input type="date"> and the API. */
export function toDateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const today = () => toDateInputValue(new Date())

function earliestBirthDate(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - OLDEST_AGE - 1)
  return toDateInputValue(date)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(100, `${label} can be at most 100 characters`)

const optionalText = (max: number) => z.string().trim().max(max, `At most ${max} characters`)

/** Optional text that must match `pattern` when it is filled in. */
const optionalPattern = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || pattern.test(value), message)

const entries = (plural: string) =>
  z
    .array(z.string().trim().min(1).max(100, 'Each entry can be at most 100 characters'))
    .max(50, `At most 50 ${plural}`)

// ISO dates compare correctly as plain strings.
export const patientFormSchema = z.object({
  first_name: name('First name'),
  last_name: name('Last name'),
  date_of_birth: z
    .string()
    .min(1, 'Date of birth is required')
    .regex(ISO_DATE, 'Enter a valid date')
    .refine((value) => value <= today(), 'Date of birth cannot be in the future')
    .refine((value) => value > earliestBirthDate(), 'Date of birth is too far in the past'),
  email: z.union([z.literal(''), z.email('Enter a valid email address').max(254)]),
  phone: optionalPattern(
    /^[0-9+().\-\s]{7,20}$/,
    'Use 7 to 20 digits; spaces and + ( ) . - are allowed',
  ),
  address_line: optionalText(200),
  city: optionalText(100),
  state: optionalPattern(/^[A-Z]{2}$/, 'Use the two-letter state code, e.g. TX'),
  postal_code: optionalPattern(/^\d{5}(-\d{4})?$/, 'Use a 5-digit ZIP code, or ZIP+4'),
  blood_type: z.union([z.literal(''), z.enum(BLOOD_TYPES)]),
  status: z.enum(STATUSES),
  conditions: entries('conditions'),
  medications: entries('medications'),
  allergies: entries('allergies'),
  last_visit: z
    .string()
    .refine((value) => value === '' || ISO_DATE.test(value), 'Enter a valid date')
    .refine((value) => value === '' || value <= today(), 'Last visit cannot be in the future'),
})

/** What the form holds: every field is a string or a list, '' meaning "not given". */
export type PatientFormValues = z.infer<typeof patientFormSchema>

/** Starting values for the form: a blank record, or an existing patient's. */
export function toFormValues(patient?: Patient): PatientFormValues {
  return {
    first_name: patient?.first_name ?? '',
    last_name: patient?.last_name ?? '',
    date_of_birth: patient?.date_of_birth ?? '',
    email: patient?.email ?? '',
    phone: patient?.phone ?? '',
    address_line: patient?.address_line ?? '',
    city: patient?.city ?? '',
    state: patient?.state ?? '',
    postal_code: patient?.postal_code ?? '',
    blood_type: patient?.blood_type ?? '',
    status: patient?.status ?? 'active',
    conditions: patient?.conditions ?? [],
    medications: patient?.medications ?? [],
    allergies: patient?.allergies ?? [],
    last_visit: patient?.last_visit ?? '',
  }
}

/** Valid form values as the API body. Empty optional fields become null. */
export function toPatientCreate(values: PatientFormValues): PatientCreate {
  const tidy = patientFormSchema.parse(values)
  const orNull = <T extends string>(value: T | ''): T | null => (value === '' ? null : value)
  return {
    first_name: tidy.first_name,
    last_name: tidy.last_name,
    date_of_birth: tidy.date_of_birth,
    email: orNull(tidy.email),
    phone: orNull(tidy.phone),
    address_line: orNull(tidy.address_line),
    city: orNull(tidy.city),
    state: orNull(tidy.state),
    postal_code: orNull(tidy.postal_code),
    blood_type: orNull(tidy.blood_type),
    status: tidy.status,
    conditions: tidy.conditions,
    medications: tidy.medications,
    allergies: tidy.allergies,
    last_visit: orNull(tidy.last_visit),
  }
}
