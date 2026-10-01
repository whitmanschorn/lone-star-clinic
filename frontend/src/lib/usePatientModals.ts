import { useMemo } from 'react'
import { useSWRConfig } from 'swr'
import { primePatient } from '../api/hooks'
import type { Patient } from '../api/types'
import { useAppDispatch } from '../store/hooks'
import { modalOpened } from '../store/uiSlice'

/** Open the create, edit or add-note modal from anywhere in the app. */
export function usePatientModals() {
  const dispatch = useAppDispatch()
  const { mutate } = useSWRConfig()

  // Stable identities, so memoised rows are not re-rendered for nothing.
  return useMemo(
    () => ({
      openCreate: () => dispatch(modalOpened({ kind: 'create' })),
      openEdit: (patient: Patient) => {
        void primePatient(mutate, patient)
        dispatch(modalOpened({ kind: 'edit', patientId: patient.id }))
      },
      openNote: (patient: Patient) => {
        void primePatient(mutate, patient)
        dispatch(modalOpened({ kind: 'note', patientId: patient.id }))
      },
    }),
    [dispatch, mutate],
  )
}
