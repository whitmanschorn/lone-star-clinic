import { Stack, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useNavigate } from 'react-router'
import { useSWRConfig } from 'swr'
import { patientSaved } from '../api/hooks'
import { createPatient } from '../api/mutations'
import { PatientForm } from '../components/patients/PatientForm'
import { fullName } from '../lib/format'

export function PatientNewPage() {
  const navigate = useNavigate()
  const { mutate } = useSWRConfig()

  return (
    <Stack gap="md">
      <Title order={2}>New patient</Title>
      <PatientForm
        submitLabel="Create patient"
        onCancel={() => void navigate('/patients')}
        save={createPatient}
        onSaved={async (patient) => {
          await patientSaved(mutate, patient)
          notifications.show({ message: `${fullName(patient)} was added`, color: 'teal' })
          await navigate(`/patients/${patient.id}`)
        }}
      />
    </Stack>
  )
}
