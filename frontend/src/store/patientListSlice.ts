import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type {
  BloodType,
  PatientListParams,
  PatientSort,
  PatientStatus,
  SortOrder,
} from '../api/types'

/** The filters behind the "Filters" button. Keys match the API's query parameters. */
export interface AdvancedFilters {
  min_age: number | null
  max_age: number | null
  blood_type: BloodType[]
  last_visit_from: string | null
  last_visit_to: string | null
  condition: string
  medication: string
  allergy: string
  city: string
}

export const NO_FILTERS: AdvancedFilters = {
  min_age: null,
  max_age: null,
  blood_type: [],
  last_visit_from: null,
  last_visit_to: null,
  condition: '',
  medication: '',
  allergy: '',
  city: '',
}

/**
 * What the user has asked the patient list to show. It lives in Redux rather
 * than component state so it survives navigating to a patient and back, and so
 * the sidebar's status shortcuts can drive the list from outside the page. It
 * is mirrored into the URL (see usePatientListUrlSync), so a view can be
 * bookmarked or shared.
 */
export interface PatientListState {
  search: string
  status: PatientStatus | null
  filters: AdvancedFilters
  sort: PatientSort
  order: SortOrder
  page: number
  pageSize: number
}

export const DEFAULT_LIST_STATE: PatientListState = {
  search: '',
  status: null,
  filters: NO_FILTERS,
  sort: 'name',
  order: 'asc',
  page: 1,
  pageSize: 20,
}

/** Filters that are shown, and removed, as one: an age range is one filter. */
export type FilterGroup =
  'age' | 'blood_type' | 'last_visit' | 'condition' | 'medication' | 'allergy' | 'city'

const GROUP_KEYS: Record<FilterGroup, (keyof AdvancedFilters)[]> = {
  age: ['min_age', 'max_age'],
  blood_type: ['blood_type'],
  last_visit: ['last_visit_from', 'last_visit_to'],
  condition: ['condition'],
  medication: ['medication'],
  allergy: ['allergy'],
  city: ['city'],
}

/** The filter groups that currently narrow the list. */
export function activeFilterGroups(filters: AdvancedFilters): FilterGroup[] {
  const isSet = (key: keyof AdvancedFilters) => {
    const value = filters[key]
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== ''
  }
  return (Object.keys(GROUP_KEYS) as FilterGroup[]).filter((group) => GROUP_KEYS[group].some(isSet))
}

const patientListSlice = createSlice({
  name: 'patientList',
  initialState: DEFAULT_LIST_STATE,
  reducers: {
    // Changing which rows match, or their order, invalidates the page number.
    searchChanged(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
    },
    statusChanged(state, action: PayloadAction<PatientStatus | null>) {
      state.status = action.payload
      state.page = 1
    },
    advancedFiltersApplied(state, action: PayloadAction<AdvancedFilters>) {
      state.filters = action.payload
      state.page = 1
    },
    filterGroupCleared(state, action: PayloadAction<FilterGroup>) {
      state.filters = {
        ...state.filters,
        ...Object.fromEntries(GROUP_KEYS[action.payload].map((key) => [key, NO_FILTERS[key]])),
      }
      state.page = 1
    },
    sortChanged(state, action: PayloadAction<{ sort: PatientSort; order: SortOrder }>) {
      state.sort = action.payload.sort
      state.order = action.payload.order
      state.page = 1
    },
    /** A column header was clicked: flip the direction, or switch to that column. */
    sortToggled(state, action: PayloadAction<PatientSort>) {
      if (state.sort === action.payload) {
        state.order = state.order === 'asc' ? 'desc' : 'asc'
      } else {
        state.sort = action.payload
        state.order = 'asc'
      }
      state.page = 1
    },
    pageChanged(state, action: PayloadAction<number>) {
      state.page = action.payload
    },
    pageSizeChanged(state, action: PayloadAction<number>) {
      state.pageSize = action.payload
      state.page = 1
    },
    /** Drop the search, the status and every advanced filter; keep the sort. */
    filtersCleared(state) {
      state.search = ''
      state.status = null
      state.filters = NO_FILTERS
      state.page = 1
    },
    /** The whole view at once, e.g. from a bookmarked URL. */
    listStateReplaced(_state, action: PayloadAction<PatientListState>) {
      return action.payload
    },
  },
  selectors: {
    selectPatientList: (state) => state,
    /** The list state as the query string GET /patients expects. */
    selectPatientListParams: createSelector(
      (state: PatientListState) => state,
      (state): PatientListParams => toListParams(state),
    ),
  },
})

/** The list state as API query parameters. Anything not set is left out. */
export function toListParams(state: PatientListState): PatientListParams {
  const { filters } = state
  const text = (value: string) => value.trim() || undefined
  return {
    page: state.page,
    page_size: state.pageSize,
    sort: state.sort,
    order: state.order,
    q: text(state.search),
    status: state.status ?? undefined,
    blood_type: filters.blood_type.length > 0 ? filters.blood_type : undefined,
    min_age: filters.min_age ?? undefined,
    max_age: filters.max_age ?? undefined,
    last_visit_from: filters.last_visit_from ?? undefined,
    last_visit_to: filters.last_visit_to ?? undefined,
    condition: text(filters.condition),
    medication: text(filters.medication),
    allergy: text(filters.allergy),
    city: text(filters.city),
  }
}

export const {
  searchChanged,
  statusChanged,
  advancedFiltersApplied,
  filterGroupCleared,
  sortChanged,
  sortToggled,
  pageChanged,
  pageSizeChanged,
  filtersCleared,
  listStateReplaced,
} = patientListSlice.actions
export const { selectPatientList, selectPatientListParams } = patientListSlice.selectors
export default patientListSlice
