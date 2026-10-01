import { Anchor, Button, Card, Group, Stack, Text } from '@mantine/core'
import { IconNotes, IconPencil } from '@tabler/icons-react'
import { memo } from 'react'
import { Link } from 'react-router'
import type { Patient } from '../../api/types'
import { formatDate, formatDay, fullName } from '../../lib/format'
import { StatusBadge } from './StatusBadge'

interface PatientCardProps {
  patient: Patient
  highlighted: boolean
  onAddNote: (patient: Patient) => void
  onEdit: (patient: Patient) => void
}

const PatientCard = memo(function PatientCard({
  patient,
  highlighted,
  onAddNote,
  onEdit,
}: PatientCardProps) {
  const name = fullName(patient)
  return (
    <Card
      withBorder
      padding="sm"
      data-highlighted={highlighted || undefined}
      bg={highlighted ? 'yellow.1' : undefined}
      style={{ transition: 'background-color 600ms' }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Anchor component={Link} to={`/patients/${patient.id}`} fw={600} c="inherit">
          {name}
        </Anchor>
        <StatusBadge status={patient.status} style={{ flexShrink: 0 }} />
      </Group>
      <Text size="sm" c="dimmed">
        Age {patient.age} · Last visit {formatDate(patient.last_visit, 'never')}
      </Text>
      <Text size="sm" c="dimmed" lineClamp={1}>
        {patient.last_note
          ? `Last note ${formatDay(patient.last_note.timestamp)}: ${patient.last_note.excerpt}`
          : 'No notes'}
      </Text>
      <Group gap="xs" mt="xs">
        <Button
          variant="default"
          size="compact-sm"
          leftSection={<IconNotes size={14} />}
          aria-label={`Add a note for ${name}`}
          onClick={() => onAddNote(patient)}
        >
          Add note
        </Button>
        <Button
          variant="default"
          size="compact-sm"
          leftSection={<IconPencil size={14} />}
          aria-label={`Edit ${name}`}
          onClick={() => onEdit(patient)}
        >
          Edit
        </Button>
      </Group>
    </Card>
  )
})

interface PatientCardsProps {
  patients: Patient[]
  highlightedId: string | null
  onAddNote: (patient: Patient) => void
  onEdit: (patient: Patient) => void
}

/** The patient list for narrow screens, where a table would not fit. */
export function PatientCards({ patients, highlightedId, onAddNote, onEdit }: PatientCardsProps) {
  return (
    <Stack gap="xs" role="list" aria-label="Patients">
      {patients.map((patient) => (
        <div role="listitem" key={patient.id}>
          <PatientCard
            patient={patient}
            highlighted={patient.id === highlightedId}
            onAddNote={onAddNote}
            onEdit={onEdit}
          />
        </div>
      ))}
    </Stack>
  )
}
