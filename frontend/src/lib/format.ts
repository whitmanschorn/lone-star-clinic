import type { Patient, PatientStatus } from '../api/types'

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * Format an API date ("2026-09-25"). The parts are read directly instead of
 * going through `new Date(string)`, which would treat the date as UTC midnight
 * and show the previous day in US time zones.
 */
export function formatDate(isoDate: string | null | undefined, fallback = '—'): string {
  if (!isoDate) return fallback
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return fallback
  return dateFormat.format(new Date(year, month - 1, day))
}

/** Format an API timestamp ("2026-09-25T14:03:00Z") in the viewer's time zone. */
export function formatDateTime(isoDateTime: string): string {
  return dateTimeFormat.format(new Date(isoDateTime))
}

export function fullName(patient: Pick<Patient, 'first_name' | 'last_name'>): string {
  return `${patient.first_name} ${patient.last_name}`
}

export const STATUS_LABELS: Record<PatientStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  critical: 'Critical',
}

/** Mantine colour names, shared by badges and (later) charts. */
export const STATUS_COLORS: Record<PatientStatus, string> = {
  active: 'teal',
  inactive: 'gray',
  critical: 'red',
}
