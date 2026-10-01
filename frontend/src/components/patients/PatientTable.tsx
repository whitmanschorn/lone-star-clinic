import { ActionIcon, Anchor, Group, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
  IconNotes,
  IconPencil,
} from '@tabler/icons-react'
import { memo } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Patient, PatientSort, SortOrder } from '../../api/types'
import { formatDate, formatDay, fullName } from '../../lib/format'
import { StatusBadge } from './StatusBadge'

interface SortableHeaderProps {
  column: PatientSort
  label: string
  sort: PatientSort
  order: SortOrder
  onSort: (column: PatientSort) => void
}

function SortableHeader({ column, label, sort, order, onSort }: SortableHeaderProps) {
  const active = sort === column
  const SortIcon = !active ? IconArrowsSort : order === 'asc' ? IconArrowUp : IconArrowDown
  return (
    <Table.Th aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <UnstyledButton onClick={() => onSort(column)} fw={700} fz="sm">
        <Group gap={4} wrap="nowrap">
          {label}
          <SortIcon size={14} opacity={active ? 1 : 0.4} aria-hidden />
        </Group>
      </UnstyledButton>
    </Table.Th>
  )
}

interface PatientRowProps {
  patient: Patient
  /** True for a moment after this patient was changed. */
  highlighted: boolean
  onAddNote: (patient: Patient) => void
  onEdit: (patient: Patient) => void
}

// Memoised so rows that did not change are skipped when the list re-renders
// (every keystroke in the search box re-renders the page around it).
const PatientRow = memo(function PatientRow({
  patient,
  highlighted,
  onAddNote,
  onEdit,
}: PatientRowProps) {
  const navigate = useNavigate()
  const href = `/patients/${patient.id}`
  const name = fullName(patient)
  return (
    <Table.Tr
      onClick={() => void navigate(href)}
      data-highlighted={highlighted || undefined}
      bg={highlighted ? 'var(--clinic-highlight-bg)' : undefined}
      style={{ cursor: 'pointer', transition: 'background-color 600ms' }}
    >
      <Table.Td>
        <Anchor component={Link} to={href} fw={500} onClick={(event) => event.stopPropagation()}>
          {name}
        </Anchor>
      </Table.Td>
      <Table.Td>{patient.age}</Table.Td>
      <Table.Td>{formatDate(patient.last_visit, 'Never')}</Table.Td>
      <Table.Td>
        <StatusBadge status={patient.status} />
      </Table.Td>
      <Table.Td maw={260}>
        {patient.last_note ? (
          <>
            <Text size="sm">{formatDay(patient.last_note.timestamp)}</Text>
            <Text size="xs" c="dimmed" lineClamp={1} title={patient.last_note.excerpt}>
              {patient.last_note.excerpt}
            </Text>
          </>
        ) : (
          <Text size="sm" c="dimmed">
            No notes
          </Text>
        )}
      </Table.Td>
      {/* Clicks on the actions must not also open the patient's page. */}
      <Table.Td onClick={(event) => event.stopPropagation()} style={{ cursor: 'default' }}>
        <Group gap={4} wrap="nowrap" justify="flex-end">
          <Tooltip label="Add a note">
            <ActionIcon
              variant="subtle"
              aria-label={`Add a note for ${name}`}
              onClick={() => onAddNote(patient)}
            >
              <IconNotes size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit">
            <ActionIcon
              variant="subtle"
              aria-label={`Edit ${name}`}
              onClick={() => onEdit(patient)}
            >
              <IconPencil size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  )
})

interface PatientTableProps {
  patients: Patient[]
  sort: PatientSort
  order: SortOrder
  onSort: (column: PatientSort) => void
  highlightedId: string | null
  onAddNote: (patient: Patient) => void
  onEdit: (patient: Patient) => void
}

export function PatientTable({
  patients,
  sort,
  order,
  onSort,
  highlightedId,
  onAddNote,
  onEdit,
}: PatientTableProps) {
  const header = { sort, order, onSort }
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <SortableHeader column="name" label="Name" {...header} />
            <SortableHeader column="age" label="Age" {...header} />
            <SortableHeader column="last_visit" label="Last visit" {...header} />
            <SortableHeader column="status" label="Status" {...header} />
            <SortableHeader column="last_note" label="Last note" {...header} />
            <Table.Th>
              <Text span size="sm" fw={700} style={{ display: 'block', textAlign: 'right' }}>
                Actions
              </Text>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {patients.map((patient) => (
            <PatientRow
              key={patient.id}
              patient={patient}
              highlighted={patient.id === highlightedId}
              onAddNote={onAddNote}
              onEdit={onEdit}
            />
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
