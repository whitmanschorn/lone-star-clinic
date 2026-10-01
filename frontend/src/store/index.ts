import { configureStore } from '@reduxjs/toolkit'
import patientList from './patientListSlice'

// Redux holds client-side UI state only. Server data is cached by SWR.
export const store = configureStore({
  reducer: { patientList },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
