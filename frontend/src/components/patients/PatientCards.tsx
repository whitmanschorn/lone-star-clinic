import { Card, Group, Stack, Text } from '@mantine/core'
import { memo } from 'react'
import { Link } from 'react-router'
import type { Patient } from '../../api/types'
import { formatDate, fullName } from '../../lib/format'
import { StatusBadge } from './StatusBadge'

const PatientCard = memo(function PatientCard({ patient }: { patient: Patient }) {
  return (
    <Card
      component={Link}
      to={`/patients/${patient.id}`}
      withBorder
      padding="sm"
      aria-label={fullName(patient)}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text fw={600}>{fullName(patient)}</Text>
          <Text size="sm" c="dimmed">
            Age {patient.age} · Last visit {formatDate(patient.last_visit, 'never')}
          </Text>
        </div>
        <StatusBadge status={patient.status} style={{ flexShrink: 0 }} />
      </Group>
    </Card>
  )
})

/** The patient list for narrow screens, where a table would not fit. */
export function PatientCards({ patients }: { patients: Patient[] }) {
  return (
    <Stack gap="xs" role="list" aria-label="Patients">
      {patients.map((patient) => (
        <div role="listitem" key={patient.id}>
          <PatientCard patient={patient} />
        </div>
      ))}
    </Stack>
  )
}
