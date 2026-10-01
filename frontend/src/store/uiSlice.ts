import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

/** The patient modals. Any page can ask for one; AppLayout renders it. */
export type PatientModal =
  { kind: 'create' } | { kind: 'edit'; patientId: string } | { kind: 'note'; patientId: string }

export interface UiState {
  modal: PatientModal | null
  /** The patient whose row was just changed, so lists can point it out. */
  highlightedPatientId: string | null
}

const initialState: UiState = {
  modal: null,
  highlightedPatientId: null,
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    modalOpened(state, action: PayloadAction<PatientModal>) {
      state.modal = action.payload
    },
    modalClosed(state) {
      state.modal = null
    },
    patientHighlighted(state, action: PayloadAction<string | null>) {
      state.highlightedPatientId = action.payload
    },
  },
  selectors: {
    selectModal: (state) => state.modal,
    selectHighlightedPatientId: (state) => state.highlightedPatientId,
  },
})

export const { modalOpened, modalClosed, patientHighlighted } = uiSlice.actions
export const { selectModal, selectHighlightedPatientId } = uiSlice.selectors
export default uiSlice
