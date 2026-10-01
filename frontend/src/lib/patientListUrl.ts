// The patient list's state as a URL query string, and back. This is what makes
// a filtered, sorted view bookmarkable. The parameter names are the API's own.
import type { BloodType, PatientSort, PatientStatus, SortOrder } from '../api/types'
import {
  DEFAULT_LIST_STATE,
  NO_FILTERS,
  toListParams,
  type PatientListState,
} from '../store/patientListSlice'
import { BLOOD_TYPES, STATUSES } from './patientForm'

export const SORT_LABELS: Record<PatientSort, string> = {
  name: 'Name',
  age: 'Age',
  last_visit: 'Last visit',
  last_note: 'Last note',
  status: 'Status',
}

export const PAGE_SIZES = [10, 20, 50, 100]

const SORTS = Object.keys(SORT_LABELS) as PatientSort[]
const ORDERS: SortOrder[] = ['asc', 'desc']
const OLDEST_AGE = 130
const MAX_TEXT = 100
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Parameters whose default value is left out of the URL, so the plain list is
// plain /patients.
const DEFAULT_PARAMS: Record<string, string> = {
  page: String(DEFAULT_LIST_STATE.page),
  page_size: String(DEFAULT_LIST_STATE.pageSize),
  sort: DEFAULT_LIST_STATE.sort,
  order: DEFAULT_LIST_STATE.order,
}

/** The query string for a list state, without the "?". Empty for the default view. */
export function listStateToQuery(state: PatientListState): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(toListParams(state))) {
    if (value === undefined || value === null) continue
    for (const item of Array.isArray(value) ? value : [value]) {
      const text = String(item)
      if (DEFAULT_PARAMS[key] !== text) query.append(key, text)
    }
  }
  query.sort()
  return query.toString()
}

/**
 * Read a list state from a query string. A URL can be typed or edited by
 * hand, so anything missing or invalid falls back to its default rather than
 * producing a request the API would reject.
 */
export function queryToListState(query: URLSearchParams): PatientListState {
  const oneOf = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    const value = query.get(key)
    return allowed.includes(value as T) ? (value as T) : null
  }
  const integer = (key: string, min: number, max: number): number | null => {
    const raw = query.get(key)
    if (raw === null || !/^\d+$/.test(raw)) return null
    const value = Number(raw)
    return value >= min && value <= max ? value : null
  }
  const date = (key: string): string | null => {
    const value = query.get(key)
    return value !== null && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : null
  }
  const text = (key: string) => (query.get(key) ?? '').trim().slice(0, MAX_TEXT)

  let minAge = integer('min_age', 0, OLDEST_AGE)
  let maxAge = integer('max_age', 0, OLDEST_AGE)
  if (minAge !== null && maxAge !== null && minAge > maxAge) [minAge, maxAge] = [maxAge, minAge]

  let from = date('last_visit_from')
  let to = date('last_visit_to')
  if (from !== null && to !== null && from > to) [from, to] = [to, from]

  const pageSize = integer('page_size', 1, 100)

  return {
    search: text('q'),
    status: oneOf<PatientStatus>('status', STATUSES),
    filters: {
      ...NO_FILTERS,
      min_age: minAge,
      max_age: maxAge,
      blood_type: BLOOD_TYPES.filter((type: BloodType) =>
        query.getAll('blood_type').includes(type),
      ),
      last_visit_from: from,
      last_visit_to: to,
      condition: text('condition'),
      medication: text('medication'),
      allergy: text('allergy'),
      city: text('city'),
    },
    sort: oneOf('sort', SORTS) ?? DEFAULT_LIST_STATE.sort,
    order: oneOf('order', ORDERS) ?? DEFAULT_LIST_STATE.order,
    page: integer('page', 1, 1_000_000) ?? DEFAULT_LIST_STATE.page,
    pageSize:
      pageSize !== null && PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_LIST_STATE.pageSize,
  }
}
