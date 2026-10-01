import { createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { PatientListParams, PatientSort, PatientStatus, SortOrder } from '../api/types'

/**
 * What the user has asked the patient list to show. It lives in Redux rather
 * than component state so it survives navigating to a patient and back, and so
 * the sidebar's status shortcuts can drive the list from outside the page.
 */
export interface PatientListState {
  search: string
  status: PatientStatus | null
  sort: PatientSort
  order: SortOrder
  page: number
  pageSize: number
}

const initialState: PatientListState = {
  search: '',
  status: null,
  sort: 'name',
  order: 'asc',
  page: 1,
  pageSize: 20,
}

const patientListSlice = createSlice({
  name: 'patientList',
  initialState,
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
    filtersCleared(state) {
      state.search = ''
      state.status = null
      state.page = 1
    },
  },
  selectors: {
    selectPatientList: (state) => state,
    /** The list state as the query string GET /patients expects. */
    selectPatientListParams: createSelector(
      (state: PatientListState) => state,
      (state): PatientListParams => ({
        page: state.page,
        page_size: state.pageSize,
        q: state.search.trim() || undefined,
        status: state.status ?? undefined,
        sort: state.sort,
        order: state.order,
      }),
    ),
  },
})

export const {
  searchChanged,
  statusChanged,
  sortChanged,
  sortToggled,
  pageChanged,
  pageSizeChanged,
  filtersCleared,
} = patientListSlice.actions
export const { selectPatientList, selectPatientListParams } = patientListSlice.selectors
export default patientListSlice
