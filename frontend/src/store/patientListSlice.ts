import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

/**
 * What the user has asked the patient list to show. It lives in Redux rather
 * than component state so it survives navigating to a patient and back.
 */
export interface PatientListState {
  search: string
  page: number
  pageSize: number
}

const initialState: PatientListState = {
  search: '',
  page: 1,
  pageSize: 20,
}

const patientListSlice = createSlice({
  name: 'patientList',
  initialState,
  reducers: {
    // Changing what is being searched for invalidates the current page number.
    searchChanged(state, action: PayloadAction<string>) {
      state.search = action.payload
      state.page = 1
    },
    pageChanged(state, action: PayloadAction<number>) {
      state.page = action.payload
    },
    pageSizeChanged(state, action: PayloadAction<number>) {
      state.pageSize = action.payload
      state.page = 1
    },
  },
})

export const { searchChanged, pageChanged, pageSizeChanged } = patientListSlice.actions
export default patientListSlice.reducer
