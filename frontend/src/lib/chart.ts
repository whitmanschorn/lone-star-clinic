// The parts of a patient's chart that a note can change, and how to talk about them.
import type { ChartAction, ChartChange, ChartField } from '../api/types'

export const CHART_FIELDS: { value: ChartField; label: string; singular: string }[] = [
  { value: 'conditions', label: 'Condition', singular: 'condition' },
  { value: 'medications', label: 'Medication', singular: 'medication' },
  { value: 'allergies', label: 'Allergy', singular: 'allergy' },
]

export const CHART_ACTIONS: { value: ChartAction; label: string }[] = [
  { value: 'add', label: 'Add' },
  { value: 'update', label: 'Update' },
  { value: 'remove', label: 'Remove' },
]

export function singular(field: ChartField): string {
  return CHART_FIELDS.find((entry) => entry.value === field)?.singular ?? field
}

const PAST_TENSE: Record<ChartAction, string> = {
  add: 'Added',
  update: 'Updated',
  remove: 'Removed',
}

/** e.g. "Updated medication: Lisinopril 10 mg daily → Lisinopril 20 mg daily". */
export function describeChange(change: ChartChange): string {
  const what = `${PAST_TENSE[change.action]} ${singular(change.field)}: ${change.value}`
  return change.action === 'update' && change.new_value ? `${what} → ${change.new_value}` : what
}
