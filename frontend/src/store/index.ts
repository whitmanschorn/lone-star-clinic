import { combineSlices, configureStore } from '@reduxjs/toolkit'
import patientListSlice from './patientListSlice'
import uiSlice from './uiSlice'

// Redux holds client-side UI state only. Server data is cached by SWR.
export const store = configureStore({
  reducer: combineSlices(patientListSlice, uiSlice),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
