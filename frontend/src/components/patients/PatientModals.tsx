import { Button, Modal, Skeleton, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useSWRConfig } from 'swr'
import { noteAdded, patientSaved, revalidatePatient, usePatient } from '../../api/hooks'
import { createPatient, updatePatient } from '../../api/mutations'
import type { Patient } from '../../api/types'
import { isNotFound } from '../../lib/errors'
import { fullName } from '../../lib/format'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  modalClosed,
  patientHighlighted,
  selectHighlightedPatientId,
  selectModal,
  type PatientModal,
} from '../../store/uiSlice'
import { ErrorState } from '../ErrorState'
import { NoteForm } from '../notes/NoteForm'
import { PatientForm } from './PatientForm'

/** How long a changed row stays highlighted. */
const HIGHLIGHT_MS = 2500

interface BodyProps {
  onCancel: () => void
  /** Called once the change is saved, with the patient it was made to. */
  onDone: (changed: Patient) => void
}

function CreateBody({ onCancel, onDone }: BodyProps) {
  const { mutate } = useSWRConfig()
  return (
    <PatientForm
      submitLabel="Create patient"
      onCancel={onCancel}
      save={createPatient}
      onSaved={async (patient) => {
        await patientSaved(mutate, patient)
        notifications.show({
          message: (
            <>
              {fullName(patient)} was added.{' '}
              <Link to={`/patients/${patient.id}`}>Open their record</Link>
            </>
          ),
          color: 'teal',
        })
        onDone(patient)
      }}
    />
  )
}

function EditBody({ patient, onCancel, onDone }: BodyProps & { patient: Patient }) {
  const { mutate } = useSWRConfig()
  return (
    <PatientForm
      initial={patient}
      submitLabel="Save changes"
      onCancel={onCancel}
      save={(body) => updatePatient(patient.id, body)}
      onSaved={async (saved) => {
        await patientSaved(mutate, saved)
        notifications.show({ message: 'Changes saved', color: 'teal' })
        onDone(saved)
      }}
    />
  )
}

function NoteBody({ patient, onDone }: Pick<BodyProps, 'onDone'> & { patient: Patient }) {
  const { mutate } = useSWRConfig()
  return (
    <NoteForm
      patient={patient}
      onAdded={(note) => {
        void noteAdded(mutate, patient.id, note)
        notifications.show({
          message: note.changes.length > 0 ? 'Note added and chart updated' : 'Note added',
          color: 'teal',
        })
        onDone(patient)
      }}
      onConflict={() => void revalidatePatient(mutate, patient.id)}
    />
  )
}

function title(modal: PatientModal | null, patient: Patient | undefined): string {
  switch (modal?.kind) {
    case 'create':
      return 'New patient'
    case 'edit':
      return patient ? `Edit ${fullName(patient)}` : 'Edit patient'
    case 'note':
      return patient ? `Add a note for ${fullName(patient)}` : 'Add a note'
    default:
      return ''
  }
}

/**
 * Renders whichever patient modal the store asks for: create, edit or add a
 * note. It lives in the app layout, so the modals work over any page and the
 * page underneath stays put while the user works.
 */
export function PatientModals() {
  const dispatch = useAppDispatch()
  const requested = useAppSelector(selectModal)
  const highlightedId = useAppSelector(selectHighlightedPatientId)
  const isNarrow = useMediaQuery('(max-width: 48em)', false, { getInitialValueInEffect: false })

  // Keep rendering the last modal while it animates closed.
  const [modal, setModal] = useState(requested)
  if (requested && requested !== modal) {
    setModal(requested)
  }

  const patientId = modal && modal.kind !== 'create' ? modal.patientId : undefined
  const { data: patient, error, mutate } = usePatient(requested ? patientId : undefined)

  useEffect(() => {
    if (!highlightedId) return
    const timer = setTimeout(() => dispatch(patientHighlighted(null)), HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [dispatch, highlightedId])

  const close = () => dispatch(modalClosed())
  const done = (changed: Patient) => {
    dispatch(modalClosed())
    dispatch(patientHighlighted(changed.id))
  }

  let body = null
  if (modal?.kind === 'create') {
    body = <CreateBody onCancel={close} onDone={done} />
  } else if (modal && error && isNotFound(error)) {
    // Checked before the cached copy: the row that opened this modal may be
    // of a patient who has since been deleted.
    body = (
      <Stack align="flex-start">
        <Text>This patient no longer exists. They may have been removed.</Text>
        <Button variant="light" onClick={close}>
          Back to the list
        </Button>
      </Stack>
    )
  } else if (modal && patient) {
    body =
      modal.kind === 'edit' ? (
        <EditBody key={patient.id} patient={patient} onCancel={close} onDone={done} />
      ) : (
        <NoteBody key={patient.id} patient={patient} onDone={done} />
      )
  } else if (modal && error) {
    body = (
      <ErrorState title="Could not load this patient" error={error} onRetry={() => void mutate()} />
    )
  } else if (modal) {
    body = (
      <Stack aria-busy="true" aria-label="Loading patient">
        <Skeleton height={36} />
        <Skeleton height={160} />
      </Stack>
    )
  }

  return (
    <Modal
      opened={requested !== null}
      onClose={close}
      title={title(modal, patient)}
      size={modal?.kind === 'note' ? 'lg' : 'xl'}
      // On a phone the form gets the whole screen.
      fullScreen={isNarrow}
      closeButtonProps={{ 'aria-label': 'Close' }}
    >
      {body}
    </Modal>
  )
}
