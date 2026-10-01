import { Button, Skeleton, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Link, useNavigate, useParams } from 'react-router'
import { useSWRConfig } from 'swr'
import { patientSaved, usePatient } from '../api/hooks'
import { updatePatient } from '../api/mutations'
import { ErrorState } from '../components/ErrorState'
import { PatientForm } from '../components/patients/PatientForm'
import { isNotFound } from '../lib/errors'
import { fullName } from '../lib/format'

export function PatientEditPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const { mutate: mutateCache } = useSWRConfig()
  const { data: patient, error, mutate } = usePatient(patientId)

  if (error && isNotFound(error)) {
    return (
      <Stack align="flex-start">
        <Title order={2}>Patient not found</Title>
        <Text c="dimmed">There is no patient with this id. They may have been removed.</Text>
        <Button component={Link} to="/patients" variant="light">
          Back to patients
        </Button>
      </Stack>
    )
  }

  if (error && !patient) {
    return (
      <ErrorState title="Could not load this patient" error={error} onRetry={() => void mutate()} />
    )
  }

  if (!patient) {
    return (
      <Stack aria-busy="true" aria-label="Loading patient">
        <Skeleton height={40} width="50%" />
        <Skeleton height={320} />
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <Title order={2}>Edit {fullName(patient)}</Title>
      <PatientForm
        // A different patient gets a fresh form rather than the last one's values.
        key={patient.id}
        initial={patient}
        submitLabel="Save changes"
        onCancel={() => void navigate(`/patients/${patient.id}`)}
        save={(body) => updatePatient(patient.id, body)}
        onSaved={async (saved) => {
          await patientSaved(mutateCache, saved)
          notifications.show({ message: 'Changes saved', color: 'teal' })
          await navigate(`/patients/${saved.id}`)
        }}
      />
    </Stack>
  )
}
